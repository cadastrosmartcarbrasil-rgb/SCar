-- Teste da 0147: o credito somado da cobranca concilia com as baixas do dia.
\set ON_ERROR_STOP on
do $$
declare
  reg uuid; c uuid; conta uuid; outra uuid;
  it_lote uuid; it_pix uuid; it_errado uuid; it_um uuid;
  r record; n int; b_rede uuid;
begin
  insert into regionais (nome) values ('UNIDADE 147') returning id into reg;
  insert into contas_bancarias (nome, banco) values ('SICREDI', 'BANCO SICREDI') returning id into conta;
  insert into contas_bancarias (nome, banco) values ('INTER', 'BANCO INTER') returning id into outra;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'PAGADOR 147', '35169335695', reg) returning id into c;
  perform set_config('request.jwt.claim.sub', '', false);

  insert into boletos_historico (id_externo, cliente_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem, linha_digitavel)
  select '147-' || x, c, 'MENSALIDADE', date '2026-10-01', date '2026-10-10', date '2026-10-10', v,
         'aberto', 'ABERTO', '748911600' || '0' || x || '0810' || '0' || '39027231010100000000010000'
    from (values ('710001', 100.00), ('710002', 150.50), ('710003', 333.00), ('710004', 99.00)) t(x, v);

  -- pagos em 09/10: dois COMPE e um REDE (credito 13/10); um PIX em 13/10
  perform registrar_liquidacao_banco('SICREDI', 'producao', '600710001', null, date '2026-10-09', 100.00,
    date '2026-10-09', '{"tipoLiquidacao":"COMPE"}'::jsonb);
  perform registrar_liquidacao_banco('SICREDI', 'producao', '600710002', null, date '2026-10-09', 150.50,
    date '2026-10-09', '{"tipoLiquidacao":"COMPE"}'::jsonb);
  perform registrar_liquidacao_banco('SICREDI', 'producao', '600710003', null, date '2026-10-09', 333.00,
    date '2026-10-09', '{"tipoLiquidacao":"REDE"}'::jsonb);
  perform registrar_liquidacao_banco('SICREDI', 'producao', '600710004', null, date '2026-10-13', 99.00,
    date '2026-10-13', '{"tipoLiquidacao":"PIX"}'::jsonb);
  assert (select count(*) from baixas_financeiras where conta_bancaria_id = conta and data_pagamento = date '2026-10-13') = 4;

  -- o extrato do dia 13/10: o credito somado (ignorado pela regra) e o PIX
  insert into extrato_itens (conta_id, fitid, data, valor, historico, situacao, motivo)
  values (conta, 'F-LOTE', date '2026-10-13', 583.50, 'LIQ.COBRANCA SIMPLES-COB000003 COB000003',
          'IGNORADO', 'MENSALIDADE: historico contem "COBRANCA" (a baixa vem pelo banco)')
  returning id into it_lote;
  insert into extrato_itens (conta_id, fitid, data, valor, historico)
  values (conta, 'F-PIX', date '2026-10-13', 99.00, 'RECEBIMENTO PIX') returning id into it_pix;

  -- previa
  select * into r from lote_cobranca_extrato_item(it_lote);
  assert r.quantidade = 3 and r.soma = 583.50 and r.diferenca = 0 and r.quantidade_extrato = 3 and r.confere,
    'previa: ' || r::text;
  select * into r from lote_cobranca_extrato_item(it_pix);
  assert not r.confere, 'o PIX nao e lote';

  -- concilia os que fecham
  select * into r from conciliar_lotes_cobranca(conta, null);
  assert r.conciliados = 1 and r.valor = 583.50, r::text;
  assert (select situacao from extrato_itens where id = it_lote) = 'CONCILIADO';
  assert (select motivo from extrato_itens where id = it_lote) like 'LOTE DA COBRANCA: 3 boleto%';
  assert (select count(*) from extrato_item_lote where extrato_item_id = it_lote) = 3;
  select count(*) into n from baixas_financeiras b join extrato_item_lote lt on lt.baixa_id = b.id
   where b.status_conciliacao = 'CONCILIADO_API';
  assert n = 3;
  -- o PIX nao entrou no lote e continua aberto
  assert (select situacao from extrato_itens where id = it_pix) = 'PENDENTE';
  -- o caixa marca as 3 baixas como conciliadas, com o item do extrato
  select count(*) into n from tesouraria_movimentos(date '2026-10-13', date '2026-10-13')
   where conta_id = conta and origem = 'BAIXA' and conciliado and extrato_item_id = it_lote;
  assert n = 3, 'tesouraria: ' || n;

  -- baixa do lote nao e sugerida para outro item
  insert into extrato_itens (conta_id, fitid, data, valor, historico)
  values (conta, 'F-UM', date '2026-10-13', 333.00, 'CREDITO AVULSO') returning id into it_um;
  assert not exists (select 1 from sugestao_extrato_item(it_um) where tipo = 'BAIXA'), 'baixa do lote sugerida';
  assert not exists (select 1 from candidatos_extrato_item(it_um) c
                      join extrato_item_lote lt on lt.baixa_id = c.ref_id), 'baixa do lote como candidata';

  -- lote que nao fecha: recusa com a diferenca
  insert into extrato_itens (conta_id, fitid, data, valor, historico)
  values (conta, 'F-ERR', date '2026-10-13', 600.00, 'LIQ.COBRANCA SIMPLES-COB000004') returning id into it_errado;
  begin
    perform conciliar_lote_extrato_item(it_errado);
    assert false, 'deveria recusar';
  exception when sqlstate '22023' then null;
  end;

  -- desfazer devolve as baixas e solta o vinculo
  perform desfazer_extrato_item(it_lote);
  assert (select situacao from extrato_itens where id = it_lote) = 'PENDENTE';
  assert (select count(*) from extrato_item_lote) = 0;
  select count(*) into n from baixas_financeiras
   where conta_bancaria_id = conta and status_conciliacao = 'CONCILIADO_API';
  assert n = 0;

  -- concilia de novo pelo item e apaga uma baixa: o lote inteiro volta a conciliar
  perform conciliar_lote_extrato_item(it_lote);
  select b.id into b_rede from baixas_financeiras b
    join lancamentos_financeiros l on l.id = b.lancamento_id
   where l.numero_documento = 'SICREDI-600710003';
  delete from baixas_financeiras where id = b_rede;
  assert (select situacao from extrato_itens where id = it_lote) = 'PENDENTE';
  assert (select count(*) from extrato_item_lote) = 0;
  assert (select count(*) from baixas_financeiras where conta_bancaria_id = conta
           and status_conciliacao = 'CONCILIADO_API') = 0;

  -- conta de outro operador nao entra
  select * into r from conciliar_lotes_cobranca(outra, null);
  assert r.conciliados = 0;

  raise notice '=== TESTES 0147 (conciliacao em lote da cobranca) PASSARAM ===';
end;
$$;
