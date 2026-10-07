-- Teste funcional do RASTREADOR OPCIONAL (0090). O que ele prova: abaixo do
-- minimo do tipo o opcional e cobrado; acima, a regra cobra e o opcional some
-- (avulso ou no plano) — um equipamento, uma cobranca; o produto de rastreamento
-- que NAO e o opcional (o do plano RASTREAMENTO) segue intacto; e o produto
-- "Rastreador" do cadastro nasce marcado.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  t_moto uuid; p_opc uuid; p_rastreamento uuid; pl uuid;
  c jsonb; n int; v numeric; base_baixo numeric; base_alto numeric;
begin
  insert into auth.users (id, email) values (u_adm, 'adm90@t.com');
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm, 'Admin', 'adm90@t.com', 'admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into t_moto from tipos_veiculo where nome ilike 'moto%' limit 1;
  assert t_moto is not null, 'o seed tem de trazer Moto';
  -- A regra de producao para moto: obrigatorio acima de R$ 15.999,99, R$ 35.
  update tipos_veiculo
     set exige_rastreador = true, valor_limite_isencao = 15999.99, valor_mensalidade_rastreador = 35
   where id = t_moto;

  -- (A) o produto "Rastreador" do cadastro nasce marcado como o opcional
  select count(*) into n from produtos
   where categoria = 'RASTREADOR' and upper(trim(nome)) = 'RASTREADOR' and not rastreador_avulso;
  assert n = 0, 'o produto "Rastreador" tem de nascer marcado como opcional';

  insert into produtos (nome, categoria, metodo_preco, obrigatorio, status, valor_fixo, rastreador_avulso)
    values ('RAST OPCIONAL 90', 'RASTREADOR', 'FIXO', false, true, 35, true) returning id into p_opc;
  insert into produtos (nome, categoria, metodo_preco, obrigatorio, status, valor_fixo)
    values ('RASTREAMENTO 90', 'RASTREADOR', 'FIXO', false, true, 59.90) returning id into p_rastreamento;

  base_baixo := (cotar_plano(14000, t_moto)->>'valor_total_mensalidade')::numeric;
  base_alto  := (cotar_plano(20000, t_moto)->>'valor_total_mensalidade')::numeric;

  -- (B) ABAIXO do minimo: a regra nao cobra e o opcional entra
  c := cotar_plano(14000, t_moto, null, array[p_opc]);
  select count(*) into n from jsonb_array_elements(c->'detalhamento_produtos') i
   where (i->>'produto_id')::uuid = p_opc;
  assert n = 1, 'abaixo do minimo o rastreador opcional e cobrado';
  select count(*) into n from jsonb_array_elements(c->'detalhamento_produtos') i
   where i->>'produto_id' is null and i->>'categoria' = 'RASTREADOR';
  assert n = 0, 'abaixo do minimo a regra nao cobra';
  assert (c->>'valor_total_mensalidade')::numeric = base_baixo + 35, 'soma os 35 do opcional';

  -- (C) ACIMA do minimo: a regra cobra e o opcional some — um equipamento, uma cobranca
  c := cotar_plano(20000, t_moto, null, array[p_opc]);
  select count(*) into n from jsonb_array_elements(c->'detalhamento_produtos') i
   where (i->>'produto_id')::uuid = p_opc;
  assert n = 0, 'acima do minimo o opcional nao entra';
  select count(*) into n from jsonb_array_elements(c->'detalhamento_produtos') i
   where i->>'produto_id' is null and i->>'categoria' = 'RASTREADOR';
  assert n = 1, 'acima do minimo a regra continua cobrando';
  assert (c->>'valor_total_mensalidade')::numeric = base_alto,
    format('acima do minimo, marcar o opcional nao muda nada: %s x %s', c->>'valor_total_mensalidade', base_alto);

  -- O mesmo vale quando o opcional vem AMARRADO a um plano.
  insert into planos_protecao (nome) values ('MOTO 90') returning id into pl;
  insert into plano_produtos (plano_id, produto_id) values (pl, p_opc);
  assert (cotar_plano(20000, t_moto, pl)->>'valor_total_mensalidade')::numeric = base_alto,
    'opcional no plano tambem some acima do minimo';
  assert (cotar_plano(14000, t_moto, pl)->>'valor_total_mensalidade')::numeric = base_baixo + 35,
    'e e cobrado abaixo';

  -- (D) o produto de RASTREAMENTO (nao e o opcional) nao e tocado
  c := cotar_plano(20000, t_moto, null, array[p_rastreamento]);
  select count(*) into n from jsonb_array_elements(c->'detalhamento_produtos') i
   where (i->>'produto_id')::uuid = p_rastreamento;
  assert n = 1, 'o produto do plano RASTREAMENTO segue entrando — ele nao e o opcional';

  raise notice '=== 0090 rastreador_opcional: TODOS OS TESTES PASSARAM ===';
end $$;
