-- Teste funcional do CATALOGO DE CORES (0080): a cor deixa de ser texto livre,
-- a cor desconhecida ENTRA (e aparece na fila) e o de-para do Mutual resolve
-- pelo payload capturado, sem chutar o nome da chave.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; tv uuid; cli uuid;
  v_prata uuid; v_esq uuid; v_zero uuid; v_carga uuid;
  l1 uuid;
  id_prata uuid; id_cinza uuid; id_branco uuid; id_grena uuid;
  txt text; cid uuid; n int;
begin
  -- ===================================================== setup
  insert into auth.users (id, email) values (u_adm, 'adm80@t.com');
  insert into regionais (nome) values ('Cuiaba 80') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm, 'Admin', 'adm80@t.com', 'admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','JOSE DAS CORES','52998224725', r1) returning id into cli;

  select id into id_prata  from cores where nome = 'PRATA';
  select id into id_cinza  from cores where nome = 'CINZA';
  select id into id_branco from cores where nome = 'BRANCO';
  select id into id_grena  from cores where nome = 'GRENA';
  assert id_prata is not null and id_cinza is not null, 'o seed das 16 cores do CRLV tem de existir';
  select count(*) into n from cores;
  assert n >= 16, format('o catalogo nasce com 16 cores; veio %s', n);

  -- ==========================================================================
  -- (A) NORMALIZACAO — acento, caixa e pontuacao param de decidir
  -- ==========================================================================
  assert cor_normalizada('  prata   metálico ') = 'PRATA METALICO',
    format('cor_normalizada devolveu "%s"', cor_normalizada('  prata   metálico '));
  assert cor_normalizada('Cinza-Escuro') = 'CINZA ESCURO', 'pontuacao vira espaco';
  assert cor_normalizada('   ') is null, 'so espaco vira NULL, nunca a string vazia';
  assert cor_normalizada(null) is null, 'nulo continua nulo';

  -- ==========================================================================
  -- (B) OS QUATRO DEGRAUS DA RESOLUCAO
  -- ==========================================================================
  assert cor_do_texto('PRATA')            = id_prata,  '1) nome exato';
  assert cor_do_texto('prata')            = id_prata,  '1) nome exato ignora caixa';
  assert cor_do_texto('Prateado')         = id_prata,  '2) apelido';
  assert cor_do_texto('GRAFITE')          = id_cinza,  '2) apelido aponta para CINZA';
  assert cor_do_texto('PRATA METALICO')   = id_prata,  '3) primeira palavra e um nome';
  assert cor_do_texto('BRANCO PÉROLA')    = id_branco, '3) primeira palavra, com acento';
  assert cor_do_texto('PRATEADO FOSCO')   = id_prata,  '4) primeira palavra e um apelido';
  assert cor_do_texto('BORDÔ')            = id_grena,  'bordo e grena no vocabulario do documento';
  assert cor_do_texto('VERDE LIMAO ESPECIAL') = (select id from cores where nome='VERDE'),
    'a primeira palavra resolve mesmo com sobra';
  assert cor_do_texto('AZUL ESCURO')      = (select id from cores where nome='AZUL'), 'azul escuro e azul';
  -- E o que NAO pode resolver:
  assert cor_do_texto('NAO INFORMADA') is null, 'ausencia de dado nao pode virar cor';
  assert cor_do_texto('XPTO') is null,          'palavra desconhecida nao casa por aproximacao';
  assert cor_do_texto('') is null and cor_do_texto(null) is null, 'vazio e nulo nao resolvem';

  -- Cor INATIVA nao resolve mais (mas o vinculo antigo continua de pe — ver F).
  update cores set ativo = false where nome = 'ROSA';
  assert cor_do_texto('ROSA') is null, 'cor inativada sai do de-para';
  update cores set ativo = true where nome = 'ROSA';

  -- ==========================================================================
  -- (C) O TRIGGER PADRONIZA NA ESCRITA — veiculos e leads
  -- ==========================================================================
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, cor)
    values (cli, 'COR1A23', r1, tv, '  prata   metálico ') returning id into v_prata;
  select cor, cor_id into txt, cid from veiculos where id = v_prata;
  assert txt = 'PRATA', format('o texto tinha de virar canonico; veio "%s"', txt);
  assert cid = id_prata, 'cor_id tem de sair resolvido na propria escrita';

  insert into leads (nome, celular, regional_id, tipo_veiculo_id, cor)
    values ('LEAD COR', '65999990000', r1, tv, 'Grafite') returning id into l1;
  select cor, cor_id into txt, cid from leads where id = l1;
  assert txt = 'CINZA' and cid = id_cinza, format('o lead tinha de virar CINZA; veio "%s"', txt);

  -- Update tambem passa pelo trigger.
  update veiculos set cor = 'branca' where id = v_prata;
  select cor, cor_id into txt, cid from veiculos where id = v_prata;
  assert txt = 'BRANCO' and cid = id_branco, format('o update nao canonizou; veio "%s"', txt);

  -- ==========================================================================
  -- (D) COR DESCONHECIDA ENTRA — nao e recusada no balcao
  -- ==========================================================================
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, cor)
    values (cli, 'COR2B34', r1, tv, 'verde  musgo especial') returning id into v_esq;
  select cor, cor_id into txt, cid from veiculos where id = v_esq;
  -- "VERDE" e a primeira palavra, entao ESTE resolve. Um sem cor de catalogo:
  assert cid is not null, 'verde musgo resolve pela primeira palavra';

  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, cor)
    values (cli, 'COR3C45', r1, tv, 'Xpto  Metálico') returning id into v_zero;
  select cor, cor_id into txt, cid from veiculos where id = v_zero;
  assert cid is null, 'cor fora do catalogo fica sem cor_id';
  assert txt = 'XPTO METÁLICO',
    format('o texto desconhecido entra em caixa alta e COM acento; veio "%s"', txt);

  -- E ela aparece na FILA DE TRABALHO, com o volume que depende dela.
  select count(*) into n from cores_nao_reconhecidas() where cor = 'XPTO METÁLICO';
  assert n = 1, 'a cor desconhecida tem de aparecer em cores_nao_reconhecidas()';
  select veiculos into n from cores_nao_reconhecidas() where cor = 'XPTO METÁLICO';
  assert n = 1, format('a fila tem de contar o veiculo; veio %s', n);

  -- Adicionar o apelido resolve a fila SEM tocar na linha antiga (ela e historico
  -- ate alguem reescrever) — mas a proxima escrita ja nasce certa.
  insert into cor_apelidos (cor_id, apelido) values (id_prata, cor_normalizada('XPTO'));
  update veiculos set cor = 'Xpto Metálico' where id = v_zero;
  select cor, cor_id into txt, cid from veiculos where id = v_zero;
  assert txt = 'PRATA' and cid = id_prata, 'apelido novo passa a resolver na reescrita';
  delete from cor_apelidos where apelido = 'XPTO';

  -- ==========================================================================
  -- (E) VAZIO VIRA NULL, NUNCA '' (a mordida de fornecedores.documento, 0051)
  -- ==========================================================================
  update veiculos set cor = '   ' where id = v_zero;
  select cor, cor_id into txt, cid from veiculos where id = v_zero;
  assert txt is null and cid is null, format('espaco tinha de virar NULL; veio "%s"', txt);

  -- ==========================================================================
  -- (F) QUEM ESCREVE O ID (a carga) GANHA O TEXTO — vale o lado que mudou
  -- ==========================================================================
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, cor_id)
    values (cli, 'COR4D56', r1, tv, id_grena) returning id into v_carga;
  select cor, cor_id into txt, cid from veiculos where id = v_carga;
  assert txt = 'GRENA' and cid = id_grena,
    format('gravar so o cor_id tinha de trazer o texto do catalogo; veio "%s"', txt);

  -- E quem DIGITA a cor manda sobre o id que estava la.
  update veiculos set cor = 'azul' where id = v_carga;
  select cor, cor_id into txt, cid from veiculos where id = v_carga;
  assert txt = 'AZUL' and cid = (select id from cores where nome = 'AZUL'),
    'o texto digitado vence o id antigo';

  -- Apagar a cor do catalogo NAO leva o veiculo junto (on delete set null).
  select count(*) into n from veiculos where cor_id is not null;
  assert n > 0, 'ha veiculo apontando para o catalogo';

  -- ==========================================================================
  -- (G) O CATALOGO PARA A TELA
  -- ==========================================================================
  select count(*) into n from cores_listar();
  assert n >= 16, format('cores_listar devolveu %s', n);
  select veiculos into n from cores_listar() where nome = 'PRATA';
  assert n is not null, 'cores_listar traz quantos registros usam a cor';
  select array_length(apelidos, 1) into n from cores_listar() where nome = 'CINZA';
  assert n >= 2, 'CINZA tem de trazer os apelidos (GRAFITE, CHUMBO, ...)';

  -- ==========================================================================
  -- (H) O DE-PARA DO MUTUAL — pelo payload capturado, sem chutar a chave
  -- ==========================================================================
  -- Sem captura, nao resolve e a fila fica vazia: vazio SEM captura nao prova
  -- nada (regra da 0064).
  assert mutual_cor_do_externo('7') is null, 'sem /vehicle/color/ capturado nao ha de-para';
  select count(*) into n from mutual_cores_nao_mapeadas();
  assert n = 0, 'sem captura a fila do Mutual e vazia por ausencia, nao por acerto';

  insert into mutual_captura (entidade, id_externo, payload)
    values ('VEHICLE_COLOR', '7', '{"id":7,"name":"Prata"}'::jsonb),
           ('VEHICLE_COLOR', '9', '{"id":9,"description":"BORDÔ"}'::jsonb),
           ('VEHICLE_COLOR','11', '{"id":11,"name":"CAMUFLADO ARMY"}'::jsonb);

  assert mutual_cor_do_externo('7') = id_prata, 'a chave `name` resolve';
  assert mutual_cor_do_externo('9') = id_grena, 'a chave `description` tambem (precedencia, 0074)';
  assert mutual_cor_do_externo('11') is null,   'vocabulario novo nao pode ser adivinhado';

  select count(*) into n from mutual_cores_nao_mapeadas();
  assert n = 1, format('so a cor nova tem de aparecer na fila do Mutual; veio %s', n);
  select descricao into txt from mutual_cores_nao_mapeadas();
  assert txt = 'CAMUFLADO ARMY', format('a fila tem de nomear a cor; veio "%s"', txt);

  -- ==========================================================================
  -- (I) NAO-STAFF NAO LE O CATALOGO NEM A FILA (authenticated != equipe, 0052)
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, false);
  select count(*) into n from cores_listar();
  assert n = 0, 'quem nao e staff recebe catalogo vazio';
  select count(*) into n from cores_nao_reconhecidas();
  assert n = 0, 'quem nao e staff nao le a fila de cores';
  select count(*) into n from mutual_cores_nao_mapeadas();
  assert n = 0, 'quem nao e staff nao le o de-para do Mutual';
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- ==========================================================================
  -- (J) O UNIQUE DO APELIDO — um apelido nao aponta para duas cores
  -- ==========================================================================
  begin
    insert into cor_apelidos (cor_id, apelido) values (id_prata, 'GRAFITE');
    assert false, 'o apelido GRAFITE ja e do CINZA: o unique tinha de recusar';
  exception when unique_violation then null;
  end;

  raise notice '=== TESTES 0080 (catalogo de cores) PASSARAM ===';
end $$;
