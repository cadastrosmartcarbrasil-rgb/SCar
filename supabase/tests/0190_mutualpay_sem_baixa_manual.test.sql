-- Teste da 0190: baixa MANUAL sem taxa no Mutual nao vira recebimento no MutualPay;
-- MANUAL com taxa (pagamento real ajustado a mao) continua entrando.
\set ON_ERROR_STOP on
do $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  insert into contas_bancarias (nome, banco) values ('MUTUALTECHPAG SOL', 'MUTUALTECHPAG SOL');
  insert into mutual_captura (entidade, id_externo, payload) values
    ('INVOICE', '9101', '{"bank_id":15,"invoice_status":"SUCCEEDED","invoice_type":"MONTHLY_PAYMENT","payment_type":"BILLET","paid_amount":248,"transaction_fee":0,"last_change_type":"MANUAL","payment_date":"2026-10-29","credit_date":"2026-10-28","transaction_id":"TXM"}'),
    ('INVOICE', '9102', '{"bank_id":15,"invoice_status":"SUCCEEDED","invoice_type":"MONTHLY_PAYMENT","payment_type":"BILLET","paid_amount":150,"transaction_fee":1.49,"last_change_type":"MANUAL","payment_date":"2026-10-28","credit_date":"2026-10-28","transaction_id":"TXN"}');
  perform mutual_baixar_mutualpay(true);
  assert not exists (select 1 from lancamentos_financeiros where numero_documento = 'MUTUALPAY-TXM'), 'manual sem taxa nao entra';
  assert exists (select 1 from lancamentos_financeiros where numero_documento = 'MUTUALPAY-TXN'), 'manual com taxa entra';
  raise notice '=== TESTES 0190 (MutualPay sem baixa manual) PASSARAM ===';
end $$;
