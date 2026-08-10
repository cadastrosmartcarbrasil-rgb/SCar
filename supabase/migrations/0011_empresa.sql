-- ============================================================================
-- SCar :: 0011_empresa.sql
-- Cadastro institucional da Empresa/Associacao: identidade visual, dados
-- juridicos, documentos anexos, diretoria e mandatos.
-- ============================================================================

create type mandato_status as enum ('VIGENTE', 'EXPIRADO', 'EM_RENOVACAO');

-- ----------------------------------------------------------------------------
-- Empresa (dados cadastrais, contatos, endereco, identidade visual)
-- ----------------------------------------------------------------------------
create table empresa (
  id                    uuid primary key default gen_random_uuid(),
  razao_social          text not null,
  nome_fantasia         text,
  cnpj                  text,
  inscricao_estadual    text,
  ie_isento             boolean not null default false,
  inscricao_municipal   text,
  im_isento             boolean not null default false,
  site                  text,
  email_principal       text,
  email_financeiro      text,
  email_juridico        text,
  telefone_fixo         text,
  whatsapp_principal    text,
  whatsapp_suporte      text,
  endereco              jsonb not null default '{}'::jsonb,  -- cep, logradouro, numero, complemento, bairro, cidade, uf
  logo_url              text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint chk_empresa_cnpj check (cnpj is null or validar_cnpj(cnpj))
);
create trigger trg_empresa_updated before update on empresa for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Mandatos da diretoria
-- ----------------------------------------------------------------------------
create table mandatos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresa(id) on delete cascade,
  data_inicio date not null,
  data_fim    date not null,
  status      mandato_status not null default 'VIGENTE',
  observacoes text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint chk_mandato_datas check (data_fim > data_inicio)
);
create index idx_mandatos_empresa on mandatos (empresa_id);
create trigger trg_mandatos_updated before update on mandatos for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Membros da diretoria (composicao do mandato)
-- ----------------------------------------------------------------------------
create table diretoria (
  id            uuid primary key default gen_random_uuid(),
  mandato_id    uuid not null references mandatos(id) on delete cascade,
  cargo         text not null,                 -- Presidente, Tesoureiro, Vice-Presidente, Secretario...
  nome_completo text not null,
  cpf           text,
  telefone      text,
  whatsapp      text,
  email         text,
  created_at    timestamptz not null default now(),
  constraint chk_diretoria_cpf check (cpf is null or validar_cpf(cpf))
);
create index idx_diretoria_mandato on diretoria (mandato_id);

-- ----------------------------------------------------------------------------
-- Documentos anexos da empresa
-- ----------------------------------------------------------------------------
create table empresa_documentos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresa(id) on delete cascade,
  nome_arquivo   text not null,
  tipo_documento text not null,                -- Estatuto, Contrato Social, Cartao CNPJ, Ata, Comprovante...
  url_arquivo    text not null,                -- path no bucket privado
  tamanho_bytes  bigint,
  data_upload    timestamptz not null default now()
);
create index idx_empresa_docs on empresa_documentos (empresa_id);

-- ----------------------------------------------------------------------------
-- Regra: marca mandatos vencidos como EXPIRADO (para cron/agendador).
-- ----------------------------------------------------------------------------
create or replace function atualizar_mandatos_expirados()
returns integer
language sql
as $$
  with upd as (
    update mandatos set status = 'EXPIRADO'
     where status = 'VIGENTE' and data_fim < current_date
     returning 1
  )
  select count(*)::int from upd;
$$;

-- ============================================================================
-- Storage: bucket publico para logo, privado para documentos
-- ============================================================================
insert into storage.buckets (id, name, public) values ('empresa', 'empresa', true)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('empresa-docs', 'empresa-docs', false)
on conflict (id) do nothing;

-- ============================================================================
-- RLS
-- ============================================================================
alter table empresa            enable row level security;
alter table mandatos           enable row level security;
alter table diretoria          enable row level security;
alter table empresa_documentos enable row level security;

create policy empresa_select on empresa for select to authenticated using (is_staff());
create policy empresa_write  on empresa for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());
create policy mandatos_select on mandatos for select to authenticated using (is_staff());
create policy mandatos_write  on mandatos for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());
create policy diretoria_select on diretoria for select to authenticated using (is_staff());
create policy diretoria_write  on diretoria for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());
create policy empdocs_select on empresa_documentos for select to authenticated using (is_staff());
create policy empdocs_write  on empresa_documentos for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());

grant select, insert, update, delete on empresa, mandatos, diretoria, empresa_documentos to authenticated;

-- Storage policies: logo (bucket publico) escrita por global; docs (privado) por staff.
create policy storage_empresa_write on storage.objects for all to authenticated
  using (bucket_id = 'empresa' and tem_acesso_global())
  with check (bucket_id = 'empresa' and tem_acesso_global());
create policy storage_empdocs_all on storage.objects for all to authenticated
  using (bucket_id = 'empresa-docs' and is_staff())
  with check (bucket_id = 'empresa-docs' and tem_acesso_global());
