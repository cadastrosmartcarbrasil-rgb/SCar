-- ============================================================================
-- SCar :: 0061_assistencia_painel.sql
-- PAINEL GERENCIAL da Assistencia 24h — a aba da Visao Geral.
--
-- O modulo 0026 resolveu a OPERACAO (abrir, cotar, autorizar OS, pagar o
-- prestador). O que faltava era a leitura de GESTAO: assistencia e a maior
-- saida de caixa da protecao veicular e ninguem enxergava quanto consome,
-- por que e ONDE.
--
-- Fonte: `acionamentos_assistencia` (a OS). Nada de captura nova — o custo aqui
-- e o `valor_total` que ja virou titulo no Contas a Pagar, nao estimativa
-- digitada; a praca sai do `origem` jsonb que a tela de trajeto ja preenche.
--
-- Somente LEITURA. Todas SECURITY DEFINER + `escopo_regional` (0032): quem nao
-- tem acesso global so enxerga a propria unidade, mesmo passando outro
-- p_regional_id.
-- ============================================================================

-- Agrupamento de praca: 'Sao Paulo', 'SÃO PAULO' e ' sao paulo ' na mesma linha.
create or replace function norm_cidade(p_texto text)
returns text
language sql immutable
as $$
  select nullif(
           upper(trim(translate(coalesce(p_texto, ''),
             'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
             'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))),
           '');
$$;

-- ----------------------------------------------------------------------------
-- Fonte unica do painel. CANCELADO nunca entra (nao consumiu nada e nao gerou
-- titulo). A praca cai no endereco do associado quando a OS nao tem origem —
-- so vira 'NAO INFORMADO' se nem isso existir.
-- ----------------------------------------------------------------------------
create or replace function assist_painel_movimentos(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null
)
returns table (
  id           uuid,
  veiculo_id   uuid,
  cliente_id   uuid,
  servico_id   uuid,
  servico      text,
  cidade       text,
  uf           text,
  status       status_acionamento,
  custo        numeric,
  km           numeric,
  aberto_em    timestamptz,
  concluido_em timestamptz,
  horas        numeric
)
language sql stable security definer set search_path = public
as $$
  select a.id,
         a.veiculo_id,
         a.cliente_id,
         a.servico_id,
         coalesce(s.descricao, 'NAO INFORMADO'),
         coalesce(norm_cidade(a.origem->>'cidade'),
                  norm_cidade(c.endereco->>'cidade'),
                  'NAO INFORMADO'),
         coalesce(nullif(upper(trim(a.origem->>'uf')), ''),
                  nullif(upper(trim(c.endereco->>'estado')), ''),
                  'NF'),
         a.status,
         coalesce(a.valor_total, 0)::numeric,
         a.km_percorrido,
         a.created_at,
         a.concluido_em,
         case when a.concluido_em is null then null
              else round(extract(epoch from (a.concluido_em - a.created_at)) / 3600.0, 2)
         end
    from acionamentos_assistencia a
    join clientes c on c.id = a.cliente_id
    left join servicos_assistencia s on s.id = a.servico_id
   where a.status <> 'CANCELADO'
     and a.created_at::date between p_data_inicio and p_data_fim
     and ((select escopo_regional(p_regional_id)) is null
            or a.regional_id = (select escopo_regional(p_regional_id)));
$$;

-- ----------------------------------------------------------------------------
-- Cabecalho: frota por situacao + volume, indice, SLA e custo.
-- `custo_por_veiculo` e o numero que vira preco: quanto a 24h pesa por veiculo
-- ativo no periodo.
-- ----------------------------------------------------------------------------
create or replace function assist_painel_resumo(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null
)
returns table (
  veiculos_total       bigint,
  veiculos_ativos      bigint,
  veiculos_inativos    bigint,
  veiculos_bloqueados  bigint,
  acionamentos         bigint,
  acionamentos_hoje    bigint,
  acionamentos_abertos bigint,
  media_diaria         numeric,
  indice_acionamento   numeric,
  tempo_medio_horas    numeric,
  custo_total          numeric,
  custo_medio          numeric,
  custo_por_veiculo    numeric,
  veiculos_acionaram   bigint,
  reincidentes         bigint
)
language sql stable security definer set search_path = public
as $$
  with frota as (
    select count(*)                                                    as total,
           count(*) filter (where v.status = 'ativo')                   as ativos,
           count(*) filter (where v.status = 'suspenso')                as bloqueados,
           count(*) filter (where v.status not in ('ativo','suspenso')) as inativos
      from veiculos v
     where ((select escopo_regional(p_regional_id)) is null
              or v.regional_id = (select escopo_regional(p_regional_id)))
  ),
  mov as (select * from assist_painel_movimentos(p_data_inicio, p_data_fim, p_regional_id)),
  porveic as (select veiculo_id, count(*) as n from mov group by veiculo_id),
  dias as (select greatest(1, (least(p_data_fim, current_date) - p_data_inicio) + 1)::numeric as d)
  select f.total, f.ativos, f.inativos, f.bloqueados,
         (select count(*) from mov),
         (select count(*) from mov where aberto_em::date = current_date),
         (select count(*) from mov where status in ('ABERTO','EM_COTACAO','AUTORIZADO','EM_ATENDIMENTO')),
         round((select count(*) from mov)::numeric / (select d from dias), 2),
         case when f.ativos > 0 then round((select count(*) from mov)::numeric / f.ativos, 4) else 0 end,
         coalesce((select round(avg(horas), 2) from mov where horas is not null), 0),
         coalesce((select sum(custo) from mov), 0),
         coalesce((select round(avg(custo), 2) from mov where custo > 0), 0),
         case when f.ativos > 0
              then round(coalesce((select sum(custo) from mov), 0) / f.ativos, 2) else 0 end,
         (select count(*) from porveic),
         (select count(*) from porveic where n >= 2)
    from frota f;
$$;

-- ----------------------------------------------------------------------------
-- Por SERVICO: o "motivo" do acionamento ja e o catalogo parametrizado (0026).
-- Traz junto a regra de limite e QUANTOS VEICULOS JA ESTAO NO TETO — o alerta
-- que importa para revisar plano/preco.
-- ----------------------------------------------------------------------------
create or replace function assist_painel_por_servico(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null
)
returns table (
  servico_id        uuid,
  servico           text,
  acionamentos      bigint,
  veiculos          bigint,
  custo             numeric,
  custo_medio       numeric,
  computa_limite    boolean,
  limite_quantidade integer,
  janela_meses      integer,
  veiculos_no_limite bigint
)
language sql stable security definer set search_path = public
as $$
  with mov as (select * from assist_painel_movimentos(p_data_inicio, p_data_fim, p_regional_id)),
  -- Consumo do limite conta a JANELA DA REGRA (meses), nao o periodo do filtro,
  -- e so os status que consomem cota — mesma regra de elegibilidade_assistencia.
  no_limite as (
    select a.servico_id, count(*) as veiculos
      from (
        select a.servico_id, a.veiculo_id, count(*) as usos
          from acionamentos_assistencia a
          join servicos_assistencia s on s.id = a.servico_id
         where s.computa_limite
           and a.status in ('AUTORIZADO','EM_ATENDIMENTO','CONCLUIDO')
           and a.created_at >= now() - make_interval(months => s.limite_janela_meses)
           and ((select escopo_regional(p_regional_id)) is null
                  or a.regional_id = (select escopo_regional(p_regional_id)))
         group by a.servico_id, a.veiculo_id, s.limite_quantidade
        having count(*) >= max(s.limite_quantidade)
      ) a
     group by a.servico_id
  )
  select m.servico_id,
         max(m.servico),
         count(*),
         count(distinct m.veiculo_id),
         coalesce(sum(m.custo), 0),
         case when count(*) filter (where m.custo > 0) > 0
              then round(sum(m.custo) / count(*) filter (where m.custo > 0), 2) else 0 end,
         coalesce(max(s.computa_limite::int)::boolean, false),
         max(s.limite_quantidade),
         max(s.limite_janela_meses),
         coalesce(max(nl.veiculos), 0)
    from mov m
    left join servicos_assistencia s on s.id = m.servico_id
    left join no_limite nl on nl.servico_id = m.servico_id
   group by m.servico_id
   order by count(*) desc, max(m.servico);
$$;

-- ----------------------------------------------------------------------------
-- ONDE acontece. A frota da praca vem junto: 30 acionamentos em 200 veiculos e
-- problema; em 3.000, e ruido. E a TAXA que aponta o alvo, nao o volume.
-- ----------------------------------------------------------------------------
create or replace function assist_painel_por_praca(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null,
  p_limite      integer default 10
)
returns table (
  cidade       text,
  uf           text,
  acionamentos bigint,
  custo        numeric,
  veiculos     bigint,
  taxa         numeric
)
language sql stable security definer set search_path = public
as $$
  with mov as (select * from assist_painel_movimentos(p_data_inicio, p_data_fim, p_regional_id)),
  frota as (
    select coalesce(norm_cidade(c.endereco->>'cidade'), 'NAO INFORMADO') as cidade,
           coalesce(nullif(upper(trim(c.endereco->>'estado')), ''), 'NF') as uf,
           count(*) as veiculos
      from veiculos v
      join clientes c on c.id = v.cliente_id
     where ((select escopo_regional(p_regional_id)) is null
              or v.regional_id = (select escopo_regional(p_regional_id)))
     group by 1, 2
  )
  select m.cidade, m.uf, count(*), coalesce(sum(m.custo), 0),
         coalesce(f.veiculos, 0),
         case when coalesce(f.veiculos, 0) > 0
              then round(count(*)::numeric / f.veiculos, 4) else 0 end
    from mov m
    left join frota f on f.cidade = m.cidade and f.uf = m.uf
   group by m.cidade, m.uf, f.veiculos
   order by count(*) desc, m.cidade
   limit greatest(1, coalesce(p_limite, 10));
$$;

-- ----------------------------------------------------------------------------
-- Tendencia: custo e volume por mes.
-- ----------------------------------------------------------------------------
create or replace function assist_painel_serie(
  p_meses       integer default 12,
  p_regional_id uuid default null
)
returns table (competencia date, acionamentos bigint, custo numeric)
language sql stable security definer set search_path = public
as $$
  with meses as (
    select generate_series(
             date_trunc('month', current_date)::date
               - ((greatest(1, coalesce(p_meses, 12)) - 1) || ' months')::interval,
             date_trunc('month', current_date)::date,
             '1 month')::date as m
  ),
  mov as (
    select date_trunc('month', aberto_em)::date as m, custo
      from assist_painel_movimentos(
             (select min(m) from meses),
             (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
             p_regional_id)
  )
  select meses.m, count(mov.m), coalesce(sum(mov.custo), 0)
    from meses left join mov on mov.m = meses.m
   group by meses.m
   order by meses.m;
$$;

-- ----------------------------------------------------------------------------
-- Reincidencia: quem mais aciona (alvo de vistoria, revisao de plano ou preco).
-- ----------------------------------------------------------------------------
create or replace function assist_painel_reincidencia(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null,
  p_limite      integer default 10
)
returns table (
  veiculo_id   uuid,
  placa        text,
  descricao    text,
  associado    text,
  acionamentos bigint,
  custo        numeric,
  ultimo_uso   timestamptz
)
language sql stable security definer set search_path = public
as $$
  select v.id, v.placa,
         nullif(trim(coalesce(v.marca, '') || ' ' || coalesce(v.modelo, '')), ''),
         c.nome_razao_social,
         count(*), coalesce(sum(m.custo), 0), max(m.aberto_em)
    from assist_painel_movimentos(p_data_inicio, p_data_fim, p_regional_id) m
    join veiculos v on v.id = m.veiculo_id
    join clientes c on c.id = m.cliente_id
   group by v.id, v.placa, v.marca, v.modelo, c.nome_razao_social
   order by count(*) desc, sum(m.custo) desc nulls last
   limit greatest(1, coalesce(p_limite, 10));
$$;

-- ----------------------------------------------------------------------------
-- Frota por situacao (a barra do topo).
-- ----------------------------------------------------------------------------
create or replace function assist_painel_frota_situacao(p_regional_id uuid default null)
returns table (situacao text, quantidade bigint)
language sql stable security definer set search_path = public
as $$
  select v.status::text, count(*)
    from veiculos v
   where ((select escopo_regional(p_regional_id)) is null
            or v.regional_id = (select escopo_regional(p_regional_id)))
   group by v.status
   order by count(*) desc;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================
grant execute on function norm_cidade(text) to authenticated;
grant execute on function assist_painel_movimentos(date, date, uuid) to authenticated;
grant execute on function assist_painel_resumo(date, date, uuid) to authenticated;
grant execute on function assist_painel_por_servico(date, date, uuid) to authenticated;
grant execute on function assist_painel_por_praca(date, date, uuid, integer) to authenticated;
grant execute on function assist_painel_serie(integer, uuid) to authenticated;
grant execute on function assist_painel_reincidencia(date, date, uuid, integer) to authenticated;
grant execute on function assist_painel_frota_situacao(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Rito de seguranca (0052): funcao nasce com EXECUTE para PUBLIC, e o painel
-- le a carteira inteira — nao pode ficar ao alcance da chave anon.
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
