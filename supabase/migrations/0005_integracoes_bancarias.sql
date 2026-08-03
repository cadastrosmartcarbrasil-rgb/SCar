-- ============================================================================
-- SCar :: 0005_integracoes_bancarias.sql
-- Configuracao de gateways/APIs bancarias para emissao de boletos.
-- Segredos (api_key etc.) ficam restritos a admin/financeiro via RLS e sao
-- usados apenas no lado servidor (Route Handlers / Edge Functions).
-- ============================================================================

create type provedor_banco as enum ('ASAAS', 'PJBANK', 'CORA', 'INTER', 'GERENCIANET', 'OUTRO');
create type ambiente_integracao as enum ('sandbox', 'producao');

create table integracoes_bancarias (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  provedor        provedor_banco not null,
  ambiente        ambiente_integracao not null default 'sandbox',
  api_url         text,
  api_key         text,            -- segredo (token/api key do gateway)
  api_token_extra text,            -- opcional: wallet id, client secret, etc.
  webhook_secret  text,            -- valida os webhooks de retorno
  regional_id     uuid references regionais(id) on delete set null,  -- null = global
  is_padrao       boolean not null default false,   -- gateway padrao para emissao
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_integracoes_regional on integracoes_bancarias (regional_id);
-- Garante no maximo um gateway padrao ativo por escopo (regional ou global).
create unique index uq_integracao_padrao
  on integracoes_bancarias (coalesce(regional_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_padrao and ativo;

create trigger trg_integracoes_updated
  before update on integracoes_bancarias
  for each row execute function set_updated_at();

-- RLS: apenas acesso global (admin/financeiro) gerencia integracoes.
alter table integracoes_bancarias enable row level security;

create policy integracoes_all on integracoes_bancarias for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

grant select, insert, update, delete on integracoes_bancarias to authenticated;
