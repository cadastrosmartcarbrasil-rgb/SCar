-- ============================================================================
-- 0098 — COBRANCA, FASE 2: a FILA, o HISTORICO DE CONTATOS e as PROMESSAS
-- ============================================================================
-- O documento do modulo (Rodrigo Medeiros, 30/09/2026) pede, depois do painel:
--   * a fila operacional — quem cobrar hoje, por faixa de atraso;
--   * o historico de contatos que NAO pode ser apagado (canal, resultado,
--     proxima acao);
--   * as promessas de pagamento e a TAXA DE CUMPRIMENTO delas; e os acordos.
--
-- DECISOES QUE MORAM AQUI
-- 1. CONTATO E HISTORICO: nao se edita nem se apaga, nem pela service_role —
--    a trava e TRIGGER, porque a service_role ignora RLS. Quem errou registra
--    outro contato corrigindo.
-- 2. PROMESSA e ACORDO sao a mesma coisa com 1 ou N parcelas: o associado se
--    compromete a pagar a DIVIDA QUE EXISTE (os boletos ja vencidos) em datas
--    combinadas. Nao se emite boleto novo aqui — isso depende do gateway real
--    e, para quem ainda e cobrado no Mutual, acontece la.
-- 3. A SITUACAO DA PROMESSA E CALCULADA, nunca digitada. Pagamento que conta:
--    boleto do associado com vencimento ATE a data da promessa, pago A PARTIR
--    dela. Parcela cumprida = o pago ate o vencimento dela cobre o acumulado
--    das parcelas ate ali. Quebrada = passou do vencimento + 3 dias (o prazo
--    de baixa do banco) sem cobrir. Quitar a divida inteira cumpre as parcelas
--    que ainda nao tinham quebrado. Mensalidade NOVA paga nao conta: senao o
--    associado "cumpriria" a promessa pagando o mes corrente.
-- 4. ⚠️ O dado do Mutual so e tao novo quanto a ultima captura de INVOICE:
--    promessa paga no Mutual aparece cumprida depois da recaptura + importacao.
-- 5. Escopo: o mesmo da Fase 1 (`cobranca_escopo`), pela unidade ATUAL do
--    associado.
-- ============================================================================

-- ============================================================================
-- (A) HELPERS
-- ============================================================================
/** Faixa de atraso da fila — espelho de `faixaDeAtraso` (src/lib/cobranca-fila.ts). */
create or replace function cobranca_faixa_atraso(p_dias integer)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_dias is null or p_dias <= 0 then null
    when p_dias <= 5  then 'D01_05'
    when p_dias <= 10 then 'D06_10'
    when p_dias <= 15 then 'D11_15'
    when p_dias <= 30 then 'D16_30'
    when p_dias <= 60 then 'D31_60'
    when p_dias <= 90 then 'D61_90'
    else 'D90_MAIS'
  end;
$$;

/** O associado esta no escopo de cobranca de quem chama? (unidade ATUAL dele) */
create or replace function cobranca_pode_cliente(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from clientes cl, cobranca_escopo() e
     where cl.id = p_cliente_id
       and (e.global or cl.regional_id = any (e.regionais))
  );
$$;

-- ============================================================================
-- (B) CONTATOS — o historico que nao se apaga
-- ============================================================================
create table if not exists cobranca_contatos (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references clientes(id),
  regional_id      uuid references regionais(id),
  canal            text not null,
  resultado        text not null,
  observacao       text,
  proxima_acao_em  date,
  proxima_acao     text,
  -- retrato da divida NO MOMENTO do contato (a divida muda; o contato nao)
  boletos_vencidos integer not null default 0,
  valor_vencido    numeric(12,2) not null default 0,
  dias_atraso      integer not null default 0,
  usuario_id       uuid references usuarios(id),
  created_at       timestamptz not null default clock_timestamp(),
  constraint chk_cobranca_contato_canal check (canal in
    ('LIGACAO','WHATSAPP','SMS','EMAIL','PRESENCIAL','OUTRO')),
  constraint chk_cobranca_contato_resultado check (resultado in
    ('FALOU','NAO_ATENDEU','RECADO','NUMERO_ERRADO','PROMETEU','NEGOCIANDO','RECUSOU','JA_PAGOU'))
);
create index if not exists idx_cobranca_contatos_cliente on cobranca_contatos (cliente_id, created_at desc);

comment on table cobranca_contatos is
  'Historico de contatos de cobranca (0098). IMUTAVEL: trigger recusa update e delete, inclusive da service_role.';

create or replace function fn_cobranca_contato_imutavel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'O historico de contatos de cobranca nao se altera nem se apaga. Registre um novo contato corrigindo.'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_cobranca_contato_imutavel on cobranca_contatos;
create trigger trg_cobranca_contato_imutavel
  before update or delete on cobranca_contatos
  for each row execute function fn_cobranca_contato_imutavel();

alter table cobranca_contatos enable row level security;
drop policy if exists cobranca_contatos_select on cobranca_contatos;
create policy cobranca_contatos_select on cobranca_contatos
  for select to authenticated using (cobranca_pode_cliente(cliente_id));
-- sem policy de escrita: grava SO por `registrar_contato_cobranca`.
grant select on cobranca_contatos to authenticated;

-- ============================================================================
-- (C) PROMESSAS E ACORDOS
-- ============================================================================
create table if not exists cobranca_acordos (
  id                  uuid primary key default gen_random_uuid(),
  cliente_id          uuid not null references clientes(id),
  regional_id         uuid references regionais(id),
  tipo                text not null,
  data_base           date not null default current_date,
  valor_total         numeric(12,2) not null,
  divida_na_data      numeric(12,2) not null default 0,
  observacao          text,
  contato_id          uuid references cobranca_contatos(id),
  criado_por          uuid references usuarios(id),
  created_at          timestamptz not null default clock_timestamp(),
  cancelado_em        timestamptz,
  cancelado_por       uuid references usuarios(id),
  motivo_cancelamento text,
  constraint chk_cobranca_acordo_tipo check (tipo in ('PROMESSA','ACORDO')),
  constraint chk_cobranca_acordo_valor check (valor_total > 0),
  constraint chk_cobranca_acordo_cancelamento check (
    (cancelado_em is null and motivo_cancelamento is null)
    or (cancelado_em is not null and length(btrim(motivo_cancelamento)) >= 5))
);
create index if not exists idx_cobranca_acordos_cliente on cobranca_acordos (cliente_id, created_at desc);

create table if not exists cobranca_acordo_parcelas (
  acordo_id  uuid not null references cobranca_acordos(id),
  numero     smallint not null,
  vencimento date not null,
  valor      numeric(12,2) not null,
  primary key (acordo_id, numero),
  constraint chk_cobranca_parcela_numero check (numero between 1 and 36),
  constraint chk_cobranca_parcela_valor check (valor > 0)
);

comment on table cobranca_acordos is
  'Promessas (1 parcela) e acordos (N parcelas) de pagamento da divida existente (0098). '
  'A situacao e CALCULADA pelos pagamentos (cobranca_acordos_situacao); a unica mudanca permitida e o cancelamento.';

/** Acordo so muda para ser CANCELADO (uma vez); parcela nunca muda. */
create or replace function fn_cobranca_acordo_imutavel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Promessa/acordo de cobranca nao se apaga: cancele com o motivo.' using errcode = 'check_violation';
  end if;
  if old.cancelado_em is not null
     or new.cancelado_em is null
     or (to_jsonb(new) - array['cancelado_em','cancelado_por','motivo_cancelamento'])
        <> (to_jsonb(old) - array['cancelado_em','cancelado_por','motivo_cancelamento']) then
    raise exception 'Promessa/acordo de cobranca so pode ser cancelado (e uma vez so).' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cobranca_acordo_imutavel on cobranca_acordos;
create trigger trg_cobranca_acordo_imutavel
  before update or delete on cobranca_acordos
  for each row execute function fn_cobranca_acordo_imutavel();

create or replace function fn_cobranca_parcela_imutavel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Parcela de promessa/acordo nao se altera nem se apaga.' using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_cobranca_parcela_imutavel on cobranca_acordo_parcelas;
create trigger trg_cobranca_parcela_imutavel
  before update or delete on cobranca_acordo_parcelas
  for each row execute function fn_cobranca_parcela_imutavel();

alter table cobranca_acordos enable row level security;
alter table cobranca_acordo_parcelas enable row level security;
drop policy if exists cobranca_acordos_select on cobranca_acordos;
create policy cobranca_acordos_select on cobranca_acordos
  for select to authenticated using (cobranca_pode_cliente(cliente_id));
drop policy if exists cobranca_parcelas_select on cobranca_acordo_parcelas;
create policy cobranca_parcelas_select on cobranca_acordo_parcelas
  for select to authenticated using (exists (
    select 1 from cobranca_acordos a where a.id = acordo_id and cobranca_pode_cliente(a.cliente_id)));
grant select on cobranca_acordos, cobranca_acordo_parcelas to authenticated;

/**
 * A SITUACAO de cada promessa/acordo, calculada pelos pagamentos (ver o
 * cabecalho, decisao 3). Espelho de `situacaoParcela`/`statusAcordo`
 * (src/lib/cobranca-fila.ts). `quebra_em` = o 1o dia em que a promessa conta
 * como quebrada (vencimento da parcela + 4): contato a partir dele tira o
 * associado do topo da fila.
 */
create or replace function cobranca_acordos_situacao(
  p_regional_id uuid default null,
  p_cliente_id  uuid default null
)
returns table (
  acordo_id             uuid,
  cliente_id            uuid,
  regional_id           uuid,
  tipo                  text,
  data_base             date,
  valor_total           numeric,
  divida_na_data        numeric,
  observacao            text,
  criado_por_nome       text,
  created_at            timestamptz,
  cancelado_em          timestamptz,
  motivo_cancelamento   text,
  status                text,
  valor_pago            numeric,
  parcelas              jsonb,
  quebra_em             date,
  proxima_parcela_em    date,
  proxima_parcela_valor numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with esc as (select * from cobranca_escopo()),
  a as (
    select a.*, cl.regional_id as regional_atual
      from cobranca_acordos a
      join clientes cl on cl.id = a.cliente_id
     cross join esc
     where (esc.global or cl.regional_id = any (esc.regionais))
       and (p_regional_id is null or cl.regional_id = p_regional_id)
       and (p_cliente_id is null or a.cliente_id = p_cliente_id)
  ),
  b as (
    select bb.* from cobranca_boletos_base(null, null, p_regional_id) bb
     where bb.cliente_id in (select a.cliente_id from a)
  ),
  pg as (
    select a.id as acordo_id, b.data_pagamento, coalesce(b.valor_pago, b.valor) as v
      from a
      join b on b.cliente_id = a.cliente_id
     where b.vencimento <= a.data_base
       and b.situacao in ('pago_no_prazo', 'pago_em_atraso')
       and b.data_pagamento >= a.data_base
  ),
  q as (
    select a.id,
           (not exists (select 1 from b
                         where b.cliente_id = a.cliente_id and b.vencimento <= a.data_base
                           and b.situacao in ('vencido', 'vence_hoje', 'a_vencer'))
            and exists (select 1 from pg where pg.acordo_id = a.id)) as quitado,
           (select coalesce(sum(pg.v), 0) from pg where pg.acordo_id = a.id) as pago_total
      from a
  ),
  p as (
    select pc.*, sum(pc.valor) over (partition by pc.acordo_id order by pc.numero) as acumulado
      from cobranca_acordo_parcelas pc
     where pc.acordo_id in (select id from a)
  ),
  ps as (
    select p.*, q.quitado,
           (select coalesce(sum(pg.v), 0) from pg
             where pg.acordo_id = p.acordo_id and pg.data_pagamento <= p.vencimento) as pago_ate
      from p join q on q.id = p.acordo_id
  ),
  pst as (
    select ps.*,
           case
             when ps.pago_ate >= ps.acumulado - 0.01 then 'cumprida'
             when ps.quitado and current_date <= ps.vencimento + 3 then 'cumprida'
             when current_date > ps.vencimento + 3 then 'quebrada'
             when current_date > ps.vencimento then 'aguardando_baixa'
             else 'a_vencer'
           end as situacao
      from ps
  ),
  ag as (
    select pst.acordo_id,
           bool_and(pst.situacao = 'cumprida') as todas,
           bool_or(pst.situacao = 'quebrada') as quebrou,
           min(pst.vencimento + 4) filter (where pst.situacao = 'quebrada') as quebra_em,
           min(pst.vencimento) filter (where pst.situacao in ('a_vencer', 'aguardando_baixa')) as prox,
           jsonb_agg(jsonb_build_object(
             'numero', pst.numero, 'vencimento', pst.vencimento, 'valor', pst.valor,
             'acumulado', pst.acumulado, 'pago_ate', pst.pago_ate, 'situacao', pst.situacao
           ) order by pst.numero) as parcelas
      from pst group by pst.acordo_id
  )
  select a.id, a.cliente_id, a.regional_atual, a.tipo, a.data_base, a.valor_total,
         a.divida_na_data, a.observacao, u.nome, a.created_at, a.cancelado_em,
         a.motivo_cancelamento,
         case when a.cancelado_em is not null then 'CANCELADO'
              when ag.todas then 'CUMPRIDO'
              when ag.quebrou then 'QUEBRADO'
              else 'EM_ANDAMENTO' end,
         q.pago_total, ag.parcelas, ag.quebra_em, ag.prox,
         (select pp.valor from cobranca_acordo_parcelas pp
           where pp.acordo_id = a.id and pp.vencimento = ag.prox limit 1)
    from a
    join ag on ag.acordo_id = a.id
    join q on q.id = a.id
    left join usuarios u on u.id = a.criado_por
   order by a.created_at desc;
$$;

-- ============================================================================
-- (D) A FILA
-- ============================================================================
/**
 * Uma linha por associado ATIVO com boleto vencido em aberto, com o ultimo
 * contato, a promessa vigente e a SITUACAO NA FILA — espelho de `situacaoFila`
 * (src/lib/cobranca-fila.ts):
 *   promessa_quebrada (1) > retorno_atrasado (2) > retorno_hoje (3)
 *   > sem_contato (4) > aguardando (5) > promessa_em_dia (6).
 * Contato anterior a divida atual nao conta ("sem contato"); contato sem data
 * de retorno vira retorno em 2 dias, para o associado voltar a fila sozinho.
 */
create or replace function cobranca_fila_base(p_regional_id uuid default null)
returns table (
  cliente_id          uuid,
  associado           text,
  cpf_cnpj            text,
  telefone            text,
  celular             text,
  regional_id         uuid,
  regional            text,
  placas              text,
  boletos_vencidos    bigint,
  valor_vencido       numeric,
  dias_atraso         integer,
  faixa               text,
  vencido_desde       date,
  ultimo_contato_em   timestamptz,
  ultimo_canal        text,
  ultimo_resultado    text,
  ultimo_usuario      text,
  ultima_observacao   text,
  retorno_em          date,
  proxima_acao        text,
  contatos            bigint,
  acordo_id           uuid,
  acordo_tipo         text,
  acordo_status       text,
  proxima_parcela_em  date,
  proxima_parcela_valor numeric,
  situacao_fila       text,
  prioridade          integer
)
language sql
stable
security definer
set search_path = public
as $$
  with venc as (
    select * from cobranca_boletos_base(null, null, p_regional_id) where situacao = 'vencido'
  ),
  ativos as (
    select distinct v.cliente_id from veiculos v
     where v.status::text in ('ativo', 'em_evento', 'vistoria_pendente', 'inadimplente')
  ),
  d as (
    select venc.cliente_id, count(*) as n, sum(venc.valor) as valor,
           max(venc.dias_atraso) as atraso, min(venc.vencimento) as desde
      from venc
      join ativos on ativos.cliente_id = venc.cliente_id
     group by venc.cliente_id
  ),
  uc as (
    select distinct on (c.cliente_id) c.*, u.nome as usuario_nome
      from cobranca_contatos c
      left join usuarios u on u.id = c.usuario_id
     where c.cliente_id in (select d.cliente_id from d)
     order by c.cliente_id, c.created_at desc, c.id desc
  ),
  nc as (
    select c.cliente_id, count(*) as n from cobranca_contatos c
     where c.cliente_id in (select d.cliente_id from d) group by 1
  ),
  ac as (
    select distinct on (s.cliente_id) s.*
      from cobranca_acordos_situacao(p_regional_id, null) s
      join d on d.cliente_id = s.cliente_id
     where s.status in ('EM_ANDAMENTO', 'QUEBRADO')
       and s.data_base >= d.desde
     order by s.cliente_id, s.created_at desc
  ),
  l as (
    select d.*, uc.id as contato_id, uc.created_at as contato_em, uc.canal, uc.resultado,
           uc.usuario_nome, uc.observacao, uc.proxima_acao,
           case when uc.id is null then null
                else coalesce(uc.proxima_acao_em, (uc.created_at)::date + 2) end as retorno,
           ac.acordo_id, ac.tipo, ac.status as acordo_status, ac.quebra_em,
           ac.proxima_parcela_em, ac.proxima_parcela_valor,
           coalesce(nc.n, 0) as contatos
      from d
      left join uc on uc.cliente_id = d.cliente_id
      left join nc on nc.cliente_id = d.cliente_id
      left join ac on ac.cliente_id = d.cliente_id
  ),
  s as (
    select l.*,
           case
             when l.acordo_status = 'QUEBRADO'
                  and (l.contato_em is null or (l.contato_em)::date < l.quebra_em) then 'promessa_quebrada'
             when l.acordo_status = 'EM_ANDAMENTO' then 'promessa_em_dia'
             when l.contato_em is null or (l.contato_em)::date < l.desde then 'sem_contato'
             when l.retorno < current_date then 'retorno_atrasado'
             when l.retorno = current_date then 'retorno_hoje'
             else 'aguardando'
           end as situacao
      from l
  )
  select s.cliente_id, cl.nome_razao_social, cl.cpf_cnpj, cl.telefone, cl.celular,
         cl.regional_id, coalesce(g.nome, 'MATRIZ'),
         (select string_agg(v.placa, ', ' order by v.placa) from veiculos v
           where v.cliente_id = s.cliente_id
             and v.status::text in ('ativo', 'em_evento', 'vistoria_pendente', 'inadimplente')),
         s.n, s.valor, s.atraso, cobranca_faixa_atraso(s.atraso), s.desde,
         s.contato_em, s.canal, s.resultado, s.usuario_nome, s.observacao,
         s.retorno, s.proxima_acao, s.contatos,
         s.acordo_id, s.tipo, s.acordo_status, s.proxima_parcela_em, s.proxima_parcela_valor,
         s.situacao,
         case s.situacao
           when 'promessa_quebrada' then 1 when 'retorno_atrasado' then 2
           when 'retorno_hoje' then 3 when 'sem_contato' then 4
           when 'aguardando' then 5 else 6 end
    from s
    join clientes cl on cl.id = s.cliente_id
    left join regionais g on g.id = cl.regional_id;
$$;

/** A fila filtrada e paginada (o PostgREST corta em 1.000 linhas). */
create or replace function cobranca_fila(
  p_regional_id uuid default null,
  p_situacao    text default null,
  p_faixa       text default null,
  p_busca       text default null,
  p_limite      integer default 100,
  p_offset      integer default 0
)
returns table (
  cliente_id          uuid,
  associado           text,
  cpf_cnpj            text,
  telefone            text,
  celular             text,
  regional_id         uuid,
  regional            text,
  placas              text,
  boletos_vencidos    bigint,
  valor_vencido       numeric,
  dias_atraso         integer,
  faixa               text,
  vencido_desde       date,
  ultimo_contato_em   timestamptz,
  ultimo_canal        text,
  ultimo_resultado    text,
  ultimo_usuario      text,
  ultima_observacao   text,
  retorno_em          date,
  proxima_acao        text,
  contatos            bigint,
  acordo_id           uuid,
  acordo_tipo         text,
  acordo_status       text,
  proxima_parcela_em  date,
  proxima_parcela_valor numeric,
  situacao_fila       text,
  prioridade          integer,
  total_registros     bigint,
  total_valor         numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with f as (
    select b.* from cobranca_fila_base(p_regional_id) b
     where (p_situacao is null or b.situacao_fila = p_situacao)
       and (p_faixa is null or b.faixa = p_faixa)
       and (nullif(btrim(coalesce(p_busca, '')), '') is null
            or texto_sem_acento(b.associado) ilike '%' || texto_sem_acento(btrim(p_busca)) || '%'
            or (length(regexp_replace(p_busca, '\D', '', 'g')) >= 3
                and regexp_replace(coalesce(b.cpf_cnpj, '') || ' ' || coalesce(b.telefone, '') || ' ' ||
                                   coalesce(b.celular, ''), '\D', '', 'g')
                    like '%' || regexp_replace(p_busca, '\D', '', 'g') || '%')
            or upper(coalesce(b.placas, '')) like '%' || upper(regexp_replace(p_busca, '[^A-Za-z0-9]', '', 'g')) || '%')
  )
  select f.*, count(*) over (), sum(f.valor_vencido) over ()
    from f
   order by f.prioridade, f.dias_atraso desc, f.valor_vencido desc, f.cliente_id
   limit greatest(1, least(coalesce(p_limite, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
$$;

/** Quantos associados e quanto dinheiro por SITUACAO e por FAIXA (os tiles). */
create or replace function cobranca_fila_resumo(p_regional_id uuid default null)
returns table (grupo text, chave text, clientes bigint, valor numeric)
language sql
stable
security definer
set search_path = public
as $$
  with b as (select * from cobranca_fila_base(p_regional_id))
  select 'situacao', b.situacao_fila, count(*), sum(b.valor_vencido) from b group by 2
  union all
  select 'faixa', b.faixa, count(*), sum(b.valor_vencido) from b group by 2;
$$;

/**
 * As promessas de um PERIODO (pela data em que foram feitas) — a taxa de
 * cumprimento sai daqui: cumpridas / (cumpridas + quebradas). Em andamento e
 * canceladas ficam fora do denominador. O percentual e calculado no TS.
 */
create or replace function cobranca_promessas_resumo(
  p_inicio      date,
  p_fim         date,
  p_regional_id uuid default null
)
returns table (
  feitas            bigint,
  cumpridas         bigint,
  quebradas         bigint,
  em_andamento      bigint,
  canceladas        bigint,
  valor_prometido   numeric,
  valor_recuperado  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select count(*),
         count(*) filter (where s.status = 'CUMPRIDO'),
         count(*) filter (where s.status = 'QUEBRADO'),
         count(*) filter (where s.status = 'EM_ANDAMENTO'),
         count(*) filter (where s.status = 'CANCELADO'),
         coalesce(sum(s.valor_total) filter (where s.status <> 'CANCELADO'), 0),
         coalesce(sum(s.valor_pago) filter (where s.status <> 'CANCELADO'), 0)
    from cobranca_acordos_situacao(p_regional_id, null) s
   where s.data_base between p_inicio and p_fim;
$$;

-- ============================================================================
-- (E) A FICHA DO ASSOCIADO NA COBRANCA
-- ============================================================================
/** Os contatos do associado, do mais novo ao mais antigo, com a promessa que nasceu de cada um. */
create or replace function cobranca_contatos_cliente(p_cliente_id uuid)
returns table (
  id               uuid,
  canal            text,
  resultado        text,
  observacao       text,
  proxima_acao_em  date,
  proxima_acao     text,
  boletos_vencidos integer,
  valor_vencido    numeric,
  dias_atraso      integer,
  usuario          text,
  created_at       timestamptz,
  acordo_id        uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.canal, c.resultado, c.observacao, c.proxima_acao_em, c.proxima_acao,
         c.boletos_vencidos, c.valor_vencido, c.dias_atraso, u.nome, c.created_at,
         (select a.id from cobranca_acordos a where a.contato_id = c.id limit 1)
    from cobranca_contatos c
    left join usuarios u on u.id = c.usuario_id
   where c.cliente_id = p_cliente_id
     and cobranca_pode_cliente(p_cliente_id)
   order by c.created_at desc, c.id desc;
$$;

/** Os boletos do associado (abertos primeiro), para a ficha. */
create or replace function cobranca_boletos_cliente(p_cliente_id uuid)
returns table (
  origem         text,
  boleto_id      uuid,
  placa          text,
  competencia    date,
  vencimento     date,
  valor          numeric,
  valor_pago     numeric,
  data_pagamento date,
  situacao       text,
  dias_atraso    integer,
  em_serasa      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select b.origem, b.boleto_id, v.placa, b.competencia, b.vencimento, b.valor,
         b.valor_pago, b.data_pagamento, b.situacao, b.dias_atraso, b.em_serasa
    from cobranca_boletos_base(null, null, null) b
    left join veiculos v on v.id = b.veiculo_id
   where b.cliente_id = p_cliente_id
   order by case b.situacao when 'vencido' then 0 when 'vence_hoje' then 1
                            when 'a_vencer' then 2 else 3 end,
            b.vencimento desc
   limit 60;
$$;

-- ============================================================================
-- (F) AS ESCRITAS
-- ============================================================================
/**
 * Registra um contato e, quando `p_acordo` vem, a promessa/acordo que nasceu
 * dele — numa transacao so. `p_acordo`:
 *   {"tipo":"PROMESSA"|"ACORDO", "observacao":"...",
 *    "parcelas":[{"vencimento":"2026-10-20","valor":150.00}, ...]}
 * Regras (espelho de `validarAcordo`, src/lib/cobranca-fila.ts): promessa tem
 * 1 parcela; acordo de 2 a 36; vencimentos de hoje ate 1 ano, em ordem
 * crescente; valores positivos; nao abre outra enquanto ha uma EM ANDAMENTO.
 */
create or replace function registrar_contato_cobranca(
  p_cliente_id      uuid,
  p_canal           text,
  p_resultado       text,
  p_observacao      text default null,
  p_proxima_acao_em date default null,
  p_proxima_acao    text default null,
  p_acordo          jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cli       clientes%rowtype;
  v_contato   uuid;
  v_acordo    uuid;
  v_tipo      text;
  v_parc      jsonb;
  v_n         integer;
  v_total     numeric := 0;
  v_ant       date;
  v_venc      date;
  v_valor     numeric;
  v_i         integer := 0;
  v_qtd       integer; v_soma numeric; v_atraso integer;
begin
  if auth.uid() is not null and not is_staff() then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_cli from clientes where id = p_cliente_id;
  if not found then
    raise exception 'Associado nao encontrado.' using errcode = 'no_data_found';
  end if;
  if not cobranca_pode_cliente(p_cliente_id) then
    raise exception 'Este associado nao esta no seu escopo de cobranca.' using errcode = 'insufficient_privilege';
  end if;
  if p_canal is null or p_canal not in ('LIGACAO','WHATSAPP','SMS','EMAIL','PRESENCIAL','OUTRO') then
    raise exception 'Canal de contato invalido: %.', coalesce(p_canal, '(vazio)') using errcode = 'check_violation';
  end if;
  if p_resultado is null or p_resultado not in
     ('FALOU','NAO_ATENDEU','RECADO','NUMERO_ERRADO','PROMETEU','NEGOCIANDO','RECUSOU','JA_PAGOU') then
    raise exception 'Resultado de contato invalido: %.', coalesce(p_resultado, '(vazio)') using errcode = 'check_violation';
  end if;
  if p_proxima_acao_em is not null and p_proxima_acao_em < current_date then
    raise exception 'A proxima acao nao pode ficar no passado.' using errcode = 'check_violation';
  end if;
  if p_resultado = 'PROMETEU' and p_acordo is null then
    raise exception 'Resultado "prometeu pagar" exige a promessa (data e valor).' using errcode = 'check_violation';
  end if;
  if p_acordo is not null and p_resultado <> 'PROMETEU' then
    raise exception 'Promessa/acordo so nasce de um contato com resultado "prometeu pagar".' using errcode = 'check_violation';
  end if;

  -- retrato da divida agora
  select count(*), coalesce(sum(valor), 0), coalesce(max(dias_atraso), 0)
    into v_qtd, v_soma, v_atraso
    from cobranca_boletos_base(null, null, null)
   where cliente_id = p_cliente_id and situacao = 'vencido';

  if p_acordo is not null then
    v_tipo := upper(coalesce(p_acordo->>'tipo', ''));
    v_parc := p_acordo->'parcelas';
    if v_tipo not in ('PROMESSA', 'ACORDO') then
      raise exception 'Tipo invalido: use PROMESSA ou ACORDO.' using errcode = 'check_violation';
    end if;
    if v_parc is null or jsonb_typeof(v_parc) <> 'array' then
      raise exception 'Informe as parcelas.' using errcode = 'check_violation';
    end if;
    v_n := jsonb_array_length(v_parc);
    if v_tipo = 'PROMESSA' and v_n <> 1 then
      raise exception 'Promessa tem uma parcela so; para mais, registre um ACORDO.' using errcode = 'check_violation';
    end if;
    if v_tipo = 'ACORDO' and (v_n < 2 or v_n > 36) then
      raise exception 'Acordo tem de 2 a 36 parcelas.' using errcode = 'check_violation';
    end if;
    if exists (select 1 from cobranca_acordos_situacao(null, p_cliente_id) s where s.status = 'EM_ANDAMENTO') then
      raise exception 'Ja existe promessa/acordo em andamento para este associado. Cancele antes de registrar outro.'
        using errcode = 'unique_violation';
    end if;
    for v_i in 0 .. v_n - 1 loop
      begin
        v_venc  := (v_parc->v_i->>'vencimento')::date;
        v_valor := (v_parc->v_i->>'valor')::numeric;
      exception when others then
        raise exception 'Parcela % com data ou valor ilegivel.', v_i + 1 using errcode = 'check_violation';
      end;
      if v_venc is null or v_valor is null or v_valor <= 0 then
        raise exception 'Parcela % precisa de data e valor positivo.', v_i + 1 using errcode = 'check_violation';
      end if;
      if v_venc < current_date or v_venc > current_date + 365 then
        raise exception 'Parcela %: a data tem de ser de hoje ate 1 ano.', v_i + 1 using errcode = 'check_violation';
      end if;
      if v_ant is not null and v_venc <= v_ant then
        raise exception 'Parcela %: as datas tem de estar em ordem crescente.', v_i + 1 using errcode = 'check_violation';
      end if;
      v_ant := v_venc;
      v_total := v_total + round(v_valor, 2);
    end loop;
  end if;

  insert into cobranca_contatos (cliente_id, regional_id, canal, resultado, observacao,
                                 proxima_acao_em, proxima_acao, boletos_vencidos,
                                 valor_vencido, dias_atraso, usuario_id)
  values (p_cliente_id, v_cli.regional_id, p_canal, p_resultado,
          nullif(btrim(coalesce(p_observacao, '')), ''),
          p_proxima_acao_em, nullif(btrim(coalesce(p_proxima_acao, '')), ''),
          v_qtd, v_soma, v_atraso, auth.uid())
  returning id into v_contato;

  if p_acordo is not null then
    insert into cobranca_acordos (cliente_id, regional_id, tipo, valor_total, divida_na_data,
                                  observacao, contato_id, criado_por)
    values (p_cliente_id, v_cli.regional_id, v_tipo, v_total, v_soma,
            nullif(btrim(coalesce(p_acordo->>'observacao', '')), ''), v_contato, auth.uid())
    returning id into v_acordo;
    insert into cobranca_acordo_parcelas (acordo_id, numero, vencimento, valor)
    select v_acordo, (x.ord)::smallint, (x.p->>'vencimento')::date, round((x.p->>'valor')::numeric, 2)
      from jsonb_array_elements(v_parc) with ordinality as x(p, ord);
  end if;

  return v_contato;
end;
$$;

/** Cancela uma promessa/acordo (motivo obrigatorio). O historico fica. */
create or replace function cancelar_acordo_cobranca(p_acordo_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a cobranca_acordos%rowtype;
begin
  if auth.uid() is not null and not is_staff() then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_a from cobranca_acordos where id = p_acordo_id;
  if not found then
    raise exception 'Promessa/acordo nao encontrado.' using errcode = 'no_data_found';
  end if;
  if not cobranca_pode_cliente(v_a.cliente_id) then
    raise exception 'Este associado nao esta no seu escopo de cobranca.' using errcode = 'insufficient_privilege';
  end if;
  if v_a.cancelado_em is not null then
    raise exception 'Esta promessa ja foi cancelada.' using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'check_violation';
  end if;
  update cobranca_acordos
     set cancelado_em = clock_timestamp(), cancelado_por = auth.uid(),
         motivo_cancelamento = btrim(p_motivo)
   where id = p_acordo_id;
end;
$$;

-- ============================================================================
-- RITO 0052 — nenhuma RPC aberta ao anon
-- ============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
