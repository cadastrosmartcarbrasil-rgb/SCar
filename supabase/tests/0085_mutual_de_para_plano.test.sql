-- Teste funcional do DE-PARA DO PLANO (0085). O que ele prova: a entidade
-- PLAN passa a ser capturavel; o de-para funciona SEM a captura (so sem
-- nome); a ordem e por PESO e a cobertura acumulada fecha em 100%; plano que
-- aparece so no objeto nao desaparece da lista; e o `destino_id` do tipo de
-- veiculo passou a se chamar pelo que e.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ass uuid := gen_random_uuid();
  r_mat uuid; r_out uuid; pl_ouro uuid; pl_prata uuid; tv uuid;
  n int; v_txt text; v_uuid uuid; v_num numeric; v_bool boolean;
begin
  -- ===================================================== setup
  insert into auth.users (id, email) values (u_adm,'adm85@t.com'), (u_ass,'ass85@t.com');
  insert into regionais (nome) values ('Matriz 85')  returning id into r_mat;
  insert into regionais (nome) values ('Vizinha 85') returning id into r_out;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm85@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into pl_ouro  from planos_protecao where nome ilike '%ouro%'  limit 1;
  select id into pl_prata from planos_protecao where nome ilike '%prata%' limit 1;
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  perform mutual_registrar_captura('SALE_TEAM', jsonb_build_array(
    jsonb_build_object('id','90','name','EQUIPE MATRIZ 85'),
    jsonb_build_object('id','91','name','EQUIPE VIZINHA 85')
  ));
  perform vincular_externo('SALE_TEAM','90','regionais', r_mat);
  perform vincular_externo('SALE_TEAM','91','regionais', r_out);

  perform mutual_registrar_captura('CONTRACT', jsonb_build_array(
    jsonb_build_object('id','7001','sales_team_id','90'),
    jsonb_build_object('id','7002','sales_team_id','91')
  ));

  -- ==========================================================================
  -- (A) `PLAN` VIRA CAPTURAVEL — antes da 0085 o CHECK recusava
  -- ==========================================================================
  perform mutual_registrar_captura('PLAN', jsonb_build_array(
    jsonb_build_object('id','500','name','OURO MUTUAL'),
    jsonb_build_object('id','501','name','PRATA MUTUAL'),
    jsonb_build_object('id','509','name','PLANO SEM CARTEIRA')
  ));
  select count(*) into n from mutual_captura where entidade='PLAN' and not deletado;
  assert n = 3, format('a entidade PLAN tem de ser aceita pela allow-list; veio %s', n);

  -- 🔴 A LISTA INTEIRA, nao so a nova. A primeira versao da 0085 redigitou a
  -- allow-list e derrubou `'CONTRACT'` sem querer — a entidade que guarda o dia
  -- de vencimento (0064) e a sales_team_id (0083). Afirmar so o valor novo
  -- deixaria isso passar; afirmar as 15 fecha a porta para sempre.
  foreach v_txt in array array[
    'CONTRACT_OBJECT','CONTRACT','PERSON','ADDRESS','INVOICE','EVENT',
    'REGIONAL','SALE_TEAM','CONSULTANT','PLAN',
    'VEHICLE_TYPE','VEHICLE_COLOR','VEHICLE_CATEGORY','VEHICLE_USE_TYPE','EVENT_TYPE'
  ] loop
    begin
      insert into mutual_captura (entidade, id_externo, payload)
      values (v_txt, 'guarda-' || v_txt, '{}'::jsonb);
    exception when check_violation then
      assert false, format('a allow-list de mutual_captura PERDEU a entidade %L', v_txt);
    end;
  end loop;
  delete from mutual_captura where id_externo like 'guarda-%';

  -- 4 veiculos no plano 500, 2 no 501, 1 no 502 (que NAO foi capturado),
  -- e 1 na unidade vizinha (para provar o recorte por unidade).
  perform mutual_registrar_captura('CONTRACT_OBJECT', jsonb_build_array(
    jsonb_build_object('id','801','contract_id','7001','contract_status','ATIVO',
      'status','ATIVO','plan_id','500','final_total_value','200.00',
      'vehicle_data', jsonb_build_object('vehicle_plate','AAA1A01','vehicle_price','50000',
                                         'vehicle_type','1')),
    jsonb_build_object('id','802','contract_id','7001','contract_status','ATIVO',
      'status','ATIVO','plan_id','500','final_total_value','220.00',
      'vehicle_data', jsonb_build_object('vehicle_plate','AAA1A02','vehicle_price','90000',
                                         'vehicle_type','1')),
    jsonb_build_object('id','803','contract_id','7001','contract_status','ATIVO',
      'status','ATIVO','plan_id','500','final_total_value','240.00',
      'vehicle_data', jsonb_build_object('vehicle_plate','AAA1A03','vehicle_price','120000',
                                         'vehicle_type','1')),
    -- INATIVO: conta em `veiculos`, nao em `faturaveis`
    jsonb_build_object('id','804','contract_id','7001','contract_status','INATIVO',
      'status','INATIVO','plan_id','500','final_total_value','210.00',
      'vehicle_data', jsonb_build_object('vehicle_plate','AAA1A04','vehicle_price','60000',
                                         'vehicle_type','1')),
    jsonb_build_object('id','805','contract_id','7001','contract_status','ATIVO',
      'status','ATIVO','plan_id','501','final_total_value','130.00',
      'vehicle_data', jsonb_build_object('vehicle_plate','BBB2B01','vehicle_price','20000',
                                         'vehicle_type','2')),
    jsonb_build_object('id','806','contract_id','7001','contract_status','ATIVO',
      'status','ATIVO','plan_id','501','final_total_value','140.00',
      'vehicle_data', jsonb_build_object('vehicle_plate','BBB2B02','vehicle_price','22000',
                                         'vehicle_type','2')),
    -- 502 NAO esta em mutual_captura: e o caso que nao pode desaparecer
    jsonb_build_object('id','807','contract_id','7001','contract_status','ATIVO',
      'status','ATIVO','plan_id','502','final_total_value','300.00',
      'vehicle_data', jsonb_build_object('vehicle_plate','CCC3C01','vehicle_price','80000',
                                         'vehicle_type','1')),
    -- da unidade VIZINHA
    jsonb_build_object('id','808','contract_id','7002','contract_status','ATIVO',
      'status','ATIVO','plan_id','500','final_total_value','250.00',
      'vehicle_data', jsonb_build_object('vehicle_plate','DDD4D01','vehicle_price','70000',
                                         'vehicle_type','1'))
  ));

  -- ==========================================================================
  -- (B) O DE-PARA FUNCIONA SEM A CAPTURA — e o nome e um BONUS
  -- ==========================================================================
  -- 502 tem carteira e nao tem nome: ele e justamente um dos que falta
  -- mapear, entao sumir da lista seria o pior desfecho.
  select nome, capturado, faturaveis into v_txt, v_bool, n
    from mutual_planos_externos(r_mat) where id_externo = '502';
  assert v_txt is null, 'plano nao capturado nao tem nome';
  assert not v_bool,    'e ele tem de estar marcado como NAO capturado';
  assert n = 1, format('mas o PESO dele tem de aparecer; veio %s', n);

  -- E o capturado traz o nome.
  select nome, capturado into v_txt, v_bool
    from mutual_planos_externos(r_mat) where id_externo = '500';
  assert v_txt = 'OURO MUTUAL', format('o nome vem da captura; veio %L', v_txt);
  assert v_bool, 'e ele esta capturado';

  -- Plano capturado SEM carteira continua na lista, com zero.
  select veiculos, faturaveis into n, v_num
    from mutual_planos_externos(r_mat) where id_externo = '509';
  assert n = 0 and v_num = 0, 'plano sem carteira aparece zerado, nao desaparece';

  -- ==========================================================================
  -- (C) O PESO E O RECORTE POR UNIDADE
  -- ==========================================================================
  select veiculos, faturaveis into n, v_num
    from mutual_planos_externos(r_mat) where id_externo = '500';
  assert n = 4, format('4 objetos no 500 na matriz (o inativo conta aqui); veio %s', n);
  assert v_num = 3, format('mas so 3 sao faturaveis; veio %s', v_num);

  -- 🔴 O recorte por UNIDADE: o objeto 808 e da vizinha e nao pode entrar no
  -- peso da matriz — senao a tela ordenaria por um volume que nao e o da
  -- unidade que esta sendo carregada.
  select faturaveis into v_num from mutual_planos_externos(r_out) where id_externo='500';
  assert v_num = 1, format('na vizinha o 500 tem 1 faturavel; veio %s', v_num);
  select faturaveis into v_num from mutual_planos_externos(null) where id_externo='500';
  assert v_num = 4, format('sem unidade e a base inteira: 4; veio %s', v_num);

  -- A ordem e por PESO decrescente.
  select id_externo into v_txt from mutual_planos_externos(r_mat) limit 1;
  assert v_txt = '500', format('o mais pesado vem primeiro; veio %L', v_txt);

  -- ==========================================================================
  -- (D) A COBERTURA ACUMULADA — e o que diz ONDE PARAR
  -- ==========================================================================
  -- Matriz: 500=3 · 501=2 · 502=1 (total 6). Acumulado: 50% · 83,3% · 100%.
  select cobertura_acumulada into v_num
    from mutual_planos_externos(r_mat) where id_externo = '500';
  assert v_num = 50.0, format('o primeiro cobre 50%%; veio %s', v_num);
  select cobertura_acumulada into v_num
    from mutual_planos_externos(r_mat) where id_externo = '502';
  assert v_num = 100.0, format('o ultimo COM carteira fecha em 100%%; veio %s', v_num);

  -- ==========================================================================
  -- (E) O PERFIL ENTRA COMO PERFIL, NAO COMO IDENTIFICACAO
  -- ==========================================================================
  -- Foi medido que a FIPE varia 6x a 14x dentro do mesmo plan_id — entao a
  -- funcao devolve a FAIXA, que e o que permite DESCONFIAR de um id generico.
  select mensalidade_mediana, fipe_min, fipe_max into v_num, n, v_txt
    from mutual_planos_externos(r_mat) where id_externo = '500';
  -- `percentile_cont` INTERPOLA (mesma escolha da 0064): a mediana de
  -- 200/210/220/240 e (210+220)/2 = 215, um valor que nao existe na amostra.
  -- Para PERFIL isso serve; nao use este numero como se fosse um preco real.
  assert v_num = 215.00, format('mediana interpolada de 200/210/220/240 e 215; veio %s', v_num);
  select fipe_min, fipe_max into v_num, n from mutual_planos_externos(r_mat)
   where id_externo = '500';
  assert v_num = 50000, format('fipe minima; veio %s', v_num);
  assert n = 120000,    format('fipe maxima — a faixa larga e o sinal; veio %s', n);

  select tipos into v_txt from mutual_planos_externos(r_mat) where id_externo = '501';
  assert v_txt = '2', format('o 501 e so de tipo 2 (moto); veio %L', v_txt);

  -- ==========================================================================
  -- (F) REGISTRAR O DE-PARA, E ELE CHEGA NA CARGA
  -- ==========================================================================
  perform vincular_externo('PLAN','500','planos_protecao', pl_ouro);
  perform vincular_externo('PLAN','501','planos_protecao', pl_prata);

  select destino_id, plano_nome into v_uuid, v_txt
    from mutual_planos_externos(r_mat) where id_externo = '500';
  assert v_uuid = pl_ouro, 'o destino vem do vinculo registrado';
  assert v_txt ilike '%ouro%', format('e a tela mostra o nome do plano daqui; veio %L', v_txt);

  assert mutual_plano_do_externo('500') = pl_ouro,
    'o resolvedor da CARGA (0084) le o mesmo vinculo';
  assert mutual_plano_do_externo('502') is null,
    'id sem de-para continua nulo — a carga nao chuta plano';

  -- ==========================================================================
  -- (G) O NOME DA COLUNA DO TIPO DE VEICULO DEIXOU DE MENTIR
  -- ==========================================================================
  perform mutual_registrar_captura('VEHICLE_TYPE', jsonb_build_array(
    jsonb_build_object('id','1','name','CARRO'),
    jsonb_build_object('id','2','name','MOTO')
  ));
  perform vincular_externo('VEHICLE_TYPE','1','tipos_veiculo', tv);

  select destino_id into v_uuid from mutual_tipos_veiculo_externos() where id_externo='1';
  assert v_uuid = tv,
    'a coluna do destino do TIPO agora chama-se destino_id (era regional_id na 0084, '
    'guardando um tipos_veiculo.id)';
  select faturaveis into v_num from mutual_tipos_veiculo_externos() where id_externo='1';
  assert v_num = 5, format('5 faturaveis de tipo 1 na base toda; veio %s', v_num);

  -- ==========================================================================
  -- (H) QUEM NAO E STAFF NAO LE
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', u_ass::text, false);
  begin
    perform * from mutual_planos_externos(null);
    assert false, 'quem nao e staff nao pode ler o de-para';
  exception when others then null;
  end;
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- ==========================================================================
  -- (I) A REGRA DA FASE CONTINUA: nada escreveu na operacao
  -- ==========================================================================
  assert (select count(*) from clientes) = 0, 'o de-para nao cria associado';
  assert (select count(*) from veiculos) = 0, 'o de-para nao cria veiculo';

  raise notice '=== TODOS OS TESTES DO DE-PARA DO PLANO (0085) PASSARAM ===';
end $$;
