-- Teste funcional da 0137: boleto vencido ha mais de N dias so vira 2a via com
-- revistoria aprovada (ou liberada com justificativa); o link publico recebe
-- foto e video de ate 30 s; reprovar reabre o mesmo link; a renegociacao
-- EMITIDA consome a revistoria (nunca reaproveita) e a que deu ERRO devolve;
-- a rotina cancela o que nao precisa mais e expira a aprovada nao usada.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  r1 uuid; tv uuid; c1 uuid; ve uuid; ve2 uuid;
  h_rec uuid; h_old uuid; h_old2 uuid;
  rev uuid; tok uuid; tok2 uuid; reap boolean; sit text; rn uuid; n integer; ok boolean; txt text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into auth.users (id, email) values (u_adm,'adm137@t.com'), (u_con,'con137@t.com');
  insert into regionais (nome) values ('U137') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm137@t.com','admin', null),
    (u_con,'Consultor','con137@t.com','consultor_vendas', r1);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  update empresa set dias_revistoria_boleto = 5;
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','DEVEDOR 137','52998224725', r1) returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, cobranca_externa)
    values (c1,'REV1A37', r1, tv, 'ativo', current_date - 400, 100, true) returning id into ve;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, cobranca_externa)
    values (c1,'REV2B37', r1, tv, 'ativo', current_date - 400, 100, true) returning id into ve2;

  -- recente (1 dia, abaixo do limite) e antigo (30 dias), do veiculo 1
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem, linha_digitavel) values
    ('137-rec', c1, ve, 'MENSALIDADE', v_hoje - 1, v_hoje - 1, 100, 'aberto', 'OVERDUE',
     '74891160007840200810039027231010100000000010000') returning id into h_rec;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem, linha_digitavel) values
    ('137-old', c1, ve, 'MENSALIDADE', v_hoje - 30, v_hoje - 30, 150, 'aberto', 'OVERDUE',
     '74891160007840300810039027231010100000000015000') returning id into h_old;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem, linha_digitavel) values
    ('137-old2', c1, ve, 'MENSALIDADE', v_hoje - 60, v_hoje - 60, 150, 'aberto', 'OVERDUE',
     '74891160007840400810039027231010100000000015000') returning id into h_old2;

  -- ================================================ A) o que se exige
  select count(*) into n from revistoria_exigida(c1, jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',h_rec)));
  assert n = 0, format('boleto de 1 dia nao exige revistoria; veio %s', n);
  select count(*) into n from revistoria_exigida(c1, jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',h_old)))
   where veiculo_id = ve and not liberada;
  assert n = 1, 'boleto de 30 dias exige revistoria do veiculo dele (e so dele)';
  select count(*) into n from revistoria_exigida(c1, jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',h_old)))
   where veiculo_id = ve2;
  assert n = 0, 'o outro veiculo do associado nao entra';

  select count(*) into n from revistorias_a_solicitar() where veiculo_id = ve;
  assert n = 1, 'a fila "a pedir" (entrada do robo) mostra o veiculo';

  -- ================================================ B) a trava
  rn := criar_renegociacao(c1, 'SEGUNDA_VIA', jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',h_rec)),
          jsonb_build_array(jsonb_build_object('vencimento', v_hoje + 2, 'valor', 100)));
  assert rn is not null, 'abaixo do limite a 2a via sai normalmente';

  ok := false;
  begin
    perform criar_renegociacao(c1, 'SEGUNDA_VIA', jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',h_old)),
          jsonb_build_array(jsonb_build_object('vencimento', v_hoje + 2, 'valor', 150)));
  exception when check_violation then ok := sqlerrm like 'REVISTORIA PENDENTE%';
  end;
  assert ok, 'acima do limite, sem revistoria, o banco recusa';

  -- ================================================ C) pedir o link
  select s.revistoria_id, s.token, s.reaproveitada into rev, tok, reap from solicitar_revistoria_cobranca(ve) s;
  assert rev is not null and not reap, 'pedido novo';
  select s.token, s.reaproveitada into tok2, reap from solicitar_revistoria_cobranca(ve) s;
  assert tok2 = tok and reap, 'pedir de novo devolve o MESMO link';
  assert (select dias_atraso from revistorias_cobranca where id = rev) >= 30, 'guarda os dias de atraso';

  -- ================================================ D) o link publico (sem sessao)
  perform set_config('request.jwt.claim.sub', '', false);
  select motivo into txt from revistoria_por_token(tok);
  assert txt = 'OK', format('link valido; veio %s', txt);
  select motivo into txt from revistoria_por_token(gen_random_uuid());
  assert txt = 'LINK_INVALIDO', 'token desconhecido';
  select count(*) into n from revistoria_itens_publica(tok) where not enviado;
  assert n = 3, 'frente, traseira e video pendentes';

  ok := false;
  begin perform concluir_revistoria_publica(tok);
  exception when check_violation then ok := sqlerrm like 'Ainda falta%'; end;
  assert ok, 'nao conclui sem os itens obrigatorios';

  perform registrar_midia_revistoria_publica(tok, 'REV_FRENTE', 'r/1.jpg', 500000, 'f.jpg');
  perform registrar_midia_revistoria_publica(tok, 'REV_TRASEIRA', 'r/2.jpg', 500000, 't.jpg');
  ok := false;
  begin perform registrar_midia_revistoria_publica(tok, 'REV_FRENTE', 'r/x.jpg', 11000000, 'x.jpg');
  exception when check_violation then ok := true; end;
  assert ok, 'foto acima de 10 MB e recusada pelo banco';
  ok := false;
  begin perform registrar_midia_revistoria_publica(tok, 'REV_VIDEO_VOLTA', 'r/v.mp4', 5000000, 'v.mp4');
  exception when others then ok := true; end;
  assert ok, 'video sem duracao e recusado';
  ok := false;
  begin perform registrar_midia_revistoria_publica(tok, 'REV_VIDEO_VOLTA', 'r/v.mp4', 5000000, 'v.mp4', 45);
  exception when others then ok := sqlerrm like '%limite e 30%'; end;
  assert ok, 'video de 45 s e recusado';
  ok := false;
  begin perform registrar_midia_revistoria_publica(tok, 'REV_INVENTADO', 'r/v.mp4', 1, 'v.mp4');
  exception when others then ok := true; end;
  assert ok, 'item fora do catalogo e recusado';
  perform registrar_midia_revistoria_publica(tok, 'REV_VIDEO_VOLTA', 'r/v.mp4', 40000000, 'v.mp4', 28);
  assert (select count(*) from vistoria_anexos a join revistorias_cobranca r on r.vistoria_id = a.vistoria_id
           where r.id = rev and a.enviado_pelo_cliente) = 3, 'as 3 midias do cliente (video ate 50 MB)';

  assert concluir_revistoria_publica(tok) = 'EM_ANALISE', 'envio concluido';
  select motivo into txt from revistoria_por_token(tok);
  assert txt = 'EM_ANALISE', 'o link mostra "em analise"';
  ok := false;
  begin perform registrar_midia_revistoria_publica(tok, 'REV_FRENTE', 'r/3.jpg', 1, 'f.jpg');
  exception when others then ok := true; end;
  assert ok, 'em analise nao recebe mais midia';

  -- ================================================ E) analise: permissao e reprovacao
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  ok := false;
  begin perform analisar_revistoria_cobranca(rev, true);
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'consultor de vendas nao aprova (sem revistoria.fechar)';
  ok := false;
  begin perform dispensar_revistoria_cobranca(ve2, 'carro na oficina ha duas semanas');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'consultor de vendas nao libera sem revistoria';

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  ok := false;
  begin perform analisar_revistoria_cobranca(rev, false, '');
  exception when check_violation then ok := true; end;
  assert ok, 'reprovar exige o motivo';
  assert analisar_revistoria_cobranca(rev, false, 'Foto da traseira escura, refaça de dia') = 'REPROVADA', 'reprova';
  select situacao into sit from revistorias_cobranca where id = rev;
  assert sit = 'AGUARDANDO', 'reprovada volta a aguardar o associado';
  assert (select reprovacoes from revistorias_cobranca where id = rev) = 1, 'conta a reprovacao';

  perform set_config('request.jwt.claim.sub', '', false);
  select count(*) into n from revistoria_itens_publica(tok) where not enviado;
  assert n = 3, 'rodada nova: o que foi reprovado nao conta';
  select motivo_reprovacao into txt from revistoria_por_token(tok);
  assert txt like 'Foto da traseira escura%', 'o mesmo link mostra o motivo';
  perform registrar_midia_revistoria_publica(tok, 'REV_FRENTE', 'r/4.jpg', 1, 'f.jpg');
  perform registrar_midia_revistoria_publica(tok, 'REV_TRASEIRA', 'r/5.jpg', 1, 't.jpg');
  perform registrar_midia_revistoria_publica(tok, 'REV_VIDEO_VOLTA', 'r/6.mp4', 1, 'v.mp4', 30);
  perform concluir_revistoria_publica(tok);

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select count(*) into n from revistoria_cobranca_midias(rev) where grupo = 'ATUAL' and rodada_atual;
  assert n = 3, 'a analise ve as 3 midias da rodada atual';
  select count(*) into n from revistoria_cobranca_midias(rev) where grupo = 'ATUAL' and not rodada_atual;
  assert n = 3, 'e as 3 da rodada reprovada, marcadas';
  assert analisar_revistoria_cobranca(rev, true, 'ok') = 'APROVADA', 'aprova';
  select count(*) into n from revistoria_exigida(c1, jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',h_old)))
   where liberada;
  assert n = 1, 'aprovada libera';

  -- ================================================ F) a emissao consome; nunca reaproveita
  rn := criar_renegociacao(c1, 'SEGUNDA_VIA', jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',h_old)),
          jsonb_build_array(jsonb_build_object('vencimento', v_hoje + 2, 'valor', 150)));
  assert (select renegociacao_id from revistorias_cobranca where id = rev) = rn, 'reservada para a renegociacao';
  update cobranca_renegociacoes set situacao = 'EMITIDA' where id = rn;
  select situacao into sit from revistorias_cobranca where id = rev;
  assert sit = 'UTILIZADA', format('emitida consome a revistoria; ficou %s', sit);

  ok := false;
  begin
    perform criar_renegociacao(c1, 'SEGUNDA_VIA', jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',h_old2)),
          jsonb_build_array(jsonb_build_object('vencimento', v_hoje + 2, 'valor', 150)));
  exception when check_violation then ok := sqlerrm like 'REVISTORIA PENDENTE%';
  end;
  assert ok, 'o proximo boleto vencido pede revistoria NOVA (nunca reaproveita)';

  -- ================================================ G) liberar sem revistoria; ERRO devolve
  ok := false;
  begin perform dispensar_revistoria_cobranca(ve, 'curto');
  exception when check_violation then ok := true; end;
  assert ok, 'liberar exige justificativa';
  rev := dispensar_revistoria_cobranca(ve, 'Associado idoso, carro guardado na garagem');
  assert (select situacao from revistorias_cobranca where id = rev) = 'DISPENSADA', 'liberada sem revistoria';
  rn := criar_renegociacao(c1, 'SEGUNDA_VIA', jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',h_old2)),
          jsonb_build_array(jsonb_build_object('vencimento', v_hoje + 2, 'valor', 150)));
  update cobranca_renegociacoes set situacao = 'ERRO' where id = rn;
  assert (select renegociacao_id from revistorias_cobranca where id = rev) is null
     and (select situacao from revistorias_cobranca where id = rev) = 'DISPENSADA',
    'renegociacao com ERRO devolve a liberacao';

  -- ================================================ H) rotina
  update revistorias_cobranca set dispensado_em = now() - interval '11 days' where id = rev;
  select expiradas into n from rotina_revistorias_cobranca();
  assert n = 1 and (select situacao from revistorias_cobranca where id = rev) = 'EXPIRADA',
    'liberada e nao usada em 10 dias expira';

  select s.revistoria_id into rev from solicitar_revistoria_cobranca(ve2) s;
  select canceladas into n from rotina_revistorias_cobranca();
  assert n = 1 and (select situacao from revistorias_cobranca where id = rev) = 'CANCELADA',
    'pedido de veiculo sem nada vencido acima do limite e cancelado';

  -- ================================================ I) trilha, lista e permissoes
  select count(*) into n from revistoria_cobranca_historico;
  assert n >= 8, format('a trilha guarda as trocas; veio %s', n);
  select count(*) into n from revistorias_cobranca_listar();
  assert n >= 3, 'a fila lista as revistorias';
  assert 'revistoria.fechar' = any (minhas_permissoes()), 'admin ve a celula nova';
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  assert 'revistoria.criar' = any (minhas_permissoes()) and not 'revistoria.fechar' = any (minhas_permissoes()),
    'consultor pede o link mas nao aprova';

  raise notice '=== 0137 revistoria de cobranca: TODOS OS TESTES PASSARAM ===';
end $$;
