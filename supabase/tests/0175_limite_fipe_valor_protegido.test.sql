-- 0175 — FIPE acima da tabela: limite do tipo, valor protegido e a trava da cotacao.
\set ON_ERROR_STOP on
do $$
declare
  tv uuid; tv_sem uuid; prod uuid; prod2 uuid; l_id uuid; cot uuid; ok boolean; msg text;
begin
  insert into tipos_veiculo (nome) values ('TIPO 0175') returning id into tv;
  insert into tipos_veiculo (nome) values ('RASTREIO 0175') returning id into tv_sem;
  insert into produtos (nome, categoria, metodo_preco, obrigatorio, status)
    values ('CASCO 0175', 'CASCO', 'FAIXA_FIPE', true, true) returning id into prod;
  insert into produtos (nome, categoria, metodo_preco, obrigatorio, status)
    values ('ADM 0175', 'ADMIN', 'FAIXA_FIPE', true, true) returning id into prod2;
  insert into produto_tipos_veiculo values (prod, tv);
  insert into produto_tipos_veiculo values (prod2, tv);
  insert into tabela_precos_faixa (tipo_veiculo_id, produto_id, fipe_minimo, fipe_maximo, valor_mensal)
    values (tv, prod, 0, 50000, 100), (tv, prod, 50000.01, 100000, 200),
           (tv, prod2, 0, 120000, 30);

  -- (A) o menor teto entre os obrigatorios com faixa
  assert limite_fipe_tipo(tv) = 100000, 'limite = menor teto (100 mil)';
  assert limite_fipe_tipo(tv_sem) is null, 'tipo sem tabela nao tem limite';

  insert into leads (nome, celular) values ('Lead 0175', '11999990175') returning id into l_id;

  -- (C) acima do limite: recusa, com a mensagem que a tela mostra
  ok := false;
  begin
    insert into cotacoes (lead_id, fipe, tipo_veiculo_id, total_mensalidade, taxa_adesao)
      values (l_id, 120000, tv, 30, 0);
  exception when check_violation then ok := true; msg := sqlerrm;
  end;
  assert ok, 'FIPE acima do limite e recusada';
  assert msg like 'FIPE ACIMA DO LIMITE%' and msg like '%R$ 100.000,00%', 'mensagem com o limite: ' || msg;

  -- protecao pelo limite: base = valor protegido, a FIPE de mercado ao lado
  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, total_mensalidade, taxa_adesao, valor_fipe_mercado)
    values (l_id, 100000, tv, 230, 0, 120000) returning id into cot;
  assert (select valor_fipe_mercado from cotacoes where id = cot) = 120000, 'mercado gravado';

  -- valor protegido maior que a FIPE: recusa
  ok := false;
  begin
    update cotacoes set fipe = 90000, valor_fipe_mercado = 80000 where id = cot;
  exception when check_violation then ok := true;
  end;
  assert ok, 'valor protegido acima da FIPE e recusado';

  -- update que nao mexe em FIPE/tipo nao e travado
  update cotacoes set modo_envio = 'CONSOLIDADA' where id = cot;

  -- rastreamento sem protecao: tipo sem tabela, qualquer FIPE
  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, total_mensalidade, taxa_adesao)
    values (l_id, 300000, tv_sem, 79.90, 0);

  -- dentro do limite segue como sempre
  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, total_mensalidade, taxa_adesao)
    values (l_id, 80000, tv, 230, 0);

  assert moeda_br(1234567.8) = 'R$ 1.234.567,80', 'moeda_br';

  raise notice '=== TESTES 0175 (limite FIPE e valor protegido) PASSARAM ===';
end $$;
