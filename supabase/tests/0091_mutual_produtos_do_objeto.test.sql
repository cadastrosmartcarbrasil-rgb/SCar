-- Teste funcional do PLANO PELOS PRODUTOS DO VEICULO (0091). O que ele prova:
-- a allow-list aceita CONTRACT_OBJECT_PRODUCT sem perder nenhuma das 15; a
-- linha de produto e lida pelas chaves candidatas (e o nome cai no catalogo dos
-- planos quando so vem o id); terceiros decide o plano; veiculo sem produto
-- capturado NAO e tocado; plano fora de p_substituir fica; sem confirmar nada
-- muda; e quem nao e staff nao le nada.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ass uuid := gen_random_uuid();
  r_mat uuid; t_moto uuid; pl_ouro uuid; pl_ess uuid; pl_prata uuid; pl_rast uuid;
  cli uuid; v_com uuid; v_sem uuid; v_nada uuid; v_rast uuid; v_nome uuid;
  n int; v_txt text; v_bool boolean; v_uuid uuid;
begin
  -- ===================================================== setup
  insert into auth.users (id, email) values (u_adm,'adm91@t.com'), (u_ass,'ass91@t.com');
  insert into regionais (nome) values ('Matriz 91') returning id into r_mat;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm91@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into t_moto from tipos_veiculo where nome ilike 'moto%' limit 1;
  insert into planos_protecao (nome) values ('MOTO OURO 91')      returning id into pl_ouro;
  insert into planos_protecao (nome) values ('MOTO ESSENCIAL 91') returning id into pl_ess;
  insert into planos_protecao (nome) values ('PRATA CARRO 91')    returning id into pl_prata;
  insert into planos_protecao (nome) values ('RASTREAMENTO 91')   returning id into pl_rast;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','ASSOCIADO 91','52998224725', r_mat) returning id into cli;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, valor_fipe, status,
                        data_ativacao, plano_protecao_id, valor_mensalidade, cobranca_externa)
  values (cli,'MOT1A91', r_mat, t_moto, 14000,'ativo', current_date, pl_prata, 97, true) returning id into v_com;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, valor_fipe, status,
                        data_ativacao, plano_protecao_id, valor_mensalidade, cobranca_externa)
  values (cli,'MOT2A91', r_mat, t_moto, 14000,'ativo', current_date, null, 80, true) returning id into v_sem;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, valor_fipe, status,
                        data_ativacao, plano_protecao_id, valor_mensalidade, cobranca_externa)
  values (cli,'MOT3A91', r_mat, t_moto, 14000,'ativo', current_date, pl_prata, 90, true) returning id into v_nada;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, valor_fipe, status,
                        data_ativacao, plano_protecao_id, valor_mensalidade, cobranca_externa)
  values (cli,'MOT4A91', r_mat, t_moto, 14000,'ativo', current_date, pl_rast, 60, true) returning id into v_rast;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, valor_fipe, status,
                        data_ativacao, plano_protecao_id, valor_mensalidade, cobranca_externa)
  values (cli,'MOT5A91', r_mat, t_moto, 14000,'ativo', current_date, null, 99, true) returning id into v_nome;

  perform vincular_externo('CONTRACT_OBJECT','9101','veiculos', v_com);
  perform vincular_externo('CONTRACT_OBJECT','9102','veiculos', v_sem);
  perform vincular_externo('CONTRACT_OBJECT','9103','veiculos', v_nada);
  perform vincular_externo('CONTRACT_OBJECT','9104','veiculos', v_rast);
  perform vincular_externo('CONTRACT_OBJECT','9105','veiculos', v_nome);
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','9101','plan_id',57), jsonb_build_object('id','9102','plan_id',57),
    jsonb_build_object('id','9103','plan_id',57), jsonb_build_object('id','9104','plan_id',46),
    jsonb_build_object('id','9105','plan_id',41)));

  -- O catalogo: os planos ja trazem products[] com o id global.
  perform mutual_registrar_captura('PLAN', jsonb_build_array(jsonb_build_object('id','41','name','Plano Moto MT',
    'products', jsonb_build_array(
      jsonb_build_object('product_id',56,'product_name','Taxa Administrativa'),
      jsonb_build_object('product_id',41,'product_name','Proteção a terceiros')))));

  -- ==========================================================================
  -- (A) A ALLOW-LIST INTEIRA — as 15 de antes + a nova
  -- ==========================================================================
  foreach v_txt in array array[
    'CONTRACT_OBJECT','CONTRACT','PERSON','ADDRESS','INVOICE','EVENT',
    'REGIONAL','SALE_TEAM','CONSULTANT','PLAN',
    'VEHICLE_TYPE','VEHICLE_COLOR','VEHICLE_CATEGORY','VEHICLE_USE_TYPE','EVENT_TYPE',
    'CONTRACT_OBJECT_PRODUCT'
  ] loop
    insert into mutual_captura (entidade, id_externo, payload) values (v_txt, 'guarda91-' || v_txt, '{}'::jsonb);
  end loop;
  delete from mutual_captura where id_externo like 'guarda91-%';

  -- Linhas de produto em formatos DIFERENTES de proposito: o payload real
  -- ainda nao foi visto, e as candidatas tem de pegar cada um.
  perform mutual_registrar_captura('CONTRACT_OBJECT_PRODUCT', jsonb_build_array(
    -- com terceiros, nome na linha
    jsonb_build_object('id','p1','contract_object_id',9101,'product_id',56,'product_name','Taxa Administrativa'),
    jsonb_build_object('id','p2','contract_object_id',9101,'product_id',41,'product_name','Proteção a terceiros'),
    -- sem terceiros, elo aninhado
    jsonb_build_object('id','p3','contract_object', jsonb_build_object('id',9102),
                       'product', jsonb_build_object('id',56,'name','Taxa Administrativa')),
    -- terceiros DESMARCADO nao conta
    jsonb_build_object('id','p4','contract_object_id',9102,'product_id',41,'product_name','Proteção a terceiros','selected',false),
    -- so o id: o nome sai do catalogo dos planos
    jsonb_build_object('id','p5','object_id',9105,'product_id',41),
    -- o veiculo do rastreamento tem terceiros, mas o plano dele nao e substituivel
    jsonb_build_object('id','p6','contract_object_id',9104,'product_id',41,'product_name','Proteção a terceiros')
  ));

  -- ==========================================================================
  -- (B) A LEITURA
  -- ==========================================================================
  assert mutual_produto_terceiros('PROTEÇÃO A TERCEIROS'), 'terceiros com acento';
  assert mutual_produto_terceiros('B-PROTEÇÃO TERCEIRO MOTO'), 'singular';
  assert not mutual_produto_terceiros('Taxa Administrativa'), 'taxa nao e terceiros';
  assert not mutual_produto_terceiros(null), 'nulo nao e terceiros';
  assert mutual_nome_produto('41') = 'Proteção a terceiros', 'o catalogo resolve o id';

  select tem_terceiros into v_bool from mutual_terceiros_por_objeto(r_mat, t_moto) where veiculo_id = v_com;
  assert v_bool, 'MOT1 tem terceiros';
  select tem_terceiros into v_bool from mutual_terceiros_por_objeto(r_mat, t_moto) where veiculo_id = v_sem;
  assert v_bool = false, 'MOT2 nao tem: o terceiros dele esta desmarcado';
  select tem_terceiros into v_bool from mutual_terceiros_por_objeto(r_mat, t_moto) where veiculo_id = v_nada;
  assert v_bool is null, 'MOT3 sem produto capturado: "nao sei", nunca "nao tem"';
  select tem_terceiros, chave_nome into v_bool, v_txt from mutual_terceiros_por_objeto(r_mat, t_moto) where veiculo_id = v_nome;
  assert v_bool and v_txt = 'catalogo dos planos', format('MOT5 pelo catalogo; chave %s', v_txt);
  select plan_id into v_txt from mutual_terceiros_por_objeto(r_mat, t_moto) where veiculo_id = v_com;
  assert v_txt = '57', 'devolve o plan_id do Mutual';

  -- ==========================================================================
  -- (C) SIMULAR NAO MUDA NADA
  -- ==========================================================================
  select quantidade into n from mutual_aplicar_plano_por_terceiros(r_mat, t_moto, pl_ouro, pl_ess, array[pl_prata])
   where acao = 'COM_TERCEIROS';
  assert n = 2, format('MOT1 e MOT5 iriam para o Ouro; veio %s', n);
  select quantidade into n from mutual_aplicar_plano_por_terceiros(r_mat, t_moto, pl_ouro, pl_ess, array[pl_prata])
   where acao = 'MANTIDO';
  assert n = 1, 'o do RASTREAMENTO fica (fora de p_substituir)';
  select plano_protecao_id into v_uuid from veiculos where id = v_com;
  assert v_uuid = pl_prata, 'sem confirmar, nada muda';

  -- ==========================================================================
  -- (D) CONFIRMAR
  -- ==========================================================================
  perform mutual_aplicar_plano_por_terceiros(r_mat, t_moto, pl_ouro, pl_ess, array[pl_prata], true);
  assert (select plano_protecao_id from veiculos where id = v_com)  = pl_ouro, 'com terceiros -> Ouro (saiu do Prata)';
  assert (select plano_protecao_id from veiculos where id = v_sem)  = pl_ess,  'sem terceiros -> Essencial (estava sem plano)';
  assert (select plano_protecao_id from veiculos where id = v_nome) = pl_ouro, 'id so, pelo catalogo -> Ouro';
  assert (select plano_protecao_id from veiculos where id = v_nada) = pl_prata, 'sem dados nao e tocado';
  assert (select plano_protecao_id from veiculos where id = v_rast) = pl_rast, 'o RASTREAMENTO nao e tocado';
  assert valor_mensalidade_veiculo(v_com) = 97, 'o boleto segue o override';

  -- Rodar de novo e idempotente: tudo JA_CERTO, SEM_DADOS ou MANTIDO.
  select count(*) into n from mutual_aplicar_plano_por_terceiros(r_mat, t_moto, pl_ouro, pl_ess, array[pl_prata])
   where acao in ('COM_TERCEIROS','SEM_TERCEIROS');
  assert n = 0, 'a segunda rodada nao tem o que trocar';

  -- ==========================================================================
  -- (E) QUEM NAO E STAFF
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', u_ass::text, false);
  select count(*) into n from mutual_terceiros_por_objeto(r_mat, t_moto);
  assert n = 0, 'o associado do /portal nao le a carteira';
  begin
    perform mutual_aplicar_plano_por_terceiros(r_mat, t_moto, pl_ouro, pl_ess, '{}', true);
    assert false, 'quem nao e da matriz nao aplica';
  exception when insufficient_privilege then null;
  end;

  raise notice '=== 0091 mutual_produtos_do_objeto: TODOS OS TESTES PASSARAM ===';
end $$;
