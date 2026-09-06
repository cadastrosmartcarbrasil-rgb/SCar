-- Teste funcional: a equipe e editavel e o sistema nao fica sem admin (0054)
\set ON_ERROR_STOP on
do $$
declare
  u_adm1 uuid := gen_random_uuid();
  u_adm2 uuid := gen_random_uuid();
  u_ger  uuid := gen_random_uuid();
  r1 uuid; n int; txt text;
begin
  insert into auth.users (id, email) values (u_adm1,'a1@t.com'), (u_adm2,'a2@t.com'), (u_ger,'g@t.com');
  insert into regionais (nome) values ('Cuiaba') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm1,'Admin Um','a1@t.com','admin', null),
    (u_ger, 'Gestor',  'g@t.com', 'gestor_regional', r1);
  perform set_config('request.jwt.claim.sub', u_adm1::text, false);

  -- ------------------------------------------------- editar de verdade (admin)
  execute 'set local role authenticated';
  execute format('update usuarios set nome = %L, papel = %L, regional_id = %L where id = %L',
                 'Gestor Editado', 'financeiro', null, u_ger);
  get diagnostics n = row_count;
  execute 'reset role';
  assert n = 1, 'o admin tem de conseguir editar a equipe, linhas afetadas: ' || n;

  select nome || '/' || papel::text into txt from usuarios where id = u_ger;
  assert txt = 'Gestor Editado/financeiro', 'nome e papel gravados, veio ' || txt;
  raise notice 'OK o admin edita nome, papel e unidade da equipe';

  -- ------------------------------ ESCALADA DE PRIVILEGIO: promover a si mesmo
  -- A policy `usuarios_update_self` libera a propria linha e RLS nao restringe
  -- coluna — sem a trigger, isto virava administrador.
  perform set_config('request.jwt.claim.sub', u_ger::text, false);
  begin
    execute 'set local role authenticated';
    execute format('update usuarios set papel = %L where id = %L', 'admin', u_ger);
    execute 'reset role';
    assert false, 'usuario nao pode se promover a admin na propria linha';
  exception when others then
    execute 'reset role';
    assert sqlerrm like '%administrador%', 'mensagem inesperada: ' || sqlerrm;
  end;
  select papel::text into txt from usuarios where id = u_ger;
  assert txt = 'financeiro', 'o papel nao pode ter mudado, veio ' || txt;

  -- editar o proprio NOME continua liberado (e o cadastro dele)
  execute 'set local role authenticated';
  execute format('update usuarios set nome = %L where id = %L', 'Gestor Renomeado', u_ger);
  get diagnostics n = row_count;
  execute 'reset role';
  assert n = 1, 'a pessoa continua podendo corrigir o proprio nome';

  -- e mexer na linha de OUTRO usuario segue barrado pela RLS
  execute 'set local role authenticated';
  execute format('update usuarios set nome = %L where id = %L', 'Invadido', u_adm1);
  get diagnostics n = row_count;
  execute 'reset role';
  assert n = 0, 'nao-admin nao alcanca a linha de outro usuario, veio ' || n;
  raise notice 'OK ninguem se promove sozinho nem mexe no cadastro alheio';

  -- ------------------------------------------------- o ultimo admin e protegido
  perform set_config('request.jwt.claim.sub', u_adm1::text, false);
  begin
    update usuarios set papel = 'financeiro' where id = u_adm1;
    assert false, 'rebaixar o unico admin deveria falhar';
  exception when others then
    assert sqlerrm like '%unico administrador%', 'mensagem inesperada: ' || sqlerrm;
  end;

  begin
    update usuarios set ativo = false where id = u_adm1;
    assert false, 'desativar o unico admin deveria falhar';
  exception when others then
    assert sqlerrm like '%unico administrador%', 'mensagem inesperada: ' || sqlerrm;
  end;

  begin
    delete from usuarios where id = u_adm1;
    assert false, 'apagar o unico admin deveria falhar';
  exception when others then
    assert sqlerrm like '%unico administrador%', 'mensagem inesperada: ' || sqlerrm;
  end;
  raise notice 'OK o sistema nao fica sem administrador ativo';

  -- ------------------------------------------------- com outro admin, libera
  insert into usuarios (id, nome, email, papel) values (u_adm2, 'Admin Dois', 'a2@t.com', 'admin');
  update usuarios set papel = 'financeiro' where id = u_adm1;
  select papel::text into txt from usuarios where id = u_adm1;
  assert txt = 'financeiro', 'havendo outro admin, o rebaixamento passa, veio ' || txt;
  raise notice 'OK promovendo outro admin antes, a troca acontece';

  raise notice '=== TESTES 0054 (edicao da equipe e trava do ultimo admin) PASSARAM ===';
end $$;
