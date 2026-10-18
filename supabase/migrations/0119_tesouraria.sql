-- ============================================================================
-- 0119 — TESOURARIA: saldos por conta, extrato, OFX, transferencias e fluxo diario
-- ============================================================================
-- Pedido do usuario (18/10/2026): o Modulo Financeiro vira o centro financeiro
-- da associacao — extrato por conta, conciliacao por OFX, saldo de cada conta e
-- consolidado, fluxo de caixa DIARIO (realizado x a realizar) e relatorios.
--
-- O que ja existia e NAO muda:
--   * o dinheiro que circula mora em `baixas_financeiras` (0012), sempre com a
--     conta; e o que o webhook/agendador do Sicredi grava (0105/0117/0118);
--   * o DRE le `dre_movimentos` (0032) — nada aqui entra nele.
--
-- O que entra:
--   (A) `contas_bancarias`: saldo inicial (o saldo no FIM do dia
--       `saldo_inicial_em`; movimento ate esse dia nao entra na conta) e a
--       regra de mensalidade no OFX (NENHUM | POR_TEXTO | TODOS_CREDITOS).
--       `integracoes_bancarias.conta_bancaria_id`: em que conta cai o titulo do
--       SCar pago pelo banco (o titulo nao vira baixa: o DRE ja o conta).
--   (B) `transferencias_bancarias`: dinheiro entre contas proprias — muda o
--       saldo de cada conta, nunca o consolidado nem o DRE.
--   (C) `tesouraria_movimentos()`: a FONTE UNICA do caixa (baixas + titulos
--       pagos pelo banco + transferencias). Saldo, extrato, fluxo diario e o
--       demonstrativo leem dela, entao nao podem divergir entre telas.
--   (D) OFX: `extrato_importacoes` + `extrato_itens` (unique conta + FITID:
--       reimportar o mesmo arquivo nao duplica). O item do extrato NUNCA mexe
--       no saldo: ele e conferencia. Conciliar = apontar para o movimento que
--       ja existe (baixa, titulo, transferencia) ou criar o lancamento + baixa
--       ali mesmo. Credito de mensalidade (que o webhook ja baixou) casa com a
--       baixa existente; o que nao casa pode ser IGNORADO pela regra da conta.
--   (E) Leituras: `saldos_contas`, `saldo_consolidado_em`, `extrato_conta`,
--       `fluxo_caixa_diario`, `financeiro_demonstrativo`,
--       `conferencia_caixa_dre`.
-- Tudo e da MATRIZ (tem_acesso_global): a franquia tem o financeiro compacto
-- dela (0037) e nao concilia banco.
-- ============================================================================

-- (A) contas ---------------------------------------------------------------------
alter table contas_bancarias
  add column if not exists saldo_inicial numeric(14,2) not null default 0,
  add column if not exists saldo_inicial_em date,
  add column if not exists ofx_mensalidades text not null default 'POR_TEXTO',
  add column if not exists ofx_textos_mensalidade text[] not null
    default array['COBRANCA', 'LIQUIDACAO', 'BOLETO']::text[];

alter table contas_bancarias drop constraint if exists chk_conta_ofx_mensalidades;
alter table contas_bancarias add constraint chk_conta_ofx_mensalidades
  check (ofx_mensalidades in ('NENHUM', 'POR_TEXTO', 'TODOS_CREDITOS'));

comment on column contas_bancarias.saldo_inicial is
  'Saldo da conta no FIM do dia saldo_inicial_em (0119). Movimento ate esse dia nao entra no saldo.';
comment on column contas_bancarias.ofx_mensalidades is
  'OFX (0119): o que fazer com CREDITO que nao casou com movimento ja registrado — NENHUM (fica pendente), POR_TEXTO (ignora se o historico contem um dos textos), TODOS_CREDITOS (ignora todo credito).';

alter table integracoes_bancarias
  add column if not exists conta_bancaria_id uuid references contas_bancarias(id) on delete set null;
comment on column integracoes_bancarias.conta_bancaria_id is
  'Conta onde cai o titulo do SCar pago por esta integracao (0119). Sem ela o titulo pago fica fora do extrato.';

-- (B) transferencias ----------------------------------------------------------------
create table if not exists transferencias_bancarias (
  id                uuid primary key default gen_random_uuid(),
  conta_origem_id   uuid not null references contas_bancarias(id) on delete restrict,
  conta_destino_id  uuid not null references contas_bancarias(id) on delete restrict,
  valor             numeric(14,2) not null check (valor > 0),
  data              date not null,
  descricao         text,
  status            text not null default 'ATIVA' check (status in ('ATIVA', 'CANCELADA')),
  cancelada_motivo  text,
  created_by        uuid references usuarios(id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint chk_transferencia_contas check (conta_origem_id <> conta_destino_id)
);
create index if not exists idx_transf_data on transferencias_bancarias (data);

-- (D) OFX --------------------------------------------------------------------------
create table if not exists extrato_importacoes (
  id              uuid primary key default gen_random_uuid(),
  conta_id        uuid not null references contas_bancarias(id) on delete cascade,
  arquivo_nome    text,
  arquivo_hash    text,
  data_inicio     date,
  data_fim        date,
  saldo_banco     numeric(14,2),
  saldo_banco_em  date,
  itens           int not null default 0,
  novos           int not null default 0,
  repetidos       int not null default 0,
  sugeridos       int not null default 0,
  ignorados       int not null default 0,
  created_by      uuid references usuarios(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_extrato_imp_conta on extrato_importacoes (conta_id, created_at desc);

create table if not exists extrato_itens (
  id              uuid primary key default gen_random_uuid(),
  conta_id        uuid not null references contas_bancarias(id) on delete cascade,
  importacao_id   uuid references extrato_importacoes(id) on delete set null,
  fitid           text not null,
  data            date not null,
  valor           numeric(14,2) not null,
  tipo_ofx        text,
  historico       text,
  documento       text,
  situacao        text not null default 'PENDENTE'
                  check (situacao in ('PENDENTE', 'SUGERIDO', 'CONCILIADO', 'IGNORADO')),
  motivo          text,
  sugestao_tipo   text check (sugestao_tipo in ('BAIXA', 'TITULO', 'TRANSFERENCIA')),
  sugestao_id     uuid,
  baixa_id        uuid references baixas_financeiras(id) on delete set null,
  titulo_id       uuid references titulos_financeiros(id) on delete set null,
  transferencia_id uuid references transferencias_bancarias(id) on delete set null,
  conciliado_por  uuid references usuarios(id) on delete set null,
  conciliado_em   timestamptz,
  created_at      timestamptz not null default now(),
  constraint uq_extrato_item unique (conta_id, fitid)
);
create index if not exists idx_extrato_itens_conta on extrato_itens (conta_id, data);
create index if not exists idx_extrato_itens_situacao on extrato_itens (situacao);
-- Um movimento do sistema casa com UM item do extrato.
create unique index if not exists uq_extrato_item_baixa on extrato_itens (baixa_id) where baixa_id is not null;
create unique index if not exists uq_extrato_item_titulo on extrato_itens (titulo_id) where titulo_id is not null;
create unique index if not exists uq_extrato_item_transf on extrato_itens (transferencia_id, conta_id) where transferencia_id is not null;

alter table transferencias_bancarias enable row level security;
alter table extrato_importacoes      enable row level security;
alter table extrato_itens            enable row level security;

drop policy if exists transf_select on transferencias_bancarias;
create policy transf_select on transferencias_bancarias for select to authenticated using ((select tem_acesso_global()));
drop policy if exists extimp_select on extrato_importacoes;
create policy extimp_select on extrato_importacoes for select to authenticated using ((select tem_acesso_global()));
drop policy if exists extitem_select on extrato_itens;
create policy extitem_select on extrato_itens for select to authenticated using ((select tem_acesso_global()));
grant select on transferencias_bancarias, extrato_importacoes, extrato_itens to authenticated;

-- Baixa apagada (ex.: o nao identificado cancelado na 0118) devolve o item ao trabalho.
create or replace function fn_baixa_solta_extrato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update extrato_itens
     set situacao = 'PENDENTE', baixa_id = null, conciliado_por = null, conciliado_em = null,
         motivo = 'A baixa conciliada foi removida'
   where baixa_id = old.id;
  update extrato_itens
     set situacao = 'PENDENTE', sugestao_tipo = null, sugestao_id = null
   where sugestao_tipo = 'BAIXA' and sugestao_id = old.id and situacao = 'SUGERIDO';
  return old;
end;
$$;
drop trigger if exists trg_baixa_solta_extrato on baixas_financeiras;
create trigger trg_baixa_solta_extrato before delete on baixas_financeiras
  for each row execute function fn_baixa_solta_extrato();

-- Helpers ---------------------------------------------------------------------------
create or replace function exige_tesouraria()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'A tesouraria e da matriz (admin ou financeiro)' using errcode = '42501';
  end if;
end;
$$;

create or replace function hoje_sp()
returns date
language sql
stable
set search_path = public
as $$ select data_sp(now()) $$;

-- (C) a fonte unica do caixa --------------------------------------------------------------
-- valor > 0 entra, < 0 sai. `valido` = depois do saldo inicial da conta.
create or replace function tesouraria_movimentos(p_inicio date default null, p_fim date default null)
returns table (
  data             date,
  conta_id         uuid,
  origem           text,
  ref_id           uuid,
  lancamento_id    uuid,
  valor            numeric,
  descricao        text,
  documento        text,
  contraparte      text,
  categoria_id     uuid,
  centro_custo_id  uuid,
  forma            text,
  conciliado       boolean,
  extrato_item_id  uuid,
  outra_conta_id   uuid,
  valido           boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    -- 1) baixas (o webhook, o agendador e a tela gravam aqui)
    select b.data_pagamento as data, b.conta_bancaria_id as conta_id, 'BAIXA'::text as origem,
           b.id as ref_id, l.id as lancamento_id,
           case when l.tipo = 'RECEITA' then b.valor_liquido else -b.valor_liquido end as valor,
           l.descricao,
           coalesce(nullif(l.numero_documento, ''), b.id_transacao_bancaria_externa) as documento,
           coalesce(f.nome_fantasia, f.razao_social, c.nome_razao_social, v.nome) as contraparte,
           l.categoria_dre_id as categoria_id, l.centro_custo_id,
           b.forma_pagamento::text as forma,
           (b.status_conciliacao <> 'NAO_CONCILIADO' or ei.id is not null) as conciliado,
           ei.id as extrato_item_id, null::uuid as outra_conta_id
      from baixas_financeiras b
      join lancamentos_financeiros l on l.id = b.lancamento_id
      left join fornecedores f on f.id = l.fornecedor_id
      left join clientes c on c.id = l.cliente_id
      left join vendedores v on v.id = l.vendedor_id
      left join extrato_itens ei on ei.baixa_id = b.id
     where l.status <> 'cancelado'
       and b.conta_bancaria_id is not null
       and (p_inicio is null or b.data_pagamento >= p_inicio)
       and (p_fim is null or b.data_pagamento <= p_fim)

    union all
    -- 2) titulo do SCar pago pelo banco (nao vira baixa: o DRE ja o le do titulo)
    select t.data_pagamento, i.conta_bancaria_id, 'TITULO', t.id, null::uuid,
           coalesce(t.valor_pago, t.valor),
           'Mensalidade - ' || coalesce(c.nome_razao_social, ''),
           t.nosso_numero, c.nome_razao_social,
           (select id from categorias_dre where codigo_estruturado = '1.1.00'), null::uuid,
           'BOLETO', ei.id is not null, ei.id, null::uuid
      from titulos_financeiros t
      join integracoes_bancarias i on i.id = t.integracao_id and i.conta_bancaria_id is not null
      left join clientes c on c.id = t.cliente_id
      left join extrato_itens ei on ei.titulo_id = t.id
     where t.status = 'pago' and t.data_pagamento is not null
       and (p_inicio is null or t.data_pagamento >= p_inicio)
       and (p_fim is null or t.data_pagamento <= p_fim)

    union all
    -- 3) transferencias: sai da origem ...
    select tr.data, tr.conta_origem_id, 'TRANSFERENCIA', tr.id, null::uuid, -tr.valor,
           coalesce(nullif(tr.descricao, ''), 'Transferencia para ' || cd.nome),
           null::text, cd.nome, null::uuid, null::uuid, 'TRANSFERENCIA',
           ei.id is not null, ei.id, tr.conta_destino_id
      from transferencias_bancarias tr
      join contas_bancarias cd on cd.id = tr.conta_destino_id
      left join extrato_itens ei on ei.transferencia_id = tr.id and ei.conta_id = tr.conta_origem_id
     where tr.status = 'ATIVA'
       and (p_inicio is null or tr.data >= p_inicio)
       and (p_fim is null or tr.data <= p_fim)

    union all
    -- ... e entra no destino
    select tr.data, tr.conta_destino_id, 'TRANSFERENCIA', tr.id, null::uuid, tr.valor,
           coalesce(nullif(tr.descricao, ''), 'Transferencia de ' || co.nome),
           null::text, co.nome, null::uuid, null::uuid, 'TRANSFERENCIA',
           ei.id is not null, ei.id, tr.conta_origem_id
      from transferencias_bancarias tr
      join contas_bancarias co on co.id = tr.conta_origem_id
      left join extrato_itens ei on ei.transferencia_id = tr.id and ei.conta_id = tr.conta_destino_id
     where tr.status = 'ATIVA'
       and (p_inicio is null or tr.data >= p_inicio)
       and (p_fim is null or tr.data <= p_fim)
  )
  select m.data, m.conta_id, m.origem, m.ref_id, m.lancamento_id, m.valor, m.descricao, m.documento,
         m.contraparte, m.categoria_id, m.centro_custo_id, m.forma, m.conciliado, m.extrato_item_id,
         m.outra_conta_id,
         (cb.saldo_inicial_em is null or m.data > cb.saldo_inicial_em) as valido
    from m
    join contas_bancarias cb on cb.id = m.conta_id
   where tem_acesso_global() or auth.uid() is null;
$$;

-- Saldo no FIM do dia p_data (conta ou todas).
create or replace function saldo_consolidado_em(p_data date, p_conta uuid default null)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case when not (tem_acesso_global() or auth.uid() is null) then null else
    coalesce((select sum(cb.saldo_inicial) from contas_bancarias cb
               where (p_conta is null or cb.id = p_conta)
                 and (cb.saldo_inicial_em is null or cb.saldo_inicial_em <= p_data)), 0)
    + coalesce((select sum(m.valor) from tesouraria_movimentos(null, p_data) m
                 where m.valido and (p_conta is null or m.conta_id = p_conta)), 0)
  end;
$$;

-- (E) leituras ------------------------------------------------------------------------
create or replace function saldos_contas(p_data date default null)
returns table (
  conta_id           uuid,
  nome               text,
  banco              text,
  tipo               text,
  ativo              boolean,
  saldo_inicial      numeric,
  saldo_inicial_em   date,
  entradas           numeric,
  saidas             numeric,
  saldo              numeric,
  movimentos         int,
  nao_conciliados    int,
  extrato_saldo      numeric,
  extrato_saldo_em   date,
  saldo_sistema_no_extrato numeric,
  extrato_diferenca  numeric,
  itens_pendentes    int,
  ultima_importacao  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with dia as (select coalesce(p_data, hoje_sp()) as d),
  mov as (
    select m.conta_id,
           sum(m.valor) filter (where m.valor > 0) as ent,
           -sum(m.valor) filter (where m.valor < 0) as sai,
           sum(m.valor) as liq,
           count(*) as n,
           count(*) filter (where not m.conciliado) as nc
      from tesouraria_movimentos(null, (select d from dia)) m
     where m.valido
     group by m.conta_id
  ),
  ult as (
    select distinct on (ei.conta_id) ei.conta_id, ei.saldo_banco, ei.saldo_banco_em, ei.created_at
      from extrato_importacoes ei
     where ei.saldo_banco is not null and ei.saldo_banco_em is not null
     order by ei.conta_id, ei.saldo_banco_em desc, ei.created_at desc
  ),
  imp as (
    select conta_id, max(created_at) as em from extrato_importacoes group by conta_id
  ),
  pend as (
    select conta_id, count(*) as n from extrato_itens where situacao in ('PENDENTE', 'SUGERIDO') group by conta_id
  )
  select cb.id, cb.nome, cb.banco, cb.tipo, cb.ativo,
         cb.saldo_inicial, cb.saldo_inicial_em,
         coalesce(mov.ent, 0), coalesce(mov.sai, 0),
         cb.saldo_inicial + coalesce(mov.liq, 0),
         coalesce(mov.n, 0)::int, coalesce(mov.nc, 0)::int,
         ult.saldo_banco, ult.saldo_banco_em,
         case when ult.saldo_banco_em is not null then saldo_consolidado_em(ult.saldo_banco_em, cb.id) end,
         case when ult.saldo_banco_em is not null
              then round(ult.saldo_banco - saldo_consolidado_em(ult.saldo_banco_em, cb.id), 2) end,
         coalesce(pend.n, 0)::int, imp.em
    from contas_bancarias cb
    left join mov  on mov.conta_id = cb.id
    left join ult  on ult.conta_id = cb.id
    left join imp  on imp.conta_id = cb.id
    left join pend on pend.conta_id = cb.id
   where tem_acesso_global() or auth.uid() is null
   order by cb.ativo desc, cb.nome;
$$;

-- Extrato da conta (ou consolidado). O saldo acumulado e calculado sobre TUDO e
-- so depois os filtros escondem linhas: o saldo da linha e sempre o verdadeiro.
create or replace function extrato_conta(
  p_conta        uuid,
  p_inicio       date,
  p_fim          date,
  p_centro       uuid default null,
  p_categoria    uuid default null,
  p_conciliacao  text default null,      -- null | CONCILIADO | NAO_CONCILIADO
  p_transferencias boolean default null  -- consolidado: transferencias internas aparecem? (padrao nao)
)
returns table (
  data             date,
  conta_id         uuid,
  conta            text,
  origem           text,
  ref_id           uuid,
  lancamento_id    uuid,
  descricao        text,
  documento        text,
  contraparte      text,
  categoria_codigo text,
  categoria        text,
  centro_custo     text,
  forma            text,
  entrada          numeric,
  saida            numeric,
  saldo            numeric,
  saldo_anterior   numeric,
  conciliado       boolean,
  extrato_item_id  uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with ini as (select saldo_consolidado_em(p_inicio - 1, p_conta) as s),
  base as (
    select m.*
      from tesouraria_movimentos(p_inicio, p_fim) m
     where m.valido
       and (p_conta is null or m.conta_id = p_conta)
       and not (p_conta is null and m.origem = 'TRANSFERENCIA')
  ),
  corrido as (
    select b.*,
           (select s from ini) + sum(b.valor) over (order by b.data, b.origem, b.ref_id
                                                   rows between unbounded preceding and current row) as saldo
      from base b
  ),
  transf_consolidado as (
    -- no consolidado as transferencias somam zero; aparecem so se pedidas
    select m.*, null::numeric as saldo
      from tesouraria_movimentos(p_inicio, p_fim) m
     where p_conta is null and coalesce(p_transferencias, false)
       and m.valido and m.origem = 'TRANSFERENCIA'
  ),
  tudo as (
    select * from corrido
    union all
    select * from transf_consolidado
  )
  select t.data, t.conta_id, cb.nome, t.origem, t.ref_id, t.lancamento_id, t.descricao, t.documento,
         t.contraparte, cat.codigo_estruturado, cat.nome, cc.nome, t.forma,
         case when t.valor > 0 then t.valor else 0 end,
         case when t.valor < 0 then -t.valor else 0 end,
         t.saldo, (select s from ini), t.conciliado, t.extrato_item_id
    from tudo t
    join contas_bancarias cb on cb.id = t.conta_id
    left join categorias_dre cat on cat.id = t.categoria_id
    left join centros_custo cc on cc.id = t.centro_custo_id
   where (p_centro is null or t.centro_custo_id = p_centro)
     and (p_categoria is null or t.categoria_id = p_categoria)
     and (p_conciliacao is null
          or (p_conciliacao = 'CONCILIADO' and t.conciliado)
          or (p_conciliacao = 'NAO_CONCILIADO' and not t.conciliado))
   order by t.data, t.origem, t.ref_id;
$$;

-- Fluxo de caixa DIARIO. Realizado = movimentos (mesma fonte do saldo).
-- A realizar = lancamentos em aberto (saldo devedor) por vencimento, a partir de
-- hoje; o que ja venceu e nao foi pago aparece na linha de HOJE como vencido.
-- Boletos previstos = boletos do Mutual em aberto + titulos do SCar a vencer
-- (entram pelo banco quando pagos — coluna separada, para nao misturar).
-- Previsao nao tem conta: com p_conta, so o realizado e filtrado.
create or replace function fluxo_caixa_diario(p_inicio date, p_fim date, p_conta uuid default null)
returns table (
  dia                 date,
  realizado_entrada   numeric,
  realizado_saida     numeric,
  previsto_entrada    numeric,
  previsto_saida      numeric,
  previsto_boletos    numeric,
  vencido_entrada     numeric,
  vencido_saida       numeric,
  qtd_previsto_saida  int
)
language sql
stable
security definer
set search_path = public
as $$
  with h as (select hoje_sp() as hoje),
  dias as (select generate_series(p_inicio, p_fim, interval '1 day')::date as dia),
  real_ as (
    select m.data as dia,
           sum(m.valor) filter (where m.valor > 0) as ent,
           -sum(m.valor) filter (where m.valor < 0) as sai
      from tesouraria_movimentos(p_inicio, p_fim) m
     where m.valido
       and (p_conta is null or m.conta_id = p_conta)
       and not (p_conta is null and m.origem = 'TRANSFERENCIA')
     group by m.data
  ),
  aberto as (
    select l.tipo, l.data_vencimento, coalesce(l.valor_saldo, l.valor_original) as v
      from lancamentos_financeiros l
     where l.status in ('pendente', 'atrasado', 'pago_parcial')
       and coalesce(l.valor_saldo, l.valor_original) > 0
       and l.data_vencimento <= p_fim
  ),
  prev as (
    select a.data_vencimento as dia,
           sum(a.v) filter (where a.tipo = 'RECEITA') as ent,
           sum(a.v) filter (where a.tipo = 'DESPESA') as sai,
           count(*) filter (where a.tipo = 'DESPESA') as qs
      from aberto a, h
     where a.data_vencimento >= greatest(p_inicio, h.hoje)
     group by 1
  ),
  venc as (
    select sum(a.v) filter (where a.tipo = 'RECEITA') as ent,
           sum(a.v) filter (where a.tipo = 'DESPESA') as sai
      from aberto a, h
     where a.data_vencimento < h.hoje
  ),
  bol as (
    select d.dia, sum(d.v) as v from (
      select bh.data_vencimento as dia, bh.valor as v
        from boletos_historico bh
       where bh.situacao = 'aberto'
         and bh.data_vencimento between greatest(p_inicio, (select hoje from h)) and p_fim
      union all
      select t.data_vencimento, t.valor
        from titulos_financeiros t
       where t.status in ('pendente', 'vencido')
         and t.data_vencimento between greatest(p_inicio, (select hoje from h)) and p_fim
    ) d group by d.dia
  )
  select d.dia,
         coalesce(r.ent, 0), coalesce(r.sai, 0),
         case when p_conta is null then coalesce(p.ent, 0) else 0 end,
         case when p_conta is null then coalesce(p.sai, 0) else 0 end,
         case when p_conta is null then coalesce(b.v, 0) else 0 end,
         case when p_conta is null and d.dia = (select hoje from h) then coalesce((select ent from venc), 0) else 0 end,
         case when p_conta is null and d.dia = (select hoje from h) then coalesce((select sai from venc), 0) else 0 end,
         case when p_conta is null then coalesce(p.qs, 0)::int else 0 end
    from dias d
    left join real_ r on r.dia = d.dia
    left join prev p on p.dia = d.dia
    left join bol b on b.dia = d.dia
   where tem_acesso_global() or auth.uid() is null
   order by d.dia;
$$;

-- Demonstrativo por plano de contas x centro de custo (realizado, a realizar e vencido).
create or replace function financeiro_demonstrativo(
  p_inicio    date,
  p_fim       date,
  p_conta     uuid default null,
  p_centro    uuid default null,
  p_categoria uuid default null,
  p_status    text default null   -- null | PAGO | PENDENTE | ATRASADO | CONCILIADO
)
returns table (
  categoria_id     uuid,
  codigo           text,
  categoria        text,
  grupo            text,
  centro_custo_id  uuid,
  centro_custo     text,
  realizado        numeric,
  a_realizar       numeric,
  vencido          numeric,
  quantidade       int
)
language sql
stable
security definer
set search_path = public
as $$
  with h as (select hoje_sp() as hoje),
  linhas as (
    select m.categoria_id, m.centro_custo_id, m.valor as realizado, 0::numeric as a_realizar, 0::numeric as vencido
      from tesouraria_movimentos(p_inicio, p_fim) m
     where m.valido and m.origem <> 'TRANSFERENCIA'
       and (p_conta is null or m.conta_id = p_conta)
       and (p_status is null or p_status = 'PAGO' or (p_status = 'CONCILIADO' and m.conciliado))
    union all
    select l.categoria_dre_id, l.centro_custo_id, 0,
           case when l.data_vencimento >= (select hoje from h)
                then (case when l.tipo = 'RECEITA' then 1 else -1 end) * coalesce(l.valor_saldo, l.valor_original) else 0 end,
           case when l.data_vencimento <  (select hoje from h)
                then (case when l.tipo = 'RECEITA' then 1 else -1 end) * coalesce(l.valor_saldo, l.valor_original) else 0 end
      from lancamentos_financeiros l
     where p_conta is null
       and l.status in ('pendente', 'atrasado', 'pago_parcial')
       and l.data_vencimento between p_inicio and p_fim
       and (p_status is null or p_status in ('PENDENTE', 'ATRASADO'))
       and (p_status is distinct from 'ATRASADO' or l.data_vencimento < (select hoje from h))
       and (p_status is distinct from 'PENDENTE' or l.data_vencimento >= (select hoje from h))
  )
  select cat.id, coalesce(cat.codigo_estruturado, '9.9.99'), coalesce(cat.nome, 'Sem plano de contas'),
         coalesce(cat.tipo::text, 'SEM_CLASSIFICACAO'),
         cc.id, coalesce(cc.nome, 'Sem centro de custo'),
         round(sum(x.realizado), 2), round(sum(x.a_realizar), 2), round(sum(x.vencido), 2),
         count(*)::int
    from linhas x
    left join categorias_dre cat on cat.id = x.categoria_id
    left join centros_custo cc on cc.id = x.centro_custo_id
   where (tem_acesso_global() or auth.uid() is null)
     and (p_centro is null or x.centro_custo_id = p_centro)
     and (p_categoria is null or x.categoria_id = p_categoria)
   group by cat.id, cat.codigo_estruturado, cat.nome, cat.tipo, cc.id, cc.nome
   order by codigo_conta_ordenavel(coalesce(cat.codigo_estruturado, '9.9.99')), coalesce(cc.nome, 'Sem centro de custo');
$$;

-- Conferencia caixa x DRE (regime de caixa) no periodo.
create or replace function conferencia_caixa_dre(p_inicio date, p_fim date)
returns table (
  saldo_inicial          numeric,
  saldo_final            numeric,
  variacao_saldo         numeric,
  resultado_dre_caixa    numeric,
  diferenca              numeric,
  baixas_sem_conta       numeric,
  titulos_fora_do_extrato numeric,
  movimentos_avulsos     numeric,
  antes_do_saldo_inicial numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select saldo_consolidado_em(p_inicio - 1) as ini, saldo_consolidado_em(p_fim) as fim
  ),
  dre as (select coalesce(sum(valor), 0) as r from dre_movimentos(p_inicio, p_fim, null, 'CAIXA')),
  sem_conta as (
    select coalesce(sum(case when l.tipo = 'RECEITA' then b.valor_liquido else -b.valor_liquido end), 0) as v
      from baixas_financeiras b join lancamentos_financeiros l on l.id = b.lancamento_id
     where l.status <> 'cancelado' and b.conta_bancaria_id is null
       and b.data_pagamento between p_inicio and p_fim
  ),
  tit as (
    select coalesce(sum(coalesce(t.valor_pago, 0)), 0) as v
      from titulos_financeiros t
      left join integracoes_bancarias i on i.id = t.integracao_id
     where t.status = 'pago' and t.data_pagamento between p_inicio and p_fim
       and i.conta_bancaria_id is null
  ),
  avul as (
    select coalesce(sum(case when m.tipo = 'RECEITA' then m.valor else -m.valor end), 0) as v
      from movimentacoes_caixa m
     where m.status <> 'cancelado' and m.lancamento_id is null
       and coalesce(m.data_caixa, m.data_competencia) between p_inicio and p_fim
  ),
  antes as (
    select coalesce(sum(m.valor), 0) as v
      from tesouraria_movimentos(p_inicio, p_fim) m where not m.valido and m.origem <> 'TRANSFERENCIA'
  )
  select s.ini, s.fim, s.fim - s.ini, dre.r,
         round((s.fim - s.ini) - dre.r, 2),
         sem_conta.v, tit.v, avul.v, antes.v
    from s, dre, sem_conta, tit, avul, antes
   where tem_acesso_global() or auth.uid() is null;
$$;

-- (D) OFX: importar, classificar e conciliar ----------------------------------------------
create or replace function texto_extrato(p text)
returns text
language sql
immutable
set search_path = public
as $$ select upper(texto_sem_acento(coalesce(p, ''))) $$;

-- Procura o movimento que o item do extrato representa. So devolve quando ha UM.
create or replace function sugestao_extrato_item(p_item uuid)
returns table (tipo text, ref_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  it extrato_itens%rowtype;
  v_abs numeric;
  v_n int;
  v_id uuid;
begin
  select * into it from extrato_itens where id = p_item;
  if it.id is null then return; end if;
  v_abs := abs(it.valor);

  -- baixas da mesma conta, mesmo valor e sentido, ate 3 dias de distancia, livres
  select count(*), min(b.id::text)::uuid into v_n, v_id
    from baixas_financeiras b join lancamentos_financeiros l on l.id = b.lancamento_id
   where b.conta_bancaria_id = it.conta_id and l.status <> 'cancelado'
     and b.valor_liquido = v_abs
     and l.tipo = case when it.valor > 0 then 'RECEITA' else 'DESPESA' end::tipo_movimentacao
     and b.data_pagamento between it.data - 3 and it.data + 3
     and not exists (select 1 from extrato_itens x where x.baixa_id = b.id)
     and not exists (select 1 from extrato_itens x where x.sugestao_tipo = 'BAIXA' and x.sugestao_id = b.id
                       and x.situacao = 'SUGERIDO' and x.id <> it.id);
  if v_n > 1 then
    -- desempate: o do mesmo dia, se for um so
    select count(*), min(b.id::text)::uuid into v_n, v_id
      from baixas_financeiras b join lancamentos_financeiros l on l.id = b.lancamento_id
     where b.conta_bancaria_id = it.conta_id and l.status <> 'cancelado'
       and b.valor_liquido = v_abs
       and l.tipo = case when it.valor > 0 then 'RECEITA' else 'DESPESA' end::tipo_movimentacao
       and b.data_pagamento = it.data
       and not exists (select 1 from extrato_itens x where x.baixa_id = b.id)
       and not exists (select 1 from extrato_itens x where x.sugestao_tipo = 'BAIXA' and x.sugestao_id = b.id
                         and x.situacao = 'SUGERIDO' and x.id <> it.id);
  end if;
  if v_n = 1 then tipo := 'BAIXA'; ref_id := v_id; return next; return; end if;

  if it.valor > 0 then
    select count(*), min(t.id::text)::uuid into v_n, v_id
      from titulos_financeiros t
      join integracoes_bancarias i on i.id = t.integracao_id and i.conta_bancaria_id = it.conta_id
     where t.status = 'pago' and coalesce(t.valor_pago, t.valor) = v_abs
       and t.data_pagamento between it.data - 3 and it.data + 3
       and not exists (select 1 from extrato_itens x where x.titulo_id = t.id)
       and not exists (select 1 from extrato_itens x where x.sugestao_tipo = 'TITULO' and x.sugestao_id = t.id
                         and x.situacao = 'SUGERIDO' and x.id <> it.id);
    if v_n = 1 then tipo := 'TITULO'; ref_id := v_id; return next; return; end if;
  end if;

  select count(*), min(tr.id::text)::uuid into v_n, v_id
    from transferencias_bancarias tr
   where tr.status = 'ATIVA' and tr.valor = v_abs
     and ((it.valor < 0 and tr.conta_origem_id = it.conta_id) or (it.valor > 0 and tr.conta_destino_id = it.conta_id))
     and tr.data between it.data - 3 and it.data + 3
     and not exists (select 1 from extrato_itens x where x.transferencia_id = tr.id and x.conta_id = it.conta_id)
     and not exists (select 1 from extrato_itens x where x.sugestao_tipo = 'TRANSFERENCIA' and x.sugestao_id = tr.id
                       and x.conta_id = it.conta_id and x.situacao = 'SUGERIDO' and x.id <> it.id);
  if v_n = 1 then tipo := 'TRANSFERENCIA'; ref_id := v_id; return next; end if;
end;
$$;

-- Classifica itens PENDENTES (sugestao > regra de mensalidade > pendente).
create or replace function classificar_extrato_itens(p_conta uuid, p_importacao uuid default null)
returns table (sugeridos int, ignorados int)
language plpgsql
security definer
set search_path = public
as $$
declare
  r extrato_itens%rowtype;
  cb contas_bancarias%rowtype;
  s record;
  v_sug int := 0;
  v_ign int := 0;
  v_txt text;
begin
  perform exige_tesouraria();
  select * into cb from contas_bancarias where id = p_conta;
  for r in
    select * from extrato_itens
     where conta_id = p_conta and situacao = 'PENDENTE'
       and (p_importacao is null or importacao_id = p_importacao)
     order by data, valor, fitid
  loop
    select * into s from sugestao_extrato_item(r.id) limit 1;
    if s.ref_id is not null then
      update extrato_itens set situacao = 'SUGERIDO', sugestao_tipo = s.tipo, sugestao_id = s.ref_id, motivo = null
       where id = r.id;
      v_sug := v_sug + 1;
      continue;
    end if;
    if r.valor > 0 and cb.ofx_mensalidades = 'TODOS_CREDITOS' then
      update extrato_itens set situacao = 'IGNORADO', motivo = 'MENSALIDADE: a conta ignora todo credito do OFX (a baixa vem pelo banco)'
       where id = r.id;
      v_ign := v_ign + 1;
    elsif r.valor > 0 and cb.ofx_mensalidades = 'POR_TEXTO' then
      select t into v_txt
        from unnest(cb.ofx_textos_mensalidade) t
       where nullif(trim(t), '') is not null
         and position(texto_extrato(t) in texto_extrato(r.historico)) > 0
       limit 1;
      if v_txt is not null then
        update extrato_itens set situacao = 'IGNORADO',
               motivo = 'MENSALIDADE: historico contem "' || v_txt || '" (a baixa vem pelo banco)'
         where id = r.id;
        v_ign := v_ign + 1;
      end if;
    end if;
    v_txt := null;
  end loop;
  sugeridos := v_sug; ignorados := v_ign;
  return next;
end;
$$;

create or replace function importar_extrato_ofx(
  p_conta        uuid,
  p_arquivo      text,
  p_hash         text,
  p_data_inicio  date,
  p_data_fim     date,
  p_saldo_banco  numeric,
  p_saldo_em     date,
  p_itens        jsonb      -- [{fitid, data, valor, tipo, historico, documento}]
)
returns table (importacao_id uuid, itens int, novos int, repetidos int, sugeridos int, ignorados int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_imp uuid;
  v_total int;
  v_novos int;
  c record;
begin
  perform exige_tesouraria();
  if not exists (select 1 from contas_bancarias where id = p_conta) then
    raise exception 'Conta bancaria nao encontrada' using errcode = '22023';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Arquivo sem lancamentos' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_itens);
  if v_total > 20000 then
    raise exception 'Arquivo grande demais (% lancamentos). Divida o periodo.', v_total using errcode = '22023';
  end if;

  insert into extrato_importacoes (conta_id, arquivo_nome, arquivo_hash, data_inicio, data_fim,
                                   saldo_banco, saldo_banco_em, itens, created_by)
  values (p_conta, p_arquivo, p_hash, p_data_inicio, p_data_fim, p_saldo_banco, p_saldo_em, v_total,
          usuario_atual_id())
  returning id into v_imp;

  with ins as (
    insert into extrato_itens (conta_id, importacao_id, fitid, data, valor, tipo_ofx, historico, documento)
    select p_conta, v_imp, x.fitid, x.data, round(x.valor, 2), x.tipo, x.historico, x.documento
      from jsonb_to_recordset(p_itens) as x(fitid text, data date, valor numeric, tipo text, historico text, documento text)
     where nullif(trim(x.fitid), '') is not null and x.data is not null and x.valor is not null and x.valor <> 0
    on conflict on constraint uq_extrato_item do nothing
    returning 1
  )
  select count(*) into v_novos from ins;

  select * into c from classificar_extrato_itens(p_conta, v_imp);

  update extrato_importacoes
     set novos = v_novos, repetidos = v_total - v_novos,
         sugeridos = coalesce(c.sugeridos, 0), ignorados = coalesce(c.ignorados, 0)
   where id = v_imp;

  importacao_id := v_imp; itens := v_total; novos := v_novos; repetidos := v_total - v_novos;
  sugeridos := coalesce(c.sugeridos, 0); ignorados := coalesce(c.ignorados, 0);
  return next;
end;
$$;

-- Liga o item ao movimento. Tipos: BAIXA, TITULO, TRANSFERENCIA, LANCAMENTO (paga
-- um lancamento em aberto com este item: cria a baixa na conta e na data do extrato).
create or replace function conciliar_extrato_item(p_item uuid, p_tipo text, p_ref uuid)
returns extrato_itens
language plpgsql
security definer
set search_path = public
as $$
declare
  it extrato_itens%rowtype;
  v_abs numeric;
  b baixas_financeiras%rowtype;
  l lancamentos_financeiros%rowtype;
  t titulos_financeiros%rowtype;
  tr transferencias_bancarias%rowtype;
  v_baixa uuid;
begin
  perform exige_tesouraria();
  select * into it from extrato_itens where id = p_item for update;
  if it.id is null then raise exception 'Item do extrato nao encontrado' using errcode = '22023'; end if;
  if it.situacao = 'CONCILIADO' then raise exception 'Este item ja esta conciliado' using errcode = '22023'; end if;
  v_abs := abs(it.valor);

  if p_tipo = 'BAIXA' then
    select * into b from baixas_financeiras where id = p_ref;
    select * into l from lancamentos_financeiros where id = b.lancamento_id;
    if b.id is null or l.status = 'cancelado' then raise exception 'Baixa nao encontrada' using errcode = '22023'; end if;
    if b.conta_bancaria_id is distinct from it.conta_id then
      raise exception 'A baixa e de outra conta bancaria' using errcode = '22023';
    end if;
    if (it.valor > 0) <> (l.tipo = 'RECEITA') then
      raise exception 'Sentido diferente: o extrato e % e o lancamento e %',
        case when it.valor > 0 then 'credito' else 'debito' end, lower(l.tipo::text) using errcode = '22023';
    end if;
    if abs(b.valor_liquido - v_abs) >= 0.01 then
      raise exception 'Valores diferentes: extrato % x baixa %', v_abs, b.valor_liquido using errcode = '22023';
    end if;
    if exists (select 1 from extrato_itens x where x.baixa_id = b.id) then
      raise exception 'Esta baixa ja esta conciliada com outro item' using errcode = '22023';
    end if;
    update baixas_financeiras set status_conciliacao = 'CONCILIADO_MANUAL' where id = b.id;
    update extrato_itens set situacao = 'CONCILIADO', baixa_id = b.id, sugestao_tipo = null, sugestao_id = null,
           motivo = null, conciliado_por = usuario_atual_id(), conciliado_em = now()
     where id = it.id;

  elsif p_tipo = 'TITULO' then
    select * into t from titulos_financeiros where id = p_ref;
    if t.id is null or t.status <> 'pago' then raise exception 'Titulo pago nao encontrado' using errcode = '22023'; end if;
    if it.valor < 0 then raise exception 'Titulo so concilia com credito' using errcode = '22023'; end if;
    if abs(coalesce(t.valor_pago, t.valor) - v_abs) >= 0.01 then
      raise exception 'Valores diferentes: extrato % x titulo %', v_abs, coalesce(t.valor_pago, t.valor) using errcode = '22023';
    end if;
    update extrato_itens set situacao = 'CONCILIADO', titulo_id = t.id, sugestao_tipo = null, sugestao_id = null,
           motivo = null, conciliado_por = usuario_atual_id(), conciliado_em = now()
     where id = it.id;

  elsif p_tipo = 'TRANSFERENCIA' then
    select * into tr from transferencias_bancarias where id = p_ref and status = 'ATIVA';
    if tr.id is null then raise exception 'Transferencia nao encontrada' using errcode = '22023'; end if;
    if not ((it.valor < 0 and tr.conta_origem_id = it.conta_id) or (it.valor > 0 and tr.conta_destino_id = it.conta_id)) then
      raise exception 'A transferencia nao passa por esta conta neste sentido' using errcode = '22023';
    end if;
    if abs(tr.valor - v_abs) >= 0.01 then
      raise exception 'Valores diferentes: extrato % x transferencia %', v_abs, tr.valor using errcode = '22023';
    end if;
    update extrato_itens set situacao = 'CONCILIADO', transferencia_id = tr.id, sugestao_tipo = null, sugestao_id = null,
           motivo = null, conciliado_por = usuario_atual_id(), conciliado_em = now()
     where id = it.id;

  elsif p_tipo = 'LANCAMENTO' then
    select * into l from lancamentos_financeiros where id = p_ref for update;
    if l.id is null or l.status in ('cancelado', 'quitado') then
      raise exception 'Lancamento em aberto nao encontrado' using errcode = '22023';
    end if;
    if (it.valor > 0) <> (l.tipo = 'RECEITA') then
      raise exception 'Sentido diferente: o extrato e % e o lancamento e %',
        case when it.valor > 0 then 'credito' else 'debito' end, lower(l.tipo::text) using errcode = '22023';
    end if;
    insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id,
                                    id_transacao_bancaria_externa, status_conciliacao, observacao)
    values (l.id, it.data, v_abs, v_abs, it.conta_id, it.fitid, 'CONCILIADO_MANUAL',
            'Baixa pela conciliacao do extrato')
    returning id into v_baixa;
    update extrato_itens set situacao = 'CONCILIADO', baixa_id = v_baixa, sugestao_tipo = null, sugestao_id = null,
           motivo = null, conciliado_por = usuario_atual_id(), conciliado_em = now()
     where id = it.id;
  else
    raise exception 'Tipo de conciliacao desconhecido: %', p_tipo using errcode = '22023';
  end if;

  select * into it from extrato_itens where id = p_item;
  return it;
end;
$$;

create or replace function confirmar_sugestoes_extrato(p_conta uuid, p_itens uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r extrato_itens%rowtype;
  v_n int := 0;
begin
  perform exige_tesouraria();
  for r in
    select * from extrato_itens
     where conta_id = p_conta and situacao = 'SUGERIDO'
       and (p_itens is null or id = any(p_itens))
     order by data, fitid
  loop
    perform conciliar_extrato_item(r.id, r.sugestao_tipo, r.sugestao_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Cria o lancamento (ja quitado) a partir do item: tarifa, rendimento, pagamento
-- sem titulo cadastrado. O lancamento vai para o DRE como qualquer outro.
create or replace function criar_lancamento_extrato(
  p_item        uuid,
  p_descricao   text,
  p_categoria   uuid,
  p_centro      uuid default null,
  p_fornecedor  uuid default null,
  p_cliente     uuid default null,
  p_regional    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  it extrato_itens%rowtype;
  v_lanc uuid;
  v_baixa uuid;
begin
  perform exige_tesouraria();
  select * into it from extrato_itens where id = p_item for update;
  if it.id is null then raise exception 'Item do extrato nao encontrado' using errcode = '22023'; end if;
  if it.situacao = 'CONCILIADO' then raise exception 'Este item ja esta conciliado' using errcode = '22023'; end if;
  if nullif(trim(p_descricao), '') is null then raise exception 'Informe a descricao' using errcode = '22023'; end if;
  if p_categoria is null then raise exception 'Informe o plano de contas' using errcode = '22023'; end if;

  insert into lancamentos_financeiros (tipo, fornecedor_id, cliente_id, descricao, categoria_dre_id, centro_custo_id,
                                       regional_id, valor_original, data_emissao, data_vencimento, competencia,
                                       numero_documento, observacoes)
  values (case when it.valor > 0 then 'RECEITA' else 'DESPESA' end::tipo_movimentacao,
          p_fornecedor, p_cliente, trim(p_descricao), p_categoria, p_centro, p_regional, abs(it.valor),
          it.data, it.data, date_trunc('month', it.data)::date,
          nullif(coalesce(nullif(it.documento, ''), 'OFX-' || it.fitid), ''),
          'Criado pela conciliacao do extrato: ' || coalesce(it.historico, ''))
  returning id into v_lanc;

  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id,
                                  id_transacao_bancaria_externa, status_conciliacao, observacao)
  values (v_lanc, it.data, abs(it.valor), abs(it.valor), it.conta_id, it.fitid, 'CONCILIADO_MANUAL',
          'Baixa pela conciliacao do extrato')
  returning id into v_baixa;

  update extrato_itens set situacao = 'CONCILIADO', baixa_id = v_baixa, sugestao_tipo = null, sugestao_id = null,
         motivo = null, conciliado_por = usuario_atual_id(), conciliado_em = now()
   where id = it.id;
  return v_lanc;
end;
$$;

create or replace function criar_transferencia_bancaria(
  p_origem uuid, p_destino uuid, p_valor numeric, p_data date, p_descricao text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  perform exige_tesouraria();
  if p_origem is null or p_destino is null or p_origem = p_destino then
    raise exception 'Escolha duas contas diferentes' using errcode = '22023';
  end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Valor tem de ser maior que zero' using errcode = '22023'; end if;
  if p_data is null then raise exception 'Informe a data' using errcode = '22023'; end if;
  insert into transferencias_bancarias (conta_origem_id, conta_destino_id, valor, data, descricao, created_by)
  values (p_origem, p_destino, round(p_valor, 2), p_data, nullif(trim(p_descricao), ''), usuario_atual_id())
  returning id into v_id;
  return v_id;
end;
$$;

-- Transferencia a partir do item: cria e concilia o lado desta conta; o outro lado
-- e sugerido no extrato da outra conta, se ja estiver importado.
create or replace function transferencia_extrato_item(p_item uuid, p_outra_conta uuid, p_descricao text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  it extrato_itens%rowtype;
  v_id uuid;
  r extrato_itens%rowtype;
begin
  perform exige_tesouraria();
  select * into it from extrato_itens where id = p_item for update;
  if it.id is null then raise exception 'Item do extrato nao encontrado' using errcode = '22023'; end if;
  if it.situacao = 'CONCILIADO' then raise exception 'Este item ja esta conciliado' using errcode = '22023'; end if;
  v_id := criar_transferencia_bancaria(
    case when it.valor < 0 then it.conta_id else p_outra_conta end,
    case when it.valor < 0 then p_outra_conta else it.conta_id end,
    abs(it.valor), it.data, coalesce(nullif(trim(p_descricao), ''), it.historico));
  perform conciliar_extrato_item(it.id, 'TRANSFERENCIA', v_id);
  for r in select * from extrato_itens where conta_id = p_outra_conta and situacao = 'PENDENTE'
             and abs(valor) = abs(it.valor) and data between it.data - 3 and it.data + 3
             and sign(valor) = -sign(it.valor)
           order by abs(data - it.data), fitid limit 1
  loop
    update extrato_itens set situacao = 'SUGERIDO', sugestao_tipo = 'TRANSFERENCIA', sugestao_id = v_id where id = r.id;
  end loop;
  return v_id;
end;
$$;

create or replace function cancelar_transferencia_bancaria(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform exige_tesouraria();
  if nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  if exists (select 1 from extrato_itens where transferencia_id = p_id) then
    raise exception 'A transferencia esta conciliada com o extrato: desfaca a conciliacao antes' using errcode = '22023';
  end if;
  update transferencias_bancarias set status = 'CANCELADA', cancelada_motivo = trim(p_motivo)
   where id = p_id and status = 'ATIVA';
  update extrato_itens set situacao = 'PENDENTE', sugestao_tipo = null, sugestao_id = null
   where sugestao_tipo = 'TRANSFERENCIA' and sugestao_id = p_id and situacao = 'SUGERIDO';
end;
$$;

create or replace function ignorar_extrato_item(p_item uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform exige_tesouraria();
  if nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo' using errcode = '22023'; end if;
  update extrato_itens
     set situacao = 'IGNORADO', motivo = trim(p_motivo), sugestao_tipo = null, sugestao_id = null,
         conciliado_por = usuario_atual_id(), conciliado_em = now()
   where id = p_item and situacao in ('PENDENTE', 'SUGERIDO');
  if not found then raise exception 'So item pendente ou sugerido pode ser ignorado' using errcode = '22023'; end if;
end;
$$;

-- Volta o item a PENDENTE. O lancamento criado pela conciliacao NAO e apagado (o
-- dinheiro existiu): quem quiser desfaze-lo cancela o lancamento no financeiro.
create or replace function desfazer_extrato_item(p_item uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare it extrato_itens%rowtype;
begin
  perform exige_tesouraria();
  select * into it from extrato_itens where id = p_item for update;
  if it.id is null then raise exception 'Item do extrato nao encontrado' using errcode = '22023'; end if;
  if it.baixa_id is not null then
    update baixas_financeiras set status_conciliacao = 'NAO_CONCILIADO'
     where id = it.baixa_id and status_conciliacao = 'CONCILIADO_MANUAL';
  end if;
  update extrato_itens
     set situacao = 'PENDENTE', motivo = null, sugestao_tipo = null, sugestao_id = null,
         baixa_id = null, titulo_id = null, transferencia_id = null, conciliado_por = null, conciliado_em = null
   where id = p_item;
end;
$$;

-- Candidatos para o item (a tela mostra para escolher quando nao ha sugestao unica).
create or replace function candidatos_extrato_item(p_item uuid, p_dias int default 5)
returns table (tipo text, ref_id uuid, data date, valor numeric, descricao text, contraparte text,
               valor_igual boolean, dias int)
language sql
stable
security definer
set search_path = public
as $$
  with it as (select * from extrato_itens where id = p_item)
  select * from (
    select 'BAIXA'::text, b.id, b.data_pagamento, b.valor_liquido, l.descricao,
           coalesce(f.nome_fantasia, f.razao_social, c.nome_razao_social),
           abs(b.valor_liquido - abs(it.valor)) < 0.01, abs(b.data_pagamento - it.data)
      from it
      join baixas_financeiras b on b.conta_bancaria_id = it.conta_id
      join lancamentos_financeiros l on l.id = b.lancamento_id and l.status <> 'cancelado'
           and l.tipo = case when it.valor > 0 then 'RECEITA' else 'DESPESA' end::tipo_movimentacao
      left join fornecedores f on f.id = l.fornecedor_id
      left join clientes c on c.id = l.cliente_id
     where b.data_pagamento between it.data - p_dias and it.data + p_dias
       and not exists (select 1 from extrato_itens x where x.baixa_id = b.id)
    union all
    select 'LANCAMENTO', l.id, l.data_vencimento, coalesce(l.valor_saldo, l.valor_original), l.descricao,
           coalesce(f.nome_fantasia, f.razao_social, c.nome_razao_social),
           abs(coalesce(l.valor_saldo, l.valor_original) - abs(it.valor)) < 0.01, abs(l.data_vencimento - it.data)
      from it
      join lancamentos_financeiros l on l.status in ('pendente', 'atrasado', 'pago_parcial')
           and l.tipo = case when it.valor > 0 then 'RECEITA' else 'DESPESA' end::tipo_movimentacao
      left join fornecedores f on f.id = l.fornecedor_id
      left join clientes c on c.id = l.cliente_id
     where l.data_vencimento between it.data - (p_dias * 6) and it.data + (p_dias * 6)
    union all
    select 'TRANSFERENCIA', tr.id, tr.data, tr.valor,
           coalesce(tr.descricao, 'Transferencia'), co.nome || ' -> ' || cd.nome,
           abs(tr.valor - abs(it.valor)) < 0.01, abs(tr.data - it.data)
      from it
      join transferencias_bancarias tr on tr.status = 'ATIVA'
           and ((it.valor < 0 and tr.conta_origem_id = it.conta_id) or (it.valor > 0 and tr.conta_destino_id = it.conta_id))
      join contas_bancarias co on co.id = tr.conta_origem_id
      join contas_bancarias cd on cd.id = tr.conta_destino_id
     where tr.data between it.data - p_dias and it.data + p_dias
       and not exists (select 1 from extrato_itens x where x.transferencia_id = tr.id and x.conta_id = it.conta_id)
  ) c(tipo, ref_id, data, valor, descricao, contraparte, valor_igual, dias)
  where tem_acesso_global() or auth.uid() is null
  order by valor_igual desc, dias, tipo
  limit 40;
$$;

comment on function tesouraria_movimentos(date, date) is
  'Fonte UNICA do caixa (0119): baixas com conta + titulos pagos pelo banco (conta da integracao) + transferencias. Saldo, extrato, fluxo diario e demonstrativo leem daqui.';

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
