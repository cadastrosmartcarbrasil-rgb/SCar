-- Teste da 0127: o time de eventos ve as unidades de atuacao marcadas; os
-- demais papeis tambem a seguem desde a 0131.
\set ON_ERROR_STOP on
do $$
declare
  u_ev  uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  r_a uuid; r_b uuid; c_a uuid; c_b uuid;
  n bigint;
begin
  insert into auth.users (id, email) values (u_ev,'ev127@t.com'), (u_con,'con127@t.com');
  insert into regionais (nome) values ('Unidade A 127') returning id into r_a;
  insert into regionais (nome) values ('Unidade B 127') returning id into r_b;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_ev,'Eventos','ev127@t.com','sinistro', null),
    (u_con,'Consultor','con127@t.com','consultor_vendas', null);
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Joao A 127','52998224725', r_a) returning id into c_a;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Maria B 127','11144477735', r_b) returning id into c_b;

  -- sem unidade: nada (o defeito relatado)
  perform set_config('request.jwt.claim.sub', u_ev::text, false);
  execute 'set local role authenticated';
  select count(*) into n from clientes where id in (c_a, c_b);
  execute 'reset role';
  assert n = 0, 'sem unidade de atuacao o time de eventos nao ve ninguem, viu ' || n;

  -- marcada a unidade A: ve A, nao B; pode tratar evento de A
  insert into supervisor_regionais (usuario_id, regional_id) values (u_ev, r_a), (u_con, r_a);
  execute 'set local role authenticated';
  select count(*) into n from clientes where id in (c_a, c_b);
  assert n = 1, 'eventos com a unidade A ve 1 associado, viu ' || n;
  assert exists (select 1 from clientes where id = c_a), 'tem de ver o associado da unidade A';
  assert pode_tratar_evento(r_a), 'eventos trata evento da unidade marcada';
  assert not pode_tratar_evento(r_b), 'eventos nao trata evento de unidade nao marcada';
  execute 'reset role';
  raise notice 'OK eventos ve e trata as unidades de atuacao';

  -- desde a 0131 as unidades de atuacao valem para qualquer papel
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  execute 'set local role authenticated';
  select count(*) into n from clientes where id in (c_a, c_b);
  execute 'reset role';
  assert n = 1, 'consultor com a unidade A marcada ve 1 associado (0131), viu ' || n;
  raise notice 'OK os demais papeis seguem a unidade de atuacao (0131)';

  raise notice '=== TESTES 0127 PASSARAM ===';
end $$;
