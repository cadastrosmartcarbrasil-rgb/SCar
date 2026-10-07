-- Teste funcional dos PRODUTOS ANINHADOS (0092). O que ele prova: o formato
-- real do Mutual (uma linha por veiculo com `products[]`) e lido item a item;
-- terceiros decide o plano; lista vazia e "nao sei"; e o formato da 0091 (uma
-- linha por produto) continua valendo.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r_mat uuid; t_moto uuid; pl_ouro uuid; pl_ess uuid; pl_prata uuid;
  cli uuid; v_com uuid; v_sem uuid; v_vazio uuid; v_antigo uuid; v_bool boolean; n int;
begin
  insert into auth.users (id, email) values (u_adm,'adm92@t.com');
  insert into regionais (nome) values ('Matriz 92') returning id into r_mat;
  insert into usuarios (id, nome, email, papel, regional_id) values (u_adm,'Admin','adm92@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into t_moto from tipos_veiculo where nome ilike 'moto%' limit 1;
  insert into planos_protecao (nome) values ('MOTO OURO 92') returning id into pl_ouro;
  insert into planos_protecao (nome) values ('MOTO ESSENCIAL 92') returning id into pl_ess;
  insert into planos_protecao (nome) values ('PRATA 92') returning id into pl_prata;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','ASSOCIADO 92','52998224725', r_mat) returning id into cli;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, valor_fipe, status, data_ativacao, plano_protecao_id, valor_mensalidade, cobranca_externa)
    values (cli,'MOT1A92', r_mat, t_moto, 14000,'ativo', current_date, pl_prata, 97, true) returning id into v_com;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, valor_fipe, status, data_ativacao, plano_protecao_id, valor_mensalidade, cobranca_externa)
    values (cli,'MOT2A92', r_mat, t_moto, 14000,'ativo', current_date, pl_prata, 80, true) returning id into v_sem;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, valor_fipe, status, data_ativacao, plano_protecao_id, valor_mensalidade, cobranca_externa)
    values (cli,'MOT3A92', r_mat, t_moto, 14000,'ativo', current_date, pl_prata, 60, true) returning id into v_vazio;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, valor_fipe, status, data_ativacao, plano_protecao_id, valor_mensalidade, cobranca_externa)
    values (cli,'MOT4A92', r_mat, t_moto, 14000,'ativo', current_date, null, 90, true) returning id into v_antigo;
  perform vincular_externo('CONTRACT_OBJECT','9201','veiculos', v_com);
  perform vincular_externo('CONTRACT_OBJECT','9202','veiculos', v_sem);
  perform vincular_externo('CONTRACT_OBJECT','9203','veiculos', v_vazio);
  perform vincular_externo('CONTRACT_OBJECT','9204','veiculos', v_antigo);

  -- O formato REAL: uma linha por veiculo, com products[] dentro (07/10/2026).
  perform mutual_registrar_captura('CONTRACT_OBJECT_PRODUCT', jsonb_build_array(
    jsonb_build_object('contract_object_id','9201','object_id','9201','plan_id',57,
      'plan_name','MOTOCICLETAS /SP/CAPITALMIG', 'products', jsonb_build_array(
        jsonb_build_object('object_id',9201,'product_id',56,'product_name','TAXA ADMINISTRATIVAMIG'),
        jsonb_build_object('object_id',9201,'product_id',300,'product_name','B-PROTEÇÃO TERCEIRO MOTO (ATÉ 15 M)MIG'))),
    jsonb_build_object('contract_object_id','9202','object_id','9202','plan_id',41,
      'products', jsonb_build_array(
        jsonb_build_object('object_id',9202,'product_id',56,'product_name','Taxa Administrativa'))),
    jsonb_build_object('contract_object_id','9203','object_id','9203','plan_id',46,'products','[]'::jsonb)));
  -- O formato da 0091 (uma linha por produto) continua valendo.
  perform mutual_registrar_captura('CONTRACT_OBJECT_PRODUCT', jsonb_build_array(
    jsonb_build_object('id','p92','contract_object_id',9204,'product_name','Proteção a terceiros')));

  select tem_terceiros into v_bool from mutual_terceiros_por_objeto(r_mat, t_moto) where veiculo_id = v_com;
  assert v_bool, 'aninhado com terceiros';
  select tem_terceiros into v_bool from mutual_terceiros_por_objeto(r_mat, t_moto) where veiculo_id = v_sem;
  assert v_bool = false, 'aninhado sem terceiros';
  select tem_terceiros into v_bool from mutual_terceiros_por_objeto(r_mat, t_moto) where veiculo_id = v_vazio;
  assert v_bool is null, 'lista vazia e "nao sei", nunca "nao tem"';
  select tem_terceiros into v_bool from mutual_terceiros_por_objeto(r_mat, t_moto) where veiculo_id = v_antigo;
  assert v_bool, 'o formato da 0091 continua lido';
  select produtos into n from mutual_terceiros_por_objeto(r_mat, t_moto) where veiculo_id = v_com;
  assert n = 2, format('conta os ITENS, nao a linha; veio %s', n);

  perform mutual_aplicar_plano_por_terceiros(r_mat, t_moto, pl_ouro, pl_ess, array[pl_prata], true);
  assert (select plano_protecao_id from veiculos where id = v_com)    = pl_ouro, 'com terceiros -> Ouro';
  assert (select plano_protecao_id from veiculos where id = v_sem)    = pl_ess,  'sem terceiros -> Essencial';
  assert (select plano_protecao_id from veiculos where id = v_vazio)  = pl_prata, 'sem produtos nao e tocado';
  assert (select plano_protecao_id from veiculos where id = v_antigo) = pl_ouro, 'formato antigo tambem aplica';

  raise notice '=== 0092 mutual_produtos_aninhados: TODOS OS TESTES PASSARAM ===';
end $$;
