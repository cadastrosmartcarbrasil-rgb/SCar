-- Teste funcional da PREPARACAO DA CARGA DO MUTUAL (0082): a unidade passa a
-- sair do ASSOCIADO, o vinculo torna a carga re-executavel, e o interruptor
-- impede que importar a carteira gere fatura para quem ja paga no outro sistema.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ope uuid := gen_random_uuid();
  r_cba uuid; r_nat uuid; tv uuid; cli uuid;
  v_ext uuid; v_own uuid;
  n int; n2 int; v_id bigint; v_uuid uuid; v_txt text; v_ok boolean;
  v_comp date := date_trunc('month', current_date)::date;
begin
  -- ===================================================== setup
  insert into auth.users (id, email) values (u_adm,'adm82@t.com'), (u_ope,'ope82@t.com');
  insert into regionais (nome) values ('Cuiaba 82') returning id into r_cba;
  insert into regionais (nome) values ('Natal 82')  returning id into r_nat;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm82@t.com','admin', null),
           (u_ope,'Operador','ope82@t.com','consultor_vendas', r_cba);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','ASSOCIADO 82','52998224725', r_cba) returning id into cli;

  -- Captura: 2 filiais, 2 associados (um SEM unidade), 3 objetos.
  perform mutual_registrar_captura('REGIONAL', jsonb_build_array(
    jsonb_build_object('id','5','name','APROVES-BR','fantasy_name','APROVES-BR'),
    jsonb_build_object('id','7','name','Cuiaba 82','fantasy_name','Cuiaba 82')
  ));
  perform mutual_registrar_captura('PERSON', jsonb_build_array(
    jsonb_build_object('id','P1','name','JOAO','cpf_cnpj','529.982.247-25','regional_id','5'),
    jsonb_build_object('id','P2','name','MARIA','cpf_cnpj','168.995.350-09','regional_id','')
  ));
  perform mutual_registrar_captura('CONTRACT', jsonb_build_array(
    jsonb_build_object('id','9001','due_day','10','contract_period','1','installments','1')
  ));
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    -- 1: completo, associado COM unidade
    jsonb_build_object('id','101','contract_id','9001','contract_status','ATIVO','status','ATIVO',
      'final_total_value','189.90','first_activation_date','2021-05-03T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','AAA1A11','vehicle_chassi','9BWZZZ377VT000001'),
      'person_data',  jsonb_build_object('person_id','P1','person_cpf_cnpj','529.982.247-25','person_name','JOAO')),
    -- 2: associado capturado mas SEM unidade declarada
    jsonb_build_object('id','102','contract_id','9001','contract_status','ATIVO','status','ATIVO',
      'final_total_value','150.00','first_activation_date','2022-01-10T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','BBB2B22','vehicle_chassi','9BWZZZ377VT000002'),
      'person_data',  jsonb_build_object('person_id','P2','person_cpf_cnpj','168.995.350-09','person_name','MARIA')),
    -- 3: associado NAO capturado
    jsonb_build_object('id','103','contract_id','9001','contract_status','ATIVO','status','ATIVO',
      'final_total_value','170.00','first_activation_date','2022-02-10T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','CCC3C33','vehicle_chassi','9BWZZZ377VT000003'),
      'person_data',  jsonb_build_object('person_id','P9','person_cpf_cnpj','111.444.777-35','person_name','SEM CADASTRO'))
  ));

  -- ==========================================================================
  -- (A) A UNIDADE SAI DO ASSOCIADO — e a do objeto/contrato e so reserva
  -- ==========================================================================
  select mutual_regional_externa(payload,
           (select p2.payload from mutual_captura p2
             where p2.entidade='CONTRACT' and p2.id_externo='9001'))
    into v_txt from mutual_captura where entidade='CONTRACT_OBJECT' and id_externo='101';
  assert v_txt = '5',
    format('a unidade tem de vir do ASSOCIADO (PERSON.regional_id = 5); veio %L', v_txt);

  -- Vazio vira NULL, nunca '' — senao `regional_id = ''` viraria uma "unidade".
  select mutual_regional_externa(payload, null) into v_txt
    from mutual_captura where entidade='CONTRACT_OBJECT' and id_externo='102';
  assert v_txt is null, format('regional_id vazio no associado tem de dar NULL; veio %L', v_txt);

  -- 🔴 O ESPELHO: o resolvedor de linha e o join do diagnostico tem de
  -- concordar. Sao duas implementacoes da MESMA precedencia, e e este teste
  -- que impede uma mudar sem a outra.
  select count(*) into n
    from mutual_captura o
    left join mutual_captura p
      on p.entidade='PERSON' and not p.deletado
     and p.id_externo = o.payload #>> '{person_data,person_id}'
   where o.entidade='CONTRACT_OBJECT' and not o.deletado
     and mutual_regional_externa(o.payload, null)
         is distinct from coalesce(mutual_texto_em(p.payload, mutual_chaves_regional()),
                                   mutual_texto_em(o.payload, mutual_chaves_regional()));
  assert n = 0,
    format('resolvedor e diagnostico divergiram em %s objetos — uma das duas mudou sozinha', n);

  -- O objeto continua servindo de reserva: se um dia o Mutual preencher la.
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','104','contract_id','9001','contract_status','ATIVO','status','ATIVO',
      'regional_id','7','final_total_value','100.00','first_activation_date','2022-03-01T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','DDD4D44'),
      'person_data',  jsonb_build_object('person_id','P2','person_cpf_cnpj','168.995.350-09','person_name','MARIA'))
  ));
  select mutual_regional_externa(payload, null) into v_txt
    from mutual_captura where entidade='CONTRACT_OBJECT' and id_externo='104';
  assert v_txt = '7', format('o objeto e reserva quando o associado nao tem unidade; veio %L', v_txt);

  -- ==========================================================================
  -- (B) O VINCULO
  -- ==========================================================================
  select vincular_externo('REGIONAL','5','regionais', r_cba) into v_id;
  assert v_id is not null, 'vinculo tem de ser criado';
  assert registro_do_externo('REGIONAL','5') = r_cba, 'o vinculo resolve o registro';

  -- Re-executavel: rodar de novo REAPONTA, nao estoura no unique.
  perform vincular_externo('REGIONAL','5','regionais', r_nat);
  select count(*) into n from integracao_vinculos where entidade='REGIONAL' and id_externo='5';
  assert n = 1, format('upsert nao pode duplicar; ha %s linhas', n);
  assert registro_do_externo('REGIONAL','5') = r_nat, 'reimportar reaponta o vinculo';
  perform vincular_externo('REGIONAL','5','regionais', r_cba);   -- volta

  -- 🔴 DOIS ids externos podem apontar para o MESMO registro. E o caso do
  -- associado repetido (mesmo CPF duas vezes no Mutual) virando UM cliente.
  perform vincular_externo('PERSON','P1','clientes', cli);
  perform vincular_externo('PERSON','P1-BIS','clientes', cli);
  select count(*) into n from integracao_vinculos where tabela='clientes' and registro_id = cli;
  assert n = 2, format('o unique e SO do lado externo; vieram %s linhas', n);

  -- A allow-list pega o erro de digitacao antes de ele virar vinculo morto.
  begin
    insert into integracao_vinculos (entidade, id_externo, tabela, registro_id)
      values ('PERSON','P3','clientess', cli);
    assert false, 'tabela fora da allow-list tinha de ser recusada';
  exception when check_violation then null;
  end;

  -- Orfao: o vinculo aponta para registro que nao existe mais.
  perform vincular_externo('PERSON','P-FANTASMA','clientes', gen_random_uuid());
  select coalesce(sum(quantidade),0) into n from vinculos_orfaos() where tabela='clientes';
  assert n = 1, format('vinculos_orfaos tinha de achar 1; achou %s', n);
  perform desvincular_externo('PERSON','P-FANTASMA');

  -- ==========================================================================
  -- (C) O DE-PARA DA FILIAL: so a DECISAO vale, nunca o palpite
  -- ==========================================================================
  -- A filial 7 chama-se "Cuiaba 82" e existe uma regional com esse nome exato,
  -- entao o PALPITE acha. O resolvedor da carga NAO pode achar.
  assert mutual_regional_do_externo('7') is null,
    'sem vinculo registrado, a filial NAO resolve — palpite nao carrega carteira';
  select palpite_id into v_uuid from mutual_filiais() where id_externo = '7';
  assert v_uuid = r_cba, 'o palpite por nome existe, e so para a tela';

  perform vincular_externo('REGIONAL','7','regionais', r_nat);
  assert mutual_regional_do_externo('7') = r_nat,
    'registrado o vinculo, ele manda — inclusive CONTRA o palpite por nome';
  perform desvincular_externo('REGIONAL','7');

  -- ==========================================================================
  -- (D) AS FILIAIS contam pelo ASSOCIADO (a versao anterior dava ZERO)
  -- ==========================================================================
  select objetos, faturaveis, associados into n, n2, v_id
    from mutual_filiais() where id_externo = '5';
  assert n = 1 and n2 = 1,
    format('a filial 5 tem 1 objeto faturavel pelo associado; veio objetos=%s fat=%s', n, n2);
  assert v_id = 1, format('a filial 5 tem 1 associado; veio %s', v_id);

  -- ==========================================================================
  -- (E) O FUNIL passou a medir a EQUIPE DE VENDAS (0083)
  -- ==========================================================================
  -- A 0082 media a unidade pela FILIAL do associado. A 0083 descobriu que a
  -- filial e a MACRORREGIAO do Mutual (um "SUDESTE" junta Ribeirao Preto e a
  -- capital, que sao DUAS unidades aqui) e que o nivel equivalente a
  -- `regionais` e a EQUIPE DE VENDAS, no `contract.sales_team_id`.
  --
  -- O resolvedor da filial (secao A) continua valendo e segue testado acima —
  -- ele virou a RESERVA de `mutual_regional_do_objeto`. O que mudou foi o
  -- funil: neste cenario os contratos nao tem `sales_team_id`, entao ele para
  -- no degrau 3, e isso e o comportamento CERTO.
  select objetos into n from mutual_cobertura_unidade(true) where passo = 1;
  assert n = 4, format('4 objetos faturaveis no cenario; o funil viu %s', n);
  select objetos into n from mutual_cobertura_unidade(true) where passo = 2;
  assert n = 4, format('os 4 tem contrato capturado (9001); veio %s', n);
  select objetos into n from mutual_cobertura_unidade(true) where passo = 3;
  assert n = 0,
    format('sem sales_team_id no contrato, NENHUM chega a equipe — e correto; veio %s', n);

  -- ==========================================================================
  -- (F) A QUARENTENA separa os TRES motivos da unidade
  -- ==========================================================================
  select count(*) into n from mutual_quarentena(200, true, true) q
   where 'ASSOCIADO_NAO_CAPTURADO' = any(q.motivos);
  assert n = 1, format('1 objeto com associado nao capturado; veio %s', n);
  select count(*) into n from mutual_quarentena(200, true, true) q
   where 'SEM_UNIDADE' = any(q.motivos);
  assert n = 1, format('1 objeto com associado capturado e sem unidade; veio %s', n);
  select count(*) into n from mutual_quarentena(200, true, true) q
   where 'FILIAL_SEM_DEPARA' = any(q.motivos);
  assert n = 1, format('o objeto 104 aponta para a filial 7, sem vinculo; veio %s', n);

  -- ==========================================================================
  -- (G) 🔴 O INTERRUPTOR — o coracao da entrega
  -- ==========================================================================
  -- Regressao primeiro: veiculo normal continua faturavel. A flag e no-op.
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status,
                        data_ativacao, valor_mensalidade, dia_vencimento)
    values (cli,'OWN1A11', r_cba, tv, 'ativo', current_date - 400, 150.00, 10)
    returning id into v_own;
  assert veiculo_faturavel(v_own, v_comp),
    'veiculo comum tem de seguir faturavel — a coluna nova nasce false';
  assert (select not cobranca_externa from veiculos where id = v_own),
    'o default e false: a carteira que ja existe nao pode mudar de comportamento';

  -- Agora o veiculo importado: nasce ativo E com cobranca externa.
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status,
                        data_ativacao, valor_mensalidade, dia_vencimento, cobranca_externa)
    values (cli,'EXT1A11', r_cba, tv, 'ativo', current_date - 400, 189.90, 10, true)
    returning id into v_ext;

  assert not veiculo_faturavel(v_ext, v_comp),
    'veiculo em cobranca externa NAO pode ser faturavel — e a mina nº 1';
  assert (select cobranca_externa_desde = current_date from veiculos where id = v_ext),
    'a data e carimbada por trigger no proprio insert';

  -- 🔴 E o trigger da entrada na base nao pode ter gerado cobranca nenhuma.
  select count(*) into n from fatura_itens fi where fi.veiculo_id = v_ext;
  assert n = 0, format('importar com cobranca externa NAO pode gerar fatura; gerou %s itens', n);
  -- ...enquanto o veiculo proprio gerou a dele normalmente.
  select count(*) into n from fatura_itens fi where fi.veiculo_id = v_own;
  assert n = 1, format('o veiculo proprio tem de gerar a primeira cobranca; gerou %s', n);

  -- O lote do mes tambem nao alcanca o importado.
  perform gerar_faturas_competencia(v_comp, null);
  select count(*) into n from fatura_itens fi where fi.veiculo_id = v_ext;
  assert n = 0, format('o lote de competencia tambem nao pode alcancar; gerou %s', n);

  -- ==========================================================================
  -- (H) O CUTOVER: virar a chave devolve a unidade ao faturamento
  -- ==========================================================================
  begin
    perform definir_cobranca_externa_regional(r_cba, false, null);
    assert false, 'trazer a cobranca para ca sem motivo tinha de ser recusado';
  exception when raise_exception then null;
  end;

  select definir_cobranca_externa_regional(r_cba, false, 'cutover da unidade') into n;
  assert n = 1, format('1 veiculo tinha de virar; viraram %s', n);
  assert veiculo_faturavel(v_ext, v_comp), 'depois do cutover o veiculo volta a faturar';
  assert (select cobranca_externa_desde is null from veiculos where id = v_ext),
    'voltar para a cobranca propria LIMPA a data — senao a ficha mentiria';

  -- ==========================================================================
  -- (I) COBRANCA EXTERNA NAO E BLOQUEIO DE BENEFICIO
  -- ==========================================================================
  update veiculos set cobranca_externa = true where id = v_ext;
  assert (select pode_acionar from situacao_assistencia_veiculo(v_ext)),
    'quem e cobrado por fora segue com a 24h — nao e inadimplente, e outro caixa';

  -- ==========================================================================
  -- (J) A REGRA DA FASE 1 continua: o modulo nao escreve na operacao
  -- ==========================================================================
  select count(*) into n from titulos_financeiros t
    join fatura_itens fi on fi.veiculo_id = v_ext where t.id is not null;
  perform mutual_diagnostico();
  perform mutual_cobertura_unidade(true);
  perform mutual_filiais();
  perform mutual_quarentena(50, true, true);
  select count(*) into n2 from veiculos;
  assert n2 = 2, format('ler o diagnostico nao pode criar veiculo; ha %s', n2);

  -- ==========================================================================
  -- (K) ISOLAMENTO: quem nao e da matriz nao registra vinculo nem faz cutover
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', u_ope::text, false);
  begin
    perform vincular_externo('PERSON','P-INVASOR','clientes', cli);
    assert false, 'so a matriz registra vinculo';
  exception when raise_exception then null;
  end;
  begin
    perform definir_cobranca_externa_regional(r_cba, true, 'x');
    assert false, 'so a matriz decide o cutover';
  exception when raise_exception then null;
  end;
  select count(*) into n from integracao_vinculos;   -- staff LE
  assert n > 0, 'a equipe le o vinculo (a ficha precisa dizer que veio do Mutual)';
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  raise notice '=== TESTES 0082 (preparacao da carga do Mutual) PASSARAM ===';
end $$;
