-- Teste funcional da 0112: levar eventos ESCOLHIDOS do historico do Mutual para
-- o Kanban — sempre em ABERTO, sem duplicar, sem veiculo nao vai, escopo da
-- unidade, e o levado deixa de contar como historico (SAC, marcador e painel).
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges2 uuid := gen_random_uuid();
  r1 uuid; r2 uuid; tv uuid; c1 uuid; v1 uuid;
  h1 uuid; h2 uuid; h3 uuid; h4 uuid;
  rec record; n bigint; j jsonb; v_evt uuid;
begin
  insert into auth.users (id, email) values (u_adm,'adm112@t.com'), (u_ges2,'ges112@t.com');
  insert into regionais (nome) values ('U1') returning id into r1;
  insert into regionais (nome) values ('U2') returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm112@t.com','admin', null),
    (u_ges2,'Gestor 2','ges112@t.com','gestor_regional', r2);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','JOAO KANBAN','52998224725', r1) returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa)
    values (c1,'KAN1A11', r1, tv, 'ativo', current_date - 400, 100, true) returning id into v1;

  insert into eventos_historico (id_externo, cliente_id, veiculo_id, placa, protocolo, data_evento, tipos, envolvimento, valor_total)
    values ('k1', c1, v1, 'KAN1A11', '9001', current_date - 20, array['COLISÃO','PARABRISA'], 'CAUSADOR', 1500.5)
    returning id into h1;
  insert into eventos_historico (id_externo, cliente_id, veiculo_id, placa, protocolo, data_evento, tipos)
    values ('k2', c1, null, 'ANT9C99', '9002', current_date - 30, array['FURTO'])
    returning id into h2;
  insert into eventos_historico (id_externo, cliente_id, veiculo_id, placa, protocolo, data_evento, tipos)
    values ('k3', c1, v1, 'KAN1A11', '9003', current_date - 40, array['XYZ DESCONHECIDO'])
    returning id into h3;
  insert into eventos_historico (id_externo, cliente_id, veiculo_id, placa, protocolo, data_evento, tipos)
    values ('k4', c1, v1, 'KAN1A11', '9004', null, array['ROUBO (USO DE VIOLÊNCIA)'])
    returning id into h4;

  -- ===================================================== palpite do tipo
  assert (select nome from tipos_evento where id = tipo_evento_do_historico(array['COLISÃO'])) ilike 'colis%';
  assert (select nome from tipos_evento where id = tipo_evento_do_historico(array['ROUBO OU FURTO RECUPERADO'])) ilike 'roubo%';
  assert (select nome from tipos_evento where id = tipo_evento_do_historico(array['INCENDIO EM COLISÃO'])) ilike 'incend%';
  assert tipo_evento_do_historico(array['XYZ']) is null, 'sem casar fica nulo';
  assert tipo_evento_do_historico(array[]::text[]) is null;

  -- ===================================================== nada vai sozinho
  assert (select count(*) from eventos_sinistro) = 0;
  assert (select count(*) from eventos_historico_listar(p_no_kanban := false)) = 4;

  -- ===================================================== gestor de outra unidade
  perform set_config('request.jwt.claim.sub', u_ges2::text, false);
  select * into rec from transportar_eventos_historico(array[h1]);
  assert rec.situacao = 'FORA_DA_UNIDADE' and rec.evento_id is null, format('vizinho: %s', row_to_json(rec));
  assert (select count(*) from eventos_sinistro) = 0, 'vizinho nao cria';

  -- ===================================================== levar os escolhidos
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select count(*) into n from transportar_eventos_historico(array[h1, h2, h3, h4, gen_random_uuid()]);
  assert n = 5, format('uma linha por id: %s', n);
  assert (select count(*) from eventos_sinistro) = 2, 'so h1 e h3 viram evento';

  select * into rec from transportar_eventos_historico(array[h2]);
  assert rec.situacao = 'SEM_VEICULO', format('sem veiculo: %s', row_to_json(rec));
  select * into rec from transportar_eventos_historico(array[h4]);
  assert rec.situacao = 'SEM_DATA', format('sem data: %s', row_to_json(rec));

  select evento_id into v_evt from eventos_historico where id = h1;
  assert v_evt is not null, 'elo gravado';
  select * into rec from eventos_sinistro where id = v_evt;
  assert rec.status::text = 'ABERTO', 'sempre em ABERTO';
  assert rec.cliente_id = c1 and rec.veiculo_id = v1 and rec.regional_id = r1, 'associado, veiculo e unidade';
  assert rec.data_ocorrencia = current_date - 20, 'data da ocorrencia do Mutual';
  assert rec.tipo_envolvimento::text = 'CAUSADOR';
  assert rec.numero_protocolo like 'EVT-%', 'protocolo nosso';
  assert rec.descricao like '%9001%' and rec.descricao like '%PARABRISA%' and rec.descricao like '%1500,50%',
    format('descricao com o que veio do Mutual: %s', rec.descricao);
  assert (select tipo_evento_id from eventos_sinistro e join eventos_historico h on h.evento_id = e.id where h.id = h3) is null,
    'tipo desconhecido fica para a equipe';
  assert exists (select 1 from historico_protocolo where evento_id = v_evt and acao_realizada = 'ABERTURA_PROTOCOLO'),
    'abertura registrada na linha do tempo';

  -- ===================================================== nunca duplica
  select * into rec from transportar_eventos_historico(array[h1]);
  assert rec.situacao = 'JA_NO_KANBAN' and rec.evento_id = v_evt and rec.numero_protocolo like 'EVT-%';
  assert (select count(*) from eventos_sinistro) = 2;

  -- ===================================================== listagem
  assert (select count(*) from eventos_historico_listar(p_no_kanban := true)) = 2;
  assert (select count(*) from eventos_historico_listar(p_no_kanban := false)) = 2;
  select * into rec from eventos_historico_listar() where id = h1;
  assert rec.evento_id = v_evt and rec.evento_status = 'ABERTO' and rec.evento_protocolo like 'EVT-%';

  -- ===================================================== nao conta duas vezes
  assert (select count(*) from eventos_mutual_do_cliente(c1)) = 2, 'SAC: o levado sai do historico';
  select * into rec from veiculos_do_cliente(c1) where id = v1;
  assert rec.eventos_qtd = 3, format('marcador: 2 do SCar + 1 historico (h4): %s', rec.eventos_qtd);
  j := painel_visao_geral(null, 6);
  assert (j->'eventos'->>'abertos')::int = 2, format('painel abertos: %s', j->'eventos');

  -- ===================================================== apagar o evento devolve o historico
  delete from eventos_sinistro where id = v_evt;
  assert (select evento_id from eventos_historico where id = h1) is null, 'on delete set null';
  select * into rec from transportar_eventos_historico(array[h1]);
  assert rec.situacao = 'LEVADO', 'pode ser levado de novo';

  -- ===================================================== limites
  begin
    perform transportar_eventos_historico(array(select gen_random_uuid() from generate_series(1, 201)));
    assert false, 'mais de 200 por vez';
  exception when check_violation then null;
  end;
  assert (select count(*) from transportar_eventos_historico(array[]::uuid[])) = 0;

  raise notice '=== TESTES 0112 (historico do Mutual para o Kanban) PASSARAM ===';
end $$;
