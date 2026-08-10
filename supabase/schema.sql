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

