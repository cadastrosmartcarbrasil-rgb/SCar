-- =============================================================================
-- 0097 — COBRANCA: perfis, historico de boletos do Mutual e o painel (Fase 1)
--
-- Origem: "Modulo de Inadimplencia e Cobrancas" (documento 2, 30/09/2026) e as
-- decisoes do usuario em 12/10/2026:
--   * caminho B — o historico de boletos do Mutual entra no SCar. E ele que diz
--     a "qualidade do pagador" (pagou no prazo? atrasou? reincide?), e sem ele
--     o painel ficaria vazio ate o carne de janeiro;
--   * os perfis SUPERVISOR e COBRANCA passam a existir;
--   * comecar pela Fase 1: painel + calendario dos 6 ciclos.
--
-- (A) PERFIS. `supervisor` responde por VARIAS unidades (tabela
--     `supervisor_regionais`); `cobranca` sem unidade enxerga o Brasil, com
--     unidade enxerga a dela. O escopo vale DENTRO das RPCs de cobranca
--     (`cobranca_escopo`), nao em `pode_regional()` — mexer nele seria mexer
--     nas 87 policies (achado nº 1 da varredura, decisao de desenho a parte).
-- (B) PARAMETROS: meta e limite de inadimplencia (o semaforo) em `empresa`, e
--     `cobranca_feriados` para o vencimento efetivo.
-- (C) `boletos_historico`: os boletos de MENSALIDADE do Mutual dos associados
--     JA CARREGADOS. Tabela PROPRIA, de proposito, e NAO `titulos_financeiros`:
--       - la eles entrariam no DRE (`dre_movimentos`) e contariam de novo uma
--         receita que o Mutual ja contou;
--       - `dias_atraso_cliente()` passaria a recusar a 24h por divida que quem
--         cobra e o outro sistema.
--     Diferente da `mutual_captura` (area de passagem, apagada no corte), esta
--     tabela FICA: e historia de pagamento do associado.
-- (D) `cobranca_boletos_base`: a fonte UNICA do modulo — SCar (titulos de
--     mensalidade, ligados a fatura) + historico do Mutual ate a data de corte
--     de cada associado (o 1º boleto do SCar dele), com a SITUACAO do documento:
--     a_vencer · vence_hoje · vencido · pago_no_prazo · pago_em_atraso · cancelado.
--     REGRA ESSENCIAL: boleto que ainda nao venceu NAO e inadimplencia.
-- (E) Leituras do painel: indicadores por recorte (atual, 3 anteriores, ano
--     anterior), carteira, calendario por ciclo, por regional, serie de 12
--     meses e a lista de detalhamento (todo numero abre os boletos).
-- (F) `resumo_cobrancas` (0025) corrigida: inadimplencia = vencido / o que JA
--     venceu, e nao / tudo o que foi emitido (contava o "a vencer" na base).
--
-- As PORCENTAGENS sao calculadas no TS (`src/lib/cobranca-painel.ts`, testado):
-- o banco devolve contagens e somas, e a formula fica num lugar so.
-- =============================================================================

-- ============================================================================
-- (A) PERFIS
-- ============================================================================
-- Valor novo de enum nao pode ser USADO na mesma transacao: daqui para baixo
-- o papel e comparado como TEXTO (padrao 0017/0026/0028).
alter type papel_usuario add value if not exists 'supervisor';
alter type papel_usuario add value if not exists 'cobranca';

create table if not exists supervisor_regionais (
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  regional_id uuid not null references regionais(id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid references usuarios(id) on delete set null,
  primary key (usuario_id, regional_id)
);

comment on table supervisor_regionais is
  'Unidades pelas quais o SUPERVISOR responde (0097). Lido por cobranca_escopo(). '
  'Escrita so por definir_regionais_supervisor (admin).';

alter table supervisor_regionais enable row level security;
drop policy if exists supervisor_regionais_select on supervisor_regionais;
create policy supervisor_regionais_select on supervisor_regionais for select to authenticated
  using (tem_acesso_global() or usuario_id = auth.uid());
grant select on supervisor_regionais to authenticated;

create or replace function definir_regionais_supervisor(p_usuario_id uuid, p_regionais uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'Somente o administrador define as unidades do supervisor.'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from usuarios where id = p_usuario_id) then
    raise exception 'Usuario nao encontrado.' using errcode = 'no_data_found';
  end if;

  delete from supervisor_regionais
   where usuario_id = p_usuario_id
     and regional_id <> all (coalesce(p_regionais, '{}'::uuid[]));

  insert into supervisor_regionais (usuario_id, regional_id, created_by)
  select p_usuario_id, r, auth.uid()
    from unnest(coalesce(p_regionais, '{}'::uuid[])) r
   where exists (select 1 from regionais g where g.id = r)
  on conflict do nothing;

  select count(*) into v_n from supervisor_regionais where usuario_id = p_usuario_id;
  return v_n;
end;
$$;

create or replace function regionais_do_supervisor(p_usuario_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(regional_id order by regional_id), '{}'::uuid[])
    from supervisor_regionais
   where usuario_id = p_usuario_id
     and (tem_acesso_global() or p_usuario_id = auth.uid() or auth.uid() is null);
$$;

/**
 * O ESCOPO da cobranca, resolvido UMA vez por chamada (nao por linha).
 *   global    -> enxerga tudo, inclusive o que e da MATRIZ (regional nula):
 *                admin/financeiro, `cobranca` sem unidade e o caminho de
 *                servidor (sem sessao, service_role).
 *   regionais -> o gestor e a `cobranca` com unidade veem a dela; o supervisor,
 *                as da `supervisor_regionais` (+ a propria, se tiver).
 * Os outros papeis (consultor, sinistro, auditoria, 24h) e o associado do
 * /portal ficam com escopo VAZIO: nao leem nada aqui.
 */
create or replace function cobranca_escopo()
returns table (global boolean, regionais uuid[])
language sql
stable
security definer
set search_path = public
as $$
  select
    (auth.uid() is null
      or tem_acesso_global()
      or (auth_papel()::text = 'cobranca' and auth_regional_id() is null)) as global,
    array(
      select auth_regional_id()
       where auth_papel()::text in ('gestor_regional', 'cobranca', 'supervisor')
         and auth_regional_id() is not null
      union
      select sr.regional_id
        from supervisor_regionais sr
       where auth_papel()::text = 'supervisor'
         and sr.usuario_id = auth.uid()
    ) as regionais;
$$;

-- ============================================================================
-- (B) PARAMETROS
-- ============================================================================
alter table empresa add column if not exists cobranca_meta_inadimplencia   numeric(5,2) not null default 5;
alter table empresa add column if not exists cobranca_limite_inadimplencia numeric(5,2) not null default 10;

alter table empresa drop constraint if exists chk_empresa_cobranca_semaforo;
alter table empresa add constraint chk_empresa_cobranca_semaforo check (
  cobranca_meta_inadimplencia between 0 and 100
  and cobranca_limite_inadimplencia between 0 and 100
  and cobranca_meta_inadimplencia <= cobranca_limite_inadimplencia
);

comment on column empresa.cobranca_meta_inadimplencia is
  'Semaforo da cobranca (0097): inadimplencia financeira ate a META e verde.';
comment on column empresa.cobranca_limite_inadimplencia is
  'Semaforo da cobranca (0097): acima do LIMITE e vermelho; entre meta e limite, ambar.';

create table if not exists cobranca_feriados (
  data       date primary key,
  descricao  text not null,
  created_at timestamptz not null default now(),
  created_by uuid references usuarios(id) on delete set null
);
comment on table cobranca_feriados is
  'Feriados bancarios (0097). Boleto que vence em fim de semana ou feriado so '
  'conta como vencido depois do proximo dia util — nao antecipar inadimplencia.';
alter table cobranca_feriados enable row level security;
drop policy if exists cobranca_feriados_select on cobranca_feriados;
create policy cobranca_feriados_select on cobranca_feriados for select to authenticated
  using (is_staff());
grant select on cobranca_feriados to authenticated;

create or replace function cobranca_parametros()
returns table (meta numeric, limite numeric, feriados jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select cobranca_meta_inadimplencia from empresa limit 1), 5),
         coalesce((select cobranca_limite_inadimplencia from empresa limit 1), 10),
         coalesce((select jsonb_agg(jsonb_build_object('data', data, 'descricao', descricao) order by data)
                     from cobranca_feriados), '[]'::jsonb)
   where is_staff() or auth.uid() is null;
$$;

create or replace function salvar_parametros_cobranca(p_meta numeric, p_limite numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Somente a matriz (admin/financeiro) altera a meta da cobranca.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_meta is null or p_limite is null or p_meta < 0 or p_limite > 100 or p_meta > p_limite then
    raise exception 'A meta tem de ficar entre 0 e o limite, e o limite ate 100%%.'
      using errcode = 'check_violation';
  end if;
  update empresa set cobranca_meta_inadimplencia = p_meta,
                     cobranca_limite_inadimplencia = p_limite;
  if not found then
    raise exception 'Cadastre a empresa em Configuracoes -> Empresa antes de definir a meta.'
      using errcode = 'no_data_found';
  end if;
end;
$$;

create or replace function salvar_feriado_cobranca(p_data date, p_descricao text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Somente a matriz (admin/financeiro) mantem os feriados.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_data is null or btrim(coalesce(p_descricao, '')) = '' then
    raise exception 'Informe a data e a descricao do feriado.' using errcode = 'check_violation';
  end if;
  insert into cobranca_feriados (data, descricao, created_by)
  values (p_data, upper(btrim(p_descricao)), auth.uid())
  on conflict (data) do update set descricao = excluded.descricao;
end;
$$;

create or replace function remover_feriado_cobranca(p_data date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Somente a matriz (admin/financeiro) mantem os feriados.'
      using errcode = 'insufficient_privilege';
  end if;
  delete from cobranca_feriados where data = p_data;
end;
$$;

/** Proximo dia util a partir de `p_data` (a propria data, se ja for util). */
create or replace function dia_util_seguinte(p_data date)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  d date := p_data;
begin
  if d is null then return null; end if;
  for i in 1..15 loop
    exit when extract(isodow from d) < 6
          and not exists (select 1 from cobranca_feriados f where f.data = d);
    d := d + 1;
  end loop;
  return d;
end;
$$;

/**
 * Os SEIS CICLOS da Smartcar (5/10/15/20/25/30) a partir do DIA do vencimento.
 * O historico tem dias fora do padrao (11, 26...) e o mes sem 30 vence no 28/29:
 * cada dia cai no ciclo mais proximo, e 1-2 voltam para o 30 (virada de mes).
 * Espelho: `cicloDoDia` em src/lib/cobranca-painel.ts.
 */
create or replace function ciclo_vencimento(p_data date)
returns integer
language sql
immutable
as $$
  select case
    when p_data is null then null
    when extract(day from p_data) <= 2  then 30
    when extract(day from p_data) <= 7  then 5
    when extract(day from p_data) <= 12 then 10
    when extract(day from p_data) <= 17 then 15
    when extract(day from p_data) <= 22 then 20
    when extract(day from p_data) <= 27 then 25
    else 30
  end;
$$;

-- ============================================================================
-- (C) HISTORICO DE BOLETOS (Mutual)
-- ============================================================================
create table if not exists boletos_historico (
  id                  uuid primary key default gen_random_uuid(),
  origem              text not null default 'MUTUAL',
  id_externo          text not null,
  cliente_id          uuid not null references clientes(id) on delete cascade,
  veiculo_id          uuid references veiculos(id) on delete set null,
  contrato_externo    text,
  tipo                text not null,
  competencia         date,
  vencimento_original date not null,
  data_vencimento     date not null,
  data_limite         date,
  valor               numeric(12,2) not null,
  valor_pago          numeric(12,2),
  data_pagamento      date,
  situacao            text not null,
  status_origem       text not null,
  em_serasa           boolean not null default false,
  importado_em        timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  constraint uq_boleto_historico unique (origem, id_externo),
  constraint chk_boleto_historico_origem   check (origem in ('MUTUAL')),
  constraint chk_boleto_historico_situacao check (situacao in ('aberto', 'pago', 'cancelado'))
);

create index if not exists idx_boletos_historico_cliente    on boletos_historico (cliente_id, vencimento_original);
create index if not exists idx_boletos_historico_vencimento on boletos_historico (vencimento_original);

comment on table boletos_historico is
  'Boletos de MENSALIDADE de outro sistema (hoje o Mutual), dos associados ja '
  'carregados (0097). NAO e `titulos_financeiros` de proposito: la entraria no '
  'DRE e na trava da 24h. Fica depois do corte — e a historia de pagamento.';

alter table boletos_historico enable row level security;
drop policy if exists boletos_historico_select on boletos_historico;
create policy boletos_historico_select on boletos_historico for select to authenticated
  using (tem_acesso_global());
grant select on boletos_historico to authenticated;

/**
 * Situacao do boleto do Mutual -> aberto | pago | cancelado. Desconhecido
 * devolve NULL e a linha NAO entra (fica contada no retorno da importacao):
 * vocabulario novo e decisao pendente, nao chute (regra da 0063).
 */
create or replace function mutual_situacao_boleto(p_status text)
returns text
language sql
immutable
as $$
  select case upper(btrim(coalesce(p_status, '')))
    when 'SUCCEEDED'           then 'pago'
    when 'PAGO'                then 'pago'
    when 'SUCCEEDED_PENDING'   then 'pago'
    when 'SUCCEEDED_DUPLICITY' then 'pago'
    when 'PENDING'             then 'aberto'
    when 'OVERDUE'             then 'aberto'
    when 'CANCELED'            then 'cancelado'
    when 'CANCELED_RECURRENCE' then 'cancelado'
    when 'CANCELED_UPDATED'    then 'cancelado'
    when 'CANCEL_ERROR'        then 'cancelado'
    when 'REFUNDED'            then 'cancelado'
    else null
  end;
$$;

/**
 * Data do Mutual SEM deslocar o dia. `mutual_data` (0084) converte o fuso — o
 * certo para timestamp —, mas um campo so-data ('2026-09-08') viraria meia-noite
 * UTC e, em Sao Paulo, o dia ANTERIOR. Vencimento nao pode andar um dia.
 */
create or replace function mutual_dia(p_valor text)
returns date
language sql
immutable
set search_path = public
as $$
  select case
    when mutual_texto(p_valor) is null then null
    when mutual_texto(p_valor) ~ '^\d{4}-\d{2}-\d{2}$' then mutual_texto(p_valor)::date
    else mutual_data(p_valor)
  end;
$$;

/**
 * IMPORTA (ou simula, sem `p_confirmar`) o historico em BLOCOS, por cursor
 * sobre o id externo — a tela chama em laco ate `fim`. Re-executavel: so
 * regrava a linha que MUDOU (regra da 0096). Liga o boleto ao associado pelo
 * CONTRATO (`contract_id` -> CONTRACT.person_id -> vinculo PERSON) e ao veiculo
 * quando o contrato tem UM objeto so (vinculo CONTRACT_OBJECT).
 * So mensalidade (`MONTHLY_PAYMENT`, `PRO_RATA`, `ACCESSION_MONTHLY_PAYMENT`,
 * o mesmo `ehMensalidade` do TS) e so associado ja carregado.
 * Um statement so, sem tabela temporaria: `create temp table` dentro de
 * plpgsql quebra a 2ª chamada na mesma sessao (gotcha da 0078/0084).
 */
create or replace function cobranca_importar_historico_mutual(
  p_cursor    text    default null,
  p_lote      integer default 4000,
  p_confirmar boolean default false
)
returns table (
  lidos               integer,
  mensalidades        integer,
  sem_associado       integer,
  status_desconhecido integer,
  gravados            integer,
  proximo_cursor      text,
  fim                 boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote integer := greatest(1, least(coalesce(p_lote, 4000), 20000));
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Somente a matriz (admin/financeiro) importa o historico de boletos.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  with inv as (
    select m.id_externo, m.payload as p
      from mutual_captura m
     where m.entidade = 'INVOICE'
       and m.id_externo > coalesce(p_cursor, '')
       and not m.deletado
     order by m.id_externo
     limit v_lote
  ),
  ctr as (
    select c.id_externo, c.payload->>'person_id' as pid
      from mutual_captura c
     where c.entidade = 'CONTRACT'
       and c.id_externo in (select distinct inv.p->>'contract_id' from inv)
  ),
  obj as (
    select o.payload->>'contract_id' as cid, count(*) as n, min(o.id_externo) as oid
      from mutual_captura o
     where o.entidade = 'CONTRACT_OBJECT'
       and o.payload->>'contract_id' in (select distinct inv.p->>'contract_id' from inv)
     group by 1
  ),
  lote as (
    select i.id_externo,
           vc.registro_id as cliente_id,
           case when ob.n = 1 then vo.registro_id end as veiculo_id,
           i.p->>'contract_id' as contrato,
           upper(btrim(coalesce(i.p->>'invoice_type', ''))) as tipo,
           case when (i.p->>'reference_year') ~ '^\d{4}$' and (i.p->>'reference_month') ~ '^\d{1,2}$'
                     and (i.p->>'reference_month')::int between 1 and 12
                then make_date((i.p->>'reference_year')::int, (i.p->>'reference_month')::int, 1)
           end as competencia,
           coalesce(mutual_dia(i.p->>'original_expiration_date'), mutual_dia(i.p->>'expiration_date')) as venc_orig,
           coalesce(mutual_dia(i.p->>'expiration_date'), mutual_dia(i.p->>'original_expiration_date')) as venc,
           mutual_dia(i.p->>'payment_limit_date') as limite,
           coalesce(nullif(i.p->>'amount', '')::numeric, nullif(i.p->>'original_amount', '')::numeric, 0) as valor,
           nullif(nullif(i.p->>'paid_amount', '')::numeric, 0) as valor_pago,
           coalesce(mutual_dia(i.p->>'payment_date'), mutual_dia(i.p->>'credit_date')) as pago_em,
           mutual_situacao_boleto(i.p->>'invoice_status') as situacao,
           coalesce(i.p->>'invoice_status', '') as status_origem,
           coalesce((i.p->>'in_serasa')::boolean, false) as serasa,
           upper(btrim(coalesce(i.p->>'invoice_type', '')))
             in ('MONTHLY_PAYMENT', 'PRO_RATA', 'ACCESSION_MONTHLY_PAYMENT') as mensalidade
      from inv i
      left join ctr c on c.id_externo = i.p->>'contract_id'
      left join integracao_vinculos vc
             on vc.sistema = 'MUTUAL' and vc.entidade = 'PERSON' and vc.tabela = 'clientes'
            and vc.id_externo = c.pid
            and exists (select 1 from clientes cl where cl.id = vc.registro_id)
      left join obj ob on ob.cid = i.p->>'contract_id'
      left join integracao_vinculos vo
             on vo.sistema = 'MUTUAL' and vo.entidade = 'CONTRACT_OBJECT' and vo.tabela = 'veiculos'
            and vo.id_externo = ob.oid
            and exists (select 1 from veiculos v where v.id = vo.registro_id)
  ),
  up as (
    insert into boletos_historico as h (
      origem, id_externo, cliente_id, veiculo_id, contrato_externo, tipo, competencia,
      vencimento_original, data_vencimento, data_limite, valor, valor_pago,
      data_pagamento, situacao, status_origem, em_serasa)
    select 'MUTUAL', l.id_externo, l.cliente_id, l.veiculo_id, l.contrato, l.tipo, l.competencia,
           l.venc_orig, l.venc, l.limite, l.valor,
           case when l.situacao = 'pago' then coalesce(l.valor_pago, l.valor) end,
           case when l.situacao = 'pago' then l.pago_em end,
           l.situacao, l.status_origem, l.serasa
      from lote l
     where p_confirmar
       and l.mensalidade and l.cliente_id is not null and l.situacao is not null
       and l.venc_orig is not null
    on conflict (origem, id_externo) do update set
      cliente_id = excluded.cliente_id, veiculo_id = excluded.veiculo_id,
      contrato_externo = excluded.contrato_externo, tipo = excluded.tipo,
      competencia = excluded.competencia, vencimento_original = excluded.vencimento_original,
      data_vencimento = excluded.data_vencimento, data_limite = excluded.data_limite,
      valor = excluded.valor, valor_pago = excluded.valor_pago,
      data_pagamento = excluded.data_pagamento, situacao = excluded.situacao,
      status_origem = excluded.status_origem, em_serasa = excluded.em_serasa,
      atualizado_em = now()
    where (h.cliente_id, h.veiculo_id, h.contrato_externo, h.tipo, h.competencia,
           h.vencimento_original, h.data_vencimento, h.data_limite, h.valor, h.valor_pago,
           h.data_pagamento, h.situacao, h.status_origem, h.em_serasa)
      is distinct from
          (excluded.cliente_id, excluded.veiculo_id, excluded.contrato_externo, excluded.tipo,
           excluded.competencia, excluded.vencimento_original, excluded.data_vencimento,
           excluded.data_limite, excluded.valor, excluded.valor_pago, excluded.data_pagamento,
           excluded.situacao, excluded.status_origem, excluded.em_serasa)
    returning 1
  )
  select count(*)::int,
         (count(*) filter (where l.mensalidade))::int,
         (count(*) filter (where l.mensalidade and l.cliente_id is null))::int,
         (count(*) filter (where l.mensalidade and l.cliente_id is not null and l.situacao is null))::int,
         (select count(*) from up)::int,
         max(l.id_externo),
         count(*) < v_lote
    from lote l;
end;
$$;

/** O que a tela mostra do historico: volume, situacao e quao velho ele esta. */
create or replace function cobranca_historico_resumo()
returns table (
  boletos          bigint,
  associados       bigint,
  pagos            bigint,
  abertos          bigint,
  cancelados       bigint,
  primeiro_vencimento date,
  ultimo_vencimento   date,
  ultima_importacao   timestamptz,
  boletos_capturados  bigint,
  ultima_captura      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from boletos_historico),
         (select count(distinct cliente_id) from boletos_historico),
         (select count(*) from boletos_historico where situacao = 'pago'),
         (select count(*) from boletos_historico where situacao = 'aberto'),
         (select count(*) from boletos_historico where situacao = 'cancelado'),
         (select min(vencimento_original) from boletos_historico),
         (select max(vencimento_original) from boletos_historico),
         (select max(atualizado_em) from boletos_historico),
         (select count(*) from mutual_captura where entidade = 'INVOICE'),
         (select max(capturado_em) from mutual_captura where entidade = 'INVOICE')
   where is_staff() or auth.uid() is null;
$$;

-- ============================================================================
-- (D) A FONTE UNICA
-- ============================================================================
/**
 * Um registro por boleto de MENSALIDADE, ja com a situacao do documento.
 *   - SCar: titulo ligado a fatura (adesao e cobranca de rastreador ficam fora).
 *   - Mutual: `boletos_historico`, so ANTES da data de corte do associado (o 1º
 *     boleto de mensalidade do SCar dele) — depois disso quem cobra e daqui, e
 *     contar os dois seria cobrar a mesma competencia duas vezes no indicador.
 * Vencimento EFETIVO = proximo dia util (fins de semana e `cobranca_feriados`);
 * no Mutual, a `payment_limit_date` quando ele mandou.
 * Boleto pago sem data de pagamento (0,6% do historico) conta como no prazo —
 * nao ha como provar atraso.
 */
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
           f.competencia, t.data_vencimento as vencimento,
           t.data_vencimento as venc_banco, null::date as limite,
           t.valor, t.valor_pago, t.data_pagamento,
           case t.status::text when 'pago' then 'pago' when 'cancelado' then 'cancelado'
                else 'aberto' end as base,
           false as em_serasa
      from titulos_financeiros t
      join faturas f on f.titulo_id = t.id
      join clientes cl on cl.id = t.cliente_id
  ),
  corte as (
    select s.cliente_id, min(s.vencimento) as corte
      from scar s where s.base <> 'cancelado' group by 1
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

-- ============================================================================
-- (E) AS LEITURAS DO PAINEL
-- ============================================================================
/**
 * Recortes de comparacao para [inicio, fim]. Se o periodo e um MES CHEIO, os
 * anteriores sao os meses de calendario (setembro tem 30 dias, agosto 31);
 * senao, periodos do mesmo tamanho imediatamente antes.
 */
create or replace function cobranca_recortes(p_inicio date, p_fim date)
returns table (recorte text, inicio date, fim date)
language sql
immutable
as $$
  with p as (
    select p_inicio as i, p_fim as f, (p_fim - p_inicio + 1) as n,
           (p_inicio = date_trunc('month', p_inicio)::date
            and p_fim = (date_trunc('month', p_inicio) + interval '1 month - 1 day')::date) as mes
  )
  select 'atual', i, f from p
  union all
  select 'anterior_' || k,
         case when mes then (i - make_interval(months => k))::date else i - n * k end,
         case when mes then (date_trunc('month', i - make_interval(months => k)) + interval '1 month - 1 day')::date
              else f - n * k end
    from p, generate_series(1, 3) k
  union all
  select 'ano_anterior', (i - interval '1 year')::date, (f - interval '1 year')::date from p;
$$;

/**
 * Os numeros do painel, para o periodo e seus recortes de comparacao. Contagens
 * e somas; as formulas (%) moram em `src/lib/cobranca-painel.ts`.
 *   venceram       = o prazo (vencimento efetivo) ja passou — pago ou nao
 *   aberto_vencido = venceu e segue sem pagamento (a inadimplencia)
 *   primeiros      = o 1º boleto de cada associado (a "inadimplencia inicial")
 *   reincidentes   = inadimplentes do periodo com atraso nos 12 meses anteriores
 *   regularizados  = associados que pagaram ATRASADO dentro do periodo
 * Atencao: a situacao e a de HOJE. "Agosto" mostra quanto de agosto continua
 * em aberto agora — e o que a cobranca ainda pode recuperar.
 */
create or replace function cobranca_indicadores(
  p_inicio      date,
  p_fim         date,
  p_regional_id uuid default null
)
returns table (
  recorte              text,
  inicio               date,
  fim                  date,
  boletos              bigint,
  valor_emitido        numeric,
  boletos_venceram     bigint,
  valor_venceram       numeric,
  boletos_aberto_vencido bigint,
  valor_aberto_vencido numeric,
  valor_pago_no_prazo  numeric,
  valor_pago_em_atraso numeric,
  boletos_pago_em_atraso bigint,
  valor_a_vencer       numeric,
  valor_vence_hoje     numeric,
  clientes_venceram    bigint,
  clientes_inadimplentes bigint,
  primeiros_venceram   bigint,
  primeiros_nao_pagos  bigint,
  primeiros_pagos_atraso bigint,
  reincidentes         bigint,
  regularizados        bigint,
  clientes_serasa      bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with r as (select * from cobranca_recortes(p_inicio, p_fim)),
  lim as (select min(inicio) - 365 as ini, max(fim) as fim from r),
  b as (
    select * from cobranca_boletos_base((select ini from lim), (select fim from lim), p_regional_id)
     where situacao <> 'cancelado'
  ),
  prim as (
    select distinct on (x.cliente_id) x.cliente_id, x.vencimento, x.vencimento_efetivo, x.situacao
      from cobranca_boletos_base(null, null, p_regional_id) x
     where x.situacao <> 'cancelado'
     order by x.cliente_id, x.vencimento, x.boleto_id
  ),
  j as (
    select r.recorte, b.*,
           (b.vencimento_efetivo < current_date) as venceu
      from r join b on b.vencimento between r.inicio and r.fim
  ),
  agg as (
    select j.recorte,
           count(*) as boletos,
           coalesce(sum(j.valor), 0) as valor_emitido,
           count(*) filter (where j.venceu) as boletos_venceram,
           coalesce(sum(j.valor) filter (where j.venceu), 0) as valor_venceram,
           count(*) filter (where j.situacao = 'vencido') as boletos_aberto_vencido,
           coalesce(sum(j.valor) filter (where j.situacao = 'vencido'), 0) as valor_aberto_vencido,
           coalesce(sum(coalesce(j.valor_pago, j.valor)) filter (where j.situacao = 'pago_no_prazo'), 0) as valor_pago_no_prazo,
           coalesce(sum(coalesce(j.valor_pago, j.valor)) filter (where j.situacao = 'pago_em_atraso'), 0) as valor_pago_em_atraso,
           count(*) filter (where j.situacao = 'pago_em_atraso') as boletos_pago_em_atraso,
           coalesce(sum(j.valor) filter (where j.situacao = 'a_vencer'), 0) as valor_a_vencer,
           coalesce(sum(j.valor) filter (where j.situacao = 'vence_hoje'), 0) as valor_vence_hoje,
           count(distinct j.cliente_id) filter (where j.venceu) as clientes_venceram,
           count(distinct j.cliente_id) filter (where j.situacao = 'vencido') as clientes_inadimplentes,
           count(distinct j.cliente_id) filter (where j.situacao = 'vencido' and j.em_serasa) as clientes_serasa
      from j group by j.recorte
  ),
  inad as (
    select distinct j.recorte, j.cliente_id, r.inicio
      from j join r on r.recorte = j.recorte
     where j.situacao = 'vencido'
  ),
  reinc as (
    select i.recorte, count(distinct i.cliente_id) as n
      from inad i
      join b on b.cliente_id = i.cliente_id
            and b.vencimento >= i.inicio - 365 and b.vencimento < i.inicio
            and b.situacao in ('vencido', 'pago_em_atraso')
     group by i.recorte
  ),
  regul as (
    select r.recorte, count(distinct b.cliente_id) as n
      from r join b on b.situacao = 'pago_em_atraso'
                   and b.data_pagamento between r.inicio and r.fim
     group by r.recorte
  ),
  pri as (
    select r.recorte,
           count(*) filter (where p.vencimento_efetivo < current_date) as venceram,
           count(*) filter (where p.situacao = 'vencido') as nao_pagos,
           count(*) filter (where p.situacao = 'pago_em_atraso') as pagos_atraso
      from r join prim p on p.vencimento between r.inicio and r.fim
     group by r.recorte
  )
  select r.recorte, r.inicio, r.fim,
         coalesce(a.boletos, 0), coalesce(a.valor_emitido, 0),
         coalesce(a.boletos_venceram, 0), coalesce(a.valor_venceram, 0),
         coalesce(a.boletos_aberto_vencido, 0), coalesce(a.valor_aberto_vencido, 0),
         coalesce(a.valor_pago_no_prazo, 0), coalesce(a.valor_pago_em_atraso, 0),
         coalesce(a.boletos_pago_em_atraso, 0),
         coalesce(a.valor_a_vencer, 0), coalesce(a.valor_vence_hoje, 0),
         coalesce(a.clientes_venceram, 0), coalesce(a.clientes_inadimplentes, 0),
         coalesce(pri.venceram, 0), coalesce(pri.nao_pagos, 0), coalesce(pri.pagos_atraso, 0),
         coalesce(reinc.n, 0), coalesce(regul.n, 0), coalesce(a.clientes_serasa, 0)
    from r
    left join agg a     on a.recorte = r.recorte
    left join reinc     on reinc.recorte = r.recorte
    left join regul     on regul.recorte = r.recorte
    left join pri       on pri.recorte = r.recorte
   order by case r.recorte when 'atual' then 0 when 'anterior_1' then 1 when 'anterior_2' then 2
                           when 'anterior_3' then 3 else 4 end;
$$;

/**
 * A CARTEIRA, posicional (hoje): associados com veiculo na base e quantos tem
 * boleto vencido em aberto — de qualquer competencia. Mais a idade dos dados:
 * o historico do Mutual so e tao novo quanto a ultima captura de INVOICE.
 */
create or replace function cobranca_carteira(p_regional_id uuid default null)
returns table (
  clientes_ativos        bigint,
  clientes_inadimplentes bigint,
  boletos_vencidos       bigint,
  valor_vencido          numeric,
  ultima_captura_mutual  timestamptz,
  ultima_importacao      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with esc as (select * from cobranca_escopo()),
  ativos as (
    select distinct cl.id
      from clientes cl
      join veiculos v on v.cliente_id = cl.id
     cross join esc
     where v.status::text in ('ativo', 'em_evento', 'vistoria_pendente', 'inadimplente')
       and (esc.global or cl.regional_id = any (esc.regionais))
       and (p_regional_id is null or cl.regional_id = p_regional_id)
  ),
  venc as (
    select * from cobranca_boletos_base(null, null, p_regional_id) where situacao = 'vencido'
  )
  select (select count(*) from ativos),
         (select count(distinct v.cliente_id) from venc v join ativos a on a.id = v.cliente_id),
         (select count(*) from venc),
         (select coalesce(sum(valor), 0) from venc),
         (select max(capturado_em) from mutual_captura where entidade = 'INVOICE'),
         (select max(atualizado_em) from boletos_historico);
$$;

/** O mes por CICLO de vencimento (5/10/15/20/25/30). */
create or replace function cobranca_calendario(p_mes date, p_regional_id uuid default null)
returns table (
  ciclo                integer,
  data_ciclo           date,
  boletos              bigint,
  clientes             bigint,
  valor_emitido        numeric,
  valor_pago_no_prazo  numeric,
  valor_pago_em_atraso numeric,
  valor_a_vencer       numeric,
  valor_vence_hoje     numeric,
  valor_aberto_vencido numeric,
  boletos_aberto_vencido bigint,
  valor_venceram       numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select date_trunc('month', p_mes)::date as ini,
           (date_trunc('month', p_mes) + interval '1 month - 1 day')::date as fim
  ),
  c as (select unnest(array[5, 10, 15, 20, 25, 30]) as ciclo),
  b as (
    select * from cobranca_boletos_base((select ini from m), (select fim from m), p_regional_id)
     where situacao <> 'cancelado'
  )
  select c.ciclo,
         least(make_date(extract(year from m.ini)::int, extract(month from m.ini)::int, 1) + (c.ciclo - 1), m.fim),
         count(b.boleto_id),
         count(distinct b.cliente_id),
         coalesce(sum(b.valor), 0),
         coalesce(sum(coalesce(b.valor_pago, b.valor)) filter (where b.situacao = 'pago_no_prazo'), 0),
         coalesce(sum(coalesce(b.valor_pago, b.valor)) filter (where b.situacao = 'pago_em_atraso'), 0),
         coalesce(sum(b.valor) filter (where b.situacao = 'a_vencer'), 0),
         coalesce(sum(b.valor) filter (where b.situacao = 'vence_hoje'), 0),
         coalesce(sum(b.valor) filter (where b.situacao = 'vencido'), 0),
         count(b.boleto_id) filter (where b.situacao = 'vencido'),
         coalesce(sum(b.valor) filter (where b.vencimento_efetivo < current_date), 0)
    from c cross join m
    left join b on b.ciclo = c.ciclo
   group by c.ciclo, m.ini, m.fim
   order by c.ciclo;
$$;

/** Uma linha por unidade visivel — para "regional x media nacional". */
create or replace function cobranca_por_regional(p_inicio date, p_fim date)
returns table (
  regional_id          uuid,
  regional             text,
  boletos              bigint,
  valor_emitido        numeric,
  valor_venceram       numeric,
  valor_aberto_vencido numeric,
  valor_pago_em_atraso numeric,
  clientes_venceram    bigint,
  clientes_inadimplentes bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select b.regional_id,
         coalesce(g.nome, 'MATRIZ (sem unidade)'),
         count(*),
         coalesce(sum(b.valor), 0),
         coalesce(sum(b.valor) filter (where b.vencimento_efetivo < current_date), 0),
         coalesce(sum(b.valor) filter (where b.situacao = 'vencido'), 0),
         coalesce(sum(coalesce(b.valor_pago, b.valor)) filter (where b.situacao = 'pago_em_atraso'), 0),
         count(distinct b.cliente_id) filter (where b.vencimento_efetivo < current_date),
         count(distinct b.cliente_id) filter (where b.situacao = 'vencido')
    from cobranca_boletos_base(p_inicio, p_fim, null) b
    left join regionais g on g.id = b.regional_id
   where b.situacao <> 'cancelado'
   group by b.regional_id, g.nome
   order by 2;
$$;

/** Evolucao mensal (por mes de vencimento) dos ultimos `p_meses` meses. */
create or replace function cobranca_serie_mensal(p_meses integer default 12, p_regional_id uuid default null)
returns table (
  mes                  date,
  valor_emitido        numeric,
  valor_venceram       numeric,
  valor_aberto_vencido numeric,
  valor_pago_no_prazo  numeric,
  valor_pago_em_atraso numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select (date_trunc('month', current_date) - make_interval(months => k))::date as mes
      from generate_series(0, greatest(1, least(coalesce(p_meses, 12), 36)) - 1) k
  ),
  b as (
    select * from cobranca_boletos_base((select min(mes) from m),
                                        (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
                                        p_regional_id)
     where situacao <> 'cancelado'
  )
  select m.mes,
         coalesce(sum(b.valor), 0),
         coalesce(sum(b.valor) filter (where b.vencimento_efetivo < current_date), 0),
         coalesce(sum(b.valor) filter (where b.situacao = 'vencido'), 0),
         coalesce(sum(coalesce(b.valor_pago, b.valor)) filter (where b.situacao = 'pago_no_prazo'), 0),
         coalesce(sum(coalesce(b.valor_pago, b.valor)) filter (where b.situacao = 'pago_em_atraso'), 0)
    from m left join b on date_trunc('month', b.vencimento)::date = m.mes
   group by m.mes
   order by m.mes;
$$;

/**
 * O DETALHAMENTO: todo numero do painel abre os boletos que o compoem.
 * `total_registros`/`total_valor` vem na propria linha (janela), entao a tela
 * mostra a quantidade e a soma do FILTRO mesmo quando corta pelo limite.
 */
create or replace function cobranca_boletos_lista(
  p_inicio           date default null,
  p_fim              date default null,
  p_regional_id      uuid default null,
  p_situacoes        text[] default null,
  p_ciclo            integer default null,
  p_somente_primeiro boolean default false,
  p_pago_inicio      date default null,
  p_pago_fim         date default null,
  p_limite           integer default 2000
)
returns table (
  origem          text,
  boleto_id       uuid,
  cliente_id      uuid,
  associado       text,
  cpf_cnpj        text,
  placa           text,
  regional        text,
  competencia     date,
  vencimento      date,
  valor           numeric,
  valor_pago      numeric,
  data_pagamento  date,
  situacao        text,
  ciclo           integer,
  dias_atraso     integer,
  em_serasa       boolean,
  total_registros bigint,
  total_valor     numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select * from cobranca_boletos_base(
      case when p_somente_primeiro then null else p_inicio end,
      case when p_somente_primeiro then null else p_fim end,
      p_regional_id)
  ),
  prim as (
    select distinct on (cliente_id) boleto_id
      from b where situacao <> 'cancelado'
     order by cliente_id, vencimento, boleto_id
  ),
  f as (
    select b.* from b
     where (p_situacoes is null or b.situacao = any (p_situacoes))
       and (p_ciclo is null or b.ciclo = p_ciclo)
       and (not p_somente_primeiro or (b.boleto_id in (select boleto_id from prim)
                                       and (p_inicio is null or b.vencimento >= p_inicio)
                                       and (p_fim is null or b.vencimento <= p_fim)))
       and (p_pago_inicio is null or b.data_pagamento >= p_pago_inicio)
       and (p_pago_fim is null or b.data_pagamento <= p_pago_fim)
  )
  select f.origem, f.boleto_id, f.cliente_id, cl.nome_razao_social, cl.cpf_cnpj,
         coalesce(v.placa, (select string_agg(distinct v2.placa, ', ')
                              from veiculos v2 where v2.cliente_id = f.cliente_id)),
         coalesce(g.nome, 'MATRIZ'),
         f.competencia, f.vencimento, f.valor, f.valor_pago, f.data_pagamento,
         f.situacao, f.ciclo, f.dias_atraso, f.em_serasa,
         count(*) over (), sum(f.valor) over ()
    from f
    join clientes cl on cl.id = f.cliente_id
    left join veiculos v on v.id = f.veiculo_id
    left join regionais g on g.id = f.regional_id
   order by f.dias_atraso desc, f.valor desc, f.vencimento
   limit greatest(1, least(coalesce(p_limite, 2000), 10000));
$$;

-- ============================================================================
-- (F) resumo_cobrancas (0025): a formula da inadimplencia
-- ============================================================================
-- Era vencido / emitido — com o "a vencer" no denominador, quanto mais boleto
-- futuro no periodo, menor a inadimplencia. Agora: vencido / o que JA venceu
-- (vencido + pago com vencimento passado). Mesma assinatura e mesmo retorno.
create or replace function resumo_cobrancas(
  p_inicio      date default null,
  p_fim         date default null,
  p_regional_id uuid default null
)
returns table (
  emitido_qtd       integer,
  emitido_valor     numeric,
  recebido_qtd      integer,
  recebido_valor    numeric,
  aberto_qtd        integer,
  aberto_valor      numeric,
  vencido_qtd       integer,
  vencido_valor     numeric,
  inadimplencia_pct numeric,
  vencer_7_qtd      integer,
  vencer_7_valor    numeric,
  vencer_15_qtd     integer,
  vencer_15_valor   numeric,
  vencer_30_qtd     integer,
  vencer_30_valor   numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select * from listar_cobrancas(p_inicio, p_fim, null, null, null, null, null, p_regional_id, 100000)
  ),
  fut as (
    select * from listar_cobrancas(current_date, current_date + 30, null, null, null, null, 'aberto', p_regional_id, 100000)
  )
  select
    count(*) filter (where c.status <> 'cancelado')::int,
    coalesce(sum(c.valor) filter (where c.status <> 'cancelado'), 0),
    count(*) filter (where c.status = 'pago')::int,
    coalesce(sum(coalesce(c.valor_pago, c.valor)) filter (where c.status = 'pago'), 0),
    count(*) filter (where c.status = 'aberto')::int,
    coalesce(sum(c.valor) filter (where c.status = 'aberto'), 0),
    count(*) filter (where c.status = 'vencido')::int,
    coalesce(sum(c.valor) filter (where c.status = 'vencido'), 0),
    round(
      coalesce(sum(c.valor) filter (where c.status = 'vencido'), 0)
      / nullif(coalesce(sum(c.valor) filter (
          where c.status = 'vencido'
             or (c.status = 'pago' and c.data_vencimento < current_date)), 0), 0) * 100,
      2
    ),
    (select count(*)::int from fut where fut.data_vencimento <= current_date + 7),
    (select coalesce(sum(valor), 0) from fut where fut.data_vencimento <= current_date + 7),
    (select count(*)::int from fut where fut.data_vencimento <= current_date + 15),
    (select coalesce(sum(valor), 0) from fut where fut.data_vencimento <= current_date + 15),
    (select count(*)::int from fut where fut.data_vencimento <= current_date + 30),
    (select coalesce(sum(valor), 0) from fut where fut.data_vencimento <= current_date + 30)
  from c;
$$;

-- ============================================================================
-- Rito da 0052
-- ============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
