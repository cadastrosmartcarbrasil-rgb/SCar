-- Teste funcional da 0063 — a CORRECAO DE LEITURA do diagnostico do Mutual.
--
-- O que esta suite prova, e que a 0062 nao provava porque a amostra sintetica
-- so tinha contrato ATIVO: bloqueio (valor, dia de vencimento, ativacao) e
-- coisa de quem VAI FATURAR. Num contrato encerrado a ausencia desses campos e
-- o esperado — contar isso como CRITICO afogava o unico numero que decide a
-- carga. Na base real foram 2.432 "criticos" que nao eram impedimento nenhum.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  n int; rec record; ok boolean;
begin
  insert into auth.users (id, email) values (u_adm,'adm63@t.com');
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm63@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- (A) o vocabulario do Mutual NAO e o do swagger --------------------------
  -- Este status so apareceu na base real: contrato encerrando com equipamento
  -- a recolher. Antes da 0063 ele caia no `else null` e era contado como
  -- "funil de venda", que e exatamente o lugar errado.
  assert mutual_status_veiculo('AGUARDADO A RETIRADA DO RASTREADOR') = 'inativo',
    'status visto em producao tem de virar inativo, nao sumir no funil';

  -- (B) captura -------------------------------------------------------------
  select mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    -- 1: FATURAVEL completo — a linha que nao da trabalho nenhum
    jsonb_build_object(
      'id','201','contract_id','8001','contract_status','ATIVO','status','ATIVO','regional','7',
      'final_total_value','189.90','due_day','10',
      'first_activation_date','2021-05-03T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','ABC1D23'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','529.982.247-25','person_name','JOAO DA SILVA')),
    -- 2: FATURAVEL sem valor, sem dia e sem ativacao -> os tres bloqueios
    jsonb_build_object(
      'id','202','contract_id','8002','contract_status','ATIVO','status','ATIVO','regional','7',
      'final_total_value','0.00',
      'vehicle_data', jsonb_build_object('vehicle_plate','CORT111'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','111.444.777-35','person_name','MARIA CORTESIA')),
    -- 3..5: INATIVOS sem valor e sem dia — o caso que a base real tem aos
    -- milhares e que NAO e impedimento: contrato encerrado nao fatura.
    jsonb_build_object(
      'id','203','contract_id','8003','contract_status','INATIVO','status','ATIVO','regional','7',
      'first_activation_date','2018-01-01T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','OLD1A11'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','529.982.247-25','person_name','JOAO DA SILVA')),
    jsonb_build_object(
      'id','204','contract_id','8004','contract_status','CANCELADO','status','ATIVO','regional','7',
      'vehicle_data', jsonb_build_object('vehicle_plate','OLD2A22'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','111.444.777-35','person_name','MARIA CORTESIA')),
    -- este ainda tem PLACA MINUSCULA, como as que a base real devolveu
    jsonb_build_object(
      'id','205','contract_id','8005','contract_status','AGUARDADO A RETIRADA DO RASTREADOR',
      'status','ATIVO',
      'vehicle_data', jsonb_build_object('vehicle_plate','FTz3b34'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','529.982.247-25','person_name','JOAO DA SILVA')),
    -- 6: status que NINGUEM conhece — nem o swagger, nem nos
    jsonb_build_object(
      'id','206','contract_id','8006','contract_status','VOCABULARIO_NOVO','status','ATIVO',
      'vehicle_data', jsonb_build_object('vehicle_plate','NEW1A11'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','529.982.247-25','person_name','JOAO DA SILVA')),
    -- 7: funil de venda — conhecido, e de fora por decisao
    jsonb_build_object(
      'id','207','contract_id','8007','contract_status','AGUARDANDO_ACEITE','status','CRIADO',
      'vehicle_data', jsonb_build_object('vehicle_plate','FUN1A11'),
      'person_data',  jsonb_build_object('person_cpf_cnpj','529.982.247-25','person_name','FUNIL'))
  )) into n;
  assert n = 7, format('7 objetos capturados, veio %s', n);

  -- (C) A CONTA CERTA: bloqueio so sobre quem vai faturar --------------------
  select valor into n from mutual_diagnostico()
   where indicador = 'Entrariam FATURAVEIS (a carteira viva)';
  assert n = 2, format('faturaveis sao 201 e 202, veio %s', n);

  select valor into n from mutual_diagnostico()
   where indicador = 'Entrariam inativos/suspensos';
  assert n = 3, format('inativos sao 203,204,205, veio %s', n);

  -- 202 e o unico faturavel sem valor. 203,204,205 tambem estao sem, e antes
  -- da 0063 os quatro entravam na mesma conta CRITICA.
  select valor, severidade into rec from mutual_diagnostico()
   where indicador = 'Faturavel sem valor cobrado (nulo ou zero)';
  assert rec.valor = 1 and rec.severidade = 'CRITICO',
    format('so o faturavel conta como critico: %s / %s', rec.valor, rec.severidade);

  select valor, severidade into rec from mutual_diagnostico()
   where grupo = 'ACERVO INATIVO' and indicador = 'Sem valor cobrado';
  assert rec.valor = 3 and rec.severidade = 'OK',
    format('acervo inativo sem valor e informativo, veio %s / %s', rec.valor, rec.severidade);

  select valor into n from mutual_diagnostico()
   where indicador = 'Faturavel sem dia de vencimento';
  assert n = 1, format('so o 202 e faturavel sem dia, veio %s', n);

  select valor, severidade into rec from mutual_diagnostico()
   where indicador = 'Faturavel sem data de ativacao';
  assert rec.valor = 1 and rec.severidade = 'CRITICO',
    format('a mina do trigger que carimba HOJE: %s / %s', rec.valor, rec.severidade);
  raise notice 'OK bloqueio conta so a carteira viva; o acervo inativo e informativo';

  -- (D) status desconhecido nao pode sumir no funil --------------------------
  select quantidade into n from mutual_status_nao_mapeados()
   where contract_status = 'VOCABULARIO_NOVO';
  assert n = 1, format('status novo tem de aparecer, veio %s', n);

  select count(*) into n from mutual_status_nao_mapeados()
   where contract_status = 'AGUARDANDO_ACEITE';
  assert n = 0, 'funil de venda e conhecido: nao e "nao mapeado"';

  select count(*) into n from mutual_status_nao_mapeados()
   where contract_status = 'AGUARDADO A RETIRADA DO RASTREADOR';
  assert n = 0, 'o status de producao ja esta no de-para desde a 0063';

  select valor, severidade into rec from mutual_diagnostico()
   where indicador = 'Status que o de-para NAO reconhece';
  assert rec.valor = 1 and rec.severidade = 'ATENCAO',
    format('o diagnostico avisa: %s / %s', rec.valor, rec.severidade);
  raise notice 'OK vocabulario novo do Mutual aparece em vez de virar funil';

  -- (E) achados da base real: placa minuscula e unidade ausente --------------
  select valor into n from mutual_diagnostico()
   where indicador = 'Placa fora do padrao (minuscula/espaco)';
  assert n = 1, format('a placa FTz3b34 tem de ser apontada, veio %s', n);

  -- 205,206,207 nao declaram `regional` no objeto — na base real foram 100%,
  -- e e por isso que a unidade tem de sair de /contract/ (0064). Desde a 0064 a
  -- conta segue a mesma regra dos bloqueios: a CARTEIRA VIVA de um lado (aqui
  -- 201 e 202, os dois com unidade) e o acervo encerrado do outro (o 205).
  select valor into n from mutual_diagnostico()
   where indicador = 'Faturavel sem unidade (contrato e objeto)';
  assert n = 0, format('os faturaveis declaram unidade, veio %s', n);
  select valor into n from mutual_diagnostico()
   where grupo = 'ACERVO INATIVO' and indicador = 'Sem unidade';
  assert n = 1, format('o 205 e o inativo sem unidade, veio %s', n);
  raise notice 'OK o diagnostico aponta caixa da placa e ausencia de unidade';

  -- (F) quarentena: por padrao, so quem vai faturar --------------------------
  select count(*) into n from mutual_quarentena();
  assert n = 1, format('so o 202 esta na quarentena faturavel, veio %s', n);
  select motivos into rec from mutual_quarentena() where id_externo = '202';
  assert 'SEM_VALOR_COBRADO' = any(rec.motivos)
     and 'SEM_DIA_VENCIMENTO' = any(rec.motivos)
     and 'SEM_DATA_ATIVACAO'  = any(rec.motivos),
    'a quarentena diz os tres motivos';

  -- pedindo o acervo inteiro, o inativo NAO ganha motivo de faturamento: ele
  -- so apareceria por falta de placa/CPF/nome, que nao e o caso aqui.
  select count(*) into n from mutual_quarentena(500, false);
  assert n = 1, format('inativo completo nao entra em quarentena, veio %s', n);
  raise notice 'OK quarentena olha a carteira viva por padrao';

  -- (G) /contract/ passou a ser entidade capturavel --------------------------
  select mutual_registrar_captura('CONTRACT', jsonb_build_array(
    jsonb_build_object('id','8001','due_day','10','regional','7')
  )) into n;
  assert n = 1, format('CONTRACT tem de ser capturavel, veio %s', n);

  ok := false;
  begin
    perform mutual_registrar_captura('COISA_INVENTADA', jsonb_build_array(jsonb_build_object('id','1')));
  exception when others then ok := true;
  end;
  assert ok, 'entidade fora da lista continua recusada';
  raise notice 'OK /contract/ e capturavel (e e de la que vem due_day e unidade)';

  -- (H) a regra de ouro da fase 1 continua de pe -----------------------------
  select count(*) into n from clientes;  assert n = 0, 'Fase 1 NAO cria cliente';
  select count(*) into n from veiculos;  assert n = 0, 'Fase 1 NAO cria veiculo';
  select count(*) into n from titulos_financeiros; assert n = 0, 'Fase 1 NAO cria titulo';
  select count(*) into n from faturas;   assert n = 0, 'Fase 1 NAO cria fatura';

  raise notice '=== TESTES 0063 (diagnostico Mutual por faturavel) PASSARAM ===';
end $$;
