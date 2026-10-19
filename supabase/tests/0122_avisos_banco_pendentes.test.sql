-- Teste da 0122: avisos do banco aguardando confirmacao.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  n int;
begin
  insert into auth.users (id, email) values (u_adm, 'adm122@t.com'), (u_con, 'con122@t.com');
  insert into usuarios (id, nome, email, papel) values
    (u_adm, 'Admin', 'adm122@t.com', 'admin'),
    (u_con, 'Consultor', 'con122@t.com', 'consultor_vendas');

  insert into cobranca_avisos_banco (provedor, ambiente, nosso_numero, data_aviso, previsao_credito)
    values ('SICREDI', 'producao', '600804668', '2026-10-18', '2026-10-19');

  -- um aviso por boleto
  begin
    insert into cobranca_avisos_banco (provedor, ambiente, nosso_numero) values ('SICREDI', 'producao', '600804668');
    assert false, 'duplicado deveria ser recusado';
  exception when unique_violation then null;
  end;

  -- situacao fora da lista e recusada
  begin
    insert into cobranca_avisos_banco (provedor, ambiente, nosso_numero, situacao) values ('SICREDI', 'sandbox', '1', 'XPTO');
    assert false, 'situacao invalida deveria ser recusada';
  exception when check_violation then null;
  end;

  -- leitura: admin ve, consultor nao (o harness e dono da tabela e ignora RLS,
  -- entao o teste assume o papel `authenticated`, como o app chega no banco)
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  execute 'set local role authenticated';
  select count(*) into n from cobranca_avisos_banco;
  execute 'reset role';
  assert n = 1, 'admin deveria ver o aviso, viu ' || n;

  perform set_config('request.jwt.claim.sub', u_con::text, false);
  execute 'set local role authenticated';
  select count(*) into n from cobranca_avisos_banco;
  execute 'reset role';
  assert n = 0, 'consultor nao deveria ver avisos, viu ' || n;

  -- authenticated nao grava (sem policy de escrita)
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  begin
    execute 'set local role authenticated';
    insert into cobranca_avisos_banco (provedor, ambiente, nosso_numero) values ('SICREDI', 'producao', '2');
    execute 'reset role';
    assert false, 'authenticated nao deveria gravar';
  exception when insufficient_privilege then
    execute 'reset role';
  end;
  select count(*) into n from cobranca_avisos_banco;
  assert n = 1, 'nada deveria ter sido gravado, ha ' || n;

  raise notice '=== TESTES 0122 (avisos do banco pendentes) PASSARAM ===';
end $$;
