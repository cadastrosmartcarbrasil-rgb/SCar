-- Teste funcional da 0121: 2a via e acordo viram BOLETO NOVO do SCar; os
-- originais (Mutual e SCar) sao baixados; a divida segue no painel; a
-- importacao do Mutual nao reabre o renegociado; acordo cumprido pelos boletos
-- novos; nada de comissao; escopo.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_cob uuid := gen_random_uuid();
  u_out uuid := gen_random_uuid();
  r1 uuid; r2 uuid; tv uuid; c1 uuid; c2 uuid; ve uuid; vend uuid;
  h1 uuid; h2 uuid; h3 uuid; hsem uuid; tscar uuid;
  rn uuid; rn2 uuid; ra uuid; ac uuid; tnovo uuid; o record; n bigint; ok boolean;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- A trava da revistoria (0137) tem suite propria; aqui o assunto e a 0121.
  execute 'alter table cobranca_renegociacao_origens disable trigger trg_reneg_origem_revistoria';
  insert into auth.users (id, email) values (u_adm,'adm121@t.com'), (u_cob,'cob121@t.com'), (u_out,'out121@t.com');
  insert into regionais (nome) values ('U121 A') returning id into r1;
  insert into regionais (nome) values ('U121 B') returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm121@t.com','admin', null),
    (u_cob,'Cobranca A','cob121@t.com','cobranca', r1),
    (u_out,'Cobranca B','out121@t.com','cobranca', r2);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','DEVEDOR 121','52998224725', r1) returning id into c1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','OUTRO 121','11144477735', r1) returning id into c2;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND 121', r1, 0, 0, true) returning id into vend;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, cobranca_externa, vendedor_id)
    values (c1,'RNG1A21', r1, tv, 'ativo', current_date - 400, 100, true, vend) returning id into ve;

  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem, linha_digitavel) values
    ('121-1', c1, ve, 'MENSALIDADE', current_date - 40, current_date - 40, 100, 'aberto', 'OVERDUE',
     '74891160007840200810039027231010100000000010000') returning id into h1;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem, linha_digitavel) values
    ('121-2', c1, ve, 'MENSALIDADE', current_date - 10, current_date - 10, 150, 'aberto', 'OVERDUE',
     '74891160007840300810039027231010100000000015000') returning id into h2;
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem, linha_digitavel) values
    ('121-3', c1, ve, 'MENSALIDADE', current_date - 70, current_date - 70, 120, 'aberto', 'OVERDUE',
     '74891160007840400810039027231010100000000012000') returning id into h3;
  insert into boletos_historico (id_externo, cliente_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem) values
    ('121-sem', c1, 'MENSALIDADE', current_date - 70, current_date - 70, 80, 'aberto', 'OVERDUE')
    returning id into hsem;
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, valor_original, data_vencimento, status)
    values (c1, ve, 60, 60, current_date - 5, 'pendente') returning id into tscar;

  -- ===================================================== A) validacoes
  ok := false;
  begin
    perform criar_renegociacao(c1, 'SEGUNDA_VIA', jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',hsem)),
      jsonb_build_array(jsonb_build_object('vencimento', v_hoje + 3, 'valor', 80)));
  exception when check_violation then ok := sqlerrm ilike '%nosso numero%'; end;
  assert ok, 'boleto do Mutual sem nosso numero e recusado';

  ok := false;
  begin
    perform criar_renegociacao(c1, 'SEGUNDA_VIA', jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',h1)),
      jsonb_build_array(jsonb_build_object('vencimento', v_hoje - 1, 'valor', 100)));
  exception when check_violation then ok := true; end;
  assert ok, 'vencimento no passado e recusado';

  ok := false;
  begin
    perform criar_renegociacao(c2, 'SEGUNDA_VIA', jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',h1)),
      jsonb_build_array(jsonb_build_object('vencimento', v_hoje + 1, 'valor', 100)));
  exception when check_violation then ok := true; end;
  assert ok, 'boleto de outro associado e recusado';

  ok := false;
  begin
    perform criar_renegociacao(c1, 'SEGUNDA_VIA', jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',h1)),
      '[{"vencimento":"2099-01-01","valor":1},{"vencimento":"2099-02-01","valor":1}]'::jsonb);
  exception when check_violation then ok := true; end;
  assert ok, '2a via com duas parcelas e recusada';

  -- escopo: cobranca da outra unidade nao negocia
  perform set_config('request.jwt.claim.sub', u_out::text, false);
  ok := false;
  begin
    perform criar_renegociacao(c1, 'SEGUNDA_VIA', jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',h1)),
      jsonb_build_array(jsonb_build_object('vencimento', v_hoje + 1, 'valor', 100)));
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'cobranca de outra unidade nao negocia';

  -- ===================================================== B) 2a via de um boleto do Mutual
  perform set_config('request.jwt.claim.sub', u_cob::text, false);
  rn := criar_renegociacao(c1, 'SEGUNDA_VIA', jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',h1)),
      jsonb_build_array(jsonb_build_object('vencimento', v_hoje + 2, 'valor', 105.5)), null, 'com juros');
  select count(*) into n from titulos_financeiros where renegociacao_id = rn and status = 'pendente';
  assert n = 1, 'um boleto novo';
  select id into tnovo from titulos_financeiros where renegociacao_id = rn;
  assert (select veiculo_id from titulos_financeiros where id = tnovo) = ve, 'boleto novo leva o veiculo do original';
  assert (select valor_original from cobranca_renegociacoes where id = rn) = 100;

  ok := false;
  begin
    perform criar_renegociacao(c1, 'SEGUNDA_VIA', jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',h1)),
      jsonb_build_array(jsonb_build_object('vencimento', v_hoje + 2, 'valor', 100)));
  exception when unique_violation then ok := true; end;
  assert ok, 'o mesmo boleto nao entra em duas negociacoes';

  -- baixa do original antes da emissao e recusada
  select * into o from cobranca_renegociacao_origens where renegociacao_id = rn;
  ok := false;
  begin
    perform registrar_baixa_original(o.id, 'BAIXADO');
  exception when check_violation then ok := true; end;
  assert ok, 'baixa so depois de emitido';

  -- o original ainda nao e cancelado: segue aberto ate a baixa
  assert (select situacao from boletos_historico where id = h1) = 'aberto';

  assert finalizar_emissao_renegociacao(rn, null, jsonb_build_array(jsonb_build_object(
    'titulo_id', tnovo, 'nosso_numero', '261000999', 'linha_digitavel', '7489...', 'pix_copia_cola', 'PIX'))) = 'EMITIDA';
  assert (select gateway_status from titulos_financeiros where id = tnovo) = 'REGISTRADO';

  assert registrar_baixa_original(o.id, 'BAIXADO') = 'BAIXADO';
  assert registrar_baixa_original(o.id, 'BAIXADO') = 'BAIXADO', 're-executavel';
  assert (select situacao from boletos_historico where id = h1) = 'cancelado';
  assert (select renegociacao_id from boletos_historico where id = h1) = rn;

  -- C) a importacao do Mutual nao reabre o renegociado
  update boletos_historico set situacao = 'aberto', status_origem = 'OVERDUE' where id = h1;
  assert (select situacao from boletos_historico where id = h1) = 'cancelado', 'Mutual nao reabre';
  -- ...mas pagamento confirmado pelo banco manda
  update boletos_historico set situacao = 'pago', valor_pago = 100, data_pagamento = current_date,
         baixa_banco_em = now() where id = h1;
  assert (select situacao from boletos_historico where id = h1) = 'pago', 'banco confirmou: pago';

  -- D) a divida segue no painel pelo boleto novo
  select count(*) into n from cobranca_boletos_base(null, null, null)
   where boleto_id = tnovo and origem = 'SCAR' and situacao = 'a_vencer';
  assert n = 1, 'boleto de renegociacao entra no painel';
  -- e nao vira corte: os boletos do Mutual continuam no painel
  select count(*) into n from cobranca_boletos_base(null, null, null) where boleto_id = h2;
  assert n = 1, 'o corte continua no 1o boleto COM fatura';

  -- F) pagar o boleto novo GERA comissao (0159: a comissao e da liquidacao)
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  update titulos_financeiros set status = 'pago', valor_pago = 105.5, data_pagamento = current_date where id = tnovo;
  assert exists (select 1 from comissoes_vendas where titulo_id = tnovo and not is_adesao),
    'renegociacao paga comissiona (0159), nunca como adesao';

  -- ===================================================== E) acordo de 2 parcelas (Mutual + SCar)
  perform set_config('request.jwt.claim.sub', u_cob::text, false);
  perform registrar_contato_cobranca(c1, 'LIGACAO', 'PROMETEU', null, null, null,
    jsonb_build_object('tipo','ACORDO','parcelas', jsonb_build_array(
      jsonb_build_object('vencimento', v_hoje + 5, 'valor', 165),
      jsonb_build_object('vencimento', v_hoje + 35, 'valor', 165))));
  select id into ac from cobranca_acordos where cliente_id = c1;
  ra := criar_renegociacao(c1, 'ACORDO',
    jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',h2), jsonb_build_object('origem','MUTUAL','id',h3),
                      jsonb_build_object('origem','SCAR','id',tscar)),
    jsonb_build_array(jsonb_build_object('vencimento', v_hoje + 5, 'valor', 165),
                      jsonb_build_object('vencimento', v_hoje + 35, 'valor', 165)), ac);
  select count(*) into n from titulos_financeiros where renegociacao_id = ra;
  assert n = 2, 'duas parcelas';
  assert (select valor_original from cobranca_renegociacoes where id = ra) = 330;

  -- emissao recusada: tudo volta, originais intocados
  rn2 := ra;
  assert finalizar_emissao_renegociacao(ra, null, (
    select jsonb_agg(jsonb_build_object('titulo_id', id, 'erro', 'CEP invalido'))
      from titulos_financeiros where renegociacao_id = ra)) = 'ERRO';
  select count(*) into n from titulos_financeiros where renegociacao_id = ra and status <> 'cancelado';
  assert n = 0, 'emissao recusada cancela os boletos novos';
  assert (select situacao from boletos_historico where id = h2) = 'aberto', 'original intocado';
  assert (select status from titulos_financeiros where id = tscar) = 'pendente', 'titulo original intocado';

  -- de novo, agora emitido
  ra := criar_renegociacao(c1, 'ACORDO',
    jsonb_build_array(jsonb_build_object('origem','MUTUAL','id',h2), jsonb_build_object('origem','MUTUAL','id',h3),
                      jsonb_build_object('origem','SCAR','id',tscar)),
    jsonb_build_array(jsonb_build_object('vencimento', v_hoje + 5, 'valor', 165),
                      jsonb_build_object('vencimento', v_hoje + 35, 'valor', 165)), ac);
  assert ra <> rn2, 'depois do ERRO a negociacao pode ser refeita (inclusive do mesmo acordo)';
  perform finalizar_emissao_renegociacao(ra, null, (
    select jsonb_agg(jsonb_build_object('titulo_id', id, 'linha_digitavel', 'L' || renegociacao_parcela))
      from titulos_financeiros where renegociacao_id = ra));
  for o in select * from cobranca_renegociacao_origens where renegociacao_id = ra loop
    if o.origem = 'SCAR' then
      perform registrar_baixa_original(o.id, 'SEM_REGISTRO');
    elsif o.boleto_historico_id = h3 then
      perform registrar_baixa_original(o.id, 'ERRO', 'Titulo ja liquidado');
    else
      perform registrar_baixa_original(o.id, 'BAIXADO');
    end if;
  end loop;
  assert (select status from titulos_financeiros where id = tscar) = 'cancelado', 'titulo do SCar sem registro: cancelado';
  assert (select situacao from boletos_historico where id = h2) = 'cancelado';
  assert (select situacao from boletos_historico where id = h3) = 'aberto', 'baixa com erro: segue aberto';
  assert (select baixa_erro from cobranca_renegociacao_origens where boleto_historico_id = h3 and renegociacao_id = ra)
    = 'Titulo ja liquidado';

  -- acordo: 1a parcela paga => a 1a cumprida, acordo em andamento (nao quitado)
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  update titulos_financeiros set status = 'pago', valor_pago = 165, data_pagamento = current_date
   where renegociacao_id = ra and renegociacao_parcela = 1;
  update boletos_historico set situacao = 'cancelado' where id = h3;  -- pago/baixado no Mutual
  perform set_config('request.jwt.claim.sub', u_cob::text, false);
  select * into o from cobranca_acordos_situacao(null, c1) where acordo_id = ac;
  assert o.status = 'EM_ANDAMENTO', 'acordo segue em andamento: ' || o.status;
  assert (o.parcelas->0->>'situacao') = 'cumprida', 'parcela 1 cumprida pelo boleto novo';
  assert (o.parcelas->1->>'situacao') = 'a_vencer', 'parcela 2 a vencer: ' || (o.parcelas->1->>'situacao');

  -- a leitura da tela
  select count(*) into n from renegociacoes_do_cliente(c1);
  assert n = 3, 'tres renegociacoes (uma com erro)';
  perform set_config('request.jwt.claim.sub', u_out::text, false);
  select count(*) into n from renegociacoes_do_cliente(c1);
  assert n = 0, 'fora do escopo nao le';

  raise notice '=== 0121 RENEGOCIACAO DE BOLETO: TESTES PASSARAM ===';
end $$;
