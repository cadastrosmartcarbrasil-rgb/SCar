\set ON_ERROR_STOP on
-- 0152: plano de contas padrao, DRE sem contas de balanco, balancete e fluxo evolutivo.
do $$
declare
  v_n int;
  v_txt text;
  c_banco uuid; c_inv uuid;
  cat_mens uuid; cat_alug uuid; cat_ti uuid; cat_sint uuid;
  l1 uuid; l2 uuid; l3 uuid;
  rec record;
  v_deb numeric; v_cred numeric;
  v_json jsonb;
  u_adm uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (u_adm, 'adm152@t.com');
  insert into usuarios (id, nome, email, papel) values (u_adm, 'Admin', 'adm152@t.com', 'admin');
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- ============================================ A) o plano foi implantado
  select count(*) into v_n from categorias_dre
   where codigo_estruturado in ('1','1.1.1.02','2.1.1.01','2.2.2.01','3.1.1.01','3.2.1.01',
                                '4.1.1.01','4.2.1.01','4.2.2.02','4.3.1.01','4.3.2.01');
  assert v_n = 11, format('contas do plano padrao (veio %s)', v_n);

  select analitica, natureza, tipo::text into rec from categorias_dre where codigo_estruturado = '3.1';
  assert not rec.analitica and rec.natureza = 'RECEITA' and rec.tipo = 'RECEITA', '3.1 sintetica de receita';
  select natureza, tipo into rec from categorias_dre where codigo_estruturado = '1.2.1.01';
  assert rec.natureza = 'ATIVO' and rec.tipo is null, 'imobilizado e conta de balanco';
  select natureza into v_txt from categorias_dre where codigo_estruturado = '3.2.1.01';
  assert v_txt = 'DEDUCAO', 'deducao';
  select natureza into v_txt from categorias_dre where codigo_estruturado = '4.3.1.01';
  assert v_txt = 'RECEITA_FINANCEIRA', 'receita financeira';

  -- as contas antigas foram RECODIFICADAS (mesma linha), nao duplicadas
  assert not exists (select 1 from categorias_dre where codigo_estruturado in ('1.1.00','3.2.01','4.9.99')),
    'codigo antigo nao existe mais';
  select codigo_anterior into v_txt from categorias_dre where codigo_estruturado = '3.1.1.01';
  assert v_txt = '1.1.00', 'mensalidade guarda o codigo anterior';
  assert exists (select 1 from plano_contas_migracao where codigo_antigo = '1.1.00'
                    and codigo_novo = '3.1.1.01' and acao = 'RECODIFICADA'), 'trilha da migracao';

  -- ============================================ B) duplicidade e formato
  begin
    insert into categorias_dre (codigo_estruturado, nome) values ('4.2.1.50', 'aluguel e condominio');
    assert false, 'descricao exata repetida (sem acento/caixa) deveria ser recusada';
  exception when unique_violation then null;
  end;
  begin
    insert into categorias_dre (codigo_estruturado, nome) values ('4.2.1.01', 'Outra coisa');
    assert false, 'codigo repetido deveria ser recusado';
  exception when unique_violation then null;
  end;
  begin
    insert into categorias_dre (codigo_estruturado, nome) values ('4.2.x', 'Codigo torto');
    assert false, 'codigo fora do formato deveria ser recusado';
  exception when check_violation then null;
  end;

  insert into categorias_dre (codigo_estruturado, nome) values ('4.2.1.08', 'Seguros da Sede')
  returning id into cat_ti;
  select natureza, tipo::text into rec from categorias_dre where id = cat_ti;
  assert rec.natureza = 'DESPESA' and rec.tipo = 'DESPESA_FIXA', 'natureza deduzida do codigo';

  -- ============================================ C) lancamento so em conta analitica
  select id into cat_sint from categorias_dre where codigo_estruturado = '4.2.1';
  begin
    insert into lancamentos_financeiros (tipo, descricao, valor_original, data_vencimento, categoria_dre_id)
    values ('DESPESA', 'x', 10, current_date, cat_sint);
    assert false, 'conta sintetica nao recebe lancamento';
  exception when check_violation then null;
  end;
  begin
    insert into lancamentos_financeiros (tipo, descricao, valor_original, data_vencimento, categoria_dre_id)
    values ('DESPESA', 'x', 10, current_date, (select id from categorias_dre where codigo_estruturado = '2.1.1.01'));
    assert false, 'conta automatica nao recebe lancamento';
  exception when check_violation then null;
  end;

  -- ============================================ D) balancete e fluxo
  insert into contas_bancarias (nome, tipo, saldo_inicial, saldo_inicial_em)
  values ('BANCO TESTE', 'corrente', 1000, date '2026-05-31') returning id into c_banco;
  insert into contas_bancarias (nome, tipo, saldo_inicial, saldo_inicial_em)
  values ('APLICACAO INVESTIMENTO', 'corrente', 0, date '2026-05-31') returning id into c_inv;
  assert (select classe_fluxo from contas_bancarias where id = c_inv) = 'CONTA_CORRENTE',
    'conta nova nasce conta corrente (a classe se escolhe na tela)';
  update contas_bancarias set classe_fluxo = 'INVESTIMENTO' where id = c_inv;

  select id into cat_mens from categorias_dre where codigo_estruturado = '3.1.1.01';
  select id into cat_alug from categorias_dre where codigo_estruturado = '4.2.1.01';
  select id into cat_ti   from categorias_dre where codigo_estruturado = '1.2.1.01';

  insert into lancamentos_financeiros (tipo, descricao, valor_original, data_emissao, data_vencimento, competencia, categoria_dre_id)
  values ('RECEITA', 'mensalidade', 500, date '2026-06-01', date '2026-06-02', date '2026-06-01', cat_mens) returning id into l1;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id)
  values (l1, date '2026-06-02', 500, 500, c_banco);

  insert into lancamentos_financeiros (tipo, descricao, valor_original, data_emissao, data_vencimento, competencia, categoria_dre_id)
  values ('DESPESA', 'aluguel', 600, date '2026-06-01', date '2026-06-05', date '2026-06-01', cat_alug) returning id into l2;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id)
  values (l2, date '2026-06-05', 600, 600, c_banco);

  -- compra de computador: conta de BALANCO, nao e despesa no DRE
  insert into lancamentos_financeiros (tipo, descricao, valor_original, data_emissao, data_vencimento, competencia, categoria_dre_id)
  values ('DESPESA', 'notebook', 3000, date '2026-06-03', date '2026-06-10', date '2026-06-03', cat_ti) returning id into l3;

  insert into transferencias_bancarias (conta_origem_id, conta_destino_id, data, valor)
  values (c_banco, c_inv, date '2026-06-04', 200);

  -- DRE: imobilizado fora; aluguel e mensalidade dentro
  assert not exists (select 1 from dre_movimentos(date '2026-06-01', date '2026-06-30', null, 'COMPETENCIA')
                      where categoria_codigo = '1.2.1.01'), 'imobilizado nao entra no DRE';
  assert (select sum(valor) from dre_movimentos(date '2026-06-01', date '2026-06-30', null, 'COMPETENCIA')
           where categoria_codigo in ('3.1.1.01','4.2.1.01')) = -100, 'DRE competencia: 500 - 600';

  -- o balancete FECHA: debitos = creditos
  select sum(debitos), sum(creditos) into v_deb, v_cred from balancete_verificacao(date '2026-06-01', date '2026-06-30');
  assert v_deb = v_cred, format('balancete fecha (D %s x C %s)', v_deb, v_cred);
  assert (select sum(saldo_final) from balancete_verificacao(date '2026-06-01', date '2026-06-30')) = 0,
    'saldos devedores = saldos credores';

  select sum(saldo_anterior) as saldo_anterior, sum(debitos) as debitos, sum(creditos) as creditos, sum(saldo_final) as saldo_final
    into rec from balancete_verificacao(date '2026-06-01', date '2026-06-30') where codigo like '1.1.1.02.%'; -- 0153: a analitica da conta
  assert rec.saldo_anterior = 1000 and rec.debitos = 500 and rec.creditos = 800 and rec.saldo_final = 700,
    format('banco: %s / %s / %s / %s', rec.saldo_anterior, rec.debitos, rec.creditos, rec.saldo_final);
  select sum(saldo_anterior) as saldo_anterior, sum(debitos) as debitos, sum(creditos) as creditos, sum(saldo_final) as saldo_final
    into rec from balancete_verificacao(date '2026-06-01', date '2026-06-30') where codigo like '1.1.1.03.%'; -- 0153: a analitica da conta
  assert rec.saldo_final = 200, 'aplicacao recebeu a transferencia';
  select * into rec from balancete_verificacao(date '2026-06-01', date '2026-06-30') where codigo = '2.1.1.01';
  assert rec.saldo_final = -3000, 'notebook ainda a pagar (saldo credor)';
  select * into rec from balancete_verificacao(date '2026-06-01', date '2026-06-30') where codigo = '1.2.1.01';
  assert rec.saldo_final = 3000, 'imobilizado';
  select sum(saldo_anterior) as saldo_anterior, sum(debitos) as debitos, sum(creditos) as creditos, sum(saldo_final) as saldo_final
    into rec from balancete_verificacao(date '2026-06-03', date '2026-06-30') where codigo like '1.1.1.02.%'; -- 0153: a analitica da conta
  assert rec.saldo_anterior = 1500, 'saldo anterior inclui o que veio antes do periodo';

  -- fluxo evolutivo: o que a tela precisa
  v_json := fluxo_caixa_evolutivo(date '2026-06-01', date '2026-06-10');
  assert exists (select 1 from jsonb_array_elements(v_json->'contas') x
                  where (x->>'id')::uuid = c_inv and x->>'classe' = 'INVESTIMENTO'), 'conta com a classe';
  assert (select sum((x->>'entrada')::numeric) from jsonb_array_elements(v_json->'por_categoria') x
           where x->>'codigo' = '3.1.1.01') = 500, 'entrada da mensalidade';
  assert (select sum((x->>'saida')::numeric) from jsonb_array_elements(v_json->'por_categoria') x
           where x->>'codigo' = '4.2.1.01') = 600, 'saida do aluguel';
  assert not exists (select 1 from jsonb_array_elements(v_json->'por_categoria') x where x->>'codigo' is null),
    'transferencia nao vira entrada/saida';

  -- ============================================ E) exclusao protegida
  begin
    delete from categorias_dre where id = cat_alug;
    assert false, 'conta com lancamento nao se exclui';
  exception when foreign_key_violation then null;
  end;
  begin
    delete from categorias_dre where codigo_estruturado = '4.2.1';
    assert false, 'sintetica com filhas nao se exclui';
  exception when foreign_key_violation then null;
  end;

  raise notice '=== TESTES 0152 PASSARAM ===';
end;
$$;
