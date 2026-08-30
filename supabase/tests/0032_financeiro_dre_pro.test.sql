-- Teste funcional do financeiro/DRE profissional (0032)
\set ON_ERROR_STOP on
do $$
declare
  u_id     uuid := gen_random_uuid();
  u_rj_id  uuid := gen_random_uuid();
  r_id     uuid;
  r_rj_id  uuid;
  cc_id    uuid;
  cb_id    uuid;
  cat_rec  uuid; cat_desp uuid;
  l_rec    uuid; l_desp uuid; l_sem_cat uuid;
  v_num    numeric; n int;
  rec      record;
begin
  -- ------------------------------------------------------------------ setup
  insert into auth.users (id, email) values (u_id, 'fin@teste.com');
  insert into regionais (nome) values ('Matriz Financeiro') returning id into r_id;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_id, 'Financeiro Teste', 'fin@teste.com', 'admin', r_id);
  perform set_config('request.jwt.claim.sub', u_id::text, false);
  assert tem_acesso_global(), 'admin precisa ter acesso global';

  insert into centros_custo (nome) values ('Matriz CC') returning id into cc_id;
  insert into contas_bancarias (nome, banco) values ('Conta Movimento', '341') returning id into cb_id;
  select id into cat_rec  from categorias_dre where codigo_estruturado = '1.2.01';
  select id into cat_desp from categorias_dre where codigo_estruturado = '4.1.01';

  -- ------------------------------------------------------- saldo cacheado
  insert into lancamentos_financeiros
    (tipo, descricao, categoria_dre_id, centro_custo_id, regional_id,
     valor_original, data_emissao, data_vencimento, competencia)
  values ('RECEITA', 'Mensalidade avulsa', cat_rec, cc_id, r_id,
          1000.00, current_date, current_date, current_date)
  returning id into l_rec;

  select valor_saldo into v_num from lancamentos_financeiros where id = l_rec;
  assert v_num = 1000.00, 'saldo deve nascer igual ao valor original, veio ' || v_num;

  insert into lancamentos_financeiros
    (tipo, descricao, categoria_dre_id, centro_custo_id, regional_id,
     valor_original, data_emissao, data_vencimento, competencia)
  values ('DESPESA', 'Folha', cat_desp, cc_id, r_id,
          400.00, current_date, current_date, current_date)
  returning id into l_desp;

  -- despesa vencida ha 45 dias e SEM categoria (vai para "nao classificadas")
  insert into lancamentos_financeiros
    (tipo, descricao, regional_id, valor_original, data_emissao, data_vencimento, competencia)
  values ('DESPESA', 'Guincho sem classificacao', r_id,
          250.00, current_date - 45, current_date - 45, current_date)
  returning id into l_sem_cat;
  raise notice 'OK saldo cacheado no insert';

  -- ------------------------------------------------------- baixa parcial
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido)
  values (l_rec, current_date, 300.00, 300.00);

  select valor_saldo into v_num from lancamentos_financeiros where id = l_rec;
  assert v_num = 700.00, 'saldo apos baixa parcial, veio ' || v_num;
  assert (select status from lancamentos_financeiros where id = l_rec) = 'pago_parcial',
         'status deve virar pago_parcial';
  assert (select valor_pago from lancamentos_financeiros where id = l_rec) = 300.00, 'valor_pago cacheado';
  raise notice 'OK baixa parcial atualiza saldo e status';

  -- ------------------------------------------------------- quitacao pela baixa
  -- Nao existe atalho de "quitar": toda liquidacao e uma baixa completa,
  -- com a conta que pagou/recebeu (o 0033 removeu quitar_lancamento).
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id)
  values (l_rec, current_date, 700.00, 700.00, cb_id);

  select valor_saldo into v_num from lancamentos_financeiros where id = l_rec;
  assert v_num = 0, 'baixa do saldo restante deve zerar, veio ' || v_num;
  assert (select status from lancamentos_financeiros where id = l_rec) = 'quitado', 'status quitado';
  assert (select count(*) from baixas_financeiras
           where lancamento_id = l_rec and conta_bancaria_id = cb_id) = 1,
         'a baixa precisa registrar a conta bancaria';
  raise notice 'OK quitacao via baixa completa (com conta bancaria)';

  -- ------------------------------------------------------- DRE regime CAIXA
  select total into v_num
    from gerar_dre_completo(current_date - 1, current_date + 1, null, 'CAIXA')
   where categoria_codigo = '1.2.01';
  assert v_num = 1000.00, 'DRE caixa deve ver a receita liquidada, veio ' || coalesce(v_num::text, 'nada');
  raise notice 'OK DRE regime caixa le as baixas';

  -- ------------------------------------------------------- DRE regime COMPETENCIA
  select count(*) into n
    from gerar_dre_completo(current_date - 1, current_date + 1, null, 'COMPETENCIA')
   where categoria_codigo = '4.9.99' and total = -250.00;
  assert n = 1, 'titulo sem categoria deve virar linha "nao classificadas"';

  select resultado_liquido into v_num
    from gerar_dre_resumo_completo(current_date - 1, current_date + 1, null, 'COMPETENCIA');
  assert v_num = 350.00, 'competencia: 1000 - 400 - 250 = 350, veio ' || v_num;

  select margem_percentual into v_num
    from gerar_dre_resumo_completo(current_date - 1, current_date + 1, null, 'COMPETENCIA');
  assert v_num = 35.00, 'margem 35%, veio ' || v_num;
  raise notice 'OK DRE regime competencia (inclui nao classificadas)';

  -- ------------------------------------------------------- filtro centro de custo
  select resultado_liquido into v_num
    from gerar_dre_resumo_completo(current_date - 1, current_date + 1, null, 'COMPETENCIA', cc_id);
  assert v_num = 600.00, 'centro de custo exclui o titulo sem CC: 1000-400=600, veio ' || v_num;
  raise notice 'OK filtro por centro de custo';

  -- ------------------------------------------------------- serie mensal sem buracos
  select count(*) into n
    from gerar_dre_mensal(date_trunc('month', current_date)::date - 60,
                          date_trunc('month', current_date)::date, null, 'COMPETENCIA');
  assert n = 3, 'serie mensal deve preencher meses vazios, veio ' || n;
  raise notice 'OK serie mensal do DRE';

  -- ------------------------------------------------------- aging
  select total into v_num from financeiro_aging()
   where tipo = 'DESPESA' and ordem = 3;
  assert v_num = 250.00, 'vencido 45 dias cai na faixa 31-60, veio ' || coalesce(v_num::text, 'nada');
  select total into v_num from financeiro_aging()
   where tipo = 'DESPESA' and ordem = 1;
  assert v_num = 400.00, 'titulo a vencer na faixa 1, veio ' || coalesce(v_num::text, 'nada');
  raise notice 'OK aging por faixa de atraso';

  -- ------------------------------------------------------- resumo do periodo
  select * into rec from financeiro_resumo(current_date - 1, current_date + 1);
  assert rec.previsto_receber = 1000.00, 'previsto_receber, veio ' || rec.previsto_receber;
  assert rec.previsto_pagar   = 400.00,  'previsto_pagar, veio '   || rec.previsto_pagar;
  assert rec.recebido         = 1000.00, 'recebido, veio '         || rec.recebido;
  assert rec.aberto_pagar     = 650.00,  'aberto_pagar, veio '     || rec.aberto_pagar;
  assert rec.vencido_pagar    = 250.00,  'vencido_pagar, veio '    || rec.vencido_pagar;
  assert rec.titulos_vencidos = 1,       'titulos_vencidos, veio ' || rec.titulos_vencidos;
  raise notice 'OK financeiro_resumo';

  -- ------------------------------------------------------- fluxo mensal
  select realizado_entrada into v_num
    from financeiro_fluxo_mensal(date_trunc('month', current_date)::date,
                                 (date_trunc('month', current_date) + interval '1 month - 1 day')::date)
   where mes = date_trunc('month', current_date)::date;
  assert v_num = 1000.00, 'fluxo realizado do mes, veio ' || coalesce(v_num::text, 'nada');
  raise notice 'OK financeiro_fluxo_mensal';

  -- ------------------------------------------------------- trava de pagamento a maior
  begin
    insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido)
    values (l_desp, current_date, 999.00, 999.00);
    raise exception 'FALHOU: aceitou pagamento a maior';
  exception when check_violation then
    raise notice 'OK trava de pagamento a maior segue valendo';
  end;

  -- ------------------------------------------------------- isolamento por regional
  insert into auth.users (id, email) values (u_rj_id, 'rj@teste.com');
  insert into regionais (nome) values ('Regional RJ') returning id into r_rj_id;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_rj_id, 'Gestor RJ', 'rj@teste.com', 'gestor_regional', r_rj_id);
  perform set_config('request.jwt.claim.sub', u_rj_id::text, false);

  select coalesce(resultado_liquido, 0) into v_num
    from gerar_dre_resumo_completo(current_date - 1, current_date + 1, null, 'COMPETENCIA');
  assert v_num = 0, 'gestor de outra regional nao pode ver o resultado da matriz, veio ' || v_num;

  select count(*) into n from financeiro_aging();
  assert n = 0, 'aging nao pode vazar para outra regional, veio ' || n;
  raise notice 'OK escopo_regional protege as RPCs security definer';

  raise notice '=== TESTES 0032 (financeiro e DRE profissional) PASSARAM ===';
end $$;
