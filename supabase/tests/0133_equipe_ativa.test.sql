-- Teste da 0133: equipe_ativa devolve os colegas ativos a qualquer staff,
-- sem expor inativos nem servir a quem nao e equipe.
\set ON_ERROR_STOP on
do $$
declare
  u_evt uuid := gen_random_uuid();
  u_col uuid := gen_random_uuid();
  u_ina uuid := gen_random_uuid();
  u_cli uuid := gen_random_uuid();
  n bigint;
begin
  insert into auth.users (id, email) values
    (u_evt,'evt133@t.com'), (u_col,'col133@t.com'), (u_ina,'ina133@t.com'), (u_cli,'cli133@t.com');
  insert into usuarios (id, nome, email, papel, regional_id, ativo) values
    (u_evt,'EVENTOS 133','evt133@t.com','sinistro', null, true),
    (u_col,'FINANCEIRO 133','col133@t.com','financeiro', null, true),
    (u_ina,'INATIVO 133','ina133@t.com','sinistro', null, false);

  -- pela tabela, o papel Eventos so ve a si mesmo (a policy nao mudou)
  perform set_config('request.jwt.claim.sub', u_evt::text, false);
  execute 'set local role authenticated';
  select count(*) into n from usuarios where id in (u_evt, u_col, u_ina);
  execute 'reset role';
  assert n = 1, 'tabela segue restrita: ' || n;

  -- pela funcao, ve os colegas ativos
  select count(*) into n from equipe_ativa() where id in (u_evt, u_col, u_ina);
  assert n = 2, 'equipe ativa (sem o inativo): ' || n;

  -- quem nao e staff nao ve ninguem
  perform set_config('request.jwt.claim.sub', u_cli::text, false);
  select count(*) into n from equipe_ativa();
  assert n = 0, 'nao-staff recebe vazio: ' || n;

  raise notice '=== TESTES 0133 (equipe ativa) PASSARAM ===';
end;
$$;
