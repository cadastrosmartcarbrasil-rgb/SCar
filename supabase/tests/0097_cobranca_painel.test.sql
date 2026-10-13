-- Teste funcional da COBRANCA (0097): perfis supervisor/cobranca, situacao do
-- boleto, dia util, ciclos, recortes, indicadores, a data de corte, a
-- importacao re-executavel do historico do Mutual e a formula corrigida.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  u_sup uuid := gen_random_uuid();
  u_cob uuid := gen_random_uuid();
  u_cob2 uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  r1 uuid; r2 uuid; r3 uuid; tv uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; v4 uuid;
  t uuid; f uuid;
  ini date := current_date - 120;
  fim date := current_date + 30;
  rec record; n bigint; ok boolean;
begin
  -- ===================================================== setup
  insert into auth.users (id, email) values
    (u_adm,'adm97@t.com'), (u_ges,'ges97@t.com'), (u_sup,'sup97@t.com'),
    (u_cob,'cob97@t.com'), (u_cob2,'cob297@t.com'), (u_con,'con97@t.com');
  insert into regionais (nome) values ('Unidade 1') returning id into r1;
  insert into regionais (nome) values ('Unidade 2') returning id into r2;
  insert into regionais (nome) values ('Unidade 3') returning id into r3;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm97@t.com','admin', null),
    (u_ges,'Gestor 1','ges97@t.com','gestor_regional', r1),
    (u_sup,'Supervisor','sup97@t.com','supervisor', null),
    (u_cob,'Cobranca BR','cob97@t.com','cobranca', null),
    (u_cob2,'Cobranca U2','cob297@t.com','cobranca', r2),
    (u_con,'Consultor','con97@t.com','consultor_vendas', r1);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Cliente 1','52998224725', r1) returning id into c1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Cliente 2','11144477735', r2) returning id into c2;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Cliente Matriz','15350946056', null) returning id into c3;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Cliente 4','39053344705', r3) returning id into c4;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status,
                        data_ativacao, valor_mensalidade, cobranca_externa)
    values (c4,'QWE9A97', r3, tv, 'ativo', current_date - 400, 100, true) returning id into v4;

  -- ===================================================== A) helpers
  assert dia_util_seguinte(date '2026-09-04') = date '2026-09-04', 'sexta e dia util';
  assert dia_util_seguinte(date '2026-09-05') = date '2026-09-07', 'sabado vai para segunda';
  perform salvar_feriado_cobranca(date '2026-09-07', 'Independencia');
  assert dia_util_seguinte(date '2026-09-05') = date '2026-09-08', 'feriado na segunda empurra para terca';
  perform remover_feriado_cobranca(date '2026-09-07');
  assert dia_util_seguinte(date '2026-09-05') = date '2026-09-07', 'feriado removido';

  assert ciclo_vencimento(date '2026-09-05') = 5,  'ciclo 5';
  assert ciclo_vencimento(date '2026-09-11') = 10, 'dia 11 cai no 10';
  assert ciclo_vencimento(date '2026-09-26') = 25, 'dia 26 cai no 25';
  assert ciclo_vencimento(date '2026-02-28') = 30, 'fevereiro 28 e o ciclo 30';
  assert ciclo_vencimento(date '2026-10-01') = 30, 'dia 1 volta para o 30';

  assert mutual_dia('2026-09-08') = date '2026-09-08', 'data so-dia nao pode andar para tras';
  assert mutual_situacao_boleto('SUCCEEDED') = 'pago';
  assert mutual_situacao_boleto('OVERDUE') = 'aberto';
  assert mutual_situacao_boleto('CANCELED_RECURRENCE') = 'cancelado';
  assert mutual_situacao_boleto('XPTO') is null, 'status desconhecido nao e chutado';

  select * into rec from cobranca_recortes(date '2026-09-01', date '2026-09-30') where recorte = 'anterior_1';
  assert rec.inicio = date '2026-08-01' and rec.fim = date '2026-08-31', 'mes cheio compara com o mes de calendario';
  select * into rec from cobranca_recortes(date '2026-09-01', date '2026-09-30') where recorte = 'anterior_3';
  assert rec.inicio = date '2026-06-01' and rec.fim = date '2026-06-30', 'tres meses antes';
  select * into rec from cobranca_recortes(date '2026-09-01', date '2026-09-30') where recorte = 'ano_anterior';
  assert rec.inicio = date '2025-09-01', 'mesmo mes do ano anterior';
  select * into rec from cobranca_recortes(date '2026-09-10', date '2026-09-19') where recorte = 'anterior_1';
  assert rec.inicio = date '2026-08-31' and rec.fim = date '2026-09-09', 'periodo livre: mesmo tamanho, antes';

  -- ===================================================== B) situacao do boleto
  insert into boletos_historico (id_externo, cliente_id, tipo, vencimento_original, data_vencimento,
                                 valor, valor_pago, data_pagamento, situacao, status_origem) values
    ('h0', c1, 'MONTHLY_PAYMENT', current_date - 200, current_date - 200, 90, 90, current_date - 190, 'pago', 'SUCCEEDED'),
    ('h1', c1, 'MONTHLY_PAYMENT', current_date - 100, current_date - 100, 100, 100, current_date - 105, 'pago', 'SUCCEEDED'),
    ('h2', c1, 'MONTHLY_PAYMENT', current_date - 70,  current_date - 70,  150, 150, current_date - 30, 'pago', 'SUCCEEDED'),
    ('h3', c1, 'MONTHLY_PAYMENT', current_date - 40,  current_date - 40,  200, null, null, 'aberto', 'OVERDUE'),
    ('h4', c1, 'MONTHLY_PAYMENT', current_date + 20,  current_date + 20,  120, null, null, 'aberto', 'PENDING'),
    ('h5', c2, 'MONTHLY_PAYMENT', current_date - 40,  current_date - 40,  80,  null, null, 'aberto', 'OVERDUE'),
    ('h6', c3, 'MONTHLY_PAYMENT', current_date - 40,  current_date - 40,  90,  90, current_date - 41, 'pago', 'SUCCEEDED'),
    ('h9', c3, 'MONTHLY_PAYMENT', current_date - 40,  current_date - 40,  999, null, null, 'cancelado', 'CANCELED'),
    ('hh', c3, 'MONTHLY_PAYMENT', current_date,       current_date,       10,  null, null, 'aberto', 'PENDING');

  assert (select b.situacao from cobranca_boletos_base(null, null, null) b
            join boletos_historico h on h.id = b.boleto_id where h.id_externo = 'h1') = 'pago_no_prazo';
  assert (select b.situacao from cobranca_boletos_base(null, null, null) b
            join boletos_historico h on h.id = b.boleto_id where h.id_externo = 'h2') = 'pago_em_atraso';
  assert (select b.situacao from cobranca_boletos_base(null, null, null) b
            join boletos_historico h on h.id = b.boleto_id where h.id_externo = 'h3') = 'vencido';
  assert (select b.situacao from cobranca_boletos_base(null, null, null) b
            join boletos_historico h on h.id = b.boleto_id where h.id_externo = 'h4') = 'a_vencer',
    'REGRA ESSENCIAL: boleto que nao venceu nao e inadimplencia';
  assert (select b.situacao from cobranca_boletos_base(null, null, null) b
            join boletos_historico h on h.id = b.boleto_id where h.id_externo = 'hh') = 'vence_hoje';
  assert (select dias_atraso from cobranca_boletos_base(null, null, null) b
            join boletos_historico h on h.id = b.boleto_id where h.id_externo = 'h3') = 40;
  delete from boletos_historico where id_externo = 'hh';

  -- ===================================================== C) indicadores
  select * into rec from cobranca_indicadores(ini, fim, null) where recorte = 'atual';
  assert rec.boletos = 6, format('boletos (sem cancelado): %s', rec.boletos);
  assert rec.valor_emitido = 740, format('emitido: %s', rec.valor_emitido);
  assert rec.valor_venceram = 620, format('venceram: %s', rec.valor_venceram);
  assert rec.valor_aberto_vencido = 280, format('aberto vencido: %s', rec.valor_aberto_vencido);
  assert rec.valor_pago_no_prazo = 190 and rec.valor_pago_em_atraso = 150;
  assert rec.valor_a_vencer = 120;
  assert rec.clientes_venceram = 3 and rec.clientes_inadimplentes = 2;
  assert rec.primeiros_venceram = 2 and rec.primeiros_nao_pagos = 1,
    format('primeiro boleto: %s / %s', rec.primeiros_venceram, rec.primeiros_nao_pagos);
  assert rec.reincidentes = 1, 'cliente 1 ja atrasou antes do periodo';
  assert rec.regularizados = 1, 'cliente 1 pagou atrasado dentro do periodo';
  select count(*) into n from cobranca_indicadores(ini, fim, null);
  assert n = 5, 'atual + 3 anteriores + ano anterior';

  -- ===================================================== D) escopo
  perform definir_regionais_supervisor(u_sup, array[r1, r2]);
  assert (select count(*) from supervisor_regionais where usuario_id = u_sup) = 2;
  perform definir_regionais_supervisor(u_sup, array[r1, r2]);
  assert (select count(*) from supervisor_regionais where usuario_id = u_sup) = 2, 're-executavel';

  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  select boletos into n from cobranca_indicadores(ini, fim, null) where recorte = 'atual';
  assert n = 4, format('gestor ve so a unidade dele: %s', n);
  select boletos into n from cobranca_indicadores(ini, fim, r2) where recorte = 'atual';
  assert n = 0, 'gestor nao le a unidade vizinha pedindo o id dela';
  ok := false;
  begin
    perform definir_regionais_supervisor(u_sup, array[r1]);
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'so admin define as unidades do supervisor';
  ok := false;
  begin
    perform salvar_parametros_cobranca(1, 2);
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'gestor nao muda a meta';
  ok := false;
  begin
    perform * from cobranca_importar_historico_mutual(null, 10, true);
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'gestor nao importa historico';

  perform set_config('request.jwt.claim.sub', u_sup::text, false);
  select boletos into n from cobranca_indicadores(ini, fim, null) where recorte = 'atual';
  assert n = 5, format('supervisor ve as duas unidades: %s', n);

  perform set_config('request.jwt.claim.sub', u_cob::text, false);
  select boletos into n from cobranca_indicadores(ini, fim, null) where recorte = 'atual';
  assert n = 6, format('cobranca sem unidade ve o Brasil, matriz inclusive: %s', n);

  perform set_config('request.jwt.claim.sub', u_cob2::text, false);
  select boletos into n from cobranca_indicadores(ini, fim, null) where recorte = 'atual';
  assert n = 1, format('cobranca com unidade ve a dela: %s', n);

  perform set_config('request.jwt.claim.sub', u_con::text, false);
  select count(*) into n from cobranca_boletos_base(null, null, null);
  assert n = 0, 'consultor nao le a cobranca';
  select count(*) into n from cobranca_por_regional(ini, fim);
  assert n = 0;

  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- lista de detalhamento: total da janela
  select * into rec from cobranca_boletos_lista(ini, fim, null, array['vencido'], null, false, null, null, 1);
  assert rec.total_registros = 2 and rec.total_valor = 280, 'a lista traz quantidade e soma do filtro';
  select count(*) into n from cobranca_boletos_lista(ini, fim, null, array['vencido'], null, true, null, null, 100);
  assert n = 1, 'so o 1o boleto do cliente 2 e vencido entre os primeiros';

  -- ===================================================== E) data de corte
  -- O cliente 2 passa a ser cobrado pelo SCar a partir de hoje-10: o boleto
  -- do Mutual com vencimento depois disso sai da conta (seria a mesma competencia duas vezes).
  insert into boletos_historico (id_externo, cliente_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem)
    values ('h7', c2, 'MONTHLY_PAYMENT', current_date - 5, current_date - 5, 80, 'aberto', 'OVERDUE');
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status)
    values (c2, 50, current_date - 10, 'pendente') returning id into t;
  insert into faturas (cliente_id, regional_id, tipo_faturamento, competencia, valor_total, vencimento, titulo_id)
    values (c2, r2, 'AGRUPADO_ASSOCIADO', date_trunc('month', current_date - 10)::date, 50, current_date - 10, t);
  assert not exists (select 1 from cobranca_boletos_base(null, null, null) b
                       join boletos_historico h on h.id = b.boleto_id where h.id_externo = 'h7'),
    'boleto do Mutual depois do corte nao entra';
  assert exists (select 1 from cobranca_boletos_base(null, null, null) where boleto_id = t and origem = 'SCAR'
                   and situacao = 'vencido'), 'o titulo do SCar entra';
  assert exists (select 1 from cobranca_boletos_base(null, null, null) b
                   join boletos_historico h on h.id = b.boleto_id where h.id_externo = 'h5'),
    'o historico ANTES do corte continua';

  -- formula corrigida do resumo (0025): vencido / o que ja venceu
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status, data_pagamento, valor_pago)
    values (c2, 50, current_date - 20, 'pago', current_date - 20, 50) returning id into t;
  insert into faturas (cliente_id, regional_id, tipo_faturamento, competencia, valor_total, vencimento, titulo_id)
    values (c2, r2, 'AGRUPADO_ASSOCIADO', date_trunc('month', current_date - 50)::date, 50, current_date - 20, t);
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status)
    values (c2, 100, current_date + 15, 'pendente') returning id into t;
  insert into faturas (cliente_id, regional_id, tipo_faturamento, competencia, valor_total, vencimento, titulo_id)
    values (c2, r2, 'AGRUPADO_ASSOCIADO', date_trunc('month', current_date + 40)::date, 100, current_date + 15, t);
  select * into rec from resumo_cobrancas(current_date - 30, current_date + 30, r2);
  assert rec.inadimplencia_pct = 50, format('vencido / ja vencido = 50%%, veio %s', rec.inadimplencia_pct);

  -- ===================================================== F) importacao do Mutual
  insert into mutual_captura (entidade, id_externo, payload) values
    ('CONTRACT', '501', '{"id":501,"person_id":"9001"}'),
    ('CONTRACT_OBJECT', '7001', '{"id":7001,"contract_id":"501"}'),
    ('INVOICE', 'A1', '{"id":"A1","contract_id":"501","invoice_type":"MONTHLY_PAYMENT","invoice_status":"SUCCEEDED","original_expiration_date":"2026-08-05","expiration_date":"2026-08-05","payment_date":"2026-08-04","amount":100,"paid_amount":100,"reference_year":2026,"reference_month":7}'),
    ('INVOICE', 'A2', '{"id":"A2","contract_id":"501","invoice_type":"MONTHLY_PAYMENT","invoice_status":"OVERDUE","original_expiration_date":"2026-09-05","expiration_date":"2026-09-08","amount":120,"paid_amount":0,"in_serasa":true}'),
    ('INVOICE', 'A3', '{"id":"A3","contract_id":"501","invoice_type":"ACCESSION","invoice_status":"SUCCEEDED","expiration_date":"2026-08-05","amount":300}'),
    ('INVOICE', 'A4', '{"id":"A4","contract_id":"999","invoice_type":"MONTHLY_PAYMENT","invoice_status":"PENDING","expiration_date":"2026-08-05","amount":50}'),
    ('INVOICE', 'A5', '{"id":"A5","contract_id":"501","invoice_type":"MONTHLY_PAYMENT","invoice_status":"XPTO","expiration_date":"2026-08-05","amount":50}');
  insert into integracao_vinculos (entidade, id_externo, tabela, registro_id) values
    ('PERSON', '9001', 'clientes', c4),
    ('CONTRACT_OBJECT', '7001', 'veiculos', v4);

  select * into rec from cobranca_importar_historico_mutual(null, 100, false);
  assert rec.lidos = 5 and rec.mensalidades = 4 and rec.sem_associado = 1 and rec.status_desconhecido = 1,
    format('simulacao: %s', row_to_json(rec));
  assert rec.gravados = 0 and rec.fim;
  assert not exists (select 1 from boletos_historico where cliente_id = c4), 'simular nao grava';

  -- em blocos de 3: o cursor anda e termina
  select * into rec from cobranca_importar_historico_mutual(null, 3, true);
  assert rec.lidos = 3 and not rec.fim and rec.proximo_cursor = 'A3', format('bloco 1: %s', row_to_json(rec));
  assert rec.gravados = 2;
  select * into rec from cobranca_importar_historico_mutual(rec.proximo_cursor, 3, true);
  assert rec.lidos = 2 and rec.fim and rec.gravados = 0, format('bloco 2: %s', row_to_json(rec));

  assert (select count(*) from boletos_historico where cliente_id = c4) = 2, 'so mensalidade de associado carregado';
  select * into rec from boletos_historico where id_externo = 'A1';
  assert rec.veiculo_id = v4, 'contrato de um veiculo so liga o veiculo';
  assert rec.vencimento_original = date '2026-08-05' and rec.data_pagamento = date '2026-08-04';
  assert rec.competencia = date '2026-07-01';
  select * into rec from boletos_historico where id_externo = 'A2';
  assert rec.vencimento_original = date '2026-09-05' and rec.data_vencimento = date '2026-09-08',
    'o ciclo usa o vencimento ORIGINAL; o prazo, o prorrogado';
  assert rec.situacao = 'aberto' and rec.em_serasa and rec.valor_pago is null;

  select * into rec from cobranca_importar_historico_mutual(null, 100, true);
  assert rec.gravados = 0, 'reimportar sem mudanca nao regrava nada';
  update mutual_captura set payload = payload || '{"invoice_status":"SUCCEEDED","payment_date":"2026-09-10","paid_amount":120}'
   where entidade = 'INVOICE' and id_externo = 'A2';
  select * into rec from cobranca_importar_historico_mutual(null, 100, true);
  assert rec.gravados = 1, 'so a linha que mudou';
  assert (select situacao from boletos_historico where id_externo = 'A2') = 'pago';
  assert (select b.situacao from cobranca_boletos_base(null, null, r3) b
            join boletos_historico h on h.id = b.boleto_id where h.id_externo = 'A2') = 'pago_em_atraso',
    'pago 10/09 depois do prazo de 08/09';

  -- calendario por ciclo
  select * into rec from cobranca_calendario(date '2026-08-15', r3) where ciclo = 5;
  assert rec.boletos = 1 and rec.valor_pago_no_prazo = 100 and rec.data_ciclo = date '2026-08-05',
    format('ciclo 5 de agosto: %s', row_to_json(rec));
  select * into rec from cobranca_calendario(date '2026-02-01', r3) where ciclo = 30;
  assert rec.data_ciclo = date '2026-02-28', 'ciclo 30 em fevereiro e o ultimo dia';
  select count(*) into n from cobranca_calendario(date '2026-08-15', r3);
  assert n = 6, 'sempre os seis ciclos';

  select * into rec from cobranca_historico_resumo();
  assert rec.boletos >= 2 and rec.boletos_capturados = 5;

  -- parametros
  insert into empresa (razao_social) select 'SMART CAR BRASIL' where not exists (select 1 from empresa);
  perform salvar_parametros_cobranca(4, 8);
  select * into rec from cobranca_parametros();
  assert rec.meta = 4 and rec.limite = 8;
  ok := false;
  begin
    perform salvar_parametros_cobranca(9, 8);
  exception when check_violation then ok := true;
  end;
  assert ok, 'meta acima do limite e recusada';

  -- a operacao nao foi tocada pela importacao
  assert (select count(*) from titulos_financeiros where cliente_id = c4) = 0,
    'historico NAO vira titulo (DRE e trava da 24h intactos)';

  raise notice '=== TESTES 0097 (cobranca: painel, perfis e historico) PASSARAM ===';
end $$;
