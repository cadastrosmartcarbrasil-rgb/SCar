-- 0120: produtos.descricao_cobertura existe, e opcional e grava texto.
do $$
declare v_id uuid;
begin
  insert into produtos (nome, fornecedor_nome, metodo_preco, valor_fixo, categoria)
  values ('TESTE COBERTURA 0120', 'Interno', 'FIXO', 10, 'VIDROS')
  returning id into v_id;
  assert (select descricao_cobertura from produtos where id = v_id) is null,
    'produto novo nasce sem descricao';
  update produtos set descricao_cobertura = 'Parabrisa, laterais e traseiro. 1 troca a cada 12 meses.' where id = v_id;
  assert (select descricao_cobertura from produtos where id = v_id) like 'Parabrisa%',
    'descricao gravada';
  raise notice '=== 0120 PRODUTO DESCRICAO COBERTURA: TESTES PASSARAM ===';
end $$;
