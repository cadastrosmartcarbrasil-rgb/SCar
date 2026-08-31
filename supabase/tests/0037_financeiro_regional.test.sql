-- Teste funcional do financeiro compacto da franquia (0037)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_g1  uuid := gen_random_uuid();
  u_g2  uuid := gen_random_uuid();
  r1 uuid; r2 uuid; v1 uuid; v2 uuid; c1 uuid; ve1 uuid;
  t_receber uuid; t_pagar uuid; t_matriz uuid; t_outra uuid;
  com1 uuid; lanc uuid;
  n int; v_txt text; rec record; erro text;
begin
  -- ------------------------------------------------------------------ setup
  insert into auth.users (id, email) values (u_adm,'adm@t.com'), (u_g1,'g1@t.com'), (u_g2,'g2@t.com');
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('Smart FML', 1.0, 0.15) returning id into r1;
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('Gabriela Cuiaba', 1.0, 0.10) returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm@t.com','admin', null),
    (u_g1,'Gestor FML','g1@t.com','gestor_regional', r1),
    (u_g2,'Gestor Cuiaba','g2@t.com','gestor_regional', r2);

  -- vendedor SEM usuario de portal: e exatamente o caso que o 0035 liberou
  -- e que quebrava as funcoes de 0034.
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('Amanda Hilario', r1, 1.0, 0.05) returning id into v1;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('Bruno Cuiaba', r2, 1.0, 0.05) returning id into v2;

  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- ============================================================ (D) regressoes
  -- Teto da comissao: baixar a regional NAO pode passar por cima de um
  -- vendedor sem usuario de portal.
  begin
    update regionais set taxa_comissao_recorrente = 0.02 where id = r1;
    assert false, 'deveria recusar: Amanda (5%) ficaria acima do novo teto (2%)';
  exception when check_violation then
    null;
  end;
  raise notice 'OK teto da comissao enxerga vendedor sem acesso ao portal';

  -- Repasse: o titulo tem de nascer na FRANQUIA, nao na matriz.
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Cliente Um','11144477735', r1) returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, vendedor_id, status)
    values (c1,'AAA1A11', r1, v1, 'ativo') returning id into ve1;
  insert into comissoes_vendas (vendedor_id, veiculo_id, valor_comissao, is_adesao, status_pagamento)
    values (v1, ve1, 500, true, 'pendente') returning id into com1;

  lanc := repassar_comissao_vendedor(com1);
  select regional_id, descricao, vendedor_id into rec
    from lancamentos_financeiros where id = lanc;
  assert rec.regional_id = r1,
    'o repasse tem de ficar na franquia, veio ' || coalesce(rec.regional_id::text, 'MATRIZ (nulo)');
  assert rec.descricao like '%Amanda%', 'nome do vendedor no titulo, veio ' || rec.descricao;
  assert rec.vendedor_id = v1, 'favorecido do repasse';
  raise notice 'OK repasse de vendedor sem portal fica na franquia (nao na matriz)';

  -- ============================================================ (E) financeiro
  perform set_config('request.jwt.claim.sub', u_g1::text, false);

  -- lancar passando o id da OUTRA franquia: o banco forca a propria
  t_receber := regional_lancar_titulo(r2, 'COMISSAO_RECEBER',
    'Comissao de agosto - matriz', 3200.50, current_date + 5);
  select regional_id into v_txt from lancamentos_financeiros where id = t_receber;
  assert v_txt = r1::text,
    'o titulo tem de nascer na unidade de quem lanca, veio ' || coalesce(v_txt,'nulo');

  -- classificacao contabil resolvida pelo banco
  select cat.codigo_estruturado into v_txt
    from lancamentos_financeiros l join categorias_dre cat on cat.id = l.categoria_dre_id
   where l.id = t_receber;
  assert v_txt = '1.3.01', 'comissao a receber = 1.3.01, veio ' || coalesce(v_txt,'nenhuma');

  t_pagar := regional_lancar_titulo(r1, 'COMISSAO_PAGAR',
    'Repasse Amanda - agosto', 800, current_date - 3, v1);
  select cat.codigo_estruturado into v_txt
    from lancamentos_financeiros l join categorias_dre cat on cat.id = l.categoria_dre_id
   where l.id = t_pagar;
  assert v_txt = '3.2.01', 'repasse ao vendedor = 3.2.01, veio ' || coalesce(v_txt,'nenhuma');
  raise notice 'OK a franquia lanca sem escolher plano de contas';

  -- movimento fora dos dois de comissao e recusado
  begin
    perform regional_lancar_titulo(r1, 'ALUGUEL', 'Aluguel da sala', 1200, current_date);
    assert false, 'deveria recusar movimento fora de comissao';
  exception when check_violation then null; end;

  -- vendedor de outra unidade nao pode ser favorecido
  begin
    perform regional_lancar_titulo(r1, 'COMISSAO_PAGAR', 'Repasse errado', 100, current_date, v2);
    assert false, 'deveria recusar vendedor de outra unidade';
  exception when check_violation then null; end;
  raise notice 'OK so os dois movimentos de comissao, e so vendedor da casa';

  -- ------------------------------------------------- fila e indicadores
  select count(*) into n from regional_financeiro_titulos(r1);
  assert n = 3, 'titulos da unidade (2 lancados + o repasse), veio ' || n;

  select situacao, favorecido into rec
    from regional_financeiro_titulos(r1) where id = t_pagar;
  assert rec.situacao = 'vencido', 'vencimento passado ja conta como vencido, veio ' || rec.situacao;
  assert rec.favorecido = 'Amanda Hilario', 'favorecido na fila, veio ' || coalesce(rec.favorecido,'nulo');

  select count(*) into n from regional_financeiro_titulos(r1, null, null, 'RECEITA');
  assert n = 1, 'filtro por tipo, veio ' || n;

  -- ------------------------------------------------- baixa com forma, sem conta
  perform regional_baixar_titulo(t_pagar, current_date, 800, 'PIX', 'Pago por PIX ao vendedor');
  select status, valor_saldo into rec from lancamentos_financeiros where id = t_pagar;
  assert rec.status = 'quitado', 'baixa integral tem de quitar, veio ' || rec.status;
  assert rec.valor_saldo = 0, 'saldo zerado, veio ' || rec.valor_saldo;
  select forma_pagamento::text into v_txt from baixas_financeiras where lancamento_id = t_pagar;
  assert v_txt = 'PIX', 'forma de pagamento gravada, veio ' || coalesce(v_txt,'nula');
  raise notice 'OK baixa da unidade registra a forma, sem conta bancaria da matriz';

  select * into rec from regional_financeiro_resumo(r1, current_date - 30, current_date + 30);
  assert rec.a_receber_aberto = 3200.50, 'a receber, veio ' || rec.a_receber_aberto;
  assert rec.pago_periodo = 800, 'pago no periodo, veio ' || rec.pago_periodo;
  assert rec.saldo_periodo = -800, 'saldo do periodo, veio ' || rec.saldo_periodo;

  -- ------------------------------------------------- cancelamento
  begin
    perform regional_cancelar_titulo(t_pagar, 'engano');
    assert false, 'titulo com baixa nao pode ser cancelado';
  exception when check_violation then null; end;

  begin
    perform regional_cancelar_titulo(t_receber, '');
    assert false, 'cancelamento exige motivo';
  exception when check_violation then null; end;
  raise notice 'OK cancelamento pede motivo e respeita baixa registrada';

  -- ============================================== ISOLAMENTO matriz x franquia
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into lancamentos_financeiros (tipo, descricao, regional_id, valor_original,
                                       data_emissao, data_vencimento, competencia)
    values ('DESPESA','Servidor da matriz', null, 9999, current_date, current_date, current_date)
    returning id into t_matriz;
  t_outra := regional_lancar_titulo(r2, 'COMISSAO_RECEBER', 'Comissao Cuiaba', 700, current_date + 2);

  perform set_config('request.jwt.claim.sub', u_g1::text, false);

  select count(*) into n from regional_financeiro_titulos(r2);
  assert n = 3, 'pedindo a outra unidade, volta a propria (3), veio ' || n;

  select * into rec from regional_financeiro_resumo(r2, current_date - 30, current_date + 30);
  assert rec.a_receber_aberto = 3200.50,
    'o resumo tambem ignora o id pedido, veio ' || rec.a_receber_aberto;

  -- titulo da matriz: invisivel E intocavel
  assert not regional_titulo_no_escopo(t_matriz), 'titulo da matriz nao esta no escopo do gestor';
  begin
    perform regional_baixar_titulo(t_matriz, current_date, 9999, 'PIX');
    assert false, 'gestor nao pode baixar titulo da matriz';
  exception when check_violation then null; end;

  -- titulo da franquia vizinha: idem
  begin
    perform regional_baixar_titulo(t_outra, current_date, 700, 'PIX');
    assert false, 'gestor nao pode baixar titulo de outra franquia';
  exception when check_violation then null; end;
  raise notice 'OK matriz e franquia vizinha ficam fora do alcance do gestor';

  -- ------------------------------------------------- repasse pelo portal
  insert into comissoes_vendas (vendedor_id, veiculo_id, valor_comissao, is_adesao, status_pagamento)
    values (v2, null, 300, false, 'pendente') returning id into com1;
  begin
    perform regional_repassar_comissao(com1);
    assert false, 'gestor nao repassa comissao de vendedor de outra unidade';
  exception when check_violation then null; end;
  raise notice 'OK repasse pelo portal so alcanca a propria equipe';

  raise notice '=== TESTES 0037 (financeiro da franquia) PASSARAM ===';
end $$;
