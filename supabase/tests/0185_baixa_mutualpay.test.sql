-- Teste da 0185: pagamento do MutualPay (bank_id 15) vira recebimento baixado na
-- conta MUTUALTECHPAG na data do credito, com a taxa como despesa; mensalidade do
-- historico leva o associado; o resto vai para 3.1.1.98; antes de 13/10 nao entra;
-- boleto do Sicredi (bank 1) nao entra; re-executavel.
\set ON_ERROR_STOP on
do $$
declare
  reg uuid; c uuid; conta uuid; h uuid; n int; r record; l record;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  insert into regionais (nome) values ('UNIDADE 173') returning id into reg;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'ASSOCIADO 173', '35169335695', reg) returning id into c;

  insert into mutual_captura (entidade, id_externo, payload) values
    ('INVOICE', '7301', '{"bank_id":15,"invoice_status":"SUCCEEDED","invoice_type":"MONTHLY_PAYMENT","payment_type":"BILLET","paid_amount":376.5,"transaction_fee":1.49,"payment_date":"2026-11-03","credit_date":"2026-11-04","transaction_id":"TX1"}'),
    ('INVOICE', '7302', '{"bank_id":15,"invoice_status":"SUCCEEDED","invoice_type":"MONTHLY_PAYMENT","payment_type":"CARD","paid_amount":278.5,"transaction_fee":7.62,"payment_date":"2026-09-20","credit_date":null,"transaction_id":"TX2"}'),
    ('INVOICE', '7303', '{"bank_id":15,"invoice_status":"SUCCEEDED","invoice_type":"PRODUCT_FEE","payment_type":"BILLET","paid_amount":64,"transaction_fee":1.53,"payment_date":"2026-10-20","credit_date":"2026-10-20","transaction_id":"TX3"}'),
    ('INVOICE', '7304', '{"bank_id":15,"invoice_status":"SUCCEEDED","invoice_type":"MONTHLY_PAYMENT","payment_type":"BILLET","paid_amount":100,"transaction_fee":1.49,"payment_date":"2026-10-10","credit_date":"2026-10-12","transaction_id":"TX4"}'),
    ('INVOICE', '7305', '{"bank_id":1,"invoice_status":"SUCCEEDED","invoice_type":"MONTHLY_PAYMENT","payment_type":"BILLET","paid_amount":200,"payment_date":"2026-10-20","credit_date":"2026-10-21"}'),
    ('INVOICE', '7306', '{"bank_id":15,"invoice_status":"PENDING","invoice_type":"MONTHLY_PAYMENT","paid_amount":0}');

  insert into boletos_historico (id_externo, cliente_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, valor_pago, data_pagamento, situacao, status_origem)
    values ('7301', c, 'MONTHLY_PAYMENT', '2026-09-01', '2026-10-30', '2026-11-03', 376.50, 376.50,
            '2026-11-03', 'pago', 'SUCCEEDED') returning id into h;
  insert into boletos_historico (id_externo, cliente_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, valor_pago, data_pagamento, situacao, status_origem)
    values ('7302', c, 'MONTHLY_PAYMENT', '2026-10-01', '2026-11-04', '2026-11-04', 278.50, 278.50,
            '2026-11-04', 'pago', 'SUCCEEDED');

  -- sem a conta: simula, mas confirmar recusa
  select count(*) into n from mutual_baixar_mutualpay(false);
  assert n = 3, 'tres candidatos (o de 12/10, o bank 1 e o pendente ficam fora): ' || n;
  begin
    perform mutual_baixar_mutualpay(true);
    assert false, 'confirmar sem a conta devia recusar';
  exception when check_violation then null;
  end;

  insert into contas_bancarias (nome, banco) values ('MUTUALTECHPAG SOL', 'MUTUALTECHPAG SOL') returning id into conta;

  for r in select * from mutual_baixar_mutualpay(true) loop
    if r.invoice_id = '7301' then assert r.acao = 'MENSALIDADE' and r.data_credito = date '2026-11-04', row_to_json(r)::text; end if;
    if r.invoice_id = '7302' then assert r.acao = 'MENSALIDADE' and r.data_credito = date '2026-10-21' and r.forma = 'CARTAO', row_to_json(r)::text; end if;
    if r.invoice_id = '7303' then assert r.acao = 'NAO_IDENTIFICADO', row_to_json(r)::text; end if;
  end loop;

  -- mensalidade: associado, unidade, 3.1.1.01, baixa na conta na data do credito
  select lf.cliente_id, lf.regional_id, lf.status, cat.codigo_estruturado cod, b.data_pagamento, b.valor_pago,
         b.conta_bancaria_id, b.forma_pagamento
    into l
    from lancamentos_financeiros lf join categorias_dre cat on cat.id = lf.categoria_dre_id
    join baixas_financeiras b on b.lancamento_id = lf.id
   where lf.numero_documento = 'MUTUALPAY-TX1';
  assert l.cliente_id = c and l.regional_id = reg and l.cod = '3.1.1.01' and l.status = 'quitado'
     and l.data_pagamento = date '2026-11-04' and l.valor_pago = 376.50 and l.conta_bancaria_id = conta
     and l.forma_pagamento = 'BOLETO', row_to_json(l)::text;
  assert (select lancamento_id from boletos_historico where id = h) is not null, 'boleto ganha o lancamento';

  -- taxa: despesa baixada; cartao em 4.1.3.01, boleto em 4.3.2.01
  select cat.codigo_estruturado cod, lf.valor_original v into l
    from lancamentos_financeiros lf join categorias_dre cat on cat.id = lf.categoria_dre_id
   where lf.numero_documento = 'MUTUALPAY-TAXA-TX2';
  assert l.cod = '4.1.3.01' and l.v = 7.62, row_to_json(l)::text;
  assert (select cat.codigo_estruturado from lancamentos_financeiros lf join categorias_dre cat on cat.id = lf.categoria_dre_id
           where lf.numero_documento = 'MUTUALPAY-TAXA-TX1') = '4.3.2.01';

  -- fora do historico: 3.1.1.98 na matriz
  select cat.codigo_estruturado cod, lf.regional_id, lf.cliente_id into l
    from lancamentos_financeiros lf join categorias_dre cat on cat.id = lf.categoria_dre_id
   where lf.numero_documento = 'MUTUALPAY-TX3';
  assert l.cod = '3.1.1.98' and l.regional_id is null and l.cliente_id is null, row_to_json(l)::text;

  -- saldo da conta = recebido - taxas
  assert (select coalesce(sum(case when lf.tipo = 'RECEITA' then b.valor_liquido else -b.valor_liquido end), 0)
            from baixas_financeiras b join lancamentos_financeiros lf on lf.id = b.lancamento_id
           where b.conta_bancaria_id = conta) = (376.50 + 278.50 + 64) - (1.49 + 7.62 + 1.53);

  -- nada antes de 13/10 nem de outro banco
  assert not exists (select 1 from lancamentos_financeiros where numero_documento in ('MUTUALPAY-TX4', 'MUTUALPAY-INV7305'));

  -- re-executavel
  select count(*) into n from mutual_baixar_mutualpay(true);
  assert n = 0, 'nada novo: ' || n;
  assert (select count(*) from lancamentos_financeiros where numero_documento like 'MUTUALPAY-%') = 6;

  raise notice '=== TESTES 0185 (baixa MutualPay) PASSARAM ===';
end $$;
