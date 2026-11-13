-- Teste da 0168: e-mails de cobranca (fila, regua, supressao, eventos).
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; cli uuid; cli_ruim uuid; cli_sup uuid;
  t_d5 uuid; t_d1 uuid; t_d0 uuid; t_atraso uuid; t_pago uuid; t_sem_linha uuid; t_sup uuid;
  res jsonb; n int; rec record; v text;
  ids uuid[];
  hoje date := date '2026-11-11';            -- quarta-feira
  meio_dia timestamptz := timestamptz '2026-11-11 12:00:00-03';
begin
  insert into auth.users (id, email) values (u_adm, 'adm166@t.com');
  insert into regionais (nome) values ('EMAIL UNIDADE') returning id into r1;
  insert into usuarios (id, nome, email, papel) values (u_adm, 'ADMIN 166', 'adm166@t.com', 'admin');

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, email)
    values ('PF', 'MARIA EMAIL', '52998224725', r1, ' Maria@Exemplo.com.br ') returning id into cli;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, email)
    values ('PF', 'JOAO SEM EMAIL', '11144477735', r1, 'joao-sem-arroba') returning id into cli_ruim;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, email)
    values ('PF', 'ANA SUPRIMIDA', '39053344705', r1, 'ana@exemplo.com') returning id into cli_sup;

  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status, linha_digitavel)
    values (cli, 100, date '2026-11-16', 'pendente', '74891') returning id into t_d5;
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status, linha_digitavel)
    values (cli, 101, date '2026-11-12', 'pendente', '74892') returning id into t_d1;
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status, linha_digitavel)
    values (cli, 102, hoje, 'pendente', '74893') returning id into t_d0;
  -- vence segunda 09/11; +2 dias = 11/11
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status, linha_digitavel)
    values (cli, 103, date '2026-11-09', 'vencido', '74894') returning id into t_atraso;
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status, linha_digitavel)
    values (cli, 104, date '2026-11-12', 'pago', '74895') returning id into t_pago;
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status)
    values (cli, 105, date '2026-11-12', 'pendente') returning id into t_sem_linha;
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status, linha_digitavel)
    values (cli_ruim, 106, date '2026-11-12', 'pendente', '74896');
  insert into titulos_financeiros (cliente_id, valor, data_vencimento, status, linha_digitavel)
    values (cli_sup, 107, date '2026-11-12', 'pendente', '74897') returning id into t_sup;
  insert into email_supressoes (email, motivo) values ('ana@exemplo.com', 'manual');

  -- helpers
  assert email_normalizado('  A@B.COM ') = 'a@b.com';
  assert email_valido('a.b+c@d.com.br') and not email_valido('sem-arroba') and not email_valido(null);
  assert email_data_alvo(date '2026-11-16', -5) = date '2026-11-11';
  assert email_data_alvo(date '2026-11-14', 2) = date '2026-11-18', 'atraso conta do dia util (sab 14 -> seg 16 + 2)';

  -- ============================================================ enfileirar
  res := enfileirar_avisos_cobranca(hoje);
  assert (res->>'criados')::int = 4, 'criados 4 (d5, d1, d0, atraso), veio ' || res;
  assert (res->>'suprimidos')::int = 1, 'suprimido 1, veio ' || res;
  assert (res->>'sem_email')::int = 1, 'sem email 1, veio ' || res;
  select count(*) into n from email_outbox where titulo_id in (t_pago, t_sem_linha);
  assert n = 0, 'pago e sem linha nao entram';
  select regua_codigo into v from email_outbox where titulo_id = t_atraso;
  assert v = 'atraso_d_mais_2', 'atraso pelo dia util, veio ' || coalesce(v, 'null');
  select destinatario into v from email_outbox where titulo_id = t_d5;
  assert v = 'maria@exemplo.com.br', 'destinatario normalizado';
  select status into v from email_outbox where titulo_id = t_sup;
  assert v = 'suprimido';

  res := enfileirar_avisos_cobranca(hoje);
  assert (res->>'criados')::int = 0, 'idempotente, veio ' || res;
  select count(*) into n from email_outbox;
  assert n = 5, 'nada duplicado, veio ' || n;
  raise notice 'OK enfileirar (regua, idempotencia, supressao, sem e-mail)';

  -- domingo nao enfileira
  res := enfileirar_avisos_cobranca(date '2026-11-15');
  assert (res->>'domingo')::boolean and (res->>'criados')::int = 0, 'domingo pulado';
  -- (o domingo expira os pendentes de 11/11; recoloca para seguir o teste)
  update email_outbox set status = 'pendente', motivo = null where status = 'expirado';

  -- regua desativada nao gera
  update email_regua set ativo = false where codigo = 'aviso_d_menos_5';
  delete from email_outbox where titulo_id = t_d5;
  res := enfileirar_avisos_cobranca(hoje);
  select count(*) into n from email_outbox where titulo_id = t_d5;
  assert n = 0, 'regua inativa nao gera';
  update email_regua set ativo = true where codigo = 'aviso_d_menos_5';
  res := enfileirar_avisos_cobranca(hoje);

  -- ============================================================ boleto pago cancela
  update titulos_financeiros set status = 'pago', data_pagamento = hoje, valor_pago = 101 where id = t_d1;
  select status, motivo into rec from email_outbox where titulo_id = t_d1;
  assert rec.status = 'cancelado' and rec.motivo = 'boleto pago', 'pago cancela o aviso';
  raise notice 'OK pagamento cancela o aviso pendente';

  -- ============================================================ reservar
  -- O teste simula o relogio (meio_dia de 11/11), mas a fila nasce com
  -- proxima_tentativa_em = now() (relogio REAL). Sem ancorar, depois de 11/11 12h
  -- nada fica "pronto" no instante simulado e o lote volta vazio. Ancora a fila
  -- como se a rotina tivesse enfileirado as 06h do dia simulado.
  update email_outbox set proxima_tentativa_em = timestamptz '2026-11-11 06:00:00-03'
   where status = 'pendente';

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  begin
    perform * from reservar_lote_email(10, meio_dia);
    assert false, 'com sessao recusa';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', '', false);

  select count(*) into n from reservar_lote_email(10, timestamptz '2026-11-11 07:00:00-03');
  assert n = 0, 'fora da janela nao reserva';
  update email_config set pausado = true;
  select count(*) into n from reservar_lote_email(10, meio_dia);
  assert n = 0, 'pausado nao reserva';
  update email_config set pausado = false;

  select array_agg(id) into ids from reservar_lote_email(2, meio_dia);
  assert array_length(ids, 1) = 2, 'lote de 2';
  select count(*) into n from reservar_lote_email(10, meio_dia);
  assert n = 1, 'o segundo lote nao pega o que ja foi reservado, veio ' || n;
  select count(*) into n from email_outbox where status = 'enviando';
  assert n = 3;
  select tentativas into n from email_outbox where id = ids[1];
  assert n = 1;
  raise notice 'OK reserva (janela, pausa, lote sem repetir)';

  -- ============================================================ concluir + eventos
  perform concluir_envio_email(ids[1], 'enviado', 'msg-1', null, null, 'Assunto 1');
  perform concluir_envio_email(ids[2], 'pendente', null, 'HTTP 500', meio_dia + interval '1 minute');
  select status, erro into rec from email_outbox where id = ids[2];
  assert rec.status = 'pendente' and rec.erro = 'HTTP 500';
  select count(*) into n from reservar_lote_email(10, meio_dia);
  assert n = 0, 'backoff respeitado';

  v := registrar_evento_email('resend', 'ev-1', 'entregue', 'msg-1', null, null, true, meio_dia);
  assert v = 'OK';
  select status into v from email_outbox where id = ids[1];
  assert v = 'entregue';
  v := registrar_evento_email('resend', 'ev-1', 'entregue', 'msg-1');
  assert v = 'DUPLICADO';
  select count(*) into n from email_eventos;
  assert n = 1, 'evento repetido nao duplica';

  -- bounce temporario so registra
  v := registrar_evento_email('resend', 'ev-2', 'bounce', 'msg-1', 'maria@exemplo.com.br', 'Transient', false);
  select count(*) into n from email_supressoes where email = 'maria@exemplo.com.br';
  assert n = 0, 'bounce temporario nao suprime';

  -- bounce permanente suprime e derruba o pendente do mesmo endereco
  v := registrar_evento_email('resend', 'ev-3', 'bounce', 'msg-1', 'maria@exemplo.com.br', 'Permanent', true);
  select count(*) into n from email_supressoes where email = 'maria@exemplo.com.br' and ativo and motivo = 'bounce_permanente';
  assert n = 1, 'bounce permanente suprime';
  select count(*) into n from email_outbox where destinatario = 'maria@exemplo.com.br' and status = 'pendente';
  assert n = 0, 'pendentes do endereco viram suprimido';
  raise notice 'OK eventos (entregue, duplicado, bounce temporario e permanente)';

  -- reclamacao
  insert into email_outbox (titulo_id, cliente_id, regua_codigo, template, destinatario, data_alvo, status, message_id)
    values (t_sup, cli_sup, 'vencimento_d0', 'vence_hoje', 'outro@exemplo.com', hoje, 'enviado', 'msg-9');
  v := registrar_evento_email('resend', 'ev-4', 'reclamacao', 'msg-9');
  select count(*) into n from email_supressoes where email = 'outro@exemplo.com' and motivo = 'reclamacao';
  assert n = 1, 'reclamacao suprime pelo destinatario do item';

  -- ============================================================ acoes da matriz
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into rec from email_supressoes where email = 'maria@exemplo.com.br' and ativo;
  begin
    perform liberar_supressao_email(rec.id, 'x');
    assert false, 'motivo curto recusa';
  exception when others then null;
  end;
  perform liberar_supressao_email(rec.id, 'associado corrigiu o e-mail');
  assert not email_suprimido('maria@exemplo.com.br');
  perform suprimir_email_manual('Pedro@Exemplo.com', 'pediu por telefone');
  assert email_suprimido('pedro@exemplo.com');
  res := email_painel_resumo(7);
  assert (res->>'entregues')::int = 0 and (res->>'bounces')::int = 1, 'resumo, veio ' || res;
  perform set_config('request.jwt.claim.sub', '', false);

  -- ============================================================ RLS: associado nao le
  declare u_assoc uuid := gen_random_uuid();
  begin
    insert into auth.users (id, email) values (u_assoc, 'assoc166@t.com');
    perform set_config('request.jwt.claim.sub', u_assoc::text, false);
    execute 'set local role authenticated';
    select count(*) into n from email_outbox;
    execute 'reset role';
    assert n = 0, 'associado nao le a fila, veio ' || n;
    assert email_painel_resumo(7) is null;
    perform set_config('request.jwt.claim.sub', '', false);
  end;

  -- expira o que nao saiu no dia
  res := enfileirar_avisos_cobranca(date '2026-11-12');
  select count(*) into n from email_outbox where data_alvo = hoje and status = 'pendente';
  assert n = 0, 'pendente de ontem expira';

  raise notice '=== TESTES 0168 EMAIL COBRANCA PASSARAM ===';
end;
$$;
