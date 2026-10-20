-- Teste funcional da 0115: o supervisor ve e opera o cadastro das unidades de
-- supervisor_regionais (e so delas); gestor e associado seguem como antes.
\set ON_ERROR_STOP on
do $$
declare
  u_sup uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  r_a uuid; r_b uuid; r_c uuid; tv uuid;
  c_a uuid; c_b uuid; c_c uuid;
  n bigint;
begin
  insert into auth.users (id, email) values
    (u_sup,'sup115@t.com'), (u_ges,'ges115@t.com'), (u_con,'con115@t.com');
  insert into regionais (nome) values ('Unidade A 115') returning id into r_a;
  insert into regionais (nome) values ('Unidade B 115') returning id into r_b;
  insert into regionais (nome) values ('Unidade C 115') returning id into r_c;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_sup,'Supervisor','sup115@t.com','supervisor', null),
    (u_ges,'Gestor A','ges115@t.com','gestor_regional', r_a),
    (u_con,'Consultor sem unidade','con115@t.com','consultor_vendas', null);
  insert into supervisor_regionais (usuario_id, regional_id) values (u_sup, r_a), (u_sup, r_b);
  -- consultor com linha em supervisor_regionais: desde a 0131 ganha a unidade r_c
  insert into supervisor_regionais (usuario_id, regional_id) values (u_con, r_c);

  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Joao A','52998224725', r_a) returning id into c_a;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Maria B','11144477735', r_b) returning id into c_b;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Ana C','39053344705', r_c) returning id into c_c;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao)
    values (c_a,'SUP1A15', r_a, tv, 'ativo', current_date - 5),
           (c_b,'SUP1B15', r_b, tv, 'ativo', current_date - 5),
           (c_c,'SUP1C15', r_c, tv, 'ativo', current_date - 5);

  -- ------------------------------------------- supervisor: as duas dele
  perform set_config('request.jwt.claim.sub', u_sup::text, false);
  execute 'set local role authenticated';
  select count(*) into n from veiculos where placa like 'SUP1%15';
  execute 'reset role';
  assert n = 2, 'o supervisor tem de ver as 2 unidades dele, viu ' || n;
  execute 'set local role authenticated';
  select count(*) into n from clientes where id in (c_a, c_b, c_c);
  execute 'reset role';
  assert n = 2, 'o supervisor tem de ver os associados das 2 unidades, viu ' || n;
  execute 'set local role authenticated';
  select count(*) into n from regionais where id in (r_a, r_b, r_c);
  execute 'reset role';
  assert n = 2, 'o supervisor tem de ver o nome das 2 unidades, viu ' || n;
  execute 'set local role authenticated';
  execute format('update veiculos set cor = cor where placa = %L', 'SUP1B15');
  get diagnostics n = row_count;
  execute 'reset role';
  assert n = 1, 'o supervisor opera veiculo da unidade dele';
  execute 'set local role authenticated';
  execute format('update veiculos set cor = cor where placa = %L', 'SUP1C15');
  get diagnostics n = row_count;
  execute 'reset role';
  assert n = 0, 'o supervisor NAO opera unidade fora da lista';

  execute 'set local role authenticated';
  assert pode_regional(r_b) and not pode_regional(r_c), 'pode_regional segue a lista';
  assert escopo_regional(r_b) = r_b, 'escopo devolve a unidade pedida quando e dele';
  assert escopo_regional(r_c) in (r_a, r_b), 'escopo nao devolve unidade de fora';
  execute 'reset role';
  raise notice 'OK o supervisor ve e opera so as unidades dele';

  -- ------------------------------------------- gestor: nada muda
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  execute 'set local role authenticated';
  select count(*) into n from veiculos where placa like 'SUP1%15';
  assert escopo_regional(r_b) = r_a, 'gestor segue preso a propria unidade';
  execute 'reset role';
  assert n = 1, 'o gestor ve so a unidade dele, viu ' || n;

  -- ------------------------------------------- outro papel com linha: desde a 0131 ve a unidade marcada
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  execute 'set local role authenticated';
  select count(*) into n from veiculos where placa like 'SUP1%15';
  execute 'reset role';
  assert n = 1, 'desde a 0131 o consultor ve a unidade de atuacao marcada (r_c), viu ' || n;

  -- ------------------------------------------- supervisor inativo: nada
  perform set_config('request.jwt.claim.sub', '', false);
  update usuarios set ativo = false where id = u_sup;
  perform set_config('request.jwt.claim.sub', u_sup::text, false);
  execute 'set local role authenticated';
  select count(*) into n from veiculos where placa like 'SUP1%15';
  execute 'reset role';
  assert n = 0, 'supervisor inativo nao ve nada, viu ' || n;

  perform set_config('request.jwt.claim.sub', '', false);
  raise notice '=== TESTES DA 0115 PASSARAM ===';
end $$;
