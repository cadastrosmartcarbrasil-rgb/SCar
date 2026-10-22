-- Teste funcional da 0140. Prova: (1) boleto do Mutual cujo mes foi pago por uma
-- 2a via sai da divida (cancelado + substituido_por) e some do painel; (2) a
-- importacao mandando PENDING de novo nao o reabre; (3) sem pagamento, vale a via
-- mais RECENTE e a antiga sai; (4) a via nova cancelada devolve a antiga; (5)
-- pagamento da via antiga sempre vence; (6) boleto sem referencia nao e tocado.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; cli uuid;
  a uuid; b uuid; c uuid; d uuid; e uuid; f uuid; s uuid;
  rec record; n bigint;
begin
  insert into auth.users (id, email) values (u_adm, 'adm140@t.com');
  insert into regionais (nome) values ('Unidade 140') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm, 'Admin', 'adm140@t.com', 'admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'ASSOCIADO 140', '52998224725', r1) returning id into cli;

  insert into mutual_captura (entidade, id_externo, payload) values
    ('INVOICE', '1001', '{"reference_id":"R1","original_reference_id":"R1","created_at":"2026-05-25T10:00:00Z"}'),
    ('INVOICE', '1002', '{"reference_id":"R2","original_reference_id":"R1","created_at":"2026-09-29T10:00:00Z"}'),
    ('INVOICE', '2001', '{"reference_id":"S1","original_reference_id":"S1","created_at":"2026-05-25T10:00:00Z"}'),
    ('INVOICE', '2002', '{"reference_id":"S2","original_reference_id":"S1","created_at":"2026-10-05T10:00:00Z"}'),
    ('INVOICE', '3001', '{"reference_id":"T1","original_reference_id":"T1","created_at":"2026-05-25T10:00:00Z"}'),
    ('INVOICE', '3002', '{"reference_id":"T2","original_reference_id":"T1","created_at":"2026-10-05T10:00:00Z"}'),
    ('INVOICE', '4001', '{"created_at":"2026-05-25T10:00:00Z"}');

  -- (1) original vencido + 2a via paga
  insert into boletos_historico (id_externo, cliente_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem)
    values ('1001', cli, 'MONTHLY_PAYMENT', '2026-08-01', current_date - 27, current_date - 27, 86.40, 'aberto', 'PENDING')
    returning id into a;
  assert (select referencia_original from boletos_historico where id = a) = 'R1', 'a referencia vem do payload';
  assert (select situacao from boletos_historico where id = a) = 'aberto', 'sozinho continua aberto';
  insert into boletos_historico (id_externo, cliente_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, valor_pago, data_pagamento, situacao, status_origem)
    values ('1002', cli, 'MONTHLY_PAYMENT', '2026-08-01', current_date - 23, current_date - 23, 86.40, 86.40,
            current_date - 23, 'pago', 'PAID')
    returning id into b;
  select situacao, substituido_por into rec from boletos_historico where id = a;
  assert rec.situacao = 'cancelado' and rec.substituido_por = b,
    format('(1) o mes pago pela 2a via tira o original da divida: %s', row_to_json(rec));
  select count(*) into n from cobranca_boletos_base(null, null, null) where boleto_id = a and situacao = 'vencido';
  assert n = 0, '(1) e o painel nao o conta como vencido';

  -- (2) a importacao manda PENDING de novo
  update boletos_historico set situacao = 'aberto', status_origem = 'PENDING' where id = a;
  assert (select situacao from boletos_historico where id = a) = 'cancelado', '(2) a importacao nao reabre';

  -- (3) sem pagamento: vale a via mais recente
  insert into boletos_historico (id_externo, cliente_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem)
    values ('2001', cli, 'MONTHLY_PAYMENT', '2026-09-01', current_date - 12, current_date - 12, 100, 'aberto', 'PENDING')
    returning id into c;
  insert into boletos_historico (id_externo, cliente_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem)
    values ('2002', cli, 'MONTHLY_PAYMENT', '2026-09-01', current_date + 5, current_date + 5, 100, 'aberto', 'PENDING')
    returning id into d;
  select situacao, substituido_por into rec from boletos_historico where id = c;
  assert rec.situacao = 'cancelado' and rec.substituido_por = d,
    format('(3) a via antiga sai, vale a nova: %s', row_to_json(rec));
  assert (select situacao from boletos_historico where id = d) = 'aberto', '(3) a nova segue aberta (a vencer)';

  -- (4) a via nova cancelada no Mutual devolve a antiga
  update boletos_historico set situacao = 'cancelado', status_origem = 'CANCELLED' where id = d;
  select situacao, substituido_por into rec from boletos_historico where id = c;
  assert rec.situacao = 'aberto' and rec.substituido_por is null,
    format('(4) a antiga volta a ser a divida: %s', row_to_json(rec));

  -- (5) pagamento da via antiga sempre vence
  insert into boletos_historico (id_externo, cliente_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem)
    values ('3001', cli, 'MONTHLY_PAYMENT', '2026-07-01', current_date - 40, current_date - 40, 120, 'aberto', 'PENDING')
    returning id into e;
  insert into boletos_historico (id_externo, cliente_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem)
    values ('3002', cli, 'MONTHLY_PAYMENT', '2026-07-01', current_date - 2, current_date - 2, 120, 'aberto', 'PENDING')
    returning id into f;
  assert (select substituido_por from boletos_historico where id = e) = f, '(5) antes: a antiga substituida';
  update boletos_historico set situacao = 'pago', valor_pago = 120, data_pagamento = current_date - 1 where id = e;
  select situacao, substituido_por into rec from boletos_historico where id = e;
  assert rec.situacao = 'pago' and rec.substituido_por is null, format('(5) o pago vale: %s', row_to_json(rec));
  select situacao, substituido_por into rec from boletos_historico where id = f;
  assert rec.situacao = 'cancelado' and rec.substituido_por = e,
    format('(5) e a via nova sai da divida: %s', row_to_json(rec));

  -- (6) sem referencia: nao e tocado
  insert into boletos_historico (id_externo, cliente_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem)
    values ('4001', cli, 'MONTHLY_PAYMENT', '2026-09-01', current_date - 30, current_date - 30, 90, 'aberto', 'PENDING')
    returning id into s;
  select situacao, referencia_original into rec from boletos_historico where id = s;
  assert rec.situacao = 'aberto' and rec.referencia_original is null, '(6) sem referencia segue como veio';

  -- O recalculo da base inteira e estavel (nada muda numa segunda passada).
  assert recalcular_substituicoes_boletos(null) = 0, 'recalculo estavel';

  raise notice '=== 0140 boleto do Mutual substituido: TODOS OS TESTES PASSARAM ===';
end $$;
