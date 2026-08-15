-- Teste funcional do MODULO COBRANCA (0025): ativacao automatica, lote por
-- periodo, remessa/gateway e dashboard (listagem + KPIs).
\set ON_ERROR_STOP on
do $$
declare
  u_id uuid := gen_random_uuid();
  r_id uuid; c_id uuid; c2_id uuid; tv uuid;
  a1 uuid; a2 uuid; i1 uuid; sus uuid;
  f faturas; t titulos_financeiros; rem cobranca_remessas;
  n int; rec record; d date;
  comp date := date_trunc('month', current_date)::date;
begin
  -- setup -------------------------------------------------------------------
  insert into auth.users (id, email) values (u_id, 'fin@teste.com');
  insert into regionais (nome) values ('Regional Cobranca') returning id into r_id;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_id, 'Financeiro', 'fin@teste.com', 'financeiro', r_id);
  perform set_config('request.jwt.claim.sub', u_id::text, false);

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Joao da Silva', '11144477735', r_id) returning id into c_id;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Maria Souza', '52998224725', r_id) returning id into c2_id;
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  if tv is null then insert into tipos_veiculo (nome) values ('Passeio Teste') returning id into tv; end if;

  -- A) GERACAO AUTOMATICA NA ATIVACAO ---------------------------------------
  -- veiculo entra ja ativo (fluxo da auditoria de Vendas)
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id,
                        tipo_faturamento, valor_mensalidade, dia_vencimento, status)
    values (c_id, 'AUT1A11', 'Onix', r_id, tv, 'AGRUPADO_ASSOCIADO', 150, 10, 'ativo')
    returning id into a1;

  assert (select data_ativacao from veiculos where id = a1) = current_date, 'data_ativacao carimbada';
  select * into f from faturas where cliente_id = c_id and competencia = comp;
  assert f.id is not null, 'primeira cobranca gerada na ativacao';
  assert f.valor_total = 150, format('primeira cobranca = %s', f.valor_total);
  assert f.vencimento = calcular_vencimento(comp, 10), 'vencimento pelo dia da ficha';

  -- segundo veiculo agrupado entra na MESMA fatura aberta (soma)
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id,
                        tipo_faturamento, valor_mensalidade, dia_vencimento, status)
    values (c_id, 'AUT2B22', 'HB20', r_id, tv, 'AGRUPADO_ASSOCIADO', 100, 10, 'ativo')
    returning id into a2;
  select * into f from faturas where id = f.id;
  assert f.valor_total = 250, format('agrupada somou o 2o veiculo = %s', f.valor_total);
  select count(*) into n from fatura_itens where fatura_id = f.id;
  assert n = 2, 'dois itens na agrupada';

  -- veiculo que entra SUSPENSO nao gera nada; ao ser ativado, gera
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id,
                        tipo_faturamento, valor_mensalidade, dia_vencimento, status)
    values (c2_id, 'SUS3C33', 'Gol', r_id, tv, 'INDIVIDUAL_VEICULO', 90, 20, 'suspenso')
    returning id into sus;
  assert not exists (select 1 from faturas where cliente_id = c2_id), 'suspenso nao gera cobranca';
  update veiculos set status = 'ativo' where id = sus;
  assert exists (select 1 from faturas where cliente_id = c2_id and competencia = comp), 'ativacao posterior gera cobranca';

  -- reativacao nao duplica a cobranca da competencia
  update veiculos set status = 'suspenso' where id = sus;
  update veiculos set status = 'ativo' where id = sus;
  select count(*) into n from faturas where cliente_id = c2_id and competencia = comp;
  assert n = 1, format('reativacao duplicou fatura (%s)', n);
  raise notice 'OK geracao automatica na ativacao';

  -- B) LOTE POR PERIODO (6 meses) -------------------------------------------
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id,
                        tipo_faturamento, valor_mensalidade, dia_vencimento, status)
    values (c_id, 'IND4D44', 'Strada', r_id, tv, 'INDIVIDUAL_VEICULO', 200, 5, 'ativo')
    returning id into i1;

  -- 6 competencias a partir do mes corrente, so do associado c_id
  select count(*) into n from gerar_faturas_periodo(comp, 6, c_id);
  assert n = 6, format('esperava 6 competencias, veio %s', n);
  select count(*) into n from faturas where cliente_id = c_id;
  -- mes corrente: agrupada (ja existia) + individual criada agora = 2
  -- meses 2..6: agrupada + individual = 10  => 12
  assert n = 12, format('faturas do associado apos o lote = %s', n);

  -- idempotencia do lote
  select sum(faturas_geradas)::int into n from gerar_faturas_periodo(comp, 6, c_id);
  assert n = 0, format('lote de periodo nao e idempotente (%s)', n);

  -- escopo por grupo de veiculos: so o veiculo individual, 3 meses a frente
  select sum(faturas_geradas)::int into n
    from gerar_faturas_periodo((comp + interval '6 month')::date, 3, null, array[i1]);
  assert n = 3, format('lote por veiculo = %s', n);
  assert not exists (
    select 1 from faturas
     where cliente_id = c_id and tipo_faturamento = 'AGRUPADO_ASSOCIADO'
       and competencia = (comp + interval '6 month')::date
  ), 'lote por veiculo nao pode gerar a agrupada';
  raise notice 'OK lote por periodo';

  -- C) REMESSA / GATEWAY ----------------------------------------------------
  select * into rec from emitir_titulos_competencia(comp, r_id);
  assert rec.titulos_emitidos >= 3, format('titulos emitidos = %s', rec.titulos_emitidos);

  select count(*) into n from titulos_para_remessa(comp, r_id);
  assert n >= 3, format('fila de remessa = %s', n);

  select * into rem from criar_remessa_cobranca(
    (select array_agg(id) from titulos_para_remessa(comp, r_id)), null, 'competencia teste');
  assert rem.total_titulos >= 3, format('remessa com %s titulos', rem.total_titulos);
  assert rem.status = 'PENDENTE', 'remessa nasce pendente';

  -- titulo ja em remessa nao volta para a fila
  select count(*) into n from titulos_para_remessa(comp, r_id);
  assert n = 0, format('titulo duplicado na fila (%s)', n);

  perform marcar_remessa_enviada(rem.id);
  assert (select status from cobranca_remessas where id = rem.id) = 'PROCESSANDO', 'remessa processando';
  assert (select count(*) from cobranca_remessa_itens where remessa_id = rem.id and status = 'ENVIADO') = rem.total_titulos,
    'itens marcados como enviados';

  -- retorno do gateway (o que a API bancaria devolvera)
  for rec in select titulo_id from cobranca_remessa_itens where remessa_id = rem.id loop
    perform registrar_retorno_cobranca(
      rec.titulo_id, 'gw_' || rec.titulo_id, '00012345', '34191.79001 01043.510047 91020.150008 8 99990000012345',
      'https://gateway.exemplo/boleto.pdf', '00020126BR.GOV.BCB.PIX', 'https://gateway.exemplo/qr.png',
      null, jsonb_build_object('ok', true));
  end loop;

  select * into rem from finalizar_remessa(rem.id);
  assert rem.status = 'CONCLUIDA', format('remessa final = %s', rem.status);
  select * into t from titulos_financeiros where id = (select titulo_id from cobranca_remessa_itens where remessa_id = rem.id limit 1);
  assert t.linha_digitavel is not null and t.url_boleto is not null and t.pix_copia_cola is not null, 'retorno gravado no titulo';
  assert t.gateway_status = 'REGISTRADO', 'status do gateway';
  raise notice 'OK remessa / retorno do gateway';

  -- erro do gateway marca item e titulo
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status)
    values (c_id, 77, current_date + 5, 'pendente') returning * into t;
  select * into rem from criar_remessa_cobranca(array[t.id], null, 'lote com erro');
  perform marcar_remessa_enviada(rem.id);
  perform registrar_retorno_cobranca(t.id, null, null, null, null, null, null, 'CPF invalido no gateway', null);
  select * into rem from finalizar_remessa(rem.id);
  assert rem.status = 'ERRO', format('remessa com erro = %s', rem.status);
  assert (select gateway_erro from titulos_financeiros where id = t.id) = 'CPF invalido no gateway', 'erro gravado no titulo';

  -- D) DASHBOARD ------------------------------------------------------------
  -- paga um titulo para testar emitido x recebido
  select titulo_id into t.id from cobranca_remessa_itens
   where remessa_id in (select id from cobranca_remessas where referencia = 'competencia teste') limit 1;
  update titulos_financeiros set status = 'pago', data_pagamento = current_date, valor_pago = valor where id = t.id;

  -- um vencido (inadimplencia)
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (c_id, i1, 200, current_date - 20, 'pendente');

  select * into rec from resumo_cobrancas(current_date - 60, current_date + 60, r_id);
  assert rec.emitido_qtd > 0, 'KPI emitido';
  assert rec.recebido_valor > 0, 'KPI recebido';
  assert rec.vencido_valor >= 200, format('KPI vencido = %s', rec.vencido_valor);
  assert rec.inadimplencia_pct > 0, 'KPI inadimplencia %';
  assert rec.vencer_30_valor >= rec.vencer_7_valor, 'a vencer 30 >= 7';
  raise notice 'KPIs: emitido % (%), recebido %, vencido % (%%%), a vencer 7/15/30: % / % / %',
    rec.emitido_valor, rec.emitido_qtd, rec.recebido_valor, rec.vencido_valor, rec.inadimplencia_pct,
    rec.vencer_7_valor, rec.vencer_15_valor, rec.vencer_30_valor;

  -- filtros da listagem
  select count(*) into n from listar_cobrancas(null, null, 'IND4D44');
  assert n >= 1, 'filtro por placa';
  select count(*) into n from listar_cobrancas(null, null, null, 'Joao');
  assert n >= 1, 'filtro por nome do associado';
  select count(*) into n from listar_cobrancas(null, null, null, '111.444.777-35');
  assert n >= 1, 'filtro por CPF formatado';
  select count(*) into n from listar_cobrancas(null, null, null, null, null, null, 'vencido');
  assert n >= 1, 'filtro por status vencido';
  select count(*) into n from listar_cobrancas(null, null, null, null, 1000, 2000);
  assert n = 0, 'faixa de valor sem resultado';
  select count(*) into n from listar_cobrancas(current_date - 60, current_date + 60, null, null, 100, 300);
  assert n >= 1, 'faixa de valor com resultado';
  select status into rec from listar_cobrancas(null, null, null, null, null, null, 'pago') limit 1;
  assert rec.status = 'pago', 'status efetivo pago';
  raise notice 'OK dashboard (listagem + KPIs)';

  raise notice '=== MODULO COBRANCA: TODOS OS TESTES PASSARAM ===';
end $$;
