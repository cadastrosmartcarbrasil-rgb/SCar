-- Teste funcional: anexos da OS da assistencia 24h (0048)
\set ON_ERROR_STOP on
do $$
declare
  u_adm  uuid := gen_random_uuid();
  u_24h  uuid := gen_random_uuid();
  u_cot  uuid := gen_random_uuid();   -- staff sem acesso a 24h
  r1 uuid; cli uuid; veic uuid; serv uuid; acion uuid; n int; rec record;
begin
  insert into auth.users (id, email)
    values (u_adm,'adm@t.com'), (u_24h,'ass@t.com'), (u_cot,'cot@t.com');
  insert into regionais (nome) values ('Smart Centro') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm@t.com','admin', null),
    (u_24h,'Atendente 24h','ass@t.com','assistencia_24h', r1),
    (u_cot,'Cotador','cot@t.com','cotador', r1);

  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  insert into clientes (nome_razao_social, tipo_pessoa, cpf_cnpj, regional_id)
    values ('Joao da Silva','PF','11144477735', r1) returning id into cli;
  insert into veiculos (cliente_id, placa, marca, modelo, ano_modelo, status, regional_id)
    values (cli, 'ABC1D23', 'FIAT', 'ARGO', 2020, 'ativo', r1) returning id into veic;

  select id into serv from servicos_assistencia where ativo limit 1;
  insert into acionamentos_assistencia (veiculo_id, cliente_id, servico_id, regional_id, status)
    values (veic, cli, serv, r1, 'ABERTO') returning id into acion;

  -- ------------------------------------------------- teto de 10 MB
  begin
    insert into acionamento_anexos (acionamento_id, url, tipo, descricao, tamanho_bytes)
      values (acion, acion || '/gigante.jpg', 'FOTO_VEICULO', 'gigante.jpg', 11 * 1024 * 1024);
    assert false, 'anexo acima de 10 MB deveria ser recusado pelo banco';
  exception when check_violation then null; end;
  raise notice 'OK o teto de 10 MB vale no banco, como na vistoria (0047)';

  -- ------------------------------------------------- tipo tem lista fechada
  begin
    insert into acionamento_anexos (acionamento_id, url, tipo)
      values (acion, acion || '/x.jpg', 'QUALQUER_COISA');
    assert false, 'tipo fora da lista deveria ser recusado';
  exception when check_violation then null; end;

  -- ------------------------------------------------- anexo valido
  insert into acionamento_anexos (acionamento_id, url, tipo, descricao, tamanho_bytes, enviado_por)
    values (acion, acion || '/frente.jpg', 'FOTO_VEICULO', 'frente.jpg', 320 * 1024, u_adm);
  insert into acionamento_anexos (acionamento_id, url, tipo, descricao)
    values (acion, acion || '/nota.pdf', 'COMPROVANTE', 'nota.pdf');

  select count(*) into n from acionamento_anexos where acionamento_id = acion;
  assert n = 2, 'os dois anexos tem de ficar guardados, veio ' || n;
  raise notice 'OK foto e documento ficam presos a OS, com peso e autor';

  -- ------------------------------------------------- quem enxerga (RLS de verdade)
  perform set_config('request.jwt.claim.sub', u_24h::text, false);
  execute 'set local role authenticated';
  select count(*) into n from acionamento_anexos where acionamento_id = acion;
  insert into acionamento_anexos (acionamento_id, url, tipo, descricao)
    values (acion, acion || '/local.jpg', 'FOTO_LOCAL', 'local.jpg');
  execute 'reset role';
  assert n = 2, 'o time da 24h ve os anexos da OS, veio ' || n;
  raise notice 'OK o atendente da 24h anexa e le';

  -- cotador NAO opera a 24h: le (esta na regional) mas nao escreve
  perform set_config('request.jwt.claim.sub', u_cot::text, false);
  execute 'set local role authenticated';
  select count(*) into n from acionamento_anexos where acionamento_id = acion;
  execute 'reset role';
  assert n = 3, 'staff da regional enxerga a prova do atendimento, veio ' || n;

  begin
    execute 'set local role authenticated';
    insert into acionamento_anexos (acionamento_id, url, tipo)
      values (acion, acion || '/intruso.jpg', 'OUTRO');
    execute 'reset role';
    assert false, 'quem nao opera a 24h nao pode anexar na OS';
  exception when insufficient_privilege then
    execute 'reset role';
  end;

  select count(*) into n from acionamento_anexos where acionamento_id = acion;
  assert n = 3, 'e nada entrou, veio ' || n;
  raise notice 'OK escrever e so de quem opera a 24h';

  -- ------------------------------------------------- quem nao ve a OS nao ve a foto
  declare
    r2 uuid; u_out uuid := gen_random_uuid();
  begin
    insert into regionais (nome) values ('Smart Litoral') returning id into r2;
    insert into auth.users (id, email) values (u_out, 'fora@t.com');
    insert into usuarios (id, nome, email, papel, regional_id)
      values (u_out, 'Cotador de fora', 'fora@t.com', 'cotador', r2);
    perform set_config('request.jwt.claim.sub', u_out::text, false);
    execute 'set local role authenticated';
    select count(*) into n from acionamento_anexos where acionamento_id = acion;
    execute 'reset role';
    assert n = 0, 'anexo de OS de outra unidade nao pode aparecer, veio ' || n;
  end;
  raise notice 'OK o anexo segue a visibilidade da propria OS';

  -- ------------------------------------------------- a OS cai, os anexos vao junto
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  delete from acionamentos_assistencia where id = acion;
  select count(*) into n from acionamento_anexos where acionamento_id = acion;
  assert n = 0, 'anexo orfao nao pode sobrar, veio ' || n;
  raise notice 'OK apagar a OS leva os anexos (nada de orfao)';

  -- ------------------------------------------------- o mesmo teto no evento
  declare
    ev uuid; tipo_ev uuid;
  begin
    select id into tipo_ev from tipos_evento limit 1;
    insert into eventos_sinistro (veiculo_id, cliente_id, tipo_evento_id, data_ocorrencia,
                                  descricao, regional_id)
      values (veic, cli, tipo_ev, current_date, 'Colisao', r1) returning id into ev;
    begin
      insert into anexos_evento (evento_id, tipo_documento, arquivo_url, nome_original, tamanho_bytes)
        values (ev, 'FOTO_AVARIA', ev || '/gigante.jpg', 'gigante.jpg', 11 * 1024 * 1024);
      assert false, 'anexo de evento acima de 10 MB deveria ser recusado';
    exception when check_violation then null; end;

    insert into anexos_evento (evento_id, tipo_documento, arquivo_url, nome_original, tamanho_bytes)
      values (ev, 'FOTO_AVARIA', ev || '/avaria.jpg', 'avaria.jpg', 700 * 1024);
    select count(*) into n from anexos_evento where evento_id = ev;
    assert n = 1, 'a foto dentro do teto entra normal, veio ' || n;
  end;
  raise notice 'OK o teto de 10 MB tambem vale para a foto do evento';

  raise notice '=== TESTES 0048 (anexos da assistencia 24h) PASSARAM ===';
end $$;
