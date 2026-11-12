-- ============================================================================
-- SCar :: 0025_comissoes_gestao.sql
-- GESTAO DE COMISSOES PELA MATRIZ (recorrencia por regional/consultor).
--
-- Regras de negocio (combinadas com a diretoria):
--   * A primeira comissao no SCar e a de NOVEMBRO/2026. Nada antes disso.
--   * NAO se paga ADESAO: a comissao ja nasce como RECORRENCIA. Isso evita a
--     confusao de "primeira parcela = adesao" do trigger antigo (0002).
--   * Competencia da comissao = mes de VENCIMENTO do boleto; base = valor
--     efetivamente RECEBIDO (so boleto pago gera comissao). Assim o painel
--     "emitidos x recebidos" bate exatamente com a base de comissao.
--   * Taxas seguem os CADASTROS: vendedores.taxa_comissao_recorrente (consultor)
--     e regionais.taxa_comissao_recorrente (override da regional/franquia sobre
--     a carteira dela). Cada boleto gera ate 2 linhas: VENDEDOR e REGIONAL.
--   * Boleto agrupado (fatura AGRUPADO_ASSOCIADO, titulo sem veiculo_id) e
--     rateado pelos itens da fatura: cada veiculo comissiona o SEU consultor.
--   * O contas a pagar e gerado pelo FINANCEIRO na data escolhida (manual).
--     Fica pronta (desligada) a geracao automatica para agendar via pg_cron.
--
-- Historico imutavel: linha ja enviada ao contas a pagar (lancamento_id) nunca
-- e recalculada. Cancelar o lancamento devolve as linhas para "pendente".
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Cadastros: taxa de comissao da REGIONAL
-- ----------------------------------------------------------------------------
alter table regionais
  add column if not exists taxa_comissao_adesao     numeric(6,4) not null default 0,  -- reservado (adesao nao e paga hoje)
  add column if not exists taxa_comissao_recorrente numeric(6,4) not null default 0,  -- 0.0200 = 2% da carteira recebida
  add column if not exists comissao_ativa           boolean      not null default true;

-- ----------------------------------------------------------------------------
-- (B) Parametros da politica de comissao (linha unica)
-- ----------------------------------------------------------------------------
create table if not exists comissoes_config (
  id                      boolean primary key default true check (id),
  competencia_inicial     date    not null default date '2026-11-01',
  pagar_adesao            boolean not null default false,   -- politica atual: nao paga adesao
  exigir_vendedor_ativo   boolean not null default true,    -- consultor inativo nao recebe recorrencia
  dia_vencimento_padrao   integer not null default 10 check (dia_vencimento_padrao between 1 and 28),
  categoria_dre_id        uuid references categorias_dre(id) on delete set null,
  -- automacao (pronta, DESLIGADA): ver gerar_contas_pagar_comissoes_automatico()
  geracao_automatica      boolean not null default false,
  dia_geracao_automatica  integer not null default 5 check (dia_geracao_automatica between 1 and 28),
  updated_at              timestamptz not null default now()
);

insert into comissoes_config (id, categoria_dre_id)
  select true, (select id from categorias_dre where codigo_estruturado = '3.2.01')
  on conflict (id) do nothing;

create trigger trg_comissoes_config_updated before update on comissoes_config
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- (C) Lotes de geracao do contas a pagar (auditoria de quem gerou e quando)
-- ----------------------------------------------------------------------------
create table if not exists comissoes_lotes (
  id               uuid primary key default gen_random_uuid(),
  competencia      date not null,
  regional_id      uuid references regionais(id) on delete set null,   -- null = todas
  data_vencimento  date not null,
  qtd_lancamentos  integer not null default 0,
  qtd_itens        integer not null default 0,
  valor_total      numeric(12,2) not null default 0,
  origem           text not null default 'MANUAL' check (origem in ('MANUAL', 'AUTOMATICA')),
  created_by       uuid references usuarios(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists idx_comissoes_lotes_comp on comissoes_lotes (competencia desc);

-- ----------------------------------------------------------------------------
-- (D) Ledger de comissoes: comissoes_vendas evolui
-- ----------------------------------------------------------------------------
alter table comissoes_vendas
  add column if not exists beneficiario   text not null default 'VENDEDOR',
  add column if not exists regional_id    uuid references regionais(id) on delete set null,
  add column if not exists competencia    date,
  add column if not exists base_calculo   numeric(12,2) not null default 0,
  add column if not exists taxa           numeric(6,4)  not null default 0,
  add column if not exists lancamento_id  uuid references lancamentos_financeiros(id) on delete set null,
  add column if not exists lote_id        uuid references comissoes_lotes(id) on delete set null,
  add column if not exists data_pagamento date;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_comissao_beneficiario') then
    alter table comissoes_vendas
      add constraint chk_comissao_beneficiario check (beneficiario in ('VENDEDOR', 'REGIONAL'));
  end if;
end $$;

-- a linha REGIONAL pode nao ter consultor (boleto de veiculo sem vendedor)
alter table comissoes_vendas alter column vendedor_id drop not null;

-- 1 titulo pode gerar varias linhas (rateio por veiculo x beneficiario)
alter table comissoes_vendas drop constraint if exists comissoes_vendas_titulo_id_key;
create unique index if not exists uq_comissao_titulo_veiculo_benef
  on comissoes_vendas (titulo_id, coalesce(veiculo_id, '00000000-0000-0000-0000-000000000000'::uuid), beneficiario);

create index if not exists idx_comissoes_competencia on comissoes_vendas (competencia, regional_id);
create index if not exists idx_comissoes_lancamento  on comissoes_vendas (lancamento_id);
create index if not exists idx_faturas_titulo        on faturas (titulo_id);

-- backfill das linhas antigas (geradas pelo trigger de 0002)
update comissoes_vendas c
   set competencia  = date_trunc('month', t.data_vencimento)::date,
       base_calculo = coalesce(t.valor_pago, t.valor),
       regional_id  = coalesce(c.regional_id, ve.regional_id, cl.regional_id)
  from titulos_financeiros t
  left join veiculos ve on ve.id = t.veiculo_id
  left join clientes cl on cl.id = t.cliente_id
 where t.id = c.titulo_id and c.competencia is null;

-- ============================================================================
-- (E) MOTOR
-- ============================================================================

-- Base de boletos por veiculo (rateio de fatura agrupada). SECURITY INVOKER:
-- chamada direta respeita a RLS; dentro das RPCs DEFINER roda como o dono.
create or replace function comissao_base_boletos(
  p_inicio    date,
  p_fim       date,
  p_titulo_id uuid default null
)
returns table (
  titulo_id      uuid,
  veiculo_id     uuid,
  vendedor_id    uuid,
  regional_id    uuid,
  competencia    date,
  valor_emitido  numeric,
  valor_recebido numeric,
  pago           boolean
)
language sql stable
set search_path = public
as $$
  with t as (
    select * from titulos_financeiros
     where data_vencimento between p_inicio and p_fim
       and status <> 'cancelado'
       and (p_titulo_id is null or id = p_titulo_id)
  ),
  partes as (
    -- titulo do proprio veiculo
    select t.id as tid, t.veiculo_id as vid, 1::numeric as frac from t where t.veiculo_id is not null
    union all
    -- titulo de fatura agrupada: rateia pelo valor de cada item
    select t.id, fi.veiculo_id,
           case when coalesce(f.valor_total, 0) > 0 then fi.valor / f.valor_total
                else 1::numeric / count(*) over (partition by t.id) end
      from t
      join faturas f       on f.titulo_id = t.id
      join fatura_itens fi on fi.fatura_id = f.id
     where t.veiculo_id is null
    union all
    -- titulo sem veiculo e sem fatura: fica inteiro, sem consultor
    select t.id, null::uuid, 1::numeric
      from t
     where t.veiculo_id is null
       and not exists (select 1 from faturas f where f.titulo_id = t.id)
  )
  select t.id,
         p.vid,
         ve.vendedor_id,
         coalesce(ve.regional_id, cl.regional_id),
         date_trunc('month', t.data_vencimento)::date,
         round(t.valor * p.frac, 2),
         case when t.status = 'pago' then round(coalesce(t.valor_pago, t.valor) * p.frac, 2) else 0 end,
         t.status = 'pago'
    from t
    join partes p         on p.tid = t.id
    left join veiculos ve on ve.id = p.vid
    left join clientes cl on cl.id = t.cliente_id;
$$;

-- Grava (idempotente) as linhas de comissao dos boletos PAGOS do intervalo.
-- Interna: sem checagem de papel (usada por trigger, apuracao e automacao).
create or replace function _comissao_gerar_itens(
  p_inicio    date,
  p_fim       date,
  p_regional  uuid default null,
  p_titulo_id uuid default null
)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  cfg comissoes_config;
  v_ini date;
  n1 integer := 0;
  n2 integer := 0;
begin
  select * into cfg from comissoes_config where id;
  v_ini := greatest(p_inicio, coalesce(cfg.competencia_inicial, date '2026-11-01'));
  if v_ini > p_fim then return 0; end if;

  -- 1) consultor (taxa do cadastro do vendedor)
  insert into comissoes_vendas (
    beneficiario, vendedor_id, regional_id, veiculo_id, titulo_id, competencia,
    base_calculo, taxa, valor_comissao, is_adesao, status_pagamento
  )
  select 'VENDEDOR', b.vendedor_id, b.regional_id, b.veiculo_id, b.titulo_id, b.competencia,
         b.valor_recebido, v.taxa_comissao_recorrente,
         round(b.valor_recebido * v.taxa_comissao_recorrente, 2), false, 'pendente'
    from comissao_base_boletos(v_ini, p_fim, p_titulo_id) b
    join vendedores v on v.id = b.vendedor_id
   where b.pago
     and b.valor_recebido > 0
     and v.taxa_comissao_recorrente > 0
     and (v.ativo or not coalesce(cfg.exigir_vendedor_ativo, true))
     and (p_regional is null or b.regional_id = p_regional)
  on conflict do nothing;
  get diagnostics n1 = row_count;

  -- 2) regional/franquia (taxa do cadastro da regional)
  insert into comissoes_vendas (
    beneficiario, vendedor_id, regional_id, veiculo_id, titulo_id, competencia,
    base_calculo, taxa, valor_comissao, is_adesao, status_pagamento
  )
  select 'REGIONAL', b.vendedor_id, b.regional_id, b.veiculo_id, b.titulo_id, b.competencia,
         b.valor_recebido, r.taxa_comissao_recorrente,
         round(b.valor_recebido * r.taxa_comissao_recorrente, 2), false, 'pendente'
    from comissao_base_boletos(v_ini, p_fim, p_titulo_id) b
    join regionais r on r.id = b.regional_id
   where b.pago
     and b.valor_recebido > 0
     and r.comissao_ativa
     and r.taxa_comissao_recorrente > 0
     and (p_regional is null or b.regional_id = p_regional)
  on conflict do nothing;
  get diagnostics n2 = row_count;

  return n1 + n2;
end;
$$;

-- Trigger NOVO (substitui a logica de adesao do 0002):
--   * boleto -> pago: gera as linhas (vendedor + regional) se competencia >= inicial;
--   * boleto sai de pago (estorno/cancelamento): remove as linhas ainda nao
--     enviadas ao contas a pagar. As ja enviadas ficam (o financeiro decide).
create or replace function fn_calcular_comissao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comp date;
begin
  if new.status = 'pago' and old.status is distinct from 'pago' then
    v_comp := date_trunc('month', new.data_vencimento)::date;
    perform _comissao_gerar_itens(v_comp, (v_comp + interval '1 month - 1 day')::date, null, new.id);
  elsif old.status = 'pago' and new.status is distinct from 'pago' then
    delete from comissoes_vendas
     where titulo_id = new.id and lancamento_id is null and status_pagamento = 'pendente';
  end if;
  return new;
end;
$$;
-- (o trigger trg_calcular_comissao de 0002 continua apontando para esta funcao)

-- Recalcula a competencia (idempotente). So mexe no que NAO foi enviado ao
-- contas a pagar: apaga as pendentes soltas e regrava a partir dos boletos.
-- Util quando a taxa do cadastro muda ou um boleto foi pago fora do fluxo.
create or replace function apurar_comissoes(
  p_competencia date,
  p_regional_id uuid default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  cfg    comissoes_config;
  v_comp date := date_trunc('month', p_competencia)::date;
  v_fim  date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_reg  uuid := escopo_regional(p_regional_id);
  v_n    integer;
  v_tot  numeric;
begin
  if not tem_acesso_global() then
    raise exception 'Somente a matriz (admin/financeiro) apura comissoes' using errcode = '42501';
  end if;
  select * into cfg from comissoes_config where id;
  if v_comp < cfg.competencia_inicial then
    raise exception 'As comissoes no SCar comecam na competencia %', to_char(cfg.competencia_inicial, 'MM/YYYY');
  end if;

  delete from comissoes_vendas
   where competencia = v_comp
     and lancamento_id is null
     and status_pagamento = 'pendente'
     and (v_reg is null or regional_id = v_reg);

  v_n := _comissao_gerar_itens(v_comp, v_fim, v_reg, null);

  select coalesce(sum(valor_comissao), 0) into v_tot
    from comissoes_vendas
   where competencia = v_comp and (v_reg is null or regional_id = v_reg);

  return jsonb_build_object('competencia', v_comp, 'itens_gerados', v_n, 'valor_total', v_tot);
end;
$$;

-- ============================================================================
-- (F) PAINEL (por regional, ultimos N meses)
-- ============================================================================
-- Uma linha por competencia x regional x consultor: boletos emitidos x
-- recebidos e as comissoes (consultor e regional). O ranking e o crescimento
-- sao montados no front (src/lib/comissoes.ts, testado).
-- Acesso: matriz ve tudo; gestor regional so a propria regional.
create or replace function comissoes_desempenho(
  p_competencia date,
  p_meses       integer default 3,
  p_regional_id uuid default null
)
returns table (
  competencia        date,
  regional_id        uuid,
  regional_nome      text,
  vendedor_id        uuid,
  vendedor_nome      text,
  boletos_emitidos   integer,
  valor_emitido      numeric,
  boletos_recebidos  integer,
  valor_recebido     numeric,
  comissao_vendedor  numeric,
  comissao_regional  numeric
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_ini date := (date_trunc('month', p_competencia) - make_interval(months => greatest(p_meses, 1) - 1))::date;
  v_reg uuid := escopo_regional(p_regional_id);
begin
  if not (tem_acesso_global() or auth_papel() = 'gestor_regional') then
    raise exception 'Sem permissao para o painel de comissoes' using errcode = '42501';
  end if;

  return query
  with base as (
    select b.competencia, b.regional_id, b.vendedor_id,
           count(distinct b.titulo_id)::int                               as qe,
           sum(b.valor_emitido)                                           as ve,
           count(distinct b.titulo_id) filter (where b.pago)::int         as qr,
           sum(b.valor_recebido)                                          as vr
      from comissao_base_boletos(v_ini, v_fim) b
     where v_reg is null or b.regional_id = v_reg
     group by 1, 2, 3
  ),
  com as (
    select c.competencia, c.regional_id, c.vendedor_id,
           sum(c.valor_comissao) filter (where c.beneficiario = 'VENDEDOR') as cv,
           sum(c.valor_comissao) filter (where c.beneficiario = 'REGIONAL') as cr
      from comissoes_vendas c
     where c.competencia between v_ini and v_fim
       and (v_reg is null or c.regional_id = v_reg)
     group by 1, 2, 3
  ),
  chaves as (
    select base.competencia, base.regional_id, base.vendedor_id from base
    union
    select com.competencia, com.regional_id, com.vendedor_id from com
  )
  select k.competencia, k.regional_id, r.nome, k.vendedor_id,
         coalesce(u.nome, 'Sem consultor'),
         coalesce(b.qe, 0), coalesce(b.ve, 0), coalesce(b.qr, 0), coalesce(b.vr, 0),
         coalesce(c.cv, 0), coalesce(c.cr, 0)
    from chaves k
    left join base b  on b.competencia = k.competencia
                     and b.regional_id is not distinct from k.regional_id
                     and b.vendedor_id is not distinct from k.vendedor_id
    left join com c   on c.competencia = k.competencia
                     and c.regional_id is not distinct from k.regional_id
                     and c.vendedor_id is not distinct from k.vendedor_id
    left join regionais r  on r.id = k.regional_id
    left join vendedores v on v.id = k.vendedor_id
    left join usuarios u   on u.id = v.usuario_id
   order by k.competencia, r.nome nulls last, coalesce(b.vr, 0) desc;
end;
$$;

-- Previa do que sera enviado ao contas a pagar: comissoes pendentes ainda nao
-- lancadas ate a competencia (inclui recebimentos atrasados de meses anteriores).
create or replace function comissoes_previa_pagamento(
  p_competencia date,
  p_regional_id uuid default null
)
returns table (
  beneficiario    text,
  vendedor_id     uuid,
  regional_id     uuid,
  favorecido      text,
  regional_nome   text,
  qtd_itens       integer,
  base_calculo    numeric,
  valor_comissao  numeric
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_reg uuid := escopo_regional(p_regional_id);
begin
  if not tem_acesso_global() then
    raise exception 'Somente a matriz (admin/financeiro) gera contas a pagar de comissoes' using errcode = '42501';
  end if;
  return query
  select c.beneficiario,
         case when c.beneficiario = 'VENDEDOR' then c.vendedor_id end,
         c.regional_id,
         case when c.beneficiario = 'VENDEDOR' then coalesce(u.nome, 'Consultor')
              else coalesce(r.nome, 'Regional') end,
         r.nome,
         count(*)::int,
         sum(c.base_calculo),
         sum(c.valor_comissao)
    from comissoes_vendas c
    left join vendedores v on v.id = c.vendedor_id
    left join usuarios u   on u.id = v.usuario_id
    left join regionais r  on r.id = c.regional_id
   where c.lancamento_id is null
     and c.status_pagamento = 'pendente'
     and c.competencia >= (select competencia_inicial from comissoes_config where id)
     and c.competencia <= v_fim
     and (v_reg is null or c.regional_id = v_reg)
   group by 1, 2, 3, 4, 5
  having sum(c.valor_comissao) > 0
   order by r.nome nulls last, 1 desc, 8 desc;
end;
$$;

-- ============================================================================
-- (G) GERACAO DO CONTAS A PAGAR
-- ============================================================================
-- Interna (sem checagem de papel): 1 lancamento DESPESA por favorecido x
-- regional, categoria 3.2.01 Comissoes de Vendas, vencimento escolhido.
create or replace function _gerar_contas_pagar_comissoes(
  p_competencia date,
  p_vencimento  date,
  p_regional_id uuid,
  p_origem      text,
  p_usuario     uuid
)
returns comissoes_lotes
language plpgsql security definer
set search_path = public
as $$
declare
  cfg    comissoes_config;
  v_comp date := date_trunc('month', p_competencia)::date;
  v_fim  date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_lote comissoes_lotes;
  g      record;
  v_lanc uuid;
  v_seq  integer := 0;
  v_itens integer;
begin
  select * into cfg from comissoes_config where id;
  if v_comp < cfg.competencia_inicial then
    raise exception 'As comissoes no SCar comecam na competencia %', to_char(cfg.competencia_inicial, 'MM/YYYY');
  end if;
  if p_vencimento is null then
    raise exception 'Informe a data de vencimento do contas a pagar';
  end if;

  -- garante que a competencia esta apurada com as taxas atuais
  delete from comissoes_vendas
   where competencia = v_comp and lancamento_id is null and status_pagamento = 'pendente'
     and (p_regional_id is null or regional_id = p_regional_id);
  perform _comissao_gerar_itens(v_comp, v_fim, p_regional_id, null);

  insert into comissoes_lotes (competencia, regional_id, data_vencimento, origem, created_by)
    values (v_comp, p_regional_id, p_vencimento, p_origem, p_usuario)
    returning * into v_lote;

  for g in
    select c.beneficiario,
           case when c.beneficiario = 'VENDEDOR' then c.vendedor_id end as vend_id,
           c.regional_id,
           case when c.beneficiario = 'VENDEDOR' then coalesce(u.nome, 'Consultor')
                else coalesce(r.nome, 'Regional') end as favorecido,
           count(*)::int as qtd,
           sum(c.base_calculo)   as base,
           sum(c.valor_comissao) as valor,
           min(c.competencia)    as comp_min
      from comissoes_vendas c
      left join vendedores v on v.id = c.vendedor_id
      left join usuarios u   on u.id = v.usuario_id
      left join regionais r  on r.id = c.regional_id
     where c.lancamento_id is null
       and c.status_pagamento = 'pendente'
       and c.competencia >= cfg.competencia_inicial
       and c.competencia <= v_fim
       and (p_regional_id is null or c.regional_id = p_regional_id)
     group by 1, 2, 3, 4
    having sum(c.valor_comissao) > 0
  loop
    v_seq := v_seq + 1;
    insert into lancamentos_financeiros (
      tipo, descricao, categoria_dre_id, regional_id, valor_original,
      data_emissao, data_vencimento, competencia, numero_documento, observacoes,
      forma_pagamento_prevista
    ) values (
      'DESPESA',
      case when g.beneficiario = 'VENDEDOR' then 'Comissao consultor ' else 'Comissao regional ' end
        || to_char(v_comp, 'MM/YYYY') || ' - ' || g.favorecido,
      cfg.categoria_dre_id,
      g.regional_id,
      g.valor,
      current_date,
      p_vencimento,
      v_comp,
      'COM-' || to_char(v_comp, 'YYYYMM') || '-' || substr(v_lote.id::text, 1, 4) || '-' || lpad(v_seq::text, 3, '0'),
      'Lote ' || v_lote.id || ' | ' || g.qtd || ' boleto(s) recebido(s) | base R$ ' || to_char(g.base, 'FM999G999G990D00')
        || case when g.comp_min < v_comp then ' | inclui recebimentos atrasados desde ' || to_char(g.comp_min, 'MM/YYYY') else '' end,
      'PIX'
    ) returning id into v_lanc;

    update comissoes_vendas c
       set lancamento_id = v_lanc, lote_id = v_lote.id
     where c.lancamento_id is null
       and c.status_pagamento = 'pendente'
       and c.competencia >= cfg.competencia_inicial
       and c.competencia <= v_fim
       and c.beneficiario = g.beneficiario
       and c.regional_id is not distinct from g.regional_id
       and (g.beneficiario = 'REGIONAL' or c.vendedor_id = g.vend_id);
    get diagnostics v_itens = row_count;

    update comissoes_lotes
       set qtd_lancamentos = qtd_lancamentos + 1,
           qtd_itens       = qtd_itens + v_itens,
           valor_total     = valor_total + g.valor
     where id = v_lote.id;
  end loop;

  select * into v_lote from comissoes_lotes where id = v_lote.id;
  if v_lote.qtd_lancamentos = 0 then
    delete from comissoes_lotes where id = v_lote.id;
    raise exception 'Nenhuma comissao pendente para enviar ao contas a pagar nesta competencia';
  end if;
  return v_lote;
end;
$$;

-- Publica: o financeiro escolhe a competencia e a data de vencimento.
create or replace function gerar_contas_pagar_comissoes(
  p_competencia date,
  p_vencimento  date,
  p_regional_id uuid default null
)
returns comissoes_lotes
language plpgsql security definer
set search_path = public
as $$
begin
  if not tem_acesso_global() then
    raise exception 'Somente a matriz (admin/financeiro) gera contas a pagar de comissoes' using errcode = '42501';
  end if;
  return _gerar_contas_pagar_comissoes(p_competencia, p_vencimento, p_regional_id, 'MANUAL', auth.uid());
end;
$$;

-- AUTOMACAO (pronta e DESLIGADA). Quando comissoes_config.geracao_automatica
-- = true, gera no dia_geracao_automatica o contas a pagar do MES ANTERIOR com
-- vencimento no dia_vencimento_padrao do mes corrente. Para ligar, agende:
--   select cron.schedule('comissoes-auto', '0 6 * * *',
--                        $$ select gerar_contas_pagar_comissoes_automatico() $$);
create or replace function gerar_contas_pagar_comissoes_automatico()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  cfg    comissoes_config;
  v_comp date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_lote comissoes_lotes;
begin
  select * into cfg from comissoes_config where id;
  if not cfg.geracao_automatica then return 'desligada'; end if;
  if extract(day from current_date)::int <> cfg.dia_geracao_automatica then return 'fora do dia'; end if;
  if v_comp < cfg.competencia_inicial then return 'antes da competencia inicial'; end if;
  if exists (select 1 from comissoes_lotes where competencia = v_comp and origem = 'AUTOMATICA') then
    return 'ja gerado';
  end if;
  begin
    v_lote := _gerar_contas_pagar_comissoes(
      v_comp,
      make_date(extract(year from current_date)::int, extract(month from current_date)::int, cfg.dia_vencimento_padrao),
      null, 'AUTOMATICA', null);
    return 'gerado lote ' || v_lote.id;
  exception when others then
    return 'nada gerado: ' || sqlerrm;
  end;
end;
$$;

-- So o agendador (dono/service) executa as internas e a automatica.
revoke execute on function _comissao_gerar_itens(date, date, uuid, uuid) from public, authenticated, anon;
revoke execute on function _gerar_contas_pagar_comissoes(date, date, uuid, text, uuid) from public, authenticated, anon;
revoke execute on function gerar_contas_pagar_comissoes_automatico() from public, authenticated, anon;

-- ----------------------------------------------------------------------------
-- (H) Retorno do financeiro: quitou -> comissao paga; cancelou -> volta a pendente
-- ----------------------------------------------------------------------------
create or replace function fn_lanc_sincronizar_comissoes()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then return new; end if;

  if new.status = 'quitado' then
    update comissoes_vendas
       set status_pagamento = 'pago',
           data_pagamento   = coalesce(
             (select max(b.data_pagamento) from baixas_financeiras b where b.lancamento_id = new.id),
             current_date)
     where lancamento_id = new.id;
  elsif new.status = 'cancelado' then
    update comissoes_vendas
       set lancamento_id = null, lote_id = null, status_pagamento = 'pendente', data_pagamento = null
     where lancamento_id = new.id;
  elsif old.status = 'quitado' then
    -- estorno de baixa: volta a "a pagar"
    update comissoes_vendas
       set status_pagamento = 'pendente', data_pagamento = null
     where lancamento_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lanc_sincronizar_comissoes on lancamentos_financeiros;
create trigger trg_lanc_sincronizar_comissoes
  after update of status on lancamentos_financeiros
  for each row execute function fn_lanc_sincronizar_comissoes();

-- ============================================================================
-- (I) RLS
-- ============================================================================
alter table comissoes_config enable row level security;
alter table comissoes_lotes  enable row level security;

create policy comissoes_config_select on comissoes_config for select to authenticated
  using (is_staff());
create policy comissoes_config_write on comissoes_config for update to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

create policy comissoes_lotes_select on comissoes_lotes for select to authenticated
  using (tem_acesso_global()
         or (auth_papel() = 'gestor_regional' and regional_id = auth_regional_id()));
-- escrita so pelas RPCs (SECURITY DEFINER)

-- Ledger: matriz ve tudo; gestor regional ve a propria regional; o consultor
-- ve SO as proprias linhas de consultor (nao enxerga a comissao da regional).
drop policy if exists comissoes_select on comissoes_vendas;
create policy comissoes_select on comissoes_vendas for select to authenticated
  using (
    tem_acesso_global()
    or (auth_papel() = 'gestor_regional' and regional_id = auth_regional_id())
    or (beneficiario = 'VENDEDOR'
        and exists (select 1 from vendedores v where v.id = vendedor_id and v.usuario_id = auth.uid()))
  );
