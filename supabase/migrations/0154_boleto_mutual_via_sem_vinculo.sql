-- =============================================================================
-- 0154 — A 2a VIA PAGA QUE O MUTUAL NAO LIGOU AO ORIGINAL TAMBEM O TIRA DA DIVIDA
-- -----------------------------------------------------------------------------
-- O defeito (27/10/2026, placa RQE9F00): a mensalidade de agosto (venc. 10/09,
-- R$ 259,83) seguia VENCIDA no SAC com o mes pago por outra via (venc. 17/09,
-- paga em 17/09). A 0140 agrupa as vias pela referencia que o PROPRIO Mutual
-- grava (`original_reference_id`); nesse caso a via nova veio SEM ela (o Mutual
-- emitiu uma cobranca nova em vez de uma 2a via ligada), entao as duas ficaram em
-- grupos diferentes e o original nunca foi marcado como substituido.
-- Medido em producao: 23 boletos abertos (R$ 4.914,88) com um boleto PAGO do
-- mesmo associado, veiculo, competencia, tipo e VALOR em outro grupo.
--
-- A regra nova, somada a da 0140 (sem mexer nela): um boleto aberto do grupo sem
-- pagamento e SUBSTITUIDO pelo boleto pago de outro grupo quando os dois sao a
-- mesma mensalidade — mesmo associado, mesmo veiculo (ou os dois sem veiculo),
-- mesma competencia, mesmo tipo, MESMO valor — e o pago foi EMITIDO DEPOIS do
-- aberto (e a via nova, nao uma cobranca anterior). Valor diferente ou emissao
-- anterior nao casam: ai pode ser outra cobranca, e cancelar seria apagar divida.
--
-- O recalculo de um grupo passa a olhar tambem os grupos do mesmo associado e
-- competencia — senao o pagamento chegando num grupo nao alcancaria o aberto do
-- outro, e o recalculo do aberto o reabriria.
-- =============================================================================

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
  -- Libera o gatilho de protecao (0140) so durante este update.
  perform set_config('scar.substituicao', 'on', true);

  with raizes as (
    -- o grupo pedido + os grupos do mesmo associado e competencia (0154)
    select distinct h2.referencia_original as raiz
      from boletos_historico h1
      join boletos_historico h2 on h2.cliente_id = h1.cliente_id
                               and h2.competencia is not distinct from h1.competencia
                               and h2.referencia_original is not null
     where p_raiz is not null and h1.referencia_original = p_raiz
  ),
  g as (
    select h.id, h.referencia_original as raiz, h.situacao, h.substituido_por,
           h.emitido_em, h.id_externo, h.data_pagamento,
           h.cliente_id, h.veiculo_id, h.competencia, h.tipo, h.valor
      from boletos_historico h
     where h.referencia_original is not null
       and (p_raiz is null or h.referencia_original in (select raiz from raizes))
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
  -- 0154: a mesma mensalidade paga por uma via que o Mutual nao ligou
  pm as (
    select distinct on (c.id) c.id as cid, o.id
      from cand c
      join g o on o.situacao = 'pago'
              and o.raiz <> c.raiz
              and o.cliente_id = c.cliente_id
              and o.competencia = c.competencia
              and o.veiculo_id is not distinct from c.veiculo_id
              and o.tipo is not distinct from c.tipo
              and o.valor = c.valor
              and o.emitido_em > c.emitido_em
     order by c.id, o.data_pagamento desc nulls last, o.id
  ),
  alvo as (
    select c.id,
           case when p.id is not null then p.id
                when pm.id is not null then pm.id
                when v.id <> c.id then v.id
           end as alvo
      from cand c
      left join pago p on p.raiz = c.raiz
      left join vivo v on v.raiz = c.raiz
      left join pm on pm.cid = c.id
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

comment on function recalcular_substituicoes_boletos(text) is
  '0140 + 0154: marca como substituido (cancelado + substituido_por) o boleto do Mutual cujo mes foi pago por outra via — ligada pelo original_reference_id ou, sem a ligacao, a mesma mensalidade (associado, veiculo, competencia, tipo e valor) paga por via emitida depois.';

-- O que ja esta na base (re-executavel).
select set_config('scar.substituicao_lote', 'on', true);
select recalcular_substituicoes_boletos(null);
select set_config('scar.substituicao_lote', 'off', true);

-- Rito da 0052 ------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
