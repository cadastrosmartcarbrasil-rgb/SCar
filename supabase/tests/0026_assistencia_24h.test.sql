-- Teste funcional do MODULO ASSISTENCIA 24H (0026)
\set ON_ERROR_STOP on
do $$
declare
  u_gestor uuid := gen_random_uuid();
  u_atend  uuid := gen_random_uuid();
  r_id uuid; c_id uuid; tv uuid; cat uuid;
  v_ok uuid; v_susp uuid; v_dev uuid; c_dev uuid;
  f1 uuid; f2 uuid;
  s_reboque uuid; s_chaveiro uuid;
  a acionamentos_assistencia; sit record; eleg record; l lancamentos_financeiros;
  n int; msg text;
begin
  -- setup -------------------------------------------------------------------
  insert into auth.users (id, email) values (u_gestor, 'gestor@teste.com'), (u_atend, 'atendente@teste.com');
  insert into regionais (nome) values ('Regional 24h') returning id into r_id;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_gestor, 'Gestor', 'gestor@teste.com', 'admin', r_id),
           (u_atend,  'Atendente 24h', 'atendente@teste.com', 'assistencia_24h', r_id);

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Carlos Assistido', '11144477735', r_id) returning id into c_id;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Devedor Silva', '52998224725', r_id) returning id into c_dev;

  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  if tv is null then insert into tipos_veiculo (nome) values ('Passeio') returning id into tv; end if;
  select id into cat from categorias_dre limit 1;

  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, status, valor_mensalidade, dia_vencimento)
    values (c_id, 'ASS1A11', 'Onix', r_id, tv, 'ativo', 150, 10) returning id into v_ok;
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, status)
    values (c_id, 'ASS2B22', 'Gol', r_id, tv, 'suspenso') returning id into v_susp;
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, status, tipo_faturamento)
    values (c_dev, 'ASS3C33', 'HB20', r_id, tv, 'ativo', 'INDIVIDUAL_VEICULO') returning id into v_dev;
  -- inadimplencia do terceiro veiculo
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (c_dev, v_dev, 180, current_date - 30, 'pendente');

  insert into fornecedores (tipo_pessoa, documento, razao_social, email, telefone, prestador_assistencia, whatsapp, cobertura)
    values ('PJ', '11222333000181', 'Guincho Rapido LTDA', 'guincho@teste.com', '1130001000', true, '11999990000', 'Grande SP')
    returning id into f1;
  insert into fornecedores (tipo_pessoa, documento, razao_social, email, prestador_assistencia)
    values ('PJ', '11444777000161', 'Reboques Norte ME', 'norte@teste.com', true) returning id into f2;

  select id into s_reboque  from servicos_assistencia where descricao = 'Reboque Passeio';
  select id into s_chaveiro from servicos_assistencia where descricao = 'Chaveiro';
  update servicos_assistencia set categoria_dre_id = cat where id in (s_reboque, s_chaveiro);

  insert into prestador_servicos (fornecedor_id, servico_id, valor_acordado, valor_km, prazo_medio_min)
    values (f1, s_reboque, 230, 4.00, 45), (f2, s_reboque, 260, 5.00, 90);

  -- ------------------------------------------------------- A) parametrizacao
  select count(*) into n from prestadores_do_servico(s_reboque);
  assert n = 2, format('prestadores do servico = %s', n);
  select fornecedor_id into f1 from prestadores_do_servico(s_reboque) limit 1;  -- ordenado por valor
  assert (select razao_social from fornecedores where id = f1) = 'Guincho Rapido LTDA', 'ordem por valor acordado';
  raise notice 'OK parametrizacao (servicos + prestadores)';

  -- ------------------------------------------------------- B) trava e alcada
  perform set_config('request.jwt.claim.sub', u_atend::text, false);
  assert pode_assistencia(), 'atendente 24h opera o modulo';
  assert not pode_liberar_assistencia(), 'atendente 24h NAO tem alcada de liberacao';

  select * into sit from situacao_assistencia_veiculo(v_ok);
  assert sit.pode_acionar, format('veiculo ok deveria liberar: %s', sit.motivos);
  select * into sit from situacao_assistencia_veiculo(v_susp);
  assert not sit.pode_acionar, 'veiculo suspenso deve bloquear';
  select * into sit from situacao_assistencia_veiculo(v_dev);
  assert not sit.pode_acionar and sit.inadimplente and sit.titulos_vencidos = 1,
    format('inadimplente deve bloquear: %s', sit.motivos);
  assert sit.valor_em_atraso = 180, format('valor em atraso = %s', sit.valor_em_atraso);

  -- acionamento normal (veiculo ok)
  select * into a from abrir_acionamento(v_ok, s_reboque, 'Carlos', '11988887777',
    '{"logradouro":"Av. Paulista 1000","cidade":"Sao Paulo","uf":"SP"}'::jsonb,
    '{"logradouro":"Oficina Central","cidade":"Sao Paulo","uf":"SP"}'::jsonb, 120, 'Carro nao liga');
  assert a.protocolo like 'ASS-%', format('protocolo = %s', a.protocolo);
  assert a.status = 'ABERTO' and a.valor_servico = 250, 'abertura com valor padrao do servico';
  assert a.liberado_por is null and a.bloqueio_motivos = '{}', 'sem bloqueio';

  -- veiculo inadimplente: bloqueia sem justificativa
  begin
    perform abrir_acionamento(v_dev, s_reboque, 'Devedor', '11900000000');
    raise exception 'deveria ter bloqueado o inadimplente';
  exception when others then
    msg := sqlerrm;
    assert msg like 'BLOQUEADO:%', format('mensagem inesperada: %s', msg);
    assert msg like '%liberacao de superior%', 'mensagem deve pedir liberacao de superior';
  end;

  -- com justificativa, mas SEM alcada (atendente): continua bloqueado
  begin
    perform abrir_acionamento(v_dev, s_reboque, 'Devedor', '11900000000', '{}'::jsonb, '{}'::jsonb, null, null,
                              'Cliente vai pagar amanha');
    raise exception 'atendente sem alcada nao pode liberar';
  exception when others then
    assert sqlerrm like '%nao tem alcada%', format('mensagem inesperada: %s', sqlerrm);
  end;

  -- gestor libera com justificativa
  perform set_config('request.jwt.claim.sub', u_gestor::text, false);
  select * into a from abrir_acionamento(v_dev, s_reboque, 'Devedor', '11900000000', '{}'::jsonb, '{}'::jsonb, 50,
                                         'Guincho em rodovia', 'Autorizado pelo gestor — risco na via');
  assert a.liberado_por = u_gestor, 'liberacao carimbada';
  assert a.liberacao_justificativa is not null, 'justificativa gravada';
  assert array_length(a.bloqueio_motivos, 1) >= 1, 'motivos do bloqueio registrados';
  raise notice 'OK trava financeira + alcada de liberacao';

  -- ------------------------------------------------------- C) cotacao e OS
  perform set_config('request.jwt.claim.sub', u_atend::text, false);
  select * into a from acionamentos_assistencia where veiculo_id = v_ok limit 1;

  perform registrar_cotacao_assistencia(a.id, f1, 230, 4.00, 45, 'Chega em 45min');
  perform registrar_cotacao_assistencia(a.id, f2, 260, 5.00, 90, null);
  assert (select status from acionamentos_assistencia where id = a.id) = 'EM_COTACAO', 'status em cotacao';
  select count(*) into n from acionamento_cotacoes where acionamento_id = a.id;
  assert n = 2, 'duas cotacoes';

  -- confirma prestador com 20 km excedentes a R$4,00
  select * into a from confirmar_prestador_assistencia(a.id, f1, 230, 20, 4.00, 45);
  assert a.status = 'AUTORIZADO', 'autorizado';
  assert a.codigo_os like 'OS-%', format('codigo OS = %s', a.codigo_os);
  assert a.valor_km_excedente = 80, format('km excedente = %s', a.valor_km_excedente);
  assert a.valor_total = 310, format('total = %s (230 + 80)', a.valor_total);
  assert (select escolhida from acionamento_cotacoes where acionamento_id = a.id and fornecedor_id = f1), 'cotacao escolhida';
  assert not (select escolhida from acionamento_cotacoes where acionamento_id = a.id and fornecedor_id = f2), 'demais desmarcadas';

  -- servico sem KM excedente ignora a cobranca
  declare a2 acionamentos_assistencia;
  begin
    select * into a2 from abrir_acionamento(v_ok, s_chaveiro, 'Carlos', '11988887777');
    select * into a2 from confirmar_prestador_assistencia(a2.id, f1, 180, 50, 4.00, 30);
    assert a2.valor_km_excedente = 0 and a2.valor_total = 180, format('chaveiro nao cobra km: %s', a2.valor_total);
  end;

  perform marcar_voucher_enviado(a.id);
  select * into a from acionamentos_assistencia where id = a.id;
  assert a.voucher_enviado_em is not null and a.status = 'EM_ATENDIMENTO', 'voucher enviado -> em atendimento';
  raise notice 'OK cotacao + geracao da OS + voucher';

  -- ------------------------------------------------------- D) contas a pagar
  select * into a from concluir_acionamento(a.id, 120, 'Servico concluido no local');
  assert a.status = 'CONCLUIDO' and a.lancamento_id is not null, 'OS concluida gera lancamento';
  select * into l from lancamentos_financeiros where id = a.lancamento_id;
  assert l.tipo = 'DESPESA' and l.fornecedor_id = f1 and l.valor_original = 310, format('lancamento = %s', l.valor_original);
  assert l.categoria_dre_id = cat, 'plano de contas do servico';
  assert l.descricao like '%' || a.codigo_os || '%', 'descricao com o codigo da OS';

  -- idempotencia: concluir de novo nao duplica contas a pagar
  perform concluir_acionamento(a.id, 120, null);
  select count(*) into n from lancamentos_financeiros where fornecedor_id = f1;
  assert n = 1, format('lancamentos duplicados (%s)', n);

  -- baixa do pagamento ao prestador
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido)
    values (l.id, current_date, 310, 310);
  assert (select status from lancamentos_financeiros where id = l.id) = 'quitado', 'baixa quita o lancamento';
  raise notice 'OK contas a pagar (lancamento + baixa ao prestador)';

  -- ------------------------------------------------------- limite por janela
  select * into eleg from elegibilidade_assistencia(v_ok) where servico_id = s_reboque;
  assert eleg.usados = 1 and eleg.restantes = 1 and eleg.elegivel, format('uso 1/2: usados=%s', eleg.usados);

  select * into a from abrir_acionamento(v_ok, s_reboque, 'Carlos', '11988887777');
  perform confirmar_prestador_assistencia(a.id, f1, 230, 0, null, 45);
  select * into eleg from elegibilidade_assistencia(v_ok) where servico_id = s_reboque;
  assert eleg.usados = 2 and eleg.restantes = 0 and not eleg.elegivel, format('uso 2/2: usados=%s', eleg.usados);

  -- terceiro reboque bloqueia por limite (e pede liberacao)
  begin
    perform abrir_acionamento(v_ok, s_reboque, 'Carlos', '11988887777');
    raise exception 'deveria bloquear por limite';
  exception when others then
    assert sqlerrm like '%Limite do opcional atingido%', format('mensagem inesperada: %s', sqlerrm);
  end;

  -- acionamento cancelado nao consome limite (servico ainda nao usado)
  declare s_pane uuid;
  begin
    select id into s_pane from servicos_assistencia where descricao = 'Pane Seca';
    select * into a from abrir_acionamento(v_ok, s_pane, 'Carlos', null);
    perform cancelar_acionamento(a.id, 'Cliente resolveu sozinho');
    select * into eleg from elegibilidade_assistencia(v_ok) where servico_id = s_pane;
    assert eleg.usados = 0 and eleg.elegivel, format('pane seca usados = %s (o cancelado nao conta)', eleg.usados);
  end;
  raise notice 'OK limite por janela flutuante (tempo real)';

  -- ------------------------------------------------------- historico do veiculo
  select count(*) into n from historico_assistencia_veiculo(v_ok);
  assert n >= 4, format('historico do veiculo = %s', n);
  assert (select count(*) from acionamento_historico) >= 8, 'trilha de status gravada';
  raise notice 'OK historico na ficha do veiculo';

  raise notice '=== ASSISTENCIA 24H: TODOS OS TESTES PASSARAM ===';
end $$;
