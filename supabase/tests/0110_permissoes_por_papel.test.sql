-- Teste funcional da 0110 (no estado depois da 0111): sobram em papel_permissoes
-- as 3 ALCADAS (desconto, liberar_24h, leads), editaveis so pelo admin.
\set ON_ERROR_STOP on
do $$
declare
  adm uuid := gen_random_uuid();
  con uuid := gen_random_uuid();
  fin uuid := gen_random_uuid();
  r_id uuid; n int; ok boolean;
begin
  insert into regionais (nome) values ('Unidade 110') returning id into r_id;
  insert into auth.users (id, email) values
    (adm, 'adm110@t.com'), (con, 'con110@t.com'), (fin, 'fin110@t.com');
  insert into usuarios (id, nome, email, papel, regional_id) values
    (adm, 'Admin', 'adm110@t.com', 'admin', null),
    (con, 'Consultor', 'con110@t.com', 'consultor_vendas', r_id),
    (fin, 'Financeiro', 'fin110@t.com', 'financeiro', null);

  select count(*) into n from papel_permissoes;
  assert n = 24, format('8 papeis x 3 alcadas, veio %s', n);

  perform set_config('request.jwt.claim.sub', con::text, false);
  assert not pode_ver_carteira_regional() and not pode_aprovar_desconto(), 'consultor sem alcadas';

  perform set_config('request.jwt.claim.sub', fin::text, false);
  assert pode_liberar_assistencia() and pode_ver_carteira_regional() and not pode_aprovar_desconto(),
    'financeiro como antes';
  begin
    perform salvar_permissao_papel('consultor_vendas', 'desconto', true);
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'so o admin ajusta';

  perform set_config('request.jwt.claim.sub', adm::text, false);
  begin
    perform salvar_permissao_papel('consultor_vendas', 'evento', true);
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'chave que virou celula (0111) nao e mais alcada';
  perform salvar_permissao_papel('consultor_vendas', 'desconto', true);

  perform set_config('request.jwt.claim.sub', con::text, false);
  assert pode_aprovar_desconto(), 'alcada concedida vale na hora';

  raise notice '=== 0110 permissoes por papel: TODOS OS TESTES PASSARAM ===';
end $$;
