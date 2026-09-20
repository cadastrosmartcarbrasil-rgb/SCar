-- Teste funcional da EQUIPE DE VENDAS (0083): o nivel do Mutual que corresponde
-- a `regionais` do SCar, e o agrupamento das equipes duplicadas.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r_rib uuid; r_sp uuid;
  n int; v_txt text; v_uuid uuid; rec record;
begin
  -- ===================================================== setup
  insert into auth.users (id, email) values (u_adm, 'adm83@t.com');
  insert into regionais (nome) values ('RIBEIRAO PRETO 83') returning id into r_rib;
  insert into regionais (nome) values ('SAO PAULO 83')      returning id into r_sp;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm, 'Admin', 'adm83@t.com', 'admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- A macrorregiao (o nivel de CIMA) e as equipes (o nivel que importa).
  perform mutual_registrar_captura('REGIONAL', jsonb_build_array(
    jsonb_build_object('id','3','name','Regional Sudeste')
  ));
  perform mutual_registrar_captura('SALE_TEAM', jsonb_build_array(
    jsonb_build_object('id','4','name','EQUIPE RIBEIRAO A'),
    jsonb_build_object('id','21','name','EQUIPE RIBEIRAO B'),
    jsonb_build_object('id','23','name','EQUIPE CAPITAL')
  ));
  perform mutual_registrar_captura('CONSULTANT', jsonb_build_array(
    jsonb_build_object('id','C1','name','VENDEDOR UM','sales_team_id','4'),
    jsonb_build_object('id','C2','name','VENDEDOR DOIS','sales_team_id','4')
  ));

  -- O contrato traz a equipe; o objeto traz a chave VAZIA (o caso real).
  perform mutual_registrar_captura('CONTRACT', jsonb_build_array(
    jsonb_build_object('id','9001','regional_id','3','sales_team_id','4','consultant_id','C1','due_day','10'),
    jsonb_build_object('id','9002','regional_id','3','sales_team_id','21','consultant_id','C2','due_day','10'),
    jsonb_build_object('id','9003','regional_id','3','sales_team_id','23','due_day','10'),
    -- equipe 99 NAO esta no cadastro: aparece so aqui
    jsonb_build_object('id','9004','regional_id','3','sales_team_id','99','due_day','10')
  ));
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','101','contract_id','9001','contract_status','ATIVO','status','ATIVO',
      'sales_team_id','', 'final_total_value','189.90','first_activation_date','2021-05-03T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','AAA1A11'),
      'person_data',  jsonb_build_object('person_id','P1','person_cpf_cnpj','529.982.247-25','person_name','JOAO')),
    jsonb_build_object('id','102','contract_id','9002','contract_status','ATIVO','status','ATIVO',
      'final_total_value','150.00','first_activation_date','2022-01-10T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','BBB2B22'),
      'person_data',  jsonb_build_object('person_id','P2','person_cpf_cnpj','168.995.350-09','person_name','MARIA')),
    jsonb_build_object('id','103','contract_id','9003','contract_status','ATIVO','status','ATIVO',
      'final_total_value','170.00','first_activation_date','2022-02-10T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','CCC3C33'),
      'person_data',  jsonb_build_object('person_id','P3','person_cpf_cnpj','111.444.777-35','person_name','ANA')),
    jsonb_build_object('id','104','contract_id','9004','contract_status','ATIVO','status','ATIVO',
      'final_total_value','160.00','first_activation_date','2022-03-10T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','DDD4D44'),
      'person_data',  jsonb_build_object('person_id','P4','person_cpf_cnpj','529.982.247-25','person_name','JOAO')),
    -- sem contrato: cai na reserva (a filial do associado)
    jsonb_build_object('id','105','contract_id','9999','contract_status','ATIVO','status','ATIVO',
      'final_total_value','140.00','first_activation_date','2022-04-10T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','EEE5E55'),
      'person_data',  jsonb_build_object('person_id','P5','person_cpf_cnpj','168.995.350-09','person_name','MARIA'))
  ));
  perform mutual_registrar_captura('PERSON', jsonb_build_array(
    jsonb_build_object('id','P5','name','MARIA','cpf_cnpj','168.995.350-09','regional_id','3')
  ));

  -- ==========================================================================
  -- (A) A EQUIPE VEM DO CONTRATO — o objeto tem a chave e ela e vazia
  -- ==========================================================================
  select mutual_equipe_do_objeto(o.payload, c.payload) into v_txt
    from mutual_captura o
    join mutual_captura c on c.entidade='CONTRACT' and c.id_externo = o.payload->>'contract_id'
   where o.entidade='CONTRACT_OBJECT' and o.id_externo='101';
  assert v_txt = '4',
    format('a equipe tem de vir do CONTRATO (sales_team_id=4); veio %L', v_txt);

  -- Sem contrato, nao ha equipe: vazio vira NULL, nunca ''.
  select mutual_equipe_do_objeto(payload, null) into v_txt
    from mutual_captura where entidade='CONTRACT_OBJECT' and id_externo='101';
  assert v_txt is null,
    format('objeto.sales_team_id vazio tem de dar NULL; veio %L', v_txt);

  -- ==========================================================================
  -- (B) 🔴 O AGRUPAMENTO — VARIAS equipes viram UMA regional
  -- ==========================================================================
  -- E o caso real: 7 equipes do Sudeste para 2 unidades. O `unique` do vinculo
  -- e so do lado externo (0082), e e isto que ele existe para permitir.
  perform vincular_externo('SALE_TEAM','4','regionais',  r_rib);
  perform vincular_externo('SALE_TEAM','21','regionais', r_rib);
  perform vincular_externo('SALE_TEAM','23','regionais', r_sp);

  assert mutual_equipe_do_externo('4')  = r_rib, 'equipe 4 -> Ribeirao';
  assert mutual_equipe_do_externo('21') = r_rib, 'equipe 21 -> Ribeirao (AGRUPADA com a 4)';
  assert mutual_equipe_do_externo('23') = r_sp,  'equipe 23 -> Sao Paulo';
  assert mutual_equipe_do_externo('99') is null, 'equipe sem vinculo NAO resolve';

  select count(*) into n from integracao_vinculos
   where entidade='SALE_TEAM' and tabela='regionais' and registro_id = r_rib;
  assert n = 2, format('duas equipes podem apontar para a MESMA regional; vieram %s', n);

  -- ==========================================================================
  -- (C) A UNIDADE DO OBJETO: a EQUIPE manda, a filial e reserva
  -- ==========================================================================
  select mutual_regional_do_objeto(o.payload, c.payload) into v_uuid
    from mutual_captura o
    join mutual_captura c on c.entidade='CONTRACT' and c.id_externo = o.payload->>'contract_id'
   where o.entidade='CONTRACT_OBJECT' and o.id_externo='102';
  assert v_uuid = r_rib, 'a unidade sai da EQUIPE (21 -> Ribeirao)';

  -- O objeto 105 nao tem contrato. Sem de-para da FILIAL ele fica sem unidade...
  select mutual_regional_do_objeto(payload, null) into v_uuid
    from mutual_captura where entidade='CONTRACT_OBJECT' and id_externo='105';
  assert v_uuid is null, 'sem contrato e sem de-para de filial, nao ha unidade — e correto';

  -- ...e COM o de-para da filial ele e resgatado pela reserva.
  perform vincular_externo('REGIONAL','3','regionais', r_sp);
  select mutual_regional_do_objeto(payload, null) into v_uuid
    from mutual_captura where entidade='CONTRACT_OBJECT' and id_externo='105';
  assert v_uuid = r_sp, 'objeto sem contrato cai na FILIAL do associado (a reserva)';

  -- 🔴 Mas a reserva NUNCA vence a equipe: o objeto 102 tem filial 3 (-> Sao Paulo)
  -- e equipe 21 (-> Ribeirao). Quem decide e a equipe.
  select mutual_regional_do_objeto(o.payload, c.payload) into v_uuid
    from mutual_captura o
    join mutual_captura c on c.entidade='CONTRACT' and c.id_externo = o.payload->>'contract_id'
   where o.entidade='CONTRACT_OBJECT' and o.id_externo='102';
  assert v_uuid = r_rib,
    'a MACRORREGIAO nao pode vencer a equipe — ela junta unidades diferentes';

  -- ==========================================================================
  -- (D) A TELA DO AGRUPAMENTO
  -- ==========================================================================
  select * into rec from mutual_equipes_vendas() where id_externo = '4';
  assert rec.nome = 'EQUIPE RIBEIRAO A', format('nome da equipe; veio %L', rec.nome);
  assert rec.faturaveis = 1, format('a equipe 4 tem 1 faturavel; veio %s', rec.faturaveis);
  assert rec.consultores = 2, format('a equipe 4 tem 2 vendedores; veio %s', rec.consultores);
  assert rec.macrorregiao = 'Regional Sudeste', 'a macrorregiao torna o agrupamento legivel';
  assert rec.regional_id = r_rib, 'o de-para registrado aparece na tela';
  assert rec.capturada, 'a equipe 4 esta no cadastro';

  -- 🔴 A equipe que aparece SO no contrato tem PESO e nao tem NOME — e isso
  -- precisa ser visivel, senao some da tela justamente quem falta agrupar.
  select * into rec from mutual_equipes_vendas() where id_externo = '99';
  assert rec.nome is null and not rec.capturada,
    'equipe so no contrato entra na lista marcada como NAO capturada';
  assert rec.faturaveis = 1, format('e ela carrega carteira: %s', rec.faturaveis);

  select count(*) into n from mutual_equipes_vendas();
  assert n = 4, format('3 no cadastro + 1 so no contrato = 4 linhas; vieram %s', n);

  -- ==========================================================================
  -- (E) O FUNIL mede a corrente CERTA
  -- ==========================================================================
  select objetos into n from mutual_cobertura_unidade(true) where passo = 1;
  assert n = 5, format('5 faturaveis no cenario; o funil viu %s', n);
  select objetos into n from mutual_cobertura_unidade(true) where passo = 2;
  assert n = 4, format('4 com contrato (o 105 nao tem); veio %s', n);
  select objetos into n from mutual_cobertura_unidade(true) where passo = 3;
  assert n = 4, format('os 4 com contrato tem equipe; veio %s', n);
  select objetos into n from mutual_cobertura_unidade(true) where passo = 4;
  assert n = 3, format('a equipe 99 nao esta no cadastro; veio %s', n);
  select objetos into n from mutual_cobertura_unidade(true) where passo = 5;
  assert n = 3, format('3 agrupados (4, 21 e 23); veio %s', n);
  select perdidos into n from mutual_cobertura_unidade(true) where passo = 4;
  assert n = 1, format('o degrau 4 perde exatamente a equipe 99; veio %s', n);

  -- ==========================================================================
  -- (F) A REGRA DA FASE 1 continua
  -- ==========================================================================
  perform mutual_equipes_vendas();
  perform mutual_cobertura_unidade(true);
  select count(*) into n from clientes;  assert n = 0, 'Fase 1 NAO cria cliente';
  select count(*) into n from veiculos;  assert n = 0, 'Fase 1 NAO cria veiculo';
  select count(*) into n from titulos_financeiros; assert n = 0, 'Fase 1 NAO cria titulo';
  select count(*) into n from faturas;   assert n = 0, 'Fase 1 NAO cria fatura';

  raise notice '=== TESTES 0083 (equipe de vendas do Mutual) PASSARAM ===';
end $$;
