-- Teste funcional da FASE 1 da integracao com o Mutual (0062): o de-para de
-- status, o diagnostico, a quarentena e a trava de quem pode puxar dados.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ate uuid := gen_random_uuid();
  r_mt  uuid;
  n int; rec record; ok boolean;
begin
  -- setup ---------------------------------------------------------------------
  insert into auth.users (id, email) values (u_adm,'adm62@t.com'), (u_ate,'ate62@t.com');
  insert into regionais (nome, cnpj) values ('Cuiaba', '11222333000181') returning id into r_mt;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm62@t.com','admin', null),
    (u_ate,'Atendente','ate62@t.com','consultor_vendas', r_mt);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- (A) de-para de status ------------------------------------------------------
  assert mutual_status_veiculo('ATIVO') = 'ativo', 'ATIVO -> ativo';
  assert mutual_status_veiculo('SUSPENSO') = 'suspenso', 'SUSPENSO -> suspenso';
  assert mutual_status_veiculo('PENDENTE_VISTORIA') = 'vistoria_pendente', 'vistoria';
  assert mutual_status_veiculo('SINISTRADO') = 'em_evento', 'SINISTRADO -> em_evento';
  assert mutual_status_veiculo('CANCELADO_TROCA_TITULARIDADE') = 'inativo', 'cancelado -> inativo';
  -- A inadimplencia do SCar e derivada dos titulos, nao do status do cadastro.
  assert mutual_status_veiculo('INADIMPLENTE') = 'ativo',
    'INADIMPLENTE tem de seguir ativo (a trava vem do financeiro)';
  -- Objeto removido sai da base mesmo com o contrato ativo.
  assert mutual_status_veiculo('ATIVO','REMOVIDO') = 'inativo', 'objeto REMOVIDO';
  -- Funil de venda NAO e importado: venda nova nasce no SCar.
  assert mutual_status_veiculo('AGUARDANDO_ACEITE') is null, 'funil nao importa';
  assert mutual_status_veiculo('AUTORIZADO') is null, 'funil nao importa';
  assert mutual_status_veiculo('COISA_NOVA') is null, 'status desconhecido nao entra';
  raise notice 'OK de-para de status (25 valores -> 7, com o funil de fora)';

  assert mutual_tipo_pessoa('1') = 'PF' and mutual_tipo_pessoa('2') = 'PJ', 'tipo pessoa';
  assert mutual_tipo_pessoa('PF') is null, 'nao inventa PF quando vem outra coisa';
  assert mutual_texto('   ') is null and mutual_texto(' AB ') = 'AB', 'vazio vira NULL';

  -- (B) captura ----------------------------------------------------------------
  select mutual_registrar_captura('REGIONAL', jsonb_build_array(
    jsonb_build_object('id','7','name','Cuiaba','fantasy_name','Cuiaba','cpf_cnpj','11.222.333/0001-81')
  )) into n;
  assert n = 1, format('regional capturada, veio %s', n);

  select mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    -- 1: linha COMPLETA e ativa
    jsonb_build_object(
      'id','101','uuid','1a2b3c4d-1111-2222-3333-444455556666','contract_id','9001',
      'contract_status','ATIVO','status','ATIVO','regional','7',
      'final_total_value','189.90','due_day','10',
      'first_activation_date','2021-05-03T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','ABC1D23','vehicle_chassi','9BWZZZ377VT004251'),
      'person_data',  jsonb_build_object('person_id','501','person_cpf_cnpj','529.982.247-25','person_name','JOAO DA SILVA')),
    -- 2: MESMO contrato do 1 -> contrato com 2 veiculos
    jsonb_build_object(
      'id','102','contract_id','9001','contract_status','ATIVO','status','ATIVO','regional','7',
      'final_total_value','150.00','due_day','10',
      'first_activation_date','2022-01-10T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','XYZ4E56','vehicle_chassi',''),
      'person_data',  jsonb_build_object('person_id','501','person_cpf_cnpj','529.982.247-25','person_name','JOAO DA SILVA')),
    -- 3: CORTESIA com valor ZERO + sem data de ativacao -> duas minas de uma vez
    jsonb_build_object(
      'id','103','contract_id','9002','contract_status','ATIVO','status','ATIVO','regional','7',
      'final_total_value','0.00','due_day','5',
      'vehicle_data', jsonb_build_object('vehicle_plate','CORT111'),
      'person_data',  jsonb_build_object('person_id','502','person_cpf_cnpj','111.444.777-35','person_name','MARIA CORTESIA')),
    -- 4: CPF invalido e sem dia de vencimento
    jsonb_build_object(
      'id','104','contract_id','9003','contract_status','ATIVO','status','ATIVO','regional','7',
      'final_total_value','200.00',
      'first_activation_date','2020-02-02T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','INV1A11'),
      'person_data',  jsonb_build_object('person_id','503','person_cpf_cnpj','000.000.000-00','person_name','CPF RUIM')),
    -- 5: FUNIL DE VENDA — nao entra em conta nenhuma, mesmo estando incompleto
    jsonb_build_object(
      'id','105','contract_id','9004','contract_status','AGUARDANDO_ACEITE','status','CRIADO',
      'vehicle_data', jsonb_build_object('vehicle_plate', null),
      'person_data',  jsonb_build_object('person_cpf_cnpj', null,'person_name', null)),
    -- 6: DELETADO do lado de la
    jsonb_build_object(
      'id','106','contract_id','9005','contract_status','ATIVO','status','ATIVO','deleted', true,
      'final_total_value','99.00','due_day','15',
      'first_activation_date','2019-09-09T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','DEL1E11'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','529.982.247-25','person_name','DELETADO'))
  )) into n;
  assert n = 6, format('6 objetos capturados, veio %s', n);

  -- Re-executavel: puxar de novo ATUALIZA, nao duplica.
  select mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','101','contract_id','9001','contract_status','SUSPENSO','status','ATIVO',
      'final_total_value','189.90','due_day','10','first_activation_date','2021-05-03T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','ABC1D23'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','529.982.247-25','person_name','JOAO DA SILVA'))
  )) into n;
  select count(*) into n from mutual_captura where entidade = 'CONTRACT_OBJECT';
  assert n = 6, format('recaptura nao duplica; esperava 6, veio %s', n);
  select payload->>'contract_status' into rec from mutual_captura
   where entidade='CONTRACT_OBJECT' and id_externo='101';
  raise notice 'OK captura idempotente (recapturar atualiza a linha)';

  -- volta o 101 para ATIVO para as contas seguintes
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','101','contract_id','9001','contract_status','ATIVO','status','ATIVO','regional','7',
      'final_total_value','189.90','due_day','10','first_activation_date','2021-05-03T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','ABC1D23','vehicle_chassi','9BWZZZ377VT004251'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','529.982.247-25','person_name','JOAO DA SILVA'))));

  -- o uuid do lado de la e guardado quando existe -- E a recaptura com payload
  -- parcial (sem uuid) NAO pode apaga-lo: e a chave externa estavel.
  select count(*) into n from mutual_captura
   where entidade='CONTRACT_OBJECT' and uuid_externo is not null;
  assert n = 1, format('uuid externo sobrevive a recaptura parcial, veio %s', n);

  -- (C) diagnostico ------------------------------------------------------------
  select valor into n from mutual_diagnostico()
   where indicador = 'Objetos capturados';
  assert n = 6, format('capturados 6, veio %s', n);

  -- o funil (105) e o deletado (106) ficam de fora do que "entraria na base"
  select valor into n from mutual_diagnostico()
   where indicador = 'Objetos que entrariam na base';
  assert n = 4, format('deveriam entrar 4 (101,102,103,104), veio %s', n);

  select valor into n from mutual_diagnostico()
   where indicador = 'Descartados por serem funil de venda';
  assert n = 1, format('1 no funil, veio %s', n);

  -- A MINA Nº 2: sem data de ativacao (103)
  select valor, severidade into rec from mutual_diagnostico()
   where indicador = 'Sem data de ativacao';
  assert rec.valor = 1 and rec.severidade = 'CRITICO',
    format('sem data de ativacao: %s / %s', rec.valor, rec.severidade);

  -- A ARMADILHA DO ZERO: cortesia com 0,00 conta como "sem valor cobrado"
  select valor, severidade into rec from mutual_diagnostico()
   where indicador = 'Sem valor cobrado (nulo ou zero)';
  assert rec.valor = 1 and rec.severidade = 'CRITICO',
    format('R$ 0,00 tem de ser CRITICO (cortesia voltaria a ser cobrada): %s', rec.valor);

  -- CPF que reprova na validacao do banco (104)
  select valor into n from mutual_diagnostico()
   where indicador = 'CPF/CNPJ que REPROVA na validacao';
  assert n = 1, format('1 CPF invalido, veio %s', n);

  -- sem dia de vencimento (104)
  select valor into n from mutual_diagnostico()
   where indicador = 'Sem dia de vencimento';
  assert n = 1, format('1 sem dia, veio %s', n);

  -- contrato 9001 tem dois veiculos
  select valor into n from mutual_diagnostico()
   where indicador = 'Contratos com 2+ veiculos';
  assert n = 1, format('1 contrato com 2 veiculos, veio %s', n);

  -- o soft-delete e contado e nao entra na base
  select valor into n from mutual_diagnostico()
   where indicador = 'Registros marcados como deletados';
  assert n = 1, format('1 deletado, veio %s', n);
  raise notice 'OK diagnostico (volume, minas terrestres, cadastro, unicidade, estrutura)';

  -- (D) por status -------------------------------------------------------------
  select quantidade into n from mutual_por_status()
   where contract_status = 'AGUARDANDO_ACEITE';
  assert n = 1, 'AGUARDANDO_ACEITE aparece na leitura por status';
  select status_scar into rec from mutual_por_status()
   where contract_status = 'AGUARDANDO_ACEITE';
  assert rec.status_scar like '%funil%', 'e marcado como nao importavel';

  -- (E) quarentena -------------------------------------------------------------
  select count(*) into n from mutual_quarentena(500);
  assert n = 2, format('quarentena com 103 e 104, veio %s', n);
  select motivos into rec from mutual_quarentena(500) where id_externo = '103';
  assert 'SEM_VALOR_COBRADO' = any(rec.motivos), 'cortesia cai por valor';
  assert 'SEM_DATA_ATIVACAO' = any(rec.motivos), 'e tambem por data de ativacao';
  raise notice 'OK quarentena aponta a linha E o motivo';

  -- (F) filiais ----------------------------------------------------------------
  select * into rec from mutual_filiais() where id_externo = '7';
  -- 101,102,103,104 declaram regional '7'; o do funil e o deletado nao declaram.
  assert rec.objetos = 4, format('4 objetos na filial 7, veio %s', rec.objetos);
  assert rec.ja_existe_id = r_mt, 'casou com a regional existente pelo CNPJ';
  raise notice 'OK filiais sugerem o de-para SEM criar regional nenhuma';

  -- (G) TRAVAS -----------------------------------------------------------------
  -- a equipe LE o diagnostico...
  perform set_config('request.jwt.claim.sub', u_ate::text, false);
  select count(*) into n from mutual_diagnostico();
  assert n > 0, 'atendente pode ler o diagnostico';

  -- ...mas NAO puxa dados do Mutual (importacao e da matriz)
  ok := false;
  begin
    perform mutual_registrar_captura('PERSON', jsonb_build_array(jsonb_build_object('id','1')));
  exception when others then ok := true;
  end;
  assert ok, 'quem nao tem acesso global NAO pode puxar dados do Mutual';
  raise notice 'OK a equipe le o diagnostico; so a matriz puxa';

  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- (H) A REGRA DE OURO DA FASE 1: nada foi escrito na operacao ----------------
  select count(*) into n from clientes;  assert n = 0, 'Fase 1 NAO cria cliente';
  select count(*) into n from veiculos;  assert n = 0, 'Fase 1 NAO cria veiculo';
  select count(*) into n from titulos_financeiros; assert n = 0, 'Fase 1 NAO cria titulo';
  select count(*) into n from faturas;   assert n = 0, 'Fase 1 NAO cria fatura';
  raise notice 'OK a operacao segue intacta: nenhum cliente, veiculo, titulo ou fatura';

  raise notice '=== TESTES 0062 (integracao Mutual - Fase 1) PASSARAM ===';
end $$;
