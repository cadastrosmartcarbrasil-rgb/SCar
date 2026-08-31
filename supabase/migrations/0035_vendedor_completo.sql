-- ============================================================================
-- SCar :: 0035_vendedor_completo.sql
-- O vendedor deixa de ser um apendice do usuario e vira cadastro proprio:
-- contato, codigo (hotlink), dados bancarios, prazo de pagamento da comissao,
-- acesso ao portal e trilha de boas-vindas/contrato.
--
-- `usuario_id` passa a ser OPCIONAL: cadastra-se o vendedor primeiro e o acesso
-- ao portal e criado depois (ou nunca, para quem so recebe comissao).
-- ============================================================================

alter table vendedores
  add column if not exists nome                    text,
  add column if not exists email                   text,
  add column if not exists telefone                text,
  add column if not exists codigo                  text,
  add column if not exists documento               text,
  -- dados bancarios do repasse
  add column if not exists banco                   text,
  add column if not exists agencia                 text,
  add column if not exists conta                   text,
  add column if not exists chave_pix               text,
  -- prazo de pagamento (null = usa o padrao da franquia)
  add column if not exists dia_pagto_entrada       smallint,
  add column if not exists dia_pagto_recorrencia   smallint,
  add column if not exists observacoes             text,
  -- trilha de onboarding
  add column if not exists contrato_url            text,
  add column if not exists boas_vindas_enviada_em  timestamptz;

-- O acesso ao portal pode vir depois do cadastro.
alter table vendedores alter column usuario_id drop not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_vendedor_dias_pagto') then
    alter table vendedores add constraint chk_vendedor_dias_pagto check (
      (dia_pagto_entrada is null or dia_pagto_entrada between 1 and 7)
      and (dia_pagto_recorrencia is null or dia_pagto_recorrencia between 1 and 31)
    );
  end if;
end $$;

comment on column vendedores.dia_pagto_entrada is
  'Dia da SEMANA (1=segunda .. 7=domingo) do pagamento da comissao de adesao. Null = padrao da franquia.';
comment on column vendedores.dia_pagto_recorrencia is
  'Dia do MES do pagamento da comissao recorrente. Null = padrao da franquia.';

-- Padrao da franquia, herdado por quem nao definir o proprio dia.
alter table regionais
  add column if not exists dia_pagto_entrada_padrao     smallint,
  add column if not exists dia_pagto_recorrencia_padrao smallint;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_regional_dias_pagto') then
    alter table regionais add constraint chk_regional_dias_pagto check (
      (dia_pagto_entrada_padrao is null or dia_pagto_entrada_padrao between 1 and 7)
      and (dia_pagto_recorrencia_padrao is null or dia_pagto_recorrencia_padrao between 1 and 31)
    );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Codigo do vendedor: identidade curta usada no hotlink de vendas.
-- ----------------------------------------------------------------------------
create or replace function gerar_codigo_vendedor(p_nome text, p_ignorar uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base   text;
  v_tenta  text;
  i        int := 1;
begin
  -- Primeiro nome, sem acento, so letras e numeros.
  v_base := upper(regexp_replace(
    translate(coalesce(split_part(trim(p_nome), ' ', 1), ''),
              'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
              'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
    '[^A-Za-z0-9]', '', 'g'));

  if v_base = '' then v_base := 'VENDEDOR'; end if;
  v_base := left(v_base, 20);
  v_tenta := v_base;

  while exists (
    select 1 from vendedores
     where codigo = v_tenta and (p_ignorar is null or id <> p_ignorar)
  ) loop
    i := i + 1;
    v_tenta := left(v_base, 18) || i::text;
  end loop;

  return v_tenta;
end;
$$;

-- Preenche nome/codigo automaticamente e mantem o codigo unico.
create or replace function fn_vendedor_preencher()
returns trigger language plpgsql as $$
begin
  -- Sem nome proprio, herda o do usuario vinculado.
  if coalesce(trim(new.nome), '') = '' and new.usuario_id is not null then
    select u.nome, coalesce(new.email, u.email) into new.nome, new.email
      from usuarios u where u.id = new.usuario_id;
  end if;

  if coalesce(trim(new.nome), '') = '' then
    raise exception 'Informe o nome do vendedor' using errcode = 'check_violation';
  end if;

  new.codigo := upper(regexp_replace(coalesce(new.codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  if new.codigo = '' then
    new.codigo := gerar_codigo_vendedor(new.nome, new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_vendedor_preencher on vendedores;
create trigger trg_vendedor_preencher
  before insert or update on vendedores
  for each row execute function fn_vendedor_preencher();

-- Backfill dos vendedores ja cadastrados (dispara o trigger acima).
update vendedores set updated_at = updated_at;

create unique index if not exists uq_vendedor_codigo on vendedores (codigo);
create index if not exists idx_vendedores_regional on vendedores (regional_id);

-- ----------------------------------------------------------------------------
-- Prazo efetivo: o do vendedor, senao o padrao da franquia.
-- ----------------------------------------------------------------------------
create or replace function prazo_pagamento_vendedor(p_vendedor_id uuid)
returns table (
  dia_entrada       smallint,
  dia_recorrencia   smallint,
  entrada_herdada   boolean,
  recorrencia_herdada boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(v.dia_pagto_entrada, r.dia_pagto_entrada_padrao),
    coalesce(v.dia_pagto_recorrencia, r.dia_pagto_recorrencia_padrao),
    v.dia_pagto_entrada is null,
    v.dia_pagto_recorrencia is null
  from vendedores v
  left join regionais r on r.id = v.regional_id
  where v.id = p_vendedor_id;
$$;

-- ----------------------------------------------------------------------------
-- Lista da tela de vendedores, ja com a franquia e o teto herdado.
-- ----------------------------------------------------------------------------
create or replace function listar_vendedores(p_regional_id uuid default null, p_busca text default null)
returns table (
  id                       uuid,
  nome                     text,
  email                    text,
  telefone                 text,
  codigo                   text,
  documento                text,
  regional_id              uuid,
  regional_nome            text,
  usuario_id               uuid,
  tem_portal               boolean,
  taxa_comissao_adesao     numeric,
  taxa_comissao_recorrente numeric,
  teto_adesao              numeric,
  teto_recorrente          numeric,
  dia_pagto_entrada        smallint,
  dia_pagto_recorrencia    smallint,
  banco                    text,
  agencia                  text,
  conta                    text,
  chave_pix                text,
  contrato_url             text,
  boas_vindas_enviada_em   timestamptz,
  observacoes              text,
  ativo                    boolean,
  vendas_total             integer,
  comissao_pendente        numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id, v.nome, v.email, v.telefone, v.codigo, v.documento,
    v.regional_id, r.nome,
    v.usuario_id, v.usuario_id is not null,
    v.taxa_comissao_adesao, v.taxa_comissao_recorrente,
    coalesce(r.taxa_comissao_adesao, 0), coalesce(r.taxa_comissao_recorrente, 0),
    coalesce(v.dia_pagto_entrada, r.dia_pagto_entrada_padrao),
    coalesce(v.dia_pagto_recorrencia, r.dia_pagto_recorrencia_padrao),
    v.banco, v.agencia, v.conta, v.chave_pix,
    v.contrato_url, v.boas_vindas_enviada_em, v.observacoes, v.ativo,
    (select count(*)::int from veiculos ve where ve.vendedor_id = v.id),
    (select coalesce(sum(c.valor_comissao), 0) from comissoes_vendas c
      where c.vendedor_id = v.id and c.status_pagamento = 'pendente')
  from vendedores v
  left join regionais r on r.id = v.regional_id
  where (p_regional_id is null or v.regional_id = p_regional_id)
    and (
      coalesce(p_busca, '') = ''
      or v.nome   ilike '%' || p_busca || '%'
      or v.codigo ilike '%' || p_busca || '%'
      or coalesce(v.email, '') ilike '%' || p_busca || '%'
    )
    and (tem_acesso_global() or pode_regional(v.regional_id))
  order by v.ativo desc, v.nome;
$$;

/** Vendedor pelo codigo do hotlink (usado na captura publica de lead). */
create or replace function vendedor_por_codigo(p_codigo text)
returns table (id uuid, nome text, regional_id uuid, ativo boolean)
language sql
stable
security definer
set search_path = public
as $$
  select id, nome, regional_id, ativo
    from vendedores
   where codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'))
     and ativo;
$$;

grant execute on function gerar_codigo_vendedor(text, uuid) to authenticated;
grant execute on function prazo_pagamento_vendedor(uuid) to authenticated;
grant execute on function listar_vendedores(uuid, text) to authenticated;
grant execute on function vendedor_por_codigo(text) to authenticated, anon;
