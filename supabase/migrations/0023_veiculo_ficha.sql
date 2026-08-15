-- ============================================================================
-- SCar :: 0023_veiculo_ficha.sql
-- Enriquece a FICHA do veiculo (item) para o SAC/Portal:
--   A) Campos: alienado (+financeira), numero de portas, valor da mensalidade e
--      dia de vencimento (base da geracao de cobrancas).
--   B) Produtos opcionais vinculados ao veiculo (plano ja existe em veiculos).
--   C) Alertas reutilizaveis: catalogo `tipos_alerta` + `veiculo_alertas` (o SAC
--      abre os alertas ativos assim que o associado e aberto).
--   D) Contratos de adesao (termo pos-venda, aceite eletronico — estrutura; o
--      termo/aceite sera construido depois).
--   E) Vistorias + anexos (modulo proprio depois; ficam na ficha do veiculo).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) Campos do veiculo
-- ----------------------------------------------------------------------------
alter table veiculos
  add column if not exists alienado            boolean not null default false,
  add column if not exists alienado_financeira text,
  add column if not exists numero_portas       smallint,
  add column if not exists valor_mensalidade   numeric(12,2),
  add column if not exists dia_vencimento      smallint
    check (dia_vencimento is null or (dia_vencimento between 1 and 31));

-- ----------------------------------------------------------------------------
-- B) Produtos opcionais do veiculo (plano_protecao_id ja existe)
-- ----------------------------------------------------------------------------
create table if not exists veiculo_produtos (
  veiculo_id uuid not null references veiculos(id) on delete cascade,
  produto_id uuid not null references produtos(id) on delete cascade,
  primary key (veiculo_id, produto_id)
);

-- ----------------------------------------------------------------------------
-- C) Alertas reutilizaveis (catalogo) + alertas do veiculo
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'severidade_alerta') then
    create type severidade_alerta as enum ('BAIXA', 'MEDIA', 'ALTA');
  end if;
end $$;

create table if not exists tipos_alerta (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  descricao  text,
  severidade severidade_alerta not null default 'MEDIA',
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists veiculo_alertas (
  id             uuid primary key default gen_random_uuid(),
  veiculo_id     uuid not null references veiculos(id) on delete cascade,
  tipo_alerta_id uuid not null references tipos_alerta(id) on delete restrict,
  mensagem       text,
  ativo          boolean not null default true,
  created_by     uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default now(),
  resolvido_em   timestamptz
);
create index if not exists idx_veiculo_alertas_ativo on veiculo_alertas (veiculo_id) where ativo;

-- ----------------------------------------------------------------------------
-- D) Contratos de adesao (termo pos-venda + aceite eletronico)
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'status_contrato_adesao') then
    create type status_contrato_adesao as enum ('PENDENTE', 'ENVIADO', 'ACEITO', 'RECUSADO', 'CANCELADO');
  end if;
end $$;

create table if not exists contratos_adesao (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references clientes(id) on delete restrict,
  veiculo_id    uuid references veiculos(id) on delete set null,
  status        status_contrato_adesao not null default 'PENDENTE',
  documento_url text,
  token         uuid not null unique default gen_random_uuid(), -- link de aceite eletronico
  aceito_em     timestamptz,
  aceito_ip     text,
  regional_id   uuid references regionais(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_contratos_veiculo on contratos_adesao (veiculo_id);
create index if not exists idx_contratos_cliente on contratos_adesao (cliente_id);

-- ----------------------------------------------------------------------------
-- E) Vistorias + anexos
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'status_vistoria') then
    create type status_vistoria as enum ('AGENDADA', 'PENDENTE', 'APROVADA', 'REPROVADA');
  end if;
end $$;

create table if not exists vistorias (
  id           uuid primary key default gen_random_uuid(),
  veiculo_id   uuid not null references veiculos(id) on delete cascade,
  tipo         text, -- inicial / periodica / evento / acessorios
  status       status_vistoria not null default 'PENDENTE',
  data_vistoria date,
  observacoes  text,
  created_by   uuid references usuarios(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_vistorias_veiculo on vistorias (veiculo_id, created_at desc);

create table if not exists vistoria_anexos (
  id          uuid primary key default gen_random_uuid(),
  vistoria_id uuid not null references vistorias(id) on delete cascade,
  url         text not null,
  tipo        text,
  descricao   text,
  created_at  timestamptz not null default now()
);

create trigger trg_contratos_updated before update on contratos_adesao
  for each row execute function set_updated_at();
create trigger trg_vistorias_updated before update on vistorias
  for each row execute function set_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
alter table veiculo_produtos  enable row level security;
alter table tipos_alerta      enable row level security;
alter table veiculo_alertas   enable row level security;
alter table contratos_adesao  enable row level security;
alter table vistorias         enable row level security;
alter table vistoria_anexos   enable row level security;

-- helper de visibilidade por veiculo (staff regional ou dono/Portal)
-- (inline nas policies via subquery em veiculos)

create policy vp_select on veiculo_produtos for select to authenticated using (
  exists (select 1 from veiculos v where v.id = veiculo_id and (pode_regional(v.regional_id) or v.cliente_id = auth_cliente_id()))
);
create policy vp_write on veiculo_produtos for all to authenticated using (
  exists (select 1 from veiculos v where v.id = veiculo_id and pode_regional(v.regional_id))
) with check (
  exists (select 1 from veiculos v where v.id = veiculo_id and pode_regional(v.regional_id))
);

create policy ta_select on tipos_alerta for select to authenticated using (is_staff());
create policy ta_write  on tipos_alerta for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());

create policy va_select on veiculo_alertas for select to authenticated using (
  exists (select 1 from veiculos v where v.id = veiculo_id and (pode_regional(v.regional_id) or v.cliente_id = auth_cliente_id()))
);
create policy va_write on veiculo_alertas for all to authenticated using (
  exists (select 1 from veiculos v where v.id = veiculo_id and pode_regional(v.regional_id))
) with check (
  exists (select 1 from veiculos v where v.id = veiculo_id and pode_regional(v.regional_id))
);

create policy ca_select on contratos_adesao for select to authenticated using (
  tem_acesso_global() or pode_regional(regional_id) or cliente_id = auth_cliente_id()
);
create policy ca_write on contratos_adesao for all to authenticated
  using (tem_acesso_global() or pode_regional(regional_id))
  with check (tem_acesso_global() or pode_regional(regional_id));

create policy vist_select on vistorias for select to authenticated using (
  exists (select 1 from veiculos v where v.id = veiculo_id and (pode_regional(v.regional_id) or v.cliente_id = auth_cliente_id()))
);
create policy vist_write on vistorias for all to authenticated using (
  exists (select 1 from veiculos v where v.id = veiculo_id and pode_regional(v.regional_id))
) with check (
  exists (select 1 from veiculos v where v.id = veiculo_id and pode_regional(v.regional_id))
);

create policy vanx_select on vistoria_anexos for select to authenticated using (
  exists (select 1 from vistorias vs join veiculos v on v.id = vs.veiculo_id
          where vs.id = vistoria_id and (pode_regional(v.regional_id) or v.cliente_id = auth_cliente_id()))
);
create policy vanx_write on vistoria_anexos for all to authenticated using (
  exists (select 1 from vistorias vs join veiculos v on v.id = vs.veiculo_id
          where vs.id = vistoria_id and pode_regional(v.regional_id))
) with check (
  exists (select 1 from vistorias vs join veiculos v on v.id = vs.veiculo_id
          where vs.id = vistoria_id and pode_regional(v.regional_id))
);

grant select, insert, update, delete on veiculo_produtos, tipos_alerta, veiculo_alertas,
  contratos_adesao, vistorias, vistoria_anexos to authenticated;

-- ============================================================================
-- SEED: alertas reutilizaveis padrao
-- ============================================================================
insert into tipos_alerta (nome, descricao, severidade) values
  ('Falta de documentos', 'Documentacao pendente (CRLV, CNH, etc.)', 'ALTA'),
  ('Atualizar cadastro',  'Dados cadastrais desatualizados', 'MEDIA'),
  ('Pendencia financeira','Titulos em aberto/vencidos', 'ALTA'),
  ('Vistoria pendente',   'Vistoria inicial ou periodica pendente', 'MEDIA'),
  ('Veiculo alienado',    'Veiculo com alienacao/gravame', 'BAIXA')
on conflict (nome) do nothing;
