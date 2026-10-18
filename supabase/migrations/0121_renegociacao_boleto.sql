-- =============================================================================
-- 0121 — 2a VIA E BOLETO NEGOCIADO NA HORA (pedido do usuario, 18/10/2026)
--
-- "Quando o atendente vai negociar o debito e o associado pede a 2a via, precisa
-- ser feito na hora e ja enviado." Diagnostico de producao em 18/10: o SCar tem
-- ZERO titulos proprios e 7.973 boletos do Mutual em aberto (1.846 vencidos) —
-- que o SAC so mostrava, sem 2a via. O botao "2a via" dos titulos do SCar so
-- limpava o gateway e esperava a proxima remessa (que e so da matriz).
--
-- DECISAO DO USUARIO (18/10/2026): toda 2a via vencida e toda negociacao viram
-- BOLETO NOVO DO SCar, registrado no Sicredi na hora, e os boletos ORIGINAIS
-- (do Mutual ou do SCar) recebem BAIXA no Sicredi — assim o associado nao paga
-- duas vezes. O mesmo beneficiario Sicredi emite os dois, entao a baixa e nossa.
--
-- (A) `cobranca_renegociacoes` + `cobranca_renegociacao_origens`: o que foi
--     negociado, de onde veio e a situacao da baixa de cada original.
-- (B) `titulos_financeiros.renegociacao_id/renegociacao_parcela`: os boletos
--     novos (1 na 2a via, N no acordo). Sem fatura, de proposito: nao mexem no
--     corte da cobranca (0099) nem viram "mensalidade" nova.
-- (C) a importacao do Mutual nao reabre o boleto renegociado (trigger) — o
--     Mutual nao sabe da baixa e continuaria mandando "aberto".
-- (D) `cobranca_boletos_base` recriada: o titulo de renegociacao entra no painel
--     e na fila (senao a divida sumiria ao negociar); o corte continua sendo o
--     1o boleto COM fatura.
-- (E) `cobranca_acordos_situacao` recriada: pagar os boletos do acordo cumpre o
--     acordo (antes so contavam pagamentos dos boletos antigos).
-- (F) `fn_calcular_comissao`: titulo de renegociacao NAO gera comissao (cobra
--     divida antiga — o boleto do Mutual pago pelo banco tambem nao gera).
-- (G) RPCs: `criar_renegociacao`, `finalizar_emissao_renegociacao`,
--     `registrar_baixa_original`, `renegociacoes_do_cliente`. Quem pode: o
--     escopo da cobranca (`cobranca_pode_cliente`); o caminho sem sessao e a rota
--     do servidor, que confere a permissao antes.
-- =============================================================================

-- (A) ------------------------------------------------------------------------
create table if not exists cobranca_renegociacoes (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references clientes(id),
  regional_id    uuid references regionais(id),
  tipo           text not null,
  acordo_id      uuid references cobranca_acordos(id),
  valor_original numeric(12,2) not null,
  valor_total    numeric(12,2) not null,
  observacao     text,
  situacao       text not null default 'EMITINDO',
  erro           text,
  integracao_id  uuid references integracoes_bancarias(id),
  criado_por     uuid references usuarios(id),
  created_at     timestamptz not null default clock_timestamp(),
  emitida_em     timestamptz,
  constraint chk_reneg_tipo check (tipo in ('SEGUNDA_VIA', 'ACORDO')),
  constraint chk_reneg_situacao check (situacao in ('EMITINDO', 'EMITIDA', 'ERRO'))
);
create index if not exists idx_reneg_cliente on cobranca_renegociacoes (cliente_id, created_at desc);
create unique index if not exists uq_reneg_acordo on cobranca_renegociacoes (acordo_id)
  where acordo_id is not null and situacao <> 'ERRO';

create table if not exists cobranca_renegociacao_origens (
  id                  uuid primary key default gen_random_uuid(),
  renegociacao_id     uuid not null references cobranca_renegociacoes(id),
  origem              text not null,
  boleto_historico_id uuid references boletos_historico(id),
  titulo_id           uuid references titulos_financeiros(id),
  valor               numeric(12,2) not null,
  vencimento          date not null,
  nosso_numero        text,
  baixa_status        text not null default 'PENDENTE',
  baixa_erro          text,
  baixado_em          timestamptz,
  constraint chk_reneg_origem check (
    (origem = 'MUTUAL' and boleto_historico_id is not null and titulo_id is null)
    or (origem = 'SCAR' and titulo_id is not null and boleto_historico_id is null)),
  constraint chk_reneg_baixa check (baixa_status in ('PENDENTE', 'BAIXADO', 'ERRO', 'SEM_REGISTRO'))
);
create index if not exists idx_reneg_origens on cobranca_renegociacao_origens (renegociacao_id);
create index if not exists idx_reneg_origens_boleto on cobranca_renegociacao_origens (boleto_historico_id);
create index if not exists idx_reneg_origens_titulo on cobranca_renegociacao_origens (titulo_id);

comment on table cobranca_renegociacoes is
  '2a via vencida e acordo viram BOLETO NOVO do SCar (0121, decisao do usuario); os originais recebem baixa no Sicredi.';

alter table cobranca_renegociacoes enable row level security;
alter table cobranca_renegociacao_origens enable row level security;
drop policy if exists reneg_select on cobranca_renegociacoes;
create policy reneg_select on cobranca_renegociacoes for select to authenticated
  using (cobranca_pode_cliente(cliente_id));
drop policy if exists reneg_origens_select on cobranca_renegociacao_origens;
create policy reneg_origens_select on cobranca_renegociacao_origens for select to authenticated
  using (exists (select 1 from cobranca_renegociacoes r
                  where r.id = renegociacao_id and cobranca_pode_cliente(r.cliente_id)));
-- sem policy de escrita: grava SO pelas RPCs.
grant select on cobranca_renegociacoes, cobranca_renegociacao_origens to authenticated;

-- (B) ------------------------------------------------------------------------
alter table titulos_financeiros
  add column if not exists renegociacao_id uuid references cobranca_renegociacoes(id),
  add column if not exists renegociacao_parcela smallint;
create index if not exists idx_titulos_renegociacao on titulos_financeiros (renegociacao_id)
  where renegociacao_id is not null;

alter table boletos_historico
  add column if not exists renegociacao_id uuid references cobranca_renegociacoes(id);

-- (C) ------------------------------------------------------------------------
/** O boleto do Mutual baixado por renegociacao continua cancelado — salvo se o
 *  BANCO confirmou pagamento dele (0117 manda: o dinheiro entrou). */
create or replace function fn_boleto_historico_renegociado()
returns trigger
language plpgsql
as $$
begin
  if old.renegociacao_id is not null and new.baixa_banco_em is null then
    new.situacao        := 'cancelado';
    new.renegociacao_id := old.renegociacao_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_boleto_historico_renegociado on boletos_historico;
create trigger trg_boleto_historico_renegociado
  before update on boletos_historico
  for each row execute function fn_boleto_historico_renegociado();

-- (D) (E) (F) ----------------------------------------------------------------

/** 0121: o titulo de RENEGOCIACAO entra (sem fatura); o corte segue no 1o boleto COM fatura. */
create or replace function cobranca_boletos_base(
  p_inicio      date default null,
  p_fim         date default null,
  p_regional_id uuid default null
)
returns table (
  origem             text,
  boleto_id          uuid,
  cliente_id         uuid,
  veiculo_id         uuid,
  regional_id        uuid,
  competencia        date,
  vencimento         date,
  vencimento_efetivo date,
  valor              numeric,
  valor_pago         numeric,
  data_pagamento     date,
  situacao           text,
  ciclo              integer,
  dias_atraso        integer,
  em_serasa          boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with esc as (select * from cobranca_escopo()),
  scar as (
    select 'SCAR'::text as origem, t.id as boleto_id, t.cliente_id, t.veiculo_id,
           coalesce(f.regional_id, cl.regional_id) as regional_id,
           coalesce(f.competencia, date_trunc('month', t.data_vencimento)::date) as competencia,
           t.data_vencimento as vencimento,
           t.data_vencimento as venc_banco, null::date as limite,
           t.valor, t.valor_pago, t.data_pagamento,
           case t.status::text when 'pago' then 'pago' when 'cancelado' then 'cancelado'
                else 'aberto' end as base,
           false as em_serasa
      from titulos_financeiros t
      left join faturas f on f.titulo_id = t.id
      join clientes cl on cl.id = t.cliente_id
     -- 0121: entra tambem o titulo de RENEGOCIACAO (2a via / acordo), que nao
     -- tem fatura. Adesao e cobranca de rastreador seguem de fora.
     where f.id is not null or t.renegociacao_id is not null
  ),
  -- O corte continua sendo o 1o boleto de MENSALIDADE (com fatura): o titulo de
  -- renegociacao cobra divida antiga e nao pode esconder o historico do Mutual.
  corte as (
    select t.cliente_id, min(t.data_vencimento) as corte
      from titulos_financeiros t
      join faturas f on f.titulo_id = t.id
     where t.status::text <> 'cancelado'
     group by 1
  ),
  mutual as (
    select 'MUTUAL'::text, h.id, h.cliente_id, h.veiculo_id, cl.regional_id,
           h.competencia, h.vencimento_original, h.data_vencimento, h.data_limite,
           h.valor, h.valor_pago, h.data_pagamento, h.situacao, h.em_serasa
      from boletos_historico h
      join clientes cl on cl.id = h.cliente_id
      left join corte c on c.cliente_id = h.cliente_id
     where (c.corte is null or h.vencimento_original < c.corte)
       and (p_inicio is null or h.vencimento_original >= p_inicio)
       and (p_fim    is null or h.vencimento_original <= p_fim)
  ),
  u as (
    select * from scar
     where (p_inicio is null or vencimento >= p_inicio)
       and (p_fim    is null or vencimento <= p_fim)
    union all
    select * from mutual
  ),
  v as (
    select u.* from u, esc
     where (esc.global or u.regional_id = any (esc.regionais))
       and (p_regional_id is null or u.regional_id = p_regional_id)
  ),
  -- O dia util e resolvido por DATA DISTINTA (algumas centenas), nao por boleto
  -- (dezenas de milhares): e o que mantem a leitura dentro do teto de tempo.
  du as (
    select d.venc_banco, dia_util_seguinte(d.venc_banco) as util
      from (select distinct venc_banco from v) d
  ),
  e as (
    select v.*, coalesce(v.limite, du.util) as efetivo
      from v left join du on du.venc_banco = v.venc_banco
  )
  select e.origem, e.boleto_id, e.cliente_id, e.veiculo_id, e.regional_id,
         e.competencia, e.vencimento, e.efetivo, e.valor, e.valor_pago,
         e.data_pagamento,
         case
           when e.base = 'cancelado' then 'cancelado'
           when e.base = 'pago' then
             case when e.data_pagamento is null or e.data_pagamento <= e.efetivo
                  then 'pago_no_prazo' else 'pago_em_atraso' end
           when e.vencimento = current_date or e.efetivo = current_date then 'vence_hoje'
           when e.efetivo > current_date then 'a_vencer'
           else 'vencido'
         end,
         ciclo_vencimento(e.vencimento),
         case when e.base = 'aberto' and e.efetivo < current_date
              then (current_date - e.vencimento)::int else 0 end,
         e.em_serasa
    from e;
$$;

/** 0121: o pagamento dos boletos NOVOS do acordo cumpre o acordo. */
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
     where b.situacao in ('pago_no_prazo', 'pago_em_atraso')
       and (
         (b.vencimento <= a.data_base and b.data_pagamento >= a.data_base)
         -- 0121: os boletos NOVOS gerados para este acordo contam como pagamento dele
         or (b.origem = 'SCAR' and b.boleto_id in (
               select t.id from titulos_financeiros t
                 join cobranca_renegociacoes r on r.id = t.renegociacao_id
                where r.acordo_id = a.id))
       )
  ),
  q as (
    select a.id,
           (not exists (select 1 from b
                         where b.cliente_id = a.cliente_id and b.vencimento <= a.data_base
                           and b.situacao in ('vencido', 'vence_hoje', 'a_vencer'))
            and exists (select 1 from pg where pg.acordo_id = a.id)
            -- 0121: com boleto do acordo ainda em aberto, nao esta quitado
            and not exists (select 1 from titulos_financeiros t
                              join cobranca_renegociacoes r on r.id = t.renegociacao_id
                             where r.acordo_id = a.id and t.status::text in ('pendente', 'vencido'))) as quitado,
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
  -- 0121: titulo de RENEGOCIACAO cobra divida antiga (inclusive do Mutual, que
  -- nunca comissionou aqui): nao gera comissao.
  if new.renegociacao_id is not null then
    return new;
  end if;

  select v.* into v_vendedor
    from veiculos ve
    join vendedores v on v.id = ve.vendedor_id
   where ve.id = new.veiculo_id;

  if not found then
    return new;  -- veiculo sem vendedor: nada a comissionar
  end if;

  -- adesao = primeiro titulo pago deste veiculo — EXCETO veiculo migrado do
  -- Mutual, cuja adesao foi paga no sistema antigo (0095)
  select not exists (
           select 1 from comissoes_vendas c
            where c.veiculo_id = new.veiculo_id and c.is_adesao = true
         )
     and not exists (
           select 1 from integracao_vinculos iv
            where iv.sistema = 'MUTUAL' and iv.entidade = 'CONTRACT_OBJECT'
              and iv.tabela = 'veiculos' and iv.registro_id = new.veiculo_id
         )
    into v_is_adesao;

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


-- (G) ------------------------------------------------------------------------
/**
 * Cria a renegociacao e os boletos NOVOS (ainda sem banco). A rota do servidor
 * emite no Sicredi logo depois e fecha com `finalizar_emissao_renegociacao`.
 *   p_origens  [{"origem":"MUTUAL"|"SCAR","id":"<uuid>"}, ...]
 *   p_parcelas [{"vencimento":"2026-10-25","valor":150.00}, ...]
 * SEGUNDA_VIA = 1 parcela; ACORDO = 1..36. Origem tem de estar EM ABERTO, ser do
 * associado e nao estar em outra renegociacao viva; boleto do Mutual precisa do
 * nosso numero (e por ele que a baixa no Sicredi acontece).
 */
create or replace function criar_renegociacao(
  p_cliente_id uuid,
  p_tipo       text,
  p_origens    jsonb,
  p_parcelas   jsonb,
  p_acordo_id  uuid default null,
  p_observacao text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cli     clientes%rowtype;
  v_tipo    text := upper(coalesce(p_tipo, ''));
  v_id      uuid;
  v_o       jsonb;
  v_origem  text;
  v_ref     uuid;
  v_h       boletos_historico%rowtype;
  v_t       titulos_financeiros%rowtype;
  v_n       integer;
  v_i       integer;
  v_venc    date;
  v_valor   numeric;
  v_ant     date;
  v_total   numeric := 0;
  v_orig    numeric := 0;
  v_veic    uuid;
  v_maior   numeric := -1;
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
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
  -- Emissao interrompida (a rota caiu entre criar e fechar): passados 15 min, a
  -- tentativa vira ERRO e os boletos novos saem — senao travariam os originais.
  update titulos_financeiros t set status = 'cancelado',
         observacao = coalesce(t.observacao, '') || ' (emissao interrompida)'
    from cobranca_renegociacoes r
   where r.id = t.renegociacao_id and r.cliente_id = p_cliente_id
     and r.situacao = 'EMITINDO' and r.created_at < clock_timestamp() - interval '15 minutes';
  update cobranca_renegociacoes set situacao = 'ERRO', erro = 'Emissao interrompida antes da resposta do banco.'
   where cliente_id = p_cliente_id and situacao = 'EMITINDO'
     and created_at < clock_timestamp() - interval '15 minutes';

  if v_tipo not in ('SEGUNDA_VIA', 'ACORDO') then
    raise exception 'Tipo invalido: use SEGUNDA_VIA ou ACORDO.' using errcode = 'check_violation';
  end if;
  if p_origens is null or jsonb_typeof(p_origens) <> 'array' or jsonb_array_length(p_origens) = 0 then
    raise exception 'Escolha ao menos um boleto em aberto.' using errcode = 'check_violation';
  end if;
  if p_parcelas is null or jsonb_typeof(p_parcelas) <> 'array' then
    raise exception 'Informe o(s) vencimento(s) e valor(es) do boleto novo.' using errcode = 'check_violation';
  end if;
  v_n := jsonb_array_length(p_parcelas);
  if v_tipo = 'SEGUNDA_VIA' and v_n <> 1 then
    raise exception '2a via gera um boleto so; para parcelar, use ACORDO.' using errcode = 'check_violation';
  end if;
  if v_n < 1 or v_n > 36 then
    raise exception 'De 1 a 36 parcelas.' using errcode = 'check_violation';
  end if;
  if p_acordo_id is not null and not exists (
       select 1 from cobranca_acordos a
        where a.id = p_acordo_id and a.cliente_id = p_cliente_id and a.cancelado_em is null) then
    raise exception 'Acordo nao encontrado para este associado (ou cancelado).' using errcode = 'check_violation';
  end if;

  for v_i in 0 .. v_n - 1 loop
    begin
      v_venc  := (p_parcelas->v_i->>'vencimento')::date;
      v_valor := round((p_parcelas->v_i->>'valor')::numeric, 2);
    exception when others then
      raise exception 'Parcela % com data ou valor ilegivel.', v_i + 1 using errcode = 'check_violation';
    end;
    if v_venc is null or v_valor is null or v_valor <= 0 then
      raise exception 'Parcela % precisa de vencimento e valor positivo.', v_i + 1 using errcode = 'check_violation';
    end if;
    if v_venc < v_hoje or v_venc > v_hoje + 365 then
      raise exception 'Parcela %: o vencimento tem de ser de hoje ate 1 ano.', v_i + 1 using errcode = 'check_violation';
    end if;
    if v_ant is not null and v_venc <= v_ant then
      raise exception 'Parcela %: os vencimentos tem de estar em ordem crescente.', v_i + 1 using errcode = 'check_violation';
    end if;
    v_ant := v_venc;
    v_total := v_total + v_valor;
  end loop;

  insert into cobranca_renegociacoes (cliente_id, regional_id, tipo, acordo_id, valor_original,
                                      valor_total, observacao, criado_por)
  values (p_cliente_id, v_cli.regional_id, v_tipo, p_acordo_id, 0, v_total,
          nullif(btrim(coalesce(p_observacao, '')), ''),
          (select id from usuarios where id = auth.uid()))
  returning id into v_id;

  for v_o in select * from jsonb_array_elements(p_origens) loop
    v_origem := upper(coalesce(v_o->>'origem', ''));
    begin
      v_ref := (v_o->>'id')::uuid;
    exception when others then
      raise exception 'Boleto de origem ilegivel.' using errcode = 'check_violation';
    end;
    if v_origem = 'MUTUAL' then
      select * into v_h from boletos_historico where id = v_ref for update;
      if not found or v_h.cliente_id <> p_cliente_id then
        raise exception 'Boleto do Mutual nao encontrado para este associado.' using errcode = 'check_violation';
      end if;
      if v_h.situacao <> 'aberto' or v_h.baixa_banco_em is not null then
        raise exception 'O boleto do Mutual de % nao esta em aberto (situacao: %).',
          to_char(v_h.data_vencimento, 'DD/MM/YYYY'), v_h.situacao using errcode = 'check_violation';
      end if;
      if v_h.nosso_numero is null then
        raise exception 'O boleto do Mutual de % nao tem nosso numero: sem ele nao ha como dar baixa no Sicredi. Trate no Mutual.',
          to_char(v_h.data_vencimento, 'DD/MM/YYYY') using errcode = 'check_violation';
      end if;
      if exists (select 1 from cobranca_renegociacao_origens o
                   join cobranca_renegociacoes r on r.id = o.renegociacao_id
                  where o.boleto_historico_id = v_ref and r.situacao <> 'ERRO' and r.id <> v_id) then
        raise exception 'O boleto do Mutual de % ja esta em outra negociacao.',
          to_char(v_h.data_vencimento, 'DD/MM/YYYY') using errcode = 'unique_violation';
      end if;
      insert into cobranca_renegociacao_origens (renegociacao_id, origem, boleto_historico_id, valor, vencimento, nosso_numero)
      values (v_id, 'MUTUAL', v_ref, v_h.valor, v_h.data_vencimento, v_h.nosso_numero);
      v_orig := v_orig + v_h.valor;
      if v_h.valor > v_maior and v_h.veiculo_id is not null then v_maior := v_h.valor; v_veic := v_h.veiculo_id; end if;
    elsif v_origem = 'SCAR' then
      select * into v_t from titulos_financeiros where id = v_ref for update;
      if not found or v_t.cliente_id <> p_cliente_id then
        raise exception 'Boleto do SCar nao encontrado para este associado.' using errcode = 'check_violation';
      end if;
      if v_t.status::text not in ('pendente', 'vencido') then
        raise exception 'O boleto de % nao esta em aberto (situacao: %).',
          to_char(v_t.data_vencimento, 'DD/MM/YYYY'), v_t.status using errcode = 'check_violation';
      end if;
      if exists (select 1 from cobranca_renegociacao_origens o
                   join cobranca_renegociacoes r on r.id = o.renegociacao_id
                  where o.titulo_id = v_ref and r.situacao <> 'ERRO' and r.id <> v_id) then
        raise exception 'O boleto de % ja esta em outra negociacao.',
          to_char(v_t.data_vencimento, 'DD/MM/YYYY') using errcode = 'unique_violation';
      end if;
      insert into cobranca_renegociacao_origens (renegociacao_id, origem, titulo_id, valor, vencimento, nosso_numero)
      values (v_id, 'SCAR', v_ref, v_t.valor, v_t.data_vencimento, v_t.nosso_numero);
      v_orig := v_orig + v_t.valor;
      if v_t.valor > v_maior and v_t.veiculo_id is not null then v_maior := v_t.valor; v_veic := v_t.veiculo_id; end if;
    else
      raise exception 'Origem invalida: use MUTUAL ou SCAR.' using errcode = 'check_violation';
    end if;
  end loop;

  -- O veiculo do boleto novo: o do maior original; sem nenhum, o veiculo do
  -- associado mais recente na base (o DRE e a 24h leem o titulo pelo veiculo).
  if v_veic is null then
    select v.id into v_veic from veiculos v
     where v.cliente_id = p_cliente_id
     order by ordem_status_veiculo(v.status), v.data_ativacao desc nulls last limit 1;
  end if;

  update cobranca_renegociacoes set valor_original = v_orig where id = v_id;

  insert into titulos_financeiros (cliente_id, veiculo_id, valor, valor_original, data_vencimento,
                                   status, renegociacao_id, renegociacao_parcela, observacao)
  select p_cliente_id, v_veic, round((x.p->>'valor')::numeric, 2), round((x.p->>'valor')::numeric, 2),
         (x.p->>'vencimento')::date, 'pendente', v_id, x.ord::smallint,
         case when v_tipo = 'SEGUNDA_VIA' then '2a via negociada'
              else format('Acordo: parcela %s de %s', x.ord, v_n) end
    from jsonb_array_elements(p_parcelas) with ordinality as x(p, ord);

  return v_id;
end;
$$;

/**
 * Fecha a emissao no banco. `p_retornos`: [{"titulo_id","nosso_numero",
 * "linha_digitavel","pix_copia_cola","gateway_id","erro","retorno"}]. Se QUALQUER
 * boleto falhou, a renegociacao inteira vira ERRO e os boletos novos sao
 * cancelados (os que o banco aceitou a rota ja pediu baixa) — os originais NAO
 * foram tocados, entao nada se perde.
 */
create or replace function finalizar_emissao_renegociacao(
  p_id            uuid,
  p_integracao_id uuid,
  p_retornos      jsonb
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r   cobranca_renegociacoes%rowtype;
  v_x   jsonb;
  v_err text;
begin
  select * into v_r from cobranca_renegociacoes where id = p_id for update;
  if not found then raise exception 'Renegociacao nao encontrada.' using errcode = 'no_data_found'; end if;
  if auth.uid() is not null and not cobranca_pode_cliente(v_r.cliente_id) then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;
  if v_r.situacao <> 'EMITINDO' then
    raise exception 'Esta renegociacao ja foi fechada (%).', v_r.situacao using errcode = 'check_violation';
  end if;

  for v_x in select * from jsonb_array_elements(coalesce(p_retornos, '[]'::jsonb)) loop
    update titulos_financeiros t
       set gateway_transacao_id = coalesce(nullif(v_x->>'gateway_id', ''), t.gateway_transacao_id),
           nosso_numero    = coalesce(nullif(v_x->>'nosso_numero', ''), t.nosso_numero),
           linha_digitavel = coalesce(nullif(v_x->>'linha_digitavel', ''), t.linha_digitavel),
           pix_copia_cola  = coalesce(nullif(v_x->>'pix_copia_cola', ''), t.pix_copia_cola),
           integracao_id   = p_integracao_id,
           gateway_status  = case when nullif(v_x->>'erro', '') is null then 'REGISTRADO' else 'ERRO' end,
           gateway_erro    = nullif(v_x->>'erro', ''),
           enviado_em      = now()
     where t.id = (v_x->>'titulo_id')::uuid and t.renegociacao_id = p_id;
    if nullif(v_x->>'erro', '') is not null then
      v_err := coalesce(v_err || ' | ', '') || (v_x->>'erro');
    end if;
  end loop;

  if v_err is null and exists (select 1 from titulos_financeiros t
                                where t.renegociacao_id = p_id and t.linha_digitavel is null) then
    v_err := 'O banco nao devolveu a linha digitavel de todos os boletos.';
  end if;

  if v_err is not null then
    update titulos_financeiros set status = 'cancelado',
           observacao = coalesce(observacao, '') || ' (emissao recusada pelo banco)'
     where renegociacao_id = p_id;
    update cobranca_renegociacoes set situacao = 'ERRO', erro = v_err, integracao_id = p_integracao_id
     where id = p_id;
    return 'ERRO';
  end if;

  update cobranca_renegociacoes set situacao = 'EMITIDA', emitida_em = now(), integracao_id = p_integracao_id
   where id = p_id;
  return 'EMITIDA';
end;
$$;

/**
 * Resultado da baixa de UM boleto original no banco. BAIXADO (ou SEM_REGISTRO:
 * titulo do SCar que nunca foi ao banco) cancela o original aqui; ERRO guarda o
 * motivo e o original segue em aberto ate a nova tentativa.
 */
create or replace function registrar_baixa_original(
  p_origem_id uuid,
  p_status    text,
  p_erro      text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o cobranca_renegociacao_origens%rowtype;
  v_r cobranca_renegociacoes%rowtype;
  v_s text := upper(coalesce(p_status, ''));
begin
  select * into v_o from cobranca_renegociacao_origens where id = p_origem_id for update;
  if not found then raise exception 'Origem nao encontrada.' using errcode = 'no_data_found'; end if;
  select * into v_r from cobranca_renegociacoes where id = v_o.renegociacao_id;
  if auth.uid() is not null and not cobranca_pode_cliente(v_r.cliente_id) then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;
  if v_r.situacao <> 'EMITIDA' then
    raise exception 'So se baixa o original depois que o boleto novo foi emitido.' using errcode = 'check_violation';
  end if;
  if v_s not in ('BAIXADO', 'ERRO', 'SEM_REGISTRO') then
    raise exception 'Status de baixa invalido.' using errcode = 'check_violation';
  end if;
  if v_o.baixa_status in ('BAIXADO', 'SEM_REGISTRO') then
    return v_o.baixa_status;   -- re-executavel
  end if;

  update cobranca_renegociacao_origens
     set baixa_status = v_s,
         baixa_erro   = case when v_s = 'ERRO' then nullif(btrim(coalesce(p_erro, '')), '') end,
         baixado_em   = case when v_s = 'ERRO' then null else now() end
   where id = p_origem_id;

  if v_s <> 'ERRO' then
    if v_o.origem = 'MUTUAL' then
      update boletos_historico
         set situacao = 'cancelado', renegociacao_id = v_r.id, atualizado_em = now()
       where id = v_o.boleto_historico_id and baixa_banco_em is null;
    else
      update titulos_financeiros
         set status = 'cancelado',
             observacao = coalesce(observacao || ' · ', '') || 'renegociado'
       where id = v_o.titulo_id and status::text in ('pendente', 'vencido');
    end if;
  end if;
  return v_s;
end;
$$;

/** As renegociacoes do associado, com os boletos novos e a baixa dos originais. */
create or replace function renegociacoes_do_cliente(p_cliente_id uuid)
returns table (
  id             uuid,
  tipo           text,
  situacao       text,
  erro           text,
  valor_original numeric,
  valor_total    numeric,
  observacao     text,
  acordo_id      uuid,
  criado_por     text,
  created_at     timestamptz,
  boletos        jsonb,
  origens        jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.tipo, r.situacao, r.erro, r.valor_original, r.valor_total, r.observacao,
         r.acordo_id, u.nome, r.created_at,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', t.id, 'parcela', t.renegociacao_parcela, 'vencimento', t.data_vencimento,
                     'valor', t.valor, 'status', status_cobranca_efetivo(t.status, t.data_vencimento),
                     'linha_digitavel', t.linha_digitavel, 'pix_copia_cola', t.pix_copia_cola,
                     'nosso_numero', t.nosso_numero, 'gateway_erro', t.gateway_erro)
                     order by t.renegociacao_parcela)
                     from titulos_financeiros t where t.renegociacao_id = r.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', o.id, 'origem', o.origem, 'ref', coalesce(o.boleto_historico_id, o.titulo_id),
                     'vencimento', o.vencimento, 'valor', o.valor, 'nosso_numero', o.nosso_numero,
                     'baixa_status', o.baixa_status, 'baixa_erro', o.baixa_erro)
                     order by o.vencimento)
                     from cobranca_renegociacao_origens o where o.renegociacao_id = r.id), '[]'::jsonb)
    from cobranca_renegociacoes r
    left join usuarios u on u.id = r.criado_por
   where r.cliente_id = p_cliente_id
     and (auth.uid() is null or cobranca_pode_cliente(p_cliente_id))
   order by r.created_at desc
   limit 30;
$$;

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
