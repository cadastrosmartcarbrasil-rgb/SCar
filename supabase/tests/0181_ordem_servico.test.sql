-- Teste da 0181: Ordem de Servico do evento emitida pelo modulo de Termos.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_sin uuid := gen_random_uuid();
  u_out uuid := gen_random_uuid();
  u_cli uuid := gen_random_uuid();
  r1 uuid; r2 uuid; c1 uuid; ve1 uuid; ev1 uuid; forn uuid; cot uuid;
  mo uuid; mx uuid; v termos_versoes;
  os1 ordens_servico; os2 ordens_servico; os3 ordens_servico;
  d jsonb; ok boolean; n bigint; t termos_emitidos; dt date;
begin
  insert into regionais (nome) values ('U173') returning id into r1;
  insert into regionais (nome) values ('U173B') returning id into r2;
  insert into auth.users (id, email) values (u_adm,'adm173@t.com'), (u_sin,'sin173@t.com'),
    (u_out,'out173@t.com'), (u_cli,'cli173@t.com');
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm173@t.com','admin', null),
    (u_sin,'Eventos','sin173@t.com','sinistro', r1),
    (u_out,'Eventos outra','out173@t.com','sinistro', r2);
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, auth_user_id)
    values ('PF','Associado OS','52998224725', r1, u_cli) returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, status) values (c1,'OSA1B73', r1, 'ativo') returning id into ve1;
  insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, tipo_evento, regional_id, valor_participacao)
    values (ve1, c1, current_date, 'COLISAO', r1, 500) returning id into ev1;
  insert into fornecedores (tipo_pessoa, razao_social, inscricao_estadual) values ('PJ', 'OFICINA 173', '123') returning id into forn;
  insert into cotacoes_pecas (evento_id, fornecedor_id, fornecedor_nome) values (ev1, forn, 'OFICINA 173') returning id into cot;
  insert into itens_cotacao (cotacao_id, descricao_peca, quantidade, valor_unitario, tipo_item)
    values (cot, 'FUNILARIA', 1, 800, 'MAO_DE_OBRA');
  ok := false;
  begin insert into itens_cotacao (cotacao_id, descricao_peca, quantidade, valor_unitario, tipo_item) values (cot, 'X', 1, 1, 'OUTRO');
  exception when check_violation then ok := true; end;
  assert ok, 'tipo de item invalido recusado';

  -- modelo: ORDEM_SERVICO exige escopo EVENTO
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  ok := false;
  begin insert into termos_modelos (nome, tipo, escopo, rascunho_html) values ('X', 'ORDEM_SERVICO', 'ASSOCIADO', '<p>x</p>');
  exception when check_violation then ok := true; end;
  assert ok, 'OS precisa de escopo EVENTO';
  insert into termos_modelos (nome, tipo, escopo, rascunho_html)
    values ('ORDEM DE SERVICO - EVENTOS', 'ORDEM_SERVICO', 'EVENTO', '<p>OS {{NUMERO_DA_OS}} v1</p>') returning id into mo;
  v := publicar_versao_termo(mo);
  -- termos antigos continuam
  insert into termos_modelos (nome, tipo, escopo, rascunho_html) values ('Adesao', 'CONTRATO', 'ASSOCIADO', '<p>a</p>') returning id into mx;

  -- o termo do associado nao emite modelo de evento
  ok := false;
  begin perform registrar_termo_emitido(v.id, c1, ve1, '<p>x</p>');
  exception when check_violation then ok := true; end;
  assert ok, 'modelo de evento nao sai pelo termo do associado';

  d := jsonb_build_object('evento_id', ev1, 'cotacao_id', cot, 'fornecedor_id', forn, 'documento', 'AUTORIZACAO',
    'data_inicio_prevista', current_date, 'prazo_dias_uteis', 5, 'data_limite_entrega', current_date + 10,
    'pecas_smartcar', 100,
    'itens', jsonb_build_array(
      jsonb_build_object('tipo','MAO_DE_OBRA','descricao','FUNILARIA','quantidade',1,'valor_unitario',800),
      jsonb_build_object('tipo','PECA','descricao','PARACHOQUE','quantidade',2,'valor_unitario',250.50)));

  -- outra unidade nao emite
  perform set_config('request.jwt.claim.sub', u_out::text, false);
  ok := false;
  begin perform emitir_ordem_servico(v.id, d, '<p>x</p>');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'outra unidade nao emite';

  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  -- sem itens
  ok := false;
  begin perform emitir_ordem_servico(v.id, d || jsonb_build_object('itens', '[]'::jsonb), '<p>x</p>');
  exception when check_violation then ok := true; end;
  assert ok, 'sem item recusado';
  -- limite antes do inicio
  ok := false;
  begin perform emitir_ordem_servico(v.id, d || jsonb_build_object('data_limite_entrega', current_date - 1), '<p>x</p>');
  exception when check_violation then ok := true; end;
  assert ok, 'limite antes do inicio recusado';
  -- liquido negativo
  ok := false;
  begin perform emitir_ordem_servico(v.id, d || jsonb_build_object('pecas_smartcar', 5000), '<p>x</p>');
  exception when check_violation then ok := true; end;
  assert ok, 'liquido negativo recusado';
  -- total divergente do desenhado
  ok := false;
  begin perform emitir_ordem_servico(v.id, d || jsonb_build_object('total_autorizado', 1), '<p>x</p>');
  exception when check_violation then ok := true; end;
  assert ok, 'total divergente recusado';

  os1 := emitir_ordem_servico(v.id, d || jsonb_build_object('total_autorizado', 1301, 'valor_liquido', 701),
    '<p>OS {{NUMERO_DA_OS}} termo {{PROTOCOLO_DO_TERMO}}</p>');
  assert os1.numero ~ ('^OS-' || to_char(data_sp(now()), 'YYYY') || '-000001$'), 'numero: ' || os1.numero;
  assert os1.total_mao_obra = 800 and os1.total_pecas = 501 and os1.total_autorizado = 1301, 'totais';
  assert os1.participacao_associado = 500, 'participacao copiada do evento';
  assert os1.valor_liquido = 701, 'liquido = 1301 - 500 - 100';
  assert os1.tipo_ordem = 'MISTA', 'mista';
  select * into t from termos_emitidos where id = os1.termo_emitido_id;
  assert t.evento_id = ev1 and t.fornecedor_id = forn and not t.visivel_portal, 'termo do evento';
  assert t.conteudo_html like '%' || os1.numero || '%' and t.conteudo_html like '%TRM-%', 'marcas trocadas';
  assert t.html_sha256 = termo_sha256(t.conteudo_html), 'hash do html';
  select count(*) into n from ordens_servico_itens where ordem_servico_id = os1.id;
  assert n = 2, 'itens gravados';
  assert exists (select 1 from ordens_servico_itens where ordem_servico_id = os1.id and subtotal = 501), 'subtotal gerado';
  assert exists (select 1 from historico_protocolo where evento_id = ev1 and acao_realizada = 'OS_EMITIDA'), 'historico';

  -- imutavel
  ok := false;
  begin update ordens_servico set total_pecas = 1 where id = os1.id;
  exception when check_violation then ok := true; end;
  assert ok, 'conteudo nao muda';
  ok := false;
  begin update ordens_servico_itens set quantidade = 9 where ordem_servico_id = os1.id;
  exception when check_violation then ok := true; end;
  assert ok, 'item nao muda';
  ok := false;
  begin insert into ordens_servico_itens (ordem_servico_id, ordem, tipo, descricao, quantidade, valor_unitario)
    values (os1.id, 9, 'PECA', 'EXTRA', 1, 1);
  exception when check_violation then ok := true; end;
  assert ok, 'item nao entra depois';
  ok := false;
  begin delete from ordens_servico where id = os1.id;
  exception when check_violation then ok := true; end;
  assert ok, 'OS nao se apaga';
  ok := false;
  begin update termos_emitidos set visivel_portal = true where id = os1.termo_emitido_id;
  exception when check_violation then ok := true; end;
  assert ok, 'OS nunca vai ao portal';

  -- PDF + anexo (uma vez)
  perform anexar_pdf_ordem_servico(os1.id, 'emitidos/x/os.pdf', repeat('a', 64), 1000);
  perform anexar_pdf_ordem_servico(os1.id, 'emitidos/x/os.pdf', repeat('a', 64), 1000);
  select count(*) into n from anexos_evento where evento_id = ev1 and tipo_documento::text = 'ORDEM_SERVICO';
  assert n = 1, 'um anexo';
  assert (select pdf_sha256 from termos_emitidos where id = os1.termo_emitido_id) = repeat('a', 64), 'pdf gravado';

  -- envio
  os1 := registrar_envio_ordem_servico(os1.id, 'WHATSAPP', null, null);
  assert os1.status = 'ENVIADA' and os1.enviada_em is not null, 'enviada';
  assert exists (select 1 from historico_protocolo where evento_id = ev1 and acao_realizada = 'OS_ENVIADA'), 'historico envio';

  -- RLS: associado nao le; outra unidade nao le; unidade le
  perform set_config('request.jwt.claim.sub', u_cli::text, false);
  set local role authenticated;
  select count(*) into n from ordens_servico;
  assert n = 0, 'associado nao le OS';
  select count(*) into n from termos_emitidos where evento_id is not null;
  assert n = 0, 'associado nao le o termo da OS';
  reset role;
  perform set_config('request.jwt.claim.sub', u_out::text, false);
  set local role authenticated;
  select count(*) into n from ordens_servico;
  assert n = 0, 'outra unidade nao le';
  reset role;
  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  set local role authenticated;
  select count(*) into n from ordens_servico;
  assert n = 1, 'unidade le';
  ok := false;
  begin update ordens_servico set status = 'ENTREGUE' where id = os1.id; get diagnostics n = row_count;
    ok := n = 0;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'sem escrita direta';
  reset role;

  -- retificacao: a anterior so vira substituida ao emitir
  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  assert (select status from ordens_servico where id = os1.id) = 'ENVIADA', 'antes de emitir a retificacao';
  os2 := emitir_ordem_servico(v.id, d || jsonb_build_object('documento','RETIFICACAO','os_anterior_id', os1.id), '<p>R</p>');
  assert os2.numero like '%-000002', 'segunda OS: ' || os2.numero;
  assert (select status from ordens_servico where id = os1.id) = 'SUBSTITUIDA', 'anterior substituida';
  assert (select substituida_por_id from ordens_servico where id = os1.id) = os2.id, 'ligada a nova';
  ok := false;
  begin perform emitir_ordem_servico(v.id, d || jsonb_build_object('documento','RETIFICACAO','os_anterior_id', os1.id), '<p>R</p>');
  exception when check_violation then ok := true; end;
  assert ok, 'substituida nao se retifica de novo';

  -- publicar versao nova do modelo nao muda a OS emitida
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  update termos_modelos set rascunho_html = '<p>v2 {{NUMERO_DA_OS}}</p>' where id = mo;
  perform publicar_versao_termo(mo);
  assert (select conteudo_html from termos_emitidos where id = os1.termo_emitido_id) like '%termo TRM-%', 'emitida intacta';

  -- status e entrega
  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  os2 := mudar_status_ordem_servico(os2.id, 'EM_EXECUCAO');
  ok := false;
  begin perform mudar_status_ordem_servico(os2.id, 'ENTREGUE', current_date + 1);
  exception when check_violation then ok := true; end;
  assert ok, 'entrega no futuro recusada';
  os2 := mudar_status_ordem_servico(os2.id, 'ENTREGUE', current_date);
  assert os2.status = 'ENTREGUE' and os2.data_entrega_real = current_date, 'entregue';
  assert exists (select 1 from historico_protocolo where evento_id = ev1 and acao_realizada = 'OS_ENTREGUE'), 'historico entrega';

  -- cancelar
  os3 := emitir_ordem_servico(v.id, d, '<p>C</p>');
  ok := false;
  begin perform cancelar_ordem_servico(os3.id, ' ');
  exception when check_violation then ok := true; end;
  assert ok, 'motivo obrigatorio';
  os3 := cancelar_ordem_servico(os3.id, 'prestador desistiu');
  assert os3.status = 'CANCELADA', 'cancelada';
  assert (select situacao from termos_emitidos where id = os3.termo_emitido_id) = 'CANCELADO', 'termo cancelado';
  assert exists (select 1 from historico_protocolo where evento_id = ev1 and acao_realizada = 'OS_CANCELADA'), 'historico cancelamento';

  -- dias uteis com feriado
  insert into cobranca_feriados (data, descricao) values (date '2026-11-20', 'TESTE')
    on conflict (data) do nothing;
  dt := somar_dias_uteis(date '2026-11-19', 2);   -- qui + 2 uteis: pula sex(feriado), sab, dom -> seg 23, ter 24
  assert dt = date '2026-11-24', 'dias uteis: ' || dt;
  assert somar_dias_uteis(date '2026-11-23', 0) = date '2026-11-23', 'zero dias';

  assert (select email_departamento_eventos from empresa limit 1) is null
      or (select email_departamento_eventos from empresa limit 1) = 'eventos@smartcarbrasil.com.br', 'email eventos';

  raise notice '=== TESTES 0181 (ordem de servico) PASSARAM ===';
end $$;
