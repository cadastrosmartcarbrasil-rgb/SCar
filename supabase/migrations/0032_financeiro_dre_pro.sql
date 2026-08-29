-- ============================================================================
-- SCar :: 0032_financeiro_dre_pro.sql
-- Departamento financeiro nivel gestao:
--   (A) Lancamento ganha campos de controle contabil (documento, competencia,
--       parcelamento, observacao) + saldo/valor pago CACHEADOS (sem N+1 na tela).
--   (B) DRE de verdade: passa a enxergar CONTAS A PAGAR/RECEBER e ganha
--       REGIME (Caixa x Competencia), serie mensal e centro de custo.
--   (C) Indicadores operacionais: resumo do periodo, fluxo de caixa mensal
--       (previsto x realizado) e aging da carteira (inadimplencia por faixa).
-- Idempotente: pode rodar mais de uma vez no mesmo banco.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Ficha do lancamento
-- ----------------------------------------------------------------------------
alter table lancamentos_financeiros
  add column if not exists numero_documento text,
  add column if not exists competencia      date,
  add column if not exists observacoes      text,
  add column if not exists parcela_numero   integer not null default 1,
  add column if not exists parcela_total    integer not null default 1,
  add column if not exists grupo_parcelas   uuid,
  add column if not exists valor_pago       numeric(12,2) not null default 0,
  add column if not exists valor_saldo      numeric(12,2);

-- Competencia = mes de reconhecimento do resultado (default: o vencimento).
update lancamentos_financeiros set competencia = data_vencimento where competencia is null;
alter table lancamentos_financeiros alter column competencia set default current_date;

create index if not exists idx_lanc_competencia   on lancamentos_financeiros (competencia);
create index if not exists idx_lanc_categoria     on lancamentos_financeiros (categoria_dre_id);
create index if not exists idx_lanc_centro_custo  on lancamentos_financeiros (centro_custo_id);
create index if not exists idx_lanc_grupo_parcela on lancamentos_financeiros (grupo_parcelas);
create index if not exists idx_baixas_data        on baixas_financeiras (data_pagamento);

-- Liga a movimentacao de caixa avulsa ao titulo do contas a pagar/receber.
-- Serve para o DRE NAO contar o mesmo dinheiro duas vezes.
alter table movimentacoes_caixa
  add column if not exists lancamento_id uuid references lancamentos_financeiros(id) on delete set null;
create index if not exists idx_mov_caixa_lancamento on movimentacoes_caixa (lancamento_id);

-- ----------------------------------------------------------------------------
-- Saldo do titulo mantido pelo banco (fonte unica de verdade).
--   valor_pago  = soma das baixas
--   valor_saldo = valor original + juros/multa - pago - desconto
-- ----------------------------------------------------------------------------
create or replace function fn_lanc_calcular_saldo()
returns trigger
language plpgsql
as $$
declare
  v_pago numeric; v_desc numeric; v_juros numeric;
begin
  select coalesce(sum(valor_pago), 0), coalesce(sum(desconto), 0), coalesce(sum(juros_multa), 0)
    into v_pago, v_desc, v_juros
    from baixas_financeiras where lancamento_id = new.id;

  new.valor_pago  := round(v_pago, 2);
  new.valor_saldo := round(new.valor_original + v_juros - v_pago - v_desc, 2);
  return new;
end;
$$;

drop trigger if exists trg_lanc_saldo on lancamentos_financeiros;
create trigger trg_lanc_saldo
  before insert or update on lancamentos_financeiros
  for each row execute function fn_lanc_calcular_saldo();

-- Backfill do saldo dos titulos ja existentes (dispara o trigger acima).
update lancamentos_financeiros set updated_at = updated_at;

-- ----------------------------------------------------------------------------
-- Escopo de leitura dos relatorios.
-- As funcoes abaixo sao SECURITY DEFINER (precisam ler tabelas com RLS), entao
-- o recorte por regional nao pode ficar so no parametro: quem NAO tem acesso
-- global le sempre a propria regional, ignorando o que for pedido. Usuario sem
-- regional definida nao ve nada (uuid impossivel), nunca a base inteira.
-- ----------------------------------------------------------------------------
create or replace function escopo_regional(p_regional_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
           when tem_acesso_global() then p_regional_id
           else coalesce(auth_regional_id(), '00000000-0000-0000-0000-000000000000'::uuid)
         end;
$$;

-- ============================================================================
-- (B) DRE
-- ============================================================================
-- Fonte unica dos movimentos que compoem o resultado, ja classificados.
-- Regime:
--   'CAIXA'       -> reconhece na data em que o dinheiro entrou/saiu.
--   'COMPETENCIA' -> reconhece no mes do fato gerador (competencia do titulo).
-- Sinal: RECEITA positiva, CUSTO/DESPESA negativos.
-- ----------------------------------------------------------------------------
create or replace function dre_movimentos(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid  default null,
  p_regime      text  default 'CAIXA'
)
returns table (
  data             date,
  grupo            tipo_categoria_dre,
  categoria_codigo text,
  categoria_nome   text,
  centro_custo_id  uuid,
  valor            numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with regime as (select upper(coalesce(p_regime, 'CAIXA')) as r)

  -- 1) Contas a pagar / a receber (modulo financeiro)
  --    Caixa: pelas baixas (dinheiro que efetivamente circulou).
  select b.data_pagamento,
         coalesce(cat.tipo, (case when l.tipo = 'RECEITA' then 'RECEITA' else 'DESPESA_FIXA' end)::tipo_categoria_dre),
         coalesce(cat.codigo_estruturado, case when l.tipo = 'RECEITA' then '1.9.99' else '4.9.99' end),
         coalesce(cat.nome, case when l.tipo = 'RECEITA' then 'Receitas nao classificadas' else 'Despesas nao classificadas' end),
         l.centro_custo_id,
         case when l.tipo = 'RECEITA' then b.valor_liquido else -b.valor_liquido end
    from baixas_financeiras b
    join lancamentos_financeiros l on l.id = b.lancamento_id
    left join categorias_dre cat on cat.id = l.categoria_dre_id
   cross join regime
   where regime.r = 'CAIXA'
     and b.data_pagamento between p_data_inicio and p_data_fim
     and l.status <> 'cancelado'
     and ((select escopo_regional(p_regional_id)) is null
            or l.regional_id = (select escopo_regional(p_regional_id)))

  union all

  --    Competencia: pelo titulo, no mes de competencia, independente do pagamento.
  select l.competencia,
         coalesce(cat.tipo, (case when l.tipo = 'RECEITA' then 'RECEITA' else 'DESPESA_FIXA' end)::tipo_categoria_dre),
         coalesce(cat.codigo_estruturado, case when l.tipo = 'RECEITA' then '1.9.99' else '4.9.99' end),
         coalesce(cat.nome, case when l.tipo = 'RECEITA' then 'Receitas nao classificadas' else 'Despesas nao classificadas' end),
         l.centro_custo_id,
         case when l.tipo = 'RECEITA' then l.valor_original else -l.valor_original end
    from lancamentos_financeiros l
    left join categorias_dre cat on cat.id = l.categoria_dre_id
   cross join regime
   where regime.r = 'COMPETENCIA'
     and l.competencia between p_data_inicio and p_data_fim
     and l.status <> 'cancelado'
     and ((select escopo_regional(p_regional_id)) is null
            or l.regional_id = (select escopo_regional(p_regional_id)))

  union all

  -- 2) Movimentacoes de caixa avulsas (nao vinculadas a um titulo do modulo).
  select case when (select r from regime) = 'CAIXA'
              then coalesce(m.data_caixa, m.data_competencia) else m.data_competencia end,
         cat.tipo, cat.codigo_estruturado, cat.nome, null::uuid,
         case when m.tipo = 'RECEITA' then m.valor else -m.valor end
    from movimentacoes_caixa m
    join categorias_dre cat on cat.id = m.categoria_dre_id
   where m.status <> 'cancelado'
     and m.lancamento_id is null
     and (case when (select r from regime) = 'CAIXA'
               then coalesce(m.data_caixa, m.data_competencia) else m.data_competencia end)
         between p_data_inicio and p_data_fim
     and ((select escopo_regional(p_regional_id)) is null
            or m.regional_id = (select escopo_regional(p_regional_id)))

  union all

  -- 3) Mensalidades dos associados (titulos/boletos) nao espelhadas no caixa.
  select case when (select r from regime) = 'CAIXA' then t.data_pagamento else t.data_vencimento end,
         'RECEITA'::tipo_categoria_dre, '1.1.00', 'Receita de Mensalidades (Titulos)', null::uuid,
         case when (select r from regime) = 'CAIXA' then coalesce(t.valor_pago, 0) else t.valor end
    from titulos_financeiros t
    join veiculos v on v.id = t.veiculo_id
   where t.status <> 'cancelado'
     and not exists (select 1 from movimentacoes_caixa mc where mc.titulo_id = t.id)
     and (case when (select r from regime) = 'CAIXA' then t.data_pagamento else t.data_vencimento end)
         between p_data_inicio and p_data_fim
     and (case when (select r from regime) = 'CAIXA' then t.status = 'pago' else true end)
     and ((select escopo_regional(p_regional_id)) is null
            or v.regional_id = (select escopo_regional(p_regional_id)))

  union all

  -- 4) Custo de sinistro: notas fiscais dos eventos (competencia = emissao).
  --    No regime de caixa entram apenas as que nao viraram titulo a pagar.
  select nf.data_emissao, 'CUSTO_VARIAVEL'::tipo_categoria_dre,
         '3.1.00', 'Custo com Sinistros (Notas Fiscais)', null::uuid, -nf.valor_nota
    from notas_fiscais_evento nf
    join eventos_sinistro e on e.id = nf.evento_id
   where (select r from regime) = 'COMPETENCIA'
     and nf.data_emissao between p_data_inicio and p_data_fim
     and ((select escopo_regional(p_regional_id)) is null
            or e.regional_id = (select escopo_regional(p_regional_id)));
$$;

-- DRE analitico por categoria.
create or replace function gerar_dre_completo(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null,
  p_regime      text default 'CAIXA',
  p_centro_custo_id uuid default null
)
returns table (
  grupo            tipo_categoria_dre,
  categoria_codigo text,
  categoria_nome   text,
  total            numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select grupo, categoria_codigo, categoria_nome, round(sum(valor), 2)
    from dre_movimentos(p_data_inicio, p_data_fim, p_regional_id, p_regime)
   where p_centro_custo_id is null or centro_custo_id = p_centro_custo_id
   group by grupo, categoria_codigo, categoria_nome
  having round(sum(valor), 2) <> 0
   order by grupo, categoria_codigo;
$$;

-- Resumo consolidado (mesma forma do gerar_dre_resumo classico).
create or replace function gerar_dre_resumo_completo(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null,
  p_regime      text default 'CAIXA',
  p_centro_custo_id uuid default null
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
  with agg as (
    select
      coalesce(sum(total) filter (where grupo = 'RECEITA'), 0)        as receita,
      coalesce(sum(total) filter (where grupo = 'CUSTO_VARIAVEL'), 0) as custo,
      coalesce(sum(total) filter (where grupo = 'DESPESA_FIXA'), 0)   as despesa
    from gerar_dre_completo(p_data_inicio, p_data_fim, p_regional_id, p_regime, p_centro_custo_id)
  )
  select receita, custo, despesa,
         round(receita + custo + despesa, 2),
         case when receita <> 0 then round(((receita + custo + despesa) / receita) * 100, 2) else 0 end
    from agg;
$$;

-- Serie mensal do resultado (grafico de evolucao).
create or replace function gerar_dre_mensal(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null,
  p_regime      text default 'CAIXA',
  p_centro_custo_id uuid default null
)
returns table (
  mes               date,
  receita           numeric,
  custo_variavel    numeric,
  despesa_fixa      numeric,
  resultado_liquido numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with meses as (
    select generate_series(date_trunc('month', p_data_inicio),
                           date_trunc('month', p_data_fim), interval '1 month')::date as mes
  ),
  mov as (
    select date_trunc('month', data)::date as mes, grupo, valor
      from dre_movimentos(p_data_inicio, p_data_fim, p_regional_id, p_regime)
     where (p_centro_custo_id is null or centro_custo_id = p_centro_custo_id)
       and data is not null
  )
  select m.mes,
         coalesce(round(sum(mov.valor) filter (where mov.grupo = 'RECEITA'), 2), 0),
         coalesce(round(sum(mov.valor) filter (where mov.grupo = 'CUSTO_VARIAVEL'), 2), 0),
         coalesce(round(sum(mov.valor) filter (where mov.grupo = 'DESPESA_FIXA'), 2), 0),
         coalesce(round(sum(mov.valor), 2), 0)
    from meses m
    left join mov on mov.mes = m.mes
   group by m.mes
   order by m.mes;
$$;

-- ============================================================================
-- (C) Indicadores operacionais do contas a pagar / receber
-- ============================================================================
create or replace function financeiro_resumo(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null
)
returns table (
  previsto_receber   numeric,   -- titulos a receber que vencem no periodo
  previsto_pagar     numeric,
  recebido           numeric,   -- baixas de receita liquidadas no periodo
  pago               numeric,
  saldo_realizado    numeric,
  aberto_receber     numeric,   -- carteira em aberto (independe do periodo)
  aberto_pagar       numeric,
  vencido_receber    numeric,
  vencido_pagar      numeric,
  titulos_vencidos   integer,
  vence_em_7_dias    numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with l as (
    select * from lancamentos_financeiros
     where status <> 'cancelado'
       and ((select escopo_regional(p_regional_id)) is null
            or regional_id = (select escopo_regional(p_regional_id)))
  ),
  b as (
    select bx.*, l.tipo
      from baixas_financeiras bx
      join l on l.id = bx.lancamento_id
     where bx.data_pagamento between p_data_inicio and p_data_fim
  )
  select
    coalesce((select sum(valor_original) from l where tipo = 'RECEITA' and data_vencimento between p_data_inicio and p_data_fim), 0),
    coalesce((select sum(valor_original) from l where tipo = 'DESPESA' and data_vencimento between p_data_inicio and p_data_fim), 0),
    coalesce((select sum(valor_liquido) from b where tipo = 'RECEITA'), 0),
    coalesce((select sum(valor_liquido) from b where tipo = 'DESPESA'), 0),
    coalesce((select sum(case when tipo = 'RECEITA' then valor_liquido else -valor_liquido end) from b), 0),
    coalesce((select sum(valor_saldo) from l where tipo = 'RECEITA' and status <> 'quitado'), 0),
    coalesce((select sum(valor_saldo) from l where tipo = 'DESPESA' and status <> 'quitado'), 0),
    coalesce((select sum(valor_saldo) from l where tipo = 'RECEITA' and status <> 'quitado' and data_vencimento < current_date), 0),
    coalesce((select sum(valor_saldo) from l where tipo = 'DESPESA' and status <> 'quitado' and data_vencimento < current_date), 0),
    coalesce((select count(*)::int from l where status <> 'quitado' and data_vencimento < current_date), 0),
    coalesce((select sum(valor_saldo) from l where status <> 'quitado'
                and data_vencimento between current_date and current_date + 7), 0);
$$;

-- Fluxo de caixa mensal: previsto (vencimento) x realizado (baixa).
create or replace function financeiro_fluxo_mensal(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null
)
returns table (
  mes                date,
  previsto_entrada   numeric,
  previsto_saida     numeric,
  realizado_entrada  numeric,
  realizado_saida    numeric,
  saldo_previsto     numeric,
  saldo_realizado    numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with meses as (
    select generate_series(date_trunc('month', p_data_inicio),
                           date_trunc('month', p_data_fim), interval '1 month')::date as mes
  ),
  prev as (
    select date_trunc('month', data_vencimento)::date as mes,
           sum(valor_original) filter (where tipo = 'RECEITA') as entrada,
           sum(valor_original) filter (where tipo = 'DESPESA')  as saida
      from lancamentos_financeiros
     where status <> 'cancelado'
       and data_vencimento between p_data_inicio and p_data_fim
       and ((select escopo_regional(p_regional_id)) is null
            or regional_id = (select escopo_regional(p_regional_id)))
     group by 1
  ),
  real_ as (
    select date_trunc('month', b.data_pagamento)::date as mes,
           sum(b.valor_liquido) filter (where l.tipo = 'RECEITA') as entrada,
           sum(b.valor_liquido) filter (where l.tipo = 'DESPESA')  as saida
      from baixas_financeiras b
      join lancamentos_financeiros l on l.id = b.lancamento_id
     where l.status <> 'cancelado'
       and b.data_pagamento between p_data_inicio and p_data_fim
       and ((select escopo_regional(p_regional_id)) is null
            or l.regional_id = (select escopo_regional(p_regional_id)))
     group by 1
  )
  select m.mes,
         coalesce(prev.entrada, 0), coalesce(prev.saida, 0),
         coalesce(real_.entrada, 0), coalesce(real_.saida, 0),
         coalesce(prev.entrada, 0) - coalesce(prev.saida, 0),
         coalesce(real_.entrada, 0) - coalesce(real_.saida, 0)
    from meses m
    left join prev  on prev.mes  = m.mes
    left join real_ on real_.mes = m.mes
   order by m.mes;
$$;

-- Aging da carteira: quanto esta a vencer e ha quanto tempo esta vencido.
create or replace function financeiro_aging(p_regional_id uuid default null)
returns table (
  tipo   tipo_movimentacao,
  faixa  text,
  ordem  integer,
  titulos integer,
  total  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select tipo, valor_saldo,
           (current_date - data_vencimento) as dias
      from lancamentos_financeiros
     where status not in ('cancelado', 'quitado')
       and coalesce(valor_saldo, 0) > 0
       and ((select escopo_regional(p_regional_id)) is null
            or regional_id = (select escopo_regional(p_regional_id)))
  ),
  classificado as (
    select tipo, valor_saldo,
           case when dias <= 0 then 1
                when dias <= 30 then 2
                when dias <= 60 then 3
                when dias <= 90 then 4
                else 5 end as ordem
      from base
  )
  select tipo,
         (array['A vencer', 'Vencido 1-30 dias', 'Vencido 31-60 dias',
                'Vencido 61-90 dias', 'Vencido +90 dias'])[ordem],
         ordem,
         count(*)::int,
         round(sum(valor_saldo), 2)
    from classificado
   group by tipo, ordem
   order by tipo, ordem;
$$;

-- Quita o saldo remanescente de um titulo em uma unica baixa.
create or replace function quitar_lancamento(
  p_lancamento_id     uuid,
  p_data_pagamento    date default current_date,
  p_conta_bancaria_id uuid default null
)
returns baixas_financeiras
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_saldo numeric;
  v_baixa baixas_financeiras;
begin
  select valor_saldo into v_saldo
    from lancamentos_financeiros where id = p_lancamento_id;

  if v_saldo is null then
    raise exception 'Lancamento nao encontrado' using errcode = 'no_data_found';
  end if;
  if v_saldo <= 0 then
    raise exception 'Lancamento ja esta quitado' using errcode = 'check_violation';
  end if;

  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id)
  values (p_lancamento_id, p_data_pagamento, v_saldo, v_saldo, p_conta_bancaria_id)
  returning * into v_baixa;

  return v_baixa;
end;
$$;

-- ----------------------------------------------------------------------------
-- Plano de contas: categorias operacionais que faltavam para o dia a dia.
-- ----------------------------------------------------------------------------
insert into categorias_dre (codigo_estruturado, nome, tipo) values
  ('1.2.02', 'Receita Financeira (juros/multas)',   'RECEITA'),
  ('1.9.99', 'Receitas nao classificadas',          'RECEITA'),
  ('3.1.03', 'Custo de Vistoria e Rastreamento',    'CUSTO_VARIAVEL'),
  ('3.2.02', 'Taxas de Cobranca e Gateway',         'CUSTO_VARIAVEL'),
  ('4.1.04', 'Encargos e Beneficios',               'DESPESA_FIXA'),
  ('4.1.05', 'Servicos de Terceiros (contabil/juridico)', 'DESPESA_FIXA'),
  ('4.2.02', 'Despesas Administrativas',            'DESPESA_FIXA'),
  ('4.3.01', 'Impostos e Taxas',                    'DESPESA_FIXA'),
  ('4.9.99', 'Despesas nao classificadas',          'DESPESA_FIXA')
on conflict (codigo_estruturado) do nothing;

grant execute on function escopo_regional(uuid) to authenticated;
grant execute on function dre_movimentos(date, date, uuid, text) to authenticated;
grant execute on function gerar_dre_completo(date, date, uuid, text, uuid) to authenticated;
grant execute on function gerar_dre_resumo_completo(date, date, uuid, text, uuid) to authenticated;
grant execute on function gerar_dre_mensal(date, date, uuid, text, uuid) to authenticated;
grant execute on function financeiro_resumo(date, date, uuid) to authenticated;
grant execute on function financeiro_fluxo_mensal(date, date, uuid) to authenticated;
grant execute on function financeiro_aging(uuid) to authenticated;
grant execute on function quitar_lancamento(uuid, date, uuid) to authenticated;
