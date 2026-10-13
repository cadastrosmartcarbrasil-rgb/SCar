-- Teste funcional da COBRANCA, FASE 2 (0098): a fila, o historico de
-- contatos imutavel, as promessas/acordos (situacao calculada pelos
-- pagamentos), o cancelamento e o escopo.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  r1 uuid; r2 uuid; tv uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; c6 uuid;
  ct uuid; ac uuid; a5 uuid; a6 uuid;
  rec record; n bigint; ok boolean;
begin
  -- ===================================================== setup
  insert into auth.users (id, email) values
    (u_adm,'adm98@t.com'), (u_ges,'ges98@t.com'), (u_con,'con98@t.com');
  insert into regionais (nome) values ('Unidade 1') returning id into r1;
  insert into regionais (nome) values ('Unidade 2') returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm98@t.com','admin', null),
    (u_ges,'Gestor 1','ges98@t.com','gestor_regional', r1),
    (u_con,'Consultor','con98@t.com','consultor_vendas', r1);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, celular)
    values ('PF','JOÃO DEVEDOR','52998224725', r1, '65999990001') returning id into c1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','MARIA RETORNO','11144477735', r1) returning id into c2;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','PEDRO VIZINHO','15350946056', r2) returning id into c3;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','ANA INATIVA','39053344705', r1) returning id into c4;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','CARLOS QUEBROU','12345678909', r1) returning id into c5;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','LUCIA ACORDO','98765432100', r1) returning id into c6;

  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa) values
    (c1,'AAA1A11', r1, tv, 'ativo', current_date - 400, 100, true),
    (c2,'BBB2B22', r1, tv, 'ativo', current_date - 400, 100, true),
    (c3,'CCC3C33', r2, tv, 'inadimplente', current_date - 400, 100, true),
    (c4,'DDD4D44', r1, tv, 'inativo', current_date - 400, 100, true),
    (c5,'EEE5E55', r1, tv, 'ativo', current_date - 400, 100, true),
    (c6,'FFF6F66', r1, tv, 'ativo', current_date - 400, 100, true);

  insert into boletos_historico (id_externo, cliente_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem) values
    ('f1a', c1, 'MONTHLY_PAYMENT', current_date - 40, current_date - 40, 100, 'aberto', 'OVERDUE'),
    ('f1b', c1, 'MONTHLY_PAYMENT', current_date - 20, current_date - 20, 150, 'aberto', 'OVERDUE'),
    ('f2',  c2, 'MONTHLY_PAYMENT', current_date - 20, current_date - 20, 80,  'aberto', 'OVERDUE'),
    ('f3',  c3, 'MONTHLY_PAYMENT', current_date - 40, current_date - 40, 50,  'aberto', 'OVERDUE'),
    ('f4',  c4, 'MONTHLY_PAYMENT', current_date - 40, current_date - 40, 70,  'aberto', 'OVERDUE'),
    ('f5',  c5, 'MONTHLY_PAYMENT', current_date - 40, current_date - 40, 90,  'aberto', 'OVERDUE'),
    ('f6a', c6, 'MONTHLY_PAYMENT', current_date - 40, current_date - 40, 100, 'aberto', 'OVERDUE'),
    ('f6b', c6, 'MONTHLY_PAYMENT', current_date - 30, current_date - 30, 100, 'aberto', 'OVERDUE');

  -- ===================================================== A) faixa
  assert cobranca_faixa_atraso(0) is null and cobranca_faixa_atraso(null) is null;
  assert cobranca_faixa_atraso(1) = 'D01_05' and cobranca_faixa_atraso(5) = 'D01_05';
  assert cobranca_faixa_atraso(6) = 'D06_10' and cobranca_faixa_atraso(15) = 'D11_15';
  assert cobranca_faixa_atraso(30) = 'D16_30' and cobranca_faixa_atraso(31) = 'D31_60';
  assert cobranca_faixa_atraso(90) = 'D61_90' and cobranca_faixa_atraso(91) = 'D90_MAIS';

  -- ===================================================== B) a fila sem contato
  select count(*) into n from cobranca_fila_base(null);
  assert n = 5, format('so associados com veiculo ativo/inadimplente entram: %s', n);
  assert not exists (select 1 from cobranca_fila_base(null) where cliente_id = c4), 'veiculo inativo fica fora';
  select * into rec from cobranca_fila_base(null) where cliente_id = c1;
  assert rec.boletos_vencidos = 2 and rec.valor_vencido = 250 and rec.dias_atraso = 40,
    format('divida do c1: %s', row_to_json(rec));
  assert rec.faixa = 'D31_60' and rec.vencido_desde = current_date - 40;
  assert rec.situacao_fila = 'sem_contato' and rec.prioridade = 4 and rec.contatos = 0;
  assert rec.placas = 'AAA1A11' and rec.regional = 'Unidade 1';

  -- ===================================================== C) contato e imutabilidade
  ct := registrar_contato_cobranca(c2, 'LIGACAO', 'FALOU', 'vai ver com o banco', current_date, 'ligar de novo');
  select * into rec from cobranca_fila_base(null) where cliente_id = c2;
  assert rec.situacao_fila = 'retorno_hoje' and rec.prioridade = 3, format('c2: %s', rec.situacao_fila);
  assert rec.ultimo_canal = 'LIGACAO' and rec.ultimo_usuario = 'Admin' and rec.contatos = 1;
  select * into rec from cobranca_contatos where id = ct;
  assert rec.boletos_vencidos = 1 and rec.valor_vencido = 80 and rec.dias_atraso = 20 and rec.usuario_id = u_adm,
    'o contato guarda o retrato da divida';

  ok := false;
  begin update cobranca_contatos set observacao = 'x' where id = ct;
  exception when check_violation then ok := true; end;
  assert ok, 'contato nao se edita';
  ok := false;
  begin delete from cobranca_contatos where id = ct;
  exception when check_violation then ok := true; end;
  assert ok, 'contato nao se apaga';

  -- sem data de retorno: volta sozinho em 2 dias
  perform registrar_contato_cobranca(c3, 'WHATSAPP', 'RECADO');
  select * into rec from cobranca_fila_base(null) where cliente_id = c3;
  assert rec.situacao_fila = 'aguardando' and rec.retorno_em = current_date + 2, format('c3: %s', row_to_json(rec));

  -- validacoes
  ok := false;
  begin perform registrar_contato_cobranca(c1, 'POMBO', 'FALOU');
  exception when check_violation then ok := true; end;
  assert ok, 'canal invalido';
  ok := false;
  begin perform registrar_contato_cobranca(c1, 'LIGACAO', 'XPTO');
  exception when check_violation then ok := true; end;
  assert ok, 'resultado invalido';
  ok := false;
  begin perform registrar_contato_cobranca(c1, 'LIGACAO', 'FALOU', null, current_date - 1);
  exception when check_violation then ok := true; end;
  assert ok, 'proxima acao no passado';
  ok := false;
  begin perform registrar_contato_cobranca(c1, 'LIGACAO', 'PROMETEU');
  exception when check_violation then ok := true; end;
  assert ok, 'prometeu sem promessa';
  ok := false;
  begin perform registrar_contato_cobranca(c1, 'LIGACAO', 'FALOU', null, null, null,
          jsonb_build_object('tipo','PROMESSA','parcelas', jsonb_build_array(
            jsonb_build_object('vencimento', current_date, 'valor', 250))));
  exception when check_violation then ok := true; end;
  assert ok, 'promessa so com resultado PROMETEU';
  ok := false;
  begin perform registrar_contato_cobranca(c1, 'LIGACAO', 'PROMETEU', null, null, null,
          jsonb_build_object('tipo','PROMESSA','parcelas', jsonb_build_array(
            jsonb_build_object('vencimento', current_date, 'valor', 100),
            jsonb_build_object('vencimento', current_date + 10, 'valor', 150))));
  exception when check_violation then ok := true; end;
  assert ok, 'promessa tem uma parcela so';
  ok := false;
  begin perform registrar_contato_cobranca(c1, 'LIGACAO', 'PROMETEU', null, null, null,
          jsonb_build_object('tipo','ACORDO','parcelas', jsonb_build_array(
            jsonb_build_object('vencimento', current_date, 'valor', 250))));
  exception when check_violation then ok := true; end;
  assert ok, 'acordo tem 2 ou mais parcelas';
  ok := false;
  begin perform registrar_contato_cobranca(c1, 'LIGACAO', 'PROMETEU', null, null, null,
          jsonb_build_object('tipo','ACORDO','parcelas', jsonb_build_array(
            jsonb_build_object('vencimento', current_date + 10, 'valor', 100),
            jsonb_build_object('vencimento', current_date + 10, 'valor', 150))));
  exception when check_violation then ok := true; end;
  assert ok, 'datas em ordem crescente';
  ok := false;
  begin perform registrar_contato_cobranca(c1, 'LIGACAO', 'PROMETEU', null, null, null,
          jsonb_build_object('tipo','PROMESSA','parcelas', jsonb_build_array(
            jsonb_build_object('vencimento', current_date - 1, 'valor', 250))));
  exception when check_violation then ok := true; end;
  assert ok, 'parcela no passado';
  ok := false;
  begin perform registrar_contato_cobranca(c1, 'LIGACAO', 'PROMETEU', null, null, null,
          jsonb_build_object('tipo','PROMESSA','parcelas', jsonb_build_array(
            jsonb_build_object('vencimento', current_date, 'valor', 0))));
  exception when check_violation then ok := true; end;
  assert ok, 'valor positivo';
  assert not exists (select 1 from cobranca_contatos where cliente_id = c1), 'recusa nao grava contato pela metade';

  -- ===================================================== D) promessa cumprida
  ct := registrar_contato_cobranca(c1, 'WHATSAPP', 'PROMETEU', 'paga hoje no pix', null, null,
          jsonb_build_object('tipo','PROMESSA','observacao','pix','parcelas', jsonb_build_array(
            jsonb_build_object('vencimento', current_date, 'valor', 250))));
  select * into rec from cobranca_acordos_situacao(null, c1);
  ac := rec.acordo_id;
  assert rec.status = 'EM_ANDAMENTO' and rec.valor_total = 250 and rec.divida_na_data = 250
     and rec.proxima_parcela_em = current_date and rec.proxima_parcela_valor = 250, format('c1: %s', row_to_json(rec));
  assert (select acordo_id from cobranca_contatos_cliente(c1) limit 1) = ac, 'o contato aponta a promessa';
  select * into rec from cobranca_fila_base(null) where cliente_id = c1;
  assert rec.situacao_fila = 'promessa_em_dia' and rec.prioridade = 6 and rec.acordo_id = ac;
  ok := false;
  begin perform registrar_contato_cobranca(c1, 'LIGACAO', 'PROMETEU', null, null, null,
          jsonb_build_object('tipo','PROMESSA','parcelas', jsonb_build_array(
            jsonb_build_object('vencimento', current_date + 5, 'valor', 250))));
  exception when unique_violation then ok := true; end;
  assert ok, 'uma promessa em andamento por vez';

  update boletos_historico set situacao = 'pago', valor_pago = valor, data_pagamento = current_date
   where id_externo in ('f1a', 'f1b');
  select * into rec from cobranca_acordos_situacao(null, c1);
  assert rec.status = 'CUMPRIDO' and rec.valor_pago = 250, format('c1 pago: %s', row_to_json(rec));
  assert not exists (select 1 from cobranca_fila_base(null) where cliente_id = c1), 'quem pagou sai da fila';

  -- ===================================================== E) promessa quebrada
  -- (entra direto na tabela: a RPC nao aceita data passada, e o teste precisa de uma)
  insert into cobranca_acordos (cliente_id, regional_id, tipo, data_base, valor_total)
    values (c5, r1, 'PROMESSA', current_date - 10, 90) returning id into a5;
  insert into cobranca_acordo_parcelas values (a5, 1, current_date - 5, 90);
  select * into rec from cobranca_acordos_situacao(null, c5);
  assert rec.status = 'QUEBRADO' and rec.quebra_em = current_date - 1, format('c5: %s', row_to_json(rec));
  select * into rec from cobranca_fila_base(null) where cliente_id = c5;
  assert rec.situacao_fila = 'promessa_quebrada' and rec.prioridade = 1, format('c5 fila: %s', rec.situacao_fila);
  -- contato depois da quebra tira do topo
  perform registrar_contato_cobranca(c5, 'LIGACAO', 'NAO_ATENDEU', null, current_date + 1);
  select * into rec from cobranca_fila_base(null) where cliente_id = c5;
  assert rec.situacao_fila = 'aguardando', format('c5 depois do contato: %s', rec.situacao_fila);

  -- aguardando a baixa do banco (venceu ha 2 dias)
  insert into cobranca_acordos (cliente_id, regional_id, tipo, data_base, valor_total)
    values (c2, r1, 'PROMESSA', current_date - 10, 80) returning id into ac;
  insert into cobranca_acordo_parcelas values (ac, 1, current_date - 2, 80);
  select * into rec from cobranca_acordos_situacao(null, c2);
  assert rec.status = 'EM_ANDAMENTO' and rec.parcelas->0->>'situacao' = 'aguardando_baixa',
    format('c2: %s', row_to_json(rec));

  -- ===================================================== F) acordo parcelado
  insert into cobranca_acordos (cliente_id, regional_id, tipo, data_base, valor_total)
    values (c6, r1, 'ACORDO', current_date - 25, 200) returning id into a6;
  insert into cobranca_acordo_parcelas values (a6, 1, current_date - 20, 100), (a6, 2, current_date + 10, 100);
  update boletos_historico set situacao = 'pago', valor_pago = 100, data_pagamento = current_date - 22
   where id_externo = 'f6a';
  -- mensalidade NOVA paga nao conta para a promessa
  insert into boletos_historico (id_externo, cliente_id, tipo, vencimento_original, data_vencimento,
                                 valor, valor_pago, data_pagamento, situacao, status_origem)
    values ('f6c', c6, 'MONTHLY_PAYMENT', current_date - 10, current_date - 10, 100, 100, current_date - 9, 'pago', 'SUCCEEDED');
  select * into rec from cobranca_acordos_situacao(null, c6);
  assert rec.status = 'EM_ANDAMENTO' and rec.valor_pago = 100, format('c6: %s', row_to_json(rec));
  assert rec.parcelas->0->>'situacao' = 'cumprida' and rec.parcelas->1->>'situacao' = 'a_vencer';
  assert rec.proxima_parcela_em = current_date + 10 and rec.proxima_parcela_valor = 100;

  -- ===================================================== G) cancelamento
  ok := false;
  begin perform cancelar_acordo_cobranca(a5, 'x');
  exception when check_violation then ok := true; end;
  assert ok, 'cancelar exige motivo';
  perform cancelar_acordo_cobranca(a5, 'associado contestou o valor');
  select * into rec from cobranca_acordos_situacao(null, c5);
  assert rec.status = 'CANCELADO' and rec.motivo_cancelamento = 'associado contestou o valor';
  ok := false;
  begin perform cancelar_acordo_cobranca(a5, 'de novo, de novo');
  exception when check_violation then ok := true; end;
  assert ok, 'cancela uma vez so';
  ok := false;
  begin update cobranca_acordos set valor_total = 1 where id = a6;
  exception when check_violation then ok := true; end;
  assert ok, 'acordo nao se edita';
  ok := false;
  begin delete from cobranca_acordos where id = a6;
  exception when check_violation then ok := true; end;
  assert ok, 'acordo nao se apaga';
  ok := false;
  begin update cobranca_acordo_parcelas set valor = 1 where acordo_id = a6;
  exception when check_violation then ok := true; end;
  assert ok, 'parcela nao se edita';

  -- ===================================================== H) resumo e taxa
  select * into rec from cobranca_promessas_resumo(current_date - 60, current_date, null);
  assert rec.feitas = 4 and rec.cumpridas = 1 and rec.quebradas = 0 and rec.em_andamento = 2 and rec.canceladas = 1,
    format('resumo: %s', row_to_json(rec));
  assert rec.valor_prometido = 530 and rec.valor_recuperado = 350, format('valores: %s', row_to_json(rec));

  -- ===================================================== I) fila paginada e busca
  select * into rec from cobranca_fila(null, null, null, null, 1, 0);
  assert rec.total_registros = 4, format('total: %s', rec.total_registros);
  select count(*) into n from cobranca_fila(null, null, null, 'joao', 100, 0);
  assert n = 0, 'c1 ja saiu (pagou)';
  select count(*) into n from cobranca_fila(null, null, null, 'maría', 100, 0);
  assert n = 1, 'busca sem acento';
  select count(*) into n from cobranca_fila(null, null, null, '153.509', 100, 0);
  assert n = 1, 'busca por CPF';
  select count(*) into n from cobranca_fila(null, null, null, 'fff-6f66', 100, 0);
  assert n = 1, 'busca por placa';
  select count(*) into n from cobranca_fila(null, 'aguardando', null, null, 100, 0);
  assert n = 2, 'filtro por situacao (c3 e c5)';
  select count(*) into n from cobranca_fila(null, null, 'D16_30', null, 100, 0);
  assert n = 2, 'filtro por faixa (c2 com 20 dias e c6 com 30)';
  select sum(clientes) into n from cobranca_fila_resumo(null) where grupo = 'situacao';
  assert n = 4;

  -- ===================================================== J) escopo
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  assert not exists (select 1 from cobranca_fila_base(null) where cliente_id = c3), 'gestor nao ve a vizinha';
  select count(*) into n from cobranca_fila_base(r2);
  assert n = 0, 'pedir o id da vizinha nao adianta';
  select count(*) into n from cobranca_contatos_cliente(c3);
  assert n = 0;
  ok := false;
  begin perform registrar_contato_cobranca(c3, 'LIGACAO', 'FALOU');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'gestor nao registra contato fora do escopo';
  perform registrar_contato_cobranca(c6, 'LIGACAO', 'FALOU');

  perform set_config('request.jwt.claim.sub', u_con::text, false);
  select count(*) into n from cobranca_fila_base(null);
  assert n = 0, 'consultor nao le a fila';
  ok := false;
  begin perform registrar_contato_cobranca(c6, 'LIGACAO', 'FALOU');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'consultor nao registra contato de cobranca';

  raise notice '=== TESTES 0098 (cobranca: fila, contatos e promessas) PASSARAM ===';
end $$;
