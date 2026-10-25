-- Teste da 0148: o PIX da cobranca casa por valor no mesmo dia.
\set ON_ERROR_STOP on
do $$
declare
  reg uuid; c uuid; conta uuid;
  r record; n int; it_outro uuid; it_compe uuid;
begin
  insert into regionais (nome) values ('UNIDADE 148') returning id into reg;
  insert into contas_bancarias (nome, banco) values ('SICREDI', 'BANCO SICREDI') returning id into conta;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'PAGADOR 148', '35169335695', reg) returning id into c;
  perform set_config('request.jwt.claim.sub', '', false);

  -- quatro boletos: tres de R$ 129 e um de R$ 164, todos pagos por PIX em 13/10; um COMPE de 129
  insert into boletos_historico (id_externo, cliente_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem, linha_digitavel)
  select '148-' || x, c, 'MENSALIDADE', date '2026-10-01', date '2026-10-10', date '2026-10-10', v,
         'aberto', 'ABERTO', '748911600' || '0' || x || '0810' || '0' || '39027231010100000000010000'
    from (values ('720001', 129.00), ('720002', 129.00), ('720003', 129.00), ('720004', 164.00),
                 ('720005', 129.00)) t(x, v);
  perform registrar_liquidacao_banco('SICREDI', 'producao', '6007200' || lpad(k::text, 2, '0'), null,
    date '2026-10-13', v, date '2026-10-13', '{"tipoLiquidacao":"PIX"}'::jsonb)
    from (values (1, 129.00), (2, 129.00), (3, 129.00), (4, 164.00)) t(k, v);
  perform registrar_liquidacao_banco('SICREDI', 'producao', '600720005', null,
    date '2026-10-13', 129.00, date '2026-10-13', '{"tipoLiquidacao":"COMPE"}'::jsonb);

  -- extrato: tres PIX de 129, um de 164, e um credito comum de 129 (nao e cobranca)
  insert into extrato_itens (conta_id, fitid, data, valor, historico)
  select conta, 'P' || k, date '2026-10-13', v, 'RECEB. COB HIBRIDA (A)-PIXCOBRAN CRED_COBPIX'
    from (values (1, 129.00), (2, 129.00), (3, 129.00), (4, 164.00)) t(k, v);
  insert into extrato_itens (conta_id, fitid, data, valor, historico)
  values (conta, 'OUTRO', date '2026-10-13', 129.00, 'TED RECEBIDA FULANO') returning id into it_outro;

  select * into r from conciliar_pix_cobranca(conta, null);
  assert r.conciliados = 4 and r.valor = 551.00, r::text;
  select count(*) into n from extrato_itens where conta_id = conta and situacao = 'CONCILIADO'
     and motivo like 'PIX DA COBRANCA%';
  assert n = 4;
  -- cada baixa PIX em um item so; o COMPE (credito 14/10) e a TED ficam de fora
  assert (select count(distinct baixa_id) from extrato_itens where conta_id = conta and baixa_id is not null) = 4;
  assert (select situacao from extrato_itens where id = it_outro) = 'PENDENTE';
  assert not exists (select 1 from extrato_itens x join baixas_financeiras b on b.id = x.baixa_id
                      join lancamentos_financeiros l on l.id = b.lancamento_id
                     where l.numero_documento = 'SICREDI-600720005');
  -- o valor casou
  assert not exists (select 1 from extrato_itens x join baixas_financeiras b on b.id = x.baixa_id
                     where x.conta_id = conta and b.valor_liquido <> x.valor);

  -- re-executar nao faz nada
  select * into r from conciliar_pix_cobranca(conta, null);
  assert r.conciliados = 0;

  -- a importacao (classificar) chama sozinha: um PIX novo que chega depois
  perform registrar_liquidacao_banco('SICREDI', 'producao', '600720006', null,
    date '2026-10-15', 99.00, date '2026-10-15', '{"tipoLiquidacao":"PIX"}'::jsonb);
  insert into extrato_itens (conta_id, fitid, data, valor, historico)
  values (conta, 'P6', date '2026-10-15', 99.00, 'RECEB. COB HIBRIDA (A)-PIXCOBRAN CRED_COBPIX');
  perform classificar_extrato_itens(conta, null);
  assert (select situacao from extrato_itens where fitid = 'P6') = 'CONCILIADO';

  raise notice '=== TESTES 0148 (PIX da cobranca por valor no dia) PASSARAM ===';
end;
$$;
