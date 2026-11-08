-- Teste funcional da 0191: saida de UM veiculo do boleto agrupado (o boleto
-- novo sem ele, o antigo baixado) e a comissao de todo boleto de mensalidade
-- pago, repartida pelos veiculos que ele paga.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; tv uuid; c1 uuid; m1 uuid; m2 uuid; m3 uuid; vend1 uuid; vend2 uuid;
  f1 uuid; f2 uuid; f3 uuid; t1 uuid; t2 uuid; t3 uuid; k uuid; rn uuid; tn uuid;
  a record; ok boolean; n integer; o record; s numeric;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_comp date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
begin
  insert into auth.users (id, email) values (u_adm,'adm191@t.com');
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente) values ('U191', 1.0, 0.50) returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values (u_adm,'Admin','adm191@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND A 191', r1, 0, 0.10, true) returning id into vend1;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND B 191', r1, 0, 0.20, true) returning id into vend2;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','DONO DAS MOTOS 191','52998224725', r1) returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, dia_vencimento, tipo_faturamento, vendedor_id, cobranca_externa)
    values (c1,'MOT1A91', r1, tv, 'ativo', v_hoje - 300, 100, 20, 'AGRUPADO_ASSOCIADO', vend1, true) returning id into m1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, dia_vencimento, tipo_faturamento, vendedor_id, cobranca_externa)
    values (c1,'MOT2B91', r1, tv, 'ativo', v_hoje - 300, 100, 20, 'AGRUPADO_ASSOCIADO', vend1, true) returning id into m2;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, dia_vencimento, tipo_faturamento, vendedor_id, cobranca_externa)
    values (c1,'MOT3C91', r1, tv, 'ativo', v_hoje - 300, 200, 20, 'AGRUPADO_ASSOCIADO', vend2, true) returning id into m3;
  insert into integracao_vinculos (entidade, id_externo, tabela, registro_id) values
    ('CONTRACT_OBJECT','19101','veiculos', m1), ('CONTRACT_OBJECT','19102','veiculos', m2),
    ('CONTRACT_OBJECT','19103','veiculos', m3);   -- migrados: o 1o pagamento nao e adesao

  -- tres meses agrupados de 400 (100 + 100 + 200), ja com boleto
  insert into titulos_financeiros (cliente_id, valor, valor_original, data_vencimento, status, nosso_numero)
    values (c1, 400, 400, v_hoje - 3, 'pendente', '191000001') returning id into t1;
  insert into titulos_financeiros (cliente_id, valor, valor_original, data_vencimento, status, nosso_numero)
    values (c1, 400, 400, v_hoje + 27, 'pendente', '191000002') returning id into t2;
  insert into titulos_financeiros (cliente_id, valor, valor_original, data_vencimento, status)
    values (c1, 400, 400, v_hoje + 57, 'pendente') returning id into t3;
  insert into faturas (cliente_id, regional_id, tipo_faturamento, competencia, valor_total, vencimento, titulo_id)
    values (c1, r1, 'AGRUPADO_ASSOCIADO', v_comp, 400, v_hoje - 3, t1) returning id into f1;
  insert into faturas (cliente_id, regional_id, tipo_faturamento, competencia, valor_total, vencimento, titulo_id)
    values (c1, r1, 'AGRUPADO_ASSOCIADO', (v_comp + interval '1 month')::date, 400, v_hoje + 27, t2) returning id into f2;
  insert into faturas (cliente_id, regional_id, tipo_faturamento, competencia, valor_total, vencimento, titulo_id)
    values (c1, r1, 'AGRUPADO_ASSOCIADO', (v_comp + interval '2 month')::date, 400, v_hoje + 57, t3) returning id into f3;
  insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
    select f, m, 'item', v from unnest(array[f1,f2,f3]) f
     cross join (values (m1, 100::numeric), (m2, 100), (m3, 200)) x(m, v);

  -- ===================================================== rateio
  select count(*), sum(peso) into n, s from rateio_mensalidade_titulo(t2);
  assert n = 3 and s = 400, format('agrupado: 3 veiculos pelos itens (veio %s / %s)', n, s);

  -- ===================================================== previa (vende a m1 hoje - 5)
  select count(*) into n from agrupados_do_cancelamento(m1, v_hoje - 5);
  assert n = 3, format('os tres agrupados aparecem (veio %s)', n);
  select * into a from agrupados_do_cancelamento(m1, v_hoje - 5) where titulo_id = t2;
  assert a.situacao = 'AJUSTAR' and a.valor_veiculo = 100 and a.valor_novo = 300 and a.outros_veiculos = 2,
    format('previa t2: %s', row_to_json(a));
  select * into a from agrupados_do_cancelamento(m1, v_hoje - 5) where titulo_id = t1;
  assert a.situacao = 'AJUSTAR' and a.novo_vencimento = v_hoje + 2,
    'vencido depois da venda: ajusta, com vencimento novo';
  select * into a from agrupados_do_cancelamento(m1, v_hoje - 2) where titulo_id = t1;
  assert a.situacao = 'DIVIDA', 'vencido ANTES da venda e divida';

  -- ===================================================== cancela e ajusta t2 e t3
  k := cancelar_veiculo(m1, v_hoje - 5, 'Vendeu a moto');
  assert (select count(*) from ajustar_agrupados_cancelamento(k, array[t2, t3])) = 2, 'dois ajustes';

  select r.* into o from cobranca_renegociacoes r
    join cobranca_renegociacao_origens x on x.renegociacao_id = r.id where x.titulo_id = t2;
  rn := o.id;
  assert o.tipo = 'AJUSTE_AGRUPADO' and o.veiculo_id = m1 and o.valor_total = 300 and o.situacao = 'EMITINDO',
    format('ajuste: %s', row_to_json(o));
  select id into tn from titulos_financeiros where renegociacao_id = rn;
  assert (select valor from titulos_financeiros where id = tn) = 300, 'o boleto novo e de 300';
  assert (select veiculo_id from titulos_financeiros where id = tn) = m3, 'leva o veiculo de maior peso que fica';
  assert not exists (select 1 from rateio_mensalidade_titulo(tn) x where x.veiculo_id = m1),
    'o veiculo que saiu nao entra no rateio do boleto novo';

  -- o mesmo boleto nao e ajustado duas vezes
  ok := false;
  begin
    perform ajustar_agrupados_cancelamento(k, array[t2]);
  exception when check_violation then ok := true; end;
  assert ok, 'boleto ja em ajuste e recusado';

  -- a rota: emite (service_role, sem sessao) e baixa o original
  perform set_config('request.jwt.claim.sub', '', false);
  perform finalizar_emissao_renegociacao(rn, null, jsonb_build_array(jsonb_build_object(
    'titulo_id', tn, 'nosso_numero', '191000099', 'linha_digitavel', '7489...')));
  perform registrar_baixa_original(id, 'BAIXADO') from cobranca_renegociacao_origens where renegociacao_id = rn;
  select * into o from titulos_financeiros where id = t2;
  assert o.status = 'cancelado' and o.observacao like '%Substituido: Saida do veiculo MOT1A91%',
    format('original baixado: %s', row_to_json(o));
  assert (select status from faturas where id = f2) = 'CANCELADA', 'a fatura do boleto antigo fecha';
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- ===================================================== comissao do boleto novo pago
  update titulos_financeiros set status = 'pago', valor_pago = 300, data_pagamento = v_hoje where id = tn;
  assert not exists (select 1 from comissoes_vendas where titulo_id = tn and veiculo_id = m1), 'quem saiu nao recebe';
  assert (select valor_comissao from comissoes_vendas where titulo_id = tn and veiculo_id = m2) = 10,
    'm2: 10% de 100';
  assert (select valor_comissao from comissoes_vendas where titulo_id = tn and veiculo_id = m3) = 40,
    'm3: 20% de 200 ao vendedor dele';

  -- ===================================================== agrupado pago direto: cada item
  update titulos_financeiros set status = 'pago', valor_pago = 400, data_pagamento = v_hoje where id = t1;
  assert (select count(*) from comissoes_vendas where titulo_id = t1) = 3, 'agrupado pago: uma comissao por veiculo';

  -- ===================================================== 2a via de um agrupado: reparte pelos itens
  insert into titulos_financeiros (cliente_id, valor, valor_original, data_vencimento, status)
    values (c1, 400, 400, v_hoje + 90, 'pendente') returning id into t1;
  insert into faturas (cliente_id, regional_id, tipo_faturamento, competencia, valor_total, vencimento, titulo_id)
    values (c1, r1, 'AGRUPADO_ASSOCIADO', (v_comp + interval '3 month')::date, 400, v_hoje + 90, t1) returning id into f1;
  insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
    values (f1, m2, 'item', 200), (f1, m3, 'item', 200);
  insert into cobranca_renegociacoes (cliente_id, tipo, valor_original, valor_total, situacao)
    values (c1, 'SEGUNDA_VIA', 400, 420, 'EMITIDA') returning id into rn;
  insert into cobranca_renegociacao_origens (renegociacao_id, origem, titulo_id, valor, vencimento)
    values (rn, 'SCAR', t1, 400, v_hoje + 90);
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status, renegociacao_id)
    values (c1, m3, 420, v_hoje + 3, 'pendente', rn) returning id into tn;
  update titulos_financeiros set status = 'pago', valor_pago = 420, data_pagamento = v_hoje where id = tn;
  assert (select valor_comissao from comissoes_vendas where titulo_id = tn and veiculo_id = m2) = 21,
    '2a via do agrupado: m2 recebe sobre metade dos 420 (era tudo no veiculo do titulo)';
  assert (select valor_comissao from comissoes_vendas where titulo_id = tn and veiculo_id = m3) = 42, 'm3 idem';

  -- ===================================================== nao e mensalidade: rastreador
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status, observacao)
    values (c1, m2, 300, v_hoje, 'pendente', 'Equipamento de rastreamento nao devolvido') returning id into tn;
  update titulos_financeiros set status = 'pago', valor_pago = 300, data_pagamento = v_hoje where id = tn;
  assert not exists (select 1 from comissoes_vendas where titulo_id = tn), 'cobranca do rastreador nao gera comissao';

  -- ===================================================== idempotente
  select gerar_comissoes_titulo(tn) into n;
  assert n = 0, 'gerar de novo nao duplica';

  raise notice '=== TESTES 0191 (agrupado no cancelamento e comissao) PASSARAM ===';
end $$;
