-- Teste da 0151: API externa — chaves, escopos, recorte e a comunicacao da rastreadora.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  r1 uuid; r2 uuid; pl uuid; pl2 uuid; tv uuid; cli uuid; cli2 uuid;
  v1 uuid; v2 uuid; v3 uuid; eq1 uuid; eq2 uuid;
  i_full uuid; i_sem_pessoa uuid; i_r1 uuid; i_sem_escopo uuid;
  rec record; n int; n0 int; c0 tid; c1 tid;
  h text := repeat('a', 64);
begin
  insert into auth.users (id, email) values (u_adm, 'adm150@t.com'), (u_ges, 'ges150@t.com');
  insert into regionais (nome) values ('API UNIDADE 1') returning id into r1;
  insert into regionais (nome) values ('API UNIDADE 2') returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm, 'ADMIN 150', 'adm150@t.com', 'admin', null),
    (u_ges, 'GESTOR 150', 'ges150@t.com', 'gestor_regional', r1);

  insert into fornecedores (tipo_pessoa, documento, razao_social, nome_fantasia, empresa_rastreamento)
    values ('PJ', '11222333000181', 'RASTRO API LTDA', 'RASTRO API', true) returning id into pl;
  insert into fornecedores (tipo_pessoa, documento, razao_social, nome_fantasia, empresa_rastreamento)
    values ('PJ', '45723174000110', 'OUTRA PLATAFORMA LTDA', 'OUTRA', true) returning id into pl2;
  select id into tv from tipos_veiculo where nome = 'Passeio';

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, celular)
    values ('PF', 'MARIA API', '52998224725', r1, '65999998888') returning id into cli;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'JOAO API', '11144477735', r2) returning id into cli2;
  insert into veiculos (cliente_id, placa, chassi, regional_id, tipo_veiculo_id, status)
    values (cli, 'API1A23', '9BWZZZ377VT004251', r1, tv, 'ativo') returning id into v1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status)
    values (cli, 'API2B34', r1, tv, 'ativo') returning id into v2;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status)
    values (cli2, 'API3C45', r2, tv, 'ativo') returning id into v3;

  -- ------------------------------------------------- administracao (admin)
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  begin
    perform criar_api_integracao('X', null, null, array['veiculos:ler'], null, null, null, 'abcdefgh01', h);
    assert false, 'gestor nao cria chave';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  begin
    perform criar_api_integracao('SEM ESCOPO', null, null, array[]::text[], null, null, null, 'abcdefgh02', h);
    assert false, 'chave sem escopo e recusada';
  exception when check_violation then null;
  end;
  begin
    perform criar_api_integracao('ESCOPO RUIM', null, null, array['tudo:liberado'], null, null, null, 'abcdefgh03', h);
    assert false, 'escopo desconhecido e recusado';
  exception when check_violation then null;
  end;

  i_full := criar_api_integracao(' rastro api ', 'teste', pl,
    array['veiculos:ler','associados:ler','rastreadores:ler','rastreadores:escrever','veiculos:ler'],
    null, null, null, 'ABCDEFGH10', upper(h));
  select * into rec from api_integracoes where id = i_full;
  assert rec.nome = 'RASTRO API', 'nome em caixa alta e sem espaco: ' || rec.nome;
  assert array_length(rec.escopos, 1) = 4, 'escopos sem repeticao';
  assert rec.chave_prefixo = 'abcdefgh10' and rec.chave_hash = h, 'prefixo e hash em minusculas';

  i_sem_pessoa := criar_api_integracao('SO VEICULOS', null, null, array['veiculos:ler'], null, null, null, 'abcdefgh11', h);
  i_r1 := criar_api_integracao('SO UNIDADE 1', null, pl, array['veiculos:ler','rastreadores:ler','rastreadores:escrever'],
    array[r1], null, null, 'abcdefgh12', h);
  i_sem_escopo := criar_api_integracao('SO RASTREADOR', null, null, array['rastreadores:ler'], null, null, null, 'abcdefgh13', h);

  select count(*) into n from api_integracoes_listar();
  assert n = 4, 'admin lista as 4: ' || n;

  -- com sessao (mesmo admin) as funcoes da API recusam: so o servidor
  begin
    perform * from api_veiculos(i_full);
    assert false, 'com sessao a API recusa';
  exception when insufficient_privilege then null;
  end;

  -- ------------------------------------------------- leitura (servidor)
  perform set_config('request.jwt.claim.sub', '', false);

  select count(*) into n from api_veiculos(i_full) where veiculo_id in (v1, v2, v3);
  assert n = 3, 'chave sem recorte ve os 3: ' || n;

  select * into rec from api_veiculos(i_full, p_placa := 'api-1a23');
  assert rec.veiculo_id = v1, 'busca por placa com mascara';
  assert rec.associado_nome = 'MARIA API' and rec.associado_documento = '52998224725', 'com associados:ler sai o dado pessoal';
  assert rec.situacao_rastreamento = 'ATIVO', 'ativo -> ATIVO';
  select * into rec from api_veiculos(i_full, p_chassi := '9bwzzz377vt004251');
  assert rec.veiculo_id = v1, 'busca por chassi';

  select * into rec from api_veiculos(i_sem_pessoa, p_veiculo_id := v1);
  assert rec.associado_nome is null and rec.associado_documento is null and rec.associado_celular is null,
    'sem associados:ler o dado pessoal nao sai';
  assert rec.cliente_id = cli, 'o id do associado sai sempre';

  select count(*) into n from api_veiculos(i_r1) where veiculo_id in (v1, v2, v3);
  assert n = 2, 'recorte por unidade: ' || n;
  select count(*) into n from api_veiculos(i_r1, p_veiculo_id := v3);
  assert n = 0, 'veiculo de outra unidade nao sai nem pelo id';

  begin
    perform * from api_veiculos(i_sem_escopo);
    assert false, 'sem veiculos:ler recusa';
  exception when insufficient_privilege then null;
  end;

  -- paginacao: cursor (alterado_em, id) nao repete nem pula
  select count(*) into n from api_veiculos(i_full, p_limite := 2) where veiculo_id in (v1, v2, v3);
  select alterado_em, veiculo_id into rec from api_veiculos(i_full, p_limite := 500)
   where veiculo_id in (v1, v2, v3) order by alterado_em, veiculo_id limit 1;
  select count(*) into n from api_veiculos(i_full, p_cursor_em := rec.alterado_em, p_cursor_id := rec.veiculo_id)
   where veiculo_id in (v1, v2, v3);
  assert n = 2, 'depois do primeiro vem os outros 2: ' || n;

  -- situacao do rastreamento acompanha o status
  update veiculos set status = 'inadimplente' where id = v2;
  select situacao_rastreamento into rec from api_veiculos(i_full, p_veiculo_id := v2);
  assert rec.situacao_rastreamento = 'SUSPENSO', 'inadimplente -> SUSPENSO';
  select count(*) into n from api_veiculos(i_full, p_situacao := 'suspenso') where veiculo_id in (v1, v2, v3);
  assert n = 1, 'filtro por situacao';
  update veiculos set status = 'inativo' where id = v2;
  select situacao_rastreamento into rec from api_veiculos(i_full, p_veiculo_id := v2);
  assert rec.situacao_rastreamento = 'ENCERRADO', 'inativo -> ENCERRADO';
  assert api_situacao_rastreamento('vistoria_pendente') = 'ATIVO', 'vistoria pendente segue rastreado';
  assert api_situacao_rastreamento('em_evento') = 'ATIVO', 'em evento segue rastreado';
  assert api_situacao_rastreamento('suspenso') = 'SUSPENSO', 'suspenso -> SUSPENSO';
  assert api_situacao_rastreamento('excluido') = 'ENCERRADO', 'excluido -> ENCERRADO';

  -- ------------------------------------------------- parque de rastreadores
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into rastreadores (imei, empresa_rastreamento_id, regional_id) values ('860000000000001', pl, r1) returning id into eq1;
  insert into rastreadores (imei, empresa_rastreamento_id, regional_id) values ('860000000000002', pl2, r1) returning id into eq2;
  perform instalar_rastreador(eq1, v1);
  perform set_config('request.jwt.claim.sub', '', false);

  select count(*) into n from api_rastreadores(i_r1) where rastreador_id in (eq1, eq2);
  assert n = 1, 'integracao do fornecedor ve so os equipamentos dele: ' || n;
  select * into rec from api_rastreadores(i_r1, p_imei := '860000000000001');
  assert rec.placa = 'API1A23' and rec.situacao_rastreamento = 'ATIVO' and rec.status = 'ATIVO', 'equipamento instalado';
  select count(*) into n from api_rastreadores(i_sem_escopo) where rastreador_id in (eq1, eq2);
  assert n = 2, 'sem fornecedor ligado ve o parque todo: ' || n;

  select rastreador_imei into rec from api_veiculos(i_full, p_imei := '860000000000001');
  assert rec.rastreador_imei = '860000000000001', 'veiculo por IMEI';

  -- ------------------------------------------------- comunicacao
  select ctid into c0 from veiculos where id = v1;
  select count(*) into n0 from rastreador_eventos where rastreador_id = eq1;
  select count(*) into n from api_registrar_comunicacoes(i_r1, jsonb_build_array(
    jsonb_build_object('imei', '860000000000001', 'comunicado_em', '2026-10-20T10:00:00-03:00',
                       'latitude', -15.6, 'longitude', -56.1, 'ignicao', true),
    jsonb_build_object('imei', '860000000000002', 'comunicado_em', '2026-10-20T10:00:00-03:00'),
    jsonb_build_object('imei', '869999999999999', 'comunicado_em', '2026-10-20T10:00:00-03:00'),
    jsonb_build_object('imei', '12', 'comunicado_em', 'ontem')
  )) where resultado in ('ATUALIZADO');
  assert n = 1, 'so o do proprio fornecedor atualiza';

  select * into rec from api_registrar_comunicacoes(i_r1, '[{"imei":"860000000000002","comunicado_em":"2026-10-20T10:00:00Z"}]');
  assert rec.resultado = 'OUTRA_PLATAFORMA', 'equipamento de outra plataforma: ' || rec.resultado;
  select * into rec from api_registrar_comunicacoes(i_r1, '[{"imei":"869999999999999","comunicado_em":"2026-10-20T10:00:00Z"}]');
  assert rec.resultado = 'NAO_ENCONTRADO', 'IMEI desconhecido';
  select * into rec from api_registrar_comunicacoes(i_r1, '[{"imei":"12","comunicado_em":"ontem"}]');
  assert rec.resultado = 'INVALIDO', 'item invalido nao derruba o lote';

  select ultima_comunicacao, ultima_posicao into rec from rastreadores where id = eq1;
  assert rec.ultima_comunicacao = '2026-10-20T13:00:00Z'::timestamptz, 'comunicacao gravada';
  assert (rec.ultima_posicao->>'latitude')::numeric = -15.6 and rec.ultima_posicao->>'origem' = 'SO UNIDADE 1', 'posicao gravada';

  select * into rec from api_registrar_comunicacoes(i_r1, '[{"imei":"860000000000001","comunicado_em":"2026-10-19T10:00:00Z"}]');
  assert rec.resultado = 'IGNORADO_ANTIGO' and rec.situacao_rastreamento = 'ATIVO', 'mais velha que a gravada e ignorada';

  -- a comunicacao nao "muda" o veiculo (o espelho nao regrava a ficha)
  select ctid into c1 from veiculos where id = v1;
  assert c1 = c0, 'comunicacao nao regrava o veiculo (alterado_em fica)';
  select count(*) into n from rastreador_eventos where rastreador_id = eq1;
  assert n = n0, 'telemetria nao gera evento no historico do equipamento';

  begin
    perform * from api_registrar_comunicacoes(i_sem_pessoa, '[]');
    assert false, 'sem rastreadores:escrever recusa';
  exception when insufficient_privilege then null;
  end;

  -- ------------------------------------------------- revogar
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  begin
    perform revogar_api_integracao(i_sem_pessoa, '');
    assert false, 'revogar exige motivo';
  exception when check_violation then null;
  end;
  perform revogar_api_integracao(i_sem_pessoa, 'Contrato encerrado');
  begin
    perform atualizar_api_integracao(i_sem_pessoa, 'SO VEICULOS', null, null, array['veiculos:ler'], null, null, null, true);
    assert false, 'revogada nao reativa';
  exception when check_violation then null;
  end;
  perform set_config('request.jwt.claim.sub', '', false);
  begin
    perform * from api_veiculos(i_sem_pessoa);
    assert false, 'chave revogada para de valer';
  exception when insufficient_privilege then null;
  end;

  -- vencida
  update api_integracoes set expira_em = now() - interval '1 minute' where id = i_sem_escopo;
  begin
    perform * from api_rastreadores(i_sem_escopo);
    assert false, 'chave vencida para de valer';
  exception when insufficient_privilege then null;
  end;

  -- a tabela nao e lida por quem nao e admin
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  execute 'set local role authenticated';
  select count(*) into n from api_integracoes;
  execute 'reset role';
  assert n = 0, 'gestor nao le as chaves: ' || n;

  raise notice '=== TESTES 0151 (API externa) PASSARAM ===';
end;
$$;
