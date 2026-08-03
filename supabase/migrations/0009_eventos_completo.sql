-- ============================================================================
-- SCar :: 0009_eventos_completo.sql
-- Cadastro completo de eventos (sinistros): tipos configuraveis, envolvimento,
-- local, Boletim de Ocorrencia, FIPE/participacao, reparo proprio/terceiro e
-- lancamentos financeiros vinculados ao protocolo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type envolvido_tipo     as enum ('ASSOCIADO', 'TERCEIRO');
create type tipo_envolvimento  as enum ('CAUSADOR', 'VITIMA');
create type tipo_reparo        as enum ('PROPRIO', 'TERCEIRO');

-- ----------------------------------------------------------------------------
-- Tipos de evento configuraveis (Configuracoes)
-- ----------------------------------------------------------------------------
create table tipos_evento (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

insert into tipos_evento (nome) values
  ('Colisao'), ('Roubo'), ('Furto'), ('Danos a Terceiros'),
  ('Incendio'), ('Fenomenos Naturais'), ('Guincho / Assistencia'), ('Perda Total')
on conflict (nome) do nothing;

-- ----------------------------------------------------------------------------
-- Novos campos do evento
-- ----------------------------------------------------------------------------
alter table eventos_sinistro
  add column if not exists data_comunicacao      date,
  add column if not exists envolvido_tipo         envolvido_tipo not null default 'ASSOCIADO',
  add column if not exists tipo_envolvimento      tipo_envolvimento,
  add column if not exists tipo_evento_id         uuid references tipos_evento(id) on delete set null,
  add column if not exists local_evento           jsonb not null default '{}'::jsonb,
  add column if not exists valor_fipe_atualizado  numeric(12,2),
  add column if not exists valor_participacao     numeric(12,2),
  add column if not exists bo_numero              text,
  add column if not exists bo_data                date,
  add column if not exists bo_unidade             text,
  add column if not exists bo_resumo              text;

-- tipo_evento (enum) passa a ser opcional; a classificacao principal vem de tipo_evento_id
alter table eventos_sinistro alter column tipo_evento drop not null;

-- ----------------------------------------------------------------------------
-- Reparo proprio x terceiro nas cotacoes
-- ----------------------------------------------------------------------------
alter table cotacoes_pecas
  add column if not exists tipo_reparo tipo_reparo not null default 'PROPRIO';

-- ----------------------------------------------------------------------------
-- Lancamentos financeiros vinculados ao protocolo do evento
-- ----------------------------------------------------------------------------
alter table movimentacoes_caixa
  add column if not exists evento_id uuid references eventos_sinistro(id) on delete set null;
create index if not exists idx_mov_caixa_evento on movimentacoes_caixa (evento_id);

-- ----------------------------------------------------------------------------
-- RLS do catalogo de tipos de evento
-- ----------------------------------------------------------------------------
alter table tipos_evento enable row level security;
create policy tipos_evento_select on tipos_evento for select to authenticated using (is_staff());
create policy tipos_evento_write on tipos_evento for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());
grant select, insert, update, delete on tipos_evento to authenticated;
