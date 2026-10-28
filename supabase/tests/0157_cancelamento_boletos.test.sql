-- Teste funcional da 0157: cancelar boleto(s) com motivo, pela celula
-- `cobranca.cancelar` (perfil ou extra), com baixa no banco pela maquina da
-- 0121; e `cancelar_fatura` com a mesma trava.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_fin uuid := gen_random_uuid();
  u_cob uuid := gen_random_uuid();
  u_out uuid := gen_random_uuid();
  r1 uuid; r2 uuid; tv uuid; c1 uuid; c2 uuid; ve uuid;
  h1 uuid; hsem uuid; tsem uuid; treg uuid; tpago uuid; tfat uuid; f1 uuid;
  rn uuid; o record; ok boolean;
begin
  insert into auth.users (id, email) values
    (u_adm,'adm157@t.com'), (u_fin,'fin157@t.com'), (u_cob,'cob157@t.com'), (u_out,'out157@t.com');
  insert into regionais (nome) values ('U157 A') returning id into r1;
  insert into regionais (nome) values ('U157 B') returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm157@t.com','admin', null),
    (u_fin,'Financeiro','fin157@t.com','financeiro', null),
    (u_cob,'Cobranca A','cob157@t.com','cobranca', r1),
    (u_out,'Cobranca B','out157@t.com','cobranca', r2);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','DEVEDOR 157','52998224725', r1) returning id into c1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','OUTRO 157','11144477735', r1) returning id into c2;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, cobranca_externa)
    values (c1,'CNC1A57', r1, tv, 'ativo', current_date - 400, 100, true) returning id into ve;

  -- vencido ha 200 dias: cancelar nao pode exigir revistoria (nao e 2a via)
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem, linha_digitavel) values
    ('157-1', c1, ve, 'MENSALIDADE', current_date - 200, current_date - 200, 100, 'aberto', 'OVERDUE',
     '74891160007840200810039027231010100000000010000') returning id into h1;
  insert into boletos_historico (id_externo, cliente_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem) values
    ('157-sem', c1, 'MENSALIDADE', current_date + 10, current_date + 10, 80, 'aberto', 'PENDING')
    returning id into hsem;
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, valor_original, data_vencimento, status)
    values (c1, ve, 60, 60, current_date + 5, 'pendente') returning id into tsem;
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, valor_original, data_vencimento, status, nosso_numero)
    values (c1, ve, 70, 70, current_date + 35, 'pendente', '261000123') returning id into treg;
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, valor_original, data_vencimento, status, valor_pago, data_pagamento)
    values (c1, ve, 50, 50, current_date - 30, 'pago', 50, current_date - 30) returning id into tpago;

  -- ===================================================== permissao (perfil x extra)
  perform set_config('request.jwt.claim.sub', u_cob::text, false);
  ok := false;
  begin
    perform criar_cancelamento_boletos(c1, jsonb_build_array(jsonb_build_object('origem','SCAR','id',tsem)), 'boleto em duplicidade');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'cobranca sem a celula nao cancela';

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into usuario_permissoes (usuario_id, modulo, acao, motivo, concedido_por)
    values (u_cob, 'cobranca', 'cancelar', 'cancela boleto da unidade', u_adm),
           (u_out, 'cobranca', 'cancelar', 'cancela boleto da unidade', u_adm);

  perform set_config('request.jwt.claim.sub', u_cob::text, false);
  -- motivo obrigatorio
  ok := false;
  begin
    perform criar_cancelamento_boletos(c1, jsonb_build_array(jsonb_build_object('origem','SCAR','id',tsem)), '   ');
  exception when check_violation then ok := sqlerrm ilike '%motivo%'; end;
  assert ok, 'sem motivo e recusado';
  -- pago nao se cancela
  ok := false;
  begin
    perform criar_cancelamento_boletos(c1, jsonb_build_array(jsonb_build_object('origem','SCAR','id',tpago)), 'cliente pediu');
  exception when check_violation then ok := true; end;
  assert ok, 'boleto pago e recusado';
  -- Mutual sem nosso numero: cancela no Mutual
  ok := false;
  begin
    perform criar_cancelamento_boletos(c1, jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',hsem)), 'cliente pediu');
  exception when check_violation then ok := sqlerrm ilike '%nosso numero%'; end;
  assert ok, 'Mutual sem nosso numero e recusado';
  -- boleto de outro associado
  ok := false;
  begin
    perform criar_cancelamento_boletos(c2, jsonb_build_array(jsonb_build_object('origem','SCAR','id',tsem)), 'cliente pediu');
  exception when check_violation then ok := true; end;
  assert ok, 'boleto de outro associado e recusado';

  -- escopo: a cobranca da unidade B, mesmo com o extra, nao alcanca o associado da A
  perform set_config('request.jwt.claim.sub', u_out::text, false);
  ok := false;
  begin
    perform criar_cancelamento_boletos(c1, jsonb_build_array(jsonb_build_object('origem','SCAR','id',tsem)), 'cliente pediu');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'fora do escopo de cobranca';

  -- ===================================================== cancela tres de uma vez
  perform set_config('request.jwt.claim.sub', u_cob::text, false);
  rn := criar_cancelamento_boletos(c1, jsonb_build_array(
          jsonb_build_object('origem','MUTUAL','id',h1),
          jsonb_build_object('origem','SCAR','id',tsem),
          jsonb_build_object('origem','SCAR','id',treg)), 'associado cancelou o contrato');
  select * into o from cobranca_renegociacoes where id = rn;
  assert o.tipo = 'CANCELAMENTO' and o.situacao = 'EMITIDA' and o.valor_original = 230 and o.valor_total = 0
     and o.observacao = 'associado cancelou o contrato' and o.criado_por = u_cob, format('reneg: %s', row_to_json(o));
  assert not exists (select 1 from titulos_financeiros where renegociacao_id = rn), 'cancelamento nao cria boleto novo';

  -- o mesmo boleto nao entra em outro cancelamento
  ok := false;
  begin
    perform criar_cancelamento_boletos(c1, jsonb_build_array(jsonb_build_object('origem','SCAR','id',tsem)), 'de novo');
  exception when unique_violation then ok := true; end;
  assert ok, 'boleto ja em cancelamento';

  -- a rota pede a baixa (service_role, sem sessao)
  perform set_config('request.jwt.claim.sub', '', false);
  perform registrar_baixa_original(id, 'BAIXADO') from cobranca_renegociacao_origens
   where renegociacao_id = rn and origem = 'MUTUAL';
  perform registrar_baixa_original(id, 'SEM_REGISTRO') from cobranca_renegociacao_origens
   where renegociacao_id = rn and titulo_id = tsem;
  perform registrar_baixa_original(id, 'ERRO', 'banco fora do ar') from cobranca_renegociacao_origens
   where renegociacao_id = rn and titulo_id = treg;

  assert (select situacao from boletos_historico where id = h1) = 'cancelado', 'Mutual cancelado';
  select * into o from titulos_financeiros where id = tsem;
  assert o.status = 'cancelado' and o.observacao like '%Cancelado: associado cancelou o contrato%',
    format('titulo: %s', row_to_json(o));
  assert (select status::text from titulos_financeiros where id = treg) = 'pendente',
    'baixa recusada nao cancela: o boleto ainda e pagavel';
  perform registrar_baixa_original(id, 'BAIXADO') from cobranca_renegociacao_origens
   where renegociacao_id = rn and titulo_id = treg;
  assert (select status::text from titulos_financeiros where id = treg) = 'cancelado', 'tentar de novo cancela';

  -- ===================================================== cancelar_fatura
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status)
    values (c1, 100, current_date + 60, 'pendente') returning id into tfat;
  insert into faturas (cliente_id, regional_id, tipo_faturamento, competencia, valor_total, vencimento, titulo_id)
    values (c1, r1, 'AGRUPADO_ASSOCIADO', date_trunc('month', current_date + 60)::date, 100, current_date + 60, tfat)
    returning id into f1;

  perform set_config('request.jwt.claim.sub', u_out::text, false);
  ok := false;
  begin
    perform cancelar_fatura(f1, 'tentativa de fora');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'fatura fora do escopo';

  perform set_config('request.jwt.claim.sub', u_fin::text, false);
  ok := false;
  begin
    perform cancelar_fatura(f1, '');
  exception when check_violation then ok := true; end;
  assert ok, 'fatura sem motivo';
  update titulos_financeiros set nosso_numero = '261000999' where id = tfat;
  ok := false;
  begin
    perform cancelar_fatura(f1, 'veiculo saiu da base');
  exception when check_violation then ok := sqlerrm ilike '%Historico financeiro%'; end;
  assert ok, 'fatura com boleto no banco vai pelo historico';
  update titulos_financeiros set nosso_numero = null where id = tfat;
  perform cancelar_fatura(f1, 'veiculo saiu da base');
  assert (select status::text from faturas where id = f1) = 'CANCELADA';
  select * into o from titulos_financeiros where id = tfat;
  assert o.status = 'cancelado' and o.observacao like '%Cancelado: veiculo saiu da base%';

  raise notice '=== TESTES 0157 (cancelamento de boletos) PASSARAM ===';
end $$;
