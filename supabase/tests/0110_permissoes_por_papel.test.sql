-- Teste funcional da 0110: as permissoes de cada papel vivem numa tabela que so
-- o admin edita; o seed reproduz o que os helpers faziam; o admin nunca perde nada.
\set ON_ERROR_STOP on
do $$
declare
  adm uuid := gen_random_uuid();
  sin uuid := gen_random_uuid();
  con uuid := gen_random_uuid();
  fin uuid := gen_random_uuid();
  r_id uuid; r2 uuid; n int; ok boolean;
begin
  insert into regionais (nome) values ('Unidade 110') returning id into r_id;
  insert into regionais (nome) values ('Vizinha 110') returning id into r2;
  insert into auth.users (id, email) values
    (adm, 'adm110@t.com'), (sin, 'sin110@t.com'), (con, 'con110@t.com'), (fin, 'fin110@t.com');
  insert into usuarios (id, nome, email, papel, regional_id) values
    (adm, 'Admin', 'adm110@t.com', 'admin', null),
    (sin, 'Sinistro', 'sin110@t.com', 'sinistro', r_id),
    (con, 'Consultor', 'con110@t.com', 'consultor_vendas', r_id),
    (fin, 'Financeiro', 'fin110@t.com', 'financeiro', null);

  -- seed completo: 8 papeis x 9 chaves, e o admin fora da tabela
  select count(*) into n from papel_permissoes;
  assert n = 72, format('seed com 72 linhas, veio %s', n);
  select count(*) into n from papel_permissoes where papel = 'admin';
  assert n = 0, 'admin nao tem linha';

  -- o seed reproduz os helpers de antes
  perform set_config('request.jwt.claim.sub', sin::text, false);
  assert pode_tratar_evento(r_id), 'sinistro trata evento da unidade';
  assert not pode_tratar_evento(r2), 'sinistro nao trata evento da vizinha';
  assert not pode_assistencia(), 'sinistro nao opera a 24h (0077)';
  assert not pode_editar_precos(), 'sinistro nao edita precos';

  perform set_config('request.jwt.claim.sub', con::text, false);
  assert not pode_ver_carteira_regional(), 'consultor ve so a propria carteira';
  assert not pode_aprovar_desconto(), 'consultor nao aprova desconto';
  assert minhas_permissoes() = '{}'::text[], 'consultor sem capacidades';

  perform set_config('request.jwt.claim.sub', fin::text, false);
  assert pode_editar_precos() and pode_liberar_assistencia() and pode_tratar_evento(r2),
    'financeiro como antes';
  assert not pode_aprovar_desconto() and not pode_auditar(), 'financeiro sem desconto/auditoria';

  -- so admin ajusta
  begin
    perform salvar_permissao_papel('consultor_vendas', 'desconto', true);
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'financeiro nao ajusta permissao';

  perform set_config('request.jwt.claim.sub', adm::text, false);
  assert array_length(minhas_permissoes(), 1) = 9, 'admin tem todas';
  begin
    perform salvar_permissao_papel('admin', 'precos', false);
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'admin nao pode ser ajustado';
  begin
    perform salvar_permissao_papel('consultor_vendas', 'inexistente', true);
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'chave desconhecida recusada';

  -- concede e retira: vale na hora
  perform salvar_permissao_papel('consultor_vendas', 'desconto', true);
  perform salvar_permissao_papel('consultor_vendas', 'leads', true);
  perform salvar_permissao_papel('sinistro', 'evento', false);
  perform salvar_permissao_papel('financeiro', 'precos', false);
  perform salvar_permissao_papel('financeiro', 'precos', false); -- repetido nao loga

  select count(*) into n from papel_permissoes_log;
  assert n = 4, format('4 trocas no log, veio %s', n);
  select count(*) into n from papel_permissoes_log
   where papel = 'sinistro' and permissao = 'evento' and de and not para and alterado_por = adm;
  assert n = 1, 'log com de -> para e autor';

  perform set_config('request.jwt.claim.sub', con::text, false);
  assert pode_aprovar_desconto() and pode_ver_carteira_regional(), 'consultor ganhou na hora';
  assert minhas_permissoes() = array['desconto', 'leads'], 'minhas_permissoes acompanha';

  perform set_config('request.jwt.claim.sub', sin::text, false);
  assert not pode_tratar_evento(r_id), 'sinistro perdeu o evento';

  perform set_config('request.jwt.claim.sub', fin::text, false);
  assert not pode_editar_precos(), 'financeiro perdeu a tabela de precos';

  -- policy de escrita da tabela de precos segue a permissao
  execute 'set local role authenticated';
  begin
    insert into adesao_faixa (tipo_veiculo_id, fipe_minimo, fipe_maximo, valor)
      select id, 999000, 999001, 1 from tipos_veiculo limit 1;
    ok := false;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'sem a permissao, a policy recusa gravar preco';
  execute 'reset role';

  -- inativo perde tudo, inclusive o que o papel concede
  perform set_config('request.jwt.claim.sub', adm::text, false);
  update usuarios set ativo = false where id = sin;
  perform salvar_permissao_papel('sinistro', 'evento', true);
  perform set_config('request.jwt.claim.sub', sin::text, false);
  assert not pode_tratar_evento(r_id), 'usuario inativo nao trata evento';

  raise notice '=== 0110 permissoes por papel: TODOS OS TESTES PASSARAM ===';
end $$;
