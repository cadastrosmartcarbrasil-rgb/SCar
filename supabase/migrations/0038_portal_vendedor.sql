-- ============================================================================
-- SCar :: 0038_portal_vendedor.sql
-- PORTAL DO VENDEDOR (/vendedor) — a area do proprio vendedor.
--
-- O que muda de postura em relacao aos outros portais
-- ---------------------------------------------------
-- No portal da franquia (0036/0037) o gestor pede a unidade e o banco FORCA a
-- dele. Aqui vamos um passo alem: as RPCs do vendedor **nao recebem id de
-- vendedor nenhum**. A identidade sai sempre de `vendedor_atual()`, que resolve
-- pelo `auth.uid()`. Nao existe parametro para pedir os dados de outra pessoa.
--
-- (A) `vendedor_atual()` — o vendedor logado (nulo para quem nao e vendedor).
-- (B) RLS de `leads` REVISTA. Ate aqui o vendedor nao tinha login, entao a
--     policy podia ser generosa: `pode_regional(regional_id)` dava a QUALQUER
--     staff da franquia — inclusive um consultor de vendas — a carteira inteira
--     da unidade. Dando login ao vendedor isso viraria vazamento: o vendedor A
--     leria os leads do vendedor B com uma consulta direta. Agora:
--       . admin/financeiro/auditoria/gestor_regional: seguem vendo a unidade;
--       . consultor_vendas: so o que e dele (consultor_id, created_by ou o
--         `vendedor_id` apontando para o seu cadastro).
--     O `vendedor_id` no OR e o que faz o lead do HOTLINK (criado pelo
--     service_role, sem consultor_id) aparecer para o dono do link.
-- (C) RPCs do portal: painel, leads, comissoes, perfil, novo lead e a edicao
--     dos proprios dados bancarios (subconjunto seguro: o vendedor nunca toca
--     na propria comissao, na regional nem no status).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Quem esta logado
-- ----------------------------------------------------------------------------
create or replace function vendedor_atual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from vendedores where usuario_id = auth.uid() and ativo limit 1;
$$;

comment on function vendedor_atual() is
  'Vendedor do usuario logado. Base de todo o portal /vendedor: as RPCs nao '
  'aceitam id de vendedor, entao nao ha como pedir os dados de outra pessoa.';

-- ----------------------------------------------------------------------------
-- (B) RLS dos leads: o consultor/vendedor passa a ver so a propria carteira
-- ----------------------------------------------------------------------------
create or replace function pode_ver_carteira_regional()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_papel()::text in ('admin', 'financeiro', 'gestor_regional', 'auditoria'), false);
$$;

drop policy if exists leads_select on leads;
drop policy if exists leads_update on leads;

create policy leads_select on leads for select to authenticated using (
  tem_acesso_global() or pode_auditar()
  or consultor_id = auth.uid() or created_by = auth.uid()
  or exists (select 1 from vendedores v
              where v.id = leads.vendedor_id and v.usuario_id = auth.uid())
  or (pode_ver_carteira_regional() and pode_regional(regional_id))
);

create policy leads_update on leads for update to authenticated using (
  tem_acesso_global() or pode_auditar()
  or consultor_id = auth.uid() or created_by = auth.uid()
  or exists (select 1 from vendedores v
              where v.id = leads.vendedor_id and v.usuario_id = auth.uid())
  or (pode_ver_carteira_regional() and pode_regional(regional_id))
);

-- ============================================================================
-- (C) RPCs do portal
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Painel: o mes do vendedor em numeros
-- ----------------------------------------------------------------------------
create or replace function vendedor_painel(
  p_inicio date,
  p_fim    date
)
returns table (
  vendedor_id        uuid,
  nome               text,
  codigo             text,
  regional_nome      text,
  leads_periodo      integer,
  leads_hotlink      integer,
  leads_convertidos  integer,
  leads_abertos      integer,
  taxa_conversao     numeric,
  veiculos_ativos    integer,
  comissao_periodo   numeric,
  comissao_pendente  numeric,
  comissao_paga      numeric,
  taxa_adesao        numeric,
  taxa_recorrente    numeric,
  dia_entrada        smallint,
  dia_recorrencia    smallint
)
language sql
stable
security definer
set search_path = public
as $$
  with eu as (select vendedor_atual() as id),
  v as (select * from vendedores where id = (select id from eu)),
  l as (
    select * from leads
     where vendedor_id = (select id from eu)
       and created_at::date between p_inicio and p_fim
  ),
  c as (
    select * from comissoes_vendas where vendedor_id = (select id from eu)
  ),
  cp as (
    select * from c where created_at::date between p_inicio and p_fim
  ),
  prazo as (select * from prazo_pagamento_vendedor((select id from eu)))
  select
    v.id,
    coalesce(v.nome, u.nome, 'Vendedor'),
    v.codigo,
    r.nome,
    (select count(*)::int from l),
    (select count(*)::int from l where origem_hotlink is not null),
    (select count(*)::int from l where status::text = 'ATIVO'),
    (select count(*)::int from l where status::text not in ('ATIVO', 'PERDIDO')),
    case when (select count(*) from l) = 0 then 0
         else round((select count(*) from l where status::text = 'ATIVO')::numeric
                    * 100 / (select count(*) from l), 1) end,
    (select count(*)::int from veiculos where vendedor_id = v.id and status::text = 'ativo'),
    coalesce((select sum(valor_comissao) from cp), 0),
    coalesce((select sum(valor_comissao) from c where status_pagamento = 'pendente'), 0),
    coalesce((select sum(valor_comissao) from cp where status_pagamento = 'pago'), 0),
    v.taxa_comissao_adesao,
    v.taxa_comissao_recorrente,
    (select dia_entrada from prazo),
    (select dia_recorrencia from prazo)
  from v
  left join usuarios  u on u.id = v.usuario_id
  left join regionais r on r.id = v.regional_id;
$$;

-- ----------------------------------------------------------------------------
-- Meus leads
-- ----------------------------------------------------------------------------
create or replace function vendedor_leads(
  p_status text default null,
  p_busca  text default null,
  p_limite integer default 200
)
returns table (
  id             uuid,
  nome           text,
  celular        text,
  email          text,
  placa          text,
  marca          text,
  modelo         text,
  valor_fipe     numeric,
  status         text,
  origem_hotlink text,
  perdido_motivo text,
  veiculo_id     uuid,
  created_at     timestamptz,
  updated_at     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with eu as (select vendedor_atual() as id)
  select l.id, l.nome, l.celular, l.email, l.placa, l.marca, l.modelo,
         l.valor_fipe, l.status::text, l.origem_hotlink, l.perdido_motivo,
         l.veiculo_id, l.created_at, l.updated_at
    from leads l
   where l.vendedor_id = (select id from eu)
     and (select id from eu) is not null
     and (p_status is null or l.status::text = upper(p_status))
     and (
       p_busca is null or trim(p_busca) = ''
       or l.nome    ilike '%' || trim(p_busca) || '%'
       or l.celular ilike '%' || trim(p_busca) || '%'
       or l.placa   ilike '%' || trim(p_busca) || '%'
     )
   order by l.created_at desc
   limit greatest(coalesce(p_limite, 200), 1);
$$;

-- ----------------------------------------------------------------------------
-- Minhas comissoes
-- ----------------------------------------------------------------------------
create or replace function vendedor_comissoes(
  p_status text default null,
  p_inicio date default null,
  p_fim    date default null
)
returns table (
  id               uuid,
  placa            text,
  associado        text,
  is_adesao        boolean,
  valor_comissao   numeric,
  status_pagamento text,
  created_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with eu as (select vendedor_atual() as id)
  select c.id, ve.placa, cl.nome_razao_social, c.is_adesao, c.valor_comissao,
         c.status_pagamento::text, c.created_at
    from comissoes_vendas c
    left join veiculos ve on ve.id = c.veiculo_id
    left join clientes cl on cl.id = ve.cliente_id
   where c.vendedor_id = (select id from eu)
     and (select id from eu) is not null
     and (p_status is null or c.status_pagamento::text = p_status)
     and (p_inicio is null or c.created_at::date >= p_inicio)
     and (p_fim    is null or c.created_at::date <= p_fim)
   order by c.created_at desc;
$$;

-- ----------------------------------------------------------------------------
-- Meu cadastro (o que o vendedor pode ver de si mesmo)
-- ----------------------------------------------------------------------------
create or replace function vendedor_perfil()
returns table (
  id                    uuid,
  nome                  text,
  email                 text,
  telefone              text,
  documento             text,
  codigo                text,
  regional_nome         text,
  banco                 text,
  agencia               text,
  conta                 text,
  chave_pix             text,
  taxa_adesao           numeric,
  taxa_recorrente       numeric,
  teto_adesao           numeric,
  teto_recorrente       numeric,
  dia_entrada           smallint,
  dia_recorrencia       smallint,
  entrada_herdada       boolean,
  recorrencia_herdada   boolean,
  contrato_url          text,
  boas_vindas_enviada_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with eu as (select vendedor_atual() as id),
  prazo as (select * from prazo_pagamento_vendedor((select id from eu)))
  select v.id, coalesce(v.nome, u.nome), coalesce(v.email, u.email), v.telefone,
         v.documento, v.codigo, r.nome,
         v.banco, v.agencia, v.conta, v.chave_pix,
         v.taxa_comissao_adesao, v.taxa_comissao_recorrente,
         r.taxa_comissao_adesao, r.taxa_comissao_recorrente,
         (select dia_entrada from prazo), (select dia_recorrencia from prazo),
         (select entrada_herdada from prazo), (select recorrencia_herdada from prazo),
         v.contrato_url, v.boas_vindas_enviada_em
    from vendedores v
    left join usuarios  u on u.id = v.usuario_id
    left join regionais r on r.id = v.regional_id
   where v.id = (select id from eu);
$$;

-- ----------------------------------------------------------------------------
-- Novo lead pelo portal — nasce amarrado a quem cadastrou
-- ----------------------------------------------------------------------------
create or replace function vendedor_criar_lead(
  p_nome       text,
  p_celular    text,
  p_email      text default null,
  p_placa      text default null,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid := vendedor_atual();
  v_reg uuid;
  v_lead uuid;
begin
  if v_id is null then
    raise exception 'Somente um vendedor ativo pode cadastrar lead pelo portal'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome do interessado' using errcode = 'check_violation';
  end if;
  if length(regexp_replace(coalesce(p_celular, ''), '[^0-9]', '', 'g')) < 10 then
    raise exception 'Informe um celular valido com DDD' using errcode = 'check_violation';
  end if;

  select regional_id into v_reg from vendedores where id = v_id;

  insert into leads (nome, celular, email, placa, regional_id, vendedor_id,
                     consultor_id, created_by, observacoes, status)
  values (trim(p_nome), trim(p_celular), nullif(trim(coalesce(p_email, '')), ''),
          upper(nullif(trim(coalesce(p_placa, '')), '')), v_reg, v_id,
          auth.uid(), auth.uid(), nullif(trim(coalesce(p_observacao, '')), ''), 'NOVO')
  returning id into v_lead;

  return v_lead;
end;
$$;

-- ----------------------------------------------------------------------------
-- Editar os proprios dados de contato e recebimento.
-- Subconjunto seguro: comissao, regional e status NAO sao parametros — logo
-- nao ha como o vendedor aumentar a propria comissao por aqui.
-- ----------------------------------------------------------------------------
create or replace function vendedor_atualizar_perfil(
  p_telefone  text default null,
  p_banco     text default null,
  p_agencia   text default null,
  p_conta     text default null,
  p_chave_pix text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := vendedor_atual();
begin
  if v_id is null then
    raise exception 'Sem cadastro de vendedor ativo' using errcode = 'insufficient_privilege';
  end if;

  update vendedores
     set telefone  = nullif(trim(coalesce(p_telefone, '')), ''),
         banco     = nullif(trim(coalesce(p_banco, '')), ''),
         agencia   = nullif(trim(coalesce(p_agencia, '')), ''),
         conta     = nullif(trim(coalesce(p_conta, '')), ''),
         chave_pix = nullif(trim(coalesce(p_chave_pix, '')), '')
   where id = v_id;
end;
$$;

grant execute on function vendedor_atual() to authenticated;
grant execute on function pode_ver_carteira_regional() to authenticated;
grant execute on function vendedor_painel(date, date) to authenticated;
grant execute on function vendedor_leads(text, text, integer) to authenticated;
grant execute on function vendedor_comissoes(text, date, date) to authenticated;
grant execute on function vendedor_perfil() to authenticated;
grant execute on function vendedor_criar_lead(text, text, text, text, text) to authenticated;
grant execute on function vendedor_atualizar_perfil(text, text, text, text, text) to authenticated;
