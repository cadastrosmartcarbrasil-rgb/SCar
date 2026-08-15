-- ============================================================================
-- SCar :: 0022_atendimentos_sac.sql
-- Nucleo de ATENDIMENTOS (solicitacoes de SAC / Portal do Associado), sempre
-- vinculadas ao VEICULO especifico do atendimento. Base modular para os fluxos:
-- Sinistro, Assistencia 24h, Upgrade/Cobertura, 2a via de Boleto, Vistoria/
-- Acessorios e Alteracao Cadastral/Cancelamento.
-- Seguranca: abrir_atendimento() so permite staff (na regional) ou o proprio
-- associado dono do veiculo (auth_cliente_id) -> pronto para autosservico.
-- ============================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'tipo_atendimento') then
    create type tipo_atendimento as enum (
      'SINISTRO', 'ASSISTENCIA_24H', 'UPGRADE_COBERTURA',
      'SEGUNDA_VIA_BOLETO', 'VISTORIA_ACESSORIOS', 'ALTERACAO_CADASTRAL', 'CANCELAMENTO'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'canal_atendimento') then
    create type canal_atendimento as enum ('SAC_INTERNO', 'PORTAL');
  end if;
  if not exists (select 1 from pg_type where typname = 'status_atendimento') then
    create type status_atendimento as enum ('ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO');
  end if;
end $$;

create table if not exists atendimentos (
  id               uuid primary key default gen_random_uuid(),
  numero_protocolo text unique,                          -- ATD-YYYYMMDD-XXXX (trigger)
  cliente_id       uuid not null references clientes(id) on delete restrict,
  veiculo_id       uuid not null references veiculos(id) on delete restrict,
  tipo             tipo_atendimento not null,
  canal            canal_atendimento not null default 'SAC_INTERNO',
  status           status_atendimento not null default 'ABERTO',
  assunto          text,
  descricao        text,
  dados            jsonb not null default '{}'::jsonb,   -- payload especifico do fluxo
  regional_id      uuid references regionais(id) on delete set null,
  aberto_por       uuid references usuarios(id) on delete set null, -- null quando vem do Portal
  evento_id        uuid references eventos_sinistro(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_atendimentos_veiculo on atendimentos (veiculo_id, created_at desc);
create index if not exists idx_atendimentos_cliente on atendimentos (cliente_id, created_at desc);
create index if not exists idx_atendimentos_status  on atendimentos (status);

-- Protocolo ATD-YYYYMMDD-XXXX (espelha o gerador de eventos).
create or replace function fn_protocolo_atendimento()
returns trigger language plpgsql as $$
declare v_data text; v_seq integer;
begin
  if new.numero_protocolo is not null then return new; end if;
  v_data := to_char(now(), 'YYYYMMDD');
  perform pg_advisory_xact_lock(hashtext('atendimento_' || v_data));
  select coalesce(max((regexp_replace(numero_protocolo, '^ATD-\d{8}-', ''))::integer), 0) + 1
    into v_seq
    from atendimentos
   where numero_protocolo like 'ATD-' || v_data || '-%';
  new.numero_protocolo := 'ATD-' || v_data || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;
create trigger trg_protocolo_atendimento before insert on atendimentos
  for each row execute function fn_protocolo_atendimento();
create trigger trg_atendimentos_updated before update on atendimentos
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Abertura de atendimento (com trava de propriedade do veiculo)
-- ----------------------------------------------------------------------------
create or replace function abrir_atendimento(
  p_veiculo_id uuid,
  p_tipo tipo_atendimento,
  p_canal canal_atendimento default 'SAC_INTERNO',
  p_assunto text default null,
  p_descricao text default null,
  p_dados jsonb default '{}'::jsonb
)
returns atendimentos
language plpgsql security definer set search_path = public
as $$
declare
  v     veiculos;
  a     atendimentos;
  v_uid uuid := auth.uid();
begin
  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then raise exception 'Veiculo nao encontrado'; end if;

  -- Seguranca: staff com acesso a regional OU o proprio associado dono do veiculo.
  if not (is_staff() and pode_regional(v.regional_id))
     and v.cliente_id is distinct from auth_cliente_id() then
    raise exception 'Sem permissao para abrir atendimento neste veiculo';
  end if;

  insert into atendimentos (cliente_id, veiculo_id, tipo, canal, assunto, descricao, dados, regional_id, aberto_por)
  values (
    v.cliente_id, v.id, p_tipo, p_canal, p_assunto, p_descricao, coalesce(p_dados, '{}'::jsonb), v.regional_id,
    (select id from usuarios where id = v_uid)
  )
  returning * into a;
  return a;
end;
$$;

-- ============================================================================
-- RLS
-- ============================================================================
alter table atendimentos enable row level security;

-- Visibilidade: acesso global, regional do atendimento, ou o proprio dono (Portal).
create policy atendimentos_select on atendimentos for select to authenticated using (
  tem_acesso_global() or pode_regional(regional_id) or cliente_id = auth_cliente_id()
);
-- Abertura direta: staff (regional) ou o proprio associado dono do veiculo.
create policy atendimentos_insert on atendimentos for insert to authenticated with check (
  is_staff() or cliente_id = auth_cliente_id()
);
-- Tramitacao (status): somente staff.
create policy atendimentos_update on atendimentos for update to authenticated using (
  tem_acesso_global() or pode_regional(regional_id)
);

grant select, insert, update on atendimentos to authenticated;
grant execute on function abrir_atendimento(uuid, tipo_atendimento, canal_atendimento, text, text, jsonb) to authenticated;
