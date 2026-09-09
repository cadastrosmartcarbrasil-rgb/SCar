-- Teste funcional da 0067 — controle total da regional.
--
-- O que esta suite prova, e que nenhuma outra provava: (1) inativar uma unidade
-- a tira de circulacao SEM apagar o que ela produziu; (2) o `delete` de uma
-- unidade com movimento e recusado — sem essa trava as ~20 FKs
-- `on delete set null` jogariam a carteira da franquia no escopo da MATRIZ, em
-- silencio, que e exatamente a operacao em lote que a equipe esta prestes a
-- fazer para consolidar as unidades vindas do Mutual.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r_viva uuid; r_morta uuid; r_vazia uuid;
  c_id uuid; v_id uuid;
  n int; ok boolean; rec record;
begin
  insert into auth.users (id, email) values (u_adm,'adm67@t.com');
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm67@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  insert into regionais (nome) values ('Unidade Viva')  returning id into r_viva;
  insert into regionais (nome) values ('Unidade Morta') returning id into r_morta;
  insert into regionais (nome) values ('Unidade Vazia') returning id into r_vazia;

  -- (A) nasce ativa e sem data de inativacao ---------------------------------
  select ativo into ok from regionais where id = r_viva;
  assert ok, 'regional nasce ativa';
  assert (select inativada_em is null from regionais where id = r_viva),
    'regional ativa nao tem data de inativacao';

  -- (B) a data de inativacao e carimbada pelo banco --------------------------
  update regionais set ativo = false where id = r_morta;
  assert (select inativada_em is not null from regionais where id = r_morta),
    'inativar carimba a data sozinho — o relatorio nao pode depender de alguem lembrar';
  update regionais set ativo = true where id = r_morta;
  assert (select inativada_em is null from regionais where id = r_morta),
    'reativar limpa a data';
  update regionais set ativo = false where id = r_morta;

  assert regional_ativa(r_viva),      'unidade viva e ativa';
  assert not regional_ativa(r_morta), 'unidade inativada nao e ativa';
  assert regional_ativa(null),        'matriz (regional nula) conta como ativa';

  -- (C) unidade inativa nao recebe vendedor novo -----------------------------
  begin
    insert into vendedores (nome, regional_id, ativo) values ('Fulano', r_morta, true);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'vendedor novo em unidade INATIVA tem de ser recusado';

  -- ... mas o que ja existia continua editavel -------------------------------
  insert into vendedores (nome, regional_id, ativo)
    values ('Beltrano', r_viva, true) returning id into v_id;
  update regionais set ativo = false where id = r_viva;
  update vendedores set telefone = '65999990000' where id = v_id;   -- nao pode explodir
  assert (select telefone from vendedores where id = v_id) = '65999990000',
    'corrigir o cadastro de quem ja estava na unidade nao pode depender de reativar a franquia';
  update regionais set ativo = true where id = r_viva;

  -- (D) hotlink de unidade inativa nao capta mais -----------------------------
  update regionais set codigo = 'UNIDADEMORTA' where id = r_morta;
  select count(*) into n from resolver_hotlink('UNIDADEMORTA');
  assert n = 0, 'hotlink de unidade INATIVA nao pode resolver';

  update vendedores set codigo = 'BELTRANO67' where id = v_id;
  select count(*) into n from resolver_hotlink('BELTRANO67');
  assert n = 1, 'hotlink do vendedor de unidade ativa resolve normalmente';

  update regionais set ativo = false where id = r_viva;
  select count(*) into n from resolver_hotlink('BELTRANO67');
  assert n = 0, 'vendedor de unidade INATIVA tambem para de captar';
  update regionais set ativo = true where id = r_viva;

  -- (E) EXCLUIR unidade com movimento e RECUSADO ------------------------------
  -- Esta e a trava que protege a consolidacao em lote: sem ela o delete
  -- silenciosamente moveria o associado para o escopo da matriz.
  insert into clientes (nome_razao_social, cpf_cnpj, tipo_pessoa, regional_id)
    values ('ASSOCIADO TESTE', '52998224725', 'PF', r_morta) returning id into c_id;

  begin
    delete from regionais where id = r_morta;
    ok := false;
  exception when foreign_key_violation then ok := true;
  end;
  assert ok, 'unidade com associado NAO pode ser excluida';
  assert (select regional_id from clientes where id = c_id) = r_morta,
    'a recusa nao pode ter deixado o associado orfao no caminho';

  -- migrado para outra unidade, a exclusao passa a ser possivel
  update clientes set regional_id = r_viva where id = c_id;
  delete from regionais where id = r_morta;
  assert not exists (select 1 from regionais where id = r_morta),
    'unidade sem movimento pode ser excluida';
  assert (select regional_id from clientes where id = c_id) = r_viva,
    'o associado migrado continua na unidade de destino';

  -- (F) regionais_listar: os numeros e o `pode_excluir` -----------------------
  select * into rec from regionais_listar(true) where id = r_viva;
  assert rec.associados = 1,   'a unidade viva ficou com o associado migrado';
  assert rec.vendedores = 1,   'e com o vendedor';
  assert not rec.pode_excluir, 'unidade com movimento nao pode ser excluida';

  select * into rec from regionais_listar(true) where id = r_vazia;
  assert rec.pode_excluir, 'unidade sem nenhum registro pode ser excluida';
  assert rec.associados = 0 and rec.veiculos = 0 and rec.leads = 0,
    'unidade vazia conta zero em tudo';

  -- (G) o filtro de inativas ---------------------------------------------------
  update regionais set ativo = false where id = r_vazia;
  select count(*) into n from regionais_listar(false) where id = r_vazia;
  assert n = 0, 'p_incluir_inativas=false esconde a unidade inativa';
  select count(*) into n from regionais_listar(true) where id = r_vazia;
  assert n = 1, 'p_incluir_inativas=true mostra a unidade inativa';

  -- (H) inativar NAO apaga historico -------------------------------------------
  -- E a diferenca entre "parar de oferecer" e "reescrever o passado".
  assert (select count(*) from clientes where regional_id = r_viva) = 1,
    'o associado continua vinculado a unidade';

  raise notice '=== TESTES 0067 (controle total da regional) PASSARAM ===';
end $$;
