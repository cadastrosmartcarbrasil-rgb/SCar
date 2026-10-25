-- =============================================================================
-- 0148_conciliacao_pix_cobranca.sql
-- O PIX DA COBRANCA CASA POR VALOR NO MESMO DIA.
--
-- O Sicredi credita o PIX do boleto hibrido um a um ("RECEB. COB HIBRIDA (A)-
-- PIXCOBRAN CRED_COBPIX"), mas o OFX NAO traz o nosso numero: so valor e data.
-- Com dezenas de mensalidades do mesmo valor no mesmo dia (R$ 129, R$ 164...),
-- a sugestao da 0119 desiste (mais de um candidato) e o item fica pendente —
-- em 13/10/2026, 131 de 200.
--
-- Decisao do usuario (25/10/2026): casar por VALOR dentro do MESMO DIA. Para o
-- caixa tanto faz qual linha do extrato fica com qual baixa de mesmo valor: o
-- saldo do dia e o mesmo.
--
-- O par: item de CREDITO do extrato com "PIX" e "COB" no historico, aberto
-- (PENDENTE/SUGERIDO), x baixa do banco liquidada por PIX (trilha 0146) com
-- credito no dia do item, mesma conta, mesmo valor, ainda nao conciliada.
-- Primeiro honra a sugestao que ja aponta para uma dessas baixas; depois casa
-- o resto na ordem (FITID x id), valor a valor. Sobra (de qualquer lado) fica
-- aberta. Roda na importacao do OFX, na rotina de baixa e pelo botao.
-- =============================================================================

create or replace function conciliar_pix_cobranca(p_conta uuid default null, p_desde date default null)
returns table (conciliados int, valor numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n int := 0;
  v_valor numeric := 0;
  v_motivo constant text := 'PIX DA COBRANCA: casado por valor no dia (o extrato nao traz o nosso numero)';
begin
  if p_conta is not null then perform exige_conta_bancaria(p_conta); end if;

  -- 1) a sugestao que ja aponta para uma baixa PIX da cobranca
  for r in
    select x.id as item, x.sugestao_id as baixa, x.valor
      from extrato_itens x
      join baixas_financeiras b on b.id = x.sugestao_id
     where x.situacao = 'SUGERIDO' and x.sugestao_tipo = 'BAIXA' and x.valor > 0
       and (p_conta is null or x.conta_id = p_conta)
       and (p_desde is null or x.data >= p_desde)
       and pode_conta_bancaria(x.conta_id)
       and texto_extrato(x.historico) like '%PIX%' and texto_extrato(x.historico) like '%COB%'
       and b.status_conciliacao = 'NAO_CONCILIADO'
       and exists (select 1 from cobranca_liquidacoes c
                    where c.lancamento_id = b.lancamento_id and c.nosso_numero = b.id_transacao_bancaria_externa
                      and c.tipo_liquidacao = 'PIX' and c.data_credito = x.data)
  loop
    begin
      perform conciliar_extrato_item(r.item, 'BAIXA', r.baixa);
      update extrato_itens set motivo = v_motivo where id = r.item;
      v_n := v_n + 1; v_valor := v_valor + r.valor;
    exception when sqlstate '22023' then null;  -- ja casada por outro caminho: segue
    end;
  end loop;

  -- 2) o resto: valor a valor, na ordem
  for r in
    with itens as (
      select x.id, x.conta_id, x.data, x.valor,
             row_number() over (partition by x.conta_id, x.data, x.valor order by x.fitid, x.id) as n
        from extrato_itens x
       where x.situacao in ('PENDENTE', 'SUGERIDO') and x.valor > 0
         and (p_conta is null or x.conta_id = p_conta)
         and (p_desde is null or x.data >= p_desde)
         and pode_conta_bancaria(x.conta_id)
         and texto_extrato(x.historico) like '%PIX%' and texto_extrato(x.historico) like '%COB%'
    ), baixas as (
      select b.id, b.conta_bancaria_id as conta_id, b.data_pagamento as data, b.valor_liquido as valor,
             row_number() over (partition by b.conta_bancaria_id, b.data_pagamento, b.valor_liquido order by b.id) as n
        from baixas_financeiras b
        join lancamentos_financeiros l on l.id = b.lancamento_id and l.status <> 'cancelado' and l.tipo = 'RECEITA'
       where b.status_conciliacao = 'NAO_CONCILIADO'
         and (p_conta is null or b.conta_bancaria_id = p_conta)
         and (p_desde is null or b.data_pagamento >= p_desde)
         and not exists (select 1 from extrato_itens x where x.baixa_id = b.id)
         and not exists (select 1 from extrato_item_lote lt where lt.baixa_id = b.id)
         and exists (select 1 from cobranca_liquidacoes c
                      where c.lancamento_id = b.lancamento_id and c.nosso_numero = b.id_transacao_bancaria_externa
                        and c.tipo_liquidacao = 'PIX' and c.data_credito = b.data_pagamento)
    )
    select i.id as item, b.id as baixa, i.valor
      from itens i
      join baixas b on b.conta_id = i.conta_id and b.data = i.data and b.valor = i.valor and b.n = i.n
     order by i.data, i.valor, i.n
  loop
    begin
      perform conciliar_extrato_item(r.item, 'BAIXA', r.baixa);
      update extrato_itens set motivo = v_motivo where id = r.item;
      v_n := v_n + 1; v_valor := v_valor + r.valor;
    exception when sqlstate '22023' then null;
    end;
  end loop;

  conciliados := v_n; valor := v_valor;
  return next;
end;
$$;

comment on function conciliar_pix_cobranca(uuid, date) is
  'Concilia o PIX da cobranca do extrato (sem nosso numero) com as baixas PIX do banco por valor no mesmo dia (0148).';

create or replace function classificar_extrato_itens(p_conta uuid, p_importacao uuid default null)
returns table (sugeridos int, ignorados int)
language plpgsql
security definer
set search_path = public
as $$
declare
  r extrato_itens%rowtype;
  cb contas_bancarias%rowtype;
  s record;
  v_sug int := 0;
  v_ign int := 0;
  v_txt text;
begin
  perform exige_conta_bancaria(p_conta);
  select * into cb from contas_bancarias where id = p_conta;
  -- (0147) o credito SOMADO da cobranca casa com as baixas do dia antes das regras
  perform conciliar_lotes_cobranca(p_conta, null);
  -- (0148) o PIX da cobranca casa por valor no dia
  perform conciliar_pix_cobranca(p_conta, null);
  for r in
    select * from extrato_itens
     where conta_id = p_conta and situacao = 'PENDENTE'
       and (p_importacao is null or importacao_id = p_importacao)
     order by data, valor, fitid
  loop
    select * into s from sugestao_extrato_item(r.id) limit 1;
    if s.ref_id is not null then
      update extrato_itens set situacao = 'SUGERIDO', sugestao_tipo = s.tipo, sugestao_id = s.ref_id, motivo = null
       where id = r.id;
      v_sug := v_sug + 1;
      continue;
    end if;
    if r.valor > 0 and cb.ofx_mensalidades = 'TODOS_CREDITOS' then
      update extrato_itens set situacao = 'IGNORADO', motivo = 'MENSALIDADE: a conta ignora todo credito do OFX (a baixa vem pelo banco)'
       where id = r.id;
      v_ign := v_ign + 1;
    elsif r.valor > 0 and cb.ofx_mensalidades = 'POR_TEXTO' then
      select t into v_txt
        from unnest(cb.ofx_textos_mensalidade) t
       where nullif(trim(t), '') is not null
         and position(texto_extrato(t) in texto_extrato(r.historico)) > 0
       limit 1;
      if v_txt is not null then
        update extrato_itens set situacao = 'IGNORADO',
               motivo = 'MENSALIDADE: historico contem "' || v_txt || '" (a baixa vem pelo banco)'
         where id = r.id;
        v_ign := v_ign + 1;
      end if;
    end if;
    v_txt := null;
  end loop;
  sugeridos := v_sug; ignorados := v_ign;
  return next;
end;
$$;

-- O que ja esta no extrato (os PIX de 13/10).
select * from conciliar_pix_cobranca(null, null);

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
