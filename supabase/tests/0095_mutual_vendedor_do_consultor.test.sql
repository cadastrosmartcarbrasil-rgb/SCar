-- Teste funcional do VENDEDOR DOS MIGRADOS (0095). O que ele prova, em ordem de
-- risco: (1) veiculo vindo do Mutual NUNCA gera comissao de ADESAO — e o
-- veiculo comum continua gerando; (2) o vinculo nunca troca vendedor ja
-- gravado; (3) vendedor de outra unidade nao e ligado; (4) cada motivo de
-- "sem vendedor" sai nomeado; (5) sem confirmar nada e gravado; (6) o CPF do
-- vendedor passa a ser gravado so com digitos; (7) so a matriz liga.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ope uuid := gen_random_uuid();
  r_a uuid; r_b uuid;
  vd1 uuid; vd2 uuid; vd3 uuid; vd4a uuid; vd4b uuid;
  v301 uuid; v308 uuid; veic_comum uuid; cli uuid; tit uuid;
  rec record;
  n int;
  v_txt text;
begin
  -- ===================================================== setup
  insert into auth.users (id, email) values (u_adm,'adm95@t.com'), (u_ope,'ope95@t.com');
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('Unidade A 95', 1.0, 0.15) returning id into r_a;
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('Unidade B 95', 1.0, 0.15) returning id into r_b;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm95@t.com','admin', null),
           (u_ope,'Operador','ope95@t.com','gestor_regional', r_a);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- ===================================================== (6) CPF so com digitos
  insert into vendedores (nome, documento, email, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('VENDEDOR UM', '111.444.777-35', 'um@t.com', r_a, 1.0, 0.07) returning id into vd1;
  assert (select documento from vendedores where id = vd1) = '11144477735',
    'o CPF do vendedor tem de ser gravado so com digitos';
  update vendedores set documento = '' where id = vd1;
  assert (select documento from vendedores where id = vd1) is null, 'vazio vira NULL, nunca ''''';
  update vendedores set documento = '111.444.777-35' where id = vd1;
  assert (select documento from vendedores where id = vd1) = '11144477735', 'update tambem normaliza';

  -- vendedor de OUTRA unidade, com o CPF do consultor K2
  insert into vendedores (nome, documento, regional_id)
    values ('VENDEDOR DOIS (B)', '529.982.247-25', r_b) returning id into vd2;
  -- casa so pelo e-mail (o consultor K3 tem CPF que ninguem tem)
  insert into vendedores (nome, email, regional_id)
    values ('VENDEDOR TRES', 'Tres@T.com', r_a) returning id into vd3;
  -- e-mail repetido em dois vendedores (K4)
  insert into vendedores (nome, email, regional_id) values ('QUATRO A', 'quatro@t.com', r_a) returning id into vd4a;
  insert into vendedores (nome, email, regional_id) values ('QUATRO B', 'quatro@t.com', r_a) returning id into vd4b;

  perform vincular_externo('SALE_TEAM','50','regionais', r_a);

  perform mutual_registrar_captura('CONSULTANT', jsonb_build_array(
    jsonb_build_object('id','K1','name','CONSULTOR UM','cpf_cnpj','111.444.777-35'),
    jsonb_build_object('id','K2','name','CONSULTOR DOIS','cpf_cnpj','52998224725'),
    jsonb_build_object('id','K3','name','CONSULTOR TRES','cpf_cnpj','00000000191','email','tres@t.com'),
    jsonb_build_object('id','K4','name','CONSULTOR QUATRO','email','QUATRO@t.com'),
    jsonb_build_object('id','K5','name','CONSULTOR CINCO','cpf_cnpj','86288366757')
  ));

  perform mutual_registrar_captura('PERSON', jsonb_build_array(
    jsonb_build_object('id','Q2','name','BRUNO DOIS','cpf_cnpj','987.654.321-00','person_type','1')
  ));

  perform mutual_registrar_captura('CONTRACT', jsonb_build_array(
    jsonb_build_object('id','CK1','sales_team_id','50','consultant_id','K1','due_day','10','created_at','2020-01-01T12:00:00Z'),
    jsonb_build_object('id','CK2','sales_team_id','50','consultant_id','K2','due_day','10','created_at','2020-01-01T12:00:00Z'),
    jsonb_build_object('id','CK3','sales_team_id','50','consultant_id','K3','due_day','10','created_at','2020-01-01T12:00:00Z'),
    jsonb_build_object('id','CK4','sales_team_id','50','consultant_id','K4','due_day','10','created_at','2020-01-01T12:00:00Z'),
    jsonb_build_object('id','CK5','sales_team_id','50','consultant_id','K5','due_day','10','created_at','2020-01-01T12:00:00Z'),
    jsonb_build_object('id','CK6','sales_team_id','50','consultant_id','K6','due_day','10','created_at','2020-01-01T12:00:00Z'),
    jsonb_build_object('id','CK0','sales_team_id','50','due_day','10','created_at','2020-01-01T12:00:00Z')
  ));

  perform mutual_registrar_captura('CONTRACT_OBJECT', (
    select jsonb_agg(jsonb_build_object(
             'id', o.id, 'contract_id', o.ct, 'contract_status','ATIVO','status','ATIVO',
             'final_total_value','150','first_activation_date','2021-01-01T12:00:00Z',
             'vehicle_data', jsonb_build_object('vehicle_plate', o.placa, 'vehicle_type','1'),
             'person_data', jsonb_build_object('person_id','Q2','person_cpf_cnpj','987.654.321-00')))
      from (values ('301','CK1','KAA1A01'), ('302','CK2','KAA1A02'), ('303','CK3','KAA1A03'),
                   ('304','CK4','KAA1A04'), ('305','CK5','KAA1A05'), ('306','CK0','KAA1A06'),
                   ('307','CK6','KAA1A07'), ('308','CK1','KAA1A08')) o(id, ct, placa)));

  select * into rec from mutual_executar_carga(r_a, false, true);
  assert rec.veiculos_criados = 8, format('a carga cria os 8 veiculos; criou %s', rec.veiculos_criados);
  assert (select count(*) from veiculos where regional_id = r_a and vendedor_id is not null) = 0,
    'a carga em si continua sem gravar vendedor';

  select id into v301 from veiculos where placa = 'KAA1A01';
  select id into v308 from veiculos where placa = 'KAA1A08';
  -- 308 foi ligado a mao a outro vendedor: nao pode ser trocado
  update veiculos set vendedor_id = vd3 where id = v308;

  -- ===================================================== (4) cada motivo nomeado
  assert (select motivo from mutual_vendedores_dos_veiculos(r_a) where placa = 'KAA1A01') = 'LIGAR', '301 liga pelo CPF';
  assert (select vendedor_id from mutual_vendedores_dos_veiculos(r_a) where placa = 'KAA1A01') = vd1, '301 -> VENDEDOR UM';
  assert (select motivo from mutual_vendedores_dos_veiculos(r_a) where placa = 'KAA1A02') = 'UNIDADE_DIFERENTE',
    '302: vendedor de outra unidade nao e ligado';
  assert (select vendedor_id from mutual_vendedores_dos_veiculos(r_a) where placa = 'KAA1A03') = vd3,
    '303 liga pelo e-mail, sem diferenca de caixa';
  assert (select motivo from mutual_vendedores_dos_veiculos(r_a) where placa = 'KAA1A04') = 'EMAIL_AMBIGUO',
    '304: e-mail de dois vendedores nao escolhe ninguem';
  assert (select motivo from mutual_vendedores_dos_veiculos(r_a) where placa = 'KAA1A05') = 'CONSULTOR_SEM_VENDEDOR', '305';
  assert (select motivo from mutual_vendedores_dos_veiculos(r_a) where placa = 'KAA1A06') = 'SEM_CONSULTOR', '306';
  assert (select motivo from mutual_vendedores_dos_veiculos(r_a) where placa = 'KAA1A07') = 'CONSULTOR_NAO_CAPTURADO', '307';
  assert (select motivo from mutual_vendedores_dos_veiculos(r_a) where placa = 'KAA1A08') = 'MANTIDO',
    '308: ja tem outro vendedor, fica como esta';
  assert (select count(*) from mutual_vendedores_dos_veiculos(r_b)) = 0, 'B nao tem veiculo migrado';

  select sum(veiculos) into n from mutual_vendedores_resumo(r_a);
  assert n = 8, format('o resumo soma os 8 veiculos; somou %s', n);

  -- ===================================================== (5) sem confirmar nada muda
  select * into rec from mutual_vincular_vendedores(r_a);
  assert rec.ligar = 2 and rec.mantidos = 1 and rec.ja_ligados = 0 and rec.sem_vendedor = 5 and rec.gravados = 0,
    format('simulacao: %s', row_to_json(rec));
  assert (select count(*) from veiculos where regional_id = r_a and vendedor_id is not null) = 1,
    'simular nao grava';

  -- ===================================================== (7) so a matriz liga
  perform set_config('request.jwt.claim.sub', u_ope::text, false);
  begin
    perform mutual_vincular_vendedores(r_a, true);
    raise exception 'FALHOU: gestor de unidade ligou vendedores';
  exception when insufficient_privilege then
    null;
  end;
  assert (select count(*) from mutual_vendedores_dos_veiculos(r_a)) = 0,
    'a leitura e vazia para quem nao e da matriz';
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- ===================================================== (2) grava, sem trocar ninguem
  select * into rec from mutual_vincular_vendedores(r_a, true);
  assert rec.gravados = 2, format('liga os 2; ligou %s', rec.gravados);
  assert (select vendedor_id from veiculos where id = v301) = vd1, '301 ligado ao VENDEDOR UM';
  assert (select vendedor_id from veiculos where placa = 'KAA1A03') = vd3, '303 ligado ao VENDEDOR TRES';
  assert (select vendedor_id from veiculos where id = v308) = vd3, '308 segue com o vendedor que tinha';
  assert (select vendedor_id from veiculos where placa = 'KAA1A02') is null, '302 segue sem vendedor';

  -- re-executar e no-op
  select * into rec from mutual_vincular_vendedores(r_a, true);
  assert rec.gravados = 0 and rec.ja_ligados = 2, format('re-execucao: %s', row_to_json(rec));
  -- e a carga de novo nao apaga o vinculo
  perform mutual_executar_carga(r_a, false, true);
  assert (select vendedor_id from veiculos where id = v301) = vd1, 'a re-execucao da carga preserva o vendedor';
  assert (select count(*) from faturas f join veiculos v on v.cliente_id = f.cliente_id where v.regional_id = r_a) = 0,
    'nada disto gera fatura';

  -- ===================================================== (1) MIGRADO NUNCA E ADESAO
  -- Simula o cutover: o veiculo passa a ser cobrado aqui e o 1o titulo e pago.
  select cliente_id into cli from veiculos where id = v301;
  update veiculos set cobranca_externa = false where id = v301;
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (cli, v301, 200, current_date, 'pendente') returning id into tit;
  update titulos_financeiros set status = 'pago', valor_pago = 200 where id = tit;
  select count(*) into n from comissoes_vendas where veiculo_id = v301;
  assert n = 1, format('o titulo pago gera UMA comissao; gerou %s', n);
  assert not (select is_adesao from comissoes_vendas where titulo_id = tit),
    'veiculo vindo do Mutual: o 1o titulo pago NAO e adesao';
  assert (select valor_comissao from comissoes_vendas where titulo_id = tit) = 14.00,
    'e paga a RECORRENCIA (7% de 200), nao a adesao de 100%';

  -- O veiculo comum (nao migrado) continua com a adesao no 1o titulo.
  insert into veiculos (cliente_id, placa, regional_id, status, vendedor_id)
    values (cli, 'KCO1M01', r_a, 'inativo', vd1) returning id into veic_comum;
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (cli, veic_comum, 300, current_date, 'pendente') returning id into tit;
  update titulos_financeiros set status = 'pago', valor_pago = 300 where id = tit;
  assert (select is_adesao from comissoes_vendas where titulo_id = tit),
    'veiculo comum: o 1o titulo pago continua sendo adesao';
  assert (select valor_comissao from comissoes_vendas where titulo_id = tit) = 300.00,
    'adesao de 100% sobre 300';

  -- a regra da 0081 se mantem: comissao sobre o valor CHEIO
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'fn_calcular_comissao'
     and p.prosrc like '%coalesce(new.valor_pago, new.valor)%';
  assert n = 1, 'fn_calcular_comissao segue sobre o valor cheio';

  raise notice '=== TESTES 0095 (vendedor dos migrados) PASSARAM ===';
end $$;
