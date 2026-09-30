-- Teste funcional da CARGA DO MUTUAL (0084). O que ele prova, em ordem de
-- risco: (1) a carga NAO gera fatura (a mina nº 1); (2) a data de ativacao
-- nunca e "hoje"; (3) o saneamento tira o placeholder de chassi/renavam;
-- (4) sem placa e CPF invalido sao RECUSA com motivo, nao erro no meio;
-- (5) a segunda rodada ATUALIZA e nao duplica; (6) a re-execucao nao
-- desliga o cutover; (7) o desfazer preserva o veiculo com movimento.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ope uuid := gen_random_uuid();
  r_mat uuid; r_out uuid; tv uuid; pl uuid;
  n int; n2 int; n3 int; v_txt text; v_uuid uuid; v_bool boolean;
  v_dt date; v_num numeric; v_sm smallint;
  v_comp date := date_trunc('month', current_date)::date;
begin
  -- ===================================================== setup
  insert into auth.users (id, email) values (u_adm,'adm84@t.com'), (u_ope,'ope84@t.com');
  insert into regionais (nome) values ('Matriz 84') returning id into r_mat;
  insert into regionais (nome) values ('Vizinha 84') returning id into r_out;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm84@t.com','admin', null),
           (u_ope,'Operador','ope84@t.com','gestor_regional', r_mat);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  select id into pl from planos_protecao order by nivel nulls last limit 1;

  -- A EQUIPE DE VENDAS e o que decide a unidade (0083).
  perform mutual_registrar_captura('SALE_TEAM', jsonb_build_array(
    jsonb_build_object('id','40','name','EQUIPE MATRIZ'),
    jsonb_build_object('id','41','name','EQUIPE VIZINHA')
  ));
  perform vincular_externo('SALE_TEAM','40','regionais', r_mat);
  perform vincular_externo('SALE_TEAM','41','regionais', r_out);

  -- O de-para do tipo de veiculo e do plano: DECISAO REGISTRADA.
  perform vincular_externo('VEHICLE_TYPE','1','tipos_veiculo', tv);
  perform vincular_externo('PLAN','71','planos_protecao', pl);

  perform mutual_registrar_captura('ADDRESS', jsonb_build_array(
    jsonb_build_object('id','700','street','rua das flores','number','10',
      'district','centro','city','cuiaba','state','MT','post_code','78000-000')
  ));

  perform mutual_registrar_captura('PERSON', jsonb_build_array(
    jsonb_build_object('id','P1','name','JOAO DA SILVA','cpf_cnpj','529.982.247-25',
      'person_type','1','email','JOAO@T.COM','phone','65999990001',
      'birthdate','1980-03-15','address_id','700'),
    jsonb_build_object('id','P2','name','MARIA SOUZA','cpf_cnpj','168.995.350-09',
      'person_type','1','address_id','700'),
    jsonb_build_object('id','P3','name','CPF QUEBRADO','cpf_cnpj','111.111.111-11',
      'person_type','1'),
    jsonb_build_object('id','P4','name','ZERO KM','cpf_cnpj','111.444.777-35',
      'person_type','1')
  ));

  perform mutual_registrar_captura('CONTRACT', jsonb_build_array(
    jsonb_build_object('id','9001','sales_team_id','40','due_day','15',
      'created_at','2019-06-01T12:00:00Z'),
    jsonb_build_object('id','9002','sales_team_id','41','due_day','20',
      'created_at','2020-02-01T12:00:00Z')
  ));

  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    -- 101 — a linha COMPLETA e saudavel da matriz
    jsonb_build_object('id','101','contract_id','9001','contract_status','ATIVO',
      'status','ATIVO','plan_id','71','final_total_value','189.90',
      'first_activation_date','2021-05-03T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','aaa-1a11',
        'vehicle_chassi','9bwzzz377vt000001','vehicle_renavam','00328938998',
        'vehicle_assembler','fiat','vehicle_model','argo drive 1.0',
        'vehicle_fabrication_year','2020','vehicle_model_year','2021',
        'vehicle_price','52000','vehicle_cod_fipe','001234-5',
        'vehicle_type','1','vehicle_use_type','1'),
      'person_data', jsonb_build_object('person_id','P1',
        'person_cpf_cnpj','529.982.247-25','person_name','JOAO DA SILVA')),
    -- 102 — MESMO associado, segundo veiculo. Placeholder em chassi/renavam,
    --       valor ZERO, sem first_activation_date e sem due_day no objeto.
    jsonb_build_object('id','102','contract_id','9001','contract_status','ATIVO',
      'status','ATIVO','plan_id','71','final_total_value','0',
      'vehicle_data', jsonb_build_object('vehicle_plate','BBB2B22',
        'vehicle_chassi','000','vehicle_renavam','00000000000',
        'vehicle_assembler','VW','vehicle_model','GOL',
        'vehicle_fabrication_year','2015','vehicle_model_year','2016',
        'vehicle_type','1','vehicle_use_type','2'),
      'person_data', jsonb_build_object('person_id','P1',
        'person_cpf_cnpj','529.982.247-25','person_name','JOAO DA SILVA')),
    -- 103 — CPF invalido: RECUSA
    jsonb_build_object('id','103','contract_id','9001','contract_status','ATIVO',
      'status','ATIVO','final_total_value','120.00',
      'first_activation_date','2022-01-01T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','CCC3C33'),
      'person_data', jsonb_build_object('person_id','P3',
        'person_cpf_cnpj','111.111.111-11','person_name','CPF QUEBRADO')),
    -- 104 — 0 km (sem placa, com chassi): RECUSA nomeando o chassi
    jsonb_build_object('id','104','contract_id','9001','contract_status','ATIVO',
      'status','ATIVO','final_total_value','130.00',
      'first_activation_date','2023-01-01T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_chassi','9BWZZZ377VT000104'),
      'person_data', jsonb_build_object('person_id','P4',
        'person_cpf_cnpj','111.444.777-35','person_name','ZERO KM')),
    -- 105 — INATIVO na matriz: fora do escopo por padrao
    jsonb_build_object('id','105','contract_id','9001','contract_status','INATIVO',
      'status','INATIVO','final_total_value','100.00',
      'first_activation_date','2018-01-01T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','EEE5E55'),
      'person_data', jsonb_build_object('person_id','P2',
        'person_cpf_cnpj','168.995.350-09','person_name','MARIA SOUZA')),
    -- 106 — ATIVO, mas da unidade VIZINHA: nunca entra na carga da matriz
    jsonb_build_object('id','106','contract_id','9002','contract_status','ATIVO',
      'status','ATIVO','final_total_value','160.00',
      'first_activation_date','2021-01-01T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','FFF6F66'),
      'person_data', jsonb_build_object('person_id','P2',
        'person_cpf_cnpj','168.995.350-09','person_name','MARIA SOUZA'))
  ));

  -- ==========================================================================
  -- (A) SANEAMENTO — placeholder nao e dado, e ausencia escrita com confianca
  -- ==========================================================================
  assert mutual_placa('aaa-1a11') = 'AAA1A11',
    'a placa tem de sair alfanumerica em caixa alta';
  assert mutual_placa('ABC1234') = 'ABC1234', 'placa antiga tem de passar';
  assert mutual_placa('ABC') is null, 'placa fora do padrao tem de dar NULL';
  assert mutual_placa('') is null, 'placa vazia tem de dar NULL';

  assert mutual_chassi('9bwzzz377vt000001') = '9BWZZZ377VT000001',
    'chassi de 17 tem de passar em caixa alta';
  assert mutual_chassi('000') is null,
    'chassi fora de 17 caracteres tem de dar NULL, nunca string vazia';

  assert mutual_renavam('00328938998') = '00328938998', 'renavam de 11 passa';
  assert mutual_renavam('0') is null, 'renavam "0" e placeholder: NULL';
  assert mutual_renavam('00000000000') is null,
    'renavam so de zeros e placeholder: NULL (senao COLIDE no unique)';
  assert mutual_renavam('2012') is null,
    'o ano no campo do renavam nao e renavam: NULL';

  assert mutual_ano('2020') = 2020, 'ano valido tem de passar';
  assert mutual_ano('12') is null, 'ano de 2 digitos tem de dar NULL';
  assert mutual_ano('1800') is null, 'ano impossivel tem de dar NULL';

  assert mutual_uso_veiculo('2') = 'app', 'use_type 2 e motorista de aplicativo';
  assert mutual_uso_veiculo('99') = 'passeio', 'use_type desconhecido cai no default';

  -- ==========================================================================
  -- (B) A LEITURA — escopo, recusas com motivo e a escada da ativacao
  -- ==========================================================================
  -- `p_regional_id` nulo nao pode significar "todas": aqui null e MATRIZ.
  begin
    perform * from mutual_carga_linhas(null);
    assert false, 'a carga sem unidade tinha de ser recusada';
  exception when others then null;
  end;

  select count(*) into n from mutual_carga_linhas(r_mat);
  assert n = 4, format('a matriz tem 4 objetos VIVOS (101,102,103,104); veio %s', n);

  select count(*) into n from mutual_carga_linhas(r_mat, true);
  assert n = 5, format('com inativos a matriz tem 5 (entra o 105); veio %s', n);

  -- O 106 e da vizinha: a carga da matriz nao o enxerga NUNCA.
  assert not exists (select 1 from mutual_carga_linhas(r_mat, true)
                      where placa = 'FFF6F66'),
    'objeto da unidade vizinha nao pode aparecer na carga da matriz';

  select count(*) into n from mutual_carga_linhas(r_mat, false, true);
  assert n = 2, format('2 recusas esperadas (CPF invalido e 0 km); veio %s', n);

  select problema into v_txt from mutual_carga_linhas(r_mat, false, true)
   where id_objeto = '104';
  assert v_txt like 'SEM PLACA%' and v_txt like '%9BWZZZ377VT000104%',
    format('a recusa do 0 km tem de NOMEAR o chassi para a operacao cobrar a placa; veio %L', v_txt);

  select problema into v_txt from mutual_carga_linhas(r_mat, false, true)
   where id_objeto = '103';
  assert v_txt like 'CPF/CNPJ invalido%',
    format('CPF invalido tem de ser recusa com motivo, nao erro; veio %L', v_txt);

  -- 🔴 A escada da ativacao: o 102 nao tem first_activation_date e NAO pode
  -- nascer "ativado hoje" — cai no created_at do contrato (2019-06-01).
  select data_ativacao, ativacao_estimada into v_dt, v_bool
    from mutual_carga_linhas(r_mat) where id_objeto = '102';
  assert v_dt = date '2019-06-01',
    format('sem first_activation_date a ativacao cai no created_at do contrato; veio %s', v_dt);
  assert v_dt <> current_date, 'a ativacao NUNCA pode ser hoje';
  assert v_bool, 'a linha tem de ANUNCIAR que a ativacao e estimada';

  select ativacao_estimada into v_bool
    from mutual_carga_linhas(r_mat) where id_objeto = '101';
  assert not v_bool, 'com first_activation_date a ativacao nao e estimada';

  -- Valor ZERO vira NULL: zero VAZA para o cotar_plano (0024).
  select valor_mensalidade into v_num from mutual_carga_linhas(r_mat) where id_objeto = '102';
  assert v_num is null, format('valor zero tem de virar NULL, nunca 0; veio %s', v_num);
  select valor_mensalidade into v_num from mutual_carga_linhas(r_mat) where id_objeto = '101';
  assert v_num = 189.90, format('o valor e a PARCELA, direto (0065); veio %s', v_num);

  -- O dia de vencimento vem do CONTRATO (0064), nao do objeto.
  select dia_vencimento into v_sm from mutual_carga_linhas(r_mat) where id_objeto = '102';
  assert v_sm = 15, format('o dia sai do contrato quando o objeto nao tem; veio %s', v_sm);

  -- O saneamento chega na leitura, nao so no helper.
  select chassi into v_txt from mutual_carga_linhas(r_mat) where id_objeto = '102';
  assert v_txt is null, 'o chassi placeholder tem de chegar NULL na leitura';
  select renavam into v_txt from mutual_carga_linhas(r_mat) where id_objeto = '102';
  assert v_txt is null, 'o renavam placeholder tem de chegar NULL na leitura';
  select placa into v_txt from mutual_carga_linhas(r_mat) where id_objeto = '101';
  assert v_txt = 'AAA1A11', format('a placa tem de chegar saneada; veio %L', v_txt);

  -- De-para por VINCULO (nunca palpite) e o endereco do associado.
  select tipo_veiculo_id into v_uuid from mutual_carga_linhas(r_mat) where id_objeto='101';
  assert v_uuid = tv, 'o tipo de veiculo tem de sair do vinculo registrado';
  select plano_id into v_uuid from mutual_carga_linhas(r_mat) where id_objeto='101';
  assert v_uuid = pl, 'o plano tem de sair do vinculo registrado';

  select endereco->>'cidade' into v_txt from mutual_carga_linhas(r_mat) where id_objeto = '101';
  assert v_txt = 'CUIABA', format('o endereco sai do /address/ do associado; veio %L', v_txt);

  -- ==========================================================================
  -- (C) A EXECUCAO SEM CONFIRMAR NAO ESCREVE NADA
  -- ==========================================================================
  select count(*) into n from veiculos;
  select count(*) into n2 from clientes;
  perform mutual_executar_carga(r_mat);
  assert (select count(*) from veiculos) = n,  'simulacao nao pode criar veiculo';
  assert (select count(*) from clientes) = n2, 'simulacao nao pode criar cliente';

  select veiculos_criados, clientes_criados, recusados into n, n2, n3
    from mutual_executar_carga(r_mat);
  assert n = 2,  format('a simulacao tem de prever 2 veiculos; veio %s', n);
  assert n2 = 1, format('os 2 veiculos sao do MESMO associado: 1 cliente; veio %s', n2);
  assert n3 = 2, format('e 2 recusas; veio %s', n3);

  -- A carga e da MATRIZ: gestor de unidade nao executa.
  perform set_config('request.jwt.claim.sub', u_ope::text, false);
  begin
    perform mutual_executar_carga(r_mat, false, true);
    assert false, 'gestor regional nao pode executar a carga';
  exception when others then null;
  end;
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- ==========================================================================
  -- (D) 🔴 A CARGA NAO GERA FATURA — a mina nº 1
  -- ==========================================================================
  select count(*) into n  from faturas;
  select count(*) into n2 from titulos_financeiros;

  perform mutual_executar_carga(r_mat, false, true);

  assert (select count(*) from faturas) = n,
    'a carga NAO pode gerar fatura: e cobrar de novo quem ja paga no Mutual';
  assert (select count(*) from titulos_financeiros) = n2,
    'a carga NAO pode gerar titulo';

  select count(*) into n from veiculos v
    join integracao_vinculos iv on iv.entidade='CONTRACT_OBJECT'
     and iv.tabela='veiculos' and iv.registro_id = v.id;
  assert n = 2, format('2 veiculos carregados; veio %s', n);

  assert (select count(*) from veiculos v
           join integracao_vinculos iv on iv.entidade='CONTRACT_OBJECT'
            and iv.tabela='veiculos' and iv.registro_id = v.id
          where v.cobranca_externa) = 2,
    'todo veiculo da carga entra com cobranca_externa — e o que desarma a mina';

  -- E o interruptor funciona pelo caminho que importa: veiculo_faturavel.
  select v.id into v_uuid from veiculos v where v.placa = 'AAA1A11';
  assert (select status::text from veiculos where id = v_uuid) = 'ativo',
    'o veiculo entra ATIVO: ele tem 24h, evento e portal — so a mensalidade sai de fora';
  assert not veiculo_faturavel(v_uuid, v_comp),
    'veiculo_faturavel tem de ser FALSE por cobranca_externa, e e por ela que '
    'passam as 5 rotas de fatura da 0025';

  -- A ativacao gravada nao e hoje (o trigger da 0025 carimbaria current_date).
  select data_ativacao into v_dt from veiculos where placa = 'BBB2B22';
  assert v_dt = date '2019-06-01',
    format('a data de ativacao gravada tem de ser a do Mutual; veio %s', v_dt);

  -- O saneamento chegou ao banco: NULL, nunca ''.
  select chassi into v_txt from veiculos where placa = 'BBB2B22';
  assert v_txt is null, 'chassi placeholder tem de estar NULL no banco';
  select renavam into v_txt from veiculos where placa='BBB2B22';
  assert v_txt is null, 'renavam placeholder tem de estar NULL no banco';

  -- A cor e a caixa alta seguem as convencoes da casa.
  select marca into v_txt from veiculos where placa='AAA1A11';
  assert v_txt = 'FIAT', format('marca em caixa alta; veio %L', v_txt);
  select modelo into v_txt from veiculos where placa='AAA1A11';
  assert v_txt = 'ARGO DRIVE 1.0', format('modelo em caixa alta; veio %L', v_txt);

  -- O associado: um, com os dois veiculos, na unidade da carga.
  select count(*) into n from clientes where cpf_cnpj = '52998224725';
  assert n = 1, format('um associado, nao dois; veio %s', n);
  select count(*) into n from veiculos v
    join clientes c on c.id = v.cliente_id
   where c.cpf_cnpj = '52998224725';
  assert n = 2, format('os dois veiculos no mesmo associado; veio %s', n);
  select regional_id into v_uuid from clientes where cpf_cnpj='52998224725';
  assert v_uuid = r_mat, 'o associado nasce na unidade da carga';

  -- ==========================================================================
  -- (E) A SEGUNDA RODADA ATUALIZA — nao duplica, e NAO desliga o cutover
  -- ==========================================================================
  select count(*) into n from veiculos;
  select count(*) into n2 from clientes;

  -- O cutover: a partir daqui a unidade passa a faturar AQUI.
  update veiculos set cobranca_externa = false where placa = 'AAA1A11';
  -- E alguem escolheu um plano na mao, trabalho de outubro.
  update veiculos set alienado = true, quilometragem = 45000 where placa = 'AAA1A11';

  perform mutual_executar_carga(r_mat, false, true);

  assert (select count(*) from veiculos) = n,
    'a segunda rodada nao pode criar veiculo de novo (o vinculo existe)';
  assert (select count(*) from clientes) = n2,
    'a segunda rodada nao pode criar associado de novo';

  assert not (select cobranca_externa from veiculos where placa='AAA1A11'),
    '🔴 a re-execucao NAO pode religar cobranca_externa: isso desligaria o '
    'faturamento da unidade em silencio depois do cutover';
  assert (select alienado from veiculos where placa='AAA1A11'),
    'a re-execucao nao pode desfazer o que o SCar preencheu (alienado)';
  assert (select quilometragem from veiculos where placa='AAA1A11') = 45000,
    'a re-execucao nao pode apagar a quilometragem digitada aqui';

  -- Mas o que o MUTUAL e dono, ele atualiza (convivencia: quem manda e ele).
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','101','contract_id','9001','contract_status','ATIVO',
      'status','SUSPENSO','plan_id','71','final_total_value','199.90',
      'first_activation_date','2021-05-03T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','aaa-1a11',
        'vehicle_chassi','9bwzzz377vt000001','vehicle_renavam','00328938998',
        'vehicle_assembler','fiat','vehicle_model','argo drive 1.0',
        'vehicle_type','1','vehicle_use_type','1'),
      'person_data', jsonb_build_object('person_id','P1',
        'person_cpf_cnpj','529.982.247-25','person_name','JOAO DA SILVA'))
  ));
  -- 🔴 E O VEICULO JA CARREGADO NAO PODE SAIR DO LOTE quando o status dele
  -- sai da carteira viva: senao a ficha daqui ficaria `ativo` para sempre.
  select count(*) into n from mutual_carga_linhas(r_mat) where id_objeto = '101';
  assert n = 1,
    'o objeto JA CARREGADO tem de continuar no lote mesmo suspenso — e por ele '
    'que o cancelamento feito no Mutual chega aqui';

  perform mutual_executar_carga(r_mat, false, true);
  assert (select status::text from veiculos where placa='AAA1A11') = 'suspenso',
    'o status vem do Mutual a cada rodada — e o que "quem manda e o Mutual" significa';
  assert (select valor_mensalidade from veiculos where placa='AAA1A11') = 199.90,
    'o valor tambem vem do Mutual a cada rodada';

  -- O cancelamento: INATIVO no Mutual tem de CHEGAR aqui.
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','101','contract_id','9001','contract_status','INATIVO',
      'status','INATIVO','plan_id','71','final_total_value','199.90',
      'first_activation_date','2021-05-03T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','aaa-1a11',
        'vehicle_chassi','9bwzzz377vt000001','vehicle_renavam','00328938998',
        'vehicle_type','1','vehicle_use_type','1'),
      'person_data', jsonb_build_object('person_id','P1',
        'person_cpf_cnpj','529.982.247-25','person_name','JOAO DA SILVA'))
  ));
  perform mutual_executar_carga(r_mat, false, true);
  assert (select status::text from veiculos where placa='AAA1A11') = 'inativo',
    'o cancelamento feito no Mutual tem de chegar ao SCar na rodada seguinte';
  -- E a saida ganha data (0078), porque `inativo` e saida definitiva.
  assert (select data_saida from veiculos where placa='AAA1A11') is not null,
    'inativo e saida definitiva: o trigger da 0078 tem de carimbar data_saida';

  -- Volta o 101 para ATIVO, para o resto do teste seguir legivel.
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','101','contract_id','9001','contract_status','ATIVO',
      'status','ATIVO','plan_id','71','final_total_value','199.90',
      'first_activation_date','2021-05-03T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','aaa-1a11',
        'vehicle_chassi','9bwzzz377vt000001','vehicle_renavam','00328938998',
        'vehicle_type','1','vehicle_use_type','1'),
      'person_data', jsonb_build_object('person_id','P1',
        'person_cpf_cnpj','529.982.247-25','person_name','JOAO DA SILVA'))
  ));
  perform mutual_executar_carga(r_mat, false, true);
  assert (select status::text from veiculos where placa='AAA1A11') = 'ativo',
    'e a reativacao tambem';

  -- 🔴 E a reativacao NAO pode gerar cobranca: o AAA1A11 esta com
  -- cobranca_externa = false (cutover), entao `veiculo_faturavel` e TRUE e o
  -- trigger da 0025 dispara de verdade. Isto NAO e defeito — e o cutover
  -- funcionando: dali para frente a mensalidade sai daqui.
  assert veiculo_faturavel((select id from veiculos where placa='AAA1A11'), v_comp),
    'depois do cutover o veiculo volta a ser faturavel aqui';

  -- ==========================================================================
  -- (F) A PREVIA fala das FILAS, nao so das recusas
  -- ==========================================================================
  select valor into n from mutual_carga_previa(r_mat)
   where indicador = 'Entram SEM valor de mensalidade';
  assert n = 1, format('o 102 entra sem valor e a previa tem de dizer; veio %s', n);

  select valor into n from mutual_carga_previa(r_mat)
   where indicador = 'Ativacao ESTIMADA pelo created_at';
  assert n = 1, format('o 102 tem ativacao estimada; veio %s', n);

  select valor into n from mutual_carga_previa(r_mat) where indicador = 'Linhas recusadas';
  assert n = 2, format('2 recusadas na previa; veio %s', n);

  -- ==========================================================================
  -- (G) O CAMINHO DE VOLTA — e ele PARA no que ja tem trabalho em cima
  -- ==========================================================================
  select id into v_uuid from veiculos where placa = 'AAA1A11';
  insert into vistorias (veiculo_id, tipo) values (v_uuid, 'ENTRADA');
  assert veiculo_tem_movimento(v_uuid),
    'veiculo com vistoria tem movimento: deixou de ser copia do Mutual';

  select veiculos_removidos, preservados into n, n2 from mutual_desfazer_carga(r_mat);
  assert n2 = 1, format('1 veiculo tem de ser PRESERVADO; veio %s', n2);
  assert n = 1,  format('o outro sai; veio %s', n);

  select veiculos_removidos, clientes_removidos, preservados
    into n, n2, n3 from mutual_desfazer_carga(r_mat, true);
  assert n = 1, format('o desfazer remove 1; veio %s', n);
  assert (select count(*) from veiculos where placa='AAA1A11') = 1,
    'o veiculo com vistoria tem de CONTINUAR na base';
  assert (select count(*) from veiculos where placa='BBB2B22') = 0,
    'o veiculo sem movimento tem de sair';
  -- O associado fica: ele ainda tem o veiculo preservado.
  assert (select count(*) from clientes where cpf_cnpj='52998224725') = 1,
    'o associado com veiculo remanescente nao pode ser apagado';

  -- ==========================================================================
  -- (H) A REGRA DA FASE 1 VALE PARA O QUE NAO FOI CARREGADO
  -- ==========================================================================
  -- A unidade vizinha nunca foi carregada, e nada dela entrou.
  assert (select count(*) from veiculos where regional_id = r_out) = 0,
    'a carga da matriz nao pode ter tocado na unidade vizinha';
  assert (select count(*) from veiculos where placa='EEE5E55') = 0,
    'o INATIVO nao entra com p_incluir_inativos = false';

  raise notice '=== TODOS OS TESTES DA CARGA DO MUTUAL (0084) PASSARAM ===';
end $$;
