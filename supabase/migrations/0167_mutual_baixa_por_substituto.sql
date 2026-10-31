-- ============================================================================
-- 0167 — A MENSALIDADE DO MUTUAL PAGA POR OUTRO TIPO DE BOLETO (31/10/2026)
-- ----------------------------------------------------------------------------
-- O caso (FLAVIA DE OLIVEIRA MARTINS, EMU6D39): a mensalidade de agosto venceu,
-- o Mutual emitiu no lugar dela um boleto de REVISTORIA (invoice_type
-- REINSPECTION, original_reference_id = a mensalidade) e ela pagou esse. A
-- importacao do historico (0097/0099) so traz mensalidade, entao o pagamento
-- nunca chegou e a mensalidade seguiu "vencida" no SAC, na fila e na 24h.
-- Medido em 31/10: 9 mensalidades nessa situacao (7 revistoria + 2 cancelamento).
--
-- Regra (decisao do usuario): boleto do Mutual PAGO (SUCCEEDED), de tipo que
-- nao e mensalidade, que aponta para uma mensalidade em aberto pelo
-- original_reference_id e com o MESMO valor -> a mensalidade fica paga, na data
-- do pagamento. Valor diferente NAO baixa (pode ser so a taxa da revistoria, um
-- acordo ou um pro-rata): fica para conferencia.
--
-- E se o banco ja informou o pagamento (baixa automatica, 0117/0118)? O nosso
-- numero e o do boleto substituto, que nao esta no historico: virou recebimento
-- NAO IDENTIFICADO (1.9.98). Aqui ele e convertido na mensalidade do associado,
-- como o reprocessamento da 0118 faria.
--
-- A baixa leva `baixa_banco_em`: a importacao seguinte (que ainda le PENDING no
-- boleto original) nao a desfaz (gatilho da 0117).
-- A rotina diaria (/api/v1/mutual/sincronizar) chama depois de importar os boletos.
-- ============================================================================

create or replace function mutual_baixar_por_substituto(p_confirmar boolean default false)
returns table (boleto_id uuid, cliente text, competencia date, valor numeric, pago_em date,
               tipo_substituto text, acao text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_cat_ni uuid;
  v_cat_mens uuid;
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Somente a matriz (admin/financeiro) da baixa no historico de boletos.'
      using errcode = 'insufficient_privilege';
  end if;

  select id into v_cat_ni from categorias_dre where codigo_estruturado in ('3.1.1.98', '1.9.98')
   order by codigo_estruturado desc limit 1;
  select id into v_cat_mens from categorias_dre where codigo_estruturado in ('3.1.1.01', '1.1.00')
   order by codigo_estruturado desc limit 1;

  for r in
    with sub as (
      select m.id_externo,
             upper(btrim(coalesce(m.payload->>'invoice_type', ''))) as tipo,
             m.payload->>'original_reference_id' as orig,
             round(nullif(m.payload->>'paid_amount', '')::numeric, 2) as pago,
             coalesce(mutual_dia(m.payload->>'payment_date'), mutual_dia(m.payload->>'credit_date')) as pago_em,
             nullif(btrim(coalesce(m.payload->>'nosso_numero', '')), '') as nosso
        from mutual_captura m
       where m.entidade = 'INVOICE'
         and not m.deletado
         and upper(coalesce(m.payload->>'invoice_status', '')) = 'SUCCEEDED'
         and upper(btrim(coalesce(m.payload->>'invoice_type', '')))
             not in ('MONTHLY_PAYMENT', 'PRO_RATA', 'ACCESSION_MONTHLY_PAYMENT')
         and coalesce(m.payload->>'original_reference_id', '') <> ''
         and m.payload->>'original_reference_id' is distinct from m.payload->>'reference_id'
    )
    select h.id, h.situacao, h.lancamento_id, h.cliente_id, h.competencia, h.vencimento_original,
           h.valor, h.id_externo, c.nome_razao_social, c.regional_id,
           s.tipo, s.pago, s.pago_em, s.nosso,
           (select l.id from cobranca_liquidacoes l
              join lancamentos_financeiros lf on lf.id = l.lancamento_id
             where l.nosso_numero = s.nosso and l.provedor::text = 'SICREDI' and l.ambiente::text = 'producao'
               and lf.categoria_dre_id = v_cat_ni and lf.status <> 'cancelado'
             order by l.data_pagamento desc limit 1) as liq_id
      from sub s
      join boletos_historico h on h.origem = 'MUTUAL' and h.referencia_externa = s.orig
      join clientes c on c.id = h.cliente_id
     where s.pago is not null and s.pago_em is not null
       and s.pago = round(h.valor, 2)
       and h.renegociacao_id is null
       and (h.situacao = 'aberto' or (h.situacao = 'pago' and h.lancamento_id is null))
  loop
    -- ja pago e sem recebimento nao identificado a converter: nada a fazer
    continue when r.situacao = 'pago' and r.liq_id is null;

    boleto_id := r.id; cliente := r.nome_razao_social; competencia := r.competencia;
    valor := r.valor; pago_em := r.pago_em; tipo_substituto := r.tipo;
    acao := case when r.situacao = 'aberto' then 'BAIXADO' else 'CONVERTIDO' end;

    if p_confirmar then
      if r.situacao = 'aberto' then
        update boletos_historico
           set situacao = 'pago', valor_pago = r.pago, data_pagamento = r.pago_em,
               baixa_banco_em = now(), atualizado_em = now()
         where id = r.id;
      end if;
      if r.liq_id is not null then
        -- o nao identificado (0118) vira a mensalidade do associado
        update lancamentos_financeiros lf
           set cliente_id       = r.cliente_id,
               regional_id      = r.regional_id,
               categoria_dre_id = coalesce(v_cat_mens, lf.categoria_dre_id),
               descricao        = 'Mensalidade ' || coalesce(to_char(r.competencia, 'MM/YYYY'), '')
                                    || ' (boleto do Mutual, pago por ' || lower(r.tipo) || ') - nosso numero ' || r.nosso,
               competencia      = coalesce(r.competencia, date_trunc('month', r.vencimento_original)::date),
               observacoes      = coalesce(lf.observacoes || ' | ', '')
                                    || 'Identificado (0167): substitui a mensalidade ' || r.id_externo
          from cobranca_liquidacoes l
         where l.id = r.liq_id and lf.id = l.lancamento_id;
        update boletos_historico
           set lancamento_id = (select l.lancamento_id from cobranca_liquidacoes l where l.id = r.liq_id)
         where id = r.id;
        update cobranca_liquidacoes
           set boleto_historico_id = r.id, situacao = 'BAIXADO', updated_at = now()
         where id = r.liq_id;
        if r.situacao = 'aberto' then acao := 'BAIXADO_E_CONVERTIDO'; end if;
      end if;
    end if;
    return next;
  end loop;
end;
$$;

comment on function mutual_baixar_por_substituto(boolean) is
  '0167: mensalidade do Mutual paga por outro tipo de boleto (revistoria, cancelamento) com o mesmo valor '
  'e original_reference_id -> fica paga; recebimento nao identificado do mesmo nosso numero vira a mensalidade. '
  'Sem p_confirmar so lista.';

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
