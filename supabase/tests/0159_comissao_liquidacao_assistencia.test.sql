-- Teste funcional da 0159: comissao na liquidacao (inclusive renegociacao) e
-- Assistencia Profissional no lugar da comissao (nunca as duas).
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r_rep uuid; r_nao uuid; tv uuid; vend_rep uuid; vend_nao uuid;
  cli uuid; va uuid; vb uuid; vc uuid; h1 uuid; h2 uuid;
  rn uuid; t uuid; rec record; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into auth.users (id, email) values (u_adm,'adm159@t.com');
  insert into usuarios (id, nome, email, papel, regional_id) values (u_adm,'Admin','adm159@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente, paga_assistencia_profissional)
    values ('REPASSA 159', 1.0, 0.20, true) returning id into r_rep;
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente, paga_assistencia_profissional)
    values ('NAO 159', 1.0, 0.20, false) returning id into r_nao;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND REP 159', r_rep, 0.5, 0.10, true) returning id into vend_rep;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND NAO 159', r_nao, 0.5, 0.10, true) returning id into vend_nao;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','CLIENTE 159','52998224725', r_rep) returning id into cli;
  -- va: repassa, com assistencia 20 numa mensalidade de 200
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, valor_assistencia_profissional, vendedor_id, cobranca_externa)
    values (cli, 'COM1A59', r_rep, tv, 'ativo', v_hoje - 90, 200, 20, vend_rep, true) returning id into va;
  -- vb: unidade que nao repassa, com assistencia 20
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, valor_assistencia_profissional, vendedor_id, cobranca_externa)
    values (cli, 'COM2B59', r_nao, tv, 'ativo', v_hoje - 90, 200, 20, vend_nao, true) returning id into vb;
  -- vc: repassa, mas SEM assistencia
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, vendedor_id, cobranca_externa)
    values (cli, 'COM3C59', r_rep, tv, 'ativo', v_hoje - 90, 150, vend_rep, true) returning id into vc;
  -- os tres sao migrados: o 1o pagamento nao e adesao
  insert into integracao_vinculos (entidade, id_externo, tabela, registro_id) values
    ('CONTRACT_OBJECT','15901','veiculos', va), ('CONTRACT_OBJECT','15902','veiculos', vb),
    ('CONTRACT_OBJECT','15903','veiculos', vc);

  -- ===================================== mensalidade comum
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (cli, va, 200, v_hoje, 'pendente') returning id into t;
  update titulos_financeiros set status = 'pago', valor_pago = 205, data_pagamento = v_hoje where id = t;
  select * into rec from comissoes_vendas where titulo_id = t;
  assert rec.valor_comissao = 20 and rec.valor_assistencia_profissional = 20,
    format('repassa: so a assistencia, juros nao aumentam (veio %s)', rec.valor_comissao);

  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (cli, vb, 200, v_hoje, 'pendente') returning id into t;
  update titulos_financeiros set status = 'pago', valor_pago = 200, data_pagamento = v_hoje where id = t;
  select * into rec from comissoes_vendas where titulo_id = t;
  assert rec.valor_comissao = 20 and rec.valor_assistencia_profissional = 0,
    format('nao repassa: 10%% de 200 com a assistencia na base (veio %s)', rec.valor_comissao);

  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (cli, vc, 150, v_hoje, 'pendente') returning id into t;
  update titulos_financeiros set status = 'pago', valor_pago = 150, data_pagamento = v_hoje where id = t;
  select * into rec from comissoes_vendas where titulo_id = t;
  assert rec.valor_comissao = 15 and rec.valor_assistencia_profissional = 0,
    'repassa, mas sem assistencia no veiculo: comissao normal';
  raise notice 'OK comissao ou assistencia';

  -- ===================================== 2a via de dois boletos (va e vb)
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem) values
    ('159-1', cli, va, 'MENSALIDADE', v_hoje - 2, v_hoje - 2, 200, 'aberto', 'OVERDUE') returning id into h1;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem) values
    ('159-2', cli, vb, 'MENSALIDADE', v_hoje - 2, v_hoje - 2, 200, 'aberto', 'OVERDUE') returning id into h2;
  insert into cobranca_renegociacoes (cliente_id, tipo, valor_original, valor_total, situacao)
    values (cli, 'SEGUNDA_VIA', 400, 400, 'EMITIDA') returning id into rn;
  insert into cobranca_renegociacao_origens (renegociacao_id, origem, boleto_historico_id, valor, vencimento)
    values (rn, 'MUTUAL', h1, 200, v_hoje - 2), (rn, 'MUTUAL', h2, 200, v_hoje - 2);
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status, renegociacao_id)
    values (cli, va, 400, v_hoje + 3, 'pendente', rn) returning id into t;
  update titulos_financeiros set status = 'pago', valor_pago = 400, data_pagamento = v_hoje where id = t;

  select * into rec from comissoes_vendas where titulo_id = t and veiculo_id = va;
  assert found and not rec.is_adesao, 'renegociacao paga gera comissao (0159), nunca de adesao';
  assert rec.valor_comissao = 20, format('va: metade dos 400 = uma mensalidade -> assistencia 20 (veio %s)', rec.valor_comissao);
  select * into rec from comissoes_vendas where titulo_id = t and veiculo_id = vb;
  assert found and rec.valor_comissao = 20, format('vb: 10%% de 200 ao vendedor dele (veio %s)', rec.valor_comissao);
  assert (select vendedor_id from comissoes_vendas where titulo_id = t and veiculo_id = vb) = vend_nao,
    'cada parte ao vendedor do veiculo do boleto original';

  -- ===================================== acordo de 3 meses do mesmo veiculo, em 1 parcela
  insert into cobranca_renegociacoes (cliente_id, tipo, valor_original, valor_total, situacao)
    values (cli, 'SEGUNDA_VIA', 600, 600, 'EMITIDA') returning id into rn;
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status, renegociacao_id)
    values (cli, va, 600, v_hoje + 3, 'pendente', rn) returning id into t;
  update titulos_financeiros set status = 'pago', valor_pago = 600, data_pagamento = v_hoje where id = t;
  select * into rec from comissoes_vendas where titulo_id = t;
  assert rec.valor_comissao = 60, format('sem origens: o veiculo do titulo; 3 mensalidades = 3 x 20 (veio %s)', rec.valor_comissao);

  -- ===================================== pro-rata: fracao da assistencia
  insert into cobranca_renegociacoes (cliente_id, tipo, valor_original, valor_total, situacao)
    values (cli, 'PRO_RATA', 50, 50, 'EMITIDA') returning id into rn;
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status, renegociacao_id)
    values (cli, va, 50, v_hoje + 3, 'pendente', rn) returning id into t;
  update titulos_financeiros set status = 'pago', valor_pago = 50, data_pagamento = v_hoje where id = t;
  select * into rec from comissoes_vendas where titulo_id = t;
  assert rec.valor_comissao = 5, format('pro-rata 50/200 de 20 = 5 (veio %s)', rec.valor_comissao);

  -- ===================================== avulso nunca gera comissao
  insert into cobranca_renegociacoes (cliente_id, tipo, valor_original, valor_total, situacao)
    values (cli, 'AVULSO', 80, 80, 'EMITIDA') returning id into rn;
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status, renegociacao_id)
    values (cli, va, 80, v_hoje + 3, 'pendente', rn) returning id into t;
  update titulos_financeiros set status = 'pago', valor_pago = 80, data_pagamento = v_hoje where id = t;
  assert not exists (select 1 from comissoes_vendas where titulo_id = t), 'avulso: sem comissao';
  raise notice 'OK renegociacao';

  raise notice '=== TESTES 0159 (comissao na liquidacao e assistencia) PASSARAM ===';
end $$;
