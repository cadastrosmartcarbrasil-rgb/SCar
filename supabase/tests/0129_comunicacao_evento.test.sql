-- Teste da 0129: comunicacao de evento online (um link por envolvido).
--   1. a equipe da unidade cria o convite; outra unidade nao;
--   2. o terceiro abre o link e NAO ve dado do associado;
--   3. o associado so ve os dados depois de confirmar a identidade (5 tentativas);
--   4. enviar exige a declaracao, gera versao imutavel e preenche a ficha do terceiro;
--   5. a equipe registra versao propria (origem EQUIPE); correcao/conferir pedem quem trata;
--   6. revogado/expirado nao abre; anon nao le; selo do Kanban.
\set ON_ERROR_STOP on
do $$
declare
  u_sin uuid := gen_random_uuid();
  u_sac uuid := gen_random_uuid();
  u_out uuid := gen_random_uuid();
  r1 uuid; r2 uuid; c1 uuid; ve1 uuid; ev1 uuid;
  com_a evento_comunicacoes; com_t evento_comunicacoes; com_w evento_comunicacoes;
  d evento_declaracoes;
  j jsonb; n int; ok boolean; t text;
begin
  insert into auth.users (id, email) values (u_sin,'sin129@t.com'), (u_sac,'sac129@t.com'), (u_out,'out129@t.com');
  insert into regionais (nome) values ('Unid 129') returning id into r1;
  insert into regionais (nome) values ('Outra 129') returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_sin,'Regulador','sin129@t.com','sinistro', r1),
    (u_sac,'Atendente','sac129@t.com','consultor_vendas', r1),
    (u_out,'Outro','out129@t.com','sinistro', r2);
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, data_nascimento, celular)
    values ('PF','Associado 129','52998224725', r1, '1990-05-10', '65999990000') returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, status, marca, modelo)
    values (c1,'COM1A29', r1, 'ativo', 'FIAT', 'UNO') returning id into ve1;
  insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, tipo_evento, regional_id)
    values (ve1, c1, current_date, 'COLISAO', r1) returning id into ev1;

  -- 1. convites ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', u_sac::text, false);
  execute 'set local role authenticated';
  com_a := criar_comunicacao_evento(ev1, 'associado');
  assert com_a.nome = 'Associado 129' and com_a.telefone = '65999990000', 'associado pre-preenchido do cadastro';
  assert length(com_a.token) = 64, 'token de 64 hex';
  begin
    perform criar_comunicacao_evento(ev1, 'associado');
    assert false, 'segundo link do associado deveria ser recusado';
  exception when raise_exception then null; end;
  com_t := criar_comunicacao_evento(ev1, 'terceiro_condutor', 'Fulano Terceiro', '(65) 98888-7777');
  com_w := criar_comunicacao_evento(ev1, 'testemunha', 'Beltrano');
  select count(*) into n from evento_comunicacoes where evento_id = ev1;
  assert n = 3, 'equipe da unidade ve os 3 convites, viu ' || n;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', u_out::text, false);
  execute 'set local role authenticated';
  begin
    perform criar_comunicacao_evento(ev1, 'testemunha');
    assert false, 'outra unidade nao cria convite';
  exception when raise_exception then null; end;
  select count(*) into n from evento_comunicacoes where evento_id = ev1;
  assert n = 0, 'outra unidade nao le os convites';
  execute 'reset role';

  execute 'set local role anon';
  begin
    select count(*) into n from evento_comunicacoes;
    assert false, 'anon nao pode ler';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- 2. terceiro (caminho publico, sem sessao) -------------------------------
  perform set_config('request.jwt.claim.sub', '', false);
  j := comunicacao_publica(com_t.token);
  assert (j->>'valida')::boolean and j->'prefill' = 'null'::jsonb, 'terceiro nao recebe dado do associado';
  assert j->>'protocolo' is not null and not (j->>'precisa_verificar')::boolean, 'terceiro ve so o protocolo';
  assert (comunicacao_publica('x'))->>'motivo' = 'LINK_INVALIDO', 'token invalido';

  -- 3. associado: confirmacao de identidade ---------------------------------
  j := comunicacao_publica(com_a.token);
  assert (j->>'precisa_verificar')::boolean and j->'prefill' = 'null'::jsonb, 'sem verificar nao ve o cadastro';
  begin
    perform salvar_rascunho_comunicacao(com_a.token, '{"a":1}');
    assert false, 'sem verificar nao salva';
  exception when raise_exception then null; end;
  j := verificar_comunicacao(com_a.token, '111', '1990-05-10');
  assert not (j->>'ok')::boolean and (j->>'restantes')::int = 4, 'cpf errado conta tentativa';
  j := verificar_comunicacao(com_a.token, '529', '1990-05-10');
  assert (j->>'ok')::boolean, 'cpf + nascimento conferem';
  j := comunicacao_publica(com_a.token);
  assert j->'prefill'->'identificacao'->>'nome' = 'Associado 129', 'verificado ve o cadastro';
  assert j->'prefill'->'veiculo'->>'placa' = 'COM1A29', 'e o veiculo';

  -- 4. enviar ---------------------------------------------------------------
  perform salvar_rascunho_comunicacao(com_t.token, '{"identificacao":{"nome":"Fulano"}}');
  select status into t from evento_comunicacoes where id = com_t.id;
  assert t = 'EM_PREENCHIMENTO', 'rascunho move para em preenchimento';
  begin
    perform enviar_comunicacao(com_t.token, '{"identificacao":{"nome":"Fulano"}}', false);
    assert false, 'sem declaracao nao envia';
  exception when raise_exception then null; end;
  j := enviar_comunicacao(com_t.token,
    '{"identificacao":{"nome":"Fulano Terceiro","cpf":"111.444.777-35","telefone":"65988887777"},
      "veiculo_terceiro":{"placa":"abc-1d23","marca_modelo":"GOL","tem_protecao":true,"empresa_protecao":"SEG X"},
      "evento":{"relato":"bateu atras"}}'::jsonb, true, '1.2.3.4', 'teste');
  assert (j->>'versao')::int = 1 and length(j->>'hash') = 64, 'versao 1 com hash';
  select terceiro_id into com_t.terceiro_id from evento_comunicacoes where id = com_t.id;
  assert com_t.terceiro_id is not null, 'terceiro criado a partir da declaracao';
  select count(*) into n from evento_terceiros
   where id = com_t.terceiro_id and cpf_cnpj = '11144477735' and veiculo_placa = 'ABC1D23' and possui_seguro;
  assert n = 1, 'ficha do terceiro preenchida';
  begin
    perform enviar_comunicacao(com_t.token, '{}', true);
    assert false, 'enviada vira somente leitura';
  exception when raise_exception then null; end;
  begin
    update evento_declaracoes set dados = '{}' where comunicacao_id = com_t.id;
    assert false, 'declaracao e imutavel';
  exception when raise_exception then null; end;

  -- foto pelo link
  perform registrar_anexo_comunicacao(com_a.token, 'FRENTE', 'FOTO_VEICULO', ev1::text || '/f.jpg', 1000, 'f.jpg');
  select count(*) into n from anexos_evento where comunicacao_id = com_a.id and enviado_pelo_envolvido and pose = 'FRENTE';
  assert n = 1, 'anexo do envolvido registrado';
  begin
    perform registrar_anexo_comunicacao(com_a.token, 'X', 'FOTO_VEICULO', 'outro/f.jpg', 1, 'f.jpg');
    assert false, 'caminho fora do evento recusado';
  exception when raise_exception then null; end;

  -- 5. equipe ---------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', u_sac::text, false);
  execute 'set local role authenticated';
  d := registrar_declaracao_equipe(com_w.id, '{"identificacao":{"nome":"Beltrano"},"evento":{"relato":"vi tudo"}}');
  assert d.origem = 'EQUIPE' and d.registrado_por = u_sac, 'versao da equipe com autor';
  begin
    perform conferir_comunicacao(com_t.id);
    assert false, 'atendente nao confere';
  exception when raise_exception then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  execute 'set local role authenticated';
  perform pedir_correcao_comunicacao(com_t.id, 'Mande a foto da placa');
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
  j := enviar_comunicacao(com_t.token, '{"identificacao":{"nome":"Fulano Terceiro"}}', true);
  assert (j->>'versao')::int = 2, 'correcao gera versao 2';
  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  execute 'set local role authenticated';
  com_t := conferir_comunicacao(com_t.id);
  assert com_t.status = 'CONFERIDO', 'regulador confere';
  select respondidas into n from comunicacoes_resumo_eventos(array[ev1]);
  assert n = 2, 'selo do Kanban: 2 respondidas, viu ' || n;
  perform revogar_comunicacao_evento(com_a.id, 'teste');
  execute 'reset role';

  -- 6. revogado nao abre ----------------------------------------------------
  perform set_config('request.jwt.claim.sub', '', false);
  assert (comunicacao_publica(com_a.token))->>'motivo' = 'LINK_REVOGADO', 'revogado nao abre';
  update evento_comunicacoes set expira_em = now() - interval '1 day' where id = com_w.id;
  -- enviado continua aberto para leitura mesmo vencido? Nao: vencido = expirado so para quem nao enviou.
  j := comunicacao_publica(com_w.token);
  assert (j->>'valida')::boolean, 'enviado segue legivel (comprovante) mesmo depois do prazo';

  select count(*) into n from historico_protocolo where evento_id = ev1 and acao_realizada = 'COMUNICACAO';
  assert n >= 8, 'trilha no protocolo, viu ' || n;

  raise notice '=== TESTES 0129 PASSARAM ===';
end $$;
