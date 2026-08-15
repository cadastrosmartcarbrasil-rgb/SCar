-- Teste funcional do REFINO da Assistencia 24h (0027): centro de custo,
-- edicao dinamica da OS, sincronia com Contas a Pagar e auditoria.
\set ON_ERROR_STOP on
do $$
declare
  u uuid := gen_random_uuid();
  r_id uuid; c_id uuid; tv uuid; cat_desp uuid; cat_rec uuid;
  v1 uuid; f1 uuid; f2 uuid; s_reboque uuid;
  a acionamentos_assistencia; l lancamentos_financeiros; l2 lancamentos_financeiros;
  cc uuid; rec record; n int;
begin
  -- setup -------------------------------------------------------------------
  insert into auth.users (id, email) values (u, 'op@teste.com');
  insert into regionais (nome) values ('Regional Refino') returning id into r_id;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u, 'Operador', 'op@teste.com', 'admin', r_id);
  perform set_config('request.jwt.claim.sub', u::text, false);

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Assistido Refino', '11144477735', r_id) returning id into c_id;
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  if tv is null then insert into tipos_veiculo (nome) values ('Passeio') returning id into tv; end if;
  select id into cat_desp from categorias_dre where tipo = 'DESPESA_FIXA' limit 1;
  select id into cat_rec  from categorias_dre where tipo = 'RECEITA' limit 1;

  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, status)
    values (c_id, 'REF1A11', 'Onix', r_id, tv, 'ativo') returning id into v1;

  insert into fornecedores (tipo_pessoa, documento, razao_social, prestador_assistencia)
    values ('PJ', '11222333000181', 'Guincho A', true) returning id into f1;
  insert into fornecedores (tipo_pessoa, documento, razao_social, prestador_assistencia)
    values ('PJ', '11444777000161', 'Guincho B', true) returning id into f2;

  select id into s_reboque from servicos_assistencia where descricao = 'Reboque Passeio';
  update servicos_assistencia set categoria_dre_id = cat_desp where id = s_reboque;
  insert into prestador_servicos (fornecedor_id, servico_id, valor_acordado, valor_km)
    values (f1, s_reboque, 230, 4.00), (f2, s_reboque, 300, 5.00);

  -- ------------------------------------------------------ A) centro de custo
  cc := centro_custo_assistencia();
  assert (select nome from centros_custo where id = cc) = 'Assistencia 24 Horas', 'centro de custo do modulo';
  assert cc = centro_custo_assistencia(), 'resolucao idempotente do centro de custo';

  select * into a from abrir_acionamento(v1, s_reboque, 'Assistido', '11999998888',
    '{"logradouro":"Rod. Anhanguera km 30","cidade":"Jundiai","uf":"SP"}'::jsonb, '{}'::jsonb, 120, null);
  select * into a from confirmar_prestador_assistencia(a.id, f1, 230, 20, 4.00, 45);
  assert a.valor_total = 310, format('total inicial = %s', a.valor_total);

  select * into a from concluir_acionamento(a.id, 120);
  select * into l from lancamentos_financeiros where id = a.lancamento_id;
  assert l.centro_custo_id = cc, 'lancamento nasce no centro de custo Assistencia 24 Horas';
  assert l.fornecedor_id = f1 and l.valor_original = 310, 'fornecedor e valor no contas a pagar';
  assert l.categoria_dre_id = cat_desp, 'plano de contas do servico';
  raise notice 'OK centro de custo obrigatorio no contas a pagar';

  -- ------------------------------------------------- B/C) edicao + sincronia
  -- ajuste de valor e KM: o titulo em aberto acompanha
  select * into a from atualizar_acionamento(a.id, 260, 30, 4.00, 130,
    '{"logradouro":"Oficina Central","cidade":"Campinas","uf":"SP"}'::jsonb, 60,
    null, 'Trajeto maior que o previsto');
  assert a.valor_servico = 260 and a.km_excedente = 30, 'valores ajustados';
  assert a.valor_km_excedente = 120, format('km excedente = %s', a.valor_km_excedente);
  assert a.valor_total = 380, format('total apos ajuste = %s', a.valor_total);
  select * into l from lancamentos_financeiros where id = a.lancamento_id;
  assert l.valor_original = 380, format('contas a pagar sincronizado = %s', l.valor_original);
  assert l.centro_custo_id = cc, 'centro de custo mantido';

  -- auditoria registrou o que mudou, com motivo e operador
  -- a confirmacao do prestador tambem e uma alteracao auditada (250 -> 230),
  -- entao aqui ja existem dois registros de valor_servico.
  select count(*) into n from acionamento_edicoes where acionamento_id = a.id and campo = 'valor_servico';
  assert n = 2, format('edicoes de valor auditadas = %s', n);
  select * into rec from historico_edicoes_acionamento(a.id) where campo = 'valor_servico' limit 1;
  assert rec.valor_anterior = '230.00' and rec.valor_novo = '260.00', format('de %s para %s', rec.valor_anterior, rec.valor_novo);
  assert rec.motivo = 'Trajeto maior que o previsto', 'motivo gravado';
  assert rec.operador = 'Operador', 'operador identificado';
  select count(*) into n from acionamento_edicoes where acionamento_id = a.id and campo = 'destino';
  assert n = 1, 'troca de destino auditada';
  raise notice 'OK edicao de valores/trajeto + sincronia + auditoria';

  -- ------------------------------------------------------ troca de prestador
  begin
    perform trocar_prestador_acionamento(a.id, f2, null);
    raise exception 'troca sem justificativa deveria falhar';
  exception when others then
    assert sqlerrm like '%justificativa%', format('mensagem inesperada: %s', sqlerrm);
  end;

  select * into a from trocar_prestador_acionamento(a.id, f2, 'Guincho A desistiu do atendimento');
  assert a.prestador_id = f2, 'prestador substituido';
  assert a.valor_servico = 300, format('valor do novo prestador = %s', a.valor_servico);
  -- 30 km excedentes x 5,00 do novo prestador
  assert a.valor_km_excedente = 150 and a.valor_total = 450, format('total novo = %s', a.valor_total);
  assert a.voucher_enviado_em is null, 'voucher precisa ser reenviado ao novo prestador';

  -- lancamento anterior cancelado e novo gerado para o substituto
  assert (select status from lancamentos_financeiros where id = l.id) = 'cancelado', 'lancamento anterior cancelado';
  select * into l2 from lancamentos_financeiros where id = a.lancamento_id;
  assert l2.id <> l.id, 'novo lancamento gerado';
  assert l2.fornecedor_id = f2 and l2.valor_original = 450, format('novo lancamento = %s', l2.valor_original);
  assert l2.centro_custo_id = cc, 'novo lancamento no centro de custo do modulo';
  -- 2 registros: a confirmacao inicial (sem prestador -> Guincho A) e a troca.
  select count(*) into n from acionamento_edicoes where acionamento_id = a.id and campo = 'prestador';
  assert n = 2, format('edicoes de prestador auditadas = %s', n);
  select * into rec from historico_edicoes_acionamento(a.id) where campo = 'prestador' limit 1;
  assert rec.valor_anterior = 'Guincho A' and rec.valor_novo = 'Guincho B',
    format('troca auditada: %s -> %s', rec.valor_anterior, rec.valor_novo);
  assert rec.motivo = 'Guincho A desistiu do atendimento', 'motivo da troca gravado';
  raise notice 'OK troca de prestador (cancela o anterior e gera o novo)';

  -- --------------------------------------------- lancamento pago nao e mexido
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido)
    values (l2.id, current_date, 450, 450);
  assert (select status from lancamentos_financeiros where id = l2.id) = 'quitado', 'baixa quitou';

  select * into a from atualizar_acionamento(a.id, 500, null, null, null, null, null, null, 'Tentativa de ajuste apos pagamento');
  select * into l2 from lancamentos_financeiros where id = a.lancamento_id;
  assert l2.valor_original = 450, format('lancamento pago nao pode mudar (%s)', l2.valor_original);
  select count(*) into n from acionamento_edicoes where acionamento_id = a.id and campo = 'contas_a_pagar'
    and motivo like '%ja possui baixa%';
  assert n >= 1, 'divergencia registrada na auditoria';
  raise notice 'OK protecao do lancamento ja pago (auditado)';

  -- ------------------------------------------------------------ cancelamento
  declare a2 acionamentos_assistencia; l3 lancamentos_financeiros;
  begin
    select * into a2 from abrir_acionamento(v1, s_reboque, 'Assistido', null);
    select * into a2 from confirmar_prestador_assistencia(a2.id, f1, 230, 0, null, 30);
    select * into a2 from concluir_acionamento(a2.id, 50);
    select * into l3 from lancamentos_financeiros where id = a2.lancamento_id;
    assert l3.status = 'pendente', 'lancamento em aberto';

    begin
      perform cancelar_acionamento(a2.id, '   ');
      raise exception 'cancelamento sem justificativa deveria falhar';
    exception when others then
      assert sqlerrm like '%justificativa%', format('mensagem inesperada: %s', sqlerrm);
    end;

    select * into a2 from cancelar_acionamento(a2.id, 'Associado resolveu com terceiro');
    assert a2.status = 'CANCELADO', 'OS cancelada';
    assert (select status from lancamentos_financeiros where id = l3.id) = 'cancelado',
      'lancamento em aberto cancelado junto';
    assert (select count(*) from acionamento_edicoes where acionamento_id = a2.id and campo = 'status') >= 1,
      'cancelamento auditado';
  end;
  raise notice 'OK cancelamento com justificativa obrigatoria';

  -- ------------------------------------------------------------- relatorios
  -- uma receita em outro centro de custo, para provar o isolamento
  declare cc_adm uuid; l4 lancamentos_financeiros;
  begin
    insert into centros_custo (nome, codigo) values ('Administrativo', 'ADM') returning id into cc_adm;
    insert into lancamentos_financeiros (tipo, cliente_id, descricao, categoria_dre_id, centro_custo_id,
                                         regional_id, valor_original, data_vencimento, status)
      values ('RECEITA', c_id, 'Mensalidade avulsa', cat_rec, cc_adm, r_id, 1000, current_date, 'pendente')
      returning * into l4;
    insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido)
      values (l4.id, current_date, 1000, 1000);
  end;

  -- DRE geral: entra a despesa paga da assistencia (450) e a receita (1000)
  select * into rec from gerar_dre_resumo(current_date - 30, current_date + 1, null, null);
  assert rec.receita_bruta >= 1000, format('receita no DRE = %s', rec.receita_bruta);
  assert rec.despesa_fixa <= -450, format('despesa no DRE = %s', rec.despesa_fixa);

  -- DRE filtrado pelo centro de custo da assistencia: so a despesa 24h
  select * into rec from gerar_dre_resumo(current_date - 30, current_date + 1, null, cc);
  assert rec.receita_bruta = 0, format('centro 24h nao tem receita (%s)', rec.receita_bruta);
  assert rec.despesa_fixa = -450, format('despesa isolada do centro 24h = %s', rec.despesa_fixa);

  -- Resumo por centro de custo
  select * into rec from resumo_por_centro_custo(current_date - 30, current_date + 1) where centro_custo_id = cc;
  assert rec.despesas = 450 and rec.receitas = 0, format('centro 24h: %s despesas', rec.despesas);
  assert rec.resultado = -450, format('resultado do centro 24h = %s', rec.resultado);
  select count(*) into n from resumo_por_centro_custo(current_date - 30, current_date + 1);
  assert n >= 2, 'centros de custo listados';
  raise notice 'OK DRE e receitas x despesas por centro de custo';

  raise notice '=== REFINO DA ASSISTENCIA 24H: TODOS OS TESTES PASSARAM ===';
end $$;
