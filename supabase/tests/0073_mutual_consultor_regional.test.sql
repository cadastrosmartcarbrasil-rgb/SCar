-- Teste funcional da 0073 — a unidade pelo CONSULTOR.
--
-- O que esta suite prova, e que nenhuma outra provava: a corrente
-- objeto -> consultor -> vendedor -> unidade tem QUATRO saltos, e o funil
-- atribui a perda ao salto CERTO. Um funil que erra de degrau e pior que
-- nenhum: manda arrumar a coisa errada.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; v_com_reg uuid; v_sem_reg uuid;
  n bigint; txt text; rec record;
  f record;
begin
  insert into auth.users (id, email) values (u_adm,'adm73@t.com');
  insert into regionais (nome) values ('Cuiaba 73') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm73@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- ==========================================================================
  -- (A) O helper que existe para NAO chutar o nome do campo
  -- ==========================================================================
  assert mutual_texto_em('{"cpf":"123"}'::jsonb, array['cpf_cnpj','cpf']) = '123',
    'pega a segunda chave quando a primeira nao existe';
  assert mutual_texto_em('{"cpf_cnpj":"","cpf":"123"}'::jsonb, array['cpf_cnpj','cpf']) = '123',
    'string VAZIA nao conta como preenchida — senao "" mascararia o dado real';
  assert mutual_texto_em('{"a":{},"b":[],"c":null,"d":"x"}'::jsonb,
                          array['a','b','c','d']) = 'x',
    'objeto, array e null tambem nao contam';
  assert mutual_texto_em('{"z":"1"}'::jsonb, array['a','b']) is null,
    'nenhuma candidata presente devolve null';
  assert mutual_chave_em('{"cpf":"123"}'::jsonb, array['cpf_cnpj','cpf']) = 'cpf',
    'diz QUAL chave pegou — sem isso a proxima sessao chuta de novo';

  -- o objeto manda sobre o contrato (mesma precedencia do due_day, 0064)
  assert mutual_consultor_do_objeto('{"consultant":"7"}'::jsonb, '{"consultant":"9"}'::jsonb) = '7',
    'o objeto e mais especifico que o contrato';
  assert mutual_consultor_do_objeto('{}'::jsonb, '{"consultant":"9"}'::jsonb) = '9',
    'sem consultor no objeto, o contrato e a reserva';

  -- ==========================================================================
  -- (B) O cenario: 6 objetos faturaveis, cada um caindo num degrau diferente
  -- ==========================================================================
  insert into vendedores (nome, documento, email, regional_id, ativo)
    values ('ANA COM UNIDADE','52998224725','ana@t.com', r1, false) returning id into v_com_reg;
  insert into vendedores (nome, documento, email, regional_id, ativo)
    values ('BRUNO SEM UNIDADE','11144477735','bruno@t.com', null, false) returning id into v_sem_reg;

  insert into mutual_captura (entidade, id_externo, payload) values
    -- consultores: 1 completo, 2 sem unidade no SCar, 3 sem CPF/e-mail,
    -- 4 TEM CPF, mas o CPF nao esta no SCar: so o NOME casaria (a carga nao usa nome)
    ('CONSULTANT','1', '{"name":"ANA COM UNIDADE","cpf_cnpj":"529.982.247-25","email":"ana@t.com"}'),
    ('CONSULTANT','2', '{"name":"BRUNO SEM UNIDADE","cpf_cnpj":"111.444.777-35"}'),
    ('CONSULTANT','3', '{"name":"CARLOS SEM DOC"}'),
    ('CONSULTANT','4', '{"name":"ANA COM UNIDADE","cpf_cnpj":"390.533.447-05"}');

  insert into mutual_captura (entidade, id_externo, payload) values
    ('CONTRACT_OBJECT','o1', '{"contract_status":"ATIVO","status":"ATIVO","consultant":"1"}'),
    ('CONTRACT_OBJECT','o2', '{"contract_status":"ATIVO","status":"ATIVO","consultant":"2"}'),
    ('CONTRACT_OBJECT','o3', '{"contract_status":"ATIVO","status":"ATIVO","consultant":"3"}'),
    ('CONTRACT_OBJECT','o4', '{"contract_status":"ATIVO","status":"ATIVO","consultant":"99"}'),
    ('CONTRACT_OBJECT','o5', '{"contract_status":"ATIVO","status":"ATIVO"}'),
    ('CONTRACT_OBJECT','o6', '{"contract_status":"ATIVO","status":"ATIVO","consultant":"4"}');

  -- ==========================================================================
  -- (C) O FUNIL — cada degrau conta o que deve
  -- ==========================================================================
  select * into f from mutual_cobertura_consultor(true) where passo = 1;
  assert f.objetos = 6, format('6 faturaveis, veio %s', f.objetos);

  select * into f from mutual_cobertura_consultor(true) where passo = 2;
  assert f.objetos = 5 and f.perdidos = 1,
    'o5 nao declara consultor — a perda e do degrau 2';

  select * into f from mutual_cobertura_consultor(true) where passo = 3;
  assert f.objetos = 4 and f.perdidos = 1,
    'o4 aponta um codigo (99) que nao existe no espelho — perda do degrau 3';

  select * into f from mutual_cobertura_consultor(true) where passo = 4;
  assert f.objetos = 3 and f.perdidos = 1,
    'o consultor 3 nao tem CPF nem e-mail — nao ha por onde reconciliar';

  select * into f from mutual_cobertura_consultor(true) where passo = 5;
  assert f.objetos = 2 and f.perdidos = 1,
    'o consultor 4 so casaria por NOME, e a carga (0069) nao usa nome';
  assert f.detalhe like '%1 casariam SO por nome%',
    'o funil DIZ quantos o nome salvaria — e a informacao que decide se vale enriquecer o cadastro';

  select * into f from mutual_cobertura_consultor(true) where passo = 6;
  assert f.objetos = 1 and f.perdidos = 1,
    'Bruno casa como vendedor mas esta SEM UNIDADE — e este o ultimo degrau, e o que decide';

  -- ==========================================================================
  -- (D) O aviso que a 0064 ensinou: nao acuse dado que ninguem puxou
  -- ==========================================================================
  delete from mutual_captura where entidade = 'CONSULTANT';
  select * into f from mutual_cobertura_consultor(true) where passo = 3;
  assert f.detalhe like '%puxe "Consultores"%',
    'sem o espelho de consultores o funil manda PUXAR, em vez de acusar ausencia — '
    'acusar dado nao capturado ja gerou centenas de falsos criticos duas vezes neste modulo';
  assert f.objetos = 0, 'e o degrau zera, honestamente';

  -- restaura para a lista acionavel
  insert into mutual_captura (entidade, id_externo, payload) values
    ('CONSULTANT','1', '{"name":"ANA COM UNIDADE","cpf_cnpj":"529.982.247-25","email":"ana@t.com"}'),
    ('CONSULTANT','2', '{"name":"BRUNO SEM UNIDADE","cpf_cnpj":"111.444.777-35"}'),
    ('CONSULTANT','3', '{"name":"CARLOS SEM DOC"}'),
    ('CONSULTANT','4', '{"name":"ANA COM UNIDADE","cpf_cnpj":"390.533.447-05"}');

  -- ==========================================================================
  -- (E) QUEM se perde, e por que — a fila de trabalho
  -- ==========================================================================
  select count(*) into n from mutual_consultores_sem_vendedor(50, true);
  assert n = 5, format('5 grupos com pendencia (1 por causa), veio %s', n);

  select motivo into txt from mutual_consultores_sem_vendedor(50, true)
   where consultor_id = '99';
  assert txt like '%nao existe no espelho%', format('motivo do codigo orfao: %s', txt);

  select motivo into txt from mutual_consultores_sem_vendedor(50, true)
   where consultor_id = '3';
  assert txt like '%sem CPF nem e-mail%', format('motivo do consultor sem chave: %s', txt);

  select motivo into txt from mutual_consultores_sem_vendedor(50, true)
   where consultor_id = '2';
  assert txt = 'Vendedor sem unidade definida', format('motivo do Bruno: %s', txt);

  select motivo into txt from mutual_consultores_sem_vendedor(50, true)
   where consultor_id = '(sem consultor no objeto)';
  assert txt like '%nao declara consultor%', 'o objeto mudo tambem aparece na fila';

  -- Ana (consultor 1) resolveu a unidade: NAO pode estar na fila de pendencia
  assert not exists (select 1 from mutual_consultores_sem_vendedor(50, true)
                      where consultor_id = '1'),
    'quem resolveu nao entra na fila de trabalho';

  -- ==========================================================================
  -- (F) A REGRA DA FASE: isto e LEITURA
  -- ==========================================================================
  assert (select count(*) from clientes) = 0, 'a 0073 nao cria associado';
  assert (select count(*) from veiculos) = 0, 'a 0073 nao cria veiculo';
  assert (select count(*) from titulos_financeiros) = 0, 'a 0073 nao cria titulo';

  raise notice '=== TESTES 0073 (unidade pelo consultor) PASSARAM ===';
end $$;
