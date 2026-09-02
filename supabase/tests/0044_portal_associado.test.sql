-- Teste funcional do Portal do Associado (0044)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_c1  uuid := gen_random_uuid();
  u_c2  uuid := gen_random_uuid();
  r1 uuid; c1 uuid; c2 uuid; ve1 uuid; ve2 uuid; ve_outro uuid;
  t_pago uuid; t_vencido uuid; t_avencer uuid; t_outro uuid; cart uuid;
  n int; rec record; v_num numeric;
begin
  insert into auth.users (id, email) values
    (u_adm,'adm@t.com'), (u_c1,'c1@t.com'), (u_c2,'c2@t.com');
  insert into regionais (nome) values ('Smart FML') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm@t.com','admin', null);

  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  insert into clientes (auth_user_id, tipo_pessoa, nome_razao_social, cpf_cnpj, email,
                        telefone, regional_id, status, portal_senha_provisoria)
    values (u_c1,'PF','Carlos Associado','11144477735','carlos@t.com','11977772222', r1,'ativo', true)
    returning id into c1;
  insert into clientes (auth_user_id, tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, status)
    values (u_c2,'PF','Outro Associado','52998224725', r1,'ativo') returning id into c2;

  insert into veiculos (cliente_id, placa, regional_id, status, data_ativacao)
    values (c1,'AAA1A11', r1,'ativo', current_date - 200) returning id into ve1;
  insert into veiculos (cliente_id, placa, regional_id, status, data_ativacao)
    values (c1,'BBB2B22', r1,'suspenso', current_date - 100) returning id into ve2;
  insert into veiculos (cliente_id, placa, regional_id, status)
    values (c2,'ZZZ9Z99', r1,'ativo') returning id into ve_outro;

  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status,
                                   valor_pago, data_pagamento, linha_digitavel)
    values (c1, ve1, 150, current_date - 60, 'pago', 150, current_date - 58, '34191...')
    returning id into t_pago;
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status,
                                   linha_digitavel)
    values (c1, ve1, 150, current_date - 10, 'pendente', '34191abc') returning id into t_vencido;
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (c1, ve1, 150, current_date + 20, 'pendente') returning id into t_avencer;
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (c2, ve_outro, 999, current_date + 5, 'pendente') returning id into t_outro;

  -- ============================================================ perfil
  perform set_config('request.jwt.claim.sub', u_c1::text, false);
  select * into rec from portal_perfil();
  assert rec.cliente_id = c1, 'o portal resolve o associado pelo login';
  assert rec.nome = 'Carlos Associado', 'nome do associado';
  assert rec.senha_provisoria, 'primeiro acesso comeca com senha provisoria';
  assert rec.veiculos_ativos = 1, 'so conta veiculo ativo, veio ' || rec.veiculos_ativos;
  raise notice 'OK perfil sai do login, sem parametro de cliente';

  -- ============================================================ frota
  select count(*) into n from portal_veiculos();
  assert n = 2, 'a frota do associado, veio ' || n;
  select placa into rec from portal_veiculos() limit 1;
  assert rec.placa = 'AAA1A11', 'ativo vem primeiro (ordem padrao), veio ' || rec.placa;

  select count(*) into n from portal_veiculos() where placa = 'ZZZ9Z99';
  assert n = 0, 'veiculo de outro associado nao aparece';
  raise notice 'OK frota do proprio associado, na ordenacao padrao';

  -- ============================================================ financeiro
  -- TODOS os boletos: pago, vencido e a vencer
  select count(*) into n from portal_titulos();
  assert n = 3, 'o historico inteiro, inclusive pagos e a vencer, veio ' || n;
  select count(*) into n from portal_titulos() where id = t_outro;
  assert n = 0, 'boleto de outro associado nao vaza';

  select situacao into rec from portal_titulos() where id = t_vencido;
  assert rec.situacao = 'vencido', 'pendente com vencimento passado ja e vencido, veio ' || rec.situacao;
  select situacao into rec from portal_titulos() where id = t_avencer;
  -- `status_cobranca_efetivo` (0025) e a mesma fonte do modulo Cobranca:
  -- 'aberto' para o que ainda vai vencer.
  assert rec.situacao = 'aberto', 'a vencer fica aberto, veio ' || rec.situacao;

  select * into rec from portal_financeiro();
  assert rec.em_aberto = 300, 'em aberto = vencido + a vencer, veio ' || rec.em_aberto;
  assert rec.vencido = 150, 'so o vencido, veio ' || rec.vencido;
  assert rec.qtd_vencidos = 1, 'quantidade de vencidos';
  assert rec.proximo_vencimento = current_date + 20, 'proximo vencimento';
  assert rec.pago_12_meses = 150, 'pago nos ultimos 12 meses, veio ' || rec.pago_12_meses;
  assert not rec.em_dia, 'com boleto vencido o associado nao esta em dia';
  raise notice 'OK situacao financeira e a lista completa de boletos';

  -- ============================================================ 2a via
  select * into rec from portal_segunda_via(t_vencido);
  assert rec.disponivel, 'boleto com linha digitavel esta disponivel';
  assert rec.linha_digitavel = '34191abc', 'devolve a linha digitavel';

  select * into rec from portal_segunda_via(t_avencer);
  assert not rec.disponivel, 'sem linha digitavel ainda nao da para pagar';
  assert rec.aviso like '%gerado pelo banco%', 'e explica o porque, veio ' || coalesce(rec.aviso,'nulo');

  -- boleto de outro associado: nem existe para ele
  select count(*) into n from portal_segunda_via(t_outro);
  assert n = 0, '2a via de boleto alheio nao pode responder, veio ' || n;
  raise notice 'OK 2a via so do proprio boleto, sem inventar boleto que nao existe';

  -- ============================================================ cartao
  cart := portal_registrar_cartao('tok_abc123', 'VISA', '4321', 'CARLOS A SILVA', 12::smallint, 2030::smallint);
  select count(*) into n from portal_cartoes();
  assert n = 1, 'cartao registrado, veio ' || n;
  select bandeira, ultimos_digitos, principal into rec from portal_cartoes();
  assert rec.ultimos_digitos = '4321' and rec.bandeira = 'VISA', 'bandeira e 4 digitos';
  assert rec.principal, 'o primeiro cartao e o principal';

  -- o segundo vira principal e o primeiro deixa de ser (indice unico parcial)
  perform portal_registrar_cartao('tok_def456', 'MASTERCARD', '1111', 'CARLOS A SILVA');
  select count(*) into n from portal_cartoes() where principal;
  assert n = 1, 'so um cartao principal, veio ' || n;
  select ultimos_digitos into rec from portal_cartoes() where principal;
  assert rec.ultimos_digitos = '1111', 'o novo cartao vira o principal';

  -- sem token nao grava nada
  begin
    perform portal_registrar_cartao('   ', 'VISA', '0000');
    assert false, 'cartao sem token do gateway deveria ser recusado';
  exception when check_violation then null; end;

  perform portal_remover_cartao(cart);
  select count(*) into n from portal_cartoes();
  assert n = 1, 'removido some da lista, veio ' || n;
  raise notice 'OK cartao guarda so token/bandeira/4 digitos';

  -- ============================================================ ISOLAMENTO
  perform set_config('request.jwt.claim.sub', u_c2::text, false);
  select count(*) into n from portal_titulos();
  assert n = 1, 'o outro associado ve so o proprio boleto, veio ' || n;
  select count(*) into n from portal_cartoes();
  assert n = 0, 'e nao ve o cartao de ninguem, veio ' || n;
  select count(*) into n from portal_veiculos();
  assert n = 1, 'nem a frota alheia, veio ' || n;

  -- a RLS tambem segura o caminho direto na tabela
  execute 'set local role authenticated';
  select count(*) into n from cartoes_cobranca;
  execute 'reset role';
  assert n = 0, 'RLS: cartao de outro associado nao e legivel, veio ' || n;
  raise notice 'OK um associado nunca alcanca os dados do outro';

  -- ============================================================ senha provisoria
  perform set_config('request.jwt.claim.sub', u_c1::text, false);
  perform portal_registrar_acesso();
  select portal_primeiro_acesso_em into rec from clientes where id = c1;
  assert rec.portal_primeiro_acesso_em is not null, 'o primeiro acesso fica carimbado';

  perform portal_senha_trocada();
  select * into rec from portal_perfil();
  assert not rec.senha_provisoria, 'depois da troca a senha deixa de ser provisoria';
  select portal_senha_alterada_em into rec from clientes where id = c1;
  assert rec.portal_senha_alterada_em is not null, 'e a data da troca fica registrada';
  raise notice 'OK primeiro acesso exige a troca da senha e ela fica registrada';

  -- ============================================================ perfil editavel
  perform portal_atualizar_perfil('novo@t.com', '(11) 98888-7777',
    '{"cep":"01310100","cidade":"Sao Paulo","uf":"SP"}'::jsonb);
  select email, telefone, nome_razao_social, cpf_cnpj into rec from clientes where id = c1;
  assert rec.email = 'novo@t.com', 'e-mail atualizado';
  assert rec.telefone = '(11) 98888-7777', 'telefone atualizado';
  assert rec.nome_razao_social = 'Carlos Associado', 'o nome NAO muda pelo portal';
  assert rec.cpf_cnpj = '11144477735', 'o CPF NAO muda pelo portal';
  raise notice 'OK o associado edita contato, nunca nome nem documento';

  raise notice '=== TESTES 0044 (portal do associado) PASSARAM ===';
end $$;
