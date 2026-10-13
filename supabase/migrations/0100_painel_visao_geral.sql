-- ============================================================================
-- 0100_painel_visao_geral
--
-- A VISAO GERAL (`/dashboard`, aba "Visao Geral") foi desenhada no inicio do
-- projeto: 4 contadores, um grafico de titulos e o tacometro da inadimplencia,
-- tudo lido direto das tabelas pelo navegador. Depois dela vieram a carga do
-- Mutual (2.898 veiculos, 2.889 com `cobranca_externa`), as regionais, o CRM,
-- a 24h, os rastreadores — e o painel continuou contando titulo de mensalidade
-- numa base em que quase nenhum titulo e emitido aqui. O "MRR" mostrava ~zero
-- com R$ centenas de milhares de carteira contratada.
--
-- Esta migration cria UMA leitura, `painel_visao_geral(regional, meses)`, que
-- devolve o painel inteiro em jsonb. UMA chamada de proposito: a tela tem ~12
-- blocos e cada um seria uma requisicao — o mesmo padrao de disputa que
-- derrubava `/integracao/mutual` no teto de 8 s (ver CLAUDE.md, a fila).
--
-- Decisoes:
--  1. A FROTA E LIDA POR DATA (`data_ativacao`/`data_saida`), igual a
--     `frota_na_base` (0078) — status sozinho so sabe o agora, e a serie de
--     6 meses precisa do retrato do fim de cada mes.
--  2. A CARTEIRA MENSAL e `veiculos.valor_mensalidade` (o override que o
--     boleto usa, 0024) e, na falta dele, o ultimo titulo — a mesma regra do
--     `regionais_painel_resumo`. Nao chamamos `cotar_plano` por veiculo.
--  3. COBRANCA EXTERNA aparece separada: e quanto da carteira ainda e cobrada
--     pelo Mutual (0082). As MENSALIDADES nao sao lidas aqui: a tela usa
--     `cobranca_serie_mensal` (0097, modulo de cobranca), que ja junta o SCar e
--     o historico de boletos do Mutual — uma segunda leitura divergiria.
--  4. ISOLAMENTO: `escopo_regional()` — gestor de unidade recebe a propria,
--     qualquer que seja o id pedido; quem nao e staff (o associado do /portal
--     e `authenticated`, 0044/0052) recebe NULL.
--  5. So LEITURA. Nenhuma tabela, coluna ou policy muda.
-- ============================================================================

create or replace function painel_visao_geral(
  p_regional_id uuid    default null,
  p_meses       integer default 6
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_rid    uuid;
  v_hoje   date := current_date;
  v_mes    date := date_trunc('month', current_date)::date;
  v_mes_ant date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_meses  integer := least(greatest(coalesce(p_meses, 6), 3), 24);
  v_res    jsonb;
begin
  if not (is_staff() or auth.uid() is null) then
    return null;
  end if;
  v_rid := escopo_regional(p_regional_id);

  with
  frota as (
    select v.id, v.cliente_id, v.regional_id, v.tipo_veiculo_id, v.plano_protecao_id,
           v.status::text as status, v.data_ativacao, v.data_saida,
           v.cobranca_externa, v.valor_mensalidade
      from veiculos v
     where v_rid is null or v.regional_id = v_rid
  ),
  -- Quem esta na base HOJE (mesma regra de `frota_na_base`).
  base as (
    select f.*,
           coalesce(nullif(f.valor_mensalidade, 0), (
             select t.valor from titulos_financeiros t
              where t.veiculo_id = f.id and t.status <> 'cancelado'
              order by t.data_vencimento desc, t.created_at desc limit 1
           ), 0) as mensalidade
      from frota f
     where f.data_ativacao is not null
       and f.data_ativacao <= v_hoje
       and (f.data_saida is null or f.data_saida > v_hoje)
  ),
  meses as (
    select gs::date as inicio,
           (gs + interval '1 month' - interval '1 day')::date as fim
      from generate_series(v_mes - make_interval(months => v_meses - 1), v_mes, interval '1 month') gs
  ),
  eventos as (
    select e.id, e.status::text as status, e.created_at::date as dia,
           coalesce(te.nome, initcap(lower(e.tipo_evento::text)), 'Nao classificado') as tipo
      from eventos_sinistro e
      left join tipos_evento te on te.id = e.tipo_evento_id
     where v_rid is null or e.regional_id = v_rid
  ),
  acion as (
    select a.status::text as status, a.created_at::date as dia, a.valor_total
      from acionamentos_assistencia a
     where v_rid is null or a.regional_id = v_rid
  ),
  lds as (
    select l.status::text as status, l.created_at::date as dia, l.auditado_em::date as auditado
      from leads l
     where v_rid is null or l.regional_id = v_rid
  ),
  pagar as (
    select l.data_vencimento, l.valor_saldo
      from lancamentos_financeiros l
     where l.tipo = 'DESPESA'
       and l.status::text in ('pendente', 'pago_parcial', 'atrasado')
       and (v_rid is null or l.regional_id = v_rid)
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'regional_id', v_rid,

    -- ---------------- cabecalho ----------------
    'kpis', jsonb_build_object(
      'veiculos_base',        (select count(*) from base),
      'associados_base',      (select count(distinct cliente_id) from base),
      'carteira_mensal',      (select coalesce(round(sum(mensalidade), 2), 0) from base),
      'ticket_medio',         (select coalesce(round(avg(nullif(mensalidade, 0)), 2), 0) from base),
      'sem_valor',            (select count(*) from base where mensalidade = 0),
      'cobranca_externa',     (select count(*) from base where cobranca_externa),
      'carteira_externa',     (select coalesce(round(sum(mensalidade), 2), 0) from base where cobranca_externa),
      'adesoes_mes',          (select count(*) from frota where data_ativacao between v_mes and v_hoje),
      'adesoes_mes_anterior', (select count(*) from frota
                                where data_ativacao between v_mes_ant and (v_mes - 1)),
      'saidas_mes',           (select count(*) from frota where data_saida between v_mes and v_hoje),
      'saidas_mes_anterior',  (select count(*) from frota
                                where data_saida between v_mes_ant and (v_mes - 1)),
      'base_mes_anterior',    (select count(*) from frota
                                where data_ativacao is not null and data_ativacao <= (v_mes - 1)
                                  and (data_saida is null or data_saida > (v_mes - 1))),
      'inadimplentes',        (select count(*) from base where status = 'inadimplente'),
      'vistoria_pendente',    (select count(*) from base where status = 'vistoria_pendente'),
      'em_evento',            (select count(*) from base where status = 'em_evento'),
      'suspensos',            (select count(*) from base where status = 'suspenso'),
      'regionais',            (select count(*) from regionais r
                                where (v_rid is null or r.id = v_rid) and r.ativo)
    ),

    -- ---------------- distribuicao da carteira ----------------
    'por_regional', coalesce((
      select jsonb_agg(x order by x.veiculos desc) from (
        select coalesce(r.nome, 'MATRIZ (sem unidade)') as nome,
               count(*) as veiculos,
               count(distinct b.cliente_id) as associados,
               round(sum(b.mensalidade), 2) as carteira
          from base b left join regionais r on r.id = b.regional_id
         group by 1
      ) x), '[]'::jsonb),

    'por_uf', coalesce((
      select jsonb_agg(x order by x.veiculos desc) from (
        select coalesce(nullif(upper(trim(c.endereco->>'uf')), ''), '??') as uf,
               count(*) as veiculos
          from base b join clientes c on c.id = b.cliente_id
         group by 1
      ) x), '[]'::jsonb),

    'por_tipo', coalesce((
      select jsonb_agg(x order by x.veiculos desc) from (
        select coalesce(t.nome, 'Sem tipo') as nome, count(*) as veiculos,
               round(sum(b.mensalidade), 2) as carteira
          from base b left join tipos_veiculo t on t.id = b.tipo_veiculo_id
         group by 1
      ) x), '[]'::jsonb),

    'por_plano', coalesce((
      select jsonb_agg(x order by x.veiculos desc) from (
        select coalesce(p.nome, 'Sem plano') as nome, count(*) as veiculos
          from base b left join planos_protecao p on p.id = b.plano_protecao_id
         group by 1
      ) x), '[]'::jsonb),

    'por_status', coalesce((
      select jsonb_agg(x order by x.veiculos desc) from (
        select status, count(*) as veiculos from base group by 1
      ) x), '[]'::jsonb),

    -- ---------------- evolucao mensal ----------------
    -- `base_fim` e RETRATO no ultimo dia do mes (ou hoje, no mes corrente);
    -- o resto e SOMA do mes.
    'serie', coalesce((
      select jsonb_agg(x order by x.mes) from (
        select to_char(m.inicio, 'YYYY-MM') as mes,
               (select count(*) from frota f where f.data_ativacao between m.inicio and m.fim) as adesoes,
               (select count(*) from frota f where f.data_saida   between m.inicio and m.fim) as saidas,
               (select count(*) from frota f
                 where f.data_ativacao is not null
                   and f.data_ativacao <= least(m.fim, v_hoje)
                   and (f.data_saida is null or f.data_saida > least(m.fim, v_hoje))) as base_fim,
               (select count(*) from eventos e where e.dia between m.inicio and m.fim) as eventos,
               (select count(*) from acion a
                 where a.dia between m.inicio and m.fim and a.status <> 'CANCELADO') as acionamentos,
               (select count(*) from lds l where l.dia between m.inicio and m.fim) as leads
          from meses m
      ) x), '[]'::jsonb),

    -- ---------------- eventos / sinistros ----------------
    'eventos', jsonb_build_object(
      'abertos',      (select count(*) from eventos where status not in ('CONCLUIDO', 'NEGADO')),
      'novos_mes',    (select count(*) from eventos where dia >= v_mes),
      'concluidos',   (select count(*) from eventos where status = 'CONCLUIDO'),
      'negados',      (select count(*) from eventos where status = 'NEGADO'),
      'total',        (select count(*) from eventos),
      'por_status',   coalesce((select jsonb_agg(x) from (
                        select status, count(*) as n from eventos group by 1) x), '[]'::jsonb),
      'por_tipo',     coalesce((select jsonb_agg(x order by x.n desc) from (
                        select tipo, count(*) as n from eventos group by 1) x), '[]'::jsonb)
    ),

    -- ---------------- assistencia 24h ----------------
    'assistencia', jsonb_build_object(
      'mes',        (select count(*) from acion where dia >= v_mes and status <> 'CANCELADO'),
      'em_aberto',  (select count(*) from acion
                      where status in ('ABERTO', 'EM_COTACAO', 'AUTORIZADO', 'EM_ATENDIMENTO')),
      'custo_mes',  (select coalesce(round(sum(valor_total), 2), 0) from acion
                      where dia >= v_mes and status <> 'CANCELADO')
    ),

    -- ---------------- vendas ----------------
    'vendas', jsonb_build_object(
      'em_aberto',        (select count(*) from lds where status not in ('ATIVO', 'PERDIDO')),
      'novos_mes',        (select count(*) from lds where dia >= v_mes),
      'convertidos_mes',  (select count(*) from lds where status = 'ATIVO' and auditado >= v_mes),
      'funil', coalesce((select jsonb_agg(x) from (
                 select status, count(*) as n from lds group by 1) x), '[]'::jsonb)
    ),

    -- ---------------- contas a pagar ----------------
    -- As MENSALIDADES (SCar + historico do Mutual) a tela le de
    -- `cobranca_serie_mensal` (0097 da cobranca) — nao ha segunda leitura aqui.
    'pagar', jsonb_build_object(
      'em_aberto',  (select coalesce(round(sum(valor_saldo), 2), 0) from pagar),
      'proximos_7', (select coalesce(round(sum(valor_saldo), 2), 0) from pagar
                      where data_vencimento between v_hoje and v_hoje + 7),
      'vencido',    (select coalesce(round(sum(valor_saldo), 2), 0) from pagar
                      where data_vencimento < v_hoje)
    ),

    -- ---------------- rastreadores ----------------
    'rastreadores', jsonb_build_object(
      'instalados', (select count(*) from rastreadores r
                      where r.status::text = 'ATIVO' and (v_rid is null or r.regional_id = v_rid)),
      'estoque',    (select count(*) from rastreadores r
                      where r.status::text = 'DISPONIVEL' and (v_rid is null or r.regional_id = v_rid)),
      'inadimplentes', (select count(*) from rastreadores r
                      where r.status::text = 'INADIMPLENTE' and (v_rid is null or r.regional_id = v_rid))
    )
  ) into v_res;

  return v_res;
end;
$$;

comment on function painel_visao_geral(uuid, integer) is
  'Visao Geral do /dashboard (0100): o painel inteiro em uma leitura. Frota lida por data '
  '(como frota_na_base, 0078), carteira pelo override da ficha, escopo por escopo_regional; '
  'nao-staff recebe NULL. So leitura.';

-- ============================================================================
-- Rito de seguranca (0052)
-- ============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
