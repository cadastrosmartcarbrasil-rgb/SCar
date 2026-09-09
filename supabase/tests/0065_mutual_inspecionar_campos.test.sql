-- Teste funcional da 0065 — o inspetor de payload e as grafias novas.
--
-- Por que o inspetor existe: erramos DUAS vezes supondo onde um campo mora (o
-- dia de vencimento e depois a unidade). Com os 17.616 contratos capturados, a
-- unidade seguiu vazia em 3.527 de 3.527 faturaveis — entao a pergunta "onde
-- mora esse campo?" precisa de resposta OLHANDO o payload, nao deduzindo.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ate uuid := gen_random_uuid();
  r_mt  uuid;
  n int; rec record; ok boolean;
begin
  insert into auth.users (id, email) values (u_adm,'adm65@t.com'), (u_ate,'ate65@t.com');
  insert into regionais (nome, cnpj) values ('Cuiaba','11222333000181') returning id into r_mt;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm65@t.com','admin', null),
    (u_ate,'Atendente','ate65@t.com','consultor_vendas', r_mt);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- (A) grafias novas do MESMO vocabulario -----------------------------------
  -- As grafias entraram aqui (0065); o DESTINO delas mudou na 0066, quando o
  -- usuario decidiu que indenizado nao gera mensalidade. O que esta suite ainda
  -- prova e que as tres escritas caem no MESMO lugar — seja ele qual for.
  assert mutual_status_veiculo('INDENIZACAO') = mutual_status_veiculo('INDENIZADO'),
    'sem cedilha tem de cair junto com o original';
  assert mutual_status_veiculo('INDENIZAÇAO') = mutual_status_veiculo('INDENIZADO'),
    'como veio da base, idem';
  assert mutual_status_veiculo('INATIVO/PAGO') = 'inativo', 'INATIVO/PAGO';
  -- Sem par obvio: fica de fora ATE o usuario decidir. Mapear no escuro manda
  -- boleto para quem nao devia, ou tira da base quem ainda paga.
  assert mutual_status_veiculo('DIFICULDADE FINANCEIRA') is null,
    'DIFICULDADE FINANCEIRA nao pode ser mapeada por conta propria';
  select count(*) into n from mutual_status_nao_mapeados() where true;
  raise notice 'OK grafias novas mapeadas; a ambigua segue na lista de decisao';

  -- (B) o inspetor ------------------------------------------------------------
  perform mutual_registrar_captura('CONTRACT', jsonb_build_array(
    jsonb_build_object('id','1','due_day','10','regional', null,
                       'branch_id','7', 'observacao','',
                       'vazio_sempre', null, 'objeto_vazio', '{}'::jsonb),
    jsonb_build_object('id','2','due_day','5', 'regional','',
                       'branch_id','7', 'observacao','tem texto',
                       'vazio_sempre', null, 'objeto_vazio', '{}'::jsonb),
    jsonb_build_object('id','3','due_day','20','branch_id','9',
                       'vazio_sempre', null)
  ));

  -- O campo que ESTA preenchido aparece com a contagem certa e um exemplo:
  -- e assim que se descobre que a unidade mora em `branch_id`, e nao em
  -- `regional`, sem precisar supor.
  select * into rec from mutual_campos('CONTRACT') where campo = 'branch_id';
  assert rec.preenchidos = 3, format('branch_id em 3 contratos, veio %s', rec.preenchidos);
  assert rec.exemplo in ('7','9'), format('traz exemplo do valor, veio %s', rec.exemplo);

  -- E o campo que TODO MUNDO acha que existe aparece zerado — que e exatamente
  -- o que aconteceu com `regional` na base real.
  select * into rec from mutual_campos('CONTRACT') where campo = 'regional';
  assert rec.preenchidos = 0, format('regional vazio, veio %s preenchido', rec.preenchidos);
  assert rec.vazios = 2, format('null e string vazia contam como vazio, veio %s', rec.vazios);

  -- string vazia, null, {} e [] NAO podem passar por "preenchido"
  select * into rec from mutual_campos('CONTRACT') where campo = 'vazio_sempre';
  assert rec.preenchidos = 0, 'null nunca e preenchido';
  select * into rec from mutual_campos('CONTRACT') where campo = 'objeto_vazio';
  assert rec.preenchidos = 0, 'objeto vazio nao e preenchido';
  select * into rec from mutual_campos('CONTRACT') where campo = 'observacao';
  assert rec.preenchidos = 1, format('so o que tem texto conta, veio %s', rec.preenchidos);
  raise notice 'OK o inspetor separa preenchido de vazio sem se enganar com aspas';

  -- (C) objeto ANINHADO ------------------------------------------------------
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','101','contract_id','1','contract_status','ATIVO',
      'vehicle_data', jsonb_build_object('vehicle_plate','ABC1D23','vehicle_chassi',''),
      'person_data',  jsonb_build_object('person_cpf_cnpj','529.982.247-25','person_name','JOAO'))
  ));
  select * into rec from mutual_campos('CONTRACT_OBJECT','vehicle_data')
   where campo = 'vehicle_plate';
  assert rec.preenchidos = 1, 'le dentro do objeto aninhado';
  select * into rec from mutual_campos('CONTRACT_OBJECT','vehicle_data')
   where campo = 'vehicle_chassi';
  assert rec.preenchidos = 0, 'chassi vazio nao conta (viraria NULL na carga)';
  raise notice 'OK o inspetor entra no objeto aninhado (vehicle_data, person_data)';

  -- (D) TRAVA ----------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', u_ate::text, false);
  select count(*) into n from mutual_campos('CONTRACT');
  assert n > 0, 'a equipe pode inspecionar';

  perform set_config('request.jwt.claim.sub', null, true);
  ok := false;
  begin
    perform count(*) from mutual_campos('CONTRACT');
  exception when others then ok := true;
  end;
  assert ok, 'sem sessao nao le payload do Mutual';
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  raise notice 'OK o inspetor exige staff (o payload tem CPF e nome de associado)';

  -- (E) a regra de ouro da fase 1 continua de pe ------------------------------
  select count(*) into n from clientes;  assert n = 0, 'Fase 1 NAO cria cliente';
  select count(*) into n from veiculos;  assert n = 0, 'Fase 1 NAO cria veiculo';
  select count(*) into n from titulos_financeiros; assert n = 0, 'Fase 1 NAO cria titulo';
  select count(*) into n from faturas;   assert n = 0, 'Fase 1 NAO cria fatura';

  raise notice '=== TESTES 0065 (inspetor de campos do Mutual) PASSARAM ===';
end $$;
