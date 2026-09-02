-- ============================================================================
-- SCar :: 0044_portal_associado.sql
-- PORTAL DO ASSOCIADO — perfil, frota, situacao financeira e cartao de credito.
--
-- Postura de acesso (a mesma do portal do vendedor, 0038)
-- -------------------------------------------------------
-- Nenhuma RPC daqui recebe `cliente_id`: a identidade sai de `auth_cliente_id()`,
-- resolvida pelo login. Nao existe parametro para pedir os dados de outra
-- pessoa — o isolamento nao depende da tela.
--
-- (A) PRIMEIRO ACESSO. O associado entra com o CPF/CNPJ e, na primeira vez, a
--     senha e o proprio documento. Isso e conveniente e inseguro em partes
--     iguais, entao a senha nasce marcada como PROVISORIA e o portal exige a
--     troca antes de mostrar qualquer dado.
--
-- (B) CARTAO DE CREDITO. **Nunca guardamos o numero do cartao nem o CVV.** O
--     numero vai do navegador para o gateway (Asaas), que devolve um TOKEN; o
--     que fica aqui e o token, a bandeira e os 4 ultimos digitos — o suficiente
--     para cobrar e para o associado reconhecer o cartao na tela. Guardar PAN
--     exigiria certificacao PCI-DSS e nao ha motivo para isso.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Estado do acesso ao portal
-- ----------------------------------------------------------------------------
alter table clientes
  add column if not exists portal_senha_provisoria   boolean not null default false,
  add column if not exists portal_primeiro_acesso_em timestamptz,
  add column if not exists portal_senha_alterada_em  timestamptz,
  add column if not exists portal_ultimo_acesso_em   timestamptz;

comment on column clientes.portal_senha_provisoria is
  'true enquanto a senha for o CPF/CNPJ do primeiro acesso: o portal obriga a troca.';

-- ----------------------------------------------------------------------------
-- (B) Cartao tokenizado — NUNCA o numero
-- ----------------------------------------------------------------------------
create table if not exists cartoes_cobranca (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references clientes(id) on delete cascade,
  gateway         text not null default 'ASAAS',
  token           text not null,
  bandeira        text,
  ultimos_digitos text,
  nome_portador   text,
  validade_mes    smallint,
  validade_ano    smallint,
  principal       boolean not null default true,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table cartoes_cobranca is
  'Cartao do associado para debito da mensalidade. Guarda o TOKEN do gateway, '
  'a bandeira e os 4 ultimos digitos — nunca o numero completo nem o CVV.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_cartao_digitos') then
    alter table cartoes_cobranca add constraint chk_cartao_digitos check (
      (ultimos_digitos is null or ultimos_digitos ~ '^[0-9]{4}$')
      and (validade_mes is null or validade_mes between 1 and 12)
      and (validade_ano is null or validade_ano between 2000 and 2100)
    );
  end if;
end $$;

create index if not exists idx_cartoes_cliente on cartoes_cobranca (cliente_id) where ativo;
-- um cartao principal por associado
create unique index if not exists uq_cartao_principal
  on cartoes_cobranca (cliente_id) where principal and ativo;

drop trigger if exists trg_cartoes_updated on cartoes_cobranca;
create trigger trg_cartoes_updated before update on cartoes_cobranca
  for each row execute function set_updated_at();

alter table cartoes_cobranca enable row level security;

drop policy if exists cartao_select on cartoes_cobranca;
drop policy if exists cartao_write  on cartoes_cobranca;

-- O dono ve e mexe no proprio cartao; o financeiro ve (para conciliar cobranca)
-- mas o que existe aqui ja e so token/bandeira/4 digitos.
create policy cartao_select on cartoes_cobranca for select to authenticated using (
  cliente_id = auth_cliente_id() or tem_acesso_global()
);
create policy cartao_write on cartoes_cobranca for all to authenticated using (
  cliente_id = auth_cliente_id()
) with check (
  cliente_id = auth_cliente_id()
);

grant select, insert, update, delete on cartoes_cobranca to authenticated;

-- ============================================================================
-- (C) RPCs do portal — sem parametro de cliente
-- ============================================================================

/** Dados do proprio associado, incluindo o estado do primeiro acesso. */
create or replace function portal_perfil()
returns table (
  cliente_id        uuid,
  nome              text,
  cpf_cnpj          text,
  tipo_pessoa       text,
  email             text,
  telefone          text,
  endereco          jsonb,
  status            text,
  senha_provisoria  boolean,
  primeiro_acesso_em timestamptz,
  veiculos_ativos   integer,
  associado_desde   date
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.nome_razao_social, c.cpf_cnpj, c.tipo_pessoa::text, c.email, c.telefone,
         c.endereco, c.status::text,
         c.portal_senha_provisoria, c.portal_primeiro_acesso_em,
         (select count(*)::int from veiculos v
           where v.cliente_id = c.id and v.status::text = 'ativo'),
         (select min(v.data_ativacao) from veiculos v where v.cliente_id = c.id)
    from clientes c
   where c.id = auth_cliente_id();
$$;

/** A frota do associado, na ordenacao padrao do sistema (0030). */
create or replace function portal_veiculos()
returns table (
  id             uuid,
  placa          text,
  marca          text,
  modelo         text,
  ano_modelo     integer,
  status         text,
  data_ativacao  date,
  plano_nome     text,
  mensalidade    numeric,
  dia_vencimento smallint
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.placa, v.marca, v.modelo, v.ano_modelo, v.status::text, v.data_ativacao,
         p.nome, valor_mensalidade_veiculo(v.id), v.dia_vencimento
    from veiculos v
    left join planos_protecao p on p.id = v.plano_protecao_id
   where v.cliente_id = auth_cliente_id()
     and v.status::text <> 'excluido'
   order by ordem_status_veiculo(v.status), v.data_ativacao desc nulls last, v.placa;
$$;

/**
 * TODOS os boletos do associado — pagos, a vencer e vencidos. A tela nao filtra
 * nada por padrao: o associado quer ver o historico inteiro.
 */
create or replace function portal_titulos(p_limite integer default 60)
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
  situacao        text,
  dias_atraso     integer,
  linha_digitavel text,
  url_boleto      text,
  pix_copia_cola  text
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.veiculo_id, ve.placa, f.competencia, t.data_vencimento,
         t.valor, t.valor_pago, t.data_pagamento, t.status::text,
         status_cobranca_efetivo(t.status, t.data_vencimento),
         case when t.status::text in ('pendente','vencido') and t.data_vencimento < current_date
              then (current_date - t.data_vencimento)::int else 0 end,
         t.linha_digitavel, t.url_boleto, t.pix_copia_cola
    from titulos_financeiros t
    left join veiculos ve on ve.id = t.veiculo_id
    left join faturas f on f.titulo_id = t.id
   where t.cliente_id = auth_cliente_id()
     and t.status::text <> 'cancelado'
   order by t.data_vencimento desc
   limit greatest(coalesce(p_limite, 60), 1);
$$;

/** Situacao financeira em numeros, para o cabecalho da tela. */
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
    select * from titulos_financeiros
     where cliente_id = auth_cliente_id() and status::text <> 'cancelado'
  ),
  abertos as (
    select * from t where status::text in ('pendente', 'vencido')
  )
  select
    coalesce((select sum(valor) from abertos), 0),
    coalesce((select sum(valor) from abertos where data_vencimento < current_date), 0),
    (select count(*)::int from abertos where data_vencimento < current_date),
    (select min(data_vencimento) from abertos where data_vencimento >= current_date),
    (select valor from abertos where data_vencimento >= current_date
      order by data_vencimento limit 1),
    coalesce((select sum(valor_pago) from t
               where status::text = 'pago' and data_pagamento >= current_date - interval '12 months'), 0),
    not exists (select 1 from abertos where data_vencimento < current_date);
$$;

/**
 * 2a via: devolve os dados de pagamento de um titulo DO PROPRIO associado.
 * Nao reemite nada por conta propria — se o gateway ainda nao devolveu a linha
 * digitavel, diz isso em vez de inventar um boleto.
 */
create or replace function portal_segunda_via(p_titulo_id uuid)
returns table (
  id              uuid,
  data_vencimento date,
  valor           numeric,
  linha_digitavel text,
  url_boleto      text,
  pix_copia_cola  text,
  disponivel      boolean,
  aviso           text
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.data_vencimento, t.valor, t.linha_digitavel, t.url_boleto, t.pix_copia_cola,
         (coalesce(t.linha_digitavel, t.url_boleto, t.pix_copia_cola) is not null),
         case
           when t.status::text = 'pago' then 'Este boleto ja consta como pago.'
           when coalesce(t.linha_digitavel, t.url_boleto, t.pix_copia_cola) is null
             then 'O boleto ainda esta sendo gerado pelo banco. Tente em alguns minutos ou fale com o atendimento.'
           else null
         end
    from titulos_financeiros t
   where t.id = p_titulo_id
     and t.cliente_id = auth_cliente_id();
$$;

/** Contato e endereco do proprio associado (subconjunto seguro). */
create or replace function portal_atualizar_perfil(
  p_email    text default null,
  p_telefone text default null,
  p_endereco jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := auth_cliente_id();
begin
  if v_id is null then
    raise exception 'Sem cadastro de associado' using errcode = 'insufficient_privilege';
  end if;

  -- Nome, CPF/CNPJ, status e regional NAO sao parametros: mudar isso e da
  -- associacao, nao do associado.
  update clientes
     set email    = coalesce(nullif(trim(coalesce(p_email, '')), ''), email),
         telefone = coalesce(nullif(trim(coalesce(p_telefone, '')), ''), telefone),
         endereco = coalesce(p_endereco, endereco)
   where id = v_id;
end;
$$;

/** Marca que a senha provisoria foi trocada (chamado apos o update no Auth). */
create or replace function portal_senha_trocada()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := auth_cliente_id();
begin
  if v_id is null then
    raise exception 'Sem cadastro de associado' using errcode = 'insufficient_privilege';
  end if;
  update clientes
     set portal_senha_provisoria  = false,
         portal_senha_alterada_em = now()
   where id = v_id;
end;
$$;

/** Carimba o acesso (o primeiro fica registrado separado). */
create or replace function portal_registrar_acesso()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := auth_cliente_id();
begin
  if v_id is null then return; end if;
  update clientes
     set portal_ultimo_acesso_em   = now(),
         portal_primeiro_acesso_em = coalesce(portal_primeiro_acesso_em, now())
   where id = v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Cartao: leitura e escrita pelo proprio associado
-- ----------------------------------------------------------------------------
create or replace function portal_cartoes()
returns table (
  id              uuid,
  bandeira        text,
  ultimos_digitos text,
  nome_portador   text,
  validade_mes    smallint,
  validade_ano    smallint,
  principal       boolean,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.bandeira, c.ultimos_digitos, c.nome_portador,
         c.validade_mes, c.validade_ano, c.principal, c.created_at
    from cartoes_cobranca c
   where c.cliente_id = auth_cliente_id()
     and c.ativo
   order by c.principal desc, c.created_at desc;
$$;

/**
 * Guarda o cartao JA TOKENIZADO pelo gateway.
 * Os parametros dizem tudo: entra token, bandeira e 4 digitos — nao existe
 * parametro para o numero do cartao nem para o CVV, entao nao ha como eles
 * chegarem ao banco nem por engano.
 */
create or replace function portal_registrar_cartao(
  p_token           text,
  p_bandeira        text default null,
  p_ultimos_digitos text default null,
  p_nome_portador   text default null,
  p_validade_mes    smallint default null,
  p_validade_ano    smallint default null,
  p_gateway         text default 'ASAAS'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid := auth_cliente_id();
  v_new uuid;
begin
  if v_id is null then
    raise exception 'Sem cadastro de associado' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_token), '') = '' then
    raise exception 'Cartao nao autorizado pelo banco' using errcode = 'check_violation';
  end if;

  -- O novo cartao vira o principal; o anterior deixa de ser (o indice unico
  -- parcial garante que so exista um).
  update cartoes_cobranca set principal = false
   where cliente_id = v_id and principal and ativo;

  insert into cartoes_cobranca
    (cliente_id, gateway, token, bandeira, ultimos_digitos, nome_portador,
     validade_mes, validade_ano, principal)
  values (v_id, upper(coalesce(p_gateway, 'ASAAS')), trim(p_token),
          nullif(trim(coalesce(p_bandeira, '')), ''),
          nullif(trim(coalesce(p_ultimos_digitos, '')), ''),
          nullif(trim(coalesce(p_nome_portador, '')), ''),
          p_validade_mes, p_validade_ano, true)
  returning id into v_new;

  return v_new;
end;
$$;

/** Remove o cartao (mantem a linha inativa: o historico de cobranca aponta para ela). */
create or replace function portal_remover_cartao(p_cartao_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := auth_cliente_id();
begin
  if v_id is null then
    raise exception 'Sem cadastro de associado' using errcode = 'insufficient_privilege';
  end if;

  update cartoes_cobranca
     set ativo = false, principal = false
   where id = p_cartao_id and cliente_id = v_id;

  if not found then
    raise exception 'Cartao nao encontrado' using errcode = 'check_violation';
  end if;
end;
$$;

grant execute on function portal_perfil() to authenticated;
grant execute on function portal_veiculos() to authenticated;
grant execute on function portal_titulos(integer) to authenticated;
grant execute on function portal_financeiro() to authenticated;
grant execute on function portal_segunda_via(uuid) to authenticated;
grant execute on function portal_atualizar_perfil(text, text, jsonb) to authenticated;
grant execute on function portal_senha_trocada() to authenticated;
grant execute on function portal_registrar_acesso() to authenticated;
grant execute on function portal_cartoes() to authenticated;
grant execute on function portal_registrar_cartao(text, text, text, text, smallint, smallint, text) to authenticated;
grant execute on function portal_remover_cartao(uuid) to authenticated;
