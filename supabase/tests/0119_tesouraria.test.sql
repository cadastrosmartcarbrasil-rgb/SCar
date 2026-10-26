-- Teste da 0119: saldos por conta, extrato, OFX, transferencias e fluxo diario.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  ca uuid; cb2 uuid; cat_r uuid; cat_d uuid; cat_tar uuid; cc uuid;
  l1 uuid; l2 uuid; l3 uuid; l_ant uuid; l_fut uuid; b1 uuid; b2 uuid;
  tr uuid; imp record; n int; v numeric; r record; it_tar uuid; it_tr uuid; it_ign uuid; it_200 uuid;
  lanc_tar uuid; hoje date;
begin
  insert into auth.users (id, email) values (u_adm, 'adm119@t.com'), (u_con, 'con119@t.com');
  insert into usuarios (id, nome, email, papel) values
    (u_adm, 'Admin', 'adm119@t.com', 'admin'),
    (u_con, 'Consultor', 'con119@t.com', 'consultor_vendas');
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  hoje := hoje_sp();

  insert into contas_bancarias (nome, banco, tipo, saldo_inicial, saldo_inicial_em)
    values ('SICREDI T', 'BANCO SICREDI', 'corrente', 1000, date '2026-10-12') returning id into ca;
  insert into contas_bancarias (nome, tipo) values ('CAIXA T', 'caixa') returning id into cb2;
  select id into cat_r from categorias_dre where codigo_estruturado = '3.1.1.01';
  select id into cat_d from categorias_dre where analitica and not automatica and tipo::text like 'DESPESA%' order by codigo_estruturado limit 1;
  cat_tar := cat_d;
  insert into centros_custo (nome, codigo) values ('ADM T', 'ADMT') returning id into cc;

  -- recebimento (o webhook faria igual) e um pagamento
  insert into lancamentos_financeiros (tipo, descricao, categoria_dre_id, valor_original, data_vencimento)
    values ('RECEITA', 'Mensalidade X', cat_r, 200, date '2026-10-13') returning id into l1;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id)
    values (l1, date '2026-10-13', 200, 200, ca) returning id into b1;
  insert into lancamentos_financeiros (tipo, descricao, categoria_dre_id, centro_custo_id, valor_original, data_vencimento)
    values ('DESPESA', 'Fornecedor Y', cat_d, cc, 50, date '2026-10-14') returning id into l2;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id)
    values (l2, date '2026-10-14', 50, 50, ca) returning id into b2;
  -- antes do saldo inicial: nao entra
  insert into lancamentos_financeiros (tipo, descricao, categoria_dre_id, valor_original, data_vencimento)
    values ('RECEITA', 'Antigo', cat_r, 999, date '2026-10-10') returning id into l_ant;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id)
    values (l_ant, date '2026-10-10', 999, 999, ca);

  assert saldo_consolidado_em(date '2026-10-15', ca) = 1150, 'saldo = inicial + 200 - 50 (o de antes do inicial nao entra)';
  assert saldo_consolidado_em(date '2026-10-11', ca) = 0, 'antes do saldo inicial a conta nao tem saldo';

  -- transferencia muda as contas, nao o consolidado
  tr := criar_transferencia_bancaria(ca, cb2, 100, date '2026-10-15', 'Reforco do caixa');
  assert saldo_consolidado_em(date '2026-10-15', ca) = 1050;
  assert saldo_consolidado_em(date '2026-10-15', cb2) = 100;
  assert saldo_consolidado_em(date '2026-10-15') = 1150, 'transferencia nao muda o consolidado';

  select saldo, entradas, saidas into r from saldos_contas(date '2026-10-15') where conta_id = ca;
  assert r.saldo = 1050 and r.entradas = 200 and r.saidas = 150, 'saldos_contas: ' || r.saldo;

  -- extrato da conta: saldo anterior e acumulado verdadeiros
  select count(*), max(saldo_anterior) into n, v from extrato_conta(ca, date '2026-10-13', date '2026-10-31');
  assert n = 3 and v = 1000, 'extrato: 3 linhas, saldo anterior 1000';
  assert (select saldo from extrato_conta(ca, date '2026-10-13', date '2026-10-31') order by data desc, origem desc limit 1) = 1050;
  -- o filtro de centro esconde linhas mas o saldo da linha continua o real
  select saldo into v from extrato_conta(ca, date '2026-10-13', date '2026-10-31', cc);
  assert v = 1150, 'saldo da linha filtrada = saldo real naquele ponto';
  -- consolidado: transferencia interna fica de fora por padrao
  select count(*) into n from extrato_conta(null, date '2026-10-13', date '2026-10-31');
  assert n = 2, 'consolidado sem transferencias internas: ' || n;
  select count(*) into n from extrato_conta(null, date '2026-10-13', date '2026-10-31', null, null, null, true);
  assert n = 4, 'consolidado com as duas pernas da transferencia: ' || n;

  -- OFX: credito que casa com a baixa, credito de mensalidade sem casar, debito que casa,
  -- tarifa sem lancamento e a transferencia
  select * into imp from importar_extrato_ofx(ca, 'extrato.ofx', 'h1', date '2026-10-13', date '2026-10-15', 1042.10,
    date '2026-10-15', jsonb_build_array(
      jsonb_build_object('fitid', 'F1', 'data', '2026-10-13', 'valor', 200, 'tipo', 'CREDIT', 'historico', 'PIX RECEBIDO JOAO'),
      jsonb_build_object('fitid', 'F2', 'data', '2026-10-13', 'valor', 300, 'tipo', 'CREDIT', 'historico', 'Liquidação boleto'),
      jsonb_build_object('fitid', 'F3', 'data', '2026-10-14', 'valor', -50, 'tipo', 'DEBIT', 'historico', 'PAG FORNECEDOR'),
      jsonb_build_object('fitid', 'F4', 'data', '2026-10-15', 'valor', -7.9, 'tipo', 'DEBIT', 'historico', 'TARIFA PACOTE'),
      jsonb_build_object('fitid', 'F5', 'data', '2026-10-15', 'valor', -100, 'tipo', 'DEBIT', 'historico', 'TED MESMA TITULARIDADE')));
  assert imp.novos = 5 and imp.sugeridos = 3 and imp.ignorados = 1, format('import: %s', row_to_json(imp));
  select id into it_ign from extrato_itens where conta_id = ca and fitid = 'F2';
  assert (select situacao from extrato_itens where id = it_ign) = 'IGNORADO', 'credito de mensalidade pelo texto (sem acento)';
  select id into it_200 from extrato_itens where conta_id = ca and fitid = 'F1';
  assert (select sugestao_tipo = 'BAIXA' and sugestao_id = b1 from extrato_itens where id = it_200);
  select id into it_tr from extrato_itens where conta_id = ca and fitid = 'F5';
  assert (select sugestao_tipo from extrato_itens where id = it_tr) = 'TRANSFERENCIA';
  select id into it_tar from extrato_itens where conta_id = ca and fitid = 'F4';
  assert (select situacao from extrato_itens where id = it_tar) = 'PENDENTE';

  -- reimportar o mesmo arquivo nao duplica
  select * into imp from importar_extrato_ofx(ca, 'extrato.ofx', 'h1', null, null, null, null,
    jsonb_build_array(jsonb_build_object('fitid', 'F1', 'data', '2026-10-13', 'valor', 200)));
  assert imp.novos = 0 and imp.repetidos = 1;
  assert (select count(*) from extrato_itens where conta_id = ca) = 5;

  -- confirmar as sugestoes NAO mexe no saldo (o extrato e conferencia)
  n := confirmar_sugestoes_extrato(ca);
  assert n = 3, 'tres conciliados';
  assert (select status_conciliacao::text from baixas_financeiras where id = b1) = 'CONCILIADO_MANUAL';
  assert saldo_consolidado_em(date '2026-10-15', ca) = 1050, 'conciliar nao duplica saldo';

  -- a tarifa vira lancamento + baixa: ai sim o saldo muda
  lanc_tar := criar_lancamento_extrato(it_tar, 'Tarifa bancaria', cat_tar, cc);
  assert (select status::text from lancamentos_financeiros where id = lanc_tar) = 'quitado';
  assert saldo_consolidado_em(date '2026-10-15', ca) = 1042.10;
  select extrato_diferenca into v from saldos_contas(date '2026-10-15') where conta_id = ca;
  assert v = 0, 'saldo do banco no OFX bate com o sistema: ' || v;

  -- conferencia caixa x DRE: variacao do consolidado = resultado de caixa
  select * into r from conferencia_caixa_dre(date '2026-10-13', date '2026-10-31');
  assert r.variacao_saldo = 142.10 and r.diferenca = 0, format('conferencia: %s', row_to_json(r));
  assert r.antes_do_saldo_inicial = 0;

  -- demonstrativo por plano x centro
  select sum(realizado) into v from financeiro_demonstrativo(date '2026-10-13', date '2026-10-31');
  assert v = 142.10, 'demonstrativo realizado: ' || v;
  select sum(realizado) into v from financeiro_demonstrativo(date '2026-10-13', date '2026-10-31', null, cc);
  assert v = -57.90, 'demonstrativo do centro: ' || v;

  -- conciliacao recusa valor diferente e baixa de outra conta
  update extrato_itens set situacao = 'PENDENTE' where id = it_ign;
  begin
    perform conciliar_extrato_item(it_ign, 'BAIXA', b1);
    assert false, 'baixa ja conciliada nao pode casar de novo';
  exception when invalid_parameter_value then null;
  end;

  -- desfazer devolve o item e a baixa
  perform desfazer_extrato_item(it_200);
  assert (select situacao from extrato_itens where id = it_200) = 'PENDENTE';
  assert (select status_conciliacao::text from baixas_financeiras where id = b1) = 'NAO_CONCILIADO';
  perform conciliar_extrato_item(it_200, 'BAIXA', b1);

  -- pagar um lancamento em aberto pelo extrato
  insert into lancamentos_financeiros (tipo, descricao, categoria_dre_id, valor_original, data_vencimento)
    values ('RECEITA', 'Aporte', cat_r, 300, date '2026-10-13') returning id into l3;
  perform conciliar_extrato_item(it_ign, 'LANCAMENTO', l3);
  assert (select status::text from lancamentos_financeiros where id = l3) = 'quitado';
  assert saldo_consolidado_em(date '2026-10-15', ca) = 1342.10;

  -- baixa apagada solta o item
  delete from baixas_financeiras where id = b2;
  assert (select situacao from extrato_itens where conta_id = ca and fitid = 'F3') = 'PENDENTE';

  -- fluxo diario: previsto a partir de hoje, realizado pela mesma fonte do saldo
  insert into lancamentos_financeiros (tipo, descricao, categoria_dre_id, valor_original, data_vencimento)
    values ('DESPESA', 'Aluguel', cat_d, 800, hoje + 5) returning id into l_fut;
  select previsto_saida into v from fluxo_caixa_diario(hoje, hoje + 10) where dia = hoje + 5;
  assert v = 800, 'previsto do aluguel: ' || v;
  select sum(realizado_entrada) - sum(realizado_saida) into v from fluxo_caixa_diario(date '2026-10-13', date '2026-10-15');
  assert v = saldo_consolidado_em(date '2026-10-15') - saldo_consolidado_em(date '2026-10-12'), 'fluxo = variacao do saldo';
  select sum(previsto_saida) into v from fluxo_caixa_diario(hoje, hoje + 10, ca);
  assert v = 0, 'com conta escolhida a previsao nao aparece (lancamento nao tem conta)';

  -- cancelar transferencia conciliada e recusado
  begin
    perform cancelar_transferencia_bancaria(tr, 'erro');
    assert false, 'transferencia conciliada nao cancela';
  exception when invalid_parameter_value then null;
  end;

  -- quem nao e da matriz nao le nem concilia
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  assert (select count(*) from saldos_contas()) = 0;
  assert saldo_consolidado_em(date '2026-10-15') is null;
  begin
    perform importar_extrato_ofx(ca, 'x', 'x', null, null, null, null, '[]'::jsonb);
    assert false, 'consultor nao importa';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', '', false);

  raise notice '=== TESTES 0119 (tesouraria) PASSARAM ===';
end;
$$;
