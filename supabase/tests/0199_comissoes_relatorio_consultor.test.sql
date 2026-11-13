-- Teste funcional da 0199: relatorio de comissoes por consultor pela DATA DO
-- CREDITO (baixa do recebimento no Mutual, data_credito no titulo do SCar,
-- estimada quando o boleto foi pago fora do nosso banco), os mesmos valores da
-- gestao (0198), o filtro por consultor, o escopo do gestor e o credito gravado
-- no ledger.
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
  lf uuid; ft uuid; ts uuid;
  rec record; n integer; s numeric; ok boolean;
begin
  insert into auth.users (id, email) values (u_adm,'adm199@t.com'), (u_ges,'ges199@t.com'), (u_con,'con199@t.com');
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('FRANQUIA 199', 1.0, 0.15) returning id into rf;
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente, comissao_matriz_destino)
    values ('MATRIZ 199', 1.0, 0.135, 'VENDEDORES') returning id into rm;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm199@t.com','admin', null),
    (u_ges,'Gestor F','ges199@t.com','gestor_regional', rf),
    (u_con,'Consultor','con199@t.com','consultor_vendas', rm);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND F 199', rf, 0, 0.10, true) returning id into vf;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND M1 199', rm, 0, 0.07, true) returning id into vm1;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND M2 199', rm, 0, 0.05, false) returning id into vm2;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','CLIENTE F 199','52998224725', rf) returning id into cf;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','CLIENTE M 199','11144477735', rm) returning id into cm;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade,
                        dia_vencimento, tipo_faturamento, vendedor_id, cobranca_externa)
    values (cf,'REL1F99', rf, tv, 'ativo', date '2026-01-10', 200, 5, 'INDIVIDUAL_VEICULO', vf, true) returning id into vef;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade,
                        dia_vencimento, tipo_faturamento, vendedor_id, cobranca_externa)
    values (cm,'REL1M99', rm, tv, 'ativo', date '2026-01-10', 300, 5, 'INDIVIDUAL_VEICULO', vm1, true) returning id into vem1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade,
                        dia_vencimento, tipo_faturamento, vendedor_id, cobranca_externa)
    values (cm,'REL2M99', rm, tv, 'ativo', date '2026-01-10', 100, 5, 'INDIVIDUAL_VEICULO', vm2, true) returning id into vem2;
  insert into integracao_vinculos (entidade, id_externo, tabela, registro_id) values
    ('CONTRACT_OBJECT','19901','veiculos', vef), ('CONTRACT_OBJECT','19902','veiculos', vem1),
    ('CONTRACT_OBJECT','19903','veiculos', vem2);

  -- recebimento do Sicredi do boleto hf1: pago 04/11, CREDITADO 06/11
  insert into lancamentos_financeiros (tipo, descricao, valor_original, data_emissao, data_vencimento, competencia, regional_id)
    values ('RECEITA', 'SICREDI hf1', 200, date '2026-11-06', date '2026-11-06', date '2026-11-01', rf) returning id into lf;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido)
    values (lf, date '2026-11-06', 200, 200);

  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, valor_pago, data_pagamento, situacao, status_origem) values
    ('199-0', cf, vef, 'MONTHLY_PAYMENT', date '2026-10-05', date '2026-10-05', 200, 200, date '2026-11-03', 'pago', 'PAID')
    returning id into hf0;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, valor_pago, data_pagamento, situacao, status_origem, lancamento_id) values
    ('199-1', cf, vef, 'MONTHLY_PAYMENT', date '2026-11-05', date '2026-11-05', 200, 200, date '2026-11-04', 'pago', 'PAID', lf)
    returning id into hf1;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, valor_pago, data_pagamento, situacao, status_origem) values
    ('199-2', cf, vef, 'MONTHLY_PAYMENT', date '2026-11-06', date '2026-11-06', 100, 100, date '2026-12-02', 'pago', 'PAID')
    returning id into hf2;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, valor_pago, data_pagamento, situacao, status_origem) values
    ('199-3', cm, vem1, 'MONTHLY_PAYMENT', date '2026-11-05', date '2026-11-05', 300, 300, date '2026-11-05', 'pago', 'PAID')
    returning id into hm1;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, valor_pago, data_pagamento, situacao, status_origem) values
    ('199-4', cm, vem2, 'MONTHLY_PAYMENT', date '2026-11-05', date '2026-11-05', 100, 100, date '2026-11-05', 'pago', 'PAID')
    returning id into hm2;

  -- titulo do SCar: pago 10/11 (COMPE), credito 11/11
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, valor_original, data_vencimento, status)
    values (cm, vem1, 150, 150, date '2026-11-10', 'pendente') returning id into ts;
  insert into faturas (cliente_id, regional_id, tipo_faturamento, veiculo_id, competencia, valor_total, vencimento, titulo_id)
    values (cm, rm, 'INDIVIDUAL_VEICULO', vem1, date '2026-11-01', 150, date '2026-11-10', ts) returning id into ft;
  insert into fatura_itens (fatura_id, veiculo_id, descricao, valor) values (ft, vem1, 'item', 150);
  update titulos_financeiros set status = 'pago', valor_pago = 150, data_pagamento = date '2026-11-10',
         data_credito = date '2026-11-11' where id = ts;

  -- ===================================================== data do credito
  select * into rec from data_credito_boleto('MUTUAL', hf1);
  assert rec.data_credito = date '2026-11-06' and not rec.estimada, 'Mutual pelo credito da baixa';
  select * into rec from data_credito_boleto('MUTUAL', hm1);
  assert rec.data_credito = date '2026-11-05' and rec.estimada, 'sem recebimento: data do pagamento, estimada';
  select * into rec from data_credito_boleto('SCAR', ts);
  assert rec.data_credito = date '2026-11-11' and not rec.estimada, 'SCar pela data_credito do titulo';

  -- ===================================================== relatorio antes de apurar
  select count(*) into n from comissoes_consultores_relatorio(date '2026-11-01', date '2026-11-30');
  assert n = 4, 'novembro: hf1 + hm1 + hm2 + titulo do SCar (outubro e o credito de dezembro ficam fora) — veio ' || n;
  select * into rec from comissoes_consultores_relatorio(date '2026-11-01', date '2026-11-30') where boleto_id = hf1;
  assert rec.vendedor_id = vf and rec.valor_comissao = 20 and rec.quem_paga = 'FRANQUIA'
     and rec.situacao = 'PELA_FRANQUIA' and rec.data_credito = date '2026-11-06' and not rec.credito_estimado,
    format('franquia: %s', row_to_json(rec));
  select * into rec from comissoes_consultores_relatorio(date '2026-11-01', date '2026-11-30') where boleto_id = hm1;
  assert rec.valor_comissao = 21 and rec.situacao = 'NAO_APURADO' and rec.credito_estimado, format('M1 Mutual: %s', row_to_json(rec));
  select * into rec from comissoes_consultores_relatorio(date '2026-11-01', date '2026-11-30') where boleto_id = ts;
  assert rec.valor_comissao = 10.50 and rec.valor_recebido = 150 and rec.data_credito = date '2026-11-11',
    format('M1 SCar: %s', row_to_json(rec));
  select * into rec from comissoes_consultores_relatorio(date '2026-11-01', date '2026-11-30') where boleto_id = hm2;
  assert rec.valor_comissao = 0 and rec.situacao = 'CONSULTOR_INATIVO', 'inativo nao recebe';

  -- o filtro e pelo CREDITO: o titulo pago dia 10 creditou dia 11
  select count(*) into n from comissoes_consultores_relatorio(date '2026-11-10', date '2026-11-10') where boleto_id = ts;
  assert n = 0, 'pago dia 10, creditado dia 11: nao entra no dia 10';
  select count(*) into n from comissoes_consultores_relatorio(date '2026-11-11', date '2026-11-11') where boleto_id = ts;
  assert n = 1, 'entra no dia do credito';
  select count(*) into n from comissoes_consultores_relatorio(date '2026-12-01', date '2026-12-31') where boleto_id = hf2;
  assert n = 1, 'boleto de novembro creditado em dezembro entra em dezembro';

  -- ===================================================== depois de apurar: o ledger manda
  perform apurar_comissoes_matriz(date '2026-11-01');
  select * into rec from comissoes_consultores_relatorio(date '2026-11-01', date '2026-11-30') where boleto_id = hm1;
  assert rec.valor_comissao = 21 and rec.situacao = 'PENDENTE', 'apurado: pendente';
  assert (select data_credito from comissoes_matriz where boleto_id = hm1 and beneficiario = 'VENDEDOR') = date '2026-11-05',
    'ledger grava o credito';
  assert (select credito_estimado from comissoes_matriz where boleto_id = hm1 and beneficiario = 'VENDEDOR'),
    'ledger marca o estimado';
  assert (select data_credito from comissoes_matriz where boleto_id = hf1) = date '2026-11-06', 'ledger da franquia com o credito';
  perform gerar_contas_pagar_comissoes_matriz(date '2026-11-01', date '2026-12-10');
  select * into rec from comissoes_consultores_relatorio(date '2026-11-01', date '2026-11-30') where boleto_id = ts;
  assert rec.situacao = 'A_PAGAR' and rec.documento like 'COM-202611-%', format('a pagar com o documento: %s', row_to_json(rec));

  -- ===================================================== a resposta unica (jsonb)
  assert jsonb_array_length(comissoes_consultores_relatorio_json(date '2026-11-01', date '2026-11-30')) = 4,
    'o jsonb traz as mesmas linhas';
  assert (comissoes_consultores_relatorio_json(date '2026-11-01', date '2026-11-30', null, vm1) -> 0 ->> 'vendedor_nome')
         = 'VEND M1 199', 'o jsonb respeita o filtro';

  -- ===================================================== filtro por consultor
  select count(*), sum(valor_comissao) into n, s
    from comissoes_consultores_relatorio(date '2026-11-01', date '2026-11-30', null, vm1);
  assert n = 2 and s = 31.50, format('so o M1: %s / %s', n, s);

  -- ===================================================== escopo e permissao
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  select count(*) into n from comissoes_consultores_relatorio(date '2026-11-01', date '2026-11-30', rm);
  assert n = 1 and not exists (select 1 from comissoes_consultores_relatorio(date '2026-11-01', date '2026-11-30', rm)
                                where regional_id = rm), 'gestor ve so a propria unidade';
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  begin
    perform comissoes_consultores_relatorio(date '2026-11-01', date '2026-11-30');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'consultor nao ve o relatorio';
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  begin
    perform comissoes_consultores_relatorio(date '2026-11-30', date '2026-11-01');
    ok := false;
  exception when others then ok := true;
  end;
  assert ok, 'periodo invertido e recusado';

  raise notice '=== TESTES 0199 (relatorio por consultor) PASSARAM ===';
end $$;
