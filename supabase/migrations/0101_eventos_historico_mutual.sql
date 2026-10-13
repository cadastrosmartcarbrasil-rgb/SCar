-- ============================================================================
-- 0101 — O HISTORICO DE EVENTOS / SINISTROS DO MUTUAL
-- ============================================================================
-- O defeito (relatado em 13/10/2026): `/integracao/mutual` mostra 2.909 eventos
-- capturados (`EVENT`) e NENHUM aparece no sistema. Nao e bug de tela: a carga
-- (0084) deixou evento DE FORA por decisao, e ninguem fez a segunda metade.
--
-- O que a base mostrou ao medir (13/10/2026):
--   * a ligacao do evento com o veiculo e `evento.vehicle_id` =
--     `objeto.vehicle_id` (NAO o id do objeto) — casa 2.901 de 2.909; quando o
--     mesmo veiculo esteve em mais de um contrato, vale o do `contract_id` do
--     evento;
--   * 827 eventos sao de associados JA CARREGADOS (vinculo PERSON) e 636
--     deles de veiculos que estao na base; os outros 2.082 sao de associados
--     que nao vieram (acervo encerrado) e ficam de fora, contados — mesma
--     regra dos boletos (0097);
--   * `event_status` vem "ANDAMENTO" em 2.909 de 2.909 e so 38 tem
--     `conclusion_date`: o status da listagem NAO informa nada.
--
-- POR ISSO E TABELA PROPRIA, e nao `eventos_sinistro` (mesmo raciocinio da
-- 0097 com `boletos_historico`): na tabela operacional cada linha viraria um
-- evento EM ABERTO — Kanban, tramitacao, "eventos em aberto" do painel e o
-- status `em_evento` — por um status que nao quer dizer nada. E o Mutual
-- continua tratando os eventos dele ate o corte de dezembro: o SCar mostra a
-- HISTORIA, quem opera evento novo e o SCar. Depois do corte, a historia FICA
-- (a area de captura e apagada; esta tabela nao).
--
-- (A) `eventos_historico` + RLS de leitura (staff da unidade ou o proprio
--     associado); escrita so pela importacao.
-- (B) `mutual_eventos_para_importar()` (a leitura) +
--     `mutual_importar_eventos_historico(p_confirmar)` — re-executavel, so
--     regrava o que mudou (regra da 0096). Sem `p_confirmar` so conta.
-- (C) `eventos_historico_resumo()` — o quadro da tela de integracao.
-- (D) `eventos_mutual_do_cliente(cliente)` — a aba Eventos do SAC.
-- (E) `eventos_historico_listar(...)` — a aba Historico de `/sinistros`.
-- (F) `veiculos_do_cliente` recriada (mesma assinatura): o marcador de evento
--     na lista do SAC passa a contar o historico.
-- (G) `painel_visao_geral` recriada (mesma assinatura): o bloco de eventos
--     passa a mostrar o historico, separado do que e operacao no SCar.
--
-- O que NAO muda: os limites por janela dos opcionais
-- (`opcionais_elegibilidade`, `opcionais_veiculo`) continuam contando so
-- `eventos_sinistro`. Fazer o historico consumir cota e decisao a parte.
-- ============================================================================

-- ============================================================================
-- (A) a tabela
-- ============================================================================
create table if not exists eventos_historico (
  id              uuid primary key default gen_random_uuid(),
  origem          text not null default 'MUTUAL',
  id_externo      text not null,
  cliente_id      uuid not null references clientes(id) on delete cascade,
  veiculo_id      uuid references veiculos(id) on delete set null,
  placa           text,
  protocolo       text,
  data_evento     date,
  data_conclusao  date,
  tipos           text[] not null default '{}',
  envolvimento    text,
  valor_total     numeric(12,2),
  status_origem   text,
  importado_em    timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint uq_evento_historico unique (origem, id_externo),
  constraint chk_evento_historico_origem check (origem in ('MUTUAL'))
);

create index if not exists idx_eventos_historico_cliente on eventos_historico (cliente_id, data_evento desc);
create index if not exists idx_eventos_historico_veiculo on eventos_historico (veiculo_id);
create index if not exists idx_eventos_historico_data    on eventos_historico (data_evento);

comment on table eventos_historico is
  'Eventos/sinistros de outro sistema (hoje o Mutual) dos associados ja carregados (0101). '
  'NAO e `eventos_sinistro` de proposito: la cada linha viraria evento em aberto, com '
  'Kanban, tramitacao e status em_evento, e o status do Mutual nao informa (vem ANDAMENTO '
  'em todos). So consulta. Fica depois do corte de dezembro.';

alter table eventos_historico enable row level security;

drop policy if exists eventos_historico_select on eventos_historico;
create policy eventos_historico_select on eventos_historico
  for select to authenticated
  using (
    tem_acesso_global()
    or cliente_id = auth_cliente_id()
    or exists (select 1 from clientes c
                where c.id = eventos_historico.cliente_id
                  and pode_regional(c.regional_id))
  );

-- ============================================================================
-- (B) a importacao
-- ============================================================================
-- A LEITURA, uma linha por evento capturado, ja resolvida (associado, veiculo,
-- tipos, datas). A importacao conta e grava sobre ELA — uma fonte so, e sem
-- `create temp table` dentro de plpgsql (gotcha da 0084: a 2a chamada na mesma
-- sessao morre com "relation with OID ... does not exist").
create or replace function mutual_eventos_para_importar()
returns table (
  id_externo     text,
  cliente_id     uuid,
  veiculo_id     uuid,
  placa          text,
  protocolo      text,
  data_evento    date,
  data_conclusao date,
  tipos          text[],
  envolvimento   text,
  valor_total    numeric,
  status_origem  text,
  data_invalida  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with e as (
    select c.id_externo, c.payload p
      from mutual_captura c
     where c.entidade = 'EVENT' and not c.deletado
  ),
  obj as materialized (
    select o.id_externo as obj_id,
           o.payload->>'vehicle_id'  as vid,
           o.payload->>'contract_id' as cid,
           mutual_placa(o.payload->'vehicle_data'->>'vehicle_plate') as placa
      from mutual_captura o
     where o.entidade = 'CONTRACT_OBJECT'
  ),
  -- O objeto do mesmo veiculo; havendo varios (o carro trocou de contrato),
  -- vence o do contrato do evento, e entre iguais o que esta na base.
  casado as (
    select distinct on (e.id_externo)
           e.id_externo, obj.placa, vv.registro_id as veiculo_id
      from e
      join obj on obj.vid = e.p->>'vehicle_id'
      left join integracao_vinculos vv
             on vv.entidade = 'CONTRACT_OBJECT' and vv.tabela = 'veiculos'
            and vv.id_externo = obj.obj_id
     order by e.id_externo,
              (obj.cid = e.p->>'contract_id') desc,
              (vv.registro_id is not null) desc
  ),
  tipo as (
    select coalesce(t.payload->>'value', t.id_externo) as valor, t.payload->>'label' as nome
      from mutual_captura t
     where t.entidade = 'EVENT_TYPE'
  )
  select e.id_externo,
         -- O associado do evento; sem vinculo dele (veiculo transferido), o dono
         -- ATUAL do veiculo — o evento e historia do carro.
         coalesce(pv.registro_id, ve.cliente_id),
         ca.veiculo_id,
         coalesce(ve.placa, ca.placa),
         mutual_texto(e.p->>'protocol'),
         -- Data anterior a 2000 e placeholder (ha um "1923"), nao dado.
         case when mutual_data(e.p->>'event_date') >= date '2000-01-01'
              then mutual_data(e.p->>'event_date') end,
         mutual_dia(e.p->>'conclusion_date'),
         coalesce((
           select array_agg(coalesce(tp.nome, x.v) order by x.ord)
             from jsonb_array_elements_text(
                    case when jsonb_typeof(e.p->'value_event_types') = 'array'
                         then e.p->'value_event_types' else '[]'::jsonb end
                  ) with ordinality as x(v, ord)
             left join tipo tp on tp.valor = x.v
         ), '{}'),
         mutual_texto(e.p->>'type_involvement'),
         nullif(mutual_texto(e.p->>'total_value'), '')::numeric,
         mutual_texto(e.p->>'event_status'),
         coalesce(mutual_data(e.p->>'event_date') < date '2000-01-01', false)
    from e
    left join integracao_vinculos pv
           on pv.entidade = 'PERSON' and pv.tabela = 'clientes'
          and pv.id_externo = e.p->>'person_id'
    left join casado ca on ca.id_externo = e.id_externo
    left join veiculos ve on ve.id = ca.veiculo_id
   where is_staff() or auth.uid() is null;
$$;

create or replace function mutual_importar_eventos_historico(p_confirmar boolean default false)
returns table (
  lidos               integer,
  importaveis         integer,
  sem_associado       integer,
  sem_veiculo_na_base integer,
  data_invalida       integer,
  gravados            integer
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_lidos int; v_imp int; v_sem_assoc int; v_sem_veic int; v_data int; v_grav int := 0;
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Somente a matriz importa o historico de eventos.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_confirmar then
    with up as (
      insert into eventos_historico as h
        (origem, id_externo, cliente_id, veiculo_id, placa, protocolo, data_evento,
         data_conclusao, tipos, envolvimento, valor_total, status_origem)
      select 'MUTUAL', i.id_externo, i.cliente_id, i.veiculo_id, i.placa, i.protocolo,
             i.data_evento, i.data_conclusao, i.tipos, i.envolvimento, i.valor_total,
             i.status_origem
        from mutual_eventos_para_importar() i
       where i.cliente_id is not null
      on conflict (origem, id_externo) do update
         set cliente_id     = excluded.cliente_id,
             veiculo_id     = excluded.veiculo_id,
             placa          = excluded.placa,
             protocolo      = excluded.protocolo,
             data_evento    = excluded.data_evento,
             data_conclusao = excluded.data_conclusao,
             tipos          = excluded.tipos,
             envolvimento   = excluded.envolvimento,
             valor_total    = excluded.valor_total,
             status_origem  = excluded.status_origem,
             atualizado_em  = now()
       -- So regrava o que mudou (0096): linha identica nao incha a tabela.
       where (h.cliente_id, h.veiculo_id, h.placa, h.protocolo, h.data_evento,
              h.data_conclusao, h.tipos, h.envolvimento, h.valor_total, h.status_origem)
             is distinct from
             (excluded.cliente_id, excluded.veiculo_id, excluded.placa, excluded.protocolo,
              excluded.data_evento, excluded.data_conclusao, excluded.tipos,
              excluded.envolvimento, excluded.valor_total, excluded.status_origem)
      returning 1
    )
    select count(*) into v_grav from up;
  end if;

  select count(*),
         count(*) filter (where i.cliente_id is not null),
         count(*) filter (where i.cliente_id is null),
         count(*) filter (where i.cliente_id is not null and i.veiculo_id is null),
         count(*) filter (where i.cliente_id is not null and i.data_invalida)
    into v_lidos, v_imp, v_sem_assoc, v_sem_veic, v_data
    from mutual_eventos_para_importar() i;

  return query select v_lidos, v_imp, v_sem_assoc, v_sem_veic, v_data, v_grav;
end;
$$;

comment on function mutual_importar_eventos_historico(boolean) is
  'Importa os eventos do Mutual (EVENT) dos associados ja carregados para eventos_historico '
  '(0101). Veiculo pelo objeto do contrato com o mesmo vehicle_id (o do contrato do evento '
  'vence). Re-executavel; sem p_confirmar so conta. Somente a matriz.';

-- ============================================================================
-- (C) o quadro da tela de integracao
-- ============================================================================
create or replace function eventos_historico_resumo()
returns table (
  eventos            bigint,
  associados         bigint,
  veiculos           bigint,
  sem_veiculo        bigint,
  primeiro_evento    date,
  ultimo_evento      date,
  capturados         bigint,
  ultima_captura     timestamptz,
  ultima_importacao  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from eventos_historico),
         (select count(distinct cliente_id) from eventos_historico),
         (select count(distinct veiculo_id) from eventos_historico),
         (select count(*) from eventos_historico where veiculo_id is null),
         (select min(data_evento) from eventos_historico),
         (select max(data_evento) from eventos_historico),
         (select count(*) from mutual_captura where entidade = 'EVENT'),
         (select max(capturado_em) from mutual_captura where entidade = 'EVENT'),
         (select max(atualizado_em) from eventos_historico)
   where is_staff() or auth.uid() is null;
$$;

-- ============================================================================
-- (D) a aba Eventos do SAC
-- ============================================================================
create or replace function eventos_mutual_do_cliente(p_cliente_id uuid, p_limite int default 100)
returns table (
  id             uuid,
  veiculo_id     uuid,
  placa          text,
  protocolo      text,
  data_evento    date,
  data_conclusao date,
  tipos          text[],
  envolvimento   text,
  valor_total    numeric,
  status_origem  text
)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.veiculo_id, coalesce(ve.placa, h.placa), h.protocolo, h.data_evento,
         h.data_conclusao, h.tipos, h.envolvimento, h.valor_total, h.status_origem
    from eventos_historico h
    join clientes cl on cl.id = h.cliente_id
    left join veiculos ve on ve.id = h.veiculo_id
   where h.cliente_id = p_cliente_id
     and (tem_acesso_global() or pode_regional(cl.regional_id) or cl.id = auth_cliente_id())
   order by h.data_evento desc nulls last, h.id
   limit greatest(coalesce(p_limite, 100), 1);
$$;

-- ============================================================================
-- (E) a aba Historico de /sinistros — paginada no banco
-- ============================================================================
create or replace function eventos_historico_listar(
  p_busca       text    default null,
  p_tipo        text    default null,
  p_de          date    default null,
  p_ate         date    default null,
  p_regional_id uuid    default null,
  p_limite      integer default 50,
  p_offset      integer default 0
)
returns table (
  id               uuid,
  cliente_id       uuid,
  associado        text,
  veiculo_id       uuid,
  placa            text,
  protocolo        text,
  data_evento      date,
  data_conclusao   date,
  tipos            text[],
  envolvimento     text,
  valor_total      numeric,
  unidade          text,
  total_registros  bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with esc as (
    select case when is_staff() or auth.uid() is null
                then escopo_regional(p_regional_id)
                else '00000000-0000-0000-0000-000000000000'::uuid end as rid,
           is_staff() or auth.uid() is null as pode
  ),
  termo as (
    select nullif(texto_sem_acento(lower(trim(coalesce(p_busca, '')))), '') as t,
           nullif(regexp_replace(coalesce(p_busca, ''), '\W', '', 'g'), '') as alnum
  ),
  base as (
    select h.*, cl.nome_razao_social, cl.cpf_cnpj,
           coalesce(ve.regional_id, cl.regional_id) as rid,
           coalesce(ve.placa, h.placa) as placa_atual
      from eventos_historico h
      join clientes cl on cl.id = h.cliente_id
      left join veiculos ve on ve.id = h.veiculo_id
  ),
  f as (
    select b.* from base b, esc, termo
     where esc.pode
       and (esc.rid is null or b.rid = esc.rid)
       and (p_tipo is null or p_tipo = any (b.tipos))
       and (p_de  is null or b.data_evento >= p_de)
       and (p_ate is null or b.data_evento <= p_ate)
       and (termo.t is null
            or texto_sem_acento(lower(b.nome_razao_social)) like '%' || termo.t || '%'
            or upper(coalesce(b.placa_atual, '')) like '%' || upper(termo.alnum) || '%'
            or b.cpf_cnpj like '%' || regexp_replace(termo.t, '\D', '', 'g') || '%'
                 and length(regexp_replace(termo.t, '\D', '', 'g')) >= 4
            or coalesce(b.protocolo, '') = trim(p_busca))
  )
  select f.id, f.cliente_id, f.nome_razao_social, f.veiculo_id, f.placa_atual, f.protocolo,
         f.data_evento, f.data_conclusao, f.tipos, f.envolvimento, f.valor_total,
         r.nome, count(*) over ()
    from f left join regionais r on r.id = f.rid
   order by f.data_evento desc nulls last, f.id
   limit least(greatest(coalesce(p_limite, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ============================================================================
-- (F) o marcador de evento na lista do SAC conta o historico
-- ============================================================================
create or replace function veiculos_do_cliente(p_cliente_id uuid)
returns table (
  id uuid,
  placa text,
  marca text,
  modelo text,
  ano_modelo integer,
  status status_veiculo,
  tipo_faturamento tipo_faturamento,
  data_ativacao date,
  plano_nome text,
  alertas_qtd integer,
  eventos_qtd integer,
  tem_assistencia boolean
) language sql stable as $$
  select v.id, v.placa, v.marca, v.modelo, v.ano_modelo, v.status, v.tipo_faturamento,
         v.data_ativacao,
         p.nome,
         (select count(*)::int from veiculo_alertas a where a.veiculo_id = v.id and a.ativo),
         (select count(*)::int from eventos_sinistro e where e.veiculo_id = v.id)
           + (select count(*)::int from eventos_historico h where h.veiculo_id = v.id),
         exists (select 1 from atendimentos ate
                  where ate.veiculo_id = v.id and ate.tipo::text = 'ASSISTENCIA_24H')
    from veiculos v
    left join planos_protecao p on p.id = v.plano_protecao_id
   where v.cliente_id = p_cliente_id
     and v.status::text <> 'excluido'
   order by ordem_status_veiculo(v.status),
            v.data_ativacao desc nulls last,
            v.modelo nulls last,
            v.placa;
$$;

-- ============================================================================
-- (G) a Visao Geral (0100) passa a mostrar o historico
--     Corpo da 0100 + o bloco `eventos.historico` e a coluna
--     `eventos_historico` na serie. Mesma assinatura.
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
  -- Historico do Mutual (0101): a unidade e a do veiculo e, sem ele, a do associado.
  hist as (
    select h.id, h.data_evento as dia, coalesce(h.tipos[1], 'Nao classificado') as tipo
      from eventos_historico h
      join clientes cl on cl.id = h.cliente_id
      left join veiculos ve on ve.id = h.veiculo_id
     where v_rid is null or coalesce(ve.regional_id, cl.regional_id) = v_rid
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
               (select count(*) from hist h where h.dia between m.inicio and m.fim) as eventos_historico,
               (select count(*) from acion a
                 where a.dia between m.inicio and m.fim and a.status <> 'CANCELADO') as acionamentos,
               (select count(*) from lds l where l.dia between m.inicio and m.fim) as leads
          from meses m
      ) x), '[]'::jsonb),

    'eventos', jsonb_build_object(
      'abertos',      (select count(*) from eventos where status not in ('CONCLUIDO', 'NEGADO')),
      'novos_mes',    (select count(*) from eventos where dia >= v_mes),
      'concluidos',   (select count(*) from eventos where status = 'CONCLUIDO'),
      'negados',      (select count(*) from eventos where status = 'NEGADO'),
      'total',        (select count(*) from eventos),
      'por_status',   coalesce((select jsonb_agg(x) from (
                        select status, count(*) as n from eventos group by 1) x), '[]'::jsonb),
      'por_tipo',     coalesce((select jsonb_agg(x order by x.n desc) from (
                        select tipo, count(*) as n from eventos group by 1) x), '[]'::jsonb),
      'por_tipo_12m', coalesce((select jsonb_agg(x order by x.n desc) from (
                        select tipo, count(*) as n from eventos
                         where dia > v_hoje - 365 group by 1) x), '[]'::jsonb),
      'ultimos_12m',  (select count(*) from eventos where dia > v_hoje - 365),
      'historico', jsonb_build_object(
        'total',       (select count(*) from hist),
        'ultimos_12m', (select count(*) from hist where dia > v_hoje - 365),
        'mes',         (select count(*) from hist where dia >= v_mes),
        'por_tipo_12m', coalesce((select jsonb_agg(x order by x.n desc) from (
                          select tipo, count(*) as n from hist
                           where dia > v_hoje - 365 group by 1) x), '[]'::jsonb)
      )
    ),

    'assistencia', jsonb_build_object(
      'mes',        (select count(*) from acion where dia >= v_mes and status <> 'CANCELADO'),
      'em_aberto',  (select count(*) from acion
                      where status in ('ABERTO', 'EM_COTACAO', 'AUTORIZADO', 'EM_ATENDIMENTO')),
      'custo_mes',  (select coalesce(round(sum(valor_total), 2), 0) from acion
                      where dia >= v_mes and status <> 'CANCELADO')
    ),

    'vendas', jsonb_build_object(
      'em_aberto',        (select count(*) from lds where status not in ('ATIVO', 'PERDIDO')),
      'novos_mes',        (select count(*) from lds where dia >= v_mes),
      'convertidos_mes',  (select count(*) from lds where status = 'ATIVO' and auditado >= v_mes),
      'funil', coalesce((select jsonb_agg(x) from (
                 select status, count(*) as n from lds group by 1) x), '[]'::jsonb)
    ),

    'pagar', jsonb_build_object(
      'em_aberto',  (select coalesce(round(sum(valor_saldo), 2), 0) from pagar),
      'proximos_7', (select coalesce(round(sum(valor_saldo), 2), 0) from pagar
                      where data_vencimento between v_hoje and v_hoje + 7),
      'vencido',    (select coalesce(round(sum(valor_saldo), 2), 0) from pagar
                      where data_vencimento < v_hoje)
    ),

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

-- ============================================================================
-- Rito de seguranca (0052)
-- ============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
