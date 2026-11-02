-- Teste funcional da 0169. Prova: (1) a celula cobranca_emails existe (ver/editar);
-- (2) o seed concede so ao financeiro; (3) gestor/supervisor nao veem nem mexem (RLS e
-- RPC); (4) com o EXTRA ver o painel aparece mas nao edita; com editar, edita;
-- (5) o caminho sem sessao (rotina) segue; (6) a RPC do painel volta null sem permissao.
\set ON_ERROR_STOP on
do $$
declare
  adm uuid := gen_random_uuid();
  fin uuid := gen_random_uuid();
  ges uuid := gen_random_uuid();
  r1 uuid; n int; ok boolean; arr text[]; j jsonb;
begin
  insert into regionais (nome) values ('Unidade 169') returning id into r1;
  insert into auth.users (id, email) values (adm, 'adm169@t.com'), (fin, 'fin169@t.com'), (ges, 'ges169@t.com');
  insert into usuarios (id, nome, email, papel, regional_id) values
    (adm, 'Admin 169', 'adm169@t.com', 'admin', null),
    (fin, 'Financeiro 169', 'fin169@t.com', 'financeiro', null),
    (ges, 'Gestor 169', 'ges169@t.com', 'gestor_regional', r1);

  -- (1) a celula
  assert permissao_celula_valida('cobranca_emails', 'ver'), 'ver';
  assert permissao_celula_valida('cobranca_emails', 'editar'), 'editar';
  assert not permissao_celula_valida('cobranca_emails', 'excluir'), 'sem excluir';

  -- (2) o seed
  select count(*) into n from perfil_permissoes where modulo = 'cobranca_emails' and concedida and papel <> 'financeiro';
  assert n = 0, 'so o financeiro nasce com a permissao';
  select count(*) into n from perfil_permissoes where modulo = 'cobranca_emails' and papel = 'financeiro' and concedida;
  assert n = 2, 'financeiro ver e editar';
  select count(*) into n from perfil_permissoes where modulo = 'cobranca_emails' and papel = 'cobranca';
  assert n = 2, 'a linha existe (negada) para a grade mostrar';

  -- (3) gestor regional: nada
  perform set_config('request.jwt.claim.sub', ges::text, false);
  assert not pode_emails_cobranca('ver'), 'gestor nao ve';
  assert email_painel_resumo(7) is null, 'painel vazio para quem nao pode';
  execute 'set local role authenticated';
  select count(*) into n from email_config;
  execute 'reset role';
  assert n = 0, 'RLS: gestor nao le a configuracao';
  begin
    perform suprimir_email_manual('x169@t.com', 'teste de permissao');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'gestor nao suprime';
  begin
    perform enfileirar_avisos_cobranca(null);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'gestor nao roda a fila';

  -- (4) EXTRA: ver
  perform set_config('request.jwt.claim.sub', adm::text, false);
  perform salvar_permissoes_usuario(ges, '[{"modulo":"cobranca_emails","acao":"ver"}]', 'acompanha os e-mails');
  perform set_config('request.jwt.claim.sub', ges::text, false);
  arr := minhas_permissoes();
  assert 'cobranca_emails.ver' = any(arr), 'extra aparece em minhas_permissoes';
  assert not ('cobranca_emails.editar' = any(arr)), 'so ver';
  assert email_painel_resumo(7) is not null, 'com ver o painel abre';
  execute 'set local role authenticated';
  select count(*) into n from email_config;
  execute 'reset role';
  assert n = 1, 'RLS: com ver le a configuracao';
  begin
    perform suprimir_email_manual('x169@t.com', 'teste de permissao');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'so ver nao suprime';

  -- EXTRA: editar (inclui ver)
  perform set_config('request.jwt.claim.sub', adm::text, false);
  perform salvar_permissoes_usuario(ges, '[{"modulo":"cobranca_emails","acao":"editar"}]', 'cuida dos e-mails');
  perform set_config('request.jwt.claim.sub', ges::text, false);
  assert pode_emails_cobranca('ver'), 'editar inclui ver';
  perform suprimir_email_manual('x169@t.com', 'teste de permissao');
  select count(*) into n from email_supressoes where email = 'x169@t.com' and ativo;
  assert n = 1, 'com editar suprime';

  -- financeiro pelo seed; admin sempre
  perform set_config('request.jwt.claim.sub', fin::text, false);
  assert pode_emails_cobranca('editar'), 'financeiro edita';
  perform set_config('request.jwt.claim.sub', adm::text, false);
  assert pode_emails_cobranca('editar'), 'admin edita';

  -- (5) sem sessao (a rotina do crontab)
  perform set_config('request.jwt.claim.sub', '', false);
  j := enfileirar_avisos_cobranca(null);
  assert j is not null, 'a rotina segue enfileirando';

  raise notice '=== TESTES 0169 (permissao dos e-mails de cobranca) PASSARAM ===';
end;
$$;
