-- Teste da 0131: unidades de atuacao valem para qualquer papel sem acesso
-- global; a carteira de leads do consultor continua so dele; inativo nao ve nada.
\set ON_ERROR_STOP on
do $$
declare
  u_con uuid := gen_random_uuid();
  u_out uuid := gen_random_uuid();
  u_adm uuid := gen_random_uuid();
  r_a uuid; r_b uuid; c_a uuid; c_b uuid; l_a uuid;
  n bigint;
begin
  insert into auth.users (id, email) values
    (u_con,'con131@t.com'), (u_out,'out131@t.com'), (u_adm,'adm131@t.com');
  insert into regionais (nome) values ('Unidade A 131') returning id into r_a;
  insert into regionais (nome) values ('Unidade B 131') returning id into r_b;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_con,'Rastreio','con131@t.com','consultor_vendas', null),
    (u_out,'Outro','out131@t.com','consultor_vendas', r_a),
    (u_adm,'Admin','adm131@t.com','admin', null);
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Joao A 131','52998224725', r_a) returning id into c_a;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Maria B 131','11144477735', r_b) returning id into c_b;
  insert into leads (nome, celular, regional_id, consultor_id, status)
    values ('Lead alheio 131', '84999990000', r_a, u_out, 'NOVO') returning id into l_a;

  -- sem unidade e sem atuacao: nada (o defeito relatado)
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  execute 'set local role authenticated';
  select count(*) into n from clientes where id in (c_a, c_b);
  execute 'reset role';
  assert n = 0, 'sem unidade nao ve ninguem, viu ' || n;

  -- marcadas as duas unidades: ve os dois associados
  insert into supervisor_regionais (usuario_id, regional_id) values (u_con, r_a), (u_con, r_b);
  execute 'set local role authenticated';
  select count(*) into n from clientes where id in (c_a, c_b);
  assert n = 2, 'com as unidades de atuacao ve os 2 associados, viu ' || n;
  -- mas o lead de outro consultor continua fora
  select count(*) into n from leads where id = l_a;
  assert n = 0, 'consultor nao ve lead alheio pela unidade de atuacao, viu ' || n;
  execute 'reset role';
  raise notice 'OK atuacao vale para consultor; leads seguem so dele';

  -- inativo: nada
  perform set_config('request.jwt.claim.sub', '', false);
  update usuarios set ativo = false where id = u_con;
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  execute 'set local role authenticated';
  select count(*) into n from clientes where id in (c_a, c_b);
  execute 'reset role';
  assert n = 0, 'inativo nao ve nada, viu ' || n;
  perform set_config('request.jwt.claim.sub', '', false);
  update usuarios set ativo = true where id = u_con;

  -- a lista de usuarios conta as unidades de atuacao
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  execute 'set local role authenticated';
  select unidades_atuacao into n from usuarios_listar(true) where id = u_con;
  execute 'reset role';
  assert n = 2, 'usuarios_listar devolve 2 unidades de atuacao, veio ' || coalesce(n, -1);
  raise notice 'OK usuarios_listar com unidades_atuacao';

  raise notice '=== TESTES 0131 PASSARAM ===';
end $$;
