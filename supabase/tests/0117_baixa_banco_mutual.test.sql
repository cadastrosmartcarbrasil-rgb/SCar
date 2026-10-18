-- Teste da 0117: o pagamento do boleto do MUTUAL informado pelo Sicredi.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  reg uuid; c uuid; conta uuid; h1 uuid; h2 uuid; h3 uuid;
  r record; n int; l record;
  -- linha digitavel Sicredi: o nosso numero fica no campo livre (posicoes 3..11)
begin
  insert into auth.users (id, email) values (u_adm, 'adm117@t.com'), (u_con, 'con117@t.com');
  insert into usuarios (id, nome, email, papel) values
    (u_adm, 'Admin', 'adm117@t.com', 'admin'),
    (u_con, 'Consultor', 'con117@t.com', 'consultor_vendas');
  insert into regionais (nome) values ('UNIDADE 117') returning id into reg;
  insert into contas_bancarias (nome, banco) values ('SICREDI', 'BANCO SICREDI') returning id into conta;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'PAGADOR 117', '35169335695', reg) returning id into c;

  insert into boletos_historico (id_externo, cliente_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem, linha_digitavel)
  values ('117-1', c, 'MENSALIDADE', date '2026-10-01', date '2026-10-10', date '2026-10-10', 172.00,
          'aberto', 'ABERTO',
          '74891160007840200810039027231010100000000017200')
  returning id into h1;
  assert (select nosso_numero from boletos_historico where id = h1) = '600784020',
    'nosso numero sai da linha digitavel: ' || coalesce((select nosso_numero from boletos_historico where id = h1), 'null');

  -- boleto ja PAGO pelo Mutual: o dinheiro entrou aqui, entao ganha o recebimento
  insert into boletos_historico (id_externo, cliente_id, tipo, vencimento_original, data_vencimento,
                                 valor, valor_pago, data_pagamento, situacao, status_origem, linha_digitavel)
  values ('117-2', c, 'MENSALIDADE', date '2026-10-05', date '2026-10-05', 100, 100, date '2026-10-14',
          'pago', 'PAGO', '74891160007000000810039027231010100000000010000')
  returning id into h2;
  assert (select nosso_numero from boletos_historico where id = h2) = '600700000';

  -- linha que nao e Sicredi nao gera nosso numero
  insert into boletos_historico (id_externo, cliente_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem, linha_digitavel)
  values ('117-3', c, 'MENSALIDADE', date '2026-10-05', date '2026-10-05', 90, 'aberto', 'ABERTO',
          '00190000090000000000000000000000000000000009000')
  returning id into h3;
  assert (select nosso_numero from boletos_historico where id = h3) is null;

  -- Consultor nao registra baixa bancaria
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  begin
    perform registrar_liquidacao_banco('SICREDI', 'producao', '600784020', null, date '2026-10-16', 172.5, date '2026-10-16', null);
    assert false, 'consultor nao pode registrar';
  exception when insufficient_privilege then null;
  end;

  -- Rotina do servidor: casa o boleto do Mutual e cria o recebimento
  perform set_config('request.jwt.claim.sub', '', false);
  select * into r from registrar_liquidacao_banco('SICREDI', 'producao', '600784020', '7728209270',
    date '2026-10-16', 172.50, date '2026-10-16', '{"tipoLiquidacao":"PIX"}'::jsonb);
  assert r.situacao = 'BAIXADO', 'boleto do Mutual deveria baixar: ' || r.situacao;
  assert r.titulo_id is null;
  assert r.valor_divergente, '172,50 x 172,00 marca divergencia';

  select h.situacao, h.valor_pago, h.data_pagamento, h.baixa_banco_em, h.lancamento_id into l
    from boletos_historico h where h.id = h1;
  assert l.situacao = 'pago' and l.valor_pago = 172.50 and l.data_pagamento = date '2026-10-16';
  assert l.baixa_banco_em is not null and l.lancamento_id is not null;

  select lf.tipo::text as tipo, lf.status::text as status, lf.valor_original, lf.regional_id, lf.cliente_id,
         lf.competencia, cat.codigo_estruturado as cod
    into l
    from lancamentos_financeiros lf left join categorias_dre cat on cat.id = lf.categoria_dre_id
   where lf.id = (select lancamento_id from boletos_historico where id = h1);
  assert l.tipo = 'RECEITA' and l.status = 'quitado', 'recebimento quitado: ' || l.status;
  assert l.valor_original = 172.50 and l.regional_id = reg and l.cliente_id = c;
  assert l.cod = '1.1.00' and l.competencia = date '2026-10-01';

  select b.conta_bancaria_id, b.forma_pagamento::text as forma, b.status_conciliacao::text as conc,
         b.data_pagamento, b.valor_liquido
    into l
    from baixas_financeiras b where b.lancamento_id = (select lancamento_id from boletos_historico where id = h1);
  assert l.conta_bancaria_id = conta and l.forma = 'PIX' and l.conc = 'NAO_CONCILIADO';
  assert l.data_pagamento = date '2026-10-16' and l.valor_liquido = 172.50;

  -- entra no DRE de caixa da unidade (lido pela matriz)
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  assert (select coalesce(sum(valor), 0) from dre_movimentos(date '2026-10-01', date '2026-10-31', reg, 'CAIXA')
           where categoria_codigo = '1.1.00') = 172.50, 'recebido entra no DRE de caixa';
  perform set_config('request.jwt.claim.sub', '', false);

  -- Re-executar nao duplica
  select * into r from registrar_liquidacao_banco('SICREDI', 'producao', '600784020', null,
    date '2026-10-16', 172.50, date '2026-10-16', null);
  assert r.situacao = 'BAIXADO', 'releitura mantem BAIXADO: ' || r.situacao;
  select count(*) into n from lancamentos_financeiros where numero_documento = 'SICREDI-600784020';
  assert n = 1, 'um recebimento so';
  select count(*) into n from cobranca_liquidacoes where nosso_numero = '600784020';
  assert n = 1;
  assert (select boleto_historico_id from cobranca_liquidacoes where nosso_numero = '600784020') = h1;

  -- A importacao do Mutual (que ficou sem webhook) nao desfaz o pago
  update boletos_historico set situacao = 'aberto', valor_pago = null, data_pagamento = null where id = h1;
  select situacao, valor_pago into l from boletos_historico where id = h1;
  assert l.situacao = 'pago' and l.valor_pago = 172.50, 'importacao nao desfaz pagamento do banco';

  -- Boleto ja pago no Mutual tambem ganha o recebimento (o dinheiro entrou aqui)
  select * into r from registrar_liquidacao_banco('SICREDI', 'producao', '600700000', null,
    date '2026-10-14', 100, date '2026-10-14', null);
  assert r.situacao = 'BAIXADO', 'pago no Mutual + pago no banco = recebimento: ' || r.situacao;
  assert (select forma_pagamento::text from baixas_financeiras b
           join boletos_historico h on h.lancamento_id = b.lancamento_id where h.id = h2) = 'BOLETO';

  -- Antes do inicio (13/10/2026): marca pago, sem recebimento
  insert into boletos_historico (id_externo, cliente_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem, linha_digitavel)
  values ('117-4', c, 'MENSALIDADE', date '2026-10-01', date '2026-10-01', 80, 'aberto', 'ABERTO',
          '74891160007111110810039027231010100000000008000');
  select * into r from registrar_liquidacao_banco('SICREDI', 'producao', '600711111', null,
    date '2026-10-10', 80, date '2026-10-10', null);
  assert r.situacao = 'BAIXADO';
  assert (select situacao from boletos_historico where id_externo = '117-4') = 'pago';
  assert (select lancamento_id from boletos_historico where id_externo = '117-4') is null,
    'antes de 13/10 nao cria recebimento';

  -- Sandbox nunca toca no boleto do Mutual
  select * into r from registrar_liquidacao_banco('SICREDI', 'sandbox', '600784020', null,
    date '2026-10-16', 172.50, date '2026-10-16', null);
  assert r.situacao = 'NAO_ENCONTRADO';

  -- Pagamento que chega ANTES do boleto ser importado: reprocessar resolve
  select * into r from registrar_liquidacao_banco('SICREDI', 'producao', '600722222', null,
    date '2026-10-15', 50, date '2026-10-15', null);
  assert r.situacao = 'NAO_ENCONTRADO';
  insert into boletos_historico (id_externo, cliente_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem, linha_digitavel)
  values ('117-5', c, 'MENSALIDADE', date '2026-10-15', date '2026-10-15', 50, 'aberto', 'ABERTO',
          '74891160007222220810039027231010100000000005000');
  select quantidade into n from reprocessar_liquidacoes_banco(null) where situacao = 'BAIXADO';
  assert n = 1, 'reprocessar baixa o que passou a casar';
  assert (select situacao from cobranca_liquidacoes where nosso_numero = '600722222' and ambiente = 'producao') = 'BAIXADO';

  -- So a matriz reprocessa
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  begin
    perform reprocessar_liquidacoes_banco(null);
    assert false, 'consultor nao reprocessa';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', '', false);

  raise notice '=== TESTES 0117 (baixa dos boletos do Mutual pelo banco) PASSARAM ===';
end;
$$;
