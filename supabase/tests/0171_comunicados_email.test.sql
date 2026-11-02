-- Teste funcional da 0171. Prova: (1) a celula comunicacao_envios e o seed; (2) o publico
-- respeita filtros, e-mail invalido, repetido, supressao e descadastro (este so INFORMATIVO);
-- (3) gestor so alcanca a propria unidade; (4) enviar enfileira e trava o rascunho;
-- (5) cancelar tira da fila; (6) descadastro cancela o pendente informativo;
-- (7) a fila devolve comunicado_id.
\set ON_ERROR_STOP on
do $$
declare
  adm uuid := gen_random_uuid(); fin uuid := gen_random_uuid(); ges uuid := gen_random_uuid();
  r1 uuid; r2 uuid; tv uuid; c1 uuid; c2 uuid; c3 uuid; c4 uuid; com uuid; com2 uuid; n int; ok boolean; j jsonb;
begin
  insert into regionais (nome) values ('Uni A 171') returning id into r1;
  insert into regionais (nome) values ('Uni B 171') returning id into r2;
  select id into tv from tipos_veiculo limit 1;
  insert into auth.users (id, email) values (adm, 'adm171@t.com'), (fin, 'fin171@t.com'), (ges, 'ges171@t.com');
  insert into usuarios (id, nome, email, papel, regional_id) values
    (adm, 'Admin 171', 'adm171@t.com', 'admin', null),
    (fin, 'Fin 171', 'fin171@t.com', 'financeiro', null),
    (ges, 'Ges 171', 'ges171@t.com', 'gestor_regional', r1);
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, email)
    values ('PF', 'ANA 171', '52998224725', r1, 'ana171@t.com') returning id into c1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, email)
    values ('PF', 'BIA 171', '11144477735', r2, 'bia171@t.com') returning id into c2;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, email)
    values ('PF', 'CAIO 171', '39053344705', r1, null) returning id into c3;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, email)
    values ('PF', 'DUDA 171', '15350946056', r1, 'ANA171@t.com') returning id into c4;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao)
    values (c1, 'AAA1A71', r1, tv, 'ativo', current_date - 30),
           (c2, 'BBB1B71', r2, tv, 'ativo', current_date - 30),
           (c3, 'CCC1C71', r1, tv, 'ativo', current_date - 30),
           (c4, 'DDD1D71', r1, tv, 'inativo', current_date - 30);

  assert permissao_celula_valida('comunicacao_envios', 'criar'), 'celula criar';
  select count(*) into n from perfil_permissoes where modulo = 'comunicacao_envios' and concedida and papel <> 'financeiro';
  assert n = 0, 'seed so no financeiro';

  -- publico da matriz: ana e bia recebem, caio sem e-mail; duda tem veiculo inativo (fora)
  perform set_config('request.jwt.claim.sub', fin::text, false);
  j := comunicado_previa_publico('{}'::jsonb, 'INFORMATIVO');
  assert (j->>'recebem')::int = 2, 'dois recebem: ' || j::text;
  assert (j->>'sem_email')::int = 1, 'um sem e-mail';
  -- com inativos, duda entra com o mesmo e-mail da ana: repetido
  j := comunicado_previa_publico('{"situacoes":["ativo","inativo"]}'::jsonb, 'INFORMATIVO');
  assert (j->>'email_repetido')::int = 1, 'e-mail repetido conta uma vez';
  j := comunicado_previa_publico(jsonb_build_object('regional_ids', jsonb_build_array(r2)), 'INFORMATIVO');
  assert (j->>'recebem')::int = 1, 'filtro de unidade';
  j := comunicado_previa_publico(jsonb_build_object('cliente_id', c2), 'INFORMATIVO');
  assert (j->>'recebem')::int = 1 and j->'amostra'->0->>'nome' = 'BIA 171', 'um associado';

  -- descadastro so vale para INFORMATIVO
  perform set_config('request.jwt.claim.sub', '', false);
  perform registrar_descadastro_email('Bia171@t.com', 'teste');
  perform set_config('request.jwt.claim.sub', fin::text, false);
  assert (comunicado_previa_publico('{}'::jsonb, 'INFORMATIVO')->>'descadastrados')::int = 1, 'descadastrado fora';
  assert (comunicado_previa_publico('{}'::jsonb, 'SERVICO')->>'recebem')::int = 2, 'servico ignora descadastro';
  begin
    perform registrar_descadastro_email('x@t.com', 'teste');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'descadastro so pelo link (sem sessao)';

  -- gestor nao tem a permissao; com o extra ve so a unidade dele
  perform set_config('request.jwt.claim.sub', ges::text, false);
  begin
    perform comunicado_previa_publico('{}'::jsonb, 'SERVICO');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'gestor sem permissao';
  perform set_config('request.jwt.claim.sub', adm::text, false);
  perform salvar_permissoes_usuario(ges, '[{"modulo":"comunicacao_envios","acao":"criar"}]', 'manda aviso da unidade');
  perform set_config('request.jwt.claim.sub', ges::text, false);
  assert (comunicado_previa_publico('{}'::jsonb, 'SERVICO')->>'recebem')::int = 1, 'gestor so alcanca a unidade';

  -- salvar, enviar, travar
  perform set_config('request.jwt.claim.sub', fin::text, false);
  com := salvar_comunicado_email(null, '{"nome_interno":"Aviso teste","finalidade":"SERVICO","assunto":"Oi {nome}","titulo":"Aviso","corpo":"Texto"}'::jsonb);
  n := enviar_comunicado_email(com);
  assert n = 2, 'dois na fila';
  select count(*) into n from email_outbox where comunicado_id = com and template = 'comunicado' and status = 'pendente';
  assert n = 2, 'fila com o comunicado';
  begin
    perform salvar_comunicado_email(com, '{"nome_interno":"Mudou","assunto":"x","titulo":"x","corpo":"x"}'::jsonb);
    ok := false;
  exception when others then ok := sqlerrm like '%nao muda%';
  end;
  assert ok, 'enviado nao muda';
  begin
    perform enviar_comunicado_email(com);
    ok := false;
  exception when others then ok := sqlerrm like '%ja foi enviado%';
  end;
  assert ok, 'nao envia duas vezes';

  -- a fila devolve o comunicado
  perform set_config('request.jwt.claim.sub', '', false);
  update email_config set pausado = false, janela_inicio = '00:00', janela_fim = '23:59', permite_domingo = true where id;
  select count(*) into n from reservar_lote_email(50, null) r where r.comunicado_id = com;
  assert n = 2, 'reserva traz comunicado_id';
  update email_outbox set status = 'pendente', reservado_em = null where comunicado_id = com;

  -- cancelar tira da fila
  perform set_config('request.jwt.claim.sub', fin::text, false);
  n := cancelar_comunicado_email(com);
  assert n = 2, 'dois cancelados';

  -- descadastro depois de enfileirado cancela o informativo pendente
  com2 := salvar_comunicado_email(null, '{"nome_interno":"Info","finalidade":"INFORMATIVO","assunto":"A","titulo":"T","corpo":"C"}'::jsonb);
  perform enviar_comunicado_email(com2);
  perform set_config('request.jwt.claim.sub', '', false);
  perform registrar_descadastro_email('ana171@t.com', 'teste');
  select count(*) into n from email_outbox where comunicado_id = com2 and status = 'cancelado' and motivo = 'descadastrado';
  assert n = 1, 'descadastro cancela o pendente';

  raise notice '=== TESTES 0171 (comunicados por e-mail) PASSARAM ===';
end;
$$;
