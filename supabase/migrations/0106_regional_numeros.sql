-- ============================================================================
-- 0106 — OS NUMEROS DO PORTAL DA FRANQUIA (/regional), conferidos em producao
-- ============================================================================
-- Pedido do usuario (14/10/2026): "verifique os numeros apresentados nos
-- filtros desses paineis". Conferido contra o banco de producao, com tres
-- defeitos — os tres de LEITURA, nenhum de dado:
--
-- (A) O FINANCEIRO DA FRANQUIA MOSTRAVA O DINHEIRO DA MATRIZ.
--     A 0037 desenhou o financeiro da unidade como "so comissao" (1.3.01 a
--     receber da matriz, 3.2.01 a pagar aos vendedores) e a tela diz "nao
--     inclui nada da matriz". Mas as RPCs filtravam so por `regional_id` — e a
--     OS da 24h, a nota da oficina e o guincho do evento nascem com a unidade
--     do VEICULO. Medido em 14/10: os 13 lancamentos com unidade sao TODOS da
--     operacao da matriz (7 de guincho/assistencia, 1 de reparo, 1 de sinistro,
--     4 sem categoria) e NENHUM e comissao. Resultado: Ribeirao Preto via
--     "A pagar aos vendedores R$ 250" (eram duas OS da 24h) e "Resultado
--     liquidado -R$ 5.150" (era a oficina de um evento). Pior que o numero: o
--     gestor podia BAIXAR ou CANCELAR esses titulos pelo portal
--     (`regional_baixar_titulo`/`regional_cancelar_titulo` so conferiam a
--     unidade). Agora o financeiro da franquia e, de fato, so os dois
--     movimentos de comissao — `lancamento_da_franquia()`.
--
-- (B) O "RESULTADO" DO PAINEL IGNORAVA O PERIODO. `regional_painel` somava
--     `valor_pago` de TODOS os titulos da unidade, desde sempre, debaixo de um
--     filtro de periodo. Passa a ser o que foi BAIXADO no periodo (a mesma
--     conta do `saldo_periodo` da tela de financeiro — eram duas respostas
--     diferentes para a mesma pergunta). A comissao por vendedor da tela da
--     equipe tambem era de sempre numa tabela do periodo: passa a ser a
--     comissao GERADA no periodo; a pendente segue sendo o retrato de hoje.
--
-- (C) O DIA DO LEAD ERA O DIA EM UTC. O banco roda em UTC (conferido) e
--     `created_at::date` poe o lead das 21h-24h de Sao Paulo no dia SEGUINTE —
--     no "ultimo dia do mes" ele caia no mes seguinte. Hoje 0 de 22 leads estao
--     nessa faixa, entao nenhum numero muda ao aplicar; muda o proximo.
--     `data_sp()` e a regra, em todas as RPCs do portal.
--
-- Nenhuma assinatura muda (o OUT de todas e o mesmo), entao o que e
-- `create or replace` nao precisa de drop.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- O dia de Sao Paulo de um instante. STABLE (nao IMMUTABLE): nao e usado em
-- indice, e assim nao depende de a conversao de fuso ser imutavel.
-- ----------------------------------------------------------------------------
create or replace function data_sp(p_instante timestamptz)
returns date
language sql
stable
set search_path = public
as $$
  select (p_instante at time zone 'America/Sao_Paulo')::date;
$$;

comment on function data_sp(timestamptz) is
  'Dia (America/Sao_Paulo) de um instante (0106). O banco roda em UTC: created_at::date poe o que aconteceu depois das 21h no dia seguinte.';

-- ----------------------------------------------------------------------------
-- (A) O que e da franquia no financeiro: os DOIS movimentos de comissao da 0037.
-- ----------------------------------------------------------------------------
create or replace function lancamento_da_franquia(p_categoria_dre_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_categoria_dre_id is not null
     and p_categoria_dre_id in (regional_categoria_movimento('COMISSAO_RECEBER'),
                                regional_categoria_movimento('COMISSAO_PAGAR'));
$$;

comment on function lancamento_da_franquia(uuid) is
  'O financeiro da franquia (0037) e SO comissao: 1.3.01 a receber da matriz e 3.2.01 a pagar aos vendedores. A OS da 24h e a nota do evento levam a unidade do veiculo e sao da MATRIZ (0106).';

-- A guarda das escritas: titulo desta unidade E da franquia. Sem a segunda
-- condicao o gestor baixava/cancelava a conta da oficina do evento.
create or replace function regional_titulo_no_escopo(p_lancamento_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from lancamentos_financeiros l
     where l.id = p_lancamento_id
       and l.regional_id is not distinct from escopo_regional(l.regional_id)
       and lancamento_da_franquia(l.categoria_dre_id)
  );
$$;

create or replace function regional_financeiro_resumo(
  p_regional_id uuid,
  p_inicio      date,
  p_fim         date
)
returns table (
  a_receber_aberto  numeric,
  a_receber_vencido numeric,
  a_pagar_aberto    numeric,
  a_pagar_vencido   numeric,
  recebido_periodo  numeric,
  pago_periodo      numeric,
  saldo_periodo     numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with reg as (select escopo_regional(p_regional_id) as id),
  aberto as (
    select l.tipo,
           coalesce(l.valor_saldo, l.valor_original) as saldo,
           l.data_vencimento
      from lancamentos_financeiros l
     where l.regional_id = (select id from reg)
       and lancamento_da_franquia(l.categoria_dre_id)
       and l.status not in ('quitado', 'cancelado')
  ),
  baixado as (
    select l.tipo, b.valor_pago
      from baixas_financeiras b
      join lancamentos_financeiros l on l.id = b.lancamento_id
     where l.regional_id = (select id from reg)
       and lancamento_da_franquia(l.categoria_dre_id)
       and l.status <> 'cancelado'
       and b.data_pagamento between p_inicio and p_fim
  )
  select
    coalesce((select sum(saldo) from aberto where tipo = 'RECEITA'), 0),
    coalesce((select sum(saldo) from aberto where tipo = 'RECEITA' and data_vencimento < current_date), 0),
    coalesce((select sum(saldo) from aberto where tipo = 'DESPESA'), 0),
    coalesce((select sum(saldo) from aberto where tipo = 'DESPESA' and data_vencimento < current_date), 0),
    coalesce((select sum(valor_pago) from baixado where tipo = 'RECEITA'), 0),
    coalesce((select sum(valor_pago) from baixado where tipo = 'DESPESA'), 0),
    coalesce((select sum(valor_pago) from baixado where tipo = 'RECEITA'), 0)
      - coalesce((select sum(valor_pago) from baixado where tipo = 'DESPESA'), 0);
$$;

create or replace function regional_financeiro_titulos(
  p_regional_id uuid,
  p_inicio      date default null,
  p_fim         date default null,
  p_tipo        text default null,
  p_situacao    text default null
)
returns table (
  id              uuid,
  tipo            text,
  descricao       text,
  favorecido      text,
  categoria       text,
  data_vencimento date,
  valor_original  numeric,
  valor_pago      numeric,
  valor_saldo     numeric,
  status          text,
  situacao        text,
  observacoes     text
)
language sql
stable
security definer
set search_path = public
as $$
  with reg as (select escopo_regional(p_regional_id) as id)
  select l.id,
         l.tipo::text,
         l.descricao,
         coalesce(ve.nome, u.nome, f.razao_social, c.nome_razao_social),
         cat.nome,
         l.data_vencimento,
         l.valor_original,
         coalesce(l.valor_pago, 0),
         coalesce(l.valor_saldo, l.valor_original),
         l.status::text,
         case
           when l.status = 'cancelado' then 'cancelado'
           when l.status = 'quitado'   then 'quitado'
           when l.data_vencimento < current_date then 'vencido'
           when coalesce(l.valor_pago, 0) > 0 then 'parcial'
           else 'aberto'
         end,
         l.observacoes
    from lancamentos_financeiros l
    left join vendedores    ve  on ve.id  = l.vendedor_id
    left join usuarios      u   on u.id   = ve.usuario_id
    left join fornecedores  f   on f.id   = l.fornecedor_id
    left join clientes      c   on c.id   = l.cliente_id
    left join categorias_dre cat on cat.id = l.categoria_dre_id
   where l.regional_id = (select id from reg)
     and lancamento_da_franquia(l.categoria_dre_id)
     and (p_inicio is null or l.data_vencimento >= p_inicio)
     and (p_fim    is null or l.data_vencimento <= p_fim)
     and (p_tipo   is null or l.tipo::text = upper(p_tipo))
     and (p_situacao is null or p_situacao = case
           when l.status = 'cancelado' then 'cancelado'
           when l.status = 'quitado'   then 'quitado'
           when l.data_vencimento < current_date then 'vencido'
           when coalesce(l.valor_pago, 0) > 0 then 'parcial'
           else 'aberto'
         end)
   order by l.data_vencimento, l.created_at;
$$;

-- ----------------------------------------------------------------------------
-- (A)+(B)+(C) O painel da franquia. Mesma assinatura da 0102.
-- ----------------------------------------------------------------------------
create or replace function regional_painel(
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
       and data_sp(created_at) between p_inicio and p_fim
  ),
  com as (
    select c.*
      from comissoes_vendas c
      join vendedores ve on ve.id = c.vendedor_id
     where ve.regional_id = (select id from reg)
  ),
  fin as (
    select * from lancamentos_financeiros
     where regional_id = (select id from reg) and status <> 'cancelado'
       and lancamento_da_franquia(categoria_dre_id)
  ),
  baixado as (
    select f.tipo, b.valor_pago
      from baixas_financeiras b join fin f on f.id = b.lancamento_id
     where b.data_pagamento between p_inicio and p_fim
  ),
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
    coalesce((select sum(case when tipo = 'RECEITA' then valor_pago else -valor_pago end) from baixado), 0),
    (select count(*)::int from vei),
    (select count(*)::int from vei where status::text = 'inadimplente'),
    (select count(*)::int from vei where cobranca_externa),
    (select count(*)::int from vei where coalesce(valor_mensalidade, 0) <= 0),
    coalesce((select sum(coalesce(valor_mensalidade, 0)) from vei), 0),
    (select count(*)::int from clientes c where c.regional_id = (select id from reg)),
    (select count(*)::int from vendedores ve where ve.regional_id = (select id from reg));
$$;

comment on function regional_painel(uuid, date, date) is
  'Painel do portal da franquia. Leads pelo dia de Sao Paulo; o financeiro e SO comissao (lancamento_da_franquia) e o resultado e o BAIXADO no periodo (0106). Comissao a pagar/ja repassada e retrato de hoje. A carteira (0102) usa a lista de veiculo_faturavel.';

-- ----------------------------------------------------------------------------
-- (B)+(C) Desempenho por vendedor. Mesma assinatura da 0036.
--   comissao_total    = comissao GERADA no periodo (a tabela e do periodo);
--   comissao_pendente = o que esta a pagar HOJE;
--   veiculos_ativos   = a carteira do vendedor (lista de veiculo_faturavel).
-- ----------------------------------------------------------------------------
create or replace function regional_desempenho_vendedores(
  p_regional_id uuid,
  p_inicio      date,
  p_fim         date
)
returns table (
  vendedor_id        uuid,
  nome               text,
  codigo             text,
  ativo              boolean,
  leads              integer,
  leads_hotlink      integer,
  convertidos        integer,
  taxa_conversao     numeric,
  veiculos_ativos    integer,
  comissao_total     numeric,
  comissao_pendente  numeric,
  taxa_adesao        numeric,
  taxa_recorrente    numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with reg as (select escopo_regional(p_regional_id) as id),
  l as (
    select l.vendedor_id,
           count(*)::int                                            as leads,
           count(*) filter (where l.origem_hotlink is not null)::int as hotlink,
           count(*) filter (where l.veiculo_id is not null)::int     as convertidos
      from leads l
     where data_sp(l.created_at) between p_inicio and p_fim
     group by l.vendedor_id
  )
  select
    v.id, v.nome, v.codigo, v.ativo,
    coalesce(l.leads, 0),
    coalesce(l.hotlink, 0),
    coalesce(l.convertidos, 0),
    case when coalesce(l.leads, 0) > 0
         then round(l.convertidos::numeric / l.leads * 100, 1) else 0 end,
    (select count(*)::int from veiculos ve
      where ve.vendedor_id = v.id
        and ve.status::text in ('ativo', 'em_evento', 'vistoria_pendente', 'inadimplente')),
    coalesce((select sum(c.valor_comissao) from comissoes_vendas c
               where c.vendedor_id = v.id
                 and data_sp(c.created_at) between p_inicio and p_fim), 0),
    coalesce((select sum(c.valor_comissao) from comissoes_vendas c
               where c.vendedor_id = v.id and c.status_pagamento = 'pendente'), 0),
    v.taxa_comissao_adesao, v.taxa_comissao_recorrente
  from vendedores v
  left join l on l.vendedor_id = v.id
  where v.regional_id = (select id from reg)
  order by 10 desc, v.nome;
$$;

-- ----------------------------------------------------------------------------
-- (C) Extrato de comissoes e lista de leads: o mesmo dia de Sao Paulo.
-- ----------------------------------------------------------------------------
create or replace function regional_comissoes(
  p_regional_id uuid,
  p_status      text default null,
  p_inicio      date default null,
  p_fim         date default null
)
returns table (
  id             uuid,
  vendedor_id    uuid,
  vendedor_nome  text,
  veiculo_id     uuid,
  placa          text,
  is_adesao      boolean,
  valor_comissao numeric,
  status_pagamento text,
  created_at     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with reg as (select escopo_regional(p_regional_id) as id)
  select c.id, c.vendedor_id, v.nome, c.veiculo_id, ve.placa,
         c.is_adesao, c.valor_comissao, c.status_pagamento::text, c.created_at
    from comissoes_vendas c
    join vendedores v on v.id = c.vendedor_id
    left join veiculos ve on ve.id = c.veiculo_id
   where v.regional_id = (select id from reg)
     and (p_status is null or c.status_pagamento::text = p_status)
     and (p_inicio is null or data_sp(c.created_at) >= p_inicio)
     and (p_fim is null or data_sp(c.created_at) <= p_fim)
   order by c.created_at desc;
$$;

create or replace function regional_leads(
  p_regional_id uuid,
  p_inicio      date default null,
  p_fim         date default null,
  p_somente_hotlink boolean default false
)
returns table (
  id             uuid,
  nome           text,
  celular        text,
  email          text,
  placa          text,
  status         text,
  origem_hotlink text,
  vendedor_nome  text,
  veiculo_id     uuid,
  created_at     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with reg as (select escopo_regional(p_regional_id) as id)
  select l.id, l.nome, l.celular, l.email, l.placa, l.status::text,
         l.origem_hotlink, v.nome, l.veiculo_id, l.created_at
    from leads l
    left join vendedores v on v.id = l.vendedor_id
   where l.regional_id = (select id from reg)
     and (p_inicio is null or data_sp(l.created_at) >= p_inicio)
     and (p_fim is null or data_sp(l.created_at) <= p_fim)
     and (not p_somente_hotlink or l.origem_hotlink is not null)
   order by l.created_at desc;
$$;

-- ----------------------------------------------------------------------------
-- Rito de seguranca da 0052 (toda migration que cria/recria funcao)
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
