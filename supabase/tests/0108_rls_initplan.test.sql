-- Teste funcional da 0108: as policies reescritas com `(select f())` dizem
-- EXATAMENTE o mesmo que as de antes — matriz ve tudo, gestor ve so a unidade
-- dele, o associado ve so o que e dele, e ninguem grava na unidade vizinha.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  u_ina uuid := gen_random_uuid();
  u_ass uuid := gen_random_uuid();
  r_a uuid; r_b uuid; tv uuid;
  c_a uuid; c_b uuid;
  n bigint;
begin
  insert into auth.users (id, email) values
    (u_adm,'adm108@t.com'), (u_ges,'ges108@t.com'), (u_ina,'ina108@t.com'), (u_ass,'ass108@t.com');
  insert into regionais (nome) values ('Unidade A 108') returning id into r_a;
  insert into regionais (nome) values ('Unidade B 108') returning id into r_b;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm108@t.com','admin', null),
    (u_ges,'Gestor A','ges108@t.com','gestor_regional', r_a);
  insert into usuarios (id, nome, email, papel, regional_id, ativo) values
    (u_ina,'Gestor Inativo','ina108@t.com','gestor_regional', r_a, false);

  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, auth_user_id)
    values ('PF','Joao A','52998224725', r_a, u_ass) returning id into c_a;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Maria B','11144477735', r_b) returning id into c_b;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao)
    values (c_a,'RLS1A08', r_a, tv, 'ativo', current_date - 5),
           (c_b,'RLS1B08', r_b, tv, 'ativo', current_date - 5);
  insert into eventos_historico (id_externo, cliente_id) values ('E108A', c_a), ('E108B', c_b);

  -- ---------------------------------------------------------- matriz: tudo
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  execute 'set local role authenticated';
  select count(*) into n from veiculos where placa in ('RLS1A08','RLS1B08');
  execute 'reset role';
  assert n = 2, 'a matriz tem de ver as duas unidades, viu ' || n;
  execute 'set local role authenticated';
  select count(*) into n from eventos_historico where id_externo in ('E108A','E108B');
  execute 'reset role';
  assert n = 2, 'a matriz tem de ver o historico das duas unidades, viu ' || n;
  raise notice 'OK a matriz ve tudo';

  -- ---------------------------------------------- gestor: so a unidade dele
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  execute 'set local role authenticated';
  select count(*) into n from veiculos where placa in ('RLS1A08','RLS1B08');
  execute 'reset role';
  assert n = 1, 'o gestor tem de ver so a unidade dele, viu ' || n;
  execute 'set local role authenticated';
  select count(*) into n from clientes where id in (c_a, c_b);
  execute 'reset role';
  assert n = 1, 'o gestor tem de ver so os associados dele, viu ' || n;
  execute 'set local role authenticated';
  select count(*) into n from eventos_historico where id_externo in ('E108A','E108B');
  execute 'reset role';
  assert n = 1, 'o gestor tem de ver so o historico da unidade dele, viu ' || n;

  execute 'set local role authenticated';
  execute format('update clientes set nome_razao_social = %L where id = %L', 'MARIA B', c_b);
  get diagnostics n = row_count;
  execute 'reset role';
  assert n = 0, 'o gestor nao pode alterar associado da unidade vizinha, linhas: ' || n;

  execute 'set local role authenticated';
  execute format('update veiculos set cor = cor where placa = %L', 'RLS1B08');
  get diagnostics n = row_count;
  execute 'reset role';
  assert n = 0, 'o gestor nao pode alterar veiculo da unidade vizinha, linhas: ' || n;
  raise notice 'OK o gestor ve e grava so na unidade dele';

  -- ------------------------------------------- inativo: nada (0068 mantida)
  perform set_config('request.jwt.claim.sub', u_ina::text, false);
  execute 'set local role authenticated';
  select count(*) into n from veiculos where placa in ('RLS1A08','RLS1B08');
  execute 'reset role';
  assert n = 0, 'usuario INATIVO nao pode ver nada, viu ' || n;
  raise notice 'OK usuario inativo segue sem acesso';

  -- ----------------------------------------- associado: so o que e dele
  perform set_config('request.jwt.claim.sub', u_ass::text, false);
  execute 'set local role authenticated';
  select count(*) into n from veiculos where placa in ('RLS1A08','RLS1B08');
  execute 'reset role';
  assert n = 1, 'o associado tem de ver so o proprio veiculo, viu ' || n;
  execute 'set local role authenticated';
  select count(*) into n from clientes where id in (c_a, c_b);
  execute 'reset role';
  assert n = 1, 'o associado tem de ver so o proprio cadastro, viu ' || n;
  execute 'set local role authenticated';
  select count(*) into n from eventos_historico where id_externo in ('E108A','E108B');
  execute 'reset role';
  assert n = 1, 'o associado tem de ver so o proprio historico, viu ' || n;
  raise notice 'OK o associado ve so o que e dele';

  -- ------------------------- a policy de veiculos nao chama mais funcao por linha
  assert (select qual from pg_policies where tablename = 'veiculos' and policyname = 'veiculos_select')
         not like '%pode_regional%', 'veiculos_select ainda chama pode_regional por linha';

  perform set_config('request.jwt.claim.sub', '', false);
  raise notice '=== TESTES DA 0108 PASSARAM ===';
end $$;
