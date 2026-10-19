-- Teste funcional da 0123: modelos de termo, versoes imutaveis, emissao e portal.
\set ON_ERROR_STOP on
do $$
declare
  adm uuid := gen_random_uuid();
  ges uuid := gen_random_uuid();   -- gestor da unidade A
  con uuid := gen_random_uuid();   -- consultor (nao emite)
  out_ uuid := gen_random_uuid();  -- gestor da unidade B
  ass uuid := gen_random_uuid();   -- associado do portal
  r1 uuid; r2 uuid; c1 uuid; c2 uuid; ve uuid; ve2 uuid; tv uuid;
  m1 uuid; mg uuid; v1 termos_versoes; v2 termos_versoes; vg termos_versoes;
  e1 termos_emitidos; n int; ok boolean; arr text[];
begin
  insert into regionais (nome) values ('U123 A') returning id into r1;
  insert into regionais (nome) values ('U123 B') returning id into r2;
  insert into auth.users (id, email) values
    (adm, 'adm123@t.com'), (ges, 'ges123@t.com'), (con, 'con123@t.com'),
    (out_, 'out123@t.com'), (ass, 'ass123@t.com');
  insert into usuarios (id, nome, email, papel, regional_id) values
    (adm, 'Admin', 'adm123@t.com', 'admin', null),
    (ges, 'Gestor A', 'ges123@t.com', 'gestor_regional', r1),
    (con, 'Consultor', 'con123@t.com', 'consultor_vendas', r1),
    (out_, 'Gestor B', 'out123@t.com', 'gestor_regional', r2);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, auth_user_id)
    values ('PF', 'ASSOCIADO 123', '52998224725', r1, ass) returning id into c1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'OUTRO 123', '11144477735', r1) returning id into c2;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao)
    values (c1, 'TRM1A23', r1, tv, 'ativo', current_date) returning id into ve;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao)
    values (c2, 'TRM2A23', r1, tv, 'ativo', current_date) returning id into ve2;

  -- permissoes: celulas novas existem; padrao do seed
  assert permissao_celula_valida('termos_modelos', 'criar'), 'celula termos_modelos.criar';
  assert permissao_celula_valida('termos', 'cancelar'), 'celula termos.cancelar';
  assert not permissao_celula_valida('termos', 'baixar'), 'termos.baixar nao existe';
  select count(*) into n from perfil_permissoes where modulo in ('termos', 'termos_modelos');
  assert n = 8 * 8, 'seed das 8 celulas x 8 papeis, veio ' || n;

  perform set_config('request.jwt.claim.sub', ges::text, false);
  assert perfil_pode('termos', 'criar'), 'gestor emite';
  assert not perfil_pode('termos_modelos', 'criar'), 'gestor nao cria modelo (so admin ou extra)';
  arr := minhas_permissoes();
  assert 'termos.criar' = any (arr) and not ('termos_modelos.criar' = any (arr)), 'minhas_permissoes do gestor';
  perform set_config('request.jwt.claim.sub', con::text, false);
  assert not perfil_pode('termos', 'criar'), 'consultor nao emite';
  assert not perfil_pode('termos', 'ver'), 'consultor nao ve termos';

  -- admin cria e publica
  perform set_config('request.jwt.claim.sub', adm::text, false);
  insert into termos_modelos (nome, tipo, rascunho_html, visivel_portal)
    values ('Termo de Adesao', 'CONTRATO', '<p>Eu, <span data-campo="associado.nome">x</span>.</p>', true)
    returning id into m1;
  v1 := publicar_versao_termo(m1, 'primeira');
  assert v1.numero = 1 and length(v1.sha256) = 64, 'versao 1 com hash';
  assert (select versao_atual_id from termos_modelos where id = m1) = v1.id, 'versao atual = 1';

  -- publicar sem mudar nada e recusado
  begin perform publicar_versao_termo(m1); ok := false;
  exception when check_violation then ok := true; end;
  assert ok, 'publicar sem mudanca recusado';

  -- versao e imutavel
  begin update termos_versoes set conteudo_html = 'adulterado' where id = v1.id; ok := false;
  exception when check_violation then ok := true; end;
  assert ok, 'versao publicada nao muda';

  update termos_modelos set rascunho_html = '<p>Versao nova <span data-campo="veiculo.placa">x</span></p>' where id = m1;
  v2 := publicar_versao_termo(m1);
  assert v2.numero = 2, 'versao 2';
  assert (select conteudo_html from termos_versoes where id = v1.id) like '%associado.nome%', 'v1 intacta';

  -- gestor nao cria modelo (RLS); com extra, cria
  perform set_config('request.jwt.claim.sub', ges::text, false);
  begin
    execute 'set local role authenticated';
    insert into termos_modelos (nome) values ('Pirata');
    execute 'reset role';
    ok := false;
  exception when insufficient_privilege then execute 'reset role'; ok := true; end;
  assert ok, 'gestor sem extra nao cria modelo';
  begin perform publicar_versao_termo(m1); ok := false;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'gestor sem extra nao publica';

  perform set_config('request.jwt.claim.sub', adm::text, false);
  perform salvar_permissoes_usuario(ges, '[{"modulo":"termos_modelos","acao":"criar"}]', 'cria termos');
  perform set_config('request.jwt.claim.sub', ges::text, false);
  assert perfil_pode('termos_modelos', 'criar'), 'extra concede criar modelo';
  execute 'set local role authenticated';
  insert into termos_modelos (nome, escopo, rascunho_html, visivel_portal)
    values ('Regimento', 'GERAL', '<p>Regimento interno</p>', true) returning id into mg;
  execute 'reset role';
  vg := publicar_versao_termo(mg);

  -- emissao: gestor da unidade emite; protocolo entra antes do hash
  e1 := registrar_termo_emitido(v2.id, c1, ve,
          '<p>Termo TRM1A23 protocolo {{PROTOCOLO_DO_TERMO}}</p>', array['associado.rg'], null);
  assert e1.protocolo like 'TRM-%', 'protocolo gerado';
  assert e1.conteudo_html like '%' || e1.protocolo || '%', 'protocolo no texto';
  assert e1.html_sha256 = termo_sha256(e1.conteudo_html), 'hash do texto final';
  assert e1.regional_id = r1 and e1.visivel_portal, 'unidade e portal herdados';
  assert e1.campos_vazios = array['associado.rg'], 'campos vazios gravados';

  -- conteudo imutavel; PDF uma vez
  begin update termos_emitidos set conteudo_html = 'x' where id = e1.id; ok := false;
  exception when check_violation then ok := true; end;
  assert ok, 'emitido nao muda';
  perform anexar_pdf_termo(e1.id, 'c/e1.pdf', repeat('a', 64), 1000);
  perform anexar_pdf_termo(e1.id, 'c/outro.pdf', repeat('b', 64), 2000);
  assert (select pdf_path from termos_emitidos where id = e1.id) = 'c/e1.pdf', 'pdf gravado uma vez';

  -- veiculo de outro associado recusado
  begin perform registrar_termo_emitido(v2.id, c1, ve2, '<p>x</p>'); ok := false;
  exception when check_violation then ok := true; end;
  assert ok, 'veiculo alheio recusado';

  -- gestor de outra unidade nao emite nem ve
  perform set_config('request.jwt.claim.sub', out_::text, false);
  begin perform registrar_termo_emitido(v2.id, c1, ve, '<p>x</p>'); ok := false;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'outra unidade nao emite';
  execute 'set local role authenticated';
  select count(*) into n from termos_emitidos;
  execute 'reset role';
  assert n = 0, 'outra unidade nao ve, viu ' || n;

  -- consultor nao emite
  perform set_config('request.jwt.claim.sub', con::text, false);
  begin perform registrar_termo_emitido(v2.id, c1, ve, '<p>x</p>'); ok := false;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'consultor nao emite';

  -- portal: associado ve o emitido visivel e o documento geral
  perform set_config('request.jwt.claim.sub', ass::text, false);
  select count(*) into n from portal_documentos() where origem = 'EMITIDO' and id = e1.id;
  assert n = 1, 'portal mostra o termo emitido';
  select count(*) into n from portal_documentos() where origem = 'GERAL' and id = vg.id;
  assert n = 1, 'portal mostra o regimento';
  execute 'set local role authenticated';
  select count(*) into n from termos_emitidos;
  execute 'reset role';
  assert n = 1, 'associado le so o dele, leu ' || n;
  assert pode_ver_termo_emitido(e1.id), 'associado pode baixar o proprio';

  -- cancelar: gestor sim, com motivo; sai do portal
  perform set_config('request.jwt.claim.sub', ges::text, false);
  begin perform cancelar_termo_emitido(e1.id, ' '); ok := false;
  exception when check_violation then ok := true; end;
  assert ok, 'cancelar exige motivo';
  perform cancelar_termo_emitido(e1.id, 'emitido errado');
  assert (select situacao from termos_emitidos where id = e1.id) = 'CANCELADO', 'cancelado';
  perform set_config('request.jwt.claim.sub', ass::text, false);
  select count(*) into n from portal_documentos() where origem = 'EMITIDO';
  assert n = 0, 'cancelado some do portal';

  -- versao com emissao nao pode ser apagada
  begin delete from termos_versoes where id = v2.id; ok := false;
  exception when foreign_key_violation then ok := true; end;
  assert ok, 'versao emitida nao se apaga';

  raise notice '=== TESTES 0123 (termos) PASSARAM ===';
end $$;
