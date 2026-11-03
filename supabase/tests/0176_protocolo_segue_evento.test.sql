-- Teste funcional: o protocolo segue o evento (0176)
\set ON_ERROR_STOP on
do $$
declare
  u_sin uuid := gen_random_uuid();
  r1 uuid; cli uuid; veic uuid; tv uuid; ev uuid; ev2 uuid; atend uuid; atend2 uuid; rec record; n int;
begin
  insert into auth.users (id, email) values (u_sin,'sin@t.com');
  insert into regionais (nome) values ('Cuiaba') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values (u_sin,'Analista','sin@t.com','sinistro', r1);
  insert into clientes (nome_razao_social, cpf_cnpj, tipo_pessoa, regional_id)
    values ('ASSOCIADO TESTE', '52998224725', 'PF', r1) returning id into cli;
  select id into tv from tipos_veiculo limit 1;
  insert into veiculos (cliente_id, placa, marca, modelo, ano_modelo, tipo_veiculo_id, regional_id, status)
    values (cli, 'TST1A23', 'FIAT', 'ARGO', 2020, tv, r1, 'ativo') returning id into veic;

  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, tipo_evento, descricao, regional_id)
    values (veic, cli, current_date, 'COLISAO', 'Colisao', r1) returning id into ev;
  perform transferir_protocolo(ev, null, 'Em analise', 'EM_ANALISE'::status_evento);
  select protocolo_do_evento(ev) into atend;
  select * into rec from atendimentos where id = atend;
  assert rec.status::text = 'EM_ANDAMENTO', 'protocolo aberto enquanto o evento corre';

  -- concluir pela tramitacao encerra o protocolo
  perform transferir_protocolo(ev, null, 'Reparo entregue', 'CONCLUIDO'::status_evento);
  select * into rec from atendimentos where id = atend;
  assert rec.status::text = 'CONCLUIDO', 'evento concluido encerra o protocolo, veio ' || rec.status::text;
  assert rec.encerrado_em is not null and rec.encerrado_por = u_sin, 'carimba quando e quem';
  assert rec.solucao like 'Evento concluido%', 'solucao preenchida: ' || coalesce(rec.solucao, '');
  select count(*) into n from protocolo_interacoes where atendimento_id = atend and tipo = 'ENCERRAMENTO';
  assert n = 1, 'uma interacao de encerramento, veio ' || n;

  -- reabrir o evento (update direto, como o Kanban) reabre o protocolo
  update eventos_sinistro set status = 'REPARO' where id = ev;
  select * into rec from atendimentos where id = atend;
  assert rec.status::text = 'EM_ANDAMENTO' and rec.encerrado_em is null, 'evento reaberto reabre o protocolo';

  -- negado tambem encerra
  update eventos_sinistro set status = 'NEGADO' where id = ev;
  select * into rec from atendimentos where id = atend;
  assert rec.status::text = 'CONCLUIDO', 'evento negado encerra o protocolo';

  -- protocolo cancelado nao e tocado
  update eventos_sinistro set status = 'EM_ANALISE' where id = ev;
  update atendimentos set status = 'CANCELADO' where id = atend;
  update eventos_sinistro set status = 'CONCLUIDO' where id = ev;
  select * into rec from atendimentos where id = atend;
  assert rec.status::text = 'CANCELADO', 'cancelado fica cancelado';

  -- evento sem protocolo: nada a fazer, nada quebra
  insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, tipo_evento, descricao, regional_id)
    values (veic, cli, current_date, 'COLISAO', 'Outro', r1) returning id into ev2;
  update eventos_sinistro set status = 'CONCLUIDO' where id = ev2;
  assert not exists (select 1 from atendimentos where evento_id = ev2), 'nao cria protocolo';

  raise notice '=== TESTES 0176 (protocolo segue o evento) PASSARAM ===';
end $$;
