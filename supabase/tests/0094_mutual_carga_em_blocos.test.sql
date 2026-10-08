-- Teste funcional da CARGA EM BLOCOS (0094). O que ele prova, em ordem de
-- risco: (1) a unidade resolvida EM CONJUNTO e identica a de linha a linha,
-- objeto a objeto — inclusive nos casos de reserva e de "sem unidade";
-- (2) a carga em blocos grava EXATAMENTE o que a carga de uma vez gravaria,
-- sem fatura; (3) o bloco nunca corta um associado ao meio; (4) a chamada que
-- prepara nao grava nada; (5) fila velha, de outro recorte ou inexistente e
-- recusada com motivo; (6) a chamada antiga, sem bloco, continua igual.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ope uuid := gen_random_uuid();
  r_a uuid; r_b uuid; r_c uuid;
  n int; n2 int; v_txt text; v_rest bigint; v_cria bigint; v_cli bigint;
  rec record;
  voltas int := 0;
  v_fat int; v_tit int;
begin
  -- ===================================================== setup
  insert into auth.users (id, email) values (u_adm,'adm94@t.com'), (u_ope,'ope94@t.com');
  insert into regionais (nome) values ('Unidade A 94') returning id into r_a;
  insert into regionais (nome) values ('Unidade B 94') returning id into r_b;
  insert into regionais (nome) values ('Unidade C 94') returning id into r_c;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm94@t.com','admin', null),
           (u_ope,'Operador','ope94@t.com','gestor_regional', r_a);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- Equipe 50 -> A, equipe 51 -> B. A filial 7 (do associado) -> C.
  perform vincular_externo('SALE_TEAM','50','regionais', r_a);
  perform vincular_externo('SALE_TEAM','51','regionais', r_b);
  perform vincular_externo('REGIONAL','7','regionais', r_c);

  perform mutual_registrar_captura('PERSON', jsonb_build_array(
    jsonb_build_object('id','Q1','name','ANA UM','cpf_cnpj','123.456.789-09','person_type','1','regional_id','7'),
    jsonb_build_object('id','Q2','name','BRUNO DOIS','cpf_cnpj','987.654.321-00','person_type','1'),
    jsonb_build_object('id','Q3','name','CARLA TRES','cpf_cnpj','246.813.579-28','person_type','1','regional_id','7'),
    jsonb_build_object('id','Q4','name','DIEGO QUATRO','cpf_cnpj','135.792.468-28','person_type','1'),
    jsonb_build_object('id','Q5','name','ELISA CINCO','cpf_cnpj','192.837.465-46','person_type','1')
  ));

  perform mutual_registrar_captura('CONTRACT', jsonb_build_array(
    jsonb_build_object('id','C50','sales_team_id','50','due_day','10','created_at','2020-01-01T12:00:00Z'),
    jsonb_build_object('id','C51','sales_team_id','51','due_day','12','created_at','2020-01-01T12:00:00Z'),
    jsonb_build_object('id','C99','sales_team_id','99','due_day','5', 'created_at','2020-01-01T12:00:00Z'),
    jsonb_build_object('id','CSE','due_day','5','created_at','2020-01-01T12:00:00Z')
  ));

  -- A unidade A tem 5 veiculos de 3 associados (Q2 com DOIS, Q4 com DOIS) e
  -- uma recusa (sem placa). Os demais objetos exercitam a precedencia.
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','201','contract_id','C50','contract_status','ATIVO','status','ATIVO',
      'final_total_value','150','first_activation_date','2021-01-01T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','AAA1A01','vehicle_type','1'),
      'person_data', jsonb_build_object('person_id','Q2','person_cpf_cnpj','987.654.321-00')),
    jsonb_build_object('id','202','contract_id','C50','contract_status','ATIVO','status','ATIVO',
      'final_total_value','160','first_activation_date','2021-02-01T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','AAA1A02','vehicle_type','1'),
      'person_data', jsonb_build_object('person_id','Q2','person_cpf_cnpj','987.654.321-00')),
    jsonb_build_object('id','203','contract_id','C50','contract_status','ATIVO','status','ATIVO',
      'final_total_value','170','first_activation_date','2021-03-01T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','AAA1A03','vehicle_type','1'),
      'person_data', jsonb_build_object('person_id','Q4','person_cpf_cnpj','135.792.468-28')),
    jsonb_build_object('id','204','contract_id','C50','contract_status','ATIVO','status','ATIVO',
      'final_total_value','180','first_activation_date','2021-04-01T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','AAA1A04','vehicle_type','1'),
      'person_data', jsonb_build_object('person_id','Q4','person_cpf_cnpj','135.792.468-28')),
    jsonb_build_object('id','205','contract_id','C50','contract_status','ATIVO','status','ATIVO',
      'final_total_value','190','first_activation_date','2021-05-01T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_plate','AAA1A05','vehicle_type','1'),
      'person_data', jsonb_build_object('person_id','Q5','person_cpf_cnpj','192.837.465-46')),
    -- 206: sem placa -> RECUSA (nao entra na fila)
    jsonb_build_object('id','206','contract_id','C50','contract_status','ATIVO','status','ATIVO',
      'final_total_value','100','first_activation_date','2021-06-01T12:00:00Z',
      'vehicle_data', jsonb_build_object('vehicle_chassi','9BWZZZ377VT000206'),
      'person_data', jsonb_build_object('person_id','Q5','person_cpf_cnpj','192.837.465-46')),
    -- 207: a equipe vem so no OBJETO (o contrato nao tem) -> B
    jsonb_build_object('id','207','created_at','2020-05-01T12:00:00Z','contract_id','CSE','sales_team_id','51','contract_status','ATIVO','status','ATIVO',
      'vehicle_data', jsonb_build_object('vehicle_plate','BBB2B07'),
      'person_data', jsonb_build_object('person_id','Q1')),
    -- 208: equipe do CONTRATO manda mesmo com filial do associado -> B (nao C)
    jsonb_build_object('id','208','created_at','2020-05-01T12:00:00Z','contract_id','C51','contract_status','ATIVO','status','ATIVO',
      'vehicle_data', jsonb_build_object('vehicle_plate','BBB2B08'),
      'person_data', jsonb_build_object('person_id','Q1')),
    -- 209: sem contrato capturado -> reserva: a filial do associado -> C
    jsonb_build_object('id','209','created_at','2020-05-01T12:00:00Z','contract_id','NAOEXISTE','contract_status','ATIVO','status','ATIVO',
      'vehicle_data', jsonb_build_object('vehicle_plate','CCC3C09'),
      'person_data', jsonb_build_object('person_id','Q3')),
    -- 210: equipe 99 sem vinculo e associado sem filial -> SEM unidade
    jsonb_build_object('id','210','created_at','2020-05-01T12:00:00Z','contract_id','C99','contract_status','ATIVO','status','ATIVO',
      'vehicle_data', jsonb_build_object('vehicle_plate','DDD4D10'),
      'person_data', jsonb_build_object('person_id','Q2')),
    -- 211: equipe 99 sem vinculo, MAS associado com filial -> C (reserva)
    jsonb_build_object('id','211','created_at','2020-05-01T12:00:00Z','contract_id','C99','contract_status','ATIVO','status','ATIVO',
      'vehicle_data', jsonb_build_object('vehicle_plate','DDD4D11'),
      'person_data', jsonb_build_object('person_id','Q3')),
    -- 212: filial no OBJETO (associado nao capturado) -> C
    jsonb_build_object('id','212','created_at','2020-05-01T12:00:00Z','contract_id','NAOEXISTE','regional_id','7','contract_status','ATIVO','status','ATIVO',
      'vehicle_data', jsonb_build_object('vehicle_plate','DDD4D12'),
      'person_data', jsonb_build_object('person_id','QX','person_cpf_cnpj','564.738.291-64',
        'person_name','FABIO SEIS'))
  ));

  -- ==========================================================================
  -- (1) O CONJUNTO E IDENTICO AO LINHA A LINHA, OBJETO A OBJETO
  -- ==========================================================================
  select count(*), count(*) filter (where u.regional_id is distinct from
           mutual_regional_do_objeto(o.payload, c.payload))
    into n, n2
    from mutual_captura o
    join mutual_unidade_dos_objetos() u on u.id_externo = o.id_externo
    left join mutual_captura c on c.entidade = 'CONTRACT' and not c.deletado
                              and c.id_externo = o.payload->>'contract_id'
   where o.entidade = 'CONTRACT_OBJECT' and not o.deletado;
  assert n = 12, format('o conjunto tem de trazer os 12 objetos, um por linha; veio %s', n);
  assert n2 = 0, format('conjunto e linha a linha divergem em %s objeto(s)', n2);

  -- e os casos de precedencia, nomeados (para o erro dizer QUAL quebrou)
  assert (select regional_id from mutual_unidade_dos_objetos() where id_externo = '207') = r_b,
    'equipe so no objeto: B';
  assert (select regional_id from mutual_unidade_dos_objetos() where id_externo = '208') = r_b,
    'a equipe do CONTRATO vence a filial do associado';
  assert (select regional_id from mutual_unidade_dos_objetos() where id_externo = '209') = r_c,
    'sem contrato: a filial do associado e a reserva';
  assert (select regional_id from mutual_unidade_dos_objetos() where id_externo = '210') is null,
    'sem equipe vinculada e sem filial: sem unidade';
  assert (select regional_id from mutual_unidade_dos_objetos() where id_externo = '211') = r_c,
    'equipe sem vinculo cai na filial do associado';
  assert (select regional_id from mutual_unidade_dos_objetos() where id_externo = '212') = r_c,
    'filial no objeto quando o associado nao foi capturado';

  -- As telas de de-para seguem contando a unidade certa.
  assert (select count(*) from mutual_carga_linhas(r_a)) = 6,
    'a leitura da carga de A traz os 6 objetos de A';
  perform * from mutual_planos_externos(r_a);
  perform * from mutual_categorias_veiculo(r_a);

  -- ==========================================================================
  -- (2) A CHAMADA QUE PREPARA NAO GRAVA NADA
  -- ==========================================================================
  select count(*) into v_fat from faturas;
  select count(*) into v_tit from titulos_financeiros;

  select restantes, recusados into v_rest, v_cria
    from mutual_executar_carga(r_a, false, true, 2, true);
  assert v_rest = 5, format('a fila de A tem 5 linhas boas; veio %s', v_rest);
  assert v_cria = 1, format('e 1 recusa (sem placa); veio %s', v_cria);
  assert (select count(*) from veiculos where regional_id = r_a) = 0,
    'preparar nao pode gravar veiculo';
  assert (select count(*) from mutual_carga_fila where regional_id = r_a) = 5,
    'a fila guarda as 5 linhas boas';

  -- ==========================================================================
  -- (3) O BLOCO NAO CORTA O ASSOCIADO AO MEIO
  -- ==========================================================================
  -- Ordem da fila = documento: Q2 (987...) e Q4 (135...) tem DOIS veiculos
  -- cada. Com bloco de 1, o primeiro bloco tem de levar os DOIS do primeiro
  -- associado da ordem (135... = Q4).
  select veiculos_criados, clientes_criados, restantes into v_cria, v_cli, v_rest
    from mutual_executar_carga(r_a, false, true, 1, false);
  assert v_cria = 2, format('bloco de 1 estendido ate o fim do CPF: 2 veiculos; veio %s', v_cria);
  assert v_cli = 1,  format('1 associado no primeiro bloco; veio %s', v_cli);
  assert v_rest = 3, format('faltam 3 na fila; veio %s', v_rest);

  -- O resto, em blocos de 1, ate esvaziar.
  loop
    voltas := voltas + 1;
    select restantes into v_rest from mutual_executar_carga(r_a, false, true, 1, false);
    exit when v_rest = 0 or voltas > 10;
  end loop;
  assert v_rest = 0, 'a fila esvazia';
  assert voltas = 2, format('Q5 (1) e Q2 (2) em dois blocos; foram %s', voltas);

  -- ==========================================================================
  -- (4) O QUE FOI GRAVADO E O QUE A CARGA DE UMA VEZ GRAVARIA
  -- ==========================================================================
  assert (select count(*) from veiculos where regional_id = r_a) = 5, 'os 5 veiculos de A';
  assert (select count(*) from veiculos where regional_id = r_a and not cobranca_externa) = 0,
    'todo veiculo da carga entra com cobranca_externa';
  assert (select count(*) from clientes where regional_id = r_a) = 3, '3 associados (um por CPF)';
  assert (select count(*) from veiculos v join clientes c on c.id = v.cliente_id
           where v.regional_id = r_a and c.cpf_cnpj = '13579246828') = 2,
    'os dois veiculos de Q4 penduram no MESMO cliente';
  assert (select count(*) from faturas) = v_fat, 'a carga em blocos nao gera fatura';
  assert (select count(*) from titulos_financeiros) = v_tit, 'nem titulo';
  assert (select count(*) from integracao_vinculos
           where entidade = 'CONTRACT_OBJECT' and tabela = 'veiculos') = 5,
    'cada veiculo com o seu vinculo (a re-execucao depende dele)';

  -- Continuar sem fila: avisa, nao grava, nao estoura.
  select restantes, mensagem into v_rest, v_txt
    from mutual_executar_carga(r_a, false, true, 1, false);
  assert v_rest = 0 and v_txt ilike 'Nada na fila%', format('fila vazia avisa; veio %L', v_txt);

  -- Re-executar em blocos ATUALIZA e nao duplica.
  perform mutual_executar_carga(r_a, false, true, 100, true);
  select veiculos_criados, veiculos_atualizados, restantes into v_cria, v_cli, v_rest
    from mutual_executar_carga(r_a, false, true, 100, false);
  assert v_cria = 0 and v_cli = 5 and v_rest = 0,
    format('segunda rodada: 0 criados, 5 atualizados; veio %s/%s', v_cria, v_cli);
  assert (select count(*) from veiculos where regional_id = r_a) = 5, 'nao duplicou';

  -- ==========================================================================
  -- (5) FILA VELHA OU DE OUTRO RECORTE E RECUSADA
  -- ==========================================================================
  perform mutual_executar_carga(r_a, false, true, 1, true);
  update mutual_carga_fila set preparada_em = now() - interval '2 hours' where regional_id = r_a;
  begin
    perform mutual_executar_carga(r_a, false, true, 1, false);
    assert false, 'fila de mais de 1 hora tem de ser recusada';
  exception when raise_exception then
    get stacked diagnostics v_txt = message_text;
    assert v_txt ilike '%mais de 1 hora%', format('motivo errado: %s', v_txt);
  end;

  perform mutual_executar_carga(r_a, false, true, 1, true);
  begin
    perform mutual_executar_carga(r_a, true, true, 1, false);
    assert false, 'fila preparada com outro recorte tem de ser recusada';
  exception when raise_exception then
    get stacked diagnostics v_txt = message_text;
    assert v_txt ilike '%outro recorte%', format('motivo errado: %s', v_txt);
  end;
  delete from mutual_carga_fila where regional_id = r_a;

  -- ==========================================================================
  -- (6) A CHAMADA ANTIGA (SEM BLOCO) CONTINUA FAZENDO TUDO DE UMA VEZ
  -- ==========================================================================
  select veiculos_criados, restantes into v_cria, v_rest
    from mutual_executar_carga(r_c, false, true);
  assert v_cria = 3, format('C recebe 209, 211 e 212 de uma vez; veio %s', v_cria);
  assert v_rest = 0, 'sem bloco nada sobra na fila';
  assert (select count(*) from mutual_carga_fila) = 0, 'e a fila fica vazia';

  -- A simulacao segue sem gravar.
  select veiculos_criados into v_cria from mutual_executar_carga(r_b);
  assert v_cria = 2, format('a simulacao de B preve 2; veio %s', v_cria);
  assert (select count(*) from veiculos where regional_id = r_b) = 0, 'simulacao nao grava';

  -- ==========================================================================
  -- (7) SO A MATRIZ CARREGA — e a fila nao e lida por ninguem de fora
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', u_ope::text, false);
  begin
    perform mutual_executar_carga(r_a, false, true, 1, true);
    assert false, 'gestor regional nao executa a carga';
  exception when raise_exception then null;
  end;
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  assert (select relrowsecurity from pg_class where relname = 'mutual_carga_fila'),
    'a fila tem RLS ligada';
  assert not exists (select 1 from pg_policies where tablename = 'mutual_carga_fila'),
    'e nenhuma policy: so as funcoes da carga a tocam';

  raise notice '=== 0094 mutual_carga_em_blocos: TODOS OS TESTES PASSARAM ===';
end $$;
