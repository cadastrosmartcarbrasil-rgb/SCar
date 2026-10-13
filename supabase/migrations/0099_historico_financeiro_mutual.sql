-- ============================================================================
-- 0099 — O HISTORICO FINANCEIRO MOSTRA OS BOLETOS DO MUTUAL
-- ============================================================================
-- O defeito (relatado em 12/10/2026): o historico de boletos do Mutual foi
-- importado (0097, 78.425 boletos) e o Historico Financeiro do SAC e o
-- Financeiro do Portal do Associado continuavam vazios. Os dois leem SO
-- `titulos_financeiros` (`titulos_do_cliente`, `portal_titulos`,
-- `portal_financeiro`) — e la ha 6 titulos na base inteira, porque os
-- migrados seguem cobrados pelo Mutual ate o corte.
--
-- O historico NAO vai para `titulos_financeiros` (decisao da 0097: contaria no
-- DRE e travaria a 24h por divida que o Mutual cobra). O conserto e LER as
-- duas fontes:
--   (A) `boletos_historico` guarda o que o associado precisa para PAGAR o
--       boleto do Mutual: linha digitavel, PDF e o link de pagamento. Ficam na
--       tabela (e nao lidos de `mutual_captura`) porque a area de captura e
--       apagada depois do corte de dezembro; o historico fica.
--   (B) `cobranca_importar_historico_mutual` recriada (mesma assinatura)
--       preenchendo os tres — reimportar atualiza o que ja esta la.
--   (C) `corte_cobranca_cliente`: a mesma data de corte da 0097 (o 1o boleto
--       do SCar do associado). Boleto do Mutual daquela data em diante nao
--       aparece — seria a mesma competencia duas vezes.
--   (D) `boletos_mutual_do_cliente` (SAC, mesma permissao de
--       `titulos_do_cliente`) e `portal_boletos_mutual` (o proprio associado).
--   (E) `portal_financeiro` recriado (mesma assinatura) somando os dois: o
--       cabecalho "Em aberto / em atraso" nao pode dizer zero para quem deve
--       no Mutual.
-- O boleto do Mutual e SO CONSULTA: sem editar, sem reemitir (quem cobra e o
-- Mutual). A tela recebe `origem` e decide.
-- ============================================================================

-- ============================================================================
-- (A) os dados de pagamento do boleto
-- ============================================================================
alter table boletos_historico add column if not exists linha_digitavel text;
alter table boletos_historico add column if not exists url_boleto      text;
alter table boletos_historico add column if not exists url_pagamento   text;

comment on column boletos_historico.url_pagamento is
  'Pagina de pagamento do Mutual (checkout_link: boleto e PIX). Vale enquanto o Mutual estiver no ar.';

-- ============================================================================
-- (B) a importacao passa a trazer linha digitavel e links
-- ============================================================================
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
           nullif(btrim(coalesce(i.p->>'linha_digitavel', '')), '') as linha,
           nullif(btrim(coalesce(i.p->>'invoice_billet_url', '')), '') as url_boleto,
           nullif(btrim(coalesce(i.p->>'checkout_link', '')), '') as url_pagamento,
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
      data_pagamento, situacao, status_origem, em_serasa,
      linha_digitavel, url_boleto, url_pagamento)
    select 'MUTUAL', l.id_externo, l.cliente_id, l.veiculo_id, l.contrato, l.tipo, l.competencia,
           l.venc_orig, l.venc, l.limite, l.valor,
           case when l.situacao = 'pago' then coalesce(l.valor_pago, l.valor) end,
           case when l.situacao = 'pago' then l.pago_em end,
           l.situacao, l.status_origem, l.serasa,
           l.linha, l.url_boleto, l.url_pagamento
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
      linha_digitavel = excluded.linha_digitavel, url_boleto = excluded.url_boleto,
      url_pagamento = excluded.url_pagamento,
      atualizado_em = now()
    where (h.cliente_id, h.veiculo_id, h.contrato_externo, h.tipo, h.competencia,
           h.vencimento_original, h.data_vencimento, h.data_limite, h.valor, h.valor_pago,
           h.data_pagamento, h.situacao, h.status_origem, h.em_serasa,
           h.linha_digitavel, h.url_boleto, h.url_pagamento)
      is distinct from
          (excluded.cliente_id, excluded.veiculo_id, excluded.contrato_externo, excluded.tipo,
           excluded.competencia, excluded.vencimento_original, excluded.data_vencimento,
           excluded.data_limite, excluded.valor, excluded.valor_pago, excluded.data_pagamento,
           excluded.situacao, excluded.status_origem, excluded.em_serasa,
           excluded.linha_digitavel, excluded.url_boleto, excluded.url_pagamento)
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

-- ============================================================================
-- (C) a data de corte de UM associado (a mesma da 0097)
-- ============================================================================
/** O 1o vencimento cobrado pelo SCar (titulo de mensalidade nao cancelado); null = ainda no Mutual. */
create or replace function corte_cobranca_cliente(p_cliente_id uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select min(t.data_vencimento)
    from titulos_financeiros t
    join faturas f on f.titulo_id = t.id
   where t.cliente_id = p_cliente_id
     and t.status::text <> 'cancelado';
$$;

-- ============================================================================
-- (D) as leituras
-- ============================================================================
/**
 * Os boletos do Mutual de um associado, para o Historico Financeiro do SAC.
 * Mesma permissao e mesmo recorte de veiculo de `titulos_do_cliente` (0029):
 * com veiculo escolhido, entram os dele e os sem veiculo (do associado).
 * `status` usa o vocabulario do SAC: aberto · vencido · pago · cancelado.
 */
create or replace function boletos_mutual_do_cliente(
  p_cliente_id uuid,
  p_veiculo_id uuid default null,
  p_limite     int  default 60
)
returns table (
  id              uuid,
  veiculo_id      uuid,
  placa           text,
  competencia     date,
  data_vencimento date,
  valor           numeric,
  valor_pago      numeric,
  data_pagamento  date,
  status          text,
  dias_atraso     integer,
  em_serasa       boolean,
  linha_digitavel text,
  url_boleto      text,
  url_pagamento   text
)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.veiculo_id, ve.placa, h.competencia, h.data_vencimento,
         h.valor, h.valor_pago, h.data_pagamento,
         case when h.situacao = 'pago' then 'pago'
              when h.situacao = 'cancelado' then 'cancelado'
              when h.data_vencimento < current_date then 'vencido'
              else 'aberto' end,
         case when h.situacao = 'aberto' and h.data_vencimento < current_date
              then (current_date - h.data_vencimento)::int else 0 end,
         h.em_serasa, h.linha_digitavel, h.url_boleto, h.url_pagamento
    from boletos_historico h
    join clientes cl on cl.id = h.cliente_id
    left join veiculos ve on ve.id = h.veiculo_id
   where h.cliente_id = p_cliente_id
     and (p_veiculo_id is null or h.veiculo_id = p_veiculo_id or h.veiculo_id is null)
     and (tem_acesso_global() or pode_regional(cl.regional_id) or cl.id = auth_cliente_id())
     and h.vencimento_original < coalesce(corte_cobranca_cliente(p_cliente_id), 'infinity'::date)
   order by h.data_vencimento desc, h.id
   limit greatest(coalesce(p_limite, 60), 1);
$$;

/** Os boletos do Mutual do PROPRIO associado (portal). Sem parametro de cliente, como a 0044. */
create or replace function portal_boletos_mutual(p_limite integer default 120)
returns table (
  id              uuid,
  veiculo_id      uuid,
  placa           text,
  competencia     date,
  data_vencimento date,
  valor           numeric,
  valor_pago      numeric,
  data_pagamento  date,
  situacao        text,
  dias_atraso     integer,
  linha_digitavel text,
  url_boleto      text,
  url_pagamento   text
)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.veiculo_id, ve.placa, h.competencia, h.data_vencimento,
         h.valor, h.valor_pago, h.data_pagamento,
         case when h.situacao = 'pago' then 'pago'
              when h.data_vencimento < current_date then 'vencido'
              else 'aberto' end,
         case when h.situacao = 'aberto' and h.data_vencimento < current_date
              then (current_date - h.data_vencimento)::int else 0 end,
         h.linha_digitavel, h.url_boleto, h.url_pagamento
    from boletos_historico h
    left join veiculos ve on ve.id = h.veiculo_id
   where auth_cliente_id() is not null
     and h.cliente_id = auth_cliente_id()
     and h.situacao <> 'cancelado'
     and h.vencimento_original < coalesce(corte_cobranca_cliente(h.cliente_id), 'infinity'::date)
   order by h.data_vencimento desc, h.id
   limit greatest(coalesce(p_limite, 120), 1);
$$;

-- ============================================================================
-- (E) o cabecalho do portal soma as duas fontes (mesma assinatura da 0044)
-- ============================================================================
create or replace function portal_financeiro()
returns table (
  em_aberto        numeric,
  vencido          numeric,
  qtd_vencidos     integer,
  proximo_vencimento date,
  proximo_valor    numeric,
  pago_12_meses    numeric,
  em_dia           boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select status::text as st, data_vencimento, valor, valor_pago, data_pagamento
      from titulos_financeiros
     where cliente_id = auth_cliente_id() and status::text <> 'cancelado'
    union all
    select case h.situacao when 'pago' then 'pago' else 'pendente' end,
           h.data_vencimento, h.valor, h.valor_pago, h.data_pagamento
      from boletos_historico h
     where auth_cliente_id() is not null
       and h.cliente_id = auth_cliente_id()
       and h.situacao <> 'cancelado'
       and h.vencimento_original < coalesce(corte_cobranca_cliente(h.cliente_id), 'infinity'::date)
  ),
  abertos as (
    select * from t where st in ('pendente', 'vencido')
  )
  select
    coalesce((select sum(valor) from abertos), 0),
    coalesce((select sum(valor) from abertos where data_vencimento < current_date), 0),
    (select count(*)::int from abertos where data_vencimento < current_date),
    (select min(data_vencimento) from abertos where data_vencimento >= current_date),
    (select valor from abertos where data_vencimento >= current_date
      order by data_vencimento limit 1),
    coalesce((select sum(valor_pago) from t
               where st = 'pago' and data_pagamento >= current_date - interval '12 months'), 0),
    not exists (select 1 from abertos where data_vencimento < current_date);
$$;

-- ============================================================================
-- RITO 0052 — nenhuma RPC aberta ao anon
-- ============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
