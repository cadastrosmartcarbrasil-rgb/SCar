-- Teste funcional da 0114: marcos do prazo regulatorio configuraveis pelo admin,
-- nivel lido ao vivo, um alerta por NIVEL (trocar o marco nao duplica).
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_fin uuid := gen_random_uuid();
  r1 uuid; tv uuid; c1 uuid; v1 uuid; e1 uuid;
  hoje date := data_sp(now());
  rec record; j jsonb;
begin
  insert into auth.users (id, email) values (u_adm,'adm114@t.com'), (u_fin,'fin114@t.com');
  insert into regionais (nome) values ('U1') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm114@t.com','admin', null),
    (u_fin,'Fin','fin114@t.com','financeiro', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- sem empresa: padroes
  select * into rec from configuracao_prazo_evento();
  assert rec.prazo_dias = 90 and rec.aviso = 30 and rec.atencao = 60 and rec.urgencia = 75 and rec.critico = 85, format('%s', row_to_json(rec));
  assert prazo_regulatorio_nivel(59, true, false) = 'AVISO';
  begin
    perform salvar_marcos_prazo_evento(20, 50, 70, 80);
    assert false, 'sem empresa';
  exception when no_data_found then null;
  end;

  insert into empresa (razao_social) values ('SMART CAR BRASIL');
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','MARCO TESTE','52998224725', r1) returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa)
    values (c1,'MRC1A11', r1, tv, 'ativo', current_date - 400, 100, true) returning id into v1;
  insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, data_comunicacao, regional_id)
    values (v1, c1, hoje - 60, hoje - 55, r1) returning id into e1;
  delete from evento_documentos where evento_id = e1;
  perform marcar_documentacao_completa(e1, hoje - 55);

  -- padroes: 55 dias = AVISO; rotina dispara so o de 30
  assert (select nivel from eventos_prazos(p_evento := e1)) = 'AVISO';
  perform set_config('request.jwt.claim.sub', '', false);
  j := atualizar_prazos_eventos();
  assert jsonb_array_length(j->'alertas_novos') = 1 and j->'alertas_novos'->0->>'nivel' = 'AVISO', format('%s', j);

  -- so o admin altera
  perform set_config('request.jwt.claim.sub', u_fin::text, false);
  begin
    perform salvar_marcos_prazo_evento(20, 50, 70, 80);
    assert false, 'financeiro alterando';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  begin
    perform salvar_marcos_prazo_evento(30, 30, 70, 80);
    assert false, 'fora de ordem';
  exception when check_violation then null;
  end;
  begin
    perform salvar_marcos_prazo_evento(30, 50, 70, 91);
    assert false, 'acima de 90';
  exception when check_violation then null;
  end;
  begin
    update empresa set prazo_evento_critico_dias = 95;
    assert false, 'check no banco';
  exception when check_violation then null;
  end;

  perform salvar_marcos_prazo_evento(20, 50, 70, 80);
  select * into rec from configuracao_prazo_evento();
  assert rec.aviso = 20 and rec.atencao = 50 and rec.urgencia = 70 and rec.critico = 80;
  -- o nivel muda NA HORA (calculo vivo)
  assert (select nivel from eventos_prazos(p_evento := e1)) = 'ATENCAO';
  assert prazo_regulatorio_nivel(80, true, false) = 'CRITICO';
  assert prazo_regulatorio_nivel(90, true, false) = 'CRITICO';
  assert prazo_regulatorio_nivel(91, true, false) = 'VENCIDO', 'vencido continua acima de 90';

  -- a rotina dispara ATENCAO com o marco novo; o AVISO ja disparado nao duplica
  perform set_config('request.jwt.claim.sub', '', false);
  j := atualizar_prazos_eventos();
  assert jsonb_array_length(j->'alertas_novos') = 1, format('%s', j);
  select * into rec from evento_prazo_alertas where evento_id = e1 and nivel = 'ATENCAO';
  assert rec.marco = 50, 'grava o limiar em vigor';
  assert (select count(*) from evento_prazo_alertas where evento_id = e1) = 2;
  j := atualizar_prazos_eventos();
  assert jsonb_array_length(j->'alertas_novos') = 0, 're-executavel';

  -- unico por nivel no banco
  begin
    insert into evento_prazo_alertas (evento_id, marco, nivel, dias, limite_prazo) values (e1, 30, 'AVISO', 30, hoje);
    assert false, 'nivel duplicado';
  exception when unique_violation then null;
  end;

  raise notice '=== TESTES 0114 (marcos do prazo configuraveis) PASSARAM ===';
end $$;
