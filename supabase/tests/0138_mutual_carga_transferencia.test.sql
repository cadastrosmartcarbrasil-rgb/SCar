-- Teste funcional da 0138. Prova: (1) o carro TRANSFERIDO no Mutual (contrato
-- novo, outro dono) assume o veiculo daqui em vez de ser recusado, e o dono e
-- o status passam a ser os do contrato novo; (2) na placa repetida fica o
-- objeto MAIS VIVO, mesmo quando o inativo e mais recente; (3) veiculo
-- cadastrado a mao aqui (sem vinculo do Mutual) continua sendo recusa;
-- (4) nada disso gera fatura nem duplica veiculo.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r_mat uuid; v_1 uuid; v_2 uuid; v_cli uuid;
  n int; n_fat int; n_tit int; v_txt text; v_st text;
begin
  insert into auth.users (id, email) values (u_adm,'adm138@t.com');
  insert into regionais (nome) values ('Matriz 138') returning id into r_mat;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm138@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  perform mutual_registrar_captura('SALE_TEAM', jsonb_build_array(
    jsonb_build_object('id','41','name','EQUIPE 138')));
  perform vincular_externo('SALE_TEAM','41','regionais', r_mat);

  perform mutual_registrar_captura('PERSON', jsonb_build_array(
    jsonb_build_object('id','Q1','name','DONO ANTIGO','cpf_cnpj','529.982.247-25','person_type','1'),
    jsonb_build_object('id','Q2','name','DONO NOVO','cpf_cnpj','168.995.350-09','person_type','1'),
    jsonb_build_object('id','Q3','name','TERCEIRO VIVO','cpf_cnpj','111.444.777-35','person_type','1'),
    jsonb_build_object('id','Q4','name','QUARTO ANTIGO','cpf_cnpj','390.533.447-05','person_type','1')
  ));
  perform mutual_registrar_captura('CONTRACT', jsonb_build_array(
    jsonb_build_object('id','9101','sales_team_id','41','due_day','10',
      'created_at','2024-01-10T12:00:00Z')));

  -- Primeira rodada: dois carros ativos, cada um com o seu dono.
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','301','contract_id','9101','contract_status','ATIVO',
      'status','ATIVO','final_total_value','150.00','updated_at','2025-01-01T12:00:00Z',
      'first_activation_date','2024-01-10T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','AAA1A11','vehicle_type','1'),
      'person_data', jsonb_build_object('person_id','Q1')),
    jsonb_build_object('id','304','contract_id','9101','contract_status','ATIVO',
      'status','ATIVO','final_total_value','120.00','updated_at','2025-01-01T12:00:00Z',
      'first_activation_date','2024-01-10T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','BBB2B22','vehicle_type','1'),
      'person_data', jsonb_build_object('person_id','Q4'))
  ));
  perform mutual_executar_carga(r_mat, false, true);
  v_1 := registro_do_externo('CONTRACT_OBJECT','301','MUTUAL');
  v_2 := registro_do_externo('CONTRACT_OBJECT','304','MUTUAL');
  assert v_1 is not null and v_2 is not null, 'primeira carga traz os dois';

  -- Veiculo cadastrado A MAO aqui, sem vinculo do Mutual.
  select cliente_id into v_cli from veiculos where id = v_1;
  insert into veiculos (cliente_id, placa, marca, modelo, regional_id, status)
    values (v_cli, 'CCC3C33', 'X', 'Y', r_mat, 'ativo');

  -- No Mutual: (1) o 301 foi cancelado e o carro foi revendido ao Q2 (302);
  -- (2) o 304 ficou INATIVO e e o mais recente, mas o mesmo carro tem um
  -- contrato VIVO do Q3 (303), mais antigo; (3) o 305 e a placa do carro
  -- cadastrado a mao.
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','301','contract_id','9101','contract_status','CANCELADO',
      'status','INATIVO','final_total_value','150.00','updated_at','2025-06-01T12:00:00Z',
      'first_activation_date','2024-01-10T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','AAA1A11','vehicle_type','1'),
      'person_data', jsonb_build_object('person_id','Q1')),
    jsonb_build_object('id','302','contract_id','9101','contract_status','ATIVO',
      'status','ATIVO','final_total_value','170.00','updated_at','2025-07-01T12:00:00Z',
      'first_activation_date','2025-07-01T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','AAA1A11','vehicle_type','1'),
      'person_data', jsonb_build_object('person_id','Q2')),
    jsonb_build_object('id','303','contract_id','9101','contract_status','PENDENTE_VISTORIA',
      'status','ATIVO','final_total_value','130.00','updated_at','2025-02-01T12:00:00Z',
      'first_activation_date','2025-02-01T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','BBB2B22','vehicle_type','1'),
      'person_data', jsonb_build_object('person_id','Q3')),
    jsonb_build_object('id','304','contract_id','9101','contract_status','INATIVO',
      'status','INATIVO','final_total_value','120.00','updated_at','2025-09-01T12:00:00Z',
      'first_activation_date','2024-01-10T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','BBB2B22','vehicle_type','1'),
      'person_data', jsonb_build_object('person_id','Q4')),
    jsonb_build_object('id','305','contract_id','9101','contract_status','ATIVO',
      'status','ATIVO','final_total_value','99.00','updated_at','2025-07-01T12:00:00Z',
      'first_activation_date','2025-07-01T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','CCC3C33','vehicle_type','1'),
      'person_data', jsonb_build_object('person_id','Q2'))
  ));

  -- ===================================================== a leitura
  select acao into v_txt from mutual_carga_linhas(r_mat) where id_objeto = '302';
  assert v_txt = 'ATUALIZAR', format('(1) o contrato novo ASSUME o veiculo; veio %L', v_txt);
  assert (select veiculo_id from mutual_carga_linhas(r_mat) where id_objeto = '302') = v_1,
    '(1) e assume o veiculo que ja existe, nao cria outro';
  select problema into v_txt from mutual_carga_linhas(r_mat) where id_objeto = '301';
  assert v_txt like '%repetida no lote%', format('(1) o antigo perde o desempate; veio %L', v_txt);

  select acao into v_txt from mutual_carga_linhas(r_mat) where id_objeto = '303';
  assert v_txt = 'ATUALIZAR',
    format('(2) o contrato VIVO vence o inativo mais recente; veio %L', v_txt);
  select problema into v_txt from mutual_carga_linhas(r_mat) where id_objeto = '304';
  assert v_txt like '%repetida no lote%', format('(2) o inativo fica de fora; veio %L', v_txt);

  select problema into v_txt from mutual_carga_linhas(r_mat) where id_objeto = '305';
  assert v_txt like '%ja cadastrada em outro veiculo do SCar%',
    format('(3) veiculo cadastrado a mao continua recusa; veio %L', v_txt);

  -- ===================================================== a carga
  select count(*) into n from veiculos;
  select count(*) into n_fat from faturas;
  select count(*) into n_tit from titulos_financeiros;
  perform mutual_executar_carga(r_mat, false, true);

  assert (select count(*) from veiculos) = n, '(4) a transferencia nao duplica veiculo';
  assert (select count(*) from faturas) = n_fat, '(4) nem gera fatura';
  assert (select count(*) from titulos_financeiros) = n_tit, '(4) nem titulo';

  select c.nome_razao_social, v.status::text into v_txt, v_st
    from veiculos v join clientes c on c.id = v.cliente_id where v.id = v_1;
  assert v_txt = 'DONO NOVO' and v_st = 'ativo',
    format('(1) o carro passa ao dono novo, ativo; veio %L / %L', v_txt, v_st);
  assert (select valor_mensalidade from veiculos where id = v_1) = 170,
    '(1) com o valor do contrato novo';
  assert registro_do_externo('CONTRACT_OBJECT','302','MUTUAL') = v_1, '(1) vinculo novo gravado';

  select c.nome_razao_social, v.status::text into v_txt, v_st
    from veiculos v join clientes c on c.id = v.cliente_id where v.id = v_2;
  assert v_txt = 'TERCEIRO VIVO' and v_st = 'vistoria_pendente',
    format('(2) o carro fica com o contrato vivo; veio %L / %L', v_txt, v_st);

  assert registro_do_externo('CONTRACT_OBJECT','305','MUTUAL') is null,
    '(3) o 305 nao entra';

  -- Re-execucao estavel: o antigo segue perdendo, nada volta ao dono antigo.
  perform mutual_executar_carga(r_mat, false, true);
  select c.nome_razao_social into v_txt
    from veiculos v join clientes c on c.id = v.cliente_id where v.id = v_1;
  assert v_txt = 'DONO NOVO', format('re-execucao mantem o dono novo; veio %L', v_txt);

  raise notice '=== 0138 carga transferencia: TODOS OS TESTES PASSARAM ===';
end $$;
