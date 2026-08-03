-- ============================================================================
-- SCar :: schema.sql (consolidado)
-- Todas as migrations em um unico arquivo, para colar no Supabase SQL Editor.
-- Ordem: schema -> functions/triggers -> RLS -> seed.
-- ============================================================================


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

