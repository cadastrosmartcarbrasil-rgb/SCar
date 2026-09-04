-- ============================================================================
-- SCar :: 0049_rastreadores.sql
-- FASE 1 do modulo de RASTREADORES.
--   A) Catalogo de PRESTADORES de rastreamento (`empresas_rastreamento`) — a
--      empresa que rastreia o veiculo ("Rastreador por:"). Cadastro proprio em
--      Configuracoes > Rastreamento; sera a base do modulo completo (fase 2).
--   B) Dados do rastreador na FICHA DO VEICULO: IMEI, numero do chip e o
--      prestador. Alguns veiculos tem rastreador (regra ja existe em
--      `tipos_veiculo.exige_rastreador`), entao os campos sao opcionais.
--   C) Alerta reutilizavel "Rastreador pendente" para o SAC cobrar instalacao.
-- Obs.: a fase 2 (modulo/categoria de Rastreadores) devera criar o estoque de
-- equipamentos por IMEI; estes campos ficam como a fonte por veiculo ate la.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) Catalogo de prestadores de rastreamento
-- ----------------------------------------------------------------------------
create table if not exists empresas_rastreamento (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique,          -- nome comercial (aparece no "Rastreador por:")
  razao_social  text,
  cnpj          text,
  contato       text,                          -- pessoa de contato
  telefone      text,
  email         text,
  plataforma_url text,                         -- link da plataforma de rastreamento
  observacoes   text,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_empresas_rastreamento_ativo on empresas_rastreamento (ativo, nome);

create trigger trg_empresas_rastreamento_updated before update on empresas_rastreamento
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- B) Dados do rastreador no veiculo
-- ----------------------------------------------------------------------------
alter table veiculos
  add column if not exists rastreador_imei          text,
  add column if not exists rastreador_chip          text,
  add column if not exists empresa_rastreamento_id  uuid references empresas_rastreamento(id) on delete set null;

-- IMEI: 14 a 17 digitos (15 no padrao GSM; alguns equipamentos reportam 16/17).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'veiculos_rastreador_imei_formato') then
    alter table veiculos add constraint veiculos_rastreador_imei_formato
      check (rastreador_imei is null or rastreador_imei ~ '^[0-9]{14,17}$');
  end if;
end $$;

-- Chip: digitos (linha ou ICCID), 8 a 22 posicoes.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'veiculos_rastreador_chip_formato') then
    alter table veiculos add constraint veiculos_rastreador_chip_formato
      check (rastreador_chip is null or rastreador_chip ~ '^[0-9]{8,22}$');
  end if;
end $$;

-- Um equipamento (IMEI) nao pode estar em dois veiculos vivos ao mesmo tempo.
create unique index if not exists uq_veiculos_rastreador_imei
  on veiculos (rastreador_imei)
  where rastreador_imei is not null and status <> 'excluido';

create index if not exists idx_veiculos_rastreador_chip on veiculos (rastreador_chip)
  where rastreador_chip is not null;
create index if not exists idx_veiculos_empresa_rastreamento on veiculos (empresa_rastreamento_id)
  where empresa_rastreamento_id is not null;

-- ============================================================================
-- RLS
-- ============================================================================
alter table empresas_rastreamento enable row level security;

-- catalogo global (como tipos_alerta): staff le, admin/financeiro mantem.
create policy er_select on empresas_rastreamento for select to authenticated using (is_staff());
create policy er_write  on empresas_rastreamento for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

grant select, insert, update, delete on empresas_rastreamento to authenticated;

-- ============================================================================
-- SEED: alerta de pendencia de rastreador (catalogo de 0023)
-- ============================================================================
insert into tipos_alerta (nome, descricao, severidade) values
  ('Rastreador pendente', 'Veiculo exige rastreador e ainda nao tem IMEI/chip cadastrados', 'ALTA')
on conflict (nome) do nothing;
