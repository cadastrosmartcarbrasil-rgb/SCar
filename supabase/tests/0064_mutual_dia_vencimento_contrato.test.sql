-- Teste funcional da 0064 — o dia de vencimento vem do CONTRATO.
--
-- O caso real: a tela do Mutual mostra "Dia de vencimento da parcela: 10" na
-- Configuracao da cobranca do CONTRATO. O objeto do contrato nao carrega esse
-- campo, e o diagnostico acusava centenas de "Faturavel sem dia de vencimento"
-- com o dado existindo. Esta suite prova que agora o contrato manda — e que,
-- enquanto ninguem puxou /contract/, a tela diz ISSO em vez de acusar o dado.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  n int; rec record;
begin
  insert into auth.users (id, email) values (u_adm,'adm64@t.com');
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm64@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- (A) espelho da periodicidade -------------------------------------------
  assert mutual_meses_periodo('1') = 1 and mutual_meses_periodo('MENSAL') = 1, 'mensal';
  assert mutual_meses_periodo('6') = 6 and mutual_meses_periodo('SEMESTRAL') = 6, 'semestral';
  assert mutual_meses_periodo('12') = 12, 'anual';
  -- Assumir "mensal" no escuro e o caminho para cobrar varias vezes a mais.
  assert mutual_meses_periodo('QUINZENAL') is null, 'periodo desconhecido nao vira 1';

  -- (B) objetos SEM o dia (e como a base real veio) -------------------------
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object(
      'id','301','contract_id','7246','contract_status','ATIVO','status','ATIVO',
      'final_total_value','120.00',
      'first_activation_date','2021-05-03T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','ABC1D23'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','529.982.247-25','person_name','ELIANA SOARES')),
    -- objeto cujo contrato NAO sera capturado: fica sem dia de verdade
    jsonb_build_object(
      'id','302','contract_id','9999','contract_status','ATIVO','status','ATIVO',
      'final_total_value','99.00',
      'first_activation_date','2022-01-10T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','XYZ4E56'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','111.444.777-35','person_name','MARIA SILVA'))
  ));

  -- SEM contratos puxados: o indicador NAO pode gritar CRITICO, porque o dado
  -- mora num endpoint que ninguem capturou. Foi assim que o falso alarme nasceu.
  select valor, severidade, detalhe into rec from mutual_diagnostico()
   where indicador = 'Faturavel sem dia de vencimento';
  assert rec.valor = 2, format('sem contrato, os 2 aparecem: %s', rec.valor);
  assert rec.severidade = 'ATENCAO',
    format('sem /contract/ capturado nao pode ser CRITICO, veio %s', rec.severidade);
  assert rec.detalhe like '%NAO foram puxados%', 'a tela tem de dizer o que fazer';

  select valor, severidade into rec from mutual_diagnostico()
   where indicador = 'Contratos capturados (/contract/)';
  assert rec.valor = 0 and rec.severidade = 'ATENCAO', 'avisa que faltam os contratos';
  raise notice 'OK sem /contract/ a tela pede os contratos em vez de acusar o dado';

  -- (C) com o CONTRATO capturado, o dia aparece -----------------------------
  select mutual_registrar_captura('CONTRACT', jsonb_build_array(
    jsonb_build_object('id','7246','due_day','10','regional','7',
                       'contract_period','6','number_installments','6')
  )) into n;
  assert n = 1, format('contrato capturado, veio %s', n);

  select valor, severidade into rec from mutual_diagnostico()
   where indicador = 'Faturavel sem dia de vencimento';
  assert rec.valor = 1,
    format('so o 302 (sem contrato) continua sem dia, veio %s', rec.valor);
  assert rec.severidade = 'CRITICO', 'com os contratos na mao, a falta e real';
  raise notice 'OK o dia de vencimento sai do CONTRATO, nao do objeto';

  -- a unidade segue o mesmo caminho
  select valor into n from mutual_diagnostico()
   where indicador = 'Faturavel sem unidade (contrato e objeto)';
  assert n = 1, format('so o 302 fica sem unidade, veio %s', n);

  -- e o objeto orfao e apontado como tal
  select valor into n from mutual_diagnostico()
   where indicador = 'Objeto sem contrato correspondente';
  assert n = 1, format('o 302 nao casa com contrato nenhum, veio %s', n);

  -- (D) a quarentena para de acusar quem tem o dia no contrato --------------
  select count(*) into n from mutual_quarentena();
  assert n = 1, format('so o 302 na quarentena, veio %s', n);
  select motivos into rec from mutual_quarentena() where id_externo = '302';
  assert 'SEM_DIA_VENCIMENTO' = any(rec.motivos), 'e por falta do dia';
  raise notice 'OK a quarentena olha o contrato antes de acusar falta';

  -- (E) a MINA DO VALOR: contrato nao mensal ---------------------------------
  select valor, severidade into rec from mutual_diagnostico()
   where indicador = 'Faturavel em contrato NAO mensal';
  assert rec.valor = 1 and rec.severidade = 'ATENCAO',
    format('semestral tem de ser apontado: %s / %s', rec.valor, rec.severidade);

  select * into rec from mutual_periodicidade() where periodo = '6';
  assert rec.meses = 6, 'periodo 6 = semestral';
  assert rec.contratos = 1, format('1 contrato semestral, veio %s', rec.contratos);
  assert rec.parcelas_media = 6.0, format('6 parcelas, veio %s', rec.parcelas_media);
  assert rec.valor_mediano = 120.00,
    format('o valor do objeto ao lado do periodo e o que responde parcela x total, veio %s',
           rec.valor_mediano);
  raise notice 'OK periodicidade mostra periodo x parcelas x valor (parcela ou total?)';

  -- (F) a regra de ouro da fase 1 continua de pe -----------------------------
  select count(*) into n from clientes;  assert n = 0, 'Fase 1 NAO cria cliente';
  select count(*) into n from veiculos;  assert n = 0, 'Fase 1 NAO cria veiculo';
  select count(*) into n from titulos_financeiros; assert n = 0, 'Fase 1 NAO cria titulo';
  select count(*) into n from faturas;   assert n = 0, 'Fase 1 NAO cria fatura';

  raise notice '=== TESTES 0064 (dia de vencimento pelo contrato) PASSARAM ===';
end $$;
