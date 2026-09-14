-- ============================================================================
-- SCar :: 0078_regionais_painel.sql
-- PAINEL EXECUTIVO DAS REGIONAIS — o controle da matriz sobre as unidades.
--
-- O portal `/regional` (0036) e a OPERACAO de UMA franquia: a matriz entra
-- nela, uma por vez. O que faltava era a leitura de CIMA — quantas unidades
-- existem, qual cresce, qual perde carteira, qual gasta mais com evento do que
-- arrecada. Esse painel e consolidado por natureza, entao ele mora no sistema
-- da matriz (`/regionais`), nao dentro do portal de uma unidade.
--
-- TRES DECISOES REGISTRADAS AQUI:
--
-- 1) CHURN PASSA A TER DATA. O cadastro tinha `data_ativacao` (0025) e nenhuma
--    data de SAIDA — "cancelados no periodo" so podia ser adivinhado pelo
--    `updated_at`, que qualquer correcao de ficha mexe. Agora existe
--    `veiculos.data_saida`, carimbada por trigger no mesmo padrao do
--    `trg_veiculo_marca_ativacao`. Saida e definitiva (inativo/baixado/
--    excluido); SUSPENSO nao e saida — o associado devendo continua na
--    carteira, e quem mostra isso e o indicador de inadimplencia.
--
-- 2) A CARTEIRA E LIDA PELAS DATAS, nao pelo status de hoje. "Ativos" = quem
--    ja foi ativado e ainda nao saiu NA DATA consultada. E o que permite
--    comparar com o periodo anterior; `status` sozinho so sabe o agora.
--
-- 3) O INTERVALO DE CONTAS e institucional, nao do navegador. Ele muda o
--    "Valor Recebido" que a diretoria le — dois gestores nao podem ver
--    numeros diferentes porque um mexeu no proprio localStorage. Fica em
--    `empresa` (junto da logo), com escrita so para `tem_acesso_global()`.
--
-- Somente LEITURA nas consultas. Todas SECURITY DEFINER + `escopo_regional`
-- (0032): gestor de unidade so ve a propria, mesmo passando outro id.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) data_saida — a data do churn
-- ----------------------------------------------------------------------------
alter table veiculos add column if not exists data_saida date;

comment on column veiculos.data_saida is
  'Dia em que o veiculo DEIXOU a base (inativo/baixado/excluido). Nulo = esta '
  'na carteira. Suspenso NAO preenche: debito nao e saida. Carimbada por '
  'trg_veiculo_marca_saida; voltar para a base limpa o campo.';

create index if not exists idx_veiculos_data_saida   on veiculos (data_saida);
create index if not exists idx_veiculos_data_ativacao on veiculos (data_ativacao);

-- Fora da base = saida DEFINITIVA. Dois status ficam de fora de proposito:
--   . `suspenso` — bloqueio, nao cancelamento: o associado segue na carteira;
--   . `inadimplente` (0072) — e a TOLERANCIA entre "atrasou" e "acabou", e a
--     0072 registrou que ele CONTINUA FATURAVEL. Contar como churn faria o
--     indicador acusar perda de carteira antes de existir perda nenhuma.
create or replace function veiculo_fora_da_base(p_status status_veiculo)
returns boolean
language sql immutable
as $$
  select p_status::text in ('inativo', 'baixado', 'excluido');
$$;

comment on function veiculo_fora_da_base(status_veiculo) is
  'Saida definitiva da base (churn). suspenso e inadimplente NAO sao saida.';

create or replace function fn_veiculo_marca_saida()
returns trigger
language plpgsql
as $$
begin
  if veiculo_fora_da_base(new.status) then
    -- Ja estava fora? preserva a data original da saida.
    if new.data_saida is null then
      new.data_saida := current_date;
    end if;
  else
    -- Voltou para a base: a saida deixa de existir.
    new.data_saida := null;
  end if;
  return new;
end;
$$;

-- `create trigger` nao aceita `if not exists` (gotcha da 0044/0049).
-- Convive com `trg_veiculo_marca_ativacao` (0025) e `trg_veiculo_status_desde`
-- (0072): sao tres BEFORE na mesma tabela, cada um carimbando SUA coluna.
drop trigger if exists trg_veiculo_marca_saida on veiculos;
create trigger trg_veiculo_marca_saida
  before insert or update of status on veiculos
  for each row execute function fn_veiculo_marca_saida();

-- Backfill do historico: quem ja esta fora da base nunca teve a data gravada.
-- O `updated_at` e a melhor aproximacao existente e so vale para o passado —
-- daqui para frente a trigger carimba o dia certo.
update veiculos
   set data_saida = coalesce(data_saida, updated_at::date)
 where veiculo_fora_da_base(status)
   and data_saida is null;

-- ----------------------------------------------------------------------------
-- B) Intervalo de contas do plano de contas (a engrenagem do painel)
-- ----------------------------------------------------------------------------
alter table empresa
  add column if not exists painel_conta_de  text,
  add column if not exists painel_conta_ate text;

comment on column empresa.painel_conta_de is
  'Codigo estruturado inicial do plano de contas que alimenta o painel das '
  'regionais (ex.: 1.0.00). Nulo = sem recorte, todas as contas entram.';
comment on column empresa.painel_conta_ate is
  'Codigo estruturado final. Nulo = sem recorte.';

-- Comparar codigo de conta como TEXTO mente: '1.10.00' < '1.9.99'. Cada
-- segmento vai para 4 digitos para o `between` ordenar como numero.
create or replace function codigo_conta_ordenavel(p_codigo text)
returns text
language sql immutable
as $$
  select coalesce((
    select string_agg(lpad(nullif(regexp_replace(s, '\D', '', 'g'), ''), 4, '0'), '.' order by o)
      from regexp_split_to_table(coalesce(p_codigo, ''), '\.') with ordinality as t(s, o)
  ), '');
$$;

-- Dentro do recorte? Limite nulo = aberto daquele lado.
create or replace function conta_no_intervalo(p_codigo text, p_de text, p_ate text)
returns boolean
language sql immutable
as $$
  select (p_de  is null or codigo_conta_ordenavel(p_codigo) >= codigo_conta_ordenavel(p_de))
     and (p_ate is null or codigo_conta_ordenavel(p_codigo) <= codigo_conta_ordenavel(p_ate));
$$;

create or replace function intervalo_contas_painel()
returns table (conta_de text, conta_ate text)
language sql stable security definer set search_path = public
as $$
  select nullif(trim(e.painel_conta_de), ''), nullif(trim(e.painel_conta_ate), '')
    from empresa e
   where is_staff() or auth.uid() is null
   order by e.created_at
   limit 1;
$$;

create or replace function salvar_intervalo_contas_painel(
  p_conta_de  text default null,
  p_conta_ate text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_de  text := nullif(trim(coalesce(p_conta_de, '')), '');
  v_ate text := nullif(trim(coalesce(p_conta_ate, '')), '');
  v_id  uuid;
begin
  if not tem_acesso_global() then
    raise exception 'Somente a diretoria (admin/financeiro) define o intervalo de contas do painel';
  end if;

  if v_de is not null and v_de !~ '^[0-9]+(\.[0-9]+)*$' then
    raise exception 'Codigo de conta invalido: %. Use apenas numeros e pontos (ex.: 1.0.00)', v_de;
  end if;
  if v_ate is not null and v_ate !~ '^[0-9]+(\.[0-9]+)*$' then
    raise exception 'Codigo de conta invalido: %. Use apenas numeros e pontos (ex.: 3.9.99)', v_ate;
  end if;
  if v_de is not null and v_ate is not null
     and codigo_conta_ordenavel(v_de) > codigo_conta_ordenavel(v_ate) then
    raise exception 'A conta inicial (%) e maior que a final (%)', v_de, v_ate;
  end if;

  select id into v_id from empresa order by created_at limit 1;
  if v_id is null then
    raise exception 'Cadastro da empresa nao encontrado. Preencha Configuracoes > Empresa primeiro';
  end if;

  update empresa set painel_conta_de = v_de, painel_conta_ate = v_ate where id = v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- C) Fonte unica da FROTA: quem estava na base numa data.
--    `p_data` nula = hoje. A leitura e por DATA, nunca por status (ver a
--    decisao 2 no cabecalho).
-- ----------------------------------------------------------------------------
create or replace function frota_na_base(p_data date, p_regional_id uuid default null)
returns bigint
language sql stable security definer set search_path = public
as $$
  select count(*)
    from veiculos v
   where (is_staff() or auth.uid() is null)
     and v.data_ativacao is not null
     and v.data_ativacao <= coalesce(p_data, current_date)
     and (v.data_saida is null or v.data_saida > coalesce(p_data, current_date))
     and ((select escopo_regional(p_regional_id)) is null
            or v.regional_id = (select escopo_regional(p_regional_id)));
$$;

-- ----------------------------------------------------------------------------
-- D) RESUMO — os 9 indicadores do cabecalho, com o periodo anterior de mesmo
--    tamanho ao lado (e a variacao que o cartao mostra).
--
--    O que e do PERIODO: ativos (ao fim), cancelados, sinistros abertos,
--    recebido, gasto com evento.
--    O que e POSICIONAL (independe do periodo, igual ao `financeiro_resumo`):
--    inadimplencia e a receber. Dinheiro em atraso e um retrato de hoje.
-- ----------------------------------------------------------------------------
create or replace function regionais_painel_resumo(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null,
  p_conta_de    text default null,
  p_conta_ate   text default null
)
returns table (
  veiculos_ativos        bigint,
  veiculos_ativos_antes  bigint,
  veiculos_inadimplentes bigint,
  veiculos_cancelados    bigint,
  veiculos_cancelados_antes bigint,
  veiculos_em_evento     bigint,
  veiculos_novos         bigint,
  carteira_ativa         numeric,
  valor_recebido         numeric,
  valor_recebido_antes   numeric,
  valor_inadimplente     numeric,
  valor_a_receber        numeric,
  gasto_eventos          numeric,
  gasto_eventos_antes    numeric,
  regionais_total        bigint
)
language sql stable security definer set search_path = public
as $$
  with rec as (
    select coalesce(p_conta_de,  (select conta_de  from intervalo_contas_painel())) as de,
           coalesce(p_conta_ate, (select conta_ate from intervalo_contas_painel())) as ate
  ),
  -- Periodo anterior de MESMO tamanho, encostado no inicio deste.
  ant as (
    select (p_data_inicio - (p_data_fim - p_data_inicio) - 1)::date as inicio,
           (p_data_inicio - 1)::date                               as fim
  ),
  esc as (
    select case when is_staff() or auth.uid() is null
                then escopo_regional(p_regional_id)
                else '00000000-0000-0000-0000-000000000000'::uuid end as rid
  ),
  frota as (
    select v.id, v.cliente_id, coalesce(v.regional_id, c.regional_id) as regional_id,
           v.data_ativacao, v.data_saida, v.status, v.valor_mensalidade
      from veiculos v
      join clientes c on c.id = v.cliente_id
     where ((select rid from esc) is null or v.regional_id = (select rid from esc))
  ),
  -- Mensalidade contratada: o que esta na ficha e, na falta dela, o que o
  -- ULTIMO titulo emitido cobrou. Nao chamamos `cotar_plano` por veiculo aqui:
  -- o painel varre a carteira inteira e a cotacao e caro demais para isso.
  mensalidade as (
    select f.id,
           coalesce(f.valor_mensalidade, (
             select t.valor from titulos_financeiros t
              where t.veiculo_id = f.id and t.status <> 'cancelado'
              order by t.data_vencimento desc, t.created_at desc limit 1
           ), 0) as valor
      from frota f
     where f.data_ativacao is not null
       and f.data_ativacao <= p_data_fim
       and (f.data_saida is null or f.data_saida > p_data_fim)
  ),
  titulos as (
    select t.*, coalesce(v.regional_id, c.regional_id) as regional_id
      from titulos_financeiros t
      join clientes c on c.id = t.cliente_id
      left join veiculos v on v.id = t.veiculo_id
     where t.status <> 'cancelado'
       and ((select rid from esc) is null
              or coalesce(v.regional_id, c.regional_id) = (select rid from esc))
  ),
  -- Gasto com evento em regime de CAIXA: as baixas dos titulos ligados a um
  -- evento/sinistro ou ao centro de custo da Assistencia 24h (guincho). Nota
  -- fiscal nao entra aqui para nao contar duas vezes o que virou titulo —
  -- mesma regra do `dre_movimentos`.
  gasto as (
    select b.data_pagamento::date as dia, b.valor_liquido as valor
      from baixas_financeiras b
      join lancamentos_financeiros l on l.id = b.lancamento_id
      left join categorias_dre cat on cat.id = l.categoria_dre_id
     where l.tipo = 'DESPESA'
       and l.status <> 'cancelado'
       and (l.evento_id is not null
            or l.centro_custo_id = (select id from centros_custo where codigo = 'ASSIST24'))
       and ((select rid from esc) is null or l.regional_id = (select rid from esc))
       and conta_no_intervalo(coalesce(cat.codigo_estruturado, case when l.tipo = 'RECEITA' then '1.9.99' else '4.9.99' end),
                          (select de from rec), (select ate from rec))
  ),
  recebido as (
    select d.data as dia, d.valor
      from dre_movimentos(
             (select inicio from ant),
             p_data_fim,
             p_regional_id,
             'CAIXA') d
     where d.valor > 0
       and conta_no_intervalo(d.categoria_codigo, (select de from rec), (select ate from rec))
  )
  select
    frota_na_base(p_data_fim, p_regional_id),
    frota_na_base((p_data_inicio - 1)::date, p_regional_id),
    (select count(distinct t.veiculo_id) from titulos t
      where t.veiculo_id is not null and t.data_pagamento is null
        and t.data_vencimento < current_date),
    (select count(*) from frota f where f.data_saida between p_data_inicio and p_data_fim),
    (select count(*) from frota f
      where f.data_saida between (select inicio from ant) and (select fim from ant)),
    (select count(distinct e.veiculo_id) from eventos_sinistro e
      where e.status::text not in ('CONCLUIDO', 'NEGADO')
        and ((select rid from esc) is null or e.regional_id = (select rid from esc))),
    (select count(*) from frota f where f.data_ativacao between p_data_inicio and p_data_fim),
    (select coalesce(round(sum(valor), 2), 0) from mensalidade),
    (select coalesce(round(sum(valor), 2), 0) from recebido
      where dia between p_data_inicio and p_data_fim),
    (select coalesce(round(sum(valor), 2), 0) from recebido
      where dia between (select inicio from ant) and (select fim from ant)),
    (select coalesce(round(sum(t.valor), 2), 0) from titulos t
      where t.data_pagamento is null and t.data_vencimento < current_date),
    (select coalesce(round(sum(t.valor), 2), 0) from titulos t
      where t.data_pagamento is null and t.data_vencimento >= current_date),
    (select coalesce(round(sum(valor), 2), 0) from gasto
      where dia between p_data_inicio and p_data_fim),
    (select coalesce(round(sum(valor), 2), 0) from gasto
      where dia between (select inicio from ant) and (select fim from ant)),
    (select count(*) from regionais r
      where (select rid from esc) is null or r.id = (select rid from esc));
$$;

-- ----------------------------------------------------------------------------
-- E) SERIE TEMPORAL — a evolucao no periodo.
--    A granularidade se ajusta ao tamanho do periodo (dia / semana / mes):
--    365 pontos num grafico de 30 dias e ruido, e 30 barras num ano esconde
--    a tendencia.
--    `ativos` e `inadimplentes` sao RETRATOS no fim de cada balde (posicao),
--    `sinistros`, `recebido` e `gasto` sao SOMAS do balde (fluxo).
-- ----------------------------------------------------------------------------
create or replace function regionais_painel_serie(
  p_data_inicio   date,
  p_data_fim      date,
  p_regional_id   uuid default null,
  p_granularidade text default null,
  p_conta_de      text default null,
  p_conta_ate     text default null
)
returns table (
  balde         date,
  fim_balde     date,
  granularidade text,
  ativos        bigint,
  inadimplentes bigint,
  sinistros     bigint,
  recebido      numeric,
  gasto_eventos numeric
)
language sql stable security definer set search_path = public
as $$
  with rec as (
    select coalesce(p_conta_de,  (select conta_de  from intervalo_contas_painel())) as de,
           coalesce(p_conta_ate, (select conta_ate from intervalo_contas_painel())) as ate
  ),
  esc as (
    select case when is_staff() or auth.uid() is null
                then escopo_regional(p_regional_id)
                else '00000000-0000-0000-0000-000000000000'::uuid end as rid
  ),
  g as (
    select coalesce(nullif(upper(trim(coalesce(p_granularidade, ''))), ''),
                    case when (p_data_fim - p_data_inicio) <= 45  then 'DIA'
                         when (p_data_fim - p_data_inicio) <= 200 then 'SEMANA'
                         else 'MES' end) as gr
  ),
  baldes as (
    select d::date as balde,
           least(p_data_fim,
                 case (select gr from g)
                   when 'DIA'    then d::date
                   when 'SEMANA' then (d + interval '6 days')::date
                   else (d + interval '1 month - 1 day')::date
                 end) as fim_balde
      from generate_series(
             case (select gr from g)
               when 'DIA'    then p_data_inicio
               when 'SEMANA' then p_data_inicio
               else date_trunc('month', p_data_inicio)::date
             end,
             p_data_fim,
             case (select gr from g)
               when 'DIA'    then interval '1 day'
               when 'SEMANA' then interval '7 days'
               else interval '1 month'
             end) d
  ),
  inad as (
    select b.balde, count(distinct t.veiculo_id) as n
      from baldes b
      join titulos_financeiros t
        on t.data_vencimento < b.fim_balde
       and (t.data_pagamento is null or t.data_pagamento > b.fim_balde)
       and t.status <> 'cancelado'
       and t.veiculo_id is not null
      join veiculos v on v.id = t.veiculo_id
     where ((select rid from esc) is null or v.regional_id = (select rid from esc))
     group by b.balde
  ),
  sin as (
    select b.balde, count(*) as n
      from baldes b
      join eventos_sinistro e
        on e.data_ocorrencia between b.balde and b.fim_balde
     where ((select rid from esc) is null or e.regional_id = (select rid from esc))
     group by b.balde
  ),
  receb as (
    select b.balde, coalesce(sum(d.valor), 0) as v
      from baldes b
      left join (
        select data, valor from dre_movimentos(p_data_inicio, p_data_fim, p_regional_id, 'CAIXA')
         where valor > 0
           and conta_no_intervalo(categoria_codigo, (select de from rec), (select ate from rec))
      ) d on d.data between b.balde and b.fim_balde
     group by b.balde
  ),
  gasto as (
    select b.balde, coalesce(sum(x.valor), 0) as v
      from baldes b
      left join (
        select b2.data_pagamento::date as data, b2.valor_liquido as valor
          from baixas_financeiras b2
          join lancamentos_financeiros l on l.id = b2.lancamento_id
          left join categorias_dre cat on cat.id = l.categoria_dre_id
         where l.tipo = 'DESPESA'
           and l.status <> 'cancelado'
           and (l.evento_id is not null
                or l.centro_custo_id = (select id from centros_custo where codigo = 'ASSIST24'))
           and ((select rid from esc) is null or l.regional_id = (select rid from esc))
           and conta_no_intervalo(coalesce(cat.codigo_estruturado, case when l.tipo = 'RECEITA' then '1.9.99' else '4.9.99' end),
                          (select de from rec), (select ate from rec))
      ) x on x.data between b.balde and b.fim_balde
     group by b.balde
  )
  select b.balde, b.fim_balde, (select gr from g),
         frota_na_base(b.fim_balde, p_regional_id),
         coalesce(i.n, 0),
         coalesce(s.n, 0),
         round(coalesce(r.v, 0), 2),
         round(coalesce(gs.v, 0), 2)
    from baldes b
    left join inad  i  on i.balde  = b.balde
    left join sin   s  on s.balde  = b.balde
    left join receb r  on r.balde  = b.balde
    left join gasto gs on gs.balde = b.balde
   order by b.balde;
$$;

-- ----------------------------------------------------------------------------
-- F) COMPARATIVO POR REGIONAL — o ranking e a tabela detalhada.
--    Nao recebe p_regional_id de proposito: e a visao de todas. Quem nao tem
--    acesso global ve so a linha da propria unidade (`escopo_regional`).
--
--    SINISTRALIDADE = gasto com evento / recebido no periodo. E a conta que diz
--    se a unidade se paga: acima de 100% ela consome mais do que arrecada.
-- ----------------------------------------------------------------------------
create or replace function regionais_painel_comparativo(
  p_data_inicio date,
  p_data_fim    date,
  p_conta_de    text default null,
  p_conta_ate   text default null
)
returns table (
  regional_id       uuid,
  regional          text,
  cidade            text,
  uf                text,
  ativa             boolean,
  veiculos_ativos   bigint,
  veiculos_novos    bigint,
  veiculos_cancelados bigint,
  veiculos_inadimplentes bigint,
  inadimplencia     numeric,
  sinistros         bigint,
  recebido          numeric,
  gasto_eventos     numeric,
  resultado         numeric,
  sinistralidade    numeric
)
language sql stable security definer set search_path = public
as $$
  with rec as (
    select coalesce(p_conta_de,  (select conta_de  from intervalo_contas_painel())) as de,
           coalesce(p_conta_ate, (select conta_ate from intervalo_contas_painel())) as ate
  ),
  esc as (
    select case when is_staff() or auth.uid() is null
                then escopo_regional(null)
                else '00000000-0000-0000-0000-000000000000'::uuid end as rid
  ),
  -- A unidade INATIVADA (0067) continua na tabela, MARCADA: ela operou no
  -- periodo e esconde-la apagaria o historico justamente de quem foi fechada.
  uni as (
    select r.id, r.nome, coalesce(r.ativo, true) as ativa,
           nullif(upper(trim(coalesce(r.endereco->>'cidade', ''))), '')  as cidade,
           nullif(upper(trim(coalesce(r.endereco->>'uf',
                             r.endereco->>'estado', ''))), '')           as uf
      from regionais r
     where (select rid from esc) is null or r.id = (select rid from esc)
  ),
  frota as (
    select v.regional_id, v.id, v.data_ativacao, v.data_saida
      from veiculos v
     where v.regional_id is not null
  ),
  inad as (
    select v.regional_id, count(distinct t.veiculo_id) as n,
           coalesce(sum(t.valor), 0) as valor
      from titulos_financeiros t
      join veiculos v on v.id = t.veiculo_id
     where t.status <> 'cancelado'
       and t.data_pagamento is null
       and t.data_vencimento < current_date
     group by v.regional_id
  ),
  sin as (
    select e.regional_id, count(*) as n
      from eventos_sinistro e
     where e.data_ocorrencia between p_data_inicio and p_data_fim
       and e.regional_id is not null
     group by e.regional_id
  ),
  receb as (
    select l.regional_id, sum(b.valor_liquido) as v
      from baixas_financeiras b
      join lancamentos_financeiros l on l.id = b.lancamento_id
      left join categorias_dre cat on cat.id = l.categoria_dre_id
     where l.tipo = 'RECEITA'
       and l.status <> 'cancelado'
       and l.regional_id is not null
       and b.data_pagamento between p_data_inicio and p_data_fim
       and conta_no_intervalo(coalesce(cat.codigo_estruturado, case when l.tipo = 'RECEITA' then '1.9.99' else '4.9.99' end),
                          (select de from rec), (select ate from rec))
     group by l.regional_id
    union all
    -- Mensalidade do associado e titulo, nao lancamento: a unidade dela vem do
    -- veiculo (e o codigo de conta e o mesmo '1.1.00' do `dre_movimentos`).
    select v.regional_id, sum(coalesce(t.valor_pago, t.valor))
      from titulos_financeiros t
      join veiculos v on v.id = t.veiculo_id
     where t.status = 'pago'
       and t.data_pagamento between p_data_inicio and p_data_fim
       and v.regional_id is not null
       and not exists (select 1 from movimentacoes_caixa mc where mc.titulo_id = t.id)
       and conta_no_intervalo('1.1.00', (select de from rec), (select ate from rec))
     group by v.regional_id
  ),
  gasto as (
    select l.regional_id, sum(b.valor_liquido) as v
      from baixas_financeiras b
      join lancamentos_financeiros l on l.id = b.lancamento_id
      left join categorias_dre cat on cat.id = l.categoria_dre_id
     where l.tipo = 'DESPESA'
       and l.status <> 'cancelado'
       and l.regional_id is not null
       and b.data_pagamento between p_data_inicio and p_data_fim
       and (l.evento_id is not null
            or l.centro_custo_id = (select id from centros_custo where codigo = 'ASSIST24'))
       and conta_no_intervalo(coalesce(cat.codigo_estruturado, case when l.tipo = 'RECEITA' then '1.9.99' else '4.9.99' end),
                          (select de from rec), (select ate from rec))
     group by l.regional_id
  ),
  -- A frota por unidade sai de UMA passada (era subconsulta repetida quatro
  -- vezes: a mesma contagem para o numero, para a variacao e para o %).
  carteira as (
    select f.regional_id,
           count(*) filter (where f.data_ativacao <= p_data_fim
                              and (f.data_saida is null or f.data_saida > p_data_fim)) as ativos,
           count(*) filter (where f.data_ativacao between p_data_inicio and p_data_fim) as novos,
           count(*) filter (where f.data_saida between p_data_inicio and p_data_fim)    as cancelados
      from frota f
     where f.data_ativacao is not null
     group by f.regional_id
  ),
  dinheiro as (
    select u.id as regional_id,
           coalesce((select sum(v) from receb where regional_id = u.id), 0) as recebido,
           coalesce((select sum(v) from gasto where regional_id = u.id), 0) as gasto
      from uni u
  )
  select u.id, u.nome, coalesce(u.cidade, ''), coalesce(u.uf, ''), u.ativa,
         coalesce(k.ativos, 0),
         coalesce(k.novos, 0),
         coalesce(k.cancelados, 0),
         coalesce(i.n, 0),
         case when coalesce(k.ativos, 0) > 0
              then round(coalesce(i.n, 0)::numeric / k.ativos, 4) else 0 end,
         coalesce(s.n, 0),
         round(d.recebido, 2),
         round(d.gasto, 2),
         round(d.recebido - d.gasto, 2),
         case when d.recebido > 0 then round(d.gasto / d.recebido, 4) else 0 end
    from uni u
    join dinheiro d on d.regional_id = u.id
    left join carteira k on k.regional_id = u.id
    left join inad i on i.regional_id = u.id
    left join sin  s on s.regional_id = u.id
   order by coalesce(k.ativos, 0) desc, u.nome;
$$;

-- ----------------------------------------------------------------------------
-- G) O catalogo do plano de contas para o seletor da engrenagem.
-- ----------------------------------------------------------------------------
create or replace function contas_plano_painel()
returns table (codigo text, nome text, tipo tipo_categoria_dre)
language sql stable security definer set search_path = public
as $$
  select c.codigo_estruturado, c.nome, c.tipo
    from categorias_dre c
   where c.ativo
     and (is_staff() or auth.uid() is null)
   order by codigo_conta_ordenavel(c.codigo_estruturado);
$$;

-- ============================================================================
-- GRANTS + rito de seguranca (0052)
-- ============================================================================
grant execute on function veiculo_fora_da_base(status_veiculo)        to authenticated;
grant execute on function codigo_conta_ordenavel(text)                to authenticated;
grant execute on function conta_no_intervalo(text, text, text)        to authenticated;
grant execute on function intervalo_contas_painel()                   to authenticated;
grant execute on function salvar_intervalo_contas_painel(text, text)  to authenticated;
grant execute on function frota_na_base(date, uuid)                   to authenticated;
grant execute on function regionais_painel_resumo(date, date, uuid, text, text) to authenticated;
grant execute on function regionais_painel_serie(date, date, uuid, text, text, text) to authenticated;
grant execute on function regionais_painel_comparativo(date, date, text, text) to authenticated;
grant execute on function contas_plano_painel()                       to authenticated;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
