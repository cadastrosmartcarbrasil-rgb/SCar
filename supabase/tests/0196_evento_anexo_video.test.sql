-- Teste funcional: video nos anexos do evento (0196)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; cli uuid; veic uuid; ev uuid; tipo_ev uuid; n int;
begin
  insert into auth.users (id, email) values (u_adm,'adm196@t.com');
  insert into regionais (nome) values ('Unidade 196') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values (u_adm,'Admin','adm196@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  insert into clientes (nome_razao_social, tipo_pessoa, cpf_cnpj, regional_id)
    values ('Maria Teste','PF','11144477735', r1) returning id into cli;
  insert into veiculos (cliente_id, placa, marca, modelo, ano_modelo, status, regional_id)
    values (cli, 'ABC1D96', 'FIAT', 'ARGO', 2020, 'ativo', r1) returning id into veic;
  select id into tipo_ev from tipos_evento limit 1;
  insert into eventos_sinistro (veiculo_id, cliente_id, tipo_evento_id, data_ocorrencia, descricao, regional_id)
    values (veic, cli, tipo_ev, current_date, 'Colisao', r1) returning id into ev;

  -- video de 30 MB entra
  insert into anexos_evento (evento_id, tipo_documento, arquivo_url, nome_original, tamanho_bytes)
    values (ev, 'VIDEO', ev || '/video.mp4', 'video.mp4', 30 * 1024 * 1024);

  -- video acima de 50 MB e recusado
  begin
    insert into anexos_evento (evento_id, tipo_documento, arquivo_url, nome_original, tamanho_bytes)
      values (ev, 'VIDEO', ev || '/enorme.mp4', 'enorme.mp4', 51 * 1024 * 1024);
    assert false, 'video acima de 50 MB deveria ser recusado';
  exception when check_violation then null; end;

  -- foto continua com o teto de 10 MB
  begin
    insert into anexos_evento (evento_id, tipo_documento, arquivo_url, nome_original, tamanho_bytes)
      values (ev, 'FOTO_AVARIA', ev || '/gigante.jpg', 'gigante.jpg', 11 * 1024 * 1024);
    assert false, 'foto acima de 10 MB deveria ser recusada';
  exception when check_violation then null; end;

  select count(*) into n from anexos_evento where evento_id = ev;
  assert n = 1, 'so o video de 30 MB entrou, veio ' || n;

  raise notice '=== TESTES 0196 (video nos anexos do evento) PASSARAM ===';
end $$;
