-- Teste funcional da 0068 — o usuario vira cadastro de responsabilidade.
--
-- O que esta suite prova, e que NENHUMA outra provava: desativar um usuario
-- CORTA o acesso. Ate a 0068 `is_staff()` e `auth_papel()` olhavam so
-- `id = auth.uid()`, sem `and ativo` — desmarcar "Usuario ativo" mudava um
-- checkbox e a pessoa seguia lendo a carteira e lancando no financeiro, com a
-- tela prometendo o contrario. Este teste e a regressao dessa promessa.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ger uuid := gen_random_uuid();
  r_id  uuid;
  n int; ok boolean; rec record;
begin
  insert into regionais (nome) values ('Unidade 68') returning id into r_id;

  insert into auth.users (id, email) values (u_adm,'adm68@t.com'), (u_ger,'ger68@t.com');
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm68@t.com','admin', null),
           (u_ger,'Gestor','ger68@t.com','gestor_regional', r_id);

  -- (A) a ficha existe e valida --------------------------------------------
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  update usuarios set telefone = '65999990000', cargo = 'DIRETOR',
                      documento = '52998224725', data_inicio = date '2024-03-01'
   where id = u_adm;
  assert (select cargo from usuarios where id = u_adm) = 'DIRETOR', 'cargo grava';

  -- CPF invalido e recusado NO BANCO, nao so na tela.
  begin
    update usuarios set documento = '11111111111' where id = u_ger;
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'CPF invalido tem de ser recusado';

  -- Duas pessoas nao dividem um CPF...
  begin
    update usuarios set documento = '52998224725' where id = u_ger;
    ok := false;
  exception when unique_violation then ok := true;
  end;
  assert ok, 'CPF duplicado tem de ser recusado';

  -- ... mas o campo e OPCIONAL: dois sem documento convivem (unique PARCIAL).
  assert (select count(*) from usuarios where documento is null) >= 1,
    'usuario sem documento continua valido';

  -- Saida antes da entrada nao existe.
  begin
    update usuarios set data_desligamento = date '2024-01-01' where id = u_adm;
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'desligamento anterior ao inicio tem de ser recusado';

  -- (B) 🔴 A TRAVA: desativar CORTA o acesso ---------------------------------
  -- Com o gestor ATIVO, ele e staff e enxerga a unidade dele.
  perform set_config('request.jwt.claim.sub', u_ger::text, false);
  assert is_staff(),                        'gestor ativo e staff';
  assert auth_papel()::text = 'gestor_regional', 'gestor ativo tem papel';
  assert auth_regional_id() = r_id,         'gestor ativo tem unidade';
  assert pode_regional(r_id),               'gestor ativo opera a unidade dele';
  assert usuario_acesso_ativo(),            'acesso ativo';

  -- A gestao desativa.
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  update usuarios set ativo = false where id = u_ger;

  -- E AGORA NADA MAIS PASSA.
  perform set_config('request.jwt.claim.sub', u_ger::text, false);
  assert not is_staff(),            'DESATIVADO NAO E STAFF — era o buraco da 0001';
  assert auth_papel() is null,      'desativado nao tem papel';
  assert auth_regional_id() is null,'desativado nao tem unidade';
  assert not pode_regional(r_id),   'desativado nao opera a unidade';
  assert not tem_acesso_global(),   'desativado nao tem acesso global';
  assert not usuario_acesso_ativo(),'a tela consegue dizer que o acesso caiu';

  -- ...e a data de desligamento foi carimbada sozinha.
  assert (select data_desligamento from usuarios where id = u_ger) = current_date,
    'desativar carimba a data de desligamento';

  -- (B2) o portal do VENDEDOR cai junto ---------------------------------------
  -- `vendedor_atual()` (0038) olhava so `vendedores.ativo`: sem esta correcao
  -- o desativado perdia o /dashboard e seguia entrando no /vendedor.
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into vendedores (nome, usuario_id, regional_id, ativo)
    values ('Gestor Vendedor', u_ger, r_id, true);

  perform set_config('request.jwt.claim.sub', u_ger::text, false);
  assert vendedor_atual() is null,
    'usuario DESATIVADO nao entra no portal do vendedor, mesmo com cadastro ativo';

  -- (C) reativar devolve tudo e limpa a data ---------------------------------
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  update usuarios set ativo = true where id = u_ger;
  assert (select data_desligamento from usuarios where id = u_ger) is null,
    'reativar limpa a data de desligamento';

  perform set_config('request.jwt.claim.sub', u_ger::text, false);
  assert is_staff() and pode_regional(r_id), 'reativado volta a operar';
  assert vendedor_atual() is not null, 'reativado volta ao portal do vendedor';

  -- (D) a empresa nao pode se trancar para fora ------------------------------
  -- Com a 0068 a trava do ultimo admin (0054) deixa de ser conveniencia:
  -- desativar o unico administrador tiraria de TODOS a gestao da equipe.
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  begin
    update usuarios set ativo = false where id = u_adm;
    ok := false;
  exception when others then ok := true;
  end;
  assert ok, 'o ULTIMO admin ativo nao pode ser desativado';
  assert (select ativo from usuarios where id = u_adm), 'o admin continua ativo';

  -- (E) usuarios_listar ------------------------------------------------------
  select * into rec from usuarios_listar(true) where id = u_adm;
  assert rec.cargo = 'DIRETOR',        'a lista traz o cargo';
  assert rec.telefone = '65999990000', 'a lista traz o telefone';
  assert rec.responsavel_por = 0,      'este admin nao responde por unidade nenhuma';

  update regionais set responsavel_id = u_ger where id = r_id;
  select * into rec from usuarios_listar(true) where id = u_ger;
  assert rec.responsavel_por = 1, 'o gestor responde por 1 unidade';
  assert rec.regional_nome = 'Unidade 68', 'a lista resolve o nome da unidade';

  -- o filtro de inativos
  update usuarios set ativo = false where id = u_ger;
  select count(*) into n from usuarios_listar(false) where id = u_ger;
  assert n = 0, 'p_incluir_inativos=false esconde o desativado';
  select count(*) into n from usuarios_listar(true) where id = u_ger;
  assert n = 1, 'p_incluir_inativos=true mostra o desativado';

  raise notice '=== TESTES 0068 (usuario como cadastro de responsabilidade) PASSARAM ===';
end $$;
