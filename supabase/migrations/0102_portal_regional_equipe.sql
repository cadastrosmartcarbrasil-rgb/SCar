-- ============================================================================
-- 0102 — O PORTAL DA FRANQUIA: QUEM EXCLUI VENDEDOR, E A CARTEIRA NO PAINEL
-- ============================================================================
-- Pedido do usuario (13/10/2026): "o usuario (regional) tem o poder de incluir
-- e ativar e inativar o vendedor, excluir somente admin e master."
--
-- (A) 🔴 O BURACO: `vendedores_write` (0003) e `for all` — e `for all` INCLUI
--     DELETE. Hoje o `gestor_regional` APAGA vendedor da propria unidade, e
--     nenhuma tela do portal oferece isso: a UI ja estava certa, a policy e que
--     nao estava. Policy e o que vale, porque `/regional` fala com o PostgREST
--     direto (`from('vendedores').delete()` existe no hook, em `use-vendedores`).
--
--     Incluir, editar, ATIVAR e INATIVAR continuam identicos para o gestor —
--     `ativo` e coluna, entao inativar e UPDATE, nao DELETE. Era exatamente a
--     distincao que a policy unica nao sabia fazer.
--
--     ⚠️ NAO EXISTE PAPEL "master" NESTE SISTEMA. Sao 7 papeis (0077) e o teto
--     e o `admin` — `is_admin()`. Ficou admin, e so ele.
--
--     ⚠️ E EXCLUIR VENDEDOR NAO E BARATO, nem para o admin: `leads.vendedor_id`,
--     `veiculos.vendedor_id`, `lancamentos_financeiros.vendedor_id` e
--     `lead_atribuicoes.vendedor_id` sao `on delete set null` — apagar DESLIGA a
--     carteira do vendedor em silencio, sem apagar nada e sem aviso (a mesma
--     mordida que a 0067 documentou em `regionais`). So `comissoes_vendas` e
--     `on delete restrict`, entao quem ja gerou comissao o banco ja recusa.
--     A trava por movimento NAO entra aqui de proposito: o pedido foi sobre
--     QUEM pode, e recusar o admin seria responder outra pergunta.
--
-- (B) O PAINEL MOSTRAVA A UNIDADE VAZIA COM A CARTEIRA DENTRO. Medido em
--     producao em 13/10/2026, depois da carga das quatro unidades:
--
--       RIBEIRAO PRETO  1.169 veiculos (1.149 ativo + 20 vistoria_pendente),
--                       1.169 com cobranca_externa, 998 associados,
--                       66 vendedores cadastrados e 2 ativos.
--
--     O painel dizia "Veiculos ativos 1.149 · 2 vendedor(es) ativo(s)" e ZERO
--     em todo o resto. Tres defeitos somados:
--       1. contava SO `status = 'ativo'` — lista de status que o sistema
--          superou (0072 criou `inadimplente`; `em_evento` e
--          `vistoria_pendente` existem desde a 0021). Mesmo erro do `statusMeta`
--          e do `mutual_filiais`: contar por uma lista que envelheceu;
--       2. nao dizia que a carteira inteira esta em COBRANCA EXTERNA (0082) —
--          veiculo ativo que nao emite boleto aqui. Sem o selo, "cade a
--          cobranca?" vira chamado (foi por isso que `/veiculos` ganhou o dele);
--       3. nao mostrava ASSOCIADOS nem a CARTEIRA em R$ — a unidade com 998
--          associados aparecia com a mesma cara de uma unidade recem-aberta.
--
--     `veiculos_ativos` fica INTACTO (continua `status = 'ativo'`): o que entra
--     sao colunas NOVAS ao lado. Muda a lista de OUT, entao e DROP + CREATE.
--
--     A carteira em R$ soma `veiculos.valor_mensalidade` (o override) e NAO
--     chama `cotar_plano` por veiculo — mesma escolha do painel das regionais
--     (0078), que varre a carteira inteira. Veiculo sem override entra como
--     zero e aparece contado em `veiculos_sem_valor`, para a diferenca ser
--     visivel em vez de virar um total baixo sem explicacao.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Vendedor: incluir/editar/ativar/inativar = gestor da unidade. Excluir = admin.
-- ----------------------------------------------------------------------------
drop policy if exists vendedores_write  on vendedores;
drop policy if exists vendedores_insert on vendedores;
drop policy if exists vendedores_update on vendedores;
drop policy if exists vendedores_delete on vendedores;

-- O `vendedores_select` (0003) continua intacto e cobre a leitura: ele e MAIS
-- largo que o `using` do antigo `for all` (`pode_regional` + o proprio
-- vendedor), entao ninguem perde visibilidade ao perder o `for all`.
create policy vendedores_insert on vendedores for insert to authenticated
  with check (is_admin() or (auth_papel() = 'gestor_regional' and regional_id = auth_regional_id()));

create policy vendedores_update on vendedores for update to authenticated
  using      (is_admin() or (auth_papel() = 'gestor_regional' and regional_id = auth_regional_id()))
  with check (is_admin() or (auth_papel() = 'gestor_regional' and regional_id = auth_regional_id()));

-- A unica mudanca de comportamento desta migration.
create policy vendedores_delete on vendedores for delete to authenticated
  using (is_admin());

-- ----------------------------------------------------------------------------
-- (B) O painel da franquia passa a mostrar a carteira que a unidade TEM
-- ----------------------------------------------------------------------------
drop function if exists regional_painel(uuid, date, date);

create function regional_painel(
  p_regional_id uuid,
  p_inicio      date,
  p_fim         date
)
returns table (
  leads_periodo             integer,
  leads_hotlink             integer,
  leads_convertidos         integer,
  taxa_conversao            numeric,
  veiculos_ativos           integer,
  vendedores_ativos         integer,
  comissao_franquia_adesao  numeric,
  comissao_vendedores_paga  numeric,
  comissao_vendedores_pend  numeric,
  contas_receber_aberto     numeric,
  contas_pagar_aberto       numeric,
  resultado_periodo         numeric,
  -- 0102 — a carteira da unidade, que o painel nunca mostrou
  veiculos_carteira         integer,
  veiculos_inadimplentes    integer,
  veiculos_cobranca_externa integer,
  veiculos_sem_valor        integer,
  carteira_mensal           numeric,
  associados                integer,
  vendedores_cadastrados    integer
)
language sql
stable
security definer
set search_path = public
as $$
  with reg as (select case when is_staff() then escopo_regional(p_regional_id) end as id),
  l as (
    select * from leads
     where regional_id = (select id from reg)
       and created_at::date between p_inicio and p_fim
  ),
  com as (
    select c.*, ve.regional_id
      from comissoes_vendas c
      join vendedores ve on ve.id = c.vendedor_id
     where ve.regional_id = (select id from reg)
  ),
  fin as (
    select * from lancamentos_financeiros
     where regional_id = (select id from reg) and status <> 'cancelado'
  ),
  -- A CARTEIRA e a mesma lista de status de `veiculo_faturavel` (0024 + 0072):
  -- quem esta NA BASE. `suspenso`/`inativo`/`baixado`/`excluido` ficam de fora.
  vei as (
    select * from veiculos v
     where v.regional_id = (select id from reg)
       and v.status::text in ('ativo', 'em_evento', 'vistoria_pendente', 'inadimplente')
  )
  select
    (select count(*)::int from l),
    (select count(*)::int from l where origem_hotlink is not null),
    (select count(*)::int from l where veiculo_id is not null),
    case when (select count(*) from l) > 0
         then round((select count(*) filter (where veiculo_id is not null) from l)::numeric
                    / (select count(*) from l) * 100, 1)
         else 0 end,
    (select count(*)::int from veiculos v where v.regional_id = (select id from reg) and v.status = 'ativo'),
    (select count(*)::int from vendedores ve where ve.regional_id = (select id from reg) and ve.ativo),
    coalesce((select sum(valor_comissao) from com where is_adesao), 0),
    coalesce((select sum(valor_comissao) from com where status_pagamento = 'pago'), 0),
    coalesce((select sum(valor_comissao) from com where status_pagamento = 'pendente'), 0),
    coalesce((select sum(valor_saldo) from fin where tipo = 'RECEITA' and status <> 'quitado'), 0),
    coalesce((select sum(valor_saldo) from fin where tipo = 'DESPESA' and status <> 'quitado'), 0),
    coalesce((select sum(case when tipo = 'RECEITA' then valor_pago else -valor_pago end) from fin), 0),
    (select count(*)::int from vei),
    (select count(*)::int from vei where status::text = 'inadimplente'),
    (select count(*)::int from vei where cobranca_externa),
    (select count(*)::int from vei where coalesce(valor_mensalidade, 0) <= 0),
    coalesce((select sum(coalesce(valor_mensalidade, 0)) from vei), 0),
    (select count(*)::int from clientes c where c.regional_id = (select id from reg)),
    (select count(*)::int from vendedores ve where ve.regional_id = (select id from reg));
$$;

comment on function regional_painel(uuid, date, date) is
  'Painel do portal da franquia. `veiculos_ativos` e so `status = ativo` (compatibilidade); a CARTEIRA (0102) usa a mesma lista de `veiculo_faturavel` (0024/0072) e vem acompanhada de quantos estao em cobranca externa (0082), quantos sem valor e o total em R$ pelo override, sem chamar cotar_plano.';

-- ----------------------------------------------------------------------------
-- Rito de seguranca da 0052 (toda migration que cria/recria funcao)
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
