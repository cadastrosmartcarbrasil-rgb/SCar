-- =============================================================================
-- 0149 — EXTRATO AGRUPADO: os recebimentos da cobranca por tipo de liquidacao
-- =============================================================================
-- Pedido do usuario (25/10/2026): o extrato da conta lista cada boleto pago como
-- uma linha (200 PIX num dia so). O banco credita o PIX um a um e o COMPE/REDE
-- somado, mas para ler o extrato basta UMA linha por dia e tipo, com o total,
-- abrindo os boletos ao clicar.
--
-- O que muda: extrato_conta (DROP + CREATE — entra a coluna `grupo`):
--   grupo = 'PIX'        recebimento da cobranca liquidado por PIX
--           'COMPE_REDE' boleto liquidado por COMPE ou REDE (o credito somado do extrato)
--           'COBRANCA'   recebimento do banco sem o tipo de liquidacao
--           null         todo o resto
-- e a ORDEM dentro do dia passa a deixar os membros de cada grupo juntos, para o
-- saldo do ultimo membro ser o saldo real depois do grupo inteiro (a tela agrupa
-- linhas contiguas e mostra esse saldo). Nenhum valor muda.
-- O recebimento e da cobranca quando ha linha em cobranca_liquidacoes apontando
-- para o lancamento (BAIXA) ou para o titulo (TITULO) — inclusive o nao
-- identificado (0118), que tambem entrou pelo banco.
-- =============================================================================

create index if not exists idx_cobranca_liquidacoes_lancamento on cobranca_liquidacoes (lancamento_id);

drop function if exists extrato_conta(uuid, date, date, uuid, uuid, text, boolean);

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
  extrato_item_id  uuid,
  grupo            text
)
language sql
stable
security definer
set search_path = public
as $$
  with ini as (select saldo_consolidado_em(p_inicio - 1, p_conta) as s),
  -- uma linha so por lancamento / titulo (podem ter mais de uma liquidacao)
  liq_lanc as (
    select distinct on (cl.lancamento_id) cl.lancamento_id,
           coalesce(cl.tipo_liquidacao, cl.payload->>'tipoLiquidacao', '') as tipo
      from cobranca_liquidacoes cl
     where cl.lancamento_id is not null
     order by cl.lancamento_id, cl.data_pagamento desc, cl.id
  ),
  liq_tit as (
    select distinct on (cl.titulo_id) cl.titulo_id,
           coalesce(cl.tipo_liquidacao, cl.payload->>'tipoLiquidacao', '') as tipo
      from cobranca_liquidacoes cl
     where cl.titulo_id is not null
     order by cl.titulo_id, cl.data_pagamento desc, cl.id
  ),
  mov as (
    select m.*,
           case
             when coalesce(ll.tipo, lt.tipo) is null then null
             when upper(coalesce(ll.tipo, lt.tipo)) like '%PIX%' then 'PIX'
             when coalesce(ll.tipo, lt.tipo) = '' then 'COBRANCA'
             else 'COMPE_REDE'
           end as grupo
      from tesouraria_movimentos(p_inicio, p_fim) m
      left join liq_lanc ll on m.origem = 'BAIXA' and ll.lancamento_id = m.lancamento_id
      left join liq_tit lt on m.origem = 'TITULO' and lt.titulo_id = m.ref_id
     where m.valido
  ),
  base as (
    select *
      from mov
     where (p_conta is null or conta_id = p_conta)
       and not (p_conta is null and origem = 'TRANSFERENCIA')
  ),
  corrido as (
    select b.*,
           (select s from ini) + sum(b.valor) over (order by b.data, b.conta_id, coalesce(b.grupo, '~'), b.origem, b.ref_id
                                                   rows between unbounded preceding and current row) as saldo
      from base b
  ),
  transf_consolidado as (
    -- no consolidado as transferencias somam zero; aparecem so se pedidas
    select m.*, null::numeric as saldo
      from mov m
     where p_conta is null and coalesce(p_transferencias, false)
       and m.origem = 'TRANSFERENCIA'
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
         t.saldo, (select s from ini), t.conciliado, t.extrato_item_id, t.grupo
    from tudo t
    join contas_bancarias cb on cb.id = t.conta_id
    left join categorias_dre cat on cat.id = t.categoria_id
    left join centros_custo cc on cc.id = t.centro_custo_id
   where (p_centro is null or t.centro_custo_id = p_centro)
     and (p_categoria is null or t.categoria_id = p_categoria)
     and (p_conciliacao is null
          or (p_conciliacao = 'CONCILIADO' and t.conciliado)
          or (p_conciliacao = 'NAO_CONCILIADO' and not t.conciliado))
   order by t.data, t.conta_id, coalesce(t.grupo, '~'), t.origem, t.ref_id;
$$;

comment on function extrato_conta(uuid, date, date, uuid, uuid, text, boolean) is
  'Extrato da conta (ou consolidado), saldo real por linha. grupo (0149): PIX | COMPE_REDE | COBRANCA nos recebimentos da cobranca pelo banco; os membros de um grupo vem juntos no dia.';

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
