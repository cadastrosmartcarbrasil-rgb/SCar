-- Teste funcional da 0130: PERFIL PERSONALIZADO criado pelo admin (nome + papel
-- de base + grade propria copiada da base).
\set ON_ERROR_STOP on
do $$
declare
  adm uuid := gen_random_uuid();
  con uuid := gen_random_uuid();   -- consultor que vai para o perfil novo
  co2 uuid := gen_random_uuid();   -- consultor que fica no papel
  dst uuid := gen_random_uuid();   -- destino da copia de perfil
  r1 uuid; p1 uuid; p2 uuid; n int; ok boolean; arr text[]; l record;
begin
  insert into regionais (nome) values ('Unidade 130') returning id into r1;
  insert into auth.users (id, email) values
    (adm, 'adm130@t.com'), (con, 'con130@t.com'), (co2, 'co2130@t.com'), (dst, 'dst130@t.com');
  insert into usuarios (id, nome, email, papel, regional_id) values
    (adm, 'Admin 130', 'adm130@t.com', 'admin', null),
    (con, 'Consultor A', 'con130@t.com', 'consultor_vendas', r1),
    (co2, 'Consultor B', 'co2130@t.com', 'consultor_vendas', r1),
    (dst, 'Destino', 'dst130@t.com', 'financeiro', null);

  -- so o admin cria
  perform set_config('request.jwt.claim.sub', con::text, false);
  begin
    perform salvar_perfil_acesso(null, 'Atendente SAC', null, 'consultor_vendas');
    ok := false;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'consultor nao cria perfil';

  perform set_config('request.jwt.claim.sub', adm::text, false);
  begin perform salvar_perfil_acesso(null, 'X', null, 'consultor_vendas'); ok := false;
  exception when others then ok := true; end;
  assert ok, 'nome curto recusado';
  begin perform salvar_perfil_acesso(null, 'Super', null, 'admin'); ok := false;
  exception when others then ok := true; end;
  assert ok, 'base admin recusada';

  p1 := salvar_perfil_acesso(null, 'Atendente sac', 'So atendimento', 'consultor_vendas');
  assert (select nome from perfis_acesso where id = p1) = 'ATENDENTE SAC', 'nome em caixa alta';
  begin perform salvar_perfil_acesso(null, 'atendente SAC', null, 'auditoria'); ok := false;
  exception when unique_violation then ok := true; end;
  assert ok, 'nome repetido recusado';

  -- a grade nasceu igual a do papel de base
  select count(*) into n from perfil_permissoes a
    join perfil_permissoes b on b.modulo = a.modulo and b.acao = a.acao and b.papel = 'consultor_vendas'
   where a.papel = p1::text and a.concedida = b.concedida;
  assert n = (select count(*) from perfil_permissoes where papel = 'consultor_vendas'), 'grade copiada da base';
  assert (select count(*) from papel_permissoes where papel = p1::text)
       = (select count(*) from papel_permissoes where papel = 'consultor_vendas'), 'alcadas copiadas';

  -- ajusta a grade do perfil (sem mexer na do papel)
  perform salvar_permissoes_perfil(p1::text, '[{"modulo":"associados","acao":"excluir","concedida":true}]');
  assert (select concedida from perfil_permissoes where papel = 'consultor_vendas'
           and modulo = 'associados' and acao = 'excluir') is not true, 'papel base intacto';
  begin
    perform salvar_permissoes_perfil(gen_random_uuid()::text, '[{"modulo":"associados","acao":"ver","concedida":true}]');
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'grade de perfil inexistente recusada';

  -- coloca o consultor no perfil: o papel segue a base e a grade passa a ser a do perfil
  update usuarios set perfil_id = p1 where id = con;
  assert (select papel::text from usuarios where id = con) = 'consultor_vendas', 'papel = base';
  perform set_config('request.jwt.claim.sub', con::text, false);
  assert auth_perfil_chave() = p1::text, 'chave do perfil';
  assert perfil_pode('associados', 'excluir'), 'perfil concede excluir';
  arr := minhas_permissoes();
  assert 'associados.excluir' = any(arr), 'minhas_permissoes le o perfil';
  perform set_config('request.jwt.claim.sub', co2::text, false);
  assert not perfil_pode('associados', 'excluir'), 'colega no papel nao ganha';

  -- nao-admin nao troca o proprio perfil
  perform set_config('request.jwt.claim.sub', co2::text, false);
  begin update usuarios set perfil_id = p1 where id = co2; ok := false;
  exception when others then ok := true; end;
  assert ok, 'nao-admin nao se coloca em perfil';

  perform set_config('request.jwt.claim.sub', adm::text, false);
  -- base nao muda com usuarios
  begin perform salvar_perfil_acesso(p1, 'Atendente SAC', null, 'auditoria'); ok := false;
  exception when others then ok := true; end;
  assert ok, 'base travada com usuarios';
  perform salvar_perfil_acesso(p1, 'Atendente SAC 2', 'novo texto', null);
  assert (select nome from perfis_acesso where id = p1) = 'ATENDENTE SAC 2', 'renomeado';

  -- excluir com usuario: recusado
  begin perform excluir_perfil_acesso(p1); ok := false;
  exception when others then ok := true; end;
  assert ok, 'exclusao com usuario recusada';

  -- copiar perfil leva o perfil personalizado
  perform copiar_perfil_usuario(con, dst, true, 'teste');
  select papel::text as papel, perfil_id into l from usuarios where id = dst;
  assert l.perfil_id = p1 and l.papel = 'consultor_vendas', 'copia leva perfil e base';

  -- trocar o papel direto tira do perfil
  update usuarios set papel = 'auditoria' where id = dst;
  select papel::text as papel, perfil_id into l from usuarios where id = dst;
  assert l.perfil_id is null and l.papel = 'auditoria', 'troca de papel sai do perfil';

  -- perfil criado a partir de outro perfil
  p2 := salvar_perfil_acesso(null, 'Copia do SAC', null, 'consultor_vendas', p1::text);
  assert (select concedida from perfil_permissoes where papel = p2::text
           and modulo = 'associados' and acao = 'excluir'), 'copia de perfil leva a grade';

  -- lista com o perfil
  assert (select perfil_nome from usuarios_listar(true) where id = con) = 'ATENDENTE SAC 2', 'lista mostra perfil';

  -- tirando os usuarios, exclui e limpa a grade
  update usuarios set perfil_id = null, papel = 'consultor_vendas' where id = con;
  perform excluir_perfil_acesso(p1);
  assert not exists (select 1 from perfis_acesso where id = p1), 'excluido';
  assert not exists (select 1 from perfil_permissoes where papel = p1::text), 'grade limpa';
  assert not exists (select 1 from papel_permissoes where papel = p1::text), 'alcadas limpas';

  raise notice '=== 0130 perfis personalizados: TESTES PASSARAM ===';
end $$;
