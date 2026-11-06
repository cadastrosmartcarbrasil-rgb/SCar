-- Teste da 0189: cartao recorrente entra pelo BRUTO (paid_amount vem liquido),
-- cartao avulso sem credit_date entra em D+31 no proximo dia util, e credito futuro
-- so entra no dia.
\set ON_ERROR_STOP on
do $$
declare conta uuid; l record; n int;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  insert into contas_bancarias (nome, banco) values ('MUTUALTECHPAG SOL', 'MUTUALTECHPAG SOL') returning id into conta;
  insert into mutual_captura (entidade, id_externo, payload) values
    ('INVOICE', '8901', '{"bank_id":15,"invoice_status":"SUCCEEDED","invoice_type":"MONTHLY_PAYMENT","payment_type":"CARD_RECURRENCE","amount":234.5,"paid_amount":227.93,"transaction_fee":6.57,"payment_date":"2026-09-10","credit_date":"2026-10-13","transaction_id":"TXA"}'),
    ('INVOICE', '8902', '{"bank_id":15,"invoice_status":"SUCCEEDED","invoice_type":"MONTHLY_PAYMENT","payment_type":"CARD","amount":166,"paid_amount":166,"transaction_fee":5.04,"payment_date":"2026-09-09","credit_date":null,"transaction_id":"TXB"}'),
    ('INVOICE', '8903', '{"bank_id":15,"invoice_status":"SUCCEEDED","invoice_type":"MONTHLY_PAYMENT","payment_type":"CARD_RECURRENCE","amount":100,"paid_amount":97,"transaction_fee":3,"payment_date":"2099-01-01","credit_date":"2099-02-01","transaction_id":"TXC"}');

  perform mutual_baixar_mutualpay(true);

  select lf.valor_original v, b.data_pagamento d into l from lancamentos_financeiros lf
    join baixas_financeiras b on b.lancamento_id = lf.id where lf.numero_documento = 'MUTUALPAY-TXA';
  assert l.v = 234.50 and l.d = date '2026-10-13', 'recorrente pelo bruto: ' || row_to_json(l)::text;
  assert (select valor_original from lancamentos_financeiros where numero_documento = 'MUTUALPAY-TAXA-TXA') = 6.57;

  select lf.valor_original v, b.data_pagamento d, lf.observacoes o into l from lancamentos_financeiros lf
    join baixas_financeiras b on b.lancamento_id = lf.id where lf.numero_documento = 'MUTUALPAY-TXB';
  assert l.v = 166 and l.d = dia_util_seguinte(date '2026-09-09' + 31) and l.o like '%estimado%',
    'cartao avulso em D+31: ' || row_to_json(l)::text;

  assert not exists (select 1 from lancamentos_financeiros where numero_documento = 'MUTUALPAY-TXC'),
    'credito futuro nao entra';

  -- liquido da conta = o que o extrato mostra
  assert (select sum(case when lf.tipo = 'RECEITA' then b.valor_liquido else -b.valor_liquido end)
            from baixas_financeiras b join lancamentos_financeiros lf on lf.id = b.lancamento_id
           where b.conta_bancaria_id = conta) = 227.93 + 160.96;

  select count(*) into n from mutual_baixar_mutualpay(true);
  assert n = 0, 're-executavel: ' || n;
  raise notice '=== TESTES 0189 (MutualPay cartao e bruto) PASSARAM ===';
end $$;
