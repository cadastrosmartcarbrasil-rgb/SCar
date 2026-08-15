-- Teste funcional do motor de cobrancas (0024)
\set ON_ERROR_STOP on
do $$
declare
  u_id uuid := gen_random_uuid();
  r_id uuid;
  c_id uuid;
  tv   uuid;
  v1 uuid; v2 uuid; v3 uuid; v4 uuid; v5 uuid; v6 uuid;
  f_agr faturas; f_ind faturas;
  t titulos_financeiros;
  n int; v_num numeric; d date;
  rec record;
begin
  -- ------------------------------------------------------------------ vencimento
  assert calcular_vencimento('2026-02-01', 31) = date '2026-02-28', 'clamp fev';
  assert calcular_vencimento('2026-01-01', 5)  = date '2026-01-05', 'dia normal';
  assert calcular_vencimento('2026-01-15', 10) = date '2026-01-10', 'competencia no meio do mes';
  assert calcular_vencimento('2026-01-01', null) = date '2026-02-10', 'legado dia 10 mes seguinte';
  raise notice 'OK calcular_vencimento';

  -- ------------------------------------------------------------------ setup
  insert into auth.users (id, email) values (u_id, 'admin@teste.com');
  insert into regionais (nome) values ('Matriz Teste') returning id into r_id;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_id, 'Admin Teste', 'admin@teste.com', 'admin', r_id);
  perform set_config('request.jwt.claim.sub', u_id::text, false);
  assert is_staff(), 'is_staff';

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Associado Teste', '11144477735', r_id) returning id into c_id;

  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  if tv is null then insert into tipos_veiculo (nome) values ('Passeio Teste') returning id into tv; end if;

  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, tipo_faturamento, valor_mensalidade, dia_vencimento, status, data_ativacao)
    values (c_id, 'AAA1A11', 'Onix',   r_id, tv, 'AGRUPADO_ASSOCIADO',  150, 5,  'ativo', '2026-01-01') returning id into v1;
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, tipo_faturamento, valor_mensalidade, dia_vencimento, status, data_ativacao)
    values (c_id, 'BBB2B22', 'HB20',   r_id, tv, 'AGRUPADO_ASSOCIADO',  100, 5,  'ativo', '2026-01-01') returning id into v2;
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, tipo_faturamento, valor_mensalidade, dia_vencimento, status)
    values (c_id, 'CCC3C33', 'Gol',    r_id, tv, 'AGRUPADO_ASSOCIADO',  999, 5,  'suspenso') returning id into v3;
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, tipo_faturamento, valor_mensalidade, dia_vencimento, status, data_ativacao)
    values (c_id, 'DDD4D44', 'Strada', r_id, tv, 'INDIVIDUAL_VEICULO',  200, 31, 'ativo', '2026-01-01') returning id into v4;
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, tipo_faturamento, valor_mensalidade, dia_vencimento, status, data_ativacao)
    values (c_id, 'EEE5E55', 'Argo',   r_id, tv, 'INDIVIDUAL_VEICULO',  300, 10, 'ativo', '2026-05-01') returning id into v5;
  -- sem tipo de veiculo e sem valor: nao gera cobranca (valor 0)
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_faturamento, status)
    values (c_id, 'FFF6F66', 'Sem tipo', r_id, 'AGRUPADO_ASSOCIADO', 'ativo') returning id into v6;

  -- ------------------------------------------------------------------ helpers
  assert valor_mensalidade_veiculo(v1) = 150, 'override valor_mensalidade';
  assert valor_mensalidade_veiculo(v6) = 0,   'sem tipo/plano = 0';
  assert veiculo_faturavel(v1, '2026-03-01'), 'ativo e faturavel';
  assert not veiculo_faturavel(v3, '2026-03-01'), 'suspenso nao e faturavel';
  assert not veiculo_faturavel(v5, '2026-03-01'), 'ativacao futura nao e faturavel';
  assert veiculo_faturavel(v5, '2026-05-01'), 'ativacao no mes entra';
  assert dia_vencimento_agrupado(c_id, '2026-03-01') = 5, 'dia agrupado (moda)';
  raise notice 'OK helpers';

  -- ------------------------------------------------------------------ geracao
  select count(*) into n from gerar_faturas_cliente(c_id, '2026-03-01');
  assert n = 2, format('esperava 2 faturas, veio %s', n);

  select * into f_agr from faturas where cliente_id = c_id and tipo_faturamento = 'AGRUPADO_ASSOCIADO' and competencia = '2026-03-01';
  assert f_agr.valor_total = 250, format('agrupada = %s', f_agr.valor_total);
  assert f_agr.vencimento = date '2026-03-05', format('venc agrupada = %s', f_agr.vencimento);
  select count(*) into n from fatura_itens where fatura_id = f_agr.id;
  assert n = 2, format('itens agrupada = %s (v3 suspenso e v6 zerado devem ficar de fora)', n);

  select * into f_ind from faturas where veiculo_id = v4 and competencia = '2026-03-01';
  assert f_ind.valor_total = 200, 'individual valor';
  assert f_ind.vencimento = date '2026-03-31', format('venc individual (dia 31) = %s', f_ind.vencimento);
  assert not exists (select 1 from faturas where veiculo_id = v5 and competencia = '2026-03-01'), 'v5 nao pode ter fatura em marco';

  -- idempotencia
  select count(*) into n from gerar_faturas_cliente(c_id, '2026-03-01');
  assert n = 0, format('re-execucao gerou %s faturas', n);
  select count(*) into n from faturas where cliente_id = c_id and competencia = '2026-03-01';
  assert n = 2, 'total de faturas apos re-execucao';
  raise notice 'OK gerar_faturas_cliente';

  -- competencia sem dia definido cai no padrao (dia 10 do mes seguinte)
  update veiculos set dia_vencimento = null where cliente_id = c_id;
  select count(*) into n from gerar_faturas_cliente(c_id, '2026-04-01');
  assert n = 2, 'abril';
  select vencimento into d from faturas where cliente_id = c_id and competencia = '2026-04-01' and tipo_faturamento = 'AGRUPADO_ASSOCIADO';
  assert d = date '2026-05-10', format('padrao legado = %s', d);
  update veiculos set dia_vencimento = 5 where cliente_id = c_id and tipo_faturamento = 'AGRUPADO_ASSOCIADO';
  update veiculos set dia_vencimento = 31 where id = v4;

  -- ------------------------------------------------------------------ lote
  select * into rec from gerar_faturas_competencia('2026-06-01', r_id);
  assert rec.associados >= 1, 'lote: associados';
  -- em junho o v5 (ativado em maio) ja entra: agrupada 250 + v4 200 + v5 300
  assert rec.faturas_geradas = 3, format('lote: faturas = %s', rec.faturas_geradas);
  assert rec.valor_total = 750, format('lote: total = %s', rec.valor_total);
  select * into rec from gerar_faturas_competencia('2026-06-01', r_id);
  assert rec.faturas_geradas = 0, 'lote idempotente';
  raise notice 'OK gerar_faturas_competencia';

  -- ------------------------------------------------------------------ titulos
  select * into t from emitir_titulo_fatura(f_agr.id);
  assert t.valor = 250 and t.status = 'pendente' and t.data_vencimento = date '2026-03-05', 'titulo agrupado';
  assert t.veiculo_id is null, 'titulo agrupado sem veiculo';
  select titulo_id into v1 from faturas where id = f_agr.id;  -- reuso de var uuid
  assert v1 = t.id, 'fatura amarrada ao titulo';
  select * into rec from emitir_titulo_fatura(f_agr.id);
  assert rec.id = t.id, 'emissao idempotente';

  select * into rec from emitir_titulos_competencia('2026-03-01', r_id);
  assert rec.titulos_emitidos = 1, format('faltava so a individual, veio %s', rec.titulos_emitidos);
  assert (select titulo_id from faturas where id = f_ind.id) is not null, 'individual emitida';

  -- pagamento do titulo fecha a fatura
  update titulos_financeiros set status = 'pago', data_pagamento = current_date, valor_pago = 250 where id = t.id;
  assert (select status from faturas where id = f_agr.id) = 'PAGA', 'trigger titulo->fatura (pago)';

  -- cancelamento
  perform cancelar_fatura(f_ind.id);
  assert (select status from faturas where id = f_ind.id) = 'CANCELADA', 'fatura cancelada';
  assert (select status from titulos_financeiros where id = (select titulo_id from faturas where id = f_ind.id)) = 'cancelado', 'titulo cancelado';
  begin
    perform cancelar_fatura(f_agr.id);
    raise exception 'deveria ter bloqueado cancelamento de fatura paga';
  exception when others then
    if sqlerrm not like '%ja paga%' then raise; end if;
  end;
  raise notice 'OK titulos/status';

  -- ------------------------------------------------------------------ motor de precos (cotar_plano)
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, tipo_faturamento, valor_fipe, dia_vencimento, status, data_ativacao)
    values (c_id, 'GGG7G77', 'Corolla', r_id, tv, 'INDIVIDUAL_VEICULO', 50000, 15, 'ativo', '2026-01-01') returning id into v2;
  v_num := valor_mensalidade_veiculo(v2);
  raise notice 'mensalidade via cotar_plano (FIPE 50k): %', v_num;
  assert v_num = round(coalesce((cotar_plano(50000, tv, null, '{}'::uuid[])->>'valor_total_mensalidade')::numeric, 0), 2),
    'valor deve bater com cotar_plano';

  raise notice '=== TODOS OS TESTES DE COBRANCA PASSARAM ===';
end $$;
