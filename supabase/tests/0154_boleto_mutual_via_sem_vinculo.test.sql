-- Teste da 0154: a via paga SEM original_reference_id tira o original da divida
-- quando e a mesma mensalidade; valor diferente, emissao anterior ou outro
-- veiculo nao casam; a importacao nao reabre; o pagamento do original vence.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; cli uuid; v1 uuid; v2 uuid;
  a uuid; b uuid; c uuid; d uuid; e uuid; f uuid; g1 uuid; g2 uuid;
  rec record;
begin
  insert into auth.users (id, email) values (u_adm, 'adm154@t.com');
  insert into regionais (nome) values ('Unidade 154') returning id into r1;
  insert into usuarios (id, nome, email, papel) values (u_adm, 'Admin', 'adm154@t.com', 'admin');
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'ASSOCIADO 154', '52998224725', r1) returning id into cli;
  insert into veiculos (cliente_id, placa, marca, modelo, regional_id) values (cli, 'RQE9F01', 'X', 'Y', r1) returning id into v1;
  insert into veiculos (cliente_id, placa, marca, modelo, regional_id) values (cli, 'RQE9F02', 'X', 'Y', r1) returning id into v2;

  insert into mutual_captura (entidade, id_externo, payload) values
    ('INVOICE', '5001', '{"reference_id":"A1","created_at":"2026-05-29T10:00:00Z"}'),
    ('INVOICE', '5002', '{"reference_id":"A2","created_at":"2026-09-17T10:00:00Z"}'),
    ('INVOICE', '6001', '{"reference_id":"B1","created_at":"2026-05-29T10:00:00Z"}'),
    ('INVOICE', '6002', '{"reference_id":"B2","created_at":"2026-09-17T10:00:00Z"}'),
    ('INVOICE', '7001', '{"reference_id":"C1","created_at":"2026-09-30T10:00:00Z"}'),
    ('INVOICE', '7002', '{"reference_id":"C2","created_at":"2026-05-29T10:00:00Z"}'),
    ('INVOICE', '8001', '{"reference_id":"D1","created_at":"2026-05-29T10:00:00Z"}'),
    ('INVOICE', '8002', '{"reference_id":"D2","created_at":"2026-09-17T10:00:00Z"}');

  -- (1) o caso RQE9F00: original vencido, via nova (sem ligacao) paga
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem)
    values ('5001', cli, v1, 'MONTHLY_PAYMENT', '2026-08-01', '2026-09-10', '2026-09-10', 259.83, 'aberto', 'PENDING')
    returning id into a;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, valor_pago, data_pagamento, situacao, status_origem)
    values ('5002', cli, v1, 'MONTHLY_PAYMENT', '2026-08-01', '2026-09-17', '2026-09-17', 259.83, 259.83,
            '2026-09-17', 'pago', 'SUCCEEDED')
    returning id into b;
  select situacao, substituido_por into rec from boletos_historico where id = a;
  assert rec.situacao = 'cancelado' and rec.substituido_por = b,
    format('(1) o pagamento chegando no outro grupo tira o original: %s', row_to_json(rec));

  -- (2) o recalculo do grupo do original nao o reabre, nem a importacao
  perform recalcular_substituicoes_boletos('A1');
  update boletos_historico set situacao = 'aberto', status_origem = 'PENDING' where id = a;
  assert (select situacao from boletos_historico where id = a) = 'cancelado', '(2) continua substituido';

  -- (3) valor diferente nao casa
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem)
    values ('6001', cli, v1, 'MONTHLY_PAYMENT', '2026-09-01', '2026-10-10', '2026-10-10', 259.83, 'aberto', 'PENDING')
    returning id into c;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, valor_pago, data_pagamento, situacao, status_origem)
    values ('6002', cli, v1, 'MONTHLY_PAYMENT', '2026-09-01', '2026-09-20', '2026-09-20', 60, 60,
            '2026-09-20', 'pago', 'SUCCEEDED')
    returning id into d;
  assert (select situacao from boletos_historico where id = c) = 'aberto', '(3) valor diferente segue aberto';

  -- (4) pago emitido ANTES do aberto nao casa (pode ser outra cobranca)
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem)
    values ('7001', cli, v2, 'MONTHLY_PAYMENT', '2026-10-01', '2026-11-30', '2026-11-30', 150, 'aberto', 'PENDING')
    returning id into e;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, valor_pago, data_pagamento, situacao, status_origem)
    values ('7002', cli, v2, 'MONTHLY_PAYMENT', '2026-10-01', '2026-11-10', '2026-11-10', 150, 150,
            '2026-11-10', 'pago', 'SUCCEEDED')
    returning id into f;
  assert (select situacao from boletos_historico where id = e) = 'aberto', '(4) emissao anterior nao casa';

  -- (5) outro veiculo nao casa
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem)
    values ('8001', cli, v1, 'MONTHLY_PAYMENT', '2026-07-01', '2026-08-10', '2026-08-10', 200, 'aberto', 'PENDING')
    returning id into g1;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, valor_pago, data_pagamento, situacao, status_origem)
    values ('8002', cli, v2, 'MONTHLY_PAYMENT', '2026-07-01', '2026-08-17', '2026-08-17', 200, 200,
            '2026-08-17', 'pago', 'SUCCEEDED')
    returning id into g2;
  assert (select situacao from boletos_historico where id = g1) = 'aberto', '(5) outro veiculo nao casa';

  -- (6) a via paga cancelada devolve o original
  update boletos_historico set situacao = 'cancelado', status_origem = 'CANCELLED' where id = b;
  select situacao, substituido_por into rec from boletos_historico where id = a;
  assert rec.situacao = 'aberto' and rec.substituido_por is null,
    format('(6) sem o pagamento, o original volta: %s', row_to_json(rec));

  -- (7) o recalculo da base inteira e estavel
  assert recalcular_substituicoes_boletos(null) = 0, '(7) segunda passada nao muda nada';

  raise notice '=== 0154 via sem vinculo: TODOS OS TESTES PASSARAM ===';
end;
$$;
