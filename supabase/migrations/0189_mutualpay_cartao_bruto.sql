-- ============================================================================
-- 0189 — BAIXA DO MUTUALPAY: o que o extrato de 13/10/2026 mostrou (corrige a 0185)
--
-- Conferido com o extrato da conta MUTUALTECHPAG SOL de 13/10 (planilha do usuario):
--  (1) CARTAO AVULSO (payment_type CARD) nunca traz credit_date; a 0185 caia na data
--      do PAGAMENTO (09 a 12/09) e o filtro ">= 13/10" deixava o cartao de fora.
--      JOCI, RODRIGO, BRUNO, ERICK, NEISE e ANDERSON estavam no extrato de 13/10 e
--      nao no SCar. O credito do cartao e D+31 corridos, no proximo dia util
--      (09/09 -> 13/10, 12/10 feriado); vira a data do credito, marcada ESTIMADA.
--  (2) CARD_RECURRENCE traz paid_amount LIQUIDO (amount - transaction_fee, 519 de 519):
--      a 0185 lancava o liquido como receita E a taxa como despesa (taxa contada duas
--      vezes; ANDRE 227,93 no SCar x 234,50 no extrato). Agora a receita e o BRUTO.
--  (3) Credito FUTURO (cartao de novembro) nao entra antes do dia: so credito <= hoje.
--
-- Refaz os lancamentos MUTUALPAY-* (nenhum conciliado, conta sem extrato importado em
-- 06/11/2026) e roda de novo. Re-executavel.
-- ============================================================================

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
             -- 0189: o VALOR BRUTO. No CARD_RECURRENCE o paid_amount vem LIQUIDO
             -- (amount - transaction_fee, medido em 519 de 519); nos outros vem bruto.
             round(case when upper(coalesce(c.payload->>'payment_type', '')) = 'CARD_RECURRENCE'
                        then coalesce(nullif(c.payload->>'paid_amount', '')::numeric, 0)
                             + coalesce(nullif(c.payload->>'transaction_fee', '')::numeric, 0)
                        else coalesce(nullif(c.payload->>'paid_amount', '')::numeric,
                                      nullif(c.payload->>'amount', '')::numeric)
                   end, 2)                                                           as valor,
             round(coalesce(nullif(c.payload->>'transaction_fee', '')::numeric, 0), 2) as taxa,
             mutual_dia(c.payload->>'payment_date')                                 as pago_em,
             -- 0189: o cartao avulso (CARD) nunca traz credit_date; o credito cai em
             -- D+31 corridos, no proximo dia util (conferido no extrato de 13/10/2026).
             coalesce(mutual_dia(c.payload->>'credit_date'),
                      case when upper(coalesce(c.payload->>'payment_type', '')) like 'CARD%'
                           then dia_util_seguinte(mutual_dia(c.payload->>'payment_date') + 31)
                      end,
                      mutual_dia(c.payload->>'payment_date'))                       as credito,
             (c.payload->>'credit_date') is null
               and upper(coalesce(c.payload->>'payment_type', '')) like 'CARD%'     as credito_estimado,
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
       -- 0189: so o que ja caiu na conta (credito futuro de cartao entra no dia)
       and i.credito <= data_sp(now())
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
              'Baixa do MutualPay (0185/0189): pago em ' || coalesce(to_char(r.pago_em, 'DD/MM/YYYY'), '?')
                || ', credito na conta do Mutual em ' || to_char(r.credito, 'DD/MM/YYYY')
                || case when r.credito_estimado then ' (estimado: cartao D+31)' else '' end
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
                'Taxa descontada pelo MutualPay no credito (0185/0189).')
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
  'Baixa dos pagamentos do MutualPay (0185/0189): INVOICE bank_id 15 pago -> recebimento BRUTO baixado na conta MUTUALTECHPAG na data do credito (cartao sem credit_date: D+31 no proximo dia util, estimado) + a taxa como despesa. So o credito ate hoje. Desde 13/10/2026. Re-executavel; sem p_confirmar so simula.';

-- Refaz o que a 0185 lancou (so o que ainda nao foi conciliado).
do $$
declare v_ids uuid[];
begin
  select coalesce(array_agg(l.id), '{}') into v_ids
    from lancamentos_financeiros l
   where l.numero_documento like 'MUTUALPAY-%'
     and not exists (select 1 from baixas_financeiras b
                      where b.lancamento_id = l.id and b.status_conciliacao <> 'NAO_CONCILIADO');
  update boletos_historico set lancamento_id = null, atualizado_em = now()
   where lancamento_id = any(v_ids) and baixa_banco_em is null;
  delete from baixas_financeiras where lancamento_id = any(v_ids);
  delete from lancamentos_financeiros where id = any(v_ids);

  if exists (select 1 from contas_bancarias
              where ativo and (nome ilike 'mutualtech%' or banco ilike 'mutualtech%')) then
    perform count(*) from mutual_baixar_mutualpay(true);
  end if;
end $$;

revoke execute on function mutual_baixar_mutualpay(boolean) from public, anon;
grant  execute on function mutual_baixar_mutualpay(boolean) to authenticated, service_role;
