-- Teste funcional da 0198 (gestao de comissoes pela matriz): so recorrencia a
-- partir de 11/2026, as duas fontes (Mutual + SCar), FRANQUIA x VENDEDORES,
-- consultor inativo, painel por regional, previa, contas a pagar na data
-- escolhida, pagamento atrasado no envio seguinte, volta do financeiro
-- (quitar/cancelar/excluir) e o escopo de cada papel.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  rf uuid; rm uuid; tv uuid;
  vf uuid; vm1 uuid; vm2 uuid;
  cf uuid; cm uuid; vef uuid; vem1 uuid; vem2 uuid;
  hf0 uuid; hf1 uuid; hf2 uuid; hm1 uuid; hm2 uuid;
  ft uuid; ts uuid; cv uuid;
  j jsonb; rec record; n integer; s numeric; lote record; lf uuid; lv uuid; ok boolean;
begin
  insert into auth.users (id, email) values (u_adm,'adm198@t.com'), (u_ges,'ges198@t.com'), (u_con,'con198@t.com');
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('FRANQUIA 198', 1.0, 0.15) returning id into rf;
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente, comissao_matriz_destino)
    values ('MATRIZ 198', 1.0, 0.135, 'VENDEDORES') returning id into rm;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm198@t.com','admin', null),
    (u_ges,'Gestor F','ges198@t.com','gestor_regional', rf),
    (u_con,'Consultor','con198@t.com','consultor_vendas', rm);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  assert (select comissao_matriz_destino from regionais where id = rf) = 'FRANQUIA', 'padrao e FRANQUIA';

  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND F 198', rf, 0, 0.10, true) returning id into vf;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND M1 198', rm, 0, 0.07, true) returning id into vm1;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND M2 198', rm, 0, 0.05, false) returning id into vm2;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','CLIENTE F 198','52998224725', rf) returning id into cf;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','CLIENTE M 198','11144477735', rm) returning id into cm;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade,
                        dia_vencimento, tipo_faturamento, vendedor_id, cobranca_externa)
    values (cf,'COM1F98', rf, tv, 'ativo', date '2026-01-10', 200, 5, 'INDIVIDUAL_VEICULO', vf, true) returning id into vef;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade,
                        dia_vencimento, tipo_faturamento, vendedor_id, cobranca_externa)
    values (cm,'COM1M98', rm, tv, 'ativo', date '2026-01-10', 300, 5, 'INDIVIDUAL_VEICULO', vm1, true) returning id into vem1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade,
                        dia_vencimento, tipo_faturamento, vendedor_id, cobranca_externa)
    values (cm,'COM2M98', rm, tv, 'ativo', date '2026-01-10', 100, 5, 'INDIVIDUAL_VEICULO', vm2, true) returning id into vem2;
  insert into integracao_vinculos (entidade, id_externo, tabela, registro_id) values
    ('CONTRACT_OBJECT','19801','veiculos', vef), ('CONTRACT_OBJECT','19802','veiculos', vem1),
    ('CONTRACT_OBJECT','19803','veiculos', vem2);   -- migrados: nada de adesao

  -- boletos do Mutual
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, valor_pago, data_pagamento, situacao, status_origem) values
    ('198-0', cf, vef, 'MONTHLY_PAYMENT', date '2026-10-05', date '2026-10-05', 200, 200, date '2026-10-05', 'pago', 'PAID')
    returning id into hf0;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, valor_pago, data_pagamento, situacao, status_origem) values
    ('198-1', cf, vef, 'MONTHLY_PAYMENT', date '2026-11-05', date '2026-11-05', 200, 200, date '2026-11-04', 'pago', 'PAID')
    returning id into hf1;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem) values
    ('198-2', cf, vef, 'MONTHLY_PAYMENT', date '2026-11-06', date '2026-11-06', 100, 'aberto', 'PENDING')
    returning id into hf2;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, valor_pago, data_pagamento, situacao, status_origem) values
    ('198-3', cm, vem1, 'MONTHLY_PAYMENT', date '2026-11-05', date '2026-11-05', 300, 300, date '2026-11-05', 'pago', 'PAID')
    returning id into hm1;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, valor_pago, data_pagamento, situacao, status_origem) values
    ('198-4', cm, vem2, 'MONTHLY_PAYMENT', date '2026-11-05', date '2026-11-05', 100, 100, date '2026-11-05', 'pago', 'PAID')
    returning id into hm2;

  -- titulo de mensalidade do SCar (fatura individual) na unidade VENDEDORES
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, valor_original, data_vencimento, status)
    values (cm, vem1, 150, 150, date '2026-11-10', 'pendente') returning id into ts;
  insert into faturas (cliente_id, regional_id, tipo_faturamento, veiculo_id, competencia, valor_total, vencimento, titulo_id)
    values (cm, rm, 'INDIVIDUAL_VEICULO', vem1, date '2026-11-01', 150, date '2026-11-10', ts) returning id into ft;
  insert into fatura_itens (fatura_id, veiculo_id, descricao, valor) values (ft, vem1, 'item', 150);
  update titulos_financeiros set status = 'pago', valor_pago = 150, data_pagamento = date '2026-11-10' where id = ts;
  select id into cv from comissoes_vendas where titulo_id = ts;
  assert (select valor_comissao from comissoes_vendas where id = cv) = 10.50
     and not (select is_adesao from comissoes_vendas where id = cv), 'comissao do SCar 150 x 7% = 10,50 (recorrencia)';

  -- ===================================================== regra de inicio
  begin
    perform apurar_comissoes_matriz(date '2026-10-01');
    ok := false;
  exception when others then ok := true;
  end;
  assert ok, 'outubro nao tem comissao (comeca em 11/2026)';

  -- ===================================================== apuracao de novembro
  j := apurar_comissoes_matriz(date '2026-11-20');
  assert (j->>'itens')::int = 3, 'tres linhas: franquia + Mutual do M1 + SCar do M1 (veio ' || j::text || ')';
  assert (j->>'valor_total')::numeric = 61.50, 'total 30 + 21 + 10,50 (veio ' || j::text || ')';
  select * into rec from comissoes_matriz where boleto_id = hf1;
  assert rec.beneficiario = 'FRANQUIA' and rec.valor_comissao = 30 and rec.taxa = 0.15 and rec.vendedor_id is null,
    'franquia: 200 x 15%';
  assert not exists (select 1 from comissoes_matriz where boleto_id in (hf0, hf2)), 'outubro e boleto aberto ficam de fora';
  assert not exists (select 1 from comissoes_matriz where boleto_id = hm2), 'consultor inativo nao recebe';
  select * into rec from comissoes_matriz where boleto_id = ts;
  assert rec.comissao_venda_id = cv and rec.valor_comissao = 10.50 and rec.base_calculo = 150, 'SCar reaproveita a comissao';
  j := apurar_comissoes_matriz(date '2026-11-01');
  assert (select count(*) from comissoes_matriz) = 3, 'reapurar e idempotente';

  -- ===================================================== painel
  select * into rec from comissoes_matriz_desempenho(date '2026-11-01', 3, null)
   where regional_id = rf and competencia = date '2026-11-01';
  assert rec.boletos_emitidos = 2 and rec.valor_emitido = 300 and rec.boletos_recebidos = 1
     and rec.valor_recebido = 200 and rec.comissao_franquia = 30 and rec.vendedor_nome = 'VEND F 198',
    format('painel da franquia: %s', row_to_json(rec));
  select * into rec from comissoes_matriz_desempenho(date '2026-11-01', 3, null)
   where vendedor_id = vm1 and competencia = date '2026-11-01';
  assert rec.boletos_emitidos = 2 and rec.valor_recebido = 450 and rec.comissao_vendedor = 31.50,
    format('painel do consultor M1: %s', row_to_json(rec));
  select count(*) into n from comissoes_matriz_desempenho(date '2026-11-01', 3, null) where competencia = date '2026-10-01';
  assert n = 1, 'outubro aparece no comparativo (sem comissao)';

  -- ===================================================== previa e contas a pagar
  select count(*), sum(valor_comissao) into n, s from comissoes_matriz_previa(date '2026-11-01');
  assert n = 2 and s = 61.50, format('previa: 2 favorecidos, 61,50 (veio %s / %s)', n, s);

  select * into lote from gerar_contas_pagar_comissoes_matriz(date '2026-11-01', date '2026-12-10');
  assert lote.qtd_lancamentos = 2 and lote.qtd_itens = 3 and lote.valor_total = 61.50, format('lote: %s', row_to_json(lote));
  select id into lf from lancamentos_financeiros where descricao like 'Comissao da franquia 11/2026 - FRANQUIA 198';
  select id into lv from lancamentos_financeiros where vendedor_id = vm1 and descricao like 'Comissao recorrente%';
  assert lf is not null and lv is not null, 'um titulo por favorecido';
  select * into rec from lancamentos_financeiros where id = lf;
  assert rec.tipo = 'DESPESA' and rec.regional_id is null and rec.valor_original = 30
     and rec.data_vencimento = date '2026-12-10' and rec.competencia = date '2026-11-01'
     and rec.categoria_dre_id = regional_categoria_movimento('COMISSAO_PAGAR'),
    format('titulo da franquia e da MATRIZ, na data escolhida: %s', row_to_json(rec));
  select * into rec from lancamentos_financeiros where id = lv;
  assert rec.regional_id = rm and rec.valor_original = 31.50, 'titulo do consultor na unidade dele';
  assert (select status_pagamento from comissoes_vendas where id = cv) = 'pago', 'portal nao repassa de novo';

  begin
    perform gerar_contas_pagar_comissoes_matriz(date '2026-11-01', date '2026-12-10');
    ok := false;
  exception when others then ok := true;
  end;
  assert ok, 'nada pendente: nao gera de novo';

  -- ===================================================== pagamento atrasado
  update boletos_historico set situacao = 'pago', valor_pago = 100, data_pagamento = date '2026-12-02' where id = hf2;
  select * into lote from gerar_contas_pagar_comissoes_matriz(date '2026-12-01', date '2027-01-10');
  assert lote.qtd_lancamentos = 1 and lote.valor_total = 15, 'boleto de novembro pago em dezembro entra no envio seguinte';

  -- ===================================================== volta do financeiro
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido)
    values (lv, date '2026-12-10', 31.50, 31.50);
  assert (select status from lancamentos_financeiros where id = lv) = 'quitado', 'baixa total quita';
  assert (select count(*) from comissoes_matriz where lancamento_id = lv and data_pagamento = date '2026-12-10') = 2,
    'quitou: comissoes pagas';
  update lancamentos_financeiros set status = 'cancelado' where id = lf;
  assert (select count(*) from comissoes_matriz where boleto_id = hf1 and lancamento_id is null) = 1,
    'cancelou: volta a pendente';
  delete from lancamentos_financeiros where id = (select lancamento_id from comissoes_matriz where boleto_id = hf2);
  assert (select lancamento_id from comissoes_matriz where boleto_id = hf2) is null, 'excluiu: volta a pendente';

  -- ===================================================== escopo
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  select count(distinct regional_id) into n from comissoes_matriz_desempenho(date '2026-11-01', 3, rm);
  assert n = 1 and not exists (select 1 from comissoes_matriz_desempenho(date '2026-11-01', 3, rm) where regional_id = rm),
    'gestor ve so a propria unidade, mesmo pedindo outra';
  begin
    perform gerar_contas_pagar_comissoes_matriz(date '2026-11-01', date '2026-12-10');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'gestor nao gera contas a pagar';
  begin
    perform comissoes_matriz_previa(date '2026-11-01');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'gestor nao ve a previa';

  perform set_config('request.jwt.claim.sub', u_con::text, false);
  begin
    perform comissoes_matriz_desempenho(date '2026-11-01');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'consultor nao ve o painel';

  -- automatica: desligada e so do agendador
  perform set_config('request.jwt.claim.sub', '', false);
  assert gerar_contas_pagar_comissoes_automatico() = 'desligada', 'automatica nasce desligada';

  raise notice '=== TESTES 0198 (comissoes da matriz) PASSARAM ===';
end $$;
