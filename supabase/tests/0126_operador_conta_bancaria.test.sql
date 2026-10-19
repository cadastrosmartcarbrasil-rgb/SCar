-- Teste da 0126: o operador ve e concilia SO a conta liberada; a matriz ve tudo;
-- quem nao foi liberado nao ve nada da tesouraria.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_op  uuid := gen_random_uuid();
  u_out uuid := gen_random_uuid();
  c_inter uuid; c_sic uuid;
  cat_d uuid;
  v_lanc uuid; v_item uuid; v_item_sic uuid;
  n bigint; s numeric;
  recusou boolean;
begin
  insert into auth.users (id, email) values (u_adm,'adm126@t.com'), (u_op,'op126@t.com'), (u_out,'out126@t.com');
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm126@t.com','admin', null),
    (u_op,'Operadora 24h','op126@t.com','assistencia_24h', null),
    (u_out,'Outra 24h','out126@t.com','assistencia_24h', null);
  insert into contas_bancarias (nome, banco, tipo, saldo_inicial, saldo_inicial_em)
    values ('INTER T', 'INTER', 'corrente', 500, date '2026-10-12') returning id into c_inter;
  insert into contas_bancarias (nome, banco, tipo, saldo_inicial, saldo_inicial_em)
    values ('SICREDI T', 'SICREDI', 'corrente', 9000, date '2026-10-12') returning id into c_sic;
  select id into cat_d from categorias_dre where tipo::text like 'DESPESA%' order by codigo_estruturado limit 1;

  -- so a matriz libera
  perform set_config('request.jwt.claim.sub', u_op::text, false);
  recusou := false;
  begin perform salvar_operadores_conta(c_inter, array[u_op]);
  exception when insufficient_privilege then recusou := true; end;
  assert recusou, 'operador nao pode se liberar sozinho';
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  assert salvar_operadores_conta(c_inter, array[u_op]) = 1;

  -- OFX das duas contas (pelo servidor)
  perform set_config('request.jwt.claim.sub', '', false);
  perform importar_extrato_ofx(c_inter, 'inter.ofx', 'hi', null, null, null, null,
    jsonb_build_array(jsonb_build_object('fitid','I1','data','2026-10-14','valor',-140,'historico','PIX GUINCHO')));
  perform importar_extrato_ofx(c_sic, 'sic.ofx', 'hs', null, null, null, null,
    jsonb_build_array(jsonb_build_object('fitid','S1','data','2026-10-14','valor',-70,'historico','TARIFA')));
  select id into v_item from extrato_itens where conta_id = c_inter and fitid = 'I1';
  select id into v_item_sic from extrato_itens where conta_id = c_sic and fitid = 'S1';

  -- operador: ve so o INTER
  perform set_config('request.jwt.claim.sub', u_op::text, false);
  execute 'set local role authenticated';
  select count(*) into n from saldos_contas(date '2026-10-20');
  assert n = 1, 'operador ve uma conta, viu ' || n;
  select count(*) into n from extrato_itens where conta_id in (c_inter, c_sic);
  assert n = 1, 'operador ve so os itens do Inter, viu ' || n;
  select saldo_consolidado_em(date '2026-10-20') into s;
  assert s = 500, 'saldo total do operador = so o Inter, deu ' || s;
  assert saldo_consolidado_em(date '2026-10-20', c_sic) is null, 'saldo do Sicredi e nulo para o operador';
  -- concilia criando o lancamento no Inter
  v_lanc := criar_lancamento_extrato(v_item, 'GUINCHO 14/10', cat_d);
  select count(*) into n from extrato_conta(c_inter, date '2026-10-13', date '2026-10-20');
  assert n = 1, 'extrato do Inter tem o movimento, tem ' || n;
  recusou := false;
  begin perform ignorar_extrato_item(v_item_sic, 'nao e meu');
  exception when insufficient_privilege then recusou := true; end;
  assert recusou, 'operador nao mexe no extrato do Sicredi';
  recusou := false;
  begin perform importar_extrato_ofx(c_sic, 'x.ofx', 'hx', null, null, null, null, '[]'::jsonb);
  exception when insufficient_privilege then recusou := true; end;
  assert recusou, 'operador nao importa OFX do Sicredi';
  -- transferencia: um dos lados tem de ser dele
  perform criar_transferencia_bancaria(c_sic, c_inter, 1000, date '2026-10-15', 'Repasse 24h');
  select count(*) into n from transferencias_bancarias where conta_destino_id = c_inter;
  assert n = 1, 'operador ve a transferencia que entrou no Inter';
  select count(*) into n from minhas_contas_bancarias();
  assert n = 1, 'minhas_contas_bancarias do operador = 1, deu ' || n;
  execute 'reset role';
  raise notice 'OK o operador fica na conta liberada';

  -- outro usuario da 24h, sem liberacao: nada
  perform set_config('request.jwt.claim.sub', u_out::text, false);
  execute 'set local role authenticated';
  select count(*) into n from saldos_contas(date '2026-10-20');
  assert n = 0, 'sem liberacao nao ve conta, viu ' || n;
  select count(*) into n from extrato_itens where conta_id in (c_inter, c_sic);
  assert n = 0, 'sem liberacao nao ve extrato';
  assert saldo_consolidado_em(date '2026-10-20') is null, 'sem liberacao o saldo total e nulo';
  select count(*) into n from minhas_contas_bancarias();
  assert n = 0;
  execute 'reset role';

  -- matriz: as duas
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  execute 'set local role authenticated';
  select count(*) into n from saldos_contas(date '2026-10-20') where conta_id in (c_inter, c_sic);
  assert n = 2, 'a matriz ve as duas contas';
  execute 'reset role';

  -- usuario desativado perde a conta
  update usuarios set ativo = false where id = u_op;
  perform set_config('request.jwt.claim.sub', u_op::text, false);
  assert cardinality(contas_do_operador()) = 0, 'inativo nao opera conta';
  raise notice 'OK sem liberacao (ou inativo) nao ve nada; a matriz ve tudo';

  raise notice '=== TESTES 0126 PASSARAM ===';
end $$;
