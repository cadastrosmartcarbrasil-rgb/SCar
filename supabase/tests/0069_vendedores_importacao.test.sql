-- Teste funcional da 0069 — importacao de vendedores por planilha.
--
-- O que esta suite prova: (1) a carga e RE-EXECUTAVEL (reimportar atualiza, nao
-- duplica) e nao apaga o que a planilha nao traz — quem configurou comissao e
-- banco na tela nao perde isso na segunda carga; (2) todo mundo entra INATIVO
-- por padrao, porque "Ativo" no sistema de origem significa "nao apagado", nao
-- "vendendo hoje"; (3) unidade e OBRIGATORIA — aceitar nulo jogaria a equipe da
-- franquia para dentro da MATRIZ (0067).
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ger uuid := gen_random_uuid();
  r_natal uuid; r_matriz uuid;
  n int; ok boolean; rec record;
  v_id uuid;
begin
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('GRANDE NATAL', 0.2000, 0.1500) returning id into r_natal;
  insert into regionais (nome) values ('SMART CAR MATRIZ') returning id into r_matriz;

  insert into auth.users (id, email) values (u_adm,'adm69@t.com'), (u_ger,'ger69@t.com');
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm69@t.com','admin', null),
           (u_ger,'Gestor','ger69@t.com','gestor_regional', r_natal);

  -- (A) so a matriz importa a equipe -----------------------------------------
  perform set_config('request.jwt.claim.sub', u_ger::text, false);
  begin
    perform importar_vendedores(jsonb_build_array(
      jsonb_build_object('nome','X','regional_id', r_natal)));
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'gestor regional NAO importa a equipe em massa';

  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- (B) unidade e OBRIGATORIA -------------------------------------------------
  -- Sem esta recusa, `regional_id` nulo = MATRIZ e a equipe da franquia
  -- inteira entraria no escopo da matriz, atravessando RLS.
  begin
    perform importar_vendedores(jsonb_build_array(
      jsonb_build_object('nome','SEM UNIDADE','documento','52998224725')));
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'linha sem unidade tem de ser recusada';

  -- (C) a carga ---------------------------------------------------------------
  select * into rec from importar_vendedores(jsonb_build_array(
    jsonb_build_object('nome','MARIA DA SILVA','documento','529.982.247-25',
      'email','Maria@Exemplo.com','telefone','(84) 99999-0000',
      'regional_id', r_natal, 'ativo_na_origem', true,
      'observacoes','Importado da planilha'),
    jsonb_build_object('nome','JOSE LIMA','documento','12420057570',
      'regional_id', r_matriz, 'ativo_na_origem', true)
  ));
  assert rec.criados = 2 and rec.atualizados = 0, 'dois vendedores criados';

  -- ... TODOS INATIVOS, mesmo com ativo_na_origem = true
  select count(*) into n from vendedores where ativo;
  assert n = 0, 'por padrao NINGUEM entra ativo — "Ativo" na origem nao e "vendendo hoje"';

  -- ... comissao zerada (zero nao paga ninguem por engano)
  select taxa_comissao_adesao into rec from vendedores where documento = '52998224725';
  assert (select taxa_comissao_adesao from vendedores where documento='52998224725') = 0,
    'sem comissao na planilha, entra zerada';

  -- ... documento gravado SO COM DIGITOS (a planilha traz formatado)
  assert exists (select 1 from vendedores where documento = '52998224725'),
    'o CPF formatado da planilha vira so digitos';

  -- ... e-mail normalizado para minusculas
  assert (select email from vendedores where documento='52998224725') = 'maria@exemplo.com',
    'e-mail entra em minusculas (senao a reimportacao nao casa)';

  -- ... o codigo do hotlink foi gerado sozinho (trigger da 0035)
  assert (select codigo from vendedores where documento='52998224725') is not null,
    'o codigo do hotlink e gerado pelo banco';

  -- ... e NENHUM acesso ao portal foi criado
  select count(*) into n from vendedores where usuario_id is not null;
  assert n = 0, 'a importacao NUNCA cria acesso ao portal';

  -- (D) a equipe configura comissao e banco na TELA ---------------------------
  select id into v_id from vendedores where documento = '52998224725';
  update vendedores set taxa_comissao_adesao = 0.1000, banco = '341',
                        chave_pix = 'maria@pix.com', ativo = true
   where id = v_id;

  -- (E) REIMPORTAR a mesma planilha ------------------------------------------
  select * into rec from importar_vendedores(jsonb_build_array(
    jsonb_build_object('nome','MARIA DA SILVA SANTOS','documento','52998224725',
      'email','maria@exemplo.com','regional_id', r_natal, 'ativo_na_origem', true)
  ));
  assert rec.criados = 0 and rec.atualizados = 1,
    'reimportar ATUALIZA a mesma pessoa — nao duplica';

  select count(*) into n from vendedores where documento = '52998224725';
  assert n = 1, 'continua existindo UMA Maria';

  -- ... o nome corrigido entrou
  assert (select nome from vendedores where documento='52998224725') = 'MARIA DA SILVA SANTOS',
    'a planilha corrige o nome';

  -- ... e o que a planilha NAO traz nao foi apagado
  assert (select taxa_comissao_adesao from vendedores where documento='52998224725') = 0.1000,
    'a comissao configurada na tela SOBREVIVE a reimportacao';
  assert (select banco from vendedores where documento='52998224725') = '341',
    'o banco configurado na tela sobrevive';
  assert (select chave_pix from vendedores where documento='52998224725') = 'maria@pix.com',
    'a chave PIX sobrevive';
  assert (select ativo from vendedores where documento='52998224725'),
    'quem ja estava ativo NAO e desativado por uma reimportacao';

  -- (F) casamento pelo E-MAIL quando nao ha documento -------------------------
  select * into rec from importar_vendedores(jsonb_build_array(
    jsonb_build_object('nome','SEM CPF','email','semcpf@x.com','regional_id', r_natal)));
  assert rec.criados = 1, 'vendedor sem documento entra pelo e-mail';
  select * into rec from importar_vendedores(jsonb_build_array(
    jsonb_build_object('nome','SEM CPF CORRIGIDO','email','SemCpf@X.com','regional_id', r_natal)));
  assert rec.atualizados = 1, 'e-mail com outra caixa e a MESMA pessoa';

  -- (G) `p_respeitar_status` liga a coluna Status da planilha ------------------
  select * into rec from importar_vendedores(jsonb_build_array(
    jsonb_build_object('nome','ATIVO NA ORIGEM','documento','70442124414',
      'regional_id', r_natal, 'ativo_na_origem', true),
    jsonb_build_object('nome','INATIVO NA ORIGEM','documento','40426626842',
      'regional_id', r_natal, 'ativo_na_origem', false)
  ), true);
  assert rec.criados = 2, 'os dois entraram';
  assert (select ativo from vendedores where documento='70442124414'),
    'com p_respeitar_status, Ativo na origem entra ativo';
  assert not (select ativo from vendedores where documento='40426626842'),
    'Inativo na origem continua inativo';

  -- (H) percentual entra como PERCENTUAL e vira FRACAO no banco ---------------
  -- `taxa_comissao_*` e numeric(6,4): 0.1000 = 10%. Mandar fracao no payload
  -- daria uma comissao 100x menor, calada.
  select * into rec from importar_vendedores(jsonb_build_array(
    jsonb_build_object('nome','COM COMISSAO','documento','43842505841',
      'regional_id', r_natal, 'comissao_adesao_pct', 15, 'comissao_recorrente_pct', 7.5)));
  assert (select taxa_comissao_adesao from vendedores where documento='43842505841') = 0.1500,
    '15 (pct) tem de virar 0.1500 no banco';
  assert (select taxa_comissao_recorrente from vendedores where documento='43842505841') = 0.0750,
    '7,5 (pct) tem de virar 0.0750';

  -- (I) o TETO da franquia (0034) continua valendo na importacao --------------
  -- A regional cede no maximo 20% de adesao; 25% tem de explodir a carga
  -- INTEIRA, nao entrar pela metade.
  begin
    perform importar_vendedores(jsonb_build_array(
      jsonb_build_object('nome','ACIMA DO TETO','documento','02140093276',
        'regional_id', r_natal, 'comissao_adesao_pct', 25)));
    ok := false;
  exception when others then ok := true;
  end;
  assert ok, 'comissao acima do teto da franquia tem de ser recusada';
  assert not exists (select 1 from vendedores where documento = '02140093276'),
    'a linha recusada NAO pode ter entrado';

  -- (J) documento duplicado no banco e impossivel ------------------------------
  begin
    insert into vendedores (nome, documento, regional_id)
      values ('CLONE', '52998224725', r_natal);
    ok := false;
  exception when unique_violation then ok := true;
  end;
  assert ok, 'dois vendedores nao dividem um CPF';

  -- ... mas dois SEM documento convivem (unique PARCIAL)
  insert into vendedores (nome, regional_id) values ('SEM DOC 1', r_natal);
  insert into vendedores (nome, regional_id) values ('SEM DOC 2', r_natal);
  assert (select count(*) from vendedores where documento is null) >= 2,
    'vendedor sem documento continua valido — unique e PARCIAL';

  raise notice '=== TESTES 0069 (importacao de vendedores) PASSARAM ===';
end $$;
