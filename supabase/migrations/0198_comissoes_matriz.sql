-- ============================================================================
-- SCar :: 0198_comissoes_matriz.sql
-- GESTAO DE COMISSOES PELA MATRIZ (Gestao -> Comissoes, /comissoes).
--
-- Pedido do usuario (12/11/2026): os portais (franquia 0036/0037 e vendedor
-- 0038) ja mostram o extrato; falta a MATRIZ apurar, acompanhar e mandar ao
-- contas a pagar. Regras combinadas:
--   * Segue os CADASTROS: taxa recorrente da REGIONAL (a comissao da franquia,
--     0034) e taxa recorrente do VENDEDOR.
--   * A primeira comissao no SCar e a de NOVEMBRO/2026 e NAO se paga ADESAO:
--     ja comeca como RECORRENCIA. Nada antes de 11/2026 entra.
--   * Competencia = MES DE VENCIMENTO do boleto (o mesmo recorte do Painel de
--     Inadimplencia). A competencia do Mutual vem deslocada um mes; usar o
--     vencimento evita a confusao.
--   * Fonte UNICA dos boletos: cobranca_boletos_base() (titulos de mensalidade
--     do SCar + boletos do Mutual antes do corte). Em producao ~95% do recebido
--     de novembro ainda e boleto do Mutual — sem ele a comissao sairia quase zero.
--   * Base = o que foi RECEBIDO. Boleto aberto/cancelado nao comissiona.
--   * O contas a pagar e gerado pelo FINANCEIRO, na data escolhida (manual).
--     A geracao automatica fica PRONTA e DESLIGADA.
--
-- A quem a matriz paga (por regional, Configuracoes -> Regionais):
--   FRANQUIA   -> a matriz paga a FRANQUIA: recebido da carteira x taxa da
--                 regional. A franquia repassa aos vendedores pelo portal dela
--                 (0037), como hoje. Titulo na matriz (regional_id nulo).
--   VENDEDORES -> a matriz paga CADA CONSULTOR direto: recebido dos veiculos
--                 dele x taxa do vendedor (ou a Assistencia Profissional no
--                 lugar, regra 0159). Padrao da SMART CAR MATRIZ, que nao tem
--                 franqueado. Titulo na unidade, com vendedor_id (como o repasse).
--   NENHUM     -> a matriz nao paga comissao desta unidade.
--
-- NAO MEXE em fn_calcular_comissao / gerar_comissoes_titulo (0191): o extrato
-- dos portais segue igual. No modo VENDEDORES, a comissao do titulo do SCar que
-- ja existe em comissoes_vendas e REAPROVEITADA (mesmo valor, regra da AP) e
-- marcada paga ao ir para o contas a pagar, para a franquia nao repassar de novo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Cadastro da regional: a quem a matriz paga
-- ----------------------------------------------------------------------------
alter table regionais
  add column if not exists comissao_matriz_destino text not null default 'FRANQUIA';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_regionais_comissao_destino') then
    alter table regionais add constraint chk_regionais_comissao_destino
      check (comissao_matriz_destino in ('FRANQUIA', 'VENDEDORES', 'NENHUM'));
  end if;
end $$;

comment on column regionais.comissao_matriz_destino is
  'Gestao de comissoes (0198): FRANQUIA = a matriz paga a franquia (taxa da regional); VENDEDORES = a matriz paga cada consultor (taxa do vendedor); NENHUM = nao paga.';

-- A unidade da propria matriz nao tem franqueado: paga os consultores direto.
update regionais set comissao_matriz_destino = 'VENDEDORES'
 where codigo = 'SMARTCARMATRIZ' and comissao_matriz_destino = 'FRANQUIA';

-- ----------------------------------------------------------------------------
-- (B) Politica (linha unica)
-- ----------------------------------------------------------------------------
create table if not exists comissoes_config (
  id                     boolean primary key default true check (id),
  competencia_inicial    date    not null default date '2026-11-01',
  exigir_vendedor_ativo  boolean not null default true,
  dia_vencimento_padrao  integer not null default 10 check (dia_vencimento_padrao between 1 and 28),
  geracao_automatica     boolean not null default false,
  dia_geracao_automatica integer not null default 5 check (dia_geracao_automatica between 1 and 28),
  updated_at             timestamptz not null default now()
);
insert into comissoes_config (id) values (true) on conflict (id) do nothing;

drop trigger if exists trg_comissoes_config_updated on comissoes_config;
create trigger trg_comissoes_config_updated before update on comissoes_config
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- (C) Lotes (cada envio ao contas a pagar) e o ledger da matriz
-- ----------------------------------------------------------------------------
create table if not exists comissoes_matriz_lotes (
  id              uuid primary key default gen_random_uuid(),
  competencia     date not null,
  regional_id     uuid references regionais(id) on delete set null,  -- nulo = todas
  data_vencimento date not null,
  qtd_lancamentos integer not null default 0,
  qtd_itens       integer not null default 0,
  valor_total     numeric(12,2) not null default 0,
  origem          text not null default 'MANUAL' check (origem in ('MANUAL', 'AUTOMATICA')),
  created_by      uuid references usuarios(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_com_matriz_lotes_comp on comissoes_matriz_lotes (competencia desc);

-- Uma linha por boleto x veiculo x beneficiario. Situacao derivada:
--   lancamento_id nulo = pendente · com lancamento = a pagar · data_pagamento = paga.
create table if not exists comissoes_matriz (
  id                  uuid primary key default gen_random_uuid(),
  competencia         date not null,                       -- 1o dia do mes de vencimento
  regional_id         uuid not null references regionais(id) on delete restrict,
  beneficiario        text not null check (beneficiario in ('FRANQUIA', 'VENDEDOR')),
  vendedor_id         uuid references vendedores(id) on delete restrict,
  origem              text not null check (origem in ('SCAR', 'MUTUAL')),
  boleto_id           uuid not null,                       -- titulos_financeiros.id ou boletos_historico.id
  veiculo_id          uuid references veiculos(id) on delete set null,
  comissao_venda_id   uuid references comissoes_vendas(id) on delete set null,
  vencimento          date,
  data_recebimento    date,
  base_calculo        numeric(12,2) not null default 0,
  taxa                numeric(6,4)  not null default 0,
  valor_assistencia_profissional numeric(12,2) not null default 0,
  valor_comissao      numeric(12,2) not null default 0,
  lancamento_id       uuid references lancamentos_financeiros(id) on delete set null,
  lote_id             uuid references comissoes_matriz_lotes(id) on delete set null,
  data_pagamento      date,
  created_at          timestamptz not null default now(),
  constraint chk_com_matriz_vendedor check (beneficiario <> 'VENDEDOR' or vendedor_id is not null)
);
create unique index if not exists uq_com_matriz_item
  on comissoes_matriz (origem, boleto_id,
                       coalesce(veiculo_id, '00000000-0000-0000-0000-000000000000'::uuid), beneficiario);
create index if not exists idx_com_matriz_comp       on comissoes_matriz (competencia, regional_id);
create index if not exists idx_com_matriz_lancamento on comissoes_matriz (lancamento_id);
create index if not exists idx_com_matriz_vendedor   on comissoes_matriz (vendedor_id);

-- ============================================================================
-- (D) APURACAO
-- ============================================================================
-- Interna (sem checagem de papel): grava as linhas PENDENTES da competencia.
-- O que ja foi ao contas a pagar fica (unique + on conflict do nothing).
create or replace function _comissoes_matriz_gerar(p_competencia date, p_regional_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg    comissoes_config;
  v_comp date := date_trunc('month', p_competencia)::date;
  v_fim  date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  b      record;
  p      record;
  vd     vendedores;
  v_base numeric(12,2);
  v_ap_v numeric(12,2);
  v_mens numeric(12,2);
  v_ap   numeric(12,2);
  v_val  numeric(12,2);
  v_n    integer := 0;
  v_k    integer;
begin
  select * into cfg from comissoes_config where id;
  if v_comp < cfg.competencia_inicial then return 0; end if;

  -- recalcula o que ainda nao saiu (taxa mudou, boleto pago depois, estorno)
  delete from comissoes_matriz
   where competencia = v_comp and lancamento_id is null
     and (p_regional_id is null or regional_id = p_regional_id);

  for b in
    select x.origem, x.boleto_id, x.veiculo_id, x.regional_id, x.vencimento, x.data_pagamento,
           coalesce(x.valor_pago, x.valor) as recebido,
           r.comissao_matriz_destino as destino, r.taxa_comissao_recorrente as taxa_reg,
           coalesce(r.paga_assistencia_profissional, false) as repassa_ap
      from cobranca_boletos_base(v_comp, v_fim, p_regional_id) x
      join regionais r on r.id = x.regional_id
     where x.situacao in ('pago_no_prazo', 'pago_em_atraso')
       and coalesce(x.valor_pago, x.valor) > 0
  loop
    if b.destino = 'FRANQUIA' then
      continue when coalesce(b.taxa_reg, 0) <= 0;
      insert into comissoes_matriz (competencia, regional_id, beneficiario, origem, boleto_id, veiculo_id,
                                    vencimento, data_recebimento, base_calculo, taxa, valor_comissao)
      values (v_comp, b.regional_id, 'FRANQUIA', b.origem, b.boleto_id, b.veiculo_id,
              b.vencimento, b.data_pagamento, b.recebido, b.taxa_reg, round(b.recebido * b.taxa_reg, 2))
      on conflict do nothing;
      get diagnostics v_k = row_count;  v_n := v_n + v_k;

    elsif b.destino = 'VENDEDORES' then
      if b.origem = 'SCAR' then
        -- a comissao do titulo do SCar ja existe (0191): reaproveita o valor,
        -- com a regra da Assistencia Profissional. Adesao nunca (titulo de
        -- mensalidade), e o que a franquia ja repassou fica de fora.
        insert into comissoes_matriz (competencia, regional_id, beneficiario, vendedor_id, origem, boleto_id,
                                      veiculo_id, comissao_venda_id, vencimento, data_recebimento,
                                      base_calculo, taxa, valor_assistencia_profissional, valor_comissao)
        select v_comp, b.regional_id, 'VENDEDOR', c.vendedor_id, 'SCAR', b.boleto_id,
               c.veiculo_id, c.id, b.vencimento, b.data_pagamento,
               coalesce((select round(b.recebido
                                      * sum(rt.peso) filter (where rt.veiculo_id = c.veiculo_id)
                                      / nullif(sum(rt.peso), 0), 2)
                           from rateio_mensalidade_titulo(b.boleto_id) rt), 0),
               vd2.taxa_comissao_recorrente, coalesce(c.valor_assistencia_profissional, 0), c.valor_comissao
          from comissoes_vendas c
          join vendedores vd2 on vd2.id = c.vendedor_id
         where c.titulo_id = b.boleto_id
           and not c.is_adesao
           and c.status_pagamento = 'pendente'
           and c.valor_comissao > 0
           and (vd2.ativo or not cfg.exigir_vendedor_ativo)
        on conflict do nothing;
        get diagnostics v_k = row_count;  v_n := v_n + v_k;

      else
        -- boleto do Mutual: o veiculo dele, ou o contrato (agrupado sem placa)
        for p in
          with x as (select * from veiculos_do_boleto_mutual(b.boleto_id)),
               t as (select sum(peso) s from x)
          select x.veiculo_id, round(b.recebido * x.peso / t.s, 2) as base
            from x cross join t
           where coalesce(t.s, 0) > 0
        loop
          select v.* into vd from veiculos ve join vendedores v on v.id = ve.vendedor_id
           where ve.id = p.veiculo_id;
          continue when not found;
          continue when not (vd.ativo or not cfg.exigir_vendedor_ativo);

          v_base := coalesce(p.base, 0);
          v_ap := 0;
          v_val := round(v_base * coalesce(vd.taxa_comissao_recorrente, 0), 2);
          -- 0159: comissao OU Assistencia Profissional, nunca as duas
          if b.repassa_ap then
            select coalesce(valor_assistencia_profissional, 0) into v_ap_v from veiculos where id = p.veiculo_id;
            if v_ap_v > 0 then
              v_mens := valor_mensalidade_veiculo(p.veiculo_id);
              v_ap := case when coalesce(v_mens, 0) > 0 then round(v_ap_v * v_base / v_mens, 2) else v_ap_v end;
              v_ap := greatest(least(v_ap, v_ap_v, v_base), 0);
              v_val := v_ap;
            end if;
          end if;
          continue when v_val <= 0;

          insert into comissoes_matriz (competencia, regional_id, beneficiario, vendedor_id, origem, boleto_id,
                                        veiculo_id, vencimento, data_recebimento, base_calculo, taxa,
                                        valor_assistencia_profissional, valor_comissao)
          values (v_comp, b.regional_id, 'VENDEDOR', vd.id, 'MUTUAL', b.boleto_id, p.veiculo_id,
                  b.vencimento, b.data_pagamento, v_base, vd.taxa_comissao_recorrente, v_ap, v_val)
          on conflict do nothing;
          get diagnostics v_k = row_count;  v_n := v_n + v_k;
        end loop;
      end if;
    end if;
  end loop;

  return v_n;
end;
$$;

-- Publica: recalcula a competencia com as taxas atuais (so a matriz).
create or replace function apurar_comissoes_matriz(p_competencia date, p_regional_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg    comissoes_config;
  v_comp date := date_trunc('month', p_competencia)::date;
  v_n    integer;
  v_tot  numeric;
begin
  if not tem_acesso_global() then
    raise exception 'Somente a matriz (admin/financeiro) apura comissoes.' using errcode = 'insufficient_privilege';
  end if;
  select * into cfg from comissoes_config where id;
  if v_comp < cfg.competencia_inicial then
    raise exception 'As comissoes no SCar comecam na competencia %.', to_char(cfg.competencia_inicial, 'MM/YYYY');
  end if;
  v_n := _comissoes_matriz_gerar(v_comp, p_regional_id);
  select coalesce(sum(valor_comissao), 0) into v_tot from comissoes_matriz
   where competencia = v_comp and (p_regional_id is null or regional_id = p_regional_id);
  return jsonb_build_object('competencia', v_comp, 'itens', v_n, 'valor_total', v_tot);
end;
$$;

-- ============================================================================
-- (E) PAINEL: por regional e consultor, ultimos N meses (pelo vencimento)
-- ============================================================================
-- Emitido = nao cancelado. "Vencido" = ja passou do vencimento efetivo (o
-- denominador da taxa de recebimento: boleto que nao venceu nao entra em taxa,
-- regra do Painel de Inadimplencia). Boleto sem veiculo fica "sem consultor".
create or replace function comissoes_matriz_desempenho(
  p_competencia date,
  p_meses       integer default 3,
  p_regional_id uuid default null
)
returns table (
  competencia       date,
  regional_id       uuid,
  regional_nome     text,
  destino           text,
  taxa_regional     numeric,
  vendedor_id       uuid,
  vendedor_nome     text,
  vendedor_ativo    boolean,
  taxa_vendedor     numeric,
  boletos_emitidos  integer,
  valor_emitido     numeric,
  boletos_vencidos  integer,
  valor_vencido     numeric,
  boletos_recebidos integer,
  valor_recebido    numeric,
  valor_recebido_vencidos numeric,
  comissao_franquia numeric,
  comissao_vendedor numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_ini date := (date_trunc('month', p_competencia) - make_interval(months => greatest(p_meses, 1) - 1))::date;
  v_reg uuid := escopo_regional(p_regional_id);
begin
  if not (tem_acesso_global() or auth_papel()::text = 'gestor_regional') then
    raise exception 'Sem permissao para o painel de comissoes.' using errcode = 'insufficient_privilege';
  end if;
  if not tem_acesso_global() and v_reg is null then return; end if;

  return query
  with b as (
    select date_trunc('month', x.vencimento)::date as comp, x.regional_id as reg, ve.vendedor_id as vend,
           x.situacao, x.valor, coalesce(x.valor_pago, x.valor) as pago,
           (x.vencimento_efetivo < current_date) as venceu
      from cobranca_boletos_base(v_ini, v_fim, v_reg) x
      left join veiculos ve on ve.id = x.veiculo_id
     where x.situacao <> 'cancelado'
  ),
  agg as (
    select b.comp, b.reg, b.vend,
           count(*)::int                                                  as qe,
           sum(b.valor)                                                   as ve,
           count(*) filter (where b.venceu)::int                          as qv,
           coalesce(sum(b.valor) filter (where b.venceu), 0)              as vv,
           count(*) filter (where b.situacao like 'pago%')::int           as qr,
           coalesce(sum(b.pago) filter (where b.situacao like 'pago%'), 0) as vr,
           coalesce(sum(b.pago) filter (where b.situacao like 'pago%' and b.venceu), 0) as vrv
      from b group by 1, 2, 3
  ),
  com as (
    select c.competencia as comp, c.regional_id as reg, c.vendedor_id as vend,
           coalesce(sum(c.valor_comissao) filter (where c.beneficiario = 'FRANQUIA'), 0) as cf,
           coalesce(sum(c.valor_comissao) filter (where c.beneficiario = 'VENDEDOR'), 0) as cv
      from comissoes_matriz c
     where c.competencia between v_ini and v_fim
       and (v_reg is null or c.regional_id = v_reg)
     group by 1, 2, 3
  ),
  -- a comissao da franquia e por boleto (sem consultor); para o painel por
  -- consultor ela e reatribuida ao vendedor do veiculo do boleto
  comf as (
    select c.competencia as comp, c.regional_id as reg, ve.vendedor_id as vend,
           sum(c.valor_comissao) as cf
      from comissoes_matriz c
      left join veiculos ve on ve.id = c.veiculo_id
     where c.beneficiario = 'FRANQUIA'
       and c.competencia between v_ini and v_fim
       and (v_reg is null or c.regional_id = v_reg)
     group by 1, 2, 3
  ),
  k as (
    select agg.comp, agg.reg, agg.vend from agg
    union select com.comp, com.reg, com.vend from com where com.cv > 0
    union select comf.comp, comf.reg, comf.vend from comf
  )
  select k.comp, k.reg, r.nome, r.comissao_matriz_destino, r.taxa_comissao_recorrente,
         k.vend, coalesce(v.nome, u.nome, 'Sem consultor'), coalesce(v.ativo, false), v.taxa_comissao_recorrente,
         coalesce(a.qe, 0), coalesce(a.ve, 0), coalesce(a.qv, 0), coalesce(a.vv, 0),
         coalesce(a.qr, 0), coalesce(a.vr, 0), coalesce(a.vrv, 0),
         coalesce(f.cf, 0), coalesce(cm.cv, 0)
    from k
    left join agg a  on a.comp = k.comp and a.reg is not distinct from k.reg and a.vend is not distinct from k.vend
    left join com cm on cm.comp = k.comp and cm.reg is not distinct from k.reg and cm.vend is not distinct from k.vend
    left join comf f on f.comp = k.comp and f.reg is not distinct from k.reg and f.vend is not distinct from k.vend
    left join regionais r  on r.id = k.reg
    left join vendedores v on v.id = k.vend
    left join usuarios u   on u.id = v.usuario_id
   order by k.comp, r.nome nulls last, coalesce(a.vr, 0) desc;
end;
$$;

-- Previa do envio: pendentes ate a competencia (inclui boletos de meses
-- anteriores pagos com atraso), por favorecido.
create or replace function comissoes_matriz_previa(p_competencia date, p_regional_id uuid default null)
returns table (
  beneficiario   text,
  regional_id    uuid,
  regional_nome  text,
  vendedor_id    uuid,
  favorecido     text,
  chave_pix      text,
  qtd_itens      integer,
  base_calculo   numeric,
  valor_comissao numeric,
  competencia_min date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
begin
  if not tem_acesso_global() then
    raise exception 'Somente a matriz (admin/financeiro).' using errcode = 'insufficient_privilege';
  end if;
  return query
  select c.beneficiario, c.regional_id, r.nome,
         case when c.beneficiario = 'VENDEDOR' then c.vendedor_id end,
         case when c.beneficiario = 'VENDEDOR' then coalesce(v.nome, u.nome, 'Consultor') else r.nome end,
         case when c.beneficiario = 'VENDEDOR' then v.chave_pix end,
         count(*)::int, sum(c.base_calculo), sum(c.valor_comissao), min(c.competencia)
    from comissoes_matriz c
    join regionais r on r.id = c.regional_id
    left join vendedores v on v.id = c.vendedor_id
    left join usuarios u   on u.id = v.usuario_id
   where c.lancamento_id is null
     and c.competencia >= (select competencia_inicial from comissoes_config where id)
     and c.competencia <= v_fim
     and (p_regional_id is null or c.regional_id = p_regional_id)
   group by 1, 2, 3, 4, 5, 6
  having sum(c.valor_comissao) > 0
   order by 3, 1, 9 desc;
end;
$$;

-- ============================================================================
-- (F) CONTAS A PAGAR na data escolhida
-- ============================================================================
create or replace function _comissoes_matriz_contas_pagar(
  p_competencia date, p_vencimento date, p_regional_id uuid, p_origem text, p_usuario uuid
)
returns comissoes_matriz_lotes
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg    comissoes_config;
  v_comp date := date_trunc('month', p_competencia)::date;
  v_fim  date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_cat  uuid := regional_categoria_movimento('COMISSAO_PAGAR');
  v_lote comissoes_matriz_lotes;
  g      record;
  v_lanc uuid;
  v_seq  integer := 0;
  v_k    integer;
begin
  select * into cfg from comissoes_config where id;
  if v_comp < cfg.competencia_inicial then
    raise exception 'As comissoes no SCar comecam na competencia %.', to_char(cfg.competencia_inicial, 'MM/YYYY');
  end if;
  if p_vencimento is null then raise exception 'Informe a data de vencimento.'; end if;

  -- reapura a competencia e as 5 anteriores: boleto pago com atraso (o Mutual
  -- nao dispara trigger nenhum) entra no proximo envio em vez de se perder
  perform _comissoes_matriz_gerar(m::date, p_regional_id)
     from generate_series(greatest(cfg.competencia_inicial, (v_comp - interval '5 months')::date),
                          v_comp, interval '1 month') m;

  insert into comissoes_matriz_lotes (competencia, regional_id, data_vencimento, origem, created_by)
    values (v_comp, p_regional_id, p_vencimento, p_origem, p_usuario) returning * into v_lote;

  for g in
    select c.regional_id, c.beneficiario,
           case when c.beneficiario = 'VENDEDOR' then c.vendedor_id end as vend,
           r.nome as reg_nome, coalesce(v.nome, u.nome, 'Consultor') as vend_nome,
           count(*)::int as qtd, sum(c.base_calculo) as base, sum(c.valor_comissao) as valor,
           min(c.competencia) as comp_min
      from comissoes_matriz c
      join regionais r on r.id = c.regional_id
      left join vendedores v on v.id = c.vendedor_id
      left join usuarios u   on u.id = v.usuario_id
     where c.lancamento_id is null
       and c.competencia >= cfg.competencia_inicial and c.competencia <= v_fim
       and (p_regional_id is null or c.regional_id = p_regional_id)
     group by 1, 2, 3, 4, 5
    having sum(c.valor_comissao) > 0
     order by 4, 2
  loop
    v_seq := v_seq + 1;
    insert into lancamentos_financeiros (
      tipo, descricao, categoria_dre_id, regional_id, vendedor_id, valor_original,
      data_emissao, data_vencimento, competencia, numero_documento, observacoes
    ) values (
      'DESPESA',
      case when g.beneficiario = 'FRANQUIA'
           then 'Comissao da franquia ' || to_char(v_comp, 'MM/YYYY') || ' - ' || g.reg_nome
           else 'Comissao recorrente ' || to_char(v_comp, 'MM/YYYY') || ' - ' || g.vend_nome || ' (' || g.reg_nome || ')' end,
      v_cat,
      -- franquia: despesa da MATRIZ (nao pode cair no financeiro da franquia
      -- como se ela pagasse); consultor: na unidade, como o repasse (0037)
      case when g.beneficiario = 'FRANQUIA' then null else g.regional_id end,
      g.vend,
      g.valor, current_date, p_vencimento, v_comp,
      'COM-' || to_char(v_comp, 'YYYYMM') || '-' || substr(v_lote.id::text, 1, 4) || '-' || lpad(v_seq::text, 3, '0'),
      'Gestao de comissoes (matriz) | lote ' || v_lote.id || ' | ' || g.qtd || ' boleto(s) recebido(s) | base R$ '
        || to_char(g.base, 'FM999G999G990D00')
        || case when g.comp_min < v_comp then ' | inclui recebimentos atrasados desde ' || to_char(g.comp_min, 'MM/YYYY') else '' end
    ) returning id into v_lanc;

    update comissoes_matriz c set lancamento_id = v_lanc, lote_id = v_lote.id
     where c.lancamento_id is null
       and c.competencia >= cfg.competencia_inicial and c.competencia <= v_fim
       and c.regional_id = g.regional_id and c.beneficiario = g.beneficiario
       and (g.beneficiario = 'FRANQUIA' or c.vendedor_id = g.vend);
    get diagnostics v_k = row_count;

    -- a comissao do SCar reaproveitada sai do "a repassar" do portal da franquia
    update comissoes_vendas cv set status_pagamento = 'pago'
      from comissoes_matriz c
     where c.lancamento_id = v_lanc and c.comissao_venda_id = cv.id and cv.status_pagamento = 'pendente';

    update comissoes_matriz_lotes
       set qtd_lancamentos = qtd_lancamentos + 1, qtd_itens = qtd_itens + v_k, valor_total = valor_total + g.valor
     where id = v_lote.id;
  end loop;

  select * into v_lote from comissoes_matriz_lotes where id = v_lote.id;
  if v_lote.qtd_lancamentos = 0 then
    delete from comissoes_matriz_lotes where id = v_lote.id;
    raise exception 'Nenhuma comissao pendente para enviar ao contas a pagar ate esta competencia.';
  end if;
  return v_lote;
end;
$$;

create or replace function gerar_contas_pagar_comissoes_matriz(
  p_competencia date, p_vencimento date, p_regional_id uuid default null
)
returns comissoes_matriz_lotes
language plpgsql
security definer
set search_path = public
as $$
begin
  if not tem_acesso_global() then
    raise exception 'Somente a matriz (admin/financeiro) gera o contas a pagar das comissoes.'
      using errcode = 'insufficient_privilege';
  end if;
  return _comissoes_matriz_contas_pagar(p_competencia, p_vencimento, p_regional_id, 'MANUAL', auth.uid());
end;
$$;

-- AUTOMACAO — PRONTA E DESLIGADA. Com comissoes_config.geracao_automatica, no
-- dia_geracao_automatica gera o contas a pagar do MES ANTERIOR com vencimento
-- no dia_vencimento_padrao do mes corrente. Para ligar, agendar no Supabase:
--   select cron.schedule('comissoes-matriz', '0 9 * * *',
--          $$ select gerar_contas_pagar_comissoes_automatico() $$);
-- (sem sessao: cobranca_escopo() trata auth.uid() nulo como global)
create or replace function gerar_contas_pagar_comissoes_automatico()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg    comissoes_config;
  v_comp date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_lote comissoes_matriz_lotes;
begin
  if auth.uid() is not null then
    raise exception 'Rotina do agendador.' using errcode = 'insufficient_privilege';
  end if;
  select * into cfg from comissoes_config where id;
  if not cfg.geracao_automatica then return 'desligada'; end if;
  if extract(day from current_date)::int <> cfg.dia_geracao_automatica then return 'fora do dia'; end if;
  if v_comp < cfg.competencia_inicial then return 'antes da competencia inicial'; end if;
  if exists (select 1 from comissoes_matriz_lotes where competencia = v_comp and origem = 'AUTOMATICA') then
    return 'ja gerado';
  end if;
  begin
    v_lote := _comissoes_matriz_contas_pagar(
      v_comp, make_date(extract(year from current_date)::int, extract(month from current_date)::int,
                        cfg.dia_vencimento_padrao),
      null, 'AUTOMATICA', null);
    return 'gerado lote ' || v_lote.id;
  exception when others then
    return 'nada gerado: ' || sqlerrm;
  end;
end;
$$;

-- ----------------------------------------------------------------------------
-- (G) Volta do financeiro: quitou -> paga; cancelou/excluiu -> volta a pendente
-- ----------------------------------------------------------------------------
create or replace function fn_lanc_comissoes_matriz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  if not exists (select 1 from comissoes_matriz where lancamento_id = v_id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' or new.status = 'cancelado' then
    update comissoes_vendas cv set status_pagamento = 'pendente'
      from comissoes_matriz c
     where c.lancamento_id = v_id and c.comissao_venda_id = cv.id;
    update comissoes_matriz set lancamento_id = null, lote_id = null, data_pagamento = null
     where lancamento_id = v_id;
  elsif new.status = 'quitado' then
    update comissoes_matriz
       set data_pagamento = coalesce((select max(b.data_pagamento) from baixas_financeiras b
                                       where b.lancamento_id = v_id), current_date)
     where lancamento_id = v_id;
  elsif old.status = 'quitado' then
    update comissoes_matriz set data_pagamento = null where lancamento_id = v_id;   -- estorno
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_lanc_comissoes_matriz on lancamentos_financeiros;
create trigger trg_lanc_comissoes_matriz
  after update of status on lancamentos_financeiros
  for each row when (new.status is distinct from old.status)
  execute function fn_lanc_comissoes_matriz();

drop trigger if exists trg_lanc_comissoes_matriz_del on lancamentos_financeiros;
create trigger trg_lanc_comissoes_matriz_del
  before delete on lancamentos_financeiros
  for each row execute function fn_lanc_comissoes_matriz();

-- ----------------------------------------------------------------------------
-- (H) RLS — leitura da matriz (e do gestor, a propria unidade); escrita so RPC
-- ----------------------------------------------------------------------------
alter table comissoes_config       enable row level security;
alter table comissoes_matriz_lotes enable row level security;
alter table comissoes_matriz       enable row level security;

drop policy if exists comissoes_config_select on comissoes_config;
create policy comissoes_config_select on comissoes_config for select to authenticated using (is_staff());
drop policy if exists comissoes_config_update on comissoes_config;
create policy comissoes_config_update on comissoes_config for update to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

drop policy if exists com_matriz_lotes_select on comissoes_matriz_lotes;
create policy com_matriz_lotes_select on comissoes_matriz_lotes for select to authenticated
  using (tem_acesso_global());

drop policy if exists com_matriz_select on comissoes_matriz;
create policy com_matriz_select on comissoes_matriz for select to authenticated
  using (tem_acesso_global()
         or (auth_papel()::text = 'gestor_regional' and regional_id = auth_regional_id()));

-- ----------------------------------------------------------------------------
-- RITO 0052 (obrigatorio) + internas/automacao fora do alcance da sessao
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;

revoke execute on function _comissoes_matriz_gerar(date, uuid) from authenticated;
revoke execute on function _comissoes_matriz_contas_pagar(date, date, uuid, text, uuid) from authenticated;
