-- Teste funcional: o vendedor nao alcanca o teto da franquia (0039)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  u_v1  uuid := gen_random_uuid();
  r1 uuid; r2 uuid; v1 uuid; v2 uuid;
  n int; v_txt text; rec record;
begin
  insert into auth.users (id, email) values (u_adm,'adm@t.com'), (u_ges,'ges@t.com'), (u_v1,'v1@t.com');
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('Smart FML', 1.0, 0.15) returning id into r1;
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('Gabriela Cuiaba', 1.0, 0.10) returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm@t.com','admin', null),
    (u_ges,'Gestor','ges@t.com','gestor_regional', r1),
    (u_v1,'Amanda','v1@t.com','consultor_vendas', r1);

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into vendedores (usuario_id, nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente)
    values (u_v1,'Amanda Hilario', r1, 1.0, 0.05) returning id into v1;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('Bruno Cuiaba', r2, 1.0, 0.04) returning id into v2;

  -- ------------------------------------------------ o teto sumiu da assinatura
  select pg_get_function_result(p.oid) into v_txt
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'vendedor_perfil';
  assert v_txt not ilike '%teto%',
    'vendedor_perfil nao pode devolver o teto da franquia: ' || v_txt;
  assert v_txt ilike '%taxa_adesao%' and v_txt ilike '%taxa_recorrente%',
    'a comissao do proprio vendedor tem de continuar';
  raise notice 'OK o portal do vendedor nao expoe o teto da franquia';

  -- o perfil segue respondendo (e so ao dono)
  perform set_config('request.jwt.claim.sub', u_v1::text, false);
  select * into rec from vendedor_perfil();
  assert rec.id = v1, 'perfil do proprio vendedor';
  assert rec.taxa_recorrente = 0.05, 'a propria comissao, veio ' || rec.taxa_recorrente;

  -- ------------------------------------------------ a franquia cadastra a equipe
  -- O gestor precisa enxergar a propria equipe (e so ela) para cadastrar e
  -- editar vendedor de dentro do portal.
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  select count(*) into n from listar_vendedores();
  assert n = 1, 'gestor lista so a equipe da propria unidade, veio ' || n;
  select count(*) into n from listar_vendedores(r2);
  assert n = 0, 'nem pedindo a outra franquia, veio ' || n;

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select count(*) into n from listar_vendedores();
  assert n = 2, 'admin continua vendo todos, veio ' || n;
  raise notice 'OK gestor administra so a propria equipe; admin ve tudo';

  raise notice '=== TESTES 0039 (vendedor sem teto) PASSARAM ===';
end $$;
