-- Teste funcional: parque de rastreadores, ciclo de vida e divergencias (0050)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; r2 uuid; cli uuid; pl uuid; tv uuid;
  v1 uuid; v2 uuid; eq1 uuid; eq2 uuid; man uuid;
  n int; txt text; rec record; res jsonb;
begin
  insert into auth.users (id, email) values (u_adm, 'adm@t.com');
  insert into regionais (nome) values ('Cuiaba')      returning id into r1;
  insert into regionais (nome) values ('Grande Natal') returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm, 'Admin', 'adm@t.com', 'admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  insert into fornecedores (tipo_pessoa, documento, razao_social, nome_fantasia,
                            custo_mensal_equipamento, empresa_rastreamento)
    values ('PJ', '11222333000181', 'D TRAKER LTDA', 'D Traker', 12.50, true)
    returning id into pl;
  select id into tv from tipos_veiculo where nome = 'Passeio';

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Maria Rastreada', '52998224725', r1) returning id into cli;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status)
    values (cli, 'RAS1A23', r1, tv, 'ativo') returning id into v1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status)
    values (cli, 'RAS2B34', r1, tv, 'ativo') returning id into v2;

  -- ------------------------------------------------- cadastro + historico
  insert into rastreadores (imei, linha, empresa_rastreamento_id, regional_id)
    values ('86012345678901 2', '(65) 99999-8888', pl, r1) returning id into eq1;

  select imei, linha into rec from rastreadores where id = eq1;
  assert rec.imei = '860123456789012', 'IMEI entra so com digitos, veio ' || rec.imei;
  assert rec.linha = '65999998888', 'linha entra so com digitos, veio ' || coalesce(rec.linha,'');

  select count(*) into n from rastreador_eventos where rastreador_id = eq1 and tipo = 'CADASTRO';
  assert n = 1, 'o cadastro tem de nascer no historico';
  raise notice 'OK cadastro normaliza os digitos e ja grava historico';

  -- ------------------------------------------------- instalacao
  perform instalar_rastreador(eq1, v1, now(), 'Sob o painel', 'Joao Instalador');
  select * into rec from rastreadores where id = eq1;
  assert rec.status::text = 'ATIVO', 'instalou -> ATIVO, veio ' || rec.status;
  assert rec.veiculo_id = v1, 'o veiculo tem de ficar vinculado';
  assert rec.cliente_id = cli, 'o associado vem do veiculo (desnormalizado p/ relatorio)';

  -- o espelho da fase 1: a ficha do veiculo passa a ser mantida pelo modulo
  select rastreador_imei, rastreador_chip, empresa_rastreamento_id into rec from veiculos where id = v1;
  assert rec.rastreador_imei = '860123456789012', 'a ficha do veiculo recebe o IMEI';
  assert rec.rastreador_chip = '65999998888', 'a ficha do veiculo recebe o chip';
  assert rec.empresa_rastreamento_id = pl, 'a ficha do veiculo recebe a rastreadora';
  raise notice 'OK instalacao espelha na ficha do veiculo (0049)';

  -- um veiculo nao aceita dois equipamentos ativos
  insert into rastreadores (imei, empresa_rastreamento_id, regional_id)
    values ('860123456789013', pl, r1) returning id into eq2;
  begin
    perform instalar_rastreador(eq2, v1);
    assert false, 'dois equipamentos ativos no mesmo veiculo deveria falhar';
  exception when others then
    assert sqlerrm like '%ja tem rastreador ativo%', 'mensagem inesperada: ' || sqlerrm;
  end;
  raise notice 'OK um veiculo, um rastreador ativo';

  -- instalar so a partir do estoque
  begin
    perform instalar_rastreador(eq1, v2);
    assert false, 'instalar equipamento ja ativo deveria falhar';
  exception when others then
    assert sqlerrm like '%estoque%', 'mensagem inesperada: ' || sqlerrm;
  end;

  -- ------------------------------------------------- maquina de estados
  assert transicao_rastreador_valida('ATIVO', 'A_DEVOLVER'), 'ATIVO -> A_DEVOLVER e valida';
  assert not transicao_rastreador_valida('BAIXADO', 'DISPONIVEL'), 'BAIXADO e terminal';
  assert not transicao_rastreador_valida('DISPONIVEL', 'BOLETO_GERADO'), 'transicao sem sentido';

  begin
    perform mover_status_rastreador(eq2, 'BOLETO_GERADO');
    assert false, 'transicao invalida deveria falhar';
  exception when others then
    assert sqlerrm like '%nao permitida%', 'mensagem inesperada: ' || sqlerrm;
  end;

  begin
    perform mover_status_rastreador(eq2, 'BAIXADO');
    assert false, 'baixa sem motivo deveria falhar';
  exception when others then
    assert sqlerrm like '%motivo%', 'mensagem inesperada: ' || sqlerrm;
  end;
  raise notice 'OK maquina de estados e motivo obrigatorio na baixa';

  -- ------------------------------------------------- desinstalacao
  perform desinstalar_rastreador(eq1, 'DISPONIVEL', 'Cliente cancelou');
  select * into rec from rastreadores where id = eq1;
  assert rec.status::text = 'DISPONIVEL' and rec.veiculo_id is null, 'voltou ao estoque';
  assert rec.data_desinstalacao is not null, 'data de desinstalacao carimbada';

  select rastreador_imei into txt from veiculos where id = v1;
  assert txt is null, 'a ficha do veiculo tem de ser limpa junto';
  raise notice 'OK desinstalar devolve ao estoque e limpa a ficha do veiculo';

  select count(*) into n from rastreador_eventos
   where rastreador_id = eq1 and tipo in ('INSTALACAO', 'DESINSTALACAO');
  assert n = 2, 'instalacao e desinstalacao no historico, veio ' || n;

  -- ------------------------------------------------- transferencia de unidade
  perform transferir_rastreador_regional(eq1, r2, 'Remanejamento');
  select regional_id into txt from rastreadores where id = eq1;
  assert txt = r2::text, 'transferiu de unidade';
  select count(*) into n from rastreador_eventos
   where rastreador_id = eq1 and tipo = 'TRANSFERENCIA_FILIAL';
  assert n = 1, 'transferencia entra no historico';
  perform transferir_rastreador_regional(eq1, r1, 'Voltou');

  -- equipamento instalado nao se transfere sozinho
  perform instalar_rastreador(eq2, v2);
  begin
    perform transferir_rastreador_regional(eq2, r2, 'x');
    assert false, 'equipamento instalado nao deveria transferir';
  exception when others then
    assert sqlerrm like '%desinstale%', 'mensagem inesperada: ' || sqlerrm;
  end;
  raise notice 'OK transferencia entre unidades so com o equipamento em estoque';

  -- ------------------------------------------------- manutencao
  insert into rastreadores (imei, empresa_rastreamento_id, regional_id, linha)
    values ('860123456789014', pl, r1, '65988887777') returning id into eq1;
  select id into man from rastreador_manutencoes limit 1;
  select abrir_manutencao_rastreador(eq1, 'Nao comunica') into rec;
  select id into man from rastreador_manutencoes where rastreador_id = eq1 and status = 'ABERTA';
  assert man is not null, 'manutencao aberta';
  select status into txt from rastreadores where id = eq1;
  assert txt = 'MANUTENCAO', 'equipamento vai para manutencao, veio ' || txt;

  perform concluir_manutencao_rastreador(man, 'Trocada a antena', 80.00);
  select status into txt from rastreadores where id = eq1;
  assert txt = 'DISPONIVEL', 'manutencao concluida devolve ao estoque, veio ' || txt;
  raise notice 'OK manutencao tira e devolve o equipamento ao estoque';

  -- ------------------------------------------------- lista e resumo
  select count(*) into n from rastreadores_listar();
  assert n = 3, 'a lista devolve os 3 equipamentos, veio ' || n;
  select count(*) into n from rastreadores_listar(p_busca := 'RAS2B34');
  assert n = 1, 'busca por placa acha o equipamento instalado, veio ' || n;
  select count(*) into n from rastreadores_listar(p_status := 'DISPONIVEL');
  assert n = 2, 'filtro por status, veio ' || n;

  select rastreadores_resumo() into res;
  assert (res->>'total')::int = 3, 'resumo conta o parque';
  assert (res->>'ativos')::int = 1, 'resumo conta os ativos';
  assert jsonb_array_length(res->'por_plataforma') = 1, 'resumo agrupa por plataforma';
  assert (res->'por_plataforma'->0->>'custo_mensal')::numeric = 12.50,
         'custo mensal = ativos x custo por equipamento';
  raise notice 'OK lista paginada e resumo do dashboard';

  -- ------------------------------------------------- divergencias
  -- (a) veiculo que exige rastreador e esta sem equipamento
  update tipos_veiculo set exige_rastreador = true where id = tv;
  select count(*) into n from rastreadores_divergencias()
   where tipo = 'VEICULO_SEM_RASTREADOR' and placa = 'RAS1A23';
  assert n = 1, 'o veiculo sem equipamento tem de aparecer, veio ' || n;

  -- (b) ficha do veiculo com IMEI que nao existe no parque (liga a fase 1)
  update veiculos set rastreador_imei = '869999999999999' where id = v1;
  select count(*) into n from rastreadores_divergencias() where tipo = 'FICHA_SEM_EQUIPAMENTO';
  assert n = 1, 'IMEI digitado na ficha sem equipamento cadastrado, veio ' || n;
  update veiculos set rastreador_imei = null where id = v1;

  -- (c) cadastro incompleto (sem chip)
  select count(*) into n from rastreadores_divergencias() where tipo = 'CADASTRO_INCOMPLETO';
  assert n >= 1, 'equipamento sem chip/linha tem de aparecer';

  -- (d) equipamento ativo em veiculo que saiu da base
  update veiculos set status = 'inativo' where id = v2;
  select count(*) into n from rastreadores_divergencias()
   where tipo = 'RASTREADOR_EM_VEICULO_INATIVO';
  assert n = 1, 'equipamento em veiculo inativo e candidato a recolhimento, veio ' || n;
  update veiculos set status = 'ativo' where id = v2;

  -- (e) prazo estourado: A_DEVOLVER ha mais de 5 dias
  perform desinstalar_rastreador(eq2, 'DISPONIVEL', 'fim');
  -- em dois passos de proposito: a trigger BEFORE carimba `status_desde` a cada
  -- troca de status, entao envelhecer o registro exige um update sem mudar status.
  update rastreadores set status = 'A_DEVOLVER' where id = eq2;
  update rastreadores set status_desde = now() - interval '9 days' where id = eq2;
  select descricao into txt from rastreadores_divergencias()
   where tipo = 'STATUS_INCOERENTE' and rastreador_id = eq2;
  assert txt like '%Devolucao pedida ha 9 dias%', 'o prazo tem de ser dito, veio ' || coalesce(txt,'');
  raise notice 'OK divergencias cruzam parque x cadastro de veiculos';

  -- ------------------------------------------------- relatorio a recuperar
  select count(*) into n from rastreadores_a_recuperar();
  assert n = 1, 'o equipamento A_DEVOLVER entra na lista de recuperacao, veio ' || n;

  raise notice '=== TESTES 0050 (modulo de rastreadores) PASSARAM ===';
end $$;
