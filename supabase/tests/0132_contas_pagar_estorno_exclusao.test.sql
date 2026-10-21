-- Teste da 0132: estorno de baixa e exclusao de lancamento em aberto, com
-- permissao pela grade, trilha e as recusas (banco, OS da 24h, titulo pago).
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_fin uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  reg uuid;
  conta uuid;
  forn uuid;
  l1 uuid; l2 uuid; l3 uuid; l4 uuid;
  b1 uuid; b2 uuid; b3 uuid;
  r jsonb;
  st text; saldo numeric;
  recusou boolean;
  n bigint;
begin
  insert into regionais (nome) values ('UNIDADE 132') returning id into reg;
  insert into auth.users (id, email) values (u_adm,'adm132@t.com'), (u_fin,'fin132@t.com'), (u_ges,'ges132@t.com');
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm132@t.com','admin', null),
    (u_fin,'Financeiro','fin132@t.com','financeiro', null),
    (u_ges,'Gestor','ges132@t.com','gestor_regional', reg);
  insert into contas_bancarias (nome, banco, tipo) values ('CONTA 132', 'BANCO', 'corrente') returning id into conta;
  insert into fornecedores (tipo_pessoa, razao_social) values ('PJ', 'OFICINA 132') returning id into forn;

  insert into lancamentos_financeiros (tipo, descricao, valor_original, data_emissao, data_vencimento, regional_id, fornecedor_id)
    values ('DESPESA', 'PECAS 132', 300, current_date, current_date + 10, reg, forn) returning id into l1;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id)
    values (l1, current_date, 100, 100, conta) returning id into b1;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id)
    values (l1, current_date, 200, 200, conta) returning id into b2;
  insert into anexos_financeiros (lancamento_id, baixa_id, nome_arquivo, url_storage)
    values (null, b2, 'comprovante.pdf', 'x/comprovante.pdf');
  select status::text into st from lancamentos_financeiros where id = l1;
  assert st = 'quitado', 'titulo nasce quitado: ' || st;

  -- gestor nao tem estornar (seed so financeiro)
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  recusou := false;
  begin perform estornar_baixa(b2, 'pagamento em duplicidade');
  exception when insufficient_privilege then recusou := true; end;
  assert recusou, 'gestor nao estorna sem extra';

  -- financeiro estorna; sem motivo e recusado
  perform set_config('request.jwt.claim.sub', u_fin::text, false);
  recusou := false;
  begin perform estornar_baixa(b2, '');
  exception when check_violation then recusou := true; end;
  assert recusou, 'motivo obrigatorio';

  r := estornar_baixa(b2, 'pagamento lancado errado');
  assert r->>'status' = 'pago_parcial', 'volta a pago parcial: ' || (r->>'status');
  select valor_saldo into saldo from lancamentos_financeiros where id = l1;
  assert saldo = 200, 'saldo volta a 200: ' || saldo;
  assert not exists (select 1 from baixas_financeiras where id = b2);
  -- o comprovante fica no titulo
  assert exists (select 1 from anexos_financeiros where url_storage = 'x/comprovante.pdf' and lancamento_id = l1 and baixa_id is null),
    'comprovante preservado no titulo';
  select count(*) into n from financeiro_auditoria where acao = 'ESTORNO_BAIXA' and baixa_id = b2;
  assert n = 1, 'trilha do estorno';

  -- extra libera o gestor
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  perform salvar_permissoes_usuario(u_ges,
    jsonb_build_array(jsonb_build_object('modulo','financeiro','acao','estornar')), 'teste do estorno');
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  r := estornar_baixa(b1, 'estorno pelo gestor com extra');
  select status::text into st from lancamentos_financeiros where id = l1;
  assert st = 'pendente', 'sem baixa volta a pendente: ' || st;

  -- excluir: titulo sem baixa
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  recusou := false;
  begin perform excluir_lancamento(l1, 'nao deveria');
  exception when insufficient_privilege then recusou := true; end;
  assert recusou, 'gestor nao exclui sem extra';

  perform set_config('request.jwt.claim.sub', u_fin::text, false);
  insert into lancamentos_financeiros (tipo, descricao, valor_original, data_emissao, data_vencimento, regional_id, fornecedor_id)
    values ('DESPESA', 'PAGO 132', 50, current_date, current_date, reg, forn) returning id into l2;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido) values (l2, current_date, 50, 50);
  recusou := false;
  begin perform excluir_lancamento(l2, 'titulo ja pago');
  exception when check_violation then recusou := true; end;
  assert recusou, 'titulo com baixa nao se exclui';

  -- titulo da OS da 24h
  insert into lancamentos_financeiros (tipo, descricao, valor_original, data_emissao, data_vencimento, regional_id, fornecedor_id)
    values ('DESPESA', 'GUINCHO 132', 80, current_date, current_date, reg, forn) returning id into l3;
  recusou := false;
  begin
    update acionamentos_assistencia set lancamento_id = l3
     where id = (select id from acionamentos_assistencia limit 1);
    if found then
      begin perform excluir_lancamento(l3, 'titulo da OS');
      exception when check_violation then recusou := true; end;
      assert recusou, 'titulo da OS nao se exclui';
    end if;
  end;

  -- titulo do banco
  insert into lancamentos_financeiros (tipo, descricao, valor_original, data_emissao, data_vencimento, regional_id, numero_documento)
    values ('RECEITA', 'MENSALIDADE BANCO', 120, current_date, current_date, reg, 'SICREDI-123') returning id into l4;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id)
    values (l4, current_date, 120, 120, conta) returning id into b3;
  recusou := false;
  begin perform estornar_baixa(b3, 'tentar estornar o banco');
  exception when check_violation then recusou := true; end;
  assert recusou, 'pagamento do banco nao se estorna';

  -- exclusao valida, com cotacao ligada
  update lancamentos_financeiros set status = 'pendente' where id = l1;
  r := excluir_lancamento(l1, 'lancado em duplicidade');
  assert not exists (select 1 from lancamentos_financeiros where id = l1), 'excluido';
  assert jsonb_array_length(r->'arquivos') = 1, 'devolve o arquivo para tirar do storage';
  select count(*) into n from financeiro_auditoria where acao = 'EXCLUSAO_LANCAMENTO' and lancamento_id = l1;
  assert n = 1, 'trilha da exclusao sobrevive';

  -- cotacao guarda fornecedor e lancamento
  assert exists (select 1 from information_schema.columns
                  where table_name = 'cotacoes_pecas' and column_name in ('fornecedor_id'));
  assert exists (select 1 from information_schema.columns
                  where table_name = 'cotacoes_pecas' and column_name in ('lancamento_id'));

  raise notice '=== TESTES 0132 (estorno e exclusao) PASSARAM ===';
end;
$$;
