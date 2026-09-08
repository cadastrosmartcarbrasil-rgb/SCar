-- Teste funcional: quem publica ve o proprio comunicado no mural (0057)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();   -- matriz (admin, sem unidade)
  u_ges uuid := gen_random_uuid();   -- gestor de Cuiaba
  u_ate uuid := gen_random_uuid();   -- atendente de Cuiaba (papel sinistro)
  r1 uuid; m_geral uuid; m_unidade uuid; m_papel uuid; m_direcao uuid;
  n int; rec record;
begin
  insert into auth.users (id, email) values
    (u_adm,'adm@t.com'), (u_ges,'ges@t.com'), (u_ate,'ate@t.com');
  insert into regionais (nome) values ('Cuiaba') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Master','adm@t.com','admin', null),
    (u_ges,'Gestor Cuiaba','ges@t.com','gestor_regional', r1),
    (u_ate,'Atendente','ate@t.com','sinistro', r1);

  -- ===================================== a matriz publica em tres enderecos
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into m_geral   from salvar_memo('Aviso geral', 'Vale para todos.');
  select id into m_unidade from salvar_memo(
    'So Cuiaba', 'Reuniao na unidade.', 'COMUNICADO', 'MEDIA', false, r1);
  select id into m_papel   from salvar_memo(
    'So sinistro', 'Novo fluxo de vistoria.', 'SCRIPT', 'MEDIA', false, null, array['sinistro']);

  -- ANTES da 0057 os dois ultimos sumiam da tela de quem acabou de publicar.
  select count(*) into n from memos_do_usuario() where id = m_geral;
  assert n = 1, 'o aviso geral aparece para a matriz, veio ' || n;
  select count(*) into n from memos_do_usuario() where id = m_unidade;
  assert n = 1, 'o autor ve o que endereçou a uma unidade, veio ' || n;
  select count(*) into n from memos_do_usuario() where id = m_papel;
  assert n = 1, 'o autor ve o que endereçou a outro papel, veio ' || n;
  raise notice 'OK quem publica ve o proprio comunicado, seja qual for o destino';

  -- e vem marcado, com o destino ao lado (a tela diz "voce publicou · Cuiaba")
  select * into rec from memos_do_usuario() where id = m_unidade;
  assert rec.meu, 'o comunicado do autor vem marcado como meu';
  assert rec.regional = 'Cuiaba', 'o destino acompanha o comunicado, veio ' || coalesce(rec.regional, '(nulo)');
  select * into rec from memos_do_usuario() where id = m_papel;
  assert rec.papeis = array['sinistro'], 'o papel destinatario acompanha o comunicado';

  -- ===================================== o mural dos OUTROS continua enxuto
  perform set_config('request.jwt.claim.sub', u_ate::text, false);
  select count(*) into n from memos_do_usuario();
  assert n = 3, 'o atendente de Cuiaba recebe os tres (geral, unidade e papel), veio ' || n;
  select * into rec from memos_do_usuario() where id = m_geral;
  assert not rec.meu, 'quem nao publicou nao ve o comunicado como seu';

  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  select count(*) into n from memos_do_usuario();
  assert n = 2, 'o gestor recebe o geral e o da unidade, mas nao o do papel sinistro, veio ' || n;
  raise notice 'OK o mural de quem nao publicou nao mudou: so o que e dele';

  -- ===================================== a franquia tambem ve o que mandou
  select id into m_direcao from salvar_memo(
    'Falta de material', 'Acabaram os adesivos.', 'URGENTE', 'ALTA', true,
    null, array['admin', 'financeiro']);
  select count(*) into n from memos_do_usuario() where id = m_direcao;
  assert n = 1, 'o gestor ve o recado que mandou a diretoria, veio ' || n;
  select * into rec from memos_do_usuario() where id = m_direcao;
  assert rec.meu, 'e ele vem marcado como enviado por ele';
  -- ciencia obrigatoria e de QUEM RECEBE; o autor nao fica travado por ela
  assert rec.pendente_ciencia, 'o autor tambem pode dar ciencia (nao muda a regra)';

  perform set_config('request.jwt.claim.sub', u_ate::text, false);
  select count(*) into n from memos_do_usuario() where id = m_direcao;
  assert n = 0, 'o atendente nao ve o recado mandado a diretoria, veio ' || n;
  raise notice 'OK a franquia acompanha o que enviou sem vazar para a equipe';

  raise notice '=== TESTES 0057 (o autor ve o proprio comunicado) PASSARAM ===';
end $$;
