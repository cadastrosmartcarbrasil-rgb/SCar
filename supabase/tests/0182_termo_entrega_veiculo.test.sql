-- Teste da 0182: Termo de entrega de veiculo (aba Termos do evento).
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_sin uuid := gen_random_uuid();
  u_out uuid := gen_random_uuid();
  u_cli uuid := gen_random_uuid();
  r1 uuid; r2 uuid; c1 uuid; ve1 uuid; ev1 uuid; forn uuid; terc uuid;
  mo uuid; mos uuid; v termos_versoes; vos termos_versoes; os1 ordens_servico;
  t1 termos_entrega; t2 termos_entrega; d jsonb; ok boolean; n bigint; te termos_emitidos;
begin
  insert into regionais (nome) values ('U182') returning id into r1;
  insert into regionais (nome) values ('U182B') returning id into r2;
  insert into auth.users (id, email) values (u_adm,'adm182@t.com'), (u_sin,'sin182@t.com'),
    (u_out,'out182@t.com'), (u_cli,'cli182@t.com');
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm182@t.com','admin', null),
    (u_sin,'Eventos','sin182@t.com','sinistro', r1),
    (u_out,'Eventos outra','out182@t.com','sinistro', r2);
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, auth_user_id)
    values ('PF','Associado Entrega','52998224725', r1, u_cli) returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, status) values (c1,'ENT1B82', r1, 'ativo') returning id into ve1;
  insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, tipo_evento, regional_id, valor_participacao)
    values (ve1, c1, current_date - 10, 'COLISAO', r1, 500) returning id into ev1;
  insert into evento_terceiros (evento_id, cliente_id, nome, veiculo_placa) values (ev1, c1, 'TERCEIRO X', 'TER1A11')
    returning id into terc;
  insert into fornecedores (tipo_pessoa, razao_social) values ('PJ', 'OFICINA 182') returning id into forn;

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  -- ENTREGA_VEICULO exige escopo EVENTO
  ok := false;
  begin insert into termos_modelos (nome, tipo, escopo, rascunho_html) values ('X', 'ENTREGA_VEICULO', 'ASSOCIADO', '<p>x</p>');
  exception when check_violation then ok := true; end;
  assert ok, 'entrega precisa de escopo EVENTO';
  ok := false;
  begin insert into termos_modelos (nome, tipo, escopo, rascunho_html) values ('X', 'CONTRATO', 'EVENTO', '<p>x</p>');
  exception when check_violation then ok := true; end;
  assert ok, 'escopo EVENTO so para OS e entrega';
  insert into termos_modelos (nome, tipo, escopo, rascunho_html)
    values ('TERMO DE ENTREGA', 'ENTREGA_VEICULO', 'EVENTO', '<p>Entrega {{PROTOCOLO_DO_TERMO}}</p>') returning id into mo;
  v := publicar_versao_termo(mo);
  insert into termos_modelos (nome, tipo, escopo, rascunho_html)
    values ('OS', 'ORDEM_SERVICO', 'EVENTO', '<p>OS {{NUMERO_DA_OS}}</p>') returning id into mos;
  vos := publicar_versao_termo(mos);

  -- nao sai pelo termo do associado
  ok := false;
  begin perform registrar_termo_emitido(v.id, c1, ve1, '<p>x</p>');
  exception when check_violation then ok := true; end;
  assert ok, 'entrega nao sai pelo termo do associado';

  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  os1 := emitir_ordem_servico(vos.id, jsonb_build_object('evento_id', ev1, 'fornecedor_id', forn,
    'data_limite_entrega', current_date + 5, 'participacao_associado', 0,
    'itens', jsonb_build_array(jsonb_build_object('tipo','MAO_DE_OBRA','descricao','FUNILARIA','quantidade',1,'valor_unitario',800))),
    '<p>OS {{NUMERO_DA_OS}}</p>');

  d := jsonb_build_object('evento_id', ev1, 'recebedor_tipo', 'ASSOCIADO', 'abrangencia', 'PARCIAL',
    'descricao', 'Entregue o veiculo; retrovisor pendente', 'data_entrega', current_date, 'ordem_servico_id', os1.id);

  -- o modelo de OS nao serve de termo de entrega
  ok := false;
  begin perform emitir_termo_entrega(vos.id, d, '<p>x</p>');
  exception when check_violation then ok := true; end;
  assert ok, 'modelo errado recusado';

  -- outra unidade nao emite
  perform set_config('request.jwt.claim.sub', u_out::text, false);
  ok := false;
  begin perform emitir_termo_entrega(v.id, d, '<p>x</p>');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'outra unidade nao emite';

  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  -- parcial sem descricao
  ok := false;
  begin perform emitir_termo_entrega(v.id, d || jsonb_build_object('descricao', ''), '<p>x</p>');
  exception when check_violation then ok := true; end;
  assert ok, 'parcial sem descricao recusado';
  -- terceiro sem escolher
  ok := false;
  begin perform emitir_termo_entrega(v.id, d || jsonb_build_object('recebedor_tipo', 'TERCEIRO'), '<p>x</p>');
  exception when check_violation then ok := true; end;
  assert ok, 'terceiro sem escolher recusado';
  -- entrega antes da ocorrencia
  ok := false;
  begin perform emitir_termo_entrega(v.id, d || jsonb_build_object('data_entrega', current_date - 30), '<p>x</p>');
  exception when check_violation then ok := true; end;
  assert ok, 'entrega antes da ocorrencia recusada';

  t1 := emitir_termo_entrega(v.id, d, '<p>Entrega {{PROTOCOLO_DO_TERMO}}</p>');
  assert t1.situacao = 'AGUARDANDO_ASSINATURA' and t1.abrangencia = 'PARCIAL', 'emitido parcial';
  assert t1.fornecedor_id = forn and t1.ordem_servico_id = os1.id, 'oficina da OS';
  select * into te from termos_emitidos where id = t1.termo_emitido_id;
  assert te.evento_id = ev1 and not te.visivel_portal and te.conteudo_html like '%TRM-%', 'termo do evento';
  assert te.html_sha256 = termo_sha256(te.conteudo_html), 'hash';
  assert exists (select 1 from historico_protocolo where evento_id = ev1 and acao_realizada = 'TERMO_ENTREGA_EMITIDO'), 'historico';

  -- segundo termo (total, terceiro)
  t2 := emitir_termo_entrega(v.id, jsonb_build_object('evento_id', ev1, 'recebedor_tipo', 'TERCEIRO',
    'evento_terceiro_id', terc, 'abrangencia', 'TOTAL', 'data_entrega', current_date), '<p>T2</p>');
  select count(*) into n from termos_entrega where evento_id = ev1;
  assert n = 2, 'varios termos por evento';

  -- imutavel / sem delete
  ok := false;
  begin update termos_entrega set data_entrega = current_date - 1 where id = t1.id;
  exception when check_violation then ok := true; end;
  assert ok, 'conteudo nao muda';
  ok := false;
  begin delete from termos_entrega where id = t1.id;
  exception when check_violation then ok := true; end;
  assert ok, 'nao se apaga';

  -- PDF uma vez
  perform anexar_pdf_termo_entrega(t1.id, 'emitidos/x/t1.pdf', repeat('b', 64), 100);
  perform anexar_pdf_termo_entrega(t1.id, 'emitidos/x/t1.pdf', repeat('b', 64), 100);
  select count(*) into n from anexos_evento where evento_id = ev1 and tipo_documento::text = 'TERMO_ENTREGA';
  assert n = 1, 'um anexo do pdf';

  -- via assinada: caminho de outro evento recusado
  ok := false;
  begin perform registrar_termo_entrega_assinado(t1.id, gen_random_uuid()::text || '/a.jpg', 'a.jpg', 100);
  exception when check_violation then ok := true; end;
  assert ok, 'arquivo de outro evento recusado';
  t1 := registrar_termo_entrega_assinado(t1.id, ev1::text || '/assinado1.jpg', 'assinado1.jpg', 1000);
  assert t1.situacao = 'ASSINADO' and t1.assinado_anexo_id is not null, 'assinado';
  t1 := registrar_termo_entrega_assinado(t1.id, ev1::text || '/assinado2.jpg', 'assinado2.jpg', 1000);
  select count(*) into n from anexos_evento where evento_id = ev1 and tipo_documento::text = 'TERMO_ENTREGA_ASSINADO';
  assert n = 2, 'troca guarda a anterior';
  assert (select arquivo_url from anexos_evento where id = t1.assinado_anexo_id) like '%assinado2.jpg', 'vale a nova';

  -- RLS: outra unidade nao ve; associado nao ve
  perform set_config('request.jwt.claim.sub', u_out::text, false);
  set local role authenticated;
  select count(*) into n from termos_entrega;
  assert n = 0, 'outra unidade nao ve';
  reset role;
  perform set_config('request.jwt.claim.sub', u_cli::text, false);
  set local role authenticated;
  select count(*) into n from termos_entrega;
  assert n = 0, 'associado nao ve';
  reset role;
  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  set local role authenticated;
  select count(*) into n from termos_entrega;
  assert n = 2, 'a unidade ve';
  reset role;

  -- cancelar
  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  ok := false;
  begin perform cancelar_termo_entrega(t2.id, '');
  exception when check_violation then ok := true; end;
  assert ok, 'motivo obrigatorio';
  t2 := cancelar_termo_entrega(t2.id, 'emitido errado');
  assert t2.situacao = 'CANCELADO', 'cancelado';
  assert (select situacao from termos_emitidos where id = t2.termo_emitido_id) = 'CANCELADO', 'termo cancelado';
  ok := false;
  begin perform registrar_termo_entrega_assinado(t2.id, ev1::text || '/x.jpg', 'x.jpg', 10);
  exception when check_violation then ok := true; end;
  assert ok, 'cancelado nao recebe assinatura';

  raise notice '=== TESTES 0182 (termo de entrega) PASSARAM ===';
end $$;
