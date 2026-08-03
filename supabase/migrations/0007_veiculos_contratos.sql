-- ============================================================================
-- SCar :: 0007_veiculos_contratos.sql
-- Cadastro de veiculos como contratos: marcas/modelos, dados contratuais,
-- FIPE, cambio, combustivel e novos status.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Novos enums
-- ----------------------------------------------------------------------------
create type tipo_negociacao as enum (
  'venda', 'substituicao', 'reativacao', 'troca_titularidade', 'renovacao'
);
create type tipo_cambio as enum ('manual', 'automatico', 'automatizado');
create type combustivel as enum ('gasolina', 'flex', 'diesel', 'alcool', 'eletrico');

-- Novos status de contrato do veiculo
alter type status_veiculo add value if not exists 'inativo';
alter type status_veiculo add value if not exists 'excluido';

-- ----------------------------------------------------------------------------
-- Registro de Marcas e Modelos (catalogo, gerenciado em Configuracoes)
-- ----------------------------------------------------------------------------
create table marcas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

create table modelos (
  id         uuid primary key default gen_random_uuid(),
  marca_id   uuid not null references marcas(id) on delete cascade,
  nome       text not null,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  unique (marca_id, nome)
);
create index idx_modelos_marca on modelos (marca_id);

-- ----------------------------------------------------------------------------
-- Novos campos contratuais no veiculo
-- ----------------------------------------------------------------------------
alter table veiculos
  add column if not exists data_contrato    date,
  add column if not exists tipo_negociacao  tipo_negociacao,
  add column if not exists codigo_fipe       text,
  add column if not exists quilometragem     integer,
  add column if not exists tipo_cambio       tipo_cambio,
  add column if not exists combustivel        combustivel;

-- ----------------------------------------------------------------------------
-- RLS dos catalogos (leitura para staff, escrita para acesso global)
-- ----------------------------------------------------------------------------
alter table marcas  enable row level security;
alter table modelos enable row level security;

create policy marcas_select on marcas for select to authenticated using (is_staff());
create policy marcas_write on marcas for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

create policy modelos_select on modelos for select to authenticated using (is_staff());
create policy modelos_write on modelos for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

grant select, insert, update, delete on marcas to authenticated;
grant select, insert, update, delete on modelos to authenticated;
