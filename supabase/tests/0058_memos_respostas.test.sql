-- Teste funcional: o comunicado vira conversa de mao dupla (0058)
\set ON_ERROR_STOP on
do $$
declare
  u_dir  uuid := gen_random_uuid();   -- matriz (admin, publica)
  u_mar  uuid := gen_random_uuid();   -- Marcio, gestor de Cuiaba
  u_ana  uuid := gen_random_uuid();   -- Ana, gestora de Natal
  u_ate  uuid := gen_random_uuid();   -- atendente de Cuiaba (nao endereçado)
  r1 uuid; r2 uuid; m uuid; n int; rec record;
begin
  insert into auth.users (id, email) values
    (u_dir,'dir@t.com'), (u_mar,'mar@t.com'), (u_ana,'ana@t.com'), (u_ate,'ate@t.com');
  insert into regionais (nome) values ('Cuiaba') returning id into r1;
  insert into regionais (nome) values ('Natal')  returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_dir,'Diretoria','dir@t.com','admin', null),
    (u_mar,'Marcio','mar@t.com','gestor_regional', r1),
    (u_ana,'Ana','ana@t.com','gestor_regional', r2),
    (u_ate,'Atendente','ate@t.com','sinistro', r1);

  -- a matriz publica para os GESTORES das duas unidades
  perform set_config('request.jwt.claim.sub', u_dir::text, false);
  select id into m from salvar_memo(
    'Meta de setembro', 'Confirmem o fechamento ate sexta.', 'COMUNICADO', 'ALTA', true,
    null, array['gestor_regional']);

  -- ============================================ quem recebeu responde
  perform set_config('request.jwt.claim.sub', u_mar::text, false);
  perform responder_memo(m, 'Cuiaba fecha quinta, ja esta encaminhado.');
  perform set_config('request.jwt.claim.sub', u_ana::text, false);
  perform responder_memo(m, 'Natal precisa de mais dois dias.');
  raise notice 'OK o destinatario devolve o recado por ali mesmo';

  -- quem NAO foi endereçado nao responde
  perform set_config('request.jwt.claim.sub', u_ate::text, false);
  begin
    perform responder_memo(m, 'quero opinar');
    assert false, 'quem nao recebeu o comunicado nao responde nele';
  exception when others then
    assert sqlerrm like '%nao foi endereçado a voce%', 'mensagem inesperada: ' || sqlerrm;
  end;

  -- ============================================ cada conversa e privada
  perform set_config('request.jwt.claim.sub', u_mar::text, false);
  select count(*) into n from memo_conversas(m);
  assert n = 1, 'o gestor ve so a conversa dele, veio ' || n;
  select count(*) into n from memo_mensagens(m);
  assert n = 1, 'e so as mensagens dela, veio ' || n;
  select count(*) into n from memo_mensagens(m, u_ana);
  assert n = 0, 'a conversa da unidade vizinha nao vaza, veio ' || n;
  raise notice 'OK o desabafo de uma unidade nao e lido pela outra';

  -- ============================================ quem publicou ve as duas e responde em cada
  perform set_config('request.jwt.claim.sub', u_dir::text, false);
  select count(*) into n from memo_conversas(m);
  assert n = 2, 'a matriz acompanha as duas conversas, veio ' || n;

  select * into rec from memo_conversas(m) where com_usuario_id = u_mar;
  assert rec.pessoa = 'Marcio', 'a conversa vem identificada';
  assert rec.nao_lidas = 1, 'a resposta do Marcio chega como nao lida, veio ' || rec.nao_lidas;
  assert not rec.ultima_minha, 'a ultima palavra e do gestor';

  -- responder sem dizer a quem: o autor recebe o proprio memo (0057), entao o
  -- banco exige que ele escolha a conversa
  begin
    perform responder_memo(m, 'ok');
    assert false, 'o autor precisa escolher a conversa';
  exception when others then
    assert sqlerrm like '%Escolha a conversa%', 'mensagem inesperada: ' || sqlerrm;
  end;

  perform responder_memo(m, 'Combinado, Marcio. Obrigado.', u_mar);
  perform responder_memo(m, 'Ana, dois dias esta liberado.', u_ana);
  raise notice 'OK quem publicou responde dentro da conversa de cada um';

  -- ============================================ ciencia das respostas
  select count(*) into n from memo_conversas(m) where nao_lidas > 0;
  assert n = 2, 'as duas respostas chegaram sem leitura, veio ' || n;
  perform marcar_conversa_lida(m, u_mar);
  select * into rec from memo_conversas(m) where com_usuario_id = u_mar;
  assert rec.nao_lidas = 0, 'marcar como lida zera o contador, veio ' || rec.nao_lidas;

  perform set_config('request.jwt.claim.sub', u_mar::text, false);
  select * into rec from memos_do_usuario() where id = m;
  assert rec.respostas = 2, 'o gestor ve as duas mensagens do papo dele, veio ' || rec.respostas;
  assert rec.respostas_nao_lidas = 1, 'a devolutiva da matriz chega como nova, veio ' || rec.respostas_nao_lidas;
  perform marcar_conversa_lida(m);
  select * into rec from memos_do_usuario() where id = m;
  assert rec.respostas_nao_lidas = 0, 'depois de aberta, nao ha mais nova';
  raise notice 'OK o mural avisa quando ha resposta esperando';

  -- ============================================ a tela da gestao mostra o movimento
  perform set_config('request.jwt.claim.sub', u_dir::text, false);
  select * into rec from memos_gestao() where id = m;
  assert rec.conversas = 2, 'duas conversas abertas, veio ' || rec.conversas;
  assert rec.respostas = 4, 'quatro mensagens no total, veio ' || rec.respostas;

  -- Quem so RECEBEU nao acompanha isso pela tela da gestao (o aviso nao e da
  -- unidade dele nem foi publicado por ele) — ve pelo MURAL, e so o proprio papo.
  perform set_config('request.jwt.claim.sub', u_ana::text, false);
  select count(*) into n from memos_gestao() where id = m;
  assert n = 0, 'o aviso da matriz nao entra na tela de gestao da unidade, veio ' || n;
  select * into rec from memos_do_usuario() where id = m;
  assert rec.respostas = 2, 'no mural ela ve so a conversa dela, veio ' || rec.respostas;

  -- ============================================ ninguem fala pela boca dos outros
  perform set_config('request.jwt.claim.sub', u_ana::text, false);
  begin
    perform responder_memo(m, 'em nome do Marcio', u_mar);
    assert false, 'quem nao publicou nao escreve na conversa alheia';
  exception when others then
    assert sqlerrm like '%Somente quem publicou%', 'mensagem inesperada: ' || sqlerrm;
  end;

  perform set_config('request.jwt.claim.sub', u_dir::text, false);
  begin
    perform responder_memo(m, 'oi', u_ate);
    assert false, 'nao da para abrir conversa com quem nao recebeu o comunicado';
  exception when others then
    assert sqlerrm like '%nao recebeu este comunicado%', 'mensagem inesperada: ' || sqlerrm;
  end;
  raise notice 'OK a conversa so existe entre quem publicou e quem foi endereçado';

  raise notice '=== TESTES 0058 (comunicado com resposta) PASSARAM ===';
end $$;
