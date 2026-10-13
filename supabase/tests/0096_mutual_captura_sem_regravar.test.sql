-- Teste funcional da 0096 — a recaptura do Mutual nao regrava o que nao mudou.
-- Prova: (1) recaptura IDENTICA nao escreve a linha (o ctid nao muda — uma
-- regravacao cria versao nova com outro ctid, que e exatamente a versao morta
-- que inchou a tabela em producao); (2) payload diferente, deletado diferente e
-- uuid novo continuam sendo gravados; (3) recaptura parcial sem uuid segue sem
-- apagar o uuid ja guardado (regra da 0062); (4) o retorno continua sendo
-- quantos registros a chamada RECEBEU; (5) o resumo pega a ultima sincronizacao
-- concluida quando o conteudo nao mudou; (6) a limpeza automatica da tabela
-- ficou em 2%.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  n int;
  c1 tid; c2 tid;
  v_uuid uuid := gen_random_uuid();
  v_txt text;
  v_ultima timestamptz;
begin
  insert into auth.users (id, email) values (u_adm,'adm96@t.com');
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm96@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','9601','uuid', v_uuid::text,'status','ATIVO','final_total_value','100.00'),
    jsonb_build_object('id','9602','status','ATIVO','final_total_value','200.00')
  )) into n;
  assert n = 2, format('primeira captura devolve 2, veio %s', n);

  -- (1) identica: nao regrava. Ordem de chave diferente e o MESMO jsonb.
  select ctid into c1 from mutual_captura where entidade='CONTRACT_OBJECT' and id_externo='9602';
  select mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('final_total_value','200.00','status','ATIVO','id','9602')
  )) into n;
  assert n = 1, format('(4) o retorno e o que foi RECEBIDO, mesmo sem regravar; veio %s', n);
  select ctid into c2 from mutual_captura where entidade='CONTRACT_OBJECT' and id_externo='9602';
  assert c1 = c2, format('(1) recaptura identica NAO pode regravar a linha (%s -> %s)', c1, c2);
  raise notice 'OK recaptura identica nao gera versao nova';

  -- (2a) payload diferente: grava.
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','9602','status','SUSPENSO','final_total_value','200.00')));
  select payload->>'status', ctid into v_txt, c2 from mutual_captura
   where entidade='CONTRACT_OBJECT' and id_externo='9602';
  assert v_txt = 'SUSPENSO', format('(2) payload novo tem de ser gravado, veio %s', v_txt);
  assert c1 <> c2, '(2) payload novo e uma escrita de verdade';

  -- (2b) deletado diferente: grava.
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','9602','status','SUSPENSO','final_total_value','200.00','deleted',true)));
  select count(*) into n from mutual_captura
   where entidade='CONTRACT_OBJECT' and id_externo='9602' and deletado;
  assert n = 1, '(2) deletado tem de ser gravado';

  -- (3) recaptura parcial SEM uuid, com payload igual ao que ja existe menos o
  -- uuid: o payload muda (perdeu a chave) e e gravado, mas o uuid_externo fica.
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','9601','status','ATIVO','final_total_value','100.00')));
  select count(*) into n from mutual_captura
   where entidade='CONTRACT_OBJECT' and id_externo='9601' and uuid_externo = v_uuid;
  assert n = 1, '(3) o uuid externo sobrevive a recaptura parcial';

  -- (2c) uuid que chega depois (era nulo): grava, mesmo com payload igual
  -- ao conteudo anterior + uuid. Aqui o payload tambem muda, entao basta conferir.
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','9603','status','ATIVO')));
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','9603','status','ATIVO','uuid', gen_random_uuid()::text)));
  select count(*) into n from mutual_captura
   where entidade='CONTRACT_OBJECT' and id_externo='9603' and uuid_externo is not null;
  assert n = 1, '(2) uuid novo tem de ser gravado';
  raise notice 'OK o que muda continua sendo gravado';

  -- (5) o resumo: sincronizacao concluida DEPOIS do conteudo manda na "ultima".
  insert into mutual_sincronias (entidade, iniciada_em, concluida_em)
    values ('CONTRACT_OBJECT', now() + interval '1 hour', now() + interval '2 hours');
  insert into mutual_sincronias (entidade, iniciada_em, concluida_em, erro)
    values ('CONTRACT_OBJECT', now() + interval '3 hours', now() + interval '4 hours', 'falhou');
  select ultima into v_ultima from mutual_resumo_capturas() where entidade = 'CONTRACT_OBJECT';
  assert v_ultima = now() + interval '2 hours',
    format('(5) ultima = sincronizacao concluida sem erro; veio %s', v_ultima);

  -- (6) limpeza automatica em 2%.
  select count(*) into n from pg_class
   where relname = 'mutual_captura'
     and reloptions @> array['autovacuum_vacuum_scale_factor=0.02'];
  assert n = 1, '(6) mutual_captura precisa de autovacuum_vacuum_scale_factor = 0.02';

  raise notice '=== 0096 mutual_captura_sem_regravar: TODOS OS TESTES PASSARAM ===';
end $$;
