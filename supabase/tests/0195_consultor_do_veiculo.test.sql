-- Teste funcional do consultor do veiculo (0195): o nome do vendedor de cada
-- veiculo do associado, o filtro por veiculo, o consultor de OUTRA unidade, a
-- cobranca do Brasil enxergando, o gestor de outra unidade sem nada e o
-- associado (nao-staff) sem nada.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_cob uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  u_cli uuid := gen_random_uuid();
  r_sp uuid; r_rn uuid; tv uuid;
  vd1 uuid; vd2 uuid;
  c1 uuid; v1 uuid; v2 uuid; v3 uuid;
  rec record; n int;
begin
  insert into auth.users (id, email) values
    (u_adm,'adm195@t.com'), (u_cob,'cob195@t.com'), (u_ges,'ges195@t.com'), (u_cli,'cli195@t.com');
  insert into regionais (nome) values ('SP 195') returning id into r_sp;
  insert into regionais (nome) values ('RN 195') returning id into r_rn;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm195@t.com','admin', null),
    (u_cob,'Cobranca','cob195@t.com','cobranca', null),
    (u_ges,'Gestor RN','ges195@t.com','gestor_regional', r_rn);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  insert into vendedores (nome, telefone, email, regional_id, ativo)
    values ('CLAUDIA VENDEDORA', '65999990001', 'claudia@t.com', r_sp, true) returning id into vd1;
  insert into vendedores (nome, telefone, regional_id, ativo)
    values ('RENATO DE NATAL', '84999990002', r_rn, false) returning id into vd2;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Joao 195','52998224725', r_sp) returning id into c1;

  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, vendedor_id, cobranca_externa)
    values (c1, 'CON1A01', r_sp, tv, 'ativo', current_date - 30, vd1, true) returning id into v1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, vendedor_id, cobranca_externa)
    values (c1, 'CON1A02', r_sp, tv, 'ativo', current_date - 30, vd2, true) returning id into v2;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, cobranca_externa)
    values (c1, 'CON1A03', r_sp, tv, 'ativo', current_date - 30, true) returning id into v3;

  -- ===== admin: os tres, com o consultor de cada um
  select count(*) into n from consultores_do_cliente(c1);
  assert n = 3, 'tres veiculos: ' || n;
  select * into rec from consultores_do_cliente(c1, v1);
  assert rec.consultor = 'CLAUDIA VENDEDORA', 'consultor do v1: ' || coalesce(rec.consultor, 'null');
  assert rec.consultor_telefone = '65999990001', 'telefone do consultor';
  assert rec.consultor_regional = 'SP 195', 'unidade do consultor';
  select * into rec from consultores_do_cliente(c1, v2);
  assert rec.consultor = 'RENATO DE NATAL' and rec.consultor_ativo = false, 'consultor de outra unidade, inativo, aparece';
  select * into rec from consultores_do_cliente(c1, v3);
  assert rec.vendedor_id is null and rec.consultor is null, 'sem consultor = nulo';
  select count(*) into n from consultores_do_cliente(c1, v1);
  assert n = 1, 'filtro por veiculo';

  -- ===== cobranca do Brasil (sem unidade): ve pelo escopo da cobranca
  perform set_config('request.jwt.claim.sub', u_cob::text, false);
  select count(*) into n from consultores_do_cliente(c1);
  assert n = 3, 'cobranca do Brasil ve: ' || n;
  select * into rec from consultores_do_cliente(c1, v2);
  assert rec.consultor = 'RENATO DE NATAL', 'cobranca ve o consultor de outra unidade';

  -- ===== gestor de OUTRA unidade: nada
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  select count(*) into n from consultores_do_cliente(c1);
  assert n = 0, 'gestor de RN nao ve associado de SP: ' || n;

  -- ===== associado (nao-staff): nada
  perform set_config('request.jwt.claim.sub', u_cli::text, false);
  select count(*) into n from consultores_do_cliente(c1);
  assert n = 0, 'nao-staff nao ve';

  raise notice '=== TESTES 0195 (consultor do veiculo) PASSARAM ===';
end $$;
