-- Teste da 0146: a baixa do banco entra na DATA DO CREDITO.
\set ON_ERROR_STOP on
do $$
declare
  reg uuid; c uuid; conta uuid; integ uuid; tit uuid; lanc uuid;
  r record; n int;
begin
  -- feriados nacionais semeados
  assert exists (select 1 from cobranca_feriados where data = date '2026-10-12'), 'feriado 12/10';
  assert exists (select 1 from cobranca_feriados where data = date '2026-11-20'), 'feriado 20/11';

  -- B) a regra
  assert data_credito_banco(date '2026-10-09', 'PIX') = date '2026-10-09', 'PIX no dia';
  assert data_credito_banco(date '2026-10-17', 'PIX') = date '2026-10-17', 'PIX no sabado';
  assert data_credito_banco(date '2026-10-09', 'COMPE') = date '2026-10-13', 'sexta + feriado';
  assert data_credito_banco(date '2026-10-13', 'COMPE') = date '2026-10-14', 'D+1';
  assert data_credito_banco(date '2026-10-16', 'REDE') = date '2026-10-19', 'sexta -> segunda';
  assert data_credito_banco(date '2026-10-17', 'COMPE') = date '2026-10-19', 'sabado -> segunda';
  assert data_credito_banco(date '2026-10-13', null) = date '2026-10-13', 'sem tipo: o dia';

  insert into regionais (nome) values ('UNIDADE 146') returning id into reg;
  insert into contas_bancarias (nome, banco) values ('SICREDI', 'BANCO SICREDI') returning id into conta;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'PAGADOR 146', '35169335695', reg) returning id into c;
  perform set_config('request.jwt.claim.sub', '', false);

  insert into boletos_historico (id_externo, cliente_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem, linha_digitavel)
  select '146-' || x, c, 'MENSALIDADE', date '2026-10-01', date '2026-10-10', date '2026-10-10', 100,
         'aberto', 'ABERTO', '748911600' || '0' || x || '0810' || '0' || '39027231010100000000010000'
    from unnest(array['700001','700002','700003','700004']) x;
  assert (select count(*) from boletos_historico where nosso_numero like '6007000%') = 4, 'linhas montadas';

  -- 1) COMPE pago 13/10: baixa e vencimento em 14/10; o boleto guarda 13/10
  select * into r from registrar_liquidacao_banco('SICREDI', 'producao', '600700001', null,
    date '2026-10-13', 100, date '2026-10-13', '{"tipoLiquidacao":"COMPE"}'::jsonb);
  assert r.situacao = 'BAIXADO', r.situacao;
  select lancamento_id into lanc from cobranca_liquidacoes where nosso_numero = '600700001';
  assert (select data_pagamento from baixas_financeiras where lancamento_id = lanc) = date '2026-10-14', 'baixa no credito';
  assert (select forma_pagamento::text from baixas_financeiras where lancamento_id = lanc) = 'BOLETO';
  assert (select data_vencimento from lancamentos_financeiros where id = lanc) = date '2026-10-14';
  assert (select data_emissao from lancamentos_financeiros where id = lanc) = date '2026-10-13';
  assert (select data_pagamento from boletos_historico where id_externo = '146-700001') = date '2026-10-13';
  select tipo_liquidacao, data_credito into r from cobranca_liquidacoes where nosso_numero = '600700001';
  assert r.tipo_liquidacao = 'COMPE' and r.data_credito = date '2026-10-14';

  -- 2) PIX pago 13/10: credito no dia
  perform registrar_liquidacao_banco('SICREDI', 'producao', '600700002', null,
    date '2026-10-13', 100, date '2026-10-13', '{"tipoLiquidacao":"PIX"}'::jsonb);
  select lancamento_id into lanc from cobranca_liquidacoes where nosso_numero = '600700002';
  assert (select data_pagamento from baixas_financeiras where lancamento_id = lanc) = date '2026-10-13';
  assert (select forma_pagamento::text from baixas_financeiras where lancamento_id = lanc) = 'PIX';

  -- 3) COMPE pago 09/10 (antes do inicio), credito 13/10: ENTRA no caixa em 13/10
  select * into r from registrar_liquidacao_banco('SICREDI', 'producao', '600700003', null,
    date '2026-10-09', 100, date '2026-10-09', '{"tipoLiquidacao":"COMPE"}'::jsonb);
  assert r.situacao = 'BAIXADO', r.situacao;
  select lancamento_id into lanc from cobranca_liquidacoes where nosso_numero = '600700003';
  assert lanc is not null, 'pago antes, creditado depois do inicio: entra';
  assert (select data_pagamento from baixas_financeiras where lancamento_id = lanc) = date '2026-10-13';

  -- 4) COMPE pago 08/10, credito 09/10 (antes do inicio): nao entra no caixa
  perform registrar_liquidacao_banco('SICREDI', 'producao', '600700004', null,
    date '2026-10-08', 100, date '2026-10-08', '{"tipoLiquidacao":"COMPE"}'::jsonb);
  assert (select lancamento_id from cobranca_liquidacoes where nosso_numero = '600700004') is null;

  -- re-executar nao duplica
  perform registrar_liquidacao_banco('SICREDI', 'producao', '600700001', null,
    date '2026-10-13', 100, date '2026-10-13', '{"tipoLiquidacao":"COMPE"}'::jsonb);
  select count(*) into n from lancamentos_financeiros where numero_documento = 'SICREDI-600700001';
  assert n = 1;

  -- 5) nao identificado por REDE: baixa no credito
  perform registrar_liquidacao_banco('SICREDI', 'producao', '600799999', null,
    date '2026-10-16', 50, date '2026-10-16', '{"tipoLiquidacao":"REDE"}'::jsonb);
  select lancamento_id into lanc from cobranca_liquidacoes where nosso_numero = '600799999';
  assert (select data_pagamento from baixas_financeiras where lancamento_id = lanc) = date '2026-10-19';

  -- 6) titulo do SCar por COMPE: pagamento 16/10, credito e caixa em 19/10
  insert into integracoes_bancarias (provedor, ambiente, nome, conta_bancaria_id)
    values ('SICREDI', 'producao', 'Sicredi 146', conta) returning id into integ;
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status, nosso_numero, integracao_id)
    values (c, 80, date '2026-10-16', 'pendente', '211461461', integ) returning id into tit;
  select * into r from registrar_liquidacao_banco('SICREDI', 'producao', '211461461', null,
    date '2026-10-16', 80, date '2026-10-16', '{"tipoLiquidacao":"COMPE"}'::jsonb);
  assert r.situacao = 'BAIXADO' and r.titulo_id = tit;
  assert (select data_pagamento from titulos_financeiros where id = tit) = date '2026-10-16';
  assert (select data_credito from titulos_financeiros where id = tit) = date '2026-10-19';
  assert (select data from tesouraria_movimentos(null, null) where origem = 'TITULO' and ref_id = tit)
         = date '2026-10-19', 'caixa no credito';

  raise notice '=== TESTES 0146 (baixa na data do credito) PASSARAM ===';
end;
$$;
