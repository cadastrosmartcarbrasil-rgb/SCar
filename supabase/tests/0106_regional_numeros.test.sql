-- Teste funcional da 0106: o financeiro da franquia e SO comissao, o resultado
-- respeita o periodo e o dia do lead e o de Sao Paulo.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  r_a uuid; v1 uuid;
  t_matriz uuid; t_com_pagar uuid; t_com_velho uuid; t_com_receber uuid;
  rec record; n bigint;
  ini date := date '2026-10-01';
  fim date := date '2026-10-31';
begin
  insert into auth.users (id, email) values (u_adm,'adm106@t.com'), (u_ges,'ges106@t.com');
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('Unidade 106', 1.0, 0.15) returning id into r_a;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm106@t.com','admin', null),
    (u_ges,'Gestor','ges106@t.com','gestor_regional', r_a);
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('Vendedora 106', r_a, 0.5, 0.05) returning id into v1;

  -- ================================================ (C) o dia de Sao Paulo
  assert data_sp(timestamptz '2026-11-01 02:30+00') = date '2026-10-31',
    '23h30 de 31/10 em Sao Paulo e dia 31, nao 01/11';
  insert into leads (nome, celular, regional_id, vendedor_id, status, created_at)
    values ('Lead da noite', '11999990106', r_a, v1, 'NOVO', timestamptz '2026-11-01 02:30+00'),
           ('Lead de novembro', '11999990107', r_a, v1, 'NOVO', timestamptz '2026-11-01 12:00+00');

  -- ================================================ (A) matriz x franquia
  -- Despesa da OPERACAO (OS da 24h) com a unidade do veiculo: e da matriz.
  insert into lancamentos_financeiros (tipo, descricao, regional_id, valor_original,
                                       data_emissao, data_vencimento, competencia, categoria_dre_id)
    values ('DESPESA', 'Assistencia 24h OS-TESTE', r_a, 5000, date '2026-10-10', date '2026-10-10',
            date '2026-10-10', (select id from categorias_dre where codigo_estruturado = '3.1.02'))
    returning id into t_matriz;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago)
    values (t_matriz, date '2026-10-10', 5000);

  -- Comissao a pagar: baixada NO periodo, e outra baixada ANTES dele.
  insert into lancamentos_financeiros (tipo, descricao, regional_id, vendedor_id, valor_original,
                                       data_emissao, data_vencimento, competencia, categoria_dre_id)
    values ('DESPESA', 'Repasse outubro', r_a, v1, 300, date '2026-10-05', date '2026-10-05',
            date '2026-10-05', regional_categoria_movimento('COMISSAO_PAGAR'))
    returning id into t_com_pagar;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago)
    values (t_com_pagar, date '2026-10-06', 300);
  insert into lancamentos_financeiros (tipo, descricao, regional_id, vendedor_id, valor_original,
                                       data_emissao, data_vencimento, competencia, categoria_dre_id)
    values ('DESPESA', 'Repasse setembro', r_a, v1, 200, date '2026-09-05', date '2026-09-05',
            date '2026-09-05', regional_categoria_movimento('COMISSAO_PAGAR'))
    returning id into t_com_velho;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago)
    values (t_com_velho, date '2026-09-06', 200);
  -- Comissao a receber em aberto.
  insert into lancamentos_financeiros (tipo, descricao, regional_id, valor_original,
                                       data_emissao, data_vencimento, competencia, categoria_dre_id)
    values ('RECEITA', 'Comissao da matriz', r_a, 1000, date '2026-10-20', date '2026-10-20',
            date '2026-10-20', regional_categoria_movimento('COMISSAO_RECEBER'))
    returning id into t_com_receber;

  -- Comissoes de vendas: uma gerada no periodo, outra antes.
  insert into comissoes_vendas (vendedor_id, valor_comissao, is_adesao, status_pagamento, created_at)
    values (v1, 80, true, 'pendente', timestamptz '2026-10-15 12:00+00'),
           (v1, 50, false, 'pendente', timestamptz '2026-08-15 12:00+00');

  -- ================================================ como o GESTOR
  perform set_config('request.jwt.claim.sub', u_ges::text, false);

  select * into rec from regional_painel(r_a, ini, fim);
  assert rec.leads_periodo = 1,
    'o lead das 23h30 de 31/10 e de outubro, o de 01/11 nao; veio ' || rec.leads_periodo;
  assert rec.contas_pagar_aberto = 0,
    'a OS da 24h e da matriz e nao entra no a pagar da franquia; veio ' || rec.contas_pagar_aberto;
  assert rec.contas_receber_aberto = 1000, 'a receber da franquia, veio ' || rec.contas_receber_aberto;
  assert rec.resultado_periodo = -300,
    'resultado = o BAIXADO no periodo, so comissao (nem a OS de 5000 nem o repasse de setembro); veio '
    || rec.resultado_periodo;
  raise notice 'OK painel: financeiro so comissao, resultado do periodo, dia de Sao Paulo';

  select * into rec from regional_financeiro_resumo(r_a, ini, fim);
  assert rec.a_pagar_aberto = 0 and rec.pago_periodo = 300 and rec.saldo_periodo = -300,
    'o resumo do financeiro e o painel tem de dar a mesma resposta';
  select count(*) into n from regional_financeiro_titulos(r_a);
  assert n = 3, 'so os 3 titulos de comissao aparecem na fila da franquia, veio ' || n;
  raise notice 'OK financeiro da franquia: a OS da matriz saiu da fila';

  -- O gestor NAO baixa nem cancela titulo da operacao da matriz.
  assert not regional_titulo_no_escopo(t_matriz), 'titulo da matriz fora do escopo da franquia';
  begin
    perform regional_cancelar_titulo(t_matriz, 'nao e meu');
    assert false, 'o gestor nao pode cancelar a OS da matriz';
  exception when check_violation then null; end;
  assert regional_titulo_no_escopo(t_com_receber), 'a comissao da unidade segue no escopo';
  raise notice 'OK o gestor nao mexe no titulo da operacao da matriz';

  select * into rec from regional_desempenho_vendedores(r_a, ini, fim) where vendedor_id = v1;
  assert rec.leads = 1, 'um lead da vendedora em outubro (pelo dia de SP), veio ' || rec.leads;
  assert rec.comissao_total = 80, 'comissao GERADA no periodo, veio ' || rec.comissao_total;
  assert rec.comissao_pendente = 130, 'a pendente e o retrato de hoje, veio ' || rec.comissao_pendente;
  raise notice 'OK desempenho: comissao do periodo e pendente de hoje';

  select count(*) into n from regional_leads(r_a, ini, fim);
  assert n = 1, 'lista de leads pelo dia de SP, veio ' || n;
  select count(*) into n from regional_comissoes(r_a, null, ini, fim);
  assert n = 1, 'extrato de comissoes do periodo, veio ' || n;

  raise notice '=== TESTES 0106 (numeros do portal da franquia) PASSARAM ===';
end $$;
