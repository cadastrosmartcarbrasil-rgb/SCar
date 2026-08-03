-- ============================================================================
-- SCar :: 0008_comunicacoes.sql
-- Registro (log) de comunicacoes enviadas ao associado: e-mail, SMS e WhatsApp.
-- ============================================================================

create type canal_comunicacao  as enum ('EMAIL', 'SMS', 'WHATSAPP');
create type status_comunicacao as enum ('pendente', 'enviado', 'falha');

create table comunicacoes (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid references clientes(id) on delete cascade,
  canal           canal_comunicacao not null,
  destino         text,                       -- e-mail ou telefone de destino
  assunto         text,
  conteudo        text,
  status          status_comunicacao not null default 'pendente',
  template_codigo text,
  erro            text,
  regional_id     uuid references regionais(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index idx_comunicacoes_cliente on comunicacoes (cliente_id, created_at desc);
create index idx_comunicacoes_canal   on comunicacoes (canal);

-- RLS: staff da regional do associado (ou global) e o proprio associado.
alter table comunicacoes enable row level security;

create policy comunicacoes_select on comunicacoes for select to authenticated
  using (
    tem_acesso_global()
    or cliente_id = auth_cliente_id()
    or exists (select 1 from clientes c where c.id = cliente_id and pode_regional(c.regional_id))
  );

create policy comunicacoes_write on comunicacoes for all to authenticated
  using (
    tem_acesso_global()
    or exists (select 1 from clientes c where c.id = cliente_id and pode_regional(c.regional_id))
  )
  with check (
    tem_acesso_global()
    or exists (select 1 from clientes c where c.id = cliente_id and pode_regional(c.regional_id))
  );

grant select, insert, update, delete on comunicacoes to authenticated;
