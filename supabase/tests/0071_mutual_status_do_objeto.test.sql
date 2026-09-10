-- Teste funcional da 0071 — o status do VEICULO e o 0 km.
--
-- O que esta suite prova, e que nenhuma outra provava:
--  (1) o contrato fala do ASSOCIADO. Um associado com DOIS carros, um ativo e
--      um encerrado, tinha os dois entrando como faturaveis — e o encerrado
--      ia para os bloqueios cobrando valor e dia de vencimento que ele nao tem
--      por que ter. Era isso que inflava a quarentena;
--  (2) mas o objeto so PIORA: contrato cancelado com objeto "ATIVO" continua
--      sendo veiculo sem cobertura;
--  (3) veiculo sem placa COM CHASSI e 0 km, nao dado sujo — sai da quarentena
--      e vira fila propria.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  n int; rec record;
begin
  insert into auth.users (id, email) values (u_adm,'adm70@t.com');
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm70@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- (A) A DISPUTA contrato x objeto -------------------------------------------
  -- O caso do usuario: associado ATIVO (tem outro carro), ESTE veiculo inativo.
  assert mutual_status_veiculo('ATIVO', 'INATIVO') = 'inativo',
    'o status do PROPRIO VEICULO manda quando ele esta mais morto que o contrato';

  -- ... e o inverso NAO ressuscita: contrato cancelado e veiculo sem cobertura.
  assert mutual_status_veiculo('CANCELADO', 'ATIVO') = 'inativo',
    'objeto ATIVO nao pode ressuscitar veiculo de contrato CANCELADO';

  -- Objeto sem status: o contrato manda, como antes da 0071.
  assert mutual_status_veiculo('ATIVO', null) = 'ativo', 'objeto vazio -> contrato manda';
  assert mutual_status_veiculo('ATIVO', '')   = 'ativo', 'objeto em branco -> contrato manda';

  -- Vocabulario que o de-para nao conhece no objeto: cai no contrato, nao some.
  assert mutual_status_veiculo('ATIVO', 'VOCABULARIO NOVO') = 'ativo',
    'status desconhecido no objeto NAO pode apagar a classificacao do contrato';

  -- ... mas desconhecido no CONTRATO continua NAO ENTRANDO (trava da 0063).
  -- Deixar o objeto resgatar a linha faria o veiculo entrar com classificacao
  -- adivinhada, em silencio — o oposto do que `mutual_status_nao_mapeados` quer.
  assert mutual_status_veiculo('VOCABULARIO NOVO', 'ATIVO') is null,
    'vocabulario novo no CONTRATO e decisao pendente, nao importacao';
  assert mutual_status_veiculo('VOCABULARIO NOVO', 'INATIVO') is null,
    'nem para inativo: a decisao continua pendente';

  -- O funil de venda continua descartando, aconteca o que acontecer no objeto.
  assert mutual_status_veiculo('AGUARDANDO_ACEITE', 'ATIVO') is null,
    'funil de venda no contrato descarta a linha — venda nova nasce no SCar';

  -- SINISTRADO nao e apagado por um "ATIVO" generico do objeto (0066).
  assert mutual_status_veiculo('SINISTRADO', 'ATIVO') = 'em_evento',
    'sinistro em andamento (menos vivo que ativo) continua valendo';

  -- Suspenso no objeto derruba o ativo do contrato.
  assert mutual_status_veiculo('ATIVO', 'SUSPENSO') = 'suspenso', 'suspenso vence ativo';

  -- REMOVIDO segue funcionando (era o unico caso que a 0064 ja tratava).
  assert mutual_status_veiculo('ATIVO', 'REMOVIDO') = 'inativo', 'objeto removido sai da base';

  -- (B) A captura: um associado, DOIS veiculos --------------------------------
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    -- 1: o carro que ele usa — faturavel e completo
    jsonb_build_object(
      'id','701','contract_id','C70','contract_status','ATIVO','status','ATIVO',
      'final_total_value','180.00','due_day','10','first_activation_date','2023-05-10',
      'vehicle_data', jsonb_build_object('vehicle_plate','ABC1D23','vehicle_chassi','9BW111'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','52998224725','person_name','MARIA')),
    -- 2: o carro que ele ENCERROU. O contrato segue ATIVO por causa do 1.
    --    Antes da 0071 este entrava como faturavel e cobrava valor e dia.
    jsonb_build_object(
      'id','702','contract_id','C70','contract_status','ATIVO','status','INATIVO',
      'vehicle_data', jsonb_build_object('vehicle_plate','XYZ4E56','vehicle_chassi','9BW222'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','52998224725','person_name','MARIA')),
    -- 3: 0 KM — sem placa, COM chassi. Fila operacional, nao dado sujo.
    jsonb_build_object(
      'id','703','contract_id','C71','contract_status','ATIVO','status','ATIVO',
      'final_total_value','210.00','due_day','15','first_activation_date','2026-08-01',
      'vehicle_data', jsonb_build_object('vehicle_chassi','9BW333'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','12420057570','person_name','JOAO')),
    -- 4: sem placa E sem chassi — este sim nao ha o que importar.
    jsonb_build_object(
      'id','704','contract_id','C72','contract_status','ATIVO','status','ATIVO',
      'final_total_value','150.00','due_day','5','first_activation_date','2024-01-01',
      'person_data',  jsonb_build_object('person_cpf_cnpj','70442124414','person_name','ANA')),
    -- 5: veiculo SUSPENSO de associado ATIVO, e sem nome. Serve para conferir
    --    que a tela consegue explicar a divergencia de status.
    jsonb_build_object(
      'id','705','contract_id','C74','contract_status','ATIVO','status','SUSPENSO',
      'vehicle_data', jsonb_build_object('vehicle_plate','QQQ1A11','vehicle_chassi','9BW555'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','40426626842'))
  ));

  -- (C) O diagnostico -----------------------------------------------------------
  select valor into n from mutual_diagnostico()
   where indicador = 'Entrariam FATURAVEIS (a carteira viva)';
  assert n = 3, format('o carro encerrado NAO conta como faturavel (esperado 3, veio %s)', n);

  -- Dois mudaram por causa do objeto: o encerrado (702) e o suspenso (705).
  select valor into n from mutual_diagnostico()
   where indicador = 'Inativados pelo STATUS DO PROPRIO VEICULO';
  assert n = 2, format('o diagnostico mostra quantos mudaram por causa do objeto (esperado 2, veio %s)', n);

  -- O 0 km saiu do bloqueio e ganhou grupo proprio.
  select valor into n from mutual_diagnostico()
   where indicador = 'Faturavel sem placa, COM chassi';
  assert n = 1, format('0 km vira fila propria (esperado 1, veio %s)', n);

  select grupo into rec from mutual_diagnostico()
   where indicador = 'Faturavel sem placa, COM chassi';
  assert (select grupo from mutual_diagnostico()
           where indicador = 'Faturavel sem placa, COM chassi') = 'PLACA PENDENTE (0 KM)',
    'o 0 km sai do grupo BLOQUEIO';

  -- Sem placa e sem chassi continua CRITICO — nao ha identidade nenhuma.
  select valor into n from mutual_diagnostico()
   where indicador = 'Faturavel sem placa E sem chassi';
  assert n = 1, format('sem placa e sem chassi continua bloqueio (esperado 1, veio %s)', n);
  assert (select severidade from mutual_diagnostico()
           where indicador = 'Faturavel sem placa E sem chassi') = 'CRITICO',
    'sem identidade nenhuma e critico';

  -- O veiculo encerrado NAO e cobrado por valor/dia que ele nao tem por que ter.
  select valor into n from mutual_diagnostico()
   where indicador = 'Faturavel sem valor cobrado (nulo ou zero)';
  assert n = 0, format('o carro encerrado saiu dos bloqueios de faturamento (veio %s)', n);

  -- (D) A quarentena ENCOLHE -----------------------------------------------------
  -- Por padrao o 0 km nao aparece: ele nao precisa de correcao de dado.
  select count(*) into n from mutual_quarentena(200, true);
  assert n = 1, format('so o sem-placa-sem-chassi fica na quarentena (esperado 1, veio %s)', n);

  select * into rec from mutual_quarentena(200, true);
  assert 'SEM_PLACA_NEM_CHASSI' = any(rec.motivos), 'o motivo aponta a falta de identidade';

  -- ... e o 0 km aparece quando alguem pede para ver.
  select count(*) into n from mutual_quarentena(200, true, true);
  assert n = 2, format('com p_incluir_placa_pendente o 0 km aparece (esperado 2, veio %s)', n);

  -- (E) O veiculo ENCERRADO nem chega na quarentena --------------------------
  -- Ele tem placa, chassi, CPF e nome; e inativo, entao valor e dia nao sao
  -- cobrados dele. Nao ha nada a corrigir — e por isso que a lista encolhe.
  select count(*) into n from mutual_quarentena(200, false, true) where id_externo = '702';
  assert n = 0, 'veiculo encerrado e completo NAO e problema de dado';

  -- ... e quando a linha ESTA na quarentena, a tela explica a divergencia:
  -- sem isso ninguem entende por que um associado "ativo" tem veiculo suspenso.
  select * into rec from mutual_quarentena(200, false, true) where id_externo = '705';
  assert rec.situacao like 'SUSPENSO%associado: ATIVO%',
    format('a situacao mostra o veiculo E o associado (veio: %s)', rec.situacao);
  assert 'SEM_NOME' = any(rec.motivos), 'o motivo real e a falta do nome';

  -- (F) O cruzamento e o instrumento ---------------------------------------------
  select quantidade into n from mutual_status_cruzado()
   where contract_status = 'ATIVO' and object_status = 'INATIVO';
  assert n = 1, 'o cruzamento mostra o par contrato x objeto';
  assert (select mudou from mutual_status_cruzado()
           where contract_status = 'ATIVO' and object_status = 'INATIVO'),
    'e marca que ESSE par muda de classificacao por causa do objeto';
  assert not (select mudou from mutual_status_cruzado()
               where contract_status = 'ATIVO' and object_status = 'ATIVO'),
    'par igual nao muda nada';

  -- (G) Vocabulario desconhecido do OBJETO tambem aparece -------------------------
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','706','contract_id','C73',
      'contract_status','ATIVO','status','VOCABULARIO NOVO DO OBJETO')));
  select quantidade into n from mutual_status_nao_mapeados()
   where origem = 'OBJETO' and status = 'VOCABULARIO NOVO DO OBJETO';
  assert n = 1, 'status novo no OBJETO tem de aparecer — agora ele decide carga';

  -- (H) A regra da Fase 1 continua de pe ------------------------------------------
  select count(*) into n from clientes;  assert n = 0, 'Fase 1 NAO cria cliente';
  select count(*) into n from veiculos;  assert n = 0, 'Fase 1 NAO cria veiculo';

  raise notice '=== TESTES 0071 (status do veiculo e 0 km) PASSARAM ===';
end $$;
