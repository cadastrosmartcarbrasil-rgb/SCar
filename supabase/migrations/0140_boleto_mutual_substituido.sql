-- =============================================================================
-- 0140 — O BOLETO DO MUTUAL SUBSTITUIDO POR UMA 2a VIA DEIXA DE CONTAR COMO DIVIDA
-- -----------------------------------------------------------------------------
-- O defeito (22/10/2026, visto no Painel de Inadimplencia): quando o Mutual emite
-- uma 2a via, o boleto ORIGINAL continua "PENDING" para sempre; o associado paga a
-- 2a via. O historico importado (0097/0099) guardava os dois, e o original entrava
-- como VENCIDO — a mesma mensalidade contada como inadimplente com o mes pago.
-- Medido em producao: 498 boletos "em aberto" (R$ 96,6 mil) com o mes pago por
-- outra via, e 163 abertos ja substituidos por outra via ainda aberta (a mesma
-- divida contada duas vezes). Em setembro: 308 dos 575 vencidos (R$ 60,9 mil).
--
-- A ligacao NAO e palpite: o proprio Mutual a grava. A 2a via traz
-- `original_reference_id` = o `reference_id` do boleto que ela substitui.
--
-- A regra, por grupo (mesma raiz = coalesce(original_reference_id, reference_id)):
--   * algum boleto do grupo PAGO  -> todos os abertos do grupo estao substituidos
--     pelo pago (o mes foi pago);
--   * nenhum pago                 -> vale o mais RECENTE (o que o Mutual mantem
--     vivo, com o vencimento novo); os outros abertos estao substituidos por ele.
-- Substituido vira `situacao = 'cancelado'` + `substituido_por` (mesma escolha do
-- renegociado, 0121): todo leitor (painel, fila, carteira, 24h, revistoria,
-- renegociacao, SAC, portal) ja trata cancelado como "nao e divida", sem recriar
-- nenhuma funcao. E reversivel: sumindo o motivo, o boleto volta a 'aberto'.
--
-- A importacao do Mutual (que manda PENDING de novo) nao reabre o substituido;
-- pagamento (do Mutual ou do banco, 0117) sempre vence.
-- =============================================================================

-- (A) as colunas ---------------------------------------------------------------
alter table boletos_historico
  add column if not exists referencia_externa  text,
  add column if not exists referencia_original text,
  add column if not exists emitido_em          timestamptz,
  add column if not exists substituido_por     uuid references boletos_historico(id) on delete set null;

comment on column boletos_historico.referencia_original is
  '0140: a raiz do grupo de vias do Mutual (original_reference_id, ou o proprio reference_id).';
comment on column boletos_historico.substituido_por is
  '0140: preenchido = este boleto foi substituido (2a via) e esta como cancelado; aponta para o boleto que vale.';

create index if not exists idx_boletos_historico_referencia_original
  on boletos_historico (referencia_original) where referencia_original is not null;

-- (B) a referencia vem do payload capturado -------------------------------------
create or replace function mutual_referencias_invoice(p_id_externo text)
returns table (referencia_externa text, referencia_original text, emitido_em timestamptz)
language sql
stable
set search_path = public
as $$
  select nullif(c.payload->>'reference_id', ''),
         coalesce(nullif(c.payload->>'original_reference_id', ''), nullif(c.payload->>'reference_id', '')),
         case when coalesce(c.payload->>'created_at', '') ~ '^\d{4}-\d{2}-\d{2}'
              then (c.payload->>'created_at')::timestamptz end
    from mutual_captura c
   where c.entidade = 'INVOICE' and c.id_externo = p_id_externo
   limit 1;
$$;

-- (C) o recalculo, por grupo ou da base inteira ----------------------------------
create or replace function recalcular_substituicoes_boletos(p_raiz text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not (is_staff() or auth.uid() is null) then
    raise exception 'Sem permissao' using errcode = '42501';
  end if;
  -- Libera o gatilho de protecao (D) so durante este update.
  perform set_config('scar.substituicao', 'on', true);

  with g as (
    select h.id, h.referencia_original as raiz, h.situacao, h.substituido_por,
           h.emitido_em, h.id_externo, h.data_pagamento
      from boletos_historico h
     where h.referencia_original is not null
       and (p_raiz is null or h.referencia_original = p_raiz)
  ),
  -- candidato = o que e ou seria divida: aberto, ou ja marcado como substituido
  cand as (
    select * from g where situacao = 'aberto' or substituido_por is not null
  ),
  pago as (
    select distinct on (raiz) raiz, id
      from g where situacao = 'pago'
     order by raiz, data_pagamento desc nulls last, id
  ),
  vivo as (
    select distinct on (raiz) raiz, id
      from cand
     order by raiz, emitido_em desc nulls last, length(id_externo) desc, id_externo desc
  ),
  alvo as (
    select c.id,
           case when p.id is not null then p.id
                when v.id <> c.id then v.id
           end as alvo
      from cand c
      left join pago p on p.raiz = c.raiz
      left join vivo v on v.raiz = c.raiz
  )
  update boletos_historico h
     set situacao        = case when a.alvo is null then 'aberto' else 'cancelado' end,
         substituido_por = a.alvo
    from alvo a
   where h.id = a.id
     and h.substituido_por is distinct from a.alvo;

  get diagnostics v_n = row_count;
  perform set_config('scar.substituicao', 'off', true);
  return v_n;
end;
$$;

-- (D) os gatilhos ----------------------------------------------------------------
/** BEFORE: preenche a referencia e protege o substituido contra a importacao. */
create or replace function fn_boleto_historico_substituido()
returns trigger
language plpgsql
as $$
declare
  r record;
begin
  if new.referencia_original is null and new.origem = 'MUTUAL' then
    select * into r from mutual_referencias_invoice(new.id_externo);
    if found then
      new.referencia_externa  := r.referencia_externa;
      new.referencia_original := r.referencia_original;
      new.emitido_em          := coalesce(new.emitido_em, r.emitido_em);
    end if;
  end if;

  if tg_op = 'UPDATE' and old.substituido_por is not null
     and coalesce(current_setting('scar.substituicao', true), '') <> 'on' then
    if new.situacao = 'pago' then
      new.substituido_por := null;          -- pagamento sempre vence
    else
      new.situacao        := 'cancelado';   -- a importacao manda PENDING de novo
      new.substituido_por := old.substituido_por;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_boleto_historico_substituido on boletos_historico;
create trigger trg_boleto_historico_substituido
  before insert or update on boletos_historico
  for each row execute function fn_boleto_historico_substituido();

/** AFTER: qualquer mudanca de situacao recalcula o grupo daquele boleto. */
create or replace function fn_boleto_historico_recalcula_grupo()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1
     or new.referencia_original is null
     or coalesce(current_setting('scar.substituicao_lote', true), '') = 'on' then
    return null;
  end if;
  if tg_op = 'INSERT'
     or new.situacao is distinct from old.situacao
     or new.referencia_original is distinct from old.referencia_original then
    perform recalcular_substituicoes_boletos(new.referencia_original);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_boleto_historico_recalcula_grupo on boletos_historico;
create trigger trg_boleto_historico_recalcula_grupo
  after insert or update on boletos_historico
  for each row execute function fn_boleto_historico_recalcula_grupo();

-- (E) o que ja esta na base ------------------------------------------------------
select set_config('scar.substituicao_lote', 'on', true);

update boletos_historico h
   set referencia_externa  = r.referencia_externa,
       referencia_original = r.referencia_original,
       emitido_em          = coalesce(h.emitido_em, r.emitido_em)
  from mutual_captura c,
       lateral (select nullif(c.payload->>'reference_id', '') as referencia_externa,
                       coalesce(nullif(c.payload->>'original_reference_id', ''),
                                nullif(c.payload->>'reference_id', '')) as referencia_original,
                       case when coalesce(c.payload->>'created_at', '') ~ '^\d{4}-\d{2}-\d{2}'
                            then (c.payload->>'created_at')::timestamptz end as emitido_em) r
 where c.entidade = 'INVOICE'
   and c.id_externo = h.id_externo
   and h.origem = 'MUTUAL'
   and h.referencia_original is null
   and r.referencia_original is not null;

select recalcular_substituicoes_boletos(null);

select set_config('scar.substituicao_lote', 'off', true);

-- Rito da 0052 ------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
