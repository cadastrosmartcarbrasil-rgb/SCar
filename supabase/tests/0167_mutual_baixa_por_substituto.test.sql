-- Teste da 0167: mensalidade do Mutual paga por boleto de outro tipo (revistoria,
-- cancelamento) com o mesmo valor fica paga; valor diferente nao; o recebimento
-- nao identificado do nosso numero substituto vira a mensalidade; re-executavel.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  reg uuid; c uuid; conta uuid; a uuid; b uuid; d uuid; lanc uuid;
  r record; l record; n int;
begin
  insert into auth.users (id, email) values (u_adm, 'adm167@t.com');
  insert into usuarios (id, nome, email, papel) values (u_adm, 'Admin', 'adm167@t.com', 'admin');
  insert into regionais (nome) values ('UNIDADE 167') returning id into reg;
  insert into contas_bancarias (nome, banco) values ('SICREDI', 'BANCO SICREDI') returning id into conta;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'ASSOCIADA 167', '35169335695', reg) returning id into c;
  perform set_config('request.jwt.claim.sub', '', false);

  insert into mutual_captura (entidade, id_externo, payload) values
    ('INVOICE', '9001', '{"reference_id":"M1","original_reference_id":"M1","invoice_type":"MONTHLY_PAYMENT","invoice_status":"PENDING"}'),
    ('INVOICE', '9002', '{"reference_id":"R1","original_reference_id":"M1","invoice_type":"REINSPECTION","invoice_status":"SUCCEEDED","paid_amount":187.5,"payment_date":"2026-10-02","nosso_numero":"600802304"}'),
    ('INVOICE', '9003', '{"reference_id":"M2","original_reference_id":"M2","invoice_type":"MONTHLY_PAYMENT","invoice_status":"PENDING"}'),
    ('INVOICE', '9004', '{"reference_id":"R2","original_reference_id":"M2","invoice_type":"REINSPECTION","invoice_status":"SUCCEEDED","paid_amount":35,"payment_date":"2026-10-07","nosso_numero":"600803840"}'),
    ('INVOICE', '9005', '{"reference_id":"M3","original_reference_id":"M3","invoice_type":"MONTHLY_PAYMENT","invoice_status":"PENDING"}'),
    ('INVOICE', '9006', '{"reference_id":"K3","original_reference_id":"M3","invoice_type":"CANCELAMENTO","invoice_status":"SUCCEEDED","paid_amount":214.5,"payment_date":"2026-10-20","nosso_numero":"600809999"}');

  insert into boletos_historico (id_externo, cliente_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem)
    values ('9001', c, 'MONTHLY_PAYMENT', '2026-08-01', '2026-09-20', '2026-09-21', 187.50, 'aberto', 'PENDING')
    returning id into a;
  insert into boletos_historico (id_externo, cliente_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem)
    values ('9003', c, 'MONTHLY_PAYMENT', '2026-08-01', '2026-09-15', '2026-09-15', 240.50, 'aberto', 'PENDING')
    returning id into b;
  insert into boletos_historico (id_externo, cliente_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem)
    values ('9005', c, 'MONTHLY_PAYMENT', '2026-09-01', '2026-10-25', '2026-10-25', 214.50, 'aberto', 'PENDING')
    returning id into d;
  assert (select referencia_externa from boletos_historico where id = a) = 'M1', 'referencia preenchida pela captura';

  -- o banco ja informou o pagamento do substituto do 3o (credito depois de 13/10): nao identificado
  perform registrar_liquidacao_banco('SICREDI', 'producao', '600809999', null,
    date '2026-10-20', 214.50, date '2026-10-20', '{"tipoLiquidacao":"PIX"}'::jsonb);
  select lancamento_id into lanc from cobranca_liquidacoes where nosso_numero = '600809999';
  assert lanc is not null, 'virou nao identificado';

  -- 1) simulacao lista e nao grava
  select count(*) into n from mutual_baixar_por_substituto(false);
  assert n = 2, 'dois candidatos (valor igual): ' || n;
  assert (select situacao from boletos_historico where id = a) = 'aberto', 'simulacao nao grava';

  -- 2) confirma
  for r in select * from mutual_baixar_por_substituto(true) loop
    if r.boleto_id = a then assert r.acao = 'BAIXADO' and r.pago_em = date '2026-10-02', row_to_json(r)::text; end if;
    if r.boleto_id = d then assert r.acao = 'BAIXADO_E_CONVERTIDO', row_to_json(r)::text; end if;
  end loop;
  select situacao, valor_pago, data_pagamento, baixa_banco_em into r from boletos_historico where id = a;
  assert r.situacao = 'pago' and r.valor_pago = 187.50 and r.data_pagamento = date '2026-10-02'
     and r.baixa_banco_em is not null, row_to_json(r)::text;
  assert (select situacao from boletos_historico where id = b) = 'aberto', 'valor diferente segue aberto';

  -- o nao identificado virou a mensalidade, sem duplicar
  select lf.cliente_id, lf.regional_id, cat.codigo_estruturado as cod
    into l from lancamentos_financeiros lf join categorias_dre cat on cat.id = lf.categoria_dre_id where lf.id = lanc;
  assert l.cliente_id = c and l.regional_id = reg and l.cod = '3.1.1.01', row_to_json(l)::text;
  assert (select lancamento_id from boletos_historico where id = d) = lanc;
  select situacao, boleto_historico_id into r from cobranca_liquidacoes where nosso_numero = '600809999';
  assert r.situacao = 'BAIXADO' and r.boleto_historico_id = d, row_to_json(r)::text;
  assert (select count(*) from lancamentos_financeiros where numero_documento = 'SICREDI-600809999') = 1;

  -- 3) a importacao (PENDING de novo) nao reabre; re-executar nao faz nada
  update boletos_historico set situacao = 'aberto', status_origem = 'PENDING', valor_pago = null, data_pagamento = null
   where id = a;
  assert (select situacao from boletos_historico where id = a) = 'pago', 'importacao nao reabre';
  select count(*) into n from mutual_baixar_por_substituto(true);
  assert n = 0, 'nada novo: ' || n;

  -- 4) o banco informa o substituto DEPOIS da baixa: a proxima rodada converte
  perform registrar_liquidacao_banco('SICREDI', 'producao', '600802304', null,
    date '2026-10-16', 187.50, date '2026-10-16', '{"tipoLiquidacao":"PIX"}'::jsonb);
  select count(*) into n from mutual_baixar_por_substituto(true) where acao = 'CONVERTIDO';
  assert n = 1, 'converte o nao identificado que chegou depois: ' || n;
  assert (select lancamento_id from boletos_historico where id = a) is not null;

  -- 5) usuario sem acesso global e recusado
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000167', 'cons167@t.com');
  insert into usuarios (id, nome, email, papel) values ('00000000-0000-0000-0000-000000000167', 'Consultor', 'cons167@t.com', 'consultor_vendas');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000167', false);
  begin
    perform mutual_baixar_por_substituto(false);
    assert false, 'deveria recusar';
  exception when insufficient_privilege then null;
  end;

  raise notice '=== 0167 mutual baixa por substituto: PASSARAM ===';
end $$;
