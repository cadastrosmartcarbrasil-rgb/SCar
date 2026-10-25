-- =============================================================================
-- 0146_baixa_banco_data_credito.sql
-- A BAIXA DO BANCO ENTRA NA DATA DO CREDITO, NAO NA DATA DO PAGAMENTO.
--
-- O defeito (relatado em 25/10/2026): o boleto pago por COMPE (outro banco) ou
-- REDE (lotérica/correspondente) cai na conta do Sicredi no DIA UTIL SEGUINTE;
-- so o PIX e credito na hora. A baixa automatica (0105/0117/0118) gravava o
-- recebimento na data do PAGAMENTO, entao o saldo da conta e o extrato nunca
-- batiam: o credito "LIQ.COBRANCA SIMPLES-COB000042" de R$ 7.131,73 do extrato
-- de 13/10 eram 42 boletos pagos em 09/10 (sexta; 12/10 feriado), e os COMPE
-- pagos em 13/10 entraram como recebidos em 13/10, mas o dinheiro chegou em 14/10.
--
-- Conferido em producao contra o `credit_date` que o proprio Mutual guarda no
-- INVOICE: PIX = mesmo dia; boleto COMPE/REDE = proximo dia util (13/10 -> 14/10,
-- 16/10 sexta -> 19/10 segunda, 09/10 sexta -> 13/10 por causa do feriado).
-- O `liquidados/dia` do Sicredi traz `tipoLiquidacao` (PIX | COMPE | REDE) e a
-- data do PAGAMENTO; a data do credito sai daqui.
--
-- O que muda:
--   A) feriados bancarios nacionais 2026-2027 em `cobranca_feriados` (a tabela
--      estava VAZIA; sem eles o 12/10 contaria como dia util). Tambem acerta o
--      vencimento efetivo do painel de inadimplencia (0097), que ja os lia.
--   B) `data_credito_banco(data, tipo)`: PIX = o dia; o resto = proximo dia util.
--   C) `cobranca_liquidacoes.tipo_liquidacao` / `data_credito` (trilha) e
--      `titulos_financeiros.data_credito` (titulo do SCar pago pelo banco).
--   D) `registrar_liquidacao_banco` (MESMA assinatura): a baixa e o vencimento do
--      recebimento vao para a data do credito; boleto/titulo guardam o dia do
--      pagamento (e o que o associado fez). O inicio da baixa do Mutual (13/10)
--      passa a ser comparado com o CREDITO: o dinheiro que caiu na conta a
--      partir de 13/10 entra no caixa, mesmo pago antes (os 42 de 09/10).
--   E) `tesouraria_movimentos`: titulo do SCar no dia do credito.
--   F) correcao do que ja foi gravado: baixa NAO conciliada vai para o credito.
-- =============================================================================

-- A) Feriados bancarios nacionais (FEBRABAN). Feriado municipal da cooperativa
--    entra pela tela (Cobranca -> painel -> configuracao).
insert into cobranca_feriados (data, descricao)
select f.data::date, f.descricao
  from (values
    ('2026-01-01', 'CONFRATERNIZACAO UNIVERSAL'),
    ('2026-02-16', 'CARNAVAL'),
    ('2026-02-17', 'CARNAVAL'),
    ('2026-04-03', 'SEXTA-FEIRA SANTA'),
    ('2026-04-21', 'TIRADENTES'),
    ('2026-05-01', 'DIA DO TRABALHO'),
    ('2026-06-04', 'CORPUS CHRISTI'),
    ('2026-09-07', 'INDEPENDENCIA'),
    ('2026-10-12', 'NOSSA SENHORA APARECIDA'),
    ('2026-11-02', 'FINADOS'),
    ('2026-11-15', 'PROCLAMACAO DA REPUBLICA'),
    ('2026-11-20', 'CONSCIENCIA NEGRA'),
    ('2026-12-25', 'NATAL'),
    ('2027-01-01', 'CONFRATERNIZACAO UNIVERSAL'),
    ('2027-02-08', 'CARNAVAL'),
    ('2027-02-09', 'CARNAVAL'),
    ('2027-03-26', 'SEXTA-FEIRA SANTA'),
    ('2027-04-21', 'TIRADENTES'),
    ('2027-05-01', 'DIA DO TRABALHO'),
    ('2027-05-27', 'CORPUS CHRISTI'),
    ('2027-09-07', 'INDEPENDENCIA'),
    ('2027-10-12', 'NOSSA SENHORA APARECIDA'),
    ('2027-11-02', 'FINADOS'),
    ('2027-11-15', 'PROCLAMACAO DA REPUBLICA'),
    ('2027-11-20', 'CONSCIENCIA NEGRA'),
    ('2027-12-25', 'NATAL')
  ) as f(data, descricao)
 where not exists (select 1 from cobranca_feriados c where c.data = f.data::date);

-- B) A data do credito. Espelho: `dataCreditoLiquidacao` (src/lib/baixa-banco.ts).
create or replace function data_credito_banco(p_data date, p_tipo text)
returns date
language sql
stable
set search_path = public
as $$
  select case
           when p_data is null then null
           -- PIX (e tipo desconhecido: sem informacao, nao se inventa atraso)
           when p_tipo is null or upper(p_tipo) like '%PIX%' then p_data
           else dia_util_seguinte(p_data + 1)
         end;
$$;

comment on function data_credito_banco(date, text) is
  'Dia em que o pagamento cai na conta (0146): PIX no proprio dia; boleto COMPE/REDE '
  'no proximo dia util (fins de semana e cobranca_feriados). Espelho: dataCreditoLiquidacao.';

-- C) Colunas
alter table cobranca_liquidacoes add column if not exists tipo_liquidacao text;
alter table cobranca_liquidacoes add column if not exists data_credito date;
alter table titulos_financeiros add column if not exists data_credito date;

comment on column cobranca_liquidacoes.data_credito is
  'Dia do credito na conta (0146): PIX = dia do pagamento; COMPE/REDE = proximo dia util.';
comment on column titulos_financeiros.data_credito is
  'Dia em que o pagamento do banco caiu na conta (0146). Nulo = baixa manual (vale data_pagamento).';

update cobranca_liquidacoes l
   set tipo_liquidacao = nullif(upper(trim(l.payload->>'tipoLiquidacao')), ''),
       data_credito    = data_credito_banco(l.data_pagamento, l.payload->>'tipoLiquidacao')
 where l.data_credito is null;

-- D) A baixa na data do credito
create or replace function registrar_liquidacao_banco(
  p_provedor       text,
  p_ambiente       text,
  p_nosso_numero   text,
  p_seu_numero     text,
  p_data_pagamento date,
  p_valor_pago     numeric,
  p_dia_consultado date,
  p_payload        jsonb default null
) returns table (situacao text, titulo_id uuid, valor_divergente boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_nosso   text := nullif(trim(p_nosso_numero), '');
  v_seu     text := nullif(lower(regexp_replace(coalesce(p_seu_numero, ''), '[^0-9a-fA-F]', '', 'g')), '');
  v_tit     titulos_financeiros%rowtype;
  v_hist    boletos_historico%rowtype;
  v_qtd     int;
  v_sit     text;
  v_div     boolean := false;
  v_data    date := coalesce(p_data_pagamento, p_dia_consultado);
  v_tipo    text := nullif(upper(trim(coalesce(p_payload->>'tipoLiquidacao', ''))), '');
  v_credito date;
  v_lanc    uuid;
  v_valor   numeric(12,2);
  v_conta   uuid;
  v_cat     uuid;
  v_forma   forma_pagamento;
  v_ni      uuid;   -- recebimento nao identificado ja lancado para este pagamento
  v_cat_ni  uuid;
begin
  -- Rotina do servidor (service_role, sem sessao) ou a matriz.
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Sem permissao para registrar baixa bancaria' using errcode = '42501';
  end if;
  if v_nosso is null then
    raise exception 'Pagamento sem nosso numero' using errcode = '22023';
  end if;
  if v_data is null then
    raise exception 'Pagamento sem data' using errcode = '22023';
  end if;
  -- (0146) o dinheiro entra na conta no dia do CREDITO
  v_credito := data_credito_banco(v_data, v_tipo);
  v_forma := case when coalesce(v_tipo, '') like '%PIX%' then 'PIX' else 'BOLETO' end::forma_pagamento;

  -- Recebimento NAO IDENTIFICADO ja lancado para este pagamento (0118)?
  select id into v_cat_ni from categorias_dre where codigo_estruturado = '1.9.98';
  select lf.id into v_ni
    from cobranca_liquidacoes l
    join lancamentos_financeiros lf on lf.id = l.lancamento_id
   where l.provedor::text = p_provedor and l.ambiente::text = p_ambiente
     and l.nosso_numero = v_nosso and l.data_pagamento = v_data
     and lf.categoria_dre_id = v_cat_ni and lf.status <> 'cancelado';

  -- 1) titulo do SCar: nosso numero, dentro do provedor + ambiente que emitiu
  select t.* into v_tit
    from titulos_financeiros t
    join integracoes_bancarias i on i.id = t.integracao_id
   where t.nosso_numero = v_nosso
     and i.provedor::text = p_provedor
     and i.ambiente::text = p_ambiente
   order by t.created_at desc, t.id
   limit 1;

  -- 2) reserva: seuNumero, so com UM candidato
  if v_tit.id is null and v_seu is not null and length(v_seu) >= 8 then
    select count(*) into v_qtd
      from titulos_financeiros t
      join integracoes_bancarias i on i.id = t.integracao_id
     where replace(t.id::text, '-', '') like v_seu || '%'
       and i.provedor::text = p_provedor
       and i.ambiente::text = p_ambiente;
    if v_qtd = 1 then
      select t.* into v_tit
        from titulos_financeiros t
        join integracoes_bancarias i on i.id = t.integracao_id
       where replace(t.id::text, '-', '') like v_seu || '%'
         and i.provedor::text = p_provedor
         and i.ambiente::text = p_ambiente;
    end if;
  end if;

  if v_tit.id is not null then
    if v_tit.status = 'pago' then
      v_sit := 'JA_PAGO';
    elsif v_tit.status = 'cancelado' then
      v_sit := 'TITULO_CANCELADO';
    else
      v_sit := 'BAIXADO';
      update titulos_financeiros
         set status         = 'pago',
             data_pagamento = v_data,
             data_credito   = v_credito,
             valor_pago     = coalesce(p_valor_pago, v_tit.valor),
             gateway_status = 'LIQUIDADO',
             gateway_erro   = null
       where id = v_tit.id;
    end if;
    if p_valor_pago is not null then
      v_div := abs(p_valor_pago - v_tit.valor) >= 0.01;
    end if;
    -- o dinheiro era de um titulo do SCar: o nao identificado sai (senao conta duas vezes)
    if v_ni is not null then
      delete from baixas_financeiras where lancamento_id = v_ni;
      update lancamentos_financeiros
         set status = 'cancelado',
             observacoes = coalesce(observacoes || ' | ', '')
                           || 'Cancelado: o pagamento foi identificado no titulo ' || v_tit.id::text
       where id = v_ni;
    end if;

  -- 3) boleto do MUTUAL (mesmo beneficiario; so o Sicredi de producao e real)
  elsif p_provedor = 'SICREDI' and p_ambiente = 'producao' then
    select h.* into v_hist
      from boletos_historico h
     where h.nosso_numero = v_nosso
     order by (h.situacao = 'cancelado'), abs(h.data_vencimento - v_data), h.id
     limit 1;

    if v_hist.id is null then
      v_sit := 'NAO_ENCONTRADO';
      v_valor := round(coalesce(p_valor_pago, 0), 2);
      -- (0118) o dinheiro entrou na conta: vira RECEBIMENTO NAO IDENTIFICADO na matriz
      if v_ni is not null then
        v_lanc := v_ni;
      elsif v_credito >= inicio_baixa_banco_mutual() and v_valor > 0 then
        select id into v_conta
          from contas_bancarias
         where ativo and (banco ilike '%sicredi%' or nome ilike '%sicredi%')
         order by created_at, id
         limit 1;

        insert into lancamentos_financeiros
               (tipo, cliente_id, descricao, categoria_dre_id, regional_id, valor_original,
                data_emissao, data_vencimento, competencia, numero_documento, observacoes)
        values ('RECEITA', null,
                'Recebimento nao identificado - nosso numero ' || v_nosso,
                v_cat_ni, null, v_valor, v_data, v_credito, date_trunc('month', v_data)::date,
                'SICREDI-' || v_nosso,
                'Pagamento informado pelo Sicredi sem boleto nem titulo correspondente (0118). '
                  || 'Ao identificar o boleto, reprocessar a baixa converte este lancamento.')
        returning id into v_lanc;

        insert into baixas_financeiras
               (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id,
                id_transacao_bancaria_externa, forma_pagamento, status_conciliacao, observacao)
        values (v_lanc, v_credito, v_valor, v_valor, v_conta, v_nosso, v_forma, 'NAO_CONCILIADO',
                'Sicredi informou o pagamento (' || to_char(v_data, 'DD/MM/YYYY')
                  || '); pagador nao identificado');
      end if;
    elsif v_hist.lancamento_id is not null
       or (v_hist.baixa_banco_em is not null and v_credito < inicio_baixa_banco_mutual()) then
      v_sit  := 'JA_PAGO';
      v_lanc := v_hist.lancamento_id;
    else
      v_sit   := 'BAIXADO';
      v_valor := round(coalesce(p_valor_pago, v_hist.valor), 2);

      if v_ni is not null then
        -- (0118) o nao identificado vira a mensalidade do boleto achado
        select id into v_cat from categorias_dre where codigo_estruturado = '1.1.00';
        update lancamentos_financeiros lf
           set cliente_id       = v_hist.cliente_id,
               regional_id      = (select c.regional_id from clientes c where c.id = v_hist.cliente_id),
               categoria_dre_id = v_cat,
               descricao        = 'Mensalidade ' || coalesce(to_char(v_hist.competencia, 'MM/YYYY'), '')
                                    || ' (boleto do Mutual) - nosso numero ' || v_nosso,
               competencia      = coalesce(v_hist.competencia, date_trunc('month', v_hist.vencimento_original)::date),
               observacoes      = coalesce(lf.observacoes || ' | ', '')
                                    || 'Identificado: boleto do Mutual ' || v_hist.id_externo
         where lf.id = v_ni;
        v_lanc := v_ni;
      elsif v_credito >= inicio_baixa_banco_mutual() and v_valor > 0 then
        select id into v_cat from categorias_dre where codigo_estruturado = '1.1.00';
        select id into v_conta
          from contas_bancarias
         where ativo and (banco ilike '%sicredi%' or nome ilike '%sicredi%')
         order by created_at, id
         limit 1;

        insert into lancamentos_financeiros
               (tipo, cliente_id, descricao, categoria_dre_id, regional_id, valor_original,
                data_emissao, data_vencimento, competencia, numero_documento, observacoes)
        select 'RECEITA', v_hist.cliente_id,
               'Mensalidade ' || coalesce(to_char(v_hist.competencia, 'MM/YYYY'), '')
                 || ' (boleto do Mutual) - nosso numero ' || v_nosso,
               v_cat, c.regional_id, v_valor,
               v_data, v_credito,
               coalesce(v_hist.competencia, date_trunc('month', v_hist.vencimento_original)::date),
               'SICREDI-' || v_nosso,
               'Baixa automatica pelo banco (0117). Pago em ' || to_char(v_data, 'DD/MM/YYYY')
                 || coalesce(' (' || v_tipo || ')', '') || '; credito em ' || to_char(v_credito, 'DD/MM/YYYY') || '.'
          from clientes c where c.id = v_hist.cliente_id
        returning id into v_lanc;

        insert into baixas_financeiras
               (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id,
                id_transacao_bancaria_externa, forma_pagamento, status_conciliacao, observacao)
        values (v_lanc, v_credito, v_valor, v_valor, v_conta, v_nosso, v_forma, 'NAO_CONCILIADO',
                'Sicredi informou o pagamento (' || to_char(v_data, 'DD/MM/YYYY')
                  || '); credito previsto em ' || to_char(v_credito, 'DD/MM/YYYY'));
      end if;

      update boletos_historico
         set situacao       = 'pago',
             valor_pago     = v_valor,
             data_pagamento = v_data,
             baixa_banco_em = now(),
             lancamento_id  = v_lanc,
             atualizado_em  = now()
       where id = v_hist.id;
    end if;
    if v_hist.id is not null and p_valor_pago is not null then
      v_div := abs(p_valor_pago - v_hist.valor) >= 0.01;
    end if;
  else
    v_sit := 'NAO_ENCONTRADO';
  end if;

  -- Trilha re-executavel. Uma linha ja BAIXADA nao e rebaixada para JA_PAGO
  -- na segunda leitura (quem baixou foi a primeira).
  insert into cobranca_liquidacoes as l
         (provedor, ambiente, nosso_numero, seu_numero, data_pagamento, valor_pago,
          titulo_id, boleto_historico_id, lancamento_id, situacao, valor_divergente,
          dia_consultado, payload, tipo_liquidacao, data_credito)
  values (p_provedor::provedor_banco, p_ambiente::ambiente_integracao, v_nosso,
          nullif(trim(p_seu_numero), ''), v_data, p_valor_pago,
          v_tit.id, v_hist.id, v_lanc, v_sit, v_div, coalesce(p_dia_consultado, v_data), p_payload,
          v_tipo, v_credito)
  on conflict on constraint uq_cobranca_liquidacao do update
     set titulo_id           = coalesce(excluded.titulo_id, l.titulo_id),
         boleto_historico_id = coalesce(excluded.boleto_historico_id, l.boleto_historico_id),
         lancamento_id       = case when excluded.titulo_id is not null then excluded.lancamento_id
                                    else coalesce(excluded.lancamento_id, l.lancamento_id) end,
         situacao            = case when l.situacao = 'BAIXADO' and excluded.situacao = 'JA_PAGO'
                                    then 'BAIXADO' else excluded.situacao end,
         valor_divergente    = excluded.valor_divergente,
         valor_pago          = excluded.valor_pago,
         payload             = coalesce(excluded.payload, l.payload),
         tipo_liquidacao     = coalesce(excluded.tipo_liquidacao, l.tipo_liquidacao),
         data_credito        = coalesce(excluded.data_credito, l.data_credito)
   where l.situacao is distinct from (case when l.situacao = 'BAIXADO' and excluded.situacao = 'JA_PAGO'
                                           then 'BAIXADO' else excluded.situacao end)
      or l.titulo_id is distinct from coalesce(excluded.titulo_id, l.titulo_id)
      or l.boleto_historico_id is distinct from coalesce(excluded.boleto_historico_id, l.boleto_historico_id)
      or l.lancamento_id is distinct from (case when excluded.titulo_id is not null then excluded.lancamento_id
                                                else coalesce(excluded.lancamento_id, l.lancamento_id) end)
      or l.valor_pago is distinct from excluded.valor_pago
      or l.tipo_liquidacao is distinct from coalesce(excluded.tipo_liquidacao, l.tipo_liquidacao)
      or l.data_credito is distinct from coalesce(excluded.data_credito, l.data_credito);

  situacao := (select l.situacao from cobranca_liquidacoes l
                where l.provedor::text = p_provedor and l.ambiente::text = p_ambiente
                  and l.nosso_numero = v_nosso and l.data_pagamento = v_data);
  titulo_id := v_tit.id;
  valor_divergente := v_div;
  return next;
end;
$$;

comment on function registrar_liquidacao_banco(text, text, text, text, date, numeric, date, jsonb) is
  'Baixa pelo banco (0105/0117/0118/0146): titulo do SCar, boleto do Mutual ou recebimento nao '
  'identificado. A baixa entra na DATA DO CREDITO (data_credito_banco: PIX no dia, COMPE/REDE no '
  'proximo dia util); o boleto/titulo guarda o dia do pagamento.';

-- E) Caixa: titulo do SCar pago pelo banco entra no dia do credito
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
           (b.status_conciliacao <> 'NAO_CONCILIADO' or ei.id is not null) as conciliado,
           ei.id as extrato_item_id, null::uuid as outra_conta_id
      from baixas_financeiras b
      join lancamentos_financeiros l on l.id = b.lancamento_id
      left join fornecedores f on f.id = l.fornecedor_id
      left join clientes c on c.id = l.cliente_id
      left join vendedores v on v.id = l.vendedor_id
      left join extrato_itens ei on ei.baixa_id = b.id
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
           'BOLETO', ei.id is not null, ei.id, null::uuid
      from titulos_financeiros t
      join integracoes_bancarias i on i.id = t.integracao_id and i.conta_bancaria_id is not null
      left join clientes c on c.id = t.cliente_id
      left join extrato_itens ei on ei.titulo_id = t.id
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

-- F) O que ja foi gravado: titulo do SCar ganha o dia do credito; baixa do banco
--    ainda NAO conciliada vai do dia do pagamento para o do credito (a conciliada
--    nao e tocada: quem conciliou ja a casou com o extrato).
update titulos_financeiros t
   set data_credito = l.data_credito
  from cobranca_liquidacoes l
 where l.titulo_id = t.id and l.situacao = 'BAIXADO'
   and t.data_credito is null and l.data_credito is not null
   and t.data_pagamento = l.data_pagamento;

update baixas_financeiras b
   set data_pagamento = l.data_credito
  from cobranca_liquidacoes l
 where l.lancamento_id = b.lancamento_id
   and b.id_transacao_bancaria_externa = l.nosso_numero
   and b.data_pagamento = l.data_pagamento
   and l.data_credito is not null and l.data_credito <> l.data_pagamento
   and b.status_conciliacao = 'NAO_CONCILIADO'
   and not exists (select 1 from extrato_itens ei where ei.baixa_id = b.id);

update lancamentos_financeiros lf
   set data_vencimento = l.data_credito
  from cobranca_liquidacoes l
 where l.lancamento_id = lf.id
   and lf.numero_documento = 'SICREDI-' || l.nosso_numero
   and lf.data_vencimento = l.data_pagamento
   and l.data_credito is not null and l.data_credito <> l.data_pagamento;

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
