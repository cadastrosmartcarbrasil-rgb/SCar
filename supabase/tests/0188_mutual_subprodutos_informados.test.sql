-- Teste funcional da 0188. Prova: (1) as opcoes conferidas pela equipe ja
-- estao gravadas; (2) o subproduto informado da o nivel ao item que o catalogo
-- capturado nao conhece; (3) o informado vence o capturado; (4) a grafia
-- informada cai na mesma chave do beneficio que ja tem destino.
\set ON_ERROR_STOP on
do $$
declare
  r1 uuid; tv uuid; c1 uuid; v1 uuid; n bigint;
begin
  select count(*) into n from mutual_subprodutos_informados;
  assert n = 20, format('as 20 opcoes conferidas (veio %s)', n);

  insert into regionais (nome) values ('U188') returning id into r1;
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, celular)
    values ('PF', 'MIGRADO 188', '52998224725', r1, '65999990000') returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, cobranca_externa)
    values (c1, 'MUT1A88', r1, tv, 'ativo', true) returning id into v1;
  insert into integracao_vinculos (entidade, id_externo, tabela, registro_id)
    values ('CONTRACT_OBJECT', '8801', 'veiculos', v1);

  -- o plano capturado diz outra coisa para o 3094: o informado tem de vencer
  insert into mutual_captura (entidade, id_externo, payload) values
    ('PLAN', '87', jsonb_build_object('id', 87, 'products', jsonb_build_array(
       jsonb_build_object('product_id', 52, 'product_name', 'Carros Reserva', 'subproducts', jsonb_build_array(
         jsonb_build_object('id', 3094, 'value', 0, 'subproduct_description', 'CARRO RESERVA 30 DIAS')))))),
    ('CONTRACT_OBJECT_PRODUCT', '8801', jsonb_build_object('contract_object_id', '8801', 'products', jsonb_build_array(
       jsonb_build_object('product_id', 52, 'product_name', 'Carros Reserva', 'subproduct_config_id', 3094),
       jsonb_build_object('product_id', 41, 'product_name', 'Proteção a terceiros', 'subproduct_config_id', 3089),
       jsonb_build_object('product_id', 40, 'product_name', 'Vidros', 'subproduct_config_id', 3091))));

  assert (select descricao from mutual_subprodutos_catalogo() where subproduto_id = '3094') = 'CARRO RESERVA - 7 DIAS',
    'o informado vence o capturado';
  assert exists (select 1 from mutual_itens_produto_veiculos(r1) where veiculo_id = v1 and chave = 'nome:CARRO RESERVA 7 DIAS'),
    'carro reserva 7 dias pela opcao informada';
  assert exists (select 1 from mutual_itens_produto_veiculos(r1) where veiculo_id = v1 and chave = 'nome:B PROTECAO TERCEIROS BRASIL ATE R 30 000 00'),
    'terceiros 30 mil na grafia que ja tem destino';
  assert exists (select 1 from mutual_itens_produto_veiculos(r1) where veiculo_id = v1 and chave = 'nome:VIDROS III PARAB V LAT RET LANT FAROIS AUTO'),
    'vidros III pela opcao informada';
  assert not exists (select 1 from mutual_itens_produto_veiculos(r1) where veiculo_id = v1 and chave like 'sem_nivel:%'),
    'nada fica sem nivel';

  raise notice '=== TESTES 0188 (subprodutos informados) PASSARAM ===';
end;
$$;
