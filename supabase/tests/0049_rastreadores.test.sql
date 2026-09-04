-- Teste funcional: rastreador na ficha do veiculo e catalogo de rastreadoras (0049)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; cli uuid; er uuid; v1 uuid; n int;
begin
  insert into auth.users (id, email) values (u_adm, 'adm@t.com');
  insert into regionais (nome) values ('Smart Centro') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm, 'Admin', 'adm@t.com', 'admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  insert into empresas_rastreamento (nome, cnpj, telefone, plataforma_url)
    values ('Smart Tracker', '11222333000181', '(11) 4000-0000', 'https://www.smarttracker.com.br')
    returning id into er;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Jose Rastreado', '52998224725', r1) returning id into cli;

  insert into veiculos (cliente_id, placa, regional_id, rastreador_imei, rastreador_chip, empresa_rastreamento_id)
    values (cli, 'RAS1A23', r1, '860123456789012', '5511998877665', er) returning id into v1;

  -- ------------------------------------------------- IMEI e do equipamento, nao do carro
  begin
    insert into veiculos (cliente_id, placa, regional_id, rastreador_imei)
      values (cli, 'RAS2B34', r1, '860123456789012');
    assert false, 'o mesmo IMEI nao pode ficar em dois veiculos vivos';
  exception when unique_violation then null; end;
  raise notice 'OK um equipamento so pode estar em um veiculo';

  -- ------------------------------------------------- formato conferido no banco
  begin
    insert into veiculos (cliente_id, placa, regional_id, rastreador_imei)
      values (cli, 'RAS3C45', r1, '86012345678901X');
    assert false, 'IMEI com letra deveria ser recusado';
  exception when check_violation then null; end;

  begin
    insert into veiculos (cliente_id, placa, regional_id, rastreador_chip)
      values (cli, 'RAS4D56', r1, '1234567');
    assert false, 'chip com menos de 8 digitos deveria ser recusado';
  exception when check_violation then null; end;
  raise notice 'OK formato de IMEI (14-17) e chip (8-22) valem no banco';

  -- ------------------------------------------------- trocar o carro devolve o equipamento
  update veiculos set status = 'excluido' where id = v1;
  insert into veiculos (cliente_id, placa, regional_id, rastreador_imei)
    values (cli, 'RAS5E67', r1, '860123456789012');
  raise notice 'OK veiculo excluido libera o IMEI para outro veiculo';

  -- ------------------------------------------------- rastreadora sai, veiculo fica
  delete from empresas_rastreamento where id = er;
  select count(*) into n from veiculos where id = v1 and empresa_rastreamento_id is null;
  assert n = 1, 'apagar a rastreadora nao pode levar o veiculo junto';
  select count(*) into n from veiculos where id = v1 and rastreador_imei = '860123456789012';
  assert n = 1, 'o IMEI continua registrado no veiculo';
  raise notice 'OK remover a rastreadora so desliga o vinculo (set null)';

  -- ------------------------------------------------- veiculo sem rastreador continua valido
  insert into veiculos (cliente_id, placa, regional_id) values (cli, 'SEM1F78', r1);
  raise notice 'OK nem todo veiculo tem rastreador: campos opcionais';

  -- ------------------------------------------------- alerta de pendencia disponivel
  select count(*) into n from tipos_alerta where nome = 'Rastreador pendente' and ativo;
  assert n = 1, 'o alerta "Rastreador pendente" tem de existir no catalogo';
  raise notice 'OK alerta "Rastreador pendente" disponivel para o SAC';

  -- ------------------------------------------------- nome da rastreadora e unico
  insert into empresas_rastreamento (nome) values ('Autotrac');
  begin
    insert into empresas_rastreamento (nome) values ('Autotrac');
    assert false, 'nome de rastreadora duplicado deveria ser recusado';
  exception when unique_violation then null; end;
  raise notice 'OK catalogo de rastreadoras nao aceita nome repetido';

  raise notice '=== TESTES 0049 (rastreadores - fase 1) PASSARAM ===';
end $$;
