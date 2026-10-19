-- Teste funcional da 0111: grade modulo x acao por perfil, editavel so pelo admin,
-- helpers lendo a grade e EXCLUIR valendo no banco.
\set ON_ERROR_STOP on
do $$
declare
  adm uuid := gen_random_uuid();
  sin uuid := gen_random_uuid();
  con uuid := gen_random_uuid();
  ges uuid := gen_random_uuid();
  r_id uuid; r2 uuid; c1 uuid; c2 uuid; n int; ok boolean; arr text[];
begin
  insert into regionais (nome) values ('Unidade 111') returning id into r_id;
  insert into regionais (nome) values ('Vizinha 111') returning id into r2;
  insert into auth.users (id, email) values
    (adm, 'adm111@t.com'), (sin, 'sin111@t.com'), (con, 'con111@t.com'), (ges, 'ges111@t.com');
  insert into usuarios (id, nome, email, papel, regional_id) values
    (adm, 'Admin', 'adm111@t.com', 'admin', null),
    (sin, 'Sinistro', 'sin111@t.com', 'sinistro', r_id),
    (con, 'Consultor', 'con111@t.com', 'consultor_vendas', r_id),
    (ges, 'Gestor', 'ges111@t.com', 'gestor_regional', r_id);
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Apagavel Um', '11144477735', r_id) returning id into c1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Apagavel Dois', '52998224725', r_id) returning id into c2;

  -- celulas: so as que existem, 8 papeis, nenhuma do admin
  select count(*) into n from perfil_permissoes where papel = 'admin';
  assert n = 0, 'admin sem linha';
  select count(distinct papel) into n from perfil_permissoes;
  assert n = 8, 'oito papeis';
  assert not permissao_celula_valida('painel', 'excluir'), 'celula inexistente nao vale';
  begin
    insert into perfil_permissoes (papel, modulo, acao) values ('sinistro', 'painel', 'excluir');
    ok := false;
  exception when check_violation then ok := true; end;
  assert ok, 'banco recusa celula que nao se aplica';
  select count(*) into n from papel_permissoes where permissao not in ('desconto','liberar_24h','leads');
  assert n = 0, 'chaves que viraram celula sairam da 0110';

  -- seed reproduz os helpers
  perform set_config('request.jwt.claim.sub', sin::text, false);
  assert pode_tratar_evento(r_id) and not pode_tratar_evento(r2), 'sinistro trata evento da unidade';
  assert not pode_assistencia() and not pode_auditar(), 'sinistro sem 24h e sem auditoria';
  arr := minhas_permissoes();
  assert 'eventos.editar' = any(arr) and 'sac.ver' = any(arr), 'minhas_permissoes traz celulas';
  assert not ('financeiro.ver' = any(arr)), 'sinistro nao ve o financeiro (decisao da 0111)';

  perform set_config('request.jwt.claim.sub', ges::text, false);
  assert pode_assistencia() and pode_cadastrar_fornecedor() and pode_publicar_memo(), 'gestor como antes';
  assert perfil_pode('associados', 'excluir'), 'gestor exclui associado';

  -- EXCLUIR no banco: consultor nao apaga; gestor apaga
  perform set_config('request.jwt.claim.sub', con::text, false);
  execute 'set local role authenticated';
  delete from clientes where id = c1;
  execute 'reset role';
  select count(*) into n from clientes where id = c1;
  assert n = 1, 'consultor nao exclui associado';

  perform set_config('request.jwt.claim.sub', ges::text, false);
  execute 'set local role authenticated';
  delete from clientes where id = c1;
  execute 'reset role';
  select count(*) into n from clientes where id = c1;
  assert n = 0, 'gestor exclui associado da unidade';

  -- so admin salva; admin nao e ajustavel; celula invalida recusada
  begin
    perform salvar_permissoes_perfil('consultor_vendas', '[{"modulo":"associados","acao":"excluir","concedida":true}]');
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'gestor nao ajusta perfil';

  perform set_config('request.jwt.claim.sub', adm::text, false);
  assert array_length(minhas_permissoes(), 1) = 87, 'admin tem tudo (84 celulas desde a 0123 + 3 alcadas)';
  begin
    perform salvar_permissoes_perfil('admin', '[]');
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'admin nao e ajustavel';
  begin
    perform salvar_permissoes_perfil('sinistro', '[{"modulo":"painel","acao":"excluir","concedida":true}]');
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'acao que nao se aplica e recusada';

  n := salvar_permissoes_perfil('consultor_vendas', '[
    {"modulo":"associados","acao":"excluir","concedida":true},
    {"modulo":"sac","acao":"ver","concedida":true},
    {"modulo":"alcada","acao":"desconto","concedida":true}]');
  assert n = 2, format('so o que mudou conta (2), veio %s', n);
  n := salvar_permissoes_perfil('sinistro', '[{"modulo":"eventos","acao":"editar","concedida":false}]');
  select count(*) into n from papel_permissoes_log
   where papel = 'sinistro' and permissao = 'eventos.editar' and de and not para and alterado_por = adm;
  assert n = 1, 'log com modulo.acao, de -> para e autor';

  perform set_config('request.jwt.claim.sub', con::text, false);
  assert perfil_pode('associados', 'excluir') and pode_aprovar_desconto(), 'consultor ganhou na hora';
  execute 'set local role authenticated';
  delete from clientes where id = c2;
  execute 'reset role';
  select count(*) into n from clientes where id = c2;
  assert n = 0, 'consultor agora exclui';

  perform set_config('request.jwt.claim.sub', sin::text, false);
  assert not pode_tratar_evento(r_id), 'sinistro perdeu o evento';

  raise notice '=== 0111 permissoes modulo x acao: TODOS OS TESTES PASSARAM ===';
end $$;
