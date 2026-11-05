-- ============================================================================
-- 0185 — BAIXA DOS PAGAMENTOS DO MUTUALPAY na conta MUTUALTECHPAG SOL
--
-- O Mutual tem um segundo banco: o MutualPay (bank_id 15 no INVOICE, linha
-- digitavel 237). Boleto, cartao e cartao recorrente pagos por ele caem na conta
-- MUTUALTECHPAG SOL, e o Mutual transfere o saldo para o Sicredi. A baixa do
-- banco (0117) so conhece o Sicredi, entao esses pagamentos chegavam ao SCar so
-- como "pago" no historico de boletos — sem recebimento, sem baixa e sem entrada
-- na conta. Medido em 05/11/2026: 268 mensalidades pagas desde 13/10
-- (R$ 50.843,54, R$ 630,53 de taxas), e a conta com 35 transferencias de SAIDA
-- (R$ 136.998,53) e nenhuma entrada — saldo negativo.
--
-- Decisoes do usuario (05/11/2026):
--   * a baixa vai na DATA DO CREDITO na conta do Mutual (credit_date do INVOICE);
--     sem ela (cartao avulso), a data do pagamento;
--   * retroativo desde 13/10/2026 (inicio_baixa_banco_mutual(), o mesmo do Sicredi).
--
-- Para cada INVOICE do MutualPay pago (SUCCEEDED, valor > 0, credito >= 13/10):
--   * RECEITA pelo valor pago, baixada na conta MUTUALTECHPAG na data do credito.
--     Mensalidade do historico de boletos -> 3.1.1.01, com o associado e a unidade
--     dele, e o boleto ganha o lancamento_id. Os demais (taxa de produto,
--     cancelamento, associado nao carregado) -> 3.1.1.98 na matriz, descritos;
--   * a TAXA do MutualPay (transaction_fee) vira DESPESA baixada na mesma conta e
--     data (cartao 4.1.3.01; boleto/PIX 4.3.2.01) — o saldo bate com o extrato.
-- Chave de idempotencia: numero_documento 'MUTUALPAY-<transaction_id>' (sem ele,
-- o id do INVOICE). Re-executavel. A rotina diaria chama com confirmar.
-- ============================================================================

create index if not exists idx_lancamentos_numero_documento
  on lancamentos_financeiros (numero_documento);

/** Forma de pagamento do MutualPay (payment_type do INVOICE). */
create or replace function mutualpay_forma(p_tipo text)
returns forma_pagamento
language sql
immutable
as $$
  select case
           when upper(coalesce(p_tipo, '')) like 'CARD%' then 'CARTAO'
           when upper(coalesce(p_tipo, '')) like '%PIX%' then 'PIX'
           else 'BOLETO'
         end::forma_pagamento
$$;

create or replace function mutual_baixar_mutualpay(p_confirmar boolean default false)
returns table (
  invoice_id   text,
  cliente      text,
  tipo         text,
  forma        text,
  valor        numeric,
  taxa         numeric,
  data_credito date,
  acao         text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_conta   uuid;
  v_cat_mens uuid; v_cat_nid uuid; v_cat_cartao uuid; v_cat_tarifa uuid;
  r record;
  v_lanc uuid; v_desp uuid;
  v_doc text;
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Somente a matriz (admin/financeiro) baixa os pagamentos do MutualPay.'
      using errcode = 'insufficient_privilege';
  end if;

  select id into v_conta
    from contas_bancarias
   where ativo and (nome ilike 'mutualtech%' or banco ilike 'mutualtech%')
   order by created_at, id
   limit 1;
  select id into v_cat_mens   from categorias_dre where codigo_estruturado = '3.1.1.01';
  select id into v_cat_nid    from categorias_dre where codigo_estruturado = '3.1.1.98';
  select id into v_cat_cartao from categorias_dre where codigo_estruturado = '4.1.3.01';
  select id into v_cat_tarifa from categorias_dre where codigo_estruturado = '4.3.2.01';

  if p_confirmar and v_conta is null then
    raise exception 'Cadastre a conta MUTUALTECHPAG em Configuracoes -> Contas Bancarias antes de baixar o MutualPay.'
      using errcode = 'check_violation';
  end if;

  for r in
    with inv as (
      select c.id_externo,
             c.payload,
             round(coalesce(nullif(c.payload->>'paid_amount', '')::numeric,
                            nullif(c.payload->>'amount', '')::numeric), 2)          as valor,
             round(coalesce(nullif(c.payload->>'transaction_fee', '')::numeric, 0), 2) as taxa,
             mutual_dia(c.payload->>'payment_date')                                 as pago_em,
             coalesce(mutual_dia(c.payload->>'credit_date'),
                      mutual_dia(c.payload->>'payment_date'))                       as credito,
             nullif(trim(c.payload->>'transaction_id'), '')                         as tx,
             upper(coalesce(c.payload->>'invoice_type', ''))                        as tipo,
             c.payload->>'payment_type'                                             as ptipo
        from mutual_captura c
       where c.entidade = 'INVOICE'
         and c.payload->>'bank_id' = '15'
         and upper(coalesce(c.payload->>'invoice_status', '')) = 'SUCCEEDED'
    )
    select i.*, 'MUTUALPAY-' || coalesce(i.tx, 'INV' || i.id_externo) as doc,
           h.id as hist_id, h.cliente_id, h.competencia, h.lancamento_id as hist_lanc,
           cl.nome_razao_social as cli_nome, cl.regional_id as cli_regional
      from inv i
      left join boletos_historico h on h.id_externo = i.id_externo and h.situacao = 'pago'
      left join clientes cl on cl.id = h.cliente_id
     where i.valor > 0
       and i.credito >= inicio_baixa_banco_mutual()
       and not exists (select 1 from lancamentos_financeiros l
                        where l.numero_documento = 'MUTUALPAY-' || coalesce(i.tx, 'INV' || i.id_externo))
     order by i.credito, i.id_externo
  loop
    invoice_id   := r.id_externo;
    cliente      := r.cli_nome;
    tipo         := r.tipo;
    forma        := mutualpay_forma(r.ptipo)::text;
    valor        := r.valor;
    taxa         := r.taxa;
    data_credito := r.credito;

    if r.hist_lanc is not null then
      -- ja tem recebimento por outro caminho (Sicredi, substituto): nao duplica
      acao := 'JA_LANCADO';
      return next;
      continue;
    end if;

    acao := case when r.hist_id is not null and r.tipo = 'MONTHLY_PAYMENT'
                 then 'MENSALIDADE' else 'NAO_IDENTIFICADO' end;

    if p_confirmar then
      insert into lancamentos_financeiros
             (tipo, cliente_id, descricao, categoria_dre_id, regional_id, valor_original,
              data_emissao, data_vencimento, competencia, numero_documento, observacoes)
      values ('RECEITA',
              case when acao = 'MENSALIDADE' then r.cliente_id end,
              case when acao = 'MENSALIDADE'
                   then 'Mensalidade ' || coalesce(to_char(r.competencia, 'MM/YYYY'), '')
                        || ' (MutualPay - ' || lower(forma) || ')'
                   else 'Recebimento MutualPay (' || coalesce(nullif(r.tipo, ''), 'sem tipo')
                        || coalesce(' - ' || r.cli_nome, '') || ') - invoice ' || r.id_externo
              end,
              case when acao = 'MENSALIDADE' then v_cat_mens else v_cat_nid end,
              case when acao = 'MENSALIDADE' then r.cli_regional end,
              r.valor,
              coalesce(r.pago_em, r.credito), r.credito,
              coalesce(r.competencia, date_trunc('month', r.credito)::date),
              r.doc,
              'Baixa do MutualPay (0185): pago em ' || coalesce(to_char(r.pago_em, 'DD/MM/YYYY'), '?')
                || ', credito na conta do Mutual em ' || to_char(r.credito, 'DD/MM/YYYY')
                || '. Invoice ' || r.id_externo || coalesce(', transacao ' || r.tx, '') || '.')
      returning id into v_lanc;

      insert into baixas_financeiras
             (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id,
              id_transacao_bancaria_externa, forma_pagamento, status_conciliacao, observacao)
      values (v_lanc, r.credito, r.valor, r.valor, v_conta,
              coalesce(r.tx, r.id_externo), mutualpay_forma(r.ptipo), 'NAO_CONCILIADO',
              'MutualPay: credito na conta MUTUALTECHPAG');

      if r.taxa > 0 then
        insert into lancamentos_financeiros
               (tipo, descricao, categoria_dre_id, regional_id, valor_original,
                data_emissao, data_vencimento, competencia, numero_documento, observacoes)
        values ('DESPESA',
                'Taxa MutualPay (' || lower(forma) || ') - invoice ' || r.id_externo,
                case when mutualpay_forma(r.ptipo) = 'CARTAO' then v_cat_cartao else v_cat_tarifa end,
                case when acao = 'MENSALIDADE' then r.cli_regional end,
                r.taxa, r.credito, r.credito, date_trunc('month', r.credito)::date,
                'MUTUALPAY-TAXA-' || coalesce(r.tx, 'INV' || r.id_externo),
                'Taxa descontada pelo MutualPay no credito (0185).')
        returning id into v_desp;

        insert into baixas_financeiras
               (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id,
                id_transacao_bancaria_externa, forma_pagamento, status_conciliacao, observacao)
        values (v_desp, r.credito, r.taxa, r.taxa, v_conta,
                coalesce(r.tx, r.id_externo), mutualpay_forma(r.ptipo), 'NAO_CONCILIADO',
                'MutualPay: taxa descontada no credito');
      end if;

      if acao = 'MENSALIDADE' then
        update boletos_historico set lancamento_id = v_lanc, atualizado_em = now()
         where id = r.hist_id;
      end if;
    end if;

    return next;
  end loop;
end;
$$;

comment on function mutual_baixar_mutualpay(boolean) is
  'Baixa dos pagamentos do MutualPay (0185): INVOICE bank_id 15 pago -> recebimento baixado na conta MUTUALTECHPAG na data do credito (sem ela, a do pagamento) + a taxa como despesa. Mensalidade do historico = 3.1.1.01 do associado; o resto = 3.1.1.98 na matriz. Desde 13/10/2026. Re-executavel; sem p_confirmar so simula.';

-- O retroativo comeca em 13/10: a conta passa a contar desde 12/10 (as
-- transferencias de outubro ja estao registradas). So mexe se ainda estiver
-- como foi cadastrada (saldo 0 em 01/11).
update contas_bancarias
   set saldo_inicial_em = date '2026-10-12'
 where (nome ilike 'mutualtech%' or banco ilike 'mutualtech%')
   and saldo_inicial = 0
   and saldo_inicial_em = date '2026-11-01';

-- O retroativo, de uma vez (re-executavel). Sem a conta cadastrada nao faz nada
-- (a rotina diaria faz quando ela existir).
do $$
begin
  if exists (select 1 from contas_bancarias
              where ativo and (nome ilike 'mutualtech%' or banco ilike 'mutualtech%')) then
    perform count(*) from mutual_baixar_mutualpay(true);
  end if;
end $$;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
