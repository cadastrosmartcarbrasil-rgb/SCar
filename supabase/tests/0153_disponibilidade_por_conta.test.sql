-- 0153: cada conta bancaria tem a sua analitica em Disponibilidades.
do $$
declare
  u_adm uuid := gen_random_uuid();
  c_a uuid; c_b uuid; c_cx uuid;
  v_cod text; v_cod_b text; v_cat uuid; v_n int;
  cat_mens uuid; l1 uuid;
  rec record;
begin
  insert into auth.users (id, email) values (u_adm, 'adm153@t.com');
  insert into usuarios (id, nome, email, papel) values (u_adm, 'Admin', 'adm153@t.com', 'admin');
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- os grupos viraram sinteticas
  select count(*) into v_n from categorias_dre
   where codigo_estruturado in ('1.1.1.01','1.1.1.02','1.1.1.03','1.1.1.04') and not analitica;
  assert v_n = 4, format('quatro grupos sinteticos (veio %s)', v_n);
  assert (select analitica and automatica from categorias_dre where codigo_estruturado = '1.1.1.99'),
    '1.1.1.99 analitica automatica';
  assert (select nome from categorias_dre where codigo_estruturado = '1.1.1.02') = 'Bancos Conta Corrente', 'grupo renomeado';

  -- cadastrar cria a analitica dentro do grupo da classe
  insert into contas_bancarias (nome, tipo) values ('SICREDI 153', 'corrente') returning id into c_a;
  insert into contas_bancarias (nome, tipo) values ('INTER 153', 'corrente') returning id into c_b;
  insert into contas_bancarias (nome, tipo, classe_fluxo) values ('CAIXA 153', 'caixa', 'DINHEIRO') returning id into c_cx;

  select c.codigo_estruturado, c.id into v_cod, v_cat from contas_bancarias cb join categorias_dre c on c.id = cb.conta_contabil_id where cb.id = c_a;
  select c.codigo_estruturado into v_cod_b from contas_bancarias cb join categorias_dre c on c.id = cb.conta_contabil_id where cb.id = c_b;
  assert v_cod like '1.1.1.02.%' and v_cod_b like '1.1.1.02.%' and v_cod <> v_cod_b,
    format('uma analitica por banco (%s, %s)', v_cod, v_cod_b);
  assert (select nome from categorias_dre where id = v_cat) = 'SICREDI 153', 'nome do banco';
  assert (select analitica and automatica and natureza = 'ATIVO' from categorias_dre where id = v_cat), 'analitica automatica de ativo';
  assert codigo_contabil_banco(c_cx) like '1.1.1.01.%', 'caixa no grupo de caixas';

  -- renomear renomeia; trocar a classe recodifica (mesmo id); inativar inativa
  update contas_bancarias set nome = 'SICREDI 153 MATRIZ' where id = c_a;
  assert (select nome from categorias_dre where id = v_cat) = 'SICREDI 153 MATRIZ', 'renomeada';
  update contas_bancarias set classe_fluxo = 'INVESTIMENTO' where id = c_a;
  assert (select codigo_estruturado from categorias_dre where id = v_cat) like '1.1.1.03.%', 'recodificada para aplicacoes';
  assert (select conta_contabil_id from contas_bancarias where id = c_a) = v_cat, 'mesmo id';
  update contas_bancarias set ativo = false where id = c_a;
  assert not (select ativo from categorias_dre where id = v_cat), 'inativada junto';
  update contas_bancarias set ativo = true, classe_fluxo = 'CONTA_CORRENTE' where id = c_a;

  -- nome igual a uma conta do plano nao colide: ganha sufixo
  insert into contas_bancarias (nome, tipo) values ('Caixas', 'corrente') returning id into c_cx;
  assert (select c.nome from contas_bancarias cb join categorias_dre c on c.id = cb.conta_contabil_id where cb.id = c_cx)
         = 'Caixas (conta bancaria)', 'nome repetido diferenciado';

  -- nao recebe lancamento direto e nao se apaga pelo plano
  select id into cat_mens from categorias_dre where codigo_estruturado = '3.1.1.01';
  begin
    insert into lancamentos_financeiros (tipo, descricao, valor_original, data_emissao, data_vencimento, categoria_dre_id)
    values ('RECEITA', 'x', 1, current_date, current_date, v_cat);
    assert false, 'conta do banco nao recebe lancamento';
  exception when check_violation then null;
  end;
  begin
    delete from categorias_dre where id = v_cat;
    assert false, 'conta do banco nao se apaga pelo plano';
  exception when foreign_key_violation then null;
  end;

  -- o balancete separa o dinheiro por banco
  insert into lancamentos_financeiros (tipo, descricao, valor_original, data_emissao, data_vencimento, competencia, categoria_dre_id)
  values ('RECEITA', 'mensalidade', 300, date '2026-07-01', date '2026-07-02', date '2026-07-01', cat_mens) returning id into l1;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id)
  values (l1, date '2026-07-02', 300, 300, c_b);
  select * into rec from balancete_verificacao(date '2026-07-01', date '2026-07-31') where codigo = v_cod_b;
  assert rec.debitos = 300 and rec.saldo_final = 300, format('INTER recebeu 300 (%s)', rec.saldo_final);
  assert not exists (select 1 from balancete_verificacao(date '2026-07-01', date '2026-07-31') where codigo = '1.1.1.02'),
    'nada no grupo sintetico';

  -- apagar a conta bancaria leva a analitica junto
  select conta_contabil_id into v_cat from contas_bancarias where id = c_cx;
  delete from contas_bancarias where id = c_cx;
  assert not exists (select 1 from categorias_dre where id = v_cat), 'analitica apagada com a conta';

  raise notice '=== 0153 disponibilidade por conta: TODOS OS TESTES PASSARAM ===';
end;
$$;
