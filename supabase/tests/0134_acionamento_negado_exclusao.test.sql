-- Teste funcional da 0134: o pedido de assistencia NEGADO fica registrado (e
-- nao consome o limite) e o acionamento lancado por engano pode ser EXCLUIDO,
-- com trilha, por quem tem a permissao.
\set ON_ERROR_STOP on
do $$
declare
  u uuid := gen_random_uuid();      -- admin
  u24 uuid := gen_random_uuid();    -- operador 24h (sem 'excluir' no seed)
  r_id uuid; c_id uuid; tv uuid; v1 uuid; s_reboque uuid; f1 uuid;
  a acionamentos_assistencia; a2 acionamentos_assistencia;
  e record; h record; j jsonb; n int; ok boolean; lanc uuid;
begin
  insert into auth.users (id, email) values (u, 'adm134@teste.com'), (u24, 'op134@teste.com');
  insert into regionais (nome) values ('Regional 134') returning id into r_id;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u, 'Admin', 'adm134@teste.com', 'admin', r_id),
    (u24, 'Operador 24h', 'op134@teste.com', 'assistencia_24h', r_id);
  perform set_config('request.jwt.claim.sub', u::text, false);

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Assistido 134', '11144477735', r_id) returning id into c_id;
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, status)
    values (c_id, 'NEG1A34', 'Onix', r_id, tv, 'ativo') returning id into v1;
  select id into s_reboque from servicos_assistencia where descricao = 'Reboque Passeio';
  update servicos_assistencia set computa_limite = true, limite_quantidade = 1, limite_janela_meses = 12
   where id = s_reboque;
  insert into fornecedores (tipo_pessoa, documento, razao_social, prestador_assistencia)
    values ('PJ', '11222333000181', 'Guincho 134', true) returning id into f1;

  -- ---------------------------------------------------------- NEGADO direto
  ok := false;
  begin perform registrar_acionamento_negado(v1, s_reboque, null);
  exception when others then ok := true; end;
  assert ok, 'negativa sem motivo e recusada';
  ok := false;
  begin perform registrar_acionamento_negado(v1, s_reboque, 'OUTRO', '  ');
  exception when others then ok := true; end;
  assert ok, 'motivo OUTRO exige descricao';

  select * into a from registrar_acionamento_negado(v1, s_reboque, 'FORA_DA_AREA', 'Ilha sem acesso',
                                                     'Assistido', '11999998888');
  assert a.status::text = 'NEGADO' and a.negado_motivo = 'FORA_DA_AREA', 'negado gravado';
  assert a.negado_por = u and a.negado_em is not null and a.protocolo like 'ASS-%', 'quem/quando/protocolo';
  assert a.valor_total = 0 and a.lancamento_id is null, 'negado nao gera custo nem titulo';
  assert exists (select 1 from acionamento_historico where acionamento_id = a.id and status::text = 'NEGADO'),
    'historico registra o NEGADO';

  select * into e from elegibilidade_assistencia(v1) where servico_id = s_reboque;
  assert e.usados = 0 and e.elegivel and e.negados = 1, 'negado nao consome o limite e e contado a parte';

  ok := false;
  begin perform atualizar_acionamento(a.id, p_agendado_para := now(), p_motivo := 'x');
  exception when others then ok := true; end;
  assert ok, 'NEGADO e imutavel';
  ok := false;
  begin perform registrar_cotacao_assistencia(a.id, f1, 100);
  exception when others then ok := true; end;
  assert ok, 'NEGADO nao recebe cotacao';

  -- consome o limite e depois o pedido bloqueado e registrado como negado
  select * into a2 from abrir_acionamento(v1, s_reboque, 'Assistido', '11999998888');
  select * into a2 from confirmar_prestador_assistencia(a2.id, f1, 230, 0, null, 30);
  select * into e from elegibilidade_assistencia(v1) where servico_id = s_reboque;
  assert not e.elegivel and e.usados = 1, 'limite atingido';
  select * into a from registrar_acionamento_negado(v1, s_reboque, 'LIMITE_ATINGIDO');
  assert array_to_string(a.bloqueio_motivos, ';') like '%Limite do opcional atingido%',
    'foto do bloqueio do momento gravada';
  select * into e from elegibilidade_assistencia(v1) where servico_id = s_reboque;
  assert e.negados = 2 and e.usados = 1, 'segundo negado contado, uso inalterado';

  select * into h from historico_assistencia_veiculo(v1) where id = a.id;
  assert h.negado_motivo = 'LIMITE_ATINGIDO', 'historico do veiculo traz o motivo';

  -- painel: negado fora do volume
  select count(*) into n from assist_painel_movimentos(current_date - 1, current_date + 1)
   where veiculo_id = v1;
  assert n = 1, format('painel conta so o atendimento real (%s)', n);

  -- ----------------------------------------------------- negar pedido aberto
  select * into a from abrir_acionamento(v1, (select id from servicos_assistencia where descricao = 'Chaveiro'),
                                        'Assistido', '11999998888');
  select * into a from negar_acionamento(a.id, 'SEM_COBERTURA', 'Plano nao cobre chaveiro');
  assert a.status::text = 'NEGADO' and a.negado_observacao = 'Plano nao cobre chaveiro', 'pedido aberto negado';
  ok := false;
  begin perform negar_acionamento(a2.id, 'OUTRO', 'depois da OS');
  exception when others then ok := true; end;
  assert ok, 'com OS gerada nao se nega (cancela)';

  -- -------------------------------------------------------------- EXCLUSAO
  perform set_config('request.jwt.claim.sub', u24::text, false);
  ok := false;
  begin perform excluir_acionamento(a.id, 'Lancado por engano');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'operador 24h sem a permissao nao exclui';
  perform set_config('request.jwt.claim.sub', u::text, false);

  ok := false;
  begin perform excluir_acionamento(a.id, 'abc');
  exception when others then ok := true; end;
  assert ok, 'motivo curto recusado';

  insert into acionamento_anexos (acionamento_id, url, tipo) values (a.id, a.id::text || '/foto.jpg', 'FOTO_VEICULO');
  j := excluir_acionamento(a.id, 'Placa errada no preenchimento');
  assert not exists (select 1 from acionamentos_assistencia where id = a.id), 'acionamento apagado';
  assert j->'arquivos' ? (a.id::text || '/foto.jpg'), 'devolve o arquivo para o storage';
  assert not exists (select 1 from acionamento_anexos where acionamento_id = a.id), 'anexos em cascata';
  select count(*) into n from acionamento_exclusoes
   where acionamento_id = a.id and motivo = 'Placa errada no preenchimento' and usuario_id = u
     and dados->'acionamento'->>'negado_motivo' = 'SEM_COBERTURA'
     and jsonb_array_length(dados->'historico') >= 1;
  assert n = 1, 'trilha com a foto completa';

  -- OS com titulo: em aberto sai junto; com pagamento, recusa
  lanc := a2.lancamento_id;
  if lanc is not null then
    insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido)
      values (lanc, current_date, 230, 230);
    ok := false;
    begin perform excluir_acionamento(a2.id, 'Tentativa com pagamento');
    exception when others then ok := true; end;
    assert ok, 'titulo pago impede a exclusao';
    delete from baixas_financeiras where lancamento_id = lanc;
  end if;
  j := excluir_acionamento(a2.id, 'OS aberta no veiculo errado');
  assert not exists (select 1 from acionamentos_assistencia where id = a2.id), 'OS apagada';
  assert lanc is null or not exists (select 1 from lancamentos_financeiros where id = lanc),
    'titulo em aberto da OS sai junto';
  select * into e from elegibilidade_assistencia(v1) where servico_id = s_reboque;
  assert e.usados = 0, 'excluir devolve a cota';

  -- OS concluida: ver a suite 0135 (a regra passou a ser o pagamento, nao o status)

  assert exists (select 1 from pg_policies where tablename = 'acionamentos_assistencia'
                  and policyname = 'acion_sem_delete_direto' and permissive = 'RESTRICTIVE'),
    'DELETE direto bloqueado por policy restritiva';
  assert permissao_celula_valida('assistencia', 'excluir'), 'celula nova valida';
  assert (select concedida from perfil_permissoes where papel = 'financeiro' and modulo = 'assistencia' and acao = 'excluir'),
    'seed: financeiro exclui';
  assert not (select concedida from perfil_permissoes where papel = 'assistencia_24h' and modulo = 'assistencia' and acao = 'excluir'),
    'seed: operador 24h nao exclui';

  perform set_config('request.jwt.claim.sub', '', false);
  raise notice '=== TESTES DA 0134 PASSARAM ===';
end $$;
