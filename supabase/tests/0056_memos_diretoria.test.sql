-- Teste funcional: a franquia fala com a matriz e o mural para de despejar (0056)
\set ON_ERROR_STOP on
do $$
declare
  u_dir  uuid := gen_random_uuid();   -- diretoria (admin)
  u_fin  uuid := gen_random_uuid();   -- administracao (financeiro)
  u_ges  uuid := gen_random_uuid();   -- gestor de Cuiaba
  u_ate  uuid := gen_random_uuid();   -- atendente de Cuiaba
  u_ges2 uuid := gen_random_uuid();   -- gestor de Natal
  r1 uuid; r2 uuid; m_equipe uuid; m_direcao uuid; n int; rec record;
begin
  insert into auth.users (id, email) values
    (u_dir,'dir@t.com'), (u_fin,'fin@t.com'), (u_ges,'ges@t.com'),
    (u_ate,'ate@t.com'), (u_ges2,'ges2@t.com');
  insert into regionais (nome) values ('Cuiaba') returning id into r1;
  insert into regionais (nome) values ('Natal')  returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_dir,'Diretoria','dir@t.com','admin', null),
    (u_fin,'Administracao','fin@t.com','financeiro', null),
    (u_ges,'Gestor Cuiaba','ges@t.com','gestor_regional', r1),
    (u_ate,'Atendente Cuiaba','ate@t.com','sinistro', r1),
    (u_ges2,'Gestor Natal','ges2@t.com','gestor_regional', r2);

  -- ============================================ a franquia fala com a equipe
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  select id into m_equipe from salvar_memo(
    'Escala de sabado', 'Plantao das 8h as 12h.', 'COMUNICADO', 'MEDIA', false, r1);

  -- ============================================ e agora tambem com a diretoria
  select id into m_direcao from salvar_memo(
    'Falta de material na unidade', 'Acabaram os adesivos de vistoria.',
    'URGENTE', 'ALTA', true, null, array['admin', 'financeiro']);
  raise notice 'OK o gestor manda recado para a diretoria';

  -- o que continua barrado: unidade vizinha e aviso geral para o sistema
  begin
    perform salvar_memo('Invasao', 'x', 'COMUNICADO', 'BAIXA', false, r2);
    assert false, 'gestor nao publica para a unidade vizinha';
  exception when others then
    assert sqlerrm like '%sua unidade ou para a diretoria%', 'mensagem inesperada: ' || sqlerrm;
  end;

  begin
    perform salvar_memo('Aviso geral', 'x');   -- sem unidade e sem papel = todo mundo
    assert false, 'gestor nao solta aviso para o sistema inteiro';
  exception when others then
    assert sqlerrm like '%sua unidade ou para a diretoria%', 'mensagem inesperada: ' || sqlerrm;
  end;

  begin
    -- "diretoria" nao pode ser porta dos fundos para atingir a operacao toda
    perform salvar_memo('Quase', 'x', 'COMUNICADO', 'BAIXA', false, null,
                        array['admin', 'sinistro']);
    assert false, 'papel fora da diretoria nao passa com unidade nula';
  exception when others then
    assert sqlerrm like '%sua unidade ou para a diretoria%', 'mensagem inesperada: ' || sqlerrm;
  end;
  raise notice 'OK os dois destinos sao os unicos: a propria equipe ou a diretoria';

  -- ============================================ quem recebe o quê
  perform set_config('request.jwt.claim.sub', u_dir::text, false);
  select count(*) into n from memos_do_usuario() where id = m_direcao;
  assert n = 1, 'a diretoria recebe o recado da franquia';
  select count(*) into n from memos_do_usuario() where id = m_equipe;
  assert n = 0, 'e NAO recebe o aviso interno da unidade (mural nao e despejo)';

  perform set_config('request.jwt.claim.sub', u_fin::text, false);
  select count(*) into n from memos_do_usuario() where id = m_direcao;
  assert n = 1, 'a administracao tambem recebe';

  perform set_config('request.jwt.claim.sub', u_ate::text, false);
  select count(*) into n from memos_do_usuario() where id = m_equipe;
  assert n = 1, 'o atendente da unidade recebe a escala';
  select count(*) into n from memos_do_usuario() where id = m_direcao;
  assert n = 0, 'e nao ve o que foi mandado a diretoria';

  perform set_config('request.jwt.claim.sub', u_ges2::text, false);
  select count(*) into n from memos_do_usuario();
  assert n = 0, 'a unidade vizinha nao ve nada disso, veio ' || n;
  raise notice 'OK cada comunicado chega so a quem foi endereçado';

  -- ============================================ a lista da gestao, com escopo
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  select count(*) into n from memos_gestao();
  assert n = 2, 'o gestor acompanha o que e da unidade dele e o que ele enviou, veio ' || n;
  select * into rec from memos_gestao() where id = m_direcao;
  assert rec.meu, 'o que ele mesmo enviou vem marcado';
  assert rec.destinatarios = 2, 'o recado a diretoria conta 2 destinatarios, veio ' || rec.destinatarios;

  perform set_config('request.jwt.claim.sub', u_ges2::text, false);
  select count(*) into n from memos_gestao();
  assert n = 0, 'o gestor vizinho nao acompanha comunicado que nao e dele, veio ' || n;

  perform set_config('request.jwt.claim.sub', u_dir::text, false);
  select count(*) into n from memos_gestao();
  assert n = 2, 'a matriz acompanha tudo, veio ' || n;
  raise notice 'OK a tela da gestao respeita o escopo de quem olha';

  -- ============================================ ciencia do recado urgente
  perform set_config('request.jwt.claim.sub', u_dir::text, false);
  select * into rec from memos_do_usuario() where id = m_direcao;
  assert rec.pendente_ciencia, 'o recado urgente pede ciencia da diretoria';
  perform marcar_memo_lido(m_direcao);

  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  select * into rec from memos_gestao() where id = m_direcao;
  assert rec.leituras = 1, 'o gestor ve que a diretoria leu, veio ' || rec.leituras;
  raise notice 'OK a franquia sabe que a diretoria deu ciencia';

  raise notice '=== TESTES 0056 (mural de mao dupla) PASSARAM ===';
end $$;
