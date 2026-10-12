-- Teste funcional da 0099: o historico financeiro (SAC e portal) passa a ler
-- os boletos do Mutual, com a data de corte, a permissao e o recorte de
-- veiculo; e a importacao traz linha digitavel e links.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges2 uuid := gen_random_uuid();
  u_cli uuid := gen_random_uuid();
  u_out uuid := gen_random_uuid();
  r1 uuid; r2 uuid; tv uuid; c1 uuid; c2 uuid; v1 uuid; v2 uuid; t uuid;
  rec record; n bigint;
begin
  insert into auth.users (id, email) values
    (u_adm,'adm99@t.com'), (u_ges2,'ges99@t.com'), (u_cli,'cli99@t.com'), (u_out,'out99@t.com');
  insert into regionais (nome) values ('Unidade 1') returning id into r1;
  insert into regionais (nome) values ('Unidade 2') returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm99@t.com','admin', null),
    (u_ges2,'Gestor 2','ges99@t.com','gestor_regional', r2);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, auth_user_id)
    values ('PF','ASSOCIADO UM','52998224725', r1, u_cli) returning id into c1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, auth_user_id)
    values ('PF','OUTRO','11144477735', r1, u_out) returning id into c2;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa)
    values (c1,'AAA9A99', r1, tv, 'ativo', current_date - 400, 100, true) returning id into v1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa)
    values (c1,'BBB9B99', r1, tv, 'ativo', current_date - 400, 100, true) returning id into v2;

  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, valor_pago, data_pagamento, situacao, status_origem, linha_digitavel, url_pagamento) values
    ('m1', c1, v1,   'MONTHLY_PAYMENT', current_date - 70, current_date - 70, 100, 100, current_date - 71, 'pago', 'SUCCEEDED', null, null),
    ('m2', c1, v1,   'MONTHLY_PAYMENT', current_date - 40, current_date - 40, 110, null, null, 'aberto', 'OVERDUE', '7489100', 'https://pagar/m2'),
    ('m3', c1, v2,   'MONTHLY_PAYMENT', current_date - 40, current_date - 40, 120, null, null, 'aberto', 'OVERDUE', null, null),
    ('m4', c1, null, 'MONTHLY_PAYMENT', current_date + 10, current_date + 10, 130, null, null, 'aberto', 'PENDING', null, null),
    ('m5', c1, v1,   'MONTHLY_PAYMENT', current_date - 10, current_date - 10, 140, null, null, 'cancelado', 'CANCELED', null, null);

  -- ===================================================== SAC
  select count(*) into n from boletos_mutual_do_cliente(c1, null, 60);
  assert n = 5, format('todos os boletos do associado: %s', n);
  select * into rec from boletos_mutual_do_cliente(c1, null, 60) b
    join boletos_historico h on h.id = b.id where h.id_externo = 'm2';
  assert rec.status = 'vencido' and rec.dias_atraso = 40 and rec.linha_digitavel = '7489100'
     and rec.url_pagamento = 'https://pagar/m2', format('m2: %s', row_to_json(rec));
  assert (select b.status from boletos_mutual_do_cliente(c1) b join boletos_historico h on h.id = b.id
           where h.id_externo = 'm1') = 'pago';
  assert (select b.status from boletos_mutual_do_cliente(c1) b join boletos_historico h on h.id = b.id
           where h.id_externo = 'm4') = 'aberto';
  assert (select b.status from boletos_mutual_do_cliente(c1) b join boletos_historico h on h.id = b.id
           where h.id_externo = 'm5') = 'cancelado';
  select count(*) into n from boletos_mutual_do_cliente(c1, v1, 60);
  assert n = 4, format('veiculo 1 + os sem veiculo: %s', n);

  -- escopo: gestor de outra unidade nao le
  perform set_config('request.jwt.claim.sub', u_ges2::text, false);
  select count(*) into n from boletos_mutual_do_cliente(c1, null, 60);
  assert n = 0, 'gestor da unidade vizinha nao ve';

  -- ===================================================== portal
  perform set_config('request.jwt.claim.sub', u_cli::text, false);
  select count(*) into n from portal_boletos_mutual(120);
  assert n = 4, format('portal: sem os cancelados: %s', n);
  select * into rec from portal_financeiro();
  assert rec.em_aberto = 360 and rec.vencido = 230 and rec.qtd_vencidos = 2, format('cabecalho: %s', row_to_json(rec));
  assert rec.proximo_vencimento = current_date + 10 and rec.proximo_valor = 130 and not rec.em_dia;
  assert rec.pago_12_meses = 100;
  perform set_config('request.jwt.claim.sub', u_out::text, false);
  select count(*) into n from portal_boletos_mutual(120);
  assert n = 0, 'outro associado nao ve';

  -- ===================================================== corte
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status)
    values (c1, 100, current_date - 20, 'pendente') returning id into t;
  insert into faturas (cliente_id, regional_id, tipo_faturamento, competencia, valor_total, vencimento, titulo_id)
    values (c1, r1, 'AGRUPADO_ASSOCIADO', date_trunc('month', current_date - 20)::date, 100, current_date - 20, t);
  assert corte_cobranca_cliente(c1) = current_date - 20;
  select count(*) into n from boletos_mutual_do_cliente(c1, null, 60);
  assert n = 3, format('depois do corte, o Mutual sai (m4 e m5): %s', n);

  -- ===================================================== importacao traz a linha
  insert into mutual_captura (entidade, id_externo, payload) values
    ('CONTRACT', '901', '{"id":901,"person_id":"8001"}'),
    ('INVOICE', 'Z1', '{"id":"Z1","contract_id":"901","invoice_type":"MONTHLY_PAYMENT","invoice_status":"OVERDUE","original_expiration_date":"2026-09-05","expiration_date":"2026-09-05","amount":90,"linha_digitavel":"74891 123","invoice_billet_url":"https://b/1","checkout_link":"https://c/1"}');
  insert into integracao_vinculos (entidade, id_externo, tabela, registro_id) values ('PERSON', '8001', 'clientes', c2);
  perform * from cobranca_importar_historico_mutual(null, 100, true);
  select * into rec from boletos_historico where id_externo = 'Z1';
  assert rec.linha_digitavel = '74891 123' and rec.url_boleto = 'https://b/1' and rec.url_pagamento = 'https://c/1',
    format('importacao: %s', row_to_json(rec));
  select * into rec from cobranca_importar_historico_mutual(null, 100, true);
  assert rec.gravados = 0, 'reimportar sem mudanca nao regrava';
  update mutual_captura set payload = payload || '{"linha_digitavel":"999"}' where id_externo = 'Z1';
  select * into rec from cobranca_importar_historico_mutual(null, 100, true);
  assert rec.gravados = 1, 'linha nova regrava';

  raise notice '=== TESTES 0099 (historico financeiro com o Mutual) PASSARAM ===';
end $$;
