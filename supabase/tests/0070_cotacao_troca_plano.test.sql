-- Teste funcional: subir e DESCER de plano na cotacao (0070).
-- O que se prova aqui e o downgrade ate a cobertura base — o caminho que a
-- versao de 0028 fazia em silencio, mantendo o combo anterior.
\set ON_ERROR_STOP on
do $$
declare
  u_vend uuid := gen_random_uuid();
  r_id uuid; tv uuid; lead uuid;
  plano_baixo uuid; plano_alto uuid;
  c cotacoes;
  total_base numeric; total_baixo numeric; total_alto numeric;
  p_do_plano uuid; total_sem numeric; total_com numeric;
begin
  -- setup -------------------------------------------------------------------
  insert into auth.users (id, email) values (u_vend, 'vend70@teste.com');
  insert into regionais (nome, percentual_maximo_desconto_venda)
    values ('Franquia 0070', 5) returning id into r_id;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_vend, 'Vendedor', 'vend70@teste.com', 'consultor_vendas', r_id);
  perform set_config('request.jwt.claim.sub', u_vend::text, false);

  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  if tv is null then insert into tipos_veiculo (nome) values ('Passeio') returning id into tv; end if;

  select id into plano_baixo from planos_protecao where ativo order by nivel, nome limit 1;
  select id into plano_alto  from planos_protecao where ativo order by nivel desc, nome limit 1;
  assert plano_baixo is distinct from plano_alto, 'o seed precisa de ao menos dois planos ativos';

  insert into leads (nome, celular, valor_fipe, tipo_veiculo_id, consultor_id, regional_id)
    values ('Cliente Upgrade', '11999990070', 50000, tv, u_vend, r_id)
    returning id into lead;
  perform mover_lead_status(lead, 'ORCAMENTO_GERADO');
  perform mover_lead_status(lead, 'PROPOSTA_ENVIADA');
  perform mover_lead_status(lead, 'EM_NEGOCIACAO');

  total_base  := (cotar_plano(50000, tv, null)        ->> 'valor_total_mensalidade')::numeric;
  total_baixo := (cotar_plano(50000, tv, plano_baixo) ->> 'valor_total_mensalidade')::numeric;
  total_alto  := (cotar_plano(50000, tv, plano_alto)  ->> 'valor_total_mensalidade')::numeric;

  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, plano_id, itens, total_mensalidade,
                        taxa_adesao, participacao, created_by)
    select lead, 50000, tv, plano_baixo,
           coalesce(calc->'detalhamento_produtos', '[]'::jsonb),
           (calc->>'valor_total_mensalidade')::numeric,
           coalesce((calc->>'taxa_adesao')::numeric, 0),
           coalesce((calc->>'franquia_participacao')::numeric, 0),
           u_vend
      from (select cotar_plano(50000, tv, plano_baixo) as calc) x
    returning * into c;

  -- ------------------------------------------------------------- A) upgrade
  select * into c from atualizar_cotacao(c.id, null, null, null, plano_alto);
  assert c.plano_id = plano_alto, 'o upgrade troca o combo da cotacao';
  assert c.total_mensalidade = total_alto,
    format('upgrade recalcula a mensalidade: %s x %s', c.total_mensalidade, total_alto);
  raise notice 'OK subir de plano troca o combo e recalcula o snapshot';

  -- ---------------------------------------------- B) o silencio de antes (compatibilidade)
  -- Nao informar o plano continua significando "mantem o que esta": e disso que
  -- dependem o modal de desconto e a edicao que so mexe na FIPE.
  select * into c from atualizar_cotacao(c.id, 60000);
  assert c.plano_id = plano_alto, 'plano nulo sem pedido de limpeza mantem o combo';
  assert c.fipe = 60000, 'a FIPE foi atualizada sozinha';
  select * into c from atualizar_cotacao(c.id, 50000);

  -- ----------------------------------------------------------- C) downgrade
  select * into c from atualizar_cotacao(c.id, null, null, null, plano_baixo);
  assert c.plano_id = plano_baixo, 'descer para um combo menor';
  assert c.total_mensalidade = total_baixo,
    format('downgrade recalcula a mensalidade: %s x %s', c.total_mensalidade, total_baixo);

  -- ------------------------------------------- D) descer ate a cobertura base
  select * into c from atualizar_cotacao(
    c.id, null, null, null, null, null, null, null, null, true
  );
  assert c.plano_id is null, 'com p_limpar_plano a cotacao fica sem combo';
  assert c.total_mensalidade = total_base,
    format('sem plano, sobra a cobertura base: %s x %s', c.total_mensalidade, total_base);
  -- e os obrigatorios da base seguem no snapshot
  assert not exists (
    select 1 from produtos_obrigatorios_cotacao(tv, null, 50000) o
     where not exists (
       select 1 from jsonb_array_elements(c.itens) i where (i->>'produto_id')::uuid = o.produto_id
     )
  ), 'a base obrigatoria continua no snapshot depois do downgrade';
  raise notice 'OK descer ate a cobertura base limpa o plano de verdade';

  -- --------------------- E) item do combo marcado como avulso nao cobra duas vezes
  -- E a regra que a tela usa para marcar sozinha o que o plano ja traz: mesmo
  -- que o id escape para a lista de avulsos, `cotar_plano` faz uniao distinta.
  select pp.produto_id into p_do_plano
    from plano_produtos pp join produtos p on p.id = pp.produto_id
   where pp.plano_id = plano_alto and p.status limit 1;

  if p_do_plano is not null then
    total_sem := (cotar_plano(50000, tv, plano_alto) ->> 'valor_total_mensalidade')::numeric;
    total_com := (cotar_plano(50000, tv, plano_alto, array[p_do_plano]) ->> 'valor_total_mensalidade')::numeric;
    assert total_sem = total_com,
      format('item do proprio combo nao pode somar de novo: %s x %s', total_sem, total_com);
    raise notice 'OK item do plano repetido como avulso nao cobra duas vezes';
  end if;

  raise notice '=== TESTES 0070 (troca de plano na cotacao) PASSARAM ===';
end $$;
