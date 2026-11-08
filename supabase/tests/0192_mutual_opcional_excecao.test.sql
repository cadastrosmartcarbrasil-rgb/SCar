-- Teste funcional da 0192: a excecao impede o opcional de ir para o veiculo,
-- e os outros veiculos com o mesmo beneficio continuam recebendo.
\set ON_ERROR_STOP on
do $$
declare
  r1 uuid; tv uuid; c1 uuid; v1 uuid; v2 uuid; pr uuid; rec record;
begin
  insert into regionais (nome) values ('U192') returning id into r1;
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  insert into produtos (nome, categoria, metodo_preco, obrigatorio, status)
    values ('RCF TESTE 192', 'RCF', 'FIXO', false, true) returning id into pr;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, celular)
    values ('PF', 'MIGRADO 192', '52998224725', r1, '65999990000') returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, cobranca_externa)
    values (c1, 'MUT1A92', r1, tv, 'ativo', true) returning id into v1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, cobranca_externa)
    values (c1, 'MUT2B92', r1, tv, 'ativo', true) returning id into v2;
  insert into integracao_vinculos (entidade, id_externo, tabela, registro_id) values
    ('CONTRACT_OBJECT', '9201', 'veiculos', v1), ('CONTRACT_OBJECT', '9202', 'veiculos', v2);
  insert into mutual_captura (entidade, id_externo, payload) values
    ('CONTRACT_OBJECT_PRODUCT', '9201', jsonb_build_object('contract_object_id', '9201', 'products', jsonb_build_array(
       jsonb_build_object('product_id', 999, 'product_name', 'BENEFICIO TESTE 192')))),
    ('CONTRACT_OBJECT_PRODUCT', '9202', jsonb_build_object('contract_object_id', '9202', 'products', jsonb_build_array(
       jsonb_build_object('product_id', 999, 'product_name', 'BENEFICIO TESTE 192'))));
  insert into mutual_produto_de_para (chave, nome_mutual, acao, produto_id)
    values ('nome:BENEFICIO TESTE 192', 'BENEFICIO TESTE 192', 'OPCIONAL', pr);
  insert into mutual_opcional_excecoes (veiculo_id, produto_id, motivo) values (v1, pr, 'nao contratado no Mutual');

  select * into rec from mutual_aplicar_opcionais(r1, true);
  assert rec.inseridos = 1, format('so o veiculo sem excecao recebe (veio %s)', rec.inseridos);
  assert not exists (select 1 from veiculo_produtos where veiculo_id = v1 and produto_id = pr), 'excecao respeitada';
  assert exists (select 1 from veiculo_produtos where veiculo_id = v2 and produto_id = pr), 'o outro recebe';

  raise notice '=== TESTES 0192 (excecao de opcional do Mutual) PASSARAM ===';
end;
$$;
