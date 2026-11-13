-- Teste funcional da 0200: os portais espelham a matriz. Repasse da franquia
-- (1 titulo por consultor, pelo periodo do credito), "pago" so na quitacao
-- (franquia e matriz), a trava do repasse linha a linha da recorrencia, o
-- portal do vendedor pela fonte unica e o que a franquia tem a receber.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  u_vf  uuid := gen_random_uuid();
  rf uuid; rm uuid; tv uuid;
  vf uuid; vm1 uuid;
  cf uuid; cm uuid; vef uuid; vem1 uuid;
  hf1 uuid; lf uuid; ts uuid; ft uuid; tm uuid; fm uuid;
  lote comissoes_franquia_lotes;
  lanc uuid; cvf uuid; cvm uuid; cvx uuid;
  rec record; n integer; ok boolean; j jsonb;
begin
  insert into auth.users (id, email) values (u_adm,'adm200@t.com'), (u_ges,'ges200@t.com'), (u_vf,'vf200@t.com');
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('FRANQUIA 200', 1.0, 0.15) returning id into rf;
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente, comissao_matriz_destino)
    values ('MATRIZ 200', 1.0, 0.135, 'VENDEDORES') returning id into rm;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm200@t.com','admin', null),
    (u_ges,'Gestor F','ges200@t.com','gestor_regional', rf),
    (u_vf,'Vend F','vf200@t.com','consultor_vendas', rf);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo, usuario_id)
    values ('VEND F 200', rf, 0, 0.10, true, u_vf) returning id into vf;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND M1 200', rm, 0, 0.07, true) returning id into vm1;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','CLIENTE F 200','52998224725', rf) returning id into cf;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','CLIENTE M 200','11144477735', rm) returning id into cm;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade,
                        dia_vencimento, tipo_faturamento, vendedor_id, cobranca_externa)
    values (cf,'POR1F20', rf, tv, 'ativo', date '2026-01-10', 200, 5, 'INDIVIDUAL_VEICULO', vf, true) returning id into vef;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade,
                        dia_vencimento, tipo_faturamento, vendedor_id, cobranca_externa)
    values (cm,'POR1M20', rm, tv, 'ativo', date '2026-01-10', 300, 5, 'INDIVIDUAL_VEICULO', vm1, true) returning id into vem1;
  insert into integracao_vinculos (entidade, id_externo, tabela, registro_id) values
    ('CONTRACT_OBJECT','20001','veiculos', vef), ('CONTRACT_OBJECT','20002','veiculos', vem1);

  -- franquia: boleto do Mutual (credito 06/11) + titulo do SCar (credito 11/11)
  insert into lancamentos_financeiros (tipo, descricao, valor_original, data_emissao, data_vencimento, competencia, regional_id)
    values ('RECEITA', 'SICREDI hf1', 200, date '2026-11-06', date '2026-11-06', date '2026-11-01', rf) returning id into lf;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido)
    values (lf, date '2026-11-06', 200, 200);
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, valor_pago, data_pagamento, situacao, status_origem, lancamento_id) values
    ('200-1', cf, vef, 'MONTHLY_PAYMENT', date '2026-11-05', date '2026-11-05', 200, 200, date '2026-11-04', 'pago', 'PAID', lf)
    returning id into hf1;

  insert into titulos_financeiros (cliente_id, veiculo_id, valor, valor_original, data_vencimento, status)
    values (cf, vef, 100, 100, date '2026-11-10', 'pendente') returning id into ts;
  insert into faturas (cliente_id, regional_id, tipo_faturamento, veiculo_id, competencia, valor_total, vencimento, titulo_id)
    values (cf, rf, 'INDIVIDUAL_VEICULO', vef, date '2026-11-01', 100, date '2026-11-10', ts) returning id into ft;
  insert into fatura_itens (fatura_id, veiculo_id, descricao, valor) values (ft, vef, 'item', 100);
  update titulos_financeiros set status = 'pago', valor_pago = 100, data_pagamento = date '2026-11-10',
         data_credito = date '2026-11-11' where id = ts;
  select id into cvf from comissoes_vendas where titulo_id = ts and not is_adesao;
  assert cvf is not null, 'o titulo do SCar gera a comissao';

  -- matriz: titulo do SCar do consultor M1
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, valor_original, data_vencimento, status)
    values (cm, vem1, 150, 150, date '2026-11-10', 'pendente') returning id into tm;
  insert into faturas (cliente_id, regional_id, tipo_faturamento, veiculo_id, competencia, valor_total, vencimento, titulo_id)
    values (cm, rm, 'INDIVIDUAL_VEICULO', vem1, date '2026-11-01', 150, date '2026-11-10', tm) returning id into fm;
  insert into fatura_itens (fatura_id, veiculo_id, descricao, valor) values (fm, vem1, 'item', 150);
  update titulos_financeiros set status = 'pago', valor_pago = 150, data_pagamento = date '2026-11-10',
         data_credito = date '2026-11-11' where id = tm;
  select id into cvm from comissoes_vendas where titulo_id = tm and not is_adesao;

  -- ===================================================== (D) trava do pago linha a linha
  begin
    update comissoes_vendas set status_pagamento = 'pago' where id = cvf;
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'recorrente nao vira paga por fora do repasse';

  -- ===================================================== (D1) matriz: pago so na quitacao
  perform gerar_contas_pagar_comissoes_matriz(date '2026-11-01', date '2026-12-10', rm);
  assert (select status_pagamento from comissoes_vendas where id = cvm) = 'pendente',
    'gerar o contas a pagar nao marca a comissao como paga';
  select lancamento_id into lanc from comissoes_matriz where comissao_venda_id = cvm;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido)
    values (lanc, date '2026-12-10', (select valor_original from lancamentos_financeiros where id = lanc),
            (select valor_original from lancamentos_financeiros where id = lanc));
  assert (select status_pagamento from comissoes_vendas where id = cvm) = 'pago', 'quitou: paga';

  -- ===================================================== (C) repasse da franquia
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  select * into rec from comissoes_consultores_relatorio(date '2026-11-01', date '2026-11-30', rf) where boleto_id = hf1;
  assert rec.situacao = 'PELA_FRANQUIA' and rec.valor_comissao = 20, format('antes: %s', row_to_json(rec));

  lote := regional_gerar_repasse_comissoes(rf, date '2026-11-01', date '2026-11-30', date '2026-12-05');
  assert lote.qtd_lancamentos = 1 and lote.qtd_itens = 2 and lote.valor_total = 30,
    format('1 titulo por consultor (20 + 10): %s', row_to_json(lote));
  select lancamento_id into lanc from comissoes_franquia_itens where lote_id = lote.id limit 1;
  select * into rec from lancamentos_financeiros where id = lanc;
  assert rec.regional_id = rf and rec.vendedor_id = vf and rec.tipo = 'DESPESA' and rec.numero_documento like 'REP-20261130-%'
     and lancamento_da_franquia(rec.categoria_dre_id), format('titulo da unidade: %s', row_to_json(rec));
  assert (select status_pagamento from comissoes_vendas where id = cvf) = 'pendente', 'gerar nao paga';

  select * into rec from comissoes_consultores_relatorio(date '2026-11-01', date '2026-11-30', rf) where boleto_id = hf1;
  assert rec.situacao = 'A_PAGAR' and rec.documento like 'REP-%', format('a pagar: %s', row_to_json(rec));

  begin
    perform regional_gerar_repasse_comissoes(rf, date '2026-11-01', date '2026-11-30', date '2026-12-05');
    ok := false;
  exception when others then ok := sqlerrm like '%Nenhuma comissao%';
  end;
  assert ok, 'nao repassa duas vezes';

  -- cancelou: volta a repassar
  update lancamentos_financeiros set status = 'cancelado' where id = lanc;
  select count(*) into n from comissoes_franquia_itens where lancamento_id = lanc;
  assert n = 0, 'cancelado solta os itens';
  select * into rec from comissoes_consultores_relatorio(date '2026-11-01', date '2026-11-30', rf) where boleto_id = hf1;
  assert rec.situacao = 'PELA_FRANQUIA', 'volta a repassar';

  -- gera de novo e quita
  lote := regional_gerar_repasse_comissoes(rf, date '2026-11-01', date '2026-11-30', date '2026-12-05');
  select lancamento_id into lanc from comissoes_franquia_itens where lote_id = lote.id limit 1;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido)
    values (lanc, date '2026-12-05', 30, 30);
  assert (select status_pagamento from comissoes_vendas where id = cvf) = 'pago', 'quitou o repasse: paga';
  select * into rec from comissoes_consultores_relatorio(date '2026-11-01', date '2026-11-30', rf) where boleto_id = hf1;
  assert rec.situacao = 'PAGO', 'relatorio: paga';

  -- adesao continua no repasse linha a linha
  insert into comissoes_vendas (vendedor_id, veiculo_id, valor_comissao, is_adesao, status_pagamento)
    values (vf, vef, 50, true, 'pendente') returning id into cvx;
  perform regional_repassar_comissao(cvx);
  assert (select status_pagamento from comissoes_vendas where id = cvx) = 'pago', 'adesao segue linha a linha';

  -- ===================================================== (F) a receber da matriz
  j := regional_comissao_da_matriz(rf, date '2026-11-01', date '2026-11-30');
  assert (j ->> 'base_recebida')::numeric = 300 and (j ->> 'valor_estimado')::numeric = 45,
    format('franquia recebe 15%% de 300: %s', j);

  -- ===================================================== (E) portal do vendedor
  perform set_config('request.jwt.claim.sub', u_vf::text, false);
  j := vendedor_comissoes_relatorio_json(date '2026-11-01', date '2026-11-30');
  assert jsonb_array_length(j) = 2, format('o vendedor ve os boletos dele (Mutual + SCar): %s', j);
  assert not (j -> 0 ? 'comissao_venda_id'), 'sem as colunas internas';
  select * into rec from vendedor_painel(date '2026-11-01', date '2026-11-30');
  assert rec.comissao_periodo = 30 and rec.comissao_paga = 30 and rec.comissao_pendente = 0 and rec.veiculos_ativos = 1,
    format('painel do vendedor: %s', row_to_json(rec));
  begin
    perform regional_gerar_repasse_comissoes(rf, date '2026-11-01', date '2026-11-30', date '2026-12-05');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'consultor nao gera repasse';
  -- a chave do escopo nao fica ligada depois
  assert coalesce(current_setting('scar.cobranca_global', true), '') = '', 'GUC desligada';

  -- matriz nao gera repasse de franquia na unidade que ela paga
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  begin
    perform regional_gerar_repasse_comissoes(rm, date '2026-11-01', date '2026-11-30', date '2026-12-05');
    ok := false;
  exception when others then ok := sqlerrm like '%matriz%';
  end;
  assert ok, 'unidade VENDEDORES nao tem repasse da franquia';

  raise notice '=== TESTES 0200 (portais espelham a matriz) PASSARAM ===';
end $$;
