-- =============================================================================
-- SCar :: 0150_boleto_avulso.sql
-- BOLETO AVULSO NO SAC (pedido do usuario, 25/10/2026): cobrar do associado o
-- que NAO e mensalidade — adesao, vistoria, re-vistoria, instalacao/manutencao
-- de equipamento, monitoramento, cancelamento, acordo, reativacao, venda de
-- rastreador... — com o boleto do banco PADRAO (hoje o Sicredi).
--
-- (A) `tipos_boleto_avulso`: o catalogo (lista inicial do usuario), cada tipo
--     com a categoria do plano de contas que o DRE usa. Editavel em
--     Configuracoes -> Boletos avulsos. Tipo em uso nao se apaga: inativa.
-- (B) O boleto avulso e uma "renegociacao" de tipo AVULSO SEM ORIGENS: usa a
--     MESMA maquina da 2a via (0121) — titulo do SCar, emissao no Sicredi pelo
--     servidor, `finalizar_emissao_renegociacao`, PDF, WhatsApp e e-mail. Nada
--     de caminho paralelo. `titulos_financeiros.tipo_avulso_id` marca o titulo.
-- (C) `criar_boleto_avulso(...)`: quem pode = `cobranca.criar` + o associado no
--     escopo da cobranca (o mesmo de quem emite a 2a via e abre o PDF).
-- (D) Avulso NAO e mensalidade: fica FORA do painel de inadimplencia
--     (`cobranca_boletos_base`) e da trava da 24h (`vencidos_veiculo`), e o DRE
--     o lanca na categoria do tipo (`dre_movimentos`). Nao gera comissao (o
--     titulo de renegociacao ja nao gera, 0121).
-- =============================================================================

-- (A) ------------------------------------------------------------------------
insert into categorias_dre (codigo_estruturado, nome, tipo)
select x.c, x.n, 'RECEITA'
  from (values ('1.2.03', 'Receita de Vistorias'),
               ('1.2.04', 'Receita de Servicos de Rastreamento'),
               ('1.2.05', 'Venda de Rastreadores')) x(c, n)
 where not exists (select 1 from categorias_dre c where c.codigo_estruturado = x.c);

create table if not exists tipos_boleto_avulso (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  categoria_dre_id uuid references categorias_dre(id) on delete set null,
  exige_veiculo    boolean not null default false,
  ativo            boolean not null default true,
  ordem            integer not null default 0,
  created_at       timestamptz not null default now(),
  constraint chk_tipo_avulso_nome check (length(btrim(nome)) between 2 and 60)
);
create unique index if not exists uq_tipo_avulso_nome on tipos_boleto_avulso (upper(btrim(nome)));

comment on table tipos_boleto_avulso is
  'Tipos de boleto AVULSO do SAC (0150): o que nao e mensalidade. Categoria = conta do DRE.';

insert into tipos_boleto_avulso (nome, categoria_dre_id, exige_veiculo, ordem)
select x.nome, (select id from categorias_dre where codigo_estruturado = x.conta), x.veic, x.ord
  from (values
    ('Adesão',                      '1.1.01', false, 1),
    ('Vistoria',                    '1.2.03', true,  2),
    ('Re-vistoria',                 '1.2.03', true,  3),
    ('Avulso',                      '1.2.01', false, 4),
    ('Instalação de Equipamentos',  '1.2.04', true,  5),
    ('Manutenção de equipamentos',  '1.2.04', true,  6),
    ('Monitoramento/rastreador',    '1.2.04', true,  7),
    ('Cancelamento',                '1.2.01', false, 8),
    ('Acordo Financeiro',           '1.1.00', false, 9),
    ('Reativação',                  '1.2.01', true,  10),
    ('Venda de Rastreador',         '1.2.05', false, 11)
  ) x(nome, conta, veic, ord)
 where not exists (select 1 from tipos_boleto_avulso t where upper(btrim(t.nome)) = upper(x.nome));

alter table tipos_boleto_avulso enable row level security;
drop policy if exists tipos_avulso_select on tipos_boleto_avulso;
create policy tipos_avulso_select on tipos_boleto_avulso for select to authenticated
  using ((select is_staff()));
drop policy if exists tipos_avulso_write on tipos_boleto_avulso;
create policy tipos_avulso_write on tipos_boleto_avulso for all to authenticated
  using ((select tem_acesso_global())) with check ((select tem_acesso_global()));

-- (B) ------------------------------------------------------------------------
alter table titulos_financeiros
  add column if not exists tipo_avulso_id uuid references tipos_boleto_avulso(id) on delete restrict;
create index if not exists idx_titulos_tipo_avulso on titulos_financeiros (tipo_avulso_id)
  where tipo_avulso_id is not null;
comment on column titulos_financeiros.tipo_avulso_id is
  'Boleto AVULSO do SAC (0150): o tipo. Fora da inadimplencia de mensalidade e da trava da 24h.';

alter table cobranca_renegociacoes
  add column if not exists tipo_avulso_id uuid references tipos_boleto_avulso(id);
alter table cobranca_renegociacoes drop constraint if exists chk_reneg_tipo;
alter table cobranca_renegociacoes add constraint chk_reneg_tipo
  check (tipo in ('SEGUNDA_VIA', 'ACORDO', 'PRO_RATA', 'AVULSO'));

-- (C) ------------------------------------------------------------------------
/**
 * Cria o boleto avulso (situacao EMITINDO) com UM titulo; quem emite no banco
 * e a rota do servidor (`/api/v1/cobrancas/avulso`), que fecha com
 * `finalizar_emissao_renegociacao` (recusa do banco cancela o titulo).
 */
create or replace function criar_boleto_avulso(
  p_cliente_id uuid,
  p_tipo_id    uuid,
  p_valor      numeric,
  p_vencimento date,
  p_veiculo_id uuid default null,
  p_descricao  text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c      clientes%rowtype;
  t      tipos_boleto_avulso%rowtype;
  v      veiculos%rowtype;
  v_hoje date := data_sp(now());
  v_desc text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_obs  text;
  v_id   uuid;
begin
  select * into c from clientes where id = p_cliente_id;
  if not found then
    raise exception 'Associado nao encontrado.' using errcode = 'no_data_found';
  end if;
  if auth.uid() is not null and not (perfil_pode('cobranca', 'criar') and cobranca_pode_cliente(p_cliente_id)) then
    raise exception 'Sem permissao para emitir boleto avulso (Cobranca: Criar, no seu escopo).'
      using errcode = 'insufficient_privilege';
  end if;

  select * into t from tipos_boleto_avulso where id = p_tipo_id;
  if not found or not t.ativo then
    raise exception 'Tipo de boleto avulso invalido ou inativo.' using errcode = 'check_violation';
  end if;

  if p_veiculo_id is not null then
    select * into v from veiculos where id = p_veiculo_id;
    if not found or v.cliente_id <> p_cliente_id then
      raise exception 'O veiculo nao e deste associado.' using errcode = 'check_violation';
    end if;
  elsif t.exige_veiculo then
    raise exception 'O boleto de % precisa do veiculo.', t.nome using errcode = 'check_violation';
  end if;

  if p_valor is null or p_valor <= 0 or p_valor > 100000 then
    raise exception 'Informe um valor entre R$ 0,01 e R$ 100.000,00.' using errcode = 'check_violation';
  end if;
  if p_vencimento is null or p_vencimento < v_hoje or p_vencimento > v_hoje + 90 then
    raise exception 'O vencimento tem de ser de hoje ate 90 dias.' using errcode = 'check_violation';
  end if;
  if v_desc is not null and length(v_desc) > 200 then
    raise exception 'A descricao tem no maximo 200 caracteres.' using errcode = 'check_violation';
  end if;

  v_obs := t.nome || coalesce(': ' || v_desc, '');

  insert into cobranca_renegociacoes (cliente_id, regional_id, tipo, valor_original, valor_total,
                                      observacao, situacao, criado_por, veiculo_id, tipo_avulso_id)
  values (p_cliente_id, coalesce(v.regional_id, c.regional_id), 'AVULSO', 0, round(p_valor, 2),
          v_obs, 'EMITINDO', (select id from usuarios where id = auth.uid()), p_veiculo_id, p_tipo_id)
  returning id into v_id;

  insert into titulos_financeiros (cliente_id, veiculo_id, valor, valor_original, data_vencimento,
                                   status, renegociacao_id, renegociacao_parcela, observacao, tipo_avulso_id)
  values (p_cliente_id, p_veiculo_id, round(p_valor, 2), round(p_valor, 2), p_vencimento,
          'pendente', v_id, 1, 'Boleto avulso — ' || v_obs, p_tipo_id);

  return v_id;
end;
$$;

comment on function criar_boleto_avulso(uuid, uuid, numeric, date, uuid, text) is
  'Boleto AVULSO (0150): renegociacao AVULSO sem origens + 1 titulo; a rota emite no banco padrao.';

-- (D) ------------------------------------------------------------------------
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
     -- 0150: o BOLETO AVULSO (adesao, vistoria, rastreador...) nao e mensalidade.
     where f.id is not null or (t.renegociacao_id is not null and t.tipo_avulso_id is null)
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

create or replace function vencidos_veiculo(p_veiculo_id uuid, p_min_dias integer default 1)
returns table (boletos integer, valor numeric, dias integer)
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select id, cliente_id, tipo_faturamento from veiculos where id = p_veiculo_id
  ),
  corte as (
    select min(t.data_vencimento) as corte
      from titulos_financeiros t
      join faturas f on f.titulo_id = t.id
      join v on v.cliente_id = t.cliente_id
     where t.status::text <> 'cancelado'
  ),
  b as (
    select t.valor, (current_date - t.data_vencimento) as dias
      from titulos_financeiros t, v
     where t.cliente_id = v.cliente_id
       and t.status::text in ('pendente', 'vencido')
       and t.data_vencimento < current_date
       and t.tipo_avulso_id is null   -- 0150: boleto avulso nao bloqueia a 24h
       and (t.veiculo_id = v.id
            or (t.veiculo_id is null and v.tipo_faturamento = 'AGRUPADO_ASSOCIADO'))
    union all
    select h.valor, (current_date - h.vencimento_original)
      from boletos_historico h, v, corte
     where h.cliente_id = v.cliente_id
       and h.situacao = 'aberto'
       and coalesce(h.data_limite, h.data_vencimento) < current_date
       and (h.veiculo_id = v.id or h.veiculo_id is null)
       and (corte.corte is null or h.vencimento_original < corte.corte)
  )
  select count(*)::int, coalesce(round(sum(b.valor), 2), 0), coalesce(max(b.dias), 0)::int
    from b
   where b.dias >= greatest(coalesce(p_min_dias, 1), 1)
     and (is_staff() or auth.uid() is null);
$$;

create or replace function dre_movimentos(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid  default null,
  p_regime      text  default 'CAIXA'
)
returns table (
  data             date,
  grupo            tipo_categoria_dre,
  categoria_codigo text,
  categoria_nome   text,
  centro_custo_id  uuid,
  valor            numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with regime as (select upper(coalesce(p_regime, 'CAIXA')) as r)

  -- 1) Contas a pagar / a receber (modulo financeiro)
  --    Caixa: pelas baixas (dinheiro que efetivamente circulou).
  select b.data_pagamento,
         coalesce(cat.tipo, (case when l.tipo = 'RECEITA' then 'RECEITA' else 'DESPESA_FIXA' end)::tipo_categoria_dre),
         coalesce(cat.codigo_estruturado, case when l.tipo = 'RECEITA' then '1.9.99' else '4.9.99' end),
         coalesce(cat.nome, case when l.tipo = 'RECEITA' then 'Receitas nao classificadas' else 'Despesas nao classificadas' end),
         l.centro_custo_id,
         case when l.tipo = 'RECEITA' then b.valor_liquido else -b.valor_liquido end
    from baixas_financeiras b
    join lancamentos_financeiros l on l.id = b.lancamento_id
    left join categorias_dre cat on cat.id = l.categoria_dre_id
   cross join regime
   where regime.r = 'CAIXA'
     and b.data_pagamento between p_data_inicio and p_data_fim
     and l.status <> 'cancelado'
     and ((select escopo_regional(p_regional_id)) is null
            or l.regional_id = (select escopo_regional(p_regional_id)))

  union all

  --    Competencia: pelo titulo, no mes de competencia, independente do pagamento.
  select l.competencia,
         coalesce(cat.tipo, (case when l.tipo = 'RECEITA' then 'RECEITA' else 'DESPESA_FIXA' end)::tipo_categoria_dre),
         coalesce(cat.codigo_estruturado, case when l.tipo = 'RECEITA' then '1.9.99' else '4.9.99' end),
         coalesce(cat.nome, case when l.tipo = 'RECEITA' then 'Receitas nao classificadas' else 'Despesas nao classificadas' end),
         l.centro_custo_id,
         case when l.tipo = 'RECEITA' then l.valor_original else -l.valor_original end
    from lancamentos_financeiros l
    left join categorias_dre cat on cat.id = l.categoria_dre_id
   cross join regime
   where regime.r = 'COMPETENCIA'
     and l.competencia between p_data_inicio and p_data_fim
     and l.status <> 'cancelado'
     and ((select escopo_regional(p_regional_id)) is null
            or l.regional_id = (select escopo_regional(p_regional_id)))

  union all

  -- 2) Movimentacoes de caixa avulsas (nao vinculadas a um titulo do modulo).
  select case when (select r from regime) = 'CAIXA'
              then coalesce(m.data_caixa, m.data_competencia) else m.data_competencia end,
         cat.tipo, cat.codigo_estruturado, cat.nome, null::uuid,
         case when m.tipo = 'RECEITA' then m.valor else -m.valor end
    from movimentacoes_caixa m
    join categorias_dre cat on cat.id = m.categoria_dre_id
   where m.status <> 'cancelado'
     and m.lancamento_id is null
     and (case when (select r from regime) = 'CAIXA'
               then coalesce(m.data_caixa, m.data_competencia) else m.data_competencia end)
         between p_data_inicio and p_data_fim
     and ((select escopo_regional(p_regional_id)) is null
            or m.regional_id = (select escopo_regional(p_regional_id)))

  union all

  -- 3) Mensalidades (e a adesao, 0145) dos associados nao espelhadas no caixa.
  --    0150: o boleto AVULSO vai para a categoria do tipo (com ou sem veiculo).
  select case when (select r from regime) = 'CAIXA' then t.data_pagamento else t.data_vencimento end,
         coalesce(ca.tipo, 'RECEITA'::tipo_categoria_dre),
         case when t.adesao_lead_id is not null then '1.1.01'
              when t.tipo_avulso_id is not null then coalesce(ca.codigo_estruturado, '1.2.01')
              else '1.1.00' end,
         case when t.adesao_lead_id is not null then 'Receita de Adesao'
              when t.tipo_avulso_id is not null then coalesce(ca.nome, 'Outras Receitas')
              else 'Receita de Mensalidades (Titulos)' end,
         null::uuid,
         case when (select r from regime) = 'CAIXA' then coalesce(t.valor_pago, 0) else t.valor end
    from titulos_financeiros t
    left join veiculos v on v.id = t.veiculo_id
    left join faturas fa on fa.titulo_id = t.id
    left join clientes cl on cl.id = t.cliente_id
    left join tipos_boleto_avulso ta on ta.id = t.tipo_avulso_id
    left join categorias_dre ca on ca.id = ta.categoria_dre_id
   where t.status <> 'cancelado'
     and (t.veiculo_id is not null or fa.id is not null or t.tipo_avulso_id is not null)
     and not exists (select 1 from movimentacoes_caixa mc where mc.titulo_id = t.id)
     and (case when (select r from regime) = 'CAIXA' then t.data_pagamento else t.data_vencimento end)
         between p_data_inicio and p_data_fim
     and (case when (select r from regime) = 'CAIXA' then t.status = 'pago' else true end)
     and ((select escopo_regional(p_regional_id)) is null
            or coalesce(v.regional_id, fa.regional_id, cl.regional_id) = (select escopo_regional(p_regional_id)))

  union all

  -- 4) Custo de sinistro: notas fiscais dos eventos (competencia = emissao).
  --    No regime de caixa entram apenas as que nao viraram titulo a pagar.
  select nf.data_emissao, 'CUSTO_VARIAVEL'::tipo_categoria_dre,
         '3.1.00', 'Custo com Sinistros (Notas Fiscais)', null::uuid, -nf.valor_nota
    from notas_fiscais_evento nf
    join eventos_sinistro e on e.id = nf.evento_id
   where (select r from regime) = 'COMPETENCIA'
     and nf.data_emissao between p_data_inicio and p_data_fim
     and ((select escopo_regional(p_regional_id)) is null
            or e.regional_id = (select escopo_regional(p_regional_id)));
$$;

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
