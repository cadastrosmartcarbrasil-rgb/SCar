-- Teste funcional da 0166: documento GERAL publicado a partir do PDF original.
\set ON_ERROR_STOP on
do $$
declare
  adm uuid := gen_random_uuid();
  ges uuid := gen_random_uuid();
  r1 uuid; mg uuid; ma uuid; m termos_modelos; v1 termos_versoes; v2 termos_versoes; v3 termos_versoes;
  ok boolean;
  h1 text := repeat('a', 64);
  h2 text := repeat('b', 64);
begin
  insert into regionais (nome) values ('U166') returning id into r1;
  insert into auth.users (id, email) values (adm, 'adm166@t.com'), (ges, 'ges166@t.com');
  insert into usuarios (id, nome, email, papel, regional_id) values
    (adm, 'Admin', 'adm166@t.com', 'admin', null),
    (ges, 'Gestor', 'ges166@t.com', 'gestor_regional', r1);

  perform set_config('request.jwt.claim.sub', adm::text, false);
  insert into termos_modelos (nome, tipo, escopo, rascunho_html)
    values ('Regimento Interno', 'REGULAMENTO', 'GERAL', '') returning id into mg;
  insert into termos_modelos (nome, escopo, rascunho_html)
    values ('Termo de Adesao', 'ASSOCIADO', '<p>x</p>') returning id into ma;

  -- sem PDF e sem texto: nada a publicar
  begin perform publicar_versao_termo(mg); ok := false;
  exception when check_violation then ok := true; end;
  assert ok, 'geral vazio sem pdf e recusado';

  -- PDF so em documento GERAL
  begin perform definir_pdf_termo_modelo(ma, 'modelos/x.pdf', h1, 'a.pdf', 100); ok := false;
  exception when check_violation then ok := true; end;
  assert ok, 'pdf recusado em termo por associado';

  -- hash invalido recusado
  begin perform definir_pdf_termo_modelo(mg, 'modelos/x.pdf', 'xyz', 'a.pdf', 100); ok := false;
  exception when check_violation then ok := true; end;
  assert ok, 'hash invalido recusado';

  m := definir_pdf_termo_modelo(mg, 'modelos/' || mg || '/a.pdf', h1, 'Regimento.pdf', 2048);
  assert m.arquivo_pdf_sha256 = h1 and m.arquivo_pdf_bytes = 2048, 'pdf gravado no rascunho';

  -- escopo nao volta para ASSOCIADO com PDF
  begin update termos_modelos set escopo = 'ASSOCIADO' where id = mg; ok := false;
  exception when check_violation then ok := true; end;
  assert ok, 'escopo associado com pdf recusado pelo CHECK';

  -- publica com o hash do arquivo, mesmo sem texto
  v1 := publicar_versao_termo(mg, 'pdf original');
  assert v1.pdf_original and v1.sha256 = h1 and v1.numero = 1, 'versao com o hash do pdf';
  assert v1.conteudo_html like '%Regimento.pdf%', 'nota no conteudo';

  -- o servidor anexa a copia do arquivo (uma vez)
  perform anexar_pdf_versao_termo(v1.id, 'versoes/' || mg || '/' || v1.id || '.pdf', h1);
  assert (select pdf_sha256 from termos_versoes where id = v1.id) = h1, 'pdf da versao anexado';

  -- mesmo arquivo: nada mudou
  begin perform publicar_versao_termo(mg); ok := false;
  exception when check_violation then ok := true; end;
  assert ok, 'mesmo pdf nao publica de novo';

  -- versao imutavel, inclusive pdf_original
  begin update termos_versoes set pdf_original = false where id = v1.id; ok := false;
  exception when check_violation then ok := true; end;
  assert ok, 'pdf_original imutavel';

  -- arquivo novo: versao 2
  perform definir_pdf_termo_modelo(mg, 'modelos/' || mg || '/b.pdf', h2, 'Regimento 2026.pdf', 4096);
  v2 := publicar_versao_termo(mg);
  assert v2.numero = 2 and v2.sha256 = h2 and v2.pdf_original, 'versao 2 com o novo pdf';

  -- tirar o PDF e voltar ao texto
  m := definir_pdf_termo_modelo(mg, null);
  assert m.arquivo_pdf_path is null and m.arquivo_pdf_sha256 is null, 'pdf removido';
  update termos_modelos set rascunho_html = '<p>Regimento em texto</p>' where id = mg;
  v3 := publicar_versao_termo(mg);
  assert not v3.pdf_original and v3.sha256 = termo_sha256('<p>Regimento em texto</p>'), 'versao 3 em texto';

  -- termo de texto segue igual
  perform publicar_versao_termo(ma);

  -- sem permissao de modelo: recusado
  perform set_config('request.jwt.claim.sub', ges::text, false);
  begin perform definir_pdf_termo_modelo(mg, null); ok := false;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'gestor sem extra nao mexe no pdf';

  raise notice '=== TESTES 0166 (termo pdf original) PASSARAM ===';
end $$;
