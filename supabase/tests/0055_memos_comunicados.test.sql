-- Teste funcional: mural interno — endereçamento, ciencia e quem publica (0055)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  u_ate uuid := gen_random_uuid();   -- atendente da unidade
  u_out uuid := gen_random_uuid();   -- atendente de OUTRA unidade
  r1 uuid; r2 uuid; m_geral uuid; m_unidade uuid; m_papel uuid; n int; rec record;
begin
  insert into auth.users (id, email) values
    (u_adm,'adm@t.com'), (u_ges,'ges@t.com'), (u_ate,'ate@t.com'), (u_out,'out@t.com');
  insert into regionais (nome) values ('Cuiaba') returning id into r1;
  insert into regionais (nome) values ('Natal')  returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Diretoria','adm@t.com','admin', null),
    (u_ges,'Gestor Cuiaba','ges@t.com','gestor_regional', r1),
    (u_ate,'Atendente Cuiaba','ate@t.com','sinistro', r1),
    (u_out,'Atendente Natal','out@t.com','sinistro', r2);

  -- ================================================= a gestao publica
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into m_geral from salvar_memo(
    'Nova regra de cadastramento', 'CPF sem CNH nao entra na base.',
    'COMUNICADO', 'ALTA', true);
  select id into m_papel from salvar_memo(
    'Script de abertura de sinistro', 'Confirme placa e data antes de abrir.',
    'SCRIPT', 'MEDIA', false, null, array['sinistro']);

  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  select id into m_unidade from salvar_memo(
    'Reuniao da unidade', 'Sexta as 9h, sala 2.', 'COMUNICADO', 'BAIXA', false, r1);
  raise notice 'OK matriz e gestor de unidade publicam comunicado';

  -- gestor NAO publica para a unidade vizinha
  begin
    perform salvar_memo('Invasao', 'x', 'COMUNICADO', 'BAIXA', false, r2);
    assert false, 'gestor nao pode publicar para outra unidade';
  exception when others then
    assert sqlerrm like '%sua unidade%', 'mensagem inesperada: ' || sqlerrm;
  end;

  -- atendente comum nao publica nada
  perform set_config('request.jwt.claim.sub', u_ate::text, false);
  begin
    perform salvar_memo('Da equipe', 'x');
    assert false, 'atendente nao publica comunicado';
  exception when others then
    assert sqlerrm like '%gestao%', 'mensagem inesperada: ' || sqlerrm;
  end;
  raise notice 'OK so a gestao publica (e o gestor so na propria unidade)';

  -- ================================================= o mural de cada um
  perform set_config('request.jwt.claim.sub', u_ate::text, false);
  select count(*) into n from memos_do_usuario();
  assert n = 3, 'o atendente de Cuiaba ve os tres (geral, do papel dele e da unidade), veio ' || n;

  perform set_config('request.jwt.claim.sub', u_out::text, false);
  select count(*) into n from memos_do_usuario();
  assert n = 2, 'o de Natal nao ve o comunicado da unidade vizinha, veio ' || n;
  raise notice 'OK o comunicado chega a quem e endereçado (unidade e papel)';

  -- papel diferente nao recebe o script
  -- (a troca de papel passa pelo admin — a trigger da 0054 exige isso)
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  update usuarios set papel = 'consultor_vendas' where id = u_out;
  perform set_config('request.jwt.claim.sub', u_out::text, false);
  select count(*) into n from memos_do_usuario();
  assert n = 1, 'so o comunicado geral sobra para outro papel, veio ' || n;
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  update usuarios set papel = 'sinistro' where id = u_out;

  -- ================================================= ciencia de leitura
  perform set_config('request.jwt.claim.sub', u_ate::text, false);
  select * into rec from memos_do_usuario() where id = m_geral;
  assert rec.exige_leitura and not rec.lido and rec.pendente_ciencia,
    'comunicado obrigatorio nasce pendente de ciencia';

  -- e o primeiro da fila, justamente por estar pendente
  select id into m_papel from memos_do_usuario() limit 1;
  assert m_papel = m_geral, 'o que exige ciencia vem no topo do mural';

  perform marcar_memo_lido(m_geral);
  select * into rec from memos_do_usuario() where id = m_geral;
  assert rec.lido and not rec.pendente_ciencia, 'apos a ciencia sai do destaque';
  assert rec.lido_em is not null, 'com a data da ciencia';

  perform marcar_memo_lido(m_geral);   -- de novo nao duplica
  select count(*) into n from memo_leituras where memo_id = m_geral;
  assert n = 1, 'a ciencia nao duplica, veio ' || n;

  select count(*) into n from memos_do_usuario(p_incluir_lidos := false);
  assert n = 2, 'o filtro de nao lidos tira o que ja teve ciencia, veio ' || n;
  raise notice 'OK ciencia registrada uma vez e o mural reordena';

  -- ================================================= o que a gestao acompanha
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select * into rec from memos_gestao() where id = m_geral;
  assert rec.leituras = 1, 'a gestao ve quantos deram ciencia, veio ' || rec.leituras;
  assert rec.destinatarios = 4, 'e para quantos o comunicado foi, veio ' || rec.destinatarios;

  -- arquivar tira do mural sem apagar o historico
  perform arquivar_memo(m_geral);
  perform set_config('request.jwt.claim.sub', u_ate::text, false);
  select count(*) into n from memos_do_usuario() where id = m_geral;
  assert n = 0, 'comunicado arquivado sai do mural';
  select count(*) into n from memo_leituras where memo_id = m_geral;
  assert n = 1, 'mas a ciencia de quem leu continua registrada';
  raise notice 'OK arquivar tira do mural e preserva o historico';

  -- ================================================= vencimento
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  perform salvar_memo('Aviso de ontem', 'x', 'COMUNICADO', 'BAIXA', false, null, null,
                      current_date - 1);
  perform set_config('request.jwt.claim.sub', u_ate::text, false);
  select count(*) into n from memos_do_usuario() where titulo = 'Aviso de ontem';
  assert n = 0, 'comunicado vencido nao aparece no mural';
  raise notice 'OK comunicado com prazo some sozinho quando vence';

  raise notice '=== TESTES 0055 (mural interno) PASSARAM ===';
end $$;
