-- Teste funcional da 0113: prazo regulatorio de 90 dias (Art. 22, CNSP 491/2026).
-- O relogio so corre com aviso + documentacao completa; marcos 30/60/75/85/91;
-- a rotina e re-executavel; documento complementar nao para o relogio; recusa
-- fora do prazo so pela diretoria; o associado do portal abre evento sem quebrar.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_sin uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  u_ges2 uuid := gen_random_uuid();
  r1 uuid; r2 uuid; tv uuid; c1 uuid; v1 uuid; t_roubo uuid;
  e1 uuid; e2 uuid; e3 uuid; e4 uuid;
  hoje date := data_sp(now());
  rec record; n bigint; j jsonb; d uuid;
begin
  insert into auth.users (id, email) values
    (u_adm,'adm113@t.com'), (u_sin,'sin113@t.com'), (u_con,'con113@t.com'), (u_ges2,'ges113@t.com');
  insert into regionais (nome) values ('U1') returning id into r1;
  insert into regionais (nome) values ('U2') returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm113@t.com','admin', null),
    (u_sin,'Sinistro','sin113@t.com','sinistro', r1),
    (u_con,'Consultor','con113@t.com','consultor_vendas', r1),
    (u_ges2,'Gestor 2','ges113@t.com','gestor_regional', r2);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  select id into t_roubo from tipos_evento where nome ilike 'roubo%' limit 1;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','MARIA PRAZO','52998224725', r1) returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa)
    values (c1,'PRZ1A11', r1, tv, 'ativo', current_date - 400, 100, true) returning id into v1;

  -- ===================================================== a regua (espelho do TS)
  assert prazo_regulatorio_nivel(0, false, false) = 'DOCUMENTACAO_PENDENTE';
  assert prazo_regulatorio_nivel(29, true, false) = 'NO_PRAZO';
  assert prazo_regulatorio_nivel(30, true, false) = 'AVISO';
  assert prazo_regulatorio_nivel(59, true, false) = 'AVISO';
  assert prazo_regulatorio_nivel(60, true, false) = 'ATENCAO';
  assert prazo_regulatorio_nivel(75, true, false) = 'URGENCIA';
  assert prazo_regulatorio_nivel(84, true, false) = 'URGENCIA';
  assert prazo_regulatorio_nivel(85, true, false) = 'CRITICO';
  assert prazo_regulatorio_nivel(90, true, false) = 'CRITICO', 'o dia 90 ainda esta dentro';
  assert prazo_regulatorio_nivel(91, true, false) = 'VENCIDO';
  assert prazo_regulatorio_nivel(91, true, true) = 'ENCERRADO_FORA_DO_PRAZO';
  assert prazo_regulatorio_nivel(10, true, true) = 'ENCERRADO_NO_PRAZO';

  -- ===================================================== abertura: aviso padrao + lista padrao
  insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, regional_id)
    values (v1, c1, hoje - 1, r1) returning id into e1;
  assert (select data_comunicacao from eventos_sinistro where id = e1) = hoje, 'aviso sem data = hoje';
  assert (select count(*) from evento_documentos where evento_id = e1 and situacao = 'PENDENTE') = 4, 'lista padrao geral';
  select * into rec from eventos_prazos(p_evento := e1);
  assert rec.nivel = 'DOCUMENTACAO_PENDENTE' and rec.inicio_prazo is null and rec.docs_pendentes = 4, format('%s', row_to_json(rec));

  -- tipo com BO: a lista do tipo entra junto
  insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, data_comunicacao, regional_id, tipo_evento_id)
    values (v1, c1, hoje - 60, hoje - 50, r1, t_roubo) returning id into e2;
  assert (select count(*) from evento_documentos where evento_id = e2) = 5, 'roubo pede o BO';

  -- ===================================================== a entrega completa o marco SOZINHA, na data da entrega
  perform set_config('request.jwt.claim.sub', u_con::text, false);   -- atendente da unidade registra entrega
  update evento_documentos set situacao = 'ENTREGUE', entregue_em = hoje - 45
   where evento_id = e2 and nome <> 'BOLETIM DE OCORRENCIA';
  assert (select documentacao_completa_em from eventos_sinistro where id = e2) is null, 'falta o BO';
  update evento_documentos set situacao = 'ENTREGUE', entregue_em = hoje - 40
   where evento_id = e2 and nome = 'BOLETIM DE OCORRENCIA';
  select * into rec from eventos_sinistro where id = e2;
  assert rec.documentacao_completa_em = hoje - 40 and rec.documentacao_completa_origem = 'AUTOMATICA',
    format('completa na data da ultima entrega: %s', rec.documentacao_completa_em);

  select * into rec from eventos_prazos(p_evento := e2);
  assert rec.inicio_prazo = hoje - 40 and rec.limite_prazo = hoje + 50, format('%s', row_to_json(rec));
  assert rec.dias_transcorridos = 40 and rec.dias_restantes = 50 and rec.nivel = 'AVISO', format('%s', row_to_json(rec));
  assert rec.dias_desde_aviso = 50;

  -- atendente nao dispensa
  begin
    update evento_documentos set situacao = 'DISPENSADO', observacao = 'nao precisa'
     where evento_id = e1 and nome = 'CNH DO CONDUTOR';
    assert false, 'atendente dispensando';
  exception when insufficient_privilege then null;
  end;
  begin
    update evento_documentos set situacao = 'ENTREGUE', entregue_em = hoje + 1 where evento_id = e1 and nome = 'CNH DO CONDUTOR';
    assert false, 'entrega futura';
  exception when check_violation then null;
  end;

  -- ===================================================== documento complementar nao para o relogio
  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  insert into evento_documentos (evento_id, nome) values (e2, 'laudo pericial') returning id into d;
  select * into rec from evento_documentos where id = d;
  assert rec.complementar and rec.nome = 'LAUDO PERICIAL', 'complementar e caixa alta';
  assert (select documentacao_completa_em from eventos_sinistro where id = e2) = hoje - 40, 'o relogio segue';
  assert (select docs_complementares from eventos_prazos(p_evento := e2)) = 1;
  begin
    update evento_documentos set situacao = 'DISPENSADO' where id = d;
    assert false, 'dispensa sem motivo';
  exception when check_violation then null;
  end;
  update evento_documentos set situacao = 'DISPENSADO', observacao = 'laudo nao sera necessario' where id = d;

  -- apagar documento registrado e recusado
  begin
    delete from evento_documentos where id = d;
    assert false, 'apagar dispensado';
  exception when check_violation then null;
  end;

  -- ===================================================== marcar a mao
  begin
    perform marcar_documentacao_completa(e1);
    assert false, 'com pendencia';
  exception when check_violation then null;
  end;
  update evento_documentos set situacao = 'DISPENSADO', observacao = 'evento sem avaria visivel' where evento_id = e1;
  -- dispensar tudo completa sozinho
  assert (select documentacao_completa_em from eventos_sinistro where id = e1) = hoje;
  begin
    perform marcar_documentacao_completa(e1);
    assert false, 'ja completa';
  exception when check_violation then null;
  end;

  -- evento sem checklist: a mao, com data no passado; nao antes do aviso
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, data_comunicacao, regional_id)
    values (v1, c1, hoje - 120, hoje - 110, r1) returning id into e3;
  delete from evento_documentos where evento_id = e3;   -- pendentes podem sair
  begin
    perform marcar_documentacao_completa(e3, hoje - 111);
    assert false, 'antes do aviso';
  exception when check_violation then null;
  end;
  begin
    perform marcar_documentacao_completa(e3, hoje + 1);
    assert false, 'futura';
  exception when check_violation then null;
  end;
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  begin
    perform marcar_documentacao_completa(e3, hoje - 100);
    assert false, 'atendente marcando';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  perform marcar_documentacao_completa(e3, hoje - 100, 'docs recebidos no balcao');
  select * into rec from eventos_prazos(p_evento := e3);
  assert rec.dias_transcorridos = 100 and rec.nivel = 'VENCIDO' and rec.dias_restantes = -10, format('%s', row_to_json(rec));

  -- ===================================================== rotina diaria: alertas uma vez por marco
  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  begin
    perform atualizar_prazos_eventos();
    assert false, 'ponta rodando a rotina';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', '', false);   -- o agendador (sem sessao)
  j := atualizar_prazos_eventos();
  assert (j->>'eventos_abertos')::int = 3, format('%s', j);
  assert jsonb_array_length(j->'alertas_novos') = 1 + 5, format('e2: 30 · e3: 30/60/75/85/91 — %s', j->'alertas_novos');
  assert (select array_agg(marco order by marco) from evento_prazo_alertas where evento_id = e3) = array[30,60,75,85,91];
  assert (select nivel from evento_prazo_situacao where evento_id = e3) = 'VENCIDO';
  assert (select dias from evento_prazo_situacao where evento_id = e2) = 40;
  j := atualizar_prazos_eventos();
  assert jsonb_array_length(j->'alertas_novos') = 0, 're-executavel: nada novo';
  assert (select count(*) from evento_prazo_alertas) = 6;

  select * into rec from eventos_prazos(p_evento := e3);
  assert rec.alertas_sem_ciencia = 5 and rec.maior_marco_sem_ciencia = 91;
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  assert dar_ciencia_prazo_evento(e3) = 5;
  assert (select alertas_sem_ciencia from eventos_prazos(p_evento := e3)) = 0;

  -- ===================================================== escopo
  perform set_config('request.jwt.claim.sub', u_ges2::text, false);
  assert (select count(*) from eventos_prazos()) = 0, 'outra unidade nao ve';
  assert (select count(*) from eventos_prazos(p_regional := r1)) = 0, 'nem pedindo o id';
  assert (select count(*) from eventos_prazos(p_evento := e3)) = 0;
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  assert (select count(*) from eventos_prazos()) = 3;
  assert (select count(*) from eventos_prazos(p_regional := r2)) = 0;
  assert (select evento_id from eventos_prazos() limit 1) = e3, 'vencido primeiro';

  -- ===================================================== recusa fora do prazo
  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  begin
    update eventos_sinistro set status = 'NEGADO' where id = e3;
    assert false, 'ponta negando com prazo vencido';
  exception when check_violation then null;
  end;
  update eventos_sinistro set status = 'NEGADO' where id = e2;   -- dentro do prazo: pode
  select * into rec from eventos_sinistro where id = e2;
  assert rec.regulacao_encerrada_em = hoje and not rec.recusa_fora_do_prazo;
  select * into rec from eventos_prazos(p_evento := e2);
  assert rec.nivel = 'ENCERRADO_NO_PRAZO' and rec.dias_restantes is null, format('%s', row_to_json(rec));

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  update eventos_sinistro set status = 'NEGADO' where id = e3;
  select * into rec from eventos_sinistro where id = e3;
  assert rec.recusa_fora_do_prazo and rec.regulacao_encerrada_em = hoje;
  assert exists (select 1 from evento_prazo_historico where evento_id = e3 and tipo = 'RECUSA_FORA_DO_PRAZO');
  -- reabrir a regulacao limpa o encerramento
  update eventos_sinistro set status = 'EM_ANALISE' where id = e3;
  select * into rec from eventos_sinistro where id = e3;
  assert rec.regulacao_encerrada_em is null and not rec.recusa_fora_do_prazo;
  -- encerrados saem da lista dos abertos e do cache
  perform set_config('request.jwt.claim.sub', '', false);
  perform atualizar_prazos_eventos();
  assert not exists (select 1 from evento_prazo_situacao where evento_id = e2);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  assert (select count(*) from eventos_prazos()) = 2;
  assert (select count(*) from eventos_prazos(p_incluir_encerrados := true)) = 3;

  -- ===================================================== reabrir a documentacao: so a diretoria
  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  begin
    perform reabrir_documentacao_evento(e1, 'documento ilegivel');
    assert false, 'ponta reabrindo';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  perform reabrir_documentacao_evento(e1, 'documento ilegivel');
  assert (select documentacao_completa_em from eventos_sinistro where id = e1) is null;
  assert exists (select 1 from evento_prazo_historico where evento_id = e1 and tipo = 'DOCUMENTACAO_REABERTA');

  -- ===================================================== quem chama sem linha em usuarios (associado) nao quebra a FK
  insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, regional_id)
    values (v1, c1, hoje, r1) returning id into e4;
  assert (select count(*) from evento_documentos where evento_id = e4) = 4;
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, false);
  delete from evento_documentos where evento_id = e4;
  perform aplicar_documentos_padrao_evento_interno(e4);
  assert (select count(*) from evento_documentos where evento_id = e4) = 4, 'lista padrao sem linha em usuarios';
  assert (select solicitado_por from evento_documentos where evento_id = e4 limit 1) is null;
  assert (select usuario_id from evento_prazo_historico where evento_id = e4 order by created_at desc limit 1) is null;

  -- ===================================================== aplicar de novo nao duplica; apagar o evento leva tudo
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  assert aplicar_documentos_padrao_evento(e4) = 0;
  delete from eventos_sinistro where id = e4;
  assert not exists (select 1 from evento_documentos where evento_id = e4);

  -- trilha
  assert exists (select 1 from evento_prazo_historico where evento_id = e2 and tipo = 'DOCUMENTACAO_COMPLETA');
  assert exists (select 1 from evento_prazo_historico where evento_id = e2 and tipo = 'DOC_COMPLEMENTAR');
  assert exists (select 1 from evento_prazo_historico where evento_id = e3 and tipo = 'ALERTA');

  raise notice '=== TESTES 0113 (prazo regulatorio de 90 dias) PASSARAM ===';
end $$;
