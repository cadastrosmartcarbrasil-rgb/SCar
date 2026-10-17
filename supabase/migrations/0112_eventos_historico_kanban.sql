-- ============================================================================
-- SCar :: 0112_eventos_historico_kanban.sql
--
-- LEVAR EVENTO DO HISTORICO DO MUTUAL PARA O KANBAN (pedido do usuario,
-- 17/10/2026): "muitos deles ainda estao sendo tratados; crie uma forma de
-- transportar para o kanban, inicialmente sempre na aba Abertos, para que sejam
-- preenchidos pelo nosso pessoal" — e "preciso ter a liberdade de ESCOLHER o
-- evento a transferir".
--
-- POR QUE E ESCOLHA E NUNCA AUTOMATICO: o Mutual manda "ANDAMENTO" em todos e
-- so 8 de 829 tem data de conclusao (medido em 17/10). Nao ha dado que diga quem
-- ainda esta em tratamento; levar tudo despejaria 821 eventos no Kanban.
--
-- (A) `eventos_historico.evento_id` — o elo com o evento criado (unique: um
--     historico vira no maximo UM evento; `on delete set null`: apagar o evento
--     do Kanban devolve o historico para "nao levado"). A importacao (0101) NAO
--     mexe nesta coluna, entao re-importar preserva o elo.
-- (B) `tipo_evento_do_historico(tipos[])` — palpite pelo PRIMEIRO tipo, por
--     palavra-chave, contra o catalogo `tipos_evento`. Sem casar, fica nulo e a
--     equipe classifica (o texto original vai na descricao).
-- (C) `transportar_eventos_historico(ids[])` — cria o evento SEMPRE em ABERTO,
--     com associado, veiculo, data, unidade, envolvimento e o tipo palpitado;
--     protocolo, tipos, envolvimento e valor do Mutual na descricao. Devolve uma
--     linha por id com a SITUACAO (LEVADO, JA_NO_KANBAN, SEM_VEICULO, SEM_DATA,
--     FORA_DA_UNIDADE, NAO_ENCONTRADO). Sem veiculo nao vai: `veiculo_id` e
--     not null em `eventos_sinistro` (237 casos, carros que ja sairam da base).
--     Trava: staff + perfil_pode('eventos','criar') + a unidade de quem chama.
-- (D) `eventos_historico_listar` DROP + CREATE (muda o OUT): devolve o evento
--     do Kanban (id, protocolo, status) e ganha `p_no_kanban` (null = todos,
--     false = so os ainda nao levados, true = so os levados).
-- (E) NAO CONTAR DUAS VEZES: o levado passa a ser evento do SCar, entao sai da
--     conta do historico em `eventos_mutual_do_cliente` (SAC), no marcador de
--     `veiculos_do_cliente` e na serie/total de `painel_visao_geral`. Corpos da
--     0101 com UMA condicao a mais em cada (mesmas assinaturas).
--
-- Efeito colateral CONHECIDO e aceito: o evento levado conta nos limites por
-- janela dos opcionais (`opcionais_elegibilidade`), como todo evento do SCar.
-- O que fica so no historico continua sem contar (decisao de 13/10/2026).
-- ============================================================================

-- (A) ------------------------------------------------------------------------
alter table eventos_historico
  add column if not exists evento_id uuid references eventos_sinistro(id) on delete set null;

do $$ begin
  alter table eventos_historico add constraint uq_evento_historico_evento unique (evento_id);
exception when duplicate_table or duplicate_object then null; end $$;

comment on column eventos_historico.evento_id is
  'Evento do Kanban criado a partir deste historico (0112). Nulo = nao levado.';

-- (B) ------------------------------------------------------------------------
create or replace function tipo_evento_do_historico(p_tipos text[])
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with t as (select upper(texto_sem_acento(coalesce(p_tipos[1], ''))) as s),
  alvo as (
    select case
      when t.s like '%INCENDIO%'                                   then 'INCENDIO'
      when t.s like '%ROUBO%'                                      then 'ROUBO'
      when t.s like '%FURTO%'                                      then 'FURTO'
      when t.s like '%PARABRISA%' or t.s like '%VIDRO%'            then 'VIDROS'
      when t.s like '%GUINCHO%'                                    then 'GUINCHO / ASSISTENCIA'
      when t.s like '%NATUREZA%' or t.s like '%GRANIZO%'
        or t.s like '%ENCHENTE%' or t.s like '%ALAGAMENTO%'        then 'FENOMENOS NATURAIS'
      when t.s like '%COLIS%' or t.s like '%CAPOTAMENTO%'
        or t.s like '%CONTROLE%'                                   then 'COLISAO'
    end as nome
      from t
  )
  select te.id
    from tipos_evento te, alvo
   where alvo.nome is not null
     and te.ativo
     and upper(texto_sem_acento(te.nome)) = alvo.nome
   limit 1;
$$;

comment on function tipo_evento_do_historico(text[]) is
  'Palpite do tipo do evento (tipos_evento) pelo primeiro tipo do Mutual, por palavra-chave (0112). Nulo = a equipe classifica.';

-- (C) ------------------------------------------------------------------------
create or replace function transportar_eventos_historico(p_ids uuid[])
returns table (
  historico_id     uuid,
  evento_id        uuid,
  numero_protocolo text,
  situacao         text,
  motivo           text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  h      record;
  v_rid  uuid;
  v_env  text;
  v_desc text;
begin
  if not is_staff() then
    raise exception 'Somente a equipe leva evento ao Kanban.' using errcode = 'insufficient_privilege';
  end if;
  if not perfil_pode('eventos', 'criar') then
    raise exception 'Seu perfil nao pode abrir evento.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(cardinality(p_ids), 0) = 0 then
    return;
  end if;
  if cardinality(p_ids) > 200 then
    raise exception 'Leve no maximo 200 eventos por vez.' using errcode = 'check_violation';
  end if;

  for h in
    select eh.*, coalesce(ve.regional_id, cl.regional_id) as rid,
           es.numero_protocolo as protocolo_kanban
      from eventos_historico eh
      join clientes cl on cl.id = eh.cliente_id
      left join veiculos ve on ve.id = eh.veiculo_id
      left join eventos_sinistro es on es.id = eh.evento_id
     where eh.id = any (p_ids)
     order by eh.data_evento nulls last, eh.id
       for update of eh
  loop
    historico_id := h.id;
    evento_id := h.evento_id;
    numero_protocolo := h.protocolo_kanban;
    v_rid := h.rid;

    if not (tem_acesso_global() or pode_regional(v_rid)) then
      evento_id := null; numero_protocolo := null;
      situacao := 'FORA_DA_UNIDADE'; motivo := 'O evento e de outra unidade.';
      return next; continue;
    end if;
    if h.evento_id is not null then
      situacao := 'JA_NO_KANBAN'; motivo := 'Ja foi levado ao Kanban.';
      return next; continue;
    end if;
    if h.veiculo_id is null then
      situacao := 'SEM_VEICULO';
      motivo := 'O veiculo ' || coalesce(h.placa, '(sem placa)') || ' nao esta na base; o Kanban exige veiculo.';
      return next; continue;
    end if;
    if h.data_evento is null then
      situacao := 'SEM_DATA'; motivo := 'O Mutual nao informou a data da ocorrencia.';
      return next; continue;
    end if;

    v_env := upper(texto_sem_acento(coalesce(h.envolvimento, '')));
    v_desc := concat_ws(E'\n',
      'Trazido do historico do Mutual em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || '.',
      'Protocolo no Mutual: ' || coalesce(h.protocolo, 'nao informado') || '.',
      case when cardinality(h.tipos) > 0 then 'Tipo(s) no Mutual: ' || array_to_string(h.tipos, ', ') || '.' end,
      case when h.envolvimento is not null then 'Envolvimento no Mutual: ' || h.envolvimento || '.' end,
      case when coalesce(h.valor_total, 0) <> 0
           then 'Valor no Mutual: R$ ' || replace(to_char(h.valor_total, 'FM999999990.00'), '.', ',') || '.' end);

    insert into eventos_sinistro (
      veiculo_id, cliente_id, data_ocorrencia, tipo_evento_id, descricao,
      status, regional_id, tipo_envolvimento
    ) values (
      h.veiculo_id, h.cliente_id, h.data_evento, tipo_evento_do_historico(h.tipos), v_desc,
      'ABERTO', v_rid,
      case when v_env in ('CAUSADOR', 'VITIMA') then v_env::tipo_envolvimento end
    )
    returning eventos_sinistro.id, eventos_sinistro.numero_protocolo
      into evento_id, numero_protocolo;

    update eventos_historico set evento_id = transportar_eventos_historico.evento_id where id = h.id;

    situacao := 'LEVADO'; motivo := null;
    return next;
  end loop;

  -- id pedido que nao existe (ou ja foi apagado)
  for historico_id in
    select x from unnest(p_ids) x
     where not exists (select 1 from eventos_historico eh where eh.id = x)
  loop
    evento_id := null; numero_protocolo := null;
    situacao := 'NAO_ENCONTRADO'; motivo := 'Evento do historico nao encontrado.';
    return next;
  end loop;
end;
$$;

comment on function transportar_eventos_historico(uuid[]) is
  'Leva eventos escolhidos do historico do Mutual para o Kanban, sempre em ABERTO (0112). Uma linha por id com a situacao; nunca duplica.';

-- (D) ------------------------------------------------------------------------
drop function if exists eventos_historico_listar(text, text, date, date, uuid, integer, integer);

create or replace function eventos_historico_listar(
  p_busca       text    default null,
  p_tipo        text    default null,
  p_de          date    default null,
  p_ate         date    default null,
  p_regional_id uuid    default null,
  p_limite      integer default 50,
  p_offset      integer default 0,
  p_no_kanban   boolean default null
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
  evento_id        uuid,
  evento_protocolo text,
  evento_status    text,
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
       and (p_no_kanban is null or (b.evento_id is not null) = p_no_kanban)
       and (termo.t is null
            or texto_sem_acento(lower(b.nome_razao_social)) like '%' || termo.t || '%'
            or upper(coalesce(b.placa_atual, '')) like '%' || upper(termo.alnum) || '%'
            or b.cpf_cnpj like '%' || regexp_replace(termo.t, '\D', '', 'g') || '%'
                 and length(regexp_replace(termo.t, '\D', '', 'g')) >= 4
            or coalesce(b.protocolo, '') = trim(p_busca))
  )
  select f.id, f.cliente_id, f.nome_razao_social, f.veiculo_id, f.placa_atual, f.protocolo,
         f.data_evento, f.data_conclusao, f.tipos, f.envolvimento, f.valor_total,
         r.nome, f.evento_id, es.numero_protocolo, es.status::text, count(*) over ()
    from f
    left join regionais r on r.id = f.rid
    left join eventos_sinistro es on es.id = f.evento_id
   order by f.data_evento desc nulls last, f.id
   limit least(greatest(coalesce(p_limite, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- (E) ------------------------------------------------------------------------
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
     and h.evento_id is null   -- 0112: o levado ao Kanban aparece como evento do SCar
     and (tem_acesso_global() or pode_regional(cl.regional_id) or cl.id = auth_cliente_id())
   order by h.data_evento desc nulls last, h.id
   limit greatest(coalesce(p_limite, 100), 1);
$$;

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
           + (select count(*)::int from eventos_historico h
              where h.veiculo_id = v.id and h.evento_id is null),
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
     where h.evento_id is null   -- 0112: o levado ao Kanban conta como evento do SCar
       and (v_rid is null or coalesce(ve.regional_id, cl.regional_id) = v_rid)
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
