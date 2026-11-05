-- ============================================================================
-- 0180 — FIPE E COTA DECIDIDAS PELO SERVIDOR; ADESAO PRATICADA COM AUDITORIA
-- ----------------------------------------------------------------------------
-- Pedido do usuario (05/11/2026, revisao do Cowork): na tela de vendas, no
-- portal do vendedor e no hotlink o vendedor editava o valor FIPE e escolhia o
-- % da cota de participacao — e o banco aceitava qualquer valor. Decisoes:
--   * so vale a CONSULTA FIPE feita pelo servidor (placa ou marca/modelo/ano);
--     nao ha digitacao do valor, nem excecao por perfil;
--   * a cota sai do modelo do catalogo (0162: modelo_do_catalogo), sem escolha;
--   * a adesao e editavel (sugerida x praticada), com quem alterou e quando;
--   * a ficha do veiculo ja na base NAO entra na trava (correcao da matriz).
--
--  (A) `fipe_consultas` — cada consulta FIPE feita pelo SERVIDOR (rota /api/fipe
--      e o hotlink), imutavel. So o service_role grava; a equipe le.
--  (B) a TRAVA, em leads e cotacoes: quando a gravacao vem do NAVEGADOR
--      (sessao do PostgREST que nao e o service_role), o valor FIPE, o codigo e a
--      cota saem da consulta referenciada (`fipe_consulta_id`) — o que o cliente
--      mandou e ignorado. Sem consulta, gravar valor FIPE e recusado. Na
--      cotacao o PRECO tambem e recalculado no banco (cotar_plano), entao
--      mandar total adulterado nao adianta. Valor protegido (0175) continua:
--      vale so quando a FIPE da consulta passa do limite do tipo.
--      Snapshot na cotacao: codigo FIPE, mes de referencia, data da consulta e
--      o % da cota aplicado.
--  (C) `atualizar_cotacao` ganha `p_fipe_consulta_id` (a nova consulta da tela).
--  (D) ADESAO: `leads.adesao_sugerida` (a da tabela no momento), quem alterou e
--      quando, e `lead_adesao_historico` (trilha para o relatorio de descontos).
--      Duas casas decimais, >= 0.
-- Vendas existentes NAO mudam: a trava so age quando FIPE/cota/preco sao
-- regravados. Gravacao pelo SQL Editor/servidor (sem sessao) segue livre.
-- ============================================================================

-- (A) as consultas ---------------------------------------------------------------
create table if not exists fipe_consultas (
  id             uuid primary key default gen_random_uuid(),
  origem         text not null,
  placa          text,
  codigo_fipe    text,
  ano_modelo     integer,
  marca          text,
  modelo         text,
  combustivel    text,
  valor          numeric(14,2) not null,
  mes_referencia text,
  lead_id        uuid references leads(id) on delete set null,
  consultado_por uuid,
  consultado_em  timestamptz not null default now(),
  payload        jsonb,
  constraint chk_fipe_consulta_origem check (origem in ('PLACA', 'CODIGO')),
  constraint chk_fipe_consulta_valor check (valor > 0)
);
create index if not exists idx_fipe_consultas_placa on fipe_consultas (placa, consultado_em desc);

alter table fipe_consultas enable row level security;
drop policy if exists fipe_consultas_select on fipe_consultas;
create policy fipe_consultas_select on fipe_consultas
  for select to authenticated using ((select is_staff()));
revoke insert, update, delete on fipe_consultas from anon, authenticated;

create or replace function fn_fipe_consulta_imutavel()
returns trigger
language plpgsql
as $$
begin
  raise exception 'A consulta FIPE e imutavel' using errcode = 'check_violation';
end;
$$;
drop trigger if exists trg_fipe_consulta_imutavel on fipe_consultas;
create trigger trg_fipe_consulta_imutavel
  before update on fipe_consultas
  for each row execute function fn_fipe_consulta_imutavel();

comment on table fipe_consultas is
  '0180: consulta FIPE feita pelo servidor; a venda so aceita valor FIPE que veio daqui.';

-- (B) colunas ---------------------------------------------------------------------
alter table leads
  add column if not exists fipe_consulta_id   uuid references fipe_consultas(id) on delete set null,
  add column if not exists adesao_sugerida    numeric(12,2),
  add column if not exists adesao_alterada_por uuid references usuarios(id) on delete set null,
  add column if not exists adesao_alterada_em timestamptz;

alter table cotacoes
  add column if not exists fipe_consulta_id    uuid references fipe_consultas(id) on delete set null,
  add column if not exists fipe_codigo         text,
  add column if not exists fipe_mes_referencia text,
  add column if not exists fipe_consultado_em  timestamptz,
  add column if not exists cota_percentual     numeric(6,2);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_lead_adesao_centavos') then
    alter table leads add constraint chk_lead_adesao_centavos
      check (adesao_valor is null or adesao_valor = round(adesao_valor, 2)) not valid;
  end if;
end $$;

-- A gravacao veio do navegador? (PostgREST com sessao que nao e o service_role.)
-- `scar.forcar_trava_fipe` so LIGA a trava (testes); nunca desliga.
create or replace function fipe_exige_consulta()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('scar.forcar_trava_fipe', true), '') = 'on'
      or (session_user = 'authenticator'
          and coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
              <> 'service_role');
$$;

create or replace function placa_normalizada(p text)
returns text
language sql
immutable
as $$ select nullif(upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g')), ''); $$;

-- o valor de calculo a partir da consulta: a FIPE inteira, ou o valor protegido
-- (0175) quando a FIPE passa do limite do tipo.
create or replace function fipe_base_da_consulta(p_valor_consulta numeric, p_tipo uuid, p_pedido numeric)
returns numeric
language sql
stable
as $$
  select case
    when limite_fipe_tipo(p_tipo) is not null
     and p_valor_consulta > limite_fipe_tipo(p_tipo)
     and coalesce(p_pedido, 0) > 0
     and p_pedido <= limite_fipe_tipo(p_tipo)
    then round(p_pedido, 2)
    else p_valor_consulta
  end;
$$;

-- LEAD -------------------------------------------------------------------------------
create or replace function fn_lead_fipe_servidor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  q   fipe_consultas;
  cat record;
begin
  if not fipe_exige_consulta() then return new; end if;
  if tg_op = 'UPDATE' then
    if old.veiculo_id is not null then return new; end if;
    if new.valor_fipe is not distinct from old.valor_fipe
       and new.valor_fipe_mercado is not distinct from old.valor_fipe_mercado
       and new.cota_participacao_id is not distinct from old.cota_participacao_id
       and new.codigo_fipe is not distinct from old.codigo_fipe
       and new.fipe_consulta_id is not distinct from old.fipe_consulta_id
       and new.placa is not distinct from old.placa then
      return new;
    end if;
  end if;

  if new.fipe_consulta_id is null then
    if tg_op = 'INSERT' then
      if new.valor_fipe is not null then
        raise exception 'FIPE_SEM_CONSULTA: o valor FIPE sai da consulta do sistema (placa ou marca/modelo/ano)'
          using errcode = 'check_violation';
      end if;
      new.cota_participacao_id := null;
    else
      -- lead antigo sem consulta: o que o cliente mandou e ignorado
      new.valor_fipe := old.valor_fipe;
      new.valor_fipe_mercado := old.valor_fipe_mercado;
      new.cota_participacao_id := old.cota_participacao_id;
      new.codigo_fipe := old.codigo_fipe;
    end if;
    return new;
  end if;

  select * into q from fipe_consultas where id = new.fipe_consulta_id;
  if q.id is null then
    raise exception 'FIPE_SEM_CONSULTA: consulta FIPE nao encontrada' using errcode = 'check_violation';
  end if;
  if q.origem = 'PLACA' and placa_normalizada(new.placa) is distinct from q.placa then
    raise exception 'FIPE_DE_OUTRA_PLACA: a consulta FIPE e da placa %; consulte a placa do veiculo', q.placa
      using errcode = 'check_violation';
  end if;

  new.valor_fipe := fipe_base_da_consulta(q.valor, new.tipo_veiculo_id, new.valor_fipe);
  new.valor_fipe_mercado := case when new.valor_fipe < q.valor then q.valor end;
  new.codigo_fipe := coalesce(q.codigo_fipe, new.codigo_fipe);
  new.origem_fipe := 'API';
  select m.modelo_id, m.cota_id into cat from modelo_do_catalogo(q.marca, q.modelo) m limit 1;
  new.cota_participacao_id := cat.cota_id;
  if cat.modelo_id is not null then new.modelo_id := cat.modelo_id; end if;
  return new;
end;
$$;

drop trigger if exists trg_lead_a_fipe_servidor on leads;
create trigger trg_lead_a_fipe_servidor
  before insert or update on leads
  for each row execute function fn_lead_fipe_servidor();

-- COTACAO ----------------------------------------------------------------------------
create or replace function fn_cotacao_fipe_servidor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  q       fipe_consultas;
  cat     record;
  v_lead  leads;
  v_calc  jsonb;
  v_exige boolean := fipe_exige_consulta();
begin
  if not v_exige and new.fipe_consulta_id is null then return new; end if;
  if tg_op = 'UPDATE'
     and new.fipe is not distinct from old.fipe
     and new.valor_fipe_mercado is not distinct from old.valor_fipe_mercado
     and new.fipe_consulta_id is not distinct from old.fipe_consulta_id
     and new.cota_participacao_id is not distinct from old.cota_participacao_id
     and new.tipo_veiculo_id is not distinct from old.tipo_veiculo_id
     and new.plano_id is not distinct from old.plano_id
     and new.opcionais_ids is not distinct from old.opcionais_ids
     and new.total_mensalidade is not distinct from old.total_mensalidade
     and new.taxa_adesao is not distinct from old.taxa_adesao
     and new.participacao is not distinct from old.participacao
     and new.itens is not distinct from old.itens
     and new.regional_id is not distinct from old.regional_id
     and new.valor_adicional_regional is not distinct from old.valor_adicional_regional then
    return new;
  end if;

  if new.fipe_consulta_id is null then
    if tg_op = 'INSERT' then
      raise exception 'FIPE_SEM_CONSULTA: a cotacao precisa da consulta FIPE do sistema (placa ou marca/modelo/ano)'
        using errcode = 'check_violation';
    end if;
    -- cotacao antiga sem consulta: FIPE e cota ficam como estavam
    new.fipe := old.fipe;
    new.valor_fipe_mercado := old.valor_fipe_mercado;
    new.cota_participacao_id := old.cota_participacao_id;
  else
    select * into q from fipe_consultas where id = new.fipe_consulta_id;
    if q.id is null then
      raise exception 'FIPE_SEM_CONSULTA: consulta FIPE nao encontrada' using errcode = 'check_violation';
    end if;
    select * into v_lead from leads where id = new.lead_id;
    if q.origem = 'PLACA' and v_lead.placa is not null
       and placa_normalizada(v_lead.placa) is distinct from q.placa then
      raise exception 'FIPE_DE_OUTRA_PLACA: a consulta FIPE e da placa %, o atendimento e da placa %',
        q.placa, v_lead.placa using errcode = 'check_violation';
    end if;
    new.fipe := fipe_base_da_consulta(q.valor, new.tipo_veiculo_id, new.fipe);
    new.valor_fipe_mercado := case when new.fipe < q.valor then q.valor end;
    new.fipe_codigo := q.codigo_fipe;
    new.fipe_mes_referencia := q.mes_referencia;
    new.fipe_consultado_em := q.consultado_em;
    select m.cota_id into cat from modelo_do_catalogo(q.marca, q.modelo) m limit 1;
    new.cota_participacao_id := cat.cota_id;
  end if;

  new.cota_percentual := (select round(percentual * 100, 2) from cotas_participacao where id = new.cota_participacao_id);

  -- O PRECO sai do motor, nunca do cliente.
  if new.tipo_veiculo_id is not null and coalesce(new.fipe, 0) > 0 then
    new.regional_id := coalesce(regional_preco_do_lead(new.lead_id), new.regional_id);
    v_calc := cotar_plano(new.fipe, new.tipo_veiculo_id, new.plano_id,
                          coalesce(new.opcionais_ids, '{}'::uuid[]), new.regional_id);
    new.total_mensalidade := (v_calc->>'valor_total_mensalidade')::numeric;
    new.taxa_adesao := coalesce((v_calc->>'taxa_adesao')::numeric, 0);
    new.valor_adicional_regional := coalesce((v_calc->>'adicional_regional')::numeric, 0);
    new.itens := coalesce(v_calc->'detalhamento_produtos', '[]'::jsonb);
    new.participacao := participacao_do_plano(new.fipe, new.tipo_veiculo_id, new.cota_participacao_id, new.plano_id);
  end if;
  return new;
end;
$$;

-- nome com "a_": roda ANTES de trg_cotacao_desconto (que usa o total) e do limite.
drop trigger if exists trg_cotacao_a_fipe_servidor on cotacoes;
create trigger trg_cotacao_a_fipe_servidor
  before insert or update on cotacoes
  for each row execute function fn_cotacao_fipe_servidor();

-- (C) atualizar_cotacao com a consulta nova ----------------------------------------
do $$
declare
  v_def text;
  v_novo text;
  v_old1 text := 'p_valor_assistencia_profissional numeric DEFAULT NULL::numeric)';
  v_new1 text := 'p_valor_assistencia_profissional numeric DEFAULT NULL::numeric, p_fipe_consulta_id uuid DEFAULT NULL::uuid)';
  v_old2 text := 'regional_id = v_reg_preco,';
  v_new2 text := 'regional_id = v_reg_preco, fipe_consulta_id = coalesce(p_fipe_consulta_id, fipe_consulta_id),';
begin
  if exists (select 1 from pg_proc where proname = 'atualizar_cotacao'
              and pg_get_function_identity_arguments(oid) like '%p_fipe_consulta_id%') then
    return;
  end if;
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'atualizar_cotacao';
  if v_def is null or position(v_old1 in v_def) = 0 or position(v_old2 in v_def) = 0 then
    raise exception '0180: atualizar_cotacao fora do formato esperado';
  end if;
  v_novo := replace(replace(v_def, v_old1, v_new1), v_old2, v_new2);
  drop function atualizar_cotacao(uuid, numeric, uuid, uuid, uuid, uuid[], text, numeric, text, boolean, numeric);
  execute v_novo;
end $$;

-- (D) adesao praticada e a trilha -----------------------------------------------------
create table if not exists lead_adesao_historico (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references leads(id) on delete cascade,
  valor_anterior  numeric(12,2),
  valor_novo      numeric(12,2),
  valor_sugerido  numeric(12,2),
  alterado_por    uuid references usuarios(id) on delete set null,
  alterado_em     timestamptz not null default clock_timestamp()
);
create index if not exists idx_lead_adesao_historico on lead_adesao_historico (lead_id, alterado_em desc);
alter table lead_adesao_historico enable row level security;
drop policy if exists lead_adesao_historico_select on lead_adesao_historico;
create policy lead_adesao_historico_select on lead_adesao_historico
  for select to authenticated using (exists (select 1 from leads l where l.id = lead_id));
revoke insert, update, delete on lead_adesao_historico from anon, authenticated;

create or replace function fn_lead_adesao_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sug numeric;
begin
  if tg_op = 'UPDATE' and new.adesao_valor is not distinct from old.adesao_valor then
    return new;
  end if;
  if new.adesao_valor is not null and new.adesao_valor < 0 then
    raise exception 'A adesao nao pode ser negativa' using errcode = 'check_violation';
  end if;
  if new.adesao_valor is not null and new.adesao_valor <> round(new.adesao_valor, 2) then
    raise exception 'A adesao aceita no maximo duas casas decimais' using errcode = 'check_violation';
  end if;
  v_sug := case when tg_op = 'UPDATE' then lead_adesao_tabela(new.id) end;
  new.adesao_sugerida := coalesce(v_sug, new.adesao_sugerida);
  new.adesao_alterada_por := usuario_atual_id();
  new.adesao_alterada_em := now();
  return new;
end;
$$;

-- "z": depois do preenchimento pela tabela (trg_lead_adesao_da_tabela, 0145/0178)
drop trigger if exists trg_lead_z_adesao_auditoria on leads;
create trigger trg_lead_z_adesao_auditoria
  before insert or update on leads
  for each row execute function fn_lead_adesao_auditoria();

create or replace function fn_lead_adesao_historico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.adesao_valor is not distinct from old.adesao_valor then
    return null;
  end if;
  insert into lead_adesao_historico (lead_id, valor_anterior, valor_novo, valor_sugerido, alterado_por)
  values (new.id, case when tg_op = 'UPDATE' then old.adesao_valor end, new.adesao_valor,
          new.adesao_sugerida, new.adesao_alterada_por);
  return null;
end;
$$;

drop trigger if exists trg_lead_adesao_historico on leads;
create trigger trg_lead_adesao_historico
  after insert or update on leads
  for each row when (new.adesao_valor is not null)
  execute function fn_lead_adesao_historico();

-- rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
