-- Teste funcional da 0142. Prova que a cor resolvida UMA vez por cor distinta
-- da o mesmo resultado de antes: dois objetos com a mesma cor recebem a cor do
-- catalogo (inclusive com espaco em volta do id), cor sem captura e objeto sem
-- cor ficam nulos, e a carga grava a cor no veiculo.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r_mat uuid; id_prata uuid; v_cor uuid; v_txt text;
begin
  insert into auth.users (id, email) values (u_adm,'adm142@t.com');
  insert into regionais (nome) values ('Matriz 142') returning id into r_mat;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm142@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into id_prata from cores where nome = 'PRATA';
  assert id_prata is not null, 'o catalogo tem PRATA';

  perform mutual_registrar_captura('VEHICLE_COLOR', jsonb_build_array(
    jsonb_build_object('id','7','name','Prata')));
  perform mutual_registrar_captura('SALE_TEAM', jsonb_build_array(
    jsonb_build_object('id','42','name','EQUIPE 142')));
  perform vincular_externo('SALE_TEAM','42','regionais', r_mat);
  perform mutual_registrar_captura('PERSON', jsonb_build_array(
    jsonb_build_object('id','P1','name','UM','cpf_cnpj','529.982.247-25','person_type','1'),
    jsonb_build_object('id','P2','name','DOIS','cpf_cnpj','168.995.350-09','person_type','1')));
  perform mutual_registrar_captura('CONTRACT', jsonb_build_array(
    jsonb_build_object('id','9201','sales_team_id','42','due_day','10',
      'created_at','2024-01-10T12:00:00Z')));
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','401','contract_id','9201','contract_status','ATIVO','status','ATIVO',
      'final_total_value','150.00','first_activation_date','2024-01-10T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','DDD4D44','vehicle_type','1','vehicle_color','7'),
      'person_data', jsonb_build_object('person_id','P1')),
    jsonb_build_object('id','402','contract_id','9201','contract_status','ATIVO','status','ATIVO',
      'final_total_value','150.00','first_activation_date','2024-01-10T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','EEE5E55','vehicle_type','1','vehicle_color',' 7 '),
      'person_data', jsonb_build_object('person_id','P2')),
    jsonb_build_object('id','403','contract_id','9201','contract_status','ATIVO','status','ATIVO',
      'final_total_value','150.00','first_activation_date','2024-01-10T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','FFF6F66','vehicle_type','1','vehicle_color','99'),
      'person_data', jsonb_build_object('person_id','P2')),
    jsonb_build_object('id','404','contract_id','9201','contract_status','ATIVO','status','ATIVO',
      'final_total_value','150.00','first_activation_date','2024-01-10T03:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','GGG7G77','vehicle_type','1'),
      'person_data', jsonb_build_object('person_id','P2'))));

  assert (select cor_id from mutual_carga_linhas(r_mat) where id_objeto = '401') = id_prata,
    'a cor capturada resolve';
  select cor_id, cor into v_cor, v_txt from mutual_carga_linhas(r_mat) where id_objeto = '402';
  assert v_cor = id_prata and v_txt = 'PRATA', 'a mesma cor (com espaco no id) resolve igual';
  assert (select cor_id from mutual_carga_linhas(r_mat) where id_objeto = '403') is null,
    'cor nao capturada fica nula';
  assert (select cor_id from mutual_carga_linhas(r_mat) where id_objeto = '404') is null,
    'objeto sem cor fica nulo';

  perform mutual_executar_carga(r_mat, false, true);
  assert (select cor_id from veiculos where placa = 'DDD4D44') = id_prata, 'a carga grava a cor';
  assert (select cor_id from veiculos where placa = 'GGG7G77') is null, 'sem cor, sem cor';

  assert (select count(*) from pg_proc where proname = 'mutual_carga_linhas') = 1,
    'uma versao so de mutual_carga_linhas';

  raise notice '=== 0142 carga cor uma vez: TODOS OS TESTES PASSARAM ===';
end $$;
