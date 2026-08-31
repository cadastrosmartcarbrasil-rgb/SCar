-- ============================================================================
-- SCar :: 0036_portal_regional.sql
-- Portal da Regional (franquia): a unidade passa a ter area propria para
-- cadastrar a equipe, acompanhar os leads dos hotlinks, ver o desempenho, o
-- extrato de comissoes e o SEU contas a pagar/receber.
--
-- Isolamento: tudo aqui e SECURITY DEFINER com `escopo_regional()` (0032), que
-- FORCA a regional de quem chama. Um gestor nunca ve outra franquia nem a
-- matriz (lancamentos com regional_id nulo), e nao existe parametro que
-- contorne isso.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) A regional tambem tem hotlink de vendas
-- ----------------------------------------------------------------------------
alter table regionais add column if not exists codigo text;

create or replace function gerar_codigo_regional(p_nome text, p_ignorar uuid default null)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_base text; v_tenta text; i int := 1;
begin
  v_base := upper(regexp_replace(
    translate(coalesce(trim(p_nome), ''),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
    '[^A-Za-z0-9]', '', 'g'));
  if v_base = '' then v_base := 'UNIDADE'; end if;
  v_base := left(v_base, 20);
  v_tenta := v_base;
  while exists (select 1 from regionais where codigo = v_tenta and (p_ignorar is null or id <> p_ignorar))
     or exists (select 1 from vendedores where codigo = v_tenta) loop
    i := i + 1;
    v_tenta := left(v_base, 18) || i::text;
  end loop;
  return v_tenta;
end;
$$;

create or replace function fn_regional_codigo()
returns trigger language plpgsql as $$
begin
  new.codigo := upper(regexp_replace(coalesce(new.codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  if new.codigo = '' then new.codigo := gerar_codigo_regional(new.nome, new.id); end if;
  return new;
end;
$$;

drop trigger if exists trg_regional_codigo on regionais;
create trigger trg_regional_codigo
  before insert or update on regionais
  for each row execute function fn_regional_codigo();

update regionais set updated_at = updated_at;  -- backfill do codigo
create unique index if not exists uq_regional_codigo on regionais (codigo);

-- De onde o lead veio (qual hotlink), para medir o desempenho por link.
alter table leads add column if not exists origem_hotlink text;
create index if not exists idx_leads_origem_hotlink on leads (origem_hotlink);

/** Resolve um codigo de hotlink: pode ser de vendedor OU da propria regional. */
create or replace function resolver_hotlink(p_codigo text)
returns table (tipo text, vendedor_id uuid, regional_id uuid, nome text, consultor_id uuid)
language sql stable security definer set search_path = public as $$
  select 'VENDEDOR', v.id, v.regional_id, v.nome, v.usuario_id
    from vendedores v
   where v.codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'))
     and v.ativo
  union all
  select 'REGIONAL', null::uuid, r.id, r.nome, r.responsavel_id
    from regionais r
   where r.codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'))
     and not exists (
       select 1 from vendedores v
        where v.codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g')) and v.ativo
     );
$$;

-- ----------------------------------------------------------------------------
-- (B) Painel da franquia
-- ----------------------------------------------------------------------------
create or replace function regional_painel(
  p_regional_id uuid,
  p_inicio      date,
  p_fim         date
)
returns table (
  leads_periodo            integer,
  leads_hotlink            integer,
  leads_convertidos        integer,
  taxa_conversao           numeric,
  veiculos_ativos          integer,
  vendedores_ativos        integer,
  comissao_franquia_adesao numeric,
  comissao_vendedores_paga numeric,
  comissao_vendedores_pend numeric,
  contas_receber_aberto    numeric,
  contas_pagar_aberto      numeric,
  resultado_periodo        numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with reg as (select escopo_regional(p_regional_id) as id),
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
    coalesce((select sum(case when tipo = 'RECEITA' then valor_pago else -valor_pago end) from fin), 0);
$$;

-- ----------------------------------------------------------------------------
-- (C) Desempenho da equipe
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
  with reg as (select escopo_regional(p_regional_id) as id)
  select
    v.id, v.nome, v.codigo, v.ativo,
    (select count(*)::int from leads l
      where l.vendedor_id = v.id and l.created_at::date between p_inicio and p_fim),
    (select count(*)::int from leads l
      where l.vendedor_id = v.id and l.origem_hotlink is not null
        and l.created_at::date between p_inicio and p_fim),
    (select count(*)::int from leads l
      where l.vendedor_id = v.id and l.veiculo_id is not null
        and l.created_at::date between p_inicio and p_fim),
    case when (select count(*) from leads l
                where l.vendedor_id = v.id and l.created_at::date between p_inicio and p_fim) > 0
         then round(
           (select count(*) filter (where l.veiculo_id is not null) from leads l
             where l.vendedor_id = v.id and l.created_at::date between p_inicio and p_fim)::numeric
           / (select count(*) from leads l
               where l.vendedor_id = v.id and l.created_at::date between p_inicio and p_fim) * 100, 1)
         else 0 end,
    (select count(*)::int from veiculos ve where ve.vendedor_id = v.id and ve.status = 'ativo'),
    coalesce((select sum(c.valor_comissao) from comissoes_vendas c where c.vendedor_id = v.id), 0),
    coalesce((select sum(c.valor_comissao) from comissoes_vendas c
               where c.vendedor_id = v.id and c.status_pagamento = 'pendente'), 0),
    v.taxa_comissao_adesao, v.taxa_comissao_recorrente
  from vendedores v
  where v.regional_id = (select id from reg)
  order by 10 desc, v.nome;
$$;

-- ----------------------------------------------------------------------------
-- (D) Extrato de comissoes da franquia
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
     and (p_inicio is null or c.created_at::date >= p_inicio)
     and (p_fim is null or c.created_at::date <= p_fim)
   order by c.created_at desc;
$$;

-- ----------------------------------------------------------------------------
-- (E) Leads captados pelos hotlinks da unidade
-- ----------------------------------------------------------------------------
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
     and (p_inicio is null or l.created_at::date >= p_inicio)
     and (p_fim is null or l.created_at::date <= p_fim)
     and (not p_somente_hotlink or l.origem_hotlink is not null)
   order by l.created_at desc;
$$;

grant execute on function gerar_codigo_regional(text, uuid) to authenticated;
grant execute on function resolver_hotlink(text) to authenticated, anon;
grant execute on function regional_painel(uuid, date, date) to authenticated;
grant execute on function regional_desempenho_vendedores(uuid, date, date) to authenticated;
grant execute on function regional_comissoes(uuid, text, date, date) to authenticated;
grant execute on function regional_leads(uuid, date, date, boolean) to authenticated;
