-- ============================================================================
-- SCar :: 0059_protocolo_evento_pareceres.sql
--
-- O EVENTO PASSA A TRAMITAR DE VERDADE — e a pedir PARECER.
--
-- (A) O QUE ESTAVA QUEBRADO. O card "Tramitar Protocolo" da tela do sinistro
--     chamava `transferir_protocolo` mandando como destino o operador que JA
--     estava com o evento (`operador_atual_id`), ou string vazia quando nao
--     havia nenhum. Ou seja: nunca transferiu para ninguem — na pratica so
--     trocava o status e guardava um parecer solto. E a funcao aceitava isso
--     calada: nao checava staff nem se o destino existia.
--
-- (B) O MECANISMO JA EXISTIA, SO NAO ESTAVA LIGADO. A Central de Protocolos
--     (0029) tem fila, responsavel, tramitacao e historico de interacoes — e
--     `atendimentos.evento_id` esta na tabela desde a 0022, sem NINGUEM
--     escrever nele. Agora o evento ganha (sob demanda) o seu protocolo:
--     `protocolo_do_evento()` cria/reaproveita, herdando associado, veiculo e
--     unidade do proprio evento. Tramitar o evento vira transferir o protocolo:
--     ele aparece na Central, em "Meus protocolos" e na Central do Atendente.
--     Nada de estrutura paralela — a mesma regra do modulo 24h.
--
-- (C) PARECER. Sinistro nao anda com uma pessoa so: vai para o juridico, para a
--     vistoria, para a diretoria, cada um opina e volta. Isso e um PEDIDO com
--     resposta, nao um comentario. Duas interacoes novas
--     (`PARECER_SOLICITADO` -> `PARECER`) ligadas por `responde_a`: enquanto nao
--     ha resposta, o pedido esta PENDENTE e aparece na tela de quem deve opinar.
--     Reusa `protocolo_interacoes`, que ja e o historico do protocolo.
--
-- O `historico_protocolo` do evento continua sendo escrito: e dele que a linha
-- do tempo do sinistro e o Kanban vivem. O protocolo nao substitui, acompanha.
-- ============================================================================

-- Valores novos do enum: usados so DENTRO de plpgsql (cast em tempo de chamada)
-- e comparados como TEXTO nas funcoes SQL — gotcha do 0017/0026/0028/0029.
alter type tipo_interacao_protocolo add value if not exists 'PARECER_SOLICITADO';
alter type tipo_interacao_protocolo add value if not exists 'PARECER';

alter table protocolo_interacoes
  add column if not exists responde_a uuid references protocolo_interacoes(id) on delete cascade;

create index if not exists idx_protocolo_interacoes_responde
  on protocolo_interacoes (responde_a) where responde_a is not null;
create index if not exists idx_protocolo_interacoes_para
  on protocolo_interacoes (para_usuario) where para_usuario is not null;

comment on column protocolo_interacoes.responde_a is
  'Quando a interacao RESPONDE outra (parecer -> pedido de parecer). Pedido sem resposta = pendente.';

-- Um protocolo por evento.
create unique index if not exists uq_atendimento_evento
  on atendimentos (evento_id) where evento_id is not null;

-- ----------------------------------------------------------------------------
-- (B) O protocolo do evento — criado sob demanda
-- ----------------------------------------------------------------------------
create or replace function protocolo_do_evento(p_evento_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ev eventos_sinistro;
  a  atendimentos;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  select * into ev from eventos_sinistro where id = p_evento_id;
  if ev.id is null then raise exception 'Evento nao encontrado'; end if;

  select * into a from atendimentos where evento_id = p_evento_id;
  if a.id is not null then return a.id; end if;

  insert into atendimentos (
    cliente_id, veiculo_id, tipo, canal, status, assunto, descricao,
    prioridade, regional_id, aberto_por, responsavel_id, evento_id
  ) values (
    ev.cliente_id, ev.veiculo_id, 'SINISTRO', 'SAC_INTERNO', 'EM_ANDAMENTO',
    'Evento ' || coalesce(ev.numero_protocolo, ''), ev.descricao,
    'ALTA', ev.regional_id, auth.uid(),
    coalesce(ev.operador_atual_id, auth.uid()), ev.id
  )
  returning * into a;

  return a.id;
end;
$$;

comment on function protocolo_do_evento(uuid) is
  'Id do protocolo (atendimentos) do evento, criando-o na primeira vez. E por ele que o sinistro tramita.';

-- ----------------------------------------------------------------------------
-- (A) A tramitacao do evento, agora com destinatario de verdade
-- ----------------------------------------------------------------------------
create or replace function transferir_protocolo(
  p_evento_id          uuid,
  p_usuario_destino_id uuid default null,   -- nulo = so muda status / registra parecer
  p_parecer            text default null,
  p_novo_status        status_evento default null
)
returns eventos_sinistro
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origem uuid := auth.uid();
  v_atual  eventos_sinistro;
  v_status_anterior status_evento;
  v_status_novo     status_evento;
  v_destino uuid;
  v_atend   uuid;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  select * into v_atual from eventos_sinistro where id = p_evento_id for update;
  if not found then
    raise exception 'Evento % nao encontrado', p_evento_id using errcode = 'no_data_found';
  end if;

  if p_usuario_destino_id is not null
     and not exists (select 1 from usuarios where id = p_usuario_destino_id and ativo) then
    raise exception 'Responsavel de destino invalido ou inativo';
  end if;

  -- Sem destino, o evento fica com quem ja estava (ou com quem esta tramitando):
  -- nao existe protocolo sem dono.
  v_destino := coalesce(p_usuario_destino_id, v_atual.operador_atual_id, v_origem);

  if p_usuario_destino_id is null
     and p_novo_status is null
     and coalesce(btrim(p_parecer), '') = '' then
    raise exception 'Informe o destino, o novo status ou o parecer';
  end if;

  v_status_anterior := v_atual.status;
  v_status_novo     := coalesce(p_novo_status, v_atual.status);

  update eventos_sinistro
     set operador_atual_id = v_destino,
         status            = v_status_novo,
         updated_at        = now()
   where id = p_evento_id
   returning * into v_atual;

  insert into historico_protocolo (
    evento_id, usuario_origem_id, usuario_destino_id,
    acao_realizada, status_anterior, status_novo, observacoes
  ) values (
    p_evento_id, v_origem, v_destino,
    case when p_usuario_destino_id is not null then 'TRANSFERENCIA'
         when p_novo_status is not null        then 'MUDANCA_STATUS'
         else 'PARECER' end,
    v_status_anterior, v_status_novo, p_parecer
  );

  -- Espelha na Central de Protocolos: e la que a pessoa VE que algo caiu na mao
  -- dela. Sem isso a transferencia so existiria dentro da tela do sinistro.
  v_atend := protocolo_do_evento(p_evento_id);
  update atendimentos
     set responsavel_id = v_destino, updated_at = now()
   where id = v_atend;

  insert into protocolo_interacoes (
    atendimento_id, tipo, mensagem, de_usuario, para_usuario, usuario_id
  ) values (
    v_atend,
    (case when p_usuario_destino_id is not null then 'TRANSFERENCIA' else 'COMENTARIO' end)
      ::tipo_interacao_protocolo,
    coalesce(nullif(btrim(coalesce(p_parecer, '')), ''),
             'Status: ' || v_status_anterior::text || ' -> ' || v_status_novo::text),
    case when p_usuario_destino_id is not null then v_origem end,
    case when p_usuario_destino_id is not null then v_destino end,
    v_origem
  );

  return v_atual;
end;
$$;

comment on function transferir_protocolo(uuid, uuid, text, status_evento) is
  'Tramita o evento: troca o responsavel e/ou o status, grava o parecer e espelha na Central de Protocolos.';

-- ----------------------------------------------------------------------------
-- (C) Parecer: pedido -> resposta
-- ----------------------------------------------------------------------------
create or replace function solicitar_parecer(
  p_atendimento_id uuid,
  p_usuarios       uuid[],
  p_pergunta       text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  a     atendimentos;
  u     uuid;
  alvos uuid[];
  n     integer := 0;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;
  if coalesce(btrim(p_pergunta), '') = '' then
    raise exception 'Escreva o que voce precisa que analisem';
  end if;
  if p_usuarios is null or cardinality(p_usuarios) = 0 then
    raise exception 'Escolha quem deve dar o parecer';
  end if;

  select * into a from atendimentos where id = p_atendimento_id;
  if a.id is null then raise exception 'Protocolo nao encontrado'; end if;
  if a.encerrado_em is not null then raise exception 'Protocolo ja encerrado'; end if;

  select array_agg(distinct x) into alvos from unnest(p_usuarios) x where x is not null;
  if alvos is null then raise exception 'Escolha quem deve dar o parecer'; end if;

  foreach u in array alvos
  loop
    if not exists (select 1 from usuarios where id = u and ativo) then
      raise exception 'Parecerista invalido ou inativo';
    end if;
    -- pedido repetido e ruido: se ja ha um pendente para a pessoa, nao duplica
    if exists (
      select 1 from protocolo_interacoes i
       where i.atendimento_id = p_atendimento_id
         and i.tipo::text = 'PARECER_SOLICITADO'
         and i.para_usuario = u
         and not exists (select 1 from protocolo_interacoes r where r.responde_a = i.id)
    ) then
      continue;
    end if;

    insert into protocolo_interacoes (
      atendimento_id, tipo, mensagem, de_usuario, para_usuario, usuario_id
    ) values (
      p_atendimento_id, 'PARECER_SOLICITADO'::tipo_interacao_protocolo,
      btrim(p_pergunta), auth.uid(), u, auth.uid()
    );
    n := n + 1;
  end loop;

  update atendimentos
     set status = 'EM_ANDAMENTO', updated_at = now()
   where id = p_atendimento_id and status::text = 'ABERTO';

  return n;
end;
$$;

comment on function solicitar_parecer(uuid, uuid[], text) is
  'Pede parecer a uma ou varias pessoas no protocolo. Pedido pendente nao e duplicado.';

create or replace function responder_parecer(
  p_pedido_id uuid,
  p_mensagem  text
)
returns protocolo_interacoes
language plpgsql
security definer
set search_path = public
as $$
declare
  ped protocolo_interacoes;
  i   protocolo_interacoes;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;
  if coalesce(btrim(p_mensagem), '') = '' then raise exception 'Escreva o seu parecer'; end if;

  select * into ped from protocolo_interacoes where id = p_pedido_id;
  if ped.id is null or ped.tipo::text <> 'PARECER_SOLICITADO' then
    raise exception 'Pedido de parecer nao encontrado';
  end if;
  -- O parecer e de quem foi chamado. A matriz responde no lugar dele quando
  -- precisa destravar (ferias, desligamento) — e fica registrado quem escreveu.
  if ped.para_usuario is distinct from auth.uid() and not tem_acesso_global() then
    raise exception 'Este parecer foi pedido a outra pessoa';
  end if;
  if exists (select 1 from protocolo_interacoes r where r.responde_a = p_pedido_id) then
    raise exception 'Este parecer ja foi dado';
  end if;

  insert into protocolo_interacoes (
    atendimento_id, tipo, mensagem, de_usuario, para_usuario, usuario_id, responde_a
  ) values (
    ped.atendimento_id, 'PARECER'::tipo_interacao_protocolo, btrim(p_mensagem),
    auth.uid(), ped.de_usuario, auth.uid(), p_pedido_id
  )
  returning * into i;

  return i;
end;
$$;

-- Os pareceres de um protocolo, com o que ainda falta.
create or replace function pareceres_protocolo(p_atendimento_id uuid)
returns table (
  pedido_id    uuid,
  pergunta     text,
  pedido_por   text,
  para_id      uuid,
  para         text,
  pedido_em    timestamptz,
  respondido   boolean,
  parecer      text,
  respondido_por text,
  respondido_em  timestamptz,
  dias_esperando integer
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.mensagem, coalesce(du.nome, 'Gestao'), i.para_usuario, pu.nome, i.created_at,
         r.id is not null, r.mensagem, ru.nome, r.created_at,
         (extract(day from now() - i.created_at))::int
    from protocolo_interacoes i
    left join usuarios du on du.id = i.de_usuario
    left join usuarios pu on pu.id = i.para_usuario
    left join protocolo_interacoes r on r.responde_a = i.id
    left join usuarios ru on ru.id = r.usuario_id
   where i.atendimento_id = p_atendimento_id
     and i.tipo::text = 'PARECER_SOLICITADO'
     and is_staff()
   order by (r.id is not null), i.created_at desc;
$$;

-- O que ESTA COMIGO para opinar — alimenta a Central do Atendente e a tela do evento.
create or replace function meus_pareceres_pendentes(p_limite integer default 20)
returns table (
  pedido_id    uuid,
  atendimento_id uuid,
  protocolo    text,
  evento_id    uuid,
  assunto      text,
  associado    text,
  placa        text,
  pergunta     text,
  pedido_por   text,
  pedido_em    timestamptz,
  dias_esperando integer
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, a.id, a.numero_protocolo, a.evento_id, a.assunto,
         cl.nome_razao_social, ve.placa, i.mensagem, coalesce(du.nome, 'Gestao'), i.created_at,
         (extract(day from now() - i.created_at))::int
    from protocolo_interacoes i
    join atendimentos a on a.id = i.atendimento_id
    join clientes cl on cl.id = a.cliente_id
    left join veiculos ve on ve.id = a.veiculo_id
    left join usuarios du on du.id = i.de_usuario
   where i.tipo::text = 'PARECER_SOLICITADO'
     and i.para_usuario = auth.uid()
     and a.encerrado_em is null
     and is_staff()
     and not exists (select 1 from protocolo_interacoes r where r.responde_a = i.id)
   order by i.created_at
   limit greatest(coalesce(p_limite, 20), 1);
$$;

-- ----------------------------------------------------------------------------
-- (D) A Central passa a mostrar de qual EVENTO o protocolo veio, e quantos
--     pareceres ainda faltam. Muda a lista de OUT -> drop + create.
-- ----------------------------------------------------------------------------
drop function if exists listar_protocolos(text, uuid, text, text, uuid, int);
create or replace function listar_protocolos(
  p_status       text default null,
  p_responsavel  uuid default null,
  p_busca        text default null,
  p_prioridade   text default null,
  p_regional_id  uuid default null,
  p_limite       int default 300
)
returns table (
  id             uuid,
  protocolo      text,
  cliente_id     uuid,
  associado      text,
  veiculo_id     uuid,
  placa          text,
  tipo           tipo_atendimento,
  assunto        text,
  descricao      text,
  status         status_atendimento,
  prioridade     prioridade_atendimento,
  responsavel_id uuid,
  responsavel    text,
  canal          canal_atendimento,
  interacoes     integer,
  aberto_em      timestamptz,
  atualizado_em  timestamptz,
  encerrado_em   timestamptz,
  dias_aberto    integer,
  evento_id      uuid,
  pareceres_pendentes integer
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.numero_protocolo, a.cliente_id, cl.nome_razao_social, a.veiculo_id, ve.placa,
         a.tipo, a.assunto, a.descricao, a.status, a.prioridade, a.responsavel_id, u.nome, a.canal,
         (select count(*)::int from protocolo_interacoes pi where pi.atendimento_id = a.id),
         a.created_at, a.updated_at, a.encerrado_em,
         (extract(day from now() - a.created_at))::int,
         a.evento_id,
         (select count(*)::int from protocolo_interacoes pi
           where pi.atendimento_id = a.id
             and pi.tipo::text = 'PARECER_SOLICITADO'
             and not exists (select 1 from protocolo_interacoes r where r.responde_a = pi.id))
    from atendimentos a
    join clientes cl on cl.id = a.cliente_id
    left join veiculos ve on ve.id = a.veiculo_id
    left join usuarios u on u.id = a.responsavel_id
   where (tem_acesso_global() or pode_regional(a.regional_id))
     and (p_regional_id is null or a.regional_id = p_regional_id)
     and (p_responsavel is null or a.responsavel_id = p_responsavel)
     and (p_prioridade is null or a.prioridade::text = p_prioridade)
     and (
       p_status is null
       or (p_status = 'ABERTOS' and a.encerrado_em is null)
       or a.status::text = p_status
     )
     and (
       p_busca is null or btrim(p_busca) = ''
       or a.numero_protocolo ilike '%' || p_busca || '%'
       or cl.nome_razao_social ilike '%' || p_busca || '%'
       or coalesce(ve.placa, '') ilike '%' || p_busca || '%'
       or coalesce(a.assunto, '') ilike '%' || p_busca || '%'
     )
   order by (a.encerrado_em is null) desc,
            case a.prioridade when 'URGENTE' then 1 when 'ALTA' then 2 when 'NORMAL' then 3 else 4 end,
            a.created_at desc
   limit coalesce(p_limite, 300);
$$;

-- ----------------------------------------------------------------------------
-- Rito de seguranca (0052): funcao nasce com EXECUTE para PUBLIC.
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
