-- ============================================================================
-- 0179 — DESCONTO NA MENSALIDADE DO VEICULO QUE JA ESTA NA BASE
-- ----------------------------------------------------------------------------
-- A 0178 levou o desconto aprovado da PROPOSTA para o veiculo
-- (`veiculos.desconto_mensalidade/_ate`) e abateu nas faturas. Mas para o
-- veiculo que JA estava na base nao havia caminho: o desconto so existia
-- boleto a boleto (edicao do titulo), e o proximo lote saia cheio de novo.
--
-- Agora:
--  (A) `veiculo_desconto_pedidos` — o pedido de desconto do veiculo, com a
--      mesma regra da proposta: % ou R$/mes, dentro do limite da unidade,
--      "valido ate" (vencimento) e justificativa; PENDENTE ate a diretoria
--      (`pode_aprovar_desconto`) aprovar. Quem aprova grava ja APROVADO.
--  (B) aprovado, o desconto vai para o veiculo e o trigger da 0178 reaplica
--      nas faturas abertas sem boleto; o lote seguinte ja nasce com ele.
--  (C) a TRAVA: `veiculos.desconto_mensalidade/_ate` so mudam pela RPC, pela
--      venda aprovada (0178) ou por quem aprova — o UPDATE direto da ficha
--      (RLS de veiculos libera a linha inteira) e recusado.
--  (D) retirar o desconto nao precisa de aprovacao (o associado paga mais),
--      mas fica registrado com motivo.
--  (E) a fila `descontos_pendentes` ganha a origem VEICULO.
-- Nenhum veiculo muda ao aplicar.
-- ============================================================================

-- (A) o pedido -------------------------------------------------------------------
create table if not exists veiculo_desconto_pedidos (
  id               uuid primary key default gen_random_uuid(),
  veiculo_id       uuid not null references veiculos(id) on delete cascade,
  tipo             text not null,
  valor_informado  numeric(12,2) not null default 0,
  mensalidade_base numeric(12,2) not null default 0,
  desconto         numeric(12,2) not null default 0,
  percentual       numeric(6,2)  not null default 0,
  valido_ate       date,
  justificativa    text,
  situacao         text not null default 'PENDENTE',
  solicitado_por   uuid references usuarios(id) on delete set null,
  solicitado_em    timestamptz not null default now(),
  decidido_por     uuid references usuarios(id) on delete set null,
  decidido_em      timestamptz,
  decisao_motivo   text,
  constraint chk_veic_desc_tipo check (tipo in ('PERCENTUAL', 'VALOR', 'REMOCAO')),
  constraint chk_veic_desc_situacao check (situacao in ('PENDENTE', 'APROVADO', 'RECUSADO', 'CANCELADO', 'REMOVIDO')),
  constraint chk_veic_desc_valor check (desconto >= 0 and valor_informado >= 0)
);

create unique index if not exists uq_veic_desc_pendente
  on veiculo_desconto_pedidos (veiculo_id) where situacao = 'PENDENTE';
create index if not exists idx_veic_desc_veiculo on veiculo_desconto_pedidos (veiculo_id, solicitado_em desc);

alter table veiculo_desconto_pedidos enable row level security;
drop policy if exists veic_desc_select on veiculo_desconto_pedidos;
create policy veic_desc_select on veiculo_desconto_pedidos
  for select to authenticated
  using (exists (select 1 from veiculos v where v.id = veiculo_id));   -- quem ve o veiculo (RLS dele)
-- escrita so pelas RPCs (security definer).

comment on table veiculo_desconto_pedidos is
  '0179: pedido de desconto na mensalidade do veiculo da base; vale depois de aprovado pela diretoria.';

-- (C) a trava ----------------------------------------------------------------------
create or replace function fn_veiculo_desconto_guarda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.desconto_mensalidade is not distinct from old.desconto_mensalidade
     and new.desconto_mensalidade_ate is not distinct from old.desconto_mensalidade_ate then
    return new;
  end if;
  if tg_op = 'INSERT' and coalesce(new.desconto_mensalidade, 0) = 0 then
    return new;
  end if;
  if coalesce(current_setting('scar.desconto_veiculo', true), '') = 'on'
     or auth.uid() is null
     or pode_aprovar_desconto() then
    return new;
  end if;
  raise exception 'DESCONTO_SEM_APROVACAO: o desconto do veiculo so muda pelo pedido aprovado pela diretoria'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_veiculo_desconto_guarda on veiculos;
create trigger trg_veiculo_desconto_guarda
  before insert or update of desconto_mensalidade, desconto_mensalidade_ate on veiculos
  for each row execute function fn_veiculo_desconto_guarda();

-- A venda aprovada (0178) continua levando o desconto ao veiculo: libera a trava.
create or replace function fn_lead_desconto_veiculo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c cotacoes;
begin
  if new.veiculo_id is null or new.veiculo_id is not distinct from old.veiculo_id then
    return new;
  end if;
  select * into c from cotacoes
   where lead_id = new.id
   order by (id = new.aceite_cotacao_id) desc, created_at desc, id desc
   limit 1;
  if c.id is not null and c.desconto_situacao = 'APROVADO' and coalesce(c.desconto_valor_mensalidade, 0) > 0 then
    perform set_config('scar.desconto_veiculo', 'on', true);
    update veiculos
       set desconto_mensalidade     = c.desconto_valor_mensalidade,
           desconto_mensalidade_ate = c.desconto_valido_ate,
           desconto_cotacao_id      = c.id
     where id = new.veiculo_id;
    perform set_config('scar.desconto_veiculo', 'off', true);
  end if;
  return new;
end;
$$;

-- grava no veiculo (uso interno das RPCs)
create or replace function aplicar_desconto_veiculo(p_veiculo_id uuid, p_desconto numeric, p_valido_ate date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not pode_aprovar_desconto()
     and coalesce(current_setting('scar.desconto_veiculo', true), '') <> 'on' then
    raise exception 'Somente a diretoria aplica desconto no veiculo' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('scar.desconto_veiculo', 'on', true);
  update veiculos
     set desconto_mensalidade     = round(coalesce(p_desconto, 0), 2),
         desconto_mensalidade_ate = case when coalesce(p_desconto, 0) > 0 then p_valido_ate end,
         desconto_cotacao_id      = null
   where id = p_veiculo_id;
  perform set_config('scar.desconto_veiculo', 'off', true);
end;
$$;

-- (A/B) pedir ----------------------------------------------------------------------
create or replace function solicitar_desconto_veiculo(
  p_veiculo_id    uuid,
  p_tipo          text,
  p_valor         numeric,
  p_valido_ate    date default null,
  p_justificativa text default null
)
returns veiculo_desconto_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v        veiculos;
  p        veiculo_desconto_pedidos;
  v_base   numeric;
  v_desc   numeric;
  v_pct    numeric;
  v_limite numeric;
  v_just   text := nullif(btrim(coalesce(p_justificativa, '')), '');
  v_eu     uuid := usuario_atual_id();
  v_aprova boolean := pode_aprovar_desconto();
begin
  if not is_staff() then
    raise exception 'Acesso negado' using errcode = 'insufficient_privilege';
  end if;
  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null or not pode_regional(v.regional_id) then
    raise exception 'Veiculo nao encontrado na sua unidade' using errcode = 'no_data_found';
  end if;
  if p_tipo not in ('PERCENTUAL', 'VALOR') then
    raise exception 'Tipo de desconto invalido' using errcode = 'check_violation';
  end if;
  if coalesce(p_valor, 0) <= 0 then
    raise exception 'Informe o valor do desconto (para retirar, use Retirar desconto)' using errcode = 'check_violation';
  end if;
  if v_just is null then
    raise exception 'A justificativa do desconto e obrigatoria' using errcode = 'check_violation';
  end if;
  if p_valido_ate is not null and p_valido_ate < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A validade nao pode estar no passado' using errcode = 'check_violation';
  end if;

  v_base := valor_mensalidade_veiculo(v.id);
  if coalesce(v_base, 0) <= 0 then
    raise exception 'O veiculo nao tem mensalidade definida para aplicar desconto' using errcode = 'check_violation';
  end if;
  if p_tipo = 'VALOR' then
    v_desc := round(least(p_valor, v_base), 2);
    v_pct  := round(v_desc * 100 / v_base, 2);
  else
    v_pct  := round(least(p_valor, 100), 2);
    v_desc := round(v_base * v_pct / 100, 2);
  end if;
  v_limite := limite_desconto_regional(coalesce(v.regional_preco_id, v.regional_id));
  if v_pct > coalesce(v_limite, 0) then
    raise exception 'DESCONTO_ACIMA_DO_LIMITE: % %% passa o limite da unidade (% %%)', v_pct, coalesce(v_limite, 0)
      using errcode = 'check_violation';
  end if;

  -- um pedido aberto por veiculo: o novo substitui o anterior
  update veiculo_desconto_pedidos
     set situacao = 'CANCELADO', decidido_por = v_eu, decidido_em = now(),
         decisao_motivo = 'Substituido por novo pedido'
   where veiculo_id = v.id and situacao = 'PENDENTE';

  insert into veiculo_desconto_pedidos (veiculo_id, tipo, valor_informado, mensalidade_base, desconto, percentual,
                                        valido_ate, justificativa, situacao, solicitado_por,
                                        decidido_por, decidido_em)
  values (v.id, p_tipo, p_valor, v_base, v_desc, v_pct, p_valido_ate, v_just,
          case when v_aprova then 'APROVADO' else 'PENDENTE' end, v_eu,
          case when v_aprova then v_eu end, case when v_aprova then now() end)
  returning * into p;

  if v_aprova then
    perform aplicar_desconto_veiculo(v.id, v_desc, p_valido_ate);
  end if;
  return p;
end;
$$;

-- (D) retirar ----------------------------------------------------------------------
create or replace function remover_desconto_veiculo(p_veiculo_id uuid, p_motivo text)
returns veiculo_desconto_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v    veiculos;
  p    veiculo_desconto_pedidos;
  v_eu uuid := usuario_atual_id();
  v_m  text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not is_staff() then
    raise exception 'Acesso negado' using errcode = 'insufficient_privilege';
  end if;
  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null or not pode_regional(v.regional_id) then
    raise exception 'Veiculo nao encontrado na sua unidade' using errcode = 'no_data_found';
  end if;
  if v_m is null or length(v_m) < 3 then
    raise exception 'Informe o motivo para retirar o desconto' using errcode = 'check_violation';
  end if;

  update veiculo_desconto_pedidos
     set situacao = 'CANCELADO', decidido_por = v_eu, decidido_em = now(), decisao_motivo = 'Desconto retirado'
   where veiculo_id = v.id and situacao = 'PENDENTE';

  insert into veiculo_desconto_pedidos (veiculo_id, tipo, mensalidade_base, desconto, justificativa, situacao,
                                        solicitado_por, decidido_por, decidido_em)
  values (v.id, 'REMOCAO', valor_mensalidade_veiculo(v.id), coalesce(v.desconto_mensalidade, 0), v_m, 'REMOVIDO',
          v_eu, v_eu, now())
  returning * into p;

  perform set_config('scar.desconto_veiculo', 'on', true);
  perform aplicar_desconto_veiculo(v.id, 0, null);
  return p;
end;
$$;

-- decidir --------------------------------------------------------------------------
create or replace function decidir_desconto_veiculo(p_pedido_id uuid, p_aprovar boolean, p_motivo text default null)
returns veiculo_desconto_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  p veiculo_desconto_pedidos;
begin
  if not pode_aprovar_desconto() then
    raise exception 'Somente a diretoria aprova desconto' using errcode = 'insufficient_privilege';
  end if;
  select * into p from veiculo_desconto_pedidos where id = p_pedido_id for update;
  if p.id is null or p.situacao <> 'PENDENTE' then
    raise exception 'Pedido nao encontrado ou ja decidido' using errcode = 'no_data_found';
  end if;
  if not p_aprovar and length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo da recusa' using errcode = 'check_violation';
  end if;

  update veiculo_desconto_pedidos
     set situacao = case when p_aprovar then 'APROVADO' else 'RECUSADO' end,
         decidido_por = usuario_atual_id(), decidido_em = now(),
         decisao_motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = p.id
  returning * into p;

  if p_aprovar then
    perform aplicar_desconto_veiculo(p.veiculo_id, p.desconto, p.valido_ate);
  end if;
  return p;
end;
$$;

-- leitura para a ficha ---------------------------------------------------------------
create or replace function descontos_do_veiculo(p_veiculo_id uuid)
returns table (
  id uuid, tipo text, valor_informado numeric, mensalidade_base numeric, desconto numeric, percentual numeric,
  valido_ate date, justificativa text, situacao text, solicitado_por text, solicitado_em timestamptz,
  decidido_por text, decidido_em timestamptz, decisao_motivo text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.tipo, p.valor_informado, p.mensalidade_base, p.desconto, p.percentual, p.valido_ate,
         p.justificativa, p.situacao, us.nome, p.solicitado_em, ud.nome, p.decidido_em, p.decisao_motivo
    from veiculo_desconto_pedidos p
    join veiculos v on v.id = p.veiculo_id
    left join usuarios us on us.id = p.solicitado_por
    left join usuarios ud on ud.id = p.decidido_por
   where p.veiculo_id = p_veiculo_id and is_staff() and pode_regional(v.regional_id)
   order by p.solicitado_em desc, p.id desc
   limit 30;
$$;

-- (E) a fila da diretoria ----------------------------------------------------------
create or replace function descontos_pendentes()
returns table (
  origem         text,
  id             uuid,
  lead_id        uuid,
  titulo_id      uuid,
  cliente_id     uuid,
  nome           text,
  placa          text,
  regional       text,
  valor_tabela   numeric,
  desconto       numeric,
  percentual     numeric,
  valor_final    numeric,
  valido_ate     date,
  vencimento     date,
  justificativa  text,
  solicitado_por text,
  solicitado_em  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select 'COTACAO', c.id, c.lead_id, null::uuid, l.cliente_existente_id,
         l.nome, l.placa, r.nome,
         c.total_mensalidade, c.desconto_valor_mensalidade, c.desconto_percentual,
         round(c.total_mensalidade - c.desconto_valor_mensalidade, 2),
         c.desconto_valido_ate, null::date, c.desconto_justificativa,
         u.nome, c.desconto_solicitado_em
    from cotacoes c
    join leads l on l.id = c.lead_id
    left join regionais r on r.id = l.regional_id
    left join usuarios u on u.id = c.desconto_solicitado_por
   where pode_aprovar_desconto() and c.desconto_situacao = 'PENDENTE'
  union all
  select 'TITULO', p.id, null::uuid, p.titulo_id, p.cliente_id,
         cl.nome_razao_social, ve.placa, r.nome,
         p.valor_original, p.desconto,
         case when p.valor_original > 0 then round(p.desconto * 100 / p.valor_original, 2) else 0 end,
         round(p.valor_original - p.desconto, 2),
         null::date, t.data_vencimento, p.motivo,
         u.nome, p.solicitado_em
    from titulo_desconto_pedidos p
    join titulos_financeiros t on t.id = p.titulo_id
    left join clientes cl on cl.id = p.cliente_id
    left join veiculos ve on ve.id = t.veiculo_id
    left join regionais r on r.id = cl.regional_id
    left join usuarios u on u.id = p.solicitado_por
   where pode_aprovar_desconto() and p.situacao = 'PENDENTE'
  union all
  select 'VEICULO', p.id, null::uuid, null::uuid, ve.cliente_id,
         cl.nome_razao_social, ve.placa, r.nome,
         p.mensalidade_base, p.desconto, p.percentual,
         round(p.mensalidade_base - p.desconto, 2),
         p.valido_ate, null::date, p.justificativa,
         u.nome, p.solicitado_em
    from veiculo_desconto_pedidos p
    join veiculos ve on ve.id = p.veiculo_id
    left join clientes cl on cl.id = ve.cliente_id
    left join regionais r on r.id = ve.regional_id
    left join usuarios u on u.id = p.solicitado_por
   where pode_aprovar_desconto() and p.situacao = 'PENDENTE'
   order by 17;
$$;

create or replace function descontos_pendentes_contagem()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when not pode_aprovar_desconto() then 0 else
    (select count(*)::int from cotacoes where desconto_situacao = 'PENDENTE')
    + (select count(*)::int from titulo_desconto_pedidos where situacao = 'PENDENTE')
    + (select count(*)::int from veiculo_desconto_pedidos where situacao = 'PENDENTE') end;
$$;

-- rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
