-- =============================================================================
-- 0147_conciliacao_lote_cobranca.sql
-- O CREDITO SOMADO DA COBRANCA CONCILIA COM AS BAIXAS DO DIA.
--
-- O Sicredi credita o PIX um a um, mas os boletos liquidados por COMPE/REDE
-- chegam SOMADOS no extrato, numa linha so ("LIQ.COBRANCA SIMPLES-COB000042"
-- = 42 boletos). A conciliacao (0119) ligava UM item do extrato a UM movimento,
-- entao esse credito ficava IGNORADO pela regra de mensalidade e as 42 baixas
-- nunca eram conciliadas.
--
-- Desde a 0146 cada baixa do banco esta na DATA DO CREDITO e a trilha
-- (`cobranca_liquidacoes`) guarda o tipo de liquidacao. O LOTE de um credito
-- e: as baixas (e titulos do SCar) da MESMA conta, liquidados por COMPE/REDE,
-- com credito NO DIA do item, ainda nao conciliados. Fecha quando a soma bate
-- com o valor do extrato (centavo a centavo); a quantidade do historico
-- ("COB000042") e so conferencia, mostrada ao lado.
--
--   * `extrato_item_lote` — o vinculo N:1 (uma baixa/titulo em um lote so).
--   * `lote_cobranca_extrato_item(item)` — previa: quantos, soma, diferenca.
--   * `conciliar_lote_extrato_item(item)` — concilia (recusa se nao fecha).
--   * `conciliar_lotes_cobranca(conta, desde)` — passa por todos os creditos
--     abertos (e os IGNORADOS pela regra de mensalidade); a importacao do OFX
--     e a rotina de baixa chamam.
--   * sugestao/candidatos/desfazer/fn_baixa_solta_extrato/classificar e
--     `tesouraria_movimentos` recriados (mesmas assinaturas) sabendo do lote.
-- Nada muda no saldo: conciliar so liga o extrato ao que ja esta no caixa.
-- =============================================================================

create table if not exists extrato_item_lote (
  id              uuid primary key default gen_random_uuid(),
  extrato_item_id uuid not null references extrato_itens(id) on delete cascade,
  baixa_id        uuid references baixas_financeiras(id) on delete cascade,
  titulo_id       uuid references titulos_financeiros(id) on delete cascade,
  created_at      timestamptz not null default now(),
  constraint chk_extrato_lote_ref check ((baixa_id is null) <> (titulo_id is null))
);
create unique index if not exists uq_extrato_lote_baixa on extrato_item_lote (baixa_id) where baixa_id is not null;
create unique index if not exists uq_extrato_lote_titulo on extrato_item_lote (titulo_id) where titulo_id is not null;
create index if not exists idx_extrato_lote_item on extrato_item_lote (extrato_item_id);

comment on table extrato_item_lote is
  'Conciliacao em LOTE (0147): o credito somado da cobranca (COMPE/REDE) ligado as varias baixas/titulos do dia.';

alter table extrato_item_lote enable row level security;
drop policy if exists extlote_select on extrato_item_lote;
create policy extlote_select on extrato_item_lote for select to authenticated
  using ((select tem_acesso_global())
         or exists (select 1 from extrato_itens x where x.id = extrato_item_id
                     and x.conta_id = any((select contas_do_operador())::uuid[])));
grant select on extrato_item_lote to authenticated;
-- escrita so pelas funcoes (security definer)

-- O lote de um item: baixas e titulos da conta, COMPE/REDE, credito no dia, livres.
create or replace function lote_cobranca_candidatos(p_item uuid)
returns table (origem text, ref_id uuid, valor numeric)
language sql
stable
security definer
set search_path = public
as $$
  with it as (select * from extrato_itens where id = p_item and valor > 0)
  select 'BAIXA'::text, b.id, b.valor_liquido
    from it
    join baixas_financeiras b on b.conta_bancaria_id = it.conta_id and b.data_pagamento = it.data
    join lancamentos_financeiros l on l.id = b.lancamento_id and l.status <> 'cancelado' and l.tipo = 'RECEITA'
   where b.status_conciliacao = 'NAO_CONCILIADO'
     and pode_conta_bancaria(it.conta_id)
     and not exists (select 1 from extrato_itens x where x.baixa_id = b.id)
     and not exists (select 1 from extrato_item_lote lt where lt.baixa_id = b.id)
     and exists (select 1 from cobranca_liquidacoes c
                  where c.lancamento_id = b.lancamento_id
                    and c.nosso_numero = b.id_transacao_bancaria_externa
                    and c.tipo_liquidacao in ('COMPE', 'REDE')
                    and c.data_credito = it.data)
  union all
  select 'TITULO'::text, t.id, coalesce(t.valor_pago, t.valor)
    from it
    join titulos_financeiros t on t.status = 'pago' and t.data_credito = it.data
    join integracoes_bancarias i on i.id = t.integracao_id and i.conta_bancaria_id = it.conta_id
   where pode_conta_bancaria(it.conta_id)
     and not exists (select 1 from extrato_itens x where x.titulo_id = t.id)
     and not exists (select 1 from extrato_item_lote lt where lt.titulo_id = t.id)
     and exists (select 1 from cobranca_liquidacoes c
                  where c.titulo_id = t.id and c.tipo_liquidacao in ('COMPE', 'REDE')
                    and c.data_credito = it.data);
$$;

-- Previa do lote. `quantidade_extrato` sai do historico ("COB000042" -> 42).
create or replace function lote_cobranca_extrato_item(p_item uuid)
returns table (quantidade int, soma numeric, valor_extrato numeric, diferenca numeric,
               quantidade_extrato int, confere boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare it extrato_itens%rowtype;
begin
  select * into it from extrato_itens where id = p_item;
  if it.id is null or not pode_conta_bancaria(it.conta_id) then return; end if;
  select count(*)::int, coalesce(sum(c.valor), 0) into quantidade, soma
    from lote_cobranca_candidatos(p_item) c;
  valor_extrato := it.valor;
  diferenca := round(it.valor - soma, 2);
  quantidade_extrato := nullif(substring(coalesce(it.historico, '') from 'COB0*([0-9]+)'), '')::int;
  confere := it.valor > 0 and quantidade > 0 and abs(diferenca) < 0.01;
  return next;
end;
$$;

create or replace function conciliar_lote_extrato_item(p_item uuid)
returns table (quantidade int, soma numeric, valor_extrato numeric, diferenca numeric,
               quantidade_extrato int, confere boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  it extrato_itens%rowtype;
  pv record;
begin
  perform exige_item_extrato(p_item);
  select * into it from extrato_itens where id = p_item for update;
  if it.id is null then raise exception 'Item do extrato nao encontrado' using errcode = '22023'; end if;
  if it.situacao = 'CONCILIADO' then raise exception 'Este item ja esta conciliado' using errcode = '22023'; end if;
  if it.valor <= 0 then raise exception 'O lote da cobranca e sempre um credito' using errcode = '22023'; end if;

  select * into pv from lote_cobranca_extrato_item(p_item);
  if pv.quantidade = 0 then
    raise exception 'Nenhuma baixa de boleto (COMPE/REDE) com credito em % nesta conta', to_char(it.data, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;
  if not pv.confere then
    raise exception 'O credito de R$ % nao fecha com as baixas de boleto creditadas em %: % baixa(s) somando R$ % (diferenca R$ %)',
      to_char(it.valor, 'FM999G999G990D00'), to_char(it.data, 'DD/MM/YYYY'), pv.quantidade,
      to_char(pv.soma, 'FM999G999G990D00'), to_char(pv.diferenca, 'FM999G999G990D00')
      using errcode = '22023';
  end if;

  insert into extrato_item_lote (extrato_item_id, baixa_id, titulo_id)
  select it.id, case when c.origem = 'BAIXA' then c.ref_id end, case when c.origem = 'TITULO' then c.ref_id end
    from lote_cobranca_candidatos(p_item) c;

  update baixas_financeiras b set status_conciliacao = 'CONCILIADO_API'
    from extrato_item_lote lt
   where lt.extrato_item_id = it.id and lt.baixa_id = b.id;

  update extrato_itens
     set situacao = 'CONCILIADO', sugestao_tipo = null, sugestao_id = null,
         motivo = 'LOTE DA COBRANCA: ' || pv.quantidade || ' boleto(s) COMPE/REDE creditado(s) em '
                  || to_char(it.data, 'DD/MM/YYYY'),
         conciliado_por = usuario_atual_id(), conciliado_em = now()
   where id = it.id;

  return query select pv.quantidade, pv.soma, pv.valor_extrato, pv.diferenca, pv.quantidade_extrato, pv.confere;
end;
$$;

-- Todos os creditos abertos (e os ignorados pela regra de mensalidade) que fecham.
create or replace function conciliar_lotes_cobranca(p_conta uuid default null, p_desde date default null)
returns table (conciliados int, valor numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  r extrato_itens%rowtype;
  pv record;
  v_n int := 0;
  v_valor numeric := 0;
begin
  if p_conta is not null then perform exige_conta_bancaria(p_conta); end if;
  for r in
    select * from extrato_itens x
     where x.valor > 0
       and (p_conta is null or x.conta_id = p_conta)
       and (p_desde is null or x.data >= p_desde)
       and pode_conta_bancaria(x.conta_id)
       and (x.situacao in ('PENDENTE', 'SUGERIDO')
            or (x.situacao = 'IGNORADO' and x.motivo like 'MENSALIDADE%'))
     order by x.data, x.valor
  loop
    select * into pv from lote_cobranca_extrato_item(r.id);
    if pv.confere then
      perform conciliar_lote_extrato_item(r.id);
      v_n := v_n + 1;
      v_valor := v_valor + r.valor;
    end if;
  end loop;
  conciliados := v_n; valor := v_valor;
  return next;
end;
$$;

create or replace function fn_baixa_solta_extrato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_item uuid;
begin
  -- (0147) baixa de um lote da cobranca: o lote inteiro volta a conciliar
  select extrato_item_id into v_item from extrato_item_lote where baixa_id = old.id;
  if v_item is not null then
    update baixas_financeiras b set status_conciliacao = 'NAO_CONCILIADO'
      from extrato_item_lote lt
     where lt.extrato_item_id = v_item and lt.baixa_id = b.id and b.id <> old.id
       and b.status_conciliacao = 'CONCILIADO_API';
    delete from extrato_item_lote where extrato_item_id = v_item;
    update extrato_itens
       set situacao = 'PENDENTE', conciliado_por = null, conciliado_em = null,
           motivo = 'Uma baixa do lote da cobranca foi removida'
     where id = v_item;
  end if;
  update extrato_itens
     set situacao = 'PENDENTE', baixa_id = null, conciliado_por = null, conciliado_em = null,
         motivo = 'A baixa conciliada foi removida'
   where baixa_id = old.id;
  update extrato_itens
     set situacao = 'PENDENTE', sugestao_tipo = null, sugestao_id = null
   where sugestao_tipo = 'BAIXA' and sugestao_id = old.id and situacao = 'SUGERIDO';
  return old;
end;
$$;

create or replace function sugestao_extrato_item(p_item uuid)
returns table (tipo text, ref_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  it extrato_itens%rowtype;
  v_abs numeric;
  v_n int;
  v_id uuid;
begin
  select * into it from extrato_itens where id = p_item;
  if it.id is null or not pode_conta_bancaria(it.conta_id) then return; end if;
  v_abs := abs(it.valor);

  -- baixas da mesma conta, mesmo valor e sentido, ate 3 dias de distancia, livres
  select count(*), min(b.id::text)::uuid into v_n, v_id
    from baixas_financeiras b join lancamentos_financeiros l on l.id = b.lancamento_id
   where b.conta_bancaria_id = it.conta_id and l.status <> 'cancelado'
     and b.valor_liquido = v_abs
     and l.tipo = case when it.valor > 0 then 'RECEITA' else 'DESPESA' end::tipo_movimentacao
     and b.data_pagamento between it.data - 3 and it.data + 3
     and not exists (select 1 from extrato_itens x where x.baixa_id = b.id)
     and not exists (select 1 from extrato_item_lote lt where lt.baixa_id = b.id)
     and not exists (select 1 from extrato_itens x where x.sugestao_tipo = 'BAIXA' and x.sugestao_id = b.id
                       and x.situacao = 'SUGERIDO' and x.id <> it.id);
  if v_n > 1 then
    -- desempate: o do mesmo dia, se for um so
    select count(*), min(b.id::text)::uuid into v_n, v_id
      from baixas_financeiras b join lancamentos_financeiros l on l.id = b.lancamento_id
     where b.conta_bancaria_id = it.conta_id and l.status <> 'cancelado'
       and b.valor_liquido = v_abs
       and l.tipo = case when it.valor > 0 then 'RECEITA' else 'DESPESA' end::tipo_movimentacao
       and b.data_pagamento = it.data
       and not exists (select 1 from extrato_itens x where x.baixa_id = b.id)
     and not exists (select 1 from extrato_item_lote lt where lt.baixa_id = b.id)
       and not exists (select 1 from extrato_itens x where x.sugestao_tipo = 'BAIXA' and x.sugestao_id = b.id
                         and x.situacao = 'SUGERIDO' and x.id <> it.id);
  end if;
  if v_n = 1 then tipo := 'BAIXA'; ref_id := v_id; return next; return; end if;

  if it.valor > 0 then
    select count(*), min(t.id::text)::uuid into v_n, v_id
      from titulos_financeiros t
      join integracoes_bancarias i on i.id = t.integracao_id and i.conta_bancaria_id = it.conta_id
     where t.status = 'pago' and coalesce(t.valor_pago, t.valor) = v_abs
       and t.data_pagamento between it.data - 3 and it.data + 3
       and not exists (select 1 from extrato_itens x where x.titulo_id = t.id)
       and not exists (select 1 from extrato_item_lote lt where lt.titulo_id = t.id)
       and not exists (select 1 from extrato_itens x where x.sugestao_tipo = 'TITULO' and x.sugestao_id = t.id
                         and x.situacao = 'SUGERIDO' and x.id <> it.id);
    if v_n = 1 then tipo := 'TITULO'; ref_id := v_id; return next; return; end if;
  end if;

  select count(*), min(tr.id::text)::uuid into v_n, v_id
    from transferencias_bancarias tr
   where tr.status = 'ATIVA' and tr.valor = v_abs
     and ((it.valor < 0 and tr.conta_origem_id = it.conta_id) or (it.valor > 0 and tr.conta_destino_id = it.conta_id))
     and tr.data between it.data - 3 and it.data + 3
     and not exists (select 1 from extrato_itens x where x.transferencia_id = tr.id and x.conta_id = it.conta_id)
     and not exists (select 1 from extrato_itens x where x.sugestao_tipo = 'TRANSFERENCIA' and x.sugestao_id = tr.id
                       and x.conta_id = it.conta_id and x.situacao = 'SUGERIDO' and x.id <> it.id);
  if v_n = 1 then tipo := 'TRANSFERENCIA'; ref_id := v_id; return next; end if;
end;
$$;

create or replace function candidatos_extrato_item(p_item uuid, p_dias int default 5)
returns table (tipo text, ref_id uuid, data date, valor numeric, descricao text, contraparte text,
               valor_igual boolean, dias int)
language sql
stable
security definer
set search_path = public
as $$
  with it as (select * from extrato_itens where id = p_item)
  select * from (
    select 'BAIXA'::text, b.id, b.data_pagamento, b.valor_liquido, l.descricao,
           coalesce(f.nome_fantasia, f.razao_social, c.nome_razao_social),
           abs(b.valor_liquido - abs(it.valor)) < 0.01, abs(b.data_pagamento - it.data)
      from it
      join baixas_financeiras b on b.conta_bancaria_id = it.conta_id
      join lancamentos_financeiros l on l.id = b.lancamento_id and l.status <> 'cancelado'
           and l.tipo = case when it.valor > 0 then 'RECEITA' else 'DESPESA' end::tipo_movimentacao
      left join fornecedores f on f.id = l.fornecedor_id
      left join clientes c on c.id = l.cliente_id
     where b.data_pagamento between it.data - p_dias and it.data + p_dias
       and not exists (select 1 from extrato_itens x where x.baixa_id = b.id)
       and not exists (select 1 from extrato_item_lote lt where lt.baixa_id = b.id)
    union all
    select 'LANCAMENTO', l.id, l.data_vencimento, coalesce(l.valor_saldo, l.valor_original), l.descricao,
           coalesce(f.nome_fantasia, f.razao_social, c.nome_razao_social),
           abs(coalesce(l.valor_saldo, l.valor_original) - abs(it.valor)) < 0.01, abs(l.data_vencimento - it.data)
      from it
      join lancamentos_financeiros l on l.status in ('pendente', 'atrasado', 'pago_parcial')
           and l.tipo = case when it.valor > 0 then 'RECEITA' else 'DESPESA' end::tipo_movimentacao
      left join fornecedores f on f.id = l.fornecedor_id
      left join clientes c on c.id = l.cliente_id
     where l.data_vencimento between it.data - (p_dias * 6) and it.data + (p_dias * 6)
       and lancamento_visivel_tesouraria(l.regional_id)
    union all
    select 'TRANSFERENCIA', tr.id, tr.data, tr.valor,
           coalesce(tr.descricao, 'Transferencia'), co.nome || ' -> ' || cd.nome,
           abs(tr.valor - abs(it.valor)) < 0.01, abs(tr.data - it.data)
      from it
      join transferencias_bancarias tr on tr.status = 'ATIVA'
           and ((it.valor < 0 and tr.conta_origem_id = it.conta_id) or (it.valor > 0 and tr.conta_destino_id = it.conta_id))
      join contas_bancarias co on co.id = tr.conta_origem_id
      join contas_bancarias cd on cd.id = tr.conta_destino_id
     where tr.data between it.data - p_dias and it.data + p_dias
       and not exists (select 1 from extrato_itens x where x.transferencia_id = tr.id and x.conta_id = it.conta_id)
  ) c(tipo, ref_id, data, valor, descricao, contraparte, valor_igual, dias)
  where pode_conta_bancaria((select conta_id from extrato_itens where id = p_item))
  order by valor_igual desc, dias, tipo
  limit 40;
$$;

create or replace function desfazer_extrato_item(p_item uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare it extrato_itens%rowtype;
begin
  perform exige_item_extrato(p_item);
  select * into it from extrato_itens where id = p_item for update;
  if it.id is null then raise exception 'Item do extrato nao encontrado' using errcode = '22023'; end if;
  -- (0147) lote da cobranca: as baixas voltam a nao conciliadas e o vinculo sai
  update baixas_financeiras b set status_conciliacao = 'NAO_CONCILIADO'
    from extrato_item_lote lt
   where lt.extrato_item_id = it.id and lt.baixa_id = b.id and b.status_conciliacao = 'CONCILIADO_API';
  delete from extrato_item_lote where extrato_item_id = it.id;
  if it.baixa_id is not null then
    update baixas_financeiras set status_conciliacao = 'NAO_CONCILIADO'
     where id = it.baixa_id and status_conciliacao = 'CONCILIADO_MANUAL';
  end if;
  update extrato_itens
     set situacao = 'PENDENTE', motivo = null, sugestao_tipo = null, sugestao_id = null,
         baixa_id = null, titulo_id = null, transferencia_id = null, conciliado_por = null, conciliado_em = null
   where id = p_item;
end;
$$;

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

create or replace function tesouraria_movimentos(p_inicio date default null, p_fim date default null)
returns table (
  data             date,
  conta_id         uuid,
  origem           text,
  ref_id           uuid,
  lancamento_id    uuid,
  valor            numeric,
  descricao        text,
  documento        text,
  contraparte      text,
  categoria_id     uuid,
  centro_custo_id  uuid,
  forma            text,
  conciliado       boolean,
  extrato_item_id  uuid,
  outra_conta_id   uuid,
  valido           boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    -- 1) baixas (o webhook, o agendador e a tela gravam aqui)
    select b.data_pagamento as data, b.conta_bancaria_id as conta_id, 'BAIXA'::text as origem,
           b.id as ref_id, l.id as lancamento_id,
           case when l.tipo = 'RECEITA' then b.valor_liquido else -b.valor_liquido end as valor,
           l.descricao,
           coalesce(nullif(l.numero_documento, ''), b.id_transacao_bancaria_externa) as documento,
           coalesce(f.nome_fantasia, f.razao_social, c.nome_razao_social, v.nome) as contraparte,
           l.categoria_dre_id as categoria_id, l.centro_custo_id,
           b.forma_pagamento::text as forma,
           (b.status_conciliacao <> 'NAO_CONCILIADO' or ei.id is not null or lb.id is not null) as conciliado,
           coalesce(ei.id, lb.extrato_item_id) as extrato_item_id, null::uuid as outra_conta_id
      from baixas_financeiras b
      join lancamentos_financeiros l on l.id = b.lancamento_id
      left join fornecedores f on f.id = l.fornecedor_id
      left join clientes c on c.id = l.cliente_id
      left join vendedores v on v.id = l.vendedor_id
      left join extrato_itens ei on ei.baixa_id = b.id
      left join extrato_item_lote lb on lb.baixa_id = b.id
     where l.status <> 'cancelado'
       and b.conta_bancaria_id is not null
       and (p_inicio is null or b.data_pagamento >= p_inicio)
       and (p_fim is null or b.data_pagamento <= p_fim)

    union all
    -- 2) titulo do SCar pago pelo banco (nao vira baixa: o DRE ja o le do titulo);
    --    entra no dia do CREDITO (0146), e na falta dele no do pagamento
    select coalesce(t.data_credito, t.data_pagamento), i.conta_bancaria_id, 'TITULO', t.id, null::uuid,
           coalesce(t.valor_pago, t.valor),
           'Mensalidade - ' || coalesce(c.nome_razao_social, ''),
           t.nosso_numero, c.nome_razao_social,
           (select id from categorias_dre where codigo_estruturado = '1.1.00'), null::uuid,
           'BOLETO', ei.id is not null or lt.id is not null, coalesce(ei.id, lt.extrato_item_id), null::uuid
      from titulos_financeiros t
      join integracoes_bancarias i on i.id = t.integracao_id and i.conta_bancaria_id is not null
      left join clientes c on c.id = t.cliente_id
      left join extrato_itens ei on ei.titulo_id = t.id
      left join extrato_item_lote lt on lt.titulo_id = t.id
     where t.status = 'pago' and t.data_pagamento is not null
       and (p_inicio is null or coalesce(t.data_credito, t.data_pagamento) >= p_inicio)
       and (p_fim is null or coalesce(t.data_credito, t.data_pagamento) <= p_fim)

    union all
    -- 3) transferencias: sai da origem ...
    select tr.data, tr.conta_origem_id, 'TRANSFERENCIA', tr.id, null::uuid, -tr.valor,
           coalesce(nullif(tr.descricao, ''), 'Transferencia para ' || cd.nome),
           null::text, cd.nome, null::uuid, null::uuid, 'TRANSFERENCIA',
           ei.id is not null, ei.id, tr.conta_destino_id
      from transferencias_bancarias tr
      join contas_bancarias cd on cd.id = tr.conta_destino_id
      left join extrato_itens ei on ei.transferencia_id = tr.id and ei.conta_id = tr.conta_origem_id
     where tr.status = 'ATIVA'
       and (p_inicio is null or tr.data >= p_inicio)
       and (p_fim is null or tr.data <= p_fim)

    union all
    -- ... e entra no destino
    select tr.data, tr.conta_destino_id, 'TRANSFERENCIA', tr.id, null::uuid, tr.valor,
           coalesce(nullif(tr.descricao, ''), 'Transferencia de ' || co.nome),
           null::text, co.nome, null::uuid, null::uuid, 'TRANSFERENCIA',
           ei.id is not null, ei.id, tr.conta_origem_id
      from transferencias_bancarias tr
      join contas_bancarias co on co.id = tr.conta_origem_id
      left join extrato_itens ei on ei.transferencia_id = tr.id and ei.conta_id = tr.conta_destino_id
     where tr.status = 'ATIVA'
       and (p_inicio is null or tr.data >= p_inicio)
       and (p_fim is null or tr.data <= p_fim)
  )
  select m.data, m.conta_id, m.origem, m.ref_id, m.lancamento_id, m.valor, m.descricao, m.documento,
         m.contraparte, m.categoria_id, m.centro_custo_id, m.forma, m.conciliado, m.extrato_item_id,
         m.outra_conta_id,
         (cb.saldo_inicial_em is null or m.data > cb.saldo_inicial_em) as valido
    from m
    join contas_bancarias cb on cb.id = m.conta_id
   where (select tem_acesso_global()) or auth.uid() is null
      or m.conta_id = any((select contas_do_operador())::uuid[]);
$$;
drop trigger if exists trg_baixa_solta_extrato on baixas_financeiras;
create trigger trg_baixa_solta_extrato before delete on baixas_financeiras
  for each row execute function fn_baixa_solta_extrato();

-- O que ja esta no extrato: concilia os lotes que fecham (o credito de 13/10).
select * from conciliar_lotes_cobranca(null, null);

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
