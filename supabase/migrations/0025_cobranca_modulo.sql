-- ============================================================================
-- SCar :: 0025_cobranca_modulo.sql
-- MODULO COBRANCA (evolucao do 0024):
--   A) GERACAO AUTOMATICA na entrada na base: ao ativar o veiculo (insert com
--      status 'ativo' ou mudanca para 'ativo' — inclusive pela auditoria de
--      Vendas), o sistema carimba a data_ativacao e gera a PRIMEIRA cobranca.
--   B) BOLETAGEM RECORRENTE: geracao em lote por PERIODO (ex.: proximos 6
--      meses) com escopo por associado, por grupo de veiculos ou por regional.
--   C) INTEGRACAO BANCARIA (service pattern): campos de PIX/PDF no titulo +
--      tabelas `cobranca_remessas` / `cobranca_remessa_itens` (fila de envio ao
--      gateway) + funcoes de criacao de remessa e registro do retorno. Hoje o
--      gateway e mockado no app; a estrutura ja aceita o retorno real
--      (nosso numero, linha digitavel, PDF, PIX copia-e-cola / QR Code).
--   D) DASHBOARD: `listar_cobrancas(...)` (filtros: placa, associado, periodo
--      de vencimento, faixa de valor, status) e `resumo_cobrancas(...)`
--      (emitido x recebido, inadimplencia, a vencer em 7/15/30 dias).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) Geracao automatica na ativacao do veiculo
-- ----------------------------------------------------------------------------

-- Primeira cobranca do veiculo (competencia da ativacao). Idempotente: se o
-- veiculo ja esta em alguma fatura da competencia, nao faz nada.
-- AGRUPADO: entra como item na fatura agrupada do mes quando ela ainda esta
-- ABERTA e sem titulo emitido; se a agrupada ja foi emitida/paga, o veiculo
-- recebe uma fatura propria para nao perder a cobranca de entrada.
create or replace function gerar_primeira_cobranca_veiculo(
  p_veiculo_id uuid,
  p_competencia date default null
)
returns setof faturas
language plpgsql
security definer
set search_path = public
as $$
declare
  v      veiculos;
  f      faturas;
  v_comp date;
  v_val  numeric;
  v_reg  uuid;
  v_desc text;
begin
  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then return; end if;

  v_comp := date_trunc('month', coalesce(p_competencia, v.data_ativacao, current_date))::date;
  if not veiculo_faturavel(v.id, v_comp) then return; end if;

  -- ja cobrado nesta competencia?
  if exists (
       select 1 from fatura_itens fi
         join faturas fa on fa.id = fi.fatura_id
        where fi.veiculo_id = v.id and fa.competencia = v_comp and fa.status <> 'CANCELADA'
     )
  then
    return;
  end if;

  v_val := valor_mensalidade_veiculo(v.id);
  if v_val <= 0 then return; end if;

  select regional_id into v_reg from clientes where id = v.cliente_id;
  v_desc := coalesce(v.placa, '') || ' - ' || coalesce(v.modelo, 'veiculo');

  if v.tipo_faturamento = 'AGRUPADO_ASSOCIADO' then
    select * into f from faturas
     where cliente_id = v.cliente_id and competencia = v_comp
       and tipo_faturamento = 'AGRUPADO_ASSOCIADO';

    if f.id is not null and f.status = 'ABERTA' and f.titulo_id is null then
      insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
        values (f.id, v.id, v_desc, v_val);
      update faturas
         set valor_total = valor_total + v_val, updated_at = now()
       where id = f.id
       returning * into f;
      return next f;
      return;
    end if;

    if f.id is null then
      insert into faturas (cliente_id, regional_id, tipo_faturamento, competencia, vencimento, valor_total)
        values (v.cliente_id, v_reg, 'AGRUPADO_ASSOCIADO', v_comp,
                calcular_vencimento(v_comp, coalesce(dia_vencimento_agrupado(v.cliente_id, v_comp), v.dia_vencimento)),
                v_val)
        returning * into f;
      insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
        values (f.id, v.id, v_desc, v_val);
      return next f;
      return;
    end if;
  end if;

  -- INDIVIDUAL (ou agrupada ja emitida/paga): fatura propria do veiculo.
  if exists (
       select 1 from faturas
        where veiculo_id = v.id and competencia = v_comp and tipo_faturamento = 'INDIVIDUAL_VEICULO'
     )
  then
    return;
  end if;

  insert into faturas (cliente_id, regional_id, tipo_faturamento, veiculo_id, competencia, vencimento, valor_total)
    values (v.cliente_id, v_reg, 'INDIVIDUAL_VEICULO', v.id, v_comp,
            calcular_vencimento(v_comp, v.dia_vencimento), v_val)
    returning * into f;
  insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
    values (f.id, v.id, v_desc, v_val);
  return next f;
end;
$$;

-- BEFORE: carimba a data de ativacao na entrada na base.
create or replace function fn_veiculo_marca_ativacao()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'ativo'
     and (tg_op = 'INSERT' or old.status is distinct from 'ativo')
     and new.data_ativacao is null
  then
    new.data_ativacao := current_date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_veiculo_marca_ativacao on veiculos;
create trigger trg_veiculo_marca_ativacao
  before insert or update of status on veiculos
  for each row execute function fn_veiculo_marca_ativacao();

-- AFTER: dispara a primeira cobranca. Nao bloqueia o cadastro do veiculo se a
-- cobranca nao puder ser gerada (sem plano/valor, por exemplo).
create or replace function fn_veiculo_primeira_cobranca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'ativo' and (tg_op = 'INSERT' or old.status is distinct from 'ativo') then
    begin
      perform gerar_primeira_cobranca_veiculo(new.id);
    exception when others then
      raise warning 'Cobranca de entrada do veiculo % nao gerada: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_veiculo_primeira_cobranca on veiculos;
create trigger trg_veiculo_primeira_cobranca
  after insert or update of status on veiculos
  for each row execute function fn_veiculo_primeira_cobranca();

-- ----------------------------------------------------------------------------
-- B) Boletagem recorrente: lote por periodo / por grupo de veiculos
-- ----------------------------------------------------------------------------

-- Nucleo da geracao: igual ao 0024, porem com filtro opcional de veiculos
-- (permite boletar so um grupo selecionado pelo operador).
create or replace function gerar_faturas_cliente_veiculos(
  p_cliente_id uuid,
  p_competencia date,
  p_veiculo_ids uuid[] default null,
  p_vencimento date default null
)
returns setof faturas
language plpgsql
security definer
set search_path = public
as $$
declare
  v        veiculos;
  f_agrup  faturas;
  f_ind    faturas;
  v_reg    uuid;
  v_val    numeric;
  v_total  numeric := 0;
  v_venc   date;
  v_comp   date := date_trunc('month', p_competencia)::date;
  v_ids    uuid[] := '{}'::uuid[];
  v_descs  text[] := '{}'::text[];
  v_vals   numeric[] := '{}'::numeric[];
  i        int;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;
  select regional_id into v_reg from clientes where id = p_cliente_id;

  -- AGRUPADO
  if not exists (
       select 1 from faturas
        where cliente_id = p_cliente_id and competencia = v_comp
          and tipo_faturamento = 'AGRUPADO_ASSOCIADO'
     )
  then
    for v in
      select * from veiculos
       where cliente_id = p_cliente_id
         and tipo_faturamento = 'AGRUPADO_ASSOCIADO'
         and veiculo_faturavel(id, v_comp)
         and (p_veiculo_ids is null or id = any(p_veiculo_ids))
       order by placa
    loop
      v_val := valor_mensalidade_veiculo(v.id);
      if v_val > 0 then
        v_ids   := v_ids   || v.id;
        v_descs := v_descs || (coalesce(v.placa, '') || ' - ' || coalesce(v.modelo, 'veiculo'));
        v_vals  := v_vals  || v_val;
        v_total := v_total + v_val;
      end if;
    end loop;

    if v_total > 0 then
      v_venc := coalesce(p_vencimento, calcular_vencimento(v_comp, dia_vencimento_agrupado(p_cliente_id, v_comp)));
      insert into faturas (cliente_id, regional_id, tipo_faturamento, competencia, vencimento, valor_total)
        values (p_cliente_id, v_reg, 'AGRUPADO_ASSOCIADO', v_comp, v_venc, v_total)
        returning * into f_agrup;
      for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
        insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
          values (f_agrup.id, v_ids[i], v_descs[i], v_vals[i]);
      end loop;
      return next f_agrup;
    end if;
  end if;

  -- INDIVIDUAL
  for v in
    select * from veiculos
     where cliente_id = p_cliente_id
       and tipo_faturamento = 'INDIVIDUAL_VEICULO'
       and veiculo_faturavel(id, v_comp)
       and (p_veiculo_ids is null or id = any(p_veiculo_ids))
     order by placa
  loop
    if not exists (
          select 1 from faturas
           where veiculo_id = v.id and competencia = v_comp
             and tipo_faturamento = 'INDIVIDUAL_VEICULO'
        )
    then
      v_val := valor_mensalidade_veiculo(v.id);
      if v_val > 0 then
        v_venc := coalesce(p_vencimento, calcular_vencimento(v_comp, v.dia_vencimento));
        insert into faturas (cliente_id, regional_id, tipo_faturamento, veiculo_id, competencia, vencimento, valor_total)
          values (p_cliente_id, v_reg, 'INDIVIDUAL_VEICULO', v.id, v_comp, v_venc, v_val)
          returning * into f_ind;
        insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
          values (f_ind.id, v.id, coalesce(v.placa, '') || ' - ' || coalesce(v.modelo, 'veiculo'), v_val);
        return next f_ind;
      end if;
    end if;
  end loop;

  return;
end;
$$;

-- Mantem a assinatura historica delegando para o nucleo.
create or replace function gerar_faturas_cliente(
  p_cliente_id uuid,
  p_competencia date,
  p_vencimento date default null
)
returns setof faturas
language sql
security definer
set search_path = public
as $$
  select * from gerar_faturas_cliente_veiculos(p_cliente_id, p_competencia, null, p_vencimento);
$$;

-- Lote por PERIODO: gera N competencias de uma vez (ex.: 6 meses), com escopo
-- por associado, por grupo de veiculos ou por regional. Idempotente por mes.
create or replace function gerar_faturas_periodo(
  p_competencia_inicial date,
  p_meses int default 6,
  p_cliente_id uuid default null,
  p_veiculo_ids uuid[] default null,
  p_regional_id uuid default null
)
returns table (
  competencia     date,
  associados      integer,
  faturas_geradas integer,
  valor_total     numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  c       record;
  f       faturas;
  v_comp  date;
  m       int;
  n_assoc integer;
  n_fat   integer;
  v_soma  numeric;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;
  if p_meses < 1 or p_meses > 24 then raise exception 'Periodo invalido (1 a 24 meses)'; end if;

  for m in 0 .. p_meses - 1 loop
    v_comp  := (date_trunc('month', p_competencia_inicial) + (m || ' month')::interval)::date;
    n_assoc := 0; n_fat := 0; v_soma := 0;

    for c in
      select distinct v.cliente_id
        from veiculos v
        join clientes cl on cl.id = v.cliente_id
       where veiculo_faturavel(v.id, v_comp)
         and (p_cliente_id is null or v.cliente_id = p_cliente_id)
         and (p_veiculo_ids is null or v.id = any(p_veiculo_ids))
         and (p_regional_id is null or coalesce(v.regional_id, cl.regional_id) = p_regional_id)
         and pode_regional(cl.regional_id)
    loop
      n_assoc := n_assoc + 1;
      for f in select * from gerar_faturas_cliente_veiculos(c.cliente_id, v_comp, p_veiculo_ids) loop
        n_fat  := n_fat + 1;
        v_soma := v_soma + f.valor_total;
      end loop;
    end loop;

    competencia := v_comp;
    associados := n_assoc;
    faturas_geradas := n_fat;
    valor_total := round(coalesce(v_soma, 0), 2);
    return next;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- C) Integracao bancaria: campos do titulo + fila de remessas
-- ----------------------------------------------------------------------------
alter table titulos_financeiros
  add column if not exists pix_copia_cola text,
  add column if not exists pix_qrcode_url text,
  add column if not exists integracao_id  uuid references integracoes_bancarias(id) on delete set null,
  add column if not exists gateway_status text,
  add column if not exists gateway_erro   text,
  add column if not exists enviado_em     timestamptz;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'status_remessa') then
    create type status_remessa as enum ('PENDENTE', 'PROCESSANDO', 'CONCLUIDA', 'PARCIAL', 'ERRO');
  end if;
  if not exists (select 1 from pg_type where typname = 'status_remessa_item') then
    create type status_remessa_item as enum ('PENDENTE', 'ENVIADO', 'CONFIRMADO', 'ERRO');
  end if;
end $$;

-- Remessa = lote de titulos enviado (ou a enviar) para a API do banco.
create table if not exists cobranca_remessas (
  id            uuid primary key default gen_random_uuid(),
  integracao_id uuid references integracoes_bancarias(id) on delete set null,
  regional_id   uuid references regionais(id) on delete set null,
  referencia    text,                                   -- ex.: 'competencia 2026-03'
  status        status_remessa not null default 'PENDENTE',
  total_titulos integer not null default 0,
  total_valor   numeric(12,2) not null default 0,
  enviado_em    timestamptz,
  retorno_em    timestamptz,
  erro          text,
  created_by    uuid references usuarios(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists cobranca_remessa_itens (
  id         uuid primary key default gen_random_uuid(),
  remessa_id uuid not null references cobranca_remessas(id) on delete cascade,
  titulo_id  uuid not null references titulos_financeiros(id) on delete cascade,
  status     status_remessa_item not null default 'PENDENTE',
  erro       text,
  payload    jsonb,          -- o que foi enviado ao gateway
  retorno    jsonb,          -- resposta bruta do gateway (auditoria)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (remessa_id, titulo_id)
);

create index if not exists idx_remessa_itens_remessa on cobranca_remessa_itens (remessa_id);
create index if not exists idx_remessa_itens_titulo  on cobranca_remessa_itens (titulo_id);
create index if not exists idx_titulos_vencimento    on titulos_financeiros (data_vencimento, status);

create trigger trg_remessas_updated before update on cobranca_remessas
  for each row execute function set_updated_at();
create trigger trg_remessa_itens_updated before update on cobranca_remessa_itens
  for each row execute function set_updated_at();

-- Cria a remessa a partir de uma lista de titulos (ignora os que ja possuem
-- linha digitavel ou ja estao confirmados em outra remessa).
create or replace function criar_remessa_cobranca(
  p_titulo_ids  uuid[],
  p_integracao_id uuid default null,
  p_referencia  text default null
)
returns cobranca_remessas
language plpgsql
security definer
set search_path = public
as $$
declare
  r    cobranca_remessas;
  v_int uuid := p_integracao_id;
  v_reg uuid;
begin
  if not tem_acesso_global() then raise exception 'Sem permissao'; end if;
  if p_titulo_ids is null or array_length(p_titulo_ids, 1) is null then
    raise exception 'Nenhum titulo informado';
  end if;

  if v_int is null then
    select id into v_int from integracoes_bancarias
     where ativo and is_padrao order by regional_id nulls last limit 1;
  end if;
  select regional_id into v_reg from integracoes_bancarias where id = v_int;

  insert into cobranca_remessas (integracao_id, regional_id, referencia, status, created_by)
    values (v_int, v_reg, p_referencia, 'PENDENTE', auth.uid())
    returning * into r;

  insert into cobranca_remessa_itens (remessa_id, titulo_id)
    select r.id, t.id
      from titulos_financeiros t
     where t.id = any(p_titulo_ids)
       and t.status in ('pendente', 'vencido')
       and t.linha_digitavel is null
       and not exists (
         select 1 from cobranca_remessa_itens i
          where i.titulo_id = t.id and i.status in ('PENDENTE', 'ENVIADO', 'CONFIRMADO')
       );

  update cobranca_remessas c
     set total_titulos = agg.qtd, total_valor = agg.soma
    from (
      select count(*)::int as qtd, coalesce(sum(t.valor), 0) as soma
        from cobranca_remessa_itens i
        join titulos_financeiros t on t.id = i.titulo_id
       where i.remessa_id = r.id
    ) agg
   where c.id = r.id
   returning * into r;

  return r;
end;
$$;

-- Marca a remessa como enviada (a chamada HTTP acontece no app / edge function).
create or replace function marcar_remessa_enviada(p_remessa_id uuid)
returns cobranca_remessas
language plpgsql
security definer
set search_path = public
as $$
declare r cobranca_remessas;
begin
  if not tem_acesso_global() then raise exception 'Sem permissao'; end if;
  update cobranca_remessas
     set status = 'PROCESSANDO', enviado_em = now(), updated_at = now()
   where id = p_remessa_id
   returning * into r;
  if r.id is null then raise exception 'Remessa nao encontrada'; end if;

  update cobranca_remessa_itens set status = 'ENVIADO', updated_at = now()
   where remessa_id = p_remessa_id and status = 'PENDENTE';

  update titulos_financeiros t
     set enviado_em = now(), gateway_status = 'ENVIADO', integracao_id = coalesce(t.integracao_id, r.integracao_id)
    from cobranca_remessa_itens i
   where i.remessa_id = p_remessa_id and i.titulo_id = t.id;

  return r;
end;
$$;

-- Registra o retorno do gateway para UM titulo da remessa (linha digitavel,
-- nosso numero, PDF, PIX). Chamada pela rotina de emissao ou pelo webhook.
create or replace function registrar_retorno_cobranca(
  p_titulo_id       uuid,
  p_gateway_id      text default null,
  p_nosso_numero    text default null,
  p_linha_digitavel text default null,
  p_url_boleto      text default null,
  p_pix_copia_cola  text default null,
  p_pix_qrcode_url  text default null,
  p_erro            text default null,
  p_retorno         jsonb default null
)
returns titulos_financeiros
language plpgsql
security definer
set search_path = public
as $$
declare t titulos_financeiros;
begin
  if not tem_acesso_global() then raise exception 'Sem permissao'; end if;

  update titulos_financeiros
     set gateway_transacao_id = coalesce(p_gateway_id, gateway_transacao_id),
         nosso_numero         = coalesce(p_nosso_numero, nosso_numero),
         linha_digitavel      = coalesce(p_linha_digitavel, linha_digitavel),
         url_boleto           = coalesce(p_url_boleto, url_boleto),
         pix_copia_cola       = coalesce(p_pix_copia_cola, pix_copia_cola),
         pix_qrcode_url       = coalesce(p_pix_qrcode_url, pix_qrcode_url),
         gateway_status       = case when p_erro is null then 'REGISTRADO' else 'ERRO' end,
         gateway_erro         = p_erro,
         updated_at           = now()
   where id = p_titulo_id
   returning * into t;
  if t.id is null then raise exception 'Titulo nao encontrado'; end if;

  update cobranca_remessa_itens
     set status  = (case when p_erro is null then 'CONFIRMADO' else 'ERRO' end)::status_remessa_item,
         erro    = p_erro,
         retorno = coalesce(p_retorno, retorno),
         updated_at = now()
   where titulo_id = p_titulo_id and status in ('PENDENTE', 'ENVIADO');

  return t;
end;
$$;

-- Fecha a remessa consolidando o resultado dos itens.
create or replace function finalizar_remessa(p_remessa_id uuid)
returns cobranca_remessas
language plpgsql
security definer
set search_path = public
as $$
declare
  r        cobranca_remessas;
  n_total  int;
  n_erro   int;
  n_ok     int;
begin
  if not tem_acesso_global() then raise exception 'Sem permissao'; end if;

  select count(*)::int,
         count(*) filter (where status = 'ERRO')::int,
         count(*) filter (where status = 'CONFIRMADO')::int
    into n_total, n_erro, n_ok
    from cobranca_remessa_itens where remessa_id = p_remessa_id;

  update cobranca_remessas
     set status = (case
                     when n_total = 0 then 'ERRO'
                     when n_erro = 0 then 'CONCLUIDA'
                     when n_ok = 0 then 'ERRO'
                     else 'PARCIAL'
                   end)::status_remessa,
         retorno_em = now(),
         updated_at = now()
   where id = p_remessa_id
   returning * into r;

  if r.id is null then raise exception 'Remessa nao encontrada'; end if;
  return r;
end;
$$;

-- ----------------------------------------------------------------------------
-- D) Dashboard: listagem com filtros + resumo (KPIs)
-- ----------------------------------------------------------------------------

-- Status "efetivo" do boleto: pendente vencido conta como VENCIDO mesmo que a
-- rotina marcar_titulos_vencidos ainda nao tenha rodado.
create or replace function status_cobranca_efetivo(p_status status_titulo, p_vencimento date)
returns text
language sql
immutable
as $$
  select case
    when p_status = 'pago' then 'pago'
    when p_status = 'cancelado' then 'cancelado'
    when p_status = 'vencido' or p_vencimento < current_date then 'vencido'
    else 'aberto'
  end;
$$;

-- Listagem do modulo Cobranca: um registro por titulo (boleto), com associado,
-- placas e status efetivo. Filtros: placa, nome/CPF do associado, periodo de
-- vencimento, faixa de valores, status e regional.
create or replace function listar_cobrancas(
  p_inicio      date default null,
  p_fim         date default null,
  p_placa       text default null,
  p_associado   text default null,
  p_valor_min   numeric default null,
  p_valor_max   numeric default null,
  p_status      text default null,     -- aberto | pago | vencido | cancelado
  p_regional_id uuid default null,
  p_limite      int  default 500
)
returns table (
  titulo_id       uuid,
  fatura_id       uuid,
  cliente_id      uuid,
  associado       text,
  cpf_cnpj        text,
  placas          text,
  competencia     date,
  data_vencimento date,
  valor           numeric,
  valor_pago      numeric,
  data_pagamento  date,
  status          text,
  dias_atraso     integer,
  linha_digitavel text,
  url_boleto      text,
  pix_copia_cola  text,
  regional_id     uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select t.id as titulo_id,
           f.id as fatura_id,
           t.cliente_id,
           cl.nome_razao_social as associado,
           cl.cpf_cnpj,
           coalesce(
             (select string_agg(distinct ve.placa, ', ' order by ve.placa)
                from fatura_itens fi join veiculos ve on ve.id = fi.veiculo_id
               where fi.fatura_id = f.id),
             (select ve.placa from veiculos ve where ve.id = t.veiculo_id)
           ) as placas,
           f.competencia,
           t.data_vencimento,
           t.valor,
           t.valor_pago,
           t.data_pagamento,
           status_cobranca_efetivo(t.status, t.data_vencimento) as status,
           greatest(0, (current_date - t.data_vencimento))::int as dias_atraso,
           t.linha_digitavel,
           t.url_boleto,
           t.pix_copia_cola,
           coalesce(f.regional_id, cl.regional_id) as regional_id
      from titulos_financeiros t
      join clientes cl on cl.id = t.cliente_id
      left join faturas f on f.titulo_id = t.id
     where pode_regional(coalesce(f.regional_id, cl.regional_id))
  )
  select * from base
   where (p_inicio is null or data_vencimento >= p_inicio)
     and (p_fim is null or data_vencimento <= p_fim)
     and (p_valor_min is null or valor >= p_valor_min)
     and (p_valor_max is null or valor <= p_valor_max)
     and (p_status is null or status = p_status)
     and (p_regional_id is null or regional_id = p_regional_id)
     and (p_placa is null or coalesce(placas, '') ilike '%' || p_placa || '%')
     and (
       p_associado is null
       or associado ilike '%' || p_associado || '%'
       or cpf_cnpj  ilike '%' || regexp_replace(p_associado, '\D', '', 'g') || '%'
     )
   order by data_vencimento desc
   limit coalesce(p_limite, 500);
$$;

-- KPIs do dashboard no periodo (por vencimento): emitido x recebido,
-- inadimplencia (valor e %) e a vencer em 7 / 15 / 30 dias.
create or replace function resumo_cobrancas(
  p_inicio      date default null,
  p_fim         date default null,
  p_regional_id uuid default null
)
returns table (
  emitido_qtd       integer,
  emitido_valor     numeric,
  recebido_qtd      integer,
  recebido_valor    numeric,
  aberto_qtd        integer,
  aberto_valor      numeric,
  vencido_qtd       integer,
  vencido_valor     numeric,
  inadimplencia_pct numeric,
  vencer_7_qtd      integer,
  vencer_7_valor    numeric,
  vencer_15_qtd     integer,
  vencer_15_valor   numeric,
  vencer_30_qtd     integer,
  vencer_30_valor   numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select * from listar_cobrancas(p_inicio, p_fim, null, null, null, null, null, p_regional_id, 100000)
  ),
  -- "A vencer" olha sempre para frente a partir de hoje (independe do periodo).
  fut as (
    select * from listar_cobrancas(current_date, current_date + 30, null, null, null, null, 'aberto', p_regional_id, 100000)
  )
  select
    count(*) filter (where c.status <> 'cancelado')::int,
    coalesce(sum(c.valor) filter (where c.status <> 'cancelado'), 0),
    count(*) filter (where c.status = 'pago')::int,
    coalesce(sum(coalesce(c.valor_pago, c.valor)) filter (where c.status = 'pago'), 0),
    count(*) filter (where c.status = 'aberto')::int,
    coalesce(sum(c.valor) filter (where c.status = 'aberto'), 0),
    count(*) filter (where c.status = 'vencido')::int,
    coalesce(sum(c.valor) filter (where c.status = 'vencido'), 0),
    round(
      coalesce(sum(c.valor) filter (where c.status = 'vencido'), 0)
      / nullif(coalesce(sum(c.valor) filter (where c.status <> 'cancelado'), 0), 0) * 100,
      2
    ),
    (select count(*)::int from fut where fut.data_vencimento <= current_date + 7),
    (select coalesce(sum(valor), 0) from fut where fut.data_vencimento <= current_date + 7),
    (select count(*)::int from fut where fut.data_vencimento <= current_date + 15),
    (select coalesce(sum(valor), 0) from fut where fut.data_vencimento <= current_date + 15),
    (select count(*)::int from fut where fut.data_vencimento <= current_date + 30),
    (select coalesce(sum(valor), 0) from fut where fut.data_vencimento <= current_date + 30)
  from c;
$$;

-- Titulos elegiveis a envio para o banco (fila da remessa) na competencia.
create or replace function titulos_para_remessa(
  p_competencia date default null,
  p_regional_id uuid default null,
  p_limite      int default 500
)
returns setof titulos_financeiros
language sql
stable
security definer
set search_path = public
as $$
  select t.*
    from titulos_financeiros t
    join clientes cl on cl.id = t.cliente_id
    left join faturas f on f.titulo_id = t.id
   where t.status in ('pendente', 'vencido')
     and t.linha_digitavel is null
     and (p_competencia is null or f.competencia = date_trunc('month', p_competencia)::date)
     and (p_regional_id is null or coalesce(f.regional_id, cl.regional_id) = p_regional_id)
     and pode_regional(coalesce(f.regional_id, cl.regional_id))
     and not exists (
       select 1 from cobranca_remessa_itens i
        where i.titulo_id = t.id and i.status in ('PENDENTE', 'ENVIADO', 'CONFIRMADO')
     )
   order by t.data_vencimento
   limit coalesce(p_limite, 500);
$$;

-- ----------------------------------------------------------------------------
-- RLS / grants
-- ----------------------------------------------------------------------------
alter table cobranca_remessas      enable row level security;
alter table cobranca_remessa_itens enable row level security;

drop policy if exists remessas_all on cobranca_remessas;
create policy remessas_all on cobranca_remessas for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

drop policy if exists remessa_itens_all on cobranca_remessa_itens;
create policy remessa_itens_all on cobranca_remessa_itens for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

grant select, insert, update, delete on cobranca_remessas, cobranca_remessa_itens to authenticated;

grant execute on function gerar_primeira_cobranca_veiculo(uuid, date) to authenticated;
grant execute on function gerar_faturas_cliente_veiculos(uuid, date, uuid[], date) to authenticated;
grant execute on function gerar_faturas_periodo(date, int, uuid, uuid[], uuid) to authenticated;
grant execute on function criar_remessa_cobranca(uuid[], uuid, text) to authenticated;
grant execute on function marcar_remessa_enviada(uuid) to authenticated;
grant execute on function registrar_retorno_cobranca(uuid, text, text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function finalizar_remessa(uuid) to authenticated;
grant execute on function status_cobranca_efetivo(status_titulo, date) to authenticated;
grant execute on function listar_cobrancas(date, date, text, text, numeric, numeric, text, uuid, int) to authenticated;
grant execute on function resumo_cobrancas(date, date, uuid) to authenticated;
grant execute on function titulos_para_remessa(date, uuid, int) to authenticated;
