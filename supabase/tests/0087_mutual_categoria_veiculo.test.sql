-- Teste funcional do DE-PARA POR CATEGORIA (0087). O que ele prova: a chave e
-- o PAR categoria/tipo (a categoria PASSEIO mistura carro e moto); a categoria
-- MANDA e o tipo e RESERVA; sem vinculo de categoria nada muda em relacao a
-- 0084; a carga le a categoria; a tela pesa por unidade; e quem nao e staff
-- nao le.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ass uuid := gen_random_uuid();
  r_mat uuid; r_out uuid;
  t_passeio uuid; t_moto uuid; t_pickup uuid; t_diesel uuid;
  n int; v_txt text; v_uuid uuid; v_num numeric; v_bool boolean;
begin
  -- ===================================================== setup
  insert into auth.users (id, email) values (u_adm,'adm87@t.com'), (u_ass,'ass87@t.com');
  insert into regionais (nome) values ('Matriz 87')  returning id into r_mat;
  insert into regionais (nome) values ('Vizinha 87') returning id into r_out;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm87@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into t_passeio from tipos_veiculo where nome ilike 'passeio%' limit 1;
  select id into t_moto    from tipos_veiculo where nome ilike 'moto%'    limit 1;
  select id into t_pickup  from tipos_veiculo where nome ilike 'pick%'    limit 1;
  select id into t_diesel  from tipos_veiculo where nome ilike 'diesel%'  limit 1;
  assert t_passeio is not null and t_moto is not null and t_pickup is not null
     and t_diesel is not null, 'o seed tem de trazer Passeio, Moto, Pick-up e Diesel';

  perform vincular_externo('SALE_TEAM','90','regionais', r_mat);
  perform vincular_externo('SALE_TEAM','91','regionais', r_out);
  perform mutual_registrar_captura('CONTRACT', jsonb_build_array(
    jsonb_build_object('id','8701','sales_team_id','90'),
    jsonb_build_object('id','8702','sales_team_id','91')
  ));

  perform mutual_registrar_captura('VEHICLE_TYPE', jsonb_build_array(
    jsonb_build_object('id','1','name','CARRO'),
    jsonb_build_object('id','2','name','MOTO'),
    jsonb_build_object('id','3','name','CAMINHAO')
  ));
  perform mutual_registrar_captura('VEHICLE_CATEGORY', jsonb_build_array(
    jsonb_build_object('id','21','name','V5 / automóvel comum'),
    jsonb_build_object('id','24','name','V6 / pickups/vans/utilitários'),
    jsonb_build_object('id','26','name','PASSEIO'),
    jsonb_build_object('id','5','name','Caminhão Leve')
  ));

  -- Matriz: 21/1 x2 (um inativo), 24/1 x1, 26/1 x1, 26/2 x2, 5/3 x1 e 99/1
  -- (categoria NAO capturada). Vizinha: 24/1 x1.
  perform mutual_registrar_captura('CONTRACT_OBJECT', (
    select jsonb_agg(jsonb_build_object(
             'id', x.id, 'contract_id', x.ct, 'contract_status', x.st, 'status', x.st,
             'vehicle_data', jsonb_build_object('vehicle_plate', x.placa,
                               'vehicle_category', x.cat, 'vehicle_type', x.tp)))
      from (values
        ('8801','8701','ATIVO',  'AAA8A01','21','1'),
        ('8802','8701','INATIVO','AAA8A02','21','1'),
        ('8803','8701','ATIVO',  'AAA8A03','24','1'),
        ('8804','8701','ATIVO',  'AAA8A04','26','1'),
        ('8805','8701','ATIVO',  'AAA8A05','26','2'),
        ('8806','8701','ATIVO',  'AAA8A06','26','2'),
        ('8807','8701','ATIVO',  'AAA8A07','5','3'),
        ('8808','8701','ATIVO',  'AAA8A08','99','1'),
        ('8809','8702','ATIVO',  'AAA8A09','24','1')
      ) as x(id, ct, st, placa, cat, tp)));

  -- ==========================================================================
  -- (A) A CHAVE E O PAR
  -- ==========================================================================
  assert mutual_chave_categoria('26','2') = '26/2', 'a chave e categoria/tipo';
  assert mutual_chave_categoria(' 26 ','') = '26/?', 'tipo vazio vira ? — nunca some';
  assert mutual_chave_categoria('', '1') is null, 'sem categoria nao ha chave';
  assert mutual_chave_categoria(null, '1') is null, 'sem categoria nao ha chave (null)';

  -- ==========================================================================
  -- (B) SEM VINCULO DE CATEGORIA, NADA MUDA EM RELACAO A 0084
  -- ==========================================================================
  assert mutual_tipo_veiculo_do_objeto('21','1') is null,
    'sem vinculo nenhum, nulo — nunca palpite';
  perform vincular_externo('VEHICLE_TYPE','1','tipos_veiculo', t_passeio);
  assert mutual_tipo_veiculo_do_objeto('24','1') = t_passeio,
    'so com o vinculo do TIPO, a resposta e a da 0084 (reserva)';
  assert mutual_tipo_veiculo_do_objeto('24','1') = mutual_tipo_veiculo_do_externo('1'),
    'e identica a mutual_tipo_veiculo_do_externo';

  -- ==========================================================================
  -- (C) A CATEGORIA MANDA, O TIPO E RESERVA
  -- ==========================================================================
  perform vincular_externo('VEHICLE_CATEGORY','24/1','tipos_veiculo', t_pickup);
  assert mutual_tipo_veiculo_do_objeto('24','1') = t_pickup,
    'com o vinculo da categoria, ela vence o do tipo';
  assert mutual_tipo_veiculo_do_objeto('21','1') = t_passeio,
    'categoria SEM vinculo cai na reserva do tipo';

  -- 🔴 O PAR: vincular PASSEIO/MOTO nao pode arrastar PASSEIO/CARRO.
  perform vincular_externo('VEHICLE_CATEGORY','26/2','tipos_veiculo', t_moto);
  assert mutual_tipo_veiculo_do_objeto('26','2') = t_moto, 'PASSEIO/MOTO -> Moto';
  assert mutual_tipo_veiculo_do_objeto('26','1') = t_passeio,
    'PASSEIO/CARRO segue na reserva do tipo — a moto nao contamina o carro';

  -- ==========================================================================
  -- (D) A CARGA LE A CATEGORIA
  -- ==========================================================================
  select tipo_veiculo_id into v_uuid from mutual_carga_linhas(r_mat) where id_objeto = '8803';
  assert v_uuid = t_pickup, 'a carga usa o vinculo da categoria (24/1 -> Pick-up)';
  select tipo_veiculo_id into v_uuid from mutual_carga_linhas(r_mat) where id_objeto = '8805';
  assert v_uuid = t_moto, 'a carga separa PASSEIO/MOTO';
  select tipo_veiculo_id into v_uuid from mutual_carga_linhas(r_mat) where id_objeto = '8804';
  assert v_uuid = t_passeio, 'PASSEIO/CARRO pela reserva do tipo';
  select tipo_veiculo_id into v_uuid from mutual_carga_linhas(r_mat) where id_objeto = '8807';
  assert v_uuid is null, 'caminhao sem vinculo nenhum entra sem tipo';

  -- ==========================================================================
  -- (E) A TELA: peso por unidade, nome, destino e reserva
  -- ==========================================================================
  select count(*) into n from mutual_categorias_veiculo(r_mat);
  assert n = 6, format('6 pares na matriz (21/1, 24/1, 26/1, 26/2, 5/3, 99/1); veio %s', n);

  select veiculos, faturaveis into n, v_num from mutual_categorias_veiculo(r_mat) where chave = '21/1';
  assert n = 2 and v_num = 1, format('21/1: 2 veiculos, 1 faturavel; veio %s/%s', n, v_num);

  select faturaveis into v_num from mutual_categorias_veiculo(r_mat) where chave = '26/2';
  assert v_num = 2, format('26/2 tem 2 faturaveis; veio %s', v_num);
  select chave into v_txt from mutual_categorias_veiculo(r_mat) limit 1;
  assert v_txt = '26/2', format('o mais pesado vem primeiro; veio %L', v_txt);

  select count(*) into n from mutual_categorias_veiculo(r_mat)
   where chave = '24/1' and categoria_nome = 'V6 / pickups/vans/utilitários'
     and tipo_mutual = 'CARRO' and destino_id = t_pickup and reserva_id = t_passeio;
  assert n = 1, 'a linha traz o nome, o tipo do Mutual, o destino e a reserva';

  -- Categoria nao capturada aparece, com o peso e sem nome.
  select capturada, categoria_nome into v_bool, v_txt from mutual_categorias_veiculo(r_mat) where chave = '99/1';
  assert not v_bool and v_txt is null, 'categoria fora da captura aparece sem nome';

  -- Recorte por unidade: o 24/1 da vizinha nao entra no peso da matriz.
  select faturaveis into v_num from mutual_categorias_veiculo(r_mat) where chave = '24/1';
  assert v_num = 1, format('24/1 na matriz: 1; veio %s', v_num);
  select faturaveis into v_num from mutual_categorias_veiculo(null) where chave = '24/1';
  assert v_num = 2, format('24/1 na base inteira: 2; veio %s', v_num);

  -- A cobertura fecha em 100%.
  select max(cobertura_acumulada) into v_num from mutual_categorias_veiculo(r_mat);
  assert v_num = 100.0, format('a cobertura acumulada fecha em 100; veio %s', v_num);

  -- ==========================================================================
  -- (F) A REGRA DA FASE: nada escreve na operacao
  -- ==========================================================================
  select count(*) into n from veiculos;
  assert n = 0, 'ler o de-para e a previa nao cria veiculo';

  -- ==========================================================================
  -- (G) QUEM NAO E STAFF NAO LE
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', u_ass::text, false);
  begin
    perform * from mutual_categorias_veiculo(null);
    assert false, 'nao-staff nao pode ler o de-para';
  exception when raise_exception then null;
  end;

  raise notice '=== 0087 mutual_categoria_veiculo: TODOS OS TESTES PASSARAM ===';
end $$;
