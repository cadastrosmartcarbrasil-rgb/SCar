-- Teste da 0149: o extrato marca o grupo dos recebimentos da cobranca e os deixa juntos no dia.
\set ON_ERROR_STOP on
do $$
declare
  reg uuid; c uuid; conta uuid; cat_r uuid; l1 uuid;
  r record; n int; ordem text; saldo_fim numeric;
begin
  insert into regionais (nome) values ('UNIDADE 149') returning id into reg;
  insert into contas_bancarias (nome, banco) values ('SICREDI', 'BANCO SICREDI') returning id into conta;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'PAGADOR 149', '35169335695', reg) returning id into c;
  select id into cat_r from categorias_dre where codigo_estruturado = '3.1.1.01';
  perform set_config('request.jwt.claim.sub', '', false);

  insert into boletos_historico (id_externo, cliente_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem, linha_digitavel)
  select '149-' || x, c, 'MENSALIDADE', date '2026-10-01', date '2026-10-10', date '2026-10-10', v,
         'aberto', 'ABERTO', '748911600' || '0' || x || '0810' || '0' || '39027231010100000000010000'
    from (values ('730001', 100.00), ('730002', 50.00), ('730003', 70.00), ('730004', 30.00)) t(x, v);

  -- dois PIX em 13/10; dois COMPE pagos em 09/10 (credito 13/10)
  perform registrar_liquidacao_banco('SICREDI', 'producao', '60073000' || k, null, d, v, d,
                                     jsonb_build_object('tipoLiquidacao', tp))
    from (values (1, 100.00, date '2026-10-13', 'PIX'), (2, 50.00, date '2026-10-13', 'PIX'),
                 (3, 70.00, date '2026-10-09', 'COMPE'), (4, 30.00, date '2026-10-09', 'REDE')) t(k, v, d, tp);

  -- um recebimento comum no mesmo dia (nao e da cobranca)
  insert into lancamentos_financeiros (tipo, descricao, categoria_dre_id, valor_original, data_vencimento)
    values ('RECEITA', 'Aporte', cat_r, 1000, date '2026-10-13') returning id into l1;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id)
    values (l1, date '2026-10-13', 1000, 1000, conta);

  select count(*) into n from extrato_conta(conta, date '2026-10-13', date '2026-10-13') where grupo = 'PIX';
  assert n = 2, 'PIX: ' || n;
  select count(*) into n from extrato_conta(conta, date '2026-10-13', date '2026-10-13') where grupo = 'COMPE_REDE';
  assert n = 2, 'COMPE/REDE: ' || n;
  assert (select grupo from extrato_conta(conta, date '2026-10-13', date '2026-10-13') where descricao = 'Aporte') is null;

  -- os membros de cada grupo vem juntos. O movimento sem grupo vem antes ou
  -- depois dos grupos conforme a collation do banco (producao: antes; C: depois);
  -- o que importa e cada grupo contiguo e o saldo coerente com a ordem.
  select string_agg(coalesce(grupo, '-'), ',') into ordem
    from extrato_conta(conta, date '2026-10-13', date '2026-10-13');
  assert ordem in ('COMPE_REDE,COMPE_REDE,PIX,PIX,-', '-,COMPE_REDE,COMPE_REDE,PIX,PIX'), ordem;

  -- o saldo do ultimo membro e o saldo depois do grupo inteiro; o fim confere
  select saldo into r from extrato_conta(conta, date '2026-10-13', date '2026-10-13') where grupo = 'COMPE_REDE'
   order by saldo desc limit 1;
  assert r.saldo = case when ordem like '-%' then 1100.00 else 100.00 end, 'saldo depois do COMPE/REDE: ' || r.saldo;
  select max(saldo) into saldo_fim from extrato_conta(conta, date '2026-10-13', date '2026-10-13');
  assert saldo_fim = 1250.00, 'saldo final: ' || saldo_fim;
  assert saldo_fim = saldo_consolidado_em(date '2026-10-13', conta);

  raise notice '=== TESTES 0149 (extrato agrupado da cobranca) PASSARAM ===';
end;
$$;
