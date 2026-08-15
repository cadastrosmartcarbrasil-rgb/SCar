-- SCar :: schema.sql (consolidado) - cole no Supabase SQL Editor.

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0001_schema.sql >>>>>>>>>>>>>>>>>>>>>>>>

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

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0002_functions_triggers.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- SCar :: 0002_functions_triggers.sql
-- Regras de negocio em PL/pgSQL: protocolo, tramitacao, comissoes e DRE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers de autenticacao (usados tambem pelas policies de RLS em 0003).
-- SECURITY DEFINER + search_path fixo para leitura segura de usuarios.
-- ----------------------------------------------------------------------------
create or replace function auth_papel()
returns papel_usuario
language sql
stable
security definer
set search_path = public
as $$
  select papel from public.usuarios where id = auth.uid();
$$;

create or replace function auth_regional_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select regional_id from public.usuarios where id = auth.uid();
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_papel() = 'admin', false);
$$;

-- id do cliente vinculado ao usuario logado (Portal do Associado)
create or replace function auth_cliente_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.clientes where auth_user_id = auth.uid();
$$;

-- ============================================================================
-- 3.1 :: Geracao do Numero de Protocolo (EVT-YYYYMMDD-XXXX)
-- Sequencial diario, unico. XXXX reinicia a cada dia.
-- ============================================================================
create or replace function fn_gerar_numero_protocolo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data   text := to_char(coalesce(new.created_at, now()), 'YYYYMMDD');
  v_seq    integer;
begin
  if new.numero_protocolo is not null then
    return new;
  end if;

  -- Lock consultivo por dia para evitar corrida na numeracao concorrente.
  perform pg_advisory_xact_lock(hashtext('protocolo_' || v_data));

  select coalesce(max(
           (regexp_replace(numero_protocolo, '^EVT-\d{8}-', ''))::integer
         ), 0) + 1
    into v_seq
    from eventos_sinistro
   where numero_protocolo like 'EVT-' || v_data || '-%';

  new.numero_protocolo := 'EVT-' || v_data || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

create trigger trg_gerar_protocolo
  before insert on eventos_sinistro
  for each row execute function fn_gerar_numero_protocolo();

-- Registra automaticamente a abertura no historico do protocolo.
create or replace function fn_log_abertura_protocolo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into historico_protocolo (
    evento_id, usuario_origem_id, usuario_destino_id,
    acao_realizada, status_anterior, status_novo, observacoes
  ) values (
    new.id, auth.uid(), new.operador_atual_id,
    'ABERTURA_PROTOCOLO', null, new.status,
    'Protocolo ' || new.numero_protocolo || ' criado.'
  );
  return new;
end;
$$;

create trigger trg_log_abertura_protocolo
  after insert on eventos_sinistro
  for each row execute function fn_log_abertura_protocolo();

-- ============================================================================
-- 3.2 :: Tramitacao de Protocolos
-- transferir_protocolo(evento, destino, parecer[, novo_status])
-- Atualiza operador_atual_id e grava o historico atomicamente.
-- ============================================================================
create or replace function transferir_protocolo(
  p_evento_id          uuid,
  p_usuario_destino_id uuid,
  p_parecer            text default null,
  p_novo_status        status_evento default null
)
returns eventos_sinistro
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origem   uuid := auth.uid();
  v_atual    eventos_sinistro;
  v_status_anterior status_evento;
  v_status_novo status_evento;
begin
  select * into v_atual from eventos_sinistro where id = p_evento_id for update;
  if not found then
    raise exception 'Evento % nao encontrado', p_evento_id using errcode = 'no_data_found';
  end if;

  v_status_anterior := v_atual.status;                    -- guarda status antes do update
  v_status_novo := coalesce(p_novo_status, v_atual.status);

  update eventos_sinistro
     set operador_atual_id = p_usuario_destino_id,
         status            = v_status_novo
   where id = p_evento_id
   returning * into v_atual;

  insert into historico_protocolo (
    evento_id, usuario_origem_id, usuario_destino_id,
    acao_realizada, status_anterior, status_novo, observacoes
  ) values (
    p_evento_id, v_origem, p_usuario_destino_id,
    'TRANSFERENCIA', v_status_anterior, v_status_novo, p_parecer
  );

  return v_atual;
end;
$$;

-- ============================================================================
-- 3.3 :: Calculo Automatico de Comissoes
-- Ao liquidar um titulo (status -> 'pago'), gera a comissao do vendedor
-- vinculado ao veiculo. Primeira parcela paga do veiculo = adesao.
-- ============================================================================
create or replace function fn_calcular_comissao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor   vendedores;
  v_is_adesao  boolean;
  v_taxa       numeric(6,4);
  v_base       numeric(12,2);
begin
  -- dispara apenas na transicao para 'pago' (ignora se ja estava pago)
  if new.status <> 'pago' or old.status is not distinct from 'pago' then
    return new;
  end if;
  if new.veiculo_id is null then
    return new;
  end if;

  select v.* into v_vendedor
    from veiculos ve
    join vendedores v on v.id = ve.vendedor_id
   where ve.id = new.veiculo_id;

  if not found then
    return new;  -- veiculo sem vendedor: nada a comissionar
  end if;

  -- adesao = primeiro titulo pago deste veiculo
  select not exists (
    select 1 from comissoes_vendas c
    where c.veiculo_id = new.veiculo_id and c.is_adesao = true
  ) into v_is_adesao;

  v_taxa := case when v_is_adesao
                 then v_vendedor.taxa_comissao_adesao
                 else v_vendedor.taxa_comissao_recorrente end;

  v_base := coalesce(new.valor_pago, new.valor);

  insert into comissoes_vendas (
    vendedor_id, veiculo_id, titulo_id, valor_comissao, is_adesao, status_pagamento
  ) values (
    v_vendedor.id, new.veiculo_id, new.id, round(v_base * v_taxa, 2), v_is_adesao, 'pendente'
  )
  on conflict (titulo_id) do nothing;   -- idempotente

  return new;
end;
$$;

create trigger trg_calcular_comissao
  after update of status on titulos_financeiros
  for each row execute function fn_calcular_comissao();

-- Marca titulos vencidos (chamado por cron/agendador do Supabase, opcional).
create or replace function marcar_titulos_vencidos()
returns integer
language sql
as $$
  with upd as (
    update titulos_financeiros
       set status = 'vencido'
     where status = 'pendente' and data_vencimento < current_date
     returning 1
  )
  select count(*)::int from upd;
$$;

-- ============================================================================
-- 3.4 :: DRE (Demonstracao do Resultado do Exercicio)
-- Agrega receitas, custos variaveis (inclui custo de sinistro) e despesas
-- fixas por categoria, no periodo informado. Filtro opcional por regional.
-- ============================================================================
create or replace function gerar_dre(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null
)
returns table (
  grupo              tipo_categoria_dre,
  categoria_codigo   text,
  categoria_nome     text,
  total              numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    -- Movimentacoes de caixa classificadas por categoria DRE
    select cat.tipo  as grupo,
           cat.codigo_estruturado as categoria_codigo,
           cat.nome  as categoria_nome,
           case when m.tipo = 'RECEITA' then m.valor else -m.valor end as valor
      from movimentacoes_caixa m
      join categorias_dre cat on cat.id = m.categoria_dre_id
     where m.data_competencia between p_data_inicio and p_data_fim
       and m.status <> 'cancelado'
       and (p_regional_id is null or m.regional_id = p_regional_id)

    union all

    -- Receita recorrente reconhecida por titulos pagos (caso nao lancados no caixa)
    select 'RECEITA'::tipo_categoria_dre,
           '1.1.00', 'Receita de Mensalidades (Titulos)',
           t.valor_pago
      from titulos_financeiros t
      join veiculos v on v.id = t.veiculo_id
     where t.status = 'pago'
       and t.data_pagamento between p_data_inicio and p_data_fim
       and not exists (select 1 from movimentacoes_caixa mc where mc.titulo_id = t.id)
       and (p_regional_id is null or v.regional_id = p_regional_id)

    union all

    -- Custo de sinistro: notas fiscais de eventos (custo variavel)
    select 'CUSTO_VARIAVEL'::tipo_categoria_dre,
           '3.1.00', 'Custo com Sinistros (Notas Fiscais)',
           -nf.valor_nota
      from notas_fiscais_evento nf
      join eventos_sinistro e on e.id = nf.evento_id
     where nf.data_emissao between p_data_inicio and p_data_fim
       and (p_regional_id is null or e.regional_id = p_regional_id)
  )
  select grupo, categoria_codigo, categoria_nome, round(sum(valor), 2) as total
    from base
   group by grupo, categoria_codigo, categoria_nome
   order by grupo, categoria_codigo;
$$;

-- Resumo consolidado do DRE (receita liquida, margem, resultado).
create or replace function gerar_dre_resumo(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null
)
returns table (
  receita_bruta   numeric,
  custo_variavel  numeric,
  despesa_fixa    numeric,
  resultado_liquido numeric,
  margem_percentual numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with d as (
    select grupo, total from gerar_dre(p_data_inicio, p_data_fim, p_regional_id)
  ),
  agg as (
    select
      coalesce(sum(total) filter (where grupo = 'RECEITA'), 0)          as receita,
      coalesce(sum(total) filter (where grupo = 'CUSTO_VARIAVEL'), 0)   as custo,
      coalesce(sum(total) filter (where grupo = 'DESPESA_FIXA'), 0)     as despesa
    from d
  )
  select
    receita,
    custo,
    despesa,
    (receita + custo + despesa) as resultado_liquido,
    case when receita <> 0
         then round(((receita + custo + despesa) / receita) * 100, 2)
         else 0 end as margem_percentual
  from agg;
$$;

-- ============================================================================
-- Recalculo do valor_total de uma cotacao a partir dos itens.
-- ============================================================================
create or replace function fn_recalcular_cotacao()
returns trigger
language plpgsql
as $$
declare
  v_cotacao_id uuid := coalesce(new.cotacao_id, old.cotacao_id);
begin
  update cotacoes_pecas
     set valor_total = coalesce((
           select sum(quantidade * valor_unitario)
             from itens_cotacao where cotacao_id = v_cotacao_id
         ), 0)
   where id = v_cotacao_id;
  return null;
end;
$$;

create trigger trg_recalcular_cotacao
  after insert or update or delete on itens_cotacao
  for each row execute function fn_recalcular_cotacao();

-- ============================================================================
-- Provisiona perfil em public.usuarios ao criar auth.users (signup interno).
-- Metadados esperados em raw_user_meta_data: nome, papel, regional_id.
-- ============================================================================
create or replace function fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- So cria perfil interno se o metadata indicar papel (evita criar para associados do portal).
  if new.raw_user_meta_data ? 'papel' then
    insert into public.usuarios (id, nome, email, papel, regional_id)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'nome', new.email),
      new.email,
      (new.raw_user_meta_data->>'papel')::papel_usuario,
      nullif(new.raw_user_meta_data->>'regional_id', '')::uuid
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function fn_handle_new_user();

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0003_rls.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- SCar :: 0003_rls.sql
-- Row Level Security. Modelo multi-tenant por regional + Portal do Associado.
--
-- Papeis com acesso GLOBAL (todas as regionais): admin, financeiro.
-- Papeis com acesso REGIONAL: gestor_regional, consultor_vendas, sinistro, cotador.
-- Associados (Portal): so enxergam os proprios dados (clientes.auth_user_id).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers de escopo
-- ----------------------------------------------------------------------------
create or replace function is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.usuarios where id = auth.uid()); $$;

create or replace function tem_acesso_global()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(auth_papel() in ('admin', 'financeiro'), false); $$;

-- true se o staff logado pode operar sobre a regional informada
create or replace function pode_regional(p_regional uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select tem_acesso_global()
      or (is_staff() and p_regional is not null and auth_regional_id() = p_regional);
$$;

-- ----------------------------------------------------------------------------
-- Habilita RLS em todas as tabelas
-- ----------------------------------------------------------------------------
alter table regionais            enable row level security;
alter table usuarios             enable row level security;
alter table vendedores           enable row level security;
alter table clientes             enable row level security;
alter table planos_protecao      enable row level security;
alter table veiculos             enable row level security;
alter table categorias_dre       enable row level security;
alter table titulos_financeiros  enable row level security;
alter table movimentacoes_caixa  enable row level security;
alter table comissoes_vendas     enable row level security;
alter table eventos_sinistro     enable row level security;
alter table historico_protocolo  enable row level security;
alter table anexos_evento        enable row level security;
alter table cotacoes_pecas       enable row level security;
alter table itens_cotacao        enable row level security;
alter table notas_fiscais_evento enable row level security;
alter table email_templates      enable row level security;

-- ============================================================================
-- REGIONAIS
-- ============================================================================
create policy regionais_select on regionais for select to authenticated
  using (tem_acesso_global() or id = auth_regional_id());
create policy regionais_write on regionais for all to authenticated
  using (is_admin()) with check (is_admin());

-- ============================================================================
-- USUARIOS  (cada um le a si; admin/gestor gerenciam)
-- ============================================================================
create policy usuarios_select_self on usuarios for select to authenticated
  using (id = auth.uid() or tem_acesso_global()
         or (auth_papel() = 'gestor_regional' and regional_id = auth_regional_id()));
create policy usuarios_update_self on usuarios for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy usuarios_admin_write on usuarios for all to authenticated
  using (is_admin()) with check (is_admin());

-- ============================================================================
-- PLANOS DE PROTECAO  (catalogo: leitura para staff, escrita admin)
-- ============================================================================
create policy planos_select on planos_protecao for select to authenticated
  using (is_staff());
create policy planos_write on planos_protecao for all to authenticated
  using (is_admin()) with check (is_admin());

-- ============================================================================
-- VENDEDORES
-- ============================================================================
create policy vendedores_select on vendedores for select to authenticated
  using (pode_regional(regional_id) or usuario_id = auth.uid());
create policy vendedores_write on vendedores for all to authenticated
  using (is_admin() or (auth_papel() = 'gestor_regional' and regional_id = auth_regional_id()))
  with check (is_admin() or (auth_papel() = 'gestor_regional' and regional_id = auth_regional_id()));

-- ============================================================================
-- CLIENTES  (staff por regional + Portal: o proprio associado)
-- ============================================================================
create policy clientes_select on clientes for select to authenticated
  using (pode_regional(regional_id) or auth_user_id = auth.uid());
create policy clientes_write on clientes for all to authenticated
  using (pode_regional(regional_id)) with check (pode_regional(regional_id));

-- ============================================================================
-- VEICULOS  (staff por regional + Portal: veiculos do associado)
-- ============================================================================
create policy veiculos_select on veiculos for select to authenticated
  using (
    pode_regional(regional_id)
    or cliente_id = auth_cliente_id()
  );
create policy veiculos_write on veiculos for all to authenticated
  using (pode_regional(regional_id)) with check (pode_regional(regional_id));

-- ============================================================================
-- FINANCEIRO
-- ============================================================================
-- titulos: staff (global/regional via cliente) + Portal (proprios titulos)
create policy titulos_select on titulos_financeiros for select to authenticated
  using (
    tem_acesso_global()
    or cliente_id = auth_cliente_id()
    or exists (select 1 from clientes c
               where c.id = cliente_id and pode_regional(c.regional_id))
  );
create policy titulos_write on titulos_financeiros for all to authenticated
  using (tem_acesso_global()
         or exists (select 1 from clientes c where c.id = cliente_id and pode_regional(c.regional_id)))
  with check (tem_acesso_global()
         or exists (select 1 from clientes c where c.id = cliente_id and pode_regional(c.regional_id)));

-- categorias_dre: catalogo contabil, leitura staff, escrita global
create policy categorias_select on categorias_dre for select to authenticated
  using (is_staff());
create policy categorias_write on categorias_dre for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

-- movimentacoes_caixa: acesso global ou regional
create policy movcaixa_select on movimentacoes_caixa for select to authenticated
  using (pode_regional(regional_id));
create policy movcaixa_write on movimentacoes_caixa for all to authenticated
  using (pode_regional(regional_id)) with check (pode_regional(regional_id));

-- comissoes: staff financeiro/global; o proprio vendedor le as suas
create policy comissoes_select on comissoes_vendas for select to authenticated
  using (
    tem_acesso_global()
    or exists (select 1 from vendedores v
               where v.id = vendedor_id
                 and (v.usuario_id = auth.uid() or pode_regional(v.regional_id)))
  );
create policy comissoes_write on comissoes_vendas for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

-- ============================================================================
-- EVENTOS / SINISTROS
-- ============================================================================
create policy eventos_select on eventos_sinistro for select to authenticated
  using (
    pode_regional(regional_id)
    or cliente_id = auth_cliente_id()
  );
-- Portal pode ABRIR evento para o proprio veiculo; staff cria por regional
create policy eventos_insert on eventos_sinistro for insert to authenticated
  with check (
    pode_regional(regional_id)
    or cliente_id = auth_cliente_id()
  );
create policy eventos_update on eventos_sinistro for update to authenticated
  using (pode_regional(regional_id)) with check (pode_regional(regional_id));
create policy eventos_delete on eventos_sinistro for delete to authenticated
  using (is_admin());

-- historico: leitura conforme evento; escrita por staff da regional (ou via RPC)
create policy historico_select on historico_protocolo for select to authenticated
  using (exists (select 1 from eventos_sinistro e
                 where e.id = evento_id
                   and (pode_regional(e.regional_id) or e.cliente_id = auth_cliente_id())));
create policy historico_insert on historico_protocolo for insert to authenticated
  with check (exists (select 1 from eventos_sinistro e
                      where e.id = evento_id and pode_regional(e.regional_id)));

-- anexos: staff da regional do evento + associado dono do evento
create policy anexos_select on anexos_evento for select to authenticated
  using (exists (select 1 from eventos_sinistro e
                 where e.id = evento_id
                   and (pode_regional(e.regional_id) or e.cliente_id = auth_cliente_id())));
create policy anexos_insert on anexos_evento for insert to authenticated
  with check (exists (select 1 from eventos_sinistro e
                      where e.id = evento_id
                        and (pode_regional(e.regional_id) or e.cliente_id = auth_cliente_id())));
create policy anexos_delete on anexos_evento for delete to authenticated
  using (exists (select 1 from eventos_sinistro e
                 where e.id = evento_id and pode_regional(e.regional_id)));

-- cotacoes e itens: staff da regional do evento
create policy cotacoes_all on cotacoes_pecas for all to authenticated
  using (exists (select 1 from eventos_sinistro e where e.id = evento_id and pode_regional(e.regional_id)))
  with check (exists (select 1 from eventos_sinistro e where e.id = evento_id and pode_regional(e.regional_id)));
create policy itens_all on itens_cotacao for all to authenticated
  using (exists (select 1 from cotacoes_pecas c join eventos_sinistro e on e.id = c.evento_id
                 where c.id = cotacao_id and pode_regional(e.regional_id)))
  with check (exists (select 1 from cotacoes_pecas c join eventos_sinistro e on e.id = c.evento_id
                 where c.id = cotacao_id and pode_regional(e.regional_id)));

-- notas fiscais do evento
create policy nfe_all on notas_fiscais_evento for all to authenticated
  using (exists (select 1 from eventos_sinistro e where e.id = evento_id and pode_regional(e.regional_id)))
  with check (exists (select 1 from eventos_sinistro e where e.id = evento_id and pode_regional(e.regional_id)));

-- ============================================================================
-- EMAIL TEMPLATES  (leitura staff, escrita global)
-- ============================================================================
create policy templates_select on email_templates for select to authenticated
  using (is_staff());
create policy templates_write on email_templates for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

-- ============================================================================
-- STORAGE :: bucket privado 'sinistros-docs'
-- Estrutura de path esperada: {evento_id}/{arquivo}
-- Acesso liberado a quem enxerga o evento (staff da regional ou associado dono).
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('sinistros-docs', 'sinistros-docs', false)
on conflict (id) do nothing;

create policy storage_sinistros_select on storage.objects for select to authenticated
  using (
    bucket_id = 'sinistros-docs'
    and exists (
      select 1 from eventos_sinistro e
      where e.id = (split_part(name, '/', 1))::uuid
        and (pode_regional(e.regional_id) or e.cliente_id = auth_cliente_id())
    )
  );

create policy storage_sinistros_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sinistros-docs'
    and exists (
      select 1 from eventos_sinistro e
      where e.id = (split_part(name, '/', 1))::uuid
        and (pode_regional(e.regional_id) or e.cliente_id = auth_cliente_id())
    )
  );

create policy storage_sinistros_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'sinistros-docs'
    and exists (
      select 1 from eventos_sinistro e
      where e.id = (split_part(name, '/', 1))::uuid and pode_regional(e.regional_id)
    )
  );

-- ============================================================================
-- GRANTS de acesso (o RLS acima e quem restringe as LINHAS; o GRANT libera a
-- TABELA). Sem GRANT, o Postgres retorna "permission denied" antes do RLS.
-- Observacao: no Supabase gerenciado esses roles ja possuem grants padrao;
-- mantemos explicito para o schema ser portavel e autoexplicativo.
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Novos objetos futuros herdam os mesmos grants.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0004_seed.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- SCar :: 0004_seed.sql
-- Dados iniciais (catalogos). Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Plano de contas / DRE
-- ----------------------------------------------------------------------------
insert into categorias_dre (codigo_estruturado, nome, tipo) values
  ('1.1.00', 'Receita de Mensalidades (Titulos)',      'RECEITA'),
  ('1.1.01', 'Receita de Adesao',                       'RECEITA'),
  ('1.2.01', 'Outras Receitas',                         'RECEITA'),
  ('3.1.00', 'Custo com Sinistros (Notas Fiscais)',     'CUSTO_VARIAVEL'),
  ('3.1.02', 'Custo de Guincho / Assistencia',          'CUSTO_VARIAVEL'),
  ('3.2.01', 'Comissoes de Vendas',                     'CUSTO_VARIAVEL'),
  ('4.1.01', 'Folha de Pagamento',                      'DESPESA_FIXA'),
  ('4.1.02', 'Aluguel e Ocupacao',                      'DESPESA_FIXA'),
  ('4.1.03', 'Software e Infraestrutura',               'DESPESA_FIXA'),
  ('4.2.01', 'Marketing',                               'DESPESA_FIXA')
on conflict (codigo_estruturado) do nothing;

-- ----------------------------------------------------------------------------
-- Planos de protecao (exemplo)
-- ----------------------------------------------------------------------------
insert into planos_protecao (nome, taxa_administrativa, cota_participacao, coberturas)
select 'Plano Essencial', 89.90, 800.00,
       '{"roubo_furto": true, "colisao": false, "terceiros": false, "guincho_km": 100, "carro_reserva": false}'::jsonb
where not exists (select 1 from planos_protecao where nome = 'Plano Essencial');

insert into planos_protecao (nome, taxa_administrativa, cota_participacao, coberturas)
select 'Plano Completo', 149.90, 1500.00,
       '{"roubo_furto": true, "colisao": true, "terceiros": true, "guincho_km": 400, "carro_reserva": true}'::jsonb
where not exists (select 1 from planos_protecao where nome = 'Plano Completo');

-- ----------------------------------------------------------------------------
-- Templates de e-mail
-- ----------------------------------------------------------------------------
insert into email_templates (codigo, assunto, corpo_html) values
  ('BOAS_VINDAS',
   'Bem-vindo(a) a Protecao Veicular SCar!',
   '<h1>Ola, {{nome}}!</h1><p>Seu veiculo <strong>{{placa}}</strong> ja esta protegido pelo plano {{plano}}.</p><p>Acesse o portal do associado para acompanhar boletos e abrir chamados.</p>'),
  ('LEMBRETE_BOLETO',
   'Seu boleto vence em breve - SCar',
   '<h1>Ola, {{nome}}</h1><p>O boleto no valor de <strong>R$ {{valor}}</strong> vence em <strong>{{vencimento}}</strong>.</p><p><a href="{{url_boleto}}">Clique aqui para pagar</a>.</p>'),
  ('NOVO_EVENTO',
   'Protocolo {{protocolo}} aberto - SCar',
   '<h1>Recebemos seu chamado</h1><p>O protocolo <strong>{{protocolo}}</strong> foi aberto para o veiculo {{placa}} e ja esta em analise pela nossa equipe.</p>')
on conflict (codigo) do nothing;

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0005_integracoes_bancarias.sql >>>>>>>>>>>>>>>>>>>>>>>>

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

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0006_associados.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- SCar :: 0006_associados.sql
-- Cadastro completo de associados: novos campos, matricula automatica,
-- novos status e validacao de CPF/CNPJ (digito verificador) no banco.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Novos valores de situacao do associado
-- ----------------------------------------------------------------------------
alter type status_cliente add value if not exists 'inativo';
alter type status_cliente add value if not exists 'suspenso';
alter type status_cliente add value if not exists 'excluido';

-- ----------------------------------------------------------------------------
-- Novos campos do associado
-- ----------------------------------------------------------------------------
alter table clientes
  add column if not exists data_nascimento date,
  add column if not exists sexo            text,
  add column if not exists nome_mae        text,
  add column if not exists email_adicional text,
  add column if not exists celular         text,
  add column if not exists matricula       text unique;

-- ----------------------------------------------------------------------------
-- Matricula sequencial automatica (6 digitos, iniciando em 001000)
-- ----------------------------------------------------------------------------
create sequence if not exists matricula_seq start 1000;

create or replace function fn_gerar_matricula()
returns trigger
language plpgsql
as $$
begin
  if new.matricula is null then
    new.matricula := lpad(nextval('matricula_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gerar_matricula on clientes;
create trigger trg_gerar_matricula
  before insert on clientes
  for each row execute function fn_gerar_matricula();

-- ----------------------------------------------------------------------------
-- Validacao de CPF (11 digitos com digito verificador)
-- ----------------------------------------------------------------------------
create or replace function validar_cpf(p text)
returns boolean
language plpgsql
immutable
as $$
declare
  cpf text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  s int; d1 int; d2 int; i int;
begin
  if length(cpf) <> 11 then return false; end if;
  if cpf ~ '^(\d)\1{10}$' then return false; end if;   -- todos os digitos iguais
  s := 0;
  for i in 1..9 loop s := s + substr(cpf, i, 1)::int * (11 - i); end loop;
  d1 := 11 - (s % 11); if d1 >= 10 then d1 := 0; end if;
  if d1 <> substr(cpf, 10, 1)::int then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + substr(cpf, i, 1)::int * (12 - i); end loop;
  d2 := 11 - (s % 11); if d2 >= 10 then d2 := 0; end if;
  if d2 <> substr(cpf, 11, 1)::int then return false; end if;
  return true;
end;
$$;

-- ----------------------------------------------------------------------------
-- Validacao de CNPJ (14 digitos com digito verificador)
-- ----------------------------------------------------------------------------
create or replace function validar_cnpj(p text)
returns boolean
language plpgsql
immutable
as $$
declare
  cnpj text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int; d1 int; d2 int; i int;
begin
  if length(cnpj) <> 14 then return false; end if;
  if cnpj ~ '^(\d)\1{13}$' then return false; end if;
  s := 0;
  for i in 1..12 loop s := s + substr(cnpj, i, 1)::int * w1[i]; end loop;
  d1 := s % 11; if d1 < 2 then d1 := 0; else d1 := 11 - d1; end if;
  if d1 <> substr(cnpj, 13, 1)::int then return false; end if;
  s := 0;
  for i in 1..13 loop s := s + substr(cnpj, i, 1)::int * w2[i]; end loop;
  d2 := s % 11; if d2 < 2 then d2 := 0; else d2 := 11 - d2; end if;
  if d2 <> substr(cnpj, 14, 1)::int then return false; end if;
  return true;
end;
$$;

create or replace function validar_documento(doc text, tipo tipo_pessoa)
returns boolean
language sql
immutable
as $$
  select case when tipo = 'PF' then validar_cpf(doc) else validar_cnpj(doc) end;
$$;

-- CHECK garante que todo associado tenha CPF/CNPJ valido (NOT VALID nao
-- reprocessa linhas antigas, mas valida toda insercao/atualizacao nova).
alter table clientes drop constraint if exists chk_documento_valido;
alter table clientes
  add constraint chk_documento_valido
  check (validar_documento(cpf_cnpj, tipo_pessoa)) not valid;

-- Indice para busca por matricula
create index if not exists idx_clientes_matricula on clientes (matricula);

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0007_veiculos_contratos.sql >>>>>>>>>>>>>>>>>>>>>>>>

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

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0008_comunicacoes.sql >>>>>>>>>>>>>>>>>>>>>>>>

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

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0009_eventos_completo.sql >>>>>>>>>>>>>>>>>>>>>>>>

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

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0010_precificacao.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- SCar :: 0010_precificacao.sql
-- Modulo de Precificacao (baseado na TABELA_SMART_CAR_2026).
-- Cadastros base (tipos de veiculo, produtos), matriz de precos por faixa FIPE,
-- participacao/franquia por faixa, composicao de planos e motor de calculo.
-- ============================================================================

create type metodo_preco     as enum ('FAIXA_FIPE', 'FIXO', 'PERCENTUAL_FIPE');
create type tipo_valor_faixa as enum ('VALOR', 'PERCENTUAL');

-- ----------------------------------------------------------------------------
-- 1.1 Tipos de veiculo (categoria de risco)
-- ----------------------------------------------------------------------------
create table tipos_veiculo (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  status     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 1.3 Produtos / beneficios (componentes da mensalidade)
-- ----------------------------------------------------------------------------
create table produtos (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null unique,
  fornecedor_nome  text not null default 'Interno',
  tipo_evento_id   uuid references tipos_evento(id) on delete set null,
  metodo_preco     metodo_preco not null default 'FIXO',
  valor_fixo       numeric(12,2),        -- metodo FIXO
  percentual       numeric(8,5),         -- metodo PERCENTUAL_FIPE (0.04 = 4%)
  obrigatorio      boolean not null default false,
  categoria        text not null default 'BENEFICIO',  -- ADMIN | CASCO | RASTREADOR | BENEFICIO
  dados_adicionais jsonb not null default '{}'::jsonb,
  status           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_produtos_obrig on produtos (obrigatorio) where status;

-- ----------------------------------------------------------------------------
-- 2.1 Matriz de precos por faixa FIPE (por tipo de veiculo e produto)
-- ----------------------------------------------------------------------------
create table tabela_precos_faixa (
  id              uuid primary key default gen_random_uuid(),
  tipo_veiculo_id uuid not null references tipos_veiculo(id) on delete cascade,
  produto_id      uuid not null references produtos(id) on delete cascade,
  fipe_minimo     numeric(12,2) not null,
  fipe_maximo     numeric(12,2) not null,
  valor_mensal    numeric(12,2) not null,     -- R$ (VALOR) ou fracao (PERCENTUAL)
  tipo_valor      tipo_valor_faixa not null default 'VALOR',
  created_at      timestamptz not null default now(),
  unique (tipo_veiculo_id, produto_id, fipe_minimo, fipe_maximo),
  check (fipe_maximo >= fipe_minimo)
);
create index idx_precos_lookup on tabela_precos_faixa (tipo_veiculo_id, produto_id, fipe_minimo, fipe_maximo);

-- ----------------------------------------------------------------------------
-- Participacao (franquia) por faixa FIPE
-- ----------------------------------------------------------------------------
create table participacao_faixa (
  id              uuid primary key default gen_random_uuid(),
  tipo_veiculo_id uuid not null references tipos_veiculo(id) on delete cascade,
  fipe_minimo     numeric(12,2) not null,
  fipe_maximo     numeric(12,2) not null,
  tipo_valor      tipo_valor_faixa not null default 'VALOR',
  valor           numeric(12,2) not null,      -- R$ (VALOR) ou fracao (PERCENTUAL)
  unique (tipo_veiculo_id, fipe_minimo, fipe_maximo)
);

-- ----------------------------------------------------------------------------
-- Composicao de planos (reutiliza planos_protecao) -> produtos
-- ----------------------------------------------------------------------------
create table plano_produtos (
  plano_id   uuid not null references planos_protecao(id) on delete cascade,
  produto_id uuid not null references produtos(id) on delete cascade,
  primary key (plano_id, produto_id)
);

-- Categoria de risco do veiculo (para calculo)
alter table veiculos add column if not exists tipo_veiculo_id uuid references tipos_veiculo(id) on delete set null;

-- ============================================================================
-- 3. MOTOR DE CALCULO
-- ============================================================================

-- Valor de um produto para um dado FIPE/tipo de veiculo.
create or replace function calcular_valor_produto(
  p_produto_id uuid, p_fipe numeric, p_tipo_veiculo_id uuid
)
returns numeric
language plpgsql stable
as $$
declare
  prod  produtos;
  faixa tabela_precos_faixa;
begin
  select * into prod from produtos where id = p_produto_id;
  if not found then return 0; end if;

  if prod.metodo_preco = 'FIXO' then
    return coalesce(prod.valor_fixo, 0);
  elsif prod.metodo_preco = 'PERCENTUAL_FIPE' then
    return round(p_fipe * coalesce(prod.percentual, 0), 2);
  else -- FAIXA_FIPE
    select * into faixa
      from tabela_precos_faixa
     where tipo_veiculo_id = p_tipo_veiculo_id
       and produto_id = p_produto_id
       and p_fipe >= fipe_minimo and p_fipe <= fipe_maximo
     order by fipe_minimo desc
     limit 1;
    if not found then return 0; end if;
    if faixa.tipo_valor = 'PERCENTUAL' then
      return round(p_fipe * faixa.valor_mensal, 2);
    end if;
    return faixa.valor_mensal;
  end if;
end;
$$;

-- Motor principal: mensalidade composta (obrigatorios + selecionados).
create or replace function calcular_mensalidade(
  p_fipe numeric,
  p_tipo_veiculo_id uuid,
  p_produtos_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql stable
as $$
declare
  rec record;
  v numeric;
  detalhe jsonb := '[]'::jsonb;
  total numeric := 0;
  sub_admin numeric := 0;
  sub_parceiros numeric := 0;
begin
  for rec in
    select * from produtos p
     where p.status = true
       and (p.obrigatorio = true or p.id = any(p_produtos_ids))
     order by p.categoria, p.nome
  loop
    v := calcular_valor_produto(rec.id, p_fipe, p_tipo_veiculo_id);
    detalhe := detalhe || jsonb_build_object(
      'produto_id', rec.id, 'nome', rec.nome, 'valor', v,
      'fornecedor', rec.fornecedor_nome, 'categoria', rec.categoria,
      'obrigatorio', rec.obrigatorio
    );
    total := total + v;
    if rec.categoria = 'ADMIN' then sub_admin := sub_admin + v; end if;
    if rec.fornecedor_nome is distinct from 'Interno' then sub_parceiros := sub_parceiros + v; end if;
  end loop;

  return jsonb_build_object(
    'valor_fipe', p_fipe,
    'detalhamento_produtos', detalhe,
    'subtotal_taxa_admin', sub_admin,
    'subtotal_beneficios_parceiros', sub_parceiros,
    'valor_total_mensalidade', total
  );
end;
$$;

-- Participacao (franquia) para um FIPE/tipo de veiculo.
create or replace function calcular_participacao(p_fipe numeric, p_tipo_veiculo_id uuid)
returns numeric
language plpgsql stable
as $$
declare f participacao_faixa;
begin
  select * into f from participacao_faixa
   where tipo_veiculo_id = p_tipo_veiculo_id
     and p_fipe >= fipe_minimo and p_fipe <= fipe_maximo
   order by fipe_minimo desc limit 1;
  if not found then return 0; end if;
  if f.tipo_valor = 'PERCENTUAL' then return round(p_fipe * f.valor, 2); end if;
  return f.valor;
end;
$$;

-- ============================================================================
-- RLS (catalogos: leitura staff, escrita global)
-- ============================================================================
alter table tipos_veiculo        enable row level security;
alter table produtos             enable row level security;
alter table tabela_precos_faixa  enable row level security;
alter table participacao_faixa   enable row level security;
alter table plano_produtos       enable row level security;

create policy tv_select on tipos_veiculo for select to authenticated using (is_staff());
create policy tv_write  on tipos_veiculo for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());
create policy prod_select on produtos for select to authenticated using (is_staff());
create policy prod_write  on produtos for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());
create policy precos_select on tabela_precos_faixa for select to authenticated using (is_staff());
create policy precos_write  on tabela_precos_faixa for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());
create policy part_select on participacao_faixa for select to authenticated using (is_staff());
create policy part_write  on participacao_faixa for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());
create policy pp_select on plano_produtos for select to authenticated using (is_staff());
create policy pp_write  on plano_produtos for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());

grant select, insert, update, delete on tipos_veiculo, produtos, tabela_precos_faixa, participacao_faixa, plano_produtos to authenticated;

-- ============================================================================
-- SEED: tipos de veiculo e produtos (baseado na planilha)
-- ============================================================================
insert into tipos_veiculo (nome) values
  ('Passeio'), ('Moto'), ('Pick-up / Van'), ('Diesel Leve'),
  ('Utilitario'), ('Caminhao Pesado'), ('Reboque')
on conflict (nome) do nothing;

insert into produtos (nome, fornecedor_nome, metodo_preco, valor_fixo, percentual, obrigatorio, categoria) values
  ('Taxa Administrativa', 'Interno',            'FAIXA_FIPE',      null,  null,  true,  'ADMIN'),
  ('Protecao Casco',      'Interno',            'FAIXA_FIPE',      null,  null,  true,  'CASCO'),
  ('RCF - Terceiros 30mil','Interno',           'FIXO',           10.00,  null,  true,  'BENEFICIO'),
  ('Assistencia 24h',     'Europ Assistance',   'FIXO',           20.00,  null,  true,  'BENEFICIO'),
  ('Rastreador',          'Interno',            'FAIXA_FIPE',      null,  null,  true,  'RASTREADOR'),
  ('Carro Reserva 7 dias','Interno',            'FIXO',           10.50,  null,  false, 'BENEFICIO'),
  ('Carro Reserva 15 dias','Interno',           'FIXO',           18.50,  null,  false, 'BENEFICIO'),
  ('Protecao Parabrisas', 'Interno',            'FIXO',           13.50,  null,  false, 'BENEFICIO'),
  ('Vidros Basicos',      'Interno',            'FIXO',           18.50,  null,  false, 'BENEFICIO'),
  ('Kit Total Vidros',    'Interno',            'FIXO',           23.50,  null,  false, 'BENEFICIO'),
  ('Seguro de Vida',      'MetLife',            'FIXO',            9.90,  null,  false, 'BENEFICIO')
on conflict (nome) do nothing;

-- Vincula Assistencia 24h e RCF a tipos de evento, quando existirem.
update produtos p set tipo_evento_id = t.id
  from tipos_evento t where p.nome = 'Assistencia 24h' and t.nome = 'Guincho / Assistencia';
update produtos p set tipo_evento_id = t.id
  from tipos_evento t where p.nome = 'RCF - Terceiros 30mil' and t.nome = 'Danos a Terceiros';

-- ============================================================================
-- SEED: matriz de precos e participacao (Passeio) extraida da planilha 2026
-- ============================================================================
-- Faixas de preco (Passeio) geradas da planilha TABELA_SMART_CAR_2026
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),0.0,20000.0,35.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),0.0,20000.0,35.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),0.0,20000.0,0.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),0.0,20000.0,'VALOR',1500.0);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),20001.0,25000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),20001.0,25000.0,55.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),20001.0,25000.0,0.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),20001.0,25000.0,'VALOR',1500.0);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),25001.0,30000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),25001.0,30000.0,60.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),25001.0,30000.0,0.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),25001.0,30000.0,'VALOR',1500.0);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),30001.0,35000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),30001.0,35000.0,65.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),30001.0,35000.0,0.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),30001.0,35000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),35001.0,40000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),35001.0,40000.0,75.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),35001.0,40000.0,0.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),35001.0,40000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),40001.0,45000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),40001.0,45000.0,80.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),40001.0,45000.0,0.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),40001.0,45000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),45001.0,50000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),45001.0,50000.0,90.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),45001.0,50000.0,0.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),45001.0,50000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),50001.0,55000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),50001.0,55000.0,110.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),50001.0,55000.0,0.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),50001.0,55000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),55001.0,60000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),55001.0,60000.0,115.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),55001.0,60000.0,0.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),55001.0,60000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),60001.0,65000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),60001.0,65000.0,120.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),60001.0,65000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),60001.0,65000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),65001.0,70000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),65001.0,70000.0,125.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),65001.0,70000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),65001.0,70000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),70001.0,75000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),70001.0,75000.0,130.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),70001.0,75000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),70001.0,75000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),75001.0,80000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),75001.0,80000.0,135.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),75001.0,80000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),75001.0,80000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),80001.0,85000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),80001.0,85000.0,140.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),80001.0,85000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),80001.0,85000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),85001.0,90000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),85001.0,90000.0,155.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),85001.0,90000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),85001.0,90000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),90001.0,95000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),90001.0,95000.0,160.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),90001.0,95000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),90001.0,95000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),95001.0,100000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),95001.0,100000.0,165.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),95001.0,100000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),95001.0,100000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),100001.0,105000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),100001.0,105000.0,175.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),100001.0,105000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),100001.0,105000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),105001.0,110000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),105001.0,110000.0,185.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),105001.0,110000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),105001.0,110000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),110001.0,115000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),110001.0,115000.0,195.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),110001.0,115000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),110001.0,115000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),115001.0,120000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),115001.0,120000.0,205.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),115001.0,120000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),115001.0,120000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),120001.0,125000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),120001.0,125000.0,215.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),120001.0,125000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),120001.0,125000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),125000.0,130000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),125000.0,130000.0,225.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),125000.0,130000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),125000.0,130000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),130001.0,135000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),130001.0,135000.0,235.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),130001.0,135000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),130001.0,135000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),135001.0,140000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),135001.0,140000.0,245.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),135001.0,140000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),135001.0,140000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),140000.0,145000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),140000.0,145000.0,265.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),140000.0,145000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),140000.0,145000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),145000.0,150000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),145000.0,150000.0,285.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),145000.0,150000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),145000.0,150000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),150001.0,155000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),150001.0,155000.0,295.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),150001.0,155000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),150001.0,155000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),155001.0,160000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),155001.0,160000.0,305.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),155001.0,160000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),155001.0,160000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),160001.0,165000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),160001.0,165000.0,325.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),160001.0,165000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),160001.0,165000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),165001.0,170000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),165001.0,170000.0,335.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),165001.0,170000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),165001.0,170000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),170001.0,175000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),170001.0,175000.0,345.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),170001.0,175000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),170001.0,175000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),175001.0,180000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),175001.0,180000.0,355.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),175001.0,180000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),175001.0,180000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),180001.0,185000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),180001.0,185000.0,365.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),180001.0,185000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),180001.0,185000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),185001.0,190000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),185001.0,190000.0,375.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),185001.0,190000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),185001.0,190000.0,'PERCENTUAL',0.04);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),190001.0,200000.0,25.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),190001.0,200000.0,395.0,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),190001.0,200000.0,35.0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),190001.0,200000.0,'PERCENTUAL',0.04);

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0011_empresa.sql >>>>>>>>>>>>>>>>>>>>>>>>

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

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0012_financeiro_fornecedores.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- SCar :: 0012_financeiro_fornecedores.sql
-- Fornecedores (auto-preenchimento CNPJ/CEP), contas a pagar/receber,
-- baixas (liquidacao) com reconciliacao Open Finance-ready e anexos.
-- ============================================================================

create type status_lancamento    as enum ('pendente', 'pago_parcial', 'quitado', 'cancelado', 'atrasado');
create type forma_pagamento      as enum ('PIX', 'BOLETO', 'TRANSFERENCIA', 'CARTAO', 'DINHEIRO');
create type status_conciliacao   as enum ('NAO_CONCILIADO', 'CONCILIADO_MANUAL', 'CONCILIADO_API');

-- ----------------------------------------------------------------------------
-- Fornecedores
-- ----------------------------------------------------------------------------
create table fornecedores (
  id                 uuid primary key default gen_random_uuid(),
  tipo_pessoa        tipo_pessoa not null default 'PJ',
  documento          text not null,                -- cpf/cnpj (digitos)
  razao_social       text not null,
  nome_fantasia      text,
  situacao_cadastral text,
  cnae_principal     text,
  email              text,
  telefone           text,
  endereco           jsonb not null default '{}'::jsonb,
  dados_receita      jsonb not null default '{}'::jsonb,  -- resposta bruta da API
  ativo              boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (documento),
  constraint chk_fornecedor_doc check (validar_documento(documento, tipo_pessoa))
);
create index idx_fornecedores_nome on fornecedores using gin (razao_social gin_trgm_ops);
create trigger trg_fornecedores_updated before update on fornecedores for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Centros de custo e contas bancarias
-- ----------------------------------------------------------------------------
create table centros_custo (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null,
  codigo text,
  ativo  boolean not null default true,
  created_at timestamptz not null default now()
);

create table contas_bancarias (
  id       uuid primary key default gen_random_uuid(),
  nome     text not null,
  banco    text,
  agencia  text,
  conta    text,
  tipo     text,                      -- corrente | poupanca | caixa
  chave_pix text,
  ativo    boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Lancamentos financeiros (contas a pagar / a receber)
-- ----------------------------------------------------------------------------
create table lancamentos_financeiros (
  id                       uuid primary key default gen_random_uuid(),
  tipo                     tipo_movimentacao not null,   -- RECEITA (receber) | DESPESA (pagar)
  fornecedor_id            uuid references fornecedores(id) on delete set null,
  cliente_id               uuid references clientes(id) on delete set null,
  descricao                text not null,
  categoria_dre_id         uuid references categorias_dre(id) on delete set null,
  centro_custo_id          uuid references centros_custo(id) on delete set null,
  evento_id                uuid references eventos_sinistro(id) on delete set null,
  regional_id              uuid references regionais(id) on delete set null,
  valor_original           numeric(12,2) not null check (valor_original >= 0),
  data_emissao             date not null default current_date,
  data_vencimento          date not null,
  status                   status_lancamento not null default 'pendente',
  forma_pagamento_prevista forma_pagamento,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index idx_lanc_tipo_status on lancamentos_financeiros (tipo, status);
create index idx_lanc_vencimento on lancamentos_financeiros (data_vencimento);
create index idx_lanc_fornecedor on lancamentos_financeiros (fornecedor_id);
create index idx_lanc_evento on lancamentos_financeiros (evento_id);
create trigger trg_lanc_updated before update on lancamentos_financeiros for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Baixas (liquidacao) com campos de reconciliacao Open Finance
-- ----------------------------------------------------------------------------
create table baixas_financeiras (
  id                          uuid primary key default gen_random_uuid(),
  lancamento_id               uuid not null references lancamentos_financeiros(id) on delete cascade,
  data_pagamento              date not null default current_date,
  valor_pago                  numeric(12,2) not null check (valor_pago >= 0),
  desconto                    numeric(12,2) not null default 0,
  juros_multa                 numeric(12,2) not null default 0,
  valor_liquido               numeric(12,2) not null default 0,
  conta_bancaria_id           uuid references contas_bancarias(id) on delete set null,
  comprovante_transacao_id    text,
  -- reconciliacao bancaria futura (Open Finance / Bankline)
  id_transacao_bancaria_externa text,
  end_to_end_id_pix           text,
  status_conciliacao          status_conciliacao not null default 'NAO_CONCILIADO',
  created_at                  timestamptz not null default now()
);
create index idx_baixas_lancamento on baixas_financeiras (lancamento_id);

-- ----------------------------------------------------------------------------
-- Anexos financeiros (multiplos por lancamento)
-- ----------------------------------------------------------------------------
create table anexos_financeiros (
  id            uuid primary key default gen_random_uuid(),
  lancamento_id uuid references lancamentos_financeiros(id) on delete cascade,
  baixa_id      uuid references baixas_financeiras(id) on delete cascade,
  nome_arquivo  text not null,
  mime_type     text,
  tamanho_bytes bigint,
  url_storage   text not null,
  hash_md5      text,
  created_at    timestamptz not null default now()
);
create index idx_anexos_fin_lanc on anexos_financeiros (lancamento_id);

-- ============================================================================
-- Regra de baixa: recalcula status e valida integridade do saldo.
-- ============================================================================
create or replace function fn_recalcular_lancamento()
returns trigger
language plpgsql
as $$
declare
  v_lanc lancamentos_financeiros;
  v_pago numeric; v_desc numeric; v_juros numeric;
  v_abatido numeric; v_devido numeric;
  v_id uuid := coalesce(new.lancamento_id, old.lancamento_id);
begin
  select * into v_lanc from lancamentos_financeiros where id = v_id;
  if not found then return null; end if;

  select coalesce(sum(valor_pago),0), coalesce(sum(desconto),0), coalesce(sum(juros_multa),0)
    into v_pago, v_desc, v_juros
    from baixas_financeiras where lancamento_id = v_id;

  v_abatido := v_pago + v_desc;             -- quanto ja foi quitado (pagamento + desconto concedido)
  v_devido  := v_lanc.valor_original + v_juros;  -- total devido (com juros/multa)

  -- Integridade: nao pode abater mais que o total devido (evita pagamento a maior).
  if v_abatido > v_devido + 0.005 then
    raise exception 'Baixa excede o saldo devedor. Devido: %, abatido: %', v_devido, v_abatido
      using errcode = 'check_violation';
  end if;

  update lancamentos_financeiros
     set status = (case
       when v_lanc.status = 'cancelado' then 'cancelado'
       when v_abatido >= v_devido - 0.005 and v_devido > 0 then 'quitado'
       when v_abatido > 0 then 'pago_parcial'
       when v_lanc.data_vencimento < current_date then 'atrasado'
       else 'pendente' end)::status_lancamento
   where id = v_id;
  return null;
end;
$$;

create trigger trg_recalcular_lancamento
  after insert or update or delete on baixas_financeiras
  for each row execute function fn_recalcular_lancamento();

-- Marca lancamentos vencidos como atrasado (cron/agendador).
create or replace function marcar_lancamentos_atrasados()
returns integer language sql as $$
  with upd as (
    update lancamentos_financeiros set status = 'atrasado'
     where status = 'pendente' and data_vencimento < current_date
     returning 1
  ) select count(*)::int from upd;
$$;

-- ============================================================================
-- Storage + RLS
-- ============================================================================
insert into storage.buckets (id, name, public) values ('financeiro', 'financeiro', false)
on conflict (id) do nothing;

alter table fornecedores            enable row level security;
alter table centros_custo           enable row level security;
alter table contas_bancarias        enable row level security;
alter table lancamentos_financeiros enable row level security;
alter table baixas_financeiras      enable row level security;
alter table anexos_financeiros      enable row level security;

-- Fornecedores e catalogos: leitura staff, escrita global.
create policy forn_select on fornecedores for select to authenticated using (is_staff());
create policy forn_write  on fornecedores for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());
create policy cc_select on centros_custo for select to authenticated using (is_staff());
create policy cc_write  on centros_custo for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());
create policy cb_select on contas_bancarias for select to authenticated using (is_staff());
create policy cb_write  on contas_bancarias for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());

-- Lancamentos/baixas/anexos: acesso global ou por regional.
create policy lanc_all on lancamentos_financeiros for all to authenticated
  using (pode_regional(regional_id)) with check (pode_regional(regional_id));
create policy baixas_all on baixas_financeiras for all to authenticated
  using (exists (select 1 from lancamentos_financeiros l where l.id = lancamento_id and pode_regional(l.regional_id)))
  with check (exists (select 1 from lancamentos_financeiros l where l.id = lancamento_id and pode_regional(l.regional_id)));
create policy anexosfin_all on anexos_financeiros for all to authenticated
  using (tem_acesso_global() or exists (select 1 from lancamentos_financeiros l where l.id = lancamento_id and pode_regional(l.regional_id)))
  with check (tem_acesso_global() or exists (select 1 from lancamentos_financeiros l where l.id = lancamento_id and pode_regional(l.regional_id)));

grant select, insert, update, delete on fornecedores, centros_custo, contas_bancarias,
  lancamentos_financeiros, baixas_financeiras, anexos_financeiros to authenticated;

create policy storage_financeiro_all on storage.objects for all to authenticated
  using (bucket_id = 'financeiro' and is_staff())
  with check (bucket_id = 'financeiro' and is_staff());

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0013_editor_precos.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- SCar :: 0013_editor_precos.sql
-- Substituicao atomica da matriz de precos de um tipo de veiculo (editor).
-- Deleta e reinsere faixas + participacao dentro de uma unica transacao.
-- SECURITY INVOKER: o RLS continua valendo (somente acesso global escreve).
-- ============================================================================

create or replace function substituir_tabela_precos(
  p_tipo_veiculo   uuid,
  p_faixas         jsonb,
  p_participacoes  jsonb
)
returns void
language plpgsql
as $$
begin
  delete from tabela_precos_faixa where tipo_veiculo_id = p_tipo_veiculo;
  delete from participacao_faixa   where tipo_veiculo_id = p_tipo_veiculo;

  insert into tabela_precos_faixa
    (tipo_veiculo_id, produto_id, fipe_minimo, fipe_maximo, valor_mensal, tipo_valor)
  select p_tipo_veiculo,
         (e->>'produto_id')::uuid,
         (e->>'fipe_minimo')::numeric,
         (e->>'fipe_maximo')::numeric,
         (e->>'valor_mensal')::numeric,
         coalesce(e->>'tipo_valor', 'VALOR')::tipo_valor_faixa
    from jsonb_array_elements(coalesce(p_faixas, '[]'::jsonb)) e;

  insert into participacao_faixa
    (tipo_veiculo_id, fipe_minimo, fipe_maximo, tipo_valor, valor)
  select p_tipo_veiculo,
         (e->>'fipe_minimo')::numeric,
         (e->>'fipe_maximo')::numeric,
         coalesce(e->>'tipo_valor', 'VALOR')::tipo_valor_faixa,
         (e->>'valor')::numeric
    from jsonb_array_elements(coalesce(p_participacoes, '[]'::jsonb)) e;
end;
$$;

grant execute on function substituir_tabela_precos(uuid, jsonb, jsonb) to authenticated;

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0014_marcas_modelos.sql >>>>>>>>>>>>>>>>>>>>>>>>

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

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0015_seed_marcas_modelos.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- SCar :: 0015_seed_marcas_modelos.sql
-- Carga inicial do catalogo de Marcas e Modelos a partir do relatorio SGA.
-- Idempotente: on conflict do nothing (nao sobrescreve edicoes manuais).
-- Fonte: SGA_Relatorio_Marcas_e_Modelos.xlsx (241 marcas, 8819 modelos).
-- ============================================================================

-- --- Marcas ---------------------------------------------------------------
insert into marcas (nome, ativo, status)
values
  ('ACURA', true, 'ATIVO'),
  ('ADLY', true, 'ATIVO'),
  ('AGRALE', true, 'ATIVO'),
  ('ALFA ROMEO', true, 'ATIVO'),
  ('AM GEN', true, 'ATIVO'),
  ('AMAZONAS', true, 'ATIVO'),
  ('ANTONINI', true, 'ATIVO'),
  ('APRILIA', true, 'ATIVO'),
  ('ARTESANAL', true, 'ATIVO'),
  ('ASIA MOTORS', true, 'ATIVO'),
  ('ASTON MARTIN', true, 'ATIVO'),
  ('ATALA', true, 'ATIVO'),
  ('AUDI', true, 'ATIVO'),
  ('AVELLOZ', true, 'ATIVO'),
  ('BAJAJ', true, 'ATIVO'),
  ('BECKER', true, 'ATIVO'),
  ('BEE', true, 'ATIVO'),
  ('BENELLI', true, 'ATIVO'),
  ('BEPOBUS', true, 'ATIVO'),
  ('BETA', true, 'ATIVO'),
  ('BIMOTA', true, 'ATIVO'),
  ('BISELLI', true, 'ATIVO'),
  ('BMW', true, 'ATIVO'),
  ('BONANO', true, 'ATIVO'),
  ('BOREAL', true, 'ATIVO'),
  ('BRANDY', true, 'ATIVO'),
  ('BRAVA', true, 'ATIVO'),
  ('BRM', true, 'ATIVO'),
  ('BRP', true, 'ATIVO'),
  ('BRUCAL', true, 'ATIVO'),
  ('BUELL', true, 'ATIVO'),
  ('BUENO', true, 'ATIVO'),
  ('BUGGY', true, 'ATIVO'),
  ('BUGRE', true, 'ATIVO'),
  ('BUSA', true, 'ATIVO'),
  ('BYCRISTO', true, 'ATIVO'),
  ('CADILLAC', true, 'ATIVO'),
  ('CAGIVA', true, 'ATIVO'),
  ('CALOI', true, 'ATIVO'),
  ('CATERPILLAR', true, 'ATIVO'),
  ('CBT JIPE', true, 'ATIVO'),
  ('CHANA', true, 'ATIVO'),
  ('CHANGAN', true, 'ATIVO'),
  ('CHERY', true, 'ATIVO'),
  ('CHEVROLET', true, 'ATIVO'),
  ('CHRYSLER', true, 'ATIVO'),
  ('CICCOBUS', true, 'ATIVO'),
  ('CIOTAGO', true, 'ATIVO'),
  ('CITROEN', true, 'ATIVO'),
  ('CITROEN 1', true, 'ATIVO'),
  ('CROSS LANDER', true, 'ATIVO'),
  ('DAELIM', true, 'ATIVO'),
  ('DAEWOO', true, 'ATIVO'),
  ('DAF', true, 'ATIVO'),
  ('DAFRA', true, 'ATIVO'),
  ('DAIHATSU', true, 'ATIVO'),
  ('DALMARCO', true, 'ATIVO'),
  ('DAMBROZ', true, 'ATIVO'),
  ('DAYANG', true, 'ATIVO'),
  ('DAYUN', true, 'ATIVO'),
  ('DERBI', true, 'ATIVO'),
  ('DODGE', true, 'ATIVO'),
  ('DUCATI', true, 'ATIVO'),
  ('EFFA', true, 'ATIVO'),
  ('EFFA-JMC', true, 'ATIVO'),
  ('EMME', true, 'ATIVO'),
  ('ENGESA', true, 'ATIVO'),
  ('ENVEMO', true, 'ATIVO'),
  ('ESCUBER CARRETAS', true, 'ATIVO'),
  ('FACCHINI', true, 'ATIVO'),
  ('FERRARI', true, 'ATIVO'),
  ('FIAT', true, 'ATIVO'),
  ('FIBRAVAN', true, 'ATIVO'),
  ('FNV', true, 'ATIVO'),
  ('FORD', true, 'ATIVO'),
  ('FORMIGHIERI', true, 'ATIVO'),
  ('FOTON', true, 'ATIVO'),
  ('FOX', true, 'ATIVO'),
  ('FYBER', true, 'ATIVO'),
  ('FYM', true, 'ATIVO'),
  ('GANDOLFO', true, 'ATIVO'),
  ('GARINNI', true, 'ATIVO'),
  ('GAS GAS', true, 'ATIVO'),
  ('GEELY', true, 'ATIVO'),
  ('GM - CHEVROLET', true, 'ATIVO'),
  ('GMC', true, 'ATIVO'),
  ('GOTTI', true, 'ATIVO'),
  ('GREAT WALL', true, 'ATIVO'),
  ('GREEN', true, 'ATIVO'),
  ('GRIMALDI', true, 'ATIVO'),
  ('GUERRA', true, 'ATIVO'),
  ('GURGEL', true, 'ATIVO'),
  ('HAFEI', true, 'ATIVO'),
  ('HAOBAO', true, 'ATIVO'),
  ('HAOJUE', true, 'ATIVO'),
  ('HARLEY-DAVIDSON', true, 'ATIVO'),
  ('HARTFORD', true, 'ATIVO'),
  ('HERO', true, 'ATIVO'),
  ('HONDA', true, 'ATIVO'),
  ('HUSABERG', true, 'ATIVO'),
  ('HUSQVARNA', true, 'ATIVO'),
  ('HYUNDAI', true, 'ATIVO'),
  ('IBIPORA', true, 'ATIVO'),
  ('ICON', true, 'ATIVO'),
  ('IDEROL', true, 'ATIVO'),
  ('INDIAN', true, 'ATIVO'),
  ('IROS', true, 'ATIVO'),
  ('ISUZU', true, 'ATIVO'),
  ('IVECO', true, 'ATIVO'),
  ('JAC', true, 'ATIVO'),
  ('JAGUAR', true, 'ATIVO'),
  ('JEEP', true, 'ATIVO'),
  ('JIAPENG VOLCANO', true, 'ATIVO'),
  ('JINBEI', true, 'ATIVO'),
  ('JOHNNYPAG', true, 'ATIVO'),
  ('JONNY', true, 'ATIVO'),
  ('JPX', true, 'ATIVO'),
  ('KAHENA', true, 'ATIVO'),
  ('KASINSKI', true, 'ATIVO'),
  ('KAWASAKI', true, 'ATIVO'),
  ('KIA MOTORS', true, 'ATIVO'),
  ('KIMCO', true, 'ATIVO'),
  ('KRONE', true, 'ATIVO'),
  ('KROVILLE', true, 'ATIVO'),
  ('KTM', true, 'ATIVO'),
  ('KYMCO', true, 'ATIVO'),
  ('LADA', true, 'ATIVO'),
  ('LAMBORGHINI', true, 'ATIVO'),
  ('LAND ROVER', true, 'ATIVO'),
  ('LANDUM', true, 'ATIVO'),
  ('LAQUILA', true, 'ATIVO'),
  ('LAVRALE', true, 'ATIVO'),
  ('LERIVO', true, 'ATIVO'),
  ('LEXUS', true, 'ATIVO'),
  ('LIBRELATO', true, 'ATIVO'),
  ('LIDER', true, 'ATIVO'),
  ('LIES', true, 'ATIVO'),
  ('LIESS', true, 'ATIVO'),
  ('LIFAN', true, 'ATIVO'),
  ('LINSHALM', true, 'ATIVO'),
  ('LOBINI', true, 'ATIVO'),
  ('LON-V', true, 'ATIVO'),
  ('LOTUS', true, 'ATIVO'),
  ('MAGRÃO TRICICLOS', true, 'ATIVO'),
  ('MAHINDRA', true, 'ATIVO'),
  ('MALAGUTI', true, 'ATIVO'),
  ('MAN', true, 'ATIVO'),
  ('MARCOPOLO', true, 'ATIVO'),
  ('MASCARELLO', true, 'ATIVO'),
  ('MASERATI', true, 'ATIVO'),
  ('MATRA', true, 'ATIVO'),
  ('MAXFORT', true, 'ATIVO'),
  ('MAXIBUS', true, 'ATIVO'),
  ('MAZDA', true, 'ATIVO'),
  ('MELLO', true, 'ATIVO'),
  ('MERCEDES-BENZ', true, 'ATIVO'),
  ('MERCURY', true, 'ATIVO'),
  ('METALESP', true, 'ATIVO'),
  ('METALPI', true, 'ATIVO'),
  ('MG', true, 'ATIVO'),
  ('MINI', true, 'ATIVO'),
  ('MITSUBISHI', true, 'ATIVO'),
  ('MIURA', true, 'ATIVO'),
  ('MIZA', true, 'ATIVO'),
  ('MOTO GUZZI', true, 'ATIVO'),
  ('MOTOCAR', true, 'ATIVO'),
  ('MOTORINO', true, 'ATIVO'),
  ('MRX', true, 'ATIVO'),
  ('MV AGUSTA', true, 'ATIVO'),
  ('MVK', true, 'ATIVO'),
  ('NAVISTAR', true, 'ATIVO'),
  ('NEOBUS', true, 'ATIVO'),
  ('NIJU', true, 'ATIVO'),
  ('NISSAN', true, 'ATIVO'),
  ('NOMA', true, 'ATIVO'),
  ('ORCA', true, 'ATIVO'),
  ('PALMEIRA', true, 'ATIVO'),
  ('PASTRE', true, 'ATIVO'),
  ('PEGASSI', true, 'ATIVO'),
  ('PEUGEOT', true, 'ATIVO'),
  ('PIAGGIO', true, 'ATIVO'),
  ('PLYMOUTH', true, 'ATIVO'),
  ('PONTIAC', true, 'ATIVO'),
  ('PORSCHE', true, 'ATIVO'),
  ('PUMA-ALFA', true, 'ATIVO'),
  ('RAM', true, 'ATIVO'),
  ('RANDON', true, 'ATIVO'),
  ('RECROSUL', true, 'ATIVO'),
  ('RECRUSUL', true, 'ATIVO'),
  ('REGAL RAPTOR', true, 'ATIVO'),
  ('RELY', true, 'ATIVO'),
  ('RENAULT', true, 'ATIVO'),
  ('RIGUETE', true, 'ATIVO'),
  ('RODOFORT', true, 'ATIVO'),
  ('RODOLINEA', true, 'ATIVO'),
  ('RODOTECNICA', true, 'ATIVO'),
  ('RODOVIA', true, 'ATIVO'),
  ('RODOVIARIA', true, 'ATIVO'),
  ('ROLLS-ROYCE', true, 'ATIVO'),
  ('ROSSETI', true, 'ATIVO'),
  ('ROVER', true, 'ATIVO'),
  ('ROYAL ENFIELD', true, 'ATIVO'),
  ('SAAB', true, 'ATIVO'),
  ('SAAB-SCANIA', true, 'ATIVO'),
  ('SALVARO', true, 'ATIVO'),
  ('SANY', true, 'ATIVO'),
  ('SANYANG', true, 'ATIVO'),
  ('SATURN', true, 'ATIVO'),
  ('SCANIA', true, 'ATIVO'),
  ('SCHIFFER', true, 'ATIVO'),
  ('SEAT', true, 'ATIVO'),
  ('SHACMAN', true, 'ATIVO'),
  ('SHINERAY', true, 'ATIVO'),
  ('SIAMOTO', true, 'ATIVO'),
  ('SINOTRUK', true, 'ATIVO'),
  ('SMART', true, 'ATIVO'),
  ('SSANGYONG', true, 'ATIVO'),
  ('SUBARU', true, 'ATIVO'),
  ('SUNDOWN', true, 'ATIVO'),
  ('SUZUKI', true, 'ATIVO'),
  ('SÃO PEDRO', true, 'ATIVO'),
  ('TAC', true, 'ATIVO'),
  ('TARGOS', true, 'ATIVO'),
  ('TIGER', true, 'ATIVO'),
  ('TOYOTA', true, 'ATIVO'),
  ('TRAXX', true, 'ATIVO'),
  ('TRIELHT', true, 'ATIVO'),
  ('TRIUMPH', true, 'ATIVO'),
  ('TROLLER', true, 'ATIVO'),
  ('VENTO', true, 'ATIVO'),
  ('VILACOS', true, 'ATIVO'),
  ('VOLKSWAGEN', true, 'ATIVO'),
  ('VOLVO', true, 'ATIVO'),
  ('VW - VOLKSWAGEN', true, 'ATIVO'),
  ('VW - VW - VOLKSWAGEN', true, 'ATIVO'),
  ('WAKE', true, 'ATIVO'),
  ('WALK', true, 'ATIVO'),
  ('WALKBUS', true, 'ATIVO'),
  ('WUYANG', true, 'ATIVO'),
  ('YAMAHA', true, 'ATIVO'),
  ('ZONTES', true, 'ATIVO')
on conflict (nome) do nothing;

-- --- Modelos --------------------------------------------------------------
insert into modelos (marca_id, nome, tipo_veiculo, idade_maxima, ativo, status)
select m.id, v.modelo, nullif(v.tipo, ''), v.idade, true, 'ATIVO'::status_cadastro
from (values
  ('ACURA', 'LEGEND 3.2/3.5', 'Não informado', 0),
  ('ACURA', 'NSX 3.0', 'Não informado', 0),
  ('ADLY', 'ATV 100', 'Não informado', 0),
  ('ADLY', 'ATV 50', 'Não informado', 0),
  ('ADLY', 'JAGUAR JT 100', 'Não informado', 0),
  ('ADLY', 'JAGUAR JT 50', 'Não informado', 0),
  ('ADLY', 'RT 50', 'Não informado', 0),
  ('AGRALE', '10000 2P (DIESEL) (E5)', 'Não informado', 0),
  ('AGRALE', '10000 LX 2P (DIESEL) (E5)', 'Não informado', 0),
  ('AGRALE', '13000 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '13000 TURBO 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '14000 2P (DIESEL) (E5)', 'Não informado', 0),
  ('AGRALE', '14000 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('AGRALE', '14000 LX 2P (DIESEL) (E5)', 'Não informado', 0),
  ('AGRALE', '1600 D-RD 2P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '1600 D-RS 2P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '1800 D-RD 2P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '1800 D-RS 2P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '4500 D-RD 2P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '4500 D-RS 2P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '5000 D-RD 2P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '5000 D-RS 2P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '6000 D CD RS/ RD 3P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '6000 D CS 2P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '6000 FURGOVAN 2.8 TDI RS/ RD 4P', 'Não informado', 0),
  ('AGRALE', '7000 D 2P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '7000 D-RD (C.DUPLA) 4P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '7000 DX 2P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '7500 TD 2P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '7500 TDX 2P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '8000 FURGOVAN 4.3 TDI 145CV AUT 4P', 'Não informado', 0),
  ('AGRALE', '8000 FURGOVAN 4.3 TDI MEC 4P', 'Não informado', 0),
  ('AGRALE', '8500 E-TRONIC CE 2P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '8500 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '8500 TURBO CD 3P (DIESEL)', 'Não informado', 0),
  ('AGRALE', '8700 2P (DIESEL) (E5)', 'Não informado', 0),
  ('AGRALE', '8700 LX 2P (DIESEL) (E5)', 'Não informado', 0),
  ('AGRALE', '8700 TR 2P (DIESEL) (E5)', 'Não informado', 0),
  ('AGRALE', '9200 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('AGRALE', 'A10000 2P (DIESEL) (E5)', 'Não informado', 0),
  ('AGRALE', 'A7500 2P (DIESEL)(E5)', 'Não informado', 0),
  ('AGRALE', 'A8700 2P (DIESEL) (E5)', 'Não informado', 0),
  ('AGRALE', 'CITY 50', 'Não informado', 0),
  ('AGRALE', 'CITY 90', 'Não informado', 0),
  ('AGRALE', 'DAKAR 30.0 190CC', 'Não informado', 0),
  ('AGRALE', 'DAKAR 50', 'Não informado', 0),
  ('AGRALE', 'ELEFANT 16.5 125CC', 'Não informado', 0),
  ('AGRALE', 'ELEFANT 27.5 190CC', 'Não informado', 0),
  ('AGRALE', 'ELEFANTRE 16.5 ES 125CC', 'Não informado', 0),
  ('AGRALE', 'ELEFANTRE 30.0 ES 190CC', 'Não informado', 0),
  ('AGRALE', 'FORCE 50', 'Não informado', 0),
  ('AGRALE', 'FORCE 90', 'Não informado', 0),
  ('AGRALE', 'JUNIOR 50', 'Não informado', 0),
  ('AGRALE', 'MARRUÁ 2.8 12V 132CV TDI DIESEL', 'Não informado', 0),
  ('AGRALE', 'MARRUÁ AM 100 2.8 CD TDI DIESEL', 'Não informado', 0),
  ('AGRALE', 'MARRUÁ AM 100 2.8 CS TDI DIESEL', 'Não informado', 0),
  ('AGRALE', 'MARRUÁ AM 150 2.8 CD TDI DIESEL', 'Não informado', 0),
  ('AGRALE', 'MARRUÁ AM 150 2.8 CS TDI DIESEL', 'Não informado', 0),
  ('AGRALE', 'MARRUÁ AM 200 2.8 CD TDI DIESEL', 'Não informado', 0),
  ('AGRALE', 'MARRUÁ AM 200 2.8 CS TDI DIESEL', 'Não informado', 0),
  ('AGRALE', 'MARRUÁ AM 300 2.8 CS TDI DIESEL (E5)', 'Não informado', 0),
  ('AGRALE', 'MARRUÁ AM 50 2.8 140CV TDI DIESEL', 'Não informado', 0),
  ('AGRALE', 'SST 13.5 125CC', 'Não informado', 0),
  ('AGRALE', 'SUPER CITY 125', 'Não informado', 0),
  ('AGRALE', 'SUPER CITY 150', 'Não informado', 0),
  ('AGRALE', 'SXT 27.5 E 190CC', 'Não informado', 0),
  ('AGRALE', 'SXT 27.5 EX 190CC', 'Não informado', 0),
  ('AGRALE', 'TCHAU 50', 'Não informado', 0),
  ('ALFA ROMEO', '145 ELEGANT 1.7/1.8 16V', 'Não informado', 0),
  ('ALFA ROMEO', '145 ELEGANT 2.0 16V', 'Não informado', 0),
  ('ALFA ROMEO', '145 QUADRIFOGLIO 2.0', 'Não informado', 0),
  ('ALFA ROMEO', '145 QV', 'Não informado', 0),
  ('ALFA ROMEO', '147 2.0 16V 148CV 4P SEMI-AUT.', 'Não informado', 0),
  ('ALFA ROMEO', '155', 'Não informado', 0),
  ('ALFA ROMEO', '155 SUPER', 'Não informado', 0),
  ('ALFA ROMEO', '156 2.5 V6 24V 190CV 4P AUT.', 'Não informado', 0),
  ('ALFA ROMEO', '156 SPORT WAGON 2.0 16V', 'Não informado', 0),
  ('ALFA ROMEO', '156 SPORTWAGON 2.5 V6 24V 190CV 4P AUT.', 'Não informado', 0),
  ('ALFA ROMEO', '156 TS/SPORT/ELEGANT 2.0 16V', 'Não informado', 0),
  ('ALFA ROMEO', '164 3.0 V6', 'Não informado', 0),
  ('ALFA ROMEO', '164 SUPER V6 24V', 'Não informado', 0),
  ('ALFA ROMEO', '166 3.0 V6 24V', 'Não informado', 0),
  ('ALFA ROMEO', '2300 TI/TI-4', 'Não informado', 0),
  ('ALFA ROMEO', 'SPIDER 2.0/3.0', 'Não informado', 0),
  ('AM GEN', 'HUMMER HARD-TOP 6.5 4X4 DIESEL TB', 'Não informado', 0),
  ('AM GEN', 'HUMMER OPEN-TOP 6.5 4X4 DIESEL TB', 'Não informado', 0),
  ('AM GEN', 'HUMMER WAGON 6.5 4X4 DIESEL TB', 'Não informado', 0),
  ('AMAZONAS', 'AME-110 MIX', 'Não informado', 0),
  ('AMAZONAS', 'AME-150 TC/ SC', 'Não informado', 0),
  ('AMAZONAS', 'AME-250 C1', 'Não informado', 0),
  ('AMAZONAS', 'AME-LX 125/26', 'Não informado', 0),
  ('ANTONINI', 'R / ANTONINI', 'Não informado', 0),
  ('ANTONINI', 'R / ANTONINI RA CN', 'Não informado', 0),
  ('APRILIA', 'AREA-51 50CC', 'Não informado', 0),
  ('APRILIA', 'CLASSIC 50CC', 'Não informado', 0),
  ('APRILIA', 'LEONARDO 150CC', 'Não informado', 0),
  ('APRILIA', 'MOTO 650CC', 'Não informado', 0),
  ('APRILIA', 'PEGASO 650CC', 'Não informado', 0),
  ('APRILIA', 'RALLY 50CC', 'Não informado', 0),
  ('APRILIA', 'RS 250CC', 'Não informado', 0),
  ('APRILIA', 'RS 50CC', 'Não informado', 0),
  ('APRILIA', 'RSV MILLE 1000CC', 'Não informado', 0),
  ('APRILIA', 'RX 50CC', 'Não informado', 0),
  ('APRILIA', 'SCARABEO BRIGTH 50CC', 'Não informado', 0),
  ('APRILIA', 'SCARABEO CLASSIC 50CC', 'Não informado', 0),
  ('APRILIA', 'SCARABEO DE LUXE 50CC', 'Não informado', 0),
  ('APRILIA', 'SONIC 50CC', 'Não informado', 0),
  ('APRILIA', 'SR RACING 50CC', 'Não informado', 0),
  ('APRILIA', 'SR WWW 50CC', 'Não informado', 0),
  ('ARTESANAL', 'SR / TRUCK ART SR B0 3E', 'Não informado', 0),
  ('ASIA MOTORS', 'AM-825 LUXO 4.0 DIESEL', 'Não informado', 0),
  ('ASIA MOTORS', 'AM-825 SUPER LUXO 4.0 DIESEL', 'Não informado', 0),
  ('ASIA MOTORS', 'HI-TOPIC SLX/SDX/DLX FULL DIESEL', 'Não informado', 0),
  ('ASIA MOTORS', 'HI-TOPIC STD DIESEL', 'Não informado', 0),
  ('ASIA MOTORS', 'HI-TOPIC VAN 2.7 DIESEL (FURGÃO)', 'Não informado', 0),
  ('ASIA MOTORS', 'JIPE ROCSTA GT 4X4 2.2 DIESEL', 'Não informado', 0),
  ('ASIA MOTORS', 'TOPIC CARGA 2.7 DIESEL (FURGÃO)', 'Não informado', 0),
  ('ASIA MOTORS', 'TOPIC LUXO DIESEL', 'Não informado', 0),
  ('ASIA MOTORS', 'TOPIC SUPER LUXO DIESEL', 'Não informado', 0),
  ('ASIA MOTORS', 'TOWNER COACH FULL', 'Não informado', 0),
  ('ASIA MOTORS', 'TOWNER FURGÃO', 'Não informado', 0),
  ('ASIA MOTORS', 'TOWNER GLASS VAN', 'Não informado', 0),
  ('ASIA MOTORS', 'TOWNER LUXO', 'Não informado', 0),
  ('ASIA MOTORS', 'TOWNER MULTIUSO 5P', 'Não informado', 0),
  ('ASIA MOTORS', 'TOWNER PANEL VAN', 'Não informado', 0),
  ('ASIA MOTORS', 'TOWNER PICK-UP', 'Não informado', 0),
  ('ASIA MOTORS', 'TOWNER SDX / DLX/ STD.', 'Não informado', 0),
  ('ASIA MOTORS', 'TOWNER SUPER LUXO', 'Não informado', 0),
  ('ASIA MOTORS', 'TOWNER TRUCK', 'Não informado', 0),
  ('ASTON MARTIN', 'DB9 COUPE 6.0 V12 510CV', 'Não informado', 0),
  ('ASTON MARTIN', 'DB9 VOLANTE 6.0 V12 470CV', 'Não informado', 0),
  ('ASTON MARTIN', 'RAPIDE 6.0 V12 477CV', 'Não informado', 0),
  ('ASTON MARTIN', 'RAPIDE S 6.0 V12 550CV', 'Não informado', 0),
  ('ASTON MARTIN', 'VANQUISH V12 6.0 565CV', 'Não informado', 0),
  ('ASTON MARTIN', 'VANTAGE 6.0 V12 510CV', 'Não informado', 0),
  ('ASTON MARTIN', 'VANTAGE COUPE 4.7 V8 425CV', 'Não informado', 0),
  ('ASTON MARTIN', 'VANTAGE ROADSTER 4.7 V8 420CV', 'Não informado', 0),
  ('ASTON MARTIN', 'VANTAGE S 6.0 V12 565CV', 'Não informado', 0),
  ('ASTON MARTIN', 'VANTAGE S COUPE 4.7 V8 430CV', 'Não informado', 0),
  ('ASTON MARTIN', 'VIRAGE COUPE 6.0 V12 490CV', 'Não informado', 0),
  ('ATALA', 'CALIFFONE 50CC', 'Não informado', 0),
  ('ATALA', 'MASTER 50CC', 'Não informado', 0),
  ('ATALA', 'SKEGIA 50CC', 'Não informado', 0),
  ('AUDI', '100 2.8 V6', 'Não informado', 0),
  ('AUDI', '100 2.8 V6 AVANT', 'Não informado', 0),
  ('AUDI', '100 S-4 2.2 AVANT TURBO', 'Não informado', 0),
  ('AUDI', '80 2.0', 'Não informado', 0),
  ('AUDI', '80 2.0 AVANT', 'Não informado', 0),
  ('AUDI', '80 2.6/ 2.8', 'Não informado', 0),
  ('AUDI', '80 2.6/2.8 AVANT', 'Não informado', 0),
  ('AUDI', '80 2.8 CABRIOLET', 'Não informado', 0),
  ('AUDI', '80 S2 AVANT', 'Não informado', 0),
  ('AUDI', 'A1 1.4 TFSI 122CV S-TRONIC 3P', 'Não informado', 0),
  ('AUDI', 'A1 2.0 TFSI QUATTRO 256CV 3P', 'Não informado', 0),
  ('AUDI', 'A1 SPORT 1.4 TFSI 185CV 3P S-TRONIC', 'Não informado', 0),
  ('AUDI', 'A1 SPORT. S EDITION 1.4 TFSI 5P S-TRONIC', 'Não informado', 0),
  ('AUDI', 'A1 SPORTBACK 1.4 TFSI 122CV 5P S-TRONIC', 'Não informado', 0),
  ('AUDI', 'A1 SPORTBACK 1.4 TFSI 185CV 5P S-TRONIC', 'Não informado', 0),
  ('AUDI', 'A1 SPORTBACK 1.8 TFSI 192CV 5P S-TRONIC', 'Não informado', 0),
  ('AUDI', 'A3 1.6 3P', 'Não informado', 0),
  ('AUDI', 'A3 1.6 3P AUT', 'Não informado', 0),
  ('AUDI', 'A3 1.6 5P', 'Não informado', 0),
  ('AUDI', 'A3 1.6 5P AUT', 'Não informado', 0),
  ('AUDI', 'A3 1.6 8V 102CV 3P', 'Não informado', 0),
  ('AUDI', 'A3 1.8 3P', 'Não informado', 0),
  ('AUDI', 'A3 1.8 3P AUT.', 'Não informado', 0),
  ('AUDI', 'A3 1.8 5P AUT.', 'Não informado', 0),
  ('AUDI', 'A3 1.8 5P MEC.', 'Não informado', 0),
  ('AUDI', 'A3 1.8 TURBO 180CV 3P AUT./ TIP.', 'Não informado', 0),
  ('AUDI', 'A3 1.8 TURBO 180CV 3P MEC.', 'Não informado', 0),
  ('AUDI', 'A3 1.8 TURBO 180CV 5P AUT./ TIP.', 'Não informado', 0),
  ('AUDI', 'A3 1.8 TURBO 180CV 5P MEC.', 'Não informado', 0),
  ('AUDI', 'A3 1.8 TURBO 3P AUT.', 'Não informado', 0),
  ('AUDI', 'A3 1.8 TURBO 3P MEC.', 'Não informado', 0),
  ('AUDI', 'A3 1.8 TURBO 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 15),
  ('AUDI', 'A3 1.8 TURBO 5P MEC.', 'Não informado', 0),
  ('AUDI', 'A3 CABRIOLET 1.8 16V TFSI 180CV S-TRONIC', 'Não informado', 0),
  ('AUDI', 'A3 SED. P. PLUS TECH 1.4 FLEX TFSI TIP', 'ESPECIAL V15 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('AUDI', 'A3 SEDAN 1.4 16V TB FSI S-TRONIC 4P', 'Não informado', 0),
  ('AUDI', 'A3 SEDAN 1.4 TB FSI FLEX TIPTRONIC 4P', 'Não informado', 0),
  ('AUDI', 'A3 SEDAN 2.0 TSFI 220CV S-TRONIC 4P', 'Não informado', 0),
  ('AUDI', 'A3 SEDAN1.8 16V TB FSI 180CV S-TRONIC 4P', 'Não informado', 0),
  ('AUDI', 'A3 SPORT 1.8 16V TFSI S-TRONIC 3P', 'Não informado', 0),
  ('AUDI', 'A3 SPORT 2.0 16V TFSI S TRONIC', 'Não informado', 0),
  ('AUDI', 'A3 SPORTBACK 1.4 TFSI S-TRONIC', 'Não informado', 0),
  ('AUDI', 'A3 SPORTBACK 1.6 8V 102CV 5P', 'Não informado', 0),
  ('AUDI', 'A3 SPORTBACK 1.8 16V TFSI S-TRONIC 5P', 'Não informado', 0),
  ('AUDI', 'A3 SPORTBACK 2.0 16V TFSI MEC.', 'Não informado', 0),
  ('AUDI', 'A3 SPORTBACK 2.0 16V TFSI S-TRONIC', 'Não informado', 0),
  ('AUDI', 'A4 1.8 AUT.', 'Não informado', 0),
  ('AUDI', 'A4 1.8 AVANT AUT.', 'Não informado', 0),
  ('AUDI', 'A4 1.8 AVANT MEC.', 'Não informado', 0),
  ('AUDI', 'A4 1.8 AVANT TURBO MEC.', 'Não informado', 0),
  ('AUDI', 'A4 1.8 AVANT TURBO TIP./ MULTITRONIC', 'Não informado', 0),
  ('AUDI', 'A4 1.8 MEC.', 'Não informado', 0),
  ('AUDI', 'A4 1.8 TIP./ MULTITRONIC TURBO', 'Não informado', 0),
  ('AUDI', 'A4 1.8 TURBO', 'Não informado', 0),
  ('AUDI', 'A4 2.0 16V TFSI 183/180CV MULTITRONIC', 'Não informado', 0),
  ('AUDI', 'A4 2.0 16V TFSI 200/ 214CV MULTITRONIC', 'Não informado', 0),
  ('AUDI', 'A4 2.0 16V TFSI QUATTRO STRONIC', 'Não informado', 0),
  ('AUDI', 'A4 2.0 20V 130CV MULTITRONIC 4P', 'Não informado', 0),
  ('AUDI', 'A4 2.0 AVANT 16V TFSI QUATTRO STRONIC', 'Não informado', 0),
  ('AUDI', 'A4 2.0 AVANT AMBI. 2.0 16V TFSI S TRONIC', 'Não informado', 0),
  ('AUDI', 'A4 2.0 AVANT TFSI 183/180CV MULTITRONI', 'Não informado', 0),
  ('AUDI', 'A4 2.0 AVANT TFSI 200/214CV MULTITRON.', 'Não informado', 0),
  ('AUDI', 'A4 2.4 30V AVANT MEC', 'Não informado', 0),
  ('AUDI', 'A4 2.4 30V AVANT TIP./MULTITRONIC', 'Não informado', 0),
  ('AUDI', 'A4 2.4 30V MEC', 'Não informado', 0),
  ('AUDI', 'A4 2.4 30V TIP./MULTITRONIC', 'Não informado', 0),
  ('AUDI', 'A4 2.4 AVANT V6 30V QUATTRO MEC', 'Não informado', 0),
  ('AUDI', 'A4 2.4 AVANT V6 30V QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A4 2.4 V6 30V QUATTRO MEC', 'Não informado', 0),
  ('AUDI', 'A4 2.4 V6 30V QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A4 2.8', 'Não informado', 0),
  ('AUDI', 'A4 2.8 30V MEC', 'Não informado', 0),
  ('AUDI', 'A4 2.8 30V TIPTRONIC/ AUT.', 'Não informado', 0),
  ('AUDI', 'A4 2.8 AVANT V6 12V', 'Não informado', 0),
  ('AUDI', 'A4 2.8 AVANT V6 30V MEC.', 'Não informado', 0),
  ('AUDI', 'A4 2.8 AVANT V6 30V QUATTRO MEC.', 'Não informado', 0),
  ('AUDI', 'A4 2.8 AVANT V6 30V QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A4 2.8 AVANT V6 30V TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A4 2.8 V6 30V QUATTRO MEC', 'Não informado', 0),
  ('AUDI', 'A4 2.8 V6 30V QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A4 3.0 30V 218CV MULTITRONIC 4P', 'Não informado', 0),
  ('AUDI', 'A4 3.0 30V 218CV QUATTRO TIPTRON./AUT 4P', 'Não informado', 0),
  ('AUDI', 'A4 3.0 AVANT 30V 218CV MULTITRONIC 5P', 'Não informado', 0),
  ('AUDI', 'A4 3.0 AVANT 30V 218CV QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A4 3.0 CABRIOLET 30V 218CV MULTITRONIC', 'Não informado', 0),
  ('AUDI', 'A4 3.2 FSI 24V 255CV MULTITRONIC', 'Não informado', 0),
  ('AUDI', 'A4 3.2 FSI 24V 269CV QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A4 3.2 FSI AVANT 24V 255CV MULTITRONIC', 'Não informado', 0),
  ('AUDI', 'A4 3.2 FSI AVANT 24V QUATTRO S TRONIC', 'Não informado', 0),
  ('AUDI', 'A4 3.2 FSI CABRIOLET 24V 255CV MULTITRON', 'Não informado', 0),
  ('AUDI', 'A4 AMBIENTE 2.0 TFSI 190CV S TRONIC', 'Não informado', 0),
  ('AUDI', 'A4 AMBITION 2.0 TFSI QUATTRO S TRONIC', 'Não informado', 0),
  ('AUDI', 'A4 ATTRACTION 2.0 TFSI 190CV S TRONIC', 'Não informado', 0),
  ('AUDI', 'A4 LAUNCH EDITION 2.0 TFSI 190CV S TRONI', 'Não informado', 0),
  ('AUDI', 'A5 3.2 FSI 24V 269CV MULTITRONIC', 'Não informado', 0),
  ('AUDI', 'A5 3.2 FSI V6 24V 269CV QUATTRO TIPTRONI', 'Não informado', 0),
  ('AUDI', 'A5 AMBIENTE SPORTB. 2.0 TFSI S TONIC', 'Não informado', 0),
  ('AUDI', 'A5 AMBIT. PLUS SPORT. 2.0 TFSI S TRONIC', 'Não informado', 0),
  ('AUDI', 'A5 AMBIT. SPORT. 2.0 TFSI S TRONIC', 'Não informado', 0),
  ('AUDI', 'A5 ATTRACTION SPORTB. 2.0 TFSI S TRONIC', 'Não informado', 0),
  ('AUDI', 'A5 CABRIOLET 2.0 TFSI QUATTRO STRONIC', 'Não informado', 0),
  ('AUDI', 'A5 COUPÊ 2.0 TFSI QUATTRO STRONIC', 'Não informado', 0),
  ('AUDI', 'A5 SPORTB. 2.0 16V TFSI QUAT. S-TRONIC', 'Não informado', 0),
  ('AUDI', 'A5 SPORTBACK 1.8 TFSI 170CV MULTI.', 'Não informado', 0),
  ('AUDI', 'A5 SPORTBACK 2.0 16V TFSI 180CV MULTI.', 'Não informado', 0),
  ('AUDI', 'A5 SPORTBACK 2.0 16V TFSI 211CV MULTI.', 'Não informado', 0),
  ('AUDI', 'A6 2.0 TFSI 252CV S TRONIC 4P', 'Não informado', 0),
  ('AUDI', 'A6 2.4 30V MEC', 'Não informado', 0),
  ('AUDI', 'A6 2.4 30V TIP./MULTITRONIC', 'Não informado', 0),
  ('AUDI', 'A6 2.4 AVANT 30V MEC.', 'Não informado', 0),
  ('AUDI', 'A6 2.4 AVANT 30V TIP./ MULTITRONIC', 'Não informado', 0),
  ('AUDI', 'A6 2.4 AVANT V6 30V QUATTRO MEC.', 'Não informado', 0),
  ('AUDI', 'A6 2.4 AVANT V6 30V QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A6 2.4 V6 30V QUATTRO MEC', 'Não informado', 0),
  ('AUDI', 'A6 2.4 V6 30V QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A6 2.7 30V AVANT TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A6 2.7 30V MEC.', 'Não informado', 0),
  ('AUDI', 'A6 2.7 AVANT QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A6 2.7 QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A6 2.8', 'Não informado', 0),
  ('AUDI', 'A6 2.8 30V MEC', 'Não informado', 0),
  ('AUDI', 'A6 2.8 30V TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A6 2.8 AVANT', 'Não informado', 0),
  ('AUDI', 'A6 2.8 AVANT 30V MEC', 'Não informado', 0),
  ('AUDI', 'A6 2.8 AVANT 30V TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A6 2.8 AVANT V6 30V QUATTRO MEC', 'Não informado', 0),
  ('AUDI', 'A6 2.8 AVANT V6 30V QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A6 2.8 V6 30V QUATTRO MEC', 'Não informado', 0),
  ('AUDI', 'A6 2.8 V6 30V QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A6 3.0 AVANT V6 30V 218CV MULTITRONIC 5P', 'Não informado', 0),
  ('AUDI', 'A6 3.0 AVANT. TB FSI V6 QUATTRO TIP. 5P', 'Não informado', 0),
  ('AUDI', 'A6 3.0 AVANT.TFSI V6 QUATTRO S TRONIC 5P', 'Não informado', 0),
  ('AUDI', 'A6 3.0 TB FSI V6 QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A6 3.0 TFSI V6 QUATTRO S TRONIC 4P', 'Não informado', 0),
  ('AUDI', 'A6 3.0 V6 30V 218CV MULTITRONIC 4P', 'Não informado', 0),
  ('AUDI', 'A6 3.2 FSI 24V 255CV MULTITRONIC', 'Não informado', 0),
  ('AUDI', 'A6 4.2 AVANT QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A6 4.2 QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A6 ALLROAD 3.0 TFSI V6 QUATTRO S TRONIC', 'Não informado', 0),
  ('AUDI', 'A7 SPORTBACK 2.0 TFSI S TRONIC', 'Não informado', 0),
  ('AUDI', 'A7 SPORTBACK 3.0 TFSI QUATTRO S TRONIC', 'Não informado', 0),
  ('AUDI', 'A8 3.0 TFSI 310CV QUATTRO TIPTRONIC 4P', 'Não informado', 0),
  ('AUDI', 'A8 4.0 TFSI QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A8 4.2 QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A8 4.2 V8 32V TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A8 6.0 W12 48V 450CV QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'A8 6.3 W12 48V QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'ALLROAD 2.7 30V QUATTRO TURBO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'AUDI A3 LM 150CV', 'ESPECIAL V15 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('AUDI', 'AVANT RS2', 'Não informado', 0),
  ('AUDI', 'Q3 1.4 TFSI 150CV S-TRONIC 5P', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('AUDI', 'Q3 2.0 TFSI QUAT. 170/180CV S-TRONIC 5P', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('AUDI', 'Q3 2.0 TFSI QUAT. 211/220CV S-TRONIC 5P', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('AUDI', 'Q5 2.0 16V TFSI 225CV QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'Q5 2.0 16V TFSI QUATTRO S TRONIC', 'Não informado', 0),
  ('AUDI', 'Q5 3.0 V6 TFSI 272CV QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'Q5 3.2 FSI V6 QUATTRO S TRONIC', 'Não informado', 0),
  ('AUDI', 'Q5 AMBIENTE 2.0 TFSI QUATTRO S TRONIC', 'Não informado', 0),
  ('AUDI', 'Q5 AMBITION 2.0 TFSI QUATTRO S TRONIC', 'Não informado', 0),
  ('AUDI', 'Q5 ATTRACTION 2.0 TFSI QUATTRO S TRONIC', 'Não informado', 0),
  ('AUDI', 'Q7 3.0 V6 TDI QUATTRO TIP. 5P DIESEL', 'Não informado', 0),
  ('AUDI', 'Q7 3.0 V6 TFSI 333CV QUATTRO TIP. 4P', 'Não informado', 0),
  ('AUDI', 'Q7 3.6 V6 284CV QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'Q7 4.2 V8 40V 350CV QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'R8 4.2 V8 426CV QUATTRO R-TRONIC', 'Não informado', 0),
  ('AUDI', 'R8 5.2 V10 QUATTRO R-TRONIC/S-TRONIC', 'Não informado', 0),
  ('AUDI', 'R8 GT 5.2 V10 560CV QUATTRO R-TRONIC', 'Não informado', 0),
  ('AUDI', 'R8 SPYDER 5.2 QUATTRO R-TRONIC/S-TRONIC', 'Não informado', 0),
  ('AUDI', 'RS Q3 2.5 TFSI QUATTRO 310CV S-TRONIC 5P', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('AUDI', 'RS3 SEDAN 2.5 TFSI QUATTRO S-TRONIC', 'Não informado', 0),
  ('AUDI', 'RS3 SPORTBACK 2.5 TFSI QUATTRO S-TRONIC', 'Não informado', 0),
  ('AUDI', 'RS4 2.7 AVANT V6 30V BI-TB QUATTRO 380CV', 'Não informado', 0),
  ('AUDI', 'RS4 4.2 AVANT 32V FSI QUATTRO S-TRONIC', 'Não informado', 0),
  ('AUDI', 'RS5 4.2 FSI V8 450CV QUATTRO S-TRON. 2P', 'Não informado', 0),
  ('AUDI', 'RS6 4.0 AVANT FSI BI-TB QUATTRO TIP. 5P', 'Não informado', 0),
  ('AUDI', 'RS6 4.2 450CV BI-TB QUATTRO TIPTRONIC 4P', 'Não informado', 0),
  ('AUDI', 'RS6 4.2 AVANT BI-TB QUATTRO TIPTRON. 5P', 'Não informado', 0),
  ('AUDI', 'RS6 5.0 AVANT.FSI V10 BI-TB QUATTRO TIP.', 'Não informado', 0),
  ('AUDI', 'RS6 5.0 FSI V10 BI-TB QUATTRO TIP.', 'Não informado', 0),
  ('AUDI', 'RS7 SPORTBACK 4.0 TFSI QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'S Q5 3.0 V6 TFSI 354CV QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'S3 1.8 225CV TURBO QUATTRO', 'Não informado', 0),
  ('AUDI', 'S3 SEDAN 2.0 TFSI QUATTRO 286CV S-TRONIC', 'Não informado', 0),
  ('AUDI', 'S3 SPORTBACK 2.0 TFSI QUATTRO S TRONIC', 'Não informado', 0),
  ('AUDI', 'S4 2.7 AVANT TURBO QUATTRO', 'Não informado', 0),
  ('AUDI', 'S4 2.7 TURBO QUATTRO MEC.', 'Não informado', 0),
  ('AUDI', 'S4 3.0 AVANT TFSI V6 24V QUATTRO STRONIC', 'Não informado', 0),
  ('AUDI', 'S4 3.0 TFSI V6 24V QUATTRO STRONIC', 'Não informado', 0),
  ('AUDI', 'S4 4.2 AVANT V8 40V 344CV QUATTRO TIPT.', 'Não informado', 0),
  ('AUDI', 'S4 4.2 V8 40V 344CV QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'S5 CABRIOLET 3.0 TFSI QUATTRO STRONIC', 'Não informado', 0),
  ('AUDI', 'S5 COUPÊ 3.0 TFSI QUATTRO STRONIC', 'Não informado', 0),
  ('AUDI', 'S5 SPORTBACK 3.0 TFSI QUATTRO STRONIC', 'Não informado', 0),
  ('AUDI', 'S6 2.2 20V TB', 'Não informado', 0),
  ('AUDI', 'S6 2.2 AVANT 20V TB', 'Não informado', 0),
  ('AUDI', 'S6 4.0 TFSI 450CV QUATTRO S-TRONIC 4P', 'Não informado', 0),
  ('AUDI', 'S6 4.2 AVANT V8 40V QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'S6 4.2 V8 40V QUATTRO MEC', 'Não informado', 0),
  ('AUDI', 'S6 4.2 V8 40V QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'S6 5.2 AVANT FSI V10 435CV QUATTRO TIPTR', 'Não informado', 0),
  ('AUDI', 'S6 5.2 FSI V10 435CV QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'S6 PLUS 4.2 AVANT V8 32V', 'Não informado', 0),
  ('AUDI', 'S6 PLUS 4.2 V8 32V', 'Não informado', 0),
  ('AUDI', 'S7 4.0 TFSI 420CV QUATTRO S-TRONIC', 'Não informado', 0),
  ('AUDI', 'S8 4.0 TFSI 520CV QUATTRO TIPTRONIC 4P', 'Não informado', 0),
  ('AUDI', 'S8 4.2 MEC', 'Não informado', 0),
  ('AUDI', 'S8 4.2 QUATTRO MEC.', 'Não informado', 0),
  ('AUDI', 'S8 4.2 QUATTRO TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'S8 4.2 TIPTRONIC', 'Não informado', 0),
  ('AUDI', 'TT 1.8 TB 180CV', 'Não informado', 0),
  ('AUDI', 'TT 1.8 TB QUATTRO 225CV', 'Não informado', 0),
  ('AUDI', 'TT 2.0 16V TFSI S-TRONIC', 'Não informado', 0),
  ('AUDI', 'TT ROADSTER 1.8 TB QUATTRO 225CV (CONV.)', 'Não informado', 0),
  ('AUDI', 'TT ROADSTER 2.0 16V TFSI S-TRONIC', 'Não informado', 0),
  ('AUDI', 'TTRS 2.5 TB FSI QUATTRO S TRONIC', 'Não informado', 0),
  ('AUDI', 'TTRS ROADSTER 2.5 TB FSI QUATTRO STRONIC', 'Não informado', 0),
  ('AUDI', 'TTS 2.0 TFSI QUATTRO S TRONIC', 'Não informado', 0),
  ('AUDI', 'TTS ROADSTER 2.0 TB FSI QUATTRO S TRONIC', 'Não informado', 0),
  ('AVELLOZ', 'AZ 01 50CC 32000', 'Não informado', 0),
  ('BAJAJ', 'CHAMPION 45 100CC', 'Não informado', 0),
  ('BAJAJ', 'CLASSIC 150CC', 'Não informado', 0),
  ('BAJAJ', 'DOMINAR 160', 'Não informado', 0),
  ('BAJAJ', 'DOMINAR 200', 'Não informado', 0),
  ('BAJAJ', 'DOMINAR 400', 'Não informado', 0),
  ('BECKER', 'SR / BECKER JUMBO CPC', 'Não informado', 0),
  ('BECKER', 'SR / BECKER JUNBO CR', 'Não informado', 0),
  ('BEE', 'BEE 125CV MONACO', 'Não informado', 0),
  ('BEE', 'BEE 200CC ROYALE', 'Não informado', 0),
  ('BEE', 'BEE 50CC', 'Não informado', 0),
  ('BENELLI', 'TNT 1130 SPORT EVO', 'Não informado', 0),
  ('BENELLI', 'TNT 899', 'Não informado', 0),
  ('BENELLI', 'TNT CAFÉ 1130 RACER', 'Não informado', 0),
  ('BENELLI', 'TRE 1130 K', 'Não informado', 0),
  ('BENELLI', 'TRE 1130 K AMAZONAS', 'Não informado', 0),
  ('BENELLI', 'TRE 899 K', 'Não informado', 0),
  ('BEPOBUS', 'NÀSCERE FRETAMENTO (DIESEL)(E5)', 'Não informado', 0),
  ('BEPOBUS', 'NÀSCERE RODOVIÁRIO (DIESEL)(E5)', 'Não informado', 0),
  ('BEPOBUS', 'NÀSCERE URBANO (DIESEL)(E5)', 'Não informado', 0),
  ('BETA', 'MX-50 CROSS 50CC', 'Não informado', 0),
  ('BETA', 'MX-50 ENDURO 50CC', 'Não informado', 0),
  ('BIMOTA', 'BICICLETA ELETRICA', 'Não informado', 0),
  ('BIMOTA', 'DB4 904CC', 'Não informado', 0),
  ('BIMOTA', 'DB5R 1078CC', 'Não informado', 0),
  ('BIMOTA', 'DB6 DELIRIO 1078CC', 'Não informado', 0),
  ('BIMOTA', 'DB6R DELIRIO 1078CC', 'Não informado', 0),
  ('BIMOTA', 'DB7 1099CC', 'Não informado', 0),
  ('BIMOTA', 'MANTRA 904CC', 'Não informado', 0),
  ('BIMOTA', 'SBR8 SPECIAL 996CC', 'Não informado', 0),
  ('BIMOTA', 'TESI 3D 1100CC ( ALUMÍNIO)', 'Não informado', 0),
  ('BIMOTA', 'TESI 3D 1100CC ( CARBONO )', 'Não informado', 0),
  ('BISELLI', 'R / BISELLI', 'Não informado', 0),
  ('BMW', '116IA 1.6 TB 16V 136CV 5P', 'Não informado', 0),
  ('BMW', '118 IA 2.0 16V 136CV 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('BMW', '118IA 2.0 16V 136CV 3P', 'Não informado', 0),
  ('BMW', '118IA 2.0 16V 136CV 5P', 'Não informado', 0),
  ('BMW', '118IA FULL 1.6 TB 16V 170CV 5P', 'Não informado', 0),
  ('BMW', '118IA/ URBAN/SPORT 1.6 TB 16V 170CV 5P', 'Não informado', 0),
  ('BMW', '120I 2.0 16V 150CV/ 156CV 5P', 'Não informado', 0),
  ('BMW', '120IA 2.0 16V 150CV/ 156CV 5P', 'Não informado', 0),
  ('BMW', '120IA 2.0 16V 156CV 3P', 'Não informado', 0),
  ('BMW', '120IA CABRIO 2.0 16V 156CV 2P', 'Não informado', 0),
  ('BMW', '120IA SPORT 2.0 ACTIVEFLEX 16V AUT.', 'Não informado', 0),
  ('BMW', '125I M SPORT/ACTIVE FLEX 2.0 TB AUT. 5P', 'Não informado', 0),
  ('BMW', '130I 3.0 24V 265CV 5P', 'Não informado', 0),
  ('BMW', '130IA 3.0 24V 265CV 3P', 'Não informado', 0),
  ('BMW', '130IA 3.0 24V 265CV 5P', 'Não informado', 0),
  ('BMW', '135IA COUPÉ 3.0 24V 306CV', 'Não informado', 0),
  ('BMW', '220ITOURER ACTIVE FLEX 2.0 TB AUT.', 'Não informado', 0),
  ('BMW', '225I ACTIVE TOURER SPORT 2.0 TB AUT.', 'Não informado', 0),
  ('BMW', '316 (TODAS)', 'Não informado', 0),
  ('BMW', '316I 1.6 TB 16V 136CV 4P', 'Não informado', 0),
  ('BMW', '318I CABRIO 1.8 16V', 'Não informado', 0),
  ('BMW', '318I/IA 1.8 16V', 'Não informado', 0),
  ('BMW', '318I/IA COMPACT 1.8 16V', 'Não informado', 0),
  ('BMW', '318IA 2.0 16V 136CV 5P', 'Não informado', 0),
  ('BMW', '318IS/ISA 1.9 16V', 'Não informado', 0),
  ('BMW', '318TI COMPACT MEC', 'Não informado', 0),
  ('BMW', '318TI/TIA COMPACT 1.9 16V', 'Não informado', 0),
  ('BMW', '320I', 'Não informado', 0),
  ('BMW', '320I ACTIVE FLEX', 'Não informado', 0),
  ('BMW', '320IA', 'Não informado', 0),
  ('BMW', '320IA 2.0 TB M SPORT ACTIVEFLEX 16V 4P', 'Não informado', 0),
  ('BMW', '320IA 2.0 TURBO/ACTIVEFLEX 16V 184CV 4P', 'Não informado', 0),
  ('BMW', '320IA GT SPORT 2.0 TURBO 16V 184CV 5P', 'Não informado', 0),
  ('BMW', '320IA MODERN/SPORT TB 2.0/A.FLEX 16V 4P', 'Não informado', 0),
  ('BMW', '323CI COUPÊ', 'Não informado', 0),
  ('BMW', '323CIA COUPÊ', 'Não informado', 0),
  ('BMW', '323I 2.5 24V', 'Não informado', 0),
  ('BMW', '323I CONFORT', 'Não informado', 0),
  ('BMW', '323I SPORT', 'Não informado', 0),
  ('BMW', '323I TOURING', 'Não informado', 0),
  ('BMW', '323I/IA EXCLUSIVE', 'Não informado', 0),
  ('BMW', '323IA 2.5 24V', 'Não informado', 0),
  ('BMW', '323IA CONFORT', 'Não informado', 0),
  ('BMW', '323IA ENTRY SEDAN', 'Não informado', 0),
  ('BMW', '323IA SPORT', 'Não informado', 0),
  ('BMW', '323IA TOP SEDAN', 'Não informado', 0),
  ('BMW', '323IA TOURING', 'Não informado', 0),
  ('BMW', '323TI COMPACT', 'Não informado', 0),
  ('BMW', '323TI COMPACT SPORT', 'Não informado', 0),
  ('BMW', '323TIA COMPACT TOP', 'Não informado', 0),
  ('BMW', '325I', 'Não informado', 0),
  ('BMW', '325I/IA CABRIO', 'Não informado', 0),
  ('BMW', '325IA', 'Não informado', 0),
  ('BMW', '325IA 2.5 24V PROTECTION', 'Não informado', 0),
  ('BMW', '325IA COUPÉ 2.5 24V 2P', 'Não informado', 0),
  ('BMW', '325IA TOURING', 'Não informado', 0),
  ('BMW', '328I EXCLUSIVE 2.8 24V', 'Não informado', 0),
  ('BMW', '328I TOURING/SPORT', 'Não informado', 0),
  ('BMW', '328I/IA ( MODELO ANTIGO )', 'Não informado', 0),
  ('BMW', '328I/IA (NOVO MODELO)', 'Não informado', 0),
  ('BMW', '328I/IA CABRIO', 'Não informado', 0),
  ('BMW', '328IA 2.0 TB/2.0 TB FLEX 16V 4P', 'Não informado', 0),
  ('BMW', '328IA EXCLUSIVE 2.8 24V', 'Não informado', 0),
  ('BMW', '328IA GT M SPORT 2.0 TURBO 16V 245CV 5P', 'Não informado', 0),
  ('BMW', '328IA LUXURY/MODERN 2.0 TB 16V 4P', 'Não informado', 0),
  ('BMW', '328IA M SPORT 2.0 16V FLEX 4P', 'Não informado', 0),
  ('BMW', '328IA PLUS 2.0 TB 16V 245CV 4P', 'Não informado', 0),
  ('BMW', '328IA SPORT 2.0 16V/2.0 16V FLEX 4P', 'Não informado', 0),
  ('BMW', '328IA TOURING/SPORT', 'Não informado', 0),
  ('BMW', '330CI CABRIOLET', 'Não informado', 0),
  ('BMW', '330CIA CABRIOLET', 'Não informado', 0),
  ('BMW', '330I MOTORSPORT 3.0 24V 4P', 'Não informado', 0),
  ('BMW', '330IA EXCLUSIVE 3.0 24V 4P', 'Não informado', 0),
  ('BMW', '330IA MOTORSPORT 4P', 'Não informado', 0),
  ('BMW', '330IA TOP 4P', 'Não informado', 0),
  ('BMW', '335I 3.0 ACTIVEHYBRID 3', 'Não informado', 0),
  ('BMW', '335IA 3.0 24V 306CV', 'Não informado', 0),
  ('BMW', '335IA CABRIOLET 3.0 24V 306CV', 'Não informado', 0),
  ('BMW', '335IA M SPORT 3.0 24V 306CV 4P', 'Não informado', 0),
  ('BMW', '335IA SPORT 3.0 24V 306CV 4P', 'Não informado', 0),
  ('BMW', '420I CABRIOLET SPORT 2.0 TB 184CV 2P', 'Não informado', 0),
  ('BMW', '428I CABRIOLET SPORT 2.0 TB 245CV 2P', 'Não informado', 0),
  ('BMW', '428I GRAN COUPE M SPORT 2.0 TB 245CV', 'Não informado', 0),
  ('BMW', '428I GRAN COUPE SPORT 2.0 TB 245CV', 'Não informado', 0),
  ('BMW', '430I CAB. SPORT LIMITED ED.2.0 TB 2P', 'Não informado', 0),
  ('BMW', '430I CABRIOLET SPORT 2.0 TB 252CV 2P', 'Não informado', 0),
  ('BMW', '430I GRAN COUPé M SPORT TB 5P', 'Não informado', 0),
  ('BMW', '435IA M SPORT COUPE 3.0 24V 306CV 2P', 'Não informado', 0),
  ('BMW', '520I 2.0 16V', 'Não informado', 0),
  ('BMW', '525I/IA', 'Não informado', 0),
  ('BMW', '525I/IA TOURING', 'Não informado', 0),
  ('BMW', '528I/IA', 'Não informado', 0),
  ('BMW', '528IA 2.0 TURBO 16V 245CV 4P', 'Não informado', 0),
  ('BMW', '528IA HIGH', 'Não informado', 0),
  ('BMW', '528IA M SPORT 2.0 TURBO 16V 245CV 4P', 'Não informado', 0),
  ('BMW', '528IA TOURING', 'Não informado', 0),
  ('BMW', '530I M SPORT 2.0 TURBO 252CV AUT.', 'Não informado', 0),
  ('BMW', '530I/IA', 'Não informado', 0),
  ('BMW', '530I/IA TOURING', 'Não informado', 0),
  ('BMW', '535I/IA 3.5 24V', 'Não informado', 0),
  ('BMW', '535IA 3.0 24CV 306CV BI-TURBO', 'Não informado', 0),
  ('BMW', '535IA GT 3.0 306CV BI-TURBO', 'Não informado', 0),
  ('BMW', '535IA M SPORT 3.0 24V 306CV BI-TURBO', 'Não informado', 0),
  ('BMW', '540I', 'Não informado', 0),
  ('BMW', '540I M SPORT 3.0 TURBO 340CV AUT.', 'Não informado', 0),
  ('BMW', '540I/IA TOURING', 'Não informado', 0),
  ('BMW', '540IA', 'Não informado', 0),
  ('BMW', '540IA MOTORSPORT', 'Não informado', 0),
  ('BMW', '540IA PROTECTION', 'Não informado', 0),
  ('BMW', '540ITA', 'Não informado', 0),
  ('BMW', '545IA 4.4 32V V8 333CV', 'Não informado', 0),
  ('BMW', '550IA 4.4 32V 407CV BI-TURBO', 'Não informado', 0),
  ('BMW', '550IA 4.8 32V', 'Não informado', 0),
  ('BMW', '550IA LIMITED SPORT EDITION 4.8 32V', 'Não informado', 0),
  ('BMW', '550IA SECURITY 4.8 32V', 'Não informado', 0),
  ('BMW', '640I GRAN COUPE 3.0 320CV 4P', 'Não informado', 0),
  ('BMW', '645CI CABRIOLET 4.4 V8 32V 333CV', 'Não informado', 0),
  ('BMW', '645IA 4.4 V8 32V 333CV', 'Não informado', 0),
  ('BMW', '650CI CABRIOLET 4.4 407CV BI-TURBO', 'Não informado', 0),
  ('BMW', '650CI CABRIOLET 4.8 V8 32V 360CV', 'Não informado', 0),
  ('BMW', '650I GRAN COUPE 4.4 V8 450CV 4P', 'Não informado', 0),
  ('BMW', '650IA 4.4 407CV BI-TURBO', 'Não informado', 0),
  ('BMW', '650IA 4.8 V8 32V 360CV', 'Não informado', 0),
  ('BMW', '650IA LIMITED SPORT EDITION 4.8 32V', 'Não informado', 0),
  ('BMW', '730I 3.0 32V', 'Não informado', 0),
  ('BMW', '730IA 3.0 32V', 'Não informado', 0),
  ('BMW', '735I/IA 3.5 32V', 'Não informado', 0),
  ('BMW', '740I', 'Não informado', 0),
  ('BMW', '740IA', 'Não informado', 0),
  ('BMW', '740IL/ILA HIGHLINE 4.4 32V', 'Não informado', 0),
  ('BMW', '740ILA PROTECTION', 'Não informado', 0),
  ('BMW', '745IA 4.4 V8 32V 333CV', 'Não informado', 0),
  ('BMW', '750I', 'Não informado', 0),
  ('BMW', '750I M SPORT SEDAN 4.4 V8 450CV AUT.', 'Não informado', 0),
  ('BMW', '750IA', 'Não informado', 0),
  ('BMW', '750IL HIGHLINE 5.4 24V', 'Não informado', 0),
  ('BMW', '750IL M SPORT SEDAN 4.4 V8 450CV AUT.', 'Não informado', 0),
  ('BMW', '750ILA 4.4 ACTIVEHYBRID 7', 'Não informado', 0),
  ('BMW', '760IL 6.0 V12 445CV/544CV', 'Não informado', 0),
  ('BMW', '840CI', 'Não informado', 0),
  ('BMW', '840CIA', 'Não informado', 0),
  ('BMW', '850CI/CIA 5.0 24V', 'Não informado', 0),
  ('BMW', '850CI/CIA 5.4 24V', 'Não informado', 0),
  ('BMW', '850CSI 5.6 24V', 'Não informado', 0),
  ('BMW', '850I 5.0 24V', 'Não informado', 0),
  ('BMW', 'C 600 SPORT', 'Não informado', 0),
  ('BMW', 'C 650 GT', 'Não informado', 0),
  ('BMW', 'F 650', 'Não informado', 0),
  ('BMW', 'F 650 CS', 'Não informado', 0),
  ('BMW', 'F 650 GS/DAKAR', 'Não informado', 0),
  ('BMW', 'F 700 GS', 'Não informado', 0),
  ('BMW', 'F 800 GS 798CC', 'Não informado', 0),
  ('BMW', 'F 800 GS ADVENTURE', 'Não informado', 0),
  ('BMW', 'F 800 GS TRIPLE BLACK/ TROPHY', 'Não informado', 0),
  ('BMW', 'F 800 R', 'Não informado', 0),
  ('BMW', 'F 800 S 798CC', 'Não informado', 0),
  ('BMW', 'G 310 GS', 'Não informado', 0),
  ('BMW', 'G 310 R', 'Não informado', 0),
  ('BMW', 'G 450 X', 'Não informado', 0),
  ('BMW', 'G 650 GS', 'Não informado', 0),
  ('BMW', 'G 650 GS SERTÃO', 'Não informado', 0),
  ('BMW', 'G 650 X CHALLENGE', 'Não informado', 0),
  ('BMW', 'G 650 X COUNTRY', 'Não informado', 0),
  ('BMW', 'G 650 X MOTO', 'Não informado', 0),
  ('BMW', 'I3 REX E DRIVE 170CV AUT.(ELÉTRICO)', 'Não informado', 0),
  ('BMW', 'I3 REX E DRIVE FULL 170CV AUT.(ELÉTRICO)', 'Não informado', 0),
  ('BMW', 'I8 E-DRIVE 1.5 TB 12V 362CV AUT.', 'Não informado', 0),
  ('BMW', 'K 1100 LT', 'Não informado', 0),
  ('BMW', 'K 1100 RS', 'Não informado', 0),
  ('BMW', 'K 1200 GT', 'Não informado', 0),
  ('BMW', 'K 1200 LT', 'Não informado', 0),
  ('BMW', 'K 1200 R', 'Não informado', 0),
  ('BMW', 'K 1200 RS', 'Não informado', 0),
  ('BMW', 'K 1200 S', 'Não informado', 0),
  ('BMW', 'K 1300 GT', 'Não informado', 0),
  ('BMW', 'K 1300 R', 'Não informado', 0),
  ('BMW', 'K 1300 S', 'Não informado', 0),
  ('BMW', 'K 1600 BAGGER', 'Não informado', 0),
  ('BMW', 'K 1600 GT', 'Não informado', 0),
  ('BMW', 'K 1600 GTL', 'Não informado', 0),
  ('BMW', 'K 1600 GTL EXCLUSIVE', 'Não informado', 0),
  ('BMW', 'M 135I 3.0 24V 320CV', 'Não informado', 0),
  ('BMW', 'M 235I COUPE 3.0 24V 326CV', 'Não informado', 0),
  ('BMW', 'M 240I COUPE 3.0 24V 340CV 2P', 'Não informado', 0),
  ('BMW', 'M ROADSTER', 'Não informado', 0),
  ('BMW', 'M1 COUPÊ 3.0 24V 340CV', 'Não informado', 0),
  ('BMW', 'M140I 3.0  24V 340CV 5P', 'Não informado', 0),
  ('BMW', 'M2 COUPE 3.0 TURBO 24V 370CV', 'Não informado', 0),
  ('BMW', 'M3 3.2 24V', 'Não informado', 0),
  ('BMW', 'M3 CABRIO 3.0 24V', 'Não informado', 0),
  ('BMW', 'M3 CABRIO 4.0 32V', 'Não informado', 0),
  ('BMW', 'M3 COUPÊ 3.0 24V 255CV', 'Não informado', 0),
  ('BMW', 'M3 COUPÊ 3.0 V6 24V 282CV', 'Não informado', 0),
  ('BMW', 'M3 COUPÊ 4.0 32V', 'Não informado', 0),
  ('BMW', 'M3 SEDAN 3.0 BI-TURBO 24V 4P', 'Não informado', 0),
  ('BMW', 'M3 SEDAN 4.0 32V', 'Não informado', 0),
  ('BMW', 'M4 CABRIOLET 3.0 BI-TURBO 24V 431CV 2P', 'Não informado', 0),
  ('BMW', 'M4 COUPE 3.0 BI-TURBO 24V 431CV 2P', 'Não informado', 0),
  ('BMW', 'M5 3.8/TOURING 3.8 24V', 'Não informado', 0),
  ('BMW', 'M5 4.4 560CV BI-TURBO AUT.', 'Não informado', 0),
  ('BMW', 'M5 5.0 32V/ 40V', 'Não informado', 0),
  ('BMW', 'M6 5.0 V10 40V 507CV', 'Não informado', 0),
  ('BMW', 'M6 COUPE 4.4 BI-TURBO V8 32V', 'Não informado', 0),
  ('BMW', 'M6 GRAN COUPE 4.4 BI-TURBO V8 32V 560CV', 'Não informado', 0),
  ('BMW', 'R 1100 GS', 'Não informado', 0),
  ('BMW', 'R 1100 GS-75', 'Não informado', 0),
  ('BMW', 'R 1100 R', 'Não informado', 0),
  ('BMW', 'R 1100 RS', 'Não informado', 0),
  ('BMW', 'R 1100 RT', 'Não informado', 0),
  ('BMW', 'R 1100 S', 'Não informado', 0),
  ('BMW', 'R 1150 GS', 'Não informado', 0),
  ('BMW', 'R 1150 GS ADVENTURE', 'Não informado', 0),
  ('BMW', 'R 1150 R/ R 1150 R ROCKSTER', 'Não informado', 0),
  ('BMW', 'R 1150 RS', 'Não informado', 0),
  ('BMW', 'R 1150 RT', 'Não informado', 0),
  ('BMW', 'R 1200 C AVANTGARD', 'Não informado', 0),
  ('BMW', 'R 1200 C CLASSIC', 'Não informado', 0),
  ('BMW', 'R 1200 C INDEPENDENT', 'Não informado', 0),
  ('BMW', 'R 1200 CL', 'Não informado', 0),
  ('BMW', 'R 1200 GS', 'Não informado', 0),
  ('BMW', 'R 1200 GS ADVENTURE', 'Não informado', 0),
  ('BMW', 'R 1200 GS ADVENTURE TRIPLE BLACK', 'Não informado', 0),
  ('BMW', 'R 1200 GS HP2', 'Não informado', 0),
  ('BMW', 'R 1200 GS RALLYE', 'Não informado', 0),
  ('BMW', 'R 1200 GS TRIPLE BLACK', 'Não informado', 0),
  ('BMW', 'R 1200 NINE T', 'Não informado', 0),
  ('BMW', 'R 1200 R/ R CLASSIC', 'Não informado', 0),
  ('BMW', 'R 1200 RT', 'Não informado', 0),
  ('BMW', 'S 1000 R', 'Não informado', 0),
  ('BMW', 'S 1000 RR', 'Não informado', 0),
  ('BMW', 'S 1000 XR', 'Não informado', 0),
  ('BMW', 'S1000 RR HP4 COMPETITION', 'Não informado', 0),
  ('BMW', 'S1000 RR HP4 STREET', 'Não informado', 0),
  ('BMW', 'X1 SDRIVE 18I 2.0 16V 4X2 AUT.', 'Não informado', 0),
  ('BMW', 'X1 SDRIVE 20I 2.0/2.0 TB ACTI.FLEX AUT.', 'Não informado', 0),
  ('BMW', 'X1 XDRIVE 25I SPORT 2.0 AUT.', 'Não informado', 0),
  ('BMW', 'X1 XDRIVE 28I 2.0 TURBO 16V 4X4 AUT.', 'Não informado', 0),
  ('BMW', 'X1 XDRIVE 28I 3.0 24V 4X4 AUT.', 'Não informado', 0),
  ('BMW', 'X1 XDRIVE 28I SPORT 2.0 ACTIVEFLEX AUT.', 'Não informado', 0),
  ('BMW', 'X3 FAMILY 2.5 24V 192CV/ 218CV', 'Não informado', 0),
  ('BMW', 'X3 FAMILY 3.0 24V 231CV', 'Não informado', 0),
  ('BMW', 'X3 SPORT 2.5 24V 192CV/ 218CV', 'Não informado', 0),
  ('BMW', 'X3 SPORT 3.0 24V 231CV', 'Não informado', 0),
  ('BMW', 'X3 XDRIVE 20I 2.0/X-LINE BI-TB184CV AUT.', 'Não informado', 0),
  ('BMW', 'X3 XDRIVE 28I 2.0 TURBO 245CV AUT.', 'Não informado', 0),
  ('BMW', 'X3 XDRIVE 28I 3.0 258CV', 'Não informado', 0),
  ('BMW', 'X3 XDRIVE 35I/M-SPORT 3.0 306CV BI-TURBO', 'Não informado', 0),
  ('BMW', 'X4 XDRIVE 28I X-LINE 2.0 TURBO 245CV AUT', 'Não informado', 0),
  ('BMW', 'X4 XDRIVE 35I M-SPORT 3.0 TB 306CV AUT.', 'Não informado', 0),
  ('BMW', 'X5 3.0 4X4', 'Não informado', 0),
  ('BMW', 'X5 4.4 4X4', 'Não informado', 0),
  ('BMW', 'X5 4.8 4X4 V8 32V 360CV', 'Não informado', 0),
  ('BMW', 'X5 ENDURANCE 4.8IS 4X4 V8 32V 355CV AUT.', 'Não informado', 0),
  ('BMW', 'X5 M 4.4 4X4 V8 32V 555CV BI-TURBO AUT.', 'Não informado', 0),
  ('BMW', 'X5 SECURITY 4.4 4X4 V8 32V', 'Não informado', 0),
  ('BMW', 'X5 SECURITY 4.8IS 4X4 V8 32V 355CV AUT.', 'Não informado', 0),
  ('BMW', 'X5 SPORT 4.4 4X4 V8 32V', 'Não informado', 0),
  ('BMW', 'X5 SPORT 4.8 4X4 V8 32V 355CV', 'Não informado', 0),
  ('BMW', 'X5 XDRIVE 30D 3.0 258CV DIESEL', 'Não informado', 0),
  ('BMW', 'X5 XDRIVE 30D FULL 3.0 258CV DIESEL', 'Não informado', 0),
  ('BMW', 'X5 XDRIVE 35I 3.0 306CV BI-TURBO', 'Não informado', 0),
  ('BMW', 'X5 XDRIVE 35I FULL 3.0 306CV BI-TURBO', 'Não informado', 0),
  ('BMW', 'X5 XDRIVE 50I 4.4 BI-TURBO', 'Não informado', 0),
  ('BMW', 'X5 XDRIVE 50I M SPORT 4.4 BI-TURBO', 'Não informado', 0),
  ('BMW', 'X5 XDRIVE 50I SECURITY 4.4 BI-TURBO', 'Não informado', 0),
  ('BMW', 'X5 XDRIVE M50D 3.0 381CV DIESEL', 'Não informado', 0),
  ('BMW', 'X6 M 4.4 4X4 V8 32V 555CV BI-TURBO AUT.', 'Não informado', 0),
  ('BMW', 'X6 XDRIVE 35I 3.0 306CV BI-TURBO', 'Não informado', 0),
  ('BMW', 'X6 XDRIVE 50I 4.4 407CV BI-TURBO', 'Não informado', 0),
  ('BMW', 'X6 XDRIVE 50I M SPORT 4.4 BI-TURBO', 'Não informado', 0),
  ('BMW', 'Z3 2.8 AUT', 'Não informado', 0),
  ('BMW', 'Z3 2.8 MEC', 'Não informado', 0),
  ('BMW', 'Z3 3.0 24V ROADSTER 2P', 'Não informado', 0),
  ('BMW', 'Z3 ROADSTER 1.9 MEC', 'Não informado', 0),
  ('BMW', 'Z3 ROADSTER 2.8', 'Não informado', 0),
  ('BMW', 'Z3 ROADSTER M 3.2', 'Não informado', 0),
  ('BMW', 'Z4 COUPÉ M 3.2 V6 24V 343CV', 'Não informado', 0),
  ('BMW', 'Z4 ROADSTER 2.0 150CV 2P', 'Não informado', 0),
  ('BMW', 'Z4 ROADSTER 3.0 V6 24V AUT.', 'Não informado', 0),
  ('BMW', 'Z4 ROADSTER M 3.2 V6 24V 343CV', 'Não informado', 0),
  ('BMW', 'Z4 ROADSTER SDRIVE 20I 2.0 16V 2P AUT', 'Não informado', 0),
  ('BMW', 'Z4 ROADSTER SDRIVE 23I 2.5 24V 204CV 2P', 'Não informado', 0),
  ('BMW', 'Z4 ROADSTER SDRIVE 35I 3.0 24V 306CV 2P', 'Não informado', 0),
  ('BMW', 'Z4 ROADSTER SPORT 3.0 24V 231CV AUT.', 'Não informado', 0),
  ('BMW', 'Z8 5.0 V8', 'Não informado', 0),
  ('BONANO', 'SR / BONANO SRF3MN TE', 'Não informado', 0),
  ('BOREAL', 'SR / BOREAL SRF3E TE', 'Não informado', 0),
  ('BRANDY', 'ELEGANT 50', 'Não informado', 0),
  ('BRANDY', 'FOSTI 125', 'Não informado', 0),
  ('BRANDY', 'PISTA 70', 'Não informado', 0),
  ('BRANDY', 'TURBO PLUS', 'Não informado', 0),
  ('BRANDY', 'ZANELLA NEW FIRE 50 FULL', 'Não informado', 0),
  ('BRAVA', 'YB 150T-15 150CC', 'Não informado', 0),
  ('BRM', 'BUGGY 1.6', 'Não informado', 0),
  ('BRM', 'BUGGY WAY TURING/ LUXO 1.6 8V 69CV', 'Não informado', 0),
  ('BRP', 'CAN-AM DS 250 EFI 4X2 QUADR.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER 400 4X4 QUADR.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER L 450 4X4 QUADRICICLO', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER L 500 4X4 QUADRICICLO', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER L 570 4X4 QUADRICICLO', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER L DPS 500 4X4 QUAD.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER L DPS 570 4X4 QUADR.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER L MAX 450 4X4 QUAD.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER L MAX DPS 500 4X4 QUAD.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER L X MR 570 4X4 QUADR.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER MAX  XT 850 4X4 QUADR.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER MAX 400 4X4 QUADR.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER MAX DPS 570 4X4 QUADRI.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER MAX L.1000 4X4 QUADR.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER MAX XT 400 4X4 QUADR.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER MAX XT 650 4X4 QUADR.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER MAX XT 800R 4X4 QUADR.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER MAX XT-P 800 4X4 QUADR.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER MAXXT-P 1000 4X4 QUADR.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER X MR 1000 4X4 QUADR.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER X MR 650 4X4 QUADR.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER XT 1000 6X6', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER XT 650 4X4 QUADR.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER XT-P 800 4X4 QUADR.', 'Não informado', 0),
  ('BRP', 'CAN-AM OUTLANDER XTP1000 4X4 QUADRICICLO', 'Não informado', 0),
  ('BRP', 'CAN-AM SPYDER 1330 F3-S', 'Não informado', 0),
  ('BRP', 'CAN-AM SPYDER 1330 RT-LIMITED', 'Não informado', 0),
  ('BRP', 'CAN-AM SPYDER 1330 RT-S', 'Não informado', 0),
  ('BRP', 'CAN-AM SPYDER 990 RS', 'Não informado', 0),
  ('BRP', 'CAN-AM SPYDER 990 RS-S', 'Não informado', 0),
  ('BRP', 'CAN-AM SPYDER 990 RT TECHNO', 'Não informado', 0),
  ('BRP', 'CAN-AM SPYDER 990 RT-LIMITED', 'Não informado', 0),
  ('BRP', 'CAN-AM SPYDER 990 RT-S', 'Não informado', 0),
  ('BRP', 'CAN-AM SPYDER 990 ST-S', 'Não informado', 0),
  ('BRP', 'CAN-AM SPYDER DAYTONA 1330 F3-S', 'Não informado', 0),
  ('BRUCAL', 'SR / BRUCAL BTQRSL 2E', 'Não informado', 0),
  ('BRUCAL', 'SR / BRUCAL BTSL 2E', 'Não informado', 0),
  ('BRUCAL', 'SR / BRUCAL SRSL 3E', 'Não informado', 0),
  ('BUELL', '1125CR', 'Não informado', 0),
  ('BUELL', '1125R', 'Não informado', 0),
  ('BUELL', 'FIREBOLT XB12 R', 'Não informado', 0),
  ('BUELL', 'LIGHTNING CITY CROSS XB9SX', 'Não informado', 0),
  ('BUELL', 'LIGHTNING XB12S', 'Não informado', 0),
  ('BUELL', 'LIGHTNING XB12SCG', 'Não informado', 0),
  ('BUELL', 'LIGHTNING XB12SS', 'Não informado', 0),
  ('BUELL', 'LIGHTNING XB12STT', 'Não informado', 0),
  ('BUELL', 'ULYSSES XB12X', 'Não informado', 0),
  ('BUENO', 'JBR 125E', 'Não informado', 0),
  ('BUENO', 'JBR 150E', 'Não informado', 0),
  ('BUENO', 'JBR 250E', 'Não informado', 0),
  ('BUGGY', 'BUGGY 1.6 2-LUG.', 'Não informado', 0),
  ('BUGGY', 'BUGGY 1.6/ TST/ RS 1.6 4-LUG.', 'Não informado', 0),
  ('BUGRE', 'BUGGY IV E V', 'Não informado', 0),
  ('BUGRE', 'BUGGY VII', 'Não informado', 0),
  ('BUSA', 'SR / BUSA RONOFF 3E', 'Não informado', 0),
  ('BYCRISTO', 'TRICICLO STAR I / SPORT', 'Não informado', 0),
  ('BYCRISTO', 'TRICICLO STAR II / TOP', 'Não informado', 0),
  ('BYCRISTO', 'TRICICLO STAR II TOP / SUPER TOP', 'Não informado', 0),
  ('CADILLAC', 'DEVILLE/ELDORADO 4.9', 'Não informado', 0),
  ('CADILLAC', 'SEVILLE 4.6', 'Não informado', 0),
  ('CAGIVA', 'CANYON 500', 'Não informado', 0),
  ('CAGIVA', 'ELEFANT 750', 'Não informado', 0),
  ('CAGIVA', 'ELEFANT 900', 'Não informado', 0),
  ('CAGIVA', 'GRAN CANYON 900', 'Não informado', 0),
  ('CAGIVA', 'MITO 125', 'Não informado', 0),
  ('CAGIVA', 'NAVIGATOR 1000', 'Não informado', 0),
  ('CAGIVA', 'PLANET 125', 'Não informado', 0),
  ('CAGIVA', 'ROADSTER 200CC', 'Não informado', 0),
  ('CAGIVA', 'V-RAPTOR 1000', 'Não informado', 0),
  ('CAGIVA', 'W-16 600CC', 'Não informado', 0),
  ('CALOI', 'MOBILETE 50CC', 'Não informado', 0),
  ('CALOI', 'MONDO 75CC', 'Não informado', 0),
  ('CATERPILLAR', '416E', 'CAMINHõES-LEVE-VANS', 0),
  ('CBT JIPE', 'JAVALI 3.0 4X4 DIESEL', 'Não informado', 0),
  ('CHANA', 'CARGO 1.0 8V 53CV (PICK-UP)', 'Não informado', 0),
  ('CHANA', 'CARGO CD 1.0 8V 53CV (PICK-UP)', 'Não informado', 0),
  ('CHANA', 'CARGO CE 1.0 8V 53CV (PICK-UP)', 'Não informado', 0),
  ('CHANA', 'FAMILY 1.0 8V 53CV (PERUA)', 'Não informado', 0),
  ('CHANA', 'UTILITY 1.0 8V 53CV (FURGÃO)', 'Não informado', 0),
  ('CHANGAN', 'MINI STAR CD 1.0 8V 53CV (PICK-UP)', 'Não informado', 0),
  ('CHANGAN', 'MINI STAR CE 1.0 8V 53CV (PICK-UP)', 'Não informado', 0),
  ('CHANGAN', 'MINI STAR CS 1.0 8V 53CV (PICK-UP)', 'Não informado', 0),
  ('CHANGAN', 'MINI STAR CSB 1.0 8V 53CV (PICK-UP BÁU)', 'Não informado', 0),
  ('CHANGAN', 'MINI STAR FAMILY 1.0 8V 53CV (MINIVAN)', 'Não informado', 0),
  ('CHANGAN', 'MINI STAR UTILITY 1.0 8V 53CV (FURGÃO)', 'Não informado', 0),
  ('CHERY', 'ARRIZO 5 RX 1.5 16V TURBO FLEX AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('CHERY', 'ARRIZO 5 RXT 1.5 16V TURBO FLEX AUT', 'V10 /AUTOMóVEIS COMUM', 0),
  ('CHERY', 'CELER HATCH 1.5 16V FLEX 5P', 'Não informado', 0),
  ('CHERY', 'CELER HATCH ACT 1.5 16V FLEX 5P', 'Não informado', 0),
  ('CHERY', 'CELER SEDAN 1.5 16V FLEX 5P', 'Não informado', 0),
  ('CHERY', 'CELER SEDAN ACT 1.5 16V FLEX 5P', 'Não informado', 0),
  ('CHERY', 'CIELO 1.6 16V 119CV 5P', 'Não informado', 0),
  ('CHERY', 'CIELO SEDAN 1.6 16V 119CV 4P', 'Não informado', 0),
  ('CHERY', 'FACE 1.3 16V/1.3 16V FLEX.MEC', 'Não informado', 0),
  ('CHERY', 'QQ 1.0 ACT 12V 69CV 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('CHERY', 'QQ 1.0 ACT FL 12V 69CV 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('CHERY', 'QQ 1.0 LOOK FL 12V 69CV 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('CHERY', 'QQ 1.0 SMILE 12V FLEX 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('CHERY', 'QQ 1.1/1.0 12V 69CV 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('CHERY', 'S-18 1.3 16V FLEX MEC. 5P', 'Não informado', 0),
  ('CHERY', 'TIGGO 2 ACT 1.5 16V FLEX AUT. 5P1.5 16VAUTOMáTICAACT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 2 ACT 1.5 16V FLEX MEC. 5P1.5 16VMANUALACT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 2 EX 1.5 16V FLEX AUT. 5P1.5 16VAUTOMáTICAEX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 2 LOOK 1.5 16V FLEX AUT. 5P1.5 16VAUTOMáTICALOOK', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 2 LOOK 1.5 16V FLEX MEC. 5P1.5 16VMANUALLOOK', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 2 SMILE 1.5 16V FLEX AUT.1.5 16VAUTOMáTICASMILE', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 2.0 16V AUT. 5P2.0 16VAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 2.0 16V MEC. 5P2.0 16VMANUAL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 3X PLUS 1.0 TURBO FLEX AUT.1.0 TURBOAUTOMáTICAPLUS', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 3X PRO 1.0 TURBO FLEX AUT.1.0 TURBOAUTOMáTICAPRO', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 50),
  ('CHERY', 'TIGGO 5X PRO 1.5 TURBO (HíBRIDO)1.5 TURBO-PRO HíBRIDO', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 5X PRO 1.5 TURBO FLEX AUT.1.5 TURBOAUTOMáTICAPRO', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 5X T 1.5 16V TURBO FLEX AUT.1.5 16V TURBOAUTOMáTICAT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 5X TXS 1.5 16V TURBO FLEX AUT.1.5 16V TURBOAUTOMáTICATXS', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 7 PRO 1.5 TURBO (HíBRIDO)1.5 TURBO-PRO HíBRIDO', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 7 PRO 1.6 TURBO 16V AUT.1.6 TURBOAUTOMáTICAPRO', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 7 PRO MAX DRIVE 1.6 TURBO 16V AUT.1.6 TURBOAUTOMáTICAPRO MAX DRIVE', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 7 T 1.5 16V TURBO FLEX AUT.1.5 16V TURBOAUTOMáTICAT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 7 TXS 1.5 16V TURBO FLEX AUT.1.5 16V TURBOAUTOMáTICATXS', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 8 FOUNDER S EDITION 1.6 TGDI AUT.1.6 TGDIAUTOMáTICAFOUNDER S EDITION', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 8 MAX DRIVE 1.6 TURBO AUT.1.6 TURBOAUTOMáTICAMAX DRIVE', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 8 PRO 1.5 TURBO (HíBRIDO)1.5 TURBO-PRO HíBRIDO', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHERY', 'TIGGO 8 TXS 1.6 16V TGDI AUT.1.6 TGDIAUTOMáTICATXS', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CHEVROLET', '11000 2P (DIESEL)', 'Não informado', 0),
  ('CHEVROLET', '11000 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('CHEVROLET', '12000 2P (DIESEL)', 'Não informado', 0),
  ('CHEVROLET', '12000 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('CHEVROLET', '13000 2P (DIESEL)', 'Não informado', 0),
  ('CHEVROLET', '13000 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('CHEVROLET', '14000 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('CHEVROLET', '14000 TURBO 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('CHEVROLET', '19000 2P (DIESEL)', 'Não informado', 0),
  ('CHEVROLET', '19000 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('CHEVROLET', '21000 2P (DIESEL)', 'Não informado', 0),
  ('CHEVROLET', '22000 2P (DIESEL)', 'Não informado', 0),
  ('CHEVROLET', '6000 2P (DIESEL)', 'Não informado', 0),
  ('CHEVROLET', 'AGILE LTZ', 'Não informado', 0),
  ('CHEVROLET', 'ASTRA', 'Não informado', 0),
  ('CHEVROLET', 'C-60 2P (GAS.)', 'Não informado', 0),
  ('CHEVROLET', 'CLASSIC', 'Não informado', 0),
  ('CHEVROLET', 'CLASSIC LIFE/LS 1.0 VHC FLEXP. 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('CHEVROLET', 'CLASSIC SPIRIT', 'Não informado', 0),
  ('CHEVROLET', 'D-40 2P (DIESEL)', 'Não informado', 0),
  ('CHEVROLET', 'D-60 2P (DIESEL)', 'Não informado', 0),
  ('CHEVROLET', 'D-70 2P (DIESEL)', 'Não informado', 0),
  ('CHEVROLET', 'GOL 1.0', 'Não informado', 0),
  ('CHEVROLET', 'MONTANA 1.2 TURBO', 'V6 AUTOMOVEL COMUM', 25),
  ('CHEVROLET', 'MONTANA 1.2 TURBO FLEX 12V 4P', 'V6 AUTOMOVEL COMUM', 0),
  ('CHEVROLET', 'MONTANA RS 1.2 TURBO FLEX 12V AUT', 'V6 AUTOMOVEL COMUM', 0),
  ('CHEVROLET', 'ONIX 1.0 MTLS', 'Não informado', 0),
  ('CHEVROLET', 'PRISMA 1.4 MT LT', 'Não informado', 0),
  ('CHEVROLET', 'S10 EXECUTIVE 2.8', 'Não informado', 0),
  ('CHEVROLET', 'S10 EXECUTIVE CD', 'Não informado', 0),
  ('CHEVROLET', 'S10 LT DD4A', 'Não informado', 0),
  ('CHEVROLET', 'SONIC LTZ HB AT', 'Não informado', 0),
  ('CHEVROLET', 'SPIN PREMIER 1.8 8V ECONO.FLEX 5P AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('CHEVROLET', 'TRACKER LTZ 1.2 TURBO (FLEX) (AUT)', 'V6 AUTOMOVEL COMUM', 0),
  ('CHRYSLER', '300 C 3.5 V6 249CV', 'Não informado', 0),
  ('CHRYSLER', '300 C 3.6 V6 286CV AUT.', 'Não informado', 0),
  ('CHRYSLER', '300 C 5.7 V8 16V 340CV AUT.', 'Não informado', 0),
  ('CHRYSLER', '300 C SRT8 6.1 V8 16V 431CV AUT', 'Não informado', 0),
  ('CHRYSLER', '300 C TOURING 5.7 V8 16V 340CV AUT.', 'Não informado', 0),
  ('CHRYSLER', '300 M 3.5', 'Não informado', 0),
  ('CHRYSLER', 'CARAVAN LE 3.3', 'Não informado', 0),
  ('CHRYSLER', 'CARAVAN LX 3.3 V6 182CV', 'Não informado', 0),
  ('CHRYSLER', 'CARAVAN LX 3.8', 'Não informado', 0),
  ('CHRYSLER', 'CARAVAN SE 2.4/3.3', 'Não informado', 0),
  ('CHRYSLER', 'CIRRUS LXI 2.5 V6 24V', 'Não informado', 0),
  ('CHRYSLER', 'GRAN CARAVAN SE 3.3 V6', 'Não informado', 0),
  ('CHRYSLER', 'GRAND CARAVAN LE 3.3 AUT', 'Não informado', 0),
  ('CHRYSLER', 'GRAND CARAVAN LIMITED 3.3 V6 12V 182CV', 'Não informado', 0),
  ('CHRYSLER', 'GRAND CARAVAN LX 3.8', 'Não informado', 0),
  ('CHRYSLER', 'LE BARON 3.0 V6', 'Não informado', 0),
  ('CHRYSLER', 'LE BARON 3.0 V6 CONV.', 'Não informado', 0),
  ('CHRYSLER', 'NEON LE 1.8', 'Não informado', 0),
  ('CHRYSLER', 'NEON LE/HIGHLINE 2.0', 'Não informado', 0),
  ('CHRYSLER', 'NEON SPORT 1.8/2.0', 'Não informado', 0),
  ('CHRYSLER', 'PT CRUISER CABRIO 2.4 16V 143CV 2P', 'Não informado', 0),
  ('CHRYSLER', 'PT CRUISER CLASSIC 2.4 16V 143CV 4P', 'Não informado', 0),
  ('CHRYSLER', 'PT CRUISER LIMITED 2.0 16V 4P', 'Não informado', 0),
  ('CHRYSLER', 'PT CRUISER LIMITED 2.4 16V 143CV 4P', 'Não informado', 0),
  ('CHRYSLER', 'PT CRUISER TOURING DEC. EDITION 2.4 16V', 'Não informado', 0),
  ('CHRYSLER', 'SEBRING LX 2.7 V6 24V 204CV', 'Não informado', 0),
  ('CHRYSLER', 'STRATUS LE 2.0', 'Não informado', 0),
  ('CHRYSLER', 'STRATUS LX 2.0 MEC', 'Não informado', 0),
  ('CHRYSLER', 'STRATUS LX 2.5 AUT', 'Não informado', 0),
  ('CHRYSLER', 'STRATUS LX 2.5 CONVERSÍVEL AUT', 'Não informado', 0),
  ('CHRYSLER', 'TOWN & COUNTRY LIMITED 3.8 /3.6 V6 AUT.', 'Não informado', 0),
  ('CHRYSLER', 'TOWN & COUNTRY TOURING 3.6 V6 AUT.', 'Não informado', 0),
  ('CHRYSLER', 'VISION 3.5 24V', 'Não informado', 0),
  ('CICCOBUS', 'ALLEANZA GRAN ( ESCOLAR ) 2P (DIESEL)', 'Não informado', 0),
  ('CICCOBUS', 'ALLEANZA GRAN ( EXECUTIVO/ TURISMO ) 2P', 'Não informado', 0),
  ('CICCOBUS', 'ALLEANZA GRAN ( URBANO/ SPTRANS ) 2P (DI', 'Não informado', 0),
  ('CICCOBUS', 'ALLEANZA MINI ( ESCOLAR ) 2P (DIESEL)', 'Não informado', 0),
  ('CICCOBUS', 'ALLEANZA MINI ( EXECUTIVO/ TURISMO ) 2P', 'Não informado', 0),
  ('CICCOBUS', 'ALLEANZA MINI ( URBANO/ SPTRANS ) 2P (DI', 'Não informado', 0),
  ('CIOTAGO', 'SR / CIOATO SR3E 3E', 'Não informado', 0),
  ('CITROEN', 'AIRCROSS 100 ANOS 1.6 FLEX 16V AUT.1.6 FLEX 16V-AUTOMáTICA5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS BUSINESS 1.6 FLEX 16V 5P MEC.1.6 FLEX 16V-MANUAL5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS EXC. ATACA. 1.6 FLEX 16V 5P AUT1.6 FLEX 16V-AUTOMáTICA5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS EXC. ATACA. 1.6 FLEX 16V 5P MEC1.6 FLEX 16V-MANUAL5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS EXCLUSIVE 1.6 FLEX 16V 5P AUT.1.6 FLEX 16V-AUTOMáTICA5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS EXCLUSIVE 1.6 FLEX 16V 5P MEC.1.6 FLEX 16V-MANUAL5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS FEEL 1.6 FLEX 16V 5P AUT.1.6 FLEX 16V-AUTOMáTICA5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS FEEL 1.6 FLEX 16V 5P MEC.1.6 FLEX 16V-MANUAL5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS GL 1.6 FLEX 16V 5P MEC.1.6 FLEX 16V-MANUAL5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS GLX 1.6 FLEX 16V 5P AUT.1.6 FLEX 16V-AUTOMáTICA5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS GLX 1.6 FLEX 16V 5P MEC.1.6 FLEX 16V-MANUAL5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS GLX ATACAMA 1.6 FLEX 16V 5P AUT1.6 FLEX 16V-AUTOMáTICA5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS GLX ATACAMA 1.6 FLEX 16V 5P MEC1.6 FLEX 16V-MANUAL5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS LIVE 1.5 FLEX 8V 5P MEC.1.5 FLEX 8V-MANUAL5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS LIVE 1.6 FLEX 16V 5P AUT.1.6 FLEX 16V-AUTOMáTICA5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS LIVE 1.6 FLEX 16V 5P MEC.1.6 FLEX 16V-MANUAL5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS LIVE BUS. 1.6 FLEX 5P AUT.1.6 FLEX-AUTOMáTICA5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS SALOMON 1.5 FLEX 8V 5P MEC.1.5 FLEX 8V-MANUAL5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS SALOMON 1.6 FLEX 16V 5P AUT.1.6 FLEX 16V-AUTOMáTICA5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS SALOMON EXCLUSIVE 1.6 FLEX AUT.1.6 FLEX-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS SALOMON EXCLUSIVE 1.6 FLEX MEC.1.6 FLEX-MANUAL', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS SALOMON TENDANCE 1.6 FLEX AUT.1.6 FLEX-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS SALOMON TENDANCE 1.6 FLEX MEC.1.6 FLEX-MANUAL', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS SHINE 1.6 FLEX 16V 5P AUT.1.6 FLEX 16V-AUTOMáTICA5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS START 1.5 FLEX 8V 5P MEC.1.5 FLEX 8V-MANUAL5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS START 1.6 FLEX 16V 5P MEC.1.6 FLEX 16V-MANUAL5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS TENDANCE 1.6 FLEX 16V 5P AUT.1.6 FLEX 16V-AUTOMáTICA5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AIRCROSS TENDANCE 1.6 FLEX 16V 5P MEC.1.6 FLEX 16V-MANUAL5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'AX GTI', 'Não informado', 0),
  ('CITROEN', 'BERLINGO MULTSPACE GLX 1.6 16V 110CV 4P', 'Não informado', 0),
  ('CITROEN', 'BERLINGO MULTSPACE GLX 1.8I 3P', 'Não informado', 0),
  ('CITROEN', 'BERLINGO MULTSPACE GLX 1.8I 4P', 'Não informado', 0),
  ('CITROEN', 'BX 1.6S 16V', 'Não informado', 0),
  ('CITROEN', 'BX GTI 1.9', 'Não informado', 0),
  ('CITROEN', 'C3 ATTRA/ORIGINE PACK 1.5 FLEX 8V 5P MEC', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 ATTRACTION 1.6 FLEX 16V 5P AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 EXCL. 1.6 VTI FLEX START 16V 5P AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 EXCL. 1.6 VTI FLEX START 16V 5P MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 EXCL./EXCL.SOLAR./SONORA 1.6 FLEX AUT', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 EXCLUS./EXCL.SOLARIS 1.6 FLEX 16V MEC', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 EXCLUSIVE 1.4 FLEX 8V 5P', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 EXCLUSIVE 1.5 FLEX 8V 5P MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 GLX 1.4/ GLX SONORA 1.4 FLEX 8V 5P', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 GLX 1.6 FLEX 16V 5P AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 GLX 1.6/ 1.6 FLEX 16V 5P', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 LIVE 1.0 FLEX 6V 5P MEC', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 LIVE PK 1.0', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 OCIMAR VERSOLATO 1.6 16V 110CV 5P', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 ORIGINE 1.5 FLEX 8V 5P MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 PICASSO EXCL. 1.6 FLEX 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C3 PICASSO EXCLUSIVE 1.6 FLEX 16V 5P MEC', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C3 PICASSO GL 1.5 FLEX 8V MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C3 PICASSO GL 1.6 FLEX 16V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C3 PICASSO GLX 1.5 FLEX 8V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C3 PICASSO GLX 1.6 FLEX 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C3 PICASSO GLX 1.6 FLEX 16V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C3 PICASSO ORIGINE 1.5 FLEX 8V MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C3 PICASSO TENDANCE 1.5 FLEX 8V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C3 PICASSO TENDANCE 1.6 FLEX 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C3 START 1.2 FLEX 12V 5P', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 STYLE ED. PURE TECH 1.2 FLEX 12V MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 STYLE EDITION 1.6 FLEX 16V AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 TENDANCE 1.5 FLEX 8V 5P MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 TENDANCE 1.6 VTI FLEX START 16V AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 X-BOX ONE 1.6 VTI FLEX 16V 5P MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 XTR 1.4 FLEX 8V 5P', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C3 XTR 1.6 FLEX 16V 5P', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'C4 CACTUS 100 ANOS 1.6 TB 16V FLEX AUT.1.6 TB 16V FLEX-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 CACTUS C-SERIES 1.6 16V FLEX AUT.1.6 16V FLEX-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 CACTUS FEEL 1.6 16V FLEX AUT.1.6 16V FLEX-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 CACTUS FEEL 1.6 16V FLEX MEC.1.6 16V FLEX-MANUAL', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 CACTUS FEEL BUS. 1.6 FLEX AUT.1.6 FLEX-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 CACTUS FEEL PACK 1.6 16V FLEX AUT.1.6 16V FLEX-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 CACTUS LIVE 1.6 16V FLEX AUT.1.6 16V FLEX-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 CACTUS LIVE 1.6 16V FLEX MEC.1.6 16V FLEX-MANUAL', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 CACTUS RIP CURL 1.6 16V FLEX AUT.1.6 16V FLEX-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 CACTUS SHINE 1.6 16V FLEX AUT.1.6 16V FLEX-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 CACTUS SHINE 1.6 TURBO FLEX AUT.1.6 TURBO FLEX-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 CACTUS SHINE PACK 1.6 TURBO FLEX AUT.1.6 TURBO FLEX-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 CACTUS X-SERIES 1.6 16V FLEX AUT.1.6 16V FLEX-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 COMPETITION 1.6 FLEX 16V 5P MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('CITROEN', 'C4 COMPETITION 2.0 FLEX 16V 5P AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('CITROEN', 'C4 EXCL./EXCL. SOLAR. 2.0 FLEX 16V MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('CITROEN', 'C4 EXCL.2.0/2.0 SOLARIS FLEX 16V 5P AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('CITROEN', 'C4 GLX 1.6 FLEX 16V 5P MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('CITROEN', 'C4 GLX 2.0 FLEX 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 GLX 2.0 FLEX 16V 5P MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('CITROEN', 'C4 LOUNGE 100 ANOS 1.6 16V TB FLEX AUT.1.6 16V TB FLEX-AUTOMáTICA4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 LOUNGE EXCLUSIVE 1.6 TURBO 4P AUT.1.6 TURBO-AUTOMáTICA4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 LOUNGE EXCLUSIVE 1.6 TURBO FLEX AUT.1.6 TURBO FLEX-AUTOMáTICA4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 LOUNGE EXCLUSIVE 2.0 FLEX 4P AUT.2.0 FLEX-AUTOMáTICA4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 LOUNGE FEEL 1.6 TURBO FLEX AUT.1.6 TURBO FLEX-AUTOMáTICA4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 LOUNGE LIVE 1.6 TURBO FLEX AUT.1.6 TURBO FLEX-AUTOMáTICA4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 LOUNGE LIVE BUS. 1.6 FLEX AUT.1.6 FLEX-AUTOMáTICA4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 LOUNGE ORIG.BUSINESS 1.6 TB FLEX AUT.1.6 TB FLEX-AUTOMáTICA4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 LOUNGE ORIGINE 1.6 TURBO FLEX AUT.1.6 TURBO FLEX-AUTOMáTICA4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 LOUNGE ORIGINE 1.6 TURBO FLEX MEC.1.6 TURBO FLEX-MANUAL4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 LOUNGE ORIGINE 2.0 FLEX 4P AUT.2.0 FLEX-AUTOMáTICA4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 LOUNGE ORIGINE 2.0 FLEX 4P MEC.2.0 FLEX-MANUAL4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 LOUNGE S 1.6 TURBO FLEX AUT.1.6 TURBO FLEX-AUTOMáTICA4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 LOUNGE SHINE 1.6 TURBO FLEX AUT.1.6 TURBO FLEX-AUTOMáTICA4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 LOUNGE TENDANCE 1.6 TURBO 4P AUT.1.6 TURBO-AUTOMáTICA4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 LOUNGE TENDANCE 1.6 TURBO FLEX AUT.1.6 TURBO FLEX-AUTOMáTICA4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 LOUNGE TENDANCE 2.0 FLEX 4P AUT.2.0 FLEX-AUTOMáTICA4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 LOUNGE TENDANCE 2.0 FLEX 4P MEC.2.0 FLEX-MANUAL4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 PAL.EXCL/EXCL(TECH.) 2.0/2.0 FLEX AUT', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('CITROEN', 'C4 PALLAS EXCLUSIVE 2.0/2.0 FLEX 16V MEC', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('CITROEN', 'C4 PALLAS GLX 2.0/ 2.0 FLEX AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 PALLAS GLX 2.0/2.0 FLEX 16V MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('CITROEN', 'C4 PICASSO GRAND 2.0 16V 143CV AUT2.0 16V143CVAUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 PICASSO INTENSIVE 1.6 TURBO 16V AUT.1.6 TURBO 16V-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 PICASSO SEDUCTION 1.6 TURBO 16V AUT.1.6 TURBO 16V-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 PICASSO/PIC. LA LUNA 2.0 16V AUT.2.0 16V-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 ROCKYOU 1.6 FLEX 16V 5P MEC', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 TENDANCE 1.6 FLEX 16V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 TENDANCE 2.0 FLEX 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C4 VTR 2.0 16V 143CV', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('CITROEN', 'C5 3.0 24V 210CV 4P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C5 EXCLUSIVE 2.0 16V 138CV 4P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C5 EXCLUSIVE 2.0 16V 4P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C5 EXCLUSIVE BREAK 2.0 16V 138CV 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C5 EXCLUSIVE BREAK 2.0 16V AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C5 TOURER EXCLUSIVE 2.0 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C6 EXCLUSIVE 3.0 V6 24V 215CV AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'C8 EXCLUSIVE 2.0 16V 138CV 5P AUT.', 'Não informado', 0),
  ('CITROEN', 'DS3 1.6 TURBO 16V 3P MEC.', 'Não informado', 0),
  ('CITROEN', 'DS3 SPORT CHIC 1.6 TB 16V 3P MEC.', 'Não informado', 0),
  ('CITROEN', 'DS4 1.6 CHIC TURBO 16V 5P AUT.', 'Não informado', 0),
  ('CITROEN', 'DS4 1.6 SO CHIC TURBO 16V 5P AUT.', 'Não informado', 0),
  ('CITROEN', 'DS4 1.6 TURBO 16V 5P AUT.', 'Não informado', 0),
  ('CITROEN', 'DS5 1.6 BE CHIC TURBO 16V 5P AUT.', 'Não informado', 0),
  ('CITROEN', 'DS5 1.6 SO CHIC TURBO 16V 5P AUT.', 'Não informado', 0),
  ('CITROEN', 'DS5 1.6 TURBO 16V 5P AUT.', 'Não informado', 0),
  ('CITROEN', 'EVASION GLX 2.0 16V', 'Não informado', 0),
  ('CITROEN', 'EVASION VSX TURBO', 'Não informado', 0),
  ('CITROEN', 'JUMPER 2.3 15/16LUG. TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CITROEN', 'JUMPER 2.3 FURGÃO TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CITROEN', 'JUMPER 2.3 VETRATO EXEC. 16LUG. TB DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CITROEN', 'JUMPER 2.3 VETRATO TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CITROEN', 'JUMPER 2.5 DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CITROEN', 'JUMPER 2.8 16LUG. DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CITROEN', 'JUMPER 2.8 FURGÃO 35C DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CITROEN', 'JUMPER 2.8 FURGÃO 35MH DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CITROEN', 'JUMPY FURGãO 1.6 TURBO DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CITROEN', 'JUMPY FURGãO PACK 1.6 TURBO DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('CITROEN', 'XANTIA 2.0 16V', 'Não informado', 0),
  ('CITROEN', 'XANTIA ACTIVA 2.0', 'Não informado', 0),
  ('CITROEN', 'XANTIA ACTIVA 2.0 TB', 'Não informado', 0),
  ('CITROEN', 'XANTIA ACTIVA 3.0 V6 MEC', 'Não informado', 0),
  ('CITROEN', 'XANTIA BREAK 2.0 8V/GLX 2.0 16V AUT', 'Não informado', 0),
  ('CITROEN', 'XANTIA BREAK GLX 2.0 16V MEC.', 'Não informado', 0),
  ('CITROEN', 'XANTIA EXCLUSIVE 2.0 16V', 'Não informado', 0),
  ('CITROEN', 'XANTIA EXCLUSIVE 3.0 V6', 'Não informado', 0),
  ('CITROEN', 'XANTIA GLX 2.0 16V AUT.', 'Não informado', 0),
  ('CITROEN', 'XANTIA GLX 2.0 16V MEC.', 'Não informado', 0),
  ('CITROEN', 'XANTIA SX 1.8', 'Não informado', 0),
  ('CITROEN', 'XANTIA SX 2.0 8V/16V MEC/ AUT', 'Não informado', 0),
  ('CITROEN', 'XANTIA VSX 2.0', 'Não informado', 0),
  ('CITROEN', 'XANTIA VSX 2.0 16V', 'Não informado', 0),
  ('CITROEN', 'XM EXCLUSIVE 12V', 'Não informado', 0),
  ('CITROEN', 'XM EXCLUSIVE 24V', 'Não informado', 0),
  ('CITROEN', 'XM EXCLUSIVE BREAK', 'Não informado', 0),
  ('CITROEN', 'XM SENSATION 2.0 TB', 'Não informado', 0),
  ('CITROEN', 'XSARA BREAK EXCLUSIVE 1.6 16V 5P AUT.', 'Não informado', 0),
  ('CITROEN', 'XSARA BREAK EXCLUSIVE 1.6 16V 5P MEC.', 'Não informado', 0),
  ('CITROEN', 'XSARA BREAK EXCLUSIVE 1.8 16V', 'Não informado', 0),
  ('CITROEN', 'XSARA BREAK EXCLUSIVE 2.0 16V', 'Não informado', 0),
  ('CITROEN', 'XSARA BREAK GLX 1.6 16V 5P AUT.', 'Não informado', 0),
  ('CITROEN', 'XSARA BREAK GLX 1.6 16V 5P MEC.', 'Não informado', 0),
  ('CITROEN', 'XSARA BREAK GLX 1.8 16V', 'Não informado', 0),
  ('CITROEN', 'XSARA BREAK GLX/ PARIS 2.0 16V', 'Não informado', 0),
  ('CITROEN', 'XSARA EXCLUSIVE 1.6 16V 5P AUT.', 'Não informado', 0),
  ('CITROEN', 'XSARA EXCLUSIVE 1.6 16V 5P MEC.', 'Não informado', 0),
  ('CITROEN', 'XSARA EXCLUSIVE 1.8 8V/16V 5P AUT', 'Não informado', 0),
  ('CITROEN', 'XSARA EXCLUSIVE 1.8 8V/16V 5P MEC', 'Não informado', 0),
  ('CITROEN', 'XSARA EXCLUSIVE 2.0 16V', 'Não informado', 0),
  ('CITROEN', 'XSARA GLX 1.6 16V 3P', 'Não informado', 0),
  ('CITROEN', 'XSARA GLX 1.6 16V 5P AUT.', 'Não informado', 0),
  ('CITROEN', 'XSARA GLX 1.6 16V 5P MEC.', 'Não informado', 0),
  ('CITROEN', 'XSARA GLX 1.8 16V 5P MEC', 'Não informado', 0),
  ('CITROEN', 'XSARA GLX 1.8 16V CUPÊ MEC', 'Não informado', 0),
  ('CITROEN', 'XSARA GLX 1.8 8V 5P AUT', 'Não informado', 0),
  ('CITROEN', 'XSARA GLX 1.8 8V CUPÊ AUT', 'Não informado', 0),
  ('CITROEN', 'XSARA GLX/ PARIS 2.0 16V', 'Não informado', 0),
  ('CITROEN', 'XSARA PICASSO EXC./ETOILE 2.0 16V MEC', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'XSARA PICASSO EXCLUS. 1.6/ 1.6 FLEX 16V', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'XSARA PICASSO EXCLUSIVE 2.0 16V AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'XSARA PICASSO GLX /BRASIL/ETOILE 2.0 MEC', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'XSARA PICASSO GLX 1.6/ 1.6 FLEX 16V', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'XSARA PICASSO GLX 2.0 16V AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('CITROEN', 'XSARA VTS 1.6 16V 3P', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN', 'XSARA VTS 1.8 16V', 'Não informado', 0),
  ('CITROEN', 'XSARA VTS 2.0 16V CUPÊ MEC', 'Não informado', 0),
  ('CITROEN', 'ZX CUPÊ 16V', 'Não informado', 0),
  ('CITROEN', 'ZX DAKAR 2.0 16V', 'Não informado', 0),
  ('CITROEN', 'ZX FURIO', 'Não informado', 0),
  ('CITROEN', 'ZX PARIS 1.8', 'Não informado', 0),
  ('CITROEN', 'ZX VOLCANE 3P E 5P', 'Não informado', 0),
  ('CITROEN 1', 'C3 ATTRACTION PURE TECH 1.2 FLEX 12V MEC', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN 1', 'C3 ORIGINE PURE TECH 1.2 FLEX 12V MEC', 'V6 AUTOMOVEL COMUM', 0),
  ('CITROEN 1', 'C3 TENDANCE PURE TECH 1.2 FLEX 12V MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('CROSS LANDER', 'CL-244 2.8 132CV 4X4 TB INT. DIESEL', 'Não informado', 0),
  ('CROSS LANDER', 'CL-330 2.8 132CV 4X4 TB INT. DIESEL', 'Não informado', 0),
  ('DAELIM', 'ALTINO 100CC', 'Não informado', 0),
  ('DAELIM', 'MESSAGE 50CC', 'Não informado', 0),
  ('DAELIM', 'VC 125 ADVANCED', 'Não informado', 0),
  ('DAELIM', 'VF 125 D', 'Não informado', 0),
  ('DAELIM', 'VS 125 CUSTOM', 'Não informado', 0),
  ('DAELIM', 'VT 125 CUSTOM - MAGMA', 'Não informado', 0),
  ('DAELIM', 'VX 125', 'Não informado', 0),
  ('DAEWOO', 'ESPERO 2.0', 'Não informado', 0),
  ('DAEWOO', 'ESPERO CD / DLX 2.0', 'Não informado', 0),
  ('DAEWOO', 'LANOS HATCH SX 1.6 16V', 'Não informado', 0),
  ('DAEWOO', 'LANOS SX 1.6 16V', 'Não informado', 0),
  ('DAEWOO', 'LANOS SX 1.6 16V AUT', 'Não informado', 0),
  ('DAEWOO', 'LEGANZA CDX 2.0 16V AUT.', 'Não informado', 0),
  ('DAEWOO', 'LEGANZA CDX 2.0 16V MEC.', 'Não informado', 0),
  ('DAEWOO', 'NUBIRA CDX 2.0 16V AUT.', 'Não informado', 0),
  ('DAEWOO', 'NUBIRA CDX 2.0 16V MEC.', 'Não informado', 0),
  ('DAEWOO', 'NUBIRA SW CDX 2.0 16V AUT.', 'Não informado', 0),
  ('DAEWOO', 'NUBIRA SW CDX 2.0 16V MEC.', 'Não informado', 0),
  ('DAEWOO', 'PRINCE ACE 2.0', 'Não informado', 0),
  ('DAEWOO', 'RACER GTI 1.5 16V', 'Não informado', 0),
  ('DAEWOO', 'SUPER SALON ACE', 'Não informado', 0),
  ('DAEWOO', 'TICO', 'Não informado', 0),
  ('DAF', 'CF 85 FT 360 4X2 (DIESEL)(E5)', 'Não informado', 0),
  ('DAF', 'CF 85 FT 410 4X2 (DIESEL)(E5)', 'Não informado', 0),
  ('DAF', 'CF 85 FTS 360 6X2 (DIESEL)(E5)', 'Não informado', 0),
  ('DAF', 'CF 85 FTS 410 6X2 (DIESEL)(E5)', 'Não informado', 0),
  ('DAF', 'CF 85 FTT 460 6X4 (DIESEL)(E5)', 'Não informado', 0),
  ('DAF', 'XF 105 FT 460 4X2 (DIESEL)(E5)', 'Não informado', 0),
  ('DAF', 'XF 105 FT 510 4X2 (DIESEL)(E5)', 'Não informado', 0),
  ('DAF', 'XF 105 FTS 410 6X2 (DIESEL)(E5)', 'Não informado', 0),
  ('DAF', 'XF 105 FTS 460 6X2 (DIESEL)(E5)', 'Não informado', 0),
  ('DAF', 'XF 105 FTS 510 6X2 (DIESEL)(E5)', 'Não informado', 0),
  ('DAF', 'XF 105 FTT 460 6X4 (DIESEL)(E5)', 'Não informado', 0),
  ('DAF', 'XF 105 FTT 510 6X4 (DIESEL)(E5)', 'Não informado', 0),
  ('DAF', 'XF 105 FTT 520 6X4 (DIESEL)(E5)', 'Não informado', 0),
  ('DAFRA', 'APACHE 150CC', 'Não informado', 0),
  ('DAFRA', 'CITYCLASS 200I', 'Não informado', 0),
  ('DAFRA', 'CITYCOM S 300I', 'Não informado', 0),
  ('DAFRA', 'CITYCOM.300I', 'Não informado', 0),
  ('DAFRA', 'CRUISYM 150', 'Não informado', 0),
  ('DAFRA', 'DAFRA APACHE RTR 200CC', 'MOTOCICLETA', 0),
  ('DAFRA', 'FIDDLE III125', 'Não informado', 0),
  ('DAFRA', 'HORIZON 150', 'Não informado', 0),
  ('DAFRA', 'HORIZON 250', 'Não informado', 0),
  ('DAFRA', 'KANSAS 150', 'Não informado', 0),
  ('DAFRA', 'KANSAS 250', 'Não informado', 0),
  ('DAFRA', 'LASER 150', 'Não informado', 0),
  ('DAFRA', 'MAXSYM 400I', 'Não informado', 0),
  ('DAFRA', 'NEXT 250CC', 'Não informado', 0),
  ('DAFRA', 'NH 190', 'Não informado', 0),
  ('DAFRA', 'NH 190 861026-6', 'MOTOCICLETA', 0),
  ('DAFRA', 'RIVA 150CC', 'Não informado', 0),
  ('DAFRA', 'RIVA CARGO 150CC', 'Não informado', 0),
  ('DAFRA', 'ROADWIN 250R', 'Não informado', 0),
  ('DAFRA', 'SMART 125CC', 'Não informado', 0),
  ('DAFRA', 'SPEED 150', 'Não informado', 0),
  ('DAFRA', 'SUPER 100', 'Não informado', 0),
  ('DAFRA', 'SUPER 50', 'Não informado', 0),
  ('DAFRA', 'ZIG 100', 'Não informado', 0),
  ('DAFRA', 'ZIG 100+', 'Não informado', 0),
  ('DAFRA', 'ZIG 50', 'Não informado', 0),
  ('DAIHATSU', 'APPLAUSE 1.6 16V', 'Não informado', 0),
  ('DAIHATSU', 'APPLAUSE DLX 1.6 16V', 'Não informado', 0),
  ('DAIHATSU', 'CHARADE CX/TS 1.0', 'Não informado', 0),
  ('DAIHATSU', 'CHARADE SD 1.5/DLX 1.3', 'Não informado', 0),
  ('DAIHATSU', 'CHARADE SEDAN 1.3I 16V', 'Não informado', 0),
  ('DAIHATSU', 'CHARADE TS/TSI 1.3/LSI 1.5 16V', 'Não informado', 0),
  ('DAIHATSU', 'CHARADE TX 1.3 16V', 'Não informado', 0),
  ('DAIHATSU', 'CUORE 0/TS0 85I', 'Não informado', 0),
  ('DAIHATSU', 'CUORE CS/CSL', 'Não informado', 0),
  ('DAIHATSU', 'CUORE TS/TSL', 'Não informado', 0),
  ('DAIHATSU', 'FEROZA DX 1.6 16V', 'Não informado', 0),
  ('DAIHATSU', 'FEROZA SX 1.6I 16V', 'Não informado', 0),
  ('DAIHATSU', 'GRAN MOVE 1.5/1.6 16V', 'Não informado', 0),
  ('DAIHATSU', 'MOVE VAN', 'Não informado', 0),
  ('DAIHATSU', 'TERIOS 1.3 16V', 'Não informado', 0),
  ('DALMARCO', 'DALMARCO SRBD 3E', 'Não informado', 0),
  ('DAMBROZ', 'R / DAMBROZ', 'Não informado', 0),
  ('DAMBROZ', 'SR / DAMBROZ FA 113E', 'Não informado', 0),
  ('DAYANG', 'DY100-31', 'Não informado', 0),
  ('DAYANG', 'DY110-20', 'Não informado', 0),
  ('DAYANG', 'DY125 SPRINT', 'Não informado', 0),
  ('DAYANG', 'DY125-18', 'Não informado', 0),
  ('DAYANG', 'DY125-36A', 'Não informado', 0),
  ('DAYANG', 'DY125-37', 'Não informado', 0),
  ('DAYANG', 'DY125-5', 'Não informado', 0),
  ('DAYANG', 'DY125-52', 'Não informado', 0),
  ('DAYANG', 'DY150-12', 'Não informado', 0),
  ('DAYANG', 'DY150-28 THOR', 'Não informado', 0),
  ('DAYANG', 'DY150-58 EAGLE/COPA', 'Não informado', 0),
  ('DAYANG', 'DY200', 'Não informado', 0),
  ('DAYANG', 'DY200 REV', 'Não informado', 0),
  ('DAYANG', 'DY200 THOR', 'Não informado', 0),
  ('DAYANG', 'DY250 REV', 'Não informado', 0),
  ('DAYANG', 'DY250 THOR', 'Não informado', 0),
  ('DAYANG', 'DY50 JOB', 'Não informado', 0),
  ('DAYANG', 'DY50 WARRIOR', 'Não informado', 0),
  ('DAYANG', 'THOR 230', 'Não informado', 0),
  ('DAYUN', 'DY110-6', 'Não informado', 0),
  ('DAYUN', 'DY125-8', 'Não informado', 0),
  ('DAYUN', 'DY125T-10', 'Não informado', 0),
  ('DAYUN', 'DY150-7', 'Não informado', 0),
  ('DAYUN', 'DY150-9', 'Não informado', 0),
  ('DAYUN', 'DY150GY', 'Não informado', 0),
  ('DAYUN', 'DY150ZH (TRICICLO CARGA)', 'Não informado', 0),
  ('DAYUN', 'DY200ZH (TRICICLO CARGA)', 'Não informado', 0),
  ('DAYUN', 'DY250-2', 'Não informado', 0),
  ('DERBI', 'ATLANTIS 49CC', 'Não informado', 0),
  ('DERBI', 'GPR 50R 49CC', 'Não informado', 0),
  ('DERBI', 'PREDATOR AR 49CC', 'Não informado', 0),
  ('DERBI', 'PREDATOR LC 49CC', 'Não informado', 0),
  ('DERBI', 'RED BULLET 49CC', 'Não informado', 0),
  ('DERBI', 'REPLICAS 49CC', 'Não informado', 0),
  ('DERBI', 'SENDA R 49CC', 'Não informado', 0),
  ('DERBI', 'SENDA SM 49CC', 'Não informado', 0),
  ('DODGE', 'AVENGER ES 2.0/2.5 16V', 'Não informado', 0),
  ('DODGE', 'DAKOTA 2.5', 'Não informado', 0),
  ('DODGE', 'DAKOTA CLUB 2.5', 'Não informado', 0),
  ('DODGE', 'DAKOTA DURANGO 5.9 4X4 V8', 'Não informado', 0),
  ('DODGE', 'DAKOTA DURANGO SLT 5.2 4X4 V8', 'Não informado', 0),
  ('DODGE', 'DAKOTA INTREPID 3.3 V6', 'Não informado', 0),
  ('DODGE', 'DAKOTA RT 5.2 AUT', 'Não informado', 0),
  ('DODGE', 'DAKOTA RT 5.2 CE AUT', 'Não informado', 0),
  ('DODGE', 'DAKOTA SPORT 2.5 4X4', 'Não informado', 0),
  ('DODGE', 'DAKOTA SPORT 2.5 CD DIESEL', 'Não informado', 0),
  ('DODGE', 'DAKOTA SPORT 2.5 DIESEL', 'Não informado', 0),
  ('DODGE', 'DAKOTA SPORT 3.9 V6', 'Não informado', 0),
  ('DODGE', 'DAKOTA SPORT 3.9 V6 CD AUT.', 'Não informado', 0),
  ('DODGE', 'DAKOTA SPORT 3.9 V6 CD MEC.', 'Não informado', 0),
  ('DODGE', 'DAKOTA SPORT 5.2 V8', 'Não informado', 0),
  ('DODGE', 'DAKOTA SPORT 5.2 V8 CD AUT.', 'Não informado', 0),
  ('DODGE', 'DAKOTA SPORT CE 2.5 DIESEL', 'Não informado', 0),
  ('DODGE', 'DAKOTA SPORT CE 3.9 V6', 'Não informado', 0),
  ('DODGE', 'DURANGO CITADEL 3.6 24V 4X4 AUT.', 'Não informado', 0),
  ('DODGE', 'DURANGO CREW 3.6 24V 4X4 AUT.', 'Não informado', 0),
  ('DODGE', 'DURANGO LIMITED 3.6 24V 4X4 AUT.', 'Não informado', 0),
  ('DODGE', 'JOURNEY CROSSROAD 3.6 V6 AUT.', 'Não informado', 0),
  ('DODGE', 'JOURNEY RT 2.7 V6 185CV AUT.', 'Não informado', 0),
  ('DODGE', 'JOURNEY RT 3.6 AWD V6 AUT.', 'Não informado', 0),
  ('DODGE', 'JOURNEY RT 3.6 V6 AUT.', 'Não informado', 0),
  ('DODGE', 'JOURNEY SE 2.7 V6 185CV AUT.', 'Não informado', 0),
  ('DODGE', 'JOURNEY SXT 2.7 V6 185CV AUT.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('DODGE', 'JOURNEY SXT 3.6 V6 AUT.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('DODGE', 'RAM 1500 SPORT RT', 'UTILITARIO LEVE', 0),
  ('DODGE', 'RAM 2500 H.DUTY 5.9 SLT 24V CD 4X4 DIES.', 'Não informado', 0),
  ('DODGE', 'RAM 2500 H.DUTY 5.9 SLT TDI CS 4X4 DIES.', 'Não informado', 0),
  ('DODGE', 'RAM 2500 LARAMIE SLT 6.7 TDI CD 4X4 DIES', 'Não informado', 0),
  ('DODGE', 'RAM 2500 TROPIVAN 5.9 SLT EXEC.TDI DIES.', 'Não informado', 0),
  ('DODGE', 'RAM 2500 TROPIVAN 5.9 SLT TDI 4X4 DIES.', 'Não informado', 0),
  ('DODGE', 'RAM LARAMIE 5.9 V8', 'Não informado', 0),
  ('DODGE', 'RAM LARAMIE/SLT 5.2 V8', 'Não informado', 0),
  ('DODGE', 'RAM SPORT 5.9 V8', 'Não informado', 0),
  ('DODGE', 'STEALTH 3.0 MPI', 'Não informado', 0),
  ('DUCATI', '1098 1099CC', 'Não informado', 0),
  ('DUCATI', '1098 S 1099CC', 'Não informado', 0),
  ('DUCATI', '1198 1198CC', 'Não informado', 0),
  ('DUCATI', '1198 S 1198CC', 'Não informado', 0),
  ('DUCATI', '1198 SP 1198CC', 'Não informado', 0),
  ('DUCATI', '1199 PANIGALE', 'Não informado', 0),
  ('DUCATI', '1199 PANIGALE R', 'Não informado', 0),
  ('DUCATI', '1199 PANIGALE S', 'Não informado', 0),
  ('DUCATI', '1199 PANIGALE S SENNA', 'Não informado', 0),
  ('DUCATI', '1199 PANIGALE S TRICOLORE', 'Não informado', 0),
  ('DUCATI', '1199 SUPERLEGGERA', 'Não informado', 0),
  ('DUCATI', '1299 PANIGALE', 'Não informado', 0),
  ('DUCATI', '1299 PANIGALE S', 'Não informado', 0),
  ('DUCATI', '749', 'Não informado', 0),
  ('DUCATI', '749 DARK 748CC', 'Não informado', 0),
  ('DUCATI', '848', 'Não informado', 0),
  ('DUCATI', '848 EVO', 'Não informado', 0),
  ('DUCATI', '959 PANIGALE', 'Não informado', 0),
  ('DUCATI', '996', 'Não informado', 0),
  ('DUCATI', '996 S', 'Não informado', 0),
  ('DUCATI', '998 997CC', 'Não informado', 0),
  ('DUCATI', '999 998CC', 'Não informado', 0),
  ('DUCATI', '999R XEROX 999CC', 'Não informado', 0),
  ('DUCATI', 'DESMOSEDICI 16RR 200CV', 'Não informado', 0),
  ('DUCATI', 'DIAVEL 1198', 'Não informado', 0),
  ('DUCATI', 'DIAVEL 1198 BLACK', 'Não informado', 0),
  ('DUCATI', 'DIAVEL 1198 CARBON', 'Não informado', 0),
  ('DUCATI', 'DIAVEL 1198 CROMO', 'Não informado', 0),
  ('DUCATI', 'DIAVEL 1198 DARK', 'Não informado', 0),
  ('DUCATI', 'HYPERMOTARD 1100 EVO 1078CC', 'Não informado', 0),
  ('DUCATI', 'HYPERMOTARD 1100 EVO SP 1078CC', 'Não informado', 0),
  ('DUCATI', 'HYPERMOTARD 796', 'Não informado', 0),
  ('DUCATI', 'HYPERMOTARD 821', 'Não informado', 0),
  ('DUCATI', 'HYPERMOTARD 821 SP', 'Não informado', 0),
  ('DUCATI', 'HYPERSTRADA 821', 'Não informado', 0),
  ('DUCATI', 'MONSTER 1100 S 1078CC', 'Não informado', 0),
  ('DUCATI', 'MONSTER 1100CC', 'Não informado', 0),
  ('DUCATI', 'MONSTER 1200', 'Não informado', 0),
  ('DUCATI', 'MONSTER 1200 S', 'Não informado', 0),
  ('DUCATI', 'MONSTER 600CC', 'Não informado', 0),
  ('DUCATI', 'MONSTER 620CC', 'Não informado', 0),
  ('DUCATI', 'MONSTER 695CC', 'Não informado', 0),
  ('DUCATI', 'MONSTER 696CC', 'Não informado', 0),
  ('DUCATI', 'MONSTER 796', 'Não informado', 0),
  ('DUCATI', 'MONSTER 821', 'Não informado', 0),
  ('DUCATI', 'MONSTER 821 DARK', 'Não informado', 0),
  ('DUCATI', 'MONSTER 900CC', 'Não informado', 0),
  ('DUCATI', 'MONSTER S2-R 1000 992CC', 'Não informado', 0),
  ('DUCATI', 'MONSTER S4 916', 'Não informado', 0),
  ('DUCATI', 'MONSTER S4-R 996', 'Não informado', 0),
  ('DUCATI', 'MONSTER S4-RS TESTASTRETTA 998CC', 'Não informado', 0),
  ('DUCATI', 'MULTISTRADA 1000 992CC', 'Não informado', 0),
  ('DUCATI', 'MULTISTRADA 1100 1078CC', 'Não informado', 0),
  ('DUCATI', 'MULTISTRADA 1200 1198CC', 'Não informado', 0),
  ('DUCATI', 'MULTISTRADA 1200 ENDURO', 'Não informado', 0),
  ('DUCATI', 'MULTISTRADA 1200 S 1198 CC', 'Não informado', 0),
  ('DUCATI', 'MULTISTRADA 1200 S TOURING 1198CC', 'Não informado', 0),
  ('DUCATI', 'MULTISTRADA 620 618CC', 'Não informado', 0),
  ('DUCATI', 'MULTISTRADA 950', 'Não informado', 0),
  ('DUCATI', 'MUTISTRADA 1200 S PIKES PEAK', 'Não informado', 0),
  ('DUCATI', 'SCRAMBLER CLASSIC 800CC', 'Não informado', 0),
  ('DUCATI', 'SCRAMBLER FULL THROTTLER 800CC', 'Não informado', 0),
  ('DUCATI', 'SCRAMBLER ICON 800CC', 'Não informado', 0),
  ('DUCATI', 'SCRAMBLER URBAN ENDURO 800CC', 'Não informado', 0),
  ('DUCATI', 'SPORTCLASSIC PAULSMART 1000LE 992CC', 'Não informado', 0),
  ('DUCATI', 'SPORTCLASSIC SPORT 1000 992CC', 'Não informado', 0),
  ('DUCATI', 'SS 900CC', 'Não informado', 0),
  ('DUCATI', 'ST-2 900/ 944CC', 'Não informado', 0),
  ('DUCATI', 'ST-4 900/ 996CC', 'Não informado', 0),
  ('DUCATI', 'STREETFIGHTER 1098CC', 'Não informado', 0),
  ('DUCATI', 'STREETFIGHTER 848', 'Não informado', 0),
  ('DUCATI', 'XDIAVEL 1262', 'Não informado', 0),
  ('DUCATI', 'XDIAVEL S 1262', 'Não informado', 0),
  ('EFFA', 'K01 PICK-UP CS 1.0 8V 2P', 'Não informado', 0),
  ('EFFA', 'K02 PICK-UP CD 1.0 8V 4P', 'Não informado', 0),
  ('EFFA', 'M-100 1.0 8V 5P', 'Não informado', 0),
  ('EFFA', 'PLUTUS 3.2 8V 4X2 CD TURBO DIESEL', 'Não informado', 0),
  ('EFFA', 'START PICAPE CD 1.0 8V 5P', 'Não informado', 0),
  ('EFFA', 'START PICAPE L 1.0 8V 2P', 'Não informado', 0),
  ('EFFA', 'START VAN 1.0 8V 4P', 'Não informado', 0),
  ('EFFA', 'ULC FURGÃO 1.0 8V 5P', 'Não informado', 0),
  ('EFFA', 'ULC PICAPE 1.0 8V 2P', 'Não informado', 0),
  ('EFFA', 'ULC PICAPE CD 1.0 8V 4P', 'Não informado', 0),
  ('EFFA', 'ULC PICAPE LONGA 1.0 8V 2P', 'Não informado', 0),
  ('EFFA', 'ULC PICAPE LONGA BAU 1.0 8V 2P', 'Não informado', 0),
  ('EFFA', 'ULC VAN 1.0 8V 5P', 'Não informado', 0),
  ('EFFA', 'V21 PICK-UP CS 1.3 16V 2P', 'Não informado', 0),
  ('EFFA', 'V22 PICK-UP CD 1.3 16V 4P', 'Não informado', 0),
  ('EFFA-JMC', 'JBC 3.2 TURBO INTERCOOLER 2P (DIESEL)', 'Não informado', 0),
  ('EFFA-JMC', 'N601 2.8 2P (DIESEL)', 'Não informado', 0),
  ('EFFA-JMC', 'N900 2.8 2P (DIESEL)', 'Não informado', 0),
  ('EMME', 'MIRAGE 50CC', 'Não informado', 0),
  ('EMME', 'ONE 50CC', 'Não informado', 0),
  ('EMME', 'ONE RACING 50CC', 'Não informado', 0),
  ('ENGESA', 'ENGESA 4X4 2.5/4.1', 'Não informado', 0),
  ('ENGESA', 'ENGESA 4X4 4.0 DIESEL', 'Não informado', 0),
  ('ENVEMO', 'CAMPER 2.5/GL/GLS/MASTER 4.1', 'Não informado', 0),
  ('ENVEMO', 'CAMPER 4X4 2.5 DIESEL', 'Não informado', 0),
  ('ENVEMO', 'CAMPER GL/GLS 4X4 4.0 DIESEL', 'Não informado', 0),
  ('ENVEMO', 'MASTER 4.0 DIESEL', 'Não informado', 0),
  ('ESCUBER CARRETAS', 'REBOQUE TRAILER', 'REBOQUE', 0),
  ('FACCHINI', 'R / FACCHINI', 'Não informado', 0),
  ('FACCHINI', 'R / FACCHINI-IR REB FR', 'Não informado', 0),
  ('FACCHINI', 'R / FACCHINI-IR RER CS', 'Não informado', 0),
  ('FACCHINI', 'R / FACCHINI-IR RER GR', 'Não informado', 0),
  ('FACCHINI', 'SR / FACCHINI SRF CA', 'Não informado', 0),
  ('FACCHINI', 'SR / FACCHINI SRF CAED', 'Não informado', 0),
  ('FACCHINI', 'SR / FACCHINI SRF CB', 'Não informado', 0),
  ('FACCHINI', 'SR / FACCHINI SRF CF 3E', 'Não informado', 0),
  ('FACCHINI', 'SR / FACCHINI SRF GR', 'Não informado', 0),
  ('FACCHINI', 'SR / FACCHINI SRF LO', 'Não informado', 0),
  ('FACCHINI', 'SR / FACCHINI SRF LOED', 'Não informado', 0),
  ('FACCHINI', 'SR / FACCHINI SRF P', 'Não informado', 0),
  ('FACCHINI', 'SR / FACCHINI SRF RT', 'Não informado', 0),
  ('FACCHINI', 'SR / FACHINNI SRF CF', 'Não informado', 0),
  ('FERRARI', '348 GTS 3.4', 'Não informado', 0),
  ('FERRARI', '348 SPIDER 3.4', 'Não informado', 0),
  ('FERRARI', '348 TS/TB 3.4', 'Não informado', 0),
  ('FERRARI', '355 BERLINETTA', 'Não informado', 0),
  ('FERRARI', '355 BERLINETTA F1', 'Não informado', 0),
  ('FERRARI', '355 GTS', 'Não informado', 0),
  ('FERRARI', '355 GTS F1', 'Não informado', 0),
  ('FERRARI', '355 GTS SPIDER', 'Não informado', 0),
  ('FERRARI', '355 GTS TARGA', 'Não informado', 0),
  ('FERRARI', '355 SPIDER F1', 'Não informado', 0),
  ('FERRARI', '360 CHALLENGE STRADALE', 'Não informado', 0),
  ('FERRARI', '360 MODENA', 'Não informado', 0),
  ('FERRARI', '360 MODENA F1', 'Não informado', 0),
  ('FERRARI', '360 SPIDER 400CV', 'Não informado', 0),
  ('FERRARI', '360 SPIDER F1 400CV', 'Não informado', 0),
  ('FERRARI', '456 GT', 'Não informado', 0),
  ('FERRARI', '456 GTA', 'Não informado', 0),
  ('FERRARI', '456 M-GT 5.5 V12', 'Não informado', 0),
  ('FERRARI', '458 SPECIALE A', 'Não informado', 0),
  ('FERRARI', '488 GTB 3.9 V8 670CV', 'Não informado', 0),
  ('FERRARI', '488 SPYDER 3.9 V8 670CV', 'Não informado', 0),
  ('FERRARI', '550 MARANELLO', 'Não informado', 0),
  ('FERRARI', '575M MARANELLO F1 V12 515CV', 'Não informado', 0),
  ('FERRARI', '612 SCAGLIETTI F1 V12 540CV', 'Não informado', 0),
  ('FERRARI', 'CALIFORNIA 3.9 TURBO F1 V8 560CV', 'Não informado', 0),
  ('FERRARI', 'CALIFORNIA F1 V8 460CV', 'Não informado', 0),
  ('FERRARI', 'F12 BERLINETTA 740CV', 'Não informado', 0),
  ('FERRARI', 'F12 TDF 780CV', 'Não informado', 0),
  ('FERRARI', 'F430 F1', 'Não informado', 0),
  ('FERRARI', 'F430 SCUDERIA F1', 'Não informado', 0),
  ('FERRARI', 'F430 SPIDER F1', 'Não informado', 0),
  ('FERRARI', 'F458 ITALIA F1 4.5 V8 570CV', 'Não informado', 0),
  ('FERRARI', 'F458 SPECIALE F1 4.5 V8', 'Não informado', 0),
  ('FERRARI', 'F458 SPIDER F1 4.5 V8 570CV', 'Não informado', 0),
  ('FERRARI', 'F599 GTB FIORANO F1 6.0 V12 620CV', 'Não informado', 0),
  ('FERRARI', 'FF F1 6.3 V12 660CV', 'Não informado', 0),
  ('FERRARI', 'GTC4 LUSSO 6.3 V12 690CV', 'Não informado', 0),
  ('FIAT', '147 C/ CL', 'Não informado', 0),
  ('FIAT', '147 FURGÃO (TODOS)', 'Não informado', 0),
  ('FIAT', '147 PICK-UP (TODAS )', 'Não informado', 0),
  ('FIAT', '190 2P (DIESEL)', 'Não informado', 0),
  ('FIAT', '190 E 2P (DIESEL)', 'Não informado', 0),
  ('FIAT', '190 H 2P (DIESEL)', 'Não informado', 0),
  ('FIAT', '190 T 2P (DIESEL)', 'Não informado', 0),
  ('FIAT', '500 ABARTH MULTIAIR 1.4 TB 16V 3P', 'Não informado', 0),
  ('FIAT', '500 CABRIO DUALOGIC FLEX 1.4 8V', 'Não informado', 0),
  ('FIAT', '500 CABRIO FLEX 1.4 8V MEC', 'Não informado', 0),
  ('FIAT', '500 CABRIO/500 COUPE GUCCI/FLEX 1.4 AUT', 'Não informado', 0),
  ('FIAT', '500 CULT 1.4 FLEX 8V EVO DUALOGIC', 'Não informado', 0),
  ('FIAT', '500 CULT 1.4 FLEX 8V EVO MEC.', 'Não informado', 0),
  ('FIAT', '500 LOUGE AIR 1.4 16V AUT.', 'Não informado', 0),
  ('FIAT', '500 LOUNGE 1.4 16V 100CV DUALOGIC', 'Não informado', 0),
  ('FIAT', '500 LOUNGE 1.4 16V 100CV MEC.', 'Não informado', 0),
  ('FIAT', '500 SPORT 1.4 16V 100CV DUALOGIC', 'Não informado', 0),
  ('FIAT', '500 SPORT 1.4 16V 100CV MEC.', 'Não informado', 0),
  ('FIAT', '500 SPORT AIR 1.4 16V/1.4 FLEX 16V AUT.', 'Não informado', 0),
  ('FIAT', '500 SPORT AIR 1.4 16V/1.4 FLEX MEC.', 'Não informado', 0),
  ('FIAT', 'ARGO 1.0 6V FLEX.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'ARGO DRIVE 1.0 6V FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'ARGO DRIVE 1.3 8V FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'ARGO DRIVE GSR 1.3 8V FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'ARGO HGT 1.8 16V FLEX AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'ARGO HGT 1.8 16V FLEX MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'ARGO PRECISION 1.8 16V FLEX MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'ARGO PRECISION 1.8 16VFLEX AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'ARGO TREKKING 1.3 8V FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'BRAVA ELX 1.6 16V 4P', 'Não informado', 0),
  ('FIAT', 'BRAVA HGT 1.8 MPI 16V 4P', 'Não informado', 0),
  ('FIAT', 'BRAVA SX 1.6 16V 4P', 'Não informado', 0),
  ('FIAT', 'BRAVO ABSOLUTE 1.8 FLEX 16V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'BRAVO ABSOLUTE DUALOGIC 1.8 FLEX 16V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'BRAVO BLACKMOTION 1.8 DUALOGIC FLEX 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'BRAVO BLACKMOTION 1.8 FLEX 16V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'BRAVO ESSENCE 1.8 FLEX 16V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'BRAVO ESSENCE DUALOGIC 1.8 FLEX 16V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'BRAVO SPORTING 1.8 DUALOGIC FLEX 16V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'BRAVO SPORTING 1.8 FLEX 16V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'BRAVO SX 1.6', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'BRAVO T-JET 1.4 16V TURBO 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'BRAVO WOLVERINE 1.8 DUALOGIC FLEX 16V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'BRAVO WOLVERINE 1.8 FLEX 16V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'CINQUECENTO 0.7', 'Não informado', 0),
  ('FIAT', 'COUPE 16V', 'Não informado', 0),
  ('FIAT', 'CRONOS 1.3 8V FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'CRONOS DRIVE 1.3 8V FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'CRONOS DRIVE 1.8 16V FLEX AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'CRONOS DRIVE GSR 1.3 8V FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'CRONOS HGT 1.8 16V FELX AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'CRONOS PRECISION 1.8 16V FLEX AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'CRONOS PRECISION 1.8 16V FLEX MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'DOBLO 1.4 MPI FIRE FLEX 8V 4P', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DOBLO ADV. XINGU 1.8 FLEX 16V 5P', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DOBLO ADV. XINGU LOCKER 1.8 FLEX 16V 5P', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DOBLO ADV.EXT./ADV.EXT.LOC. 1.8 16V FLEX', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DOBLO ADV/ADV TRYON/LOCKER 1.8 FLEX', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DOBLO ADVENTURE/ ADV.ER 1.8 MPI 8V 103CV', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DOBLO ATTRACTIVE 1.4 FIRE FLEX 8V 5P', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DOBLO CARGO 1.3 FIRE 16V 4/5P', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DOBLO CARGO 1.4 MPI FIRE FLEX 8V 3P', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DOBLO CARGO 1.6 16V 4/5P', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DOBLO CARGO 1.8 MPI 8V 103CV', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DOBLO CARGO 1.8 MPI FIRE FLEX 8V/16V 4P', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DOBLO ELX 1.4 MPI FIRE FLEX 8V 4P', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DOBLO ELX 1.6 16V 4/5P', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DOBLO ELX 1.8 MPI 8V 103CV', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DOBLO ELX 1.8 MPI 8V FLEX', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DOBLO ESSENCE 1.8 FLEX 16V 5P', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DOBLO EX 1.3 FIRE 16V 80CV 4/5P', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DOBLO HLX 1.8 MPI FLEX 5P', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('FIAT', 'DUCATO CARGO 2.2 DIESEL (E6)', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO CARGO 2.8 CURTO/LONGO TB DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO CARGO CURTO 2.3 16V DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO CARGO CURTO 2.3 ME DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO CARGO LONGO 2.3 ME DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO CARGO MéDIO 2.3 16V DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO CHASSI 2.3 16V DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO COMBINATO 2.3 ME DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO COMBINATO 2.8 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO COMBINATO 2.8 TURBO DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO EXECUTIVO 2.3 16V DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO FURGÃO MAXI 2.8 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MAXI. CURTA 2.3 T.ALTO ME DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MAXI. LONG. 2.3 T.ALTO ME DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MAXICARGO 2.2 DIESEL (E6)', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MAXICARGO 2.3 16V DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MAXICARGO/FURGÃO MAXI 2.8 TB DIES', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MAXIMULTI 2.3 16V DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MINIBUS 2.2 COMF.19L DIESEL (E6)', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MINIBUS 2.2 EXEC. 17L DIESEL (E6)', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MINIBUS 2.3 16V DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MINIBUS 2.3 ME DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MINIBUS 2.3 T.ALTO ME DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MINIBUS 2.8 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MINIBUS 2.8 TURBO DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MINIBUS COMFORT 2.3 16V DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MULT/ VETRATO 2.8 T.ALTO TB DIES.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MULT/ VETRATO 2.8 T.BAIXO TB DIES', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MULTI 2.2 DIESEL (E6)', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MULTI 2.3 16V DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO MULTI LONG. 2.3 T.ALTO ME DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO VAN 2.5 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO VIP BUS 2.3 16V DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO-10 FURGÃO 2.5 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO-15 2.8 FURGÃO TB DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO-15 FURGÃO 2.8 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUCATO-8 FURGÃO 2.5 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'DUNA 1.6IE', 'Não informado', 0),
  ('FIAT', 'ELBA 1.6I.E/TOP/CSL/ 1.6I.E/1.5 2P E 4P', 'Não informado', 0),
  ('FIAT', 'ELBA CS 1.6 / 1.5 /1.3', 'Não informado', 0),
  ('FIAT', 'ELBA S 1.6/ 1.5IE / 1.5 / 1.3', 'Não informado', 0),
  ('FIAT', 'ELBA WEEKEND 1.5 I.E. 2P E 4P', 'Não informado', 0),
  ('FIAT', 'FASTBACK AUDACE 1.0 200 T.FLEX AUT', 'V5 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'FIAT FASTBACK IMPETUS 1.0 200 T. FLEX AUT', 'V5 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'FIAT STRADA ADV CD DUAL', 'Não informado', 0),
  ('FIAT', 'FIORINO ENDURANCE EVO 1.4 FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'FIORINO FURG.1.5/1.3/1.3 FIRE/1.3 F.FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'FIORINO FURGAO', 'Não informado', 0),
  ('FIAT', 'FIORINO FURGÃO 1.0', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'FIORINO FURGÃO 1.5 MPI / I.E.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'FIORINO FURGÃO CELEB. EVO 1.4 FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'FIORINO FURGÃO EVO 1.4 FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'FIORINO FURGãO WORK. HARD 1.4 FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'FIORINO IE', 'Não informado', 0),
  ('FIAT', 'FIORINO PICK-UP 1.0', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'FIORINO PICK-UP 1.5 I.E. / 1.3/1.5 /HD/', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'FIORINO PICK-UP LX ( TODAS)', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'FIORINO PICK-UP TREKKING 1.5 MPI / I.E.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'FIORINO PICK-UP WORKING 1.5 MPI / I.E.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'FREEMONT 2.4 16V 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'GRAN SIENA 1.0 EVO FLEX 4P', 'Não informado', 0),
  ('FIAT', 'GRAND SIENA 1.4 EVO FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'GRAND SIENA ATTRAC. 1.4 EVO F.FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'GRAND SIENA ATTRACTIVE 1.0 FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'GRAND SIENA ESSEN. ITALIA DUAL. 1.6 FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'GRAND SIENA ESSEN.SUBLIME 1.6 FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'GRAND SIENA ESSEN.SUBLIME DUAL. 1.6 FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'GRAND SIENA ESSENCE 1.6 FLEX 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'GRAND SIENA ESSENCE DUAL. 1.6 FLEX 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'GRAND SIENA ESSENCE ITALIA 1.6 FLEX 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'GRAND SIENA TETRAFUEL 1.4 EVO F. FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'IDEA A.EXT./A..EXT.LOC.DUAL. 1.8 FLEX 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FIAT', 'IDEA ADV./ ADV.LOCK.DUALOGIC 1.8 FLEX 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FIAT', 'IDEA ADV.EXT./ADV.EXT. LOC. 1.8 FLEX 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FIAT', 'IDEA ADVENT./ ADV.LOCKER 1.8 MPI FLEX 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FIAT', 'IDEA ATTRACTIVE 1.4 FIRE FLEX 8V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FIAT', 'IDEA ELX 1.4 MPI FIRE FLEX 8V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FIAT', 'IDEA ELX 1.8 MPI FLEX 8V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FIAT', 'IDEA ESSENCE 1.6 FLEX 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FIAT', 'IDEA ESSENCE DUALOGIC 1.6 FLEX 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FIAT', 'IDEA ESSENCE SUBLIME 1.6 FLEX 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FIAT', 'IDEA ESSENCE SUBLIME DUAL.1.6 FLEX16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FIAT', 'IDEA HLX 1.8 MPI FLEX 8V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FIAT', 'IDEA SPORTING 1.8 FLEX 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FIAT', 'IDEA SPORTING DUALOGIC 1.8 FLEX 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FIAT', 'LINEA 1.9/ HLX 1.9/ 1.8 FLEX 16V 4P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'LINEA 1.9/ HLX 1.9/1.8 FLEX DUALOGIC 4P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'LINEA ABSOLUTE 1.9/1.8 FLEX DUALOGIC 4P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'LINEA ESSEN.SUBLIME 1.8 FLEX 16V 4P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'LINEA ESSEN.SUBLIME DUAL.1.8 FLEX 16V 4P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'LINEA ESSENCE 1.8 FLEX 16V 4P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'LINEA ESSENCE DUALOGIC 1.8 FLEX 16V 4P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'LINEA LX 1.9/ 1.8 FLEX 16V 4P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'LINEA LX 1.9/ 1.8 FLEX 16V DUALOGIC 4P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'LINEA T-JET 1.4 16V TURBO 4P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'MAREA CITY', 'Não informado', 0),
  ('FIAT', 'MAREA ELX 1.8 MPI 16V 132CV 4P', 'Não informado', 0),
  ('FIAT', 'MAREA ELX 2.0 20V 4P', 'Não informado', 0),
  ('FIAT', 'MAREA ELX 2.4 MPI 20V 4P', 'Não informado', 0),
  ('FIAT', 'MAREA HLX 2.0 20V 4P', 'Não informado', 0),
  ('FIAT', 'MAREA HLX 2.4 MPI 20V 4P AUT.', 'Não informado', 0),
  ('FIAT', 'MAREA HLX 2.4 MPI 20V 4P MEC.', 'Não informado', 0),
  ('FIAT', 'MAREA SX 1.6 MPI 16V 106CV 4P', 'Não informado', 0),
  ('FIAT', 'MAREA SX 1.8 16V 4P', 'Não informado', 0),
  ('FIAT', 'MAREA SX 2.0 20V 4P', 'Não informado', 0),
  ('FIAT', 'MAREA TURBO 2.0 20V 4P', 'Não informado', 0),
  ('FIAT', 'MAREA WEEKEND CITY 4P', 'Não informado', 0),
  ('FIAT', 'MAREA WEEKEND ELX 1.8 MPI 16V 132CV 4P', 'Não informado', 0),
  ('FIAT', 'MAREA WEEKEND ELX 2.0 20V 4P', 'Não informado', 0),
  ('FIAT', 'MAREA WEEKEND ELX 2.4 MPI 20V 4P', 'Não informado', 0),
  ('FIAT', 'MAREA WEEKEND HLX 2.0 20V 4P', 'Não informado', 0),
  ('FIAT', 'MAREA WEEKEND HLX 2.4 MPI 20V 4P AUT.', 'Não informado', 0),
  ('FIAT', 'MAREA WEEKEND HLX 2.4 MPI 20V 4P MEC.', 'Não informado', 0),
  ('FIAT', 'MAREA WEEKEND SX 1.6 MPI 16V 106CV 4P', 'Não informado', 0),
  ('FIAT', 'MAREA WEEKEND SX 1.8 16V 4P', 'Não informado', 0),
  ('FIAT', 'MAREA WEEKEND SX 2.0 20V 4P', 'Não informado', 0),
  ('FIAT', 'MAREA WEEKEND TURBO 2.0 20V 4P', 'Não informado', 0),
  ('FIAT', 'MOBI DRIVE 1.0 FLEX 6V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'MOBI DRIVE GSR 1.0 FLEX 6V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'MOBI EASY 1.0 FIRE FLEX 5P.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'MOBI EASY ON 1.0 FIRE FLEX 5P.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'MOBI LIKE 1.0 FIRE FLEX 5P.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'MOBI LIKE ON 1.0 FIRE FLEX 5P.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'MOBI TREKKING 1.0 FLEX 5P.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'MOBI WAY 1.0 FIRE FLEX 5P.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'MOBI WAY ON 1.0 FIRE FLEX 5P.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'OGGI', 'Não informado', 0),
  ('FIAT', 'PALIO 1.0 CELEBR. ECONOMY F.FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO 1.0 CELEBR. ECONOMY F.FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO 1.0 ECONOMY FIRE FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO 1.0 ECONOMY FIRE FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO 1.0/ TROFEO 1.0 FIRE/ FIRE FLEX 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO 1.0/ TROFEO 1.0 FIRE/ FIRE FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO 1.5 MPI 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO 1.5 MPI 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO 1.6 MPI 16V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO 1.6 MPI 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO 1.8R MPI FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO 1.8R MPI FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ATTRA. BEST SELLER 1.0 EVO FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ATTRA. BEST SELLER 1.4 EVO FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ATTRACTIVE 1.0 EVO FIRE FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ATTRACTIVE 1.4 EVO FIRE FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO CELEBRATION 1.0 FIRE FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO CELEBRATION 1.0 FIRE FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO CITY 1.0 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO CITY 1.5/1.6 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO CITYMATIC 1.0 MPI', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ED 1.0 MPI 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO EDX 1.0 MPI 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO EDX 1.0 MPI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO EL 1.5 MPI 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO EL 1.6 SPI 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ELX 1.0 FIRE/30 ANOS F. FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ELX 1.0 MPI FIRE 16V 4P (25 ANOS)', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ELX 1.0/ 1.0 FIRE FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ELX 1.3 MPI FIRE 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ELX 1.3 MPI FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ELX 1.4 MPI FIRE FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ELX 1.5 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ELX 1.6 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ELX 1.6 MPI 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ELX 1.8/ 1.8 MPI FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ELX DUALOGIC 1.8 MPI FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ELX/ 500 1.0 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ESSENCE 1.6 FLEX 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO ESSENCE DUALOGIC 1.6 FLEX 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO EX 1.0 MPI 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO EX 1.0 MPI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO EX 1.0 MPI FIRE 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO EX 1.0 MPI FIRE/ FIRE FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO EX 1.3 MPI FIRE 8V 67CV 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO EX 1.3 MPI FIRE 8V 67CV 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO EX 1.8 MPI 8V 103CV 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO EX CENTURY 1.0 MPI FIRE 16V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO EX CENTURY 1.0 MPI FIRE 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO HLX 1.8 MPI 8V 103CV 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO HLX 1.8 MPI FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO RUA 1.0 FIRE FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO SPORT.INTERLAGOS 1.6 FLEX 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO SPORT.INTERLAGOS DUAL.1.6 FLEX 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO SPORTING 1.6 FLEX 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO SPORTING B.EDIT. 1.6 FLEX 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO SPORTING DUAL. B.EDIT. 1.6 FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO SPORTING DUALOGIC 1.6 FLEX 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO STILE 1.6 MPI 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO W.ADV. LOC. ITAL.DUAL.1.8 FLEX 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WAY 1.0 FIRE FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WAY CELEBRATION 1.0 F. FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEK. ADV. DUALOGIC 1.8 FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEK. ADV. ITALIA 1.8 FLEX 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEK. ADV/ADV TRYON 1.8 MPI FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEK. ATTRACTIVE 1.4 FIRE FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEK. LOCK. ITALIA 1.8 FLEX 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEK.ADV. ITAL. DUAL. 1.8 FLEX 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEK.ADV.LOCK.DUALOGIC 1.8 FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND 1.0 6-MARCHAS', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND 1.5 MPI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND 1.6 MPI 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND ADV. EXT. 1.8 DUAL. FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND ADV. EXT. 1.8 FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND ADV. LOC.EXT.1.8 DUAL.FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND ADV. LOCKER EXT. 1.8 FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND ADVENTURE 1.6 8V/16V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND ADVENTURE 1.8 8V 103CV 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND ADVENTURE LOCKER 1.8 FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND CITY 1.5/ 1.6 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND ELX 1.0 MPI FIRE 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND ELX 1.3 MPI FIRE 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND ELX 1.3 MPI FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND ELX 1.4 MPI FIRE FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND ELX 1.5 MPI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND ELX 1.6 MPI', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND EX 1.3 MPI FIRE 8V 67CV 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND EX 1.5 MPI', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND EX 1.8 MPI 8V 103CV 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND HLX 1.8 MPI FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND SPORT 1.6 MPI 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND STILE 1.6 MPI 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND STILE 1.8 MPI 8V 103CV 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND TREKKING 1.4 FIRE FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND TREKKING 1.6 FLEX 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO WEEKEND TREKKING 1.8 MPI FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO YOUNG 1.0 MPI 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO YOUNG 1.0 MPI 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO YOUNG 1.0 MPI FIRE 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PALIO YOUNG 1.0 MPI FIRE 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PANORAMA C/CL', 'Não informado', 0),
  ('FIAT', 'PREMIO CS 1.5 I.E. 2P/ SL 1.6/1.5/1.3 4P', 'Não informado', 0),
  ('FIAT', 'PREMIO CS 1.6/ 1.5/ 1.3 2P', 'Não informado', 0),
  ('FIAT', 'PREMIO CSL 1.6 I.E./ 1.5 4P', 'Não informado', 0),
  ('FIAT', 'PREMIO CSL 1.6/ 1.5', 'Não informado', 0),
  ('FIAT', 'PREMIO S 1.5 I.E./ 1.5 / 1.3', 'Não informado', 0),
  ('FIAT', 'PULSE DRIVE 1.0 TURBO 200 FLEX AUT.', 'AUTOMOVEL', 0),
  ('FIAT', 'PULSE DRIVE 1.3 8V FLEX AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PULSE DRIVE 1.3 8V FLEX MEC', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PULSE IMPETUS 1.0 TURBO 200 FLEX AUT', 'AUTOMOVEL', 0),
  ('FIAT', 'PUNTO 1.4 FIRE FLEX 8V 5P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'PUNTO ATTRACTIVE 1.4 FIRE FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'PUNTO ATTRACTIVE ITALIA 1.4 F.FLEX 8V 5P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'PUNTO BLACKMOTION 1.8 FLEX 16V 5P.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'PUNTO BLACKMOTION DUAL. 1.8 FLEX 16V 5P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'PUNTO CABRIO', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'PUNTO EL/ELX', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'PUNTO ELX 1.4 FIRE FLEX 8V 5P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'PUNTO ESSENCE 1.6 FLEX 16V 5P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'PUNTO ESSENCE 1.8 FLEX 16V 5P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'PUNTO ESSENCE DUALOGIC 1.6 FLEX 16V 5P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'PUNTO ESSENCE DUALOGIC 1.8 FLEX 16V 5P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'PUNTO ESSENCE SP 1.6 FLEX 16V 5P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'PUNTO ESSENCE SP DUALOGIC 1.6 FLEX 16V', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'PUNTO HLX 1.8 FLEX 8V 5P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'PUNTO S', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'PUNTO SPORTING 1.8 FLEX 8V / 16V 5P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'PUNTO SPORTING DUALOGIC 1.8 FLEX 16V 5P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'PUNTO SX', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'PUNTO T-JET 1.4 16V TURBO 5P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('FIAT', 'SIENA 1.0 MPI/ 500 1.0 MPI', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA 1.0/ EX 1.0 MPI FIRE/ FIRE FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA 1.5 MPI 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA ATTRACTIVE 1.0 FIRE FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA ATTRACTIVE 1.4 FIRE FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA CELEBRATION 1.0 FIRE FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA CITY 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA EL 1.0 MPI FIRE FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA EL 1.4 MPI FIRE FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA EL 1.6 MPI 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA EL 1.6 SPI', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA EL CELEB. 1.0 MPI FIRE FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA EL CELEB. 1.4 MPI FIRE FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA ELX 1.0 MPI FIRE 16V 4P (25 ANOS)', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA ELX 1.0 MPI FIRE/FIRE FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA ELX 1.3 MPI FIRE 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA ELX 1.3 MPI FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA ELX 1.4 MPI FIRE FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA ELX 1.5 MPI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA ELX 1.6 MPI 8V/16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA ELX 1.8 MPI 8V 103CV 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA ESSENCE 1.6 FLEX 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA ESSENCE DUALOGIC 1.6 FLEX 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA EX 1.0 MPI FIRE 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA EX 1.3 MPI FIRE 8V 67CV 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA EX 1.8 MPI 8V 103CV 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA HL 1.6 MPI 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA HLX 1.8 MPI FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA HLX DUALOGIC 1.8 MPI FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA SPORTING 1.6 FLEX 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA SPORTING DUALOGIC 1.6 FLEX 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA STILE/SPORT MTV 1.6 MPI 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'SIENA TETRAFUEL 1.4 MPI FIRE FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STILO 1.8 ATTRACTIVE FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'STILO 1.8 MS LIM.EDIT./ MS SEASON 16V', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'STILO 1.8 SP FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'STILO 1.8 SPORTING FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'STILO 1.8/ 1.8 CONNECT 8V 103CV 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'STILO 1.8/ 1.8 CONNECT FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'STILO 1.8/ 1.8 SP/ CONNECT 16V 122CV 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'STILO 2.4 ABARTH 20V 167CV 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'STILO DUALOGIC 1.8 ATTRACTIVE FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'STILO DUALOGIC 1.8 BLACKMOTION FLEX 8V', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'STILO DUALOGIC 1.8 FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'STILO DUALOGIC 1.8 SP FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'STILO DUALOGIC 1.8 SPORTING FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'STILO DUOLOGIC 1.8 ATTRACTIVE FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FIAT', 'STRADA 1.3 MPI FIRE 8V 67CV CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA 1.3 MPI FIRE 8V 67CV CS', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA 1.4 MPI FIRE FLEX 8V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA 1.4 MPI FIRE FLEX 8V CS', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ADV. EXT. 1.8 LOCKER DUAL.FLEX CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ADV. EXT./ EXT.1.8 LOCKER FLEX CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ADV. EXTREME 1.8 DUAL. FLEX CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ADV. M. MARCH. 1.8 FLEX 16V CD', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ADV. M. MARCH.1.8 DUAL. FLEX CD', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ADV.1.8 16V DUALOGIC FLEX CD', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ADV.1.8 16V DUALOGIC FLEX CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ADV.1.8 16V LOCKER DUAL. FLEX CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ADV.1.8 16V LOCKER DUALO. FLEX CD', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ADV.EXT. 1.8 LOCKER DUAL. FLEX CD', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ADV.EXT./ EXT. 1.8 LOCKER FLEX CD', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ADV/ADV TRYON 1.8 MPI FLEX 8V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ADVENTURE 1.6 MPI 16V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ADVENTURE 1.8 MPI 8V 103CV CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ADVENTURE 1.8/ 1.8 LOCKER FLEX CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ADVENTURE EXT. 1.8 DUAL. FLEX CD', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ADVENTURE1.8/ 1.8 LOCKER FLEX CD', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA CELEB. 1.4 MPI FIRE FLEX 8V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA CELEB. 1.4 MPI FIRE FLEX 8V CS', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ENDURANCE 1.3 FLEX 8V CS IN THE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ENDURANCE 1.4 FLEX 8V CD', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA ENDURANCE 1.4 FLEX 8V CS PLUS', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA FIRE', 'Não informado', 0),
  ('FIAT', 'STRADA FREEDOM 1.3 FLEX 8V CD', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA FREEDOM 1.3 FLEX 8V CS PLUS', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA FREEDOM 1.4 FLEX 8V CD', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA FREEDOM 1.4 FLEX 8V CS', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA LX 1.6 16V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA LX 1.6 MPI 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA RANCH', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA SPORTING 1.8 FLEX 16V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA TREK. M. MARCH. 1.6 FLEX 16V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA TREKKING 1.4 MPI FIRE FLEX 8V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA TREKKING 1.4 MPI FIRE FLEX 8V CS', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA TREKKING 1.6 16V FLEX CD', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA TREKKING 1.6 16V FLEX CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA TREKKING 1.6 16V FLEX CS', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA TREKKING 1.6 16V LOCKER FLEX CD', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA TREKKING 1.6 MPI', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA TREKKING 1.8 MPI FLEX 8V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA TREKKING 1.8 MPI FLEX 8V CS', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA VOLCANO 1.3 FLEX 8V CD', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA VOLCANO AT', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA WORKING', 'Não informado', 0),
  ('FIAT', 'STRADA WORKING 1.4 MPI FIRE FLEX 8V CD', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA WORKING 1.4 MPI FIRE FLEX 8V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA WORKING 1.4 MPI FIRE FLEX 8V CS', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA WORKING 1.6 MPI 16V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA WORKING 1.6 MPI 16V CS', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA WORKING 1.8 MPI 8V 103CV CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA WORKING 1.8 MPI 8V 103CV CS', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA WORKING CD', 'Não informado', 0),
  ('FIAT', 'STRADA WORKING CELEB.1.4 FIRE FLEX 8V CD', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA WORKING CELEB.1.4 FIRE FLEX 8V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA WORKING CELEB.1.4 FIRE FLEX 8V CS', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA WORKING HARD 1.4 FIRE FLEX 8V CD', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA WORKING HARD 1.4 FIRE FLEX 8V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA WORKING HARD 1.4 FIRE FLEX 8V CS', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA WORKING PLUS 1.4 8V FLEX CS', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA/ STRADA WORKING 1.5 MPI 8V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'STRADA/ STRADA WORKING 1.5 MPI 8V CS', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'TEMPRA 2.0 I.E 16V 2P E 4P', 'Não informado', 0),
  ('FIAT', 'TEMPRA 2.0 I.E. 8V 2P E 4P', 'Não informado', 0),
  ('FIAT', 'TEMPRA 2.0 MPI 16V', 'Não informado', 0),
  ('FIAT', 'TEMPRA 8V/ CITY 8V', 'Não informado', 0),
  ('FIAT', 'TEMPRA HLX 2.0 16V 4P', 'Não informado', 0),
  ('FIAT', 'TEMPRA OURO 16V 2P E 4P', 'Não informado', 0),
  ('FIAT', 'TEMPRA OURO/PRATA 2.0 2P E 4P', 'Não informado', 0),
  ('FIAT', 'TEMPRA STILE 2.0 I.E. TURBO 4P', 'Não informado', 0),
  ('FIAT', 'TEMPRA SW SLX 2.0 I.E.', 'Não informado', 0),
  ('FIAT', 'TEMPRA SX 2.0 16V 4P', 'Não informado', 0),
  ('FIAT', 'TEMPRA SX 2.0 I.E. 8V 4P', 'Não informado', 0),
  ('FIAT', 'TEMPRA TURBO 2.0 I.E. 2P', 'Não informado', 0),
  ('FIAT', 'TIPO 1.6 I.E. 2P E 4P', 'Não informado', 0),
  ('FIAT', 'TIPO 1.6 MPI 4P', 'Não informado', 0),
  ('FIAT', 'TIPO 2.0 16V 2P/4P', 'Não informado', 0),
  ('FIAT', 'TIPO 2.0 SLX 4P', 'Não informado', 0),
  ('FIAT', 'TORO BLACKJACK 2.4 16V FLEX AUT', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'TORO ENDURANCE 1.3 T270', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'TORO ENDURANCE 1.8 16V FLEX AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'TORO ENDURANCE 1.8 16V FLEX MEC.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'TORO FREEDOM 1.8 16V FLEX AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'TORO FREEDOM 2.0 16V 4X2 TB DIESEL MEC.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'TORO FREEDOM 2.0 16V 4X4 DIESEL AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'TORO FREEDOM 2.0 16V 4X4 TB DIESEL MEC.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'TORO FREEDOM 2.4 16V FLEX AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'TORO FREEDOM ROAD 1.8 16V FLEX AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'TORO FREEDOM ROAD 2.4 16V FLEX AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'TORO OPENING EDITION 1.8 16V FLEX AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'TORO OPENNING ED. PLUS 1.8 16V FLEX AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'TORO RANCH 2.0 16V 4X4 TB DISIEL', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'TORO ULTRA 2.0 16V 4X4 TB DIESIL AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'TORO VOLCANO 1.3 T270 4X2 FLEX AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'TORO VOLCANO 2.0 16V 4X4 TB DIESEL AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FIAT', 'UNO 1.6 MPI 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO 1.6R MPI / 1.6R / 1.5R', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO ATTRACTI. CELEB.1.4 EVO F.FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO ATTRACTI. CELEB.1.4 EVO F.FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO ATTRACTIVE 1.0 EVO FIRE FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO ATTRACTIVE 1.0 FLEX 6V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO ATTRACTIVE 1.4 EVO FIRE FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO ATTRACTIVE 1.4 EVO FIRE FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO CITY / SMART CITY 1.0 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO CS/TOP/SPORT 1.5 I.E. / 1.5 /1.3', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO CS/TOP/SPORT 1.5 I.E. / 1.5 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO CSL 1.6 4P (ARGENTINO)', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO DRIVE 1.0 FLEX 6V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO ECONOMY 1.4 EVO FIRE FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO ECONOMY 1.4 EVO FIRE FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO ECONOMY CELEB. 1.4 EVO F. FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO ECONOMY CELEB. 1.4 EVO F. FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO EVOLUTION 1.4 FIRE FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO FURGÃO 1.0 FIRE FLEX 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO FURGÃO 1.3 MPI FIRE/ FIRE FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO FURGÃO 1.5 MPI/I.E.', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO FURGÃO 1.5/ 1.3', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO MILLE 1.0 ELECTRONIC 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO MILLE 1.0 FIRE/ F.FLEX/ ECONOMY 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO MILLE 1.0 FIRE/ F.FLEX/ ECONOMY 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO MILLE 1.0/ I.E./ ELECTRONIC/ BRIO', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO MILLE CELEB. WAY ECON. 1.0 F.FLEX 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO MILLE CELEB. WAY ECON. 1.0 F.FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO MILLE CELEB/CELEB.ECON 1.0 F.FLEX 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO MILLE CELEB/CELEB.ECON 1.0 F.FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO MILLE ELX 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO MILLE EP 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO MILLE GRAZIE 1.0 FIRE FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO MILLE SX 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO MILLE SX YOUNG 1.0 IE', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO MILLE WAY ECO.XINGU 1.0 F.FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO MILLE WAY ECONOMY 1.0 F.FLEX 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO MILLE WAY ECONOMY 1.0 F.FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO MILLE/ MILLE EX/ SMART 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO MILLE/ MILLE EX/ SMART 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO S 1.5 I.E. / 1.5 / 1.3/ SX 1.3', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO SPORT. DUAL. 1.4 B.EDIT. FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO SPORT.INTERLAGOS 1.4 EVO F.FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO SPORTING 1.3 FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO SPORTING 1.4 B.EDIT. FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO SPORTING 1.4 EVO FIRE FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO SPORTING 1.4 EVO FIRE FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO SPORTING DUALOGIC 1.3 FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO SPORTING DUALOGIC 1.4 EVO FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO TURBO 1.4 I.E. 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO VIVACE 1.0 EVO FIRE FLEX 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO VIVACE CELEB. 1.0 EVO F. FLEX 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO VIVACE CELEB. 1.0 EVO F.FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO VIVACE COLLEGE 1.0 EVO FIREFLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO VIVACE ITALIA 1.0 EVO F. FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO VIVACE/RUA 1.0 EVO FIRE FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO WAY 1.0 EVO FIRE FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO WAY 1.0 EVO FIRE FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO WAY 1.0 FLEX 6V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO WAY 1.3 FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO WAY 1.4 EVO DUALOGIC FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO WAY 1.4 EVO FIRE FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO WAY 1.4 EVO FIRE FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO WAY CELEB. 1.0 EVO FIRE FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO WAY CELEB. 1.0 EVO FIRE FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO WAY CELEB. 1.4 EVO FIRE FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO WAY CELEB. 1.4 EVO FIRE FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO WAY DUALOGIC 1.3 FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO WAY RIO 450 1.0 EVO FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO WAY XINGU 1.0 EVO F.FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIAT', 'UNO WAY XINGU 1.4 EVO F.FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FIBRAVAN', 'BUGGY OFF ROAD 1.8 8V', 'Não informado', 0),
  ('FIBRAVAN', 'BUGGY PLUS 1.6 8V', 'Não informado', 0),
  ('FIBRAVAN', 'BUGGY VIP 1.6 8V TOTAL FLEX', 'Não informado', 0),
  ('FIBRAVAN', 'BUGGY VIP 1.8 8V', 'Não informado', 0),
  ('FNV', 'R / FNV – FRUEHAUF', 'Não informado', 0),
  ('FNV', 'R / FNV – FRUEHAUF BCS', 'Não informado', 0),
  ('FNV', 'R / FNV – FRUEHAUF FB', 'Não informado', 0),
  ('FORD', 'AEROSTAR MINI-VAN 3.8', 'Não informado', 0),
  ('FORD', 'ASPIRE 1.3', 'Não informado', 0),
  ('FORD', 'BELINA GL 1.8 / 1.6', 'Não informado', 0),
  ('FORD', 'BELINA L 1.8/ 1.6', 'Não informado', 0),
  ('FORD', 'BRONCO SPORT WILDTRAK 2.0 TB 16V AWD AUT', 'Não informado', 0),
  ('FORD', 'CARGO 1113 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1113 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1114 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1114 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1117 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1117 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1119 TURBO 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'CARGO 1215 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1215 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1217 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1217 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1218 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1218 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1313 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1313 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1314 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1314 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1317/ 1317 E T 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1317/ 1317 E T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1319 E TURBO 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'CARGO 1415 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1415 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1417 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1417 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1418 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1418 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1419 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1419 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1419 TURBO 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'CARGO 1421 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1421 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1422 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1422 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1517 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1517 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1519 E TURBO 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'CARGO 1519 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1519 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1521 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1521 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1615 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1615 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1617 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1617 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1618 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1618 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1619 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1619 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1621 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1621 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1622 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1622 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1624 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1624 TURBO 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1630 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1630 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1717 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1717/ 1717 E TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1719 TURBO 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'CARGO 1721 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1721 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1722/ 1722 E T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1722/ 1722 E TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1723 E TURBO 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'CARGO 1729 E TURBO 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'CARGO 1731 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1731 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1832 E TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1932 E TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 1933 E TURBO 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'CARGO 2042 E TURBO 4X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'CARGO 2217 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 2218 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 2319 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 2322 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 2324 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 2421 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 2422/ 2422 E 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 2423 E 6X2 TURBO 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'CARGO 2425 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 2428 E T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 2428 E T 8X2 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 2429 E 6X2 TURBO 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'CARGO 2622/ 2622 E 6X4 T 3-EIXOS 2P (DIE', 'Não informado', 0),
  ('FORD', 'CARGO 2623 E 6X4 TURBO 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'CARGO 2626 6X4 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 2628 E 6X4 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 2629 E 6X4 TURBO 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'CARGO 2630 6X4 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 2631 6X4 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 2632 E 6X4 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 2831 6X4 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 2842 E TURBO 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'CARGO 2932 E 6X4 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 3129 6X4 TURBO 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'CARGO 3132 E 6X4 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 3133 E 6X4 TURBO 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'CARGO 3222 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 3224 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 3530 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 4030 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 4031 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 4331/ 4331S TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 4432 E TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 4532 E TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 5031 6X4 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 5032 E 6X4 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 6332 E 6X4 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 712 E TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 814 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'CARGO 815/ 815 S/ 815 E TURBO 2P (DIESEL', 'Não informado', 0),
  ('FORD', 'CARGO 816 E TURBO 2P (DIESEL)(E5)', 'CAMINHõES-V-PESADOS', 0),
  ('FORD', 'CLUB WAGON V8', 'Não informado', 0),
  ('FORD', 'CLUB WAGON XLT 4.9 V6', 'Não informado', 0),
  ('FORD', 'CONTOUR SE/ GL/ LX 2.0 16V', 'Não informado', 0),
  ('FORD', 'CONTOUR SE/GL/ LX 2.5 24V', 'Não informado', 0),
  ('FORD', 'CORCEL II GL/GT', 'Não informado', 0),
  ('FORD', 'CORCEL II L', 'Não informado', 0),
  ('FORD', 'COURIER 1.3I/FURGÃO', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'COURIER 1.6 L/ 1.6 FLEX', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'COURIER CLX 1.4I 16V', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'COURIER SI 1.4I 16V', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'COURIER SPORT 1.6 8V', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'COURIER VAN 1.6/ 1.6 FLEX 8V ( CARGA )', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'COURIER XL/XL-RS 1.6/ XL 1.6 FLEX', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'CROWN VICTORIA LX 4.6', 'Não informado', 0),
  ('FORD', 'DEL REY BELINA GHIA', 'Não informado', 0),
  ('FORD', 'DEL REY BELINA GL', 'Não informado', 0),
  ('FORD', 'DEL REY BELINA GLX', 'Não informado', 0),
  ('FORD', 'DEL REY BELINA L', 'Não informado', 0),
  ('FORD', 'DEL REY GHIA 1.8 / 1.6 2P E 4P', 'Não informado', 0),
  ('FORD', 'DEL REY GLX 1.6/1.8 / GL 1.6/1.8 2P E 4P', 'Não informado', 0),
  ('FORD', 'DEL REY L 1.8 / 1.6 2P E 4P', 'Não informado', 0),
  ('FORD', 'ECOSPORT 4WD 2.0/ 2.0 FLEX 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT FREESTYLE 1.5 12V FLEX 5P AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT FREESTYLE 1.5 12V FLEX 5P MEC.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT FREESTYLE 1.6 16V FLEX 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT FREESTYLE 1.6 16V FLEX 5P AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT FREESTYLE 2.0 16V 4WD FLEX 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT FREESTYLE 2.0 16V FLEX 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT FREESTYLE 2.0 16V FLEX 5P AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT FREESTYLE PLUS 1.5 FLEX 5P AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT S 1.6 16V FLEX 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT SE 1.5 12V FLEX 5P AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT SE 1.5 12V FLEX 5P MEC.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT SE 1.6 16V FLEX 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT SE 1.6 16V FLEX 5P AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT SE 2.0 16V FLEX 5P AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT SE DIRECT 1.6 16V FLEX 5P AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT STORM 2.0 4WD 16V FLEX 5P AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT TITANIUM 1.6 16V FLEX 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT TITANIUM 2.0 16V FLEX 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT TITANIUM 2.0 16V FLEX 5P AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT XL 1.6/ 1.6 FLEX 8V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT XL SUPERCHARGER 1.0 8V 95CV 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT XLS 1.6/ 1.6 FLEX 8V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT XLS 2.0/2.0 FLEX 16V 5P AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT XLS FREESTYLE 1.6 FLEX 8V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT XLT 1.6/ 1.6 FLEX 8V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT XLT 2.0/ 2.0 FLEX 16V 5P AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT XLT 2.0/ 2.0 FLEX 16V 5P MEC.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT XLT FREESTYLE 1.6 FLEX 8V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'ECOSPORT XLT FREESTYLE 2.0 FLEX 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'EDGE LIMITED 3.5 V6 24V AWD AUT.', 'Não informado', 0),
  ('FORD', 'EDGE LIMITED 3.5 V6 24V FWD AUT.', 'Não informado', 0),
  ('FORD', 'EDGE SEL 3.5 V6 24V AWD AUT.', 'Não informado', 0),
  ('FORD', 'EDGE SEL 3.5 V6 24V FWD AUT.', 'Não informado', 0),
  ('FORD', 'EDGE TITANIUM 3.5 V6 24V AWD AUT.', 'Não informado', 0),
  ('FORD', 'ESCORT GHIA 1.8I / 1.8 / 1.6', 'Não informado', 0),
  ('FORD', 'ESCORT GHIA 2.0I / 2.0', 'Não informado', 0),
  ('FORD', 'ESCORT GL 1.6 MPI', 'Não informado', 0),
  ('FORD', 'ESCORT GL 1.6I / 1.6', 'Não informado', 0),
  ('FORD', 'ESCORT GL 1.8I / 1.8', 'Não informado', 0),
  ('FORD', 'ESCORT GL 1.8I 16V 3P', 'Não informado', 0),
  ('FORD', 'ESCORT GL 1.8I 16V 4P', 'Não informado', 0),
  ('FORD', 'ESCORT GLX 1.6I', 'Não informado', 0),
  ('FORD', 'ESCORT GLX 1.8I 16V 4P', 'Não informado', 0),
  ('FORD', 'ESCORT GLX 1.8I 8V', 'Não informado', 0),
  ('FORD', 'ESCORT GUARUJÁ 1.8 4P', 'Não informado', 0),
  ('FORD', 'ESCORT HOBBY 1.0', 'Não informado', 0),
  ('FORD', 'ESCORT HOBBY 1.6', 'Não informado', 0),
  ('FORD', 'ESCORT L 1.8I / 1.8', 'Não informado', 0),
  ('FORD', 'ESCORT L/LX 1.6', 'Não informado', 0),
  ('FORD', 'ESCORT RACER 2.0I', 'Não informado', 0),
  ('FORD', 'ESCORT RS 1.8I 16V', 'Não informado', 0),
  ('FORD', 'ESCORT S.W GL 1.8I 16V', 'Não informado', 0),
  ('FORD', 'ESCORT S.W. GLX 1.8I 16V', 'Não informado', 0),
  ('FORD', 'ESCORT SW 1.9 16V', 'Não informado', 0),
  ('FORD', 'ESCORT SW GL 1.6 MPI', 'Não informado', 0),
  ('FORD', 'ESCORT XR3 1.8 / 1.6 BENETON/FORM./LASER', 'Não informado', 0),
  ('FORD', 'ESCORT XR3 1.8 / 1.6 CONVERSÍVEL', 'Não informado', 0),
  ('FORD', 'ESCORT XR3 2.0I', 'Não informado', 0),
  ('FORD', 'ESCORT XR3 2.0I CONVERSÍVEL', 'Não informado', 0),
  ('FORD', 'EXPEDITION 5.4 V8', 'Não informado', 0),
  ('FORD', 'EXPLORER LIMITED 4.0 4X4 V6 213CV', 'Não informado', 0),
  ('FORD', 'EXPLORER LIMITED 5.0 4X4 V8', 'Não informado', 0),
  ('FORD', 'EXPLORER SPORT 4.0 V6', 'Não informado', 0),
  ('FORD', 'EXPLORER XL 4X2 4.0 V6', 'Não informado', 0),
  ('FORD', 'EXPLORER XL 4X4 4.0 V6', 'Não informado', 0),
  ('FORD', 'EXPLORER XLT 4X2 4.0 V6', 'Não informado', 0),
  ('FORD', 'EXPLORER XLT 4X4 4.0 V6', 'Não informado', 0),
  ('FORD', 'F-100 2.3', 'Não informado', 0),
  ('FORD', 'F-100 BLAZER 2.3', 'Não informado', 0),
  ('FORD', 'F-100 CD 2.3', 'Não informado', 0),
  ('FORD', 'F-100 SUPER 2.3', 'Não informado', 0),
  ('FORD', 'F-100 SUPER SÉRIE 2.3', 'Não informado', 0),
  ('FORD', 'F-1000 CD/BLAZER 3.6', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 CD/BLAZER 3.9 DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 LIGHTNING/ SUPER 4.9I', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 REGULAR CAB. 4.9I', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 S. S. DIESEL / S.S. DIESEL TURBO', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 SR XK DESERTER', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 SR XK DESERTER DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 SUPER 3.6 / SUPER SÉRIE 3.6', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 SUPER CE 4.9I / 3.6', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 SUPER DIESEL / SUPER DIESEL TURBO', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 SUPER DIESEL CE 3.9', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 SUPER SÉRIE CE 4.9I / 3.6', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 SUPER SÉRIE CE DIESEL 3.9', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 SUPER/ S.SÉRIE 4X4 3.9 DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 TROPICAL CD 2.5 HSD/4.3 DIESEL TB', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 TROPICAL CD 4.9I', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 TROPICAL SL/ VAN 4.9I', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 TROPICAL SL/ VAN T.DIESEL (TODAS)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 XL 2.5 HSD DIESEL TB', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 XL 4.9I', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 XL 4.9I CE', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 XL 4X4 DIESEL TURBO', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 XL DIESEL TURBO', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 XLT 2.5 HSD DIESEL TB', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 XLT 4X4 DIESEL TURBO', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 XLT CE 4.9I', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 XLT DIESEL TURBO', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-1000 XLT/XL LIGHTING 4.9I', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'F-11000 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-11000 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-12000 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-12000 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-13000 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-13000 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-14000 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-14000 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-14000 HD 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-14000 HD 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-150 XL TRITON 4.3 V6', 'Não informado', 0),
  ('FORD', 'F-150 XLT TRITON 4.3', 'Não informado', 0),
  ('FORD', 'F-150 XLT TRITON 4.6 V8', 'Não informado', 0),
  ('FORD', 'F-150 XLT TRITON 5.8', 'Não informado', 0),
  ('FORD', 'F-16000 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-16000 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-19000 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-19000 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-2000 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-21000 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-22000 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-250 F-MILHA CD 3.9 TB DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 TROPICAB CE 3.9 TB DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 TROPICAL 3.9 DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 TROPICAL 4.2 CE / CD DIESEL TB', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 TROPICAL 4.2 V6', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 TROPICAL SL/ VAN T.DIESEL (TODAS)', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 TROPICAMPO CD 3.9 TB DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 TROPICAMPO EXECUTIVE 3.9 TB DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 TROPICLASSIC 3.9 TB DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 TROPIVAN EXECUTIVE 3.9 TB DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 TROPIVAN/TROPI. PLUS 3.9 TB DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 XL 3.9 4X2 DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 XL 3.9 4X4 TB DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 XL 3.9 CD TB DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 XL 4.2 180CV CD TB DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 XL 4.2 TURBO DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 XL 4.2 V6', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 XL SUPER DUTY 3.9 DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 XL SUPER DUTY 4.2 TB DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 XL SUPER DUTY 4.2 V6', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 XLT 3.9 4X2 CD TB DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 XLT 3.9 4X2 DIESEL TB', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 XLT 3.9 4X4 CD TB DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 XLT 3.9 4X4 TB DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 XLT 4.2 180CV CD TB DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 XLT 4.2 TB DIESEL', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-250 XLT 4.2 V6', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('FORD', 'F-350 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-350 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'F-350 7.3 V-8 2P (GAS.)', 'Não informado', 0),
  ('FORD', 'F-350 CD 4P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-350 TROPICAMPO CD 2.8 (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'F-350 TROPICAMPO CD 3.9 TDI (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-4 MILHA CD 2.8 4X2 (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'F-4 MILHA CD 2.8 4X4 (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'F-4 MILHA CD 3.9 TDI (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-4000 4X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'F-4000 4X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'F-4000 TROP. MULTI CD 2.8 4X4 (DIES)(E5)', 'Não informado', 0),
  ('FORD', 'F-4000 TROP. MULTI CT 2.8 4X2 (DIE.)(E5)', 'Não informado', 0),
  ('FORD', 'F-4000 TROP. MULTI CT 2.8 4X4 (DIE.)(E5)', 'Não informado', 0),
  ('FORD', 'F-4000 TROPICAMPO CD 2.8 (DIESEL)(E5)', 'Não informado', 0),
  ('FORD', 'F-4000 TROPICAMPO CD 3.9 TDI (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-4000 TURBO (CUMMINS) 4X4 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-4000 TURBO(CUMMINS) 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-4000 TURBO(MWM) 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-7000 2P (DIESEL)', 'Não informado', 0),
  ('FORD', 'F-MAXX 815E 4.0 150CV (DIESEL) 6P', 'Não informado', 0),
  ('FORD', 'F-MAXX 816E 5.9 230CV (DIESEL) 6P(E5)', 'Não informado', 0),
  ('FORD', 'F-MAXX F-12000 5.9 162CV TD (DIESEL) 6P', 'Não informado', 0),
  ('FORD', 'F25 XL F22', 'Não informado', 0),
  ('FORD', 'FIESTA', 'Não informado', 0),
  ('FORD', 'FIESTA 1.0', 'Não informado', 0),
  ('FORD', 'FIESTA 1.0 8V FLEX/CLASS 1.0 8V FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA 1.0I 3P E 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA 1.3 3P E 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA 1.5 16V FLEX MEC. 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA 1.6 16V FLEX AUT. 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA 1.6 16V FLEX MEC. 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA 1.6 8V FLEX/CLASS 1.6 8V FLEX 5P', 'V5 AUTOMOVEL COMUM', 30),
  ('FORD', 'FIESTA 1.6 FLEX', 'Não informado', 0),
  ('FORD', 'FIESTA CLASS 1.0 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA CLASS 1.0 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA CLASS 1.6 8V 98CV 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA CLX 1.3I 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA CLX 1.3I 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA CLX 1.4I 16V 3P E 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA GL 1.0 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA GL 1.0 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA GL CLASS 1.0I 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA GLX 1.6 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA GLX 1.6 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA PERSONNALITÉ 1.0 8V 66CV 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA S 1.0 8V FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SE 1.0 8V FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SE 1.6 16V FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SE 1.6 8V FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SE PLUS 1.6 16V FLEX AUT. 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SE PLUS DIRECT 1.6 16V FLEX AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SE STYLE 1.6 16V FLEX MEC. 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SED. 1.6 8V FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SED. PERSONNALITÉ 1.0 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SED. SUPERCHARGER 1.0 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SEDAN 1.0 8V FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SEDAN 1.6 16V FLEX AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SEDAN 1.6 16V FLEX MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SEDAN S 1.0 8V FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SEDAN SE 1.0 8V FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SEDAN SE 1.6 16V FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SEDAN SE 1.6 8V FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SEDAN SEL 1.6 16V FLEX AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SEDAN SEL 1.6 16V FLEX MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SEDAN STREET 1.0 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SEDAN STREET 1.6 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SEDAN TITANIUM 1.6 16V FLEX AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SEDAN TITANIUM 1.6 16V FLEX MEC', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SEL 1.0 12V ECOBOOST AUT. 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SEL 1.6 16V FLEX  AUT. 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SEL 1.6 16V FLEX MEC. 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SEL STYLE 1.0 ECOBOOST AUT . 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SEL STYLE 1.6 16V FLEX MEC. 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SPORT 1.0MPI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SPORT 1.6 16V FLEX MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SPORT 1.6MPI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA STREET 1.0 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA STREET 1.6 8V 95CV 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA STREET/ ACTION 1.0 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA SUPERCHARGER 1.0 8V 95CV 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA TIT.PLUS 1.0 12V ECOBOOST AUT. 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA TITANIUM 1.6 16V FLEX AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA TITANIUM 1.6 16V FLEX MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA TRAIL 1.0 8V FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FIESTA TRAIL 1.6 8V FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FOCUS 1.6 FLEX 16V 5P AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FOCUS 1.6/ 1.6 FLEX 8V/16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'FOCUS 1.8 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FOCUS 2.0 16V/ 2.0 16V FLEX 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'FOCUS FASTBACK 2.0 16V FLEX 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FOCUS FASTBACK TIT. 2.0 16V FLEX 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FOCUS GHIA 2.0 16V/ 2.0 16V FLEX 5P AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FOCUS GHIA SED. 2.0 16V/ 2.0 16V FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FOCUS GHIA SED. 2.0 16V/2.0 16V FLEX AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FOCUS GHIA/ XR 2.0 /GHIA 2.0 16V FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FOCUS SE AT 2.0SC', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'FOCUS SEDAN 1.6 16V FLEX 4P AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'FOCUS SEDAN 1.6/ 1.6 FLEX 8V/16V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'FOCUS SEDAN 1.8 16V 115CV 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'FOCUS SEDAN 2.0 16V/ 2.0 16V FLEX 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'FOCUS SEDAN 2.0 16V/ 2.0 16V FLEX 4P AUT', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'FOCUS SEDAN TITANIUM 2.0 16V FLEX AUT', 'V10 /AUTOMóVEIS COMUM', 0),
  ('FORD', 'FOCUS TITANIUM 2.0 16V FLEX 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FOCUS TITANIUM 2.0 16V FLEX 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FORD KA 1.0 SE/SE PLUS TIVCT FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'FORD KA SE 1.0 HA B', 'V5 AUTOMOVEL COMUM', 30),
  ('FORD', 'FURGLAINE 3.6', 'Não informado', 0),
  ('FORD', 'FURGLAINE 3.9 DIESEL', 'Não informado', 0),
  ('FORD', 'FURGLAINE CHATEAUX/EXEC. 3.9 DIESEL', 'Não informado', 0),
  ('FORD', 'FUSION 2.5 16V 193CV AUT. (HíBRIDO)', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FORD', 'FUSION 2.5L I-VCT FLEX AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FORD', 'FUSION HYBRID 2.5 16V 193CV AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FORD', 'FUSION SE 2.5 I-VCT FLEX 16V AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FORD', 'FUSION SEL 2.0 ECOBO. 16V 248CV AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FORD', 'FUSION SEL 2.3 16V 162CV AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FORD', 'FUSION SEL 2.5 16V 173CV AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FORD', 'FUSION SEL 3.0 V6 24V 243CV AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FORD', 'FUSION SEL 3.0 V6 AWD 24V 243CV AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FORD', 'FUSION TITANIUM 2.0 145CV AUT. (HíBRIDO)', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FORD', 'FUSION TITANIUM 2.0 GTDI ECO. AWD AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FORD', 'FUSION TITANIUM 2.0 GTDI ECO. FWD AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FORD', 'FUSION TITANIUM 2.0 GTDI ECOBO. AWD AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FORD', 'FUSION TITANIUM 2.0 GTDI ECOBO. FWD AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FORD', 'FUSION TITANIUM HYBRID 2.0 145CV AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('FORD', 'IBIZA 3.9 FURGÃO DIESEL', 'Não informado', 0),
  ('FORD', 'IBIZA CHAT./EXEC. 3.9 DIESEL', 'Não informado', 0),
  ('FORD', 'KA 1.0 8V/1.0 8V ST FLEX 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA 1.0 S TIVCT FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA 1.0 SE/SE PLUS TIVCT FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA 1.0 SEL TICVT FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA 1.0 TECNO 12V FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA 1.0 TECNO 8V FLEX 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA 1.0 TICVT FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA 1.0I 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA 1.5 FREESTYLE 12V FLEX 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA 1.5 SE 12V FLEX 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA 1.5 SE 12V FLEX 5P MEC', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA 1.5 SE PLUS 12V FLEX 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA 1.5 SE/SE PLUS 16V FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA 1.5 SEDAN SE 12V FLEX 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA 1.5 SEDAN SE 12V FLEX 4P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA 1.5 SEDAN SE PLUS 12V FLEX 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA 1.5 SEDAN SE PLUS 12V FLEX 4P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA 1.6 8V FLEX 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA 1.6 TECNO 8V FLEX 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA ACTION 1.6 MPI 8V 95CV', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA BLACK 1.0 MPI 8V 65CV', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA BLACK 1.6 MPI 8V 95CV', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA CLX 1.3I 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA GL 1.0I ZETEC ROCAM', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA GL IMAGE 1.0I/ 1.0I ZETEC ROCAM', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA IMAGE 1.0I', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA MP3 1.0 MPI 8V 65CV', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA MP3 1.6 MPI 8V 95CV', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA SE SD 1.4', 'Não informado', 0),
  ('FORD', 'KA SE SD 1.5', 'Não informado', 0),
  ('FORD', 'KA SEDAN', 'Não informado', 0),
  ('FORD', 'KA SEL 1.5 16V FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA SPORT 1.6 8V FLEX 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA STREET 1.0I', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA TECNO 1.0I 8V ZETEC ROCAM', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA TRAIL 1.0 12V FLEX MEC. 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA TRAIL 1.5 16V FLEX MEC. 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA XR 1.6 MPI 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA+ SEDAN 1.0 SE/SE PLUS TIVCT FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA+ SEDAN 1.0 SEL TICVT FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA+ SEDAN 1.0 TICVT FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA+ SEDAN 1.5 16V FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA+ SEDAN 1.5 ADVANCED 16V FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'KA+ SEDAN 1.5 SEL 16V FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('FORD', 'MONDEO CLX 1.8 4P E 5P', 'Não informado', 0),
  ('FORD', 'MONDEO CLX 1.8I SW', 'Não informado', 0),
  ('FORD', 'MONDEO CLX 2.0I 4P AUT', 'Não informado', 0),
  ('FORD', 'MONDEO CLX 2.0I 4P MEC', 'Não informado', 0),
  ('FORD', 'MONDEO CLX 2.0I SW AUT', 'Não informado', 0),
  ('FORD', 'MONDEO CLX 2.0I SW MEC', 'Não informado', 0),
  ('FORD', 'MONDEO GHIA 2.0 16V 143CV 4P AUT', 'Não informado', 0),
  ('FORD', 'MONDEO GHIA 2.0 16V 143CV 4P MEC', 'Não informado', 0),
  ('FORD', 'MONDEO GHIA 2.5 V6 AUT', 'Não informado', 0),
  ('FORD', 'MONDEO GHIA 2.5 V6 MEC', 'Não informado', 0),
  ('FORD', 'MONDEO GLX 2.0 16V 4P AUT', 'Não informado', 0),
  ('FORD', 'MONDEO GLX 2.0 4P E 5P', 'Não informado', 0),
  ('FORD', 'MONDEO GLX 2.0I SW MEC./ AUT.', 'Não informado', 0),
  ('FORD', 'MUSTANG 3.8 V6', 'Não informado', 0),
  ('FORD', 'MUSTANG 3.8 V6 CONV.', 'Não informado', 0),
  ('FORD', 'MUSTANG COBRA 5.7 V8', 'Não informado', 0),
  ('FORD', 'MUSTANG GT V8', 'Não informado', 0),
  ('FORD', 'MUSTANG GT V8 CONVERSÍVEL', 'Não informado', 0),
  ('FORD', 'PAMPA 4X4 JEEP GL / L 1.6', 'Não informado', 0),
  ('FORD', 'PAMPA GHIA 1.6/1.8/DUO', 'Não informado', 0),
  ('FORD', 'PAMPA GL 1.6/ 1.8', 'Não informado', 0),
  ('FORD', 'PAMPA L 1.6', 'Não informado', 0),
  ('FORD', 'PAMPA L 1.8I / 1.8', 'Não informado', 0),
  ('FORD', 'PAMPA S 1.8', 'Não informado', 0),
  ('FORD', 'PROBE 2.0/2.2', 'Não informado', 0),
  ('FORD', 'PROBE GT 2.5 V6', 'Não informado', 0),
  ('FORD', 'RANGER 2.5 4X2 CD TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER 2.5 4X2 CE DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER 2.5 4X2 TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER 2.5 4X4 CD TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER 2.5 4X4 CE TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER 2.5 4X4 TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER 2.5I CD', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER 2.5I CE', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER 2.5I CS', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER LIMITED 2.3 150CV CD', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER LIMITED 2.5 16V 4X2 CD FLEX', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER LIMITED 3.0 PSE 4X4 CD TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER LIMITED 3.2 20V 4X4 CD AUT. DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER SPLASH CE', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER SPLASH CS', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER SPORT 2.5 FLEX 16V 4X2 CS', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER SPORTRAC 2.2 16V 4X4 CD DIES AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER STX 4.0 CS/ CE', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER TROPICAB 2.5 16V 4X2 FLEX', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER TROPICAB 3.2 20V 4X4 TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER TROPIVAN 2.5 16V 4X2 FLEX', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER TROPIVAN 3.2 20V 4X4 TB DIES.AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER TROPIVAN 3.2 20V 4X4 TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER TROPIVAN XLT 2.3 16V 150CV', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER TROPIVAN XLT 3.0 PSE 4X2 TB DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER TROPIVAN XLT 3.0 PSE 4X4 TB DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XL 2.2 4X4 CD DIESEL MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XL 2.2 4X4 CS DIESEL MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XL 2.3 16V 137CV 4X2 CD REPOWER.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XL 2.3 16V 137CV 4X2 CE REPOWER.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XL 2.3 16V 137CV 4X2 CS REPOWER.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XL 2.3 CS', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XL 2.8 8V 135CV 4X2 CD TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XL 2.8 8V 135CV 4X2 CE TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XL 2.8 8V 135CV 4X2 CS TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XL 2.8 8V 135CV 4X4 CD TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XL 2.8 8V 135CV 4X4 CE TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XL 2.8 8V 135CV 4X4 CS TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XL 3.0 PSE 163CV 4X2 CD TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XL 3.0 PSE 163CV 4X2 CS TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XL 3.0 PSE 163CV 4X4 CD TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XL 3.0 PSE 163CV 4X4 CS TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XL 4.0 12V V6 210CV 4X2 CS REPOW.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XL 4.0 CS', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 2.2 4X2 CD DIESEL AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 2.2 4X2 CD DIESEL MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 2.2 4X4 CD DIESEL AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 2.2 4X4 CD DIESEL MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 2.3 16V 145CV/150CV 4X2 CD', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 2.3 16V 145CV/150CV 4X2 CS', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 2.5 16V 4X2 CD FLEX', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 2.5 16V 4X2 CS', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 2.8 8V 135CV 4X2 CD TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 2.8 8V 135CV 4X2 CS TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 2.8 8V 135CV 4X4 CS TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 2.8/2.8 STORM 4X4 CD TB DIES', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 3.0 PSE 163CV 4X2 CD TB DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 3.0 PSE 163CV 4X2 CS TB DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 3.0 PSE 163CV 4X4 CD TB DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 3.0 PSE STORM 4X4 CD TB DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 3.2 20V 4X4 CD DIESEL AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 3.2 20V 4X4 CD DIESEL MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS 3.2 20V 4X4 CS DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLS SPORT 2.3 16V 150CV CS', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 2.3 16V 150CV CD REPOWER.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 2.3 CS', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 2.5 16V 4X2 CD FLEX', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 2.5 4X2 CD DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 2.5 4X2 CE DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 2.5 4X2 CS DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 2.5 4X4 CD DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 2.5 4X4 CE TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 2.5 4X4 CS TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 2.8 8V 135CV 4X2 CD TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 2.8 8V 135CV 4X4 CD TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 2.8 8V 135CV 4X4 CE TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 2CD 25B', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 3.0 PSE 163CV 4X2 CD TB DIES.', 'Não informado', 0),
  ('FORD', 'RANGER XLT 3.0 PSE 163CV 4X4 CD TB DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 3.2 20V 4X4 CD DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 3.2 20V 4X4 CD DIESEL AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 4.0 12V V6 210CV 4X4 CD REPOW', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 4.0 12V V6 210CV 4X4 CE REPOW', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 4.0 4X2 CE', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 4.0 4X2 CS', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 4.0 4X4 CD', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 4.0 4X4 CE', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT 4.0 4X4 CS', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT CD4 32', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'RANGER XLT LIMIT./L.CENT. 2.8 CD TB DIES', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'ROYALE GHIA 2.0I 4P / 2.0I / 2.0', 'Não informado', 0),
  ('FORD', 'ROYALE GL 1.8I 4P / 1.8I / 1.8', 'Não informado', 0),
  ('FORD', 'ROYALE GL 2.0I 2E4P / 2.0I / 2.0', 'Não informado', 0),
  ('FORD', 'TAURUS GL 3.0 V6', 'Não informado', 0),
  ('FORD', 'TAURUS GL SW 3.0 V6 24V', 'Não informado', 0),
  ('FORD', 'TAURUS L/LX 3.0 V6', 'Não informado', 0),
  ('FORD', 'TAURUS LX SW 3.0 V6 24V', 'Não informado', 0),
  ('FORD', 'TAURUS SHO 3.0 V6', 'Não informado', 0),
  ('FORD', 'THUNDERBIRD SC 3.8 V6', 'Não informado', 0),
  ('FORD', 'TRANSIT CHASSI 2.2 TDCI DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'TRANSIT CHASSI 2.4 TDCI DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'TRANSIT FURGÃO 2.2 TDCI CURTO DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'TRANSIT FURGÃO 2.2 TDCI LONGA DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'TRANSIT FURGÃO 2.2 TDCI LONGO JUMBO DIES', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'TRANSIT FURGÃO 3330 2.4 TDCI CURTO DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'TRANSIT FURGÃO 3550 2.4 TDCI LONGO DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'TRANSIT VAN 3550 2.2 TDCI 14/16LUG. DIES', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'TRANSIT VAN 3550 2.4 TDCI 14LUG. DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('FORD', 'VERONA GHIA 2.0I 4P', 'Não informado', 0),
  ('FORD', 'VERONA GL 1.8I / LX 1.8I 4P', 'Não informado', 0),
  ('FORD', 'VERONA GLX 1.8 (MODELO ANTIGO)', 'Não informado', 0),
  ('FORD', 'VERONA GLX 1.8I / 1.8 4P', 'Não informado', 0),
  ('FORD', 'VERONA GLX 2.0I / 2.0 4P', 'Não informado', 0),
  ('FORD', 'VERONA LX 1.6 (MODELO ANTIGO)', 'Não informado', 0),
  ('FORD', 'VERONA LX 1.8 (MODELO ANTIGO)', 'Não informado', 0),
  ('FORD', 'VERONA S 2.0I 4P', 'Não informado', 0),
  ('FORD', 'VERSAILLES GHIA 2.0I / 2.0 2P E 4P', 'Não informado', 0),
  ('FORD', 'VERSAILLES GL 1.8I / 1.8 2P E 4P', 'Não informado', 0),
  ('FORD', 'VERSAILLES GL 2.0I / 2.0 2P E 4P', 'Não informado', 0),
  ('FORD', 'WINDSTAR GL', 'Não informado', 0),
  ('FORD', 'WINDSTAR LX', 'Não informado', 0),
  ('FORMIGHIERI', 'SR / FORMIGHIERI', 'Não informado', 0),
  ('FOTON', '10-16DT 3.8 4X2 DIESEL(E5)', 'Não informado', 0),
  ('FOTON', 'AUMARK 3.5 - 11DT 2.8 4X2 TB DIESEL', 'Não informado', 0),
  ('FOTON', 'AUMARK 3.5 - 11ST 2.8 4X2 TB DIESEL', 'Não informado', 0),
  ('FOTON', 'AUMARK 3.5 - 14ST 2.8 4X2 TB DIESEL', 'Não informado', 0),
  ('FOTON', 'AUMARK 3.50AK 2.8 4X2 TB DIESEL', 'Não informado', 0),
  ('FOTON', 'AUMARK 6.50AK 3.8 4X2 TB DIESEL(E5)', 'Não informado', 0),
  ('FOTON', 'AUMARK 8.60AK 3.8 4X2 TB DIESEL(E5)', 'Não informado', 0),
  ('FOTON', 'CITYTRUCK 10-16DT 3.8 4X2 DIESEL (E5)', 'Não informado', 0),
  ('FOTON', 'FOTON 1039 3110B I26DS', 'CAMINHõES-LEVE-VANS', 0),
  ('FOTON', 'MINITRUCK 3.5 14DT 4X2 DIESEL(E5)', 'Não informado', 0),
  ('FOTON', 'MINITRUCK 3.5-12DT 4X2 DIESEL(E5)', 'Não informado', 0),
  ('FOTON', 'MINITRUCK 3.5-12ST 4X2 DIESEL (E5)', 'Não informado', 0),
  ('FOTON', 'MINITRUCK 3.5-14ST 4X2 DIESEL(E5)', 'Não informado', 0),
  ('FOX', '150T-3 ADVENTURE', 'Não informado', 0),
  ('FOX', '250T-10 ELITE', 'Não informado', 0),
  ('FYBER', 'BUGGY 2000W 1.6 8V', 'Não informado', 0),
  ('FYBER', 'BUGGY 2000W 1.8 8V/ 1.8 8V FLEX', 'Não informado', 0),
  ('FYM', 'FY100-10A 100CC', 'Não informado', 0),
  ('FYM', 'FY125-19 125CC', 'Não informado', 0),
  ('FYM', 'FY125-20 SACHS 125CC', 'Não informado', 0),
  ('FYM', 'FY125EY-2 125CC', 'Não informado', 0),
  ('FYM', 'FY125Y-3 125CC', 'Não informado', 0),
  ('FYM', 'FY150-3 150CC', 'Não informado', 0),
  ('FYM', 'FY150T-18 150CC', 'Não informado', 0),
  ('FYM', 'FY250 250CC', 'Não informado', 0),
  ('GANDOLFO', 'GANDOLFOSP SRS', 'Não informado', 0),
  ('GARINNI', 'GR08T4', 'Não informado', 0),
  ('GARINNI', 'GR125S', 'Não informado', 0),
  ('GARINNI', 'GR125ST', 'Não informado', 0),
  ('GARINNI', 'GR125T3', 'Não informado', 0),
  ('GARINNI', 'GR125U', 'Não informado', 0),
  ('GARINNI', 'GR125Z', 'Não informado', 0),
  ('GARINNI', 'GR150P/ GR150PI', 'Não informado', 0),
  ('GARINNI', 'GR150ST', 'Não informado', 0),
  ('GARINNI', 'GR150T3/ GR150TI', 'Não informado', 0),
  ('GARINNI', 'GR150U', 'Não informado', 0),
  ('GARINNI', 'GR250T3', 'Não informado', 0),
  ('GAS GAS', 'EC 125 ENDUCROSS', 'Não informado', 0),
  ('GAS GAS', 'EC 200 ENDUCROSS', 'Não informado', 0),
  ('GAS GAS', 'EC 250 ENDUCROSS', 'Não informado', 0),
  ('GAS GAS', 'EC 300 ENDUCROSS', 'Não informado', 0),
  ('GAS GAS', 'EC 400 FSE ENDUCROSS', 'Não informado', 0),
  ('GAS GAS', 'EC 450/ FSE/ FSR ENDUCROSS', 'Não informado', 0),
  ('GAS GAS', 'EC 50 ROOKIE ENDURO', 'Não informado', 0),
  ('GAS GAS', 'EC BOY 50', 'Não informado', 0),
  ('GAS GAS', 'MC 250', 'Não informado', 0),
  ('GAS GAS', 'PAMPERA 125CC', 'Não informado', 0),
  ('GAS GAS', 'PAMPERA 250CC', 'Não informado', 0),
  ('GAS GAS', 'TX BOY 50', 'Não informado', 0),
  ('GAS GAS', 'TXT 200 CONTACT', 'Não informado', 0),
  ('GAS GAS', 'TXT 280 CONTACT', 'Não informado', 0),
  ('GAS GAS', 'TXT 321 CONTACT', 'Não informado', 0),
  ('GAS GAS', 'TXT 50 ROOKIE', 'Não informado', 0),
  ('GEELY', 'EC7 1.8 16V 130CV 4P MEC.', 'Não informado', 0),
  ('GEELY', 'GC2 1.0 12V 68CV 5P', 'Não informado', 0),
  ('GM - CHEVROLET', 'A-10 2.5/4.1', 'Não informado', 0),
  ('GM - CHEVROLET', 'A-10 DE LUXE 2.5/4.1', 'Não informado', 0),
  ('GM - CHEVROLET', 'A-20 CUSTOM STD. CD/ DE LUXE CD', 'Não informado', 0),
  ('GM - CHEVROLET', 'A-20 CUSTOM/ C-20 LUXE 4.1', 'Não informado', 0),
  ('GM - CHEVROLET', 'A-20 CUSTOM/ C-20 S 4.1', 'Não informado', 0),
  ('GM - CHEVROLET', 'AGILE LT 1.4 MPFI 8V FLEXPOWER 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'AGILE LTZ 1.4 MPFI 8V FLEXPOWER 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'AGILE LTZ EASYTRONIC 1.4 8V FLEXPOWER 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'AGILE LTZ EFFECT 1.4 8V FLEXPOWER 5P MEC', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'AGILE LTZ EFFECT EASYTR.1.4 8V FLEXP. 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'AGILE LTZ WI-FI 1.4 8V FLEXPOWER 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA 2.0 8V/ CD 2.0 8V HATCHBACK 5P AUT', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA 2.0 8V/ CD 2.0 8V HATCHBACK 5P MEC', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA 2.0/ CD 2.0 8V 3P AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA 2.0/ CD/ GLS 2.0 MPFI 16V 3P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA 2.0/ CD/ SUNNY/ GLS 2.0 8V 3P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA 500 SEDAN 2.0 MPFI 16V 4P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA ADVANT. 2.0 MPFI 8V FLEXP. 5P AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA ADVANTAGE 2.0 MPFI 8V FLEXPOWER 5P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA ADVANTAGE 2.0 MPFI FLEXPOWER 8V 3P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA COMFORT 2.0 MPFI FLEXPOWER 8V 3P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA COMFORT 2.0 MPFI FLEXPOWER 8V 5P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA ELEG. 2.0 MPFI FLEXPOWER 8V 5P AUT', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA ELEGANCE 2.0 MPFI FLEXPOWER 8V 3P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA ELEGANCE 2.0 MPFI FLEXPOWER 8V 5P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA ELITE 2.0 MPFI FLEX POW. 8V 5P AUT', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA ELITE 2.0 MPFI FLEXPOWER 8V 5P MEC', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA GL 1.8 MPFI 3P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA GL MILENIUM 1.8 MPFI 4P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA GLS 2.0 MPFI SW', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA GSI 2.0 16V 136CV HATCHBACK 5P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA S.SPORT 2.0 F.POW. 5P/SPORT 2.0 3P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA SED. ADVANT. 2.0 8V MPFI FLEXP. 4P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA SED.ADVANT. 2.0 8V MPFI FLEXP. AUT', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA SED.COMF. 2.0 MPFI FLEXPOWER 8V 4P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA SED.COMF.2.0 MPFI MULTIPOWER 8V 4P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA SED.ELEG. 2.0 MPFI FLEXP.8V 4P AUT', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA SED.ELEG. 2.0 MPFI FLEXP.8V AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA SED.ELEG.2.0 MPFI FLEXPOWER 8V 4P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA SED.ELEG.2.0 MPFI MULTIPOWER 8V 4P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA SED.ELITE 2.0 MPFI FLEXP.8V 4P AUT', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA SED.ELITE 2.0 MPFI FLEXP.8V AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA SED.ELITE 2.0 MPFI FLEXPOWER 8V 4P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA SEDAN 1.8 MPFI 8V 4P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA SEDAN 2.0/ CD 2.0 MPFI 8V 4P AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA SEDAN 2.0/CD/ EXPRES.GLS 2.0 8V 4P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA SEDAN 2.0/CD/ GLS/ ADV. 2.0 16V 4P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA SEDAN COMFORT 1.8 MPFI 8V 4P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA SEDAN GL 1.8 MPFI 4P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA SEDAN/ ASTRA GL SEDAN 1.8 MPFI 4P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA-GLS-20-MPFI', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ASTRA-GLS-20-MPFI-SW', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'BLAZER EXECUTIVE 4.3 V6 AUT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'BLAZER JIMMY 4.3 V6', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'BLAZER S-10 4.3 V6', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'BLAZER SS-10 4.3 V6', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'BONANZA S / LUXE 4.0 DIESEL TURBO', 'Não informado', 0),
  ('GM - CHEVROLET', 'BONANZA S / LUXE 4.1', 'Não informado', 0),
  ('GM - CHEVROLET', 'BRASINCA BLAZER CD 4.0 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'BRASINCA BLAZER CD 4.1', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'C-10 2.5/4.1', 'Não informado', 0),
  ('GM - CHEVROLET', 'C-10 CD 2.5/ 4.1', 'Não informado', 0),
  ('GM - CHEVROLET', 'C-10 DE LUXE 2.5/4.1', 'Não informado', 0),
  ('GM - CHEVROLET', 'C-10 DE LUXE CD 2.5/ 4.1', 'Não informado', 0),
  ('GM - CHEVROLET', 'C-20 CUSTOM DE LUXE 4.1', 'Não informado', 0),
  ('GM - CHEVROLET', 'C-20 CUSTOM DE LUXE CD 4.1', 'Não informado', 0),
  ('GM - CHEVROLET', 'C-20 CUSTOM STD. 4.1', 'Não informado', 0),
  ('GM - CHEVROLET', 'C-20 CUSTOM STD. CD 4.1', 'Não informado', 0),
  ('GM - CHEVROLET', 'CALIBRA 16V', 'Não informado', 0),
  ('GM - CHEVROLET', 'CAMARO FIFTY 6.2 V8 16V 461CV', 'Não informado', 0),
  ('GM - CHEVROLET', 'CAMARO RS 5.0 V8', 'Não informado', 0),
  ('GM - CHEVROLET', 'CAMARO SPORT 5.0 CONV.', 'Não informado', 0),
  ('GM - CHEVROLET', 'CAMARO SS 6.2 V8 16V 406CV', 'Não informado', 0),
  ('GM - CHEVROLET', 'CAMARO SS CONVERSÍVEL 6.2 V8 16V 406CV', 'Não informado', 0),
  ('GM - CHEVROLET', 'CAMARO Z-28 TARGA/CONV. 5.7', 'Não informado', 0),
  ('GM - CHEVROLET', 'CAPRICE 4.3 V8', 'Não informado', 0),
  ('GM - CHEVROLET', 'CAPRICE SW 4.3 V8', 'Não informado', 0),
  ('GM - CHEVROLET', 'CAPRICE VICTORIA', 'Não informado', 0),
  ('GM - CHEVROLET', 'CAPTIVA SPORT AWD 3.0 V6 24V 268CV', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'CAPTIVA SPORT AWD 3.6 V6 24V 261CV 4X4', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'CAPTIVA SPORT FWD 2.4 16V 171/185CV', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'CAPTIVA SPORT FWD 3.0 V6 24V 268CV 4X2', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'CAPTIVA SPORT FWD 3.6 V6 24V 261CV 4X2', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'CARAVAN COMODORO 4.1 / 2.5', 'Não informado', 0),
  ('GM - CHEVROLET', 'CARAVAN DIPLOMATA 4.1 / 2.5', 'Não informado', 0),
  ('GM - CHEVROLET', 'CARAVAN L/SL/S/SS 2.5/4.1/4.2', 'Não informado', 0),
  ('GM - CHEVROLET', 'CAVALIER 3.1 CONV.', 'Não informado', 0),
  ('GM - CHEVROLET', 'CAVALIER L 2.0', 'Não informado', 0),
  ('GM - CHEVROLET', 'CELTA 1.0/ SUPER 1.0 MPFI VHC 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CELTA 1.0/SUPER/N.PIQ.1.0 MPFI VHC 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CELTA 1.4/ SUPER/ ENERGY 1.4 8V 85CV 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CELTA 1.4/ SUPER/ ENERGY 1.4 8V 85CV 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CELTA ADVANTAGE 1.0 8V FLEXPOWER 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CELTA LIFE 1.0 MPFI VHC 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CELTA LIFE 1.0 MPFI VHC 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CELTA LIFE 1.4 MPFI 8V 85CV 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CELTA LIFE 1.4 MPFI 8V 85CV 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CELTA LIFE/ LS 1.0 MPFI 8V FLEXPOWER 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CELTA LIFE/ LS 1.0 MPFI 8V FLEXPOWER 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CELTA SPIRIT 1.0 MPFI 8V FLEXPOWER 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CELTA SPIRIT 1.0 MPFI VHC 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CELTA SPIRIT 1.0 MPFI VHC 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CELTA SPIRIT 1.4 MPFI 8V 85CV 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CELTA SPIRIT 1.4 MPFI 8V 85CV 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CELTA SPIRIT/ LT 1.0 MPFI 8V FLEXP. 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CELTA SUPER 1.0 MPFI 8V FLEXPOWER 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CELTA SUPER 1.0 MPFI 8V FLEXPOWER 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CHEVETTE JUNIOR 1.0', 'Não informado', 0),
  ('GM - CHEVROLET', 'CHEVETTE L / SL / SL/E / DL / SE 1.6', 'Não informado', 0),
  ('GM - CHEVROLET', 'CHEVY 500 DL / SL / SE/ FURGÃO 1.6', 'Não informado', 0),
  ('GM - CHEVROLET', 'CHEYNNE 4.3 V6', 'Não informado', 0),
  ('GM - CHEVROLET', 'CLASSIC ADVANTAGE 1.0 VHC FLEXPOWER 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CLASSIC/ CLASSIC LS 1.0 VHC FLEXPOWER 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'COBALT 1.4 LT', 'Não informado', 0),
  ('GM - CHEVROLET', 'COBALT ADVANTAGE 1.4 MPFI 8V F.POWER 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'COBALT ADVANTAGE 1.8 8V ECO.FLEX 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'COBALT ELITE 1.8 8V ECONO.FLEX 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'COBALT GRAPHITE 1.8 8V ECONO.FLEX 4P AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'COBALT GRAPHITE 1.8 8V ECONO.FLEX 4P MEC', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'COBALT LS 1.4 8V FLEXPOWER 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'COBALT LT 1.4 8V FLEXPOWER 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'COBALT LT 1.8 8V ECONO.FLEX 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'COBALT LT 1.8 8V ECONO.FLEX 4P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'COBALT LTZ 1.4 8V FLEXPOWER 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'COBALT LTZ 1.8 8V ECONO.FLEX 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'COBALT LTZ 1.8 8V ECONO.FLEX 4P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA FURGÃO 1.6 MPFI POWERTECH 92CV', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA GL 1.6 MPFI / 1.4 EFI 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA GLS 1.6 MPFI 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA GSI 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA HAT. JOY 1.0/ 1.0 FLEXPOWER 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA HAT. JOY 1.8 MPFI 8V FLEXPOWER 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA HAT. MAXX 1.0/ 1.0 FLEXPOWER 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA HAT. MAXX 1.4 8V ECONOFLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA HAT. MAXX 1.8 MPFI 8V FLEXPOWER 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA HAT. PREM. 1.0/1.0 FLEXPOWER 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA HAT. PREMIUM 1.4 8V ECONOFLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA HAT. SS 1.8 MPFI 8V FLEXPOWER 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA HAT.PREMIUM 1.8 MPFI 8V F.POWER 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA HATCHBACK 1.0 MPFI 8V 71CV 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA HATCHBACK 1.8 MPFI 8V 102CV 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA HATCHBACK 1.8 MPFI FLEXPOWER 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA PICK-UP GL/ CHAMP 1.6 MPFI / EFI', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA PICK-UP SPORT 1.6 MPFI', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA PICK-UP STD/ RODEIO 1.6 MPFI', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SED CLAS.SPIRIT 1.6MPFI VHC 8V AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SED CLAS.SUPER 1.6MPFI VHC 8V AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SED CLASS.LIFE 1.0/1.0 FLEXPOWER', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SED CLASS.SPIRIT 1.0/1.0 FLEXPOWER', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SED CLASS.SUPER 1.0/1.0 FLEXPOWER', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SED CLASSIC LIFE 1.6 MPFI VHC 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SED CLASSIC SPIRIT 1.6 MPFI VHC 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SED CLASSIC SUPER 1.6 MPFI VHC 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SED. JOY 1.0/ 1.0 FLEXPOWER 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SED. JOY 1.8 MPFI 8V FLEXPOWER', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SED. MAXX 1.0/ 1.0 FLEXPOWER 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SED. MAXX 1.4 8V ECONOFLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SED. MAXX 1.8 MPFI 8V FLEXPOWER', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SED. PREMIUM 1.4 8V ECONOFLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SED. PREMIUM 1.8 MPFI 8V FLEXPOWER', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SED.PREM. 1.0/ 1.0 FLEXPOWER 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SED.WIND 1.0/MILLENIUM/CLASSIC VHC', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SEDAN 1.0 MPFI 8V 71CV 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SEDAN 1.8 MPFI 8V 102CV 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SEDAN 1.8 MPFI FLEXPOWER 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SEDAN GL 1.6 MPFI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SEDAN GLS 1.6 16V MPFI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SEDAN GLS 1.6 MPFI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SEDAN SUPER 1.0 MPFI 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SEDAN SUPER 1.0 MPFI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SEDAN SUPER MILENIUM 1.0 MPFI 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SEDAN SUPER/ CLASSIC 1.6 MPFI 8V 4', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SUPER 1.0 MPFI / 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SUPER 1.0 MPFI 16V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SUPER 1.0 MPFI 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA SUPER 1.6 MPFI 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA WAGON GL 1.6 MPFI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA WAGON GLS 1.6 16V MPFI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA WAGON GLS 1.6 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA WAGON SUPER 1.0 MPFI 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA WAGON SUPER 1.6 MPFI 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA WIND 1.0 MPF/MILLENIUMI/ EFI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA WIND 1.0 MPFI / EFI 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA WIND 1.6 MPFI 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA WIND 1.6 MPFI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORSA WIND PIQUET/ CHAMP 1.0 MPFI 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'CORVETTE 5.7/ 6.0, 6.2 CONV./STINGRAY', 'Não informado', 0),
  ('GM - CHEVROLET', 'CORVETTE 5.7/ 6.0, 6.2 TARGA/STINGRAY', 'Não informado', 0),
  ('GM - CHEVROLET', 'CRUZE BLACK BOW TIE 1.4 TB FLEX 4P AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('GM - CHEVROLET', 'CRUZE HB BLACK BOW TIE 1.4 TB FLEX AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('GM - CHEVROLET', 'CRUZE HB SPORT LT 1.8 16V FLEXP. 5P AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('GM - CHEVROLET', 'CRUZE HB SPORT LT 1.8 16V FLEXP. 5P MEC', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('GM - CHEVROLET', 'CRUZE HB SPORT LTZ 1.8 16V FLEXP. 5P AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('GM - CHEVROLET', 'CRUZE HB SPORT LTZ 1.8 16V FLEXP. 5P MEC', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('GM - CHEVROLET', 'CRUZE LT 1.4 16V TURBO FLEX 4P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('GM - CHEVROLET', 'CRUZE LT 1.8 16V FLEXPOWER 4P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('GM - CHEVROLET', 'CRUZE LT 1.8 16V FLEXPOWER 4P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('GM - CHEVROLET', 'CRUZE LT NB', 'Não informado', 0),
  ('GM - CHEVROLET', 'CRUZE LTZ 1.4 16V TURBO FLEX 4P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('GM - CHEVROLET', 'CRUZE LTZ 1.8 16V FLEXPOWER 4P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('GM - CHEVROLET', 'CRUZE MIDNIGHT 1.4 16V TB FLEX AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('GM - CHEVROLET', 'CRUZE PREMIER 1.4 16V TB FLEX AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('GM - CHEVROLET', 'CRUZE SPORT LT 1.4 16V TB FLEX 5P AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('GM - CHEVROLET', 'CRUZE SPORT LT 1.4 16V TB FLEX 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('GM - CHEVROLET', 'CRUZE SPORT LTZ 1.4 16V TB FLEX 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('GM - CHEVROLET', 'CRUZE SPORT PREMIER 1.4 16V TB FLEX AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('GM - CHEVROLET', 'CRUZE SPORT RS 1.4 16V TB FLEX 5P AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('GM - CHEVROLET', 'D-10 CD DIESEL', 'Não informado', 0),
  ('GM - CHEVROLET', 'D-10 DIESEL', 'Não informado', 0),
  ('GM - CHEVROLET', 'D-20 4.0 CHAMP/CONQUEST/EL CAMINHO DIES.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'D-20 CD LX S4T/TRO.PLUS/LX 3.9/4.0 TDIES', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'D-20 S / EL CAMINHO 3.9/4.0 CD T.DIES', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'D-20 S / LUXE 3.9/4.0 DIESEL', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'D-20 S / LUXE 3.9/4.0 T.DIESEL', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'D-20 S 3.9/4.0 TURBO DIESEL', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'EQUINOX LT 1.5 TURBO 172CV AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'EQUINOX LT 2.0 TURBO 262CV AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'EQUINOX MIDNIGHT 1.5 TURBO 172CV AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'EQUINOX PREMIER 1.5 TURBO 172CV AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'EQUINOX PREMIER 2.0 TURBO AWD 262CV AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'EQUINOX RS 1.5 TURBO 172CV AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'GM/ CHEVROLET C20 CUSTOM S', 'UTILITARIO LEVE', 0),
  ('GM - CHEVROLET', 'IPANEMA GL 1.8 MPFI / EFI /SL 4P', 'Não informado', 0),
  ('GM - CHEVROLET', 'IPANEMA GL/ FLAIR 2.0 MPFI / EFI 4P', 'Não informado', 0),
  ('GM - CHEVROLET', 'IPANEMA GLS/SLE 2.0EFI /SL/E1.8/SOL/WAVE', 'Não informado', 0),
  ('GM - CHEVROLET', 'JOY HATCH 1.0 8V BLACK EDITION FLEX MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'JOY HATCH 1.0 8V FLEX 5P MEC', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'JOY PLUS 1.0 8V 4P FLEX MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'JOY PLUS BLACK ED.1.0 8V 4P FLEX MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'KADETT GL 2.0 MPFI / EFI', 'Não informado', 0),
  ('GM - CHEVROLET', 'KADETT GL/SL/LITE/TURIM 1.8', 'Não informado', 0),
  ('GM - CHEVROLET', 'KADETT GLS 1.8 EFI / SL/E 1.8', 'Não informado', 0),
  ('GM - CHEVROLET', 'KADETT GLS 2.0 MPFI', 'Não informado', 0),
  ('GM - CHEVROLET', 'KADETT GSI / GS 2.0', 'Não informado', 0),
  ('GM - CHEVROLET', 'KADETT GSI 2.0 CONVERSÍVEL', 'Não informado', 0),
  ('GM - CHEVROLET', 'KADETT SPORT 2.0 MPFI / EFI', 'Não informado', 0),
  ('GM - CHEVROLET', 'LUMINA', 'Não informado', 0),
  ('GM - CHEVROLET', 'MALIBU LTZ 2.4 16V 171CV 4P', 'Não informado', 0),
  ('GM - CHEVROLET', 'MARAJO SL/SLE/SE', 'Não informado', 0),
  ('GM - CHEVROLET', 'MERIVA 1.8/ CD 1.8 MPFI 16V 122CV 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MERIVA 1.8/ CD 1.8 MPFI 8V 102CV 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MERIVA 1.8/ CD 1.8 MPFI FLEXPOWER 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MERIVA COLLECTION 1.4 8V ECONOFLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MERIVA EXPRES.EASYTRONIC 1.8 FLEXPOWER', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MERIVA JOY 1.4 MPFI 8V ECONOFLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MERIVA JOY 1.8 MPFI 8V FLEXPOWER', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MERIVA MAXX 1.4 MPFI 8V ECONOFLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MERIVA MAXX 1.8 MPFI 8V FLEXPOWER', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MERIVA PREM.EASYTRONIC 1.8 FLEXPOWER 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MERIVA PREMIUM 1.8 MPFI 8V FLEXPOWER', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MERIVA SS 1.8 MPFI 8V FLEXPOWER 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MERIVA SS EASYTRONIC 1.8 FLEXPOWER 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MONTANA 1.4 8V CONQUEST ECONOFLEX 2P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MONTANA 1.8/ 1.8 CONQUEST FLEXPOWER 8V', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MONTANA ARENA 1.4 ECONOFLEX 8V 2P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MONTANA COMBO 1.4 8V ECONOFLEX', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MONTANA LS 1.4 ECONOFLEX 8V 2P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MONTANA LS COMBO 1.4 8V ECONOFLEX 2P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MONTANA OFF ROAD 1.8 MPFI FLEXPOWER 8V', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MONTANA SPORT 1.4 ECONOFLEX 8V 2P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MONTANA SPORT 1.8 MPFI FLEXPOWER 8V', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MONZA 1.6I/ 1.8I (RESTANTE)', 'Não informado', 0),
  ('GM - CHEVROLET', 'MONZA CLASS 1.8/ 2.0', 'Não informado', 0),
  ('GM - CHEVROLET', 'MONZA CLASSIC SE 2.0 /MPFI E EFI 2P E 4P', 'Não informado', 0),
  ('GM - CHEVROLET', 'MONZA CLASSIC/ SL/E/SR 1.8', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'MONZA GL 1.8 EFI/ SL/ L/ 650/BARC. 2E4P', 'Não informado', 0),
  ('GM - CHEVROLET', 'MONZA GL 2.0 EFI/SL/L/650/CLUB/BARC.2E4P', 'Não informado', 0),
  ('GM - CHEVROLET', 'MONZA GLS/ HI-TECH 2.0 EFI 2P E 4P', 'Não informado', 0),
  ('GM - CHEVROLET', 'MONZA SL/E SR 2.0', 'Não informado', 0),
  ('GM - CHEVROLET', 'OMEGA CD 3.8 V6', 'Não informado', 0),
  ('GM - CHEVROLET', 'OMEGA CD 4.1 / 3.0', 'Não informado', 0),
  ('GM - CHEVROLET', 'OMEGA CD/ FITTIPALDI 3.6 V6 24V 4P', 'Não informado', 0),
  ('GM - CHEVROLET', 'OMEGA DIAMOND', 'Não informado', 0),
  ('GM - CHEVROLET', 'OMEGA GL 2.0/ 2.2', 'Não informado', 0),
  ('GM - CHEVROLET', 'OMEGA GLS 2.2 / 2.0', 'Não informado', 0),
  ('GM - CHEVROLET', 'OMEGA GLS 4.1', 'Não informado', 0),
  ('GM - CHEVROLET', 'ONIX 1.0 MT LS', 'Não informado', 0),
  ('GM - CHEVROLET', 'ONIX HATCH 1.0 12V FLEX 5P MEC', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH 1.0 12V TB FLEX 5P AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH ACTIV 1.4 8V FLEX 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH ACTIV 1.4 8V FLEX 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH ADVENTAGE 1.4 8V FLEX 5P AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH EFFECT 1.4 8V F.POWER 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH JOY 1.0 8V FLEX 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH LS 1.0 8V FLEXPOWER 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH LT 1.0 12V FLEX 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH LT 1.0 12V TB FLEX 5P AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH LT 1.0 12V TB FLEX 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH LT 1.0 8V FLEXPOWER 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH LT 1.4 8V FLEXPOWER 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH LT 1.4 8V FLEXPOWER 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH LTZ 1.0 12V TB FLEX 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH LTZ 1.0 12V TB FLEX 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH LTZ 1.4 8V FLEXPOWER 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH LTZ 1.4 8V FLEXPOWER 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH PREM. 1.0 12V TB FLEX 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH RS 1.0 TB 12V FLEX 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX HATCH SELEÇÃO 1.0 8V FLEX 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX LOLLAPALOOZA 1.0 F.POWER 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX SED. PLUS PREM. 1.0 12V TB FLEX AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX SEDAN PLUS 1.0 12V TB FLEX AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX SEDAN PLUS LT 1.0 12V FLEX 4P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX SEDAN PLUS LT 1.0 12V TB FLEX AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX SEDAN PLUS LT 1.0 12V TB FLEX MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX SEDAN PLUS LTZ 1.0 12V TB FLEX AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ONIX SEDAN PLUS LTZ 1.0 12V TB FLEX MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'OPALA COMODORO/ COMOD. SLE 4.1 / 2.5', 'Não informado', 0),
  ('GM - CHEVROLET', 'OPALA DIPLOMATA/ DIPLOM. SLE 4.1 / 2.5', 'Não informado', 0),
  ('GM - CHEVROLET', 'OPALA L/SL/SS/ 2.5/4.1', 'Não informado', 0),
  ('GM - CHEVROLET', 'PRISMA 1.4 MT LT', 'Não informado', 0),
  ('GM - CHEVROLET', 'PRISMA JOY', 'Não informado', 0),
  ('GM - CHEVROLET', 'PRISMA SED. ADVANT. 1.0 8V FLEXPOWER 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'PRISMA SED. ADVANT. 1.4 8V F.POWER AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'PRISMA SED. JOY 1.4 8V ECONOFLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'PRISMA SED. JOY/ LS 1.0 8V FLEXPOWER 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'PRISMA SED. LT 1.0 8V FLEXPOWER 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'PRISMA SED. LT 1.4 8V FLEXPOWER 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'PRISMA SED. LT 1.4 8V FLEXPOWER 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'PRISMA SED. LTZ 1.4 8V FLEXPOWER 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'PRISMA SED. LTZ 1.4 8V FLEXPOWER 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'PRISMA SED. MAXX 1.0 8V FLEXPOWER 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'PRISMA SED. MAXX/ LT 1.4 8V ECONOF. 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'S10 ADVANTED D', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 BLAZER 2.4 MPFI 8V 128CV 4P', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 BLAZER 4.3 V6', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 BLAZER ADVANT. 2.4/2.4 MPFI F.POWER', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 BLAZER COLINA 2.4/2.4 MPFI F.POWER', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 BLAZER COLINA 2.8 TDI 4X4 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 BLAZER DLX 2.2 MPFI / EFI', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 BLAZER DLX 2.4 MPFI 128CV 4P', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 BLAZER DLX 2.5 DIESEL TURBO', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 BLAZER DLX 2.8 4X4 TB INTERC. DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 BLAZER DLX 4.3 V6', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 BLAZER DTI 2.8 4X2 TURBO DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 BLAZER EXECUTIVE 2.8 4X4 TDI DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 BLAZER STD. 2.2 MPFI / EFI', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 BLAZER STD. 2.5 DIESEL TURBO', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 BLAZER TORNADO 2.4 MPFI 8V 128CV', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 DD2 180 CV', 'Não informado', 0),
  ('GM - CHEVROLET', 'S10 LT FDZ', 'Não informado', 0),
  ('GM - CHEVROLET', 'S10 LTZ', 'Não informado', 0),
  ('GM - CHEVROLET', 'S10 LTZ FD2', 'Não informado', 0),
  ('GM - CHEVROLET', 'S10 LTZ FD2 UP LT FD2', 'Não informado', 0),
  ('GM - CHEVROLET', 'S10 P-UP 2.8/SERT. 2.8 4X4 TB INT. DIES.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 P-UP ADVANT. 2.4/2.4 MPFI F.POWER CD', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 P-UP ADVANTAGE 2.4 MPFI F.POWER CS', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 P-UP COLINA 2.4 MPFI 128CV CD 4P', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 P-UP COLINA 2.4/2.4 MPFI F.POWER CS', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 P-UP COLINA 2.8 TDI 4X2/4X4 CD DIES.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 P-UP COLINA 2.8 TDI 4X2/4X4 CS DIES.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 P-UP EXECUTIVE 2.4 MPFI F.POWER CD', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 P-UP LUXE 2.5 4X2 CD TB MAX HST DIES', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 P-UP LUXE 2.5 4X4 CD TB MAX HST DIES', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 P-UP LX/SERT/ROD 2.8 4X4 CD TDI DIES', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 P-UP TORNADO 2.8 TDI 4X2/4X4 CD DIES', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 P.UP 100YEARS 2.8 4X4 CD DIES. AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PIC-UP H.COUNTRY 2.8 4X4 CD DIES.AUT', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK UP DLX 2.4 MPFI 128CV CD 4P', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK UP EXECUTIVE', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK UP EXECUTIVE CD 4.3 4X4', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK UP RODEIO 2.8 TDI 4X4 CD DIES.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK UP TORNADO 2.4 MPFI 128CV CD 4P', 'Não informado', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP 2.4 MPFI 8V 128CV CD 4P', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP 2.4 MPFI 8V 128CV/ RODEIO', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP 2.5 4X2 CD TB MAX HST DIES', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP 2.5 4X4 CD TB MAX HST DIES.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP 2.8 4X2 TURBO INTERC. DIES.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP 4.3 V6', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP ADVANTAGE 2.5 FLEX 4X2 CD', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP BARRETOS 2.2 MPFI 2P', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP CHAMP 4.3 V6', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP DLX 2.4 MPFI 128CV CD 4P', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP EXEC. 2.8 4X2 CD TB INT.DIES', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP EXEC. 2.8 4X4 CD TB INT.DIES', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP EXECUTIVE CD 4.3', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP EXECUTIVE CD 4.3 4X4', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP FREERIDE 2.5 FLEX 4X2 CD MEC', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LS 2.4 F.POWER 4X2 CD', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LS 2.4 F.POWER 4X2 CS', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LS 2.8 TDI 4X2 CD DIES. MEC.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LS 2.8 TDI 4X2 CS DIES. MEC.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LS 2.8 TDI 4X4 CD DIES. MEC.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LS 2.8 TDI 4X4 CS DIESEL', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LT 2.4 F.POWER 4X2 CD', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LT 2.4 F.POWER 4X2 CS', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LT 2.5 FLEX 4X2 CD', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LT 2.5 FLEX 4X2 CD AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LT 2.5 FLEX 4X4 CD', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LT 2.5 FLEX 4X4 CD AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LT 2.8 TDI 4X2 CD DIESEL', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LT 2.8 TDI 4X2 CD DIESEL AUT', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LT 2.8 TDI 4X4 CD DIESEL', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LT 2.8 TDI 4X4 CD DIESEL AUT', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LTZ 2.4 F.POWER 4X2 CD', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LTZ 2.5 FLEX 4X2 CD', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LTZ 2.5 FLEX 4X2 CD AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LTZ 2.5 FLEX 4X4 CD', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LTZ 2.5 FLEX 4X4 CD AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LTZ 2.8 TDI 4X2 CD DIES. MEC', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LTZ 2.8 TDI 4X2 CD DIES.AUT', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LTZ 2.8 TDI 4X4 CD DIES.AUT', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LUXE 2.2 EFI CD', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LUXE 2.2 MPFI / EFI', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LUXE 2.2 MPFI/EFI CE', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LUXE 2.5 CE TB DIESEL', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LUXE 2.5 DIESEL TURBO', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LUXE 2.8 4X2 CD TB INT.DIES.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LUXE 4.3 V6', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LUXE 4.3 V6 CD', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP LUXE 4.3 V6 CE', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP RODEIO 2.4 MPFI F.POWER CD', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP RODEIO 2.8 TDI 4X2 CD DIES.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP RODEIO 2.8 TDI 4X4 CD DIES.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP STD 2.8 4X2 CD TB INT.DIES.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP STD 2.8 4X4 CD TB INT.DIES.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP STD. 2.2 MPFI / EFI', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP STD. 2.2 MPFI CD', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP STD. 2.5 DIESEL TURBO', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'S10 PICK-UP TORNADO 2.4 MPFI 128CV CD 4P', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SATURN SL', 'Não informado', 0),
  ('GM - CHEVROLET', 'SIERRA CE 5.7 V8', 'Não informado', 0),
  ('GM - CHEVROLET', 'SIERRA SPORT 5.0 V8', 'Não informado', 0),
  ('GM - CHEVROLET', 'SILVERADO', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SILVERADO 4.1', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SILVERADO 4.1 DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SILVERADO 4.2 TURBO DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SILVERADO CONQUEST 4.1 DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SILVERADO CONQUEST 4.2 DIESEL TURBO', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SILVERADO D20/ RODEIO 4.2 TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SILVERADO DLX 4.1', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SILVERADO DLX 4.2 CONQUEST HD DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SILVERADO DLX 4.2 DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SILVERADO G. BLAZER DLX/ STD 4.2 DIES.TB', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SILVERADO GRAND BLAZER DLX 4.1 MPFI', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SILVERADO SPORT/ FLEET SIDE 5.7 CS', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SILVERADO SPORT/FLEET SIDE 6.5 DIES. CS', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SILVERADO TROP. SL/ VAN T.DIESEL (TODAS)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SILVERADO TROPICAL CD 4.1 DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SILVERADO TROPICAL CD 4.1 MPFI', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SILVERADO TROPICAL CD 4.2 DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SONIC HB LT 1.6 16V FLEXPOWER 5P AUT.', 'Não informado', 0),
  ('GM - CHEVROLET', 'SONIC HB LT 1.6 16V FLEXPOWER 5P MEC.', 'Não informado', 0),
  ('GM - CHEVROLET', 'SONIC HB LTZ 1.6 16V FLEXPOWER 5P AUT.', 'Não informado', 0),
  ('GM - CHEVROLET', 'SONIC HB LTZ 1.6 16V FLEXPOWER 5P MEC.', 'Não informado', 0),
  ('GM - CHEVROLET', 'SONIC HB LTZ EFFECT 1.6 16V FLEXP 5P AUT', 'Não informado', 0),
  ('GM - CHEVROLET', 'SONIC SED. LT 1.6 16V FLEXPOWER 4P AUT.', 'Não informado', 0),
  ('GM - CHEVROLET', 'SONIC SED. LT 1.6 16V FLEXPOWER 4P MEC.', 'Não informado', 0),
  ('GM - CHEVROLET', 'SONIC SED. LTZ 1.6 16V FLEXPOWER 4P AUT.', 'Não informado', 0),
  ('GM - CHEVROLET', 'SONIC SED. LTZ 1.6 16V FLEXPOWER 4P MEC.', 'Não informado', 0),
  ('GM - CHEVROLET', 'SONOMA CE 4.3 V6', 'Não informado', 0),
  ('GM - CHEVROLET', 'SPACEVAN FURGÃO 2.1 DIESEL', 'Não informado', 0),
  ('GM - CHEVROLET', 'SPACEVAN FURGÃO 2.2', 'Não informado', 0),
  ('GM - CHEVROLET', 'SPACEVAN PASSAGEIRO 2.1DIESEL', 'Não informado', 0),
  ('GM - CHEVROLET', 'SPACEVAN PASSAGEIRO 2.2', 'Não informado', 0),
  ('GM - CHEVROLET', 'SPIN ACTIV 1.8 8V ECONO. FLEX 5P AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'SPIN ACTIV 1.8 8V ECONO. FLEX 5P MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'SPIN ADVANTAGE 1.8 8V ECONO.FLEX 5P AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'SPIN ADVANTAGE 1.8 8V ECONO.FLEX 5P MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'SPIN LS 1.8 8V ECONO.FLEX 5P MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'SPIN LT 1.8 8V ECONO.FLEX 5P AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'SPIN LT 1.8 8V ECONO.FLEX 5P MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'SPIN LTZ 1.8 8V ECONO.FLEX 5P AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'SPIN LTZ 1.8 8V ECONO.FLEX 5P MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'SS10 PICK-UP 4.3 V6', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'SUBURBAN 5.7/ 6.5 V8/ 5.3 V8', 'Não informado', 0),
  ('GM - CHEVROLET', 'SUPREMA CD 4.1 / 3.0', 'Não informado', 0),
  ('GM - CHEVROLET', 'SUPREMA DIAMOND', 'Não informado', 0),
  ('GM - CHEVROLET', 'SUPREMA GL 2.0', 'Não informado', 0),
  ('GM - CHEVROLET', 'SUPREMA GLS 2.2 / 2.0', 'Não informado', 0),
  ('GM - CHEVROLET', 'SUPREMA GLS 4.1', 'Não informado', 0),
  ('GM - CHEVROLET', 'SYCLONE 5.7 V8', 'Não informado', 0),
  ('GM - CHEVROLET', 'TIGRA 1.6 16V', 'Não informado', 0),
  ('GM - CHEVROLET', 'TIGRA POWER TECH COUPE 1.6 SFI', 'Não informado', 0),
  ('GM - CHEVROLET', 'TRACKER 1.0 TURBO 12V FLEX AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'TRACKER 2.0 16V 128CV MPFI 4X4 5P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'TRACKER 2.0 4X4 TB INT. DIESEL 4P', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'TRACKER FREERIDE 1.8 16V FLEX 4X2 MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'TRACKER LT 1.0 TURBO 12V FLEX AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'TRACKER LT 1.4 TURBO 16V FLEX 4X2 AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'TRACKER LT 1.8 16V FLEX 4X2 AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'TRACKER LTZ 1.4 TURBO 16V FLEX 4X2 AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'TRACKER LTZ 1.8 16V FLEX 4X2 AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'TRACKER PREMIER 1.0 TURBO 12V FLEX', 'V6 AUTOMOVEL COMUM', 20),
  ('GM - CHEVROLET', 'TRACKER PREMIER 1.2 TURBO 12V FLEX AUT.', 'V6 AUTOMOVEL COMUM', 20),
  ('GM - CHEVROLET', 'TRACKER PREMIER 1.4 TURBO 16V FLEX AUT', 'V6 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'TRAFIC CHASSI LONGO DIESEL', 'Não informado', 0),
  ('GM - CHEVROLET', 'TRAFIC FURGAO CARGA 2.2', 'Não informado', 0),
  ('GM - CHEVROLET', 'TRAFIC FURGÃO CARGA 2.1 DIESEL', 'Não informado', 0),
  ('GM - CHEVROLET', 'TRAFIC PASSAGEIROS 2.1 DIESEL', 'Não informado', 0),
  ('GM - CHEVROLET', 'TRAFIC PASSAGEIROS 2.2', 'Não informado', 0),
  ('GM - CHEVROLET', 'TRAILBLAZER LTZ 2.8 CTDI DIESEL AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'TRAILBLAZER LTZ 3.6 V6 VVT AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'TRAILBLAZER PREMIER 2.8 TB DIESEL AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('GM - CHEVROLET', 'VECTRA CD 2.0 (MODELO ANTIGO)', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA CD 2.2 16V / 2.0 16V MEC./AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA COLLECTION 2.0 FLEXPOWER 8V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA COMFORT 2.0 MPFI', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA ELEGAN. 2.0 MPFI 8V FLEXPOWER AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA ELEGAN. 2.0 MPFI 8V FLEXPOWER MEC', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA ELEGANCE 2.0 MPFI', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA ELEGANCE 2.2 MPFI 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA ELITE 2.0 MPFI', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA ELITE 2.0 MPFI 8V FLEXPOWER AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA ELITE 2.2 MPFI 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA ELITE 2.4 MPFI 16V FLEXPOWER AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA EXPRES./ COLLECTION 2.0 MPFI 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA EXPRESSION 2.0 MPFI FLEXPOWER AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA EXPRESSION 2.0 MPFI FLEXPOWER MEC', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA GL 2.2 / 2.0 MPFI', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA GL 2.2 MPFI MILENIUM', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA GLS/ CHALLENGE 2.2 MPFI 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA GLS/EXPRES.2.2/ 2.0 E 2.0 CD 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA GSI 2.0 16V (MODELO ANTIGO)', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA GT 2.0 MPFI 8V FLEXPOWER AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA GT 2.0 MPFI 8V FLEXPOWER MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA GT-X 2.0 MPFI 8V FLEXPOWER AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VECTRA GT-X 2.0 MPFI 8V FLEXPOWER MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'VERANEIO S / LUXE 4.1', 'Não informado', 0),
  ('GM - CHEVROLET', 'VERANEIO S/ LUXE 4.0 DIES./TB DIES.', 'Não informado', 0),
  ('GM - CHEVROLET', 'ZAFIRA 2.0/ CD 2.0 16V MPFI 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ZAFIRA 2.0/ CD 2.0 8V MPFI 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ZAFIRA 2.0/ CD 2.0 8V MPFI 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ZAFIRA COLLECTION 2.0 FLEXPOWER 8V AUT.', 'Não informado', 0),
  ('GM - CHEVROLET', 'ZAFIRA COMFORT 2.0 MPFI FLEXPOWER 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ZAFIRA ELEG.2.0 MPFI FLEXPOWER 8V 5P AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ZAFIRA ELEGANCE 2.0 MPFI 16V 136CV 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ZAFIRA ELEGANCE 2.0 MPFI FLEXPOWER 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ZAFIRA ELITE 2.0 MPFI 16V 136CV 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ZAFIRA ELITE 2.0 MPFI FLEXPOWER 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ZAFIRA ELITE 2.0 MPFI FLEXPOWER 8V AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('GM - CHEVROLET', 'ZAFIRA EXPRES. 2.0 MPFI FLEXPOWER 5P AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('GMC', '12-170 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('GMC', '12-170 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('GMC', '14-190 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('GMC', '14-190 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('GMC', '15-190 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('GMC', '15-190 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('GMC', '16-220 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('GMC', '16-220 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('GMC', '3500 HD TURBO (DIESEL)', 'Não informado', 0),
  ('GMC', '5-90 2P (DIESEL)', 'Não informado', 0),
  ('GMC', '6-100 2P (DIESEL)', 'Não informado', 0),
  ('GMC', '6-150 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('GMC', '7-110 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('GOTTI', 'R / GOTTI', 'Não informado', 0),
  ('GOTTI', 'SR / SR TA 3ED 36', 'Não informado', 0),
  ('GOTTI', 'SR / TQL 3E 115', 'Não informado', 0),
  ('GREAT WALL', 'HOVER CUV 2.4 16V 4WD 5P MEC.', 'Não informado', 0),
  ('GREAT WALL', 'HOVER CUV 2.4 16V 5P MEC.', 'Não informado', 0),
  ('GREEN', 'EASY 110CC', 'Não informado', 0),
  ('GREEN', 'RUNNER 125CC', 'Não informado', 0),
  ('GREEN', 'SAFARI 150CC', 'Não informado', 0),
  ('GREEN', 'SPORT 150CC', 'Não informado', 0),
  ('GRIMALDI', 'SR / GRIMALDI ROLL ON OF 2E', 'Não informado', 0),
  ('GUERRA', 'R / A GUERRA', 'Não informado', 0),
  ('GUERRA', 'R / GUERRA AG CS', 'Não informado', 0),
  ('GUERRA', 'R / GUERRA AG DL', 'Não informado', 0),
  ('GUERRA', 'R / GUERRA SR CA', 'Não informado', 0),
  ('GUERRA', 'SR / GUERRA AG BA', 'Não informado', 0),
  ('GUERRA', 'SR / GUERRA AG BS', 'Não informado', 0),
  ('GUERRA', 'SR / GUERRA AG CS', 'Não informado', 0),
  ('GUERRA', 'SR / GUERRA AG FG', 'Não informado', 0),
  ('GUERRA', 'SR / GUERRA AG GR', 'Não informado', 0),
  ('GUERRA', 'SR / GUERRA AG PC', 'Não informado', 0),
  ('GUERRA', 'SR / GUERRA AG SI', 'Não informado', 0),
  ('GUERRA', 'SR / GUERRA CHARGE GR', 'Não informado', 0),
  ('GUERRA', 'SR / GUERRA DOLLY 2E 6100', 'Não informado', 0),
  ('GURGEL', 'BR-800 (TODOS)/ SUPERMINI', 'Não informado', 0),
  ('GURGEL', 'CARAJAS DIESEL', 'Não informado', 0),
  ('GURGEL', 'CARAJAS/ TOCANTIS/ XAVANTE/ VIP', 'Não informado', 0),
  ('HAFEI', 'TOWNER FURGÃO 1.0 8V 48CV 5P', 'Não informado', 0),
  ('HAFEI', 'TOWNER JR. PICK-UP 1.0 8V 48CV CD 4P', 'Não informado', 0),
  ('HAFEI', 'TOWNER JR. PICK-UP 1.0 8V 48CV CS 2P', 'Não informado', 0),
  ('HAFEI', 'TOWNER JR. PICK-UP BAÚ 1.0 8V 48CV 2P', 'Não informado', 0),
  ('HAFEI', 'TOWNER JR. PICK-UP BAÚ 1.0 8V 48CV CD 4P', 'Não informado', 0),
  ('HAFEI', 'TOWNER PASSAGEIRO 1.0 8V 48CV 7L 5P', 'Não informado', 0),
  ('HAFEI', 'TOWNER PICK-UP 1.0 8V 48CV 2P', 'Não informado', 0),
  ('HAFEI', 'TOWNER PICK_UP BAÚ 1.0 8V 48CV 2P', 'Não informado', 0),
  ('HAOBAO', 'HB 50Q', 'Não informado', 0),
  ('HAOBAO', 'HB110-3', 'Não informado', 0),
  ('HAOBAO', 'HB125-9 FEARFULSPEED', 'Não informado', 0),
  ('HAOBAO', 'HB150', 'Não informado', 0),
  ('HAOBAO', 'HB150-T R5 FEARFULSPEED', 'Não informado', 0),
  ('HAOJUE', 'CHOPPER ROAD 150', 'Não informado', 0),
  ('HAOJUE', 'DK 150', 'Não informado', 0),
  ('HAOJUE', 'DK 160 FI', 'Não informado', 0),
  ('HAOJUE', 'DK150S FI', 'Não informado', 0),
  ('HAOJUE', 'DR 160', 'Não informado', 0),
  ('HAOJUE', 'HAOJUE DK 160', 'MOTOCICLETA', 25),
  ('HAOJUE', 'HAOJUE, NEX 115', 'Não informado', 0),
  ('HAOJUE', 'LINDY 125', 'Não informado', 0),
  ('HAOJUE', 'NEX 110', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'BLACKLINE FXS', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'CVO BREAKOUT FXSBSE', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'CVO LIMITED 115TH ANNIVERSA. FLHTKSE ANV', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'CVO LIMITED FLHTKSE', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'CVO ROAD GLIDE FLTRXSE', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'CVO STREET GLIDE FLHXSE', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'CVO ULTRA CLAS. ELECTRA GLIDE FLHTCUSE7', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'DEUCE', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'DYNA CONVERTIBLE', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'DYNA LOW RIDER', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'DYNA LOW RIDER CONVERTIBLE', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'DYNA SUPER GLIDE', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'DYNA SUPER GLIDE CUSTOM', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'DYNA SUPER GLIDE CUSTOM 110 TH EDITION', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'DYNA WIDE GLIDE', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'EG ROAD KING FUEL INJECTION', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'ELECTRA GLIDE CLASSIC FLHTC/ FLHTCI', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'ELECTRA GLIDE FLHT', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'ELECTRA GLIDE SCREAMING EAGLE', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'ELECTRA GLIDE SPECIAL 1450CC', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'ELECTRA GLIDE ULTRA CLAS. S.EAGLE FLHTCU', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'ELECTRA GLIDE ULTRA CLASSIC', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'ELECTRA GLIDE ULTRA FUEL INJECTION', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'ELECTRA GLIDE ULTRA LIMIT. 110TH EDITION', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'ELECTRA GLIDE ULTRA LIMITED FLHTK', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'FAT BOB FXDF', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'FAT BOB FXFB', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'FAT BOB FXFBS', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'FAT BOY 115TH ANNIVERSARY FLFBS', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'FAT BOY FLFB', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'FAT BOY FLFBS', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'FAT BOY FLSTF', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'FAT BOY LOW/ SPECIAL FLSTFB', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'FAT BOY SCREAMING EAGLE', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'FAT BOY SPECIAL 110TH EDITION', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'FLHTCU ULTRA GLIDE', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'FLHTCUI ULTRA CLASSIC', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'HERITAGE CLASSIC FLHC', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'HERITAGE CUSTOM 1450/ 1600CC', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'HERITAGE SOFTAIL CLASSIC 110 TH EDITION', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'HERITAGE SOFTAIL CLASSIC FLSTC', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'HERITAGE SPRINGER', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'LOW RIDER FXDL', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'NIGHT ROD SPECIAL 1250 VRSCDX', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'NIGHT TRAIN', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'ROAD GLIDE SPECIAL FLTRXS', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'ROAD GLIDE ULTRA FLTRU', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'ROAD KING', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'ROAD KING CLASSIC FLHRC/ CUSTOM FLHRSI', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'ROAD KING SCREAMING EAGLE FLHR SE', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'ROAD KING SPECIAL FLHRXS', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'SOFTAIL BREAKOUT 115TH ANNIV. FXBRS', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'SOFTAIL BREAKOUT FXBRS', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'SOFTAIL BREAKOUT FXSB', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'SOFTAIL CLASSIC', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'SOFTAIL CUSTOM', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'SOFTAIL DELUXE FLDE', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'SOFTAIL DELUXE FLSTN', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'SOFTAIL ROCKER/ ROCKER C 1584CC', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'SOFTAIL SLIM FLSL', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'SOFTAIL SPECIAL', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'SOFTAIL SPRINGER', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'SOFTAIL STD/ FX', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'SPORTSTER 1200', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'SPORTSTER 1200 CUSTOM XL1200C', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'SPRINGER SCREAMING EAGLE', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'STREET BOB FXBB', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'STREET BOB FXDB', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'STREET GLIDE FLHX', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'STREET GLIDE SPEC. 115TH ANNIV FLHXS ANX', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'STREET GLIDE SPECIAL FLHXS', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'STREET ROD 1130CC', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'SWITCHBACK FLD', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'ULTRA LIMITED 115TH ANNIVERSARY FLHTK', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'V-ROD 10TH ANNIVERSARY EDITION VRSCDX', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'V-ROD 1130CC SPORT VRSCB', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'V-ROD 1130CC VRSCA/ 1250 VRSCAW', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'V-ROD 1250CC MUSCLE VRSCF', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'V-ROD SCREAMING EAGLE', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'XL 1200', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'XL 1200 C-SPORTSTER CUSTOM', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'XL 1200 CUSTOM', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'XL 1200 CUSTOM LIMITED CA/CB', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'XL 1200 CX ROADSTER', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'XL 1200 SPORT', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'XL 1200N SPORTSTER NIGHTSTER', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'XL 1200X FORTY EIGHT 115TH ANNIVERSARY', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'XL 1200X FORTY EIGHT SPORTSTER', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'XL 883 CUSTOM', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'XL 883 HUGGER', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'XL 883 R', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'XL 883 STD/ LOW', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'XL 883N IRON', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'XR 1200 SPORTSTER', 'Não informado', 0),
  ('HARLEY-DAVIDSON', 'XR 1200X SPORTSTER', 'Não informado', 0),
  ('HARTFORD', 'LEGION 125', 'Não informado', 0),
  ('HERO', 'ANKUR 50', 'Não informado', 0),
  ('HERO', 'PUCH 50', 'Não informado', 0),
  ('HERO', 'PUCH 65', 'Não informado', 0),
  ('HERO', 'STREAM 50', 'Não informado', 0),
  ('HONDA', 'ACCORD COUPE EX', 'Não informado', 0),
  ('HONDA', 'ACCORD SEDÃ EX 2.0 16V 156CV AUT.', 'Não informado', 0),
  ('HONDA', 'ACCORD SEDÃ EX 2.4/ 2.3/ 2.2 16V', 'Não informado', 0),
  ('HONDA', 'ACCORD SEDÃ EX 2.7/ 3.0 24V', 'Não informado', 0),
  ('HONDA', 'ACCORD SEDÃ EX 3.5 V6 24V', 'Não informado', 0),
  ('HONDA', 'ACCORD SEDÃ EXR', 'Não informado', 0),
  ('HONDA', 'ACCORD SEDÃ LX 2.0 16V 150CV/ 156CV AUT.', 'Não informado', 0),
  ('HONDA', 'ACCORD SEDÃ LX 2.2/ 2.4 16V 158CV', 'Não informado', 0),
  ('HONDA', 'ACCORD SW EX', 'Não informado', 0),
  ('HONDA', 'ACCORD SW LX', 'Não informado', 0),
  ('HONDA', 'ADV 150', 'Não informado', 0),
  ('HONDA', 'AMERICA CLASSIC 1600', 'Não informado', 0),
  ('HONDA', 'BIZ 100', 'Não informado', 0),
  ('HONDA', 'BIZ 110I', 'Não informado', 0),
  ('HONDA', 'BIZ 125 ES/ ES F.INJ./ES MIX F.INJECTION', 'Não informado', 0),
  ('HONDA', 'BIZ 125 EX/ 125 EX FLEX', 'Não informado', 0),
  ('HONDA', 'BIZ 125 FLEXONE', 'Não informado', 0),
  ('HONDA', 'BIZ 125 KS/ KS F.INJ./KS MIX F.INJECTION', 'Não informado', 0),
  ('HONDA', 'BIZ 125+', 'Não informado', 0),
  ('HONDA', 'C 100 BIZ+', 'Não informado', 0),
  ('HONDA', 'C 100 BIZ-ES', 'Não informado', 0),
  ('HONDA', 'C 100 BIZ/ 100 BIZ KS', 'Não informado', 0),
  ('HONDA', 'C 100 DREAM', 'Não informado', 0),
  ('HONDA', 'CB 1000R', 'Não informado', 0),
  ('HONDA', 'CB 300F TWISTER FLEX', 'Não informado', 0),
  ('HONDA', 'CB 300R/ 300R FLEX', 'Não informado', 0),
  ('HONDA', 'CB 450 DX', 'Não informado', 0),
  ('HONDA', 'CB 500', 'Não informado', 0),
  ('HONDA', 'CB 500F', 'Não informado', 0),
  ('HONDA', 'CB 500X', 'Não informado', 0),
  ('HONDA', 'CB 600F HORNET', 'Não informado', 0),
  ('HONDA', 'CB 650F', 'Não informado', 0),
  ('HONDA', 'CB TWISTER 250CC', 'Não informado', 0),
  ('HONDA', 'CB1300 SUPER FOUR', 'Não informado', 0),
  ('HONDA', 'CBR 1000 F', 'Não informado', 0),
  ('HONDA', 'CBR 1000 RR FIRE BLADE', 'Não informado', 0),
  ('HONDA', 'CBR 1100 XX SUPER BLACKBIRD', 'Não informado', 0),
  ('HONDA', 'CBR 250R', 'Não informado', 0),
  ('HONDA', 'CBR 450', 'Não informado', 0),
  ('HONDA', 'CBR 450 SR', 'Não informado', 0),
  ('HONDA', 'CBR 500R', 'Não informado', 0),
  ('HONDA', 'CBR 600 F', 'Não informado', 0),
  ('HONDA', 'CBR 600 RR', 'Não informado', 0),
  ('HONDA', 'CBR 650F', 'Não informado', 0),
  ('HONDA', 'CBR 900 RR FIRE BLADE', 'Não informado', 0),
  ('HONDA', 'CBX 150 AERO', 'Não informado', 0),
  ('HONDA', 'CBX 200 STRADA', 'Não informado', 0),
  ('HONDA', 'CBX 250 TWISTER', 'Não informado', 0),
  ('HONDA', 'CBX 750 FOUR', 'Não informado', 0),
  ('HONDA', 'CBX 750 FOUR INDY', 'Não informado', 0),
  ('HONDA', 'CBX 750 R', 'Não informado', 0),
  ('HONDA', 'CG 125', 'Não informado', 0),
  ('HONDA', 'CG 125 CARGO ES', 'Não informado', 0),
  ('HONDA', 'CG 125 CARGO ESD', 'Não informado', 0),
  ('HONDA', 'CG 125 CARGO/ CARGO KS', 'Não informado', 0),
  ('HONDA', 'CG 125 FAN / FAN KS', 'Não informado', 0),
  ('HONDA', 'CG 125 FAN / FAN KS / 125 I FAN', 'Não informado', 0),
  ('HONDA', 'CG 125 FAN ES', 'Não informado', 0),
  ('HONDA', 'CG 125 FAN ESD', 'Não informado', 0),
  ('HONDA', 'CG 125 TITAN', 'Não informado', 0),
  ('HONDA', 'CG 125 TITAN-ES', 'Não informado', 0),
  ('HONDA', 'CG 125 TITAN-KS', 'Não informado', 0),
  ('HONDA', 'CG 125 TITAN-KSE', 'Não informado', 0),
  ('HONDA', 'CG 125 TODAY', 'Não informado', 0),
  ('HONDA', 'CG 150 CARGO ESD FLEX', 'Não informado', 0),
  ('HONDA', 'CG 150 FAN ESDI/ 150 FAN ESDI FLEX', 'Não informado', 0),
  ('HONDA', 'CG 150 FAN ESI/ 150 FAN ESI FLEX', 'Não informado', 0),
  ('HONDA', 'CG 150 SPORT', 'Não informado', 0),
  ('HONDA', 'CG 150 START FLEXONE', 'Não informado', 0),
  ('HONDA', 'CG 150 TITAN-ES', 'Não informado', 0),
  ('HONDA', 'CG 150 TITAN-ES MIX', 'Não informado', 0),
  ('HONDA', 'CG 150 TITAN-ESD MIX/FLEX', 'Não informado', 0),
  ('HONDA', 'CG 150 TITAN-ESD/ TITAN SPECIAL EDITION', 'Não informado', 0),
  ('HONDA', 'CG 150 TITAN-EX MIX/FLEX', 'Não informado', 0),
  ('HONDA', 'CG 150 TITAN-KS MIX', 'Não informado', 0),
  ('HONDA', 'CG 150 TITAN-KS/ TITAN-JOB', 'Não informado', 0),
  ('HONDA', 'CG 160 CARGO', 'Não informado', 0),
  ('HONDA', 'CG 160 FAN ESDI', 'Não informado', 0),
  ('HONDA', 'CG 160 FAN FLEX', 'Não informado', 0),
  ('HONDA', 'CG 160 START', 'Não informado', 0),
  ('HONDA', 'CG 160 TITAN 25TH ANNIVERSARY', 'Não informado', 0),
  ('HONDA', 'CG 160 TITAN FLEXONE', 'Não informado', 0),
  ('HONDA', 'CG 160 TITAN S FLEX', 'Não informado', 0),
  ('HONDA', 'CH 125-R SPACY', 'Não informado', 0),
  ('HONDA', 'CITY SEDAN DX 1.5 FLEX 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'CITY SEDAN DX 1.5 FLEX 16V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'CITY SEDAN EX 1.5 FLEX 16V 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'CITY SEDAN EX 1.5 FLEX 16V 4P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'CITY SEDAN EXL 1.5 FLEX 16V 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'CITY SEDAN EXL 1.5 FLEX 16V 4P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'CITY SEDAN LX 1.5 FLEX 16V 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'CITY SEDAN LX 1.5 FLEX 16V 4P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'CITY SEDAN PERSONAL 1.5 FLEX 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'CITY SEDAN SPORT 1.5 FLEX 16V 4P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'CIVIC COUPE EX/ EXS 1.6 16V 2P', 'ESPECIAL V5 /AUTOMóVEIS', 190),
  ('HONDA', 'CIVIC COUPÉ SI 2.4 16V 206CV MEC. 2P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC CRX/ TARGA VTI', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC HATCH DX', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC HATCH LSI', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC HATCH LX AUT', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC HATCH SI', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC HATCH VTI', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('HONDA', 'CIVIC SED LX 1.8 AUT 4P(S/ACESS.ESP.D.F)', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SED. LXL/ LXL SE 1.8 FLEX 16V AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SED. LXL/ LXL SE 1.8 FLEX 16V MEC', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('HONDA', 'CIVIC SEDAN EX 1.6 16V AUT. 4P (NACION.)', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN EX 1.6 16V MEC. 4P (NACION.)', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN EX 1.7 16V 130CV AUT. 4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN EX 1.7 16V 130CV MEC. 4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN EX 2.0 FLEX 16V AUT.4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN EXL 2.0 FLEX 16V AUT.4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN EXR 2.0 FLEXONE 16V AUT. 4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN EXS 1.8/1.8 FLEX 16V AUT. 4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN LX 1.6 16V AUT. 4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN LX 1.6 16V MEC. 4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN LX 1.7 16V 115CV MEC. 4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN LX 2.0 FLEX 16V AUT. 4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN LX/ LXL 1.7 16V 115CV AUT 4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN LXB 1.6 16V 4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN LXB 1.7 16V 115CV', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN LXL 1.7 16V 130CV AUT 4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN LXL 1.7 16V 130CV MEC 4P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('HONDA', 'CIVIC SEDAN LXR 2.0 FLEXONE 16V AUT. 4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN LXS 1.8/1.8 FLEX 16V AUT. 4P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('HONDA', 'CIVIC SEDAN LXS 1.8/1.8 FLEX 16V MEC. 4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN SI 2.0 16V 192CV 4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN SPORT 2.0 FLEX 16V AUT.4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN SPORT 2.0 FLEX 16V MEC.4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDAN TOURING 1.5 TURBO 16V AUT.4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDÃ EX/ EXS 1.6 MEC. 4P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDÃ EX/ EXS AUT. 4P/ DEL-SOL 2P', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CIVIC SEDÃ LX 1.5/ 1.6', 'ESPECIAL V5 /AUTOMóVEIS', 150),
  ('HONDA', 'CR 125', 'Não informado', 0),
  ('HONDA', 'CR 250', 'Não informado', 0),
  ('HONDA', 'CR 80', 'Não informado', 0),
  ('HONDA', 'CR-V 2.0 16V AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HONDA', 'CR-V 2.0 16V MEC.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HONDA', 'CR-V 2.4 16V 156CV AUT. 4P', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HONDA', 'CR-V EXL 2.0 16V 4WD/2.0 FLEXONE AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HONDA', 'CR-V EXL 2.0 FLEXONE 16V 2WD AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HONDA', 'CR-V LX 2.0 16V 2WD MEC.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HONDA', 'CR-V LX 2.0 16V 2WD/2.0 FLEXONE AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HONDA', 'CRF 1000L AFRICA TWIN', 'Não informado', 0),
  ('HONDA', 'CRF 1000L AFRICA TWIN TE', 'Não informado', 0),
  ('HONDA', 'CRF 110F', 'Não informado', 0),
  ('HONDA', 'CRF 150F', 'Não informado', 0),
  ('HONDA', 'CRF 230 F', 'Não informado', 0),
  ('HONDA', 'CRF 250 F', 'Não informado', 0),
  ('HONDA', 'CRF 250 X', 'Não informado', 0),
  ('HONDA', 'CRF 250L', 'Não informado', 0),
  ('HONDA', 'CTX 700N', 'Não informado', 0),
  ('HONDA', 'DOMINATOR 650', 'Não informado', 0),
  ('HONDA', 'ELITE 125', 'Não informado', 0),
  ('HONDA', 'FIT CX 1.4 FLEX 16V 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'FIT CX 1.4 FLEX 16V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'FIT DX 1.4 FLEX 16V 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'FIT DX 1.4 FLEX 16V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'FIT DX 1.5 FLEXONE 16V 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'FIT DX 1.5 FLEXONE 16V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'FIT EX/ S 1.5/ EX 1.5 FLEX 16V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'FIT EX/S/EX 1.5 FLEX/FLEXONE 16V 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'FIT EXL 1.5 FLEX 16V 5P MEC', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'FIT EXL 1.5 FLEX/FLEXONE 16V 5P AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'FIT LX 1.4/ 1.4 FLEX 8V/16V 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'FIT LX 1.4/ 1.4 FLEX 8V/16V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'FIT LX 1.5 FLEXONE 16V 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'FIT LX 1.5 FLEXONE 16V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'FIT LX FLEX', 'Não informado', 0),
  ('HONDA', 'FIT LXL 1.4/ 1.4 FLEX 8V/16V 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'FIT LXL 1.4/ 1.4 FLEX 8V/16V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'FIT PERSONAL 1.5 FLEXONE 16V 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'FIT TWIST 1.5 FLEX 16V 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'FIT TWIST 1.5 FLEX 16V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HONDA', 'GOLD WING 1500/ 1800', 'Não informado', 0),
  ('HONDA', 'HONDA SAHARA 300 ABS FLEX', 'Não informado', 0),
  ('HONDA', 'HR-V EX 1.8 FLEXONE 16V 5P AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HONDA', 'HR-V EXL 1.8 FLEXONE 16V 5P AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HONDA', 'HR-V LX 1.8 FLEXONE 16V 5P AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HONDA', 'HR-V LX 1.8 FLEXONE 16V 5P MEC.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HONDA', 'HR-V TOURING 1.8 FLEXONE 16V 5P AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HONDA', 'LEAD 110', 'Não informado', 0),
  ('HONDA', 'MAGNA 750', 'Não informado', 0),
  ('HONDA', 'NC 700 X/ 700X ABS', 'Não informado', 0),
  ('HONDA', 'NC 750X/NC 750X ABS', 'Não informado', 0),
  ('HONDA', 'NX 150', 'Não informado', 0),
  ('HONDA', 'NX 200', 'Não informado', 0),
  ('HONDA', 'NX 350 SAHARA', 'Não informado', 0),
  ('HONDA', 'NX 400I FALCON', 'Não informado', 0),
  ('HONDA', 'NX-4 FALCON 400', 'Não informado', 0),
  ('HONDA', 'NXR 125 BROS ES', 'Não informado', 0),
  ('HONDA', 'NXR 125 BROS KS', 'Não informado', 0),
  ('HONDA', 'NXR 150 BROS ES', 'Não informado', 0),
  ('HONDA', 'NXR 150 BROS ES MIX/FLEX', 'Não informado', 0),
  ('HONDA', 'NXR 150 BROS ESD', 'Não informado', 0),
  ('HONDA', 'NXR 150 BROS ESD MIX/FLEX', 'Não informado', 0),
  ('HONDA', 'NXR 150 BROS KS', 'Não informado', 0),
  ('HONDA', 'NXR 150 BROS KS MIX/FLEX', 'Não informado', 0),
  ('HONDA', 'NXR 160 BROS', 'Não informado', 0),
  ('HONDA', 'NXR 160 BROS ESD FLEXONE', 'Não informado', 0),
  ('HONDA', 'NXR 160 BROS ESDD FLEXONE', 'Não informado', 0),
  ('HONDA', 'NXR 160 BROS FLEX', 'Não informado', 0),
  ('HONDA', 'ODYSSEY EX VAN AUT (6 LUG.)', 'Não informado', 0),
  ('HONDA', 'ODYSSEY VAN LX AUT (6 LUG.)', 'Não informado', 0),
  ('HONDA', 'PASSPORT EX', 'Não informado', 0),
  ('HONDA', 'PASSPORT LX', 'Não informado', 0),
  ('HONDA', 'PASSPORT PICK-UP 4X2', 'Não informado', 0),
  ('HONDA', 'PCX 150', 'Não informado', 0),
  ('HONDA', 'PCX 150 SPORT', 'Não informado', 0),
  ('HONDA', 'PCX 160', 'Não informado', 0),
  ('HONDA', 'PCX 160 DLX ABS', 'Não informado', 0),
  ('HONDA', 'POP 100 97CC', 'Não informado', 0),
  ('HONDA', 'POP 100I ES', 'Não informado', 0),
  ('HONDA', 'POP 110I', 'Não informado', 0),
  ('HONDA', 'PRELUDE COUPÊ S 2.2', 'Não informado', 0),
  ('HONDA', 'PRELUDE SI', 'Não informado', 0),
  ('HONDA', 'SAHARA 300 ADVENTURE ABS FLEX', 'Não informado', 0),
  ('HONDA', 'SAHARA 300 RALLY ABS FLEX', 'Não informado', 0),
  ('HONDA', 'SH 150I', 'Não informado', 0),
  ('HONDA', 'SH 300I', 'Não informado', 0),
  ('HONDA', 'SHADOW 1100 AC', 'Não informado', 0),
  ('HONDA', 'SHADOW 1100 OURO', 'Não informado', 0),
  ('HONDA', 'SHADOW AM 750', 'Não informado', 0),
  ('HONDA', 'SHADOW VT 1100', 'Não informado', 0),
  ('HONDA', 'SUPER HAWK 1000', 'Não informado', 0),
  ('HONDA', 'TRX 350 FOURTRAX FM QUADRICICLO', 'Não informado', 0),
  ('HONDA', 'TRX 350 FOURTRAX TM QUADRICICLO', 'Não informado', 0),
  ('HONDA', 'TRX 420 FOURTRAX FM 4X4 QUADRICICLO', 'Não informado', 0),
  ('HONDA', 'TRX 420 FOURTRAX TM 4X2 QUADRICICLO', 'Não informado', 0),
  ('HONDA', 'VALKYRIE 1500', 'Não informado', 0),
  ('HONDA', 'VFR 1200F', 'Não informado', 0),
  ('HONDA', 'VFR 1200X CROSSTOURER', 'Não informado', 0),
  ('HONDA', 'VT 600 C SHADOW', 'Não informado', 0),
  ('HONDA', 'VT 750 SHADOW', 'Não informado', 0),
  ('HONDA', 'VTX 1800R/ 1800S/ 1800C 1795CC', 'Não informado', 0),
  ('HONDA', 'WR-V EX 1.5 FLEXONE 16V 5P AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HONDA', 'WR-V EXL 1.5 FLEXONE 16V 5P AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HONDA', 'XL 1000V VARADERO', 'Não informado', 0),
  ('HONDA', 'XL 125 DUTY', 'Não informado', 0),
  ('HONDA', 'XL 125 S', 'Não informado', 0),
  ('HONDA', 'XL 700V TRANSALP', 'Não informado', 0),
  ('HONDA', 'XLR 125', 'Não informado', 0),
  ('HONDA', 'XLR 125 ES', 'Não informado', 0),
  ('HONDA', 'XLX 250 R', 'Não informado', 0),
  ('HONDA', 'XLX 350 R', 'Não informado', 0),
  ('HONDA', 'XR 200 R', 'Não informado', 0),
  ('HONDA', 'XR 250 TORNADO', 'Não informado', 0),
  ('HONDA', 'XR 650', 'Não informado', 0),
  ('HONDA', 'XRE 190', 'Não informado', 0),
  ('HONDA', 'XRE 190 ADVENTURE FLEX', 'Não informado', 0),
  ('HONDA', 'XRE 300 ADVENTURE FLEX', 'Não informado', 0),
  ('HONDA', 'XRE 300 RALLY', 'Não informado', 0),
  ('HONDA', 'XRE 300/ 300 ABS/ FLEX', 'Não informado', 0),
  ('HUSABERG', 'FE 400 400CC', 'Não informado', 0),
  ('HUSABERG', 'FE 501 500CC', 'Não informado', 0),
  ('HUSABERG', 'FE 550 E', 'Não informado', 0),
  ('HUSQVARNA', 'CR 125', 'Não informado', 0),
  ('HUSQVARNA', 'CR 250', 'Não informado', 0),
  ('HUSQVARNA', 'HUSQY BOY J', 'Não informado', 0),
  ('HUSQVARNA', 'HUSQY BOY R', 'Não informado', 0),
  ('HUSQVARNA', 'HUSQY BOY S', 'Não informado', 0),
  ('HUSQVARNA', 'SM 610', 'Não informado', 0),
  ('HUSQVARNA', 'SMR 510', 'Não informado', 0),
  ('HUSQVARNA', 'TC 570', 'Não informado', 0),
  ('HUSQVARNA', 'TE 400', 'Não informado', 0),
  ('HUSQVARNA', 'TE 410', 'Não informado', 0),
  ('HUSQVARNA', 'TE 410 E', 'Não informado', 0),
  ('HUSQVARNA', 'TE 450', 'Não informado', 0),
  ('HUSQVARNA', 'TE 510', 'Não informado', 0),
  ('HUSQVARNA', 'TE 570', 'Não informado', 0),
  ('HUSQVARNA', 'TE 610', 'Não informado', 0),
  ('HUSQVARNA', 'TE 610 E', 'Não informado', 0),
  ('HUSQVARNA', 'WR 250', 'Não informado', 0),
  ('HUSQVARNA', 'WR 360', 'Não informado', 0),
  ('HUSQVARNA', 'WRE 125', 'Não informado', 0),
  ('HYUNDAI', 'ACCENT GLS 1.5 12/16V AUT.', 'Não informado', 0),
  ('HYUNDAI', 'ACCENT GLS 1.5 12/16V MEC.', 'Não informado', 0),
  ('HYUNDAI', 'ACCENT GS 3P MEC', 'Não informado', 0),
  ('HYUNDAI', 'ACCENT L/ LR 1.5 2/4P', 'Não informado', 0),
  ('HYUNDAI', 'ACCENT LS 4P', 'Não informado', 0),
  ('HYUNDAI', 'ATOS PRIME GL 1.0 MEC', 'Não informado', 0),
  ('HYUNDAI', 'ATOS PRIME GLS 1.0 AUT.', 'Não informado', 0),
  ('HYUNDAI', 'ATOS PRIME GLS 1.0 MEC.', 'Não informado', 0),
  ('HYUNDAI', 'ATOS PRIME GLS 1.0 SEMI-AUT.', 'Não informado', 0),
  ('HYUNDAI', 'AZERA 3.0 V6 24V 4P AUT.', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'AZERA GLS 3.3 V6 24V 4P AUT.', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'COUPE FX 2.7 V6 24V 180CV AUT.', 'Não informado', 0),
  ('HYUNDAI', 'COUPE FX 2.7 V6 24V 180CV MEC.', 'Não informado', 0),
  ('HYUNDAI', 'COUPÊ FX 2.0 AUT.', 'Não informado', 0),
  ('HYUNDAI', 'COUPÊ FX 2.0 MEC.', 'Não informado', 0),
  ('HYUNDAI', 'CRETA ACTION 1.6 16V FLEX AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'CRETA ATTITUDE 1.6 16V FLEX AUT.(PCD)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'CRETA ATTITUDE 1.6 16V FLEX MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'CRETA COMFORT 1.0 TB 12V FLEX AUT', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'CRETA LIMITED 1.0 TB 12V FLEX AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'CRETA PRESTIGE 2.0 16V FLEX AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'CRETA PULSE 1.6 16V FLEX AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'CRETA PULSE 1.6 16V FLEX MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'CRETA PULSE 2.0 16V FLEX AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'CRETA PULSE PLUS 1.6 16V FLEX AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'CRETA SMART 1.6 16V FLEX AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'CRETA SMART PLUS 1.6 16V FLEX AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'CRETA SPORT 2.0 16V FLEX AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'CUPÊ 2.0', 'Não informado', 0),
  ('HYUNDAI', 'ELANTRA 2.0 16V FLEX AUT.', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'ELANTRA GL', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'ELANTRA GLS 1.6', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'ELANTRA GLS 1.8 16V', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'ELANTRA GLS 1.8 16V AUT.', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'ELANTRA GLS 1.8 16V MEC.', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'ELANTRA GLS 2.0 16V AUT', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'ELANTRA GLS 2.0 16V FLEX AUT.', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'ELANTRA GLS 2.0 16V MEC', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'ELANTRA SPECIAL EDITION 2.0 16V FLEX AUT', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'ELANTRA WAGON 1.8 16V', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'EQUUS 4.6 V8 32V 366CV 4P AUT.', 'Não informado', 0),
  ('HYUNDAI', 'EXCEL GLS', 'Não informado', 0),
  ('HYUNDAI', 'EXCEL GS', 'Não informado', 0),
  ('HYUNDAI', 'EXCEL L', 'Não informado', 0),
  ('HYUNDAI', 'EXCEL LS/ GL', 'Não informado', 0),
  ('HYUNDAI', 'GALLOPER 2.5 LUXO TURBO DIESEL', 'Não informado', 0),
  ('HYUNDAI', 'GALLOPER 2.5 SUPER LUXO TURBO DIESEL', 'Não informado', 0),
  ('HYUNDAI', 'GALLOPER 3.0 V6 LUXO', 'Não informado', 0),
  ('HYUNDAI', 'GALLOPER 3.0 V6 SUPER LUXO AUT', 'Não informado', 0),
  ('HYUNDAI', 'GALLOPER 3.0 V6 SUPER LUXO MEC', 'Não informado', 0),
  ('HYUNDAI', 'GENESIS 3.8 V6 24V 290CV 4P AUT.', 'Não informado', 0),
  ('HYUNDAI', 'GRAND SANTA FÉ 3.3 V6 4X4 TIPTRONIC', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'H1 STAREX HSV 2.4 16V 137CV AUT.', 'Não informado', 0),
  ('HYUNDAI', 'H1 STAREX HSV 2.5 DIESEL', 'Não informado', 0),
  ('HYUNDAI', 'H1 STAREX SVX 2.4 16V', 'Não informado', 0),
  ('HYUNDAI', 'H1 STAREX SVX 2.5 TDI 100CV DIESEL', 'Não informado', 0),
  ('HYUNDAI', 'H1 STAREX SVX 2.6 85CV DIESEL', 'Não informado', 0),
  ('HYUNDAI', 'H100 DLX FURGÃO DIESEL', 'Não informado', 0),
  ('HYUNDAI', 'H100 DLX/ PANEL DIESEL', 'Não informado', 0),
  ('HYUNDAI', 'H100 GL DIESEL', 'Não informado', 0),
  ('HYUNDAI', 'H100 GL FURGÃO EXTRA-LONGO DIESEL', 'Não informado', 0),
  ('HYUNDAI', 'H100 GLS DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'H100 GS (12 LUGARES)', 'Não informado', 0),
  ('HYUNDAI', 'H100 GS DIESEL (12 LUGARES)', 'Não informado', 0),
  ('HYUNDAI', 'H100 PORTER TRUCK DIESEL', 'Não informado', 0),
  ('HYUNDAI', 'H100 SPR DIESEL (15 LUGARES)', 'Não informado', 0),
  ('HYUNDAI', 'H100 TOP DIESEL', 'Não informado', 0),
  ('HYUNDAI', 'HB 20 COMFORT PLUS 1.0 FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 5 ANOS 1.0 FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 5 ANOS 1.6 FLEX 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 C./C.PLUS/C.STYLE 1.6 FLEX 16V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 C.STYLE/C.PLUS 1.6 FLEX 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 COMF./C.PLUS/C.STYLE 1.0 FLEX 12V', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 COMFORT 1.0 FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 COMFORT PLUS 1.0 TB FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 COMFORT STYLE 1.0 TB FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 COPA DO MUNDO 1.0 FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 COPA DO MUNDO 1.6 FLEX 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 COPA DO MUNDO 1.6 FLEX 16V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 EVOLUTION 1.0 FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 EVOLUTION 1.0 TB FLEX 12V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 FOR YOU 1.0 FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 LIMITED 1.0 FLEX 12V MEC', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 OCEAN 1.0 FLEX 12V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 OCEAN 1.6 FLEX 16V 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 OCEAN 1.6 FLEX 16V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 PREMIUM 1.6 FLEX 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 PREMIUM 1.6 FLEX 16V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 R SPEC 1.6 FLEX 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 R SPEC 1.6 FLEX 16V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 R SPEC LIMITED 1.6 FLEX 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 S FOR YOU 1.0 FLEX 12V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 SENSE 1.0 FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 SPICY 1.0 FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 SPICY 1.6 FLEX 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 SPICY 1.6 FLEX 16V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 UNIQUE 1.0 FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 VISION 1.0 FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20 VISION 1.6 FLEX 16V AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S 1.0 COMF', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S 5 ANOS 1.0 FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S 5 ANOS 1.6 FLEX 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S C.PLUS/C.STYLE 1.6 FLEX 16V MEC.4P', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S C.PLUS/C.STYLE1.0 FLEX 12V MEC. 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S C.STYLE/C.PLUS1.6 FLEX 16V AUT. 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S COMFORT PLUS 1.0 TB FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S COMFORT STYLE 1.0 TB FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S COPA DO MUNDO 1.0 FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S COPA DO MUNDO 1.6 FLEX 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S COPA DO MUNDO 1.6 FLEX 16V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S EVOLUTION 1.0 FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S IMPRESS 1.6 FLEX 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S IMPRESS 1.6 FLEX 16V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S LIMITED 1.0 FLEX 12V MEC', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S OCEAN 1.6 FLEX 16V 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S OCEAN 1.6 FLEX 16V 4P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S PREMIUM 1.6 FLEX 16V AUT. 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S PREMIUM 1.6 FLEX 16V MEC. 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S UNIQUE 1.0 FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S VISION 1.0 FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20S VISION 1.6 FLEX 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20X PREMIUM 1.6 FLEX 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20X PREMIUM 1.6 FLEX 16V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20X STYLE 1.6 FLEX 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20X STYLE 1.6 FLEX 16V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HB20X VISION 1.6 FLEX 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HD78 3.0 16V 155CV (DIESEL) 2P', 'Não informado', 0),
  ('HYUNDAI', 'HD80 3.0 16V (DIESEL)(E5)', 'Não informado', 0),
  ('HYUNDAI', 'HR 2.5 TCI DIESEL (RS/RD)', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'HYUNDAI HB20S COMFORT 1.0 FLEX 12V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'HYUNDAI HR HDB 2.5 DIE', 'V6 PICKUPS/VANS/UTILITáRIOS', 30),
  ('HYUNDAI', 'HYUNDAI/HB20 1.0M CONFOR', 'V5 AUTOMOVEL COMUM', 0),
  ('HYUNDAI', 'I30 1.6 16V FLEX 5P AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('HYUNDAI', 'I30 1.8 16V 148CV AUT. 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('HYUNDAI', 'I30 2.0 16V 145CV 5P AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('HYUNDAI', 'I30 2.0 16V 145CV 5P MEC.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('HYUNDAI', 'I30 SERIE LIMITADA 1.8 16V AUT. 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('HYUNDAI', 'I30CW 2.0 16V 145CV AUT. 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('HYUNDAI', 'I30CW 2.0 16V 145CV MEC. 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('HYUNDAI', 'IX35 2.0 16V 170CV 2WD/4WD AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'IX35 2.0 16V 170CV 2WD/4WD MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'IX35 2.0 16V 2WD FLEX AUT', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'IX35 2.0 16V 2WD FLEX MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'IX35 2.0 LAUNCHING EDITION 16V FLEX AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'IX35 GL 2.0 16V 2WD FLEX AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'IX35 GLS 2.0 16V 2WD FLEX AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'MATRIX GLS 1.8 16V 123CV AUT.', 'Não informado', 0),
  ('HYUNDAI', 'MATRIX GLS 1.8 16V 123CV MEC.', 'Não informado', 0),
  ('HYUNDAI', 'PORTER GL 4X2 CURTO/LONGO DIESEL', 'Não informado', 0),
  ('HYUNDAI', 'PORTER GLS CD 4X2 2.6 8V DIESEL', 'Não informado', 0),
  ('HYUNDAI', 'SANTA FE GLS 2.4 TIPTRONIC', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'SANTA FE GLS 2.7 V6 4X4TIPTRONIC', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'SANTA FE GLS 3.5 V6 4X4 TIPTRONIC', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'SANTA FÉ /GLS 3.3 V6 4X4 TIPTRONIC', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'SCOUPE', 'Não informado', 0),
  ('HYUNDAI', 'SONATA 2.4 16V 182CV 4P AUT.', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'SONATA GL 2.0 4P', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'SONATA GLS 2.0 4P', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'SONATA GLS 2.5 AUT.', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'SONATA GLS 2.7 V6 24V 179CV 4P AUT.', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'SONATA GLS 3.0 4P AUT', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'SONATA GLS 3.3 V6 24V 235CV 4P AUT.', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'TERRACAN 2.5 8V 100CV TB DIESEL AUT.', 'Não informado', 0),
  ('HYUNDAI', 'TERRACAN 2.5 8V 100CV TB DIESEL MEC.', 'Não informado', 0),
  ('HYUNDAI', 'TERRACAN 2.9 CRDI 8V 163CV DIESEL AUT.', 'Não informado', 0),
  ('HYUNDAI', 'TRAJET GLS 2.7 V6 24V 179CV AUT.', 'Não informado', 0),
  ('HYUNDAI', 'TUCSON 2.0 16V AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'TUCSON 2.0 16V FLEX AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'TUCSON 2.0 16V FLEX MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'TUCSON 2.0 16V MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'TUCSON 2.0 CRDI 16V 112CV DIESEL AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'TUCSON 2.7 MPFI 24V 175CV AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'TUCSON ED. ESPECIAL 1.6 TURBO 16V AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'TUCSON GL 1.6 TURBO 16V AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'TUCSON GLS 1.6 TURBO 16V AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'TUCSON LIMITED 1.6 TURBO 16V AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('HYUNDAI', 'VELOSTER 1.6 16V 140CV AUT.', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('HYUNDAI', 'VERACRUZ GLS 3.8 4WD AUT.', 'ESPECIAL V15 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('IBIPORA', 'SR / IBIPORA 3E', 'Não informado', 0),
  ('IBIPORA', 'SR / IBIPORA SR3E FRIG', 'Não informado', 0),
  ('ICON', 'SR / ICON BASC 300', 'Não informado', 0),
  ('IDEROL', 'R / IDEROL SRI FG', 'Não informado', 0),
  ('IDEROL', 'SR / IDEROL', 'Não informado', 0),
  ('INDIAN', 'CHIEF CLASSIC', 'Não informado', 0),
  ('INDIAN', 'CHIEF DARK HORSE', 'Não informado', 0),
  ('INDIAN', 'CHIEF SPRINGFIELD', 'Não informado', 0),
  ('INDIAN', 'CHIEF VINTAGE', 'Não informado', 0),
  ('INDIAN', 'CHIEFTAIN', 'Não informado', 0),
  ('INDIAN', 'CHIEFTAIN DARK HORSE', 'Não informado', 0),
  ('INDIAN', 'ROADMASTER', 'Não informado', 0),
  ('INDIAN', 'SCOUT', 'Não informado', 0),
  ('INDIAN', 'SCOUT BOBBER', 'Não informado', 0),
  ('IROS', 'ACTION 100 ES', 'Não informado', 0),
  ('IROS', 'ACTION 100 ESA', 'Não informado', 0),
  ('IROS', 'BRAVE 150 QUADRICICLO', 'Não informado', 0),
  ('IROS', 'BRAVE 450 QUADRICICLO', 'Não informado', 0),
  ('IROS', 'BRAVE 70 QUADRICICLO', 'Não informado', 0),
  ('IROS', 'MATRIX 150', 'Não informado', 0),
  ('IROS', 'MOVING 125 ES', 'Não informado', 0),
  ('IROS', 'MOVING 125 ESD', 'Não informado', 0),
  ('IROS', 'ONE 125 ES', 'Não informado', 0),
  ('IROS', 'ONE 125 ESD', 'Não informado', 0),
  ('IROS', 'ONE 125 EX', 'Não informado', 0),
  ('IROS', 'VINTAGE 150', 'Não informado', 0),
  ('IROS', 'WARRIOR 250 QUADRICICLO', 'Não informado', 0),
  ('IROS', 'WARRIOR 400 4X4 QUADRICICLO', 'Não informado', 0),
  ('IROS', 'WARRIOR 700 4X4 QUADRICICLO', 'Não informado', 0),
  ('ISUZU', 'AMIGO 2.3 4X2/4X4', 'Não informado', 0),
  ('ISUZU', 'HOMBRE 2 WD XS 2.2', 'Não informado', 0),
  ('ISUZU', 'RODEO 3.2 V6', 'Não informado', 0),
  ('IVECO', 'CITYCLASS ESCOLAR (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'CITYCLASS EXECUTIVO/TURISMO (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'CITYCLASS EXECUTIVO/TURISMO 1P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'CITYCLASS FRETAMENTO (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'CITYCLASS URB./ESCOLAR/SPTRANS 1P', 'Não informado', 0),
  ('IVECO', 'CURSOR 450E 33 T 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'DAILY CHAS. 70C16HD CD MASSIMO 4P (DIES)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 35-160 CURTO 3.0', 'CAMINHõES-LEVE-VANS', 0),
  ('IVECO', 'DAILY CHASSI 35.10/ 35.13/ 40.13 2P', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 35.10/35.13/40.13 CD 3P', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 35S14 2P (DIES.)(E5)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 35S14 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 35S14 CAB.DUP. 4P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 35S14 CD 4P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 40S14 2P (DIESEL) (E5)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 45S14 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 45S14 CAB.DUP. 4P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 45S17 2P (DIES.)(E5)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 45S17 CD 4P (DIES.)(E5)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 49.10 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 49.12/ 50.13 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 50.13 CAB.DUP. 3P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 55C16 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 55C16 CAB.DUP. 4P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 55C17 2P (DIES.)(E5)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 55C17 CD 4P (DIES.)(E5)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 59.12/ 60.12 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 70.12/ 70.13 2P (DIESEL)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY CHASSI 70.13 CAB.DUP. 3P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 70C16 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 70C16 CAB.DUP. 4P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'DAILY CHASSI 70C16 HD MASSIMO 2P (DIESEL', 'Não informado', 0),
  ('IVECO', 'DAILY FURG/ CITY FURG.35.10/40.13 4P', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY FURGAO 30-130 2.3 7,3M (DIE)(E5)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY FURGAO 49.10 4P (DIESEL)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY FURGAO 49.12/ 50.13 4P (DIESEL)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY FURGONE 35S14 4P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'DAILY FURGÃO CITY 38.13 4P (DIESEL)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY GRAN FURGONE 35S14 4P (DIES.)(E5)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY GRAN FURGONE 35S14 4P (DIESEL)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY GRAN FURGONE 45S14 2P (DIESEL)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY GRAN FURGONE 45S17 4P (DIES.)(E5)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY GRAN FURGONE 55C16 4P ( DIESEL)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY GRAN FURGONE 55C17 4P (DIES.)(E5)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY MAX VAN 40.12/40.13 2P TDI 15L+2', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY MAX VAN 49.12/ 50.13 TB INT. 2P', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY MAXI FURGONE 55C16 4P (DIESEL)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY MAXI FURGONE 55C17 4P (DIES.)(E5)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY MINIBUS EXE/TUR. 45S17 (DIES.)(E5)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY MINIBUS EXEC/TUR 55C17 (DIES.)(E5)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY MINIBUS FRETAM. 45S17 (DIES.) (E5)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY MINIBUS FRETAM. 50C17 (DIES.)(E5)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY MINIBUS FRETAM. 55C17 (DIES.) (E5)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY MINIBUSTURISMO 50C17 (DIES.)(E5)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY TRUCK CHAS. 70C17 2P (DIES.)(E5)', 'Não informado', 0),
  ('IVECO', 'DAILY TRUCK CHAS. 70C17 CD 4P(DIES.)(E5)', 'Não informado', 0),
  ('IVECO', 'DAILY VETRATO 45S17 4P (DIESEL)(E5)', 'V10 /AUTOMóVEIS COMUM', 0),
  ('IVECO', 'DAILY VETRATO 55C16 4P (DIESEL)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'DAILY VETRATO 55C17 4P (DIESEL)(E5)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('IVECO', 'EUROCARGO 120-E15 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'EUROCARGO 120-E15 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'EUROCARGO 150-E18 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'EUROCARGO 150-E18 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'EUROCARGO 160-E21 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'EUROCARGO 160-E21 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'EUROCARGO 170-E21 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'EUROCARGO 170-E21 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'EUROCARGO 170-E22 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'EUROCARGO 230-E22 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'EUROCARGO 260-E25 6X4 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'EUROCARGO CAVALLINO 450-E32 T 2P (DIESEL', 'Não informado', 0),
  ('IVECO', 'EUROCARGO/ATTACK 170-E22 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'EUROCARGO/ATTACK 230-E24 3-E. 2P (DIES.)', 'Não informado', 0),
  ('IVECO', 'EUROTECH MP 450-E37 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'EUROTECH TZ 740-E42 6X4 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'EUROTRAKKER 380-E38 H 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'EUROTRAKKER 720-E42 HT 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'EUROTRAKKER MP 450-E37 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'IVECO DAILY CITY 30S13', 'CAMINHõES-LEVE-VANS', 35),
  ('IVECO', 'POWERSTAR 450 E37 (DIESEL)', 'Não informado', 0),
  ('IVECO', 'STRALIHD', 'CAMINHõES-LEVE-VANS', 0),
  ('IVECO', 'STRALIS 450-S33T TA 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 450-S33T TB 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 460-S36T TA 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 460-S36T TB 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 490-S40T TA 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 490-S40T TA EUROT.(DIES)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 490-S40T TB 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 490-S40T TB EUROT.(DIES)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 490-S44T TA 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 490-S44T TA EUROT.(DIES)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 490-S44T TB 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 500-S33T TA 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 500-S33T TB 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 530-S36T TA 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 530-S36T TB 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 600-S40T TA 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 600-S40T TA 6X2 EUROT.(DIES)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 600-S40T TB 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 600-S40T TB 6X2 EUROT.(DIES)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 600-S44T TA 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 600-S44T TA 6X2 EUROT.(DIES)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 600-S44T TB 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 600-S44T TB 6X2 EUROT.(DIES)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 800-S44T TA 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 800-S44T TA 6X4 EUROT.(DIES)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 800-S44T TB 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 800-S44T TB 6X4 EUROT.(DIES)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS 800-S48T TA 6X4 EUROT.(DIES)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS HD 450-S38T 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'STRALIS HD 450-S42T 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'STRALIS HD 490-S42T 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'STRALIS HD 570-S42T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'STRALIS HD 740-S42T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'STRALIS HD 740-S46TZ 3-EIXO 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'STRALIS HD/NR 490-S38T 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'STRALIS HD/NR 570-S38T 3-EIXOS 2P (DIES)', 'Não informado', 0),
  ('IVECO', 'STRALIS HI-WAY 490-S44T 4X2 (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS HI-WAY 490-S48T 4X2 (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS HI-WAY 600-S44T 6X2 (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS HI-WAY 600-S48T 6X2 (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS HI-WAY 600-S56T 6X2 (DIES.)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS HI-WAY 800-S48TZ 6X4 (DIEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS HI-WAY 800-S56TZ 6X4 (DIEL)(E5)', 'Não informado', 0),
  ('IVECO', 'STRALIS NR 490-S41T 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'STRALIS NR 490-S46T 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'STRALIS NR 570-S41T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'STRALIS NR 570-S46T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'STRALIS NR 740-S41T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'TECTOR 150E21 ATTACK ECO. 4X2(DIES.)(E5)', 'Não informado', 0),
  ('IVECO', 'TECTOR 170E21 ATTACK 4X2 2P 9DIES.)(E5)', 'Não informado', 0),
  ('IVECO', 'TECTOR 170E22 ATTACK 4X2 2P (DIES.)(E5)', 'Não informado', 0),
  ('IVECO', 'TECTOR 170E25 4X2 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'TECTOR 170E28 4X2 2P (DIES.)(E5)', 'Não informado', 0),
  ('IVECO', 'TECTOR 240E22 ATTACK 6X2 2P (DIES.)(E5)', 'Não informado', 0),
  ('IVECO', 'TECTOR 240E25 6X2 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'TECTOR 240E25 S 6X2 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'TECTOR 240E28 6X2 2P (DIES.)(E5)', 'Não informado', 0),
  ('IVECO', 'TECTOR 240E28 ATTACK 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'TECTOR 240E28S STRADALE 6X2 2P(DIES)(E5)', 'Não informado', 0),
  ('IVECO', 'TECTOR 240E30S 6X2 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'TECTOR 260E25 6X4 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'TECTOR 260E28 6X4 2P (DIES.)(E5)', 'Não informado', 0),
  ('IVECO', 'TECTOR 260E30 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'TECTOR 310E28 8X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'TECTOR 310E30 8X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'TECTOR STRADALE 240E25S 6X2 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'TRAKKER 380-T38 6X4 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'TRAKKER 380-T42 6X4 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'TRAKKER 410-T48 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'TRAKKER 720-T42T 6X4 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'TRAKKER 740-T48 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('IVECO', 'VERTIS 130V18 4X2 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'VERTIS 130V19 2P (DIESEL)(E5)', 'Não informado', 0),
  ('IVECO', 'VERTIS 90V16 4X2 2P (DIESEL)', 'Não informado', 0),
  ('IVECO', 'VERTIS 90V18 2P (DIESEL)(E5)', 'Não informado', 0),
  ('JAC', 'J2 1.4 16V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('JAC', 'J2 1.4 JET FLEX 16V 5P MEC', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('JAC', 'J3 1.4 16V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('JAC', 'J3 BRASIL 1.4 16V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('JAC', 'J3 BRASIL1.4 16V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('JAC', 'J3 S 1.5 JET FLEX 16V VVT 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('JAC', 'J3 S TURIN 1.5 JET FLEX 16V 4P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('JAC', 'J3 TURIN SEDAN 1.4 16V 4P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('JAC', 'J3 TURIN SEDAN BRASIL 1.4 16V 4P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('JAC', 'J5 SEDAN 1.5 16V 4P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('JAC', 'J6 2.0 16V 5P MEC.', 'Não informado', 0),
  ('JAC', 'J6 2.0 JET FLEX 5P MEC.', 'Não informado', 0),
  ('JAC', 'T 140 2.8 2P (DIESEL)', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('JAC', 'T40 1.5 JET FLEX 16V 5P MEC.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('JAC', 'T40 1.6 16V 5P AUT.1.6 16V-AUTOMáTICA', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('JAC', 'T40 PLUS 1.5 JET FLEX 16V 5P MEC.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('JAC', 'T40 PLUS 1.6 16V 5P AUT.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('JAC', 'T5 1.5 JET FLEX 16V 5P AUT.', 'Não informado', 0),
  ('JAC', 'T5 1.5 JET FLEX 16V 5P MEC.', 'Não informado', 0),
  ('JAC', 'T50 1.6 16V 5P AUT.1.6 16V-AUTOMáTICA', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('JAC', 'T50 PLUS 1.6 16V 5P AUT.1.6 16V-AUTOMáTICA', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('JAC', 'T6 2.0 JET FLEX 5P MEC.', 'Não informado', 0),
  ('JAC', 'T8 2.0 16V 5P MEC.', 'Não informado', 0),
  ('JAC', 'V260 2.0 16V DIESEL', 'Não informado', 0),
  ('JAGUAR', 'DAIMLER LWB 4.0', 'Não informado', 0),
  ('JAGUAR', 'F-PACE 2.0 PRESTIGE 180CV DIESEL AUT.', 'Não informado', 0),
  ('JAGUAR', 'F-PACE 2.0 PRESTIGE 250CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'F-PACE 2.0 R-SPORT 250CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'F-PACE 3.0 FIRST EDITION 380CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'F-PACE 3.0 R-SPORT 340CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'F-PACE 3.0 S 380CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'F-TYPE R AWD SUPERCHARGED COUPE 5.0 V6', 'Não informado', 0),
  ('JAGUAR', 'F-TYPE R SUPERCHARGED COUPE 5.0 V8', 'Não informado', 0),
  ('JAGUAR', 'F-TYPE S SUPERCHARGED CONVERSIVEL 3.0 V6', 'Não informado', 0),
  ('JAGUAR', 'F-TYPE S SUPERCHARGED CONVERSIVEL 5.0 V8', 'Não informado', 0),
  ('JAGUAR', 'F-TYPE S SUPERCHARGED COUPE 3.0 V6', 'Não informado', 0),
  ('JAGUAR', 'F-TYPE SUPERCHARGED CONVERSIVEL 3.0 V6', 'Não informado', 0),
  ('JAGUAR', 'F-TYPE SUPERCHARGED COUPE 3.0 V6', 'Não informado', 0),
  ('JAGUAR', 'S-TYPE 3.0/ 3.0 SE V6', 'Não informado', 0),
  ('JAGUAR', 'S-TYPE 4.2/ 4.2 SE/ 4.0 V8 32V', 'Não informado', 0),
  ('JAGUAR', 'S-TYPE R 4.2 V8 32V 400CV', 'Não informado', 0),
  ('JAGUAR', 'X-TYPE ESTATE 3.0 24V 230CV', 'Não informado', 0),
  ('JAGUAR', 'X-TYPE SE 2.5 V6 194CV', 'Não informado', 0),
  ('JAGUAR', 'X-TYPE SE 3.0 V6 231CV', 'Não informado', 0),
  ('JAGUAR', 'XE 2.0 TURBOCHARGED PURE 240CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'XE 2.0 TURBOCHARGED R-SPORT 240CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'XE 3.0 SUPERCHARGED S 340CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'XF 2.0 GTDI PRESTIGE 16V 240CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'XF 2.0 GTDI R-SPORT 240CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'XF 2.0 GTDI SPORT LUXURY 240CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'XF 2.0 GTDI SPORT PREMIUM TECH 240CV AUT', 'Não informado', 0),
  ('JAGUAR', 'XF 2.0 TURBO 16V 240CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'XF 3.0 PORTFOLIO SUPERCHARGED V6 AUT.', 'Não informado', 0),
  ('JAGUAR', 'XF 3.0 S V6 380CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'XF 3.0 V6 24V 240CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'XF 4.2 V8 32V 300CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'XF 5.0 32V V8 385CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'XF SV8 4.2 V8 32V 420CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'XFR SUPERCHARGED 5.0 V8 510CV AUT', 'Não informado', 0),
  ('JAGUAR', 'XFR-S SUPERCHARGED 5.0 V8 550CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'XJ 2.0 TURBO 16V 240CV AUT.', 'Não informado', 0),
  ('JAGUAR', 'XJ 3.0 PORTFOLIO SUPERCHARGED V6 AUT.', 'Não informado', 0),
  ('JAGUAR', 'XJ 3.0 R-SPORT SUPERCHARGED V6 AUT.', 'Não informado', 0),
  ('JAGUAR', 'XJ S.SPORT SUPERCHARGED 5.0 V8 32V AUT.', 'Não informado', 0),
  ('JAGUAR', 'XJ SUPER 4.2 V8 32V 400CV 4P', 'Não informado', 0),
  ('JAGUAR', 'XJ-12', 'Não informado', 0),
  ('JAGUAR', 'XJ-12 CONV.', 'Não informado', 0),
  ('JAGUAR', 'XJ-6', 'Não informado', 0),
  ('JAGUAR', 'XJ-8 DAIMLER', 'Não informado', 0),
  ('JAGUAR', 'XJ-8 EXECUTIVE/ CENTENARY 4.0', 'Não informado', 0),
  ('JAGUAR', 'XJ-8 EXECUTIVE/ SE 4.2 V8 32V 300CV 4P', 'Não informado', 0),
  ('JAGUAR', 'XJ-8 SOVEREIGN LWB 4.0', 'Não informado', 0),
  ('JAGUAR', 'XJR 4.2 V8 32V 400CV 4P', 'Não informado', 0),
  ('JAGUAR', 'XJS 4.0 24V', 'Não informado', 0),
  ('JAGUAR', 'XJS-C 6.0 V12', 'Não informado', 0),
  ('JAGUAR', 'XK-8 BR CONVERSÍVEL / XK-8 CONVERSÍVEL', 'Não informado', 0),
  ('JAGUAR', 'XK-8 BR COUPÊ/ XK-8 COUPÊ', 'Não informado', 0),
  ('JAGUAR', 'XKR CONVERSÍVEL 4.2 / 5.0 32V', 'Não informado', 0),
  ('JAGUAR', 'XKR COUPÊ 4.2 / 5.0 32V', 'Não informado', 0),
  ('JAGUAR', 'XKR-S COUPÉ SUPERCHARGED 5.0 32V', 'Não informado', 0),
  ('JEEP', 'CHEROKEE COUNTRY 4.0 V6 4X44X44.0 V6-COUNTRY', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'CHEROKEE LIMITED 3.2 4X4 V6 AUT.4X43.2 V6AUTOMáTICALIMITED', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'CHEROKEE LIMITED 3.7 4X4 V6 12V AUT.4X43.7 V6AUTOMáTICALIMITED', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'CHEROKEE LONGITUDE 3.2 4X4 V6 AUT.4X43.2 V6AUTOMáTICALONGITUDE', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'CHEROKEE RUBICON 4.0 V6 4X44X44.0 V6-RUBICON', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'CHEROKEE SPORT 2.5 4X4 DIESEL4X42.5 DIESEL-SPORT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'CHEROKEE SPORT 3.7 4X4 V6 12V AUT.4X43.7 V6AUTOMáTICASPORT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'CHEROKEE SPORT 4.0 MEC./AUT.-4.0 V6MANUAL/AUTOSPORT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'CHEROKEE TRAILHAWK 3.2 4X4 V6 AUT.4X43.2 V6AUTOMáTICATRAILHAWK', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'COMMANDER LIMITED 5.7 326CV 5P', 'Não informado', 0),
  ('JEEP', 'COMPASS LIMITED 2.0 4X2 FLEX 16V AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'COMPASS LIMITED 2.0 4X4 DIESEL 16V AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'COMPASS LONG. T270 1.3 TB 4X2', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'COMPASS LONGITUDE 2.0 4X2 FLEX 16V AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'COMPASS LONGITUDE 2.0 4X4 DIES. 16V AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'COMPASS NIGHT EAGLE 2.0 4X2 FLEX 16V AUT', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 15),
  ('JEEP', 'COMPASS NIGHT EAGLE 2.0 4X4 TB DIES. AUT', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'COMPASS SPORT 2.0 16V 156CV 5P', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'COMPASS SPORT 2.0 4X2 FLEX 16V AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'COMPASS SPORT 2.0 4X4 FLEX 16V AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'COMPASS TRAILHAWK 2.0 4X4 DIES. 16V AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'COMPASS TRAILHAWK TD350 2.0 4X4 DIE. AUT', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 150),
  ('JEEP', 'GRAND CHEROKEE LAREDO 2.7 I-5 TB DIES.2.7 I-5 TB DIESEL-LAREDO', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'GRAND CHEROKEE LAREDO 3.1 TB DIESEL AUT3.1 TB DIESELAUTOMáTICALAREDO', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'GRAND CHEROKEE LAREDO 3.6 4X4 V6 AUT.3.6 V6AUTOMáTICALAREDO', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'GRAND CHEROKEE LAREDO 4.0 AUT.4.0AUTOMáTICALAREDO', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'GRAND CHEROKEE LIM. 75 ANOS 3.6 4X4 AUT.3.6 V6AUTOMáTICA75 ANOS', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'GRAND CHEROKEE LIMIT.4.7 QUAD.DRIVE AUT.4.7 QUAD.DRIVEAUTOMáTICALIMITED', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'GRAND CHEROKEE LIMITED 3.0 TB DIES. AUT3.0 TB DIESELAUTOMáTICALIMITED', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'GRAND CHEROKEE LIMITED 3.6 4X4 V6 AUT.3.6 V6AUTOMáTICALIMITED', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'GRAND CHEROKEE LIMITED 4.7 AUT.4.7AUTOMáTICALIMITED', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'GRAND CHEROKEE LIMITED 5.2 AUT.5.2AUTOMáTICALIMITED', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'GRAND CHEROKEE LIMITED 5.7 326CV5.7 326CV-LIMITED', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'GRAND CHEROKEE LIMITED LX 5.95.9-LIMITED LX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'GRAND CHEROKEE NOVA LIMITED 4.74.7-NOVA LIMITED', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'GRAND CHEROKEE OVERLAND 5.7 326CV5.7 326CV-OVERLAND', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'GRAND CHEROKEE SRT8 6.1 V8 16V 432CV AUT6.1 V8 16V 432CVAUTOMáTICASRT8', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'JEEP / RENEGADE SPORT MT', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'JEEP, COMPASS S 2.0 4X4 TB 16V DIESEL', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'RENEGADE 75 ANOS 1.8 4X2 FLEX 16V AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'RENEGADE 75 ANOS 2.0 4X4 TB DIESEL AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'RENEGADE CUSTOM 1.8 4X2 FLEX 16V MEC.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'RENEGADE CUSTOM 2.0 4X4 TB DIESEL AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'RENEGADE LIM. EDIT. 1.8 4X2 FLEX 16V AUT', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'RENEGADE LIMITED 1.8 4X2 FLEX 16V AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'RENEGADE LIMITED 2.0 4X4 TB DIESEL AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'RENEGADE LONG. T270 1.3 TB 4X2 FLEX AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('JEEP', 'RENEGADE LONGITUDE 1.8 4X2 FLEX 16V AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'RENEGADE LONGITUDE 2.0 4X4 TB DIESEL AUT', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'RENEGADE NIGHT EAGLE 1.8 4X2  FLEX AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'RENEGADE NIGHT EAGLE 2.0 4X4 TB DIE. AUT', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'RENEGADE SPORT 1.8 4X2  16V AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'RENEGADE SPORT 1.8 4X2 FLEX 16V MEC.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'RENEGADE SPORT 2.0 4X4 TB DIESEL AUT.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'RENEGADE SPORT T270 1.3-TB-4X2 FLEX AUT', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'RENEGADE TRAILHAWK 2.0 4X4 TB DIESEL AUT', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'RENEGADE1.8 4X2 FLEX 16V AUT.(PCD)', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'RENEGADE1.8 4X2 FLEX 16V MEC.', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('JEEP', 'WRANGLER 4.0/SPORT 4.0', 'Não informado', 0),
  ('JEEP', 'WRANGLER SAHARA 3.8 V6 199CV 2P', 'Não informado', 0),
  ('JEEP', 'WRANGLER SPORT 3.6 V6 284CV 2P', 'Não informado', 0),
  ('JEEP', 'WRANGLER SPORT 3.8 V6 199CV', 'Não informado', 0),
  ('JEEP', 'WRANGLER UNLIMITED 75 ANOS 3.6 V6 284CV', 'Não informado', 0),
  ('JEEP', 'WRANGLER UNLIMITED SAHARA 3.8 V6 4P', 'Não informado', 0),
  ('JEEP', 'WRANGLER UNLIMITED SPORT 3.6 V6 284CV 4P', 'Não informado', 0),
  ('JEEP', 'WRANGLER UNLIMITED SPORT 3.8 V6 199CV', 'Não informado', 0),
  ('JIAPENG VOLCANO', 'JP 110', 'Não informado', 0),
  ('JIAPENG VOLCANO', 'JP 150', 'Não informado', 0),
  ('JINBEI', 'TOPIC ESCOLAR L 2.2 8V/ 2.0 16V 4P', 'Não informado', 0),
  ('JINBEI', 'TOPIC ESCOLAR SL 2.2 8V/ 2.0 16V 4P', 'Não informado', 0),
  ('JINBEI', 'TOPIC FURGAO L 2.2 8V/ 2.0 16V 4P', 'Não informado', 0),
  ('JINBEI', 'TOPIC VAN L 2.2 8V/ 2.0 16V 4P', 'Não informado', 0),
  ('JINBEI', 'TOPIC VAN LON./GRAN TOPIC SL', 'Não informado', 0),
  ('JINBEI', 'TOPIC VAN SL 2.2 8V/ 2.0 16V 4P', 'Não informado', 0),
  ('JINBEI', 'TOPIC VAN STD 2.0 16V 4P', 'Não informado', 0),
  ('JINBEI', 'VKN VAN 2.0 16V 4P', 'Não informado', 0),
  ('JOHNNYPAG', 'BARHOG 300CC', 'Não informado', 0),
  ('JOHNNYPAG', 'PROSTREET 300CC', 'Não informado', 0),
  ('JOHNNYPAG', 'SPYDER 300CC', 'Não informado', 0),
  ('JONNY', 'ATLANTIC 150CC', 'Não informado', 0),
  ('JONNY', 'ATLANTIC 250CC', 'Não informado', 0),
  ('JONNY', 'HYPE 110CC', 'Não informado', 0),
  ('JONNY', 'HYPE 125CC', 'Não informado', 0),
  ('JONNY', 'HYPE 50CC', 'Não informado', 0),
  ('JONNY', 'JONNY 50 49CC', 'Não informado', 0),
  ('JONNY', 'MEET 50CC', 'Não informado', 0),
  ('JONNY', 'NAKED 150CC', 'Não informado', 0),
  ('JONNY', 'ORBIT 150CC', 'Não informado', 0),
  ('JONNY', 'PEGASUS 150CC', 'Não informado', 0),
  ('JONNY', 'QUICK 150CC', 'Não informado', 0),
  ('JONNY', 'RACER 150CC', 'Não informado', 0),
  ('JONNY', 'TEXAS 150CC', 'Não informado', 0),
  ('JONNY', 'TR 150CC', 'Não informado', 0),
  ('JPX', 'JIPE MONTEZ 4X4 CD TETO DE LONA DIESEL', 'Não informado', 0),
  ('JPX', 'JIPE MONTEZ 4X4 CD TETO RÍGIDO DIESEL', 'Não informado', 0),
  ('JPX', 'JIPE MONTEZ STD 4X4 TETO DE LONA DIESEL', 'Não informado', 0),
  ('JPX', 'JIPE MONTEZ STD 4X4 TETO RÍGIDO DIESEL', 'Não informado', 0),
  ('JPX', 'PICAPE MONTEZ 1.9 4X4 DIESEL', 'Não informado', 0),
  ('KAHENA', '125 K-TOP', 'Não informado', 0),
  ('KAHENA', '125 TOP', 'Não informado', 0),
  ('KAHENA', '250 DUAL', 'Não informado', 0),
  ('KAHENA', '250 DUAL-T', 'Não informado', 0),
  ('KASINSKI', 'COMET 150', 'Não informado', 0),
  ('KASINSKI', 'COMET 250CC / COMET GT 250CC', 'Não informado', 0),
  ('KASINSKI', 'COMET GT 650', 'Não informado', 0),
  ('KASINSKI', 'COMET GT 650R V2POWER', 'Não informado', 0),
  ('KASINSKI', 'COMET GT-R 250CC', 'Não informado', 0),
  ('KASINSKI', 'CRUISE 125', 'Não informado', 0),
  ('KASINSKI', 'CRUISE II 125', 'Não informado', 0),
  ('KASINSKI', 'CRZ 150', 'Não informado', 0),
  ('KASINSKI', 'CRZ 150 SUPER MOTO', 'Não informado', 0),
  ('KASINSKI', 'ERO PLUS 125CC', 'Não informado', 0),
  ('KASINSKI', 'FLASH K 150CC', 'Não informado', 0),
  ('KASINSKI', 'FÚRIA 250CC', 'Não informado', 0),
  ('KASINSKI', 'GF 125 SPEED', 'Não informado', 0),
  ('KASINSKI', 'GV 250 MIRAGE', 'Não informado', 0),
  ('KASINSKI', 'MAGIK 125CC', 'Não informado', 0),
  ('KASINSKI', 'MIDAS FX 110CC', 'Não informado', 0),
  ('KASINSKI', 'MIRAGE 150', 'Não informado', 0),
  ('KASINSKI', 'MIRAGE 650 V2POWER', 'Não informado', 0),
  ('KASINSKI', 'MOTOKAR FURGÃO/ PICK-UP 174CC (1 PESSOA)', 'Não informado', 0),
  ('KASINSKI', 'MOTOKAR TAXI-KAR 174CC (4 PESSOAS)', 'Não informado', 0),
  ('KASINSKI', 'PRIMA 150', 'Não informado', 0),
  ('KASINSKI', 'PRIMA 50', 'Não informado', 0),
  ('KASINSKI', 'PRIMA ELECTRA 2000W (ELÉTRICA)', 'Não informado', 0),
  ('KASINSKI', 'PRIMA RALLY 50CC', 'Não informado', 0),
  ('KASINSKI', 'RX 125', 'Não informado', 0),
  ('KASINSKI', 'SETA 125', 'Não informado', 0),
  ('KASINSKI', 'SETA 150', 'Não informado', 0),
  ('KASINSKI', 'SOFT 50CC', 'Não informado', 0),
  ('KASINSKI', 'SUPER CAB 100CC', 'Não informado', 0),
  ('KASINSKI', 'SUPER CAB 50CC', 'Não informado', 0),
  ('KASINSKI', 'TN 125', 'Não informado', 0),
  ('KASINSKI', 'WAY 125', 'Não informado', 0),
  ('KASINSKI', 'WIN 110', 'Não informado', 0),
  ('KASINSKI', 'WIN ELECTRA 1000W (ELÉTRICA)', 'Não informado', 0),
  ('KAWASAKI', 'AVAJET 100CC/ CLASSIC 100CC', 'Não informado', 0),
  ('KAWASAKI', 'CONCOURS14 1352CC', 'Não informado', 0),
  ('KAWASAKI', 'D-TRACKER X 250CC', 'Não informado', 0),
  ('KAWASAKI', 'ER-5 500CC', 'Não informado', 0),
  ('KAWASAKI', 'ER-6N 650CC', 'Não informado', 0),
  ('KAWASAKI', 'KLX 110', 'Não informado', 0),
  ('KAWASAKI', 'KLX 110 MONSTER', 'Não informado', 0),
  ('KAWASAKI', 'KLX 250', 'Não informado', 0),
  ('KAWASAKI', 'KLX 450R', 'Não informado', 0),
  ('KAWASAKI', 'KLX 650', 'Não informado', 0),
  ('KAWASAKI', 'KX 125', 'Não informado', 0),
  ('KAWASAKI', 'KX 250/ 250 F', 'Não informado', 0),
  ('KAWASAKI', 'KX 450 F', 'Não informado', 0),
  ('KAWASAKI', 'KX 65', 'Não informado', 0),
  ('KAWASAKI', 'KX 65 MONSTER', 'Não informado', 0),
  ('KAWASAKI', 'KZ 1000 TOURING', 'Não informado', 0),
  ('KAWASAKI', 'MAXI II 100CC', 'Não informado', 0),
  ('KAWASAKI', 'NINJA 1000', 'Não informado', 0),
  ('KAWASAKI', 'NINJA 1000 TOURER', 'Não informado', 0),
  ('KAWASAKI', 'NINJA 250R', 'Não informado', 0),
  ('KAWASAKI', 'NINJA 300', 'Não informado', 0),
  ('KAWASAKI', 'NINJA 400', 'Não informado', 0),
  ('KAWASAKI', 'NINJA 650R 649CC', 'Não informado', 0),
  ('KAWASAKI', 'NINJA EX 500CC', 'Não informado', 0),
  ('KAWASAKI', 'NINJA H2 998CC', 'Não informado', 0),
  ('KAWASAKI', 'NINJA ZX-10/ ZX-10R 1000CC', 'Não informado', 0),
  ('KAWASAKI', 'NINJA ZX-10RR 998CC', 'Não informado', 0),
  ('KAWASAKI', 'NINJA ZX-11 1100CC', 'Não informado', 0),
  ('KAWASAKI', 'NINJA ZX-12/ ZX-12R 1200CC', 'Não informado', 0),
  ('KAWASAKI', 'NINJA ZX-6 600CC', 'Não informado', 0),
  ('KAWASAKI', 'NINJA ZX-6R 600CC', 'Não informado', 0),
  ('KAWASAKI', 'NINJA ZX-6R 636CC', 'Não informado', 0),
  ('KAWASAKI', 'NINJA ZX-7 750CC', 'Não informado', 0),
  ('KAWASAKI', 'NINJA ZX-9R 900CC', 'Não informado', 0),
  ('KAWASAKI', 'NINJA ZZ-R 1100CC', 'Não informado', 0),
  ('KAWASAKI', 'VERSYS 1000', 'Não informado', 0),
  ('KAWASAKI', 'VERSYS 1000 GRAND TOURER', 'Não informado', 0),
  ('KAWASAKI', 'VERSYS 650CC', 'Não informado', 0),
  ('KAWASAKI', 'VERSYS CITY 650', 'Não informado', 0),
  ('KAWASAKI', 'VERSYS TOURER 650', 'Não informado', 0),
  ('KAWASAKI', 'VERSYS-X 300', 'Não informado', 0),
  ('KAWASAKI', 'VERSYS-X 300 TOURER', 'Não informado', 0),
  ('KAWASAKI', 'VOYAGER 1200CC', 'Não informado', 0),
  ('KAWASAKI', 'VULCAN 800 CLASSIC', 'Não informado', 0),
  ('KAWASAKI', 'VULCAN 900 CLASSIC LT', 'Não informado', 0),
  ('KAWASAKI', 'VULCAN 900 CUSTOM', 'Não informado', 0),
  ('KAWASAKI', 'VULCAN EN 500 LTD', 'Não informado', 0),
  ('KAWASAKI', 'VULCAN EN 500CC', 'Não informado', 0),
  ('KAWASAKI', 'VULCAN LTD CLASS 500CC', 'Não informado', 0),
  ('KAWASAKI', 'VULCAN NOMAD 1500CC', 'Não informado', 0),
  ('KAWASAKI', 'VULCAN S 650', 'Não informado', 0),
  ('KAWASAKI', 'VULCAN S 650 CAFÉ', 'Não informado', 0),
  ('KAWASAKI', 'VULCAN S 650 SPECIAL EDITION', 'Não informado', 0),
  ('KAWASAKI', 'VULCAN VN 1500 CLASSIC/ MEAN STREAK', 'Não informado', 0),
  ('KAWASAKI', 'VULCAN VN 1500CC', 'Não informado', 0),
  ('KAWASAKI', 'VULCAN VN 1600 MEAN STREAK', 'Não informado', 0),
  ('KAWASAKI', 'VULCAN VN 2000', 'Não informado', 0),
  ('KAWASAKI', 'VULCAN VN 750CC', 'Não informado', 0),
  ('KAWASAKI', 'VULCAN VN 800CC', 'Não informado', 0),
  ('KAWASAKI', 'VULCAN VN 900 CLASSIC', 'Não informado', 0),
  ('KAWASAKI', 'Z 1000', 'Não informado', 0),
  ('KAWASAKI', 'Z 1000 R EDITION', 'Não informado', 0),
  ('KAWASAKI', 'Z 300', 'Não informado', 0),
  ('KAWASAKI', 'Z 400', 'MOTOCICLETA', 0),
  ('KAWASAKI', 'Z 650', 'Não informado', 0),
  ('KAWASAKI', 'Z 750', 'Não informado', 0),
  ('KAWASAKI', 'Z 900', 'Não informado', 0),
  ('KAWASAKI', 'Z-800', 'Não informado', 0),
  ('KAWASAKI', 'ZX-14/ZX 14R 1352CC', 'Não informado', 0),
  ('KAWASAKI', 'ZZR 1200', 'Não informado', 0),
  ('KIA MOTORS', 'BESTA EST 2.7 DIESEL (10/12LUG.)', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'BESTA EST FULL 2.7 DIESEL (10/12LUG.)', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'BESTA FURGÃO 2.2 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'BESTA FURGÃO 2.7 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'BESTA FURGÃO GRAND 3.0 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'BESTA GS 2.7 8V 12L DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'BESTA GS FULL 2.7 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'BESTA GS GRAND 3.0 8V 16L DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'BESTA ST 2.2 DIESEL (12LUG.)', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'BONGO K-2400 2.4 DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'BONGO K-2500 2.5 4X2 TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'BONGO K-2700 2.7 4X2/4X4 DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'BONGO K-2700 2.7 4X4 BASCULANTE DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'BONGO K-2700 2.7 4X4 CD DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'BONGO K-3500/K-3600/110 3.6 DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'CADENZA EX 3.5 V6 24V 290CV AUT.', 'Não informado', 0),
  ('KIA MOTORS', 'CARENS EX 2.0 16V AUT', 'Não informado', 0),
  ('KIA MOTORS', 'CARENS LS 1.8 16V 130CV AUT.', 'Não informado', 0),
  ('KIA MOTORS', 'CARENS LS 1.8 16V 130CV MEC.', 'Não informado', 0),
  ('KIA MOTORS', 'CARNIVAL 2.5 V6', 'Não informado', 0),
  ('KIA MOTORS', 'CARNIVAL EX 3.5 V6 24V 276CV AUT.', 'Não informado', 0),
  ('KIA MOTORS', 'CARNIVAL EX 3.8 V6 24V 242CV AUT.', 'Não informado', 0),
  ('KIA MOTORS', 'CARNIVAL GS 2.9 TDI 16V 125CV DIESEL', 'Não informado', 0),
  ('KIA MOTORS', 'CERATO 1.6 16V AUT.1.6 16VAUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('KIA MOTORS', 'CERATO 1.6 16V FLEX AUT.1.6 16V FLEXAUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('KIA MOTORS', 'CERATO 1.6 16V FLEX MEC.1.6 16V FLEXMANUAL', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('KIA MOTORS', 'CERATO 1.6 16V MEC.1.6 16VMANUAL', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('KIA MOTORS', 'CERATO 2.0 16V AUT.2.0 16VAUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('KIA MOTORS', 'CERATO EX 2.0 16V FLEX AUT.2.0 16V FLEXAUTOMáTICAEX', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('KIA MOTORS', 'CERATO KOUP 2.0 16V AUT.2.0 16VAUTOMáTICAKOUP', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('KIA MOTORS', 'CERATO SX 2.0 16V FLEX AUT.2.0 16V FLEXAUTOMáTICASX', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('KIA MOTORS', 'CERES PICK-UP 2.2 DIESEL', 'Não informado', 0),
  ('KIA MOTORS', 'CLARUS GLX 2.0 16V AUT.', 'Não informado', 0),
  ('KIA MOTORS', 'CLARUS GLX 2.0 16V MEC', 'Não informado', 0),
  ('KIA MOTORS', 'CLARUS WAGON GLX 2.0 16V AUT.', 'Não informado', 0),
  ('KIA MOTORS', 'CLARUS WAGON GLX 2.0 16V MEC.', 'Não informado', 0),
  ('KIA MOTORS', 'GRAND CARNIVAL EX 3.3 V6 24V 270CV AUT.', 'Não informado', 0),
  ('KIA MOTORS', 'MAGENTIS EX 2.0 16V AUT.', 'Não informado', 0),
  ('KIA MOTORS', 'MAGENTIS LX 2.0 16V AUT', 'Não informado', 0),
  ('KIA MOTORS', 'MOHAVE EX 3.0 V6 24V 256CV TB DIES. AUT.', 'Não informado', 0),
  ('KIA MOTORS', 'MOHAVE EX 3.8 V6 24V 275CV 4X4 AUT.', 'Não informado', 0),
  ('KIA MOTORS', 'MOHAVE EX 4.6 V8 32V 340CV 4X4 AUT.', 'Não informado', 0),
  ('KIA MOTORS', 'OPIRUS GL 3.5 V6 24V 202CV AUT.', 'Não informado', 0),
  ('KIA MOTORS', 'OPIRUS GL 3.8 V6 24V 267CV AUT.', 'Não informado', 0),
  ('KIA MOTORS', 'OPTIMA 2.0 16V 165CV AUT.', 'Não informado', 0),
  ('KIA MOTORS', 'OPTIMA 2.4 16V 180CV AUT.', 'Não informado', 0),
  ('KIA MOTORS', 'PICANTO EX 1.1/ 1.0/ 1.0 FLEX AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('KIA MOTORS', 'PICANTO EX 1.1/ 1.0/ 1.0 FLEX MEC', 'V5 AUTOMOVEL COMUM', 0),
  ('KIA MOTORS', 'PICANTO GT 1.0 12V FLEX AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('KIA MOTORS', 'QUORIS EX 3.8 V6 24V 294CV AUT.', 'Não informado', 0),
  ('KIA MOTORS', 'SEPHIA GTX 1.5 16V', 'Não informado', 0),
  ('KIA MOTORS', 'SEPHIA GTX 1.6', 'Não informado', 0),
  ('KIA MOTORS', 'SEPHIA LS 1.5 16V AUT.', 'Não informado', 0),
  ('KIA MOTORS', 'SEPHIA LS 1.5 16V MEC.', 'Não informado', 0),
  ('KIA MOTORS', 'SEPHIA SLX', 'Não informado', 0),
  ('KIA MOTORS', 'SHUMA LS 1.5 16V AUT.', 'Não informado', 0),
  ('KIA MOTORS', 'SHUMA LS 1.5 16V MEC.', 'Não informado', 0),
  ('KIA MOTORS', 'SORENTO 2.4 16V 4X2 AUT.2.4 16VAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SORENTO 2.4 16V 4X4 AUT.2.4 16VAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SORENTO 3.3 V6 24V 270CV 4X2 AUT.3.3 V6 24VAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SORENTO 3.5 V6 24V 4X2 AUT.3.5 V6 24VAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SORENTO 3.5 V6 24V 4X4 AUT.3.5 V6 24VAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SORENTO EX 2 2.4', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SORENTO EX 2.5 140/170CV 4X4 AUT.DIESEL2.5 DIESELAUTOMáTICAEX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SORENTO EX 2.5 16V 4X4 MEC. DIESEL2.5 DIESELMANUALEX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SORENTO EX 3.5 V6 24V 197CV 4X4 AUT.3.5 V6 24VAUTOMáTICAEX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SORENTO EX 3.8 V6 24V 267CV 4X4 AUT.3.8 V6 24VAUTOMáTICAEX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SORENTO LX 2.5 16V 140CV 4X4 AUT. DIESEL2.5 DIESELAUTOMáTICALX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SORENTO LX 2.5 16V 140CV 4X4 MEC. DIESEL2.5 DIESELMANUALLX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SOUL 1.6/ 1.6 16V FLEX AUT.1.6 16V FLEXAUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('KIA MOTORS', 'SOUL 1.6/ 1.6 16V FLEX MEC.1.6 16V FLEXMANUAL', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('KIA MOTORS', 'SPORTAGE 2.0 16V AUT.2.0 16VAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SPORTAGE 2.0 8V TB-IC DIESEL2.0 8V DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SPORTAGE DLX 2.0 16V AUT.2.0 16VAUTOMáTICADLX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SPORTAGE DLX 2.0 16V MEC.2.0 16VMANUALDLX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SPORTAGE DLX 2.2 DIESEL MEC2.2 DIESELMANUALDLX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SPORTAGE EX 1.6 T-GDI (HíBRIDO)1.6 T-GDI-EX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SPORTAGE EX 2.0 16V MEC.2.0 16VMANUALEX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SPORTAGE EX 2.0 16V/ 2.0 16V FLEX AUT.2.0 16V/2.0 16VAUTOMáTICAEX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SPORTAGE EX 2.7 V6 4X4 AUT.2.7 V6AUTOMáTICAEX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SPORTAGE EXP P. 1.6 T-GDI (HíBRIDO)1.6 T-GDI-EXP P.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SPORTAGE GRAND 2.0 16V AUT.2.0 16VAUTOMáTICAGRAND', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SPORTAGE GRAND 2.0 16V MEC.2.0 16VMANUALGRAND', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SPORTAGE GRAND 2.0 8V TB-IC DIESEL2.0 8V DIESEL-GRAND', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SPORTAGE GTE 2.2 4X4 DIESEL2.2 DIESEL-GTE', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SPORTAGE LX 2.0 16V 142CV 5P2.0 16V-LX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SPORTAGE LX 2.0 16V/ 2.0 16V FLEX AUT.2.0 16V/2.0 16VAUTOMáTICALX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SPORTAGE LX 2.0 16V/ 2.0 16V FLEX MEC.2.0 16V/2.0 16VMANUALLX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'SPORTAGE TARGA 2.0 16V2.0 16V-TARGA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('KIA MOTORS', 'STONIC SX 1.0 MHEV TB AUT.', 'Não informado', 0),
  ('KIMCO', 'DJW 50 50CC', 'Não informado', 0),
  ('KIMCO', 'M´BOY 90CC', 'Não informado', 0),
  ('KIMCO', 'PEOPLE 50', 'Não informado', 0),
  ('KIMCO', 'ZING 150', 'Não informado', 0),
  ('KRONE', 'R / KRONE', 'Não informado', 0),
  ('KRONE', 'R / KRONE CA123 CG27', 'Não informado', 0),
  ('KRONE', 'SR / KRONE CA123 CG27', 'Não informado', 0),
  ('KRONE', 'SR / KRONE CA71 ATT', 'Não informado', 0),
  ('KRONE', 'SR / KRONE CA98 ATD', 'Não informado', 0),
  ('KROVILLE', 'SR / KROVILLE PPCA 3E', 'Não informado', 0),
  ('KTM', '1190 RC8', 'Não informado', 0),
  ('KTM', '1190 RC8 R', 'Não informado', 0),
  ('KTM', '690 ENDURO / ENDURO R', 'Não informado', 0),
  ('KTM', 'ADVENTURE 1190 R', 'Não informado', 0),
  ('KTM', 'ADVENTURE 1190CC', 'Não informado', 0),
  ('KTM', 'ADVENTURE 640 ST', 'Não informado', 0),
  ('KTM', 'ADVENTURE 950CC', 'Não informado', 0),
  ('KTM', 'ADVENTURE 990CC', 'Não informado', 0),
  ('KTM', 'ADVENTURE R / DAKAR 990CC', 'Não informado', 0),
  ('KTM', 'DUKE 200', 'Não informado', 0),
  ('KTM', 'DUKE 390', 'Não informado', 0),
  ('KTM', 'DUKE 640/ DUKE II 640', 'Não informado', 0),
  ('KTM', 'DUKE 690', 'Não informado', 0),
  ('KTM', 'EXC 125', 'Não informado', 0),
  ('KTM', 'EXC 200', 'Não informado', 0),
  ('KTM', 'EXC 250', 'Não informado', 0),
  ('KTM', 'EXC 300', 'Não informado', 0),
  ('KTM', 'EXC 380', 'Não informado', 0),
  ('KTM', 'EXC 400', 'Não informado', 0),
  ('KTM', 'EXC 450', 'Não informado', 0),
  ('KTM', 'EXC 520', 'Não informado', 0),
  ('KTM', 'EXC 525', 'Não informado', 0),
  ('KTM', 'EXC-F 250', 'Não informado', 0),
  ('KTM', 'EXC-F 250 SIX DAYS', 'Não informado', 0),
  ('KTM', 'EXC-F 300 SIX DAYS', 'Não informado', 0),
  ('KTM', 'EXC-F 350', 'Não informado', 0),
  ('KTM', 'LC4 640 TRAIL', 'Não informado', 0),
  ('KTM', 'SC 620', 'Não informado', 0),
  ('KTM', 'SUPER ADVENTURE 1290', 'Não informado', 0),
  ('KTM', 'SUPER ADVENTURE 1290 R', 'Não informado', 0),
  ('KTM', 'SUPER ADVENTURE 1290 S', 'Não informado', 0),
  ('KTM', 'SUPERDUKE 1290 R', 'Não informado', 0),
  ('KTM', 'SUPERDUKE 990', 'Não informado', 0),
  ('KTM', 'SUPERMOTO 690', 'Não informado', 0),
  ('KTM', 'SUPERMOTO 990 R', 'Não informado', 0),
  ('KTM', 'SUPERMOTO 990 T', 'Não informado', 0),
  ('KTM', 'SX 125', 'Não informado', 0),
  ('KTM', 'SX 250/ SX 250 F', 'Não informado', 0),
  ('KTM', 'SX 350 / 350 F', 'Não informado', 0),
  ('KTM', 'SX 450/ SX 450F', 'Não informado', 0),
  ('KTM', 'SX 50', 'Não informado', 0),
  ('KTM', 'SX 65', 'Não informado', 0),
  ('KTM', 'SX 85', 'Não informado', 0),
  ('KTM', 'SXC 520/ 540', 'Não informado', 0),
  ('KTM', 'SXC 625', 'Não informado', 0),
  ('KYMCO', 'DOWNTOWN 300I', 'Não informado', 0),
  ('KYMCO', 'PEOPLE GT 300I', 'Não informado', 0),
  ('LADA', 'LAIKA 1.5', 'Não informado', 0),
  ('LADA', 'LAIKA 1.6', 'Não informado', 0),
  ('LADA', 'LAIKA SW 5P', 'Não informado', 0),
  ('LADA', 'NIVA 1.6 RC/ PANTANAL 4X4', 'Não informado', 0),
  ('LADA', 'NIVA 1.6/ CD 4X4', 'Não informado', 0),
  ('LADA', 'NIVA 1.7I 4X4', 'Não informado', 0),
  ('LADA', 'SAMARA 1.3/ 1.5', 'Não informado', 0),
  ('LAMBORGHINI', 'AVENTADOR LP 700-4', 'Não informado', 0),
  ('LAMBORGHINI', 'AVENTADOR LP 700-4 ROADSTER', 'Não informado', 0),
  ('LAMBORGHINI', 'AVENTADOR S LP 740-4', 'Não informado', 0),
  ('LAMBORGHINI', 'GALLARDO COUPE LP550-2 BICOLORE', 'Não informado', 0),
  ('LAMBORGHINI', 'GALLARDO COUPE LP560-4', 'Não informado', 0),
  ('LAMBORGHINI', 'GALLARDO COUPE LP570-4 SUP.TROF.STRADALE', 'Não informado', 0),
  ('LAMBORGHINI', 'GALLARDO COUPE SUPERLEGGERA LP570-4', 'Não informado', 0),
  ('LAMBORGHINI', 'GALLARDO COUPE VALENTINO BALBONI LP550-2', 'Não informado', 0),
  ('LAMBORGHINI', 'GALLARDO SPIDER LP560-4', 'Não informado', 0),
  ('LAMBORGHINI', 'GALLARDO SPYDER PERFORMANTE LP570-4', 'Não informado', 0),
  ('LAMBORGHINI', 'HURACAN COUPE LP 610-4', 'Não informado', 0),
  ('LAMBORGHINI', 'HURACAN COUPE RWD LP 580-2', 'Não informado', 0),
  ('LAMBORGHINI', 'HURACAN SPYDER LP 610-4', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 110 2.4 122CV T.DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 110 2.5 HCPU TDI CS DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 110 2.5 TDI COUNTY PERS. DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 110 2.5 TDI HARD TOP DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 110 2.5 TDI HIGH CAPACITY DIES.', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 110 2.5 TDI PERSONEL DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 110 LE FIRE & ICE 2.4 T. DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 110 RAW 2.4 122CV T. DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 110 SVX LIM.EDIT. 2.4 T.DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 110 TD5 2.5 4X4 DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 110 TDI COUNTY SW DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 110 TDI SW DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 130 CHASSIS CD DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 130 HIGH CAP DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 130 TDI CD DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 90 2.4 122CV T.DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 90 2.5 TDI CS DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 90 LE FIRE & ICE 2.4 T. DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 90 RAW 2.4 122CV T.DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 90 SOFT TOP DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 90 SVX LIM.EDIT. 2.4 T.DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 90 TDI CSW DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 90 TDI HARD TOP DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DEFENDER 90 TDI SW DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY ES 3.9 V8', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY ES 4.0 V8 AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY ES TD5 2.5 4X4 4P DIESEL AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY ES TD5 2.5 4X4 4P DIESEL MEC.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY FIRST ED. 3.0 TD6 4X4 DIE. AUT', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY HSE 3.0 V6 4X4 TD6 DIESEL AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY HSE LUX. 3.0 TD6 4X4 DIE. AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY RAW 3.0 4X4 TDV6 DIESEL AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY SE 3.0 V6 4X4 TD6  DIESEL AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY SPORT BLACK 2.2 4X4 DIES. AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY SPORT HSE 2.0 4X4 AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY SPORT HSE 2.0 4X4 DIESEL AUT', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY SPORT HSE 2.2 4X4 DIESEL AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY SPORT HSE L. 2.0 4X4 DIE. AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY SPORT HSE L. 2.2 4X4 DIE. AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY SPORT HSE LUXURY 2.0 4X4 AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY SPORT SE 2.0 4X4 AUT.', 'ESPECIAL V15 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('LAND ROVER', 'DISCOVERY SPORT SE 2.0 4X4 DIESEL AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY SPORT SE 2.2 4X4 DIESEL AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY TDI 2.5 DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY3 HSE 2.7 4X4 TDI DIESEL AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY3 HSE 4.4 V8 4X4 299CV AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY3 S 2.7 4X4 TDI DIESEL AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY3 S 4.0 V6 4X4 215CV AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY3 SE 2.7 4X4 TDI DIESEL AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY3 SE 4.0 V6 4X4 215CV AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY4 B&W 3.0 4X4 TDV6 DIESEL AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY4 BLACK 3.0 4X4 SDV6 DIES. AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY4 GRAPHITE 3.0 4X4 SDV6 DIE.AUT', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY4 HSE 2.7 4X4 TDV6 DIESEL AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY4 HSE 3.0 4X4 TDV6/SDV6 DIE.AUT', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY4 HSE 5.0 4X4 AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY4 S 2.7 4X4 TDV6 DIESEL AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY4 S 3.0 4X4 TDV6/SDV6 DIE. AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY4 SE 2.7 4X4 TDV6 DIESEL AUT.', 'Não informado', 0),
  ('LAND ROVER', 'DISCOVERY4 SE 3.0 4X4 TDV6/SDV6 DIE.AUT.', 'Não informado', 0),
  ('LAND ROVER', 'FREELANDER 1.8 16V', 'Não informado', 0),
  ('LAND ROVER', 'FREELANDER HSE 2.5 V6 24V 177CV 5P', 'Não informado', 0),
  ('LAND ROVER', 'FREELANDER HSE3 2.5 V6 24V 177CV 3P', 'Não informado', 0),
  ('LAND ROVER', 'FREELANDER S/ SE 2.5 V6 24V 177CV 5P', 'Não informado', 0),
  ('LAND ROVER', 'FREELANDER SE3 2.5 V6 24V 177CV 3P', 'Não informado', 0),
  ('LAND ROVER', 'FREELANDER2 DYNAMIQUE 2.2 SD4 T. DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'FREELANDER2 HSE 2.2 SD4 190CV T.DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'FREELANDER2 I6 HSE 3.2 232CV AUT. 5P', 'Não informado', 0),
  ('LAND ROVER', 'FREELANDER2 I6 LE SPORT 3.2 232CV AUT. 5', 'Não informado', 0),
  ('LAND ROVER', 'FREELANDER2 I6 S 3.2 232CV AUT. 5P', 'Não informado', 0),
  ('LAND ROVER', 'FREELANDER2 I6 S SPORT 3.2 232CV AUT. 5P', 'Não informado', 0),
  ('LAND ROVER', 'FREELANDER2 I6 SE 3.2 232CV AUT. 5P', 'Não informado', 0),
  ('LAND ROVER', 'FREELANDER2 S 2.2 SD4 190CV T.DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'FREELANDER2 SE 2.2 SD4 190CV T.DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'FREELANDER2 SI4 DYN. 2.0 240CV AUT. 5P', 'Não informado', 0),
  ('LAND ROVER', 'FREELANDER2 SI4 HSE 2.0 240CV AUT. 5P', 'Não informado', 0),
  ('LAND ROVER', 'FREELANDER2 SI4 S 2.0 240CV AUT. 5P', 'Não informado', 0),
  ('LAND ROVER', 'FREELANDER2 SI4 SE 2.0 240CV AUT. 5P', 'Não informado', 0),
  ('LAND ROVER', 'NEW RANGE/RANGE ROVER VOGUE 3.9 V8', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. EVO DYNAMIQUE BLACK 2.0 AUT. 5P', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. EVO STYLE 2.0 AUT. 5P', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. EVOQUE LONDON 2.0 240CV AUT. 5P', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. EVOQUE ONE SICILIAN 2.0 AUT. 5P', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. EVOQUE SD4 HSE 2.2 DIES. AUT.5P', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. EVOQUE SD4 SE 2.2 DIES. AUT. 4P', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. EVOQUE SI4 HSE DYNAMIC 2.0 AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. EVOQUE SI4 SE 2.0 AUT. 4P', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. EVOQUE SI4 SE DYNAMIC 2.0 AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. SPORT AUTOB. 3.0 SDV6 DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. SPORT AUTOB. DYN.SCHA. 5.0 V8', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. SPORT AUTOB. SUPERCHAR. 5.0 V8', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. SPORT HSE DYNAMIC SUPERC.5.0 V8', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. SPORT HSE SUPERCHARGED 3.0 V6', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. SPORT HST SUPERCHARGED 3.0 V6', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. SPORT L. EDIT. SCHARGED 3.0 V6', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. SVAUTOBIOGRAPHY SUPERC. 5.0 V8', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VELAR 2.0 4X4 TB 250CV AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VELAR 3.0 4X4 V6 380CV AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VELAR FIRST ED. 3.0 4X4 V6 AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VELAR HSE 2.0 4X4 TB 250CV AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VELAR HSE 3.0 4X4 V6 380CV AUT', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VELAR R-DYN. 2.0 4X4 TB AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VELAR R-DYN. 3.0 4X4 V6 AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VELAR R-DYN. HSE 2.0 4X4 TB AUT', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VELAR R-DYN. HSE 3.0 4X4 V6 AUT', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VELAR R-DYN. S 2.0 4X4 TB AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VELAR R-DYN. S 3.0 4X4 V6 AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VELAR R-DYN. SE 2.0 4X4 TB AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VELAR R-DYN. SE 3.0 4X4 V6 AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VELAR S 2.0 4X4 TB 250CV AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VELAR S 3.0 4X4 V6 380CV AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VELAR SE 2.0 4X4 TB 250CV AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VELAR SE 3.0 4X4 V6 380CV AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VOGUE 4.4 TDV8/SDV8 DIESEL AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R. VOGUE AUTOB. SUPERCHAR. 5.0 V8', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R.EVOQ. HSE DYN. CONVERS 2.0 AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R.EVOQUE DYNAMIC 2.0 AUT 3P', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R.EVOQUE DYNAMIC 2.0 AUT 5P', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R.EVOQUE DYNAMIC TECH 2.0 AUT 3P', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R.EVOQUE DYNAMIC TECH 2.0 AUT 5P', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R.EVOQUE HSE DYNA. 2.0 DIES. AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R.EVOQUE PRESTIGE 2.0 AUT. 5P', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R.EVOQUE PRESTIGE 2.2 5P DIES.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R.EVOQUE PRESTIGE TECH 2.0 AUT 5P', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R.EVOQUE PRESTIGETECH 2.2 5P DIES.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R.EVOQUE PURE 2.0 AUT. 3P', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R.EVOQUE PURE 2.0 AUT. 5P', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R.SPORT HSE DYNAMIC 4.4 SDV8 DIES.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE R.SPORT SE 3.0 4X4 TDV6/SDV6 DIES.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER EVOQUE PURE TECH 2.0 AUT. 3P', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER EVOQUE PURE TECH 2.0 AUT. 5P', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER EVOQUE SE 2.0 DIESEL AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER EVOQUE ZANZIBAR 2.0 AUT. 5P', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER HSE 4.4/ 4.6', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER SPORT 3.6 TDV8 272CV DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER SPORT HSE 2.7 190CV TB DIES.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER SPORT HSE 3.0 SDV6 DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER SPORT HSE 4.4 V8 32V 295CV', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER SPORT HSE SUPERCHAR. 5.0 V8', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER SPORT SE 2.7 190CV TB DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER SPORT SE 3.6 TDV8 272CV DIES', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER SPORT SE 4.4 V8 32V 299CV', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER SPORT SE SUPERCH. 3.0  AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER SPORT SUPERCHAGED 4.2 V8', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER SPORT SVR SUPERCHAGED 5.0 V8', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER SUPERCHAGED 4.2 V8 396CV', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER VOGUE 3.0 TDV6 DIESEL AUT.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER VOGUE 3.6 TDV8 272CV DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER VOGUE 4.4 AUTO. SDV8 DIESEL.', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER VOGUE HSE 3.0 TDV6 DIESEL', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER VOGUE SE 4.4 SDV8 DIES. AUT', 'Não informado', 0),
  ('LAND ROVER', 'RANGE ROVER VOGUE SE SUPERCHAR. 5.0 V8', 'Não informado', 0),
  ('LAND ROVER', 'RANGER R. SPORT TECH S 3.0 SDV6 DIESEL', 'Não informado', 0),
  ('LANDUM', 'MOTO TRUCK LD 150 ZH', 'Não informado', 0),
  ('LAQUILA', 'AKROS 50', 'Não informado', 0),
  ('LAQUILA', 'AKROS 90', 'Não informado', 0),
  ('LAQUILA', 'ERGON 50', 'Não informado', 0),
  ('LAQUILA', 'NIX 50', 'Não informado', 0),
  ('LAQUILA', 'PALIO 50', 'Não informado', 0),
  ('LAVRALE', 'QUATTOR 30.0 190CC', 'Não informado', 0),
  ('LERIVO', 'FORMIGÃO FURGÃO 200CC', 'Não informado', 0),
  ('LERIVO', 'FORMIGÃO PICK-UP 200CC', 'Não informado', 0),
  ('LEXUS', 'CT200H 1.8 16V HIBRID AUT.', 'Não informado', 0),
  ('LEXUS', 'CT200H F-SPORT 1.8 16V HIBRID AUT.', 'Não informado', 0),
  ('LEXUS', 'ES-300 3.0', 'Não informado', 0),
  ('LEXUS', 'ES-330 3.3 24V 228CV', 'Não informado', 0),
  ('LEXUS', 'ES-350 3.5 24V 284CV', 'Não informado', 0),
  ('LEXUS', 'GS 300 3.0 V6 24V', 'Não informado', 0),
  ('LEXUS', 'IS-250 2.5 24V 208CV AUT.', 'Não informado', 0),
  ('LEXUS', 'IS-250 F SPORT 2.5 24V 208CV AUT.', 'Não informado', 0),
  ('LEXUS', 'IS-300 3.0 24V 231CV AUT.', 'Não informado', 0),
  ('LEXUS', 'LS 400 4.0', 'Não informado', 0),
  ('LEXUS', 'LS 430 4.3 32V 281CV', 'Não informado', 0),
  ('LEXUS', 'LS 460 4.6 32V 347CV', 'Não informado', 0),
  ('LEXUS', 'LS-460L 4.6 V8 32V 347CV AUT.', 'Não informado', 0),
  ('LEXUS', 'NX-200T F-SPORT 2.0 16V 238CV AUT.', 'Não informado', 0),
  ('LEXUS', 'NX-200T LUXURY 2.0 16V 238CV AUT.', 'Não informado', 0),
  ('LEXUS', 'NX-300 DYNAMIC 2.0 16V 238CV AUT.', 'Não informado', 0),
  ('LEXUS', 'NX-300 F-SPORT 2.0 16V 238CV AUT.', 'Não informado', 0),
  ('LEXUS', 'NX-300 LUXURY 2.0 16V 238CV AUT.', 'Não informado', 0),
  ('LEXUS', 'RX 300 3.0 V6 24V', 'Não informado', 0),
  ('LEXUS', 'RX-350 3.5 24V 277CV AUT.', 'Não informado', 0),
  ('LEXUS', 'RX-350 F-SPORT 3.5 24V 277CV AUT.', 'Não informado', 0),
  ('LEXUS', 'SC 400 4.0 V8', 'Não informado', 0),
  ('LIBRELATO', 'LIBRELATO SRCA 2E', 'Não informado', 0),
  ('LIBRELATO', 'R / LIBRELATO DLCBQRI2 2E', 'Não informado', 0),
  ('LIBRELATO', 'R / LIBRELATO RDL 2E', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO BACD 2E', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO BACT 2E', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO BTFAENCR 3E', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO BTLOENCR 3E', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO CA 3E', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO CABAENIC 3E', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO CACAENCR 3E', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO CACAENCR 3E SR CA', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO RCS 4E', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO SILO E', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO SRAC 3E', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO SRBA 3E', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO SRCA 3E', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO SRCC 3E', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO SRCD 2E', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO SRCF 3E', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO SRCS 3E', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO SRCT 2E', 'Não informado', 0),
  ('LIBRELATO', 'SR / LIBRELATO SRPR 2E', 'Não informado', 0),
  ('LIDER', 'R / LIDER SRCS', 'Não informado', 0),
  ('LIDER', 'SR / LIDER AB 3E', 'Não informado', 0),
  ('LIES', 'R / LIESS', 'Não informado', 0),
  ('LIES', 'R / LIESS TQ A 3 EIXOS', 'Não informado', 0),
  ('LIESS', 'SR / LIESS', 'Não informado', 0),
  ('LIFAN', '320 ELITE 1.3 16V 88CV 5P', 'ESPECIAL V10 AUTOMOVEL', 150),
  ('LIFAN', '530 1.5 16V 103CV 4P', 'Não informado', 0),
  ('LIFAN', '530 1.5 16V 103CV 4P1.5 16V103CV-4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('LIFAN', '530 TALENT 1.5 16V 103CV 4P1.5 16V103CV-4', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('LIFAN', '620 TALENT 1.6 16V 106CV 4P1.6 16V106CV-4P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('LIFAN', 'CARGO 200 ZH (TRICICLO CARGA)', 'Não informado', 0),
  ('LIFAN', 'FOISON 1.3 16V 85CV 2P1.3 16V85CV-2', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('LIFAN', 'LIFAN 530 15 VVT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('LIFAN', 'X60 1.8 16V 128CV 5P MEC.1.8 16V128CVMANUAL5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('LIFAN', 'X60 VIP 1.8 16V 128CV 5P AUT.1.8 16V128CVAUTOMáTICA5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('LIFAN', 'X80 VIP 2.0 TURBO 184CV 5P AUT.2.0 TURBO184CVAUTOMáTICA5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('LINSHALM', 'R / LINSHALM SRF 2ECL', 'Não informado', 0),
  ('LINSHALM', 'R / LINSHALM SRF 3ECL', 'Não informado', 0),
  ('LINSHALM', 'SR / LINSHALM BT2E CF', 'Não informado', 0),
  ('LINSHALM', 'SR / LINSHALM SRF3E CL', 'Não informado', 0),
  ('LOBINI', 'H1 1.8 20V TURBO 180CV 2P', 'Não informado', 0),
  ('LON-V', 'DE LUXE 152CC', 'Não informado', 0),
  ('LON-V', 'E RETRÔ 2000 WATTS (ELÉTRICA)', 'Não informado', 0),
  ('LON-V', 'LY 125T -5 RETRÔ', 'Não informado', 0),
  ('LON-V', 'LY 150T-5 RETRÔ', 'Não informado', 0),
  ('LON-V', 'LY 150T-6A CLASSIC', 'Não informado', 0),
  ('LON-V', 'LY 150T-7A RACER LIMITED EDITION', 'Não informado', 0),
  ('LOTUS', 'ELAN S-2 1.6 16V', 'Não informado', 0),
  ('LOTUS', 'ESPRIT S-4 2.2 16V', 'Não informado', 0),
  ('MAGRÃO TRICICLOS', 'MT7 CHOPPER 1.6 POP', 'Não informado', 0),
  ('MAGRÃO TRICICLOS', 'MT7 CHOPPER 1.6 STD.', 'Não informado', 0),
  ('MAGRÃO TRICICLOS', 'MT7 CHOPPER 1.6 TOP.', 'Não informado', 0),
  ('MAHINDRA', 'PIK-UP CD 2.2 4X2 (DIESEL) MEC.', 'Não informado', 0),
  ('MAHINDRA', 'PIK-UP CD 2.2 4X4 (DIESEL) MEC.', 'Não informado', 0),
  ('MAHINDRA', 'PIK-UP CS 2.2 4X2 (DIESEL) MEC.', 'Não informado', 0),
  ('MAHINDRA', 'PIK-UP CS 2.2 4X4 (DIESEL) MEC.', 'Não informado', 0),
  ('MAHINDRA', 'SCORPIO 2.6 CD TB DIESEL CRDE 4X4', 'Não informado', 0),
  ('MAHINDRA', 'SCORPIO 2.6 CS/ CHASSI TB DIES. CRDE 4X4', 'Não informado', 0),
  ('MAHINDRA', 'SCORPIO GLX SUV 2.6 TB DIESEL CRDE 4WD', 'Não informado', 0),
  ('MAHINDRA', 'SUV 2.2 4X4 (DIESEL) MEC.', 'Não informado', 0),
  ('MALAGUTI', 'CIAK MASTER 200', 'Não informado', 0),
  ('MALAGUTI', 'SPIDER MAXGT 500', 'Não informado', 0),
  ('MAN', '29440 6X4', 'CAMINHõES-LEVE-VANS', 0),
  ('MAN', 'TGX 28.440 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MAN', 'TGX 29.440 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MAN', 'TGX 29.480 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ( LOTAÇÃO E ESCOLAR W9) (DIESEL)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE (EXECUTIVO A5/V5) (DIESEL)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE (EXECUTIVO A6/V6) (DIESEL)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE (EXECUTIVO A8/V8) (DIESEL)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE (EXECUTIVO DW9) (DIESEL)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE (EXECUTIVO W8) (DIESEL)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE (EXECUTIVO W9) (DIESEL)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE (LOTAÇÃO E ESCOLAR A5/V5) (DIESEL', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE (LOTAÇÃO E ESCOLAR A6/V6) (DIESEL', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE (LOTAÇÃO E ESCOLAR A8/V8) (DIESEL', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE (LOTAÇÃO E ESCOLAR W8) (DIESEL)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE CINCO ESCOLAR (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE CINCO EXECUTIVO (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE CINCO EXECUTIVO PLUS (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESC./LOT. W9/DW9 FLY (DIES.)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESCOLAR V6L (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESCOLAR V8L 4X4 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESCOLAR V8L CURTO (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESCOLAR V8L LONGO (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESCOLAR V8L MÉDIO (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESCOLAR V9L (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESCOLAR W-L (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESCOLAR W6 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESCOLAR W7 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESCOLAR W8 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESCOLAR W9/DW9 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESCOLAR/LOT. W6 FLY (DIESEL) (E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESCOLAR/LOT. W7 FLY (DIES.)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESCOLAR/LOT. W8 FLY (DIES.)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESCOLARBUS 4X4 V8 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESCOLARBUS/LOTAÇÂO V6 (DIES.)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESCOLARBUS/LOTAÇÃO V5 (DIES.)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE ESCOLARBUS/LOTAÇÃO V8 (DIES.)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE EXECUTIVE V5 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE EXECUTIVE V6 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE EXECUTIVE V8 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE EXECUTIVE W6 FLY (DIESEL) (E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE EXECUTIVE W7 FLY (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE EXECUTIVE W8 FLY (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE EXECUTIVE W9/DW9 FLY (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE EXECUTIVE WL FLY (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE EXECUTIVO V6L (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE EXECUTIVO V8L CURTO (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE EXECUTIVO V8L MÉDIO (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE EXECUTIVO V9L (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE EXECUTIVO W-L (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE EXECUTIVO W6 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE EXECUTIVO W7 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE EXECUTIVO W8 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE EXECUTIVO W9/DW9 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE FRETAMENTO RURAL V8L (DIE.)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE FRETAMENTO V6L (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE FRETAMENTO V8L 4X4 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE FRETAMENTO V8L CURTO (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE FRETAMENTO V8L LONGO (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE FRETAMENTO V8L MÉDIO (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE FRETAMENTO V9L (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE FRETAMENTO W-L (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE FRETAMENTO W6 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE FRETAMENTO W7 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE FRETAMENTO W8 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE FRETAMENTO W9/DW9 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE FURGÃO V6L (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE FURGÃO V8L 4X4 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE FURGÃO V8L CURTO (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE FURGÃO V8L MÉDIO (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE LIMOUSINE W-L (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE LIMOUSINE W9/DW9 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE LIMOUSINE W9/DW9 FLY (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE LIMOUSINE WL FLY (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE URBANO V9L (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE URBANO W-L (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE URBANO W6 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE URBANO W7 (DIESEL)(E5)', 'Não informado', 0),
  ('MARCOPOLO', 'VOLARE URBANO W9 (DIESEL)(E5)', 'Não informado', 0),
  ('MASCARELLO', 'GRAN MICRO RODOVIÁRIO (DIESEL)(E5)', 'Não informado', 0),
  ('MASCARELLO', 'GRAN MICRO URBANO (DIESEL)(E5)', 'Não informado', 0),
  ('MASCARELLO', 'GRAN MINI RODOVIÁRIO (DIESEL)(E5)', 'Não informado', 0),
  ('MASCARELLO', 'GRAN MINI URBANO (DIESEL)(E5)', 'Não informado', 0),
  ('MASERATI', '222 SE/SR 2.0 V6', 'Não informado', 0),
  ('MASERATI', '228', 'Não informado', 0),
  ('MASERATI', '3200 GT CUPÊ', 'Não informado', 0),
  ('MASERATI', '3200 GT CUPÊ AUT.', 'Não informado', 0),
  ('MASERATI', '430 2.0 V6', 'Não informado', 0),
  ('MASERATI', '430 II 2.0 V6', 'Não informado', 0),
  ('MASERATI', 'COUPÉ CC 4.2 V8 32V 390CV', 'Não informado', 0),
  ('MASERATI', 'GHIBLI 2.0 V6', 'Não informado', 0),
  ('MASERATI', 'GHIBLI 3.0 V6 330CV AUT.', 'Não informado', 0),
  ('MASERATI', 'GHIBLI S Q4 3.0 V6 410CV AUT.', 'Não informado', 0),
  ('MASERATI', 'GRAN TURISMO SPORT 4.7 V8 32V 460CV', 'Não informado', 0),
  ('MASERATI', 'GRANCABRIO 4.7 V8 32V 440CV', 'Não informado', 0),
  ('MASERATI', 'GRANSPORT 4.2 V8 32V 400CV', 'Não informado', 0),
  ('MASERATI', 'GRANSPORT SPYDER 4.2 V8 32V 400CV', 'Não informado', 0),
  ('MASERATI', 'GRANTURISMO 4.2 V8 32V 405CV', 'Não informado', 0),
  ('MASERATI', 'GRANTURISMO MC STRADALE 4.7 V8 32V 450CV', 'Não informado', 0),
  ('MASERATI', 'GRANTURISMO S 4.7 V8 32V/ MC LINE', 'Não informado', 0),
  ('MASERATI', 'LEVANTE 3.0 V6 250CV AUT.', 'Não informado', 0),
  ('MASERATI', 'LEVANTE S 3.0 V6 430CV AUT.', 'Não informado', 0),
  ('MASERATI', 'QUATTROPORTE AUTOMATICA 4.2 32V 400CV', 'Não informado', 0),
  ('MASERATI', 'QUATTROPORTE EVOLUCIONE AUT.', 'Não informado', 0),
  ('MASERATI', 'QUATTROPORTE EVOLUCIONE MEC.', 'Não informado', 0),
  ('MASERATI', 'QUATTROPORTE EXECUTIVE 4.2 32V 400CV', 'Não informado', 0),
  ('MASERATI', 'QUATTROPORTE GTS 3.8 V8 32V 530CV', 'Não informado', 0),
  ('MASERATI', 'QUATTROPORTE S 4.7 V8 32V 430CV', 'Não informado', 0),
  ('MASERATI', 'QUATTROPORTE SPORT 4.2 32V 400CV/430CV', 'Não informado', 0),
  ('MASERATI', 'QUATTROPORTE SPORT GT-S 4.7 V8 32V 440CV', 'Não informado', 0),
  ('MASERATI', 'SHAMAL 3.2 V8', 'Não informado', 0),
  ('MASERATI', 'SPIDER IE 2.0 V6', 'Não informado', 0),
  ('MASERATI', 'SPYDER CC 4.2 V8 32V 390CV', 'Não informado', 0),
  ('MATRA', 'PICK-UP 4X2 CURTO/LONGO 2.5 TDI DIESEL', 'Não informado', 0),
  ('MATRA', 'PICK-UP 4X4 CURTO/LONGO 2.5 TDI DIESEL', 'Não informado', 0),
  ('MATRA', 'PICK-UP CD 4X2 CURTO/LONGO 2.5 TDI DIES.', 'Não informado', 0),
  ('MATRA', 'PICK-UP CD 4X4 CURTO/LONGO 2.5 TDI DIES.', 'Não informado', 0),
  ('MAXFORT', 'SR / MAXFORT FECHADA M0003', 'Não informado', 0),
  ('MAXIBUS', 'ASTOR ESCOLAR (DIESEL)(E5)', 'Não informado', 0),
  ('MAXIBUS', 'ASTOR TURISMO (DIESEL)(E5)', 'Não informado', 0),
  ('MAXIBUS', 'ASTOR URBANO (DIESEL)(E5)', 'Não informado', 0),
  ('MAZDA', '323 1.6 16V', 'Não informado', 0),
  ('MAZDA', '626 GLX', 'Não informado', 0),
  ('MAZDA', '626 GT', 'Não informado', 0),
  ('MAZDA', '626 SEDAN AUT.', 'Não informado', 0),
  ('MAZDA', '626 SEDAN HIGH', 'Não informado', 0),
  ('MAZDA', '626 SEDAN MEC.', 'Não informado', 0),
  ('MAZDA', '626 SEDAN TOP', 'Não informado', 0),
  ('MAZDA', '626 SW', 'Não informado', 0),
  ('MAZDA', '626 SW HIGH', 'Não informado', 0),
  ('MAZDA', '929 V6 AUT', 'Não informado', 0),
  ('MAZDA', 'B-2500 PICK-UP 2.5 DIESEL', 'Não informado', 0),
  ('MAZDA', 'B-2500 PICK-UP 4X4 2.5 DIESEL', 'Não informado', 0),
  ('MAZDA', 'B-2500 PICK-UP CD 4X4 2.5 DIESEL', 'Não informado', 0),
  ('MAZDA', 'B2200 PICK-UP 2.2 DIESEL', 'Não informado', 0),
  ('MAZDA', 'B2200 PICK-UP CD 2.2 DIESEL', 'Não informado', 0),
  ('MAZDA', 'MILLENIA 3.0 V6 24V', 'Não informado', 0),
  ('MAZDA', 'MPV MINIVAN AUT', 'Não informado', 0),
  ('MAZDA', 'MX-3 1.6 16V', 'Não informado', 0),
  ('MAZDA', 'MX-3 GS 1.8 V6 24V', 'Não informado', 0),
  ('MAZDA', 'MX-5 MEC', 'Não informado', 0),
  ('MAZDA', 'NAVAJO LX 3.0 V6', 'Não informado', 0),
  ('MAZDA', 'PROTEGÉ AUT.', 'Não informado', 0),
  ('MAZDA', 'PROTEGÉ HIGH', 'Não informado', 0),
  ('MAZDA', 'PROTEGÉ MEC.', 'Não informado', 0),
  ('MAZDA', 'RX 7 2.6 TURBO', 'Não informado', 0),
  ('MELLO', 'SR / MELLO RODOFLEX CA3E', 'Não informado', 0),
  ('MERCEDES-BENZ', '1114 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1214 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1214 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1214 C 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1215 C 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1215 C 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1218 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1218 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1318 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1318 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1414 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1414 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1418 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1418 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1420 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1420 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1714 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1714 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1718 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1718 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1718-A 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1718-K 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1718-K 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1718-M 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1718-M 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1720 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1720 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1720-A 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1720-K 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1721/ 1721 S 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1721/ 1721 S 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1723 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1723 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1723-S 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1728 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1728 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '180-D PICK-UP/FURGÃO 2.4 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', '180-D VAN 2.4 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', '190-E 2.3', 'Não informado', 0),
  ('MERCEDES-BENZ', '1938-S 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1938-S 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1944-S 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '1944-S 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '2038 S 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '230-E 2.3', 'Não informado', 0),
  ('MERCEDES-BENZ', '2418 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '2418 6X4 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '2423 6X4 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '2428 6X4 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '260-E 2.6', 'Não informado', 0),
  ('MERCEDES-BENZ', '2638 S 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '2726 6X4 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '300-D 3.0 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', '300-E 3.0', 'Não informado', 0),
  ('MERCEDES-BENZ', '300-SE 3.0/3.2', 'Não informado', 0),
  ('MERCEDES-BENZ', '300-SL 3.0', 'Não informado', 0),
  ('MERCEDES-BENZ', '300-TE WAGON 3.0', 'Não informado', 0),
  ('MERCEDES-BENZ', '500-E 5.0', 'Não informado', 0),
  ('MERCEDES-BENZ', '500-SEC/ SL', 'Não informado', 0),
  ('MERCEDES-BENZ', '500-SEL 5.0/ 5.6', 'Não informado', 0),
  ('MERCEDES-BENZ', '560-SEL 5.6', 'Não informado', 0),
  ('MERCEDES-BENZ', '608 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '708 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '709 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '710/ 710 PLUS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '712 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '912 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '914 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', '914-C 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ACCELO 1016 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ACCELO 1316 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ACCELO 715C 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ACCELO 815 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ACCELO 915C 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ACTROS 2546 LS 6X2 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ACTROS 2546 LS 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ACTROS 2646 LS 6X4 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ACTROS 2646 LS 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ACTROS 2646 S 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ACTROS 2651 LS 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ACTROS 2651 S 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ACTROS 2655 LS 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ACTROS 4844 K 8X4 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ACTROS 4844 K 8X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1315 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1315 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1418 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1418 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1419 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1518 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1518 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1718 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1718 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1719 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1725 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1725 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1725 4X4 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1726 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1726 4X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1728 S 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1729 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1729 S 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 1730 S 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 2425 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 2426 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 2428 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 2429 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 2430 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 2730 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 2730B 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 2730K 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 3026 8X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATEGO 3030 8X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATILIS 712 E FURGÃO CAIO 4P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATRON 1319 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATRON 1635 S 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATRON 1719 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATRON 2324 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATRON 2729 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATRON 2729 B 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ATRON 2729 K 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 1933 S 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 1933 S 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2035 S 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2036 S 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2040 S 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2041 S 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2044 S 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2533 6X2 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2533 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2535 S 6X2 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2536 S 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2540 S 6X2 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2541 S 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2544 S 6X2 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2544 S 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2640 S 6X4 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2641 S 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2644 S 6X4 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2644 S 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2826 6X4 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2831 6X4 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2831 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 2831 K 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 3131 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 3131 K 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 3340 S 6X4 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 3340/ 3340 K 6X4 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 3341 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 3341 K 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 3341 S 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 3344 S 6X4 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 3344 S 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 3344/ 3344 K 6X4 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 3344/ 3344 K 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 4140 K 6X4 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 4141 K 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 4144 K 6X4 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'AXOR 4144 K 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-180 1.6 TURBO 16V 156CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-180 CGI AVANTGARDE 1.6 TB 16V AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-180 CGI CLASSIC 1.8 16V 156CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-180 CGI COUPE 1.8 16V 156CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-180 CGI COUPE AVANT. 1.6 TB 16V AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-180 CGI COUPE SPORT 1.6 TB 16V AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-180 CGI ESTATE AVANT. 1.6 TB 16V AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-180 CGI EXCLUSIVE 1.6 TB 16V AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-180 CGI SPORT 1.6 TB 16V 156CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-180 CGI TOURING 1.8 16V AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-180 CGI TOURING SPORT 1.6 TB AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-180 CLASSIC/CLASSIC PLUS/ELEGANCE', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-180 KOMPRESSOR CLASSIC 1.6 16V AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-180 KOMPRESSOR CLASSIC 1.8 16V 143CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-200 AVANTGARDE 2.0 TB 16V 184CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-200 CGI AVANTGARDE 1.8 16V 184CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-200 CGI SPORT 1.8 TB 16V 184CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-200 CGI TOURING AVANTGARDE 1.8 16V AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-200 CLASSIC/SPORT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-200 KOMPRESSOR 2.0 V6 16V 4P AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-200 KOMPRESSOR AVANT.1.8 16V AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-200 KOMPRESSOR CLASSIC 1.8 16V AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-200 SPORTCOUPÉ KOMP. 2.0 16V 163CV AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-200 TOURING KOMP. 2.0 16V 163CV 5P AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-200 TOURING KOMP. AVANT. 1.8 16V AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-220 CLASSIC/ELEGANCE/SPORT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-230 AVANTGARDE 2.5 V6 24V 204CV AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-230 KOMP. SPORTCOUPÉ 2.3 16V 197CV AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-230 KOMPRESSOR AVANTGARDE', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-230 SPORT/ ELEG./TOURING ELEG.PLUS 2.3', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-230 TOURING AVANT. 2.5 24V 204CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-230 TOURING KOMPRESSOR', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-240 AVANTGARDE 2.4/ 2.6 4P', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-240 CLASSIC', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-240 ELEGANCE 2.4', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-240 ELEGANCE 2.4 V6 24V 4P AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-250 AVANTGARDE 2.0 TB 211CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-250 CGI SPORT 1.8 16V AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-250 CGI SPORT COUPE 1.8 16V TB AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-250 SPORT 2.0 16V 211CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-250 SPORT COUPE 2.0 16V 211CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-280 AVANTGARDE 3.0 V6 231CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-280 CLASSIC/SPORT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-280 ELEGANCE', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-280 TOURING', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-300 ANNIVERSARY LIM. EDIT. 2.0 AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-300 AVANTGARDE 3.0 V6 24V 231CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-300 CABRIOLET 2.0 245CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-300 ESTATE AVANTGARDE 2.0 245CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-300 SPORT 2.0 16V AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-300 SPORT 3.0 V6 231CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-320 AVANTGARDE 3.2 V6 24V 4P AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-320 ELEGANCE 3.2 V6 24V 4P AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-320 TOURING 3.2 V6 18V 4P AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-350 AVANTGARDE/ ELEGANCE 3.5 V6 272CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-350 CGI SPORT 3.5 306CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-350 SPORT 3.5 V6 272CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-350 SPORTCOUPÉ 3.5 24V 272CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-350 TOURING AVANTGARDE 3.5 24V 272CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-36 AMG', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-43 AMG', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-43 AMG 3.0 V6 BI-TURBO 367CV AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-43 COUPE AMG 3.0 V6 BI-TURBO AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-450 AMG SPORT 3.0 TB 362CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-55 AMG 24V 367CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-55 TOURING AMG 24V 367CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-63 AMG 4.0 V8 BI-TURBO AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-63 AMG 6.2 V8 AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-63 COUPE AMG 6.2 V8 AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-63 COUPE AMG BLACK SERIES 6.3 V8 AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-63 S AMG 4.0 V8 BI-TURBO AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-63 S COUPE AMG 4.0 V8  BI-TURBO AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'C-63 TOURING AMG 6.2 V8 AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CL-500 5.0/ 5.5', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CL-600 6.0/ 5.5', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CL-63 AMG 6.2 V8 32V 525CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CL-65 AMG 6.0 V12 612CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLA-180 1.6 16V 122CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLA-200 1.6 TB 16V FLEX AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLA-200 CGI 1.6 TB 16V 156CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLA-200 URBAN 1.6 TB 16V 156CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLA-200 VISION 1.6 TB 16V 156CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLA-250 SPORT 2.0 16V 211CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLA-45 AMG CGI 2.0 TB 360 CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE A 160 CLASSIC SEMI-AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE A 160 CLASSIC/ SPIRIT MEC.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE A 160 ELEGANCE MEC.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE A 160 ELEGANCE SEMI-AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE A 190 AVANTGARDE 1.9 8V 125CV AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE A 190 AVANTGARDE 1.9 8V 125CV MEC', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE A 190 CLASSIC 1.9 SEMI-AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE A 190 CLASSIC/ SPIRIT 1.9 MEC.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE A 190 ELEGANCE 1.9 AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE A 190 ELEGANCE 1.9 MEC.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE A 190 ELEGANCE 1.9 SEMI-AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE A 200 1.6 TB 156CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE A 200 CGI 1.6 TB STYLE 156CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE A 200 CGI 1.6 TB URBAN 156CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE A 200 ELEGANCE 2.0 136CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE A 250 CGI 2.0 TB SPORT AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE A 45 AMG 2.0 TURBO 360CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE B 170 1.7 116CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE B 180 1.7 116CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE B 200 2.0 136CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE B 200 2.0 TURBO 193CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE B 200 CGI 1.6 TB 156CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE B 200 CGI 1.6 TB SPORT 156CV AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE R 500 5.0 V8 306CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSE R 500 L 5.5 V8 388CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLASSIC 6.0', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLC 200 KOMPRESSOR 1.8 184CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-230 CABRIOLET KOMPRESSOR', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-230 KOMPRESSOR', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-320 AVANTGARDE', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-320 AVANTGARDE CABRIOLET', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-320 ELEGANCE', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-320 ELEGANCE CABRIOLET', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-320 SPORT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-320 SPORT CABRIOLET', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-350 AVANT./ ELEGANCE 3.5 24V 272CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-350 AVANT./ELEG. CABRIOLET 3.5 272CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-430 AVANTGARD CABRIOLET 4.3 V8 24V', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-430 AVANTGARDE 4.3', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-430 ELEGANCE', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-430 ELEGANCE CABRIOLET 4.3 V8 24V', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-430 SPORT 4.3', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-500 CABRIOLET V8 24V 306CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-500 ELEGANCE/ AVANT. 5.0 V8 24V AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-55 AMG CABRIOLET V8 24V 367CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLK-55 AMG V8 24V 367CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLS-350 CGI 3.5 306CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLS-350 V6 24V 272CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLS-400 3.0 V6 BI-TURBO 333CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLS-500 V8 24V', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLS-55 KOMPRESSOR AMG 5.5 V8 24V 476CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLS-63 AMG 5.5 V8 557CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'CLS-63 AMG 6.2 V8 32V 514CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-190', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-190 CLASSIC', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-200 CLASSIC 2.0', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-220 CLASSIC/TOURING 2.2', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-230 ELEGANCE', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-240 ELEGANCE', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-250 CABRIOLET 2.0 TB 211CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-250 CGI AVANTGARDE 1.8 16V 204CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-250 CGI AVANTGARDE 2.0 TB 211CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-250 CGI COUPE 1.8 16V 204CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-250 CGI VR4 2.0 TB AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-250 COUPE 2.0 TB 211CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-250 EXCL. LAUNCH ED. 2.0 TB 211CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-250 EXCLUSIVE 2.0 TB 211CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-280 CLASSIC 2.8', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-280 TOURING 2.8', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-300 COUPE 2.0 TB 245CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-320', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-320 3.2 ELEGANCE', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-320 AVANTGARDE', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-320 C 3.2/ CA CLASSIC 3.2', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-320 CABRIOLET', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-320 TOURING AVANTGARDE 24V V6 5P AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-320 TOURING ELEG./CLASSIC', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-350 AVANT./AVANT. EXECUT. 3.5 V6 272CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-350 AVANTGARDE/ ELEGANCE 3.5 V6 272CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-350 CABRIO 3.5 V6 272CV 2P', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-350 CGI AVANTGARDE SPORT 3.5 306CV AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-350 CGI CABRIOLET 3.5 306CV AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-350 CGI EXECUTIVE 3.5 306CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-350 CGI GUARD VR4 3.5 306CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-350 COUPE 3.5 V6 272CV 2P', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-350 SPORT 3.5 V6 272CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-350 TOURING AVANT/ELEG. 3.5 24V 272CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-400 AVANTGARDE 3.0 V6 BI-TURBO AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-400 CABRIOLET 3.0 V6 BI-TURBO AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-420 CLASSIC/ELEGANCE/AVANTGARDE', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-420 TOURING AVANTGARDE', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-43 AMG 4MATIC 3.0 V6 401CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-430 AVANTGARDE', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-430 ELEGANCE', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-430 TOURING AVANTGARDE', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-500 AVANGARDE EXECUTIVE 5.5 V8 388CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-500 AVANT. (BLINDADA) 5.0 V8 4P AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-500 CGI GUARD VR4 4.7 V8 408CV 4P', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-500 CGI GUARD VR4 5.5 V8 4P', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-500 COUPE SPORT 4.7 V8 408CV AUT 2P', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-500 COUPE SPORT 5.5 V8 388CV 2P', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-500 ELEGANCE/ AVANT. 5.0 V8 24V 4P AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-500 SPORT AVANTGARDE 5.0 V8 24V 4P AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-500 TOUR. AVANT./ ELEG. 24V V8 5P AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-55 AMG', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-55 TOURING AMG 24V V8 5P AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-63 AMG 4MATIC 4.0 V8 612CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-63 AMG 5.5 V8 BI-TURBO AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-63 AMG 6.2 V8 32V', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-63 TOURING AMG 5.5 V8 BI-TURBO AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'E-63 TOURING AMG 6.2 V8 AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'G-55 KOMPRESSOR AMG 5.5 V8 507CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'G-63 AMG 5.5 BI-TURBO 32V 4X4 AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GL-350 SPORT 3.0 V6 258CV 4X4 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GL-500 4.7 BI-TURBO V8 4X4 AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GL-500 5.5 V8 32V 4X4 388CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GL-63 AMG 5.5 BI-TURBO 32V 4X4 AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLA 200 ADV. 1.6/1.6 TB 16V FLEX AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLA 200 ENDURO 1.6 TB 16V FLEX AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLA 200 STYLE 1.6 TB 16V 156CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLA 200 VIS. BLACK ED. 1.6 TB 16V AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLA 200 VISION 1.6/1.6 TB 16V FLEX AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLA 250 ENDURO 2.0 TB 16V 211CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLA 250 SPORT 2.0 TB 16V 211CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLA 250 SPORT TB 16V 4X4 211CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLA 250 VISION 2.0 TB 16V 211CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLA 45 AMG 2.0 TURBO 4X4 360CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLC 250 2.0 TB 16V 211CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLC 250 COUPE 2.0 TB 16V 211CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLC 250 COUPE HIGHWAY 4MATIC 2.0 TB AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLC 250 HIGHWAY 4MATIC 2.0 TB AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLC 250 SPORT 2.0 TB 16V 211CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLC-43 AMG 3.0 V6 BI-TURBO 367CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLC-43 AMG COUPE 3.0 V6 BI-TB 367CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLE-350 3.0 V6 258CV 4X4 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLE-350 FAMILY 3.0 V6 258CV 4X4 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLE-350 HIGHWAY 4MATIC 3.0 V6 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLE-350 SPORT 3.0 V6 258CV 4X4 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLE-400 COUPE 3.0 V6 333CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLE-400 HIGHWAY COUPE 3.0 V6 333CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLE-400 NIGHT COUPE 3.0 V6 333CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLE-43 AMG 3.0 V6 BI-TURBO 367CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLE-43 AMG 4MATIC 3.0 V6 BI-TB AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLE-450 AMG 3.0 V6 367CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLE-63 AMG 5.5 V8 557CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLE-63 AMG COUPE 5.5 V8 557CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLK 220 CDI 2.2 TB 4X4 170CV AUT. DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLK 220 SPORT CDI 2.2 TB 4X4 AUT. DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLK 280 3.0 V6 24V 4X4 231CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLK 300 3.0 V6 24V 4X4 231CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLK 300 3.5 CGI V6 4X4 252CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLS-350 V6 258CV 4X4 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLS-500 4MATIC 4.7 BI-TURBO V8 455CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GLS-63 AMG 4MATIC 5.5 V8 BI-TB AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GT AMG 4.0 V8 BI-TURBO 462CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GT C ROADSTER AMG 4.0 V8 BI-TURBO 585CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GT R AMG 4.0 V8 BI-TURBO 585CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'GT S AMG 4.0 V8 BI-TURBO 510CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1113 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1113 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1114 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1114 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1117 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1117 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1118 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1118 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1214 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1214 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1218 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1218 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1313 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1313 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1314 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1314 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1316 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1316 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1317 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1317 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1318 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1318 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1319 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1319 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1414 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1414 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1418 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1418 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1513 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1513 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1514 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1514 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1516 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1516 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1517 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1517 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1518 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1518 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1519 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1519 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1520 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1520 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1614 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1614 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1618 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1618 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1620 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1620 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1621 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1621 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1622 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1622 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1625 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1625 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1630 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-1630 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-2013 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-2014 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-2017 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-2213 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-2214 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-2215 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-2216 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-2217 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-2219 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-2220 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-2225 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-2314 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-2318 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-2318 6X4 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-2325 6X4 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-2635 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'L-2638 6X4 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LK-1618 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LK-1620 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LK-1620 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LK-2635 6X4 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LK-2638 6X4 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LP 321', 'CAMINHõES-LEVE-VANS', 0),
  ('MERCEDES-BENZ', 'LS-1313 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1519 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1520 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1524 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1525 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1625 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1630 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1630 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1632 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1634 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1634 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1924 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1929 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1932 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1933 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1934 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1935 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1935 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1938 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1938 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1941 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-1941 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-2635 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'LS-2638 6X4 2P (DIESEL)', 'Não informado', 0),
  ('MERCEDES-BENZ', 'MERCEDES-BENZ 1938S', 'CAMINHõES-LEVE-VANS', 0),
  ('MERCEDES-BENZ', 'MERCEDES-BENZ LS 1935', 'CAMINHõES-LEVE-VANS', 0),
  ('MERCEDES-BENZ', 'ML-230 4X4', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ML-320 3.0 V6 224CV 4X4 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ML-320 4X4', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ML-350 3.0 V6 4X4 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ML-350 3.5 234CV 4X4', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ML-350 SPORT 3.0 V6 258CV 4X4 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ML-350 SPORT CGI 3.5 V6 306CV 4X4 AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ML-430', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ML-500 V8 24V', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ML-55 AMG 5.5 24V', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ML-63 AMG 5.5 V8 BI-TURBO AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'ML-63 AMG 6.2 V8 32V 510CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'MPOLO PARADISO DDR', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-320 L CLASSIC/WAGON CLASSIC 3.2', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-400 HYBRID 3.5 V6 279CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-420 CLASSIC 4.0', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-500 5.0', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-500 C CLASSIC 5.0', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-500 L/ L CLASSIC/ WAGON CLASSIC 5.0', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-500 MAYBACH 4.7 BI-TURBO V8 455CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-500L 4.7 BI-TURBO V8 455CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-500L 5.0', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-55 AMG V8 24V 364CV/ 500CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-560L 4.0 BI-TURBO V8 469CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-600 L/ L CLASSIC/ WAGON CLASSIC 6.0', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-600/ S-600 C CLASSIC 6.0', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-63 AMG 5.5 V8 BI-TURBO AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-63 AMG 6.2 V8 525CV AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-63 AMG L 6.2 V8/5.5 V8 BI-TB AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-63 CABRIOLET AMG 5.5 V8 BI-TURBO AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-63 COUPE AMG 5.5 V8 BI-TURBO AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-65 AMG 6.0 V12 612CV AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'S-65 L AMG 6.0 V12 630CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SE-500', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SL-280 CLASSIC 2.8', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SL-320 3.2/CLASSIC 3.2', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SL-350 3.5 V6 2P', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SL-350 SPORT 3.5 V6 316CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SL-400 3.0 BI-TURBO V6 2P', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SL-500 5.0 E 5.5/ CLASSIC 5.0', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SL-55 AMG V8 24V 500CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SL-600', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SL-63 AMG 5.5 BI-TURBO V8 537CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SL-63 AMG 6.2 V8 525CV AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SL-65 AMG 6.0 V12 612CV AUT', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SLC-300 2.0 TURBO 245CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SLC-43 AMG 3.0 V6 AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SLK-200 KOMPRESSOR 16V/ 200 CGI 16V', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SLK-230 KOMPRESSOR', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SLK-230 PLUS', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SLK-250 CGI 1.8 16V 204CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SLK-300 2.0 TURBO 245CV AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SLK-320 3.2 218CV', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SLK-350 3.5 V6/SLK-350 CGI', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SLK-55 AMG V8 24V', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SLS-63 AMG 6.2 8V BLACK SERIES AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SLS-63 AMG 6.2 V8 AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SLS-63 AMG ROADSTER 6.3 V8 AUT.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 310 CHASSI DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 310 FURGÃO 2.5 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 310 PICK-UP DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 310 VAN EXEC. 9LUG. DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 310 VAN LUXO/EXEC. 12/14L DIES.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 310 VAN STD 12E14L/LUXO 9L.DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 310 VAN STD. 9LUG. 2.5 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 311 CHASSI 2.2 DIESEL', 'CAMINHõES-LEVE-VANS', 0),
  ('MERCEDES-BENZ', 'SPRINTER 311 CHASSI E. LONGA 2.2 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 311 FURGÃO CURTO 2.2 DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 311 FURGÃO E.LONGO T.ALTO DIES.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 311 FURGÃO LONGO 2.2 DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 311 FURGÃO LONGO TETO ALTO DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 311 STREET LUXO 2.2 16LUG. DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 311 STREET STD. 2.2 16LUG. DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 311 VAN LUXO 2.2 109CV 13L DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 311 VAN LUXO 2.2 109CV 16L DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 311 VAN STD. 2.2 109CV 13L DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 311 VAN STD. 2.2 109CV 16L DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 312 FURGÃO CURTO DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 312 FURGÃO LONGO DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 312 FURGÃO LONGO T.ALTO DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 312 VAN EXEC. 10LUG. 2.5 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 312 VAN EXEC. 12LUG. DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 312 VAN LUXO 10LUG. DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 312 VAN LUXO 12LUG. DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 312 VAN LUXO 15LUG. DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 312 VAN LUXO 16LUG. DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 312 VAN LUXO LOTAÇÃO 16LUG.DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 312 VAN STD 12LUG. DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 312 VAN STD 16LUG. DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 312 VAN STD LOTAÇÃO 16LUG. DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 312 VAN STREET LUXO 15LUG.DIES.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 312 VAN STREET STD. 15LUG.DIES.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 312-D CHASSI DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 313  CHASSI EX. LONGO 2.2 DIES.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 313 CHASSI 2.2 129CV DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 313 CHASSI LONGO 2.2 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 313 FURGÃO CURTO 2.2 129CV DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 313 FURGÃO EX. LONGO T. A. DIE.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 313 FURGÃO LONGO 2.2 129CV DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 313 FURGÃO LONGO T. ALTO DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 313 VAN EXEC 2.2 MEC/S-AUT DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 313 VAN LUXO 2.2 129CV 13L.DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 313 VAN LUXO 2.2 129CV 16L DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 313 VAN STD. 2.2 129CV 13L.DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 313 VAN STD. 2.2 129CV 16L DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 313 VAN STREET LUXO 16L. DIES.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 313 VAN STREET STD. 16L. DIES.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 412-D CHASSI DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 413 FURGÃO LONGO T.ALTO DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MERCEDES-BENZ', 'SPRINTER 413 VAN LUXO 2.2 16 E 20L DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 413-D CHASSI CURTO/LONGO DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 415 CHASSI L. 2.2 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 415 FURGÃO CURTO T.B. 2.2 DIES.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 415 FURGÃO E.L.T.ALT. 2.2 DIES.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 415 FURGÃO LON.T.ALTO 2.2 DIES', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 415 FURGÃO LON.T.BAI. 2.2 DIES.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 415 VAN LUXO T.A. 2.2 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 415 VAN LUXO T.B. 2.2 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 415 VAN STANDARD T.A. 2.2 DIES.', 'UTILITARIO LEVE', 0),
  ('MERCEDES-BENZ', 'SPRINTER 415 VAN STANDARD T.B. 2.2 DIES.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 515 CHASSI E. L. 2.2 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 515 CHASSI L. 2.2 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 515 FURGÃO E.L.T. ALTO 2.2 DIE.', 'Não informado', 0),
  ('MERCEDES-BENZ', 'SPRINTER 515 VAN 2.2 DIESEL', 'Não informado', 0),
  ('MERCEDES-BENZ', 'VITO 111 CDI FURGÃO 1.6 TB DIESEL 4P MEC', 'Não informado', 0),
  ('MERCEDES-BENZ', 'VITO TOURER 119 COMF. 2.0 FLEX 9LUG. MEC', 'Não informado', 0),
  ('MERCEDES-BENZ', 'VITO TOURER 119 LUXO 2.0 FLEX 8LUG. MEC', 'Não informado', 0),
  ('MERCURY', 'MYSTIQUE GS 2.5 V6 MEC.', 'Não informado', 0),
  ('MERCURY', 'SABLE LS 3.0 V6', 'Não informado', 0),
  ('METALESP', 'SR / METALESP SILOCAR BD22', 'Não informado', 0),
  ('METALESP', 'SR / METALESP SILOCAR BT22', 'Não informado', 0),
  ('METALESP', 'SR / METALESP SILOCAR SR28', 'Não informado', 0),
  ('METALESP', 'SR / METALESP SILOCAR SR37', 'Não informado', 0),
  ('METALPI', 'R / METALPI', 'Não informado', 0),
  ('MG', '550 1.8 16V TURBO 170CV AUT.', 'Não informado', 0),
  ('MG', 'MG6 1.8 16V TURBO 170CV AUT.', 'Não informado', 0),
  ('MINI', 'COOPER 1.5 TURBO 12V 3P AUT.', 'Não informado', 0),
  ('MINI', 'COOPER 1.5 TURBO 12V 5P AUT.', 'Não informado', 0),
  ('MINI', 'COOPER 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER 1.6 MEC.', 'Não informado', 0),
  ('MINI', 'COOPER CABRIO 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER CABRIO JOHN WORKS 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER CABRIO JOHN WORKS 1.6 MEC.', 'Não informado', 0),
  ('MINI', 'COOPER CABRIO S 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER CABRIO S 2.0 16V AUT.', 'Não informado', 0),
  ('MINI', 'COOPER CABRIO S HIGHGATE 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER CLUBMAN 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER COUNTRY. JOHN WORKS ALL4 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER COUNTRY. JOHN WORKS ALL4 2.0 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER COUNTRYMAN 1.5 TURBO AUT.', 'Não informado', 0),
  ('MINI', 'COOPER COUNTRYMAN 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER COUNTRYMAN S 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER COUNTRYMAN S 2.0 TURBO AUT.', 'Não informado', 0),
  ('MINI', 'COOPER COUNTRYMAN S ALL4 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER COUNTRYMAN S ALL4 2.0 TURBO AUT.', 'Não informado', 0),
  ('MINI', 'COOPER COUPÉ 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER COUPÉ JOHN WORKS 1.6 AUT', 'Não informado', 0),
  ('MINI', 'COOPER COUPÉ S 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER JOHN WORKS 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER JOHN WORKS 1.6 MEC.', 'Não informado', 0),
  ('MINI', 'COOPER JOHN WORKS 2.0 TURBO 3P AUT.', 'Não informado', 0),
  ('MINI', 'COOPER PACEMAN S 1.6 16V 184CV AUT.', 'Não informado', 0),
  ('MINI', 'COOPER PACEMAN S ALL4 1.6 16V AUT.', 'Não informado', 0),
  ('MINI', 'COOPER PACEMAN S JOHN WORKS ALL4 1.6 AUT', 'Não informado', 0),
  ('MINI', 'COOPER ROADSTER 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER ROADSTER JOHN WORKS 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER ROADSTER S 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER S 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER S 2.0 TURBO 16V 3P AUT.', 'Não informado', 0),
  ('MINI', 'COOPER S 2.0 TURBO 16V 3P MEC.', 'Não informado', 0),
  ('MINI', 'COOPER S 2.0 TURBO 16V 5P AUT.', 'Não informado', 0),
  ('MINI', 'COOPER S BAYSWATER 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER S CLUBMAN 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER S CLUBMAN 2.0 AUT.', 'Não informado', 0),
  ('MINI', 'COOPER S SEVEN 2.0 TURBO 16V 3P AUT.', 'Não informado', 0),
  ('MINI', 'ONE 1.6 AUT.', 'Não informado', 0),
  ('MINI', 'ONE 1.6 MEC.', 'Não informado', 0),
  ('MITSUBISHI', '3000 GT SL 3.0', 'Não informado', 0),
  ('MITSUBISHI', '3000 GT VR-4', 'Não informado', 0),
  ('MITSUBISHI', 'AIRTREK 2.0 16V TB-IC 202CV 4X4 5P', 'Não informado', 0),
  ('MITSUBISHI', 'AIRTREK 2.4 16V 163CV/ 136CV 4X4 5P AUT.', 'Não informado', 0),
  ('MITSUBISHI', 'ASX 2.0 16V 160CV AUT.2.0 16V160CVAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'ASX 2.0 16V 160CV MEC.2.0 16V160CVMANUAL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'ASX 2.0 16V 4X2 AUT.(BY AMURA-BLIND.)2.0 16V-AUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'ASX 2.0 16V 4X2 FLEX AUT.2.0 16V FLEX-AUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'ASX 2.0 16V 4X4 160CV AUT.2.0 16V160CVAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'ASX 2.0 16V 4X4 AUT.(BY ARMURA-BLIND.)2.0 16V160CVAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'ASX 2.0 16V 4X4 FLEX AUT.2.0 16V FLEX-AUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'ASX GLS FWD 2.0 16V FLEX AUT.2.0 16V FLEX-AUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'ASX HPE AWD 2.0 16V FLEX AUT.2.0 16V FLEX-AUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'ASX HPE FWD 2.0 16V FLEX AUT.2.0 16V FLEX-AUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'ASX HPE-S AWD FLEX 2.0 16V AUT.2.0 16V FLEX-AUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'ASX O NEILL 2.0 16V 160CV AUT.2.0 16V160CVAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'ASX OUTDOOR 2.0 4X2 16V 160CV AUT.2.0 16V160CVAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'ASX OUTDOOR 2.0 4X4 16V 160 CV MEC.2.0 16V160CVMANUAL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'ASX-S 2.0 16V 160CV AUT.2.0 16V160CVAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'COLT GLXI', 'Não informado', 0),
  ('MITSUBISHI', 'COLT GTI MEC', 'Não informado', 0),
  ('MITSUBISHI', 'DIAMANT LS 3.0 V6', 'Não informado', 0),
  ('MITSUBISHI', 'ECLIPSE CROSS GLS 1.5 16V 165CV AUT.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('MITSUBISHI', 'ECLIPSE CROSS HPE 1.5 16V 165CV AUT.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('MITSUBISHI', 'ECLIPSE CROSS HPE-S 1.5 16V 165CV AUT.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('MITSUBISHI', 'ECLIPSE CROSS HPE-S 1.5 AWC 165CV AUT.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('MITSUBISHI', 'ECLIPSE CROSS HPE-S OUTDOOR 1.5 AWC AUT.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('MITSUBISHI', 'ECLIPSE CROSS HPE-S SPORT 1.5 16V AUT.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('MITSUBISHI', 'ECLIPSE CROSS HPE-S SPORT 1.5 AWC AUT.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('MITSUBISHI', 'ECLIPSE GS/ GS TURBO MEC', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('MITSUBISHI', 'ECLIPSE GST 2.0 16V TURBO', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('MITSUBISHI', 'ECLIPSE GSX 2.0 V6 16V TURBO', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('MITSUBISHI', 'ECLIPSE GT 3.0 V6 24V', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('MITSUBISHI', 'ECLIPSE GT 3.8 V6 267CV', 'ESPECIAL V12 /AUTOMÓVEIS', 0),
  ('MITSUBISHI', 'EXPO LRV SPORT 2.3 16V', 'Não informado', 0),
  ('MITSUBISHI', 'EXPO SP VAN 2.3 16V', 'Não informado', 0),
  ('MITSUBISHI', 'GALANT 2.0', 'Não informado', 0),
  ('MITSUBISHI', 'GALANT 2.5 V6', 'Não informado', 0),
  ('MITSUBISHI', 'GALANT ES', 'Não informado', 0),
  ('MITSUBISHI', 'GALANT GS 2.0 V6', 'Não informado', 0),
  ('MITSUBISHI', 'GRANDIS 2.4 16V 163CV 5P AUT.', 'Não informado', 0),
  ('MITSUBISHI', 'L200 2.5 4X2 CD TURBO DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 2.5 4X2 TURBO DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 2.5 4X4 CD TURBO DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 EVOLUTION 3.2 4X4 TB INT. DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 GL 2.5 4X4 CD DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 GLS 2.5 4X4 CD DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 GLS SPORT 2.5 4X4 121CV CD DTI DIES', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 HPE 2.5 8V 95/118CV TB-IC DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 L 2.5 4X4 CD TURBO DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 OUTDOOR GLS 2.5 4X4 CD TDI DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 OUTDOOR HPE 2.5 4X4 CD T.DIESEL AUT', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 OUTDOOR HPE 2.5 4X4 CD T.DIESEL MEC', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 RI/ RII/ RIII CD 2.5 TB INT. DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 SAVANA 2.5 4X4 121CV CD DTI DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 SPORT 2.5 4X4 CD TURBO DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 SPORT HPE 2.5 4X4 CD DTI DIES. AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 SPORT HPE 2.5 4X4 CD DTI DIES. MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 SPORT RS 2.5 CD DTI (PASSEIO) DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 T. OUTDOOR 3.2 CD TB INT.DIES. MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 T. SAVANA 3.2 CD TB INT. DIES. AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 T.OUTDOOR 3.2 CD TB INT. DIES. AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRI. HLS CHOME ED. 2.4 CD FLEX MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON GLS 3.2 CD TB INT.DIESEL MEC', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON GLX 3.2 CD TB INT.DIESEL MEC', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON GLX D', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON HLS 2.4 FLEX 16V CD MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON HPE 3.2 CD TB INT.DIESEL AUT', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON HPE 3.2 CD TB INT.DIESEL MEC', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON HPE 3.5 CD V6 24V FLEX AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON KTM 3.2 CD TB INT.DIES. MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON OUTDOOR 2.4 FLEX 16V CD MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON S. HPE FTP 2.4 CD DIES. AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON SAVANA 3.2 CD TBI DIES. MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON SAVANA GLS 2.4 4X4 DIE. AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON SAVANAOFF 3.2 CD TBI DIE.MEC', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON SPORT 3.2 DID-H GL 4WD', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON SPORT GLS 2.4 CD DIESEL AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON SPORT GLS 2.4 CD DIESEL MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON SPORT GLX 2.4 CD DIESEL MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON SPORT HPE 2.4 CD DIESEL AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON SPORT HPE-S 2.4 CD DIES. AUT', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L200 TRITON XB 3.2 CD TB INT.DIESEL MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'L300 BASE/DX/CANTER 2.5 DIESEL', 'Não informado', 0),
  ('MITSUBISHI', 'L300 TOP/LUXO 2.5 DIESEL', 'Não informado', 0),
  ('MITSUBISHI', 'LANCER 2.0 16V 160CV AUT.2.0 16V160CVAUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER 2.0 16V 160CV MEC.2.0 16V160CVMANUAL', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER EVOL. 2.0 TURBO2.0 TURBO', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER EVOL. VI 2.0 TURBO 4P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER EVOL. X J. EASTON 2.0 16V TB INT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER EVOLUT. IX MR 2.0 290CV TB-IC', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER EVOLUT. VII/ VIII/ IX 2.0 280CV T', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER EVOLUTION X 2.0 16V 295CV TB INT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER GLX', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER GT 2.0 16V 160CV AUT.2.0 16V160CVAUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER GT 2.0 16V 4X4 160CV AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER GT 2.0 16V AUT.(BY ARMURA-BLIND.)2.0 16V-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER GTI MEC--MANUAL', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER HL 2.0 16V 160CV AUT.2.0 16V160CVAUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER HL 2.0 16V AUT.(BY ARMURA-BLIND.)2.0 16V-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER HL-T 2.0 16V 160CV AUT.2.0 16V160CVAUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER HLE 2.0 16V 160CV AUT.2.0 16V160CVAUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER HLE 2.0 16V AUT.(BY ARMURA-BLIND)2.0 16V-AUTOMáTICA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER LS 1.8', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'LANCER SPORT RALLIART 2.0 16V TB INT. 5P2.0 16V TB INT. 5', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('MITSUBISHI', 'MIRAGE ES', 'Não informado', 0),
  ('MITSUBISHI', 'MIRAGE GS 16V/ GLSI1.6', 'Não informado', 0),
  ('MITSUBISHI', 'MIRAGE LS', 'Não informado', 0),
  ('MITSUBISHI', 'MONTERO 2.8 DIESEL', 'Não informado', 0),
  ('MITSUBISHI', 'OUTLANDER 2.0 16V 160CV AUT.2.0 16V160CVAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'OUTLANDER 2.0 16V 4X4 AUT. (HíBRIDO)2.0 16V-AUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'OUTLANDER 2.2 165CV DIESEL AUT.2.2 DIESEL165CVAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'OUTLANDER 2.4 16V 170CV AUT.2.4 16V170CVAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'OUTLANDER 3.0/ GT 3.0 V6 AUT.3.0 V6-AUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'OUTLANDER COMFORT 2.0 16V AUT.2.0 16V-AUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'OUTLANDER GLS 2.0 16V 5P AUT.2.0 16V-AUTOMáTICA5', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'OUTLANDER HPE 2.0 16V 5P AUT.2.0 16V-AUTOMáTICA5', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'OUTLANDER HPE-S 2.2 DIESEL 4X4 AUT.2.2 DIESEL-AUTOMáTICA4', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'OUTLANDER HPE-S 3.0 V6 4X4 5P AUT.3.0 V6-AUTOMáTICA5', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'OUTLANDER HPE-S BLACK ED. 3.0 4X4 AUT.3.0-AUTOMáTICA4', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'OUTLANDER SP. HPE BL.ED 4X2 2.0 FLEX AUT2.0 FLEX-AUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'OUTLANDER SP. HPE BL.ED 4X4 2.0 FLEX AUT2.0 FLEX-AUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'OUTLANDER SPORT GLS 2.0 16V FLEX AUT.2.0 16V FLEX-AUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'OUTLANDER SPORT HPE 2.0 16V FLEX AUT.2.0 16V FLEX-AUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'OUTLANDER SPORT HPE 4X4 2.0 16V FLEX AUT.2.0 16V FLEX-AUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO 3.2 4X4 T.I. DIES. 5P AUT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO DAKA 3.2 4X4 T.I DIES. 5P AUT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO DAKAR 3.2 4X4 T.I. DIES. 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO DAKAR 3.2 4X4 T.I. DIES. 5P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO DAKAR HPE 3.2 4X4 T.I DIES 5P AUT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO DAKAR/HPE 3.5 4X4 FLEX 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO EVOLUTION 4X4 3.5 V6', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO FULL GLS/GLS/PKHPE 3.2 DIES.TI 5P', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLS 2.8 DIESEL TURBO AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLS 2.8 DIESEL TURBO MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLS 3.0 V6 2P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLS 3.0 V6 2P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLS 3.0 V6 4P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLS 3.0 V6 4P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLS 3.5 V6 2P AUT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLS 3.5 V6 2P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLS 3.5 V6 4P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLS 3.5 V6 4P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLS 3.5 V6 TOP 2P AUT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLS 3.5 V6 TOP 4P AUT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLS FULL 3.8 V6 250CV 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLS HPE/HPE FULL 3.8 233CV 3P AUT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLS HPE/HPE FULL 3.8 233CV 5P AUT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLX 2.8 DIESEL 4P MEC', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLX 3.0 V6 4P MEC', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLZ 2.8 4X4 TURBO DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO GLZ 3.0 4X4 V6', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO HD-S 3.2 4X4 T.I. DIESEL 5P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO HPE 3.2 4X4 T.I. DIES. 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO HPE 3.5 4X4 FLEX 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO HPE FULL 3.2 4X4 T.I.DIES. 5P AUT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO HPE FULL 3.2 4X4 T.I.DIES.3P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO HPE FULL 3.8 V6 250CV 3P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO HPE FULL 3.8 V6 250CV 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO HPE-S 3.2 4X4 T.I.DIESEL 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO IO AUT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO IO MEC', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO IO SE 1.8 16V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO IO SE 1.8 16V MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO OUTDOOR 3.2 4X4 T.I. DIES.5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO SPORT 2.8 4X4 DIESEL AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO SPORT 2.8 4X4 DIESEL MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO SPORT 3.0 4X2 V6 MEC./AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO SPORT 3.0 4X4 V6 MEC./AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO SPORT 3.5 V6 FLEX 4X4 AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO SPORT HPE 2.5 4X4 DIESEL AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO SPORT HPE 2.5 4X4 DIESEL MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO SPORT HPE 3.5 4X4 200CV AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO SPORT SE 3.0 4X2 V6 177CV AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO SPORT SE/ HPE 2.8 4X4 DIESEL AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO SPORT SE/ HPE 3.0 4X4 177CV AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO TR4 2.0 BLIND. 16V 131CV 4X4 AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO TR4 2.0 BLIND. 16V 131CV 4X4 MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO TR4 2.0 FLEX 16V 4X2 AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO TR4 2.0 FLEX 16V 4X2 MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO TR4 2.0/ 2.0 FLEX 16V 4X4 AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO TR4 2.0/ 2.0 FLEX 16V 4X4 MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'PAJERO TR4 GLS 2.0 FLEX 16V 4X4 MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MITSUBISHI', 'SPACE WAGON GLS 2.0', 'Não informado', 0),
  ('MITSUBISHI', 'SPACE WAGON GLS 2.4', 'Não informado', 0),
  ('MITSUBISHI', 'SPACE WAGON GLXI 2.4 ( NOVA SÉRIE )', 'Não informado', 0),
  ('MITSUBISHI', 'SPACE WAGON/ GLXI 2.4', 'Não informado', 0),
  ('MITSUBISHI', 'TRITON L200 GLX D', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('MIURA', 'PICAPE BG-TRUCK CD TURBO DIESEL', 'Não informado', 0),
  ('MIZA', 'DRAGO LJ 150-7', 'Não informado', 0),
  ('MIZA', 'EASY LJ 110-10', 'Não informado', 0),
  ('MIZA', 'EASY LJ 125-10', 'Não informado', 0),
  ('MIZA', 'FAST LJ 150-2', 'Não informado', 0),
  ('MIZA', 'SKEMA LJ 125-6', 'Não informado', 0),
  ('MIZA', 'VITE LJ 150T-7', 'Não informado', 0),
  ('MOTO GUZZI', 'CALIFORNIA ESPECIAL', 'Não informado', 0),
  ('MOTO GUZZI', 'CALIFORNIA EV 1064CC', 'Não informado', 0),
  ('MOTO GUZZI', 'CALIFORNIA JACKAL 1064CC', 'Não informado', 0),
  ('MOTO GUZZI', 'CALIFORNIA STONE 1064CC', 'Não informado', 0),
  ('MOTO GUZZI', 'QUOTA 1100 ES', 'Não informado', 0),
  ('MOTO GUZZI', 'V11 SPORT/ LE MANS 1064CC', 'Não informado', 0),
  ('MOTOCAR', 'MCA-200', 'Não informado', 0),
  ('MOTOCAR', 'MCA-250', 'Não informado', 0),
  ('MOTOCAR', 'MCF-200', 'Não informado', 0),
  ('MOTOCAR', 'MCF-250', 'Não informado', 0),
  ('MOTOCAR', 'MTX-150', 'Não informado', 0),
  ('MOTORINO', 'BACIO 125CC', 'Não informado', 0),
  ('MOTORINO', 'BELLAVITA 150CC', 'Não informado', 0),
  ('MOTORINO', 'CAPPUCCINO 50CC', 'Não informado', 0),
  ('MOTORINO', 'CAPPUCCINO S 50CC', 'Não informado', 0),
  ('MOTORINO', 'CAPPUCCINO150CC', 'Não informado', 0),
  ('MOTORINO', 'CUSTOM 150CC', 'Não informado', 0),
  ('MOTORINO', 'CUSTOM S 150CC', 'Não informado', 0),
  ('MOTORINO', 'STAR 150CC', 'Não informado', 0),
  ('MOTORINO', 'STAR 200CC', 'Não informado', 0),
  ('MOTORINO', 'STAR AUTOMATIC 125CC', 'Não informado', 0),
  ('MOTORINO', 'VELOCETTE 150CC', 'Não informado', 0),
  ('MOTORINO', 'VELVET 150CC', 'Não informado', 0),
  ('MOTORINO', 'VELVET 50CC', 'Não informado', 0),
  ('MOTORINO', 'VITESSE 150CC', 'Não informado', 0),
  ('MOTORINO', 'VOLTI 3000W', 'Não informado', 0),
  ('MRX', '230R', 'Não informado', 0),
  ('MV AGUSTA', 'BRUTALE 1078RR', 'Não informado', 0),
  ('MV AGUSTA', 'BRUTALE 1090R', 'Não informado', 0),
  ('MV AGUSTA', 'BRUTALE 1090RR', 'Não informado', 0),
  ('MV AGUSTA', 'BRUTALE 800', 'Não informado', 0),
  ('MV AGUSTA', 'BRUTALE 910R', 'Não informado', 0),
  ('MV AGUSTA', 'BRUTALE 910S', 'Não informado', 0),
  ('MV AGUSTA', 'BRUTALE 989R', 'Não informado', 0),
  ('MV AGUSTA', 'F3 800', 'Não informado', 0),
  ('MV AGUSTA', 'F4 1078RR 312', 'Não informado', 0),
  ('MV AGUSTA', 'F4 750 (OURO)', 'Não informado', 0),
  ('MV AGUSTA', 'F4 750S (PRATA)', 'Não informado', 0),
  ('MV AGUSTA', 'F4- R312', 'Não informado', 0),
  ('MV AGUSTA', 'F4-1000', 'Não informado', 0),
  ('MV AGUSTA', 'F4-1000 RR', 'Não informado', 0),
  ('MV AGUSTA', 'RIVALE 800', 'Não informado', 0),
  ('MVK', 'BIG FORCE 250 QUADRICICLO', 'Não informado', 0),
  ('MVK', 'BLACK STAR 150', 'Não informado', 0),
  ('MVK', 'BRX 140', 'Não informado', 0),
  ('MVK', 'DUAL 200', 'Não informado', 0),
  ('MVK', 'FENIX GOLD 240', 'Não informado', 0),
  ('MVK', 'FOX 110', 'Não informado', 0),
  ('MVK', 'GO 100', 'Não informado', 0),
  ('MVK', 'HALLEY / FENIX 200', 'Não informado', 0),
  ('MVK', 'HALLEY 150', 'Não informado', 0),
  ('MVK', 'JURASIC 300', 'Não informado', 0),
  ('MVK', 'MA 100-3B', 'Não informado', 0),
  ('MVK', 'MA 125-GY', 'Não informado', 0),
  ('MVK', 'MA/ BLACK STAR 125-7', 'Não informado', 0),
  ('MVK', 'MA/ FOXX 100-3', 'Não informado', 0),
  ('MVK', 'SIMBA 50 QUADRICICLO', 'Não informado', 0),
  ('MVK', 'SPORT 150 QUADRICICLO', 'Não informado', 0),
  ('MVK', 'SPYDER 270 / 320', 'Não informado', 0),
  ('MVK', 'STREET 150/STREET LIMITED', 'Não informado', 0),
  ('MVK', 'SUPER X 125 R', 'Não informado', 0),
  ('MVK', 'XRT 110', 'Não informado', 0),
  ('NAVISTAR', 'DURASTAR 4400 4X2 2P (DIESEL)', 'Não informado', 0),
  ('NAVISTAR', 'DURASTAR 4400 4X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('NAVISTAR', 'DURASTAR 4400 6X2 2P (DIESEL)', 'Não informado', 0),
  ('NAVISTAR', 'DURASTAR 4400 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('NAVISTAR', 'DURASTAR 4400 6X4 2P (DIESEL)', 'Não informado', 0),
  ('NAVISTAR', 'DURASTAR 4400 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('NAVISTAR', 'INTERNATIONAL 4700 2P (DIESEL)', 'Não informado', 0),
  ('NAVISTAR', 'INTERNATIONAL 4700 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('NAVISTAR', 'INTERNATIONAL 4900 4X2 2P (DIESEL)', 'Não informado', 0),
  ('NAVISTAR', 'INTERNATIONAL 4900 6X4 2P (DIESEL)', 'Não informado', 0),
  ('NAVISTAR', 'INTERNATIONAL 9200 4X2 2P (DIESEL)', 'Não informado', 0),
  ('NAVISTAR', 'INTERNATIONAL 9200 6X4 2P (DIESEL)', 'Não informado', 0),
  ('NAVISTAR', 'INTERNATIONAL 9800 4X2 2P (DIESEL)', 'Não informado', 0),
  ('NAVISTAR', 'INTERNATIONAL 9800/9800I 6X2 2P (DIESEL)', 'Não informado', 0),
  ('NAVISTAR', 'INTERNATIONAL 9800/9800I 6X4 2P (DIESEL)', 'Não informado', 0),
  ('NAVISTAR', 'INTERNATIONAL 9800I 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('NAVISTAR', 'INTERNATIONAL 9800I 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('NEOBUS', 'T.BOY/ WAY (LOT.,ESC. E SPTRANS) (DIESEL', 'Não informado', 0),
  ('NEOBUS', 'THUNDER + (EXECUTIVO) (DIESEL)(E5)', 'Não informado', 0),
  ('NEOBUS', 'THUNDER + (EXECUTIVO) 1P (DIESEL)', 'Não informado', 0),
  ('NEOBUS', 'THUNDER + (LOT. E ESC.) (DIESEL)(E5)', 'Não informado', 0),
  ('NEOBUS', 'THUNDER + (LOT.,ESC. E SPTRANS) (DIESEL', 'Não informado', 0),
  ('NEOBUS', 'THUNDER + NEOSTAR (URBANO) (DIESEL)(E5)', 'Não informado', 0),
  ('NEOBUS', 'THUNDER BOY/ WAY (EXECUTIVO) 1P (DIESEL)', 'Não informado', 0),
  ('NEOBUS', 'THUNDER PLUS (EXECUTIVO) (DIESEL)(E5)', 'Não informado', 0),
  ('NEOBUS', 'THUNDER PLUS (EXECUTIVO) 1P (DIESEL)', 'Não informado', 0),
  ('NEOBUS', 'THUNDER WAY (EXECUTIVO) (DIESEL)(E5)', 'Não informado', 0),
  ('NEOBUS', 'THUNDER WAY (LOT. E ESC.) (DIESEL)(E5)', 'Não informado', 0),
  ('NEOBUS', 'THUNDER+ NEOSTAR (URBANO) (DIESEL)', 'Não informado', 0),
  ('NIJU', 'SR / NIJU NJSRFR 3E', 'Não informado', 0),
  ('NISSAN', '350Z 3.5 V6 280CV/ 312CV 2P', 'Não informado', 0),
  ('NISSAN', 'ALTIMA GXE 2.4 16V', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('NISSAN', 'ALTIMA SE 2.4 16V', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('NISSAN', 'ALTIMA SL 2.5 16V 4P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('NISSAN', 'AX 6.5D TURBO DIESEL', 'Não informado', 0),
  ('NISSAN', 'D-21 PICK-UP CD 4X2/4X4 2.7 DIESEL', 'Não informado', 0),
  ('NISSAN', 'D-21 PICK-UP CS 4X2/4X4 2.7 DIESEL', 'Não informado', 0),
  ('NISSAN', 'FRONTIER 4X2', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER AX 3.2 CD DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER AX CD 4X4 2.5 TB INTERC. DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER DX 3.2 CD DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER LE ATTACK CD 4X4 2.5 TB DIE.AUT', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER LE CD 4X4 2.3 BI-TB DIESEL AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER LE CD 4X4 2.5 TB DIES.(IMPORT.)', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER LE CD 4X4 2.5 TB DIESEL AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER LE CD 4X4 2.5 TB DIESEL MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER PLATINUM CD 4X4 2.5 TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER S CD 4X2 2.5 TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER S CD 4X4 2.3 TB DIESEL MEC.', 'V10 PICKUPS/VANS/UTILITáRIOS', 150),
  ('NISSAN', 'FRONTIER S CD 4X4 2.5 TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER SE ATTACK CD 4X2 2.5 TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER SE ATTACK CD 4X4 2.5 TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER SE CD 4X4 2.3 BI-TB DIESEL AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER SE SERRANA CD 4X4 2.8 TB DIES', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER SE VIBE CD 2.8 TDI DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER SE/ SE ONE CD 4X2 2.8 TDI DIES', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER SE/SE STRIK CD 4X2 2.5 TB DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER SE/SE STRIK CD 4X4 2.5 TB DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER SE/SE STRIK/ONE CD 4X4 2.8 DIES', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER SEL CD 4X4 2.5 TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER SEL CD 4X4 2.5 TB DIESEL AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER SL CD 4X4 2.5TB DIESEL AUT', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER SV AT. CD 4X4 2.5 TB DIES. AUT.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER SV ATTACK CD 4X2 2.5 TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER SV ATTACK CD 4X4 2.5 TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER XE ATTACK CD 2.8 TDI DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER XE CD 4X2 2.5 TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER XE CD 4X4 2.5 TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER XE CS 4X2 2.8 TB INTERC. DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER XE/ XE TIT. CD 4X2 2.8 TDI DIES', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'FRONTIER XE/ XE TIT. CD 4X4 2.8 TDI DIES', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'GT-R 3.8 V6 BITURBO AUT.', 'Não informado', 0),
  ('NISSAN', 'INFINIT 3.0', 'Não informado', 0),
  ('NISSAN', 'KICKS ACTIVE 1.6 16V FLEX AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'KICKS ACTIVE S 1.6 16V FLEX AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'KICKS ADVANCE 1.6 16V FLEX AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'KICKS EXCLUSIVE 1.6 16V FLEX AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'KICKS RIO 2016 1.6 16V FLEXSTAR 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'KICKS S 1.6 16V FLEX 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'KICKS S 1.6 16V FLEXSTAR 5P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'KICKS S DIRECT 1.6 16V FLEX 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'KICKS SENSE 1.6 16V FLEX AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'KICKS SENSE 1.6 16V FLEX MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'KICKS SL 1.6 16V FLEXSTAR 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'KICKS SPECIAL ED. 1.6 16V FLEX 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'KICKS SPECIAL ED.1.6 16V FLEX 5P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'KICKS SV 1.6 16V FLEXSTAR 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'KICKS SV LIMITED 1.6 16V FLEX 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'KICKS UCL 1.6 16V FLEX 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'KICKS XPLAY 1.6 16V FLEX AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('NISSAN', 'KING-CAB SE 4X4 3.0 V6', 'Não informado', 0),
  ('NISSAN', 'LIVINA 1.6 16V FLEX FUEL 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('NISSAN', 'LIVINA 1.8 16V FLEX FUEL AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'LIVINA GRAND 1.8 16V FLEX FUEL AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'LIVINA GRAND 1.8 16V FLEX FUEL MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'LIVINA GRAND S 1.8 16V FLEX FUEL AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'LIVINA GRAND S 1.8 16V FLEX FUEL MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'LIVINA GRAND SL 1.8 16V FLEX FUEL AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'LIVINA GRAND SL 1.8 16V FLEX FUEL MEC', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'LIVINA NIGHT&DAY 1.6 16V FLEX FUEL MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'LIVINA S 1.6 16V FLEX FUEL MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'LIVINA S 1.8 16V FLEX FUEL AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'LIVINA SL 1.6 16V FLEX FUEL 5P', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'LIVINA SL 1.8 16V FLEX FUEL AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'LIVINA X-GEAR 1.6 16V FLEX FUEL MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'LIVINA X-GEAR S 1.6 16V FLEX FUEL', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'LIVINA X-GEAR SL 1.6 16V FLEX FUEL MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'LIVINA X-GEAR SL/X-GEAR 1.8 FLEX F. AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'MARCH 1.0 12V FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'MARCH 1.0 12V FLEXSTART 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'MARCH 1.0 16V FLEX FUEL 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'MARCH RIO2016 1.0 FLEX FUEL 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'MARCH RIO2016 1.6 FLEX FUEL 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'MARCH S 1.0 12V FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'MARCH S 1.0 16V FLEX FUEL 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'MARCH S 1.6 16V FLEX FUEL 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'MARCH S 1.6 16V FLEXSTART 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'MARCH SL 1.6 16V FLEX FUEL 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'MARCH SL 1.6 16V FLEXSTART 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'MARCH SL 1.6 16V FLEXSTART 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'MARCH SR 1.6 16V FLEX FUEL 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'MARCH SV 1.0 12V FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'MARCH SV 1.0 16V FLEX FUEL 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'MARCH SV 1.6 16V FLEX FUEL', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'MARCH SV 1.6 16V FLEXSTART 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'MARCH SV 1.6 16V FLEXSTART 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'MAXIMA 30G/ GLE 3.0 V6 24V', 'Não informado', 0),
  ('NISSAN', 'MAXIMA 30GV LIMITED 3.0 V6 24V', 'Não informado', 0),
  ('NISSAN', 'MAXIMA 30GV/30GV AERO/ GV 3.0 V6 24V', 'Não informado', 0),
  ('NISSAN', 'MAXIMA 30J', 'Não informado', 0),
  ('NISSAN', 'MAXIMA GXE 3.0', 'Não informado', 0),
  ('NISSAN', 'MAXIMA SE 3.0 V6', 'Não informado', 0),
  ('NISSAN', 'MICRA 1.0 V6', 'Não informado', 0),
  ('NISSAN', 'MURANO SE 3.5 V6 24V 231CV AUT', 'Não informado', 0),
  ('NISSAN', 'NX 2000', 'Não informado', 0),
  ('NISSAN', 'NX 2000 TARGA 2.0', 'Não informado', 0),
  ('NISSAN', 'PATHFINDER LE 2.5 16V TDI DIESEL AUT', 'Não informado', 0),
  ('NISSAN', 'PATHFINDER LE 4.0 V6 24V 266CV AUT', 'Não informado', 0),
  ('NISSAN', 'PATHFINDER SE 2.5 16V TDI DIESEL AUT.', 'Não informado', 0),
  ('NISSAN', 'PATHFINDER SE 3.3 V6 12V', 'Não informado', 0),
  ('NISSAN', 'PATHFINDER SE 4.0 V6 24V 266CV AUT.', 'Não informado', 0),
  ('NISSAN', 'PATHFINDER SE 4X4 3.0 12V AUT./MEC.', 'Não informado', 0),
  ('NISSAN', 'PATHFINDER SE LUXO 3.3 V6 12V', 'Não informado', 0),
  ('NISSAN', 'PATHFINDER SE LUXO 3.5 V6 24V 243CV', 'Não informado', 0),
  ('NISSAN', 'PATHFINDER SE TITANIUM 3.3 V6 12V', 'Não informado', 0),
  ('NISSAN', 'PATHFINDER XE 2.7 TB DIESEL', 'Não informado', 0),
  ('NISSAN', 'PATHFINDER XE 4X4', 'Não informado', 0),
  ('NISSAN', 'PICK-UP CD AX/ DX 4X4 DIESEL', 'Não informado', 0),
  ('NISSAN', 'PICK-UP CS DX 4X4 DIESEL', 'Não informado', 0),
  ('NISSAN', 'PICK-UP KING CAB DX 2.7 4X2 DIESEL', 'Não informado', 0),
  ('NISSAN', 'PRIMERA GXE 2.0 16V', 'Não informado', 0),
  ('NISSAN', 'QUEST GXE/ GLE/ SER', 'Não informado', 0),
  ('NISSAN', 'QUEST XE 3.0 V6', 'Não informado', 0),
  ('NISSAN', 'SENTRA 2.0', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'SENTRA 2.0/ 2.0 FLEX FUEL 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'SENTRA 2.0/ 2.0 FLEX FUEL 16V MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'SENTRA ADVANCE 2.0 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'SENTRA GLE', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'SENTRA GSX/ EX', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'SENTRA GXE/ SER', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'SENTRA S 2.0 FLEXSTART 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'SENTRA S 2.0/ 2.0 FLEX FUEL 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'SENTRA S 2.0/ 2.0 FLEX FUEL 16V MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'SENTRA SE 2.0 FLEX 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'SENTRA SL 2.0 FLEXSTART 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'SENTRA SL 2.0/ 2.0 FLEX FUEL 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'SENTRA SR 2.0 FLEX FUEL 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'SENTRA SR 2.0 FLEX FUEL 16V MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'SENTRA SV 2.0 FLEX 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'SENTRA UNIQUE 2.0 FLEX FUEL 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'STANZA XE 2.4 12V', 'Não informado', 0),
  ('NISSAN', 'SX 240 2.4', 'Não informado', 0),
  ('NISSAN', 'TERRANO II SE 2.7 DIESEL', 'Não informado', 0),
  ('NISSAN', 'TERRANO II SLX 2.7 DIESEL', 'Não informado', 0),
  ('NISSAN', 'TIIDA S 1.8/1.8 FLEX 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'TIIDA S 1.8/1.8 FLEX 16V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'TIIDA SEDAN 1.8 16V FLEX FUEL 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'TIIDA SEDAN 1.8 16V FLEX FUEL 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'TIIDA SL 1.8/1.8 FLEX 16V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'TIIDA SL 1.8/1.8 FLEX 16V MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('NISSAN', 'VERSA 1.0 12V FLEX 4P MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'VERSA ADVANCE 1.6 16V FLEX AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'VERSA EXCLUSIVE 1.6 16V FLEX AUT', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'VERSA S 1.0 12V FLEX 4P MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'VERSA S 1.6 16V FLEX FUEL 4P MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'VERSA S 1.6 16V FLEXSTART 4P MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'VERSA SENSE 1.6 16V FLEX AUT', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'VERSA SL 1.6 16V FLEX FUEL 4P MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'VERSA SL 1.6 16V FLEXSTART 4P AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'VERSA SL 1.6 16V FLEXSTART 4P MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'VERSA SPECIAL ED. 1.6 16V FLEXSTART AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'VERSA SV 1.6 16V FLEX FUEL 4P MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'VERSA SV 1.6 16V FLEXSTART 4P AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'VERSA SV 1.6 16V FLEXSTART 4P MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'VERSA UNIQUE 1.6 16V FLEX 4P MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'VERSA UNIQUE 1.6 16V FLEXSTART 4P AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('NISSAN', 'X-TRAIL GX 2.5 16V 180CV 5P', 'Não informado', 0),
  ('NISSAN', 'X-TRAIL LE 2.0 16V 138CV AUT.', 'Não informado', 0),
  ('NISSAN', 'X-TRAIL SE 2.0 16V 138CV AUT.', 'Não informado', 0),
  ('NISSAN', 'XTERRA ECOTRIP 4X4 140CV 2.8 TB INT.DIES', 'Não informado', 0),
  ('NISSAN', 'XTERRA SE 4X4 2.8 132/140CV TB INT.DIES.', 'Não informado', 0),
  ('NISSAN', 'XTERRA XE 4X4 2.8 132CV TB INT. DIESEL', 'Não informado', 0),
  ('NISSAN', 'ZX 300 3.0 BI-TURBO', 'Não informado', 0),
  ('NOMA', 'R / NOMA DOLLIE 2E', 'Não informado', 0),
  ('NOMA', 'R / NOMA SR3E27 BL', 'Não informado', 0),
  ('NOMA', 'R / NOMA SR3E27 CG', 'Não informado', 0),
  ('NOMA', 'SR / NOMA SR 3E 27 CG', 'Não informado', 0),
  ('NOMA', 'SR / NOMA SR2 E17 T2 CL', 'Não informado', 0),
  ('NOMA', 'SR / NOMA SR2 E18 RT1 CG', 'Não informado', 0),
  ('NOMA', 'SR / NOMA SR2 E18 RT2 CG', 'Não informado', 0),
  ('NOMA', 'SR / NOMA SR3E27 BF', 'Não informado', 0),
  ('NOMA', 'SR / NOMA SRAB2 E18 BCMD', 'Não informado', 0),
  ('NOMA', 'SR / NOMA SRAB2 E18 BCMT', 'Não informado', 0),
  ('NOMA', 'SR/NOMA SR3E27 BF', 'Não informado', 0),
  ('ORCA', 'AX 100', 'Não informado', 0),
  ('ORCA', 'AX 100-A', 'Não informado', 0),
  ('ORCA', 'JC 125', 'Não informado', 0),
  ('ORCA', 'JC 125-2', 'Não informado', 0),
  ('ORCA', 'JC 125-8', 'Não informado', 0),
  ('ORCA', 'QM 50', 'Não informado', 0),
  ('PALMEIRA', 'SR / PALMEIRA SRBI 2E', 'Não informado', 0),
  ('PALMEIRA', 'SR / PALMEIRA SRBI QR 2E', 'Não informado', 0),
  ('PASTRE', 'SR / PASTRE', 'Não informado', 0),
  ('PASTRE', 'SR / PASTRE SRB FURG 3E', 'Não informado', 0),
  ('PASTRE', 'SR / PASTRE SRBA 03EE', 'Não informado', 0),
  ('PASTRE', 'SR / PASTRE SRBA 26', 'Não informado', 0),
  ('PASTRE', 'SR / PASTRE SRBA 2E', 'Não informado', 0),
  ('PASTRE', 'SR/PASTRE SRBA 3E', 'Não informado', 0),
  ('PEGASSI', 'BR III 150CC', 'Não informado', 0),
  ('PEUGEOT', '106 KID 1.0', 'Não informado', 0),
  ('PEUGEOT', '106 PASSION 1.0 3P', 'Não informado', 0),
  ('PEUGEOT', '106 PASSION 1.0 5P', 'Não informado', 0),
  ('PEUGEOT', '106 QUIKSILVER 1.0 3P', 'Não informado', 0),
  ('PEUGEOT', '106 SELECTION 1.0 3P', 'Não informado', 0),
  ('PEUGEOT', '106 SELECTION 1.0 5P', 'Não informado', 0),
  ('PEUGEOT', '106 SOLEIL 1.0 3P', 'Não informado', 0),
  ('PEUGEOT', '106 SOLEIL 1.0 5P', 'Não informado', 0),
  ('PEUGEOT', '106 XN 3P E 5P', 'Não informado', 0),
  ('PEUGEOT', '106 XT', 'Não informado', 0),
  ('PEUGEOT', '2008 ALLURE 1.6 FLEX 16V 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', '2008 ALLURE 1.6 FLEX 16V 5P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', '2008 CROSSOWAY 1.6 FLEX 16V 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', '2008 GRIFFE 1.6 FLEX 16V 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', '2008 GRIFFE 1.6 FLEX 16V 5P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', '2008 GRIFFE 1.6 TURBO FLEX 16V 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', '2008 GRIFFE 1.6 TURBO FLEX 16V 5P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', '205 CJ CABRIOLET', 'Não informado', 0),
  ('PEUGEOT', '205 CTI CABRIOLET 1.4', 'Não informado', 0),
  ('PEUGEOT', '205 GTI 1.4', 'Não informado', 0),
  ('PEUGEOT', '205 XSI/ JUNIOR 1.4 3P', 'Não informado', 0),
  ('PEUGEOT', '206 ALLURE 1.6 FLEX 16V 3P', 'Não informado', 0),
  ('PEUGEOT', '206 ALLURE 1.6 FLEX 16V 5P', 'Não informado', 0),
  ('PEUGEOT', '206 AUTOMATIC (FELINE)1.6 FLEX 16V 5P', 'Não informado', 0),
  ('PEUGEOT', '206 CC 1.6 16V 2P', 'Não informado', 0),
  ('PEUGEOT', '206 FELINE 1.4/ 1.4 FLEX 8V 5P', 'Não informado', 0),
  ('PEUGEOT', '206 HOLIDAY 1.4 8V 75CV 3P', 'Não informado', 0),
  ('PEUGEOT', '206 HOLIDAY 1.4 8V 75CV 5P', 'Não informado', 0),
  ('PEUGEOT', '206 HOLIDAY 1.6 FLEX 16V 3P', 'Não informado', 0),
  ('PEUGEOT', '206 HOLIDAY 1.6 FLEX 16V 5P', 'Não informado', 0),
  ('PEUGEOT', '206 MOONLIGHT 1.4 FLEX 8V 3P', 'Não informado', 0),
  ('PEUGEOT', '206 MOONLIGHT 1.4 FLEX 8V 5P', 'Não informado', 0),
  ('PEUGEOT', '206 PASSION 1.6', 'Não informado', 0),
  ('PEUGEOT', '206 PASSION 1.6 16V 110CV 5P', 'Não informado', 0),
  ('PEUGEOT', '206 PRESENCE 1.4 FLEX 8V 3P', 'Não informado', 0),
  ('PEUGEOT', '206 PRESENCE 1.4 FLEX 8V 5P', 'AUTOMOVEL', 0),
  ('PEUGEOT', '206 RALLYE 1.6', 'Não informado', 0),
  ('PEUGEOT', '206 RALLYE 1.6/ 1.6 FLEX 16V 110CV 3P', 'Não informado', 0),
  ('PEUGEOT', '206 SELECT./PRESENCE 1.6/1.6 FLEX 16V 5P', 'Não informado', 0),
  ('PEUGEOT', '206 SELECTION 1.6 16V 110CV 3P', 'Não informado', 0),
  ('PEUGEOT', '206 SELECTION/ SENSATION 1.0 16V 3P', 'Não informado', 0),
  ('PEUGEOT', '206 SELECTION/ SENSATION 1.0 16V 5P', 'Não informado', 0),
  ('PEUGEOT', '206 SENSATION 1.4 FLEX 8V 3P', 'Não informado', 0),
  ('PEUGEOT', '206 SENSATION 1.4 FLEX 8V 5P', 'Não informado', 0),
  ('PEUGEOT', '206 SOLEIL 1.0 16V 5P', 'Não informado', 0),
  ('PEUGEOT', '206 SOLEIL 1.6 16V 110CV 5P', 'Não informado', 0),
  ('PEUGEOT', '206 SOLEIL 1.6 3P', 'Não informado', 0),
  ('PEUGEOT', '206 SOLEIL 1.6 5P', 'Não informado', 0),
  ('PEUGEOT', '206 SOLEIL/ QUIKSILVER 1.0 16V 3P', 'Não informado', 0),
  ('PEUGEOT', '206 SOLEIL/ QUIKSILVER 1.6 16V 110CV 3P', 'Não informado', 0),
  ('PEUGEOT', '206 SW AUTOMATIC (FELINE)1.6 FLEX 16V 5P', 'Não informado', 0),
  ('PEUGEOT', '206 SW ESCAPADE 1.6 16V FLEX 5P', 'Não informado', 0),
  ('PEUGEOT', '206 SW FELINE 1.6/ 1.6 FLEX 16V 5P', 'Não informado', 0),
  ('PEUGEOT', '206 SW MOONLIGHT 1.4 FLEX 8V 5P', 'Não informado', 0),
  ('PEUGEOT', '206 SW PRESENCE 1.4/ 1.4 FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '206 SW PRESENCE 1.6/1.6 FLEX 16V 5P', 'Não informado', 0),
  ('PEUGEOT', '206 TECHNO 1.0 16V 70CV 5P', 'Não informado', 0),
  ('PEUGEOT', '206 TECHNO/ FELINE 1.6/ 1.6 FLEX 16V 5P', 'Não informado', 0),
  ('PEUGEOT', '207 ACTIVE 1.4 FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 BLUE LION 1.4 FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 QUIKSILVER 1.4 FLEX 8V 3P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 QUIKSILVER 1.4 FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 QUIKSILVER 1.6 FLEX 16V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 SED. PASSION XR SPORT 1.4 FLEX 8V 4P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 SEDAN ACTIVE 1.4 FLEX 8V 4P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 SEDAN ALLURE 1.4 FLEX 8V 4P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 SEDAN PASSION XR 1.4 FLEX 8V 4P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 SEDAN PASSION XS 1.6 FLEX 16V 4P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 SEDAN PASSION XS 1.6 FLEX 16V 4P AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 SW ESCAPADE 1.6 16V FLEX 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 SW XR 1.4 FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 SW XR SPORT 1.4 FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 SW XS 1.6 FLEX 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 X-LINE 1.4 FLEX 8V 3P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 X-LINE 1.4 FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 XR 1.4 FLEX 8V 3P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 XR 1.4 FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 XR SPORT 1.4 FLEX 8V 3P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 XR SPORT 1.4 FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 XS 1.6 FLEX 16V 3P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 XS 1.6 FLEX 16V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '207 XS 1.6 FLEX 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '208 ACTIVE 1.2 FLEX 12V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '208 ACTIVE PACK 1.2 FLEX 12V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '208 ACTIVE PACK 1.6 FLEX 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '208 ACTIVE/ACTIVE PACK 1.5 FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '208 ALLURE 1.2 FLEX 12V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '208 ALLURE 1.5 FLEX 8V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '208 ALLURE 1.6 FLEX 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '208 ALLURE INCONCERT 1.5 FLEX 8V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '208 ALLURE INCONCERT 1.6 FLEX 16V 5P AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '208 GRIFFE 1.6 FLEX 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '208 GRIFFE 1.6 FLEX 16V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '208 GT 1.6 THP FLEX 16V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '208 LIKE 1.6 FLEX 16V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '208 PREMIER 1.6 FLEX 16V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '208 SPORT 1.6 FLEX 16V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '208 STYLE 1.0 FLEX 6V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '208 URBANTECH1.6 FLEX 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '3008 ALLURE 1.6 TURBO 16V 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', '3008 GRIFFE 1.6 TURBO 16V 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', '3008 ROLAND GARROS 1.6 TURBO 16V 5P', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', '306 BREAK PASSION 1.8 16V', 'Não informado', 0),
  ('PEUGEOT', '306 CABRIOLET 1.8/ MI 16V', 'Não informado', 0),
  ('PEUGEOT', '306 CABRIOLET 2.0', 'Não informado', 0),
  ('PEUGEOT', '306 GTI 2.0 16V', 'Não informado', 0),
  ('PEUGEOT', '306 PASSION 1.8 16V', 'Não informado', 0),
  ('PEUGEOT', '306 PASSION SEDAN 1.8 16V', 'Não informado', 0),
  ('PEUGEOT', '306 RALLYE 1.8 16V', 'Não informado', 0),
  ('PEUGEOT', '306 S16 2.0 3P', 'Não informado', 0),
  ('PEUGEOT', '306 SELECTION HATCH 1.8 16V', 'Não informado', 0),
  ('PEUGEOT', '306 SELECTION SEDAN 1.8 16V', 'Não informado', 0),
  ('PEUGEOT', '306 SI/ SL 1.8', 'Não informado', 0),
  ('PEUGEOT', '306 SOLEIL 1.8 16V 2P', 'Não informado', 0),
  ('PEUGEOT', '306 SOLEIL 1.8 16V 4P', 'Não informado', 0),
  ('PEUGEOT', '306 SOLEIL BREAK 1.8 16V 5P', 'Não informado', 0),
  ('PEUGEOT', '306 SOLEIL HATCH 1.8 16V 5P', 'Não informado', 0),
  ('PEUGEOT', '306 SR', 'Não informado', 0),
  ('PEUGEOT', '306 XN 1.8', 'Não informado', 0),
  ('PEUGEOT', '306 XR 1.8 / XR BREAK 1.8 16V', 'Não informado', 0),
  ('PEUGEOT', '306 XS 1.6 3P/ ST 1.8I 4P', 'Não informado', 0),
  ('PEUGEOT', '306 XSI 2.0 3/5P', 'Não informado', 0),
  ('PEUGEOT', '307 CC 2.0 16V 138CV 2P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 CC 2.0 16V 2P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 FELINE 2.0/ 2.0 FLEX 16V 5P MEC', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 FELINE/GRIFF/PREMI. 2.0 FLEX 5P AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 MILLESIM200 1.6 FLEX 16V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 PASSION 1.6 16V 110CV 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 PASSION 2.0 16V 138CV 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 PRESENCE 2.0 FLEX 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 RALLYE 1.6 16V 110CV 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 RALLYE 2.0 16V 138CV 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 RALLYE 2.0 16V 138CV 5P AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 SED. FELINE 2.0/ 2.0 FLEX 16V 4P MEC', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 SED. PRESENCE 1.6 FLEX 16V 4P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 SED. PRESENCE 2.0 FLEX 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 SED.FELINE/GRIFF 2.0/2.0 FLEX 4P AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 SOLEIL/ PRESENCE 1.6/1.6 FLEX 16V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 SW 2.0 16V 138CV 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 SW 2.0 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 SW ALLURE 2.0 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 SW ALLURE 2.0 16V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '307 SW FELINE 2.0 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '308 ACTIVE 1.6 FLEX 16V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '308 ALLURE 1.6 FLEX 16V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '308 ALLURE 1.6 TURBO FLEX 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '308 ALLURE 2.0 FLEX 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '308 ALLURE 2.0 FLEX 16V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '308 BUSINESS 1.6 TURBO FLEX 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '308 CC 1.6 TURBO 16V 2P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '308 CC ROLAND GARROS 1.6 TURBO16V 2P AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '308 FELINE 2.0 FLEX 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '308 FELINE/GRIFFE 1.6 TURBO 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '308 GRIFFE 1.6 TURBO FLEX 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '308 QUIKSILVER 1.6 FLEX 16V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '308 ROLAND GARROS 1.6 TB FLEX 16V 5P AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '308 ROLAND GARROS 1.6 TURBO 16V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '405 GLI/ GL 1.6', 'Não informado', 0),
  ('PEUGEOT', '405 GRI 1.8', 'Não informado', 0),
  ('PEUGEOT', '405 MI 2.0 16V', 'Não informado', 0),
  ('PEUGEOT', '405 SRI 1.8', 'Não informado', 0),
  ('PEUGEOT', '405 SRI 2.0', 'Não informado', 0),
  ('PEUGEOT', '405 SRI BREAK', 'Não informado', 0),
  ('PEUGEOT', '405 STI', 'Não informado', 0),
  ('PEUGEOT', '406 BREAK 2.0 16V', 'Não informado', 0),
  ('PEUGEOT', '406 BREAK 3.0 V6 24V', 'Não informado', 0),
  ('PEUGEOT', '406 BREAK ST 2.0', 'Não informado', 0),
  ('PEUGEOT', '406 CUPÊ 3.0 24V AUT.', 'Não informado', 0),
  ('PEUGEOT', '406 CUPÊ 3.0 24V MEC.', 'Não informado', 0),
  ('PEUGEOT', '406 FAMILIALE 2.0 16V AUT.', 'Não informado', 0),
  ('PEUGEOT', '406 FAMILIALE 2.0 16V MEC.', 'Não informado', 0),
  ('PEUGEOT', '406 SEDAN 2.0 AUT.', 'Não informado', 0),
  ('PEUGEOT', '406 SEDAN 2.0 MEC.', 'Não informado', 0),
  ('PEUGEOT', '406 SEDAN 3.0 V6 24V', 'Não informado', 0),
  ('PEUGEOT', '406 ST 2.0 16V MEC', 'Não informado', 0),
  ('PEUGEOT', '406 ST/ SVA 2.0 16V AUT', 'Não informado', 0),
  ('PEUGEOT', '406 SV 2.0 16V', 'Não informado', 0),
  ('PEUGEOT', '406 SVA 3.0 24V', 'Não informado', 0),
  ('PEUGEOT', '406 SVE 3.0 24V', 'Não informado', 0),
  ('PEUGEOT', '407 SED. ALLURE 2.0 16V 4P AUT.', 'Não informado', 0),
  ('PEUGEOT', '407 SED. FELINE 3.0 V6 211CV 4P AUT.', 'Não informado', 0),
  ('PEUGEOT', '407 SED. GRIFFE 3.0 V6 211CV 4P AUT.', 'Não informado', 0),
  ('PEUGEOT', '407 SEDAN 2.0 16V 138CV 4P AUT', 'Não informado', 0),
  ('PEUGEOT', '407 SEDAN 3.0 V6 211CV 4P AUT', 'Não informado', 0),
  ('PEUGEOT', '407 SW 2.0 16V 5P AUT', 'Não informado', 0),
  ('PEUGEOT', '407 SW 3.0 V6 211CV 5P AUT', 'Não informado', 0),
  ('PEUGEOT', '407 SW ALLURE 2.0 16V 5P AUT.', 'Não informado', 0),
  ('PEUGEOT', '407 SW FELINE 3.0 V6 211CV 5P AUT.', 'Não informado', 0),
  ('PEUGEOT', '408 SED. BUSINESS 1.6 TB FLEX 16V 4P AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '408 SED. R.GARROS 1.6 TB FLEX 16V 4P AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '408 SEDAN ALLURE 2.0 FLEX 16V 4P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '408 SEDAN ALLURE 2.0 FLEX 16V 4P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '408 SEDAN FELINE 2.0 FLEX 16V 4P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '408 SEDAN GRIFFE 1.6 TB FLEX 16V 4P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '408 SEDAN GRIFFE 1.6 TURBO 16V 4P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '408 SEDAN GRIFFE 2.0 FLEX 16V 4P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '408 SEDAN LIMITED 2.0 FLEX 16V 4P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', '5008 GRIFFE 1.6 TURBO 16V 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 150),
  ('PEUGEOT', '5008 GRIFFE PACK 1.6 TURBO 16V 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 150),
  ('PEUGEOT', '504 GD 2.3 DIESEL', 'Não informado', 0),
  ('PEUGEOT', '504 GRD 2.3 DIESEL', 'Não informado', 0),
  ('PEUGEOT', '505 SR/ SRI/ SRX', 'Não informado', 0),
  ('PEUGEOT', '508 THP 1.6 TURBO 16V 4P AUT.', 'Não informado', 0),
  ('PEUGEOT', '605 SRI 3.0', 'Não informado', 0),
  ('PEUGEOT', '605 SRI/ SLI 2.0', 'Não informado', 0),
  ('PEUGEOT', '605 SV 3.0 AUT', 'Não informado', 0),
  ('PEUGEOT', '605 SV-3 3.0 V6 24V', 'Não informado', 0),
  ('PEUGEOT', '607 SEDAN 3.0 V6', 'Não informado', 0),
  ('PEUGEOT', '806 ST TURBO', 'Não informado', 0),
  ('PEUGEOT', '806 SV 2.0 TURBO', 'Não informado', 0),
  ('PEUGEOT', '807 2.0 16V 138CV 5P AUT', 'Não informado', 0),
  ('PEUGEOT', 'BOXER 2.3 FURG.TB DIES. CURTO/MÉDIO', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', 'BOXER 2.3 FURG.TB DIES. MÉD/ LONGOT.ALTO', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', 'BOXER 2.3 LH EXECUTIVE 15/16L TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', 'BOXER 2.3 MINIBUS 15/16L TB DIESEL.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', 'BOXER 2.5 DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', 'BOXER 2.8 10LUG. DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', 'BOXER 2.8 15L/16L DIES./TB DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', 'BOXER 2.8 FURG. TB DIES. MÉD/LONGOT.ALTO', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', 'BOXER 2.8 FURGÃO DIES/ TB DIES.CURTO/MÉD', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', 'BUXY 50', 'Não informado', 0),
  ('PEUGEOT', 'ELYSEO 125', 'Não informado', 0),
  ('PEUGEOT', 'EXPERT BUSINESS 1.6 TURBO DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', 'EXPERT BUSINESS PACK 1.6 TURBO DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('PEUGEOT', 'HOGGAR ACTIVE 1.4 FLEX 8V 2P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', 'HOGGAR ALLURE 1.4 FLEX 8V 2P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', 'HOGGAR ESCAPADE 1.6 FLEX 16V 2P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', 'HOGGAR X-LINE 1.4 FLEX 8V 2P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', 'HOGGAR XR 1.4 FLEX 8V 2P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', 'PARTNER FURGÃO 1.6 16V/ 1.6 16V FLEX 3P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', 'PARTNER FURGÃO 1.8 3P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', 'PARTNER VAN 1.6 FLEX 16V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', 'PARTNER VAN ESCAPADE 1.6 FLEX 16V 5P', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('PEUGEOT', 'RCZ 1.6 TURBO16V 2P AUT.', 'Não informado', 0),
  ('PEUGEOT', 'SCOOTELEC', 'Não informado', 0),
  ('PEUGEOT', 'SPEEDAKE 50', 'Não informado', 0),
  ('PEUGEOT', 'SPEEDFIGHT 100', 'Não informado', 0),
  ('PEUGEOT', 'SPEEDFIGHT 50', 'Não informado', 0),
  ('PEUGEOT', 'SPEEDFIGHT 50-LC', 'Não informado', 0),
  ('PEUGEOT', 'SQUAB 50', 'Não informado', 0),
  ('PEUGEOT', 'TREKKER 100', 'Não informado', 0),
  ('PEUGEOT', 'VIVACITY 50', 'Não informado', 0),
  ('PEUGEOT', 'ZENITH 50', 'Não informado', 0),
  ('PIAGGIO', 'BERVERLY TOURING 300 I.E 278CC', 'Não informado', 0),
  ('PIAGGIO', 'BEVERLY 250 224CC', 'Não informado', 0),
  ('PIAGGIO', 'BEVERLY 500 460CC', 'Não informado', 0),
  ('PIAGGIO', 'BEVERLY SPORT TOURING 350 I.E 330CC', 'Não informado', 0),
  ('PIAGGIO', 'LIBERTY 200 200CC', 'Não informado', 0),
  ('PIAGGIO', 'LIBERTY S 150 IGET', 'Não informado', 0),
  ('PIAGGIO', 'MP3 300 278CC', 'Não informado', 0),
  ('PIAGGIO', 'MP3 400 398CC', 'Não informado', 0),
  ('PIAGGIO', 'MP3 500 493CC', 'Não informado', 0),
  ('PIAGGIO', 'NRG MC3 DD 49.4CC', 'Não informado', 0),
  ('PIAGGIO', 'RUNNER 50', 'Não informado', 0),
  ('PIAGGIO', 'VESPA 946 EMPORIO ARMANI 150', 'Não informado', 0),
  ('PIAGGIO', 'VESPA CLASSIC VXL 150', 'Não informado', 0),
  ('PIAGGIO', 'VESPA GTS 300 ABS', 'Não informado', 0),
  ('PIAGGIO', 'VESPA GTS 300 SUPER ABS', 'Não informado', 0),
  ('PIAGGIO', 'VESPA GTS 300 SUPER SPORT ABS', 'Não informado', 0),
  ('PIAGGIO', 'VESPA GTS 300 TOURING ABS', 'Não informado', 0),
  ('PIAGGIO', 'VESPA GTS/SUPER/SUPER SPORT 250 I.E', 'Não informado', 0),
  ('PIAGGIO', 'VESPA GTV/GTS TOURING 300 I.E 278CC', 'Não informado', 0),
  ('PIAGGIO', 'VESPA LX 150 151CC', 'Não informado', 0),
  ('PIAGGIO', 'VESPA LXV 150 155CC', 'Não informado', 0),
  ('PIAGGIO', 'VESPA PRIMAVERA 125 IGET ABS', 'Não informado', 0),
  ('PIAGGIO', 'VESPA PRIMAVERA 150 IGET ABS', 'Não informado', 0),
  ('PIAGGIO', 'VESPA PX 150 ORIGINALE', 'Não informado', 0),
  ('PIAGGIO', 'VESPA PX 200', 'Não informado', 0),
  ('PIAGGIO', 'VESPA SPRINT 150 S IGET ABS', 'Não informado', 0),
  ('PIAGGIO', 'ZIP 50', 'Não informado', 0),
  ('PLYMOUTH', 'GRAN VOYAGER LE 2.5', 'Não informado', 0),
  ('PLYMOUTH', 'SUNDANCE 2.5', 'Não informado', 0),
  ('PONTIAC', 'TRANS-AM 5.7 V8', 'Não informado', 0),
  ('PONTIAC', 'TRANS-SPORT SE 3.1', 'Não informado', 0),
  ('PORSCHE', '718 BOXSTER 2.0 300CV', 'Não informado', 0),
  ('PORSCHE', '718 BOXSTER S 2.5 350CV', 'Não informado', 0),
  ('PORSCHE', '718 CAYMAN 2.0 300CV', 'Não informado', 0),
  ('PORSCHE', '718 CAYMAN GTS 2.5 365CV', 'Não informado', 0),
  ('PORSCHE', '718 CAYMAN S 2.5 350CV', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA 4 CABRIOLET 3.0 370CV', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA 4 COUPE 3.0 370CV', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA 4 GTS COUPE 3.0 24V (991)', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA 4 GTS COUPÉ 3.8 24V (991)', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA 4 GTS TARGA 3.0 24V (991)', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA 4 GTS TARGA 3.8 24V (991)', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA 4S CABRIOLET 3.0 420CV', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA 4S CABRIOLET-4 3.6/3.8', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA 4S COUPE 3.0 420CV', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA 4S COUPÉ-4 3.6/3.8', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA CABRIOLET 3.0 370CV', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA CABRIOLET 3.4/ 3.6 MEC', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA CABRIOLET 3.4/ 3.6 TIPTRONIC', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA CABRIOLET-4 3.4 MEC', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA CABRIOLET-4 3.4 TIPTRONIC', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA COUPE 3.0 370CV', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA COUPÉ', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA COUPÉ BLACK EDITION 3.6 24V', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA COUPÉ GTS 3.8 24V 408CV', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA COUPÉ TIPTRONIC', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA COUPÉ-4 3.4/ 3.6', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA COUPÉ-4 3.4/ 3.6 TIPTRONIC', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA EVO CABRIOLET', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA EVO CABRIOLET-4', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA EVO COUPÉ', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA EVO COUPÉ-4', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA GT3 RS', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA GT3/ GT2 STREET', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA GTS CABRIOLET 3.0 450CV(991)', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA GTS CABRIOLET 3.8 24V (991)', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA GTS COUPE 3.0 (991)', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA GTS COUPÉ 3.8 24V (991)', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA S 50TH COUPÉ 3.8 24V(991)', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA S CABRIOLET 3.0 420CV', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA S CABRIOLET 3.8 24V', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA S CABRIOLET 3.8 24V (991)', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA S COUPE 3.0 420CV', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA S COUPÉ 3.8 24V', 'Não informado', 0),
  ('PORSCHE', '911 CARRERA S COUPÉ 3.8 24V (991)', 'Não informado', 0),
  ('PORSCHE', '911 GT3 4.0 500CV (991)', 'Não informado', 0),
  ('PORSCHE', '911 TARGA 3.6', 'Não informado', 0),
  ('PORSCHE', '911 TARGA 4 3.0 370CV', 'Não informado', 0),
  ('PORSCHE', '911 TARGA 4S', 'Não informado', 0),
  ('PORSCHE', '911 TARGA 4S 3.0 420CV', 'Não informado', 0),
  ('PORSCHE', '911 TURBO CABRIOLET 3.6/3.8', 'Não informado', 0),
  ('PORSCHE', '911 TURBO COUPÉ 3.6 / 3.8', 'Não informado', 0),
  ('PORSCHE', '911 TURBO S CABRIOLET 3.6/3.8 24V', 'Não informado', 0),
  ('PORSCHE', '911 TURBO S COUPÉ 3.6/3.8 24V', 'Não informado', 0),
  ('PORSCHE', '928 GTS 5.4 32V', 'Não informado', 0),
  ('PORSCHE', '968 CABRIOLET 3.0', 'Não informado', 0),
  ('PORSCHE', '968 COUPÉ 3.0 16V', 'Não informado', 0),
  ('PORSCHE', 'BOXSTER 2.7 265CV', 'Não informado', 0),
  ('PORSCHE', 'BOXSTER 2.9 255CV', 'Não informado', 0),
  ('PORSCHE', 'BOXSTER GTS 3.4 330CV', 'Não informado', 0),
  ('PORSCHE', 'BOXSTER MEC.', 'Não informado', 0),
  ('PORSCHE', 'BOXSTER S', 'Não informado', 0),
  ('PORSCHE', 'BOXSTER S 3.4 310CV', 'Não informado', 0),
  ('PORSCHE', 'BOXSTER S 3.4 315CV', 'Não informado', 0),
  ('PORSCHE', 'BOXSTER S TIPTRONIC', 'Não informado', 0),
  ('PORSCHE', 'BOXSTER SPYDER 3.4 320CV', 'Não informado', 0),
  ('PORSCHE', 'BOXSTER SPYDER 3.8 375CV', 'Não informado', 0),
  ('PORSCHE', 'BOXSTER TIPTRONIC', 'Não informado', 0),
  ('PORSCHE', 'CAYENNE GTS 3.6 BI-TURBO 440CV', 'Não informado', 0),
  ('PORSCHE', 'CAYENNE GTS 4.8 405/420CV', 'Não informado', 0),
  ('PORSCHE', 'CAYENNE PLATINUM ED. 3.6 BI-TURBO', 'Não informado', 0),
  ('PORSCHE', 'CAYENNE S 3.6 BI-TURBO 420CV', 'Não informado', 0),
  ('PORSCHE', 'CAYENNE S 4.5/4.8', 'Não informado', 0),
  ('PORSCHE', 'CAYENNE S E-HYBRID 3.0 V6 416CV', 'Não informado', 0),
  ('PORSCHE', 'CAYENNE S PLATINUM ED.E-HYBRID 3.0', 'Não informado', 0),
  ('PORSCHE', 'CAYENNE TURBO 4.5/4.8', 'Não informado', 0),
  ('PORSCHE', 'CAYENNE TURBO S 4.5/ 4.8 32V', 'Não informado', 0),
  ('PORSCHE', 'CAYENNE V6 3.2/3.6 24V', 'Não informado', 0),
  ('PORSCHE', 'CAYMAN 2.7/ 2.9', 'Não informado', 0),
  ('PORSCHE', 'CAYMAN GT4 3.8 385CV', 'Não informado', 0),
  ('PORSCHE', 'CAYMAN GTS 3.4 340CV', 'Não informado', 0),
  ('PORSCHE', 'CAYMAN R 3.4 330CV', 'Não informado', 0),
  ('PORSCHE', 'CAYMAN S 3.4', 'Não informado', 0),
  ('PORSCHE', 'MACAN 2.0 TURBO 237CV', 'Não informado', 0),
  ('PORSCHE', 'MACAN GTS 3.0 BI-TURBO 360CV', 'Não informado', 0),
  ('PORSCHE', 'MACAN S 3.0 BI-TURBO 340CV', 'Não informado', 0),
  ('PORSCHE', 'MACAN TURBO 3.6 BI-TURBO 400CV', 'Não informado', 0),
  ('PORSCHE', 'MACAN TURBO PERFORMNCE 3.6 BI-TB V6', 'Não informado', 0),
  ('PORSCHE', 'PANAMERA 3.0 330CV', 'Não informado', 0),
  ('PORSCHE', 'PANAMERA 3.6 V6 300CV/310CV', 'Não informado', 0),
  ('PORSCHE', 'PANAMERA 4 E-HYBRID 2.9 462CV', 'Não informado', 0),
  ('PORSCHE', 'PANAMERA 4S 3.0 440CV', 'Não informado', 0),
  ('PORSCHE', 'PANAMERA 4S 4.8 400CV', 'Não informado', 0),
  ('PORSCHE', 'PANAMERA 4S EXECUTIVE 3.0 440CV', 'Não informado', 0),
  ('PORSCHE', 'PANAMERA EDITION 3.6 V6 310CV', 'Não informado', 0),
  ('PORSCHE', 'PANAMERA GT-S 4.8', 'Não informado', 0),
  ('PORSCHE', 'PANAMERA S 3.0 BI-TURBO 420CV', 'Não informado', 0),
  ('PORSCHE', 'PANAMERA S 4.8 400CV', 'Não informado', 0),
  ('PORSCHE', 'PANAMERA TURBO 4.0 550CV', 'Não informado', 0),
  ('PORSCHE', 'PANAMERA TURBO 4.8 500CV/520CV', 'Não informado', 0),
  ('PORSCHE', 'PANAMERA TURBO S 4.8', 'Não informado', 0),
  ('PORSCHE', 'PANAMERA TURBO S E-HYBRID 4.0 550CV', 'Não informado', 0),
  ('PUMA-ALFA', '7900 CB 2P (DIESEL)', 'Não informado', 0),
  ('PUMA-ALFA', '7900 CB TURBO 2P (DIESEL)', 'Não informado', 0),
  ('PUMA-ALFA', '7900 CD 4P (DIESEL)', 'Não informado', 0),
  ('PUMA-ALFA', '7900 CD TURBO 4P (DIESEL)', 'Não informado', 0),
  ('PUMA-ALFA', '9000 2P (DIESEL)', 'Não informado', 0),
  ('PUMA-ALFA', '914 CD 4P (DIESEL)', 'Não informado', 0),
  ('PUMA-ALFA', '914 CS 2P (DIESEL)', 'Não informado', 0),
  ('RAM', '2500 LARAMIE SLT 6.7 TDI CD 4X4 DIESEL', 'Não informado', 0),
  ('RAM', '2500 LARAMIE SLT TROPIV. 6.7 4X4 DIESEL', 'Não informado', 0),
  ('RAM', '3500 LARAMIE 6.7 TB CD 4X4 DIESEL', 'Não informado', 0),
  ('RANDON', 'R / RANDON', 'Não informado', 0),
  ('RANDON', 'R / RANDON RE DL', 'Não informado', 0),
  ('RANDON', 'R / RANDON SR BA', 'Não informado', 0),
  ('RANDON', 'R / RANDON SR BA AB', 'Não informado', 0),
  ('RANDON', 'R / RANDON SR BA GR', 'Não informado', 0),
  ('RANDON', 'R / RANDON SR CA', 'Não informado', 0),
  ('RANDON', 'R / RANDON SR CS TR', 'Não informado', 0),
  ('RANDON', 'R / RANDON SR FC FR', 'Não informado', 0),
  ('RANDON', 'R / RANDON SR GR TR', 'Não informado', 0),
  ('RANDON', 'R / RANDON SR SL CI', 'Não informado', 0),
  ('RANDON', 'R RADIAL RCF 751', 'V5 AUTOMOVEL COMUM', 0),
  ('RANDON', 'REBOQUE / CARGA SECA 3 EIXOS/QQ TIPO', 'Não informado', 0),
  ('RANDON', 'SR / JLRP BOIADEIRO 3E', 'Não informado', 0),
  ('RANDON', 'SR / NIJU NJSRFR 3E', 'Não informado', 0),
  ('RANDON', 'SR / RANDON', 'Não informado', 0),
  ('RANDON', 'SR / RANDON SR CA', 'Não informado', 0),
  ('RANDON', 'SR / RANDON SR CC', 'Não informado', 0),
  ('RANDON', 'SR / RANDON SR CS TR', 'Não informado', 0),
  ('RANDON', 'SR / RANDON SR FG', 'Não informado', 0),
  ('RANDON', 'SR / RANDON SR QR TR', 'Não informado', 0),
  ('RANDON', 'SR / RANDON SR TQ', 'Não informado', 0),
  ('RANDON', 'SR / RANDON SRBO CA', 'Não informado', 0),
  ('RANDON', 'SR / RANDON SRFG CG', 'Não informado', 0),
  ('RANDON', 'SR / RANDON SRTQ IQ', 'Não informado', 0),
  ('RANDON', 'SR / RANDONSP SRFG LO', 'Não informado', 0),
  ('RECROSUL', 'R / RECROSUL', 'Não informado', 0),
  ('RECROSUL', 'SR / RECROSUL SRFM', 'Não informado', 0),
  ('RECROSUL', 'SR / RECRUSUL SRTX', 'Não informado', 0),
  ('RECRUSUL', 'SR / RECRUSUL SRTX', 'Não informado', 0),
  ('REGAL RAPTOR', 'BLACK JACK 320', 'Não informado', 0),
  ('REGAL RAPTOR', 'FENIX GOLD 240', 'Não informado', 0),
  ('REGAL RAPTOR', 'GHOST 270/320', 'Não informado', 0),
  ('REGAL RAPTOR', 'SPYDER 320', 'Não informado', 0),
  ('RELY', 'LINK 1.3 16V 5P', 'Não informado', 0),
  ('RELY', 'PICK-UP Q22D CS 1.0 2P', 'Não informado', 0),
  ('RELY', 'PICK-UP Q22E CD 1.0 4P', 'Não informado', 0),
  ('RELY', 'Q22B CS 1.0 2P - RELY', 'UTILITARIO LEVE', 0),
  ('RELY', 'VAN Q22 1.0 5P', 'Não informado', 0),
  ('RENAULT', '19 16S/ RT 16V', 'Não informado', 0),
  ('RENAULT', '19 RN', 'Não informado', 0),
  ('RENAULT', '19 RT 1.8/ 1.8I', 'Não informado', 0),
  ('RENAULT', '19 RT 1.8/ 1.8I CONV.', 'Não informado', 0),
  ('RENAULT', '21 GTX 2.0', 'Não informado', 0),
  ('RENAULT', '21 NEVADA GTX 2.2', 'Não informado', 0),
  ('RENAULT', '21 NEVADA TXE 2.2', 'Não informado', 0),
  ('RENAULT', '21 TXE/ TXI 2.2', 'Não informado', 0),
  ('RENAULT', 'CAPTUR ICONIC 1.3 TB 16V FLEX 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'CAPTUR INTENSE 1.3 TB 16V FLEX 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'CAPTUR INTENSE 1.6 16V FLEX 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'CAPTUR INTENSE 2.0 16V 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'CAPTUR INTENSE 2.0 16V FLEX 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'CAPTUR INTENSE BOSE 1.6 16V FLEX 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'CAPTUR INTENSE BOSE 2.0 16V FLEX 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'CAPTUR LIFE 1.6 16V FLEX 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'CAPTUR ZEN 1.3 TB 16V FLEX 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'CAPTUR ZEN 1.6 16V 5P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'CAPTUR ZEN 1.6 16V FLEX 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'CAPTUR ZEN 1.6 16V FLEX 5P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'CLIO AUTH. /AIR HI-FLEX 1.6 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO AUTHENTIQUE 1.0 8V 3P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO AUTHENTIQUE 1.0/1.0 HI-POWER 16V 3P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO AUTHENTIQUE HI-FLEX 1.0 16V 3P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO AUTHENTIQUE HI-FLEX 1.0 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO AUTHENTIQUE HI-FLEX 1.6 16V 3P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO CAMPUS HI-FLEX 1.0 16V 3P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO CAMPUS HI-FLEX 1.0 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO DYNAMIQUE 1.0/ 1.0 HI-POWER 16V 3P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO DYNAMIQUE 1.6 16V 110CV 3P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO DYNAMIQUE HI-FLEX 1.6 16V 3P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO EXPRESSION 1.0 8V 60CV 3P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO EXPRESSION 1.0/1.0 HI-POWER 16V 3P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO EXPRESSION HI-FLEX 1.0 16V 3P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO EXPRESSION HI-FLEX 1.0 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO GETUP HI-FLEX 1.0 16V 3P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO GETUP HI-FLEX 1.0 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO HI-FLEX 1.0 16V 3P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO HI-FLEX 1.0 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO HI-FLEX 1.6 16V 3P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO HI-FLEX/ EXPRES. HI-FLEX 1.6 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO PRIVILÈGE HI-FLEX 1.0 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO PRIVILÈGE HI-FLEX 1.6 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO RL / YAHOO/ AUTHENT. 1.0 8V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO RL 1.6 3P/5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO RL ALIZÉ/ AUTHENT. 1.6 16V 110CV 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO RL/ JP/AUTH.1.0/1.0 HI-POWER 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO RN 1.6 3P (IMPORTADO)', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO RN 1.6 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO RN/ ALIZÉ/ EXP.1.0/1.0 HI-POWER 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO RN/ EXPRESSION 1.0 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO RN/ EXPRESSION 1.6 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO RT 1.6 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO RT/ PRIVIL. 1.0/1.0 HI-POWER 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO RT/ PRIVILÈGE 1.6 16V 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO SED RT/ PRIVILÈGE/ BOTIC 1.6 16V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO SED. ALIZÉ 1.6/ 1.6 HI-FLEX 16V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO SED. AUTHENTIQUE HI-FLEX 1.0 16V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO SED. AUTHENTIQUE HI-FLEX 1.6 16V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO SED. EXPRESSION HI-FLEX 1.0 16V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO SED. HI-FLEX/EXP.HI-FLEX 1.6 16V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO SED. PRIVILÈGE HI-FLEX 1.0 16V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO SED. PRIVILÈGE HI-FLEX 1.6 16V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO SED.RL/AUTH.1.0/1.0 HI-POWER 16V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO SED.RN/ALIZÉ/BOTIC./EXP.1.0 HI-POW.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO SED.RT/PRIVIL.1.0/1.0 HI-POW.16V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO SEDAN AUTHENTIQUE 1.6 16V 110CV 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO SEDAN EGEUS HI-FLEX 1.0 16V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO SEDAN EGEUS HI-FLEX 1.6 16V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO SEDAN RN/ EXPRESSION 1.6 16V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO SI 1.6 16V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'CLIO TECH RUN 1.0 16V 70CV 5P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'DUSTER 1.6 FLEX 16V AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER 1.6 HI-FLEX 16V MEC', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER DAKAR 1.6 HI-FLEX 16V MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER DAKAR 4X2 2.0 HI-FLEX 16V AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER DAKAR 4X4 2.0 HI-FLEX 16V MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER DYNAMIQUE 1.6 FLEX 16V AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER DYNAMIQUE 1.6 HI-FLEX 16V MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER DYNAMIQUE 2.0 HI-FLEX 16V AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER DYNAMIQUE 2.0 HI-FLEX 16V MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER DYNAMIQUE 4X4 2.0 HI-FLEX 16V MEC', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER EXPRESSION 1.6 HI-FLEX 16V MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER ICONIC 1.6 16V FLEX AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER INTENSE 1.6 16V FLEX AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER OROCH', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'DUSTER OROCH DYNA. 1.6 HI-FLEX 16V MEC', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'DUSTER OROCH DYNA. 2.0 HI-FLEX 16V AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'DUSTER OROCH DYNA. 2.0 HI-FLEX 16V MEC.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'DUSTER OROCH EXP. 1.6 HI-FLEX 16V MEC.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'DUSTER OROCH EXPRESS 1.6 FLEX 16V MEC.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'DUSTER OUTDOOR 1.6 HI-FLEX 16V MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER TECHROAD 1.6 HI-FLEX 16V MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER TECHROAD 2.0 HI-FLEX 16V AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER TECHROAD 2.0 HI-FLEX 16V MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER TECHROAD 4X4 2.0 16V MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER ZEN 1.6 16V FLEX AUT.', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'DUSTER ZEN 1.6 16V FLEX MEC.', 'V6 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'EXPRESS 1.6/ RL 1.6', 'Não informado', 0),
  ('RENAULT', 'FLUENCE SED. DYN. PLUS 2.0 16V FLEX AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'FLUENCE SED. DYNAMIQUE 2.0 16V FLEX MEC.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'FLUENCE SEDAN DYNAMIQUE 2.0 16V FLEX AUT', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'FLUENCE SEDAN EXPRES. 1.6 16V FLEX MEC.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'FLUENCE SEDAN GT LINE 2.0 FLEX AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'FLUENCE SEDAN GT SPORT', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'FLUENCE SEDAN PRIVILÈGE 2.0 16V FLEX AUT', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'KANGOO ADVANCED 1.6 SCE (FLEX) 2025', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'KANGOO AUTHENTIQUE 1.6 16V 95CV', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'KANGOO AUTHENTIQUE HI-FLEX 1.6 16V', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'KANGOO EXPRES.SPORTWAY 1.6/1.6 HI-FLEX', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'KANGOO EXPRESS HI-FLEX 1.6 16V', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'KANGOO EXPRESS RL/ EXPRESS 1.0 16V/ 8V', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'KANGOO EXPRESS RL/ EXPRESS 1.6 16V/ 8V', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'KANGOO EXPRESSION HI-FLEX 1.6 16V 5P', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'KANGOO RL 1.0 8V', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'KANGOO RL 1.6 8V', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'KANGOO RL/ YAHOO 1.0 16V 70CV', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'KANGOO RN 1.0 8V', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'KANGOO RN/ YAHOO/ EXPRESSION 1.0 16V 5P', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'KANGOO RN/EXPRESSION 1.6 16V / 1.6 8V 5P', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'KANGOO RT 1.0 16V 70CV 5P', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'KANGOO RT 1.6 16V/ 8V 90CV 5P', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'KWID INTENSE 1.0 FLEX 12V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('RENAULT', 'KWID LIFE 1.0 FLEX 12V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('RENAULT', 'KWID OUTSIDER 1.0 FLEX 12V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('RENAULT', 'KWID ZEN 1.0 FLEX 12V 5P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('RENAULT', 'LAGUNA GRAND TOUR PRIVILÈGE 3.0 V6 210CV', 'Não informado', 0),
  ('RENAULT', 'LAGUNA NEVADA RT/ RXE 2.0S 16V', 'Não informado', 0),
  ('RENAULT', 'LAGUNA PRIVILÈGE 3.0 V6 24V 210CV 5P', 'Não informado', 0),
  ('RENAULT', 'LAGUNA RT 2.0', 'Não informado', 0),
  ('RENAULT', 'LAGUNA RXE 2.0S 8V/ 16V', 'Não informado', 0),
  ('RENAULT', 'LAGUNA V6', 'Não informado', 0),
  ('RENAULT', 'LOGAN AUTHE. S.ESPECIAL FLEX 1.0 12V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN AUTHENTIQUE HI-FLEX 1.0 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN AUTHENTIQUE HI-FLEX 1.6 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN AUTHENTIQUE PLUS HI-F. 1.0 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN AVANTAGE HI-FLEX 1.0 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN DYNA. EASYR HI-FLEX 1.6 8V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN DYNAMIQUE EASY R FLEX 1.6 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN DYNAMIQUE FLEX 1.6 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN DYNAMIQUE HI-FLEX 1.6 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN EXCLUSIVE EASYR HI-FLEX 1.6 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN EXCLUSIVE HI-FLEX 1.6 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN EXPRES. AVANTAGE FLEX 1.0 12V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN EXPRES. AVANTAGE FLEX 1.6 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN EXPRES. EASYR HI-FLEX 1.6 8V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN EXPRES. P.AVANT. HI-FLEX 1.6 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN EXPRES. S.ESPECIAL FLEX 1.0 12V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN EXPRES./EXP. UP HI-FLEX 1.0 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN EXPRESSION EASY R FLEX 1.6 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN EXPRESSION FLEX 1.6 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN EXPRESSION HI-FLEX 1.6 16V 4P AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN EXPRESSION HI-FLEX 1.6 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN EXPRESSION HIFLEX 1.6 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN INTENSE FLEX 1.6 16V 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN LIFE FLEX 1.0 12V 4P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN PRIVILÈGE HI-FLEX 1.6 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN PRIVILÈGE HI-FLEX 1.6 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN ZEN FLEX 1.0 12V 4P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'LOGAN ZEN FLEX 1.6 16V 4P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'MASTER 2.3 DCI CHASSI 16V DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.3 DCI EXECUTIVE 16L LONGO DIES', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.3 DCI EXTRA F.VITRE 16V DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.3 DCI EXTRA FURGAO 16V DIESEL', 'CAMINHõES-LEVE-VANS', 0),
  ('RENAULT', 'MASTER 2.3 DCI EXTRA FURGÃO 16V DIESEL', 'Não informado', 0),
  ('RENAULT', 'MASTER 2.3 DCI FURGÃO 16V DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.3 DCI GRAND F.VITRE16V DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.3 DCI GRAND FURGÃO16V DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.3 DCI STD 16L LONGO DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.3 DCI STD 16L MÉDIO DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.3 DCI STD ESCOLAR 20L MÉDIODIES', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.3 DCI VIP 16L LONGO DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.3 DCI VITRE FURGÃO 16V DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.5 DCI 16V 115CV 13L DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.5 DCI 16V 115CV 16L DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.5 DCI CHASSI 16V 115CV DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.5 DCI ESCOLAR 115CV 16/19L DIES', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.5 DCI EXECUTIVO 115CV 16L DIES', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.5 DCI FURG. MEDIO/LONGOTA DIES.', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.5 DCI FURGÃOTB CURTO DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.5 DCI VITRÉ 115CV CURTO DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.5 DCI VITRÉ 115CV LONGA DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.8 DTI 114CV 16L DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.8 DTI CHASSI 114CV DIESEL', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.8 DTI FURGÃO 114CV DIESEL CURTO', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.8 DTI FURGÃO DIES.LONGO ALTO', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MASTER 2.8 FURGÃO 85CV DIESEL CURTO', 'V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'MEGANE COUPÉ CABRIOLET DYNAMIQUE 2.0 AUT', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE G. TOUR EXTREME 2.0 16V AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE G. TOUR EXTREME 2.0 16V MEC.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE G. TOUR EXTREME HI-FLEX 1.6 MEC.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE GRAND TOUR DYNAM. HI-FLEX 1.6 16V', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE GRAND TOUR DYNAMIQUE 2.0 16V AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE GRAND TOUR DYNAMIQUE 2.0 16V MEC.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE GRAND TOUR EXPRES.HI-FLEX 1.6 16V', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE GRAND TOUR PRIVILÈGE 2.0 16V AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE HATCH RN 1.6', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE HATCH RT 1.6/RT/ALIZÉ/EXP 1.6 16V', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE HATCH RXE 2.0', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE HATCH RXE/EGEUS 1.6 16V', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE SED. EXPRESSION 2.0 16V AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE SED. EXPRESSION 2.0 16V MEC.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE SED. EXTREME 2.0 16V AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE SED. EXTREME 2.0 16V MEC.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE SED. EXTREME HI-FLEX 1.6 16V MEC.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE SEDAN DYNAMIQUE 2.0 16V AUT.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE SEDAN DYNAMIQUE 2.0 16V MEC.', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE SEDAN DYNAMIQUE HI-FLEX 1.6 16V', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE SEDAN EXPRESSION HI-FLEX 1.6 16V', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE SEDAN PRIVILÈGE 2.0 16V AUT', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE SEDAN RT 2.0', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE SEDAN RT/ALIZÉ 1.6 16V', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE SEDAN RXE/ PRIVILÈGE 2.0 16V MEC', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'MEGANE SEDAN RXE/EGEUS 2.0', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'OROCH INTENSE 1.6 FLEX MEC.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('RENAULT', 'RENAULT STEPWAY ZEN FLEX 1.6 16V MEC', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SAFRANE RXE', 'Não informado', 0),
  ('RENAULT', 'SANDEIRO 1.6', 'Não informado', 0),
  ('RENAULT', 'SANDERO AUTH. PLUS HI-POWER 1.0 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO AUTH. S.ESPECIAL FLEX 1.0 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO AUTHENTIQUE FLEX 1.0 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO AUTHENTIQUE HI-FLEX 1.0 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO AUTHENTIQUE HI-FLEX 1.6 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO AUTHENTIQUE HI-POWER 1.0 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO DYNA. EASYR HI-FLEX 1.6 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO DYNAMIQUE EASY R FLEX 1.6 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO DYNAMIQUE FLEX 1.6 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO DYNAMIQUE HI-POWER 1.6 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO EXP. S.ESPECIAL FLEX 1.0 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO EXPRES EASYR HI-FLEX 1.6 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO EXPRES. EASY R FLEX 1.6 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO EXPRES. P.AVANT. HI.P. 1.6 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO EXPRESSION FLEX 1.0 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO EXPRESSION FLEX 1.6 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO EXPRESSION HI-FLEX 1.0 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO EXPRESSION HI-FLEX 1.6 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO EXPRESSION HI-POWER 1.0 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO EXPRESSION HI-POWER 1.6 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO GT LINE FLEX 1.6 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO GT LINE HI-FLEX 1.6 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO GT LINE HI-FLEX 1.6 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO GT LINE HI-POWER 1.6 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO LIFE FLEX 1.0 12V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO NOKIA HI-FLEX 1.6 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO PRIVILÈGE HI-FLEX 1.6 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO PRIVILÈGE HI-FLEX 1.6 16V 5P AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO PRIVILÈGE HI-FLEX 1.6 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO RL1N10MT', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO RS RACING SPIRIT FLEX 2.0 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO S EDITION FLEX 1.0 12V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO SPORT RS 2.0 HI-POWER 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO STEP. EASY R DYN. FLEX 1.6 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO STEP. EASY R H-POWER 1.6 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO STEP. EASY R R.CURL H.P. 1.6 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO STEP. R. CURL HI-POWER 1.6 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO STEPWAY DYNAMIQ. FLEX 1.6 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO STEPWAY EASY R FLEX 1.6 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO STEPWAY EXP. FLEX 1.6 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO STEPWAY FLEX 1.6 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO STEPWAY HI-F. R. CURL 1.6 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO STEPWAY HI-FLEX 1.6 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO STEPWAY HI-FLEX 1.6 16V 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO STEPWAY HI-POWER 1.6 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO STEPWAY TWEED HFLEX 1.6 16V AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO STEPWAY TWEED HFLEX 1.6 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO SZE10MT STEPWAY', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO TECHRUN HI-FLEX 1.0 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO VIBE FLEX 1.0 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO VIBE HI-FLEX 1.6 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO ZEN FLEX 1.0 12V 5P MEC', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SANDERO ZEN FLEX 1.6 16V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SCÉNIC ALIZÉ/ EXPRESSION 1.6 16V MEC.', 'Não informado', 0),
  ('RENAULT', 'SCÉNIC ALIZÉ/ EXPRESSION 2.0 16V 5P', 'Não informado', 0),
  ('RENAULT', 'SCÉNIC EXPRESSION 1.6 16V AUT.', 'Não informado', 0),
  ('RENAULT', 'SCÉNIC GRAND DYNAMIQUE 2.0 16V 5P AUT.', 'Não informado', 0),
  ('RENAULT', 'SCÉNIC HI-FLEX/EXPRESS. HI-FLEX 1.6 16V', 'Não informado', 0),
  ('RENAULT', 'SCÉNIC PRIVILLÈGE 1.6 16V AUT.', 'Não informado', 0),
  ('RENAULT', 'SCÉNIC PRIVILLÈGE 2.0 PLUS 16V 5P AUT', 'Não informado', 0),
  ('RENAULT', 'SCÉNIC PRIVILÈGE HI-FLEX 1.6 16V', 'Não informado', 0),
  ('RENAULT', 'SCÉNIC RT 2.0', 'Não informado', 0),
  ('RENAULT', 'SCÉNIC RT 2.0 16V 5P AUT.', 'Não informado', 0),
  ('RENAULT', 'SCÉNIC RT 2.0 16V 5P MEC.', 'Não informado', 0),
  ('RENAULT', 'SCÉNIC RT/AUTH/AUTH/KIDS HI-FLEX 1.6 16V', 'Não informado', 0),
  ('RENAULT', 'SCÉNIC RXE 2.0 8V', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('RENAULT', 'SCÉNIC RXE EGEUS 2.0', 'Não informado', 0),
  ('RENAULT', 'SCÉNIC RXE/ PRIVILÈGE 1.6 16V MEC.', 'Não informado', 0),
  ('RENAULT', 'SCÉNIC RXE/ PRIVILÈGE 2.0 16V 5P AUT.', 'Não informado', 0),
  ('RENAULT', 'SCÉNIC RXE/ PRIVILÈGE 2.0 16V 5P MEC.', 'Não informado', 0),
  ('RENAULT', 'SCÉNIC SPORTWAY HI-FLEX 1.6 16V 5P', 'Não informado', 0),
  ('RENAULT', 'STEPWAY INTENSE FLEX 1.6 16V AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('RENAULT', 'SYMBOL CONNECTION HI-FLEX 1.6 8V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'SYMBOL EXPRESSION HI-FLEX 1.6 16V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'SYMBOL EXPRESSION HI-FLEX 1.6 8V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'SYMBOL PRIVILÈGE HI-FLEX 1.6 16V 4P', 'V10 /AUTOMóVEIS COMUM', 0),
  ('RENAULT', 'TRAFIC FURGÃO 2.0 98CV', 'Não informado', 0),
  ('RENAULT', 'TRAFIC FURGÃO CHASSI CURTO 2.2', 'Não informado', 0),
  ('RENAULT', 'TRAFIC FURGÃO CHASSI LONGO 2.2', 'Não informado', 0),
  ('RENAULT', 'TRAFIC VAN 2.2', 'Não informado', 0),
  ('RENAULT', 'TWINGO 1.0 8V', 'Não informado', 0),
  ('RENAULT', 'TWINGO 1.2', 'Não informado', 0),
  ('RENAULT', 'TWINGO EASY 1.2', 'Não informado', 0),
  ('RENAULT', 'TWINGO INITIALE 1.0 16V 70CV', 'Não informado', 0),
  ('RENAULT', 'TWINGO PACK 1.0 16V 70CV', 'Não informado', 0),
  ('RENAULT', 'TWINGO PACK 1.0 8V', 'Não informado', 0),
  ('RIGUETE', 'TRC-01 GRAN LUXO 1.6', 'Não informado', 0),
  ('RIGUETE', 'TRC-01 GRAN LUXO 1.8', 'Não informado', 0),
  ('RIGUETE', 'TRC-01 JUNIOR 1.8', 'Não informado', 0),
  ('RIGUETE', 'TRC-01 JUNIOR SE 1.8', 'Não informado', 0),
  ('RIGUETE', 'TRC-01 LUXO 1.6', 'Não informado', 0),
  ('RIGUETE', 'TRC-01 RGT-5 1.6', 'Não informado', 0),
  ('RIGUETE', 'TRC-01 SUPER LUXO 1.6', 'Não informado', 0),
  ('RIGUETE', 'TRC-01 SUPER LUXO 1.8', 'Não informado', 0),
  ('RIGUETE', 'TRC-01 SUPER LUXO SE 1.6', 'Não informado', 0),
  ('RIGUETE', 'TRC-01 SUPER LUXO SE 1.8', 'Não informado', 0),
  ('RIGUETE', 'TRC-01 VERSÃO 1 1.8', 'Não informado', 0),
  ('RIGUETE', 'TRC-01 VERSÃO 2 1.8', 'Não informado', 0),
  ('RODOFORT', 'SR / RODOFORT SA SRPL 3E', 'Não informado', 0),
  ('RODOLINEA', 'SR / CAG 3E', 'Não informado', 0),
  ('RODOLINEA', 'SR / RODOLINEA GR CAG 3E', 'Não informado', 0),
  ('RODOLINEA', 'SR / RODOLINEA PC 3E', 'Não informado', 0),
  ('RODOLINEA', 'SR / RODOLINEA PC 3E76', 'Não informado', 0),
  ('RODOLINEA', 'SR / RODOLINEA SRBASC 3E', 'Não informado', 0),
  ('RODOLINEA', 'SR / RODOLINEA SRCAG 3E', 'Não informado', 0),
  ('RODOLINEA', 'SR / RODOLINEA SRFURG 3E', 'Não informado', 0),
  ('RODOLINEA', 'SR / RODOLINEAPR SRBA 2E', 'Não informado', 0),
  ('RODOLINEA', 'SR / RODOLINEAPR SRCA 3E', 'Não informado', 0),
  ('RODOTECNICA', 'SR / RODOTECNICA SRT TQ2', 'Não informado', 0),
  ('RODOTECNICA', 'SR / RODOTECNICA TQ AP 3E', 'Não informado', 0),
  ('RODOVIA', 'RODOVIARIA SR FD CG', 'Não informado', 0),
  ('RODOVIA', 'SR / RODOVIA CFCS SR2E', 'Não informado', 0),
  ('RODOVIA', 'SR / RODOVIA CFCS SR3E', 'Não informado', 0),
  ('RODOVIARIA', 'R / RODOVIARIA SR FD CG', 'Não informado', 0),
  ('RODOVIARIA', 'SR / RODOVIARIA', 'Não informado', 0),
  ('ROLLS-ROYCE', 'DAWN 6.6 V12 AUT.', 'Não informado', 0),
  ('ROLLS-ROYCE', 'GHOST 6.6 V12 AUT.', 'Não informado', 0),
  ('ROLLS-ROYCE', 'GHOST LL 6.6 V12 AUT.', 'Não informado', 0),
  ('ROLLS-ROYCE', 'PHANTOM 6.7 V12 AUT.', 'Não informado', 0),
  ('ROLLS-ROYCE', 'WRAITH 6.6 V12 AUT.', 'Não informado', 0),
  ('ROSSETI', 'R / ROSSETTI SRBA ST02', 'Não informado', 0),
  ('ROVER', 'DISCOVERY SPORT S 2.0 4X4 FLEX AUT', 'ESPECIAL V15 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('ROVER', 'MINI COOPER 1.3', 'Não informado', 0),
  ('ROYAL ENFIELD', 'BULLET 500', 'Não informado', 0),
  ('ROYAL ENFIELD', 'CLASSIC 500 EFI', 'Não informado', 0),
  ('ROYAL ENFIELD', 'CLASSIC BATTLE GREEN 500 EFI', 'Não informado', 0),
  ('ROYAL ENFIELD', 'CLASSIC CHROME 500 EFI', 'Não informado', 0),
  ('ROYAL ENFIELD', 'CLASSIC DESERT STORM 500 EFI', 'Não informado', 0),
  ('ROYAL ENFIELD', 'CLASSIC GUN METAL GREY 500 EFI', 'Não informado', 0),
  ('ROYAL ENFIELD', 'CLASSIC REDDITCH 500 EFI', 'Não informado', 0),
  ('ROYAL ENFIELD', 'CLASSIC SQUADRON BLUE 500 EFI', 'Não informado', 0),
  ('ROYAL ENFIELD', 'CLASSIC STEALTH BLACK 500 EFI', 'Não informado', 0),
  ('ROYAL ENFIELD', 'CLASSIC/CLASSIC CHROME 500CC', 'Não informado', 0),
  ('ROYAL ENFIELD', 'CONTINENTAL 535 EFI', 'Não informado', 0),
  ('ROYAL ENFIELD', 'METEOR FIREBALL 350CC ABS', 'Não informado', 0),
  ('SAAB', '9000 CD 2.3 TURBO', 'Não informado', 0),
  ('SAAB-SCANIA', 'R-112 E 320 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'R-112 EW 320 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'R-112 H 320 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'R-112 HS 320 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'R-112 HW 320 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'R-112 HW 360 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'R-142 E 450 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'R-142 EW 450 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'R-142 H 450 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'R-142 HS 450 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'R-142 HW 450 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'T-112 E 320 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'T-112 ES 320 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'T-112 EW 320 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'T-112 H 320 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'T-112 H 320 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'T-112 HS 320 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'T-112 HW 310 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'T-112 HW 320 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'T-112 HW 320 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'T-112 HW 360 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'T-112 HW 360 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'T-142 E 450 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'T-142 ES 450 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'T-142 EW 450 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'T-142 H 450 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'T-142 HS 450 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SAAB-SCANIA', 'T-142 HW 450 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SALVARO', 'SR / SALVARO SBCD 2E', 'Não informado', 0),
  ('SALVARO', 'SR / SALVARO SBCT 2E', 'Não informado', 0),
  ('SALVARO', 'SR / SALVARO SRBA 3E', 'Não informado', 0),
  ('SANY', 'SANY/SY215C', 'CAMINHõES-LEVE-VANS', 0),
  ('SANYANG', 'ENJOY 50', 'Não informado', 0),
  ('SANYANG', 'HUSKY 150', 'Não informado', 0),
  ('SANYANG', 'PASSING 110', 'Não informado', 0),
  ('SATURN', 'SL-2 1.9', 'Não informado', 0),
  ('SCANIA', 'G-360 A 4X2 (DIESEL)(E5)', 'Não informado', 0),
  ('SCANIA', 'G-360 A 4X2 3-EIXOS/A 6X2 2P (DIES.)(E5)', 'Não informado', 0),
  ('SCANIA', 'G-380 A 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'G-380 A 4X2 3-EIXOS/ A 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'G-400 A 4X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'G-400 A 4X2 3-EIXOS/A 6X2 2P(DIES.) (E5)', 'Não informado', 0),
  ('SCANIA', 'G-400 A 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'G-400 B 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'G-420 A 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'G-420 A 4X2 3-EIXOS/ A 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'G-420 A 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'G-420 B 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'G-420 B 8X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'G-440 A 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'G-440 A 4X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SCANIA', 'G-440 A 4X2 3-EIXOS/ A 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'G-440 A 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SCANIA', 'G-440 A 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'G-440 A 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'G-440 B 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'G-440 B 8X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'G-440 B 8X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'G-470 A 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'G-470 A 4X2 3-EIXOS/ A 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'G-470 A 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'G-470 B 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'G-470 B 8X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'G-480 A 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'G-480 B 8X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'K113 6X2 360', 'Não informado', 0),
  ('SCANIA', 'L-111 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'L-141 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'MPOLO PARADISO LDR', 'Não informado', 0),
  ('SCANIA', 'P-114 CA 360 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-114 CB 330 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-114 CB 360 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-114 GA 320 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-114 GA 330 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-114 GA 340 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-114 GA 360 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-114 GB 330 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-114 LA 340 6X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-124 CA 360 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-124 CA 400 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-124 CA 420 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-124 CB 360 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-124 CB 360 8X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-124 CB 400 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-124 CB 400 8X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-124 CB 420 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-124 CB 420 8X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-124 GA 360 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-124 GA 420 6X4 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-124 LA 360 6X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-124 LA 420 6X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-230 B 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-250 B 4X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'P-250 B 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'P-250 B 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'P-250 B 8X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'P-250 B 8X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'P-270 A 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-270 B 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-270 B 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-310 A 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-310 A 4X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'P-310 B 4X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SCANIA', 'P-310 B 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'P-310 B 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-310 B 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'P-310 B 8X2 (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'P-310 B 8X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-310 B 8X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-310 B 8X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'P-340 A 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-340 A 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-340 B 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-360 A 4X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'P-360 A 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'P-360 B 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SCANIA', 'P-360 B 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'P-360 B 8X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SCANIA', 'P-420 A 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-420 B 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-420 B 8X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-93 H 250 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-94 CB 260 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-94 CB 270 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-94 CB 310 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-94 DB 220 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-94 DB 230 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-94 DB 260 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-94 DB 260 6X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-94 DB 270 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-94 DB 270 6X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-94 GA 260 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-94 GA 270 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-94 GA 300 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-94 GA 310 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'P-94 GB 230 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-113 E 310 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-113 E 320 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-113 E 360 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-113 H 320 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-113 H 360 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-113 H 360 4X2 TOP-LINE 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-114 GA 320 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-114 GA 330 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-114 GA 360 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-114 GA 380 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-114 GA 380 6X2 NZ/ 4X2 3-EIXOS 2P (DIE', 'Não informado', 0),
  ('SCANIA', 'R-114 GB 320 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-114 GB 330 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-114 GB 360 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-114 LA 380 4X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-114 LA 380 6X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-124 GA 360 4X2 NZ 2P (DIESEL) / MILLEN', 'Não informado', 0),
  ('SCANIA', 'R-124 GA 360 6X2 NZ/ 4X2 3-EIXOS 2P (DIE', 'Não informado', 0),
  ('SCANIA', 'R-124 GA 360 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-124 GA 400 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-124 GA 400 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-124 GA 420 4X2 NZ 2P (DIESEL) / MILLEN', 'Não informado', 0),
  ('SCANIA', 'R-124 GA 420 6X2 NZ/ 4X2 3-EIXOS 2P (DIE', 'Não informado', 0),
  ('SCANIA', 'R-124 GA 420 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-124 GA 470 6X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-124 GB 360 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-124 GB 360 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-124 GB 400 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-124 GB 420 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-124 LA 360 4X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-124 LA 360 6X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-124 LA 400 4X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-124 LA 400 6X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-124 LA 420 4X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-124 LA 420 6X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-124 LA 420 6X4 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-143 E 450 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-143 H 450 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-164 CA 480 8X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-164 GA 480 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-164 GA 480 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-164 LA 480 6X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-380 A 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-380 A 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-400 A 4X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'R-400 A 4X2 3-EIXOS/A 6X2 2P (DIES.)(E5)', 'Não informado', 0),
  ('SCANIA', 'R-400 A 4X2 HIGHLINE 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SCANIA', 'R-400 A 6X2 HIGHLINE 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SCANIA', 'R-420 A 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-420 A 4X2 3-EIXOS/ A 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-420 A 4X2 HIGHLINE 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-420 A 4X2 HIGHLINE 3-EIXOS/ A 6X2 2P (', 'Não informado', 0),
  ('SCANIA', 'R-420 A 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-420 A 6X4 HIGHLINE 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-420 LA 4X2 HZ HIGHLINE 3-EIXOS 2P (DIE', 'Não informado', 0),
  ('SCANIA', 'R-420 LA 6X2 NA HIGHLINE 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-420 LA 6X4 HZ HIGHLINE 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-420 LA 6X4 NA HIGHLINE 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-440 A 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-440 A 4X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'R-440 A 4X2 3-EIXOS/ A 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-440 A 4X2 3-EIXOS/A 6X2 2P(DIES.) (E5)', 'Não informado', 0),
  ('SCANIA', 'R-440 A 4X2 HIG. 3-E./A 6X2 (DIE.) (E5)', 'Não informado', 0),
  ('SCANIA', 'R-440 A 4X2 HIGHLINE (DIESEL)(E5)', 'Não informado', 0),
  ('SCANIA', 'R-440 A 4X2 HIGHLINE 3-EIXOS/ A 6X2 2P (', 'Não informado', 0),
  ('SCANIA', 'R-440 A 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-440 A 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'R-440 A 6X4 HIGHLINE 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-440 A 6X4 HIGHLINE 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'R-440 A 8X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SCANIA', 'R-440 A 8X2 HIGHLINE 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SCANIA', 'R-440 LA 4X2 HZ HIGHLINE 3-EIXOS 2P (DIE', 'Não informado', 0),
  ('SCANIA', 'R-470 A 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-470 A 4X2 3-EIXOS/ A 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-470 A 4X2 HIGHLINE 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-470 A 4X2 HIGHLINE 3-EIXOS/ A 6X2 2P (', 'Não informado', 0),
  ('SCANIA', 'R-470 A 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-470 A 6X4 HIGHLINE 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-470 LA 4X2 HZ HIGHLINE 3-EIXOS 2P (DIE', 'Não informado', 0),
  ('SCANIA', 'R-470 LA 6X2 NA HIGHLINE 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-470 LA 6X4 HZ HIGHLINE 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-470 LA 6X4 NA HIGHLINE 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-480 A 4X2 3-EIXOS/A 6X2 2P(DIES.) (E5)', 'Não informado', 0),
  ('SCANIA', 'R-480 A 4X2 HIG. 3-E./A 6X2 (DIES.) (E5)', 'Não informado', 0),
  ('SCANIA', 'R-480 A 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'R-480 A 6X4 HIGHLINE 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'R-480 A 8X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SCANIA', 'R-480 A 8X2 HIGHLINE 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SCANIA', 'R-500 A 4X2 3-EIXOS/ A 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-500 A 6X2 HIGHLINE 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-500 A 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-500 A 6X4 HIGHLINE 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-500 LA 6X4 HZ HIGHLINE 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-500 LA 6X4 NA HIGHLINE 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-560 A 6X2 HIGHLINE (DIESEL)(E5)', 'Não informado', 0),
  ('SCANIA', 'R-560 A 6X4 (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'R-560 A 6X4 HIGHLINE 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'R-580 A 4X2 3-EIXOS/ A 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-580 A 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'R-620 A 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SCANIA', 'R-620 A 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'R-620 A 6X4 HIGHLINE 2P (DIESEL) (E5)', 'Não informado', 0),
  ('SCANIA', 'RANDON CA', 'REBOQUE', 0),
  ('SCANIA', 'T-112 MA 320 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-113 E 310 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-113 E 320 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-113 E 360 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-113 H 310 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-113 H 320 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-113 H 320 4X2 TOP-LINE 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-113 H 320 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-113 H 360 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-113 H 360 4X2 TOP-LINE 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-113 H 360 4X2 TOP-LINE 3-EIXOS 2P (DIE', 'Não informado', 0),
  ('SCANIA', 'T-113 H 360 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-114 GA 320 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-114 GA 330 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-114 GA 360 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-114 GB 320 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-114 GB 330 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-114 GB 360 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-124 GA 360 4X2 NZ 2P (DIESEL) / MILLEN', 'Não informado', 0),
  ('SCANIA', 'T-124 GA 360 6X2 NZ 2P (DIESEL) / MILLEN', 'Não informado', 0),
  ('SCANIA', 'T-124 GA 360 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-124 GA 400 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-124 GA 400 6X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-124 GA 400 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-124 GA 420 4X2 NZ 2P (DIESEL) / MILLEN', 'Não informado', 0),
  ('SCANIA', 'T-124 GA 420 6X2 NZ 2P (DIESEL) / MILLEN', 'Não informado', 0),
  ('SCANIA', 'T-124 GA 420 6X4 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-124 GB 400 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-124 GB 420 4X2 NZ 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-124 LA 360 4X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-124 LA 360 6X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-124 LA 400 4X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-124 LA 400 6X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-124 LA 420 4X2 NA 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-124 LA 420 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-143 E 450 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'T-143 H 450 4X2 2P (DIESEL)', 'Não informado', 0),
  ('SCANIA', 'VABIS', 'Não informado', 0),
  ('SCHIFFER', 'R / FNV FRUEHAUF FB', 'Não informado', 0),
  ('SCHIFFER', 'R / RODOVIARIA', 'Não informado', 0),
  ('SCHIFFER', 'R / SCHIFFER', 'Não informado', 0),
  ('SCHIFFER', 'R / SCHIFFER SSC 3E CA', 'Não informado', 0),
  ('SCHIFFER', 'R / SCHIFFER SSC 3E CF', 'Não informado', 0),
  ('SCHIFFER', 'R / UNI CARR TCL', 'Não informado', 0),
  ('SCHIFFER', 'SR / IDEROL', 'Não informado', 0),
  ('SCHIFFER', 'SR / RODOVIARIA', 'Não informado', 0),
  ('SCHIFFER', 'SR / SCHIIFFER SR CF', 'Não informado', 0),
  ('SEAT', 'CORDOBA 1.6L', 'Não informado', 0),
  ('SEAT', 'CORDOBA SXE 1.8 / GLX 1.8 4P', 'Não informado', 0),
  ('SEAT', 'CORDOBA VARIO 1.6L', 'Não informado', 0),
  ('SEAT', 'IBIZA 1.0 16V 4P', 'Não informado', 0),
  ('SEAT', 'IBIZA 1.0I 8V', 'Não informado', 0),
  ('SEAT', 'IBIZA 1.6L', 'Não informado', 0),
  ('SEAT', 'IBIZA SXE / GLX 1.8', 'Não informado', 0),
  ('SEAT', 'INCA 1.6L', 'Não informado', 0),
  ('SHACMAN', 'LT 385 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SHACMAN', 'TT 385 4X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SHACMAN', 'TT 385 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SHACMAN', 'TT 385 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SHACMAN', 'TT 420 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SHACMAN', 'TT 440 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SHINERAY', 'BOLT 250', 'Não informado', 0),
  ('SHINERAY', 'RETRO EX 50', 'Não informado', 0),
  ('SHINERAY', 'SHI 175', 'Não informado', 150),
  ('SHINERAY', 'SHI 175 S EFI', 'Não informado', 0),
  ('SHINERAY', 'SHINERAY XY 125 JET SS EFI', 'Não informado', 0),
  ('SHINERAY', 'SHINERAY XY 150-8 JEF', 'Não informado', 0),
  ('SHINERAY', 'SUN 150', 'Não informado', 0),
  ('SHINERAY', 'SUPER SMART 50', 'Não informado', 0),
  ('SHINERAY', 'SY1020 T 20 TRUCKS BAU', 'Não informado', 0),
  ('SHINERAY', 'SY1020 T 22 TRUCKS CD', 'Não informado', 0),
  ('SHINERAY', 'SY1020 T20 TRUCKS', 'Não informado', 0),
  ('SHINERAY', 'SY6370 A7 PVAN', 'Não informado', 0),
  ('SHINERAY', 'SY6390 A9 CARGOV', 'Não informado', 0),
  ('SHINERAY', 'SY6390 A9 PVANS', 'Não informado', 0),
  ('SHINERAY', 'X30 VAN 1.3 16V MEC.', 'Não informado', 0),
  ('SHINERAY', 'XY -50-Q JETS', 'Não informado', 0),
  ('SHINERAY', 'XY 110V WAVE', 'Não informado', 0),
  ('SHINERAY', 'XY 125 JET', 'Não informado', 0),
  ('SHINERAY', 'XY 125 JET SS', 'Não informado', 0),
  ('SHINERAY', 'XY 125 NEW WAVE', 'Não informado', 0),
  ('SHINERAY', 'XY 125-14 ESD', 'Não informado', 0),
  ('SHINERAY', 'XY 150 ZH', 'Não informado', 0),
  ('SHINERAY', 'XY 150-5 FIRE/MAXI FIRE', 'Não informado', 0),
  ('SHINERAY', 'XY 150-5 MAX', 'Não informado', 0),
  ('SHINERAY', 'XY 150-5 SPEED', 'Não informado', 0),
  ('SHINERAY', 'XY 150-GY', 'Não informado', 0),
  ('SHINERAY', 'XY 200-5 A RACING', 'Não informado', 0),
  ('SHINERAY', 'XY 200-5 ROAD WIND NAKED', 'Não informado', 0),
  ('SHINERAY', 'XY 200-5 SPEED/ XY 200-5', 'Não informado', 0),
  ('SHINERAY', 'XY 200-III', 'Não informado', 0),
  ('SHINERAY', 'XY 250-5', 'Não informado', 0),
  ('SHINERAY', 'XY 250-6B DISCOVER', 'Não informado', 0),
  ('SHINERAY', 'XY 50-Q', 'Não informado', 0),
  ('SHINERAY', 'XY 50-Q CROSS', 'Não informado', 0),
  ('SHINERAY', 'XY 50-Q PHOENIX', 'Não informado', 0),
  ('SHINERAY', 'XY 50-Q2 RETRO/JET/BIKE', 'Não informado', 0),
  ('SHINERAY', 'XY 50Q VMV', 'Não informado', 0),
  ('SHINERAY', 'XY 50Q-2 VENICE', 'Não informado', 0),
  ('SIAMOTO', 'SCROSS 50CC', 'Não informado', 0),
  ('SINOTRUK', 'HOWO 380 6X2 2P (DIESEL)', 'Não informado', 0),
  ('SINOTRUK', 'HOWO 380 6X4 2P (DIESEL)', 'Não informado', 0),
  ('SINOTRUK', 'HOWO 380 8X4 2P (DIESEL)', 'Não informado', 0),
  ('SINOTRUK', 'HOWO 380 A7 4X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SINOTRUK', 'HOWO 420 A7 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SINOTRUK', 'HOWO 460 A7 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('SMART', 'FORTWO BRABUS CABRIO 1.0 72KW', 'Não informado', 0),
  ('SMART', 'FORTWO BRABUS COUPÉ 1.0 72KW', 'Não informado', 0),
  ('SMART', 'FORTWO COUPÉ/BRASIL.EDITION 1.0 MHD 71CV', 'Não informado', 0),
  ('SMART', 'FORTWO PASSION CABRIO 1.0 62KW/TRITOP', 'Não informado', 0),
  ('SMART', 'FORTWO PASSION COUPÉ 1.0 62KW', 'Não informado', 0),
  ('SMART', 'SCANIA/R450 A6X4', 'CAMINHõES-LEVE-VANS', 0),
  ('SSANGYONG', 'ACTYON 2.0 16V 141CV DIESEL', 'Não informado', 0),
  ('SSANGYONG', 'ACTYON 2.3 16V 150CV AUT.', 'Não informado', 0),
  ('SSANGYONG', 'ACTYON SPORTS 2.0 16V 141CV DIESEL', 'Não informado', 0),
  ('SSANGYONG', 'ACTYON SPORTS 2.0 16V 155CV DIESEL', 'Não informado', 0),
  ('SSANGYONG', 'CHAIRMAN 3.2 V6 220CV AUT.', 'Não informado', 0),
  ('SSANGYONG', 'ISTANA 2.9 95CV TB DIESEL INT. 16LUG.', 'Não informado', 0),
  ('SSANGYONG', 'KORANDO 2.0 16V T.DIESEL AWD AUT.', 'Não informado', 0),
  ('SSANGYONG', 'KORANDO 2.0 16V T.DIESEL AWD MEC.', 'Não informado', 0),
  ('SSANGYONG', 'KORANDO CANVAS 2.9 TB DIESEL INT. AUT', 'Não informado', 0),
  ('SSANGYONG', 'KORANDO CANVAS 2.9 TB DIESEL INT. MEC', 'Não informado', 0),
  ('SSANGYONG', 'KORANDO GL 2.9 TB DIESEL INT. 120CV', 'Não informado', 0),
  ('SSANGYONG', 'KORANDO GLX 2.9 TB DIESEL INT. 120CV AUT', 'Não informado', 0),
  ('SSANGYONG', 'KORANDO GLX 2.9 TB DIESEL INT. 120CV MEC', 'Não informado', 0),
  ('SSANGYONG', 'KYRON 2.0 16V 141CV TDI DIESEL AUT.', 'Não informado', 0),
  ('SSANGYONG', 'KYRON 2.7 20V 165CV TDI DIES. AUT.', 'Não informado', 0),
  ('SSANGYONG', 'MUSSO DX 2.9 DIESEL', 'Não informado', 0),
  ('SSANGYONG', 'MUSSO GL 2.9 TB DIESEL INT. 120CV', 'Não informado', 0),
  ('SSANGYONG', 'MUSSO GLS 2.9 TB DIESEL INT. 120CV AUT', 'Não informado', 0),
  ('SSANGYONG', 'MUSSO GLS 3.2 V6 220CV 4X4 AUT.', 'Não informado', 0),
  ('SSANGYONG', 'MUSSO GLX 2.9 TB DIESEL INT. 120CV AUT', 'Não informado', 0),
  ('SSANGYONG', 'MUSSO GLX 2.9 TB DIESEL INT. 120CV MEC', 'Não informado', 0),
  ('SSANGYONG', 'MUSSO PICK-UP GLX 2.9 4X4 CD TB INT.DIES', 'Não informado', 0),
  ('SSANGYONG', 'MUSSO PICK-UP LX 2.9 4X4 CD TB INT.DIES.', 'Não informado', 0),
  ('SSANGYONG', 'MUSSO SX 2.9 DIESEL', 'Não informado', 0),
  ('SSANGYONG', 'REXTON II 2.7 20V 165/186CV TDI DIES.AUT', 'Não informado', 0),
  ('SSANGYONG', 'REXTON II 3.2 V6 24V 220CV AUT.', 'Não informado', 0),
  ('SSANGYONG', 'REXTON RX 270 2.7 165CV XDI DIESEL AUT.', 'Não informado', 0),
  ('SSANGYONG', 'REXTON RX 290 2.9 120CV TB INT. DIES.AUT', 'Não informado', 0),
  ('SSANGYONG', 'REXTON RX 290 2.9 120CV TB INT. DIES.MEC', 'Não informado', 0),
  ('SSANGYONG', 'REXTON RX 320 3.2 V6 235CV AUT.', 'Não informado', 0),
  ('SSANGYONG', 'REXTON W 2.7 20V XDI DIESEL AUT.', 'Não informado', 0),
  ('SUBARU', 'FORESTER 2.0 16V 4X4 TURBO AUT.', 'Não informado', 0),
  ('SUBARU', 'FORESTER 2.0 4X4 MEC.', 'Não informado', 0),
  ('SUBARU', 'FORESTER 2.0 4X4 TURBO', 'Não informado', 0),
  ('SUBARU', 'FORESTER 2.0 L 16V 4X4 AUT.', 'Não informado', 0),
  ('SUBARU', 'FORESTER 2.0/2.0 S 4X4 AUT.', 'Não informado', 0),
  ('SUBARU', 'FORESTER XT 2.0 16V 4X4 TURBO AUT.', 'Não informado', 0),
  ('SUBARU', 'FORESTER XT 2.5 16V 4X4 TURBO AUT.', 'Não informado', 0),
  ('SUBARU', 'FORESTER XT S-EDITION 2.5 16V 4X4 TB AUT', 'Não informado', 0),
  ('SUBARU', 'IMPREZA 1.5 16V 115CV AUT.', 'Não informado', 0),
  ('SUBARU', 'IMPREZA 1.5 16V 115CV MEC.', 'Não informado', 0),
  ('SUBARU', 'IMPREZA 2.0 16V 160CV AUT.', 'Não informado', 0),
  ('SUBARU', 'IMPREZA 2.0 16V 160CV MEC.', 'Não informado', 0),
  ('SUBARU', 'IMPREZA GL 1.6/1.8 16V', 'Não informado', 0),
  ('SUBARU', 'IMPREZA GL 2.0 4X2 AUT.', 'Não informado', 0),
  ('SUBARU', 'IMPREZA GL 2.0 4X2 MEC.', 'Não informado', 0),
  ('SUBARU', 'IMPREZA GL 2.0 4X4 AUT.', 'Não informado', 0),
  ('SUBARU', 'IMPREZA GL 2.0 4X4 MEC.', 'Não informado', 0),
  ('SUBARU', 'IMPREZA GL 4X4 1.8 16V', 'Não informado', 0),
  ('SUBARU', 'IMPREZA GL 4X4 2.0 16V', 'Não informado', 0),
  ('SUBARU', 'IMPREZA GT 2.0 TURBO', 'Não informado', 0),
  ('SUBARU', 'IMPREZA SD 2.0 16V 160CV AUT.', 'Não informado', 0),
  ('SUBARU', 'IMPREZA SD 2.0/2.0I-S AWD AUT.', 'Não informado', 0),
  ('SUBARU', 'IMPREZA SD GX 2.0 16V 4X4 4P AUT.', 'Não informado', 0),
  ('SUBARU', 'IMPREZA SD RX 2.0 4X4', 'Não informado', 0),
  ('SUBARU', 'IMPREZA SD WRX 2.0 16V 4X4', 'Não informado', 0),
  ('SUBARU', 'IMPREZA SD WRX 2.0 16V TB 4X4 AUT.', 'Não informado', 0),
  ('SUBARU', 'IMPREZA SD WRX 2.5 16V TB 4X4 4P', 'Não informado', 0),
  ('SUBARU', 'IMPREZA SD WRX STI 2.5 16V TB 4X4', 'Não informado', 0),
  ('SUBARU', 'IMPREZA SW GL 1.6/1.8/2.0 4X4 16V', 'Não informado', 0),
  ('SUBARU', 'IMPREZA SW GT 2.0 16V 4X4 TURBO MEC.', 'Não informado', 0),
  ('SUBARU', 'IMPREZA SW GX 2.0 16V 4X4 AUT.', 'Não informado', 0),
  ('SUBARU', 'IMPREZA SW WRX 2.0 16V 4X4 TB', 'Não informado', 0),
  ('SUBARU', 'IMPREZA SW WRX 2.5 16V TB 4X4 5P', 'Não informado', 0),
  ('SUBARU', 'IMPREZA WRX 2.5 16V TB 4X4 5P', 'Não informado', 0),
  ('SUBARU', 'IMPREZA WRX STI 2.5 16V TB 4X4', 'Não informado', 0),
  ('SUBARU', 'IMPREZA XV 2.0 16V 160CV AUT.', 'Não informado', 0),
  ('SUBARU', 'IMPREZA XV 2.0 16V 160CV MEC.', 'Não informado', 0),
  ('SUBARU', 'LEGACY 2.0 16V 160CV AUT.', 'Não informado', 0),
  ('SUBARU', 'LEGACY 3.0 R H6 245CV AUT.', 'Não informado', 0),
  ('SUBARU', 'LEGACY 3.6 4X4 256CV AUT.', 'Não informado', 0),
  ('SUBARU', 'LEGACY GL 1.8', 'Não informado', 0),
  ('SUBARU', 'LEGACY GL 2.0/ GLS MEC', 'Não informado', 0),
  ('SUBARU', 'LEGACY GL TW 2.0 4X2 MEC./AUT.', 'Não informado', 0),
  ('SUBARU', 'LEGACY GL TW 2.0 4X4 AUT.', 'Não informado', 0),
  ('SUBARU', 'LEGACY GL TW 2.0 4X4 MEC.', 'Não informado', 0),
  ('SUBARU', 'LEGACY GL/ GLS 2.0 AUT.', 'Não informado', 0),
  ('SUBARU', 'LEGACY GT 2.5 16V 280CV AUT.', 'Não informado', 0),
  ('SUBARU', 'LEGACY GX 2.2 4X4', 'Não informado', 0),
  ('SUBARU', 'LEGACY GX 2.5 4X4 AUT.', 'Não informado', 0),
  ('SUBARU', 'LEGACY GX 2.5 4X4 MEC.', 'Não informado', 0),
  ('SUBARU', 'LEGACY GX TW 2.2 4X4 AUT.', 'Não informado', 0),
  ('SUBARU', 'LEGACY GX TW 2.2 4X4 MEC.', 'Não informado', 0),
  ('SUBARU', 'LEGACY GX TW 2.5 4X4 AUT.', 'Não informado', 0),
  ('SUBARU', 'LEGACY GX TW 2.5 4X4 MEC', 'Não informado', 0),
  ('SUBARU', 'LEGACY SW 2.2', 'Não informado', 0),
  ('SUBARU', 'OUTBACK 2.5 4X4 AUT.', 'Não informado', 0),
  ('SUBARU', 'OUTBACK 2.5 4X4 MEC.', 'Não informado', 0),
  ('SUBARU', 'OUTBACK 3.0 H6 SW 245CV AUT.', 'Não informado', 0),
  ('SUBARU', 'OUTBACK 3.6 H6 SW 280CV AUT.', 'Não informado', 0),
  ('SUBARU', 'SVX CUPÊ 3.3 4X4 AUT', 'Não informado', 0),
  ('SUBARU', 'TRIBECA 3.6 24V 270CV 5P AUT.', 'Não informado', 0),
  ('SUBARU', 'VIVIO SD GLI 3P MEC', 'Não informado', 0),
  ('SUBARU', 'XV 2.0 16V 4X4 150CV AUT.', 'Não informado', 0),
  ('SUNDOWN', 'AKROS 50CC', 'Não informado', 0),
  ('SUNDOWN', 'AKROS 90CC', 'Não informado', 0),
  ('SUNDOWN', 'ERGON 50CC', 'Não informado', 0),
  ('SUNDOWN', 'FIFTY 50CC', 'Não informado', 0),
  ('SUNDOWN', 'FUTURE 125', 'Não informado', 0),
  ('SUNDOWN', 'HUNTER 100 95CC', 'Não informado', 0),
  ('SUNDOWN', 'HUNTER 125 SE', 'Não informado', 0),
  ('SUNDOWN', 'HUNTER 90 86CC', 'Não informado', 0),
  ('SUNDOWN', 'MAX 125 SE', 'Não informado', 0),
  ('SUNDOWN', 'MAX 125 SED', 'Não informado', 0),
  ('SUNDOWN', 'PALIO 50CC', 'Não informado', 0),
  ('SUNDOWN', 'PGO SPEED 50CC', 'Não informado', 0),
  ('SUNDOWN', 'PGO SPEED 90CC', 'Não informado', 0),
  ('SUNDOWN', 'STX 125CC', 'Não informado', 0),
  ('SUNDOWN', 'STX 200CC', 'Não informado', 0),
  ('SUNDOWN', 'STX MOTARD 125CC', 'Não informado', 0),
  ('SUNDOWN', 'STX MOTARD 200CC', 'Não informado', 0),
  ('SUNDOWN', 'SUPER FIFTY 50CC', 'Não informado', 0),
  ('SUNDOWN', 'VBLADE 250CC', 'Não informado', 0),
  ('SUNDOWN', 'WEB 97CC', 'Não informado', 0),
  ('SUNDOWN', 'WEB EVO 97CC', 'Não informado', 0),
  ('SUZUKI', 'ADDRESS/AE 50', 'Não informado', 0),
  ('SUZUKI', 'ADDRESS/AG 100', 'Não informado', 0),
  ('SUZUKI', 'AN 125 BURGMAN', 'Não informado', 0),
  ('SUZUKI', 'BALENO 1.6 16V AUT.', 'Não informado', 0),
  ('SUZUKI', 'BALENO 1.6 16V MEC.', 'Não informado', 0),
  ('SUZUKI', 'BALENO WAGON 1.6 16V AUT.', 'Não informado', 0),
  ('SUZUKI', 'BANDIT 1200S', 'Não informado', 0),
  ('SUZUKI', 'BANDIT 1250S', 'Não informado', 0),
  ('SUZUKI', 'BANDIT 600S/ 650S', 'Não informado', 0),
  ('SUZUKI', 'BANDIT N-1200', 'Não informado', 0),
  ('SUZUKI', 'BANDIT N-1250', 'Não informado', 0),
  ('SUZUKI', 'BANDIT N-600/ 650', 'Não informado', 0),
  ('SUZUKI', 'BOULEVARD C1500', 'Não informado', 0),
  ('SUZUKI', 'BOULEVARD M1500', 'Não informado', 0),
  ('SUZUKI', 'BOULEVARD M1500R', 'Não informado', 0),
  ('SUZUKI', 'BOULEVARD M1800R', 'Não informado', 0),
  ('SUZUKI', 'BOULEVARD M1800R B.O.S.S.', 'Não informado', 0),
  ('SUZUKI', 'BOULEVARD M800', 'Não informado', 0),
  ('SUZUKI', 'BOULEVARD M800R', 'Não informado', 0),
  ('SUZUKI', 'BURGMAN 400', 'Não informado', 0),
  ('SUZUKI', 'BURGMAN 650 EXECUTIVE/ 650', 'Não informado', 0),
  ('SUZUKI', 'BURGMAN I 125 CC', 'Não informado', 0),
  ('SUZUKI', 'DL 1000 V-STROM', 'Não informado', 0),
  ('SUZUKI', 'DL 650 V-STROM', 'Não informado', 0),
  ('SUZUKI', 'DL 650XT V-STROM', 'Não informado', 0),
  ('SUZUKI', 'DR 350', 'Não informado', 0),
  ('SUZUKI', 'DR 350 SE', 'Não informado', 0),
  ('SUZUKI', 'DR 650 RE', 'Não informado', 0),
  ('SUZUKI', 'DR 650 RSE', 'Não informado', 0),
  ('SUZUKI', 'DR 800 S', 'Não informado', 0),
  ('SUZUKI', 'DR-Z400E', 'Não informado', 0),
  ('SUZUKI', 'EN 125 YES', 'Não informado', 0),
  ('SUZUKI', 'EN 125 YES CARGO', 'Não informado', 0),
  ('SUZUKI', 'EN 125 YES SE', 'Não informado', 0),
  ('SUZUKI', 'FREEWIND XF 650', 'Não informado', 0),
  ('SUZUKI', 'GLADIUS 650', 'Não informado', 0),
  ('SUZUKI', 'GRAND VITARA 1.6 16V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA 1.6 16V MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA 2.0 16V 3P', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA 2.0 16V 4X2/4X4 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA 2.0 16V 4X2/4X4 5P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA 2.0 16V 5P/ GOLD AUT( ARG.)', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA 2.0 16V 5P/ GOLD MEC( ARG.)', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA 2.0 16V ED. SPECIAL 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA 2.0 16V ED. SPECIAL 5P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA 2.0 TB-IC DIESEL 4P', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA 2.5 V6 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA 2.5 V6 5P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA 3.2 24V 4WD 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA 4SPORT 2.0 16V 4X2 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA 4SPORT 2.0 16V 4X4 5P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA 4SPORT 2.0 16V 4X4 5P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA L.EDI. 2.0 16V 4X2/4X4 AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA S. EDITI. 2.0 16V 4X2 AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA SPORT 2.0 16V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA SPORT 2.0 16V MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA XL_7 2.7 24V 173CV 4P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GRAND VITARA XL_7 2.7 24V 173CV 4P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'GS 120', 'Não informado', 0),
  ('SUZUKI', 'GS 500-E', 'Não informado', 0),
  ('SUZUKI', 'GSR 125', 'Não informado', 0),
  ('SUZUKI', 'GSR 125S', 'Não informado', 0),
  ('SUZUKI', 'GSR 150I', 'Não informado', 0),
  ('SUZUKI', 'GSR 750', 'Não informado', 0),
  ('SUZUKI', 'GSX 1100 F', 'Não informado', 0),
  ('SUZUKI', 'GSX 1250 FA', 'Não informado', 0),
  ('SUZUKI', 'GSX 1300 B-KING', 'Não informado', 0),
  ('SUZUKI', 'GSX 1300-R HAYABUSA', 'Não informado', 0),
  ('SUZUKI', 'GSX 650F', 'Não informado', 0),
  ('SUZUKI', 'GSX 750 F', 'Não informado', 0),
  ('SUZUKI', 'GSX-R 1000', 'Não informado', 0),
  ('SUZUKI', 'GSX-R 1100 W', 'Não informado', 0),
  ('SUZUKI', 'GSX-R 750 W', 'Não informado', 0),
  ('SUZUKI', 'GSX-R 750 W SRAD', 'Não informado', 0),
  ('SUZUKI', 'GSX-S 1000', 'Não informado', 0),
  ('SUZUKI', 'GSX-S 1000 F', 'Não informado', 0),
  ('SUZUKI', 'GSX-S 750', 'Não informado', 0),
  ('SUZUKI', 'IGNIS 1.3 16V 82CV 4P AUT.', 'Não informado', 0),
  ('SUZUKI', 'IGNIS 1.3 16V 82CV 4P MEC.', 'Não informado', 0),
  ('SUZUKI', 'IGNIS WRS 1.3 16V 82CV 4X4 4P', 'Não informado', 0),
  ('SUZUKI', 'INAZUMA 250CC', 'Não informado', 0),
  ('SUZUKI', 'INTRUDER 125', 'Não informado', 0),
  ('SUZUKI', 'INTRUDER 250', 'Não informado', 0),
  ('SUZUKI', 'INTRUDER LC 1500', 'Não informado', 0),
  ('SUZUKI', 'INTRUDER VS 1400-GLP', 'Não informado', 0),
  ('SUZUKI', 'INTRUDER VS 800-GLP/ 800-GL', 'Não informado', 0),
  ('SUZUKI', 'JIMNY 4S 1.3 16V', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'JIMNY 4SPORT DESERT 1.3 16V', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'JIMNY 4SPORT FOREST 1.3 16V', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'JIMNY 4SPORT/ 4WORK 1.3 16V', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'JIMNY 4STREET 1.3 16V', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'JIMNY 4SUN 1.3 16V', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'JIMNY 4WORK OFF ROAD 1.3 16V', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'JIMNY CANVAS 4ALL 1.3 16V', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'JIMNY CANVAS 4SPORT 1.3 16V', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'JIMNY SIERRA 4SPORT ALLGRIP 1.5 16V AUT.1.5 16VAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'JIMNY SIERRA 4STYLE ALLGRIP 1.5 16V AUT.1.5 16VAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'JIMNY SIERRA 4YOU ALLGRIP 1.5 16V AUT.1.5 16VAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'JIMNY SIERRA 4YOU ALLGRIP 1.5 16V MEC.1.5 16VMANUAL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'JIMNY WIDE/ JIMNY/4ALL 1.3 16V', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'KATANA 125', 'Não informado', 0),
  ('SUZUKI', 'LETS II 50CC', 'Não informado', 0),
  ('SUZUKI', 'LT 50 QUADRICICLO', 'Não informado', 0),
  ('SUZUKI', 'LT 80 QUADRICICLO', 'Não informado', 0),
  ('SUZUKI', 'LT F160 QUADRICICLO', 'Não informado', 0),
  ('SUZUKI', 'MARAUDER 800', 'Não informado', 0),
  ('SUZUKI', 'RF 600 R', 'Não informado', 0),
  ('SUZUKI', 'RF 900 R', 'Não informado', 0),
  ('SUZUKI', 'RM 125', 'Não informado', 0),
  ('SUZUKI', 'RM 250', 'Não informado', 0),
  ('SUZUKI', 'RM 80', 'Não informado', 0),
  ('SUZUKI', 'RMX 250', 'Não informado', 0),
  ('SUZUKI', 'S-CROSS 4STYLE 1.4 TB 16V AUT.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('SUZUKI', 'S-CROSS 4STYLE ALLGRIP 1.4 TB 16V AUT.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('SUZUKI', 'S-CROSS 4STYLE-S ALLGRIP 1.4 TB 16V AUT.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('SUZUKI', 'S-CROSS 4YOU 1.6 16V AUT.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('SUZUKI', 'SAMURAI JX CANVAS 1.3', 'Não informado', 0),
  ('SUZUKI', 'SAMURAI JX METAL 1.3', 'Não informado', 0),
  ('SUZUKI', 'SAVAGE LS 650', 'Não informado', 0),
  ('SUZUKI', 'SIDEKICK CANVAS', 'Não informado', 0),
  ('SUZUKI', 'SIDEKICK METAL', 'Não informado', 0),
  ('SUZUKI', 'SUPER CARRY VAN/ FURGÃO 1.0', 'Não informado', 0),
  ('SUZUKI', 'SV650', 'Não informado', 0),
  ('SUZUKI', 'SWIFT GL', 'Não informado', 0),
  ('SUZUKI', 'SWIFT GTI 1.3 3P', 'Não informado', 0),
  ('SUZUKI', 'SWIFT GTI CONVERS. 16V', 'Não informado', 0),
  ('SUZUKI', 'SWIFT HATCH 1.0 3P E 5P', 'Não informado', 0),
  ('SUZUKI', 'SWIFT HATCH/ SEDAN 1.3', 'Não informado', 0),
  ('SUZUKI', 'SWIFT SEDAN 1.6 16V', 'Não informado', 0),
  ('SUZUKI', 'SWIFT SPORT 1.6 16V 5P MEC.', 'Não informado', 0),
  ('SUZUKI', 'SWIFT SPORT R 1.6 16V 5P MEC.', 'Não informado', 0),
  ('SUZUKI', 'SX4 2.0 16V 145CV 4WD 5P AUT.', 'Não informado', 0),
  ('SUZUKI', 'SX4 2.0 16V 145CV 4WD 5P MEC.', 'Não informado', 0),
  ('SUZUKI', 'SX4 S-CROSS ALLGRIP GLS 1.6 16V AUT.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('SUZUKI', 'SX4 S-CROSS ALLGRIP GLX 1.6 16V AUT.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('SUZUKI', 'SX4 S-CROSS GL 1.6 16V MEC.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('SUZUKI', 'SX4 S-CROSS GLX 1.6 16V AUT.', 'ESPECIAL V12 PICKUPS/VANS/UTILITÁRIOS', 0),
  ('SUZUKI', 'TL 1000 S', 'Não informado', 0),
  ('SUZUKI', 'VITARA 4ALL 1.6 16V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'VITARA 4ALL 1.6 16V MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'VITARA 4SPORT 1.4 TB 16V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'VITARA 4SPORT ALLGRIP 1.4 TB 16V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'VITARA 4STYLE ALLGRIP 1.4 TB 16V AUT.1.4 TB 16VAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'VITARA 4YOU 1.6 16V AUT.1.6 16VAUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'VITARA 4YOU ALLGRIP 1.6 16V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'VITARA JLX 1.6 16V 4X4 4P AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'VITARA JLX 1.6 16V 4X4 4P MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'VITARA JLX 2.0 V6 4X4', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'VITARA JLX CANVAS 1.6 8V 2P', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'VITARA JLX METAL 1.6 8V 2P', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('SUZUKI', 'VX 800CC', 'Não informado', 0),
  ('SUZUKI', 'WAGON R+ 1.0 MEC.', 'Não informado', 0),
  ('SÃO PEDRO', 'SR / SÃO PEDRO SRFB 3E', 'Não informado', 0),
  ('TAC', 'STARK 2.3 4WD 127CV TDI DIESEL 3P', 'Não informado', 0),
  ('TARGOS', 'TRIMOTO 125CC PICAPE', 'Não informado', 0),
  ('TARGOS', 'TRIMOTO 125CC PICAPE BAÚ', 'Não informado', 0),
  ('TIGER', 'TRCICLO TC CARGO CHASSI', 'Não informado', 0),
  ('TIGER', 'TRICICLO TB CARGO BAU', 'Não informado', 0),
  ('TIGER', 'TRICICLO TC CARGO CARROCERIA', 'Não informado', 0),
  ('TIGER', 'TRICICLO TC CARGO PLATAFORMA', 'Não informado', 0),
  ('TOYOTA', 'AVALON XLS 3.0', 'Não informado', 0),
  ('TOYOTA', 'BAND. JIPE 4X4 SPORT 3.7 DIESEL', 'Não informado', 0),
  ('TOYOTA', 'BAND.JIPE CAP.DE AÇO CHAS. CURTO DIESEL', 'Não informado', 0),
  ('TOYOTA', 'BAND.JIPE CAP.DE AÇO CHAS. LONGO DIESEL', 'Não informado', 0),
  ('TOYOTA', 'BAND.JIPE CAPOTA DE LONA DIESEL', 'Não informado', 0),
  ('TOYOTA', 'BAND.PICAPE CD 2P CHASSI LONGO DIESEL', 'Não informado', 0),
  ('TOYOTA', 'BAND.PICAPE CD 4P CHASSI LONGO DIESEL', 'Não informado', 0),
  ('TOYOTA', 'BAND.PICAPE CHASSI CURTO DIESEL', 'Não informado', 0),
  ('TOYOTA', 'BAND.PICAPE CHASSI LONGO DIESEL', 'Não informado', 0),
  ('TOYOTA', 'CAMRY LE', 'Não informado', 0),
  ('TOYOTA', 'CAMRY SW LE 2.2 16V', 'Não informado', 0),
  ('TOYOTA', 'CAMRY SW XLE 3.0 24V', 'Não informado', 0),
  ('TOYOTA', 'CAMRY XLE 3.0 24V 186CV', 'Não informado', 0),
  ('TOYOTA', 'CAMRY XLE 3.5 24V AUT.', 'Não informado', 0),
  ('TOYOTA', 'CELICA GT 2.2 16V', 'Não informado', 0),
  ('TOYOTA', 'CELICA ST 1.8', 'Não informado', 0),
  ('TOYOTA', 'COROLLA ALTIS 2.0 FLEX 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA ALTIS HYBRID 1.8 16V FLEX AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA ALTIS PREM. HYBRID 1.8 FLEX AUT', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA CROSS XRE 2.0 16V FLEX AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA CROSS XRX 1.8 16V AUT.(HíBRIDO)', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA DX/ SW DX 1.6 16V', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA DYNAMIC 2.0 FLEX 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA FIELDER SW 1.8/1.8 XEI FLEX AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA FIELDER SW 1.8/1.8 XEI FLEX MEC', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA FIELDER SW S 1.8 16V 136CV AUT', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA FIELDER SW S 1.8 16V 136CV MEC', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA FIELDER SW SE-G 1.8 FLEX 16V AUT', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA GLI 1.6 16V', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA GLI 1.8 FLEX 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA GLI 1.8 FLEX 16V MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA GLI 2.0 16V FLEX AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA GLI UPPER 1.8 FLEX 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA GLI UPPER BLACK P. 1.8 FLEX AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA LE 1.8', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA LE 2.2 16V', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA S 1.8 16V 136CV AUT', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA S 1.8 16V 136CV MEC', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA SE-G 1.8 16V MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA SE-G 1.8/1.8 FLEX 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA SW LE 1.8/ XLI 1.6 16V', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA WG', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA XEI 1.8 VVT', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA XEI 1.8/1.8 FLEX 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA XEI 1.8/1.8 FLEX 16V MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA XEI 2.0 FLEX 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA XLI 1.6 16V 110CV AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA XLI 1.6 16V 110CV MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA XLI 1.8/1.8 FLEX 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA XLI 1.8/1.8 FLEX 16V MEC.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'COROLLA XRS 2.0 FLEX 16V AUT.', 'ESPECIAL V6 /AUTOMóVEIS', 0),
  ('TOYOTA', 'CORONA AUT.', 'Não informado', 0),
  ('TOYOTA', 'CORONA GLI MEC', 'Não informado', 0),
  ('TOYOTA', 'CORONA MEC.', 'Não informado', 0),
  ('TOYOTA', 'ETIOS 1.3 FLEX 16V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS CROSS 1.5 FLEX 16V 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS CROSS 1.5 FLEX 16V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS PLATINUM 1.5 FLEX 16V 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS PLATINUM 1.5 FLEX 16V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS PLATINUM SED. 1.5 FLEX 16V 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS PLATINUM SED. 1.5 FLEX 16V 4P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS READY! 1.5 FLEX 16V 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS X 1.3', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS X 1.3 FLEX 16V 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS X 1.3 FLEX 16V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS X PLUS 1.5 FLEX 16V 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS X PLUS 1.5 FLEX 16V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS X PLUS SEDAN 1.5 FLEX 16V 4P AUT', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS X PLUS SEDAN 1.5 FLEX 16V 4P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS X SEDAN 1.5 FLEX 16V 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS X SEDAN 1.5 FLEX 16V 4P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS XLS 1.5 FLEX 16V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS XLS 1.5 FLEX 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS XLS SEDAN 1.5 FLEX 16V 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS XLS SEDAN 1.5 FLEX 16V 4P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS XS 1.3 FLEX 16V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS XS 1.5 FLEX 16V 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS XS 1.5 FLEX 16V 5P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS XS SEDAN 1.5 FLEX 16V 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'ETIOS XS SEDAN1.5 FLEX 16V 4P MEC.', 'V5 AUTOMOVEL COMUM', 0),
  ('TOYOTA', 'HILUX 4X2 2.4 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX 4X2 2.8 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD 4X2 2.4 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD 4X4 2.7 16V FLEX MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD 4X4 2.8 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD CONQUEST 4X4 2.8 DIE.AUT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD D4-D 4X2 2.5 16V 102CV TB DIES.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD D4-D 4X4 2.5 16V 102CV TB DIES.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD D4-D 4X4 3.0 TDI DIES. MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD DLX 4X2 2.8 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD DLX 4X4 2.8 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD DX 4X2 2.7 16V 142CV', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD DX 4X2 3.0 8V 90CV DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD DX 4X4 3.0 8V 90CV DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD GR-S 4X4 2.8 TDI DIES. AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD GR-S 4X4 4.0 V6 234CV AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD LIMITED 4X4 3.0 TDI DIESEL AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SR 4X2 2.7 16V/2.7 FLEX AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SR 4X2 2.7 16V/2.7 FLEX MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SR 4X4 2.8 TDI DIESEL AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SR 4X4 3.0 8V 116CV TB DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SR 4X4 3.0 8V 90CV DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SR CHALL. 4X4 2.8 TDI DIES AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SR D4-D 4X2 3.0 163CV TDI DIES.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SR D4-D 4X4 3.0 TDI DIES AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SR D4-D 4X4 3.0 TDI DIES.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SR5 4X4 2.8 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SRV 4X2 2.7 16V 142CV', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SRV 4X2 2.7 FLEX 16V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SRV 4X2 3.0 8V 90CV DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SRV 4X4 2.7 FLEX 16V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SRV 4X4 2.8 TDI DIESEL AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SRV 4X4 3.0 8V 116CV TB DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SRV D4-D 4X2 3.0 163CV TDI DIES', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SRV D4-D 4X4 3.0 TDI DIES', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SRV D4-D 4X4 3.0 TDI DIESEL AUT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SRX 4X4 2.8 TDI 16V DIESEL AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CD SRX LIMITED 4X4 2.8 TDI DIE.AUT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CHASSI 4X4 2.8 TDI DIESEL MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CHASSI D4-D 4X4 2.5 102CV TB DIES.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CHASSI D4-D 4X4 3.0 TDI DIES. MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CS 4X4 2.4 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CS 4X4 2.8 TDI DIESEL MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CS D4-D 4X2 2.5 16V 102CV TB DIES.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CS D4-D 4X4 2.5 16V 102CV TB DIES.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CS D4-D 4X4 3.0 TDI DIES. MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CS DLX 4X2 2.8 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CS DLX 4X4 2.8 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CS DX 4X2 2.7 16V 142CV', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CS DX 4X2 3.0 8V 90CV DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CS DX 4X4 3.0 8V 90CV DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CS SR5 4X4 2.8 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX CS SRV 4X2 2.7 16V 142CV', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SR 4X2 2.7 FLEX 16V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SR 4X2 2.7 FLEX 16V MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SR 4X2 2.8 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SR 4X2 2.8 DIESEL AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SR 4X4 2.7 16V 142CV', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SR 4X4 2.7 FLEX 16V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SR 4X4 2.8 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SR 4X4 2.8 DIESEL AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SR CHALLENGE 4X4 2.8 TDI DIESEL AU', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SR CHALLENGE 4X4 2.8 TDI DIESEL ME', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SR D4-D 4X2 3.0 163CV TDI DIES.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SR D4-D 4X4 3.0 TDI DIES.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SR D4-D 4X4 3.0 TDI DIES. AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SR DLX 4X2 2.4 8V', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SRV 4X2 2.7 16V 142CV', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SRV 4X2 2.7 FLEX 16V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SRV 4X2 2.8 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SRV 4X2 3.0 8V 90CV DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SRV 4X4 2.7 16V 142CV', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SRV 4X4 2.7 FLEX 16V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SRV 4X4 3.0 8V 116CV TB DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SRV D4-D 4X2 3.0 163CV TDI DIES.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SRV D4-D 4X4 3.0 TDI DIES.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SRV D4-D 4X4 3.0 TDI DIESEL AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SRX 4X4 2.8 TDI 16V DIESEL AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 2.7 16V', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 3.4 V6', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 4X4 2.4 8V', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 4X4 2.8 DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 4X4 3.0 12V V6', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 4X4 3.0 24V V6', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 4X4 3.0 8V TB DIESEL', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 DIAMOND 2.8 TB 4X4 DIE. AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 GRS 2.8 TB 4X4 DIESEL AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 SR 4X2 2.7/ 2.7 FLEX 16V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 SR 4X2 2.7/2.7 FLEX 16V MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 SR D4-D 4X4 3.0 TDI DIES. AUT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 SRV 4X2 2.7 FLEX 16V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 SRV 4X4 4.0 V6 24V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 SRV D4-D 4X4 3.0 TDI DIES. AUT', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 SRV D4-D 4X4 3.0 TDI DIES. MEC', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 SRX 4X4 2.8 TDI 16V DIES. AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 SRX 4X4 4.0 V6 24V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'HILUX SW4 SRX LIMITED 4X4 2.8 TDI DIE.AU', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'LAND CRUISER 4WD 4.5 24V', 'Não informado', 0),
  ('TOYOTA', 'LAND CRUISER PRADO 3.0 4X4 TB DIESEL AUT', 'Não informado', 0),
  ('TOYOTA', 'LAND CRUISER PRADO 3.0 4X4 TB DIESEL MEC', 'Não informado', 0),
  ('TOYOTA', 'MR-2 TURBO 2.0', 'Não informado', 0),
  ('TOYOTA', 'PASEO', 'Não informado', 0),
  ('TOYOTA', 'PREVIA LE 2.4 16V', 'Não informado', 0),
  ('TOYOTA', 'PREVIA LX 2.5', 'Não informado', 0),
  ('TOYOTA', 'PRIUS HYBRID 1.8 16V 5P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('TOYOTA', 'RAV4 2.0 4X2 16V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'RAV4 2.0 4X4 16V AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'RAV4 2.0 4X4 16V MEC.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'RAV4 2.0 HIGH 4X2 16V AUT.4X22.0AUTOMáTICAHIGH', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'RAV4 2.0 TOP 4X2 16V AUT.4X22.0AUTOMáTICATOP', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'RAV4 2.4 4X2 16V 170CV AUT.4X22.4AUTOMáTICA170CV', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'RAV4 2.4 4X4 16V 170CV AUT.4X42.4AUTOMáTICA170CV', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'RAV4 2.5 4X4 16V AUT.4X42.5AUTOMáTICA', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'RAV4 2.5 S 4X4 AUT. (HíBRIDO)4X42.5AUTOMáTICAS HíBRIDO', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'RAV4 2.5 S CONNECT 4X4 AUT. (HíBRIDO)4X42.5AUTOMáTICAS CONNECT HíBRIDO', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'RAV4 2.5 SX 4X4 AUT. (HíBRIDO)4X42.5AUTOMáTICASX HíBRIDO', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'RAV4 2.5 SX CONNECT 4X4 AUT. (HíBRIDO)4X42.5AUTOMáTICASX CONNECT HíBRIDO', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('TOYOTA', 'SUPRA', 'Não informado', 0),
  ('TOYOTA', 'T-100 3.4 V6', 'Não informado', 0),
  ('TOYOTA', 'YARIS XL 1.3 FLEX 16V 5P AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('TOYOTA', 'YARIS XL 1.3 FLEX 16V 5P MEC.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('TOYOTA', 'YARIS XL PLUS CON. 1.5 FLEX 16V 5P AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('TOYOTA', 'YARIS XL SEDAN 1.5 FLEX 16V 4P AUT', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('TOYOTA', 'YARIS XL SEDAN 1.5 FLEX 16V 4P MEC.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('TOYOTA', 'YARIS XLS 1.5 FLEX 16V 5P AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('TOYOTA', 'YARIS XLS CONNECT 1.5 FLEX 16V 5P AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('TOYOTA', 'YARIS XLS CONNECT SED. 1.5 FLEX 16V AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('TOYOTA', 'YARIS XLS SEDAN 1.5 FLEX 16V 4P AUT', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('TOYOTA', 'YARIS XS 1.5 FLEX 16V 5P AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('TOYOTA', 'YARIS XS CONNECT 1.5 FLEX 16V 5P AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('TOYOTA', 'YARIS XS SEDAN 1.5 FLEX 16V 4P AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('TRAXX', 'CJ 50-F', 'Não informado', 0),
  ('TRAXX', 'DUNNA 600CC', 'Não informado', 0),
  ('TRAXX', 'JH 125 G/ BEST', 'Não informado', 0),
  ('TRAXX', 'JH 125 L/ FLY', 'Não informado', 0),
  ('TRAXX', 'JH 125-35A JOTO / JH 135-35A JOTO', 'Não informado', 0),
  ('TRAXX', 'JH 150 FLY', 'Não informado', 0),
  ('TRAXX', 'JH 150-7 TSS 150', 'Não informado', 0),
  ('TRAXX', 'JH 250 FLY', 'Não informado', 0),
  ('TRAXX', 'JH 250-8 TSS 250', 'Não informado', 0),
  ('TRAXX', 'JH 250E-5 SHARK', 'Não informado', 0),
  ('TRAXX', 'JH 50', 'Não informado', 0),
  ('TRAXX', 'JH 70', 'Não informado', 0),
  ('TRAXX', 'JH 70 III', 'Não informado', 0),
  ('TRAXX', 'JL 110-11 PRINCE', 'Não informado', 0),
  ('TRAXX', 'JL 110-3/ 110-8/ SKY', 'Não informado', 0),
  ('TRAXX', 'JL 125-9 SKY', 'Não informado', 0),
  ('TRAXX', 'JL 135 FLY', 'Não informado', 0),
  ('TRAXX', 'JL 50 Q-2/ STAR', 'Não informado', 0),
  ('TRAXX', 'JL 50 Q8/MOBY 50', 'Não informado', 0),
  ('TRAXX', 'JS 250 ATV-5 MONTEZ 250', 'Não informado', 0),
  ('TRAXX', 'SKY 50', 'Não informado', 0),
  ('TRAXX', 'SKY 50 PLUS', 'Não informado', 0),
  ('TRAXX', 'WORK 125', 'Não informado', 0),
  ('TRIELHT', 'SR / TRIELHT POWER 3E CF', 'Não informado', 0),
  ('TRIUMPH', 'ADVENTURER 900', 'Não informado', 0),
  ('TRIUMPH', 'BONNEVILLE 750CC/ 790CC / 865CC', 'Não informado', 0),
  ('TRIUMPH', 'BONNEVILLE BOBBER 1200CC', 'Não informado', 0),
  ('TRIUMPH', 'BONNEVILLE T 100 865CC', 'Não informado', 0),
  ('TRIUMPH', 'BONNEVILLE T120', 'Não informado', 0),
  ('TRIUMPH', 'BONNEVILLE T120 BLACK', 'Não informado', 0),
  ('TRIUMPH', 'DAYTONA 1200', 'Não informado', 0),
  ('TRIUMPH', 'DAYTONA 675I', 'Não informado', 0),
  ('TRIUMPH', 'DAYTONA 675R', 'Não informado', 0),
  ('TRIUMPH', 'DAYTONA 900', 'Não informado', 0),
  ('TRIUMPH', 'DAYTONA 955I', 'Não informado', 0),
  ('TRIUMPH', 'DAYTONA SUPER III', 'Não informado', 0),
  ('TRIUMPH', 'DAYTONA T-955', 'Não informado', 0),
  ('TRIUMPH', 'LEGEND 900', 'Não informado', 0),
  ('TRIUMPH', 'ROCKET III 2300CC', 'Não informado', 0),
  ('TRIUMPH', 'ROCKET III CLASSIC 2300CC', 'Não informado', 0),
  ('TRIUMPH', 'ROCKET III ROADSTER 2300CC', 'Não informado', 0),
  ('TRIUMPH', 'SCRAMBLER 900CC', 'Não informado', 0),
  ('TRIUMPH', 'SPEED TRIPLE 1050I', 'Não informado', 0),
  ('TRIUMPH', 'SPEED TRIPLE 1050R', 'Não informado', 0),
  ('TRIUMPH', 'SPEED TRIPLE 900', 'Não informado', 0),
  ('TRIUMPH', 'SPEED TRIPLE 955I', 'Não informado', 0),
  ('TRIUMPH', 'SPEED TRIPLE T-509 900CC', 'Não informado', 0),
  ('TRIUMPH', 'SPRINT 900', 'Não informado', 0),
  ('TRIUMPH', 'SPRINT RS 955', 'Não informado', 0),
  ('TRIUMPH', 'SPRINT ST 1050I', 'Não informado', 0),
  ('TRIUMPH', 'SPRINT ST 955', 'Não informado', 0),
  ('TRIUMPH', 'STREET CUP 900CC', 'Não informado', 0),
  ('TRIUMPH', 'STREET SCRAMBLER 900CC', 'Não informado', 0),
  ('TRIUMPH', 'STREET TRIPLE 675', 'Não informado', 0),
  ('TRIUMPH', 'STREET TRIPLE 675R', 'Não informado', 0),
  ('TRIUMPH', 'STREET TRIPLE 765 RS', 'Não informado', 0),
  ('TRIUMPH', 'STREET TRIPLE 765 S', 'Não informado', 0),
  ('TRIUMPH', 'STREET TWIN 900CC', 'Não informado', 0),
  ('TRIUMPH', 'THRUXTON 900CC', 'Não informado', 0),
  ('TRIUMPH', 'THRUXTON R 1200CC', 'Não informado', 0),
  ('TRIUMPH', 'THUNDERBIRD 1700 COMMANDER', 'Não informado', 0),
  ('TRIUMPH', 'THUNDERBIRD 1700 STORM', 'Não informado', 0),
  ('TRIUMPH', 'THUNDERBIRD 900', 'Não informado', 0),
  ('TRIUMPH', 'THUNDERBIRD 900 SPORT', 'Não informado', 0),
  ('TRIUMPH', 'TIGER 1050', 'Não informado', 0),
  ('TRIUMPH', 'TIGER 1050 SPORT', 'Não informado', 0),
  ('TRIUMPH', 'TIGER 1200 EXPLORER', 'Não informado', 0),
  ('TRIUMPH', 'TIGER 1200 EXPLORER XCA', 'Não informado', 0),
  ('TRIUMPH', 'TIGER 1200 EXPLORER XCX', 'Não informado', 0),
  ('TRIUMPH', 'TIGER 1200 EXPLORER XR', 'Não informado', 0),
  ('TRIUMPH', 'TIGER 1200XC EXPLORER', 'Não informado', 0),
  ('TRIUMPH', 'TIGER 750', 'Não informado', 0),
  ('TRIUMPH', 'TIGER 800', 'Não informado', 0),
  ('TRIUMPH', 'TIGER 800 XC', 'Não informado', 0),
  ('TRIUMPH', 'TIGER 800 XCA', 'Não informado', 0),
  ('TRIUMPH', 'TIGER 800 XCX', 'Não informado', 0),
  ('TRIUMPH', 'TIGER 800 XR', 'Não informado', 0),
  ('TRIUMPH', 'TIGER 800 XRX', 'Não informado', 0),
  ('TRIUMPH', 'TIGER 800 XRXL', 'Não informado', 0),
  ('TRIUMPH', 'TIGER 900', 'Não informado', 0),
  ('TRIUMPH', 'TIGER 955I', 'Não informado', 0),
  ('TRIUMPH', 'TRIDENT 750', 'Não informado', 0),
  ('TRIUMPH', 'TRIDENT 900', 'Não informado', 0),
  ('TRIUMPH', 'TROPHY 1200', 'Não informado', 0),
  ('TRIUMPH', 'TROPHY 900', 'Não informado', 0),
  ('TRIUMPH', 'TROPHY SE 1200', 'Não informado', 0),
  ('TRIUMPH', 'TT 600', 'Não informado', 0),
  ('TROLLER', 'PANTANAL 3.0 TDI ELET. 4X2 CS DIESEL', 'Não informado', 0),
  ('TROLLER', 'PANTANAL 3.0 TDI ELET. 4X4 CS DIESEL', 'Não informado', 0),
  ('TROLLER', 'RF ESPORT 4X4 2.0', 'Não informado', 0),
  ('TROLLER', 'RF ESPORT T-4 4X4 2.0 CAP. LONA', 'Não informado', 0),
  ('TROLLER', 'RF ESPORT T-4 4X4 2.0 CAP. RÍGIDA', 'Não informado', 0),
  ('TROLLER', 'T-4 4X4 2.8 TB INT. CAP. LONA DIESEL', 'Não informado', 0),
  ('TROLLER', 'T-4 4X4 2.8 TB INT. CAP. RÍGIDA DIESEL', 'Não informado', 0),
  ('TROLLER', 'T-4 4X4 3.0 TB INT. CAP. LONA DIESEL', 'Não informado', 0),
  ('TROLLER', 'T-4 4X4 3.0 TB INT. CAP. RÍGIDA DIESEL', 'Não informado', 0),
  ('TROLLER', 'T-4 4X4 3.2 20V TDI CAP. RÍGIDA DIESEL', 'Não informado', 0),
  ('TROLLER', 'T-4 4X4 3.2 TGV TDI CAP. RÍGIDA DIESEL', 'Não informado', 0),
  ('TROLLER', 'T-4 BOLD 4X4 3.2 TDI CAP. RíGIDA DIESEL', 'Não informado', 0),
  ('TROLLER', 'T-4 DESERT STORM 4X4 3.0 TB INT DIESEL', 'Não informado', 0),
  ('VENTO', 'REBELLIAN 250', 'Não informado', 0),
  ('VENTO', 'TRITON LI 150', 'Não informado', 0),
  ('VENTO', 'VTHUNDER 250', 'Não informado', 0),
  ('VILACOS', 'SR / VILACOS SR 3E CA', 'Não informado', 0),
  ('VOLKSWAGEN', '10-160 E DELIVERY 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '10-160 E DELIVERY PLUS 6X2 (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '11-130 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '11-130 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '11-140 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '11-140 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '12-140 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '12-140 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '12-140 H 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '12-140 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '12-140 TURBO 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '12-170 BT 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '12-170 BT 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '12-180 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '12-180 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '13-130 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '13-130 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '13-150 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '13-160 E DELIVERY 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '13-170/ 13-170 E WORKER 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '13-170/ 13-170 E WORKER 3-EIXOS 2P (DIES', 'Não informado', 0),
  ('VOLKSWAGEN', '13-180 E CONSTELLATION 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '13-180 E CONSTELLATION 3-EIXOS 2P (DIESE', 'Não informado', 0),
  ('VOLKSWAGEN', '13-180/ 13-180 E WORKER 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '13-180/ 13-180 E WORKER 3-EIXOS 2P (DIES', 'Não informado', 0),
  ('VOLKSWAGEN', '13-190 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '13-190 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '13-190 E CONSTELLATION 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '13-190 E WORKER 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '14-140 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '14-140 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '14-150 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '14-150 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '14-170 BT 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '14-170 BT 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '14-180 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '14-180 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '14-200 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '14-200 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '14-210 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '14-210 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '14-220 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '14-220 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '15-170/ 15-170 E WORKER 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '15-170/ 15-170 E WORKER 3-EIXOS 2P (DIES', 'Não informado', 0),
  ('VOLKSWAGEN', '15-180 E CONSTELLATION 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '15-180/ 15-180 E WORKER 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '15-180/ 15-180 E WORKER 3-EIXOS 2P (DIES', 'Não informado', 0),
  ('VOLKSWAGEN', '15-190 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '15-190 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '15-190 E CONSTELLATION 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '15-190 E WORKER 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '16-170 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '16-170 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '16-170 BT 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '16-170 BT 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '16-200 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '16-200 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '16-210 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '16-210 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '16-210 H 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '16-210 H 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '16-220 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '16-220 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '16-300 T 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '16-300 TURBO 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-180 WORKER 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-180 WORKER 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-190 E CONSTELLATION 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-190 E WORKER 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-210 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-210 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-220/ 17-220 WORKER 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-220/ 17-220 WORKER 3-EIXOS 2P (DIESEL', 'Não informado', 0),
  ('VOLKSWAGEN', '17-230 E CONSTELLATION 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-230 WORKER 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-250 E CONSTELLATION 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-250 E CONSTELLATION TRACTOR 4X2 2P (D', 'Não informado', 0),
  ('VOLKSWAGEN', '17-250 E WORKER 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-250 E WORKER 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-280 E CONSTELLATION 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-300 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-300 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-310 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-310 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-320 E CONSTELLATION 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '17-330 E CONSTELLATION 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '18-310 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '18-310 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '19-320 E CONSTELLATION TITAN TRACTOR 2P', 'Não informado', 0),
  ('VOLKSWAGEN', '19-330 E CONSTELLATION 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '19-360 CONSTELLAT. TRACTOR (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '19-370 E CONSTELLATION TRACTOR 2P (DIESE', 'Não informado', 0),
  ('VOLKSWAGEN', '19-390 E CONSTELLATION 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '19-420 E CONSTELLATION 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '22-140 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '22-160 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '22-210 H 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '23-210 6X2 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '23-220 6X2 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '23-230 CONSTELLAT. 3-EIXOS (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '23-230 WORKER 3-EIXOS 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '23-250 E 6X2 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '23-310 6X2 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '24-220/ 24-220 WORKER T 3-EIXOS 2P (DIES', 'Não informado', 0),
  ('VOLKSWAGEN', '24-250 E CONSTELLATION 3-EIXOS 2P (DIESE', 'Não informado', 0),
  ('VOLKSWAGEN', '24-250/ 24-250 E T WORKER 3-EIXOS 2P (DI', 'Não informado', 0),
  ('VOLKSWAGEN', '24-280 E CONSTEL. 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '24-280 E CONSTEL. 8X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '24-320 E CONSTELLATION 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '24-330 E CONSTEL. 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '25-320 E CONSTELLATION 6X2 TITAN TRACTOR', 'Não informado', 0),
  ('VOLKSWAGEN', '25-370 E CONSTELLATION 6X2 TRACTOR 2P (D', 'Não informado', 0),
  ('VOLKSWAGEN', '25-390 E CONSTEL. 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '25-420 CONSTELLATION 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '26-220 6X4 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '26-260 8X4 4-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '26-260 E CONSTELLATION 6X4 3-EIXOS 2P (D', 'Não informado', 0),
  ('VOLKSWAGEN', '26-260/ 26-260 WORKER 6X4 3-EIXOS 2P (DI', 'Não informado', 0),
  ('VOLKSWAGEN', '26-280 E CONSTEL. 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '26-300 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '26-300 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '26-310 6X4 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '26-370 E CONSTELLATION 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '26-390 E CONSTEL. 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '26-420 E CONSTEL. 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '31-260 E CONSTELLATION 6X4 3-EIXOS 2P (D', 'Não informado', 0),
  ('VOLKSWAGEN', '31-260/ 31-260 WORKER 6X4 3-EIXOS 2P (DI', 'Não informado', 0),
  ('VOLKSWAGEN', '31-280 E CONSTEL. 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '31-310 6X4 3-EIXOS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '31-320 E CONSTELLATION 6X4 3-EIXOS 2P (D', 'Não informado', 0),
  ('VOLKSWAGEN', '31-330 E CONSTEL. 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '31-370 E CONSTELLATION 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '31-390 E CONSTEL. 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '35-300 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '40-300 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '5-140 E DELIVERY 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '5-150 E DELIVERY 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '6-80 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '6-90 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '7-100 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '7-110 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '7-110 S 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '7-90 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '8-100 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '8-120/ 8-120 EURO3 WORKER 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '8-140 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '8-150 E DELIVERY 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '8-150 E DELIVERY PLUS 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '8-150/ 8-150 E WORKER 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', '8-160 E DELIVERY 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', '9-150 E DELIVERY 2P (DIESEL)', 'CAMINHõES-LEVE-VANS', 0),
  ('VOLKSWAGEN', '9-150 E WORKER 2P (DIESEL)', 'CAMINHõES-LEVE-VANS', 0),
  ('VOLKSWAGEN', '9-160 E DELIVERY 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLKSWAGEN', 'AMAROK CD 4X4 S', 'Não informado', 0),
  ('VOLKSWAGEN', 'CROSSFOX G 2', 'Não informado', 0),
  ('VOLKSWAGEN', 'DELIVERY EXPRESS DRC 4X2', 'CAMINHõES-LEVE-VANS', 30),
  ('VOLKSWAGEN', 'FOX 1.0 TREND', 'Não informado', 0),
  ('VOLKSWAGEN', 'GOL', 'Não informado', 0),
  ('VOLKSWAGEN', 'GOL 1.0', 'Não informado', 0),
  ('VOLKSWAGEN', 'GOL 1.0 CITY', 'Não informado', 0),
  ('VOLKSWAGEN', 'GOL 1.0 GLV', 'Não informado', 0),
  ('VOLKSWAGEN', 'GOL 1000 1.0', 'Não informado', 0),
  ('VOLKSWAGEN', 'GOL CL MB', 'Não informado', 0),
  ('VOLKSWAGEN', 'GOL GLV 1.0', 'Não informado', 0),
  ('VOLKSWAGEN', 'GOL SPECIAL MB', 'Não informado', 0),
  ('VOLKSWAGEN', 'GOL TL MB S', 'Não informado', 0),
  ('VOLKSWAGEN', 'GOL TL MBS', 'Não informado', 0),
  ('VOLKSWAGEN', 'JETTA R-LINE 250 TSI 1.4 FLEX 16V AUT', 'ESPECIAL V10 AUTOMOVEL', 20),
  ('VOLKSWAGEN', 'L-80 2P (DIESEL)', 'Não informado', 0),
  ('VOLKSWAGEN', 'NOVO GOL 1.0 CITY', 'Não informado', 0),
  ('VOLKSWAGEN', 'NOVO VOYAGE 1.0', 'Não informado', 0),
  ('VOLKSWAGEN', 'NOVO VOYAGE 1.6 CITY', 'Não informado', 0),
  ('VOLKSWAGEN', 'NOVO VOYAGE 1.6 HIGH', 'Não informado', 0),
  ('VOLKSWAGEN', 'POLO TRACK ROBUST 1.0 FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VOLKSWAGEN', 'SAVEIRO CS ST MB', 'Não informado', 0),
  ('VOLKSWAGEN', 'T CROSS HL TSI AE', 'AUTOMOVEL', 0),
  ('VOLKSWAGEN', 'VIRTUS EXCLUSIVE 250TSI 1.4 FLEX 16V AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VOLKSWAGEN', 'VOYAGE', 'Não informado', 0),
  ('VOLKSWAGEN', 'VOYAGE 1.0', 'Não informado', 0),
  ('VOLKSWAGEN', 'VOYAGE 1.6', 'Não informado', 0),
  ('VOLKSWAGEN', 'VOYAGE CITY MB', 'Não informado', 0),
  ('VOLKSWAGEN', 'VOYAGE CL MB', 'Não informado', 0),
  ('VOLKSWAGEN', 'VOYAGE MSID 4X4 3.0 TDI DIESEL AUT', 'Não informado', 0),
  ('VOLKSWAGEN', 'VPYAGE CITY', 'Não informado', 0),
  ('VOLKSWAGEN', 'VW GOL CLMB 1.0', 'Não informado', 0),
  ('VOLKSWAGEN', 'VW GOL TREND 1.0', 'Não informado', 0),
  ('VOLVO', '440 TURBO 1.8', 'Não informado', 0),
  ('VOLVO', '460 GLT 2.0/ TURBO 1.8', 'Não informado', 0),
  ('VOLVO', '850 GLE 2.5 20V', 'Não informado', 0),
  ('VOLVO', '850 GLE SW 20V', 'Não informado', 0),
  ('VOLVO', '850 GLT 2.5 20V', 'Não informado', 0),
  ('VOLVO', '850 GLT SW 2.5 20V', 'Não informado', 0),
  ('VOLVO', '850 R SW 2.3 TURBO', 'Não informado', 0),
  ('VOLVO', '850 SEDAN', 'Não informado', 0),
  ('VOLVO', '850 T-5 SW 2.5 BI-TURBO/ 2.3 TURBO', 'Não informado', 0),
  ('VOLVO', '850 TURBO 20V/ R TURBO 2.3', 'Não informado', 0),
  ('VOLVO', '940 TURBO/ SW TURBO 3.0', 'Não informado', 0),
  ('VOLVO', '960 SEDAN', 'Não informado', 0),
  ('VOLVO', 'B10M', 'Não informado', 0),
  ('VOLVO', 'C30 2.0 145CV', 'Não informado', 0),
  ('VOLVO', 'C30 2.4 170CV AUT', 'Não informado', 0),
  ('VOLVO', 'C30 T-5 2.5 220/ 230CV AUT.', 'Não informado', 0),
  ('VOLVO', 'C30 T-5 2.5 230CV MEC.', 'Não informado', 0),
  ('VOLVO', 'C30 T-5 R-DESIGN 2.5 230CV AUT.', 'Não informado', 0),
  ('VOLVO', 'C70 CABRIOLET', 'Não informado', 0),
  ('VOLVO', 'C70 CUPÊ', 'Não informado', 0),
  ('VOLVO', 'FH 400 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 400 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 400 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 400 GLOBETROTTER 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 400 GLOBETROTTER 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 400 GLOBETROTTER 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 420 6X2 T', 'Não informado', 0),
  ('VOLVO', 'FH 440 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 440 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 440 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 440 GLOBETROTTER 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 440 GLOBETROTTER 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 440 GLOBETROTTER 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 480 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 480 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 480 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 480 GLOBETROTTER 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 480 GLOBETROTTER 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 480 GLOBETROTTER 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 520 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 520 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 520 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 520 GLOBETROTTER 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 520 GLOBETROTTER 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH 520 GLOBETROTTER 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH-12 380 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH-12 380 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH-12 380 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH-12 380 GLOBETROTTER 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH-12 380 GLOBETROTTER 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH-12 420 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH-12 420 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH-12 420 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH-12 420 GLOBETROTTER 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH-12 420 GLOBETROTTER 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH-12 420 GLOBETROTTER 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH-12 460 4X2 2P TA/TB (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH-12 460 6X2 2P TA/TB (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH-12 460 6X4 2P TA/TB (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FH-16 750 GLOBETROTTER 8X4 2P (DIE)(E5)', 'Não informado', 0),
  ('VOLVO', 'FH-420 4X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-420 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-420 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-420 8X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLVO', 'FH-420 GLOBETROTTER 4X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-420 GLOBETROTTER 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-420 GLOBETROTTER 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-420 GLOBETROTTER 8X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLVO', 'FH-460 4X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-460 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-460 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-460 8X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLVO', 'FH-460 GLOBETROTTER 4X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-460 GLOBETROTTER 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-460 GLOBETROTTER 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-460 GLOBETROTTER 8X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLVO', 'FH-500 4X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-500 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-500 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-500 8X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLVO', 'FH-500 GLOBETROTTER 4X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-500 GLOBETROTTER 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-500 GLOBETROTTER 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-500 GLOBETROTTER 8X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLVO', 'FH-540 4X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-540 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-540 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-540 8X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLVO', 'FH-540 8X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLVO', 'FH-540 GLOBETROTTER 4X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-540 GLOBETROTTER 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-540 GLOBETROTTER 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FH-540 GLOBETROTTER 8X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLVO', 'FH-540 GLOBETROTTER 8X4 2P (DIESEL).', 'Não informado', 0),
  ('VOLVO', 'FM 370 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FM 370 4X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FM 370 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FM 370 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FM 380 4X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLVO', 'FM 380 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLVO', 'FM 400 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FM 400 8X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FM 440 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FM 440 8X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FM 460 6X4 (DIESEL)(E5)', 'Não informado', 0),
  ('VOLVO', 'FM 480 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FM 480 8X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FM-10 320 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FM-12 340 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FM-12 340 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FM-12 380 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FM-12 420 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FMX 370 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FMX 370 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FMX 380 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLVO', 'FMX 400 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FMX 400 8X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FMX 420 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FMX 420 8X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FMX 440 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FMX 440 8X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FMX 460 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FMX 460 8X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FMX 480 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FMX 480 8X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'FMX 500 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FMX 500 8X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'FMX 540 6X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLVO', 'FMX 540 8X4 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLVO', 'MPOLO VIAGGIO R', 'Não informado', 0),
  ('VOLVO', 'N-10 280 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'N-10 280 H 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'N-10 280 TURBO-II H 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'N-10 280 XH 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'N-10 300 XH 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'N-10 340 XHT 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'N-12 360 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'N-12 360 XH 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'N-12 360 XHT 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NH-12 340 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NH-12 380 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NH-12 380 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NH-12 380 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NH-12 380 GLOBETROTTER 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NH-12 380 GLOBETROTTER 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NH-12 380 GLOBETROTTER 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NH-12 420 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NH-12 420 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NH-12 420 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NH-12 420 GLOBETROTTER 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NH-12 420 GLOBETROTTER 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NH-12 460 4X2 2P TA/TB (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NH-12 460 6X2 2P TA/TB (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NH-12 460 6X4 2P TA/TB (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-10 280 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-10 280 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-10 280 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-10 310 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-10 310 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-10 320 EDC 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-10 320 EDC 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-10 320 EDC 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-10 320 EDC GOLD 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-10 340 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-10 340 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-10 340 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-12 360 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-12 360 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-12 360 EDC 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-12 360 EDC 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-12 360 EDC 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-12 360 EDC GOLD 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-12 360 EDC GOLD 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-12 360 EDC GOLD 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-12 400 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-12 400 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-12 400 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-12 410 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-12 410 EDC 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-12 410 EDC 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-12 410 EDC 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-12 410 EDC GOLD 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-12 410 EDC GOLD 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'NL-12 410 EDC GOLD 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'S40 1.8 AUT', 'Não informado', 0),
  ('VOLVO', 'S40 1.8 MEC.', 'Não informado', 0),
  ('VOLVO', 'S40 2.0 AUT.', 'Não informado', 0),
  ('VOLVO', 'S40 2.0 MEC.', 'Não informado', 0),
  ('VOLVO', 'S40 2.0 T', 'Não informado', 0),
  ('VOLVO', 'S40 2.4 140CV AUT.', 'Não informado', 0),
  ('VOLVO', 'S40 2.4 170CV AUT.', 'Não informado', 0),
  ('VOLVO', 'S40 T 2.0 TURBO AUT.', 'Não informado', 0),
  ('VOLVO', 'S40 T-4', 'Não informado', 0),
  ('VOLVO', 'S40 T-4 ARM AUT.', 'Não informado', 0),
  ('VOLVO', 'S40 T-4 ARM MEC.', 'Não informado', 0),
  ('VOLVO', 'S40 T-5 2.5 220/230CV AUT.', 'Não informado', 0),
  ('VOLVO', 'S60 R 2.5 300CV AUT.', 'Não informado', 0),
  ('VOLVO', 'S60 R 2.5 300CV MEC.', 'Não informado', 0),
  ('VOLVO', 'S60 T 2.0 4P', 'Não informado', 0),
  ('VOLVO', 'S60 T 2.4/ 2.5', 'Não informado', 0),
  ('VOLVO', 'S60 T-4 1.6 180CV 4P', 'Não informado', 0),
  ('VOLVO', 'S60 T-4 KINETIC 2.0 190CV 4P', 'Não informado', 0),
  ('VOLVO', 'S60 T-4 MOMENTUM 2.0 190CV 4P', 'Não informado', 0),
  ('VOLVO', 'S60 T-5 2.0 240CV 4P', 'Não informado', 0),
  ('VOLVO', 'S60 T-5 2.3', 'Não informado', 0),
  ('VOLVO', 'S60 T-5 KINETIC 2.0 245CV 4P', 'Não informado', 0),
  ('VOLVO', 'S60 T-5 MOMENTUM 2.0 245CV 4P', 'Não informado', 0),
  ('VOLVO', 'S60 T-5 R-DESIGN 2.0 240CV 4P', 'Não informado', 0),
  ('VOLVO', 'S60 T-6 3.0 304CV AWD 4P', 'Não informado', 0),
  ('VOLVO', 'S60 T-6 R-DESIGN 2.0 306CV FWD 4P', 'Não informado', 0),
  ('VOLVO', 'S60 T-6 R-DESIGN 3.0 AWD 4P', 'Não informado', 0),
  ('VOLVO', 'S70 2.5', 'Não informado', 0),
  ('VOLVO', 'S70 2.5 AUT.', 'Não informado', 0),
  ('VOLVO', 'S70 R', 'Não informado', 0),
  ('VOLVO', 'S70 R AUT.', 'Não informado', 0),
  ('VOLVO', 'S70 T-5 2.3', 'Não informado', 0),
  ('VOLVO', 'S80 2.9', 'Não informado', 0),
  ('VOLVO', 'S80 2.9 ARM', 'Não informado', 0),
  ('VOLVO', 'S80 3.2 238CV AUT.', 'Não informado', 0),
  ('VOLVO', 'S80 4.4 V8 315CV AWD AUT.', 'Não informado', 0),
  ('VOLVO', 'S80 T-6 EXECUTIVE 2.8', 'Não informado', 0),
  ('VOLVO', 'S80 T-6 EXECUTIVE ARM 2.8 24V', 'Não informado', 0),
  ('VOLVO', 'S80 T6 2.8 BI-TURBO', 'Não informado', 0),
  ('VOLVO', 'S80 T6 2.8 BI-TURBO ARM', 'Não informado', 0),
  ('VOLVO', 'V40 1.8 AUT', 'Não informado', 0),
  ('VOLVO', 'V40 1.8 MEC.', 'Não informado', 0),
  ('VOLVO', 'V40 2.0', 'Não informado', 0),
  ('VOLVO', 'V40 2.0 AUT.', 'Não informado', 0),
  ('VOLVO', 'V40 2.0 TURBO', 'Não informado', 0),
  ('VOLVO', 'V40 T-3 KINETIC 1.5 AUT.', 'Não informado', 0),
  ('VOLVO', 'V40 T-4', 'Não informado', 0),
  ('VOLVO', 'V40 T-4 ARM AUT.', 'Não informado', 0),
  ('VOLVO', 'V40 T-4 AUT.', 'Não informado', 0),
  ('VOLVO', 'V40 T-4 CROSS COUNTRY 2.0 FWD AUT.', 'Não informado', 0),
  ('VOLVO', 'V40 T-4 KINETIC 2.0 AUT.', 'Não informado', 0),
  ('VOLVO', 'V40 T-4 MOMENTUM 2.0 AUT.', 'Não informado', 0),
  ('VOLVO', 'V40 T-5 CROSS COUNTRY 2.0 AWD AUT.', 'Não informado', 0),
  ('VOLVO', 'V40 T-5 R-DESIGN 2.0 AUT.', 'Não informado', 0),
  ('VOLVO', 'V50 2.4 20V 140CV AUT.', 'Não informado', 0),
  ('VOLVO', 'V50 2.4 20V 170CV AUT.', 'Não informado', 0),
  ('VOLVO', 'V50 T-5 2.5 220CV AUT.', 'Não informado', 0),
  ('VOLVO', 'V60 T-4 KINETIC 2.0 190CV 5P', 'Não informado', 0),
  ('VOLVO', 'V60 T-4 MOMENTUM 2.0 190CV 5P', 'Não informado', 0),
  ('VOLVO', 'V60 T-5 KINETIC 2.0 245CV 5P', 'Não informado', 0),
  ('VOLVO', 'V60 T-5 MOMENTUM 2.0 245CV 5P', 'Não informado', 0),
  ('VOLVO', 'V60 T-5 R-DESING 2.0 5P', 'Não informado', 0),
  ('VOLVO', 'V60 T-6 R-DESIGN 2.0 FWD 4P', 'Não informado', 0),
  ('VOLVO', 'V60 T-6 R-DESIGN 3.0 AWD 4P', 'Não informado', 0),
  ('VOLVO', 'V70 2.5', 'Não informado', 0),
  ('VOLVO', 'V70 CROSS COUNTRY 2.4', 'Não informado', 0),
  ('VOLVO', 'V70 R 2.5 300CV AWD AUT.', 'Não informado', 0),
  ('VOLVO', 'V70 R 2.5 300CV AWD MEC.', 'Não informado', 0),
  ('VOLVO', 'V70 T 2.0 20V 180CV 4P AUT.', 'Não informado', 0),
  ('VOLVO', 'V70 T 2.4', 'Não informado', 0),
  ('VOLVO', 'V70 T 2.4/ 2.5 PREMIUM', 'Não informado', 0),
  ('VOLVO', 'V70 T5 2.3', 'Não informado', 0),
  ('VOLVO', 'V70 XC/ XC 70', 'Não informado', 0),
  ('VOLVO', 'VM 220 4X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'VM 220 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLVO', 'VM 260 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'VM 260 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'VM 260 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'VM 270 4X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'VM 270 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'VM 270 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'VM 270 8X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'VM 270 8X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'VM 270 ATHOR 6X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'VM 310 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'VM 310 6X4 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'VM 330 4X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'VM 330 6X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VOLVO', 'VM 330 6X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'VM 330 8X2 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'VM 330 8X4 2P (DIESEL) (E5)', 'Não informado', 0),
  ('VOLVO', 'VM-17 210 4X2/ VM 210 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'VM-17 240 4X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'VM-23 210/ VM 210 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'VM-23 240 6X2 2P (DIESEL)', 'Não informado', 0),
  ('VOLVO', 'XC 60 2.0 T5 5P', 'Não informado', 0),
  ('VOLVO', 'XC 60 3.0 AWD 5P', 'Não informado', 0),
  ('VOLVO', 'XC 60 3.0 FWD 5P', 'Não informado', 0),
  ('VOLVO', 'XC 60 D-5 KINETIC 2.4 AWD DIESEL 5P', 'Não informado', 0),
  ('VOLVO', 'XC 60 D-5 MOMENTUM 2.4  AWD DIESEL  5P', 'Não informado', 0),
  ('VOLVO', 'XC 60 R-DESIGN 3.0 304CV AWD 5P', 'Não informado', 0),
  ('VOLVO', 'XC 60 T-5 INSCRIPTION 2.0 245 CV FWD 5P', 'Não informado', 0),
  ('VOLVO', 'XC 60 T-5 INSCRIPTION 2.0 AWD 5P', 'Não informado', 0),
  ('VOLVO', 'XC 60 T-5 KINETIC 2.0 245CV FWD 5P', 'Não informado', 0),
  ('VOLVO', 'XC 60 T-5 MOMENTUM 2.0 245CV FWD 5P', 'Não informado', 0),
  ('VOLVO', 'XC 60 T-5 MOMENTUM 2.0 254CV AWD 5P', 'Não informado', 0),
  ('VOLVO', 'XC 60 T-5 R-DESIGN 2.0 AWD 5P', 'Não informado', 0),
  ('VOLVO', 'XC 60 T-5 R-DESIGN 2.0 FWD 5P', 'Não informado', 0),
  ('VOLVO', 'XC 60 T-6 R-DESIGN 2.0 306CV FWD 5P', 'Não informado', 0),
  ('VOLVO', 'XC 90 2.5T 210CV AWD 5P', 'Não informado', 0),
  ('VOLVO', 'XC 90 3.2 238CV AWD 5P', 'Não informado', 0),
  ('VOLVO', 'XC 90 4.4 V8 315CV AWD 5P', 'Não informado', 0),
  ('VOLVO', 'XC 90 D-5 INSCRIPTION 2.0 235CV 5P', 'Não informado', 0),
  ('VOLVO', 'XC 90 D-5 MOMENTUM 2.0 235CV 5P', 'Não informado', 0),
  ('VOLVO', 'XC 90 T-6 FIRST EDITION 2.0 320CV 5P', 'Não informado', 0),
  ('VOLVO', 'XC 90 T-6 INSCRIPTION 2.0 320CV 5P', 'Não informado', 0),
  ('VOLVO', 'XC 90 T-6 MOMENTUM 2.0 320CV 5P', 'Não informado', 0),
  ('VOLVO', 'XC 90 T-8 HÍBRIDO EXCELLENCE 2.0  5P', 'Não informado', 0),
  ('VOLVO', 'XC 90 T-8 HÍBRIDO INSCRIPT 2.0 5P', 'Não informado', 0),
  ('VOLVO', 'XC 90 T6 2.9 BI-TB 272CV AWD 5P', 'Não informado', 0),
  ('VW - VOLKSWAGEN', '25-360 CONSTEL. 6X2 TRACTOR 2P (DIE)(E5)', 'Não informado', 0),
  ('VW - VOLKSWAGEN', '30-330 CONSTELLATION 8X2 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'AMAROK CD2.0 16V/S CD2.0 16V TDI 4X2 DIE', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'AMAROK CD2.0 16V/S CD2.0 16V TDI 4X4 DIE', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'AMAROK COMFOR CD 2.0 TDI 4X4', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'AMAROK CS2.0 16V/S2.0 16V TDI 4X2 DIESEL', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'AMAROK CS2.0 16V/S2.0 16V TDI 4X4 DIESEL', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'AMAROK HIG. EXTREME CD 2.0 4X4 DIES. AUT', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'AMAROK HIG.ULTIMATE CD 2.0 4X4 DIES. AUT', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'AMAROK HIGH.CD 2.0 16V TDI 4X4 DIES. AUT', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'AMAROK HIGHLINE CD 2.0 16V TDI 4X4 DIES.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'AMAROK HIGHLINE CD 3.0 4X4 TB DIES. AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'AMAROK SE CD 2.0 16V TDI 4X4 DIESEL', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'AMAROK T. DARK LABEL CD 2.0 4X4 DIES AUT', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'AMAROK TRENDLINE CD 2.0 16V TDI 4X4 DIES', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'AMAROK TRENDLINE CD 2.0 TDI 4X4 DIES AUT', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'APOLO GL 1.8', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'APOLO GLS/ VIP 1.8', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'BORA 2.0 8V COMFORTLINE AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('VW - VOLKSWAGEN', 'BORA 2.0 8V COMFORTLINE MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('VW - VOLKSWAGEN', 'BORA 2.0/ 2.0 FLEX 8V AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('VW - VOLKSWAGEN', 'BORA 2.0/ 2.0 FLEX 8V MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('VW - VOLKSWAGEN', 'CARAVELLE 2.4 DIESEL', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'CORRADO 2.0 TURBO', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'CORRADO G-60 2.8', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'CROSS UP! 1.0 T. FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'CROSS UP! I MOTION 1.0 T.FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'CROSSFOX 1.6 MI TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'CROSSFOX 1.6 T. FLEX 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'CROSSFOX I MOTION 1.6 MI T. FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'CROSSFOX I MOTION 1.6 T. FLEX 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'EOS CAB. 2.0 TURBO FSI TIPTRONIC', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'EUROVAN 2.4 DIESEL', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'FOX 1.0 GII', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'FOX 1.0 MI TOTAL FLEX 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX 1.0 MI TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX 1.6 MI I MOTION TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX 1.6 MI TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX BLUEMOTION 1.0 MI TOTAL FLEX 12V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX BLUEMOTION 1.0 MI TOTAL FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX BLUEMOTION 1.6 MI TOTAL FLEX 3P.', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX BLUEMOTION 1.6 MI TOTAL FLEX 5P.', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX CITY 1.0 MI/ 1.0MI TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX CITY 1.0MI/ 1.0MI TOTAL FLEX 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX CL ME', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'FOX COMFORTLINE 1.0 FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX COMFORTLINE 1.0 FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX COMFORTLINE 1.6 FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX COMFORTLINE I MOTION 1.6 FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX CONNECT 1.6 FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX CONNECT I MOTION 1.6 FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX EXTREME 1.6 MI TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX HIGHLINE I MOTION 1.6 FLEX 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX HIGHLINE1.6 FLEX 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX PEPPER 1.6 FLEX 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX PEPPER I MOTION 1.6 FLEX 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX PLUS 1.0MI/ 1.0MI TOTAL FLEX 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX PLUS 1.0MI/ 1.0MI TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX PLUS 1.6MI/ 1.6MI TOTAL FLEX 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX PLUS 1.6MI/ 1.6MI TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX PRIME/HGHI. IMOTION 1.6 T.FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX PRIME/HIGLI. 1.6 TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX ROCK IN RIO 1.6 MI TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX ROUTE 1.0 MI TOTAL FLEX 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX ROUTE 1.0 MI TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX ROUTE 1.6 MI TOTAL FLEX 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX ROUTE 1.6 MI TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX RUN 1.6 FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX SELEÇÃO 1.0 TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX SELEÇÃO 1.6 TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX SELEÇÃO IMOTION 1.6 MI T. FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX SPORTLINE/SPORTS 1.0 TOT.FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX SPORTLINE/SPORTS 1.0/1.0 TOT.FLEX 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX SPORTLINE/SPORTS 1.6/1.6 TOT.FLEX 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX SPORTLINE/SPORTS 1.6/1.6 TOT.FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX SUNRISE 1.0 MI TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX TRACK 1.0 FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX TRENDLINE 1.0 FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX TRENDLINE 1.0 FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX TRENDLINE 1.6 FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FOX XTREME 1.6 FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'FUSCA', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'FUSCA 2.0 R-LINE TSI 16V AUT.', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'FUSCA 2.0 TSI 16V AUT.', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'FUSCA 2.0 TSI 16V MEC.', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'GOL', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'GOL (NOVO) 1.0 MI TOTAL FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL (NOVO) 1.0 MI TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL (NOVO) 1.6 MI TOTAL FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL (NOVO) 1.6 MI TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL (NOVO) 1.6 POWER/HIGHI T.FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.0 FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.0 MI FUN/ HIGHWAY/ SPORT 16V 2/4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.0 PLUS 16V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.0 PLUS 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.0 PLUS 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.0 PLUS 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.0 POWER 16V 76CV 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.0 TOTAL FLEX 8V 5P (25 ANOS)', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.0 TREND/ POWER 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.0 TREND/ POWER 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.6 I MOTI.POWER/HIGHLI T.FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.6 MI I MOTION TOTAL FLEX 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.6 MI PLUS TOTAL FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.6 MI PLUS TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.6 MI POWER TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.6 MI RALLYE I MOTION T. FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.6 MI RALLYE TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.6 MI/ 1.6I 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.6 MI/ POWER 1.6 MI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.6 MSI FLEX 16V 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.6 MSI FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.8 MI', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.8 MI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.8 MI POWER TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1.8 MI RALLYE TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1000 (MODELO ANTIGO)', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1000 MI 16V 2P TURBO', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1000 MI 16V 4P TURBO', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1000 MI 16V/ OURO 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1000 MI 16V/ OURO 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1000 MI 2P / 1000I', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1000 MI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1000 MI PLUS 16V 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1000 MI PLUS 8V 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 1000I PLUS 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 2.0 MI 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL 2.0 MI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL BLACK 1.0 MI TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL CITY (TREND)  MI T.FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL CITY (TREND) 1.0 MI TOTAL FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL CITY (TREND)/TITAN 1.0 T. FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL CITY 1.0 MI 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL CITY 1.0 MI 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL CITY 1.0 TOTAL FLEX 12V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL CITY 1.6 MI 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL CITY 1.6 MI 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL CITY 1.6 MI TOTAL FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL CL 1.6 MI 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL CL 1.8 MI 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL CLI / CL 1.8', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL CLI / CL/ COPA/ STONES 1.6', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL COMFORTLINE 1.0 T. FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL COMFORTLINE 1.0 T. FLEX 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL COMFORTLINE 1.6 T. FLEX 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL COMFORTLINE 1.6 T. FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL COPA 1.0 MI TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL COPA 1.6 MI TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL ECOMOTION 1.0 MI TOTAL FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL ECOMOTION 1.0 MI TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL FURGAO 1.0 MI', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL FURGÃO 1.6 MI/ 1.6I/ 1.6', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL GL 1.6 MI/STAR 1.6 E 1.8/ATLANTA 1.6', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL GL 1.8 MI 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL GLI / GL/ ATLANTA 1.8', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL GLS 2.0 MI', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL GT/GTS 1.8', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL GTI 2.0', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL GTI 2000 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL I MOTION 1.6 MI TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL I MOTION COMFORT. 1.6 T. FLEX 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL I MOTION COMFORT. 1.6 T. FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL I MOTION TRENDLINE 1.6 T. FLEX 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL I MOTION TRENDLINE 1.6 T. FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL L 1.3/ L/ LS/ C/ S/ BX/ PLUS 1.6', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL PLUS 1.0 MI TOTAL FLEX 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL PLUS 1.0 MI TOTAL FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL RALLYE 1.6 T. FLEX 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL RALLYE I MOTION 1.6 T. FLEX 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL ROCK IN RIO 1.0 MI TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL SELEÇÃO 1.0 MI TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL SELEÇÃO 1.6 I MOTION T.FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL SELEÇÃO 1.6 TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL SPECIAL 1.0 MI 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL SPECIAL 1.0 TOTAL FLEX 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL SPECIAL 1.0 TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL SPECIAL 1.6 MI 8V 99CV 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL SPECIAL/ SPECIAL XTREME 1.0 MI 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL TECH 1.0 MI TOTAL FLEX 8V 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL TECH 1.0 MI TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL TL MC 1.6', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL TRACK 1.0 MI TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL TRACK 1.0 TOTAL FLEX 12CV 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL TRENDLINE 1.0 T.FLEX 12V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL TRENDLINE 1.0 T.FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL TRENDLINE 1.0 T.FLEX 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL TRENDLINE 1.0 T.FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL TRENDLINE 1.6 T. FLEX 8V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL TRENDLINE 1.6 T. FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL TSI 1.8/ 1.8MI', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOL TSI 2000 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'GOLF 1.6 MI TOTAL FLEX 8V 4P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF 1.6 MI TRIP/ SPORT 101CV 8V', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF 1.6MI/ 1.6MI GENER./BLACK & SILVER', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF 1.8 MI SPORT 150CV TURBO MEC/AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF 2.0/ 2.0 MI FLEX AUT/TIPTRONIC.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF 2.0/ 2.0 MI FLEX COMFORTLINE AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF 2.0/ 2.0 MI FLEX COMFORTLINE/ SPORT', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF 2.0/ 2.0 T. FLEX MEC.(BLACK & SILV)', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF BLACK EDITON 2.0 MI T. FLEX 8V TIP', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF COMFORTLINE 1.0 TSI TOTAL FLEX MEC.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF COMFORTLINE 1.4 TSI 140CV AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF COMFORTLINE 1.4 TSI 140CV MEC.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF COMFORTLINE 1.6 MSI TOTAL FLEX AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF COMFORTLINE 1.6 MSI TOTAL FLEX MEC.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF FLASH 1.6 MI/1.6 MI TOT. FLEX 8V 4P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF GL 1.8/ 2.0I 4P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF GLX 2.0 4P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF GT 2.0 MI T. FLEX 8V 4P TIPTRONIC', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF GT 2.0 MI TOTAL FLEX 8V 4P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF GTI 1.8 MI 180/193CV TURBO 4P MEC.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF GTI 1.8 MI 180/193CV TURBO 4P TIP.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF GTI 1.8 MI 20V 2P TURBO MEC.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF GTI 1.8 MI 20V TURBO 2P AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF GTI 1.8 MI 20V TURBO 4P AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF GTI 1.8 MI 20V TURBO 4P MEC.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF GTI 1.8 TURBO', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF GTI 2.0', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF GTI 2.0 TSI 220CV AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF GTI CABRIO 2.0 MI', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF GTI VR6/ GOLF 2.8 VR6', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF HIGHLINE 1.4 TSI 140CV AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF HIGHLINE 1.4 TSI 140CV MEC.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF HIGHLINE 1.4 TSI TOTAL FLEX AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF HIGHLINE 1.4 TSI TOTAL FLEX MEC.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF SILVER EDIT. 2.0 MI T.FLEX 8V MEC.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF SILVER EDIT. 2.0 MI T.FLEX 8V TIP.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF SPORTLINE 1.6 MI TOTAL FLEX 8V 4P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF SPORTLINE 2.0 MI TOTAL F. 8V TIP.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF TECH 1.6 MI TOTAL FLEX 8V 4P', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF VARIANT COMFORT. 1.4 TSI T.FLEX AUT', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF VARIANT COMFORTLINE 1.4 TSI MEC.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF VARIANT CONFORTLINE 1.4 TSI AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF VARIANT HIGHLINE 1.4 TSI AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GOLF VARIANT HIGHLINE 1.4 TSI T.FEX AUT', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'GRAND SAVEIRO XTREME/STREET 1.6/1.8/2.0', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'JETTA 2.5 20V 150/170CV TIPTRONIC', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('VW - VOLKSWAGEN', 'JETTA 250 TSI 1.4 FLEX 16V AUT.DA', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('VW - VOLKSWAGEN', 'JETTA COMFORT. 250 TSI 1.4 FLEX 16V AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('VW - VOLKSWAGEN', 'JETTA COMFORTLINE 1.4 TSI 16V 4P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('VW - VOLKSWAGEN', 'JETTA COMFORTLINE 2.0 T.FLEX 8V 4P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('VW - VOLKSWAGEN', 'JETTA COMFORTLINE 2.0 T.FLEX 8V 4P TIPT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('VW - VOLKSWAGEN', 'JETTA GLI 350 TSI 2.0 16V 4P AUT', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('VW - VOLKSWAGEN', 'JETTA GLX III 2.8 VR6', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('VW - VOLKSWAGEN', 'JETTA HIGHLINE 2.0 TSI 16V 4P TIPTRONIC', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('VW - VOLKSWAGEN', 'JETTA TRENDLINE 1.4 TSI 16V 4P AUT.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('VW - VOLKSWAGEN', 'JETTA TRENDLINE 1.4 TSI 16V 4P MEC.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('VW - VOLKSWAGEN', 'JETTA TRENDLINE 2.0 T.FLEX 8V 4P TIP.', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('VW - VOLKSWAGEN', 'JETTA VARIANT 2.5 20V 170CV TIPTRONIC', 'ESPECIAL V10 AUTOMOVEL', 0),
  ('VW - VOLKSWAGEN', 'KOMBI CARAT', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'KOMBI ESCOLAR 1.6 MPI', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'KOMBI ESCOLAR/ 50 ANOS 1.4 MI TOTAL FLEX', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'KOMBI FURGÃO', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'KOMBI FURGÃO 1.4 MI TOTAL FLEX 8V', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'KOMBI FURGÃO DIESEL', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'KOMBI LAST EDITION 56 1.4 MI TOTAL FLEX', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'KOMBI LOTAÇÃO 1.4 MI TOTAL FLEX 8V', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'KOMBI LOTAÇÃO 1.6 MPI', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'KOMBI PICK-UP', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'KOMBI PICK-UP DIESEL', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'KOMBI STANDARD 1.4 MI TOTAL FLEX 8V', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'KOMBI STANDARD/ LUXO/ SÉRIE PRATA', 'V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'LOGUS 1.6 / CLI / CL/ GL', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'LOGUS 1.8 / CLI / CL', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'LOGUS GLI / GL 1.8', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'LOGUS GLS 1.8', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'LOGUS GLSI / GLS 2000', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'LOGUS WOLFSBURG EDITION 2000I', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'NEW BEETLE 2.0 MI MEC./AUT.', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'NIVUS COMFORTLINE 1.0 200 TSI FLEX AUT.', 'V5 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'NIVUS HIGHLINE 1.0 200 TSI FLEX AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'NIVUS LAUNCHING ED. 1.0 200 TSI FLEX AUT', 'V5 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'NOVO VOYAGE 1.0', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PARATI 1.0 MI FUN/ SUNSET 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI 1.0 MI PLUS 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI 1.0 MI SUMMER 16V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI 1.0 MI TOUR 16V 76CV 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI 1.6 MI PLUS TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI 1.6 MI/ 1.6 MI CITY', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI 1.6MI/1.6MI CITY/T.FIELD T.FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI 1.8 MI CITY TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI 1.8 MI CROSSOVER TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI 1.8 MI PLUS TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI 1.8 MI T. FIELD TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI 1.8 MI TOUR 8V 99CV 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI 1.8 MI/ 1.8 MI PLUS', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI 1000 MI 16V 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI 1000 MI 16V 4P TURBO', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI 2.0 MI TOUR 8V 112CV 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI 2.0 MI/ 2.0 MI TRACK & FIELD', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI C 1.6/ CL 1.6 MI 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI CL 1.8 MI 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI CLI / CL/ ATLANTA 1.6', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI CLI / CL/ ATLANTA 1.8', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI COMFORTLINE 1.6 MI TOT.FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI COMFORTLINE 1.8 MI TOT.FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI CROSSOVER 2.0 8V/ 1.0 16V TB 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI EVIDENCE 1.8 8V/ 1.0 16V TB 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI GL 1.6 MI/ 1.6/ GLS/ CLUB 1.6', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI GL 1.8 MI/ CLUB 1.8 MI 2P E 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI GLI / GL 1.8', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI GLS 2.0 MI 2/4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI GLSI 2.0 / GLS/ SURF 1.8', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI GTI 2.0 MI 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI PLUS/ LS/ S', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI SURF 1.6 MI TOTAL FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI SURF 1.8 MI TOTAL FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI TITAN 1.6 MI TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PARATI UTILITY 1.8 8V/ 1.0 TURBO 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'PASSAT 1.8 AUT.', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT 1.8 MEC.', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT 1.8 TIPTRONIC', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT 2.0', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT 2.0 FSI TIPTRONIC', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT 2.8 V6 MEC.', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT 2.8 V6 PROTECT TIPTRONIC', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT 2.8 V6 TIPTRONIC', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT 3.2 V6 FSI 24V 250CV TIP.', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT CC 2.0 TSI 211CV TIPTRONIC', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT CC 3.6 V6 FSI 300CV TIPTRONIC', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT COMFORTLINE 2.0 TSI 220CV TIP.', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT HIGHLINE 2.0 TSI 220CV TIP.', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT L/LS/LSE/GL/GLS/TS/FLA/VILL/PLUS', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT POINTER GTS', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT R-LINE TB 2.0 TSI TIPTRONIC 4P', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT TURBO 1.8 MEC.', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT TURBO 1.8 TIPTRONIC', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT TURBO 2.0 FSI/TSI TIPTRONIC 4P', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT VARIANT 1.8 AUT.', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT VARIANT 1.8 MEC.', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT VARIANT 2.0', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT VARIANT 2.0 FSI 150CV TIPTRON.5P', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT VARIANT 2.8 V6', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT VARIANT 2.8 V6 TIPTRONIC', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT VARIANT 3.2 V6 FSI 24V 250CV TIP.', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT VARIANT R-LINE TB 2.0 TSI TIP. 5P', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT VARIANT TURBO 1.8', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT VARIANT TURBO 1.8 TIPTRONIC', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT VARIANT TURBO 2.0 FSI TIPTRON. 5P', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT VARIANT VR6 2.8', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'PASSAT VR6 2.8', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'POINTER 1.8 / CLI', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'POINTER GLI 1.8', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'POINTER GLI 2.0', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'POINTER GTI 2.0', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'POLO 1.0 MI 79CV 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO 1.6 E-FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO 1.6 MI/ S.OURO 1.6MI 101CV 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO 1.6 MI/S.OURO 1.6 MI TOT.FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO 1.6 MSI FLEX 16V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO 1.6 MSI TOTAL FLEX 16V 5P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO 2.0 MI 116CV 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO BLUEMOTION 1.6 TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO CLASSIC 1.0 MI 16V 65CV 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO CLASSIC/ SPECIAL 1.8 MI', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO COMFORT. 200 TSI 1.0 FLEX 12V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO COMFORTLINE TSI 1.0 FLEX 12V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO GT 2.0 MI TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO GTI 1.8 MI 150CV 20V TURBO 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO HIGHLINE 200 TSI 1.0 FLEX 12V AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO HL AB', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO I MOTION 1.6 TOTAL FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO MA', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO NEXT 1.6 MI 101CV 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO SED. COMFORT. 1.6 MI TOT. FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO SED./ SED. COMF. 2.0/2.0 FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO SED.COMFORT. I MOTION 1.6 T.FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO SEDAN 1.6 MI 101CV 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO SEDAN 1.6 MI TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO SEDAN EVIDENCE 1.6 MI T.FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO SEDAN I MOTION 1.6 TOTAL FLEX 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO SPORTLINE 1.6 MI TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO SPORTLINE 2.0 MI TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO SPORTLINE I MOTION 1.6 T.FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'POLO TRACK 1.0 FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 20),
  ('VW - VOLKSWAGEN', 'POLO1.0 FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'QUANTUM 1.8 MI/ 1.8I', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'QUANTUM 2.0 MI', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'QUANTUM CLI / CL / C/ CS/ CD/ CG 1.8/2.0', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'QUANTUM EVIDENC 2.0 MI', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'QUANTUM EXCLUSIV 2.0 MI', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'QUANTUM GLI / GL 1.8/ 2.0', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'QUANTUM GLSI / GLS 1.8/SPORT/ FAMILY 2.0', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'SANTANA 1.8 MI', 'V6 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SANTANA 2.0 MI 2P E 4P', 'V6 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SANTANA CLI /CL /C 1.8/2.0 /SU 2.0 2P/4P', 'V6 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SANTANA COMFORTLINE 1.8 MI 8V 4P', 'V6 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SANTANA CS/CD/CG', 'V6 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SANTANA EVIDENC 2.0 MI', 'V6 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SANTANA EXCLUSIV 2.0 MI/ EXECUTIVO 2.0I', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SANTANA GLI / GL/ SPORT 1.8/ 2.0', 'V6 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SANTANA GLSI / GLS 1.8/ 2.0', 'V6 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO 1.6 MI TOTAL FLEX 8V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO 1.6 MI/ 1.6 MI TOTAL FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO 1.6 MI/ 1.6MI CITY TOTAL FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO 1.8 MI', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO 2.0 MI', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO CITY 1.8 MI TOTAL FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO CL 1.6 MI / CL/ C 1.6', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO CL/ SUMMER 1.8 MI E 1.8', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO CROSS 1.6 MI TOTAL FLEX 8V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO CROSS 1.6 T. FLEX 16V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO CROSS 1.6 T.FLEX 16V CD', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO CROSSOVER 1.6 MI TOTAL FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO CROSSOVER 1.8 MI 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO CROSSOVER 1.8 MI TOTAL FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO DIESEL (TODAS)', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO FUN 1.8 99CV/ CITY E S.SURF 1.6', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO GL 1.8MI E 1.6/GL/LS/S/ SUNSET', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO HIGHLINE 1.6 T. FLEX 8V CD', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO PEPPER 1.6 FLEX 8V CD', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO PEPPER 1.6 FLEX 8V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO ROBUST 1.6 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO ROBUST 1.6 TOTAL FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO ROBUST 1.6 TOTAL FLEX 8V CD', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO ROCK IN RIO 1.6 TOTAL FLEX 8V CD', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO SPORTLINE 1.6 MI TOTAL FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO SPORTLINE 1.8 MI TOTAL FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO STARTLINE 1.6 T.FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO SUPER SURF 1.6 MI TOTAL FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO SUPER SURF 1.8 MI 8V 99CV', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO SUPER SURF 1.8 MI TOTAL FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO SURF 1.6 MI TOTAL FLEX 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO SURF 1.8 MI TOTAL FLEX 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO TITAN 1.6 MI TOTAL FLEX 2P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO TRENDLINE 1.6 T.FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO TRENDLINE 1.6 T.FLEX 8V CD', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO TRENDLINE 1.6 T.FLEX 8V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO TROOPER 1.6 MI TOTAL FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO TROOPER 1.6 MI TOTAL FLEX 8V CE', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SAVEIRO TSI 2.0 MI', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SPACECROSS 1.6 MI TOTAL FLEX 16V', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'SPACECROSS 1.6 MI TOTAL FLEX 8V', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'SPACECROSS I MOTION 1.6 MI T. FLEX 16V', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'SPACECROSS I MOTION 1.6 MI TOTAL FLEX 8V', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'SPACEFOX 1.6 TRENDLINE I MOT. T.FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SPACEFOX 1.6 TRENDLINE TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SPACEFOX 1.6/ 1.6 TREND TOTAL FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SPACEFOX COMF. I MOTION 1.6 FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SPACEFOX COMFORTLINE 1.6 MI T.FLEX 8V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SPACEFOX HIGHLINE 1.6 T.FLEX 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SPACEFOX HIGHLINE I MOT. 1.6 T.FLEX 16V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SPACEFOX ROUTE 1.6 MI T.FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SPACEFOX SPORTLINE/HIGHLINE 1.6 T.FLEX', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SPACEFOX SPORTLINE/HIGHLINE I MOTION 1.6', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'SPACEFOX TREND I MOTION 1.6 T. FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'T-CROSS 1.0 TSI FLEX 12V 5P AUT', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'T-CROSS 1.0 TSI FLEX 12V 5P AUT.', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'T-CROSS COMFORTLINE 1.0 TSI FLEX 5P AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'T-CROSS HIGHLINE 1.4 TSI FLEX 16V 5P AUT', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'T-CROSS SENSE 1.0 TSI FLEX 5P AUT.', 'ESPECIAL V6 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'TAOS HIGHLINE 1.4 250 TSI FLEX AUT.', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'TIGUAN 1.4 TSI 16V 150CV 5P', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'TIGUAN 2.0 TSI 16V 200CV TIPTRONIC 5P', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'TIGUAN ALLSPAC 250 TSI 1.4 FLEX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'TIGUAN ALLSPAC COMF 250 TSI 1.4 FLEX', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'TIGUAN ALLSPAC R-LINE 350 TSI 2.0 4X4', 'ESPECIAL  V10 PICKUPS/VANS/UTILITáRIOS', 0),
  ('VW - VOLKSWAGEN', 'TOUAREG 3.2 24V V6 TIPTRONIC 5P', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'TOUAREG 3.6 24V V6 280CV TIPTRONIC 5P', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'TOUAREG 4.2 32V V8 310CV TIPTRONIC 5P', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'TOUAREG R-LINE 4.2 V8 360CV TIPTRONIC 5P', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'UP! BLACK/WHITE/RED 1.0 T. FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! BLACK/WHITE/RED 1.0 TSI TFLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! BLACK/WHITE/RED I MOTION 1.0 FLEX 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! CONNECT 1.0 TSI TOTAL FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! CROSS 1.0 TSI TOTAL FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! HIGH 1.0 TOTAL FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! HIGH 1.0 TSI TOTAL FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! HIGH I MOTION 1.0 T. FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! MOVE 1.0 T. FLEX 12V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! MOVE 1.0 TOTAL FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! MOVE 1.0 TSI TOTAL FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! MOVE I MOTION 1.0 T. FLEX 12V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! MOVE I MOTION 1.0 T. FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! PEPPER 1.0 TSI L FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! RUN 1.0 TOTAL FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! RUN I MOTION 1.0 TOTAL FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! SPEED 1.0 TSI T. FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! TAKE 1.0 T. FLEX 12V 3P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! TAKE 1.0 TOTAL FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'UP! TRACK 1.0 TOTAL FLEX 12V 5P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VAN 1.6 MI (FURGÃO)', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'VIRTUS 1.6 MSI FLEX  16V 5P AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'VIRTUS 1.6 MSI FLEX 16V 4P AUT', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'VIRTUS 1.6 MSI FLEX 16V 4P AUT.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'VIRTUS 1.6 MSI FLEX 16V 5P MEC.', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'VIRTUS COMFORT. 200 TSI 1.0 FLEX 12V AUT', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'VIRTUS HIGHLINE 200 TSI 1.0 FLEX 12V AUT', 'ESPECIAL V5 /AUTOMóVEIS', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE', 'Não informado', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE 1.0 FLEX 12V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE 1.0 MI TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE 1.6 MI TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE 1.6 MSI FLEX 16V 4P AUT.', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE 1.6 MSI FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE C/CL/FOX 1.6', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE CITY MA', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE CL 1.8', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE COMF/HIGHLI. 1.6 MI T.FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE COMFORTLINE 1.0 T.FLEX 12V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE COMFORTLINE 1.0 T.FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE EVIDENCE 1.6 TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE GL 1.8 4P (ARGENTINO)', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE GL/ SPECIAL 1.6/ 1.8', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE I MOTION 1.6 MI TOTAL FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE I MOTION COMF/HGHLI.1.6 T.FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE I MOTION EVIDENCE 1.6 T.FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE I MOTION TREND 1.6 MI T. FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE I MOTION TRENDLINE 1.6 T.FLEX 8V', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE L/LS/PLUS/GLS/S/SPORT/SUPER L.ANG', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE SELEÇÃO 1.0 MI TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE SELEÇÃO 1.6 I MOTION T.FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE SELEÇÃO 1.6 TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE TREND 1.6 MI TOTAL FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE TRENDLINE 1.0 T.FLEX 12V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE TRENDLINE 1.0 T.FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VOLKSWAGEN', 'VOYAGE TRENDLINE 1.6 T.FLEX 8V 4P', 'V5 AUTOMOVEL COMUM', 0),
  ('VW - VW - VOLKSWAGEN', '11-180 DELIVERY 2P (DIESEL)(E5)', 'Não informado', 0),
  ('VW - VW - VOLKSWAGEN', '6-160 DELIVERY 2P (DIESEL)(E-5)', 'Não informado', 0),
  ('VW - VW - VOLKSWAGEN', '9-170 DELIVERY 2P (DIESEL)(E5)', 'Não informado', 0),
  ('WAKE', 'WAY 1.6 TOTAL FLEX 8V MEC.', 'Não informado', 0),
  ('WAKE', 'WAY 1.8 TOTAL FLEX 8V MEC.', 'Não informado', 0),
  ('WALK', 'BUGGY WALK SPORT 1.6 8V 58CV', 'Não informado', 0),
  ('WALKBUS', 'PHANTER SPECIAL ( ESCOLAR ) 2P (DIESEL)', 'Não informado', 0),
  ('WALKBUS', 'PHANTER SPECIAL ( EXECUTIVO/ TURISMO ) 2', 'Não informado', 0),
  ('WALKBUS', 'PHANTER SPECIAL ( URBANO/ SPTRANS ) 2P (', 'Não informado', 0),
  ('WUYANG', 'JET+ 50', 'Não informado', 0),
  ('WUYANG', 'MIND X50Q', 'Não informado', 0),
  ('WUYANG', 'WY 125-ESD', 'Não informado', 0),
  ('WUYANG', 'WY 125-ESD PLUS', 'Não informado', 0),
  ('WUYANG', 'WY 150-EX', 'Não informado', 0),
  ('WUYANG', 'WY 200 ZH', 'Não informado', 0),
  ('WUYANG', 'WY 48Q-2 LIBERTY 50', 'Não informado', 0),
  ('WUYANG', 'WY 48Q-2 PHOENIX + 50', 'Não informado', 0),
  ('WUYANG', 'WY 48Q-2 PHOENIX S 50', 'Não informado', 0),
  ('YAMAHA', '250 LANDER CONNECTED 2025', 'Não informado', 0),
  ('YAMAHA', '750 VIRAGO', 'Não informado', 0),
  ('YAMAHA', 'AXIS 90', 'Não informado', 0),
  ('YAMAHA', 'BWS 50', 'Não informado', 0),
  ('YAMAHA', 'CRYPTON 100', 'Não informado', 0),
  ('YAMAHA', 'DT 180-Z TRAIL', 'Não informado', 0),
  ('YAMAHA', 'DT 200', 'Não informado', 0),
  ('YAMAHA', 'DT 200 R', 'Não informado', 0),
  ('YAMAHA', 'FAZER 600/ FZ6 S', 'Não informado', 0),
  ('YAMAHA', 'FLUO 125 ABS', 'MOTOCICLETA', 0),
  ('YAMAHA', 'FZ15 150 FAZER', 'Não informado', 0),
  ('YAMAHA', 'FZ25 250 FAZER CAPITÃ MARVEL FLEX', 'Não informado', 0),
  ('YAMAHA', 'FZ25 250 FAZER CONNECTED', 'Não informado', 0),
  ('YAMAHA', 'FZ25 250 FAZER FLEX', 'Não informado', 0),
  ('YAMAHA', 'FZ6 N', 'Não informado', 0),
  ('YAMAHA', 'FZR 1000', 'Não informado', 0),
  ('YAMAHA', 'FZR 600', 'Não informado', 0),
  ('YAMAHA', 'JOG 50', 'Não informado', 0),
  ('YAMAHA', 'JOG TEEN 50', 'Não informado', 0),
  ('YAMAHA', 'MAJESTY YP 250', 'Não informado', 0),
  ('YAMAHA', 'MT -09 TRACER', 'Não informado', 0),
  ('YAMAHA', 'MT-01 1.670CC', 'Não informado', 0),
  ('YAMAHA', 'MT-03 321', 'Não informado', 0),
  ('YAMAHA', 'MT-03 660CC', 'Não informado', 0),
  ('YAMAHA', 'MT-07/MT-07 ABS 689CC', 'Não informado', 0),
  ('YAMAHA', 'MT-09 850CC', 'Não informado', 0),
  ('YAMAHA', 'NEO AT 115CC', 'Não informado', 0),
  ('YAMAHA', 'NEO AUTOMATIC 115CC', 'Não informado', 0),
  ('YAMAHA', 'NEO AUTOMATIC 125CC', 'Não informado', 0),
  ('YAMAHA', 'NMAX 160', 'Não informado', 0),
  ('YAMAHA', 'NMAX CONNECTED 160 ABS', 'Não informado', 0),
  ('YAMAHA', 'RD 135', 'Não informado', 0),
  ('YAMAHA', 'RD 350 LC/ R', 'Não informado', 0),
  ('YAMAHA', 'RDZ 125', 'Não informado', 0),
  ('YAMAHA', 'RDZ 135', 'Não informado', 0),
  ('YAMAHA', 'ROYAL STAR 1300', 'Não informado', 0),
  ('YAMAHA', 'T115 CRYPTON ED', 'Não informado', 0),
  ('YAMAHA', 'T115 CRYPTON ED PENELOPE', 'Não informado', 0),
  ('YAMAHA', 'T115 CRYPTON K', 'Não informado', 0),
  ('YAMAHA', 'TDM 225', 'Não informado', 0),
  ('YAMAHA', 'TDM 850', 'Não informado', 0),
  ('YAMAHA', 'TDM 900', 'Não informado', 0),
  ('YAMAHA', 'TDR 180', 'Não informado', 0),
  ('YAMAHA', 'TMAX 530', 'Não informado', 0),
  ('YAMAHA', 'TRX 850', 'Não informado', 0),
  ('YAMAHA', 'TT-R 125 E', 'Não informado', 0),
  ('YAMAHA', 'TT-R 125 LE', 'Não informado', 0),
  ('YAMAHA', 'TT-R 125 LWE', 'Não informado', 0),
  ('YAMAHA', 'TT-R 230', 'Não informado', 0),
  ('YAMAHA', 'V-MAX 1200', 'Não informado', 0),
  ('YAMAHA', 'V-MAX 1700', 'Não informado', 0),
  ('YAMAHA', 'WR 200', 'Não informado', 0),
  ('YAMAHA', 'WR 426 F', 'Não informado', 0),
  ('YAMAHA', 'XJ 600', 'Não informado', 0),
  ('YAMAHA', 'XJ6 F', 'Não informado', 0),
  ('YAMAHA', 'XJ6 N', 'Não informado', 0),
  ('YAMAHA', 'XJ6 N SP', 'Não informado', 0),
  ('YAMAHA', 'XJR 1200', 'Não informado', 0),
  ('YAMAHA', 'XMAX 250 ABS', 'Não informado', 0),
  ('YAMAHA', 'XT 1200 Z S.TÉNÉRÉ 60TH ANNIVERSARY', 'Não informado', 0),
  ('YAMAHA', 'XT 1200 Z SUPER TÉNÉRÉ', 'Não informado', 0),
  ('YAMAHA', 'XT 225', 'Não informado', 0),
  ('YAMAHA', 'XT 600 E', 'Não informado', 0),
  ('YAMAHA', 'XT 600 Z TENERE', 'Não informado', 0),
  ('YAMAHA', 'XT 660 R', 'Não informado', 0),
  ('YAMAHA', 'XT 660Z TÉNÉRÉ', 'Não informado', 0),
  ('YAMAHA', 'XTZ 125 E', 'Não informado', 0),
  ('YAMAHA', 'XTZ 125 K', 'Não informado', 0),
  ('YAMAHA', 'XTZ 125 XE', 'Não informado', 0),
  ('YAMAHA', 'XTZ 125 XK', 'Não informado', 0),
  ('YAMAHA', 'XTZ 150 CROSSER S FLEX', 'Não informado', 0),
  ('YAMAHA', 'XTZ 150 CROSSER Z FLEX', 'Não informado', 0),
  ('YAMAHA', 'XTZ 150 E CROSSER', 'Não informado', 0),
  ('YAMAHA', 'XTZ 150 ED CROSSER', 'Não informado', 0),
  ('YAMAHA', 'XTZ 250 LANDER 249CC', 'Não informado', 0),
  ('YAMAHA', 'XTZ 250 LANDER CAPITÃO AMÉRICA FLEX ABS', 'Não informado', 0),
  ('YAMAHA', 'XTZ 250 TENERE/TENERE BLUEFLEX', 'Não informado', 0),
  ('YAMAHA', 'XTZ 250X', 'Não informado', 0),
  ('YAMAHA', 'XTZ 750 S TENERE', 'Não informado', 0),
  ('YAMAHA', 'XV 1100 VIRAGO', 'Não informado', 0),
  ('YAMAHA', 'XV 250 VIRAGO', 'Não informado', 0),
  ('YAMAHA', 'XV 535 S VIRAGO', 'Não informado', 0),
  ('YAMAHA', 'XVS 1100 DRAG STAR', 'Não informado', 0),
  ('YAMAHA', 'XVS 650 DRAG STAR', 'Não informado', 0),
  ('YAMAHA', 'XVS 950 MIDNIGHT STAR', 'Não informado', 0),
  ('YAMAHA', 'YAMAHA XTZ 150 CROSSER', 'MOTOCICLETA', 0),
  ('YAMAHA', 'YBR 125 E', 'Não informado', 0),
  ('YAMAHA', 'YBR 125 ED', 'Não informado', 0),
  ('YAMAHA', 'YBR 125 FACTOR E', 'Não informado', 0),
  ('YAMAHA', 'YBR 125 FACTOR ED/FACTOR EDITION', 'Não informado', 0),
  ('YAMAHA', 'YBR 125 FACTOR K/ FACTOR K1', 'Não informado', 0),
  ('YAMAHA', 'YBR 125 FACTOR PRO E', 'Não informado', 0),
  ('YAMAHA', 'YBR 125 FACTOR PRO K', 'Não informado', 0),
  ('YAMAHA', 'YBR 125 K', 'Não informado', 0),
  ('YAMAHA', 'YBR 125I FACTOR ED', 'Não informado', 0),
  ('YAMAHA', 'YBR 150 FACTOR DX FLEX 2025', 'Não informado', 0),
  ('YAMAHA', 'YBR 150 FACTOR E', 'Não informado', 0),
  ('YAMAHA', 'YBR 150 FACTOR ED', 'Não informado', 0),
  ('YAMAHA', 'YFM 250 BRUIN 230CC', 'Não informado', 0),
  ('YAMAHA', 'YFM 350 GRIZZLY 350CC', 'Não informado', 0),
  ('YAMAHA', 'YFM 660R 660CC', 'Não informado', 0),
  ('YAMAHA', 'YFM 700R 686CC', 'Não informado', 0),
  ('YAMAHA', 'YFM 80 79CC', 'Não informado', 0),
  ('YAMAHA', 'YFS 200 BLASTER 195CC', 'Não informado', 0),
  ('YAMAHA', 'YFZ 450/ YZ 450 F 449CC', 'Não informado', 0),
  ('YAMAHA', 'YS 150 FAZER ED', 'Não informado', 0),
  ('YAMAHA', 'YS 150 FAZER SED', 'Não informado', 0),
  ('YAMAHA', 'YS 250 FAZER/ FAZER L. EDITION /BLUEFLEX', 'Não informado', 0),
  ('YAMAHA', 'YZ 125', 'Não informado', 0),
  ('YAMAHA', 'YZ 250', 'Não informado', 0),
  ('YAMAHA', 'YZF 1000 THUNDERACE', 'Não informado', 0),
  ('YAMAHA', 'YZF 600 THUNDERCAT', 'Não informado', 0),
  ('YAMAHA', 'YZF 750', 'Não informado', 0),
  ('YAMAHA', 'YZF R-1 1000', 'Não informado', 0),
  ('YAMAHA', 'YZF R-15 155 ABS', 'Não informado', 0),
  ('YAMAHA', 'YZF R-1M 1000', 'Não informado', 0),
  ('YAMAHA', 'YZF R-3 321', 'Não informado', 0),
  ('YAMAHA', 'YZF R-6 600', 'Não informado', 0),
  ('YAMAHA', 'YZF R1', 'Não informado', 0),
  ('ZONTES', 'T310', 'MOTOCICLETA', 0)
) as v(marca, modelo, tipo, idade)
join marcas m on m.nome = v.marca
on conflict (marca_id, nome) do nothing;

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0016_cotas_participacao.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- SCar :: 0016_cotas_participacao.sql
-- Desacopla a COTA DE PARTICIPACAO (rateio no evento) do Plano.
-- Estrategia: catalogo de cotas (V5..V15) + heranca pelo modelo (padrao SGA)
-- + sobrescrita opcional no veiculo, resolvida por precedencia:
--   veiculo (override) -> modelo (herdado) -> participacao_faixa (padrao atual).
-- Assim uma variacao de % nao exige um novo Plano inteiro.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Catalogo das cotas (fonte unica). Trocar V10 aqui reflete em tudo.
-- ----------------------------------------------------------------------------
create table if not exists cotas_participacao (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique,          -- 'V5','V6','V10','V12','V15'
  percentual  numeric(5,4) not null,         -- 0.10 = 10% da FIPE
  descricao   text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into cotas_participacao (codigo, percentual, descricao) values
  ('V5',  0.05, 'Cota 5% da FIPE'),
  ('V6',  0.06, 'Cota 6% da FIPE'),
  ('V10', 0.10, 'Cota 10% da FIPE'),
  ('V12', 0.12, 'Cota 12% da FIPE'),
  ('V15', 0.15, 'Cota 15% da FIPE')
on conflict (codigo) do nothing;

-- ----------------------------------------------------------------------------
-- (B) Modelo herda a cota (via parser do texto SGA) + guarda grupo/especial.
-- ----------------------------------------------------------------------------
alter table modelos
  add column if not exists cota_participacao_id uuid references cotas_participacao(id) on delete set null,
  add column if not exists grupo_veiculo        text,
  add column if not exists especial             boolean not null default false;

-- ----------------------------------------------------------------------------
-- (C) Veiculo pode sobrescrever manualmente (exceção pontual). NULL = herda.
--     modelo_id liga o veiculo ao catalogo de modelos (para herdar a cota).
-- ----------------------------------------------------------------------------
alter table veiculos
  add column if not exists cota_participacao_id uuid references cotas_participacao(id) on delete set null,
  add column if not exists modelo_id            uuid references modelos(id) on delete set null;

create index if not exists idx_modelos_cota  on modelos (cota_participacao_id);
create index if not exists idx_veiculos_cota on veiculos (cota_participacao_id);
create index if not exists idx_veiculos_modelo on veiculos (modelo_id);

-- ----------------------------------------------------------------------------
-- (D) Backfill: extrai [ESPECIAL] V<N> <GRUPO> do texto ja importado (SGA).
--     - especial      = prefixo "ESPECIAL"
--     - cota (V<N>)    = casa com o catalogo cotas_participacao
--     - grupo_veiculo  = restante, sem acentos, sem ESPECIAL, sem V<N>
-- ----------------------------------------------------------------------------
update modelos m set
  especial = (upper(coalesce(m.tipo_veiculo,'')) like 'ESPECIAL%'),
  grupo_veiculo = nullif(
    trim(both ' /-' from regexp_replace(
      regexp_replace(upper(unaccent(coalesce(m.tipo_veiculo,''))), '^ESPECIAL', ''),
      '\yV\s*[0-9]+\y', '', 'g')), ''),
  cota_participacao_id = (
    select cp.id
    from regexp_match(upper(coalesce(m.tipo_veiculo,'')), '\yV\s*([0-9]+)\y') rm
    join cotas_participacao cp on cp.codigo = 'V' || rm[1]
  )
where m.tipo_veiculo is not null;

-- ============================================================================
-- MOTOR DE CALCULO
-- ============================================================================

-- Preview no simulador: participacao por tipo/faixa, com cota opcional.
-- Se p_cota_id informado -> % da FIPE da cota; senao -> faixa padrao (atual).
-- (overload de 3 args; a versao de 2 args do 0010 continua existindo)
create or replace function calcular_participacao(
  p_fipe numeric, p_tipo_veiculo_id uuid, p_cota_id uuid
) returns numeric language plpgsql stable as $$
declare v_pct numeric;
begin
  if p_cota_id is not null then
    select percentual into v_pct from cotas_participacao where id = p_cota_id;
    if v_pct is not null then return round(p_fipe * v_pct, 2); end if;
  end if;
  return calcular_participacao(p_fipe, p_tipo_veiculo_id);   -- fallback faixa padrao
end;
$$;

-- Participacao real de um veiculo, com precedencia completa.
create or replace function calcular_participacao_veiculo(
  p_veiculo_id uuid, p_fipe numeric
) returns numeric language plpgsql stable as $$
declare
  v_pct  numeric;
  v_tipo uuid;
begin
  -- 1) override do veiculo  2) cota herdada do modelo
  select coalesce(cv.percentual, cm.percentual), v.tipo_veiculo_id
    into v_pct, v_tipo
  from veiculos v
  left join cotas_participacao cv on cv.id = v.cota_participacao_id
  left join modelos            md on md.id = v.modelo_id
  left join cotas_participacao cm on cm.id = md.cota_participacao_id
  where v.id = p_veiculo_id;

  if v_pct is not null then
    return round(p_fipe * v_pct, 2);
  end if;

  -- 3) fallback: tabela padrao por tipo/faixa FIPE (comportamento atual)
  return calcular_participacao(p_fipe, v_tipo);
end;
$$;

-- ============================================================================
-- RLS + grants
-- ============================================================================
alter table cotas_participacao enable row level security;

drop policy if exists cotas_select on cotas_participacao;
drop policy if exists cotas_write  on cotas_participacao;
create policy cotas_select on cotas_participacao for select to authenticated using (is_staff());
create policy cotas_write  on cotas_participacao for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

grant select, insert, update, delete on cotas_participacao to authenticated;
grant execute on function calcular_participacao(numeric, uuid, uuid) to authenticated;
grant execute on function calcular_participacao_veiculo(uuid, numeric) to authenticated;

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0017_crm_vendas.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- SCar :: 0017_crm_vendas.sql
-- Rotina de Vendas + CRM de Leads com trava de Auditoria.
-- Esteira: NOVO -> ORCAMENTO_GERADO -> PROPOSTA_ENVIADA -> APROVADO
--          -(auto)-> EM_AUDITORIA -> ATIVO   (ou PERDIDO a qualquer momento)
-- Regra-chave: aprovar NAO cria o veiculo/associado na base; so a Auditoria,
-- via autorizar_entrada_lead(), efetiva o cadastro (SECURITY DEFINER).
-- ============================================================================

-- Papel de Auditoria (admin tambem pode auditar).
alter type papel_usuario add value if not exists 'auditoria';

-- Status da esteira do lead.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'status_lead') then
    create type status_lead as enum (
      'NOVO','ORCAMENTO_GERADO','PROPOSTA_ENVIADA','APROVADO','EM_AUDITORIA','ATIVO','PERDIDO'
    );
  end if;
end $$;

-- Origem do valor FIPE usado no lead.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'origem_fipe') then
    create type origem_fipe as enum ('API','MANUAL','CONTINGENCIA');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Leads
-- ----------------------------------------------------------------------------
create table if not exists leads (
  id                   uuid primary key default gen_random_uuid(),
  -- Lead / contato
  nome                 text not null,
  celular              text not null,
  email                text,
  cpf_cnpj             text,                 -- capturado/confirmado na auditoria
  -- Veiculo (cotado; ainda nao e um registro oficial)
  placa                text,
  tipo_veiculo_id      uuid references tipos_veiculo(id) on delete set null,
  marca                text,
  modelo               text,
  modelo_id            uuid references modelos(id) on delete set null,
  ano_modelo           smallint,
  combustivel          combustivel,
  valor_fipe           numeric(12,2),
  codigo_fipe          text,
  cota_participacao_id uuid references cotas_participacao(id) on delete set null,
  uso                  uso_veiculo not null default 'passeio',
  origem_fipe          origem_fipe not null default 'API',
  -- CRM
  status               status_lead not null default 'NOVO',
  consultor_id         uuid references usuarios(id) on delete set null,
  regional_id          uuid references regionais(id) on delete set null,
  observacoes          text,
  perdido_motivo       text,
  -- Conversao (preenchidos quando a Auditoria autoriza)
  cliente_id           uuid references clientes(id) on delete set null,
  veiculo_id           uuid references veiculos(id) on delete set null,
  aprovado_em          timestamptz,
  auditado_em          timestamptz,
  auditado_por         uuid references usuarios(id) on delete set null,
  created_by           uuid references usuarios(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_leads_status    on leads (status);
create index if not exists idx_leads_consultor  on leads (consultor_id);
create index if not exists idx_leads_regional    on leads (regional_id);
create index if not exists idx_leads_placa       on leads (placa);

-- ----------------------------------------------------------------------------
-- Cotacoes (snapshot do orcamento; gera o link publico)
-- ----------------------------------------------------------------------------
create table if not exists cotacoes (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid not null references leads(id) on delete cascade,
  fipe                 numeric(12,2) not null,
  tipo_veiculo_id      uuid references tipos_veiculo(id) on delete set null,
  cota_participacao_id uuid references cotas_participacao(id) on delete set null,
  itens                jsonb not null default '[]'::jsonb,  -- [{produto_id,nome,valor,obrigatorio}]
  total_mensalidade    numeric(12,2) not null default 0,
  participacao         numeric(12,2) not null default 0,
  modo_envio           text not null default 'DETALHADA',   -- DETALHADA | CONSOLIDADA
  token                uuid not null unique default gen_random_uuid(),
  enviada_em           timestamptz,
  created_by           uuid references usuarios(id) on delete set null,
  created_at           timestamptz not null default now()
);
create index if not exists idx_cotacoes_lead on cotacoes (lead_id);

-- ----------------------------------------------------------------------------
-- Historico de status (trilha de auditoria do CRM)
-- ----------------------------------------------------------------------------
create table if not exists lead_historico (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  de          status_lead,
  para        status_lead not null,
  usuario_id  uuid references usuarios(id) on delete set null,
  obs         text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_lead_hist_lead on lead_historico (lead_id);

-- ----------------------------------------------------------------------------
-- Tabela de contingencia FIPE (fallback quando a API falha)
-- Populada por importacao mensal (ETL a parte).
-- ----------------------------------------------------------------------------
create table if not exists fipe_precos_local (
  id             uuid primary key default gen_random_uuid(),
  tipo_veiculo   text,
  marca          text not null,
  modelo         text not null,
  ano_modelo     smallint not null,
  codigo_fipe    text,
  valor          numeric(12,2) not null,
  mes_referencia text,
  updated_at     timestamptz not null default now(),
  unique (marca, modelo, ano_modelo)
);
create index if not exists idx_fipe_local_codigo on fipe_precos_local (codigo_fipe, ano_modelo);

-- ============================================================================
-- FUNCOES / TRIGGERS
-- ============================================================================

-- Quem pode auditar (autorizar entrada na base).
-- Compara como TEXTO de proposito: assim o literal 'auditoria' nao e resolvido
-- como valor de enum na mesma transacao que o adicionou (erro 55P04 no Supabase).
create or replace function pode_auditar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth_papel()::text in ('auditoria','admin'), false);
$$;

-- updated_at
create trigger trg_leads_updated before update on leads
  for each row execute function set_updated_at();

-- Aprovar o orcamento NAO cria nada: auto-avanca para EM_AUDITORIA (trava).
create or replace function fn_lead_aprovacao()
returns trigger language plpgsql as $$
begin
  if new.status = 'APROVADO' and old.status is distinct from 'APROVADO' then
    new.status := 'EM_AUDITORIA';
    new.aprovado_em := coalesce(new.aprovado_em, now());
  end if;
  return new;
end;
$$;
create trigger trg_lead_aprovacao before update on leads
  for each row execute function fn_lead_aprovacao();

-- Trilha de historico a cada mudanca de status.
create or replace function fn_lead_historico()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into lead_historico(lead_id, de, para, usuario_id) values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into lead_historico(lead_id, de, para, usuario_id) values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;
create trigger trg_lead_hist_ins after insert on leads
  for each row execute function fn_lead_historico();
create trigger trg_lead_hist_upd after update on leads
  for each row execute function fn_lead_historico();

-- AUTORIZAR ENTRADA: unica porta para a base oficial. So Auditoria/admin.
-- Cria (ou reaproveita) o cliente pelo CPF/CNPJ, cria o veiculo e marca ATIVO.
create or replace function autorizar_entrada_lead(p_lead_id uuid, p_cpf_cnpj text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  l          leads;
  v_doc      text;
  v_tipo     tipo_pessoa;
  v_cliente  uuid;
  v_veiculo  uuid;
begin
  if not pode_auditar() then
    raise exception 'Sem permissao: apenas a Auditoria pode autorizar a entrada na base';
  end if;

  select * into l from leads where id = p_lead_id for update;
  if not found then raise exception 'Lead nao encontrado'; end if;
  if l.status <> 'EM_AUDITORIA' then
    raise exception 'Lead nao esta Em Auditoria (status atual: %)', l.status;
  end if;
  if l.veiculo_id is not null then
    raise exception 'Lead ja foi convertido';
  end if;

  v_doc := regexp_replace(coalesce(p_cpf_cnpj, l.cpf_cnpj, ''), '[^0-9]', '', 'g');
  v_tipo := (case when length(v_doc) > 11 then 'PJ' else 'PF' end)::tipo_pessoa;
  if not validar_documento(v_doc, v_tipo) then
    raise exception 'CPF/CNPJ invalido ou ausente - confira a documentacao';
  end if;

  -- cliente: reaproveita se ja existir pelo documento, senao cria
  select id into v_cliente from clientes where cpf_cnpj = v_doc;
  if v_cliente is null then
    insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, email, telefone, regional_id)
    values (v_tipo, l.nome, v_doc, l.email, l.celular, l.regional_id)
    returning id into v_cliente;
  end if;

  -- veiculo oficial
  insert into veiculos (cliente_id, placa, marca, modelo, ano_modelo, valor_fipe, codigo_fipe,
                        combustivel, uso, tipo_veiculo_id, cota_participacao_id, modelo_id, regional_id, status)
  values (v_cliente, upper(coalesce(l.placa, '')), l.marca, l.modelo, l.ano_modelo, l.valor_fipe, l.codigo_fipe,
          l.combustivel, l.uso, l.tipo_veiculo_id, l.cota_participacao_id, l.modelo_id, l.regional_id, 'ativo')
  returning id into v_veiculo;

  update leads set
    status = 'ATIVO', cliente_id = v_cliente, veiculo_id = v_veiculo,
    cpf_cnpj = v_doc, auditado_em = now(), auditado_por = auth.uid()
  where id = p_lead_id;

  return v_veiculo;
end;
$$;

-- ============================================================================
-- RLS
-- ============================================================================
alter table leads             enable row level security;
alter table cotacoes          enable row level security;
alter table lead_historico    enable row level security;
alter table fipe_precos_local enable row level security;

-- Visibilidade do lead: acesso global / auditoria / dono (consultor) / regional.
create policy leads_select on leads for select to authenticated using (
  tem_acesso_global() or pode_auditar()
  or consultor_id = auth.uid() or created_by = auth.uid()
  or pode_regional(regional_id)
);
create policy leads_insert on leads for insert to authenticated with check (is_staff());
create policy leads_update on leads for update to authenticated using (
  tem_acesso_global() or pode_auditar()
  or consultor_id = auth.uid() or created_by = auth.uid()
  or pode_regional(regional_id)
);
create policy leads_delete on leads for delete to authenticated using (tem_acesso_global());

create policy cotacoes_all on cotacoes for all to authenticated
  using (is_staff()) with check (is_staff());
create policy leadhist_select on lead_historico for select to authenticated using (is_staff());
create policy leadhist_insert on lead_historico for insert to authenticated with check (is_staff());
create policy fipelocal_select on fipe_precos_local for select to authenticated using (is_staff());
create policy fipelocal_write  on fipe_precos_local for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

grant select, insert, update, delete on leads, cotacoes, lead_historico, fipe_precos_local to authenticated;
grant execute on function pode_auditar() to authenticated;
grant execute on function autorizar_entrada_lead(uuid, text) to authenticated;

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0018_passeio_padrao_adesao.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- SCar :: 0018_passeio_padrao_adesao.sql
-- Padroniza a precificacao de Passeio conforme a planilha "Veiculos Passeio":
--   * BASICOS (mensalidade): Taxa Administrativa + Assistencia 24h + Protecao
--     Casco + Rastreador -> a soma e a mensalidade base do plano.
--   * PART. DE EVENTOS -> participacao_faixa (1500 ate 35k, 1800 ate 40k, 4% FIPE).
--   * TAXA DE ADESAO (cobranca unica por faixa FIPE) -> NOVO: adesao_faixa.
-- Rebuild completo das 46 faixas (0 a 250000) do tipo Passeio.
-- Append-only: nao reescreve migrations anteriores.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Taxa de adesao por faixa FIPE (cobranca unica, NAO entra na mensalidade)
-- ----------------------------------------------------------------------------
create table if not exists adesao_faixa (
  id              uuid primary key default gen_random_uuid(),
  tipo_veiculo_id uuid not null references tipos_veiculo(id) on delete cascade,
  fipe_minimo     numeric(12,2) not null,
  fipe_maximo     numeric(12,2) not null,
  valor           numeric(12,2) not null,
  unique (tipo_veiculo_id, fipe_minimo, fipe_maximo),
  check (fipe_maximo >= fipe_minimo)
);
create index if not exists idx_adesao_lookup on adesao_faixa (tipo_veiculo_id, fipe_minimo, fipe_maximo);

-- Cotacao guarda o snapshot da adesao vigente.
alter table cotacoes add column if not exists taxa_adesao numeric(12,2) not null default 0;

-- ----------------------------------------------------------------------------
-- Motor: taxa de adesao para um FIPE/tipo de veiculo.
-- ----------------------------------------------------------------------------
create or replace function calcular_adesao(p_fipe numeric, p_tipo_veiculo_id uuid)
returns numeric
language plpgsql stable
as $$
declare a adesao_faixa;
begin
  select * into a from adesao_faixa
   where tipo_veiculo_id = p_tipo_veiculo_id
     and p_fipe >= fipe_minimo and p_fipe <= fipe_maximo
   order by fipe_minimo desc limit 1;
  if not found then return 0; end if;
  return a.valor;
end;
$$;

-- ----------------------------------------------------------------------------
-- Motor principal: mensalidade composta + taxa de adesao (campo a parte).
-- A adesao NAO e somada na mensalidade (cobranca unica).
-- ----------------------------------------------------------------------------
create or replace function calcular_mensalidade(
  p_fipe numeric,
  p_tipo_veiculo_id uuid,
  p_produtos_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql stable
as $$
declare
  rec record;
  v numeric;
  detalhe jsonb := '[]'::jsonb;
  total numeric := 0;
  sub_admin numeric := 0;
  sub_parceiros numeric := 0;
begin
  for rec in
    select * from produtos p
     where p.status = true
       and (p.obrigatorio = true or p.id = any(p_produtos_ids))
     order by p.categoria, p.nome
  loop
    v := calcular_valor_produto(rec.id, p_fipe, p_tipo_veiculo_id);
    detalhe := detalhe || jsonb_build_object(
      'produto_id', rec.id, 'nome', rec.nome, 'valor', v,
      'fornecedor', rec.fornecedor_nome, 'categoria', rec.categoria,
      'obrigatorio', rec.obrigatorio
    );
    total := total + v;
    if rec.categoria = 'ADMIN' then sub_admin := sub_admin + v; end if;
    if rec.fornecedor_nome is distinct from 'Interno' then sub_parceiros := sub_parceiros + v; end if;
  end loop;

  return jsonb_build_object(
    'valor_fipe', p_fipe,
    'detalhamento_produtos', detalhe,
    'subtotal_taxa_admin', sub_admin,
    'subtotal_beneficios_parceiros', sub_parceiros,
    'valor_total_mensalidade', total,
    'taxa_adesao', calcular_adesao(p_fipe, p_tipo_veiculo_id)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Editor: substituicao atomica agora tambem cobre a adesao (4o argumento).
-- A versao de 3 argumentos (0013) segue intacta para compatibilidade.
-- ----------------------------------------------------------------------------
create or replace function substituir_tabela_precos(
  p_tipo_veiculo   uuid,
  p_faixas         jsonb,
  p_participacoes  jsonb,
  p_adesoes        jsonb
)
returns void
language plpgsql
as $$
begin
  delete from tabela_precos_faixa where tipo_veiculo_id = p_tipo_veiculo;
  delete from participacao_faixa   where tipo_veiculo_id = p_tipo_veiculo;
  delete from adesao_faixa         where tipo_veiculo_id = p_tipo_veiculo;

  insert into tabela_precos_faixa
    (tipo_veiculo_id, produto_id, fipe_minimo, fipe_maximo, valor_mensal, tipo_valor)
  select p_tipo_veiculo,
         (e->>'produto_id')::uuid,
         (e->>'fipe_minimo')::numeric,
         (e->>'fipe_maximo')::numeric,
         (e->>'valor_mensal')::numeric,
         coalesce(e->>'tipo_valor', 'VALOR')::tipo_valor_faixa
    from jsonb_array_elements(coalesce(p_faixas, '[]'::jsonb)) e;

  insert into participacao_faixa
    (tipo_veiculo_id, fipe_minimo, fipe_maximo, tipo_valor, valor)
  select p_tipo_veiculo,
         (e->>'fipe_minimo')::numeric,
         (e->>'fipe_maximo')::numeric,
         coalesce(e->>'tipo_valor', 'VALOR')::tipo_valor_faixa,
         (e->>'valor')::numeric
    from jsonb_array_elements(coalesce(p_participacoes, '[]'::jsonb)) e;

  insert into adesao_faixa
    (tipo_veiculo_id, fipe_minimo, fipe_maximo, valor)
  select p_tipo_veiculo,
         (e->>'fipe_minimo')::numeric,
         (e->>'fipe_maximo')::numeric,
         (e->>'valor')::numeric
    from jsonb_array_elements(coalesce(p_adesoes, '[]'::jsonb)) e;
end;
$$;

-- ----------------------------------------------------------------------------
-- RLS (catalogo: leitura staff, escrita global)
-- ----------------------------------------------------------------------------
alter table adesao_faixa enable row level security;
create policy adesao_select on adesao_faixa for select to authenticated using (is_staff());
create policy adesao_write  on adesao_faixa for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());
grant select, insert, update, delete on adesao_faixa to authenticated;
grant execute on function calcular_adesao(numeric, uuid) to authenticated;
grant execute on function substituir_tabela_precos(uuid, jsonb, jsonb, jsonb) to authenticated;

-- ============================================================================
-- REBUILD: matriz de precos, participacao e adesao do tipo Passeio
-- ============================================================================
delete from tabela_precos_faixa where tipo_veiculo_id = (select id from tipos_veiculo where nome='Passeio');
delete from participacao_faixa   where tipo_veiculo_id = (select id from tipos_veiculo where nome='Passeio');
delete from adesao_faixa         where tipo_veiculo_id = (select id from tipos_veiculo where nome='Passeio');

-- Faixas (Taxa Administrativa, Protecao Casco, Rastreador), participacao e adesao
-- extraidos da planilha Veiculos Passeio (46 faixas FIPE, 0 a 250000).
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),0,20000,35,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),0,20000,35,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),0,20000,0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),0,20000,'VALOR',1500);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),0,20000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),20001,25000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),20001,25000,55,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),20001,25000,0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),20001,25000,'VALOR',1500);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),20001,25000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),25001,30000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),25001,30000,60,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),25001,30000,0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),25001,30000,'VALOR',1500);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),25001,30000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),30001,35000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),30001,35000,65,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),30001,35000,0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),30001,35000,'VALOR',1500);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),30001,35000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),35001,40000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),35001,40000,75,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),35001,40000,0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),35001,40000,'VALOR',1800);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),35001,40000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),40001,45000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),40001,45000,80,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),40001,45000,0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),40001,45000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),40001,45000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),45001,50000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),45001,50000,90,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),45001,50000,0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),45001,50000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),45001,50000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),50001,55000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),50001,55000,110,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),50001,55000,0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),50001,55000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),50001,55000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),55001,60000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),55001,60000,115,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),55001,60000,0,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),55001,60000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),55001,60000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),60001,65000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),60001,65000,120,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),60001,65000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),60001,65000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),60001,65000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),65001,70000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),65001,70000,125,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),65001,70000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),65001,70000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),65001,70000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),70001,75000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),70001,75000,130,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),70001,75000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),70001,75000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),70001,75000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),75001,80000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),75001,80000,135,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),75001,80000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),75001,80000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),75001,80000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),80001,85000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),80001,85000,140,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),80001,85000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),80001,85000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),80001,85000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),85001,90000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),85001,90000,155,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),85001,90000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),85001,90000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),85001,90000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),90001,95000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),90001,95000,160,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),90001,95000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),90001,95000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),90001,95000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),95001,100000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),95001,100000,165,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),95001,100000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),95001,100000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),95001,100000,250);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),100001,105000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),100001,105000,175,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),100001,105000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),100001,105000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),100001,105000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),105001,110000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),105001,110000,185,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),105001,110000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),105001,110000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),105001,110000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),110001,115000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),110001,115000,195,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),110001,115000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),110001,115000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),110001,115000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),115001,120000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),115001,120000,205,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),115001,120000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),115001,120000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),115001,120000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),120001,125000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),120001,125000,215,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),120001,125000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),120001,125000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),120001,125000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),125001,130000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),125001,130000,225,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),125001,130000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),125001,130000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),125001,130000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),130001,135000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),130001,135000,235,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),130001,135000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),130001,135000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),130001,135000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),135001,140000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),135001,140000,245,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),135001,140000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),135001,140000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),135001,140000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),140001,145000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),140001,145000,265,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),140001,145000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),140001,145000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),140001,145000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),145001,150000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),145001,150000,285,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),145001,150000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),145001,150000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),145001,150000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),150001,155000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),150001,155000,295,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),150001,155000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),150001,155000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),150001,155000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),155001,160000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),155001,160000,305,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),155001,160000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),155001,160000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),155001,160000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),160001,165000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),160001,165000,325,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),160001,165000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),160001,165000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),160001,165000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),165001,170000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),165001,170000,335,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),165001,170000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),165001,170000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),165001,170000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),170001,175000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),170001,175000,345,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),170001,175000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),170001,175000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),170001,175000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),175001,180000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),175001,180000,355,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),175001,180000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),175001,180000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),175001,180000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),180001,185000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),180001,185000,365,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),180001,185000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),180001,185000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),180001,185000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),185001,190000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),185001,190000,375,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),185001,190000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),185001,190000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),185001,190000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),190001,200000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),190001,200000,385,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),190001,200000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),190001,200000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),190001,200000,350);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),200001,205000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),200001,205000,405,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),200001,205000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),200001,205000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),200001,205000,500);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),205001,210000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),205001,210000,415,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),205001,210000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),205001,210000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),205001,210000,500);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),210001,215000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),210001,215000,425,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),210001,215000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),210001,215000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),210001,215000,500);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),215001,220000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),215001,220000,435,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),215001,220000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),215001,220000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),215001,220000,500);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),220001,225000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),220001,225000,445,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),220001,225000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),220001,225000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),220001,225000,500);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),225001,230000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),225001,230000,455,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),225001,230000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),225001,230000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),225001,230000,500);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),230001,235000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),230001,235000,465,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),230001,235000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),230001,235000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),230001,235000,500);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),235001,240000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),235001,240000,475,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),235001,240000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),235001,240000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),235001,240000,500);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),240001,245000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),240001,245000,490,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),240001,245000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),240001,245000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),240001,245000,500);
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Taxa Administrativa'),245001,250000,25,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Protecao Casco'),245001,250000,510,'VALOR');
insert into tabela_precos_faixa(tipo_veiculo_id,produto_id,fipe_minimo,fipe_maximo,valor_mensal,tipo_valor) values ((select id from tipos_veiculo where nome='Passeio'),(select id from produtos where nome='Rastreador'),245001,250000,35,'VALOR');
insert into participacao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,tipo_valor,valor) values ((select id from tipos_veiculo where nome='Passeio'),245001,250000,'PERCENTUAL',0.04);
insert into adesao_faixa(tipo_veiculo_id,fipe_minimo,fipe_maximo,valor) values ((select id from tipos_veiculo where nome='Passeio'),245001,250000,500);

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0019_planos_combos_motor.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- SCar :: 0019_planos_combos_motor.sql
-- Evolucao do modulo de Precificacao e Vendas:
--   1) Rastreador vira REGRA por tipo de veiculo (gatilho de isencao por FIPE),
--      saindo da matriz produto-por-faixa.
--   2) RCF (terceiros) deixa de ser base e passa a MODULO OPCIONAL por faixa de
--      cobertura (30/50/75/100 mil).
--   3) Motor de COMBOS: planos pre-definidos (Prata/Ouro/Diamante) agrupando a
--      cotacao base + pacotes de opcionais; funcao cotar_plano(...).
-- Append-only. A "Cotacao Base" (Plano Prata) passa a ser:
--   Casco + Taxa Admin + Assistencia 24h + Rastreador (se aplicavel).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Regra de Rastreador por tipo de veiculo (gatilho de isencao)
-- ----------------------------------------------------------------------------
alter table tipos_veiculo
  add column if not exists exige_rastreador             boolean       not null default false,
  add column if not exists valor_limite_isencao         numeric(12,2) not null default 0,
  add column if not exists valor_mensalidade_rastreador numeric(12,2) not null default 0;

-- Passeio: isento ate FIPE 60k; acima disso cobra R$35 (conforme planilha).
update tipos_veiculo
   set exige_rastreador = true,
       valor_limite_isencao = 60000,
       valor_mensalidade_rastreador = 35
 where nome = 'Passeio';

-- Aposenta o produto "Rastreador" (agora e regra): sai da base obrigatoria e
-- some da matriz produto-por-faixa para nao haver dupla contagem.
update produtos set obrigatorio = false, status = false where nome = 'Rastreador';
delete from tabela_precos_faixa
 where produto_id = (select id from produtos where nome = 'Rastreador');

-- ----------------------------------------------------------------------------
-- 2) RCF como modulo opcional por faixa de cobertura
-- ----------------------------------------------------------------------------
-- O RCF de 30mil deixa de ser obrigatorio (sai da base) e vira um tier opcional.
update produtos
   set obrigatorio = false, categoria = 'RCF'
 where nome = 'RCF - Terceiros 30mil';

-- Novos tiers de RCF (opcionais, preco cadastravel em Configuracoes -> Produtos).
insert into produtos (nome, fornecedor_nome, metodo_preco, valor_fixo, obrigatorio, categoria) values
  ('RCF - Terceiros 50mil',  'Interno', 'FIXO', 0, false, 'RCF'),
  ('RCF - Terceiros 75mil',  'Interno', 'FIXO', 0, false, 'RCF'),
  ('RCF - Terceiros 100mil', 'Interno', 'FIXO', 0, false, 'RCF')
on conflict (nome) do nothing;

-- Opcionais dos combos (preco a definir no cadastro de Produtos).
insert into produtos (nome, fornecedor_nome, metodo_preco, valor_fixo, obrigatorio, categoria) values
  ('Carro Reserva 10 dias',        'Interno', 'FIXO', 0, false, 'BENEFICIO'),
  ('Carro Reserva 30 dias',        'Interno', 'FIXO', 0, false, 'BENEFICIO'),
  ('Protecao de Vidros III',       'Interno', 'FIXO', 0, false, 'VIDROS'),
  ('Protecao de Vidros Completa',  'Interno', 'FIXO', 0, false, 'VIDROS'),
  ('Assistencia 24h VIP',          'Interno', 'FIXO', 0, false, 'BENEFICIO')
on conflict (nome) do nothing;

-- ----------------------------------------------------------------------------
-- 3) Planos / Combos
-- ----------------------------------------------------------------------------
alter table planos_protecao
  add column if not exists descricao_comercial text,
  add column if not exists nivel               smallint not null default 0; -- ordenacao Prata<Ouro<Diamante

-- Seed dos combos padrao (idempotente por nome).
insert into planos_protecao (nome, descricao_comercial, nivel, taxa_administrativa, cota_participacao, coberturas, ativo)
select 'Plano Prata', 'Basico tradicional: cotacao base (casco + taxa admin + assistencia 24h + rastreador se aplicavel).', 1, 0, 0, '{}'::jsonb, true
 where not exists (select 1 from planos_protecao where nome = 'Plano Prata');
insert into planos_protecao (nome, descricao_comercial, nivel, taxa_administrativa, cota_participacao, coberturas, ativo)
select 'Plano Ouro', 'Intermediario: base + RCF 50mil + Protecao de Vidros III + Carro Reserva 10 dias.', 2, 0, 0, '{}'::jsonb, true
 where not exists (select 1 from planos_protecao where nome = 'Plano Ouro');
insert into planos_protecao (nome, descricao_comercial, nivel, taxa_administrativa, cota_participacao, coberturas, ativo)
select 'Plano Diamante', 'Premium: base + RCF 100mil + Protecao de Vidros Completa + Carro Reserva 30 dias + Assistencia 24h VIP.', 3, 0, 0, '{}'::jsonb, true
 where not exists (select 1 from planos_protecao where nome = 'Plano Diamante');

-- Vinculos plano -> produtos opcionais (Prata nao tem opcionais).
insert into plano_produtos (plano_id, produto_id)
select p.id, pr.id
  from planos_protecao p
  join produtos pr on pr.nome in ('RCF - Terceiros 50mil', 'Protecao de Vidros III', 'Carro Reserva 10 dias')
 where p.nome = 'Plano Ouro'
on conflict do nothing;

insert into plano_produtos (plano_id, produto_id)
select p.id, pr.id
  from planos_protecao p
  join produtos pr on pr.nome in ('RCF - Terceiros 100mil', 'Protecao de Vidros Completa', 'Carro Reserva 30 dias', 'Assistencia 24h VIP')
 where p.nome = 'Plano Diamante'
on conflict do nothing;

-- ============================================================================
-- MOTOR
-- ============================================================================

-- calcular_mensalidade passa a aplicar a REGRA de rastreador na base (uma linha
-- sintetica), alem dos obrigatorios (casco + admin + assistencia). RCF e
-- rastreador NAO sao mais obrigatorios; entram so quando selecionados/regra.
create or replace function calcular_mensalidade(
  p_fipe numeric,
  p_tipo_veiculo_id uuid,
  p_produtos_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql stable
as $$
declare
  rec record;
  v numeric;
  detalhe jsonb := '[]'::jsonb;
  total numeric := 0;
  sub_admin numeric := 0;
  sub_parceiros numeric := 0;
  tv tipos_veiculo;
  v_rast numeric := 0;
begin
  for rec in
    select * from produtos p
     where p.status = true
       and (p.obrigatorio = true or p.id = any(p_produtos_ids))
     order by p.categoria, p.nome
  loop
    v := calcular_valor_produto(rec.id, p_fipe, p_tipo_veiculo_id);
    detalhe := detalhe || jsonb_build_object(
      'produto_id', rec.id, 'nome', rec.nome, 'valor', v,
      'fornecedor', rec.fornecedor_nome, 'categoria', rec.categoria,
      'obrigatorio', rec.obrigatorio
    );
    total := total + v;
    if rec.categoria = 'ADMIN' then sub_admin := sub_admin + v; end if;
    if rec.fornecedor_nome is distinct from 'Interno' then sub_parceiros := sub_parceiros + v; end if;
  end loop;

  -- Regra de rastreador (gatilho de isencao por faixa FIPE).
  select * into tv from tipos_veiculo where id = p_tipo_veiculo_id;
  if coalesce(tv.exige_rastreador, false) and p_fipe > coalesce(tv.valor_limite_isencao, 0) then
    v_rast := coalesce(tv.valor_mensalidade_rastreador, 0);
    detalhe := detalhe || jsonb_build_object(
      'produto_id', null, 'nome', 'Rastreador', 'valor', v_rast,
      'fornecedor', 'Interno', 'categoria', 'RASTREADOR', 'obrigatorio', true
    );
    total := total + v_rast;
  end if;

  return jsonb_build_object(
    'valor_fipe', p_fipe,
    'detalhamento_produtos', detalhe,
    'subtotal_taxa_admin', sub_admin,
    'subtotal_beneficios_parceiros', sub_parceiros,
    'valor_total_mensalidade', total,
    'taxa_adesao', calcular_adesao(p_fipe, p_tipo_veiculo_id)
  );
end;
$$;

-- Motor de cotacao por COMBO: resolve os produtos do plano + avulsos, calcula a
-- mensalidade (base + regra rastreador + opcionais), a adesao e a franquia.
create or replace function cotar_plano(
  p_fipe numeric,
  p_tipo_veiculo_id uuid,
  p_plano_id uuid default null,
  p_avulsos_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql stable
as $$
declare
  v_ids  uuid[] := '{}'::uuid[];
  v_calc jsonb;
  v_plano planos_protecao;
begin
  -- 1) produtos amarrados ao plano
  if p_plano_id is not null then
    select coalesce(array_agg(produto_id), '{}'::uuid[]) into v_ids
      from plano_produtos where plano_id = p_plano_id;
    select * into v_plano from planos_protecao where id = p_plano_id;
  end if;

  -- 2) + avulsos (uniao distinta, ignorando nulos)
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
    from unnest(v_ids || coalesce(p_avulsos_ids, '{}'::uuid[])) x
   where x is not null;

  -- 3) mensalidade (base obrigatoria + regra rastreador + selecionados) + adesao
  v_calc := calcular_mensalidade(p_fipe, p_tipo_veiculo_id, v_ids);

  -- 4) retorno consolidado
  return jsonb_build_object(
    'valor_fipe', p_fipe,
    'plano_id', p_plano_id,
    'plano_nome', v_plano.nome,
    'detalhamento_produtos', v_calc->'detalhamento_produtos',
    'subtotal_taxa_admin', (v_calc->>'subtotal_taxa_admin')::numeric,
    'subtotal_beneficios_parceiros', (v_calc->>'subtotal_beneficios_parceiros')::numeric,
    'valor_total_mensalidade', (v_calc->>'valor_total_mensalidade')::numeric,
    'taxa_adesao', (v_calc->>'taxa_adesao')::numeric,
    'franquia_participacao', calcular_participacao(p_fipe, p_tipo_veiculo_id)
  );
end;
$$;

grant execute on function cotar_plano(numeric, uuid, uuid, uuid[]) to authenticated;

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0020_fix_matriz_base.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- SCar :: 0020_fix_matriz_base.sql
-- Corrige/normaliza a MATRIZ BASE por faixa FIPE:
--   * A matriz base deve conter a VARIAVEL DE RISCO (Protecao Casco) e a Taxa
--     Administrativa -- ambos FAIXA_FIPE, obrigatorios, ativos.
--   * RCF (terceiros) e SEMPRE opcional e FIXO (preco por faixa de cobertura,
--     nunca por faixa FIPE); nao pode ocupar coluna na matriz base.
--   * Assistencia 24h base: FIXO, obrigatorio.
--   * Rastreador: aposentado (virou regra por tipo de veiculo).
-- Idempotente e auto-corretivo: reafirma as definicoes independentemente de
-- como o cadastro tenha derivado, e limpa faixas indevidas (RCF/Rastreador).
-- ============================================================================

-- Base variavel por faixa: Casco (risco) e Taxa Administrativa.
update produtos
   set metodo_preco = 'FAIXA_FIPE', obrigatorio = true, status = true, categoria = 'CASCO'
 where nome = 'Protecao Casco';

update produtos
   set metodo_preco = 'FAIXA_FIPE', obrigatorio = true, status = true, categoria = 'ADMIN'
 where nome = 'Taxa Administrativa';

-- Assistencia 24h base: FIXO obrigatorio (mantem o valor ja cadastrado).
update produtos
   set metodo_preco = 'FIXO', obrigatorio = true, status = true
 where nome = 'Assistencia 24h';

-- Rastreador: aposentado -> vira regra por tipo de veiculo (0019).
update produtos set obrigatorio = false, status = false where nome = 'Rastreador';

-- RCF: sempre opcional e FIXO (preco por faixa de cobertura escolhida).
update produtos
   set metodo_preco = 'FIXO', obrigatorio = false, categoria = 'RCF'
 where categoria = 'RCF' or nome ilike 'RCF%';

-- Limpa da matriz base quaisquer faixas indevidas: nada de RCF, Rastreador ou
-- de produtos que nao sejam FAIXA_FIPE (ex.: opcionais FIXO que foram parar la).
delete from tabela_precos_faixa
 where produto_id in (
   select id from produtos
    where categoria in ('RCF', 'RASTREADOR')
       or metodo_preco <> 'FAIXA_FIPE'
       or status = false
 );

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0021_sac_faturamento_opcionais.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- SCar :: 0021_sac_faturamento_opcionais.sql
-- Core unificado (SAC/Assistencia/Vendas/Chatbot):
--   A) Cadastro amplo do veiculo (categoria, data de ativacao, novos status).
--   B) Faturamento flexivel por veiculo (AGRUPADO x INDIVIDUAL) + Fatura/ItemFatura
--      com historico imutavel (troca de modo nao reescreve faturas passadas).
--   C) Opcionais com limite de uso por JANELA FLUTUANTE de N dias (padrao 365),
--      contados sobre eventos_sinistro.
--   + Motor: elegibilidade de opcionais, toggle de faturamento, geracao de faturas.
-- Append-only. ADD VALUE de enum nao e usado na mesma migration (evita 55P04).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) Cadastro amplo do veiculo
-- ----------------------------------------------------------------------------
alter table veiculos
  add column if not exists categoria     text,
  add column if not exists data_ativacao date;

-- Novos status operacionais (apenas ADD VALUE; nao usar nesta migration).
alter type status_veiculo add value if not exists 'inativo';
alter type status_veiculo add value if not exists 'vistoria_pendente';
alter type status_veiculo add value if not exists 'em_evento';

-- ----------------------------------------------------------------------------
-- B) Faturamento por veiculo + Fatura/ItemFatura
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'tipo_faturamento') then
    create type tipo_faturamento as enum ('AGRUPADO_ASSOCIADO', 'INDIVIDUAL_VEICULO');
  end if;
end $$;

alter table veiculos
  add column if not exists tipo_faturamento tipo_faturamento not null default 'AGRUPADO_ASSOCIADO';

do $$ begin
  if not exists (select 1 from pg_type where typname = 'status_fatura') then
    create type status_fatura as enum ('ABERTA', 'PAGA', 'CANCELADA');
  end if;
end $$;

-- Fatura: consolidada (AGRUPADO, 1 por cliente/competencia) ou individual
-- (INDIVIDUAL, 1 por veiculo/competencia). Cada fatura e um snapshot: alternar
-- o modo do veiculo afeta so as competencias futuras, nunca as ja emitidas.
create table if not exists faturas (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references clientes(id) on delete restrict,
  regional_id      uuid references regionais(id) on delete set null,
  tipo_faturamento tipo_faturamento not null,
  veiculo_id       uuid references veiculos(id) on delete set null, -- setado p/ INDIVIDUAL
  competencia      date not null,                                   -- 1o dia do mes de referencia
  valor_total      numeric(12,2) not null default 0,
  vencimento       date,
  status           status_fatura not null default 'ABERTA',
  titulo_id        uuid references titulos_financeiros(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_faturas_cliente on faturas (cliente_id, competencia);
create index if not exists idx_faturas_veiculo on faturas (veiculo_id);
create unique index if not exists uq_fatura_agrupada
  on faturas (cliente_id, competencia) where tipo_faturamento = 'AGRUPADO_ASSOCIADO';
create unique index if not exists uq_fatura_individual
  on faturas (veiculo_id, competencia) where tipo_faturamento = 'INDIVIDUAL_VEICULO';

create table if not exists fatura_itens (
  id         uuid primary key default gen_random_uuid(),
  fatura_id  uuid not null references faturas(id) on delete cascade,
  veiculo_id uuid references veiculos(id) on delete set null,
  descricao  text not null,
  valor      numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_fatura_itens_fatura on fatura_itens (fatura_id);

create trigger trg_faturas_updated before update on faturas
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- C) Opcionais com limite por janela flutuante
-- ----------------------------------------------------------------------------
alter table produtos
  add column if not exists tem_limite_uso     boolean not null default false,
  add column if not exists quantidade_limite  integer not null default 1,
  add column if not exists janela_dias_limite integer not null default 365;

-- ============================================================================
-- MOTOR
-- ============================================================================

-- Elegibilidade de opcionais do veiculo por JANELA FLUTUANTE: conta os eventos
-- do mesmo tipo (produtos.tipo_evento_id) nos ultimos janela_dias_limite a
-- partir de hoje (nao por ano civil).
create or replace function opcionais_elegibilidade(p_veiculo_id uuid)
returns table (
  produto_id        uuid,
  nome              text,
  quantidade_limite integer,
  janela_dias       integer,
  usados            bigint,
  elegivel          boolean,
  ultimo_uso        date
)
language sql stable
as $$
  select pr.id, pr.nome, pr.quantidade_limite, pr.janela_dias_limite,
         count(e.id) as usados,
         (count(e.id) < pr.quantidade_limite) as elegivel,
         max(e.data_ocorrencia) as ultimo_uso
    from produtos pr
    left join eventos_sinistro e
      on e.veiculo_id = p_veiculo_id
     and e.tipo_evento_id = pr.tipo_evento_id
     and e.data_ocorrencia >= current_date - pr.janela_dias_limite
   where pr.tem_limite_uso = true and pr.status = true
   group by pr.id, pr.nome, pr.quantidade_limite, pr.janela_dias_limite
   order by pr.nome;
$$;

-- Alterna o modo de faturamento do veiculo (a qualquer momento do contrato).
create or replace function definir_faturamento_veiculo(p_veiculo_id uuid, p_tipo tipo_faturamento)
returns veiculos
language plpgsql security definer set search_path = public
as $$
declare v veiculos;
begin
  if not is_staff() then
    raise exception 'Sem permissao para alterar faturamento';
  end if;
  update veiculos set tipo_faturamento = p_tipo, updated_at = now()
   where id = p_veiculo_id
   returning * into v;
  if v.id is null then raise exception 'Veiculo nao encontrado'; end if;
  return v;
end;
$$;

-- Gera as faturas do cliente para a competencia, respeitando o modo de cada
-- veiculo. Idempotente por competencia (protege o historico): se a fatura ja
-- existe, nao recria. Valor por veiculo vem do motor de cotacao (cotar_plano).
create or replace function gerar_faturas_cliente(
  p_cliente_id uuid,
  p_competencia date,
  p_vencimento date default null
)
returns setof faturas
language plpgsql security definer set search_path = public
as $$
declare
  v        veiculos;
  f_agrup  faturas;
  f_ind    faturas;
  v_reg    uuid;
  v_val    numeric;
  v_total  numeric := 0;
  v_venc   date := coalesce(p_vencimento, (date_trunc('month', p_competencia) + interval '1 month 9 days')::date);
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;
  select regional_id into v_reg from clientes where id = p_cliente_id;

  -- AGRUPADO: uma fatura consolidada com um item por veiculo agrupado.
  if exists (
        select 1 from veiculos
         where cliente_id = p_cliente_id and tipo_faturamento = 'AGRUPADO_ASSOCIADO' and status <> 'baixado'
      )
     and not exists (
        select 1 from faturas
         where cliente_id = p_cliente_id and competencia = p_competencia and tipo_faturamento = 'AGRUPADO_ASSOCIADO'
      )
  then
    insert into faturas (cliente_id, regional_id, tipo_faturamento, competencia, vencimento, valor_total)
      values (p_cliente_id, v_reg, 'AGRUPADO_ASSOCIADO', p_competencia, v_venc, 0)
      returning * into f_agrup;
    for v in
      select * from veiculos
       where cliente_id = p_cliente_id and tipo_faturamento = 'AGRUPADO_ASSOCIADO' and status <> 'baixado'
    loop
      v_val := coalesce((cotar_plano(coalesce(v.valor_fipe, 0), v.tipo_veiculo_id, v.plano_protecao_id)->>'valor_total_mensalidade')::numeric, 0);
      insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
        values (f_agrup.id, v.id, coalesce(v.placa, '') || ' - ' || coalesce(v.modelo, 'veiculo'), v_val);
      v_total := v_total + v_val;
    end loop;
    update faturas set valor_total = v_total where id = f_agrup.id;
    select * into f_agrup from faturas where id = f_agrup.id;
    return next f_agrup;
  end if;

  -- INDIVIDUAL: uma fatura por veiculo desmembrado.
  for v in
    select * from veiculos
     where cliente_id = p_cliente_id and tipo_faturamento = 'INDIVIDUAL_VEICULO' and status <> 'baixado'
  loop
    if not exists (
          select 1 from faturas
           where veiculo_id = v.id and competencia = p_competencia and tipo_faturamento = 'INDIVIDUAL_VEICULO'
        )
    then
      v_val := coalesce((cotar_plano(coalesce(v.valor_fipe, 0), v.tipo_veiculo_id, v.plano_protecao_id)->>'valor_total_mensalidade')::numeric, 0);
      insert into faturas (cliente_id, regional_id, tipo_faturamento, veiculo_id, competencia, vencimento, valor_total)
        values (p_cliente_id, v_reg, 'INDIVIDUAL_VEICULO', v.id, p_competencia, v_venc, v_val)
        returning * into f_ind;
      insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
        values (f_ind.id, v.id, coalesce(v.placa, '') || ' - ' || coalesce(v.modelo, 'veiculo'), v_val);
      return next f_ind;
    end if;
  end loop;

  return;
end;
$$;

-- ============================================================================
-- RLS
-- ============================================================================
alter table faturas      enable row level security;
alter table fatura_itens enable row level security;

create policy faturas_select on faturas for select to authenticated using (
  tem_acesso_global() or pode_regional(regional_id) or cliente_id = auth_cliente_id()
);
create policy faturas_write on faturas for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

create policy fatura_itens_select on fatura_itens for select to authenticated using (
  exists (
    select 1 from faturas f
     where f.id = fatura_id
       and (tem_acesso_global() or pode_regional(f.regional_id) or f.cliente_id = auth_cliente_id())
  )
);
create policy fatura_itens_write on fatura_itens for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

grant select, insert, update, delete on faturas, fatura_itens to authenticated;
grant execute on function opcionais_elegibilidade(uuid) to authenticated;
grant execute on function definir_faturamento_veiculo(uuid, tipo_faturamento) to authenticated;
grant execute on function gerar_faturas_cliente(uuid, date, date) to authenticated;

-- ============================================================================
-- SEED: marca alguns opcionais com limite por janela flutuante (exemplos SAC)
-- ============================================================================
insert into tipos_evento (nome) values ('Vidros'), ('Guincho / Assistencia')
  on conflict (nome) do nothing;

-- Vidros/Para-brisa: 1 uso a cada 365 dias.
update produtos set tem_limite_uso = true, quantidade_limite = 1, janela_dias_limite = 365,
       tipo_evento_id = (select id from tipos_evento where nome = 'Vidros')
 where nome in ('Protecao Parabrisas', 'Vidros Basicos', 'Kit Total Vidros',
                'Protecao de Vidros III', 'Protecao de Vidros Completa');

-- Carro Reserva / Reboque: 2 usos a cada 365 dias.
update produtos set tem_limite_uso = true, quantidade_limite = 2, janela_dias_limite = 365,
       tipo_evento_id = (select id from tipos_evento where nome = 'Guincho / Assistencia')
 where nome in ('Carro Reserva 7 dias', 'Carro Reserva 10 dias', 'Carro Reserva 15 dias', 'Carro Reserva 30 dias');

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0022_atendimentos_sac.sql >>>>>>>>>>>>>>>>>>>>>>>>

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

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0023_veiculo_ficha.sql >>>>>>>>>>>>>>>>>>>>>>>>

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

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0024_cobrancas.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- SCar :: 0024_cobrancas.sql
-- COBRANCAS RECORRENTES (mensalidade) — liga a ficha do veiculo (0023) ao
-- faturamento (0021) e ao financeiro (titulos_financeiros / boleto).
--
--   A) Helpers de calculo:
--      - calcular_vencimento(competencia, dia)  -> data de vencimento (clampa
--        o dia ao ultimo dia do mes; sem dia = legado dia 10 do mes seguinte).
--      - valor_mensalidade_veiculo(veiculo)     -> valor cobrado do veiculo:
--        precedencia veiculos.valor_mensalidade (override) > cotar_plano
--        (plano + opcionais de veiculo_produtos) > 0.
--      - veiculo_faturavel(veiculo, competencia) -> regra de quem entra na
--        cobranca do mes (status + data_ativacao).
--      - dia_vencimento_agrupado(cliente) -> dia mais usado entre os veiculos
--        agrupados do associado (desempate: menor dia).
--   B) gerar_faturas_cliente() reescrita: usa os helpers acima (dia_vencimento
--      e valor_mensalidade por veiculo) e nao cria fatura zerada.
--   C) gerar_faturas_competencia(competencia, regional?) — lote do mes.
--   D) emitir_titulo_fatura(fatura) / emitir_titulos_competencia(...) — gera o
--      titulo financeiro (base do boleto/2a via/inadimplencia) a partir da
--      fatura, de forma idempotente.
--   E) Trigger titulo -> fatura: baixa/cancelamento do titulo reflete o status
--      da fatura (o webhook bancario ja marca o titulo como pago).
--   F) cancelar_fatura(fatura) — cancela fatura + titulo em aberto.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) Helpers
-- ----------------------------------------------------------------------------

-- Vencimento de uma competencia a partir do dia escolhido pelo associado.
-- Dia maior que o ultimo dia do mes cai no ultimo dia (ex.: 31 em fevereiro).
-- Sem dia definido mantem o padrao historico: dia 10 do mes seguinte.
create or replace function calcular_vencimento(p_competencia date, p_dia int)
returns date
language sql
immutable
as $$
  select case
    when p_dia is null or p_dia < 1
      then (date_trunc('month', p_competencia) + interval '1 month 9 days')::date
    else date_trunc('month', p_competencia)::date
         + least(
             p_dia,
             extract(day from (date_trunc('month', p_competencia) + interval '1 month - 1 day'))::int
           ) - 1
  end;
$$;

-- Valor mensal cobrado do veiculo.
-- 1) veiculos.valor_mensalidade  -> valor negociado/travado na ficha (override);
-- 2) cotar_plano(fipe, tipo, plano, opcionais do veiculo) -> motor de precos;
-- 3) 0 (veiculo sem tipo/plano nao gera cobranca).
create or replace function valor_mensalidade_veiculo(p_veiculo_id uuid)
returns numeric
language plpgsql
stable
as $$
declare
  v        veiculos;
  v_opcs   uuid[];
  v_valor  numeric;
begin
  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then return 0; end if;

  if v.valor_mensalidade is not null and v.valor_mensalidade > 0 then
    return round(v.valor_mensalidade, 2);
  end if;

  if v.tipo_veiculo_id is null then return 0; end if;

  select coalesce(array_agg(produto_id), '{}'::uuid[]) into v_opcs
    from veiculo_produtos where veiculo_id = v.id;

  v_valor := (
    cotar_plano(coalesce(v.valor_fipe, 0), v.tipo_veiculo_id, v.plano_protecao_id, v_opcs)
      ->>'valor_total_mensalidade'
  )::numeric;

  return round(coalesce(v_valor, 0), 2);
end;
$$;

-- Entra na cobranca da competencia? Cobramos veiculo em vigencia (ativo, em
-- evento ou com vistoria pendente) e ja ativado ate o fim do mes de referencia.
-- Suspenso/inativo/baixado/excluido NAO geram mensalidade.
create or replace function veiculo_faturavel(p_veiculo_id uuid, p_competencia date)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from veiculos v
     where v.id = p_veiculo_id
       and v.status in ('ativo', 'em_evento', 'vistoria_pendente')
       and (
         v.data_ativacao is null
         or v.data_ativacao <= (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date
       )
  );
$$;

-- Dia de vencimento da fatura AGRUPADA: o dia mais usado entre os veiculos
-- agrupados do associado (desempate pelo menor dia). Null = padrao legado.
create or replace function dia_vencimento_agrupado(p_cliente_id uuid, p_competencia date)
returns int
language sql
stable
as $$
  select v.dia_vencimento
    from veiculos v
   where v.cliente_id = p_cliente_id
     and v.tipo_faturamento = 'AGRUPADO_ASSOCIADO'
     and v.dia_vencimento is not null
     and veiculo_faturavel(v.id, p_competencia)
   group by v.dia_vencimento
   order by count(*) desc, v.dia_vencimento asc
   limit 1;
$$;

-- ----------------------------------------------------------------------------
-- B) Geracao de faturas do associado (reescreve a versao do 0021)
-- ----------------------------------------------------------------------------
-- Continua idempotente por competencia (nao recria fatura existente) e o
-- snapshot segue imutavel: alternar o modo do veiculo so afeta o mes seguinte.
create or replace function gerar_faturas_cliente(
  p_cliente_id uuid,
  p_competencia date,
  p_vencimento date default null
)
returns setof faturas
language plpgsql
security definer
set search_path = public
as $$
declare
  v        veiculos;
  f_agrup  faturas;
  f_ind    faturas;
  v_reg    uuid;
  v_val    numeric;
  v_total  numeric := 0;
  v_venc   date;
  v_comp   date := date_trunc('month', p_competencia)::date;
  v_ids    uuid[] := '{}'::uuid[];
  v_descs  text[] := '{}'::text[];
  v_vals   numeric[] := '{}'::numeric[];
  i        int;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;
  select regional_id into v_reg from clientes where id = p_cliente_id;

  -- AGRUPADO: uma fatura consolidada com um item por veiculo agrupado.
  if not exists (
       select 1 from faturas
        where cliente_id = p_cliente_id and competencia = v_comp
          and tipo_faturamento = 'AGRUPADO_ASSOCIADO'
     )
  then
    for v in
      select * from veiculos
       where cliente_id = p_cliente_id
         and tipo_faturamento = 'AGRUPADO_ASSOCIADO'
         and veiculo_faturavel(id, v_comp)
       order by placa
    loop
      v_val := valor_mensalidade_veiculo(v.id);
      if v_val > 0 then
        v_ids   := v_ids   || v.id;
        v_descs := v_descs || (coalesce(v.placa, '') || ' - ' || coalesce(v.modelo, 'veiculo'));
        v_vals  := v_vals  || v_val;
        v_total := v_total + v_val;
      end if;
    end loop;

    if v_total > 0 then
      v_venc := coalesce(p_vencimento, calcular_vencimento(v_comp, dia_vencimento_agrupado(p_cliente_id, v_comp)));
      insert into faturas (cliente_id, regional_id, tipo_faturamento, competencia, vencimento, valor_total)
        values (p_cliente_id, v_reg, 'AGRUPADO_ASSOCIADO', v_comp, v_venc, v_total)
        returning * into f_agrup;
      for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
        insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
          values (f_agrup.id, v_ids[i], v_descs[i], v_vals[i]);
      end loop;
      return next f_agrup;
    end if;
  end if;

  -- INDIVIDUAL: uma fatura por veiculo desmembrado, no dia de vencimento dele.
  for v in
    select * from veiculos
     where cliente_id = p_cliente_id
       and tipo_faturamento = 'INDIVIDUAL_VEICULO'
       and veiculo_faturavel(id, v_comp)
     order by placa
  loop
    if not exists (
          select 1 from faturas
           where veiculo_id = v.id and competencia = v_comp
             and tipo_faturamento = 'INDIVIDUAL_VEICULO'
        )
    then
      v_val := valor_mensalidade_veiculo(v.id);
      if v_val > 0 then
        v_venc := coalesce(p_vencimento, calcular_vencimento(v_comp, v.dia_vencimento));
        insert into faturas (cliente_id, regional_id, tipo_faturamento, veiculo_id, competencia, vencimento, valor_total)
          values (p_cliente_id, v_reg, 'INDIVIDUAL_VEICULO', v.id, v_comp, v_venc, v_val)
          returning * into f_ind;
        insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
          values (f_ind.id, v.id, coalesce(v.placa, '') || ' - ' || coalesce(v.modelo, 'veiculo'), v_val);
        return next f_ind;
      end if;
    end if;
  end loop;

  return;
end;
$$;

-- ----------------------------------------------------------------------------
-- C) Lote do mes: gera as faturas de todos os associados com veiculo faturavel
-- ----------------------------------------------------------------------------
create or replace function gerar_faturas_competencia(
  p_competencia date,
  p_regional_id uuid default null
)
returns table (
  associados      integer,
  faturas_geradas integer,
  valor_total     numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  c        record;
  f        faturas;
  v_comp   date := date_trunc('month', p_competencia)::date;
  n_assoc  integer := 0;
  n_fat    integer := 0;
  v_soma   numeric := 0;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  for c in
    select distinct v.cliente_id
      from veiculos v
      join clientes cl on cl.id = v.cliente_id
     where veiculo_faturavel(v.id, v_comp)
       and (p_regional_id is null or coalesce(v.regional_id, cl.regional_id) = p_regional_id)
       and pode_regional(cl.regional_id)
  loop
    n_assoc := n_assoc + 1;
    for f in select * from gerar_faturas_cliente(c.cliente_id, v_comp) loop
      n_fat  := n_fat + 1;
      v_soma := v_soma + f.valor_total;
    end loop;
  end loop;

  associados := n_assoc;
  faturas_geradas := n_fat;
  valor_total := round(coalesce(v_soma, 0), 2);
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- D) Fatura -> titulo financeiro (base do boleto / 2a via / inadimplencia)
-- ----------------------------------------------------------------------------
create or replace function emitir_titulo_fatura(p_fatura_id uuid)
returns titulos_financeiros
language plpgsql
security definer
set search_path = public
as $$
declare
  f faturas;
  t titulos_financeiros;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  select * into f from faturas where id = p_fatura_id;
  if f.id is null then raise exception 'Fatura nao encontrada'; end if;
  if f.status = 'CANCELADA' then raise exception 'Fatura cancelada'; end if;

  -- Idempotente: fatura ja emitida devolve o titulo existente.
  if f.titulo_id is not null then
    select * into t from titulos_financeiros where id = f.titulo_id;
    if t.id is not null then return t; end if;
  end if;

  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (
      f.cliente_id,
      f.veiculo_id,                                  -- nulo na fatura agrupada
      f.valor_total,
      coalesce(f.vencimento, calcular_vencimento(f.competencia, null)),
      'pendente'
    )
    returning * into t;

  update faturas set titulo_id = t.id, updated_at = now() where id = f.id;
  return t;
end;
$$;

-- Emite os titulos de todas as faturas ABERTAS da competencia (sem titulo).
create or replace function emitir_titulos_competencia(
  p_competencia date,
  p_regional_id uuid default null
)
returns table (
  titulos_emitidos integer,
  valor_total      numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  f       faturas;
  v_comp  date := date_trunc('month', p_competencia)::date;
  n       integer := 0;
  v_soma  numeric := 0;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  for f in
    select * from faturas
     where competencia = v_comp
       and status = 'ABERTA'
       and titulo_id is null
       and (p_regional_id is null or regional_id = p_regional_id)
       and pode_regional(regional_id)
     order by vencimento
  loop
    perform emitir_titulo_fatura(f.id);
    n := n + 1;
    v_soma := v_soma + f.valor_total;
  end loop;

  titulos_emitidos := n;
  valor_total := round(coalesce(v_soma, 0), 2);
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- E) Titulo -> fatura: o pagamento (webhook bancario) fecha a fatura
-- ----------------------------------------------------------------------------
create or replace function fn_fatura_status_por_titulo()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'pago' then
      update faturas set status = 'PAGA', updated_at = now()
       where titulo_id = new.id and status <> 'CANCELADA';
    elsif new.status = 'cancelado' then
      update faturas set status = 'CANCELADA', updated_at = now()
       where titulo_id = new.id and status <> 'PAGA';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fatura_status_titulo on titulos_financeiros;
create trigger trg_fatura_status_titulo
  after update of status on titulos_financeiros
  for each row execute function fn_fatura_status_por_titulo();

-- ----------------------------------------------------------------------------
-- F) Cancelamento da fatura (e do titulo em aberto)
-- ----------------------------------------------------------------------------
create or replace function cancelar_fatura(p_fatura_id uuid)
returns faturas
language plpgsql
security definer
set search_path = public
as $$
declare f faturas;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  select * into f from faturas where id = p_fatura_id;
  if f.id is null then raise exception 'Fatura nao encontrada'; end if;
  if f.status = 'PAGA' then raise exception 'Fatura ja paga'; end if;

  if f.titulo_id is not null then
    update titulos_financeiros set status = 'cancelado', updated_at = now()
     where id = f.titulo_id and status <> 'pago';
  end if;

  update faturas set status = 'CANCELADA', updated_at = now()
   where id = f.id
   returning * into f;
  return f;
end;
$$;

-- ----------------------------------------------------------------------------
-- Indices / grants
-- ----------------------------------------------------------------------------
create index if not exists idx_faturas_competencia on faturas (competencia, status);
create index if not exists idx_faturas_titulo on faturas (titulo_id);

grant execute on function calcular_vencimento(date, int) to authenticated;
grant execute on function valor_mensalidade_veiculo(uuid) to authenticated;
grant execute on function veiculo_faturavel(uuid, date) to authenticated;
grant execute on function dia_vencimento_agrupado(uuid, date) to authenticated;
grant execute on function gerar_faturas_competencia(date, uuid) to authenticated;
grant execute on function emitir_titulo_fatura(uuid) to authenticated;
grant execute on function emitir_titulos_competencia(date, uuid) to authenticated;
grant execute on function cancelar_fatura(uuid) to authenticated;

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0025_cobranca_modulo.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- SCar :: 0025_cobranca_modulo.sql
-- MODULO COBRANCA (evolucao do 0024):
--   A) GERACAO AUTOMATICA na entrada na base: ao ativar o veiculo (insert com
--      status 'ativo' ou mudanca para 'ativo' — inclusive pela auditoria de
--      Vendas), o sistema carimba a data_ativacao e gera a PRIMEIRA cobranca.
--   B) BOLETAGEM RECORRENTE: geracao em lote por PERIODO (ex.: proximos 6
--      meses) com escopo por associado, por grupo de veiculos ou por regional.
--   C) INTEGRACAO BANCARIA (service pattern): campos de PIX/PDF no titulo +
--      tabelas `cobranca_remessas` / `cobranca_remessa_itens` (fila de envio ao
--      gateway) + funcoes de criacao de remessa e registro do retorno. Hoje o
--      gateway e mockado no app; a estrutura ja aceita o retorno real
--      (nosso numero, linha digitavel, PDF, PIX copia-e-cola / QR Code).
--   D) DASHBOARD: `listar_cobrancas(...)` (filtros: placa, associado, periodo
--      de vencimento, faixa de valor, status) e `resumo_cobrancas(...)`
--      (emitido x recebido, inadimplencia, a vencer em 7/15/30 dias).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) Geracao automatica na ativacao do veiculo
-- ----------------------------------------------------------------------------

-- Primeira cobranca do veiculo (competencia da ativacao). Idempotente: se o
-- veiculo ja esta em alguma fatura da competencia, nao faz nada.
-- AGRUPADO: entra como item na fatura agrupada do mes quando ela ainda esta
-- ABERTA e sem titulo emitido; se a agrupada ja foi emitida/paga, o veiculo
-- recebe uma fatura propria para nao perder a cobranca de entrada.
create or replace function gerar_primeira_cobranca_veiculo(
  p_veiculo_id uuid,
  p_competencia date default null
)
returns setof faturas
language plpgsql
security definer
set search_path = public
as $$
declare
  v      veiculos;
  f      faturas;
  v_comp date;
  v_val  numeric;
  v_reg  uuid;
  v_desc text;
begin
  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then return; end if;

  v_comp := date_trunc('month', coalesce(p_competencia, v.data_ativacao, current_date))::date;
  if not veiculo_faturavel(v.id, v_comp) then return; end if;

  -- ja cobrado nesta competencia?
  if exists (
       select 1 from fatura_itens fi
         join faturas fa on fa.id = fi.fatura_id
        where fi.veiculo_id = v.id and fa.competencia = v_comp and fa.status <> 'CANCELADA'
     )
  then
    return;
  end if;

  v_val := valor_mensalidade_veiculo(v.id);
  if v_val <= 0 then return; end if;

  select regional_id into v_reg from clientes where id = v.cliente_id;
  v_desc := coalesce(v.placa, '') || ' - ' || coalesce(v.modelo, 'veiculo');

  if v.tipo_faturamento = 'AGRUPADO_ASSOCIADO' then
    select * into f from faturas
     where cliente_id = v.cliente_id and competencia = v_comp
       and tipo_faturamento = 'AGRUPADO_ASSOCIADO';

    if f.id is not null and f.status = 'ABERTA' and f.titulo_id is null then
      insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
        values (f.id, v.id, v_desc, v_val);
      update faturas
         set valor_total = valor_total + v_val, updated_at = now()
       where id = f.id
       returning * into f;
      return next f;
      return;
    end if;

    if f.id is null then
      insert into faturas (cliente_id, regional_id, tipo_faturamento, competencia, vencimento, valor_total)
        values (v.cliente_id, v_reg, 'AGRUPADO_ASSOCIADO', v_comp,
                calcular_vencimento(v_comp, coalesce(dia_vencimento_agrupado(v.cliente_id, v_comp), v.dia_vencimento)),
                v_val)
        returning * into f;
      insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
        values (f.id, v.id, v_desc, v_val);
      return next f;
      return;
    end if;
  end if;

  -- INDIVIDUAL (ou agrupada ja emitida/paga): fatura propria do veiculo.
  if exists (
       select 1 from faturas
        where veiculo_id = v.id and competencia = v_comp and tipo_faturamento = 'INDIVIDUAL_VEICULO'
     )
  then
    return;
  end if;

  insert into faturas (cliente_id, regional_id, tipo_faturamento, veiculo_id, competencia, vencimento, valor_total)
    values (v.cliente_id, v_reg, 'INDIVIDUAL_VEICULO', v.id, v_comp,
            calcular_vencimento(v_comp, v.dia_vencimento), v_val)
    returning * into f;
  insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
    values (f.id, v.id, v_desc, v_val);
  return next f;
end;
$$;

-- BEFORE: carimba a data de ativacao na entrada na base.
create or replace function fn_veiculo_marca_ativacao()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'ativo'
     and (tg_op = 'INSERT' or old.status is distinct from 'ativo')
     and new.data_ativacao is null
  then
    new.data_ativacao := current_date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_veiculo_marca_ativacao on veiculos;
create trigger trg_veiculo_marca_ativacao
  before insert or update of status on veiculos
  for each row execute function fn_veiculo_marca_ativacao();

-- AFTER: dispara a primeira cobranca. Nao bloqueia o cadastro do veiculo se a
-- cobranca nao puder ser gerada (sem plano/valor, por exemplo).
create or replace function fn_veiculo_primeira_cobranca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'ativo' and (tg_op = 'INSERT' or old.status is distinct from 'ativo') then
    begin
      perform gerar_primeira_cobranca_veiculo(new.id);
    exception when others then
      raise warning 'Cobranca de entrada do veiculo % nao gerada: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_veiculo_primeira_cobranca on veiculos;
create trigger trg_veiculo_primeira_cobranca
  after insert or update of status on veiculos
  for each row execute function fn_veiculo_primeira_cobranca();

-- ----------------------------------------------------------------------------
-- B) Boletagem recorrente: lote por periodo / por grupo de veiculos
-- ----------------------------------------------------------------------------

-- Nucleo da geracao: igual ao 0024, porem com filtro opcional de veiculos
-- (permite boletar so um grupo selecionado pelo operador).
create or replace function gerar_faturas_cliente_veiculos(
  p_cliente_id uuid,
  p_competencia date,
  p_veiculo_ids uuid[] default null,
  p_vencimento date default null
)
returns setof faturas
language plpgsql
security definer
set search_path = public
as $$
declare
  v        veiculos;
  f_agrup  faturas;
  f_ind    faturas;
  v_reg    uuid;
  v_val    numeric;
  v_total  numeric := 0;
  v_venc   date;
  v_comp   date := date_trunc('month', p_competencia)::date;
  v_ids    uuid[] := '{}'::uuid[];
  v_descs  text[] := '{}'::text[];
  v_vals   numeric[] := '{}'::numeric[];
  i        int;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;
  select regional_id into v_reg from clientes where id = p_cliente_id;

  -- AGRUPADO
  if not exists (
       select 1 from faturas
        where cliente_id = p_cliente_id and competencia = v_comp
          and tipo_faturamento = 'AGRUPADO_ASSOCIADO'
     )
  then
    for v in
      select * from veiculos
       where cliente_id = p_cliente_id
         and tipo_faturamento = 'AGRUPADO_ASSOCIADO'
         and veiculo_faturavel(id, v_comp)
         and (p_veiculo_ids is null or id = any(p_veiculo_ids))
       order by placa
    loop
      v_val := valor_mensalidade_veiculo(v.id);
      if v_val > 0 then
        v_ids   := v_ids   || v.id;
        v_descs := v_descs || (coalesce(v.placa, '') || ' - ' || coalesce(v.modelo, 'veiculo'));
        v_vals  := v_vals  || v_val;
        v_total := v_total + v_val;
      end if;
    end loop;

    if v_total > 0 then
      v_venc := coalesce(p_vencimento, calcular_vencimento(v_comp, dia_vencimento_agrupado(p_cliente_id, v_comp)));
      insert into faturas (cliente_id, regional_id, tipo_faturamento, competencia, vencimento, valor_total)
        values (p_cliente_id, v_reg, 'AGRUPADO_ASSOCIADO', v_comp, v_venc, v_total)
        returning * into f_agrup;
      for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
        insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
          values (f_agrup.id, v_ids[i], v_descs[i], v_vals[i]);
      end loop;
      return next f_agrup;
    end if;
  end if;

  -- INDIVIDUAL
  for v in
    select * from veiculos
     where cliente_id = p_cliente_id
       and tipo_faturamento = 'INDIVIDUAL_VEICULO'
       and veiculo_faturavel(id, v_comp)
       and (p_veiculo_ids is null or id = any(p_veiculo_ids))
     order by placa
  loop
    if not exists (
          select 1 from faturas
           where veiculo_id = v.id and competencia = v_comp
             and tipo_faturamento = 'INDIVIDUAL_VEICULO'
        )
    then
      v_val := valor_mensalidade_veiculo(v.id);
      if v_val > 0 then
        v_venc := coalesce(p_vencimento, calcular_vencimento(v_comp, v.dia_vencimento));
        insert into faturas (cliente_id, regional_id, tipo_faturamento, veiculo_id, competencia, vencimento, valor_total)
          values (p_cliente_id, v_reg, 'INDIVIDUAL_VEICULO', v.id, v_comp, v_venc, v_val)
          returning * into f_ind;
        insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
          values (f_ind.id, v.id, coalesce(v.placa, '') || ' - ' || coalesce(v.modelo, 'veiculo'), v_val);
        return next f_ind;
      end if;
    end if;
  end loop;

  return;
end;
$$;

-- Mantem a assinatura historica delegando para o nucleo.
create or replace function gerar_faturas_cliente(
  p_cliente_id uuid,
  p_competencia date,
  p_vencimento date default null
)
returns setof faturas
language sql
security definer
set search_path = public
as $$
  select * from gerar_faturas_cliente_veiculos(p_cliente_id, p_competencia, null, p_vencimento);
$$;

-- Lote por PERIODO: gera N competencias de uma vez (ex.: 6 meses), com escopo
-- por associado, por grupo de veiculos ou por regional. Idempotente por mes.
create or replace function gerar_faturas_periodo(
  p_competencia_inicial date,
  p_meses int default 6,
  p_cliente_id uuid default null,
  p_veiculo_ids uuid[] default null,
  p_regional_id uuid default null
)
returns table (
  competencia     date,
  associados      integer,
  faturas_geradas integer,
  valor_total     numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  c       record;
  f       faturas;
  v_comp  date;
  m       int;
  n_assoc integer;
  n_fat   integer;
  v_soma  numeric;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;
  if p_meses < 1 or p_meses > 24 then raise exception 'Periodo invalido (1 a 24 meses)'; end if;

  for m in 0 .. p_meses - 1 loop
    v_comp  := (date_trunc('month', p_competencia_inicial) + (m || ' month')::interval)::date;
    n_assoc := 0; n_fat := 0; v_soma := 0;

    for c in
      select distinct v.cliente_id
        from veiculos v
        join clientes cl on cl.id = v.cliente_id
       where veiculo_faturavel(v.id, v_comp)
         and (p_cliente_id is null or v.cliente_id = p_cliente_id)
         and (p_veiculo_ids is null or v.id = any(p_veiculo_ids))
         and (p_regional_id is null or coalesce(v.regional_id, cl.regional_id) = p_regional_id)
         and pode_regional(cl.regional_id)
    loop
      n_assoc := n_assoc + 1;
      for f in select * from gerar_faturas_cliente_veiculos(c.cliente_id, v_comp, p_veiculo_ids) loop
        n_fat  := n_fat + 1;
        v_soma := v_soma + f.valor_total;
      end loop;
    end loop;

    competencia := v_comp;
    associados := n_assoc;
    faturas_geradas := n_fat;
    valor_total := round(coalesce(v_soma, 0), 2);
    return next;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- C) Integracao bancaria: campos do titulo + fila de remessas
-- ----------------------------------------------------------------------------
alter table titulos_financeiros
  add column if not exists pix_copia_cola text,
  add column if not exists pix_qrcode_url text,
  add column if not exists integracao_id  uuid references integracoes_bancarias(id) on delete set null,
  add column if not exists gateway_status text,
  add column if not exists gateway_erro   text,
  add column if not exists enviado_em     timestamptz;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'status_remessa') then
    create type status_remessa as enum ('PENDENTE', 'PROCESSANDO', 'CONCLUIDA', 'PARCIAL', 'ERRO');
  end if;
  if not exists (select 1 from pg_type where typname = 'status_remessa_item') then
    create type status_remessa_item as enum ('PENDENTE', 'ENVIADO', 'CONFIRMADO', 'ERRO');
  end if;
end $$;

-- Remessa = lote de titulos enviado (ou a enviar) para a API do banco.
create table if not exists cobranca_remessas (
  id            uuid primary key default gen_random_uuid(),
  integracao_id uuid references integracoes_bancarias(id) on delete set null,
  regional_id   uuid references regionais(id) on delete set null,
  referencia    text,                                   -- ex.: 'competencia 2026-03'
  status        status_remessa not null default 'PENDENTE',
  total_titulos integer not null default 0,
  total_valor   numeric(12,2) not null default 0,
  enviado_em    timestamptz,
  retorno_em    timestamptz,
  erro          text,
  created_by    uuid references usuarios(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists cobranca_remessa_itens (
  id         uuid primary key default gen_random_uuid(),
  remessa_id uuid not null references cobranca_remessas(id) on delete cascade,
  titulo_id  uuid not null references titulos_financeiros(id) on delete cascade,
  status     status_remessa_item not null default 'PENDENTE',
  erro       text,
  payload    jsonb,          -- o que foi enviado ao gateway
  retorno    jsonb,          -- resposta bruta do gateway (auditoria)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (remessa_id, titulo_id)
);

create index if not exists idx_remessa_itens_remessa on cobranca_remessa_itens (remessa_id);
create index if not exists idx_remessa_itens_titulo  on cobranca_remessa_itens (titulo_id);
create index if not exists idx_titulos_vencimento    on titulos_financeiros (data_vencimento, status);

create trigger trg_remessas_updated before update on cobranca_remessas
  for each row execute function set_updated_at();
create trigger trg_remessa_itens_updated before update on cobranca_remessa_itens
  for each row execute function set_updated_at();

-- Cria a remessa a partir de uma lista de titulos (ignora os que ja possuem
-- linha digitavel ou ja estao confirmados em outra remessa).
create or replace function criar_remessa_cobranca(
  p_titulo_ids  uuid[],
  p_integracao_id uuid default null,
  p_referencia  text default null
)
returns cobranca_remessas
language plpgsql
security definer
set search_path = public
as $$
declare
  r    cobranca_remessas;
  v_int uuid := p_integracao_id;
  v_reg uuid;
begin
  if not tem_acesso_global() then raise exception 'Sem permissao'; end if;
  if p_titulo_ids is null or array_length(p_titulo_ids, 1) is null then
    raise exception 'Nenhum titulo informado';
  end if;

  if v_int is null then
    select id into v_int from integracoes_bancarias
     where ativo and is_padrao order by regional_id nulls last limit 1;
  end if;
  select regional_id into v_reg from integracoes_bancarias where id = v_int;

  insert into cobranca_remessas (integracao_id, regional_id, referencia, status, created_by)
    values (v_int, v_reg, p_referencia, 'PENDENTE', auth.uid())
    returning * into r;

  insert into cobranca_remessa_itens (remessa_id, titulo_id)
    select r.id, t.id
      from titulos_financeiros t
     where t.id = any(p_titulo_ids)
       and t.status in ('pendente', 'vencido')
       and t.linha_digitavel is null
       and not exists (
         select 1 from cobranca_remessa_itens i
          where i.titulo_id = t.id and i.status in ('PENDENTE', 'ENVIADO', 'CONFIRMADO')
       );

  update cobranca_remessas c
     set total_titulos = agg.qtd, total_valor = agg.soma
    from (
      select count(*)::int as qtd, coalesce(sum(t.valor), 0) as soma
        from cobranca_remessa_itens i
        join titulos_financeiros t on t.id = i.titulo_id
       where i.remessa_id = r.id
    ) agg
   where c.id = r.id
   returning * into r;

  return r;
end;
$$;

-- Marca a remessa como enviada (a chamada HTTP acontece no app / edge function).
create or replace function marcar_remessa_enviada(p_remessa_id uuid)
returns cobranca_remessas
language plpgsql
security definer
set search_path = public
as $$
declare r cobranca_remessas;
begin
  if not tem_acesso_global() then raise exception 'Sem permissao'; end if;
  update cobranca_remessas
     set status = 'PROCESSANDO', enviado_em = now(), updated_at = now()
   where id = p_remessa_id
   returning * into r;
  if r.id is null then raise exception 'Remessa nao encontrada'; end if;

  update cobranca_remessa_itens set status = 'ENVIADO', updated_at = now()
   where remessa_id = p_remessa_id and status = 'PENDENTE';

  update titulos_financeiros t
     set enviado_em = now(), gateway_status = 'ENVIADO', integracao_id = coalesce(t.integracao_id, r.integracao_id)
    from cobranca_remessa_itens i
   where i.remessa_id = p_remessa_id and i.titulo_id = t.id;

  return r;
end;
$$;

-- Registra o retorno do gateway para UM titulo da remessa (linha digitavel,
-- nosso numero, PDF, PIX). Chamada pela rotina de emissao ou pelo webhook.
create or replace function registrar_retorno_cobranca(
  p_titulo_id       uuid,
  p_gateway_id      text default null,
  p_nosso_numero    text default null,
  p_linha_digitavel text default null,
  p_url_boleto      text default null,
  p_pix_copia_cola  text default null,
  p_pix_qrcode_url  text default null,
  p_erro            text default null,
  p_retorno         jsonb default null
)
returns titulos_financeiros
language plpgsql
security definer
set search_path = public
as $$
declare t titulos_financeiros;
begin
  if not tem_acesso_global() then raise exception 'Sem permissao'; end if;

  update titulos_financeiros
     set gateway_transacao_id = coalesce(p_gateway_id, gateway_transacao_id),
         nosso_numero         = coalesce(p_nosso_numero, nosso_numero),
         linha_digitavel      = coalesce(p_linha_digitavel, linha_digitavel),
         url_boleto           = coalesce(p_url_boleto, url_boleto),
         pix_copia_cola       = coalesce(p_pix_copia_cola, pix_copia_cola),
         pix_qrcode_url       = coalesce(p_pix_qrcode_url, pix_qrcode_url),
         gateway_status       = case when p_erro is null then 'REGISTRADO' else 'ERRO' end,
         gateway_erro         = p_erro,
         updated_at           = now()
   where id = p_titulo_id
   returning * into t;
  if t.id is null then raise exception 'Titulo nao encontrado'; end if;

  update cobranca_remessa_itens
     set status  = (case when p_erro is null then 'CONFIRMADO' else 'ERRO' end)::status_remessa_item,
         erro    = p_erro,
         retorno = coalesce(p_retorno, retorno),
         updated_at = now()
   where titulo_id = p_titulo_id and status in ('PENDENTE', 'ENVIADO');

  return t;
end;
$$;

-- Fecha a remessa consolidando o resultado dos itens.
create or replace function finalizar_remessa(p_remessa_id uuid)
returns cobranca_remessas
language plpgsql
security definer
set search_path = public
as $$
declare
  r        cobranca_remessas;
  n_total  int;
  n_erro   int;
  n_ok     int;
begin
  if not tem_acesso_global() then raise exception 'Sem permissao'; end if;

  select count(*)::int,
         count(*) filter (where status = 'ERRO')::int,
         count(*) filter (where status = 'CONFIRMADO')::int
    into n_total, n_erro, n_ok
    from cobranca_remessa_itens where remessa_id = p_remessa_id;

  update cobranca_remessas
     set status = (case
                     when n_total = 0 then 'ERRO'
                     when n_erro = 0 then 'CONCLUIDA'
                     when n_ok = 0 then 'ERRO'
                     else 'PARCIAL'
                   end)::status_remessa,
         retorno_em = now(),
         updated_at = now()
   where id = p_remessa_id
   returning * into r;

  if r.id is null then raise exception 'Remessa nao encontrada'; end if;
  return r;
end;
$$;

-- ----------------------------------------------------------------------------
-- D) Dashboard: listagem com filtros + resumo (KPIs)
-- ----------------------------------------------------------------------------

-- Status "efetivo" do boleto: pendente vencido conta como VENCIDO mesmo que a
-- rotina marcar_titulos_vencidos ainda nao tenha rodado.
create or replace function status_cobranca_efetivo(p_status status_titulo, p_vencimento date)
returns text
language sql
immutable
as $$
  select case
    when p_status = 'pago' then 'pago'
    when p_status = 'cancelado' then 'cancelado'
    when p_status = 'vencido' or p_vencimento < current_date then 'vencido'
    else 'aberto'
  end;
$$;

-- Listagem do modulo Cobranca: um registro por titulo (boleto), com associado,
-- placas e status efetivo. Filtros: placa, nome/CPF do associado, periodo de
-- vencimento, faixa de valores, status e regional.
create or replace function listar_cobrancas(
  p_inicio      date default null,
  p_fim         date default null,
  p_placa       text default null,
  p_associado   text default null,
  p_valor_min   numeric default null,
  p_valor_max   numeric default null,
  p_status      text default null,     -- aberto | pago | vencido | cancelado
  p_regional_id uuid default null,
  p_limite      int  default 500
)
returns table (
  titulo_id       uuid,
  fatura_id       uuid,
  cliente_id      uuid,
  associado       text,
  cpf_cnpj        text,
  placas          text,
  competencia     date,
  data_vencimento date,
  valor           numeric,
  valor_pago      numeric,
  data_pagamento  date,
  status          text,
  dias_atraso     integer,
  linha_digitavel text,
  url_boleto      text,
  pix_copia_cola  text,
  regional_id     uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select t.id as titulo_id,
           f.id as fatura_id,
           t.cliente_id,
           cl.nome_razao_social as associado,
           cl.cpf_cnpj,
           coalesce(
             (select string_agg(distinct ve.placa, ', ' order by ve.placa)
                from fatura_itens fi join veiculos ve on ve.id = fi.veiculo_id
               where fi.fatura_id = f.id),
             (select ve.placa from veiculos ve where ve.id = t.veiculo_id)
           ) as placas,
           f.competencia,
           t.data_vencimento,
           t.valor,
           t.valor_pago,
           t.data_pagamento,
           status_cobranca_efetivo(t.status, t.data_vencimento) as status,
           greatest(0, (current_date - t.data_vencimento))::int as dias_atraso,
           t.linha_digitavel,
           t.url_boleto,
           t.pix_copia_cola,
           coalesce(f.regional_id, cl.regional_id) as regional_id
      from titulos_financeiros t
      join clientes cl on cl.id = t.cliente_id
      left join faturas f on f.titulo_id = t.id
     where pode_regional(coalesce(f.regional_id, cl.regional_id))
  )
  select * from base
   where (p_inicio is null or data_vencimento >= p_inicio)
     and (p_fim is null or data_vencimento <= p_fim)
     and (p_valor_min is null or valor >= p_valor_min)
     and (p_valor_max is null or valor <= p_valor_max)
     and (p_status is null or status = p_status)
     and (p_regional_id is null or regional_id = p_regional_id)
     and (p_placa is null or coalesce(placas, '') ilike '%' || p_placa || '%')
     and (
       p_associado is null
       or associado ilike '%' || p_associado || '%'
       or cpf_cnpj  ilike '%' || regexp_replace(p_associado, '\D', '', 'g') || '%'
     )
   order by data_vencimento desc
   limit coalesce(p_limite, 500);
$$;

-- KPIs do dashboard no periodo (por vencimento): emitido x recebido,
-- inadimplencia (valor e %) e a vencer em 7 / 15 / 30 dias.
create or replace function resumo_cobrancas(
  p_inicio      date default null,
  p_fim         date default null,
  p_regional_id uuid default null
)
returns table (
  emitido_qtd       integer,
  emitido_valor     numeric,
  recebido_qtd      integer,
  recebido_valor    numeric,
  aberto_qtd        integer,
  aberto_valor      numeric,
  vencido_qtd       integer,
  vencido_valor     numeric,
  inadimplencia_pct numeric,
  vencer_7_qtd      integer,
  vencer_7_valor    numeric,
  vencer_15_qtd     integer,
  vencer_15_valor   numeric,
  vencer_30_qtd     integer,
  vencer_30_valor   numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select * from listar_cobrancas(p_inicio, p_fim, null, null, null, null, null, p_regional_id, 100000)
  ),
  -- "A vencer" olha sempre para frente a partir de hoje (independe do periodo).
  fut as (
    select * from listar_cobrancas(current_date, current_date + 30, null, null, null, null, 'aberto', p_regional_id, 100000)
  )
  select
    count(*) filter (where c.status <> 'cancelado')::int,
    coalesce(sum(c.valor) filter (where c.status <> 'cancelado'), 0),
    count(*) filter (where c.status = 'pago')::int,
    coalesce(sum(coalesce(c.valor_pago, c.valor)) filter (where c.status = 'pago'), 0),
    count(*) filter (where c.status = 'aberto')::int,
    coalesce(sum(c.valor) filter (where c.status = 'aberto'), 0),
    count(*) filter (where c.status = 'vencido')::int,
    coalesce(sum(c.valor) filter (where c.status = 'vencido'), 0),
    round(
      coalesce(sum(c.valor) filter (where c.status = 'vencido'), 0)
      / nullif(coalesce(sum(c.valor) filter (where c.status <> 'cancelado'), 0), 0) * 100,
      2
    ),
    (select count(*)::int from fut where fut.data_vencimento <= current_date + 7),
    (select coalesce(sum(valor), 0) from fut where fut.data_vencimento <= current_date + 7),
    (select count(*)::int from fut where fut.data_vencimento <= current_date + 15),
    (select coalesce(sum(valor), 0) from fut where fut.data_vencimento <= current_date + 15),
    (select count(*)::int from fut where fut.data_vencimento <= current_date + 30),
    (select coalesce(sum(valor), 0) from fut where fut.data_vencimento <= current_date + 30)
  from c;
$$;

-- Titulos elegiveis a envio para o banco (fila da remessa) na competencia.
create or replace function titulos_para_remessa(
  p_competencia date default null,
  p_regional_id uuid default null,
  p_limite      int default 500
)
returns setof titulos_financeiros
language sql
stable
security definer
set search_path = public
as $$
  select t.*
    from titulos_financeiros t
    join clientes cl on cl.id = t.cliente_id
    left join faturas f on f.titulo_id = t.id
   where t.status in ('pendente', 'vencido')
     and t.linha_digitavel is null
     and (p_competencia is null or f.competencia = date_trunc('month', p_competencia)::date)
     and (p_regional_id is null or coalesce(f.regional_id, cl.regional_id) = p_regional_id)
     and pode_regional(coalesce(f.regional_id, cl.regional_id))
     and not exists (
       select 1 from cobranca_remessa_itens i
        where i.titulo_id = t.id and i.status in ('PENDENTE', 'ENVIADO', 'CONFIRMADO')
     )
   order by t.data_vencimento
   limit coalesce(p_limite, 500);
$$;

-- ----------------------------------------------------------------------------
-- RLS / grants
-- ----------------------------------------------------------------------------
alter table cobranca_remessas      enable row level security;
alter table cobranca_remessa_itens enable row level security;

drop policy if exists remessas_all on cobranca_remessas;
create policy remessas_all on cobranca_remessas for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

drop policy if exists remessa_itens_all on cobranca_remessa_itens;
create policy remessa_itens_all on cobranca_remessa_itens for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

grant select, insert, update, delete on cobranca_remessas, cobranca_remessa_itens to authenticated;

grant execute on function gerar_primeira_cobranca_veiculo(uuid, date) to authenticated;
grant execute on function gerar_faturas_cliente_veiculos(uuid, date, uuid[], date) to authenticated;
grant execute on function gerar_faturas_periodo(date, int, uuid, uuid[], uuid) to authenticated;
grant execute on function criar_remessa_cobranca(uuid[], uuid, text) to authenticated;
grant execute on function marcar_remessa_enviada(uuid) to authenticated;
grant execute on function registrar_retorno_cobranca(uuid, text, text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function finalizar_remessa(uuid) to authenticated;
grant execute on function status_cobranca_efetivo(status_titulo, date) to authenticated;
grant execute on function listar_cobrancas(date, date, text, text, numeric, numeric, text, uuid, int) to authenticated;
grant execute on function resumo_cobrancas(date, date, uuid) to authenticated;
grant execute on function titulos_para_remessa(date, uuid, int) to authenticated;

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0026_assistencia_24h.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- SCar :: 0026_assistencia_24h.sql
-- MODULO ASSISTENCIA 24 HORAS — central de acionamento integrada ao SAC, a
-- ficha do veiculo, ao cadastro de prestadores e ao Contas a Pagar.
--
--   A) PARAMETRIZACAO: catalogo `servicos_assistencia` (valor padrao, plano de
--      contas, KM excedente, regra de limite por janela flutuante em MESES) e
--      `prestador_servicos` (quais prestadores atendem cada servico e por
--      quanto). `fornecedores` ganha os campos de prestador 24h (whatsapp,
--      cobertura, chave PIX).
--   B) TRAVA + ALCADA: `situacao_assistencia_veiculo()` diz se o veiculo pode
--      acionar (ativo, adimplente, sem pendencia cadastral) e
--      `elegibilidade_assistencia()` devolve o consumo do limite em tempo real.
--      `abrir_acionamento()` bloqueia quando ha impedimento e so prossegue com
--      LIBERACAO DE SUPERIOR (a chamada tem de ser feita pelo gestor, que
--      carimba liberado_por/justificativa).
--   C) OPERACAO: cotacao com prestadores (`acionamento_cotacoes`), geracao da
--      OS com codigo unico (`confirmar_prestador`), trilha de status
--      (`acionamento_historico`) e conclusao.
--   D) FINANCEIRO: ao concluir, a OS vira LANCAMENTO em Contas a Pagar
--      (fornecedor + plano de contas do servico), pronto para baixa. O papel
--      `assistencia_24h` recebe acesso a prestadores e ao contas a pagar.
-- ============================================================================

-- Novo papel (o literal so pode ser usado em OUTRA transacao — comparamos como
-- texto no restante do arquivo, mesmo motivo do 0017).
alter type papel_usuario add value if not exists 'assistencia_24h';

do $$ begin
  if not exists (select 1 from pg_type where typname = 'status_acionamento') then
    create type status_acionamento as enum (
      'ABERTO', 'EM_COTACAO', 'AUTORIZADO', 'EM_ATENDIMENTO', 'CONCLUIDO', 'CANCELADO'
    );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- A) Parametrizacao: servicos 24h e prestadores
-- ----------------------------------------------------------------------------
create table if not exists servicos_assistencia (
  id                  uuid primary key default gen_random_uuid(),
  descricao           text not null unique,          -- Reboque Passeio, Chaveiro, Carro Reserva...
  valor_padrao        numeric(12,2) not null default 0,   -- valor base pago ao prestador
  categoria_dre_id    uuid references categorias_dre(id) on delete set null,  -- plano de contas
  cobra_km_excedente  boolean not null default false,
  valor_km_excedente  numeric(12,2) not null default 0,
  km_franquia         numeric(12,2) not null default 0,   -- KM incluidos antes do excedente
  computa_limite      boolean not null default false,     -- computa no limite do opcional?
  limite_quantidade   integer not null default 1,         -- ex.: 2 utilizacoes
  limite_janela_meses integer not null default 12,        -- ...a cada 12 meses (janela flutuante)
  produto_id          uuid references produtos(id) on delete set null,  -- opcional que da direito
  observacoes         text,
  ativo               boolean not null default true,
  ordem               integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint chk_servico_limite check (limite_quantidade >= 0 and limite_janela_meses > 0)
);
create trigger trg_servicos_assist_updated before update on servicos_assistencia
  for each row execute function set_updated_at();

-- Campos de prestador 24h no cadastro de fornecedores (reuso, sem duplicar).
alter table fornecedores
  add column if not exists prestador_assistencia boolean not null default false,
  add column if not exists whatsapp   text,
  add column if not exists cobertura  text,               -- regiao/cidades atendidas
  add column if not exists chave_pix  text,
  add column if not exists observacoes text;

-- Quais servicos cada prestador atende (e por quanto).
create table if not exists prestador_servicos (
  fornecedor_id   uuid not null references fornecedores(id) on delete cascade,
  servico_id      uuid not null references servicos_assistencia(id) on delete cascade,
  valor_acordado  numeric(12,2),
  valor_km        numeric(12,2),
  prazo_medio_min integer,
  ativo           boolean not null default true,
  primary key (fornecedor_id, servico_id)
);
create index if not exists idx_prestador_servicos_servico on prestador_servicos (servico_id) where ativo;

-- ----------------------------------------------------------------------------
-- C) Acionamentos (Ordem de Servico) + cotacoes + trilha
-- ----------------------------------------------------------------------------
create table if not exists acionamentos_assistencia (
  id                  uuid primary key default gen_random_uuid(),
  protocolo           text unique,                    -- ASS-YYYYMMDD-XXXX (trigger)
  codigo_os           text unique,                    -- OS-YYYYMMDD-XXXX (na autorizacao)
  veiculo_id          uuid not null references veiculos(id) on delete restrict,
  cliente_id          uuid not null references clientes(id) on delete restrict,
  servico_id          uuid not null references servicos_assistencia(id) on delete restrict,
  atendimento_id      uuid references atendimentos(id) on delete set null,   -- chamado do SAC
  evento_id           uuid references eventos_sinistro(id) on delete set null,
  status              status_acionamento not null default 'ABERTO',
  -- solicitacao
  solicitante_nome    text,
  solicitante_telefone text,
  origem              jsonb not null default '{}'::jsonb,   -- {logradouro,cidade,uf,referencia,lat,lng}
  destino             jsonb not null default '{}'::jsonb,
  km_previsto         numeric(12,2),
  km_percorrido       numeric(12,2),
  km_excedente        numeric(12,2) not null default 0,
  observacoes         text,
  -- prestador / valores (OS)
  prestador_id        uuid references fornecedores(id) on delete set null,
  valor_servico       numeric(12,2) not null default 0,
  valor_km_excedente  numeric(12,2) not null default 0,
  valor_total         numeric(12,2) not null default 0,
  prazo_estimado_min  integer,
  -- trava / alcada
  computa_limite      boolean not null default false,       -- snapshot da regra do servico
  bloqueio_motivos    text[] not null default '{}',         -- por que estava bloqueado
  liberado_por        uuid references usuarios(id) on delete set null,
  liberado_em         timestamptz,
  liberacao_justificativa text,
  -- integracao financeira / trilha
  lancamento_id       uuid references lancamentos_financeiros(id) on delete set null,
  voucher_enviado_em  timestamptz,
  aberto_por          uuid references usuarios(id) on delete set null,
  concluido_em        timestamptz,
  cancelado_motivo    text,
  regional_id         uuid references regionais(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_acion_veiculo on acionamentos_assistencia (veiculo_id, created_at desc);
create index if not exists idx_acion_cliente on acionamentos_assistencia (cliente_id, created_at desc);
create index if not exists idx_acion_status  on acionamentos_assistencia (status);
create index if not exists idx_acion_servico on acionamentos_assistencia (servico_id, veiculo_id);
create index if not exists idx_acion_prestador on acionamentos_assistencia (prestador_id);

create table if not exists acionamento_cotacoes (
  id             uuid primary key default gen_random_uuid(),
  acionamento_id uuid not null references acionamentos_assistencia(id) on delete cascade,
  fornecedor_id  uuid not null references fornecedores(id) on delete restrict,
  valor          numeric(12,2) not null default 0,
  valor_km       numeric(12,2),
  prazo_estimado_min integer,
  observacao     text,
  escolhida      boolean not null default false,
  created_by     uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (acionamento_id, fornecedor_id)
);

create table if not exists acionamento_historico (
  id             uuid primary key default gen_random_uuid(),
  acionamento_id uuid not null references acionamentos_assistencia(id) on delete cascade,
  status         status_acionamento not null,
  observacao     text,
  usuario_id     uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_acion_hist on acionamento_historico (acionamento_id, created_at);

-- Protocolo ASS-YYYYMMDD-XXXX (espelha eventos/atendimentos).
create or replace function fn_protocolo_acionamento()
returns trigger language plpgsql as $$
declare v_data text; v_seq integer;
begin
  if new.protocolo is not null then return new; end if;
  v_data := to_char(now(), 'YYYYMMDD');
  perform pg_advisory_xact_lock(hashtext('acionamento_' || v_data));
  select coalesce(max((regexp_replace(protocolo, '^ASS-\d{8}-', ''))::integer), 0) + 1
    into v_seq
    from acionamentos_assistencia
   where protocolo like 'ASS-' || v_data || '-%';
  new.protocolo := 'ASS-' || v_data || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;
create trigger trg_protocolo_acionamento before insert on acionamentos_assistencia
  for each row execute function fn_protocolo_acionamento();
create trigger trg_acion_updated before update on acionamentos_assistencia
  for each row execute function set_updated_at();

-- Trilha automatica de status.
create or replace function fn_acionamento_historico()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into acionamento_historico (acionamento_id, status, usuario_id)
      values (new.id, new.status, auth.uid());
  end if;
  return new;
end;
$$;
create trigger trg_acionamento_historico after insert or update of status on acionamentos_assistencia
  for each row execute function fn_acionamento_historico();

-- ----------------------------------------------------------------------------
-- Permissoes do modulo
-- ----------------------------------------------------------------------------
-- Atendente 24h opera o modulo (inclui as funcoes financeiras do fluxo).
create or replace function pode_assistencia()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(auth_papel()::text in ('admin', 'financeiro', 'gestor_regional', 'assistencia_24h', 'sinistro'), false);
$$;

-- Alcada de liberacao (excecao a trava financeira/cadastral).
create or replace function pode_liberar_assistencia()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(auth_papel()::text in ('admin', 'financeiro', 'gestor_regional'), false);
$$;

-- ----------------------------------------------------------------------------
-- B) Limite de uso (janela flutuante em MESES) e trava do veiculo
-- ----------------------------------------------------------------------------
-- Consumo por servico do veiculo na janela: conta os acionamentos que sairam do
-- papel (autorizados em diante) dentro dos ultimos N meses.
create or replace function elegibilidade_assistencia(p_veiculo_id uuid)
returns table (
  servico_id        uuid,
  descricao         text,
  computa_limite    boolean,
  limite_quantidade integer,
  janela_meses      integer,
  usados            integer,
  restantes         integer,
  elegivel          boolean,
  ultimo_uso        date
)
language sql stable
as $$
  select s.id,
         s.descricao,
         s.computa_limite,
         s.limite_quantidade,
         s.limite_janela_meses,
         coalesce(u.usados, 0)::int,
         case when s.computa_limite
              then greatest(0, s.limite_quantidade - coalesce(u.usados, 0))::int
              else null end,
         (not s.computa_limite) or coalesce(u.usados, 0) < s.limite_quantidade,
         u.ultimo_uso
    from servicos_assistencia s
    left join lateral (
      select count(*)::int as usados, max(a.created_at::date) as ultimo_uso
        from acionamentos_assistencia a
       where a.veiculo_id = p_veiculo_id
         and a.servico_id = s.id
         and a.status in ('AUTORIZADO', 'EM_ATENDIMENTO', 'CONCLUIDO')
         and a.created_at >= now() - make_interval(months => s.limite_janela_meses)
    ) u on true
   where s.ativo
   order by s.ordem, s.descricao;
$$;

-- Situacao do veiculo para acionar: ativo + adimplente + sem pendencia cadastral.
create or replace function situacao_assistencia_veiculo(p_veiculo_id uuid)
returns table (
  veiculo_id        uuid,
  placa             text,
  cliente_id        uuid,
  associado         text,
  status_veiculo    status_veiculo,
  veiculo_ativo     boolean,
  inadimplente      boolean,
  titulos_vencidos  integer,
  valor_em_atraso   numeric,
  pendencia_cadastral boolean,
  alertas_ativos    integer,
  pode_acionar      boolean,
  motivos           text[]
)
language plpgsql stable
as $$
declare
  v        veiculos;
  cli      clientes;
  v_venc   integer := 0;
  v_valor  numeric := 0;
  v_alert  integer := 0;
  v_mot    text[] := '{}';
begin
  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then return; end if;
  select * into cli from clientes where id = v.cliente_id;

  -- Inadimplencia: titulo do veiculo (ou do associado, no agrupado) vencido.
  select count(*)::int, coalesce(sum(t.valor), 0)
    into v_venc, v_valor
    from titulos_financeiros t
   where t.cliente_id = v.cliente_id
     and t.status in ('pendente', 'vencido')
     and t.data_vencimento < current_date
     and (t.veiculo_id = v.id
          or (t.veiculo_id is null and v.tipo_faturamento = 'AGRUPADO_ASSOCIADO'));

  select count(*)::int into v_alert
    from veiculo_alertas al where al.veiculo_id = v.id and al.ativo;

  if v.status <> 'ativo' then
    v_mot := v_mot || format('Veiculo com status %s (necessario ATIVO)', v.status);
  end if;
  if v_venc > 0 then
    v_mot := v_mot || format('%s titulo(s) em atraso — %s', v_venc, to_char(v_valor, 'FM999G999D00'));
  end if;
  if cli.status::text = 'inadimplente' then
    v_mot := v_mot || 'Associado marcado como inadimplente';
  end if;
  if v_alert > 0 then
    v_mot := v_mot || format('%s alerta(s) cadastral(is) ativo(s)', v_alert);
  end if;

  veiculo_id := v.id;
  placa := v.placa;
  cliente_id := v.cliente_id;
  associado := cli.nome_razao_social;
  status_veiculo := v.status;
  veiculo_ativo := (v.status = 'ativo');
  inadimplente := (v_venc > 0 or cli.status::text = 'inadimplente');
  titulos_vencidos := v_venc;
  valor_em_atraso := round(v_valor, 2);
  pendencia_cadastral := (v_alert > 0);
  alertas_ativos := v_alert;
  pode_acionar := (array_length(v_mot, 1) is null);
  motivos := v_mot;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- Abertura do acionamento (com trava + alcada de liberacao)
-- ----------------------------------------------------------------------------
-- Regra: veiculo ATIVO e em dia -> abre direto. Caso contrario (ou limite do
-- opcional esgotado) o acionamento SO e aberto por quem tem alcada
-- (pode_liberar_assistencia) e mediante justificativa — que fica registrada.
create or replace function abrir_acionamento(
  p_veiculo_id  uuid,
  p_servico_id  uuid,
  p_solicitante text default null,
  p_telefone    text default null,
  p_origem      jsonb default '{}'::jsonb,
  p_destino     jsonb default '{}'::jsonb,
  p_km_previsto numeric default null,
  p_observacoes text default null,
  p_liberacao_justificativa text default null,
  p_atendimento_id uuid default null
)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare
  v     veiculos;
  s     servicos_assistencia;
  sit   record;
  eleg  record;
  a     acionamentos_assistencia;
  v_mot text[] := '{}';
begin
  if not pode_assistencia() then raise exception 'Sem permissao para acionar assistencia'; end if;

  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then raise exception 'Veiculo nao encontrado'; end if;
  select * into s from servicos_assistencia where id = p_servico_id;
  if s.id is null or not s.ativo then raise exception 'Servico de assistencia invalido ou inativo'; end if;

  select * into sit from situacao_assistencia_veiculo(p_veiculo_id);
  if not sit.pode_acionar then v_mot := sit.motivos; end if;

  select * into eleg from elegibilidade_assistencia(p_veiculo_id) where servico_id = p_servico_id;
  if eleg.servico_id is not null and not eleg.elegivel then
    v_mot := v_mot || format('Limite do opcional atingido: %s de %s uso(s) em %s meses',
                             eleg.usados, eleg.limite_quantidade, eleg.janela_meses);
  end if;

  -- Bloqueio: exige alcada + justificativa.
  if array_length(v_mot, 1) is not null then
    if p_liberacao_justificativa is null or btrim(p_liberacao_justificativa) = '' then
      raise exception 'BLOQUEADO: % — necessaria liberacao de superior', array_to_string(v_mot, '; ');
    end if;
    if not pode_liberar_assistencia() then
      raise exception 'BLOQUEADO: % — o usuario logado nao tem alcada para liberar', array_to_string(v_mot, '; ');
    end if;
  end if;

  insert into acionamentos_assistencia (
    veiculo_id, cliente_id, servico_id, atendimento_id, status,
    solicitante_nome, solicitante_telefone, origem, destino, km_previsto, observacoes,
    valor_servico, computa_limite, bloqueio_motivos,
    liberado_por, liberado_em, liberacao_justificativa,
    aberto_por, regional_id
  ) values (
    v.id, v.cliente_id, s.id, p_atendimento_id, 'ABERTO',
    p_solicitante, p_telefone, coalesce(p_origem, '{}'::jsonb), coalesce(p_destino, '{}'::jsonb),
    p_km_previsto, p_observacoes,
    s.valor_padrao, s.computa_limite, coalesce(v_mot, '{}'),
    case when array_length(v_mot, 1) is not null then auth.uid() end,
    case when array_length(v_mot, 1) is not null then now() end,
    case when array_length(v_mot, 1) is not null then p_liberacao_justificativa end,
    auth.uid(), coalesce(v.regional_id, (select regional_id from clientes where id = v.cliente_id))
  ) returning * into a;

  return a;
end;
$$;

-- Cotacao com prestadores.
create or replace function registrar_cotacao_assistencia(
  p_acionamento_id uuid,
  p_fornecedor_id  uuid,
  p_valor          numeric,
  p_valor_km       numeric default null,
  p_prazo_min      integer default null,
  p_observacao     text default null
)
returns acionamento_cotacoes
language plpgsql
security definer
set search_path = public
as $$
declare c acionamento_cotacoes;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;

  insert into acionamento_cotacoes (acionamento_id, fornecedor_id, valor, valor_km, prazo_estimado_min, observacao, created_by)
    values (p_acionamento_id, p_fornecedor_id, coalesce(p_valor, 0), p_valor_km, p_prazo_min, p_observacao, auth.uid())
    on conflict (acionamento_id, fornecedor_id) do update
      set valor = excluded.valor, valor_km = excluded.valor_km,
          prazo_estimado_min = excluded.prazo_estimado_min, observacao = excluded.observacao
    returning * into c;

  update acionamentos_assistencia
     set status = 'EM_COTACAO', updated_at = now()
   where id = p_acionamento_id and status = 'ABERTO';

  return c;
end;
$$;

-- Confirma o prestador e GERA A OS (codigo unico + valores fechados).
create or replace function confirmar_prestador_assistencia(
  p_acionamento_id uuid,
  p_fornecedor_id  uuid,
  p_valor_servico  numeric,
  p_km_excedente   numeric default 0,
  p_valor_km       numeric default null,
  p_prazo_min      integer default null
)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare
  a       acionamentos_assistencia;
  s       servicos_assistencia;
  v_data  text;
  v_seq   integer;
  v_km_un numeric;
  v_km_tot numeric;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  if a.status in ('CONCLUIDO', 'CANCELADO') then raise exception 'Acionamento ja finalizado'; end if;
  select * into s from servicos_assistencia where id = a.servico_id;

  v_km_un := coalesce(p_valor_km, (select valor_km from prestador_servicos
                                    where fornecedor_id = p_fornecedor_id and servico_id = a.servico_id),
                      s.valor_km_excedente);
  v_km_tot := case when s.cobra_km_excedente then round(coalesce(p_km_excedente, 0) * coalesce(v_km_un, 0), 2) else 0 end;

  if a.codigo_os is null then
    v_data := to_char(now(), 'YYYYMMDD');
    perform pg_advisory_xact_lock(hashtext('os_assist_' || v_data));
    select coalesce(max((regexp_replace(codigo_os, '^OS-\d{8}-', ''))::integer), 0) + 1
      into v_seq from acionamentos_assistencia where codigo_os like 'OS-' || v_data || '-%';
  end if;

  update acionamentos_assistencia
     set prestador_id = p_fornecedor_id,
         valor_servico = coalesce(p_valor_servico, s.valor_padrao),
         km_excedente = case when s.cobra_km_excedente then coalesce(p_km_excedente, 0) else 0 end,
         valor_km_excedente = v_km_tot,
         valor_total = coalesce(p_valor_servico, s.valor_padrao) + v_km_tot,
         prazo_estimado_min = coalesce(p_prazo_min, prazo_estimado_min),
         codigo_os = coalesce(codigo_os, 'OS-' || v_data || '-' || lpad(v_seq::text, 4, '0')),
         status = 'AUTORIZADO',
         updated_at = now()
   where id = p_acionamento_id
   returning * into a;

  update acionamento_cotacoes set escolhida = (fornecedor_id = p_fornecedor_id)
   where acionamento_id = p_acionamento_id;

  return a;
end;
$$;

-- Conclui a OS e LANCA EM CONTAS A PAGAR (fornecedor + plano de contas).
create or replace function concluir_acionamento(
  p_acionamento_id uuid,
  p_km_percorrido  numeric default null,
  p_observacao     text default null,
  p_vencimento     date default null
)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare
  a   acionamentos_assistencia;
  s   servicos_assistencia;
  l   lancamentos_financeiros;
  v_placa text;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  if a.status = 'CANCELADO' then raise exception 'Acionamento cancelado'; end if;
  if a.prestador_id is null then raise exception 'Confirme o prestador (OS) antes de concluir'; end if;

  select * into s from servicos_assistencia where id = a.servico_id;
  select placa into v_placa from veiculos where id = a.veiculo_id;

  update acionamentos_assistencia
     set status = 'CONCLUIDO',
         km_percorrido = coalesce(p_km_percorrido, km_percorrido),
         observacoes = coalesce(observacoes, '') ||
                       case when p_observacao is null then '' else E'\n' || p_observacao end,
         concluido_em = coalesce(concluido_em, now()),
         updated_at = now()
   where id = p_acionamento_id
   returning * into a;

  -- Contas a pagar (idempotente: nao duplica lancamento).
  if a.lancamento_id is null and a.valor_total > 0 then
    insert into lancamentos_financeiros (
      tipo, fornecedor_id, descricao, categoria_dre_id, regional_id,
      valor_original, data_emissao, data_vencimento, status
    ) values (
      'DESPESA', a.prestador_id,
      format('Assistencia 24h %s — %s (%s)', coalesce(a.codigo_os, a.protocolo), s.descricao, coalesce(v_placa, '')),
      s.categoria_dre_id, a.regional_id,
      a.valor_total, current_date, coalesce(p_vencimento, current_date + 7), 'pendente'
    ) returning * into l;

    update acionamentos_assistencia set lancamento_id = l.id, updated_at = now()
     where id = a.id returning * into a;
  end if;

  return a;
end;
$$;

create or replace function cancelar_acionamento(p_acionamento_id uuid, p_motivo text)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare a acionamentos_assistencia;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;
  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  if a.status = 'CONCLUIDO' then raise exception 'Acionamento ja concluido'; end if;

  update acionamentos_assistencia
     set status = 'CANCELADO', cancelado_motivo = p_motivo, updated_at = now()
   where id = p_acionamento_id
   returning * into a;
  return a;
end;
$$;

-- Marca o envio do voucher/comunicado ao prestador (e-mail/WhatsApp).
create or replace function marcar_voucher_enviado(p_acionamento_id uuid)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare a acionamentos_assistencia;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;
  update acionamentos_assistencia
     set voucher_enviado_em = now(),
         status = case when status = 'AUTORIZADO' then 'EM_ATENDIMENTO'::status_acionamento else status end,
         updated_at = now()
   where id = p_acionamento_id
   returning * into a;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  return a;
end;
$$;

-- Historico de acionamentos do veiculo (ficha do veiculo / SAC).
create or replace function historico_assistencia_veiculo(p_veiculo_id uuid, p_limite int default 50)
returns table (
  id             uuid,
  protocolo      text,
  codigo_os      text,
  servico        text,
  status         status_acionamento,
  prestador      text,
  valor_total    numeric,
  computa_limite boolean,
  criado_em      timestamptz,
  concluido_em   timestamptz
)
language sql stable
as $$
  select a.id, a.protocolo, a.codigo_os, s.descricao, a.status,
         f.razao_social, a.valor_total, a.computa_limite, a.created_at, a.concluido_em
    from acionamentos_assistencia a
    join servicos_assistencia s on s.id = a.servico_id
    left join fornecedores f on f.id = a.prestador_id
   where a.veiculo_id = p_veiculo_id
   order by a.created_at desc
   limit coalesce(p_limite, 50);
$$;

-- Prestadores habilitados para um servico (base da cotacao).
create or replace function prestadores_do_servico(p_servico_id uuid)
returns table (
  fornecedor_id  uuid,
  razao_social   text,
  telefone       text,
  whatsapp       text,
  email          text,
  cobertura      text,
  valor_acordado numeric,
  valor_km       numeric,
  prazo_medio_min integer
)
language sql stable
as $$
  select f.id, f.razao_social, f.telefone, f.whatsapp, f.email, f.cobertura,
         ps.valor_acordado, ps.valor_km, ps.prazo_medio_min
    from prestador_servicos ps
    join fornecedores f on f.id = ps.fornecedor_id
   where ps.servico_id = p_servico_id and ps.ativo and f.ativo
   order by ps.valor_acordado nulls last, f.razao_social;
$$;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table servicos_assistencia      enable row level security;
alter table prestador_servicos        enable row level security;
alter table acionamentos_assistencia  enable row level security;
alter table acionamento_cotacoes      enable row level security;
alter table acionamento_historico     enable row level security;

create policy servicos_assist_select on servicos_assistencia for select to authenticated using (is_staff());
create policy servicos_assist_write  on servicos_assistencia for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

create policy prest_serv_select on prestador_servicos for select to authenticated using (is_staff());
create policy prest_serv_write  on prestador_servicos for all to authenticated
  using (pode_assistencia()) with check (pode_assistencia());

-- Acionamento: staff da regional do veiculo (ou acesso global) e o operador 24h.
create policy acion_select on acionamentos_assistencia for select to authenticated
  using (pode_regional(regional_id) or pode_assistencia());
create policy acion_write on acionamentos_assistencia for all to authenticated
  using (pode_assistencia()) with check (pode_assistencia());

create policy acion_cot_all on acionamento_cotacoes for all to authenticated
  using (pode_assistencia()) with check (pode_assistencia());
create policy acion_hist_select on acionamento_historico for select to authenticated using (is_staff());
create policy acion_hist_insert on acionamento_historico for insert to authenticated with check (is_staff());

-- O atendente 24h precisa cadastrar prestadores e lancar/baixar contas a pagar.
create policy forn_write_assistencia on fornecedores for all to authenticated
  using (pode_assistencia()) with check (pode_assistencia());
create policy lanc_assistencia on lancamentos_financeiros for all to authenticated
  using (pode_assistencia()) with check (pode_assistencia());
create policy baixas_assistencia on baixas_financeiras for all to authenticated
  using (pode_assistencia()) with check (pode_assistencia());

grant select, insert, update, delete on
  servicos_assistencia, prestador_servicos, acionamentos_assistencia,
  acionamento_cotacoes, acionamento_historico to authenticated;

grant execute on function pode_assistencia() to authenticated;
grant execute on function pode_liberar_assistencia() to authenticated;
grant execute on function elegibilidade_assistencia(uuid) to authenticated;
grant execute on function situacao_assistencia_veiculo(uuid) to authenticated;
grant execute on function abrir_acionamento(uuid, uuid, text, text, jsonb, jsonb, numeric, text, text, uuid) to authenticated;
grant execute on function registrar_cotacao_assistencia(uuid, uuid, numeric, numeric, integer, text) to authenticated;
grant execute on function confirmar_prestador_assistencia(uuid, uuid, numeric, numeric, numeric, integer) to authenticated;
grant execute on function concluir_acionamento(uuid, numeric, text, date) to authenticated;
grant execute on function cancelar_acionamento(uuid, text) to authenticated;
grant execute on function marcar_voucher_enviado(uuid) to authenticated;
grant execute on function historico_assistencia_veiculo(uuid, int) to authenticated;
grant execute on function prestadores_do_servico(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Seed dos servicos classicos (idempotente; valores/planos ajustaveis na tela)
-- ----------------------------------------------------------------------------
insert into servicos_assistencia (descricao, valor_padrao, cobra_km_excedente, valor_km_excedente, km_franquia, computa_limite, limite_quantidade, limite_janela_meses, ordem)
values
  ('Reboque Passeio',   250.00, true,  4.50, 100, true,  2, 12, 1),
  ('Reboque Utilitario',400.00, true,  6.00, 100, true,  2, 12, 2),
  ('Chaveiro',          180.00, false, 0,    0,   true,  1, 12, 3),
  ('Auxilio Mecanico',  150.00, false, 0,    0,   true,  2, 12, 4),
  ('Troca de Pneu',     120.00, false, 0,    0,   true,  2, 12, 5),
  ('Pane Seca',         120.00, false, 0,    0,   true,  2, 12, 6),
  ('Carga de Bateria',  120.00, false, 0,    0,   true,  2, 12, 7),
  ('Carro Reserva',     0.00,   false, 0,    0,   true,  1, 12, 8),
  ('Transporte / Taxi', 80.00,  false, 0,    0,   false, 1, 12, 9)
on conflict (descricao) do nothing;

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0027_assistencia_centro_custo.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- SCar :: 0027_assistencia_centro_custo.sql
-- REFINO FINANCEIRO/OPERACIONAL DA ASSISTENCIA 24H:
--   A) CENTRO DE CUSTO: centro "Assistencia 24 Horas" (custo operacional direto)
--      criado no seed e aplicado OBRIGATORIAMENTE a todo lancamento gerado pelo
--      modulo. Prestadores seguem no cadastro unico de `fornecedores` e o
--      pagamento continua no fluxo padrao de Contas a Pagar (nada isolado).
--   B) EDICAO DINAMICA DA OS: `atualizar_acionamento` (valor, KM, destino,
--      prazo, observacoes), `trocar_prestador_acionamento` (com cancelamento do
--      lancamento anterior e criacao do novo) e cancelamento com justificativa
--      OBRIGATORIA.
--   C) SINCRONIA COM CONTAS A PAGAR: `sincronizar_lancamento_acionamento`
--      recalcula/atualiza o titulo enquanto ele nao foi pago; se ja houve baixa,
--      nao mexe no pago e registra a divergencia na auditoria.
--   D) AUDITORIA: `acionamento_edicoes` (campo, de, para, quem, quando, motivo)
--      alimentada por trigger — pega ate alteracao feita fora das funcoes.
--   E) RELATORIOS: `gerar_dre`/`gerar_dre_resumo` ganham filtro por CENTRO DE
--      CUSTO e passam a considerar as baixas de Contas a Pagar/Receber; novo
--      `resumo_por_centro_custo` (receitas x despesas por centro).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) Centro de custo da operacao 24h
-- ----------------------------------------------------------------------------
create unique index if not exists uq_centros_custo_codigo on centros_custo (codigo) where codigo is not null;

insert into centros_custo (nome, codigo, ativo)
  select 'Assistencia 24 Horas', 'ASSIST24', true
   where not exists (select 1 from centros_custo where codigo = 'ASSIST24');

-- Resolve (e cria, se faltar) o centro de custo do modulo.
create or replace function centro_custo_assistencia()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id from centros_custo where codigo = 'ASSIST24';
  if v_id is null then
    insert into centros_custo (nome, codigo, ativo)
      values ('Assistencia 24 Horas', 'ASSIST24', true)
      returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Lancamentos ja existentes do modulo passam a apontar para o centro de custo.
update lancamentos_financeiros l
   set centro_custo_id = centro_custo_assistencia()
  from acionamentos_assistencia a
 where a.lancamento_id = l.id and l.centro_custo_id is null;

-- ----------------------------------------------------------------------------
-- D) Auditoria das edicoes da OS
-- ----------------------------------------------------------------------------
create table if not exists acionamento_edicoes (
  id             uuid primary key default gen_random_uuid(),
  acionamento_id uuid not null references acionamentos_assistencia(id) on delete cascade,
  campo          text not null,
  valor_anterior text,
  valor_novo     text,
  motivo         text,
  usuario_id     uuid references usuarios(id) on delete set null,
  -- clock_timestamp (e nao now()) para que duas edicoes na MESMA transacao
  -- fiquem em ordem cronologica correta no historico.
  created_at     timestamptz not null default clock_timestamp()
);
create index if not exists idx_acion_edicoes on acionamento_edicoes (acionamento_id, created_at desc);

-- Registra automaticamente o que mudou (data/hora, operador, de -> para).
-- O motivo vem da variavel de sessao `scar.motivo_edicao`, setada pelas funcoes
-- de edicao; alteracoes diretas ficam sem motivo, mas continuam auditadas.
create or replace function fn_acionamento_auditoria()
returns trigger
language plpgsql
as $$
declare
  v_motivo text := nullif(current_setting('scar.motivo_edicao', true), '');
  v_uid    uuid := auth.uid();
begin
  if new.prestador_id is distinct from old.prestador_id then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'prestador',
              (select razao_social from fornecedores where id = old.prestador_id),
              (select razao_social from fornecedores where id = new.prestador_id),
              v_motivo, v_uid);
  end if;
  if new.valor_servico is distinct from old.valor_servico then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'valor_servico', old.valor_servico::text, new.valor_servico::text, v_motivo, v_uid);
  end if;
  if new.km_excedente is distinct from old.km_excedente then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'km_excedente', old.km_excedente::text, new.km_excedente::text, v_motivo, v_uid);
  end if;
  if new.valor_km_excedente is distinct from old.valor_km_excedente then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'valor_km_excedente', old.valor_km_excedente::text, new.valor_km_excedente::text, v_motivo, v_uid);
  end if;
  if new.valor_total is distinct from old.valor_total then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'valor_total', old.valor_total::text, new.valor_total::text, v_motivo, v_uid);
  end if;
  if new.destino is distinct from old.destino then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'destino', old.destino::text, new.destino::text, v_motivo, v_uid);
  end if;
  if new.km_percorrido is distinct from old.km_percorrido then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'km_percorrido', old.km_percorrido::text, new.km_percorrido::text, v_motivo, v_uid);
  end if;
  if new.prazo_estimado_min is distinct from old.prazo_estimado_min then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'prazo_estimado_min', old.prazo_estimado_min::text, new.prazo_estimado_min::text, v_motivo, v_uid);
  end if;
  if new.status is distinct from old.status then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'status', old.status::text, new.status::text,
              coalesce(v_motivo, new.cancelado_motivo), v_uid);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_acionamento_auditoria on acionamentos_assistencia;
create trigger trg_acionamento_auditoria
  after update on acionamentos_assistencia
  for each row execute function fn_acionamento_auditoria();

alter table acionamento_edicoes enable row level security;
create policy acion_edicoes_select on acionamento_edicoes for select to authenticated using (is_staff());
create policy acion_edicoes_insert on acionamento_edicoes for insert to authenticated with check (is_staff());
grant select, insert on acionamento_edicoes to authenticated;

-- ----------------------------------------------------------------------------
-- C) Sincronia OS -> Contas a Pagar
-- ----------------------------------------------------------------------------
-- Regras:
--   * OS sem lancamento e ja concluida  -> cria o lancamento;
--   * lancamento existente NAO pago     -> atualiza fornecedor/valor/descricao/
--     plano de contas/centro de custo;
--   * lancamento com baixa (pago total ou parcial) -> NAO altera; registra a
--     divergencia na auditoria para tratamento manual (estorno/complemento);
--   * OS cancelada                      -> cancela o lancamento nao pago.
create or replace function sincronizar_lancamento_acionamento(p_acionamento_id uuid)
returns lancamentos_financeiros
language plpgsql
security definer
set search_path = public
as $$
declare
  a       acionamentos_assistencia;
  s       servicos_assistencia;
  l       lancamentos_financeiros;
  v_placa text;
  v_desc  text;
  v_cc    uuid := centro_custo_assistencia();
begin
  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  select * into s from servicos_assistencia where id = a.servico_id;
  select placa into v_placa from veiculos where id = a.veiculo_id;

  v_desc := format('Assistencia 24h %s — %s (%s)',
                   coalesce(a.codigo_os, a.protocolo), s.descricao, coalesce(v_placa, ''));

  if a.lancamento_id is not null then
    select * into l from lancamentos_financeiros where id = a.lancamento_id;
  end if;

  -- OS cancelada: cancela o lancamento em aberto e desvincula.
  if a.status = 'CANCELADO' then
    if l.id is not null and l.status in ('pendente', 'atrasado') then
      update lancamentos_financeiros set status = 'cancelado', updated_at = now()
       where id = l.id returning * into l;
    elsif l.id is not null then
      insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
        values (a.id, 'contas_a_pagar', l.status::text, l.status::text,
                'OS cancelada, mas o lancamento ja tinha baixa — tratar estorno manualmente', auth.uid());
    end if;
    return l;
  end if;

  -- Ainda sem lancamento: so cria quando a OS esta concluida e tem valor.
  if l.id is null then
    if a.status = 'CONCLUIDO' and a.valor_total > 0 and a.prestador_id is not null then
      insert into lancamentos_financeiros (
        tipo, fornecedor_id, descricao, categoria_dre_id, centro_custo_id, regional_id,
        valor_original, data_emissao, data_vencimento, status
      ) values (
        'DESPESA', a.prestador_id, v_desc, s.categoria_dre_id, v_cc, a.regional_id,
        a.valor_total, current_date, current_date + 7, 'pendente'
      ) returning * into l;
      update acionamentos_assistencia set lancamento_id = l.id, updated_at = now() where id = a.id;
    end if;
    return l;
  end if;

  -- Lancamento ja pago (total ou parcial): nao mexe, apenas audita a divergencia.
  if l.status in ('quitado', 'pago_parcial') then
    if l.valor_original <> a.valor_total or l.fornecedor_id is distinct from a.prestador_id then
      insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
        values (a.id, 'contas_a_pagar', l.valor_original::text, a.valor_total::text,
                'Lancamento ja possui baixa — ajuste financeiro deve ser feito manualmente', auth.uid());
    end if;
    return l;
  end if;

  -- Em aberto: sincroniza tudo.
  update lancamentos_financeiros
     set fornecedor_id    = a.prestador_id,
         descricao        = v_desc,
         categoria_dre_id = s.categoria_dre_id,
         centro_custo_id  = v_cc,
         regional_id      = a.regional_id,
         valor_original   = a.valor_total,
         status           = case when status = 'cancelado' then 'pendente'::status_lancamento else status end,
         updated_at       = now()
   where id = l.id
   returning * into l;

  return l;
end;
$$;

-- ----------------------------------------------------------------------------
-- B) Edicao dinamica da OS
-- ----------------------------------------------------------------------------
-- Valores, trajeto e KM. Null = mantem o valor atual. Recalcula o total e
-- sincroniza o Contas a Pagar.
create or replace function atualizar_acionamento(
  p_acionamento_id uuid,
  p_valor_servico  numeric default null,
  p_km_excedente   numeric default null,
  p_valor_km       numeric default null,
  p_km_percorrido  numeric default null,
  p_destino        jsonb   default null,
  p_prazo_min      integer default null,
  p_observacoes    text    default null,
  p_motivo         text    default null
)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare
  a        acionamentos_assistencia;
  s        servicos_assistencia;
  v_valor  numeric;
  v_km     numeric;
  v_km_un  numeric;
  v_km_tot numeric;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  if a.status = 'CANCELADO' then raise exception 'Acionamento cancelado nao pode ser editado'; end if;
  select * into s from servicos_assistencia where id = a.servico_id;

  perform set_config('scar.motivo_edicao', coalesce(p_motivo, ''), true);

  v_valor := coalesce(p_valor_servico, a.valor_servico);
  v_km    := case when s.cobra_km_excedente then coalesce(p_km_excedente, a.km_excedente) else 0 end;
  v_km_un := coalesce(
    p_valor_km,
    case when a.km_excedente > 0 then a.valor_km_excedente / nullif(a.km_excedente, 0) end,
    (select valor_km from prestador_servicos
      where fornecedor_id = a.prestador_id and servico_id = a.servico_id),
    s.valor_km_excedente
  );
  v_km_tot := round(v_km * coalesce(v_km_un, 0), 2);

  update acionamentos_assistencia
     set valor_servico      = v_valor,
         km_excedente       = v_km,
         valor_km_excedente = v_km_tot,
         valor_total        = round(v_valor + v_km_tot, 2),
         km_percorrido      = coalesce(p_km_percorrido, km_percorrido),
         destino            = coalesce(p_destino, destino),
         prazo_estimado_min = coalesce(p_prazo_min, prazo_estimado_min),
         observacoes        = coalesce(p_observacoes, observacoes),
         updated_at         = now()
   where id = p_acionamento_id
   returning * into a;

  perform sincronizar_lancamento_acionamento(a.id);
  perform set_config('scar.motivo_edicao', '', true);
  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  return a;
end;
$$;

-- Troca de prestador (desistencia/demora): cancela o lancamento anterior em
-- aberto e gera o novo para o substituto. Justificativa obrigatoria.
create or replace function trocar_prestador_acionamento(
  p_acionamento_id uuid,
  p_fornecedor_id  uuid,
  p_motivo         text,
  p_valor_servico  numeric default null,
  p_valor_km       numeric default null,
  p_prazo_min      integer default null
)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare
  a        acionamentos_assistencia;
  s        servicos_assistencia;
  l        lancamentos_financeiros;
  v_valor  numeric;
  v_km_un  numeric;
  v_km_tot numeric;
  v_anterior uuid;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Informe a justificativa da troca de prestador';
  end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  if a.status = 'CANCELADO' then raise exception 'Acionamento cancelado'; end if;
  if p_fornecedor_id is null then raise exception 'Informe o novo prestador'; end if;
  select * into s from servicos_assistencia where id = a.servico_id;

  v_anterior := a.prestador_id;
  perform set_config('scar.motivo_edicao', p_motivo, true);

  v_valor := coalesce(
    p_valor_servico,
    (select valor_acordado from prestador_servicos
      where fornecedor_id = p_fornecedor_id and servico_id = a.servico_id),
    s.valor_padrao
  );
  v_km_un := coalesce(
    p_valor_km,
    (select valor_km from prestador_servicos
      where fornecedor_id = p_fornecedor_id and servico_id = a.servico_id),
    s.valor_km_excedente
  );
  v_km_tot := case when s.cobra_km_excedente then round(a.km_excedente * coalesce(v_km_un, 0), 2) else 0 end;

  -- Lancamento do prestador anterior: cancela se ainda estiver em aberto.
  if a.lancamento_id is not null then
    select * into l from lancamentos_financeiros where id = a.lancamento_id;
    if l.id is not null and l.status in ('pendente', 'atrasado') then
      update lancamentos_financeiros set status = 'cancelado', updated_at = now() where id = l.id;
      insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
        values (a.id, 'contas_a_pagar', 'lancamento cancelado (prestador anterior)', 'novo lancamento sera gerado',
                p_motivo, auth.uid());
      update acionamentos_assistencia set lancamento_id = null where id = a.id;
    else
      -- Ja pago: mantem o lancamento anterior e registra para conferencia.
      insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
        values (a.id, 'contas_a_pagar', 'lancamento anterior com baixa', 'novo lancamento sera gerado ao concluir',
                'Troca de prestador com pagamento ja realizado — conferir estorno', auth.uid());
      update acionamentos_assistencia set lancamento_id = null where id = a.id;
    end if;
  end if;

  update acionamentos_assistencia
     set prestador_id       = p_fornecedor_id,
         valor_servico      = v_valor,
         valor_km_excedente = v_km_tot,
         valor_total        = round(v_valor + v_km_tot, 2),
         prazo_estimado_min = coalesce(p_prazo_min, prazo_estimado_min),
         status             = case when status = 'CONCLUIDO' then status else 'AUTORIZADO'::status_acionamento end,
         voucher_enviado_em = null,   -- o novo prestador precisa receber o voucher
         updated_at         = now()
   where id = p_acionamento_id
   returning * into a;

  update acionamento_cotacoes set escolhida = (fornecedor_id = p_fornecedor_id)
   where acionamento_id = p_acionamento_id;

  perform sincronizar_lancamento_acionamento(a.id);
  perform set_config('scar.motivo_edicao', '', true);
  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  return a;
end;
$$;

-- Cancelamento com justificativa OBRIGATORIA (associado ou prestador desistiu).
create or replace function cancelar_acionamento(p_acionamento_id uuid, p_motivo text)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare a acionamentos_assistencia;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Informe a justificativa do cancelamento';
  end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  if a.status = 'CANCELADO' then return a; end if;

  perform set_config('scar.motivo_edicao', p_motivo, true);
  update acionamentos_assistencia
     set status = 'CANCELADO', cancelado_motivo = p_motivo, updated_at = now()
   where id = p_acionamento_id
   returning * into a;

  perform sincronizar_lancamento_acionamento(a.id);
  perform set_config('scar.motivo_edicao', '', true);
  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  return a;
end;
$$;

-- Conclusao passa a delegar a criacao do lancamento para o sincronizador
-- (garante centro de custo e evita duplicidade).
create or replace function concluir_acionamento(
  p_acionamento_id uuid,
  p_km_percorrido  numeric default null,
  p_observacao     text default null,
  p_vencimento     date default null
)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare
  a acionamentos_assistencia;
  l lancamentos_financeiros;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  if a.status = 'CANCELADO' then raise exception 'Acionamento cancelado'; end if;
  if a.prestador_id is null then raise exception 'Confirme o prestador (OS) antes de concluir'; end if;

  update acionamentos_assistencia
     set status = 'CONCLUIDO',
         km_percorrido = coalesce(p_km_percorrido, km_percorrido),
         observacoes = coalesce(observacoes, '') ||
                       case when p_observacao is null then '' else E'\n' || p_observacao end,
         concluido_em = coalesce(concluido_em, now()),
         updated_at = now()
   where id = p_acionamento_id
   returning * into a;

  l := sincronizar_lancamento_acionamento(a.id);
  if l.id is not null and p_vencimento is not null and l.status in ('pendente', 'atrasado') then
    update lancamentos_financeiros set data_vencimento = p_vencimento, updated_at = now() where id = l.id;
  end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  return a;
end;
$$;

-- Historico de edicoes da OS (auditoria para a tela).
create or replace function historico_edicoes_acionamento(p_acionamento_id uuid)
returns table (
  id             uuid,
  campo          text,
  valor_anterior text,
  valor_novo     text,
  motivo         text,
  operador       text,
  created_at     timestamptz
)
language sql stable
as $$
  select e.id, e.campo, e.valor_anterior, e.valor_novo, e.motivo,
         coalesce(u.nome, 'sistema'), e.created_at
    from acionamento_edicoes e
    left join usuarios u on u.id = e.usuario_id
   where e.acionamento_id = p_acionamento_id
   order by e.created_at desc;
$$;

-- ----------------------------------------------------------------------------
-- E) Relatorios: filtro por centro de custo
-- ----------------------------------------------------------------------------
-- Nova versao do DRE: alem das fontes originais (caixa, titulos pagos e notas
-- de evento), passa a considerar as BAIXAS de Contas a Pagar/Receber — que e
-- onde a despesa da Assistencia 24h aparece — e aceita filtro por centro de
-- custo. A versao de 3 argumentos delega para esta (sem filtro de centro).
create or replace function gerar_dre(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid,
  p_centro_custo_id uuid
)
returns table (
  grupo              tipo_categoria_dre,
  categoria_codigo   text,
  categoria_nome     text,
  total              numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    -- Movimentacoes de caixa classificadas por categoria DRE
    select cat.tipo as grupo, cat.codigo_estruturado as categoria_codigo, cat.nome as categoria_nome,
           case when m.tipo = 'RECEITA' then m.valor else -m.valor end as valor
      from movimentacoes_caixa m
      join categorias_dre cat on cat.id = m.categoria_dre_id
     where m.data_competencia between p_data_inicio and p_data_fim
       and m.status <> 'cancelado'
       and (p_regional_id is null or m.regional_id = p_regional_id)
       and p_centro_custo_id is null   -- caixa nao tem centro de custo

    union all

    -- Receita recorrente reconhecida por titulos pagos (sem lancamento no caixa)
    select 'RECEITA'::tipo_categoria_dre, '1.1.00', 'Receita de Mensalidades (Titulos)', t.valor_pago
      from titulos_financeiros t
      join veiculos v on v.id = t.veiculo_id
     where t.status = 'pago'
       and t.data_pagamento between p_data_inicio and p_data_fim
       and not exists (select 1 from movimentacoes_caixa mc where mc.titulo_id = t.id)
       and (p_regional_id is null or v.regional_id = p_regional_id)
       and p_centro_custo_id is null

    union all

    -- Custo de sinistro: notas fiscais de eventos (custo variavel)
    select 'CUSTO_VARIAVEL'::tipo_categoria_dre, '3.1.00', 'Custo com Sinistros (Notas Fiscais)', -nf.valor_nota
      from notas_fiscais_evento nf
      join eventos_sinistro e on e.id = nf.evento_id
     where nf.data_emissao between p_data_inicio and p_data_fim
       and (p_regional_id is null or e.regional_id = p_regional_id)
       and p_centro_custo_id is null

    union all

    -- Contas a pagar/receber liquidadas (regime de caixa), por centro de custo.
    -- E aqui que entra a despesa da Assistencia 24h (centro ASSIST24).
    select coalesce(cat.tipo::text, case when l.tipo = 'RECEITA' then 'RECEITA' else 'DESPESA_FIXA' end)::tipo_categoria_dre,
           coalesce(cat.codigo_estruturado, case when l.tipo = 'RECEITA' then '1.9.00' else '4.9.00' end),
           coalesce(cat.nome, case when l.tipo = 'RECEITA' then 'Outras Receitas' else 'Outras Despesas' end),
           case when l.tipo = 'RECEITA' then b.valor_liquido else -b.valor_liquido end
      from baixas_financeiras b
      join lancamentos_financeiros l on l.id = b.lancamento_id
      left join categorias_dre cat on cat.id = l.categoria_dre_id
     where b.data_pagamento between p_data_inicio and p_data_fim
       and l.status <> 'cancelado'
       and (p_regional_id is null or l.regional_id = p_regional_id)
       and (p_centro_custo_id is null or l.centro_custo_id = p_centro_custo_id)
  )
  select grupo, categoria_codigo, categoria_nome, round(sum(valor), 2) as total
    from base
   group by grupo, categoria_codigo, categoria_nome
   order by grupo, categoria_codigo;
$$;

create or replace function gerar_dre(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null
)
returns table (
  grupo              tipo_categoria_dre,
  categoria_codigo   text,
  categoria_nome     text,
  total              numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select * from gerar_dre(p_data_inicio, p_data_fim, p_regional_id, null::uuid);
$$;

create or replace function gerar_dre_resumo(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid,
  p_centro_custo_id uuid
)
returns table (
  receita_bruta     numeric,
  custo_variavel    numeric,
  despesa_fixa      numeric,
  resultado_liquido numeric,
  margem_percentual numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with d as (
    select grupo, total from gerar_dre(p_data_inicio, p_data_fim, p_regional_id, p_centro_custo_id)
  ),
  agg as (
    select
      coalesce(sum(total) filter (where grupo = 'RECEITA'), 0)        as receita,
      coalesce(sum(total) filter (where grupo = 'CUSTO_VARIAVEL'), 0) as custo,
      coalesce(sum(total) filter (where grupo = 'DESPESA_FIXA'), 0)   as despesa
    from d
  )
  select receita, custo, despesa,
         receita + custo + despesa,
         case when receita > 0 then round((receita + custo + despesa) / receita * 100, 2) else 0 end
    from agg;
$$;

-- Receitas x Despesas por CENTRO DE CUSTO (isola a operacao 24h).
create or replace function resumo_por_centro_custo(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null
)
returns table (
  centro_custo_id uuid,
  centro_custo    text,
  codigo          text,
  receitas        numeric,
  despesas        numeric,
  resultado       numeric,
  lancamentos     integer
)
language sql
stable
security definer
set search_path = public
as $$
  select cc.id,
         coalesce(cc.nome, 'Sem centro de custo'),
         cc.codigo,
         round(coalesce(sum(b.valor_liquido) filter (where l.tipo = 'RECEITA'), 0), 2),
         round(coalesce(sum(b.valor_liquido) filter (where l.tipo = 'DESPESA'), 0), 2),
         round(
           coalesce(sum(b.valor_liquido) filter (where l.tipo = 'RECEITA'), 0)
           - coalesce(sum(b.valor_liquido) filter (where l.tipo = 'DESPESA'), 0), 2),
         count(*)::int
    from baixas_financeiras b
    join lancamentos_financeiros l on l.id = b.lancamento_id
    left join centros_custo cc on cc.id = l.centro_custo_id
   where b.data_pagamento between p_data_inicio and p_data_fim
     and l.status <> 'cancelado'
     and (p_regional_id is null or l.regional_id = p_regional_id)
   group by cc.id, cc.nome, cc.codigo
   order by 6 desc;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
grant execute on function centro_custo_assistencia() to authenticated;
grant execute on function sincronizar_lancamento_acionamento(uuid) to authenticated;
grant execute on function atualizar_acionamento(uuid, numeric, numeric, numeric, numeric, jsonb, integer, text, text) to authenticated;
grant execute on function trocar_prestador_acionamento(uuid, uuid, text, numeric, numeric, integer) to authenticated;
grant execute on function historico_edicoes_acionamento(uuid) to authenticated;
grant execute on function gerar_dre(date, date, uuid, uuid) to authenticated;
grant execute on function gerar_dre_resumo(date, date, uuid, uuid) to authenticated;
grant execute on function resumo_por_centro_custo(date, date, uuid) to authenticated;
