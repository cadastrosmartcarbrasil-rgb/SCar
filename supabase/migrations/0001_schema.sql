-- ============================================================================
-- SCar :: 0001_schema.sql
-- Schema base: extensoes, enums, tabelas, relacionamentos e indices.
-- Banco: PostgreSQL (Supabase). Dimensionado para 10.000+ veiculos ativos.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensoes
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";       -- busca textual (placas, nomes)
create extension if not exists "unaccent";      -- normalizacao de acentos

-- ----------------------------------------------------------------------------
-- Enumeracoes (Enums)
-- ----------------------------------------------------------------------------
create type papel_usuario as enum (
  'admin', 'gestor_regional', 'consultor_vendas', 'financeiro', 'sinistro', 'cotador'
);

create type tipo_pessoa       as enum ('PF', 'PJ');
create type status_cliente    as enum ('ativo', 'inadimplente', 'cancelado');
create type uso_veiculo       as enum ('passeio', 'app', 'comercial');
create type status_veiculo    as enum ('ativo', 'suspenso', 'baixado');

create type status_titulo     as enum ('pendente', 'pago', 'cancelado', 'vencido');
create type tipo_movimentacao as enum ('RECEITA', 'DESPESA');
create type tipo_categoria_dre as enum ('RECEITA', 'CUSTO_VARIAVEL', 'DESPESA_FIXA');
create type status_comissao   as enum ('pendente', 'pago');

create type tipo_evento as enum ('ROUBO', 'FURTO', 'COLISAO', 'TERCEIROS', 'GUINCHO');
create type status_evento as enum (
  'ABERTO', 'EM_ANALISE', 'COTACAO_PECAS', 'REPARO', 'CONCLUIDO', 'NEGADO'
);
create type tipo_documento_anexo as enum (
  'FOTO_AVARIA', 'BOLETIM_OCORRENCIA', 'CNH', 'CRLV', 'NOTA_FISCAL'
);
create type status_cotacao as enum ('EM_ABERTO', 'APROVADA', 'REJEITADA');
create type codigo_template as enum ('BOAS_VINDAS', 'LEMBRETE_BOLETO', 'NOVO_EVENTO');

-- ----------------------------------------------------------------------------
-- Utilitario: touch de updated_at
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- MODULO 1 :: Atores e Organizacao
-- ============================================================================

create table regionais (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  cnpj           text unique,
  endereco       jsonb not null default '{}'::jsonb,
  responsavel_id uuid,                       -- FK adicionada apos usuarios (ciclo)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Perfis de usuarios internos, vinculados 1:1 a auth.users do Supabase.
create table usuarios (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  email       text not null unique,
  papel       papel_usuario not null default 'consultor_vendas',
  regional_id uuid references regionais(id) on delete set null,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table regionais
  add constraint regionais_responsavel_fk
  foreign key (responsavel_id) references usuarios(id) on delete set null;

create table vendedores (
  id                       uuid primary key default gen_random_uuid(),
  usuario_id               uuid not null unique references usuarios(id) on delete cascade,
  regional_id              uuid references regionais(id) on delete set null,
  taxa_comissao_adesao     numeric(6,4) not null default 0,   -- ex.: 0.1000 = 10%
  taxa_comissao_recorrente numeric(6,4) not null default 0,
  ativo                    boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table clientes (
  id                uuid primary key default gen_random_uuid(),
  -- vinculo opcional com auth.users para o Portal do Associado (login CPF/senha)
  auth_user_id      uuid unique references auth.users(id) on delete set null,
  tipo_pessoa       tipo_pessoa not null,
  nome_razao_social text not null,
  cpf_cnpj          text not null unique,
  rg_ie             text,
  email             text,
  telefone          text,
  endereco          jsonb not null default '{}'::jsonb,
  status            status_cliente not null default 'ativo',
  regional_id       uuid references regionais(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================================
-- MODULO 2 :: Frota e Protecao
-- ============================================================================

create table planos_protecao (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null,
  taxa_administrativa numeric(10,2) not null default 0,
  cota_participacao   numeric(10,2) not null default 0,
  coberturas          jsonb not null default '{}'::jsonb,
  ativo               boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table veiculos (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references clientes(id) on delete restrict,
  placa             text not null unique,
  chassi            text unique,
  renavam           text unique,
  marca             text,
  modelo            text,
  ano_fabricacao    smallint,
  ano_modelo        smallint,
  cor               text,
  uso               uso_veiculo not null default 'passeio',
  valor_fipe        numeric(12,2),
  regional_id       uuid references regionais(id) on delete set null,
  vendedor_id       uuid references vendedores(id) on delete set null,
  plano_protecao_id uuid references planos_protecao(id) on delete set null,
  status            status_veiculo not null default 'ativo',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================================
-- MODULO 3 :: Financeiro e Integracao Bancaria
-- ============================================================================

create table categorias_dre (
  id                 uuid primary key default gen_random_uuid(),
  codigo_estruturado text not null unique,   -- ex.: '1.1.01'
  nome               text not null,
  tipo               tipo_categoria_dre not null,
  ativo              boolean not null default true,
  created_at         timestamptz not null default now()
);

create table titulos_financeiros (
  id                    uuid primary key default gen_random_uuid(),
  cliente_id            uuid not null references clientes(id) on delete restrict,
  veiculo_id            uuid references veiculos(id) on delete set null,
  valor                 numeric(12,2) not null check (valor >= 0),
  data_vencimento       date not null,
  data_pagamento        date,
  valor_pago            numeric(12,2),
  status                status_titulo not null default 'pendente',
  linha_digitavel       text,
  nosso_numero          text,
  url_boleto            text,
  gateway_transacao_id  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table movimentacoes_caixa (
  id               uuid primary key default gen_random_uuid(),
  tipo             tipo_movimentacao not null,
  categoria_dre_id uuid references categorias_dre(id) on delete set null,
  descricao        text,
  valor            numeric(12,2) not null check (valor >= 0),
  data_competencia date not null,
  data_caixa       date,
  status           text not null default 'pendente',  -- pendente | liquidado | cancelado
  regional_id      uuid references regionais(id) on delete set null,
  comprovante_url  text,
  titulo_id        uuid references titulos_financeiros(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table comissoes_vendas (
  id               uuid primary key default gen_random_uuid(),
  vendedor_id      uuid not null references vendedores(id) on delete restrict,
  veiculo_id       uuid references veiculos(id) on delete set null,
  titulo_id        uuid references titulos_financeiros(id) on delete set null,
  valor_comissao   numeric(12,2) not null default 0,
  is_adesao        boolean not null default false,   -- true = 1a parcela (adesao)
  status_pagamento status_comissao not null default 'pendente',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- evita comissao duplicada para o mesmo titulo
  unique (titulo_id)
);

-- ============================================================================
-- MODULO 4 :: Eventos (Sinistros) e Workflow de Protocolos
-- ============================================================================

create table eventos_sinistro (
  id               uuid primary key default gen_random_uuid(),
  numero_protocolo text unique,             -- gerado por trigger: EVT-YYYYMMDD-XXXX
  veiculo_id       uuid not null references veiculos(id) on delete restrict,
  cliente_id       uuid not null references clientes(id) on delete restrict,
  data_ocorrencia  date not null,
  tipo_evento      tipo_evento not null,
  descricao        text,
  status           status_evento not null default 'ABERTO',
  operador_atual_id uuid references usuarios(id) on delete set null,
  regional_id      uuid references regionais(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table historico_protocolo (
  id                 uuid primary key default gen_random_uuid(),
  evento_id          uuid not null references eventos_sinistro(id) on delete cascade,
  usuario_origem_id  uuid references usuarios(id) on delete set null,
  usuario_destino_id uuid references usuarios(id) on delete set null,
  acao_realizada     text not null,
  status_anterior    status_evento,
  status_novo        status_evento,
  observacoes        text,
  created_at         timestamptz not null default now()
);

create table anexos_evento (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid not null references eventos_sinistro(id) on delete cascade,
  tipo_documento tipo_documento_anexo not null,
  arquivo_url    text not null,             -- path no bucket privado do Storage
  nome_original  text,
  tamanho_bytes  bigint,
  uploaded_by    uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default now()
);

create table cotacoes_pecas (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid not null references eventos_sinistro(id) on delete cascade,
  fornecedor_nome text not null,
  cnpj           text,
  valor_total    numeric(12,2) not null default 0,
  status         status_cotacao not null default 'EM_ABERTO',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table itens_cotacao (
  id             uuid primary key default gen_random_uuid(),
  cotacao_id     uuid not null references cotacoes_pecas(id) on delete cascade,
  descricao_peca text not null,
  quantidade     numeric(10,2) not null default 1 check (quantidade > 0),
  valor_unitario numeric(12,2) not null default 0 check (valor_unitario >= 0),
  created_at     timestamptz not null default now()
);

create table notas_fiscais_evento (
  id                  uuid primary key default gen_random_uuid(),
  evento_id           uuid not null references eventos_sinistro(id) on delete cascade,
  fornecedor_id       uuid,               -- referencia livre; fornecedor pode nao estar cadastrado
  fornecedor_nome     text,
  chave_acesso_nfe    text unique,
  valor_nota          numeric(12,2) not null default 0,
  data_emissao        date,
  arquivo_xml_pdf_url text,
  created_at          timestamptz not null default now()
);

-- ============================================================================
-- MODULO 5 :: Comunicacao
-- ============================================================================

create table email_templates (
  id         uuid primary key default gen_random_uuid(),
  codigo     codigo_template not null unique,
  assunto    text not null,
  corpo_html text not null,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- INDICES (performance para 10k+ veiculos e alto volume de titulos/eventos)
-- ============================================================================

-- Atores / organizacao
create index idx_usuarios_regional          on usuarios (regional_id);
create index idx_vendedores_regional        on vendedores (regional_id);
create index idx_clientes_regional          on clientes (regional_id);
create index idx_clientes_status            on clientes (status);
create index idx_clientes_nome_trgm         on clientes using gin (nome_razao_social gin_trgm_ops);

-- Frota
create index idx_veiculos_cliente           on veiculos (cliente_id);
create index idx_veiculos_regional          on veiculos (regional_id);
create index idx_veiculos_vendedor          on veiculos (vendedor_id);
create index idx_veiculos_status            on veiculos (status);
create index idx_veiculos_placa_trgm        on veiculos using gin (placa gin_trgm_ops);
-- Indice parcial: dashboard consulta constantemente "veiculos ativos"
create index idx_veiculos_ativos            on veiculos (regional_id) where status = 'ativo';

-- Financeiro
create index idx_titulos_cliente            on titulos_financeiros (cliente_id);
create index idx_titulos_veiculo            on titulos_financeiros (veiculo_id);
create index idx_titulos_status             on titulos_financeiros (status);
create index idx_titulos_vencimento         on titulos_financeiros (data_vencimento);
-- Indice parcial para cobranca/inadimplencia
create index idx_titulos_pendentes          on titulos_financeiros (data_vencimento)
  where status in ('pendente', 'vencido');
create index idx_mov_caixa_competencia      on movimentacoes_caixa (data_competencia);
create index idx_mov_caixa_categoria        on movimentacoes_caixa (categoria_dre_id);
create index idx_mov_caixa_regional         on movimentacoes_caixa (regional_id);
create index idx_comissoes_vendedor         on comissoes_vendas (vendedor_id);
create index idx_comissoes_status           on comissoes_vendas (status_pagamento);

-- Eventos / sinistros
create index idx_eventos_veiculo            on eventos_sinistro (veiculo_id);
create index idx_eventos_cliente            on eventos_sinistro (cliente_id);
create index idx_eventos_status             on eventos_sinistro (status);
create index idx_eventos_regional           on eventos_sinistro (regional_id);
create index idx_eventos_operador           on eventos_sinistro (operador_atual_id);
-- Kanban: eventos "em aberto" por regional/status
create index idx_eventos_pipeline           on eventos_sinistro (regional_id, status)
  where status <> 'CONCLUIDO' and status <> 'NEGADO';
create index idx_historico_evento           on historico_protocolo (evento_id, created_at desc);
create index idx_anexos_evento              on anexos_evento (evento_id);
create index idx_cotacoes_evento            on cotacoes_pecas (evento_id);
create index idx_itens_cotacao             on itens_cotacao (cotacao_id);
create index idx_nfe_evento                 on notas_fiscais_evento (evento_id);

-- Triggers de updated_at
create trigger trg_regionais_updated   before update on regionais           for each row execute function set_updated_at();
create trigger trg_usuarios_updated    before update on usuarios            for each row execute function set_updated_at();
create trigger trg_vendedores_updated  before update on vendedores          for each row execute function set_updated_at();
create trigger trg_clientes_updated    before update on clientes            for each row execute function set_updated_at();
create trigger trg_planos_updated      before update on planos_protecao     for each row execute function set_updated_at();
create trigger trg_veiculos_updated    before update on veiculos            for each row execute function set_updated_at();
create trigger trg_titulos_updated     before update on titulos_financeiros for each row execute function set_updated_at();
create trigger trg_movcaixa_updated    before update on movimentacoes_caixa for each row execute function set_updated_at();
create trigger trg_comissoes_updated   before update on comissoes_vendas    for each row execute function set_updated_at();
create trigger trg_eventos_updated     before update on eventos_sinistro    for each row execute function set_updated_at();
create trigger trg_cotacoes_updated    before update on cotacoes_pecas      for each row execute function set_updated_at();
create trigger trg_templates_updated   before update on email_templates     for each row execute function set_updated_at();
