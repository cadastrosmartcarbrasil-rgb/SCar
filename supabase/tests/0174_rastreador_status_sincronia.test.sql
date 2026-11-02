-- Teste da 0174: o status do rastreador acompanha o veiculo e a cobranca (duas fontes).
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; pl uuid; tv uuid; cli uuid; cli2 uuid;
  v_ok uuid; v_mut uuid; v_inat uuid; v_scar uuid;
  e_ok uuid; e_mut uuid; e_inat uuid; e_scar uuid;
  rec record; txt text; n int;
begin
  insert into auth.users (id, email) values (u_adm, 'adm174@t.com');
  insert into regionais (nome) values ('UNID 174') returning id into r1;
  insert into usuarios (id, nome, email, papel) values (u_adm, 'ADMIN 174', 'adm174@t.com', 'admin');
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  insert into fornecedores (tipo_pessoa, documento, razao_social, empresa_rastreamento)
    values ('PJ', '11222333000181', 'RASTRO 174 LTDA', true) returning id into pl;
  select id into tv from tipos_veiculo where nome = 'Passeio';
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'MARIA 174', '52998224725', r1) returning id into cli;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'JOAO 174', '11144477735', r1) returning id into cli2;

  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, tipo_faturamento)
    values (cli,  'SNC1A11', r1, tv, 'ativo',   'INDIVIDUAL_VEICULO') returning id into v_ok;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, tipo_faturamento)
    values (cli,  'SNC2A22', r1, tv, 'ativo',   'INDIVIDUAL_VEICULO') returning id into v_mut;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status)
    values (cli2, 'SNC3A33', r1, tv, 'inativo') returning id into v_inat;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, tipo_faturamento)
    values (cli2, 'SNC4A44', r1, tv, 'ativo',   'INDIVIDUAL_VEICULO') returning id into v_scar;

  -- equipamentos ja "instalados" como a importacao deixa: ATIVO, inclusive no veiculo inativo
  insert into rastreadores (imei, empresa_rastreamento_id, regional_id, status, veiculo_id, cliente_id)
    values ('861740000000001', pl, r1, 'ATIVO', v_ok,   cli)  returning id into e_ok;
  insert into rastreadores (imei, empresa_rastreamento_id, regional_id, status, veiculo_id, cliente_id)
    values ('861740000000002', pl, r1, 'ATIVO', v_mut,  cli)  returning id into e_mut;
  insert into rastreadores (imei, empresa_rastreamento_id, regional_id, status, veiculo_id, cliente_id)
    values ('861740000000003', pl, r1, 'ATIVO', v_inat, cli2) returning id into e_inat;
  insert into rastreadores (imei, empresa_rastreamento_id, regional_id, status, veiculo_id, cliente_id)
    values ('861740000000004', pl, r1, 'ATIVO', v_scar, cli2) returning id into e_scar;

  -- boleto do MUTUAL vencido no veiculo v_mut; titulo do SCar vencido no v_scar
  insert into boletos_historico (id_externo, cliente_id, veiculo_id, tipo, vencimento_original, data_vencimento,
                                 valor, situacao, status_origem)
    values ('s174', cli, v_mut, 'MONTHLY_PAYMENT', current_date - 10, current_date - 10, 120, 'aberto', 'OVERDUE');
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (cli2, v_scar, 99, current_date - 4, 'pendente');

  assert dias_atraso_cliente(cli) = 10, 'atraso le o boleto do Mutual, veio ' || dias_atraso_cliente(cli);

  -- prazo do bloqueio = 5: o titulo de 4 dias ainda nao marca
  select * into rec from sincronizar_status_rastreadores(null, 5);
  assert rec.inativados = 1, 'veiculo inativo recolhe o equipamento, veio ' || rec.inativados;
  assert rec.inadimplentes = 1, 'so o vencido acima do prazo marca, veio ' || rec.inadimplentes;
  select status into txt from rastreadores where id = e_inat;  assert txt = 'INATIVO', 'inativo: ' || txt;
  select status into txt from rastreadores where id = e_mut;   assert txt = 'INADIMPLENTE', 'mutual: ' || txt;
  select status into txt from rastreadores where id = e_scar;  assert txt = 'ATIVO', 'scar 4 dias: ' || txt;
  select status into txt from rastreadores where id = e_ok;    assert txt = 'ATIVO', 'em dia: ' || txt;
  select count(*) into n from rastreador_eventos where rastreador_id = e_mut and descricao like '%vencido%';
  assert n = 1, 'motivo no historico';
  raise notice 'OK fora da base -> 4, vencido no prazo -> 3, em dia fica 2';

  -- re-executavel: nada muda de novo
  select * into rec from sincronizar_status_rastreadores(null, 5);
  assert rec.inativados + rec.inadimplentes + rec.reativados = 0, 'segunda passada nao mexe';

  -- sem prazo informado vale o da regua (1 sem empresa): o titulo de 4 dias tambem marca, pelo botao antigo
  select * into rec from sincronizar_rastreadores_inadimplencia();
  assert rec.marcados = 1, 'botao marca o do SCar, veio ' || rec.marcados;

  -- pagou -> volta a 2
  update boletos_historico set situacao = 'pago' where id_externo = 's174';
  select * into rec from sincronizar_status_rastreadores();
  assert rec.reativados = 1, 'quem pagou volta, veio ' || rec.reativados;
  select status into txt from rastreadores where id = e_mut; assert txt = 'ATIVO', 'voltou: ' || txt;
  raise notice 'OK pagou, o rastreamento volta';

  -- o trigger que faltava em producao: veiculo sai da base, equipamento recolhe na hora
  update veiculos set status = 'inativo' where id = v_ok;
  select status into txt from rastreadores where id = e_ok; assert txt = 'INATIVO', 'trigger: ' || txt;

  -- o SAC
  select * into rec from situacao_rastreamento_veiculo(v_scar);
  assert rec.suspenso_por_debito and rec.dias_atraso = 4, 'SAC ve suspenso com 4 dias';
  raise notice 'OK trigger do veiculo e a ficha do SAC';

  raise notice '=== TESTES 0174 PASSARAM ===';
end $$;
