-- Teste funcional da 0155. Prova: (1) o objeto INATIVO com evento no Mutual
-- entra na carga padrao (sem "incluir inativos"), como inativo, e o evento
-- dele entra no historico; (2) inativo sem evento continua fora; (3) inativo
-- com evento e sem placa (0 km) continua fora; (4) inativo com evento cuja
-- placa tem contrato mais vivo no lote nao vira recusa; (5) nada gera fatura.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r_mat uuid; v_1 uuid; n_fat int; n_tit int; v_txt text; n int;
begin
  insert into auth.users (id, email) values (u_adm,'adm155@t.com');
  insert into regionais (nome) values ('Matriz 155') returning id into r_mat;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm155@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  perform mutual_registrar_captura('SALE_TEAM', jsonb_build_array(
    jsonb_build_object('id','55','name','EQUIPE 155')));
  perform vincular_externo('SALE_TEAM','55','regionais', r_mat);

  perform mutual_registrar_captura('PERSON', jsonb_build_array(
    jsonb_build_object('id','P1','name','FURTADO','cpf_cnpj','529.982.247-25','person_type','1'),
    jsonb_build_object('id','P2','name','SEM EVENTO','cpf_cnpj','168.995.350-09','person_type','1'),
    jsonb_build_object('id','P3','name','ZERO KM','cpf_cnpj','111.444.777-35','person_type','1'),
    jsonb_build_object('id','P4','name','VIVO','cpf_cnpj','390.533.447-05','person_type','1')
  ));
  perform mutual_registrar_captura('CONTRACT', jsonb_build_array(
    jsonb_build_object('id','7001','sales_team_id','55','due_day','10',
      'created_at','2024-01-10T12:00:00Z'),
    jsonb_build_object('id','7002','sales_team_id','55','due_day','10',
      'created_at','2024-01-10T12:00:00Z'),
    jsonb_build_object('id','7003','sales_team_id','55','due_day','10',
      'created_at','2024-01-10T12:00:00Z'),
    jsonb_build_object('id','7004','sales_team_id','55','due_day','10',
      'created_at','2024-01-10T12:00:00Z'),
    jsonb_build_object('id','7005','sales_team_id','55','due_day','10',
      'created_at','2024-01-10T12:00:00Z')));

  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    -- 501: inativo, furtado (tem evento) -> entra
    jsonb_build_object('id','501','contract_id','7001','vehicle_id','901',
      'contract_status','INATIVO','status','ATIVO','final_total_value','161.00',
      'updated_at','2025-07-22T12:00:00Z','first_activation_date','2024-07-25T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','GFN4E13','vehicle_type','2'),
      'person_data', jsonb_build_object('person_id','P1')),
    -- 502: inativo sem evento -> fora
    jsonb_build_object('id','502','contract_id','7002','vehicle_id','902',
      'contract_status','INATIVO','status','INATIVO','final_total_value','100.00',
      'updated_at','2025-07-22T12:00:00Z','first_activation_date','2024-07-25T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','AAA1A11','vehicle_type','1'),
      'person_data', jsonb_build_object('person_id','P2')),
    -- 503: inativo com evento, sem placa -> fora (decisao de 22/10)
    jsonb_build_object('id','503','contract_id','7003','vehicle_id','903',
      'contract_status','INATIVO','status','INATIVO','final_total_value','100.00',
      'updated_at','2025-07-22T12:00:00Z','first_activation_date','2024-07-25T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_chassi','9C6SG5920R0028234','vehicle_type','2'),
      'person_data', jsonb_build_object('person_id','P3')),
    -- 504 inativo com evento e 505 ativo, MESMA placa -> vence o 505, o 504 some
    jsonb_build_object('id','504','contract_id','7004','vehicle_id','904',
      'contract_status','INATIVO','status','INATIVO','final_total_value','100.00',
      'updated_at','2025-09-01T12:00:00Z','first_activation_date','2024-07-25T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','BBB2B22','vehicle_type','1'),
      'person_data', jsonb_build_object('person_id','P2')),
    jsonb_build_object('id','505','contract_id','7005','vehicle_id','904',
      'contract_status','ATIVO','status','ATIVO','final_total_value','130.00',
      'updated_at','2025-02-01T12:00:00Z','first_activation_date','2025-02-01T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','BBB2B22','vehicle_type','1'),
      'person_data', jsonb_build_object('person_id','P4'))
  ));

  perform mutual_registrar_captura('EVENT', jsonb_build_array(
    jsonb_build_object('id','E1','protocol','202606082801371','person_id','P1',
      'vehicle_id','901','contract_id','7001','event_date','2026-06-05T05:22:00Z',
      'event_status','ANDAMENTO','type_involvement','VITIMA','total_value','18673'),
    jsonb_build_object('id','E3','protocol','3','person_id','P3',
      'vehicle_id','903','contract_id','7003','event_date','2026-06-05T05:22:00Z',
      'event_status','ANDAMENTO'),
    jsonb_build_object('id','E4','protocol','4','person_id','P2',
      'vehicle_id','904','contract_id','7004','event_date','2026-06-05T05:22:00Z',
      'event_status','ANDAMENTO')
  ));

  -- ===================================================== a leitura
  select acao into v_txt from mutual_carga_linhas(r_mat) where id_objeto = '501';
  assert v_txt = 'CRIAR', format('(1) inativo com evento entra sem a marca; veio %L', v_txt);
  assert (select status::text from mutual_carga_linhas(r_mat) where id_objeto = '501') = 'inativo',
    '(1) e entra como inativo';
  assert not exists (select 1 from mutual_carga_linhas(r_mat) where id_objeto = '502'),
    '(2) inativo sem evento segue fora';
  assert not exists (select 1 from mutual_carga_linhas(r_mat) where id_objeto = '503'),
    '(3) inativo 0 km com evento segue fora';
  assert not exists (select 1 from mutual_carga_linhas(r_mat) where id_objeto = '504'),
    '(4) inativo com evento que perde o desempate nao vira recusa';
  assert (select acao from mutual_carga_linhas(r_mat) where id_objeto = '505') = 'CRIAR',
    '(4) o contrato vivo da placa entra';
  -- Com a marca de inativos, o comportamento antigo vale (504 vira recusa).
  assert (select problema from mutual_carga_linhas(r_mat, true) where id_objeto = '504')
         like '%repetida no lote%', 'com a marca, o desempate segue aparecendo';

  -- ===================================================== a carga
  select count(*) into n_fat from faturas;
  select count(*) into n_tit from titulos_financeiros;
  perform mutual_executar_carga(r_mat, false, true);
  v_1 := registro_do_externo('CONTRACT_OBJECT','501','MUTUAL');
  assert v_1 is not null, '(1) o veiculo furtado foi carregado';
  assert (select status::text from veiculos where id = v_1) = 'inativo', '(1) inativo';
  assert (select cobranca_externa from veiculos where id = v_1), '(1) cobranca externa';
  assert registro_do_externo('CONTRACT_OBJECT','502','MUTUAL') is null, '(2) 502 fora';
  assert (select count(*) from faturas) = n_fat, '(5) nenhuma fatura';
  assert (select count(*) from titulos_financeiros) = n_tit, '(5) nenhum titulo';

  -- O evento entra no historico ligado ao veiculo carregado.
  perform mutual_importar_eventos_historico(true);
  select count(*) into n from eventos_historico where id_externo = 'E1' and veiculo_id = v_1;
  assert n = 1, '(1) o evento do furto entra no historico';

  -- Re-execucao estavel.
  perform mutual_executar_carga(r_mat, false, true);
  assert (select count(*) from veiculos where placa = 'GFN4E13') = 1, 're-execucao nao duplica';

  raise notice '=== 0155 carga inativo com evento: TODOS OS TESTES PASSARAM ===';
end $$;
