-- Teste funcional da 0107 — a rotina automatica roda SEM SESSAO.
-- Prova: (1) sem sessao (o agendador, service_role) a captura grava;
-- (2) sem sessao a carga simula e prepara/grava; (3) com sessao, quem nao e da
-- matriz continua recusado nas duas — a porta nova e so a do servidor.
\set ON_ERROR_STOP on
do $$
declare
  u_ges uuid := gen_random_uuid();
  r_a uuid;
  n int;
  rec record;
begin
  insert into regionais (nome) values ('Unidade 107') returning id into r_a;
  insert into auth.users (id, email) values (u_ges,'ges107@t.com');
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_ges,'Gestor','ges107@t.com','gestor_regional', r_a);

  -- (1) sem sessao: o agendador grava a captura.
  perform set_config('request.jwt.claim.sub', '', false);
  select mutual_registrar_captura('CONTRACT', jsonb_build_array(
    jsonb_build_object('id','107001','contract_status','ATIVO'))) into n;
  assert n = 1, format('(1) captura sem sessao tem de gravar, veio %s', n);
  select count(*) into n from mutual_captura where entidade='CONTRACT' and id_externo='107001';
  assert n = 1, '(1) a linha capturada sem sessao existe';
  raise notice 'OK captura sem sessao';

  -- (2) sem sessao: a carga simula, prepara e grava (lote vazio aqui).
  select * into rec from mutual_executar_carga(r_a, false, false);
  assert rec.mensagem like 'SIMULACAO%', '(2) simulacao sem sessao: ' || rec.mensagem;
  select * into rec from mutual_executar_carga(r_a, false, true, 100, true);
  assert rec.restantes = 0, '(2) preparo sem sessao, lote vazio';
  raise notice 'OK carga sem sessao';

  -- (3) com sessao de quem NAO e da matriz: continua recusado.
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  begin
    perform mutual_registrar_captura('CONTRACT', '[]'::jsonb);
    assert false, '(3) gestor nao pode capturar';
  exception when raise_exception then null; end;
  begin
    perform mutual_executar_carga(r_a, false, false);
    assert false, '(3) gestor nao pode rodar a carga';
  exception when raise_exception then null; end;
  raise notice 'OK quem tem sessao e nao e da matriz segue recusado';

  raise notice '=== TESTES 0107 (sincronia automatica do Mutual) PASSARAM ===';
end $$;
