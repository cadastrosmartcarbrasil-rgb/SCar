-- Teste funcional da 0144: o pro-rata pela data de vencimento (ciclo pos-pago),
-- o cancelamento de UM veiculo (os outros do associado ficam), a baixa so dos
-- boletos FUTUROS daquele veiculo, o lead de retorno, as travas de evento e
-- 24h, a reativacao e a carga do Mutual que nao desfaz o cancelamento.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  r1 uuid; tv uuid; c1 uuid; ve uuid; ve2 uuid; vend uuid; serv uuid;
  hfut uuid; hpas uuid; hsem uuid; hout uuid; tfut uuid;
  k uuid; rn uuid; ok boolean; p record; n bigint; o record; tnovo uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into auth.users (id, email) values (u_adm,'adm144@t.com'), (u_con,'con144@t.com');
  insert into regionais (nome) values ('U144') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm144@t.com','admin', null),
    (u_con,'Consultor','con144@t.com','consultor_vendas', r1);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, celular)
    values ('PF','CANCELA 144','52998224725', r1, '65999990000') returning id into c1;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo, usuario_id)
    values ('VEND 144', r1, 0, 0, true, u_con) returning id into vend;
  insert into veiculos (cliente_id, placa, marca, modelo, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, dia_vencimento, cobranca_externa, vendedor_id)
    values (c1,'CNC1A44','FIAT','ARGO', r1, tv, 'ativo', v_hoje - 400, 150, 20, true, vend) returning id into ve;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, dia_vencimento, cobranca_externa)
    values (c1,'CNC2B44', r1, tv, 'ativo', v_hoje - 400, 90, 20, true) returning id into ve2;

  -- ============================================== A) o calculo (pos-pago)
  select * into p from pro_rata_veiculo(ve, '2026-10-05');
  assert p.ciclo_inicio = '2026-09-20' and p.ciclo_fim = '2026-10-19', 'ciclo de 20/09 a 19/10';
  assert p.vencimento_ciclo = '2026-10-20', 'o boleto do ciclo vence em 20/10 (pos-pago)';
  assert p.dias_ciclo = 30 and p.dias_usados = 16, '16 de 30 dias';
  assert p.valor = 80.00, format('150 x 16/30 = 80,00 (veio %s)', p.valor);

  select * into p from pro_rata_veiculo(ve, '2026-10-20');
  assert p.ciclo_inicio = '2026-10-20' and p.dias_ciclo = 31 and p.dias_usados = 1, 'no dia do vencimento abre o ciclo novo';
  assert p.valor = 4.84, 'um dia de 31';

  select * into p from pro_rata_veiculo(ve, '2026-10-19');
  assert p.valor = 150.00, 'o ultimo dia do ciclo cobra a mensalidade inteira';

  select * into p from pro_rata_veiculo(ve, '2026-10-15', '2026-10-01');
  assert p.desde = '2026-10-01' and p.dias_usados = 15 and p.valor = 75.00, 'com inicio informado';

  ok := false;
  begin
    perform pro_rata_veiculo(ve, '2026-10-15', '2026-09-10');
  exception when check_violation then ok := true; end;
  assert ok, 'inicio fora do ciclo e recusado';

  update veiculos set dia_vencimento = 31 where id = ve2;
  select * into p from pro_rata_veiculo(ve2, '2026-02-15');
  assert p.ciclo_inicio = '2026-01-31' and p.vencimento_ciclo = '2026-02-28' and p.dias_ciclo = 28,
    'dia 31 cai no ultimo dia de fevereiro';
  update veiculos set dia_vencimento = 20 where id = ve2;

  -- ============================================== B) boletos de partida
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem, linha_digitavel) values
    ('144-fut', c1, ve, 'MENSALIDADE', v_hoje + 20, v_hoje + 20, 150, 'aberto', 'PENDING',
     '74891160007840500810039027231010100000000015000') returning id into hfut;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem, linha_digitavel) values
    ('144-pas', c1, ve, 'MENSALIDADE', v_hoje - 10, v_hoje - 10, 150, 'aberto', 'OVERDUE',
     '74891160007840600810039027231010100000000015000') returning id into hpas;
  insert into boletos_historico (id_externo, cliente_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem, linha_digitavel) values
    ('144-sem', c1, 'MENSALIDADE', v_hoje + 20, v_hoje + 20, 240, 'aberto', 'PENDING',
     '74891160007840700810039027231010100000000024000') returning id into hsem;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem, linha_digitavel) values
    ('144-out', c1, ve2, 'MENSALIDADE', v_hoje + 20, v_hoje + 20, 90, 'aberto', 'PENDING',
     '74891160007840800810039027231010100000000009000') returning id into hout;
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, valor_original, data_vencimento, status)
    values (c1, ve, 150, 150, v_hoje + 50, 'pendente') returning id into tfut;

  -- ============================================== C) permissao e validacoes
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  ok := false;
  begin
    perform cancelar_veiculo(ve, v_hoje, 'Vendeu o carro');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'consultor sem Veiculos: Cancelar nao cancela';
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  ok := false;
  begin perform cancelar_veiculo(ve, v_hoje, 'x');
  exception when check_violation then ok := true; end;
  assert ok, 'motivo obrigatorio';

  ok := false;
  begin perform cancelar_veiculo(ve, v_hoje + 1, 'Vendeu o carro');
  exception when check_violation then ok := true; end;
  assert ok, 'data futura recusada';

  ok := false;
  begin perform cancelar_veiculo(ve, v_hoje, 'Vendeu o carro', true, null);
  exception when check_violation then ok := true; end;
  assert ok, 'retorno previsto exige a data';

  -- ============================================== D) cancelar UM veiculo
  k := cancelar_veiculo(ve, v_hoje, 'Vendeu o carro', true, v_hoje + 30, 'pediu pelo telefone');
  assert (select status::text from veiculos where id = ve) = 'inativo', 'o veiculo cancelado fica inativo';
  assert (select cancelado_em from veiculos where id = ve) = v_hoje, 'cancelado_em = a data do pedido';
  assert (select data_saida from veiculos where id = ve) = v_hoje, 'a saida e a data do pedido';
  assert (select status_motivo from veiculos where id = ve) ilike 'Cancelamento: Vendeu%', 'o motivo vai para o status';
  assert (select status::text from veiculos where id = ve2) = 'ativo', 'o OUTRO veiculo do associado segue ativo';
  assert (select status::text from clientes where id = c1) = 'ativo', 'o associado nao e tocado';
  assert (select k2.status_anterior from veiculo_cancelamentos k2 where k2.id = k) = 'ativo';
  assert (select (k2.pro_rata->>'dias_usados')::int from veiculo_cancelamentos k2 where k2.id = k) >= 1,
    'o pro-rata fica guardado no cancelamento';

  -- lead de retorno
  select * into o from leads l where l.id = (select lead_retorno_id from veiculo_cancelamentos where id = k);
  assert o.id is not null, 'o retorno previsto vira lead';
  assert o.cliente_existente_id = c1 and o.placa = 'CNC1A44' and o.vendedor_id = vend and o.consultor_id = u_con,
    'o lead leva o associado, a placa e o vendedor do veiculo';
  assert (o.proximo_contato_em at time zone 'America/Sao_Paulo')::date = v_hoje + 30, 'retorno agendado na data';

  ok := false;
  begin perform cancelar_veiculo(ve, v_hoje, 'De novo');
  exception when check_violation then ok := true; end;
  assert ok, 'veiculo ja fora da base nao cancela de novo';

  -- ============================================== E) travas
  ok := false;
  begin
    insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, tipo_evento, regional_id)
      values (ve, c1, v_hoje, 'COLISAO', r1);
  exception when check_violation then ok := sqlerrm ilike '%cancelado%'; end;
  assert ok, 'evento a partir do cancelamento e recusado';
  insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, tipo_evento, regional_id)
    values (ve, c1, v_hoje - 1, 'COLISAO', r1);   -- antes do pedido: tinha cobertura

  select id into serv from servicos_assistencia where ativo limit 1;
  ok := false;
  begin
    insert into acionamentos_assistencia (veiculo_id, cliente_id, servico_id, regional_id, status)
      values (ve, c1, serv, r1, 'ABERTO');
  exception when check_violation then ok := true; end;
  assert ok, 'acionamento da 24h de veiculo cancelado e recusado';
  insert into acionamentos_assistencia (veiculo_id, cliente_id, servico_id, regional_id, status)
    values (ve2, c1, serv, r1, 'ABERTO');   -- o outro veiculo segue atendido

  -- ============================================== F) a cobranca: pro-rata + baixas
  ok := false;
  begin
    perform criar_renegociacao_pro_rata(ve, v_hoje, null, true, v_hoje + 5,
      jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',hpas)), k);
  exception when check_violation then ok := sqlerrm ilike '%antes do cancelamento%'; end;
  assert ok, 'boleto vencido antes do pedido e divida: nao se baixa';

  ok := false;
  begin
    perform criar_renegociacao_pro_rata(ve, v_hoje, null, true, v_hoje + 5,
      jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',hout)), k);
  exception when check_violation then ok := true; end;
  assert ok, 'boleto de OUTRO veiculo nao entra';

  ok := false;
  begin
    perform criar_renegociacao_pro_rata(ve, v_hoje, null, true, v_hoje + 5,
      jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',hsem)), k);
  exception when check_violation then ok := true; end;
  assert ok, 'boleto sem veiculo nao entra';

  rn := criar_renegociacao_pro_rata(ve, v_hoje, null, true, v_hoje + 5,
    jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',hfut),
                      jsonb_build_object('origem','SCAR','id',tfut)), k);
  assert (select tipo from cobranca_renegociacoes where id = rn) = 'PRO_RATA';
  assert (select situacao from cobranca_renegociacoes where id = rn) = 'EMITINDO';
  assert (select renegociacao_id from veiculo_cancelamentos where id = k) = rn, 'o cancelamento aponta a cobranca';
  select * into p from pro_rata_veiculo(ve, v_hoje);
  select id into tnovo from titulos_financeiros where renegociacao_id = rn;
  assert (select valor from titulos_financeiros where id = tnovo) = p.valor, 'o boleto vale o pro-rata calculado no banco';
  assert (select veiculo_id from titulos_financeiros where id = tnovo) = ve, 'o boleto e do veiculo cancelado';
  assert (select observacao from titulos_financeiros where id = tnovo) ilike 'Pro-rata de %', 'a observacao explica o calculo';

  ok := false;
  begin
    perform criar_renegociacao_pro_rata(ve, v_hoje, null, true, v_hoje + 5, '[]'::jsonb, k);
  exception when unique_violation then ok := true; end;
  assert ok, 'a cobranca do cancelamento sai uma vez';

  assert finalizar_emissao_renegociacao(rn, null, jsonb_build_array(jsonb_build_object(
    'titulo_id', tnovo, 'nosso_numero', '261000144', 'linha_digitavel', '7489...144'))) = 'EMITIDA';
  for o in select id from cobranca_renegociacao_origens where renegociacao_id = rn loop
    perform registrar_baixa_original(o.id, 'BAIXADO');
  end loop;
  assert (select situacao from boletos_historico where id = hfut) = 'cancelado', 'o boleto futuro do Mutual sai';
  assert (select status::text from titulos_financeiros where id = tfut) = 'cancelado', 'o titulo futuro do SCar sai';
  assert (select situacao from boletos_historico where id = hpas) = 'aberto', 'o vencido antes do pedido fica (e divida)';
  assert (select situacao from boletos_historico where id = hsem) = 'aberto', 'o boleto sem veiculo fica';
  assert (select situacao from boletos_historico where id = hout) = 'aberto', 'o boleto do OUTRO veiculo fica';

  -- sem cobranca e sem origem: nada a fazer
  assert criar_renegociacao_pro_rata(ve2, v_hoje, null, false, null, '[]'::jsonb) is null,
    'sem cobranca nem baixa nao cria nada';

  -- so baixa (sem cobrar): nasce EMITIDA
  rn := criar_renegociacao_pro_rata(ve2, v_hoje, null, false, null,
    jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',hout)));
  assert (select situacao from cobranca_renegociacoes where id = rn) = 'EMITIDA', 'so baixa ja nasce emitida';
  assert not exists (select 1 from titulos_financeiros where renegociacao_id = rn), 'sem boleto novo';

  -- ============================================== G) leitura
  assert (select count(*) from cancelamentos_do_veiculo(ve)) = 1;
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  assert (select count(*) from veiculo_cancelamentos) = 1, 'a equipe da unidade le a trilha';
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- ============================================== H) reativar limpa
  update veiculos set status = 'ativo' where id = ve;
  assert (select cancelado_em from veiculos where id = ve) is null, 'voltar para a base limpa o cancelamento';
  assert (select reativado_em from veiculo_cancelamentos where id = k) is not null, 'a trilha marca a reativacao';
  insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, tipo_evento, regional_id)
    values (ve, c1, v_hoje, 'COLISAO', r1);   -- reativado, volta a ter cobertura

  -- ============================================== I) a carga nao reativa
  assert (select prosrc ilike '%v.cancelado_em is not null and v.cliente_id = v_cliente%'
            from pg_proc where proname = 'mutual_executar_carga'),
    'a carga preserva o status do veiculo cancelado aqui';
  select count(*) into n from pg_proc where proname in ('mutual_executar_carga', 'pro_rata_veiculo',
    'cancelar_veiculo', 'criar_renegociacao_pro_rata', 'cancelamentos_do_veiculo');
  assert n = 5, 'uma versao de cada';

  raise notice '=== 0144 cancelamento e pro-rata: TODOS OS TESTES PASSARAM ===';
end $$;

-- A carga do Mutual sobre um veiculo cancelado aqui (mesmo dono): fica inativo.
do $$
declare
  u_adm uuid := gen_random_uuid();
  r_mat uuid; vid uuid;
begin
  insert into auth.users (id, email) values (u_adm,'adm144b@t.com');
  insert into regionais (nome) values ('Matriz 144') returning id into r_mat;
  insert into usuarios (id, nome, email, papel, regional_id) values (u_adm,'Admin','adm144b@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  perform mutual_registrar_captura('SALE_TEAM', jsonb_build_array(jsonb_build_object('id','44','name','EQ 144')));
  perform vincular_externo('SALE_TEAM','44','regionais', r_mat);
  perform mutual_registrar_captura('PERSON', jsonb_build_array(
    jsonb_build_object('id','P44','name','CARGA 144','cpf_cnpj','168.995.350-09','person_type','1')));
  perform mutual_registrar_captura('CONTRACT', jsonb_build_array(
    jsonb_build_object('id','9244','sales_team_id','44','due_day','10','created_at','2024-01-10T12:00:00Z')));
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','544','contract_id','9244','contract_status','ATIVO','status','ATIVO',
      'final_total_value','150.00','first_activation_date','2024-01-10T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','HHH8H44','vehicle_type','1'),
      'person_data', jsonb_build_object('person_id','P44'))));

  perform mutual_executar_carga(r_mat, false, true);
  select id into vid from veiculos where placa = 'HHH8H44';
  perform cancelar_veiculo(vid, (now() at time zone 'America/Sao_Paulo')::date, 'Pediu cancelamento');
  perform mutual_executar_carga(r_mat, false, true);
  assert (select status::text from veiculos where id = vid) = 'inativo',
    'a carga nao reativa o veiculo cancelado no SCar (mesmo dono)';
  assert (select cancelado_em from veiculos where id = vid) is not null;

  raise notice '=== 0144 carga respeita o cancelamento: TODOS OS TESTES PASSARAM ===';
end $$;
