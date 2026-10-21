-- Teste funcional do VEICULO 0 KM (0136). Prova: (1) placa vazia so com
-- zero_km E chassi — a regra e do banco; (2) varios 0 km convivem (NULL nao
-- colide no unique) e placa '' vira NULL; (3) a carga do Mutual passa a TRAZER
-- o sem placa com chassi, e recusa so o que nao tem identidade nenhuma; (4) a
-- re-execucao nao apaga a placa preenchida aqui e traz a placa quando o Mutual
-- a tiver; (5) nada disso gera fatura.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r_mat uuid; v_cli uuid; v_a uuid; v_b uuid; v_c uuid;
  n int; n2 int; v_txt text; v_bool boolean;
begin
  insert into auth.users (id, email) values (u_adm,'adm136@t.com');
  insert into regionais (nome) values ('Matriz 136') returning id into r_mat;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm136@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  perform mutual_registrar_captura('SALE_TEAM', jsonb_build_array(
    jsonb_build_object('id','40','name','EQUIPE MATRIZ')));
  perform vincular_externo('SALE_TEAM','40','regionais', r_mat);

  perform mutual_registrar_captura('PERSON', jsonb_build_array(
    jsonb_build_object('id','P1','name','TULIO ROCHA','cpf_cnpj','529.982.247-25','person_type','1'),
    jsonb_build_object('id','P2','name','MARIA SOUZA','cpf_cnpj','168.995.350-09','person_type','1'),
    jsonb_build_object('id','P3','name','SEM NADA','cpf_cnpj','111.444.777-35','person_type','1')
  ));
  perform mutual_registrar_captura('CONTRACT', jsonb_build_array(
    jsonb_build_object('id','9001','sales_team_id','40','due_day','10',
      'created_at','2024-10-31T12:00:00Z')));

  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    -- 201: moto sem placa, com chassi (o caso do Tulio)
    jsonb_build_object('id','201','contract_id','9001','contract_status','ATIVO',
      'status','ATIVO','final_total_value','97.00',
      'first_activation_date','2024-10-31T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','',
        'vehicle_chassi','9C6SG5920R0028234','vehicle_type','2',
        'vehicle_assembler','yamaha','vehicle_model','nmax 160'),
      'person_data', jsonb_build_object('person_id','P1')),
    -- 202: outro sem placa, com chassi, outra pessoa (dois NULL nao sao duplicata)
    jsonb_build_object('id','202','contract_id','9001','contract_status','ATIVO',
      'status','ATIVO','final_total_value','110.00',
      'first_activation_date','2025-01-10T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','0000000',
        'vehicle_chassi','9C2KC2200TR605999','vehicle_type','2'),
      'person_data', jsonb_build_object('person_id','P2')),
    -- 203: sem placa E sem chassi: recusa
    jsonb_build_object('id','203','contract_id','9001','contract_status','ATIVO',
      'status','ATIVO','final_total_value','90.00',
      'first_activation_date','2025-02-10T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate',''),
      'person_data', jsonb_build_object('person_id','P3'))
  ));

  -- ===================================================== (3) a leitura
  select count(*) into n from mutual_carga_linhas(r_mat, false, true);
  assert n = 1, format('so o 203 (sem placa E sem chassi) e recusa; veio %s', n);

  select problema into v_txt from mutual_carga_linhas(r_mat) where id_objeto = '203';
  assert v_txt like 'SEM PLACA E SEM CHASSI%', format('motivo do 203; veio %L', v_txt);

  select acao into v_txt from mutual_carga_linhas(r_mat) where id_objeto = '201';
  assert v_txt = 'CRIAR', format('o 0 km com chassi entra; veio %L', v_txt);
  select acao into v_txt from mutual_carga_linhas(r_mat) where id_objeto = '202';
  assert v_txt = 'CRIAR',
    format('dois sem placa no mesmo lote NAO sao duplicata um do outro; veio %L', v_txt);

  -- ===================================================== (5) carga sem fatura
  select count(*) into n from faturas;
  select count(*) into n2 from titulos_financeiros;
  perform mutual_executar_carga(r_mat, false, true);
  assert (select count(*) from faturas) = n, 'a carga do 0 km nao gera fatura';
  assert (select count(*) from titulos_financeiros) = n2, 'nem titulo';

  v_a := registro_do_externo('CONTRACT_OBJECT','201','MUTUAL');
  v_b := registro_do_externo('CONTRACT_OBJECT','202','MUTUAL');
  assert v_a is not null and v_b is not null, 'os dois 0 km foram carregados';
  assert registro_do_externo('CONTRACT_OBJECT','203','MUTUAL') is null, 'o 203 nao entra';

  select placa is null and zero_km and cobranca_externa into v_bool from veiculos where id = v_a;
  assert v_bool, 'o 0 km entra sem placa, marcado zero_km e com cobranca_externa';
  select chassi into v_txt from veiculos where id = v_a;
  assert v_txt = '9C6SG5920R0028234', format('a identidade do 0 km e o chassi; veio %L', v_txt);

  select count(*) into n from clientes where cpf_cnpj in ('52998224725','16899535009');
  assert n = 2, format('os associados dos 0 km entram junto; veio %s', n);

  -- ===================================================== (1) + (2) a regra do banco
  select cliente_id into v_cli from veiculos where id = v_a;

  begin
    insert into veiculos (cliente_id, placa, chassi, marca, modelo, regional_id)
      values (v_cli, null, '9BWZZZ377VT000777', 'X', 'Y', r_mat);
    assert false, 'sem placa e sem zero_km tem de ser recusado';
  exception when check_violation then null;
  end;

  begin
    insert into veiculos (cliente_id, placa, zero_km, marca, modelo, regional_id)
      values (v_cli, null, true, 'X', 'Y', r_mat);
    assert false, '0 km sem chassi tem de ser recusado (nao ha identidade)';
  exception when check_violation then null;
  end;

  insert into veiculos (cliente_id, placa, zero_km, chassi, marca, modelo, regional_id)
    values (v_cli, '  ', true, '9BWZZZ377VT000888', 'X', 'Y', r_mat)
    returning id into v_c;
  assert (select placa from veiculos where id = v_c) is null,
    'placa em branco tem de virar NULL, nunca '''' (colidiria no unique)';
  assert (select count(*) from veiculos where placa is null) = 3,
    'tres 0 km convivem: NULL nao colide no unique da placa';

  begin
    update veiculos set zero_km = false where id = v_c;
    assert false, 'desmarcar 0 km sem preencher a placa tem de ser recusado';
  exception when check_violation then null;
  end;

  -- ===================================================== (4) a re-execucao
  -- A operacao preencheu a placa do 201 aqui; o Mutual segue sem ela.
  update veiculos set placa = 'ABC1D23' where id = v_a;
  -- E o Mutual preencheu a placa do 202.
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','202','contract_id','9001','contract_status','ATIVO',
      'status','ATIVO','final_total_value','110.00',
      'first_activation_date','2025-01-10T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','xyz-9z99',
        'vehicle_chassi','9C2KC2200TR605999','vehicle_type','2'),
      'person_data', jsonb_build_object('person_id','P2'))));

  select count(*) into n from veiculos;
  perform mutual_executar_carga(r_mat, false, true);
  assert (select count(*) from veiculos) = n, 'a re-execucao nao duplica o 0 km';

  select placa into v_txt from veiculos where id = v_a;
  assert v_txt = 'ABC1D23',
    format('a re-execucao NAO pode apagar a placa preenchida aqui; veio %L', v_txt);
  assert (select zero_km from veiculos where id = v_a), 'zero_km fica como historico';

  select placa into v_txt from veiculos where id = v_b;
  assert v_txt = 'XYZ9Z99', format('a placa que chegou no Mutual vem na re-execucao; veio %L', v_txt);

  raise notice '=== 0136 veiculo zero km: TODOS OS TESTES PASSARAM ===';
end $$;
