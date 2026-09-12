-- Teste funcional da 0076 — a vistoria pelo celular do CLIENTE.
--
-- O buraco que ela fecha: o hotlink cotava, o cliente aceitava, e a vistoria
-- ficava esperando alguem LOGADO. A RLS de `vistorias`/`vistoria_anexos` e
-- `to authenticated` e a policy do bucket exige `is_staff()` — o cliente nunca
-- teve como enviar foto. Esta suite prova que agora tem, e que o que o link
-- autoriza continua sendo o minimo.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r_id uuid; tv uuid; pl uuid; l_id uuid; l2 uuid;
  v_tok uuid; v_tok2 uuid; v_exp timestamptz; v_re boolean;
  v_vist uuid; n bigint; txt text; f record; v_ok boolean; v_ok2 boolean;
begin
  insert into auth.users (id, email) values (u_adm, 'adm76@t.com');
  insert into regionais (nome) values ('Unidade 76') returning id into r_id;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm, 'Admin 76', 'adm76@t.com', 'admin', r_id);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into tv from tipos_veiculo limit 1;
  select id into pl from planos_protecao limit 1;

  insert into leads (nome, celular, regional_id, consultor_id, status, placa, tipo_veiculo_id)
    values ('CLIENTE 76', '11966665555', r_id, u_adm, 'EM_NEGOCIACAO', 'VST1A23', tv)
    returning id into l_id;

  -- ==========================================================================
  -- (A) GERAR O LINK
  -- ==========================================================================
  select token, expira_em, reaproveitado into v_tok, v_exp, v_re
    from gerar_link_vistoria(l_id, 7);
  assert v_tok is not null, 'o link tem de nascer com token';
  assert not v_re, 'o primeiro nunca e reaproveitado';
  assert v_exp > now() + interval '6 days' and v_exp < now() + interval '8 days',
    format('7 dias de validade; veio %s', v_exp);

  -- a vistoria foi criada junto (o lead nao tinha nenhuma)
  select id into v_vist from vistorias where lead_id = l_id;
  assert v_vist is not null, 'a vistoria tem de existir depois de gerar o link';

  -- ==========================================================================
  -- (B) REEMITIR NAO DERRUBA O LINK QUE O CLIENTE JA TEM
  -- ==========================================================================
  -- Girar o token a cada clique quebraria, em silencio, a mensagem que o
  -- vendedor acabou de mandar no WhatsApp.
  select token, reaproveitado into v_tok2, v_re from gerar_link_vistoria(l_id, 7);
  assert v_tok2 = v_tok, 'reemitir com link vigente tem de devolver o MESMO token';
  assert v_re, 'e dizer que reaproveitou';

  -- ==========================================================================
  -- (C) ABRIR O LINK — a pagina precisa saber POR QUE nao vale
  -- ==========================================================================
  select * into f from vistoria_por_token(v_tok);
  assert f.valida and f.motivo = 'OK', format('link vigente: %s', f.motivo);
  assert f.lead_id = l_id and f.placa = 'VST1A23', 'traz o veiculo para a tela confirmar';

  select * into f from vistoria_por_token(gen_random_uuid());
  assert not f.valida and f.motivo = 'LINK_INVALIDO',
    'token desconhecido tem MOTIVO proprio, nao um erro generico';

  -- ==========================================================================
  -- (D) A FOTO DO CLIENTE ENTRA, MARCADA, E CONTA NO CHECKLIST
  -- ==========================================================================
  perform registrar_foto_vistoria_publica(v_tok, 'FRENTE', 'vistorias/x/f1.jpg', 120000, 'f1.jpg');
  select count(*) into n from vistoria_anexos where vistoria_id = v_vist;
  assert n = 1, format('a foto do cliente tem de entrar; veio %s', n);

  select enviado_pelo_cliente into v_ok from vistoria_anexos where vistoria_id = v_vist;
  assert v_ok, 'a ORIGEM fica marcada — quem audita precisa saber de quem veio a imagem';

  -- e aparece na mesma lista de poses que o vendedor ve, COM a origem: guardar
  -- `enviado_pelo_cliente` sem funcao que o leia seria o gotcha do
  -- `usuarios.ativo` (0068) — campo que a tela promete e ninguem consulta.
  select enviada, enviado_pelo_cliente into v_ok, v_ok2
    from fotos_vistoria_lead(l_id) where codigo = 'FRENTE';
  assert v_ok, 'a pose tem de aparecer como enviada na tela da vistoria';
  assert v_ok2, 'e a lista tem de dizer que a foto veio do CLIENTE';

  -- pose sem foto nao pode sair como "do cliente" (o coalesce do left join)
  select enviado_pelo_cliente into v_ok2
    from fotos_vistoria_lead(l_id) where codigo <> 'FRENTE' limit 1;
  assert not v_ok2, 'pose vazia nao tem origem nenhuma';

  -- foto e trabalho no lead: renova a protecao (0041) e a agenda (0045)
  select ultima_interacao_em is not null into v_ok from leads where id = l_id;
  assert v_ok, 'a foto do cliente carimba `ultima_interacao_em` — senao o lead volta ao pool';

  -- decisao do usuario: a foto do cliente VALE. Com as 6 obrigatorias, o
  -- checklist de fotos fecha sem ninguem logado tocar no lead.
  perform registrar_foto_vistoria_publica(v_tok, c, 'vistorias/x/' || c || '.jpg', 1000, c || '.jpg')
     from (values ('TRASEIRA'),('LATERAL_ESQUERDA'),('LATERAL_DIREITA'),('CHASSI'),('HODOMETRO')) t(c);
  select c.ok into v_ok from checklist_lead(l_id) c where c.item like 'Fotos%';
  assert v_ok, 'as 6 poses do CLIENTE fecham o item de fotos do checklist';

  -- ==========================================================================
  -- (E) O QUE O LINK **NAO** AUTORIZA
  -- ==========================================================================
  begin
    perform registrar_foto_vistoria_publica(v_tok, 'POSE_INVENTADA', 'x.jpg', 10, 'x.jpg');
    raise exception 'FALHOU: aceitou pose fora do catalogo';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    assert sqlerrm like '%nao existe no modelo%', format('motivo: %s', sqlerrm);
  end;

  -- ==========================================================================
  -- (F) O LINK MORRE COM O PRAZO
  -- ==========================================================================
  update vistorias set token_expira_em = now() - interval '1 minute' where id = v_vist;

  select * into f from vistoria_por_token(v_tok);
  assert not f.valida and f.motivo = 'LINK_EXPIRADO', format('vencido: %s', f.motivo);

  begin
    perform registrar_foto_vistoria_publica(v_tok, 'MOTOR', 'y.jpg', 10, 'y.jpg');
    raise exception 'FALHOU: aceitou foto com link vencido';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    assert sqlerrm like '%expirado%', format('motivo: %s', sqlerrm);
  end;

  -- vencido, reemitir GERA outro (aqui o do cliente ja nao vale mesmo)
  select token, reaproveitado into v_tok2, v_re from gerar_link_vistoria(l_id, 7);
  assert v_tok2 <> v_tok and not v_re, 'link vencido tem de ser trocado, nao reaproveitado';

  -- ==========================================================================
  -- (G) VENDA CONCLUIDA ENCERRA O LINK
  -- ==========================================================================
  update leads set status = 'PERDIDO', perdido_motivo = 'teste' where id = l_id;
  select * into f from vistoria_por_token(v_tok2);
  assert not f.valida and f.motivo = 'ATENDIMENTO_ENCERRADO',
    format('lead encerrado: %s', f.motivo);

  begin
    perform gerar_link_vistoria(l_id, 7);
    raise exception 'FALHOU: gerou link para atendimento encerrado';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    assert sqlerrm like '%encerrado%', format('motivo: %s', sqlerrm);
  end;

  -- ==========================================================================
  -- (H) O LINK E DE QUEM TRATA O LEAD
  -- ==========================================================================
  insert into leads (nome, celular, regional_id, status)
    values ('DE OUTRA UNIDADE', '11955554444', null, 'EM_NEGOCIACAO') returning id into l2;
  -- admin tem acesso global, entao gera; o teste da RECUSA vive em
  -- `pode_tratar_lead` (0045), reusada aqui de proposito em vez de duplicar regra.
  select token into v_tok2 from gerar_link_vistoria(l2, 7);
  assert v_tok2 is not null, 'a matriz trata qualquer lead';

  -- ==========================================================================
  -- (I) O CAMINHO PUBLICO: o hotlink libera o link no proprio aceite
  -- ==========================================================================
  -- A tela de sucesso do hotlink roda com service_role (sem sessao) e ja provou
  -- a posse do atendimento pelo `leads.token_publico` (0042). Sem esta porta o
  -- cliente aceitaria a proposta e continuaria sem ter como mandar foto — que e
  -- exatamente o buraco que a 0076 existe para fechar.
  insert into leads (nome, celular, regional_id, status)
    values ('ACEITOU NO HOTLINK', '11944443333', r_id, 'EM_NEGOCIACAO') returning id into l2;

  perform set_config('request.jwt.claim.sub', '', false);   -- sem sessao
  select token into v_tok2 from gerar_link_vistoria(l2, 7);
  assert v_tok2 is not null, 'o caminho publico (service_role) tem de gerar o link';

  select * into f from vistoria_por_token(v_tok2);
  assert f.valida and f.lead_id = l2, 'e o link gerado ali tem de abrir';

  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  raise notice '=== TESTES 0076 (link publico da vistoria) PASSARAM ===';
end $$;
