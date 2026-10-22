-- Teste funcional da 0141. Prova: (1) a grade ganhou as abas de Configuracoes e o
-- DRE; (2) o seed do DRE espelha "Financeiro — ver" (ninguem perde na virada) e as
-- abas nascem negadas; (3) sem a permissao o consultor nao grava plano de contas
-- nem marca; com o EXTRA grava; (4) o DRE fica vazio sem `financeiro_dre.ver`;
-- (5) vendedor so nas unidades da pessoa; (6) a lista inteira de unidades com
-- `cfg_regionais.ver`; (7) excluir unidade continua so do admin.
\set ON_ERROR_STOP on
do $$
declare
  adm uuid := gen_random_uuid();
  con uuid := gen_random_uuid();
  fin uuid := gen_random_uuid();
  r1 uuid; r2 uuid; r3 uuid; n int; ok boolean; arr text[];
begin
  insert into regionais (nome) values ('Unidade 141') returning id into r1;
  insert into regionais (nome) values ('Outra 141') returning id into r2;
  insert into regionais (nome) values ('Vazia 141') returning id into r3;
  insert into auth.users (id, email) values
    (adm, 'adm141@t.com'), (con, 'con141@t.com'), (fin, 'fin141@t.com');
  insert into usuarios (id, nome, email, papel, regional_id) values
    (adm, 'Admin 141', 'adm141@t.com', 'admin', null),
    (con, 'Consultor 141', 'con141@t.com', 'consultor_vendas', r1),
    (fin, 'Financeiro 141', 'fin141@t.com', 'financeiro', null);

  -- (1) as celulas novas
  assert permissao_celula_valida('financeiro_dre', 'ver'), 'DRE ver';
  assert permissao_celula_valida('financeiro_dre', 'exportar'), 'DRE exportar';
  assert not permissao_celula_valida('financeiro_dre', 'editar'), 'DRE nao tem editar';
  assert permissao_celula_valida('cfg_plano_contas', 'editar'), 'aba plano de contas';
  assert not permissao_celula_valida('cfg_plano_contas', 'excluir'), 'aba so ver/editar';
  assert not permissao_celula_valida('cfg_usuarios', 'ver'), 'usuarios segue fixo do admin';

  -- (2) o seed
  select count(*) into n
    from perfil_permissoes f
    join perfil_permissoes d on d.papel = f.papel and d.modulo = 'financeiro_dre' and d.acao = 'ver'
   where f.modulo = 'financeiro' and f.acao = 'ver' and d.concedida is distinct from f.concedida;
  assert n = 0, 'o DRE espelha o Financeiro ver em todo papel';
  select count(*) into n from perfil_permissoes where modulo like 'cfg\_%' and concedida;
  assert n = 0, 'nenhuma aba de Configuracoes concedida na virada';
  select count(*) into n from perfil_permissoes where modulo = 'cfg_marcas_modelos' and papel = 'consultor_vendas';
  assert n = 2, 'a linha existe (ver/editar) para a grade mostrar';

  -- (3) sem a permissao: recusa
  perform set_config('request.jwt.claim.sub', con::text, false);
  assert not pode_configurar('cfg_plano_contas'), 'consultor sem a aba';
  begin
    execute 'set local role authenticated';
    insert into categorias_dre (codigo_estruturado, nome, tipo) values ('9.9.41', 'TESTE 141', 'RECEITA');
    execute 'reset role';
    ok := false;
  exception when others then
    execute 'reset role';
    ok := sqlerrm like '%row-level security%';
  end;
  assert ok, 'sem a permissao o consultor nao grava plano de contas';

  -- o admin concede como EXTRA
  perform set_config('request.jwt.claim.sub', adm::text, false);
  n := salvar_permissoes_usuario(con,
    '[{"modulo":"cfg_plano_contas","acao":"ver"},{"modulo":"cfg_plano_contas","acao":"editar"},
      {"modulo":"cfg_vendedores","acao":"editar"},{"modulo":"cfg_regionais","acao":"ver"}]',
    'Cuida do plano de contas e da equipe');
  assert n = 4, 'quatro extras';

  perform set_config('request.jwt.claim.sub', con::text, false);
  arr := minhas_permissoes();
  assert 'cfg_plano_contas.editar' = any(arr), 'a tela recebe a aba';
  assert not ('cfg_marcas_modelos.ver' = any(arr)), 'so o que foi dado';
  execute 'set local role authenticated';
  insert into categorias_dre (codigo_estruturado, nome, tipo) values ('9.9.41', 'TESTE 141', 'RECEITA');
  execute 'reset role';
  assert exists (select 1 from categorias_dre where codigo_estruturado = '9.9.41'), 'com o extra grava';

  -- marcas continua recusado (a aba nao foi dada)
  begin
    execute 'set local role authenticated';
    insert into marcas (nome) values ('MARCA 141');
    execute 'reset role';
    ok := false;
  exception when others then
    execute 'reset role';
    ok := true;
  end;
  assert ok, 'marcas sem a aba segue recusado';

  -- (4) DRE: o consultor (sem financeiro.ver) nao le
  assert not pode_ver_dre(), 'consultor sem DRE';
  select count(*) into n from gerar_dre_mensal(current_date - 60, current_date, null, 'CAIXA', null);
  assert n = 0, 'DRE mensal vazio sem a permissao';
  perform set_config('request.jwt.claim.sub', fin::text, false);
  assert pode_ver_dre(), 'financeiro manteve o DRE';
  select count(*) into n from gerar_dre_mensal(current_date - 60, current_date, null, 'CAIXA', null);
  assert n >= 2, 'com a permissao o DRE mensal tem os meses';
  -- tirar o DRE do papel financeiro tira dele
  perform set_config('request.jwt.claim.sub', adm::text, false);
  perform salvar_permissoes_perfil('financeiro', '[{"modulo":"financeiro_dre","acao":"ver","concedida":false}]');
  perform set_config('request.jwt.claim.sub', fin::text, false);
  assert not pode_ver_dre(), 'retirado do perfil, o DRE some';
  assert perfil_pode('financeiro', 'ver'), 'e o contas a pagar/receber continua';
  select count(*) into n from resumo_por_centro_custo(current_date - 60, current_date, null);
  assert n = 0, 'resumo por centro de custo segue a permissao do DRE';

  -- (5) vendedor: so nas unidades dele
  perform set_config('request.jwt.claim.sub', con::text, false);
  execute 'set local role authenticated';
  insert into vendedores (nome, regional_id) values ('VENDEDOR 141', r1);
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into vendedores (nome, regional_id) values ('INVASOR 141', r2);
    execute 'reset role';
    ok := false;
  exception when others then
    execute 'reset role';
    ok := sqlerrm like '%row-level security%';
  end;
  assert ok, 'com a aba de vendedores, so na propria unidade';

  -- (6) unidades: a lista inteira com cfg_regionais.ver
  select count(*) into n from regionais_listar(true) where id in (r1, r2, r3);
  assert n = 3, 'com a permissao ve todas as unidades na lista';
  perform set_config('request.jwt.claim.sub', adm::text, false);
  perform salvar_permissoes_usuario(con,
    '[{"modulo":"cfg_plano_contas","acao":"ver"},{"modulo":"cfg_plano_contas","acao":"editar"}]', 'reduz');
  perform set_config('request.jwt.claim.sub', con::text, false);
  select count(*) into n from regionais_listar(true) where id in (r1, r2, r3);
  assert n = 1, 'sem a permissao so a propria';

  -- (7) excluir unidade: so o admin, mesmo com a aba
  perform set_config('request.jwt.claim.sub', adm::text, false);
  perform salvar_permissoes_usuario(con, '[{"modulo":"cfg_regionais","acao":"ver"},{"modulo":"cfg_regionais","acao":"editar"}]', 'edita unidades');
  perform set_config('request.jwt.claim.sub', con::text, false);
  execute 'set local role authenticated';
  execute format('update regionais set telefone = %L where id = %L', '6599990000', r3);
  get diagnostics n = row_count;
  execute format('delete from regionais where id = %L', r3);
  execute 'reset role';
  assert n = 1, 'com a aba edita a unidade';
  assert exists (select 1 from regionais where id = r3), 'mas nao exclui';

  raise notice '=== 0141 permissoes de configuracoes e DRE: TODOS OS TESTES PASSARAM ===';
end $$;
