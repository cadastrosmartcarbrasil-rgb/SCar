-- Teste funcional do NOME DO PLANO LEGADO (0093). O que ele prova: o plano que
-- nao vem em PLAN ganha o nome pelo `plan_name` dos produtos dos veiculos; o
-- nome de PLAN continua mandando quando os dois existem; entre grafias
-- diferentes do mesmo id vence a mais frequente; sem nome em lugar nenhum o
-- plano continua na lista, sem nome; e quem nao e staff segue sem ler.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ass uuid := gen_random_uuid();
  r_mat uuid;
  v_txt text; v_bool boolean; n int;
begin
  -- ===================================================== setup
  insert into auth.users (id, email) values (u_adm,'adm93@t.com'), (u_ass,'ass93@t.com');
  insert into regionais (nome) values ('Matriz 93') returning id into r_mat;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm93@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  perform mutual_registrar_captura('SALE_TEAM', jsonb_build_array(
    jsonb_build_object('id','93','name','EQUIPE 93')));
  perform vincular_externo('SALE_TEAM','93','regionais', r_mat);
  perform mutual_registrar_captura('CONTRACT', jsonb_build_array(
    jsonb_build_object('id','9301','sales_team_id','93')));

  -- 930 vem em PLAN; 931 e 932 sao LEGADOS (so no produto); 933 nao tem nome.
  perform mutual_registrar_captura('PLAN', jsonb_build_array(
    jsonb_build_object('id','930','name','PLANO VENDAVEL 93')));

  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','9311','contract_id','9301','contract_status','ATIVO','status','ATIVO',
      'plan_id','930','final_total_value','100'),
    jsonb_build_object('id','9312','contract_id','9301','contract_status','ATIVO','status','ATIVO',
      'plan_id','931','final_total_value','100'),
    jsonb_build_object('id','9313','contract_id','9301','contract_status','ATIVO','status','ATIVO',
      'plan_id','932','final_total_value','100'),
    jsonb_build_object('id','9314','contract_id','9301','contract_status','ATIVO','status','ATIVO',
      'plan_id','933','final_total_value','100')));

  -- Uma linha POR VEICULO, com `plan_name` (formato real, 0092).
  perform mutual_registrar_captura('CONTRACT_OBJECT_PRODUCT', jsonb_build_array(
    -- o produto tem outra grafia do 930: PLAN tem de vencer
    jsonb_build_object('id','p1','contract_object_id','9311','plan_id',930,'plan_name','OUTRO NOME 930'),
    jsonb_build_object('id','p2','contract_object_id','9312','plan_id',931,'plan_name','V5 AUTOMOVEL COMUMMIG'),
    -- o 932 vem com duas grafias: vence a mais frequente
    jsonb_build_object('id','p3','contract_object_id','9313','plan_id',932,'plan_name','Plano Moto MT'),
    jsonb_build_object('id','p4','contract_object_id','9399','plan_id',932,'plan_name','Plano Moto MT'),
    jsonb_build_object('id','p5','contract_object_id','9398','plan_id',932,'plan_name','plano moto mt antigo'),
    -- produto sem nome nao conta
    jsonb_build_object('id','p6','contract_object_id','9314','plan_id',933,'plan_name','')));

  -- ==========================================================================
  -- (A) O LEGADO GANHA NOME PELO PRODUTO
  -- ==========================================================================
  select nome, capturado into v_txt, v_bool from mutual_planos_externos(r_mat) where id_externo = '931';
  assert v_txt = 'V5 AUTOMOVEL COMUMMIG', format('o legado 931 tem de vir com o nome do produto; veio %L', v_txt);
  assert v_bool, 'com nome conhecido, "capturado" e verdadeiro (a tela tira o "sem nome")';

  -- ==========================================================================
  -- (B) PLAN MANDA SOBRE O PRODUTO
  -- ==========================================================================
  select nome into v_txt from mutual_planos_externos(r_mat) where id_externo = '930';
  assert v_txt = 'PLANO VENDAVEL 93', format('o nome de PLAN vence o do produto; veio %L', v_txt);

  -- ==========================================================================
  -- (C) GRAFIAS DIFERENTES: VENCE A MAIS FREQUENTE
  -- ==========================================================================
  select nome into v_txt from mutual_planos_externos(r_mat) where id_externo = '932';
  assert v_txt = 'Plano Moto MT', format('vence a grafia mais frequente; veio %L', v_txt);

  -- ==========================================================================
  -- (D) SEM NOME EM LUGAR NENHUM: CONTINUA NA LISTA, SEM NOME
  -- ==========================================================================
  select nome, capturado into v_txt, v_bool from mutual_planos_externos(r_mat) where id_externo = '933';
  assert found, 'plano sem nome nao pode sumir da lista';
  assert v_txt is null and not v_bool, 'sem nome: nome nulo e capturado falso';

  -- Cada id aparece UMA vez (o full join das duas fontes nao duplica).
  select count(*) into n from mutual_planos_externos(r_mat) where id_externo in ('930','931','932','933');
  assert n = 4, format('um id por linha; vieram %s', n);

  -- ==========================================================================
  -- (E) QUEM NAO E STAFF
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', u_ass::text, false);
  begin
    perform * from mutual_planos_externos(r_mat);
    assert false, 'o associado do /portal nao le o de-para';
  exception when raise_exception then null;
  end;

  raise notice '=== 0093 mutual_nome_plano_legado: TODOS OS TESTES PASSARAM ===';
end $$;
