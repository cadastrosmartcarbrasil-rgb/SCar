-- ============================================================================
-- SCar :: 0168_email_cobranca.sql
-- E-MAILS DE COBRANCA RECORRENTE (avisos de vencimento e de atraso).
--
-- Decisoes do usuario (02/11/2026):
--   * SO os boletos emitidos pelo SCar (`titulos_financeiros` registrados no
--     banco). O Mutual ja manda os avisos dos boletos dele.
--   * Regua: D-5, D-1, D0, D+2 e D+7. SEM confirmacao de pagamento.
--   * A linha digitavel vai no corpo do e-mail.
--   * Provedor Resend; fuso America/Sao_Paulo; dominio de envio
--     avisos.appsmartcar.com.br.
--
-- Pecas:
--   email_config     linha unica: pausa, modo sandbox/live, allowlist, taxa, janela
--   email_regua      os gatilhos (codigo, dias em relacao ao vencimento, ativo)
--   email_outbox     a FILA (um item por titulo + aviso + destinatario: unique)
--   email_eventos    log imutavel do que o provedor informou (sem corpo do e-mail)
--   email_supressoes quem NUNCA mais recebe (bounce permanente, reclamacao, manual)
--
-- O caminho: rotina (crontab do VPS) -> /api/v1/comunicacoes/email/rotina ->
--   enfileirar_avisos_cobranca() + reservar_lote_email() + concluir_envio_email().
--   Webhook do Resend -> registrar_evento_email().
-- Atraso conta do vencimento EFETIVO (dia_util_seguinte, 0097): boleto que vence
-- no sabado e pago na segunda nao esta atrasado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
create or replace function email_normalizado(p_email text)
returns text language sql immutable set search_path = public as $$
  select nullif(lower(btrim(coalesce(p_email, ''))), '');
$$;

create or replace function email_valido(p_email text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(email_normalizado(p_email) ~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$', false);
$$;

-- ----------------------------------------------------------------------------
-- Configuracao (linha unica)
-- ----------------------------------------------------------------------------
create table if not exists email_config (
  id                 boolean primary key default true check (id),
  pausado            boolean not null default false,
  modo               text not null default 'sandbox' check (modo in ('sandbox', 'live')),
  allowlist          text[] not null default '{}',
  limite_por_segundo numeric(4,1) not null default 2 check (limite_por_segundo > 0 and limite_por_segundo <= 50),
  lote_maximo        int not null default 200 check (lote_maximo between 1 and 2000),
  janela_inicio      time not null default '08:00',
  janela_fim         time not null default '20:00',
  permite_domingo    boolean not null default false,
  reply_to           text,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references usuarios(id) on delete set null,
  constraint chk_email_janela check (janela_inicio < janela_fim)
);
insert into email_config (id) select true where not exists (select 1 from email_config);

comment on table email_config is
  'E-mails de cobranca (0168): pausa geral, modo (sandbox so envia para a allowlist), taxa e janela de horario (America/Sao_Paulo).';

-- ----------------------------------------------------------------------------
-- Regua
-- ----------------------------------------------------------------------------
create table if not exists email_regua (
  codigo      text primary key check (codigo ~ '^[a-z0-9_]+$'),
  nome        text not null,
  offset_dias int not null check (offset_dias between -30 and 60),
  template    text not null check (template in ('aviso_vencimento', 'vence_hoje', 'atraso')),
  ativo       boolean not null default true,
  ordem       int not null default 0,
  updated_at  timestamptz not null default now()
);

insert into email_regua (codigo, nome, offset_dias, template, ordem)
select v.codigo, v.nome, v.offset_dias, v.template, v.ordem
  from (values
    ('aviso_d_menos_5', 'Lembrete: vence em 5 dias', -5, 'aviso_vencimento', 1),
    ('aviso_d_menos_1', 'Lembrete: vence amanha',     -1, 'aviso_vencimento', 2),
    ('vencimento_d0',   'Vence hoje',                  0, 'vence_hoje',       3),
    ('atraso_d_mais_2', 'Em aberto ha 2 dias',         2, 'atraso',           4),
    ('atraso_d_mais_7', 'Em aberto ha 7 dias',         7, 'atraso',           5)
  ) v(codigo, nome, offset_dias, template, ordem)
 where not exists (select 1 from email_regua r where r.codigo = v.codigo);

-- ----------------------------------------------------------------------------
-- Fila
-- ----------------------------------------------------------------------------
create table if not exists email_outbox (
  id                   uuid primary key default gen_random_uuid(),
  titulo_id            uuid references titulos_financeiros(id) on delete cascade,
  cliente_id           uuid references clientes(id) on delete set null,
  regua_codigo         text not null,
  template             text not null,
  destinatario         text not null,
  data_alvo            date not null,
  assunto              text,
  status               text not null default 'pendente' check (status in
                         ('pendente', 'enviando', 'enviado', 'entregue', 'falhou', 'bounce',
                          'reclamado', 'suprimido', 'cancelado', 'expirado')),
  tentativas           int not null default 0,
  proxima_tentativa_em timestamptz not null default now(),
  reservado_em         timestamptz,
  message_id           text,
  erro                 text,
  motivo               text,
  criado_em            timestamptz not null default now(),
  enviado_em           timestamptz,
  entregue_em          timestamptz,
  atualizado_em        timestamptz not null default now(),
  constraint uq_email_outbox_aviso unique (titulo_id, regua_codigo, destinatario)
);
create index if not exists idx_email_outbox_fila on email_outbox (status, proxima_tentativa_em);
create index if not exists idx_email_outbox_dest on email_outbox (destinatario);
create index if not exists idx_email_outbox_msg on email_outbox (message_id) where message_id is not null;
create index if not exists idx_email_outbox_criado on email_outbox (criado_em desc);

-- ----------------------------------------------------------------------------
-- Eventos do provedor (imutavel; sem corpo do e-mail)
-- ----------------------------------------------------------------------------
create table if not exists email_eventos (
  id               uuid primary key default gen_random_uuid(),
  provedor         text not null,
  evento_externo   text not null,
  tipo             text not null,
  message_id       text,
  outbox_id        uuid references email_outbox(id) on delete set null,
  destinatario     text,
  detalhe          text,
  ocorrido_em      timestamptz,
  recebido_em      timestamptz not null default now(),
  constraint uq_email_evento unique (provedor, evento_externo)
);
create index if not exists idx_email_eventos_msg on email_eventos (message_id);
create index if not exists idx_email_eventos_recebido on email_eventos (recebido_em desc);

-- ----------------------------------------------------------------------------
-- Supressoes
-- ----------------------------------------------------------------------------
create table if not exists email_supressoes (
  id                uuid primary key default gen_random_uuid(),
  email             text not null check (email = lower(btrim(email))),
  motivo            text not null check (motivo in ('bounce_permanente', 'reclamacao', 'manual')),
  origem_message_id text,
  detalhe           text,
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now(),
  criado_por        uuid references usuarios(id) on delete set null,
  liberado_em       timestamptz,
  liberado_por      uuid references usuarios(id) on delete set null,
  liberacao_motivo  text
);
create unique index if not exists uq_email_supressao_ativa on email_supressoes (email) where ativo;

create or replace function email_suprimido(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from email_supressoes s where s.ativo and s.email = email_normalizado(p_email));
$$;

-- ----------------------------------------------------------------------------
-- RLS: so a matriz (admin/financeiro). O associado nunca le nada disto.
-- ----------------------------------------------------------------------------
alter table email_config enable row level security;
alter table email_regua enable row level security;
alter table email_outbox enable row level security;
alter table email_eventos enable row level security;
alter table email_supressoes enable row level security;

drop policy if exists email_config_select on email_config;
create policy email_config_select on email_config for select to authenticated using ((select tem_acesso_global()));
drop policy if exists email_config_update on email_config;
create policy email_config_update on email_config for update to authenticated
  using ((select tem_acesso_global())) with check ((select tem_acesso_global()));

drop policy if exists email_regua_select on email_regua;
create policy email_regua_select on email_regua for select to authenticated using ((select tem_acesso_global()));
drop policy if exists email_regua_update on email_regua;
create policy email_regua_update on email_regua for update to authenticated
  using ((select tem_acesso_global())) with check ((select tem_acesso_global()));

drop policy if exists email_outbox_select on email_outbox;
create policy email_outbox_select on email_outbox for select to authenticated using ((select tem_acesso_global()));
drop policy if exists email_eventos_select on email_eventos;
create policy email_eventos_select on email_eventos for select to authenticated using ((select tem_acesso_global()));
drop policy if exists email_supressoes_select on email_supressoes;
create policy email_supressoes_select on email_supressoes for select to authenticated using ((select tem_acesso_global()));

revoke all on email_config, email_regua, email_outbox, email_eventos, email_supressoes from anon;
grant select on email_config, email_regua, email_outbox, email_eventos, email_supressoes to authenticated;
grant update on email_config, email_regua to authenticated;

-- ----------------------------------------------------------------------------
-- A data em que cada aviso e devido
-- ----------------------------------------------------------------------------
create or replace function email_data_alvo(p_vencimento date, p_offset int)
returns date language sql stable set search_path = public as $$
  select case
           when p_vencimento is null then null
           when p_offset > 0 then dia_util_seguinte(p_vencimento) + p_offset
           else p_vencimento + p_offset
         end;
$$;

-- ----------------------------------------------------------------------------
-- ENFILEIRAR (rotina; re-executavel)
-- ----------------------------------------------------------------------------
create or replace function enfileirar_avisos_cobranca(p_hoje date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := coalesce(p_hoje, data_sp(now()));
  cfg email_config;
  v_criados int := 0; v_suprimidos int := 0; v_sem_email int := 0; v_expirados int := 0;
  v_domingo boolean;
  r record;
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Sem permissao para enfileirar avisos' using errcode = 'insufficient_privilege';
  end if;
  select * into cfg from email_config where id;

  -- o que nao saiu no dia dele nao sai mais (aviso de vespera no dia seguinte confunde)
  update email_outbox set status = 'expirado', motivo = 'nao enviado no dia previsto', atualizado_em = now()
   where status = 'pendente' and data_alvo < v_hoje;
  get diagnostics v_expirados = row_count;

  v_domingo := extract(isodow from v_hoje) = 7;
  if v_domingo and not coalesce(cfg.permite_domingo, false) then
    return jsonb_build_object('hoje', v_hoje, 'criados', 0, 'suprimidos', 0, 'sem_email', 0,
                              'expirados', v_expirados, 'domingo', true);
  end if;

  for r in
    select t.id as titulo_id, t.cliente_id, rg.codigo, rg.template,
           email_normalizado(c.email) as destinatario
      from email_regua rg
      join titulos_financeiros t
        on email_data_alvo(t.data_vencimento, rg.offset_dias) = v_hoje
      join clientes c on c.id = t.cliente_id
     where rg.ativo
       and t.status::text in ('pendente', 'vencido')
       and coalesce(t.linha_digitavel, '') <> ''
       and t.data_vencimento between v_hoje - 70 and v_hoje + 40
  loop
    if not email_valido(r.destinatario) then
      v_sem_email := v_sem_email + 1;
      continue;
    end if;
    insert into email_outbox (titulo_id, cliente_id, regua_codigo, template, destinatario, data_alvo, status, motivo)
    values (r.titulo_id, r.cliente_id, r.codigo, r.template, r.destinatario, v_hoje,
            case when email_suprimido(r.destinatario) then 'suprimido' else 'pendente' end,
            case when email_suprimido(r.destinatario) then 'e-mail na lista de supressao' end)
    on conflict (titulo_id, regua_codigo, destinatario) do nothing;
    if found then
      if email_suprimido(r.destinatario) then v_suprimidos := v_suprimidos + 1;
      else v_criados := v_criados + 1; end if;
    end if;
  end loop;

  return jsonb_build_object('hoje', v_hoje, 'criados', v_criados, 'suprimidos', v_suprimidos,
                            'sem_email', v_sem_email, 'expirados', v_expirados, 'domingo', v_domingo);
end;
$$;

comment on function enfileirar_avisos_cobranca(date) is
  'E-mails de cobranca (0168): cria os avisos devidos HOJE (America/Sao_Paulo) pela email_regua, so para titulos do SCar registrados no banco e em aberto. Re-executavel (unique titulo+aviso+destinatario). Expira o pendente de dias anteriores.';

-- ----------------------------------------------------------------------------
-- RESERVAR um lote (o despachante; SKIP LOCKED)
-- ----------------------------------------------------------------------------
create or replace function reservar_lote_email(p_limite int default 50, p_agora timestamptz default null)
returns table (
  id uuid, titulo_id uuid, cliente_id uuid, regua_codigo text, template text,
  destinatario text, tentativas int, cliente_nome text, valor numeric, data_vencimento date,
  linha_digitavel text, pix_copia_cola text, titulo_status text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  cfg email_config;
  v_agora timestamptz := coalesce(p_agora, now());
  v_hora time := (v_agora at time zone 'America/Sao_Paulo')::time;
  v_dow int := extract(isodow from (v_agora at time zone 'America/Sao_Paulo'));
begin
  if auth.uid() is not null then
    raise exception 'So a rotina reserva o lote' using errcode = 'insufficient_privilege';
  end if;
  select * into cfg from email_config c where c.id;
  if cfg.pausado then return; end if;
  if v_hora < cfg.janela_inicio or v_hora >= cfg.janela_fim then return; end if;
  if v_dow = 7 and not cfg.permite_domingo then return; end if;

  -- reserva que ficou presa (processo caiu no meio) volta para a fila
  update email_outbox o set status = 'pendente', reservado_em = null, atualizado_em = now()
   where o.status = 'enviando' and o.reservado_em < v_agora - interval '15 minutes';

  return query
  with lote as (
    select o.id from email_outbox o
     where o.status = 'pendente' and o.proxima_tentativa_em <= v_agora
       and o.data_alvo = data_sp(v_agora)
     order by o.proxima_tentativa_em, o.criado_em
     limit greatest(1, least(coalesce(p_limite, 50), cfg.lote_maximo))
     for update skip locked
  ), marcados as (
    update email_outbox o set status = 'enviando', reservado_em = v_agora,
           tentativas = o.tentativas + 1, atualizado_em = now()
      from lote where o.id = lote.id
    returning o.*
  )
  select m.id, m.titulo_id, m.cliente_id, m.regua_codigo, m.template, m.destinatario, m.tentativas,
         c.nome_razao_social, t.valor, t.data_vencimento, t.linha_digitavel, t.pix_copia_cola, t.status::text
    from marcados m
    left join titulos_financeiros t on t.id = m.titulo_id
    left join clientes c on c.id = m.cliente_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- CONCLUIR um envio
-- ----------------------------------------------------------------------------
create or replace function concluir_envio_email(
  p_id uuid, p_status text, p_message_id text default null, p_erro text default null,
  p_proxima timestamptz default null, p_assunto text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    raise exception 'So a rotina conclui o envio' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('enviado', 'falhou', 'pendente', 'suprimido', 'cancelado') then
    raise exception 'Status de conclusao invalido: %', p_status;
  end if;
  update email_outbox set
    status = p_status,
    message_id = coalesce(p_message_id, message_id),
    erro = case when p_status in ('falhou', 'pendente') then left(p_erro, 500) else null end,
    motivo = case when p_status in ('suprimido', 'cancelado') then left(p_erro, 500) else motivo end,
    assunto = coalesce(p_assunto, assunto),
    proxima_tentativa_em = coalesce(p_proxima, proxima_tentativa_em),
    enviado_em = case when p_status = 'enviado' then now() else enviado_em end,
    reservado_em = null,
    atualizado_em = now()
  where id = p_id and status = 'enviando';
end;
$$;

-- ----------------------------------------------------------------------------
-- EVENTO do provedor (webhook)
-- ----------------------------------------------------------------------------
create or replace function registrar_evento_email(
  p_provedor text, p_evento_externo text, p_tipo text, p_message_id text,
  p_destinatario text default null, p_detalhe text default null,
  p_permanente boolean default true, p_ocorrido_em timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outbox uuid;
  v_dest text := email_normalizado(p_destinatario);
  v_suprime text;
begin
  if auth.uid() is not null then
    raise exception 'So o webhook registra eventos' using errcode = 'insufficient_privilege';
  end if;
  select o.id, coalesce(v_dest, o.destinatario) into v_outbox, v_dest
    from email_outbox o where p_message_id is not null and o.message_id = p_message_id limit 1;

  insert into email_eventos (provedor, evento_externo, tipo, message_id, outbox_id, destinatario, detalhe, ocorrido_em)
  values (p_provedor, p_evento_externo, p_tipo, p_message_id, v_outbox, v_dest, left(p_detalhe, 500), p_ocorrido_em)
  on conflict (provedor, evento_externo) do nothing;
  if not found then return 'DUPLICADO'; end if;

  if p_tipo = 'entregue' then
    update email_outbox set status = 'entregue', entregue_em = coalesce(p_ocorrido_em, now()), atualizado_em = now()
     where id = v_outbox and status in ('enviado', 'enviando');
  elsif p_tipo = 'bounce' then
    if p_permanente then
      update email_outbox set status = 'bounce', erro = left(p_detalhe, 500), atualizado_em = now() where id = v_outbox;
      v_suprime := 'bounce_permanente';
    end if;
  elsif p_tipo = 'reclamacao' then
    update email_outbox set status = 'reclamado', atualizado_em = now() where id = v_outbox;
    v_suprime := 'reclamacao';
  elsif p_tipo = 'falhou' then
    update email_outbox set status = 'falhou', erro = left(p_detalhe, 500), atualizado_em = now()
     where id = v_outbox and status in ('enviado', 'enviando');
  end if;

  if v_suprime is not null and email_valido(v_dest) and not email_suprimido(v_dest) then
    insert into email_supressoes (email, motivo, origem_message_id, detalhe)
    values (v_dest, v_suprime, p_message_id, left(p_detalhe, 500))
    on conflict do nothing;
    update email_outbox set status = 'suprimido', motivo = 'suprimido apos ' || v_suprime, atualizado_em = now()
     where destinatario = v_dest and status = 'pendente';
  end if;
  return 'OK';
end;
$$;

-- ----------------------------------------------------------------------------
-- Acoes da matriz
-- ----------------------------------------------------------------------------
create or replace function suprimir_email_manual(p_email text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text := email_normalizado(p_email);
begin
  if not tem_acesso_global() then
    raise exception 'Sem permissao' using errcode = 'insufficient_privilege';
  end if;
  if not email_valido(v_email) then raise exception 'E-mail invalido'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Informe o motivo (minimo 5 caracteres)'; end if;
  if email_suprimido(v_email) then return; end if;
  insert into email_supressoes (email, motivo, detalhe, criado_por) values (v_email, 'manual', btrim(p_motivo), usuario_atual_id());
  update email_outbox set status = 'suprimido', motivo = 'suprimido manualmente', atualizado_em = now()
   where destinatario = v_email and status = 'pendente';
end;
$$;

create or replace function liberar_supressao_email(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tem_acesso_global() then
    raise exception 'Sem permissao' using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Informe o motivo (minimo 5 caracteres)'; end if;
  update email_supressoes set ativo = false, liberado_em = now(), liberado_por = usuario_atual_id(),
         liberacao_motivo = btrim(p_motivo)
   where id = p_id and ativo;
  if not found then raise exception 'Supressao nao encontrada ou ja liberada'; end if;
end;
$$;

create or replace function reenviar_email(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o email_outbox;
begin
  if not tem_acesso_global() then
    raise exception 'Sem permissao' using errcode = 'insufficient_privilege';
  end if;
  select * into o from email_outbox where id = p_id;
  if not found then raise exception 'Item nao encontrado'; end if;
  if o.status not in ('falhou', 'expirado', 'cancelado') then
    raise exception 'So se reenvia item falhou, expirado ou cancelado (este esta %)', o.status;
  end if;
  if email_suprimido(o.destinatario) then raise exception 'E-mail na lista de supressao: libere antes'; end if;
  if o.titulo_id is not null and exists (select 1 from titulos_financeiros t where t.id = o.titulo_id and t.status::text in ('pago', 'cancelado')) then
    raise exception 'O boleto ja foi pago ou cancelado';
  end if;
  update email_outbox set status = 'pendente', tentativas = 0, erro = null, motivo = 'reenvio manual',
         data_alvo = data_sp(now()), proxima_tentativa_em = now(), atualizado_em = now()
   where id = p_id;
end;
$$;

create or replace function cancelar_email(p_id uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tem_acesso_global() then
    raise exception 'Sem permissao' using errcode = 'insufficient_privilege';
  end if;
  update email_outbox set status = 'cancelado', motivo = coalesce(nullif(btrim(p_motivo), ''), 'cancelado manualmente'),
         atualizado_em = now()
   where id = p_id and status = 'pendente';
  if not found then raise exception 'So se cancela item pendente'; end if;
end;
$$;

create or replace function email_painel_resumo(p_dias int default 7)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not tem_acesso_global() then return null; end if;
  select jsonb_build_object(
    'dias', p_dias,
    'enviados', count(*) filter (where status in ('enviado', 'entregue', 'bounce', 'reclamado')),
    'entregues', count(*) filter (where status = 'entregue'),
    'bounces', count(*) filter (where status = 'bounce'),
    'reclamacoes', count(*) filter (where status = 'reclamado'),
    'falhas', count(*) filter (where status = 'falhou'),
    'suprimidos', count(*) filter (where status = 'suprimido'),
    'cancelados', count(*) filter (where status = 'cancelado'),
    'expirados', count(*) filter (where status = 'expirado'),
    'pendentes', count(*) filter (where status in ('pendente', 'enviando')),
    'supressoes_ativas', (select count(*) from email_supressoes where ativo)
  ) into v
  from email_outbox where criado_em >= now() - make_interval(days => greatest(1, coalesce(p_dias, 7)));
  return v;
end;
$$;

-- ----------------------------------------------------------------------------
-- Boleto pago ou cancelado: os avisos que nao sairam caem
-- ----------------------------------------------------------------------------
create or replace function fn_titulo_cancela_avisos_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status::text in ('pago', 'cancelado') and old.status is distinct from new.status then
    update email_outbox set status = 'cancelado',
           motivo = case when new.status::text = 'pago' then 'boleto pago' else 'boleto cancelado' end,
           atualizado_em = now()
     where titulo_id = new.id and status = 'pendente';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_titulo_cancela_avisos_email on titulos_financeiros;
create trigger trg_titulo_cancela_avisos_email
  after update of status on titulos_financeiros
  for each row execute function fn_titulo_cancela_avisos_email();

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
