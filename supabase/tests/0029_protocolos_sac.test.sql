-- Teste funcional do 0029: opcionais contratados na ficha do SAC, historico
-- financeiro editavel e Central de Protocolos (abertura, interacoes,
-- transferencia, encerramento e contador do dashboard).
\set ON_ERROR_STOP on
do $$
declare
  u_a uuid := gen_random_uuid();   -- atendente 1
  u_b uuid := gen_random_uuid();   -- atendente 2
  r_id uuid; c_id uuid; tv uuid; plano uuid;
  v1 uuid; v2 uuid;
  p_opc uuid; p_fora uuid;
  t titulos_financeiros; prot atendimentos; rec record; n int;
begin
  -- setup -------------------------------------------------------------------
  insert into auth.users (id, email) values (u_a, 'a@teste.com'), (u_b, 'b@teste.com');
  insert into regionais (nome) values ('Regional Protocolo') returning id into r_id;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_a, 'Atendente A', 'a@teste.com', 'admin', r_id),
           (u_b, 'Atendente B', 'b@teste.com', 'financeiro', r_id);
  perform set_config('request.jwt.claim.sub', u_a::text, false);

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, email, celular)
    values ('PF', 'Joana Protocolo', '11144477735', r_id, 'joana@teste.com', '11988887777')
    returning id into c_id;
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  if tv is null then insert into tipos_veiculo (nome) values ('Passeio') returning id into tv; end if;
  select id into plano from planos_protecao where ativo order by nivel limit 1;

  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, plano_protecao_id, valor_fipe, status)
    values (c_id, 'PRO1A11', 'Onix', r_id, tv, plano, 50000, 'ativo') returning id into v1;
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, valor_fipe, status)
    values (c_id, 'PRO2B22', 'HB20', r_id, tv, 45000, 'ativo') returning id into v2;

  -- ---------------------------------------- A) opcionais SO do que foi contratado
  -- um produto opcional com limite, NAO contratado por nenhum veiculo
  insert into produtos (nome, categoria, metodo_preco, valor_fixo, obrigatorio, status,
                        tem_limite_uso, quantidade_limite, janela_dias_limite)
    values ('Opcional Nao Contratado', 'ASSISTENCIA', 'FIXO', 30, false, true, true, 1, 365)
    returning id into p_fora;
  -- e outro que o veiculo 1 contrata de fato
  insert into produtos (nome, categoria, metodo_preco, valor_fixo, obrigatorio, status,
                        tem_limite_uso, quantidade_limite, janela_dias_limite)
    values ('Opcional Contratado Teste', 'ASSISTENCIA', 'FIXO', 25, false, true, true, 2, 365)
    returning id into p_opc;
  insert into veiculo_produtos (veiculo_id, produto_id) values (v1, p_opc);

  -- a ficha do veiculo 1 traz o contratado e NAO traz o alheio
  assert exists (select 1 from opcionais_veiculo(v1) where produto_id = p_opc),
    'opcional contratado deve aparecer';
  assert not exists (select 1 from opcionais_veiculo(v1) where produto_id = p_fora),
    'produto nao contratado NAO pode aparecer na ficha';
  select origem into rec from opcionais_veiculo(v1) where produto_id = p_opc;
  assert rec.origem = 'AVULSO', format('origem = %s', rec.origem);

  -- o veiculo 2 (sem plano e sem avulsos) nao herda o opcional do veiculo 1
  assert not exists (select 1 from opcionais_veiculo(v2) where produto_id = p_opc),
    'opcional de um veiculo nao vaza para o outro';

  -- itens obrigatorios do plano aparecem marcados
  assert exists (select 1 from opcionais_veiculo(v1) where obrigatorio and origem = 'PLANO'),
    'itens do plano aparecem como obrigatorios';
  raise notice 'OK ficha do veiculo lista so o contratado';

  -- --------------------------------------- B) historico financeiro editavel
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status,
                                   linha_digitavel, url_boleto)
    values (c_id, v1, 200, current_date + 10, 'pendente', '3419...', 'http://boleto') returning * into t;

  select count(*) into n from titulos_do_cliente(c_id);
  assert n = 1, format('historico financeiro = %s', n);

  -- desconto + acrescimo + novo vencimento
  select * into t from ajustar_titulo(t.id, current_date + 20, 30, 5, 'Negociado no SAC');
  assert t.valor_original = 200 and t.desconto = 30 and t.acrescimo = 5, 'ajustes gravados';
  assert t.valor = 175, format('valor recalculado = %s', t.valor);
  assert t.data_vencimento = current_date + 20, 'vencimento alterado';

  -- ajuste nao acumula sobre o ajuste anterior
  select * into t from ajustar_titulo(t.id, null, 10, null, null);
  assert t.valor = 195, format('valor apos novo desconto = %s (200 - 10 + 5)', t.valor);

  -- desconto maior que o titulo e barrado
  begin
    perform ajustar_titulo(t.id, null, 999, null, null);
    raise exception 'desconto maior que o titulo deveria falhar';
  exception when others then
    assert sqlerrm like '%Desconto maior%', format('mensagem inesperada: %s', sqlerrm);
  end;

  -- 2a via limpa o registro do gateway (volta para a fila de remessa)
  select * into t from reemitir_titulo(t.id);
  assert t.linha_digitavel is null and t.url_boleto is null, '2a via reabre o titulo para emissao';

  -- titulo pago nao pode ser alterado
  update titulos_financeiros set status = 'pago', data_pagamento = current_date, valor_pago = 195 where id = t.id;
  begin
    perform ajustar_titulo(t.id, current_date + 30, null, null, null);
    raise exception 'titulo pago nao pode ser alterado';
  exception when others then
    assert sqlerrm like '%ja pago%', format('mensagem inesperada: %s', sqlerrm);
  end;
  raise notice 'OK historico financeiro editavel (desconto/acrescimo/vencimento/2a via)';

  -- ------------------------------------------------ C) Central de Protocolos
  -- abertura pela ficha do VEICULO
  select * into prot from abrir_protocolo(c_id, 'FINANCEIRO', 'Boleto em duplicidade',
    'Associado recebeu dois boletos do mesmo mes', v1, 'ALTA');
  assert prot.numero_protocolo like 'ATD-%', format('protocolo = %s', prot.numero_protocolo);
  assert prot.status::text = 'ABERTO' and prot.prioridade::text = 'ALTA', 'status/prioridade';
  assert prot.responsavel_id = u_a, 'responsavel inicial e quem abriu';
  assert prot.veiculo_id = v1, 'protocolo ligado ao veiculo';

  -- abertura pela ficha do ASSOCIADO (sem veiculo)
  declare prot2 atendimentos;
  begin
    select * into prot2 from abrir_protocolo(c_id, 'DUVIDAS', 'Duvida sobre cobertura', null, null, 'NORMAL');
    assert prot2.veiculo_id is null, 'protocolo do associado nao precisa de veiculo';
  end;

  -- veiculo de outro associado e recusado
  declare c2 uuid; v3 uuid;
  begin
    insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
      values ('PF', 'Outro Associado', '52998224725', r_id) returning id into c2;
    insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status)
      values (c2, 'OUT9Z99', r_id, tv, 'ativo') returning id into v3;
    begin
      perform abrir_protocolo(c_id, 'OUTROS', 'Teste', null, v3);
      raise exception 'veiculo de outro associado deveria falhar';
    exception when others then
      assert sqlerrm like '%nao pertence%', format('mensagem inesperada: %s', sqlerrm);
    end;
  end;

  -- interacoes: comentario move para EM_ANDAMENTO
  perform registrar_interacao_protocolo(prot.id, 'Verificando com o financeiro');
  select * into prot from atendimentos where id = prot.id;
  assert prot.status::text = 'EM_ANDAMENTO', 'primeiro retorno muda o status';
  select count(*) into n from interacoes_protocolo(prot.id);
  assert n = 2, format('interacoes = %s (abertura + comentario)', n);

  -- transferencia de responsavel
  select * into prot from transferir_atendimento(prot.id, u_b, 'Caso e do financeiro');
  assert prot.responsavel_id = u_b, 'responsavel transferido';
  select * into rec from interacoes_protocolo(prot.id) where tipo = 'TRANSFERENCIA' limit 1;
  assert rec.de_usuario = 'Atendente A' and rec.para_usuario = 'Atendente B',
    format('transferencia %s -> %s', rec.de_usuario, rec.para_usuario);
  assert rec.mensagem = 'Caso e do financeiro', 'motivo da transferencia';

  -- transferir para usuario inexistente/inativo falha
  begin
    perform transferir_atendimento(prot.id, gen_random_uuid(), null);
    raise exception 'destino invalido deveria falhar';
  exception when others then
    assert sqlerrm like '%destino invalido%', format('mensagem inesperada: %s', sqlerrm);
  end;

  -- encerramento exige solucao
  begin
    perform encerrar_protocolo(prot.id, '   ');
    raise exception 'encerrar sem solucao deveria falhar';
  exception when others then
    assert sqlerrm like '%solucao%', format('mensagem inesperada: %s', sqlerrm);
  end;

  select * into prot from encerrar_protocolo(prot.id, 'Boleto duplicado cancelado e 2a via enviada');
  assert prot.status::text = 'CONCLUIDO' and prot.encerrado_em is not null, 'protocolo encerrado';
  assert prot.encerrado_por = u_a and prot.solucao is not null, 'quem encerrou e a solucao';
  assert exists (select 1 from interacoes_protocolo(prot.id) where tipo = 'ENCERRAMENTO'),
    'encerramento registrado no historico';

  -- protocolo encerrado nao aceita transferencia
  begin
    perform transferir_atendimento(prot.id, u_b, 'tentativa');
    raise exception 'protocolo encerrado nao transfere';
  exception when others then
    assert sqlerrm like '%ja encerrado%', format('mensagem inesperada: %s', sqlerrm);
  end;
  raise notice 'OK protocolos (abertura, interacoes, transferencia, encerramento)';

  -- ------------------------------------------------------ listagem e contador
  select count(*) into n from listar_protocolos('ABERTOS');
  assert n = 1, format('abertos na central = %s (o encerrado nao conta)', n);
  select count(*) into n from listar_protocolos();
  assert n = 2, format('total na central = %s', n);
  select count(*) into n from listar_protocolos(null, null, 'PRO1A11');
  assert n = 1, 'busca por placa';
  select count(*) into n from listar_protocolos(null, null, 'Joana');
  assert n = 2, 'busca por associado';
  select count(*) into n from listar_protocolos(null, null, prot.numero_protocolo);
  assert n = 1, 'busca por numero do protocolo';

  select * into rec from listar_protocolos('ABERTOS') limit 1;
  assert rec.associado = 'Joana Protocolo', 'listagem traz o associado';
  assert rec.interacoes >= 1, 'listagem conta as interacoes';

  select * into rec from resumo_protocolos();
  assert rec.abertos = 1, format('dashboard: abertos = %s', rec.abertos);
  assert rec.meus = 1, format('dashboard: meus = %s', rec.meus);
  raise notice 'OK central (filtros) + contador do dashboard';

  raise notice '=== PROTOCOLOS/SAC: TODOS OS TESTES PASSARAM ===';
end $$;
