-- Teste da 0128: o historico de eventos do Mutual mostra todas as unidades de atuacao.
\set ON_ERROR_STOP on
do $$
declare
  u_ev uuid := gen_random_uuid();
  r_a uuid; r_b uuid; r_c uuid; c_a uuid; c_b uuid; c_c uuid;
  n bigint;
begin
  insert into auth.users (id, email) values (u_ev,'ev128@t.com');
  insert into regionais (nome) values ('Unidade A 128') returning id into r_a;
  insert into regionais (nome) values ('Unidade B 128') returning id into r_b;
  insert into regionais (nome) values ('Unidade C 128') returning id into r_c;
  insert into usuarios (id, nome, email, papel, regional_id) values (u_ev,'Eventos','ev128@t.com','sinistro', null);
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id) values ('PF','Ana 128','52998224725', r_a) returning id into c_a;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id) values ('PF','Bia 128','11144477735', r_b) returning id into c_b;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id) values ('PF','Cid 128','39053344705', r_c) returning id into c_c;
  insert into eventos_historico (id_externo, cliente_id, data_evento) values
    ('a128', c_a, '2026-01-01'), ('b128', c_b, '2026-01-02'), ('c128', c_c, '2026-01-03');
  insert into supervisor_regionais (usuario_id, regional_id) values (u_ev, r_a), (u_ev, r_b);

  perform set_config('request.jwt.claim.sub', u_ev::text, false);
  execute 'set local role authenticated';
  select count(*) into n from eventos_historico_listar(p_limite := 200) where cliente_id in (c_a, c_b, c_c);
  assert n = 2, 'eventos com A e B marcadas ve 2 (antes via so 1), viu ' || n;
  select count(*) into n from eventos_historico_listar(p_regional_id := r_b, p_limite := 200) where cliente_id in (c_a, c_b, c_c);
  assert n = 1, 'filtrando B ve 1, viu ' || n;
  select count(*) into n from eventos_historico_listar(p_regional_id := r_c, p_limite := 200) where cliente_id in (c_a, c_b, c_c);
  assert n = 0, 'unidade nao marcada nao aparece nem pedindo, viu ' || n;
  execute 'reset role';
  raise notice 'OK historico respeita todas as unidades de atuacao';

  -- sem sessao (service_role) ve tudo
  perform set_config('request.jwt.claim.sub', '', false);
  select count(*) into n from eventos_historico_listar(p_limite := 200) where cliente_id in (c_a, c_b, c_c);
  assert n = 3, 'sem sessao ve as 3, viu ' || n;

  raise notice '=== TESTES 0128 PASSARAM ===';
end $$;
