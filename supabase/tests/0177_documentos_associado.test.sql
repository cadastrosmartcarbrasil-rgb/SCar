-- Teste funcional: documentos do associado e validade da CNH (0177)
\set ON_ERROR_STOP on
do $$
declare
  u_aud uuid := gen_random_uuid();
  u_sac uuid := gen_random_uuid();
  r1 uuid; cli uuid; veic uuid; tv uuid; l_id uuid; d1 uuid; d2 uuid; d3 uuid; rec record; n int; v_ok boolean;
begin
  insert into auth.users (id, email) values (u_aud,'aud@t.com'), (u_sac,'sac@t.com');
  insert into regionais (nome) values ('Cuiaba') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_aud,'Auditora','aud@t.com','auditoria', r1),
    (u_sac,'Atendente','sac@t.com','gestor_regional', r1);
  insert into clientes (nome_razao_social, cpf_cnpj, tipo_pessoa, regional_id)
    values ('ASSOCIADO TESTE', '52998224725', 'PF', r1) returning id into cli;

  perform set_config('request.jwt.claim.sub', u_sac::text, false);

  -- CNH sem validade e recusada pelo banco
  begin
    insert into associado_documentos (cliente_id, tipo, url) values (cli, 'CNH', 'x/1.jpg');
    raise exception 'devia recusar CNH sem validade';
  exception when check_violation then null;
  end;

  -- o insert nasce AGUARDANDO, com quem enviou, mesmo que mande outra situacao
  insert into associado_documentos (cliente_id, tipo, url, validade, situacao)
    values (cli, 'CNH', 'x/cnh-velha.jpg', current_date - 10, 'CONFERIDO') returning id into d1;
  select * into rec from associado_documentos where id = d1;
  assert rec.situacao = 'AGUARDANDO' and rec.enviado_por = u_sac, 'nasce aguardando com o autor';

  select * into rec from cliente_documentacao(cli);
  assert rec.cnh_vencida and not rec.tem_identidade, 'CNH vencida nao serve de identidade';
  assert not rec.tem_comprovante, 'sem comprovante';

  select count(*) into n from auditoria_documentos_associados('CNH_VENCIDA');
  assert n = 1, 'a CNH vencida entra na fila, veio ' || n;

  -- conferir: so a auditoria
  begin
    perform conferir_documento_associado(d1, true);
    raise exception 'gestor nao confere';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', u_aud::text, false);
  begin
    perform conferir_documento_associado(d1, false, '');
    raise exception 'recusa sem motivo';
  exception when check_violation then null;
  end;
  perform conferir_documento_associado(d1, true);
  assert (select situacao from associado_documentos where id = d1) = 'CONFERIDO', 'conferido';

  -- CNH nova substitui a anterior e sai da fila de vencidas
  perform set_config('request.jwt.claim.sub', u_sac::text, false);
  insert into associado_documentos (cliente_id, tipo, url, validade)
    values (cli, 'CNH', 'x/cnh-nova.jpg', current_date + 365 * 5) returning id into d2;
  assert (select situacao from associado_documentos where id = d1) = 'SUBSTITUIDO', 'a velha foi substituida';
  select count(*) into n from auditoria_documentos_associados('CNH_VENCIDA');
  assert n = 0, 'nenhuma vencida agora';
  insert into associado_documentos (cliente_id, tipo, url) values (cli, 'COMPROVANTE_ENDERECO', 'x/luz.pdf');
  select * into rec from cliente_documentacao(cli);
  assert rec.tem_identidade and rec.tem_comprovante and not rec.cnh_vencida, 'documentacao completa';
  select aguardando into n from auditoria_documentos_resumo();
  assert n = 2, 'dois aguardando, veio ' || n;

  -- OUTRO exige descricao
  begin
    insert into associado_documentos (cliente_id, tipo, url) values (cli, 'OUTRO', 'x/o.pdf');
    raise exception 'OUTRO sem descricao';
  exception when check_violation then null;
  end;

  -- checklist do lead: documentos do lead, e o cliente da base passa com os dele
  insert into leads (nome, celular, cpf_cnpj, regional_id) values ('FULANO NOVO', '65999990000', '11144477735', r1)
    returning id into l_id;
  select c.ok into v_ok from checklist_lead(l_id) c where c.item like 'Documento de identidade%';
  assert not v_ok, 'lead sem identidade trava';
  select c.ok into v_ok from checklist_lead(l_id) c where c.item = 'Comprovante de endereco';
  assert not v_ok, 'lead sem comprovante trava';
  insert into associado_documentos (lead_id, tipo, url) values (l_id, 'RG', 'x/rg.jpg');
  insert into associado_documentos (lead_id, tipo, url) values (l_id, 'COMPROVANTE_ENDERECO', 'x/c.pdf');
  insert into associado_documentos (lead_id, tipo, url, validade) values (l_id, 'CNH', 'x/c.jpg', current_date - 1);
  select c.ok into v_ok from checklist_lead(l_id) c where c.item like 'Documento de identidade%';
  assert v_ok, 'RG serve';
  select c.ok into v_ok from checklist_lead(l_id) c where c.item = 'CNH dentro da validade';
  assert not v_ok, 'CNH vencida do lead trava';

  update leads set cpf_cnpj = '52998224725' where id = l_id;  -- agora e o associado da base
  delete from associado_documentos where lead_id = l_id;
  select c.ok into v_ok from checklist_lead(l_id) c where c.item like 'Documento de identidade%';
  assert v_ok, 'associado da base usa os documentos da ficha';

  -- a entrada leva os documentos do lead para o associado, conferidos
  insert into associado_documentos (lead_id, tipo, url) values (l_id, 'RG', 'x/rg2.jpg') returning id into d3;
  perform set_config('request.jwt.claim.sub', u_aud::text, false);
  update leads set cliente_id = cli where id = l_id;
  select * into rec from associado_documentos where id = d3;
  assert rec.cliente_id = cli and rec.situacao = 'CONFERIDO' and rec.conferido_por = u_aud, 'levado e conferido';

  raise notice '=== TESTES 0177 (documentos do associado) PASSARAM ===';
end $$;
