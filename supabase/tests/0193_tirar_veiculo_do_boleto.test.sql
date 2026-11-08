-- Teste funcional da 0193: tirar UM veiculo de um boleto (Mutual sem veiculo e
-- SCar agrupado), direto do Historico, e a comissao repartida pelos veiculos do
-- contrato do Mutual.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; tv uuid; c1 uuid; m1 uuid; m2 uuid; m3 uuid; m4 uuid; vend1 uuid; vend2 uuid;
  h1 uuid; h2 uuid; h3 uuid; f1 uuid; t1 uuid; rn uuid; tn uuid;
  a record; ok boolean; n integer; s numeric;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into auth.users (id, email) values (u_adm,'adm192@t.com');
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente) values ('U192', 1.0, 0.50) returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values (u_adm,'Admin','adm192@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND A 192', r1, 0, 0.10, true) returning id into vend1;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND B 192', r1, 0, 0.20, true) returning id into vend2;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','DONO DAS MOTOS 192','52998224725', r1) returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, dia_vencimento, tipo_faturamento, vendedor_id, cobranca_externa)
    values (c1,'MOT1A92', r1, tv, 'ativo', v_hoje - 300, 100, 20, 'AGRUPADO_ASSOCIADO', vend1, true) returning id into m1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, dia_vencimento, tipo_faturamento, vendedor_id, cobranca_externa)
    values (c1,'MOT2B92', r1, tv, 'ativo', v_hoje - 300, 100, 20, 'AGRUPADO_ASSOCIADO', vend1, true) returning id into m2;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, dia_vencimento, tipo_faturamento, vendedor_id, cobranca_externa)
    values (c1,'MOT3C92', r1, tv, 'ativo', v_hoje - 300, 200, 20, 'AGRUPADO_ASSOCIADO', vend2, true) returning id into m3;
  -- outro contrato do mesmo associado: nao entra no boleto do contrato 9001
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, dia_vencimento, tipo_faturamento, vendedor_id, cobranca_externa)
    values (c1,'CAR4D92', r1, tv, 'ativo', v_hoje - 300, 150, 20, 'AGRUPADO_ASSOCIADO', vend2, true) returning id into m4;

  insert into integracao_vinculos (entidade, id_externo, tabela, registro_id) values
    ('CONTRACT_OBJECT','19201','veiculos', m1), ('CONTRACT_OBJECT','19202','veiculos', m2),
    ('CONTRACT_OBJECT','19203','veiculos', m3), ('CONTRACT_OBJECT','19204','veiculos', m4);
  insert into mutual_captura (entidade, id_externo, payload) values
    ('CONTRACT_OBJECT','19201','{"contract_id":"9001"}'), ('CONTRACT_OBJECT','19202','{"contract_id":"9001"}'),
    ('CONTRACT_OBJECT','19203','{"contract_id":"9001"}'), ('CONTRACT_OBJECT','19204','{"contract_id":"9002"}');

  -- o boleto agrupado do Mutual (sem veiculo), do contrato 9001: 400 = 100+100+200
  insert into boletos_historico (id_externo, cliente_id, contrato_externo, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem, linha_digitavel) values
    ('192-1', c1, '9001', 'MONTHLY_PAYMENT', v_hoje + 10, v_hoje + 10, 400, 'aberto', 'PENDING',
     '74891160007840200810039027231010100000000040000') returning id into h1;

  -- ===================================================== (A) os veiculos do boleto
  select count(*), sum(valor_veiculo) into n, s from veiculos_do_boleto('MUTUAL', h1);
  assert n = 3 and s = 400, format('mutual: 3 veiculos do contrato, soma 400 (veio %s / %s)', n, s);
  assert not exists (select 1 from veiculos_do_boleto('MUTUAL', h1) x where x.veiculo_id = m4),
    'o veiculo de outro contrato nao entra';
  select * into a from veiculos_do_boleto('MUTUAL', h1) x where x.veiculo_id = m1;
  assert a.valor_veiculo = 100 and a.fonte = 'CONTRATO' and a.soma_pesos = 400, format('m1: %s', row_to_json(a));

  -- ===================================================== (B) tirar m1
  rn := ajustar_boleto_sem_veiculo('MUTUAL', h1, m1, null, null, 'Vendeu a moto');
  select valor, veiculo_id into s, tn from titulos_financeiros where renegociacao_id = rn;
  assert s = 300, format('boleto novo de 300 (veio %s)', s);
  assert tn = m3, 'o boleto novo leva o veiculo de maior peso que fica';
  assert (select tipo from cobranca_renegociacoes where id = rn) = 'AJUSTE_AGRUPADO', 'tipo AJUSTE_AGRUPADO';
  assert (select jsonb_array_length(veiculos_rateio) from cobranca_renegociacoes where id = rn) = 2, 'grava os 2 que ficam';
  assert (select veiculo_id from cobranca_renegociacoes where id = rn) = m1, 'guarda o veiculo que saiu';

  ok := false;
  begin
    perform ajustar_boleto_sem_veiculo('MUTUAL', h1, m2, null, null, 'De novo nao');
  exception when unique_violation then ok := true; end;
  assert ok, 'o mesmo boleto nao e ajustado duas vezes';

  -- a rota emite e baixa o antigo
  perform set_config('request.jwt.claim.sub', '', false);
  select id into tn from titulos_financeiros where renegociacao_id = rn;
  perform finalizar_emissao_renegociacao(rn, null, jsonb_build_array(jsonb_build_object(
    'titulo_id', tn, 'nosso_numero', '192000099', 'linha_digitavel', '7489...')));
  perform registrar_baixa_original(id, 'BAIXADO') from cobranca_renegociacao_origens where renegociacao_id = rn;
  assert (select situacao from boletos_historico where id = h1) = 'cancelado', 'o boleto do Mutual sai da cobranca';
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- comissao: cada moto que ficou ao vendedor dela, pela mensalidade
  update titulos_financeiros set status = 'pago', valor_pago = 300, data_pagamento = v_hoje where id = tn;
  assert not exists (select 1 from comissoes_vendas where titulo_id = tn and veiculo_id = m1), 'quem saiu nao recebe';
  assert (select valor_comissao from comissoes_vendas where titulo_id = tn and veiculo_id = m2) = 10, 'm2: 10% de 100';
  assert (select valor_comissao from comissoes_vendas where titulo_id = tn and veiculo_id = m3) = 40, 'm3: 20% de 200';

  -- ===================================================== boleto que NAO bate com a soma
  insert into boletos_historico (id_externo, cliente_id, contrato_externo, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem, linha_digitavel) values
    ('192-2', c1, '9001', 'MONTHLY_PAYMENT', v_hoje + 40, v_hoje + 40, 500, 'aberto', 'PENDING',
     '74891160007840200810039027231010100000000050000') returning id into h2;
  select valor_veiculo into s from veiculos_do_boleto('MUTUAL', h2) x where x.veiculo_id = m1;
  assert s = 125, format('nao bate: a parte e proporcional (100/400 de 500 = 125, veio %s)', s);
  -- quem atende pode informar a parte
  rn := ajustar_boleto_sem_veiculo('MUTUAL', h2, m1, 100, v_hoje + 5, 'Vendeu a moto');
  assert (select valor from titulos_financeiros where renegociacao_id = rn) = 400, 'valor informado: 500 - 100';
  assert (select data_vencimento from titulos_financeiros where renegociacao_id = rn) = v_hoje + 5, 'vencimento escolhido';

  -- ===================================================== contrato de um veiculo so: recusa
  insert into boletos_historico (id_externo, cliente_id, contrato_externo, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem, linha_digitavel) values
    ('192-3', c1, '9002', 'MONTHLY_PAYMENT', v_hoje + 10, v_hoje + 10, 150, 'aberto', 'PENDING',
     '74891160007840200810039027231010100000000015000') returning id into h3;
  ok := false;
  begin
    perform ajustar_boleto_sem_veiculo('MUTUAL', h3, m4, null, null, 'Vendeu o carro');
  exception when check_violation then ok := true; end;
  assert ok, 'boleto de um veiculo so: cancele em vez de ajustar';

  -- ===================================================== SCar agrupado
  insert into titulos_financeiros (cliente_id, valor, valor_original, data_vencimento, status)
    values (c1, 400, 400, v_hoje + 20, 'pendente') returning id into t1;
  insert into faturas (cliente_id, regional_id, tipo_faturamento, competencia, valor_total, vencimento, titulo_id)
    values (c1, r1, 'AGRUPADO_ASSOCIADO', date_trunc('month', v_hoje)::date, 400, v_hoje + 20, t1) returning id into f1;
  insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
    values (f1, m1, 'item', 100), (f1, m2, 'item', 100), (f1, m3, 'item', 200);
  assert (select count(*) from veiculos_do_boleto('SCAR', t1)) = 3, 'scar: os itens da fatura';
  rn := ajustar_boleto_sem_veiculo('SCAR', t1, m2, null, null, 'Vendeu a moto');
  assert (select valor from titulos_financeiros where renegociacao_id = rn) = 300, 'scar: 400 - 100';
  assert (select veiculos_rateio from cobranca_renegociacoes where id = rn) is null, 'scar usa o rateio da fatura';

  -- ===================================================== 2a via de um Mutual sem veiculo reparte pelo contrato
  insert into boletos_historico (id_externo, cliente_id, contrato_externo, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem) values
    ('192-4', c1, '9001', 'MONTHLY_PAYMENT', v_hoje - 3, v_hoje - 3, 400, 'aberto', 'PENDING') returning id into h3;
  insert into cobranca_renegociacoes (cliente_id, tipo, valor_original, valor_total, situacao)
    values (c1, 'SEGUNDA_VIA', 400, 420, 'EMITIDA') returning id into rn;
  insert into cobranca_renegociacao_origens (renegociacao_id, origem, boleto_historico_id, valor, vencimento)
    values (rn, 'MUTUAL', h3, 400, v_hoje - 3);
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status, renegociacao_id)
    values (c1, m3, 420, v_hoje + 3, 'pendente', rn) returning id into tn;
  update titulos_financeiros set status = 'pago', valor_pago = 420, data_pagamento = v_hoje where id = tn;
  assert (select count(*) from comissoes_vendas where titulo_id = tn) = 3, '2a via do agrupado: uma comissao por moto';
  assert (select valor_comissao from comissoes_vendas where titulo_id = tn and veiculo_id = m1) = 10.5, 'm1: 10% de 105';
  assert (select valor_comissao from comissoes_vendas where titulo_id = tn and veiculo_id = m3) = 42, 'm3: 20% de 210';

  raise notice '=== TESTES 0193 (tirar veiculo do boleto) PASSARAM ===';
end $$;
