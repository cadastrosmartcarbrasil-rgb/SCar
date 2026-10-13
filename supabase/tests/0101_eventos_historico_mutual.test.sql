-- Teste funcional da 0101: o historico de eventos do Mutual entra em
-- eventos_historico (nunca em eventos_sinistro), com o veiculo pelo
-- vehicle_id do objeto, o associado pelo vinculo PERSON (ou o dono atual do
-- carro), a importacao re-executavel e o escopo de leitura.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges2 uuid := gen_random_uuid();
  u_cli uuid := gen_random_uuid();
  r1 uuid; r2 uuid; tv uuid; c1 uuid; c2 uuid; v1 uuid; v2 uuid;
  rec record; n bigint; j jsonb;
begin
  insert into auth.users (id, email) values
    (u_adm,'adm101@t.com'), (u_ges2,'ges101@t.com'), (u_cli,'cli101@t.com');
  insert into regionais (nome) values ('Unidade 1') returning id into r1;
  insert into regionais (nome) values ('Unidade 2') returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm101@t.com','admin', null),
    (u_ges2,'Gestor 2','ges101@t.com','gestor_regional', r2);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, auth_user_id)
    values ('PF','JOAO DO EVENTO','52998224725', r1, u_cli) returning id into c1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','MARIA NOVA DONA','11144477735', r1) returning id into c2;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa)
    values (c1,'EVT1A11', r1, tv, 'ativo', current_date - 400, 100, true) returning id into v1;
  -- carro que era de outra pessoa no Mutual e hoje e da Maria
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa)
    values (c2,'EVT2B22', r1, tv, 'ativo', current_date - 400, 100, true) returning id into v2;

  -- Vinculos: PERSON 10 -> Joao; objetos 500 (carro do Joao) e 600 (carro da Maria).
  insert into integracao_vinculos (entidade, id_externo, tabela, registro_id) values
    ('PERSON', '10', 'clientes', c1),
    ('CONTRACT_OBJECT', '500', 'veiculos', v1),
    ('CONTRACT_OBJECT', '600', 'veiculos', v2);

  insert into mutual_captura (entidade, id_externo, payload) values
    ('EVENT_TYPE', '1', '{"value":"1","label":"COLISÃO"}'),
    ('EVENT_TYPE', '2', '{"value":"2","label":"PARABRISA"}'),
    -- o mesmo veiculo (vehicle_id 77) esteve em dois contratos: vale o do evento
    ('CONTRACT_OBJECT', '499', '{"vehicle_id":"77","contract_id":"8","vehicle_data":{"vehicle_plate":"OLD0A00"}}'),
    ('CONTRACT_OBJECT', '500', '{"vehicle_id":"77","contract_id":"9","vehicle_data":{"vehicle_plate":"EVT1A11"}}'),
    ('CONTRACT_OBJECT', '600', '{"vehicle_id":"88","contract_id":"20","vehicle_data":{"vehicle_plate":"EVT2B22"}}'),
    ('CONTRACT_OBJECT', '700', '{"vehicle_id":"99","contract_id":"30","vehicle_data":{"vehicle_plate":"ANT9C99"}}'),
    -- e1: Joao, carro na base, dois tipos
    ('EVENT', 'e1', '{"protocol":"20251","person_id":"10","vehicle_id":"77","contract_id":"9","event_date":"2026-09-01T23:30:00Z","event_status":"ANDAMENTO","value_event_types":["1","2"],"type_involvement":"CAUSADOR","total_value":"1500.50"}'),
    -- e2: Joao, carro antigo que nao esta na base -> sem veiculo, placa do objeto
    ('EVENT', 'e2', '{"protocol":"20252","person_id":"10","vehicle_id":"99","contract_id":"30","event_date":"2024-03-10T12:00:00Z","conclusion_date":"2024-04-01","event_status":"ANDAMENTO","value_event_types":["2"],"type_involvement":"VITIMA","total_value":"0"}'),
    -- e3: pessoa sem vinculo, mas o carro esta na base -> fica com a Maria
    ('EVENT', 'e3', '{"protocol":"20253","person_id":"55","vehicle_id":"88","contract_id":"20","event_date":"2025-06-01T12:00:00Z","event_status":"ANDAMENTO","value_event_types":["1"]}'),
    -- e4: pessoa e carro fora da base -> fica de fora, contado
    ('EVENT', 'e4', '{"protocol":"20254","person_id":"66","vehicle_id":"123","contract_id":"40","event_date":"2025-01-01T12:00:00Z","event_status":"ANDAMENTO","value_event_types":["1"]}'),
    -- e5: data placeholder (1923) -> data nula
    ('EVENT', 'e5', '{"protocol":"20255","person_id":"10","vehicle_id":"77","contract_id":"9","event_date":"1923-08-31T19:40:00Z","event_status":"ANDAMENTO","value_event_types":["9"]}');

  -- ===================================================== simular nao grava
  select * into rec from mutual_importar_eventos_historico(false);
  assert rec.lidos = 5 and rec.importaveis = 4 and rec.sem_associado = 1
     and rec.sem_veiculo_na_base = 1 and rec.data_invalida = 1 and rec.gravados = 0,
     format('simulacao: %s', row_to_json(rec));
  assert (select count(*) from eventos_historico) = 0, 'simular nao grava';

  -- ===================================================== importar
  select * into rec from mutual_importar_eventos_historico(true);
  assert rec.gravados = 4, format('gravados: %s', row_to_json(rec));

  select * into rec from eventos_historico where id_externo = 'e1';
  assert rec.cliente_id = c1 and rec.veiculo_id = v1 and rec.placa = 'EVT1A11',
    format('e1 pelo objeto do MESMO contrato: %s', row_to_json(rec));
  assert rec.tipos = array['COLISÃO','PARABRISA'], format('tipos pelo rotulo, na ordem: %s', rec.tipos);
  -- 23:30Z de 01/09 e 20:30 em Sao Paulo: continua 01/09
  assert rec.data_evento = date '2026-09-01', format('fuso: %s', rec.data_evento);
  assert rec.valor_total = 1500.50 and rec.envolvimento = 'CAUSADOR';

  select * into rec from eventos_historico where id_externo = 'e2';
  assert rec.cliente_id = c1 and rec.veiculo_id is null and rec.placa = 'ANT9C99'
     and rec.data_conclusao = date '2024-04-01', format('e2: %s', row_to_json(rec));

  assert (select cliente_id from eventos_historico where id_externo = 'e3') = c2,
    'sem vinculo da pessoa, o evento fica com o dono ATUAL do carro';
  assert not exists (select 1 from eventos_historico where id_externo = 'e4'), 'fora da base fica de fora';
  select * into rec from eventos_historico where id_externo = 'e5';
  assert rec.data_evento is null and rec.tipos = array['9'], 'placeholder vira nulo; tipo sem rotulo fica o codigo';

  -- nunca na tabela operacional
  assert (select count(*) from eventos_sinistro) = 0, 'historico NAO entra em eventos_sinistro';

  -- ===================================================== re-executavel
  select * into rec from mutual_importar_eventos_historico(true);
  assert rec.gravados = 0, 'rodar de novo sem mudanca nao regrava nada';
  update mutual_captura set payload = payload || '{"conclusion_date":"2026-10-01"}'
   where entidade = 'EVENT' and id_externo = 'e1';
  select * into rec from mutual_importar_eventos_historico(true);
  assert rec.gravados = 1, 'so o que mudou';
  assert (select data_conclusao from eventos_historico where id_externo = 'e1') = date '2026-10-01';
  assert (select count(*) from eventos_historico) = 4, 'nao duplica';

  -- ===================================================== SAC
  select count(*) into n from eventos_mutual_do_cliente(c1);
  assert n = 3, format('eventos do Joao: %s', n);
  select * into rec from veiculos_do_cliente(c1) where id = v1;
  assert rec.eventos_qtd = 2, format('marcador do veiculo conta o historico: %s', rec.eventos_qtd);

  -- ===================================================== listagem
  select count(*) into n from eventos_historico_listar();
  assert n = 4, format('lista: %s', n);
  assert (select total_registros from eventos_historico_listar(p_limite := 1) limit 1) = 4, 'total na linha';
  assert (select count(*) from eventos_historico_listar(p_busca := 'joao')) = 3, 'busca por nome sem acento';
  assert (select count(*) from eventos_historico_listar(p_busca := 'EVT2B22')) = 1, 'busca por placa';
  assert (select count(*) from eventos_historico_listar(p_tipo := 'PARABRISA')) = 2, 'filtro por tipo';
  assert (select count(*) from eventos_historico_listar(p_de := date '2025-01-01')) = 2, 'filtro por data';

  -- ===================================================== painel (0100 + historico)
  j := painel_visao_geral(null, 6);
  assert (j->'eventos'->'historico'->>'total')::int = 4, format('painel: %s', j->'eventos'->'historico');
  assert (j->'eventos'->>'abertos')::int = 0, 'historico NAO vira evento em aberto';
  assert (select sum((x->>'eventos_historico')::int) from jsonb_array_elements(j->'serie') x) >= 1,
    'serie mensal traz o historico';

  -- ===================================================== escopo
  perform set_config('request.jwt.claim.sub', u_ges2::text, false);
  assert (select count(*) from eventos_mutual_do_cliente(c1)) = 0, 'gestor vizinho nao le pelo SAC';
  assert (select count(*) from eventos_historico_listar()) = 0, 'gestor vizinho nao le pela lista';
  begin
    perform mutual_importar_eventos_historico(true);
    assert false, 'gestor nao pode importar';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', u_cli::text, false);
  assert (select count(*) from eventos_mutual_do_cliente(c1)) = 3, 'o proprio associado le os seus';
  assert (select count(*) from eventos_historico_listar()) = 0, 'associado nao lista a base';

  raise notice '=== TESTES 0101 (historico de eventos do Mutual) PASSARAM ===';
end $$;
