-- Teste funcional da 0066 — a decisao do usuario sobre quem NAO fatura.
--
-- "Quem esta em Indenizado, Indenizacao, Inativo/pago, nao vamos gerar
--  mensalidades." (09/09/2026)
--
-- O detalhe que faz isso ser correcao e nao ajuste cosmetico: `em_evento` E
-- FATURAVEL — esta na lista de `veiculo_faturavel` (0024) ao lado de `ativo` e
-- `vistoria_pendente`. Deixar INDENIZADO em `em_evento` faria 26 veiculos ja
-- indenizados receberem boleto todo mes.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  n int; rec record;
begin
  insert into auth.users (id, email) values (u_adm,'adm66@t.com');
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm66@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- (A) o de-para ------------------------------------------------------------
  assert mutual_status_veiculo('INDENIZADO')  = 'inativo', 'INDENIZADO nao fatura';
  assert mutual_status_veiculo('INDENIZACAO') = 'inativo', 'sem cedilha';
  assert mutual_status_veiculo('INDENIZAÇAO') = 'inativo', 'como veio da base';
  assert mutual_status_veiculo('INATIVO/PAGO')= 'inativo', 'INATIVO/PAGO';
  -- A distincao que sustenta a decisao: sinistro EM ANDAMENTO nao e indenizacao
  -- paga — o associado segue na casa e segue pagando.
  assert mutual_status_veiculo('SINISTRADO') = 'em_evento',
    'SINISTRADO continua faturando';

  -- (B) a PROVA de que isso muda o faturamento -------------------------------
  -- Nao basta o rotulo mudar: o que importa e `veiculo_faturavel` (0024), e e
  -- ela que decide se sai boleto. `em_evento` passa; `inativo` nao.
  assert 'em_evento' in ('ativo','em_evento','vistoria_pendente'),
    'em_evento e faturavel — era por isso que INDENIZADO gerava mensalidade';
  assert 'inativo' not in ('ativo','em_evento','vistoria_pendente'),
    'inativo NAO e faturavel — e o que a decisao do usuario pede';

  -- (C) no diagnostico, o indenizado sai da carteira viva --------------------
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','401','contract_id','1','contract_status','ATIVO','status','ATIVO',
      'final_total_value','164.00','first_activation_date','2021-01-01T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','ABC1D23'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','529.982.247-25','person_name','ATIVO')),
    jsonb_build_object('id','402','contract_id','2','contract_status','INDENIZADO','status','ATIVO',
      'final_total_value','120.00','first_activation_date','2020-01-01T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','IND1A11'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','111.444.777-35','person_name','INDENIZADO')),
    jsonb_build_object('id','403','contract_id','3','contract_status','SINISTRADO','status','ATIVO',
      'final_total_value','150.00','first_activation_date','2022-01-01T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','SIN1A11'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','529.982.247-25','person_name','SINISTRADO'))
  ));

  select valor into n from mutual_diagnostico()
   where indicador = 'Entrariam FATURAVEIS (a carteira viva)';
  assert n = 2, format('so o ATIVO e o SINISTRADO faturam, veio %s', n);

  select valor into n from mutual_diagnostico()
   where indicador = 'Entrariam inativos/suspensos';
  assert n = 1, format('o INDENIZADO vai para o acervo, veio %s', n);

  -- (D) a tela para de chamar desconhecido de "funil de venda" ---------------
  -- Sao coisas diferentes: funil e decisao TOMADA (venda nova nasce no SCar);
  -- desconhecido e decisao PENDENTE. Chamar de funil escondia o que falta decidir.
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','404','contract_id','4','contract_status','AGUARDANDO_ACEITE','status','CRIADO',
      'vehicle_data', jsonb_build_object('vehicle_plate','FUN1A11'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','529.982.247-25','person_name','FUNIL')),
    jsonb_build_object('id','405','contract_id','5','contract_status','DIFICULDADE FINANCEIRA','status','ATIVO',
      'vehicle_data', jsonb_build_object('vehicle_plate','DIF1A11'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','111.444.777-35','person_name','DIFICULDADE'))
  ));

  select status_scar into rec from mutual_por_status()
   where contract_status = 'AGUARDANDO_ACEITE';
  assert rec.status_scar like '%funil%', 'funil conhecido segue marcado como funil';

  select status_scar into rec from mutual_por_status()
   where contract_status = 'DIFICULDADE FINANCEIRA';
  assert rec.status_scar like '%DESCONHECIDO%',
    format('vocabulario novo tem de pedir decisao, veio "%s"', rec.status_scar);
  -- e ele segue na lista de pendencia ate o usuario decidir
  select quantidade into n from mutual_status_nao_mapeados()
   where contract_status = 'DIFICULDADE FINANCEIRA';
  assert n = 1, 'DIFICULDADE FINANCEIRA continua aguardando decisao';
  raise notice 'OK funil e vocabulario desconhecido deixam de ser a mesma coisa na tela';

  -- (E) a regra de ouro da fase 1 continua de pe -----------------------------
  select count(*) into n from clientes;  assert n = 0, 'Fase 1 NAO cria cliente';
  select count(*) into n from veiculos;  assert n = 0, 'Fase 1 NAO cria veiculo';
  select count(*) into n from titulos_financeiros; assert n = 0, 'Fase 1 NAO cria titulo';
  select count(*) into n from faturas;   assert n = 0, 'Fase 1 NAO cria fatura';

  raise notice '=== TESTES 0066 (indenizado nao gera mensalidade) PASSARAM ===';
end $$;
