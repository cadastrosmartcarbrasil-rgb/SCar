-- Teste funcional: o equipamento obedece ao cadastro e ao financeiro (0053)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  r1 uuid; cli uuid; pl uuid; tv uuid; v1 uuid; eq uuid; tit uuid;
  n int; txt text; marc int; regu int; rec record;
begin
  insert into auth.users (id, email) values (u_adm,'adm@t.com'), (u_ges,'ges@t.com');
  insert into regionais (nome) values ('Cuiaba') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm@t.com','admin', null),
    (u_ges,'Gestor','ges@t.com','gestor_regional', r1);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  insert into fornecedores (tipo_pessoa, documento, razao_social, empresa_rastreamento)
    values ('PJ','11222333000181','D TRAKER LTDA', true) returning id into pl;
  select id into tv from tipos_veiculo where nome = 'Passeio';
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Maria','52998224725', r1) returning id into cli;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status)
    values (cli,'RAS1A23', r1, tv, 'ativo') returning id into v1;
  insert into rastreadores (imei, empresa_rastreamento_id, regional_id, linha)
    values ('860123456789012', pl, r1, '65999998888') returning id into eq;

  perform instalar_rastreador(eq, v1);
  select status into txt from rastreadores where id = eq;
  assert txt = 'ATIVO', 'instalou';

  -- ============================================== (B) inadimplencia marca o equipamento
  select * into rec from sincronizar_rastreadores_inadimplencia();
  assert rec.marcados = 0, 'sem titulo vencido, nada muda';

  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (cli, v1, 120, current_date - 40, 'pendente') returning id into tit;
  assert dias_atraso_cliente(cli) = 40, 'o atraso e lido do titulo, veio ' || dias_atraso_cliente(cli);

  select * into rec from sincronizar_rastreadores_inadimplencia();
  assert rec.marcados = 1, 'associado com 40 dias de atraso marca o equipamento, veio ' || rec.marcados;
  select status into txt from rastreadores where id = eq;
  assert txt = 'INADIMPLENTE', 'equipamento vai para 3 - Inadimplente, veio ' || txt;

  select count(*) into n from rastreador_eventos
   where rastreador_id = eq and descricao like '%40 dias de atraso%';
  assert n = 1, 'o motivo fica no historico do equipamento';
  raise notice 'OK inadimplencia do associado alcanca o rastreador';

  -- ============================================== o SAC ve o bloqueio
  select * into rec from situacao_rastreamento_veiculo(v1);
  assert rec.suspenso_por_debito, 'o SAC precisa mostrar que o rastreamento esta suspenso';
  assert rec.dias_atraso = 40, 'com os dias de atraso, veio ' || rec.dias_atraso;
  assert rec.situacao like '%suspenso%', 'e a frase em portugues: ' || rec.situacao;
  raise notice 'OK o atendente ve "rastreamento suspenso por debito" na ficha';

  -- ============================================== regularizou, volta a ativo
  update titulos_financeiros set status = 'pago', data_pagamento = current_date, valor_pago = 120
   where id = tit;
  assert dias_atraso_cliente(cli) = 0, 'pagou, zerou o atraso';

  select * into rec from sincronizar_rastreadores_inadimplencia();
  assert rec.regularizados = 1, 'quem pagou volta para ativo, veio ' || rec.regularizados;
  select status into txt from rastreadores where id = eq;
  assert txt = 'ATIVO', 'de volta a 2 - Ativo, veio ' || txt;
  raise notice 'OK pagou, o rastreamento volta sozinho';

  -- ============================================== (A) veiculo sai da base
  update veiculos set status = 'inativo' where id = v1;
  select status into txt from rastreadores where id = eq;
  assert txt = 'INATIVO', 'veiculo fora da base manda o equipamento para recolhimento, veio ' || txt;
  select count(*) into n from rastreador_eventos
   where rastreador_id = eq and descricao like '%recolhimento%';
  assert n = 1, 'com o motivo no historico';
  raise notice 'OK cancelou o veiculo, o equipamento entra na fila de recolhimento';

  -- ============================================== (D) cobranca do nao devolvido
  perform mover_status_rastreador(eq, 'A_DEVOLVER');
  perform mover_status_rastreador(eq, 'COBRAR_RASTREADOR', 'Nao devolveu apos 5 dias');
  select * into rec from cobrar_rastreador(eq, 350.00, current_date + 10);
  assert rec.valor = 350.00, 'o titulo sai com o valor cobrado';
  assert rec.cliente_id = cli, 'no nome do associado que ficou com o aparelho';

  select status into txt from rastreadores where id = eq;
  assert txt = 'BOLETO_GERADO', 'e o equipamento vai para 7 - Boleto gerado, veio ' || txt;

  select count(*) into n from titulos_financeiros
   where cliente_id = cli and observacao like '%nao devolvido%';
  assert n = 1, 'o titulo do equipamento aparece no financeiro do associado';
  raise notice 'OK equipamento nao devolvido vira titulo a receber';

  -- ============================================== (C) nao instala para inadimplente
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (cli, v1, 200, current_date - 60, 'pendente');
  update veiculos set status = 'ativo' where id = v1;
  insert into rastreadores (imei, empresa_rastreamento_id, regional_id)
    values ('860123456789013', pl, r1) returning id into eq;

  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  begin
    perform instalar_rastreador(eq, v1);
    assert false, 'a ponta nao instala equipamento para associado devendo';
  exception when others then
    assert sqlerrm like '%atraso%', 'mensagem inesperada: ' || sqlerrm;
  end;

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  perform instalar_rastreador(eq, v1);   -- a matriz pode liberar
  select status into txt from rastreadores where id = eq;
  assert txt = 'ATIVO', 'a matriz consegue instalar assumindo o risco';
  raise notice 'OK equipamento nao sai para quem esta devendo (a matriz decide)';

  raise notice '=== TESTES 0053 (rastreador x cadastro x financeiro) PASSARAM ===';
end $$;
