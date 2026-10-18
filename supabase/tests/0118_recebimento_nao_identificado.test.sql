-- Teste da 0118: pagamento sem boleto nem titulo vira recebimento nao identificado.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  reg uuid; c uuid; conta uuid; lanc uuid; tit uuid; integ uuid;
  r record; l record; n int;
begin
  insert into auth.users (id, email) values (u_adm, 'adm118@t.com');
  insert into usuarios (id, nome, email, papel) values (u_adm, 'Admin', 'adm118@t.com', 'admin');
  insert into regionais (nome) values ('UNIDADE 118') returning id into reg;
  insert into contas_bancarias (nome, banco) values ('SICREDI', 'BANCO SICREDI') returning id into conta;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'PAGADOR 118', '35169335695', reg) returning id into c;
  perform set_config('request.jwt.claim.sub', '', false);

  -- 1) sem boleto: lanca o nao identificado na matriz
  select * into r from registrar_liquidacao_banco('SICREDI', 'producao', '600733333', null,
    date '2026-10-15', 61.00, date '2026-10-15', '{"tipoLiquidacao":"PIX"}'::jsonb);
  assert r.situacao = 'NAO_ENCONTRADO', r.situacao;
  select lancamento_id into lanc from cobranca_liquidacoes where nosso_numero = '600733333';
  assert lanc is not null, 'trilha aponta o recebimento';
  select lf.status::text as st, lf.cliente_id, lf.regional_id, lf.valor_original, cat.codigo_estruturado as cod
    into l from lancamentos_financeiros lf join categorias_dre cat on cat.id = lf.categoria_dre_id where lf.id = lanc;
  assert l.st = 'quitado' and l.cliente_id is null and l.regional_id is null and l.valor_original = 61.00;
  assert l.cod = '1.9.98';
  assert (select conta_bancaria_id from baixas_financeiras where lancamento_id = lanc) = conta;

  -- re-executar nao duplica (o reprocessar passa por ele de novo)
  perform reprocessar_liquidacoes_banco(null);
  perform registrar_liquidacao_banco('SICREDI', 'producao', '600733333', null,
    date '2026-10-15', 61.00, date '2026-10-15', null);
  select count(*) into n from lancamentos_financeiros where numero_documento = 'SICREDI-600733333';
  assert n = 1, 'um lancamento so: ' || n;

  -- 2) o boleto do Mutual chega depois: o MESMO lancamento vira a mensalidade
  insert into boletos_historico (id_externo, cliente_id, tipo, competencia, vencimento_original,
                                 data_vencimento, valor, situacao, status_origem, linha_digitavel)
  values ('118-1', c, 'MENSALIDADE', date '2026-10-01', date '2026-10-15', date '2026-10-15', 61,
          'aberto', 'ABERTO', '74891160007333330810039027231010100000000006100');
  select quantidade into n from reprocessar_liquidacoes_banco(null) where situacao = 'BAIXADO';
  assert n = 1, 'reprocessar identifica';
  select lf.cliente_id, lf.regional_id, cat.codigo_estruturado as cod, lf.competencia
    into l from lancamentos_financeiros lf join categorias_dre cat on cat.id = lf.categoria_dre_id where lf.id = lanc;
  assert l.cliente_id = c and l.regional_id = reg and l.cod = '1.1.00' and l.competencia = date '2026-10-01';
  assert (select lancamento_id from boletos_historico where id_externo = '118-1') = lanc;
  select count(*) into n from lancamentos_financeiros where numero_documento = 'SICREDI-600733333';
  assert n = 1;
  assert (select count(*) from baixas_financeiras where lancamento_id = lanc) = 1;

  -- 3) antes de 13/10 e no sandbox: nada lancado
  perform registrar_liquidacao_banco('SICREDI', 'producao', '600744444', null,
    date '2026-10-10', 30, date '2026-10-10', null);
  perform registrar_liquidacao_banco('SICREDI', 'sandbox', '600755555', null,
    date '2026-10-15', 30, date '2026-10-15', null);
  assert (select count(*) from cobranca_liquidacoes where nosso_numero in ('600744444','600755555')
           and lancamento_id is not null) = 0;

  -- 4) titulo do SCar aparece: o nao identificado e cancelado
  perform registrar_liquidacao_banco('SICREDI', 'producao', '211009999', null,
    date '2026-10-16', 99, date '2026-10-16', null);
  select lancamento_id into lanc from cobranca_liquidacoes where nosso_numero = '211009999';
  assert lanc is not null;
  insert into integracoes_bancarias (provedor, ambiente, nome)
    values ('SICREDI', 'producao', 'Sicredi 118') returning id into integ;
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status, nosso_numero, integracao_id)
    values (c, 99, date '2026-10-16', 'pendente', '211009999', integ) returning id into tit;
  select * into r from registrar_liquidacao_banco('SICREDI', 'producao', '211009999', null,
    date '2026-10-16', 99, date '2026-10-16', null);
  assert r.situacao = 'BAIXADO' and r.titulo_id = tit;
  assert (select status::text from lancamentos_financeiros where id = lanc) = 'cancelado';
  assert (select count(*) from baixas_financeiras where lancamento_id = lanc) = 0;
  assert (select lancamento_id from cobranca_liquidacoes where nosso_numero = '211009999') is null;

  -- 5) o nao identificado entra no DRE de caixa da matriz (lido pelo admin)
  perform registrar_liquidacao_banco('SICREDI', 'producao', '600766666', null,
    date '2026-10-17', 45, date '2026-10-17', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  assert (select coalesce(sum(valor), 0) from dre_movimentos(date '2026-10-01', date '2026-10-31', null, 'CAIXA')
           where categoria_codigo = '1.9.98') = 45, 'nao identificado no DRE';
  perform set_config('request.jwt.claim.sub', '', false);

  raise notice '=== TESTES 0118 (recebimento nao identificado) PASSARAM ===';
end;
$$;
