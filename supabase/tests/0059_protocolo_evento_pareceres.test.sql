-- Teste funcional: o evento tramita de verdade e pede parecer (0059)
\set ON_ERROR_STOP on
do $$
declare
  u_sin uuid := gen_random_uuid();   -- analista de sinistro (abre e tramita)
  u_jur uuid := gen_random_uuid();   -- juridico (da parecer)
  u_vis uuid := gen_random_uuid();   -- vistoria (da parecer)
  u_dir uuid := gen_random_uuid();   -- diretoria (valida)
  r1 uuid; cli uuid; veic uuid; tv uuid; ev uuid; atend uuid;
  ped_jur uuid; ped_vis uuid; n int; rec record;
begin
  insert into auth.users (id, email) values
    (u_sin,'sin@t.com'), (u_jur,'jur@t.com'), (u_vis,'vis@t.com'), (u_dir,'dir@t.com');
  insert into regionais (nome) values ('Cuiaba') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_sin,'Analista','sin@t.com','sinistro', r1),
    (u_jur,'Juridico','jur@t.com','auditoria', r1),
    (u_vis,'Vistoria','vis@t.com','cotador', r1),
    (u_dir,'Diretoria','dir@t.com','admin', null);

  insert into clientes (nome_razao_social, cpf_cnpj, tipo_pessoa, regional_id)
    values ('ASSOCIADO TESTE', '52998224725', 'PF', r1) returning id into cli;
  select id into tv from tipos_veiculo limit 1;
  insert into veiculos (cliente_id, placa, marca, modelo, ano_modelo, tipo_veiculo_id, regional_id, status)
    values (cli, 'TST1A23', 'FIAT', 'ARGO', 2020, tv, r1, 'ativo') returning id into veic;

  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, tipo_evento, descricao, regional_id)
    values (veic, cli, current_date, 'COLISAO', 'Colisao traseira', r1) returning id into ev;

  -- ============================================ tramitar = TRANSFERIR de verdade
  perform transferir_protocolo(ev, u_jur, 'Favor analisar a cobertura.', 'EM_ANALISE'::status_evento);
  select operador_atual_id into rec from eventos_sinistro where id = ev;
  select * into rec from eventos_sinistro where id = ev;
  assert rec.operador_atual_id = u_jur, 'o evento passa para as maos do destinatario';
  assert rec.status::text = 'EM_ANALISE', 'e o status acompanha, veio ' || rec.status::text;

  select count(*) into n from historico_protocolo
   where evento_id = ev and acao_realizada = 'TRANSFERENCIA' and usuario_destino_id = u_jur;
  assert n = 1, 'a linha do tempo do sinistro registra a transferencia, veio ' || n;

  -- destino invalido nao passa mais em silencio
  begin
    perform transferir_protocolo(ev, gen_random_uuid(), 'x');
    assert false, 'destino inexistente tem de ser recusado';
  exception when others then
    assert sqlerrm like '%destino invalido%', 'mensagem inesperada: ' || sqlerrm;
  end;

  -- tramitacao vazia nao e tramitacao
  begin
    perform transferir_protocolo(ev);
    assert false, 'sem destino, status ou parecer nao ha o que registrar';
  exception when others then
    assert sqlerrm like '%Informe o destino%', 'mensagem inesperada: ' || sqlerrm;
  end;
  raise notice 'OK a tramitacao do evento tem destinatario e validacao';

  -- ============================================ o evento aparece na Central
  select protocolo_do_evento(ev) into atend;
  assert atend is not null, 'o evento ganhou o protocolo dele';
  assert protocolo_do_evento(ev) = atend, 'e nao cria um novo a cada chamada';

  select * into rec from listar_protocolos('ABERTOS') where id = atend;
  assert rec.evento_id = ev, 'a Central mostra de que evento o protocolo veio';
  assert rec.responsavel_id = u_jur, 'e quem esta com ele, veio ' || coalesce(rec.responsavel, '(nulo)');
  select count(*) into n from interacoes_protocolo(atend) where tipo::text = 'TRANSFERENCIA';
  assert n = 1, 'a transferencia virou interacao no protocolo, veio ' || n;
  raise notice 'OK o sinistro passou a usar o mecanismo de protocolos que ja existia';

  -- ============================================ parecer de varias pessoas
  select solicitar_parecer(atend, array[u_jur, u_vis], 'Cobre ou nao cobre? Justifiquem.') into n;
  assert n = 2, 'dois pareceristas chamados, veio ' || n;
  select solicitar_parecer(atend, array[u_jur], 'Cobre ou nao cobre? Justifiquem.') into n;
  assert n = 0, 'pedido pendente nao e duplicado, veio ' || n;

  select pedido_id into ped_jur from pareceres_protocolo(atend) where para_id = u_jur;
  select pedido_id into ped_vis from pareceres_protocolo(atend) where para_id = u_vis;

  select count(*) into n from pareceres_protocolo(atend) where not respondido;
  assert n = 2, 'os dois pareceres estao pendentes, veio ' || n;

  -- so quem foi chamado responde
  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  begin
    perform responder_parecer(ped_jur, 'palpite');
    assert false, 'parecer e de quem foi chamado';
  exception when others then
    assert sqlerrm like '%pedido a outra pessoa%', 'mensagem inesperada: ' || sqlerrm;
  end;

  perform set_config('request.jwt.claim.sub', u_jur::text, false);
  select count(*) into n from meus_pareceres_pendentes();
  assert n = 1, 'o juridico ve o que esta esperando ele, veio ' || n;
  select * into rec from meus_pareceres_pendentes();
  assert rec.evento_id = ev, 'e sabe de qual evento se trata';
  perform responder_parecer(ped_jur, 'Cobertura confirmada pela clausula 4.');

  select count(*) into n from meus_pareceres_pendentes();
  assert n = 0, 'respondido, sai da fila dele, veio ' || n;

  begin
    perform responder_parecer(ped_jur, 'de novo');
    assert false, 'nao se responde o mesmo pedido duas vezes';
  exception when others then
    assert sqlerrm like '%ja foi dado%', 'mensagem inesperada: ' || sqlerrm;
  end;
  raise notice 'OK cada parecer e de quem foi chamado, e so uma vez';

  -- ============================================ o que ainda falta fica visivel
  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  select * into rec from pareceres_protocolo(atend) where para_id = u_jur;
  assert rec.respondido, 'o parecer do juridico consta como dado';
  assert rec.parecer like 'Cobertura confirmada%', 'com o texto dele';
  select * into rec from listar_protocolos('ABERTOS') where id = atend;
  assert rec.pareceres_pendentes = 1, 'a fila mostra que ainda falta um, veio ' || rec.pareceres_pendentes;

  -- a matriz destrava o parecer de quem nao esta mais na empresa
  perform set_config('request.jwt.claim.sub', u_dir::text, false);
  perform responder_parecer(ped_vis, 'Vistoria em ferias — diretoria assume: laudo aceito.');
  select * into rec from listar_protocolos('ABERTOS') where id = atend;
  assert rec.pareceres_pendentes = 0, 'nao falta mais nenhum, veio ' || rec.pareceres_pendentes;
  raise notice 'OK a matriz consegue destravar um parecer parado';

  raise notice '=== TESTES 0059 (protocolo do evento e pareceres) PASSARAM ===';
end $$;
