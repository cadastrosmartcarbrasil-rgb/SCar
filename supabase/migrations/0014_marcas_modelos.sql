-- ============================================================================
-- SCar :: 0014_marcas_modelos.sql
-- Enriquecimento do catalogo de Marcas e Modelos para bater com o relatorio
-- SGA (Tipo do veiculo, Marca/montadora, Modelo, Idade maxima aceita) e status
-- de aceitacao (ATIVO padrao / INATIVO = nao aceito / SUSPENSO).
-- ============================================================================

-- Status de aceitacao do cadastro (marca/modelo).
do $$ begin
  if not exists (select 1 from pg_type where typname = 'status_cadastro') then
    create type status_cadastro as enum ('ATIVO', 'INATIVO', 'SUSPENSO');
  end if;
end $$;

-- Marcas: status de aceitacao.
alter table marcas
  add column if not exists status status_cadastro not null default 'ATIVO';

-- Modelos: tipo de veiculo (categoria do relatorio), idade maxima aceita e status.
alter table modelos
  add column if not exists tipo_veiculo  text,
  add column if not exists idade_maxima  integer not null default 0,
  add column if not exists status        status_cadastro not null default 'ATIVO';

-- Mantem o boolean legado 'ativo' coerente com o novo status (ativo = ATIVO).
-- (colunas 'ativo' continuam existindo para compatibilidade com filtros atuais)
create index if not exists idx_modelos_tipo   on modelos (tipo_veiculo);
create index if not exists idx_modelos_status on modelos (status);
create index if not exists idx_marcas_status  on marcas (status);
