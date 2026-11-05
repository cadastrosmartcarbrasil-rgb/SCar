-- Teste funcional da 0186. Prova: (1) o nivel do produto generico sai da
-- descricao do subproduto do plano; (2) sem subproduto no catalogo fica
-- "nivel nao informado", separado por moto e carro; (3) o mesmo item legado com
-- ids diferentes vira UMA chave; (4) a descricao vazia (".") cai no nome.
\set ON_ERROR_STOP on
do $$
declare
  r1 uuid; tv uuid; tmoto uuid; c1 uuid; v1 uuid; v2 uuid; v3 uuid; n bigint; rec record;
begin
  insert into regionais (nome) values ('U185') returning id into r1;
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  select id into tmoto from tipos_veiculo where nome ilike 'moto%' limit 1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, celular)
    values ('PF', 'MIGRADO 185', '52998224725', r1, '65999990000') returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, cobranca_externa)
    values (c1, 'MUT1A85', r1, tv, 'ativo', true) returning id into v1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, cobranca_externa)
    values (c1, 'MUT2B85', r1, tmoto, 'ativo', true) returning id into v2;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, cobranca_externa)
    values (c1, 'MUT3C85', r1, tv, 'ativo', true) returning id into v3;
  insert into integracao_vinculos (entidade, id_externo, tabela, registro_id) values
    ('CONTRACT_OBJECT', '8501', 'veiculos', v1), ('CONTRACT_OBJECT', '8502', 'veiculos', v2),
    ('CONTRACT_OBJECT', '8503', 'veiculos', v3);

  insert into mutual_captura (entidade, id_externo, payload) values
    ('PLAN', '86', jsonb_build_object('id', 86, 'products', jsonb_build_array(
       jsonb_build_object('product_id', 52, 'product_name', 'Carros Reserva', 'subproducts', jsonb_build_array(
         jsonb_build_object('id', 3062, 'value', 0, 'subproduct_description', 'CARRO RESERVA - 7 DIAS'),
         jsonb_build_object('id', 3064, 'value', 18.5, 'subproduct_description', 'CARRO RESERVA II - 15 DIAS'))),
       jsonb_build_object('product_id', 56, 'product_name', 'Taxa Administrativa', 'subproducts', jsonb_build_array(
         jsonb_build_object('id', 3079, 'value', 37, 'subproduct_description', '.')))))),
    ('CONTRACT_OBJECT_PRODUCT', '8501', jsonb_build_object('contract_object_id', '8501', 'products', jsonb_build_array(
       jsonb_build_object('product_id', 52, 'product_name', 'Carros Reserva', 'subproduct_config_id', 3064),
       jsonb_build_object('product_id', 56, 'product_name', 'Taxa Administrativa', 'subproduct_config_id', 3079),
       jsonb_build_object('product_id', 67, 'product_name', 'CHAVEIROMIG', 'subproduct_config_id', 900)))),
    ('CONTRACT_OBJECT_PRODUCT', '8502', jsonb_build_object('contract_object_id', '8502', 'products', jsonb_build_array(
       jsonb_build_object('product_id', 41, 'product_name', 'Proteção a terceiros', 'subproduct_config_id', 9999),
       jsonb_build_object('product_id', 359, 'product_name', 'CHAVEIROMIG', 'subproduct_config_id', 901)))),
    ('CONTRACT_OBJECT_PRODUCT', '8503', jsonb_build_object('contract_object_id', '8503', 'products', jsonb_build_array(
       jsonb_build_object('product_id', 41, 'product_name', 'Proteção a terceiros', 'subproduct_config_id', 9998))));

  -- (1) nivel pela descricao do subproduto
  assert exists (select 1 from mutual_itens_produto_veiculos(r1) where veiculo_id = v1 and chave = 'nome:CARRO RESERVA II 15 DIAS'),
    'carro reserva com o nivel do subproduto';
  -- (4) descricao "." cai no nome do produto
  assert exists (select 1 from mutual_itens_produto_veiculos(r1) where veiculo_id = v1 and chave = 'nome:TAXA ADMINISTRATIVA'),
    'taxa pelo nome do produto';
  -- (2) generico sem catalogo: separado por tipo
  assert exists (select 1 from mutual_itens_produto_veiculos(r1) where veiculo_id = v2 and chave = 'sem_nivel:PROTECAO A TERCEIROS:MOTO'),
    'terceiros da moto sem nivel';
  assert exists (select 1 from mutual_itens_produto_veiculos(r1) where veiculo_id = v3 and chave = 'sem_nivel:PROTECAO A TERCEIROS:AUTO'),
    'terceiros do carro sem nivel';
  -- (3) mesmo item legado com ids diferentes = uma chave
  select * into rec from mutual_produtos_externos(r1) where chave = 'nome:CHAVEIRO';
  assert rec.veiculos = 2, 'chaveiro legado unificado';
  select count(*) into n from mutual_produtos_externos(r1);
  assert n = 5, format('cinco beneficios distintos (veio %s)', n);

  raise notice '=== TESTES 0186+0187 (de-para pelo nome do beneficio) PASSARAM ===';
end;
$$;
