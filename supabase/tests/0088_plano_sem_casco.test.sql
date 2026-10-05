-- Teste funcional do PLANO SEM CASCO (0088). O que ele prova: plano marcado
-- tira o casco OBRIGATORIO do detalhamento e do total; plano nao marcado nao
-- muda nada; a ficha do SAC e os itens obrigatorios da cotacao seguem junto;
-- casco amarrado como OPCIONAL fica; e o override do veiculo continua mandando
-- no boleto.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  tv uuid; p_com uuid; p_sem uuid; p_opc uuid; prod_casco uuid; prod_rcf uuid; prod_opc uuid;
  r_mat uuid; cli uuid; veic uuid;
  base jsonb; com jsonb; sem jsonb; v_casco numeric; n int; v_num numeric;
begin
  -- ===================================================== setup
  insert into auth.users (id, email) values (u_adm, 'adm88@t.com');
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm, 'Admin', 'adm88@t.com', 'admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into regionais (nome) values ('Matriz 88') returning id into r_mat;

  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  select id into prod_casco from produtos where categoria = 'CASCO' and obrigatorio and status limit 1;
  select id into prod_rcf   from produtos where categoria = 'RCF' and status order by nome limit 1;
  assert tv is not null and prod_casco is not null and prod_rcf is not null,
    'o seed tem de trazer Passeio, o casco obrigatorio e um RCF';

  insert into planos_protecao (nome) values ('COM CASCO 88') returning id into p_com;
  insert into planos_protecao (nome, sem_casco) values ('MOTO SEM CASCO 88', true) returning id into p_sem;
  insert into plano_produtos (plano_id, produto_id) values (p_com, prod_rcf), (p_sem, prod_rcf);

  base := cotar_plano(50000, tv, p_com);
  sem  := cotar_plano(50000, tv, p_sem);

  select (i->>'valor')::numeric into v_casco
    from jsonb_array_elements(base->'detalhamento_produtos') i
   where i->>'categoria' = 'CASCO';
  assert coalesce(v_casco, 0) > 0,
    format('a faixa de 50k precisa ter casco para o teste valer; veio %s', v_casco);

  -- ==========================================================================
  -- (A) A REGRESSAO: plano NAO marcado e coluna default nao mudam nada
  -- ==========================================================================
  select count(*) into n from planos_protecao where sem_casco;
  assert n = 1, 'so o plano marcado no teste e sem casco — o default e false';
  assert (base->>'sem_casco')::boolean = false, 'plano comum devolve sem_casco = false';
  select count(*) into n from jsonb_array_elements(base->'detalhamento_produtos') i
   where i->>'categoria' = 'CASCO';
  assert n = 1, 'plano comum continua com o casco da base';
  assert (cotar_plano(50000, tv)->>'sem_casco')::boolean = false, 'sem plano: nada muda';

  -- ==========================================================================
  -- (B) PLANO SEM CASCO: o casco sai do detalhamento E do total
  -- ==========================================================================
  assert (sem->>'sem_casco')::boolean, 'o retorno anuncia sem_casco';
  select count(*) into n from jsonb_array_elements(sem->'detalhamento_produtos') i
   where i->>'categoria' = 'CASCO';
  assert n = 0, 'plano sem casco nao pode mostrar casco';
  assert (sem->>'valor_total_mensalidade')::numeric
       = (base->>'valor_total_mensalidade')::numeric - v_casco,
    format('o total cai exatamente o casco (%s): %s x %s', v_casco,
           sem->>'valor_total_mensalidade', base->>'valor_total_mensalidade');

  -- O resto da base e o opcional do plano ficam.
  select count(*) into n from jsonb_array_elements(sem->'detalhamento_produtos') i
   where i->>'categoria' = 'ADMIN';
  assert n = 1, 'a Taxa Adm continua';
  select count(*) into n from jsonb_array_elements(sem->'detalhamento_produtos') i
   where (i->>'produto_id')::uuid = prod_rcf;
  assert n = 1, 'o RCF do plano continua';
  assert jsonb_array_length(sem->'detalhamento_produtos')
       = jsonb_array_length(base->'detalhamento_produtos') - 1,
    'sai UMA linha so';

  -- Adesao e participacao nao se movem (decisao 5).
  assert (sem->>'taxa_adesao')::numeric = (base->>'taxa_adesao')::numeric, 'adesao intacta';
  assert (sem->>'franquia_participacao')::numeric = (base->>'franquia_participacao')::numeric,
    'participacao intacta';

  -- Vale com adicional regional tambem: o adicional segue somado uma vez.
  perform salvar_adicional_risco(r_mat, tv, 5.00, 'teste 88');
  assert (cotar_plano(50000, tv, p_sem, '{}'::uuid[], r_mat)->>'valor_total_mensalidade')::numeric
       = (sem->>'valor_total_mensalidade')::numeric + 5.00,
    'o adicional regional continua somado uma vez no plano sem casco';

  -- ==========================================================================
  -- (C) OS CONSUMIDORES seguem junto: itens obrigatorios da cotacao
  -- ==========================================================================
  select count(*) into n from produtos_obrigatorios_cotacao(tv, p_sem, 50000) where produto_id = prod_casco;
  assert n = 0, 'o casco deixa de ser item obrigatorio da cotacao no plano sem casco';
  select count(*) into n from produtos_obrigatorios_cotacao(tv, p_com, 50000) where produto_id = prod_casco;
  assert n = 1, 'e continua obrigatorio no plano comum';

  -- ==========================================================================
  -- (D) A FICHA DO SAC — o motivo da migration
  -- ==========================================================================
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'ASSOCIADO 88', '52998224725', r_mat) returning id into cli;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, valor_fipe,
                        status, data_ativacao, plano_protecao_id, valor_mensalidade, cobranca_externa)
    values (cli, 'QCC8H88', r_mat, tv, 50000, 'ativo', current_date, p_sem, 97.00, true)
    returning id into veic;

  select count(*) into n from opcionais_veiculo(veic) where produto_id = prod_casco;
  assert n = 0, 'a ficha do SAC nao mostra casco para veiculo em plano sem casco';
  select count(*) into n from opcionais_veiculo(veic) where produto_id = prod_rcf;
  assert n = 1, 'e mostra o que o plano tem';

  -- O boleto do migrado segue o override, nao o motor.
  select valor_mensalidade_veiculo(veic) into v_num;
  assert v_num = 97.00, format('o override (97) manda no valor; veio %s', v_num);

  -- ==========================================================================
  -- (E) CASCO AMARRADO COMO OPCIONAL FICA (decisao 2)
  -- ==========================================================================
  insert into produtos (nome, categoria, metodo_preco, obrigatorio, status, valor_fixo)
    values ('CASCO OPCIONAL 88', 'CASCO', 'FIXO', false, true, 12.00)
    returning id into prod_opc;
  insert into planos_protecao (nome, sem_casco) values ('SEM BASE COM OPC 88', true) returning id into p_opc;
  insert into plano_produtos (plano_id, produto_id) values (p_opc, prod_opc);

  com := cotar_plano(50000, tv, p_opc);
  select count(*) into n from jsonb_array_elements(com->'detalhamento_produtos') i
   where (i->>'produto_id')::uuid = prod_opc;
  assert n = 1, 'casco OPCIONAL amarrado ao plano continua';
  select count(*) into n from jsonb_array_elements(com->'detalhamento_produtos') i
   where (i->>'produto_id')::uuid = prod_casco;
  assert n = 0, 'e o casco da base continua fora';

  raise notice '=== 0088 plano_sem_casco: TODOS OS TESTES PASSARAM ===';
end $$;
