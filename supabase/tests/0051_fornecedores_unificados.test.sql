-- Teste funcional: fornecedor unico (prestador 24h, rastreadora e fornecedor) (0051)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  r1 uuid; cli uuid; forn uuid; rast uuid; v1 uuid; tv uuid; n int; txt text;
begin
  insert into auth.users (id, email) values (u_adm, 'adm@t.com'), (u_ges, 'ges@t.com');
  insert into regionais (nome) values ('Cuiaba') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm, 'Admin', 'adm@t.com', 'admin', null),
           (u_ges, 'Gestor', 'ges@t.com', 'gestor_regional', r1);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- ------------------------------------------------- a tabela paralela nao existe mais
  select count(*) into n from information_schema.tables
   where table_schema = 'public' and table_name = 'empresas_rastreamento';
  assert n = 0, 'empresas_rastreamento nao pode mais existir — o cadastro e unico';
  raise notice 'OK nao ha mais cadastro paralelo de rastreadora';

  -- ------------------------------------------------- os tres tipos na mesma tabela
  insert into fornecedores (tipo_pessoa, documento, razao_social, nome_fantasia)
    values ('PJ', '11222333000181', 'AUTO PECAS LTDA', 'Auto Pecas') returning id into forn;
  insert into fornecedores (tipo_pessoa, documento, razao_social, prestador_assistencia, cobertura)
    values ('PJ', '11444777000161', 'GUINCHO 24H LTDA', true, 'Grande Cuiaba');
  insert into fornecedores (tipo_pessoa, documento, razao_social, nome_fantasia,
                            empresa_rastreamento, custo_mensal_equipamento, plataforma_url)
    values ('PJ', '33445566000186', 'D TRAKER LTDA', 'D Traker', true, 12.50, 'https://d.traker')
    returning id into rast;

  select count(*) into n from fornecedores where empresa_rastreamento;
  assert n = 1, 'uma rastreadora cadastrada, veio ' || n;
  select count(*) into n from fornecedores where prestador_assistencia;
  assert n = 1, 'um prestador 24h cadastrado, veio ' || n;
  raise notice 'OK peca, guincho e rastreadora convivem no mesmo cadastro';

  -- um fornecedor pode ser as duas coisas (guincho que tambem instala rastreador)
  update fornecedores set prestador_assistencia = true where id = rast;
  select count(*) into n from fornecedores where prestador_assistencia and empresa_rastreamento;
  assert n = 1, 'o mesmo fornecedor pode acumular tipos';
  update fornecedores set prestador_assistencia = false where id = rast;
  raise notice 'OK os tipos se acumulam no mesmo cadastro';

  -- ------------------------------------------------- documento deixou de ser obrigatorio
  insert into fornecedores (tipo_pessoa, razao_social, empresa_rastreamento)
    values ('PJ', 'RASTREADORA SEM CNPJ', true);
  begin
    insert into fornecedores (tipo_pessoa, documento, razao_social)
      values ('PJ', '11111111111111', 'CNPJ INVALIDO');
    assert false, 'documento invalido deveria continuar sendo recusado';
  exception when check_violation then null; end;
  raise notice 'OK documento e opcional, mas continua validado quando informado';

  -- ------------------------------------------------- o veiculo aponta para o fornecedor
  select id into tv from tipos_veiculo where nome = 'Passeio';
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Jose', '52998224725', r1) returning id into cli;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id,
                        rastreador_imei, empresa_rastreamento_id)
    values (cli, 'RAS1A23', r1, tv, '860123456789012', rast) returning id into v1;

  select f.nome_fantasia into txt
    from veiculos v join fornecedores f on f.id = v.empresa_rastreamento_id where v.id = v1;
  assert txt = 'D Traker', 'a ficha do veiculo le a rastreadora no cadastro de fornecedores';
  assert nome_fornecedor(rast) = 'D Traker', 'nome_fornecedor prefere o nome fantasia';
  assert nome_fornecedor(forn) = 'Auto Pecas', 'idem para os demais fornecedores';
  raise notice 'OK a ficha do veiculo passou a apontar para fornecedores';

  -- ------------------------------------------------- o parque tambem
  insert into rastreadores (imei, empresa_rastreamento_id, regional_id, linha)
    values ('860123456789013', rast, r1, '65999998888');
  select plataforma into txt from rastreadores_listar(p_busca := '860123456789013');
  assert txt = 'D Traker', 'a lista do parque mostra a rastreadora, veio ' || coalesce(txt, '');

  select (rastreadores_resumo()->'por_plataforma'->0->>'plataforma') into txt;
  assert txt = 'D Traker', 'o resumo agrupa pela rastreadora do cadastro unico';
  raise notice 'OK o modulo de rastreadores le o cadastro unico';

  -- ------------------------------------------------- quem cadastra
  assert pode_cadastrar_fornecedor(), 'admin cadastra fornecedor';
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  assert pode_cadastrar_fornecedor(),
    'o gestor da unidade tem de cadastrar guincho e rastreadora sem passar por Configuracoes';
  raise notice 'OK gestor de unidade cadastra fornecedor (nao depende mais de admin)';

  raise notice '=== TESTES 0051 (cadastro unico de fornecedores) PASSARAM ===';
end $$;
