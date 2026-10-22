-- Teste funcional da REGUA DE COBRANCA (0139). Prova: (1) os prazos e a ordem
-- deles; (2) o bloqueio da 24h conta o boleto do MUTUAL e respeita o prazo;
-- (3) a rotina move so quem e cobrado pelo SCar (vence -> inadimplente, passou
-- do prazo -> inativo, pagou -> ativo) e nunca o migrado; (4) a fila tira os
-- "a inativar" e ordena por prioridade e menor atraso; (5) a carteira e os
-- inativados no periodo (o acervo que entrou inativo nao conta).
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; tv uuid;
  c_mut uuid; c_scar uuid; c_velho uuid; c_novo uuid; c_acervo uuid;
  v_mut uuid; v_scar uuid; v_velho uuid; v_novo uuid; v_acervo uuid;
  t_scar uuid;
  rec record; n bigint; ok boolean; txt text;
begin
  insert into auth.users (id, email) values (u_adm, 'adm139@t.com');
  insert into regionais (nome) values ('Unidade 139') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm, 'Admin', 'adm139@t.com', 'admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  insert into empresa (razao_social) values ('SMART CAR 139');

  -- ===================================================== (1) parametros
  select * into rec from regua_cobranca();
  assert rec.dias_bloqueio = 1 and rec.dias_revistoria = 5 and rec.dias_inativacao = 20,
    format('padroes: %s', row_to_json(rec));
  ok := false;
  begin update empresa set dias_bloqueio_inadimplencia = 25; exception when check_violation then ok := true; end;
  assert ok, 'bloqueio depois da inativacao e recusado';
  ok := false;
  begin update empresa set dias_revistoria_boleto = 20; exception when check_violation then ok := true; end;
  assert ok, 'revistoria igual ou depois da inativacao e recusada';
  update empresa set dias_revistoria_boleto = 9;   -- "sem vistoria ate 9, exige a partir de 10"

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'MIGRADO DEVEDOR', '52998224725', r1) returning id into c_mut;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'COBRADO NO SCAR', '11144477735', r1) returning id into c_scar;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'ATRASO ANTIGO', '15350946056', r1) returning id into c_velho;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'ATRASO RECENTE', '39053344705', r1) returning id into c_novo;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'ACERVO INATIVO', '12345678909', r1) returning id into c_acervo;

  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa)
    values (c_mut, 'AAA1A11', r1, tv, 'ativo', current_date - 400, 100, true) returning id into v_mut;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa)
    values (c_scar, 'BBB2B22', r1, tv, 'ativo', current_date - 400, 100, false) returning id into v_scar;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa)
    values (c_velho, 'CCC3C33', r1, tv, 'ativo', current_date - 400, 100, true) returning id into v_velho;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa)
    values (c_novo, 'DDD4D44', r1, tv, 'ativo', current_date - 400, 100, true) returning id into v_novo;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa)
    values (c_acervo, 'EEE5E55', r1, tv, 'inativo', current_date - 400, 100, true) returning id into v_acervo;

  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem) values
    ('m1', c_mut, v_mut, 'MONTHLY_PAYMENT', current_date - 3, current_date - 3, 120, 'aberto', 'OVERDUE'),
    ('m2', c_velho, null, 'MONTHLY_PAYMENT', current_date - 45, current_date - 45, 90, 'aberto', 'OVERDUE'),
    ('m3', c_novo, v_novo, 'MONTHLY_PAYMENT', current_date - 6, current_date - 6, 80, 'aberto', 'OVERDUE');

  -- ===================================================== (2) a trava da 24h
  select * into rec from vencidos_veiculo(v_mut, 1);
  assert rec.boletos = 1 and rec.valor = 120 and rec.dias = 3, format('mutual: %s', row_to_json(rec));
  select * into rec from vencidos_veiculo(v_velho, 1);
  assert rec.boletos = 1 and rec.dias = 45, 'boleto do Mutual sem veiculo vale para o veiculo do associado';

  select * into rec from situacao_assistencia_veiculo(v_mut);
  assert not rec.pode_acionar and rec.titulos_vencidos = 1,
    format('o boleto do Mutual vencido bloqueia a 24h: %s', row_to_json(rec));
  txt := array_to_string(rec.motivos, ' | ');
  assert txt like '%atraso%' and txt not ilike '%limite%', format('motivo legivel pela tela: %s', txt);

  update empresa set dias_bloqueio_inadimplencia = 5;
  select * into rec from situacao_assistencia_veiculo(v_mut);
  assert rec.pode_acionar, '3 dias de atraso com bloqueio a partir de 5: libera';
  update empresa set dias_bloqueio_inadimplencia = 1;

  -- ===================================================== (3) a rotina
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (c_scar, v_scar, 150, current_date - 2, 'pendente') returning id into t_scar;

  select * into rec from rotina_regua_cobranca();
  assert rec.para_inadimplente = 1 and rec.inativados = 0, format('rotina 1: %s', row_to_json(rec));
  assert (select status::text from veiculos where id = v_scar) = 'inadimplente', 'cobrado pelo SCar vira inadimplente';
  assert (select status_motivo from veiculos where id = v_scar) like 'Regua de cobranca:%', 'com o motivo';
  assert (select status::text from veiculos where id = v_mut) = 'ativo', 'o migrado nunca e tocado';
  assert (select status::text from veiculos where id = v_velho) = 'ativo', 'nem com 45 dias';

  update titulos_financeiros set data_vencimento = current_date - 25 where id = t_scar;
  select * into rec from rotina_regua_cobranca();
  assert rec.inativados = 1, format('rotina 2: %s', row_to_json(rec));
  assert (select status::text from veiculos where id = v_scar) = 'inativo', 'passou do prazo: inativo';
  assert (select data_saida from veiculos where id = v_scar) = current_date, 'com a data de saida';

  -- volta: pagou (simula reativacao manual + rotina)
  update veiculos set status = 'inadimplente' where id = v_scar;
  update titulos_financeiros set status = 'pago', data_pagamento = current_date where id = t_scar;
  select * into rec from rotina_regua_cobranca();
  assert rec.para_ativo = 1 and (select status::text from veiculos where id = v_scar) = 'ativo', 'pagou: ativo';

  -- ===================================================== (4) a fila
  select count(*) into n from cobranca_fila_base(null) where situacao_fila = 'a_inativar';
  assert n = 1, format('so o de 45 dias e "a inativar": %s', n);
  select count(*) into n from cobranca_fila(null, null, null, null, 100, 0);
  assert n = 2, format('a fila de trabalho tem os 2 dentro do prazo: %s', n);
  select count(*) into n from cobranca_fila(null, 'a_inativar', null, null, 100, 0);
  assert n = 1, 'e os "a inativar" aparecem quando pedidos';
  select associado into txt from cobranca_fila(null, null, null, null, 1, 0);
  assert txt = 'MIGRADO DEVEDOR', format('mesma prioridade: o menor atraso primeiro (%s)', txt);
  select associado into txt from cobranca_fila(null, null, null, null, 1, 0, 'atraso_desc');
  assert txt = 'ATRASO RECENTE', format('ordem por maior atraso: %s', txt);
  select sum(clientes) into n from cobranca_fila_resumo(null) where grupo = 'faixa';
  assert n = 2, 'as faixas nao contam os "a inativar"';

  -- ===================================================== (5) carteira e inativados
  select * into rec from cobranca_carteira(null);
  assert rec.clientes_a_inativar = 1 and rec.valor_a_inativar = 90, format('a inativar: %s', row_to_json(rec));
  assert rec.clientes_inadimplentes = 2 and rec.valor_vencido = 200, format('inadimplentes: %s', row_to_json(rec));
  assert rec.clientes_ativos = 3, format('ativos sem o a inativar: %s', rec.clientes_ativos);

  update veiculos set status = 'inativo' where id = v_novo;
  update veiculos set created_at = now() - interval '30 days' where id = v_novo;
  select * into rec from cobranca_inativados(current_date - 30, current_date, null);
  assert rec.veiculos = 1, format('so quem saiu depois de entrar; o acervo nao: %s', row_to_json(rec));

  raise notice '=== 0139 regua de cobranca: TODOS OS TESTES PASSARAM ===';
end $$;
