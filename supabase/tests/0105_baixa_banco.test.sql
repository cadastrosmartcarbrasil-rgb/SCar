-- Teste da 0105: baixa bancaria por liquidados/dia.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  i_sb uuid; i_prod uuid;
  c uuid;
  t_sb uuid; t_prod uuid; t_canc uuid; t_seu uuid;
  r record;
  n int;
begin
  insert into auth.users (id, email) values (u_adm, 'adm105@t.com'), (u_con, 'con105@t.com');
  insert into usuarios (id, nome, email, papel) values
    (u_adm, 'Admin', 'adm105@t.com', 'admin'),
    (u_con, 'Consultor', 'con105@t.com', 'consultor_vendas');

  insert into integracoes_bancarias (nome, provedor, ambiente, is_padrao, ativo)
    values ('Sicredi SB', 'SICREDI', 'sandbox', false, true) returning id into i_sb;
  insert into integracoes_bancarias (nome, provedor, ambiente, is_padrao, ativo)
    values ('Sicredi PROD', 'SICREDI', 'producao', false, true) returning id into i_prod;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj)
    values ('PF', 'PAGADOR 105', '35169335695') returning id into c;

  -- mesmo nosso numero nos dois ambientes (o sandbox e mock)
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status, nosso_numero, integracao_id)
    values (c, 100, current_date, 'pendente', '211001292', i_sb) returning id into t_sb;
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status, nosso_numero, integracao_id)
    values (c, 200, current_date, 'vencido', '211001292', i_prod) returning id into t_prod;
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status, nosso_numero, integracao_id)
    values (c, 50, current_date, 'cancelado', '999', i_prod) returning id into t_canc;
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status, nosso_numero, integracao_id)
    values (c, 70, current_date, 'pendente', null, i_prod) returning id into t_seu;

  -- Sem sessao (rotina do servidor): baixa o titulo de PRODUCAO, nao o do sandbox.
  perform set_config('request.jwt.claim.sub', '', false);
  select * into r from registrar_liquidacao_banco('SICREDI', 'producao', '211001292', null,
    current_date, 203.50, current_date, '{"x":1}'::jsonb);
  assert r.situacao = 'BAIXADO', 'deveria baixar: ' || r.situacao;
  assert r.titulo_id = t_prod;
  assert r.valor_divergente, 'juros: valor diferente deve ser marcado';
  assert (select status from titulos_financeiros where id = t_prod) = 'pago';
  assert (select valor_pago from titulos_financeiros where id = t_prod) = 203.50;
  assert (select data_pagamento from titulos_financeiros where id = t_prod) = current_date;
  assert (select status from titulos_financeiros where id = t_sb) = 'pendente',
    'o titulo do sandbox com o mesmo nosso numero NAO pode ser baixado';

  -- Re-executar: nada duplica e a trilha continua BAIXADO.
  select * into r from registrar_liquidacao_banco('SICREDI', 'producao', '211001292', null,
    current_date, 203.50, current_date, null);
  assert r.situacao = 'BAIXADO', 'releitura nao rebaixa a trilha: ' || r.situacao;
  select count(*) into n from cobranca_liquidacoes where nosso_numero = '211001292' and ambiente = 'producao';
  assert n = 1;

  -- Cancelado nao reabre.
  select * into r from registrar_liquidacao_banco('SICREDI', 'producao', '999', null,
    current_date, 50, current_date, null);
  assert r.situacao = 'TITULO_CANCELADO';
  assert (select status from titulos_financeiros where id = t_canc) = 'cancelado';

  -- Desconhecido fica na trilha.
  select * into r from registrar_liquidacao_banco('SICREDI', 'producao', '12345', null,
    current_date, 10, current_date, null);
  assert r.situacao = 'NAO_ENCONTRADO' and r.titulo_id is null;
  assert exists (select 1 from cobranca_liquidacoes where nosso_numero = '12345' and situacao = 'NAO_ENCONTRADO');

  -- Reserva pelo seuNumero (10 hex do id), unico candidato.
  select * into r from registrar_liquidacao_banco('SICREDI', 'producao', '777',
    upper(left(replace(t_seu::text, '-', ''), 10)), current_date, 70, current_date, null);
  assert r.situacao = 'BAIXADO' and r.titulo_id = t_seu, 'seuNumero deveria casar';
  assert not r.valor_divergente;

  -- Consultor logado nao registra baixa.
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  begin
    perform registrar_liquidacao_banco('SICREDI', 'sandbox', '211001292', null,
      current_date, 100, current_date, null);
    assert false, 'consultor nao deveria registrar baixa';
  exception when insufficient_privilege then null;
  end;
  assert (select status from titulos_financeiros where id = t_sb) = 'pendente';

  -- Admin pode (botao da tela).
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select * into r from registrar_liquidacao_banco('SICREDI', 'sandbox', '211001292', null,
    current_date, 100, current_date, null);
  assert r.situacao = 'BAIXADO' and r.titulo_id = t_sb;

  raise notice '=== TODOS OS TESTES DA 0105 PASSARAM ===';
end $$;
