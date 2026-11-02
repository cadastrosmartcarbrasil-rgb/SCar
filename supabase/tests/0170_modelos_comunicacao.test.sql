-- Teste funcional da 0170. Prova: (1) a celula comunicacao_modelos existe; (2) seed so no
-- financeiro; (3) sem a permissao nao le nem grava; (4) gravar cria a versao e incrementa;
-- (5) '{}' volta ao original e tambem vira versao; (6) textos invalidos sao recusados;
-- (7) a versao e imutavel para quem esta logado.
\set ON_ERROR_STOP on
do $$
declare
  adm uuid := gen_random_uuid();
  fin uuid := gen_random_uuid();
  ges uuid := gen_random_uuid();
  r1 uuid; n int; v int; ok boolean; arr text[];
begin
  insert into regionais (nome) values ('Unidade 170') returning id into r1;
  insert into auth.users (id, email) values (adm, 'adm170@t.com'), (fin, 'fin170@t.com'), (ges, 'ges170@t.com');
  insert into usuarios (id, nome, email, papel, regional_id) values
    (adm, 'Admin 170', 'adm170@t.com', 'admin', null),
    (fin, 'Financeiro 170', 'fin170@t.com', 'financeiro', null),
    (ges, 'Gestor 170', 'ges170@t.com', 'gestor_regional', r1);

  assert permissao_celula_valida('comunicacao_modelos', 'ver'), 'celula ver';
  assert permissao_celula_valida('comunicacao_modelos', 'editar'), 'celula editar';
  assert not permissao_celula_valida('comunicacao_modelos', 'excluir'), 'sem excluir';
  select count(*) into n from perfil_permissoes where modulo = 'comunicacao_modelos' and concedida and papel <> 'financeiro';
  assert n = 0, 'so o financeiro nasce com a permissao';

  -- gestor: nada
  perform set_config('request.jwt.claim.sub', ges::text, false);
  assert not pode_modelos_comunicacao('ver'), 'gestor nao ve';
  begin
    perform salvar_modelo_comunicacao('EMAIL', 'lembrete', '{"assunto":"x"}'::jsonb, null);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'gestor nao grava';

  -- financeiro grava
  perform set_config('request.jwt.claim.sub', fin::text, false);
  arr := minhas_permissoes();
  assert 'comunicacao_modelos.editar' = any(arr), 'financeiro com a celula';
  v := salvar_modelo_comunicacao('EMAIL', 'lembrete', '{"assunto":"Lembrete {quando}"}'::jsonb, 'teste');
  assert v = 1, 'primeira versao';
  v := salvar_modelo_comunicacao('EMAIL', 'lembrete', '{}'::jsonb, 'voltar ao original');
  assert v = 2, 'segunda versao';
  select count(*) into n from comunicacao_modelo_versoes where codigo = 'lembrete';
  assert n = 2, 'duas versoes guardadas';
  select count(*) into n from comunicacao_modelos where codigo = 'lembrete' and textos = '{}'::jsonb and versao = 2;
  assert n = 1, 'modelo de volta ao original';

  -- invalidos
  begin
    perform salvar_modelo_comunicacao('EMAIL', 'lembrete', '{"assunto": 5}'::jsonb, null);
    ok := false;
  exception when others then ok := sqlerrm like '%precisa ser texto%';
  end;
  assert ok, 'valor nao texto recusado';
  begin
    perform salvar_modelo_comunicacao('SMS', 'lembrete', '{}'::jsonb, null);
    ok := false;
  exception when others then ok := sqlerrm like '%Canal invalido%';
  end;
  assert ok, 'canal recusado';

  -- leitura pela RLS e versao imutavel
  execute 'set local role authenticated';
  select count(*) into n from comunicacao_modelo_versoes;
  begin
    update comunicacao_modelo_versoes set motivo = 'x';
    get diagnostics v = row_count;
  exception when others then v := 0;
  end;
  execute 'reset role';
  assert n = 2, 'financeiro le as versoes';
  assert v = 0, 'versao nao se altera';

  perform set_config('request.jwt.claim.sub', ges::text, false);
  execute 'set local role authenticated';
  select count(*) into n from comunicacao_modelos;
  execute 'reset role';
  assert n = 0, 'RLS: gestor nao le';

  raise notice '=== TESTES 0170 (modelos de comunicacao) PASSARAM ===';
end;
$$;
