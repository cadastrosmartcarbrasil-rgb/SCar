-- Teste funcional da 0074 — o funil do consultor conta UMA vez por veiculo.
--
-- A 0073 media a corrente objeto -> consultor -> vendedor -> unidade, e a suite
-- dela prova que a perda cai no degrau certo. O que nenhuma suite pegava: com
-- `vendedores` repetindo E-MAIL ou NOME (nenhum dos dois e unico), o left join
-- multiplicava a linha do VEICULO e o funil inteiro inflava. O cenario abaixo
-- so existe para isso — ele passa com qualquer versao que conte certo e falha
-- com a da 0073.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; n bigint; f record; txt text;
begin
  insert into auth.users (id, email) values (u_adm,'adm74@t.com');
  insert into regionais (nome) values ('Natal 74') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm74@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- ==========================================================================
  -- (A) A ORDEM DAS CANDIDATAS E PROMESSA, nao coincidencia
  -- ==========================================================================
  -- Os helpers existem para nao chutar o nome do campo: a lista vem em ordem de
  -- preferencia. `limit 1` sem `order by` devolvia "a primeira que o
  -- planejador entregasse" — que hoje bate com o array por acaso.
  assert mutual_texto_em('{"cpf":"222","cpf_cnpj":"111"}'::jsonb,
                          array['cpf_cnpj','cpf']) = '111',
    'com as DUAS chaves preenchidas vence a primeira da lista, sempre';
  assert mutual_chave_em('{"cpf":"222","cpf_cnpj":"111"}'::jsonb,
                          array['cpf_cnpj','cpf']) = 'cpf_cnpj',
    'e a funcao diz qual pegou — e a resposta tem de ser a mesma da de cima';
  assert mutual_texto_em('{"doc":"9","document":"8"}'::jsonb,
                          array['cpf_cnpj','cpf','document','documento','doc']) = '8',
    'a ordem vale no meio da lista tambem, nao so na primeira posicao';
  -- o que a 0073 ja garantia continua valendo
  assert mutual_texto_em('{"cpf_cnpj":"","cpf":"123"}'::jsonb,
                          array['cpf_cnpj','cpf']) = '123',
    'string vazia nao conta como preenchida, entao a preferencia cai para a proxima';

  -- ==========================================================================
  -- (B) O CENARIO DA DUPLICACAO
  -- ==========================================================================
  -- Dois vendedores com o MESMO e-mail (a unidade cadastrou a equipe com o
  -- e-mail da franquia) e o MESMO nome (homonimo). Nenhum dos dois campos e
  -- unique em `vendedores` — so `documento` e (0069).
  insert into vendedores (nome, documento, email, regional_id, ativo) values
    ('DUPLO NOME','52998224725','equipe@t.com', null, false),
    ('DUPLO NOME','11144477735','equipe@t.com', null, false);

  insert into mutual_captura (entidade, id_externo, payload) values
    -- casa por E-MAIL (sem documento) -> a chave aponta DOIS vendedores
    ('CONSULTANT','10', '{"name":"DUPLO NOME","email":"equipe@t.com"}'),
    -- tem documento que nao esta no SCar: so o NOME casaria, e o nome tambem
    -- aponta dois. O informativo "so por nome" nao pode dobrar o veiculo.
    ('CONSULTANT','11', '{"name":"DUPLO NOME","cpf_cnpj":"390.533.447-05"}');

  insert into mutual_captura (entidade, id_externo, payload) values
    ('CONTRACT_OBJECT','d1', '{"contract_status":"ATIVO","status":"ATIVO","consultant":"10"}'),
    ('CONTRACT_OBJECT','d2', '{"contract_status":"ATIVO","status":"ATIVO","consultant":"10"}'),
    ('CONTRACT_OBJECT','d3', '{"contract_status":"ATIVO","status":"ATIVO","consultant":"10"}'),
    ('CONTRACT_OBJECT','d4', '{"contract_status":"ATIVO","status":"ATIVO","consultant":"11"}'),
    ('CONTRACT_OBJECT','d5', '{"contract_status":"ATIVO","status":"ATIVO","consultant":"11"}');

  -- ==========================================================================
  -- (C) O NUMERO QUE DECIDE A CARGA NAO PODE SER INVENTADO
  -- ==========================================================================
  -- Na 0073: 3 objetos x 2 (e-mail) x 2 (nome) + 2 x 2 = 16 no degrau 1.
  select * into f from mutual_cobertura_consultor(true) where passo = 1;
  assert f.objetos = 5,
    format('5 veiculos faturaveis existem; o funil contou %s — vendedor repetido '
           'nao pode virar veiculo repetido', f.objetos);

  select * into f from mutual_cobertura_consultor(true) where passo = 2;
  assert f.objetos = 5 and f.perdidos = 0, 'todos declaram consultor';

  select * into f from mutual_cobertura_consultor(true) where passo = 4;
  assert f.objetos = 5 and f.perdidos = 0, 'os dois consultores tem chave (e-mail ou CPF)';

  -- o consultor 10 casa (por e-mail, com desempate); o 11 nao casa — o CPF dele
  -- nao esta no SCar e nome nao e chave de carga (0069).
  select * into f from mutual_cobertura_consultor(true) where passo = 5;
  assert f.objetos = 3 and f.perdidos = 2,
    format('3 casam e 2 se perdem; veio %s e %s', f.objetos, f.perdidos);
  assert f.detalhe like '%2 casariam SO por nome%',
    'os 2 do consultor 11 aparecem como "so por nome" — uma vez cada, nao duas';

  -- ==========================================================================
  -- (D) O DESEMPATE NAO PODE SER SILENCIOSO
  -- ==========================================================================
  -- Escolher um entre dois vendedores e uma DECISAO. Neste modulo, decisao em
  -- silencio ja custou duas rodadas (o dia de vencimento e a unidade).
  assert f.detalhe like '%AMBIGUA%',
    format('o degrau 5 tem de avisar da chave ambigua; disse: %s', f.detalhe);
  assert f.detalhe like '%3 em chave AMBIGUA%',
    'e dizer QUANTOS veiculos dependem desse desempate';

  select * into f from mutual_cobertura_consultor(true) where passo = 6;
  assert f.objetos = 0 and f.perdidos = 3,
    'os dois vendedores estao sem unidade, entao a corrente termina em zero';

  -- ==========================================================================
  -- (E) A FILA DE TRABALHO NAO REPETE O CONSULTOR
  -- ==========================================================================
  -- Fila que mostra a mesma pendencia duas vezes faz tratar duas vezes.
  select count(*) into n from mutual_consultores_sem_vendedor(50, true)
   where consultor_id = '10';
  assert n = 1, format('o consultor 10 tem de aparecer UMA vez; apareceu %s', n);

  select motivo into txt from mutual_consultores_sem_vendedor(50, true)
   where consultor_id = '10';
  assert txt = 'Vendedor sem unidade definida',
    format('casou com um dos dois vendedores, e nenhum tem unidade: %s', txt);

  select veiculos into n from mutual_consultores_sem_vendedor(50, true)
   where consultor_id = '10';
  assert n = 3, format('e responde por 3 veiculos, nao 6: veio %s', n);

  select count(*) into n from mutual_consultores_sem_vendedor(50, true)
   where consultor_id = '11';
  assert n = 1, 'o consultor 11 tambem: uma linha, mesmo com dois homonimos';

  -- ==========================================================================
  -- (F) A REGRA DA FASE: isto e LEITURA
  -- ==========================================================================
  assert (select count(*) from clientes) = 0, 'a 0074 nao cria associado';
  assert (select count(*) from veiculos) = 0, 'a 0074 nao cria veiculo';
  assert (select count(*) from titulos_financeiros) = 0, 'a 0074 nao cria titulo';
  assert (select count(*) from faturas) = 0, 'a 0074 nao cria fatura';

  raise notice '=== TESTES 0074 (funil do consultor sem duplicar) PASSARAM ===';
end $$;
