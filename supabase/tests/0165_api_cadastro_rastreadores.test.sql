-- Teste da 0165: a rastreadora cadastra e instala equipamentos pela API.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; r2 uuid; pl uuid; pl2 uuid; tv uuid; cli uuid; cli2 uuid;
  v1 uuid; v2 uuid; v3 uuid; v4 uuid; eq_outra uuid;
  i_pl uuid; i_r1 uuid; i_sem_forn uuid; i_leitura uuid;
  rec record; n int;
  h text := repeat('b', 64);
begin
  insert into auth.users (id, email) values (u_adm, 'adm161@t.com');
  insert into regionais (nome) values ('CAD UNIDADE 1') returning id into r1;
  insert into regionais (nome) values ('CAD UNIDADE 2') returning id into r2;
  insert into usuarios (id, nome, email, papel) values (u_adm, 'ADMIN 161', 'adm161@t.com', 'admin');

  insert into fornecedores (tipo_pessoa, documento, razao_social, nome_fantasia, empresa_rastreamento)
    values ('PJ', '11222333000181', 'NEW CAD LTDA', 'NEW CAD', true) returning id into pl;
  insert into fornecedores (tipo_pessoa, documento, razao_social, nome_fantasia, empresa_rastreamento)
    values ('PJ', '45723174000110', 'OUTRA CAD LTDA', 'OUTRA CAD', true) returning id into pl2;
  select id into tv from tipos_veiculo where nome = 'Passeio';

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'MARIA CAD', '52998224725', r1) returning id into cli;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'JOAO CAD', '11144477735', r2) returning id into cli2;
  insert into veiculos (cliente_id, placa, chassi, regional_id, tipo_veiculo_id, status)
    values (cli, 'CAD1A23', '9BWZZZ377VT004251', r1, tv, 'ativo') returning id into v1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status)
    values (cli, 'CAD2B34', r1, tv, 'ativo') returning id into v2;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status)
    values (cli2, 'CAD3C45', r2, tv, 'ativo') returning id into v3;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status)
    values (cli, 'CAD4D56', r1, tv, 'ativo') returning id into v4;

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  i_pl := criar_api_integracao('NEW CAD', null, pl, array['rastreadores:escrever','rastreadores:ler'], null, null, null, 'cadcadcad1', h);
  i_r1 := criar_api_integracao('NEW CAD R1', null, pl, array['rastreadores:escrever'], array[r1], null, null, 'cadcadcad2', h);
  i_sem_forn := criar_api_integracao('SEM FORN', null, null, array['rastreadores:escrever'], null, null, null, 'cadcadcad3', h);
  i_leitura := criar_api_integracao('SO LER', null, pl, array['rastreadores:ler'], null, null, null, 'cadcadcad4', h);
  -- equipamento de OUTRA rastreadora, ativo no v4
  insert into rastreadores (imei, empresa_rastreamento_id, regional_id) values ('861000000000099', pl2, r1) returning id into eq_outra;
  perform instalar_rastreador(eq_outra, v4);
  perform set_config('request.jwt.claim.sub', '', false);

  -- com sessao recusa
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  begin
    perform * from api_cadastrar_rastreadores(i_pl, '[]');
    assert false, 'com sessao recusa';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', '', false);

  begin
    perform * from api_cadastrar_rastreadores(i_leitura, '[]');
    assert false, 'sem rastreadores:escrever recusa';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from api_cadastrar_rastreadores(i_sem_forn, '[]');
    assert false, 'chave sem rastreadora recusa';
  exception when check_violation then null;
  end;
  begin
    perform * from api_cadastrar_rastreadores(i_pl, '{"imei":"1"}');
    assert false, 'precisa ser lista';
  exception when check_violation then null;
  end;

  -- estoque (sem veiculo)
  select * into rec from api_cadastrar_rastreadores(i_pl,
    '[{"imei":"861 000 000 000 001","iccid":"8955 0000 0000 0001","linha":"(65) 99999-8888","operadora":"vivo","modelo":"nt-40"}]');
  assert rec.resultado = 'CRIADO', 'cria em estoque: ' || rec.resultado;
  select * into rec from rastreadores where imei = '861000000000001';
  assert rec.status = 'DISPONIVEL' and rec.empresa_rastreamento_id = pl and rec.veiculo_id is null, 'nasce da rastreadora, em estoque';
  assert rec.iccid = '8955000000000001' and rec.linha = '65999998888' and rec.operadora = 'VIVO', 'dados limpos';
  select count(*) into n from rastreador_eventos e join rastreadores x on x.id = e.rastreador_id
   where x.imei = '861000000000001' and e.tipo = 'CADASTRO' and e.descricao like 'API NEW CAD%';
  assert n = 1, 'historico diz que veio da API';

  -- reenviar sem veiculo: atualiza (re-executavel), nao duplica
  select * into rec from api_cadastrar_rastreadores(i_pl, '[{"imei":"861000000000001","fabricante":"new"}]');
  assert rec.resultado = 'ATUALIZADO', 'reenvio atualiza: ' || rec.resultado;
  select count(*) into n from rastreadores where imei = '861000000000001';
  assert n = 1, 'nao duplica';
  select * into rec from rastreadores where imei = '861000000000001';
  assert rec.fabricante = 'NEW' and rec.operadora = 'VIVO', 'completa sem apagar';

  -- instalar pela placa (o equipamento ja em estoque)
  select * into rec from api_cadastrar_rastreadores(i_pl, '[{"imei":"861000000000001","placa":"cad-1a23","data_instalacao":"2026-10-30T10:00:00-03:00"}]');
  assert rec.resultado = 'INSTALADO' and rec.veiculo_id = v1 and rec.placa = 'CAD1A23' and rec.situacao_rastreamento = 'ATIVO',
    'instala pela placa: ' || rec.resultado;
  select * into rec from rastreadores where imei = '861000000000001';
  assert rec.status = 'ATIVO' and rec.veiculo_id = v1 and rec.cliente_id = cli and rec.regional_id = r1, 'ativo no veiculo';
  assert rec.data_instalacao = '2026-10-30T13:00:00Z'::timestamptz, 'data de instalacao informada';
  select * into rec from veiculos where id = v1;
  assert rec.rastreador_imei = '861000000000001' and rec.empresa_rastreamento_id = pl and rec.rastreador_chip = '65999998888',
    'ficha do veiculo espelhada';

  -- de novo: ja instalado
  select * into rec from api_cadastrar_rastreadores(i_pl, '[{"imei":"861000000000001","chassi":"9BWZZZ377VT004251"}]');
  assert rec.resultado = 'JA_INSTALADO', 'idempotente: ' || rec.resultado;

  -- novo e instalado de uma vez
  select * into rec from api_cadastrar_rastreadores(i_pl, jsonb_build_array(jsonb_build_object('imei','861000000000002','veiculo_id', v2)));
  assert rec.resultado = 'CRIADO_INSTALADO' and rec.veiculo_id = v2, 'cria e instala: ' || rec.resultado;

  -- troca: outro equipamento da mesma rastreadora no v2 -> o antigo volta ao estoque
  select * into rec from api_cadastrar_rastreadores(i_pl, '[{"imei":"861000000000003","placa":"CAD2B34"}]');
  assert rec.resultado = 'CRIADO_INSTALADO' and rec.motivo like '%861000000000002 voltou ao estoque%', 'troca: ' || coalesce(rec.motivo,'-');
  select * into rec from rastreadores where imei = '861000000000002';
  assert rec.status = 'DISPONIVEL' and rec.veiculo_id is null, 'o antigo volta ao estoque';
  select * into rec from veiculos where id = v2;
  assert rec.rastreador_imei = '861000000000003', 'a ficha mostra o novo';

  -- mover: o 003 (ativo no v2) vai para o v1? o v1 tem o 001 (mesma plataforma) -> 001 volta ao estoque
  select * into rec from api_cadastrar_rastreadores(i_pl, '[{"imei":"861000000000003","placa":"CAD1A23"}]');
  assert rec.resultado = 'INSTALADO' and rec.veiculo_id = v1, 'move de veiculo: ' || rec.resultado;
  select * into rec from veiculos where id = v2;
  assert rec.rastreador_imei is null, 'o veiculo antigo fica sem rastreador na ficha';
  select count(*) into n from rastreadores where veiculo_id = v1 and status = 'ATIVO';
  assert n = 1, 'um ativo por veiculo';

  -- o v4 tem equipamento ativo de OUTRA rastreadora -> recusado
  select * into rec from api_cadastrar_rastreadores(i_pl, '[{"imei":"861000000000004","placa":"CAD4D56"}]');
  assert rec.resultado = 'RECUSADO' and rec.motivo like '%outra rastreadora%', 'nao derruba equipamento alheio: ' || rec.resultado;
  select * into rec from rastreadores where imei = '861000000000004';
  assert rec.status = 'DISPONIVEL' and rec.veiculo_id is null, 'instalacao recusada: o equipamento fica em estoque';
  select * into rec from rastreadores where id = eq_outra;
  assert rec.status = 'ATIVO' and rec.veiculo_id = v4, 'o alheio segue intacto';

  -- IMEI de outra rastreadora
  select * into rec from api_cadastrar_rastreadores(i_pl, '[{"imei":"861000000000099","fabricante":"x"}]');
  assert rec.resultado = 'OUTRA_PLATAFORMA', 'IMEI alheio: ' || rec.resultado;

  -- veiculo inexistente: equipamento fica em estoque
  select * into rec from api_cadastrar_rastreadores(i_pl, '[{"imei":"861000000000005","placa":"ZZZ9Z99"}]');
  assert rec.resultado = 'VEICULO_NAO_ENCONTRADO' and rec.rastreador_id is not null, 'sem veiculo: ' || rec.resultado;
  select * into rec from rastreadores where imei = '861000000000005';
  assert rec.status = 'DISPONIVEL', 'fica em estoque';

  -- recorte por unidade: veiculo de outra unidade nao e achado
  select * into rec from api_cadastrar_rastreadores(i_r1, '[{"imei":"861000000000006","placa":"CAD3C45"}]');
  assert rec.resultado = 'VEICULO_NAO_ENCONTRADO', 'outra unidade: ' || rec.resultado;

  -- status fora de estoque/ativo nao instala
  update rastreadores set status = 'MANUTENCAO' where imei = '861000000000002';
  select * into rec from api_cadastrar_rastreadores(i_pl, '[{"imei":"861000000000002","placa":"CAD2B34"}]');
  assert rec.resultado = 'RECUSADO', 'em manutencao nao instala: ' || rec.resultado;

  -- invalidos nao derrubam o lote
  select count(*) into n from api_cadastrar_rastreadores(i_pl, '[{"imei":"12"},"x",{"imei":"861000000000007","data_instalacao":"amanha"},{"imei":"861000000000008"}]')
   where resultado = 'INVALIDO';
  assert n = 3, 'tres invalidos: ' || n;
  select count(*) into n from rastreadores where imei = '861000000000008';
  assert n = 1, 'o valido do mesmo lote entrou';

  raise notice '=== TESTES 0165 (API: cadastro de rastreadores) PASSARAM ===';
end $$;
