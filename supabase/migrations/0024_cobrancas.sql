-- ============================================================================
-- SCar :: 0024_cobrancas.sql
-- COBRANCAS RECORRENTES (mensalidade) — liga a ficha do veiculo (0023) ao
-- faturamento (0021) e ao financeiro (titulos_financeiros / boleto).
--
--   A) Helpers de calculo:
--      - calcular_vencimento(competencia, dia)  -> data de vencimento (clampa
--        o dia ao ultimo dia do mes; sem dia = legado dia 10 do mes seguinte).
--      - valor_mensalidade_veiculo(veiculo)     -> valor cobrado do veiculo:
--        precedencia veiculos.valor_mensalidade (override) > cotar_plano
--        (plano + opcionais de veiculo_produtos) > 0.
--      - veiculo_faturavel(veiculo, competencia) -> regra de quem entra na
--        cobranca do mes (status + data_ativacao).
--      - dia_vencimento_agrupado(cliente) -> dia mais usado entre os veiculos
--        agrupados do associado (desempate: menor dia).
--   B) gerar_faturas_cliente() reescrita: usa os helpers acima (dia_vencimento
--      e valor_mensalidade por veiculo) e nao cria fatura zerada.
--   C) gerar_faturas_competencia(competencia, regional?) — lote do mes.
--   D) emitir_titulo_fatura(fatura) / emitir_titulos_competencia(...) — gera o
--      titulo financeiro (base do boleto/2a via/inadimplencia) a partir da
--      fatura, de forma idempotente.
--   E) Trigger titulo -> fatura: baixa/cancelamento do titulo reflete o status
--      da fatura (o webhook bancario ja marca o titulo como pago).
--   F) cancelar_fatura(fatura) — cancela fatura + titulo em aberto.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) Helpers
-- ----------------------------------------------------------------------------

-- Vencimento de uma competencia a partir do dia escolhido pelo associado.
-- Dia maior que o ultimo dia do mes cai no ultimo dia (ex.: 31 em fevereiro).
-- Sem dia definido mantem o padrao historico: dia 10 do mes seguinte.
create or replace function calcular_vencimento(p_competencia date, p_dia int)
returns date
language sql
immutable
as $$
  select case
    when p_dia is null or p_dia < 1
      then (date_trunc('month', p_competencia) + interval '1 month 9 days')::date
    else date_trunc('month', p_competencia)::date
         + least(
             p_dia,
             extract(day from (date_trunc('month', p_competencia) + interval '1 month - 1 day'))::int
           ) - 1
  end;
$$;

-- Valor mensal cobrado do veiculo.
-- 1) veiculos.valor_mensalidade  -> valor negociado/travado na ficha (override);
-- 2) cotar_plano(fipe, tipo, plano, opcionais do veiculo) -> motor de precos;
-- 3) 0 (veiculo sem tipo/plano nao gera cobranca).
create or replace function valor_mensalidade_veiculo(p_veiculo_id uuid)
returns numeric
language plpgsql
stable
as $$
declare
  v        veiculos;
  v_opcs   uuid[];
  v_valor  numeric;
begin
  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then return 0; end if;

  if v.valor_mensalidade is not null and v.valor_mensalidade > 0 then
    return round(v.valor_mensalidade, 2);
  end if;

  if v.tipo_veiculo_id is null then return 0; end if;

  select coalesce(array_agg(produto_id), '{}'::uuid[]) into v_opcs
    from veiculo_produtos where veiculo_id = v.id;

  v_valor := (
    cotar_plano(coalesce(v.valor_fipe, 0), v.tipo_veiculo_id, v.plano_protecao_id, v_opcs)
      ->>'valor_total_mensalidade'
  )::numeric;

  return round(coalesce(v_valor, 0), 2);
end;
$$;

-- Entra na cobranca da competencia? Cobramos veiculo em vigencia (ativo, em
-- evento ou com vistoria pendente) e ja ativado ate o fim do mes de referencia.
-- Suspenso/inativo/baixado/excluido NAO geram mensalidade.
create or replace function veiculo_faturavel(p_veiculo_id uuid, p_competencia date)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from veiculos v
     where v.id = p_veiculo_id
       and v.status in ('ativo', 'em_evento', 'vistoria_pendente')
       and (
         v.data_ativacao is null
         or v.data_ativacao <= (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date
       )
  );
$$;

-- Dia de vencimento da fatura AGRUPADA: o dia mais usado entre os veiculos
-- agrupados do associado (desempate pelo menor dia). Null = padrao legado.
create or replace function dia_vencimento_agrupado(p_cliente_id uuid, p_competencia date)
returns int
language sql
stable
as $$
  select v.dia_vencimento
    from veiculos v
   where v.cliente_id = p_cliente_id
     and v.tipo_faturamento = 'AGRUPADO_ASSOCIADO'
     and v.dia_vencimento is not null
     and veiculo_faturavel(v.id, p_competencia)
   group by v.dia_vencimento
   order by count(*) desc, v.dia_vencimento asc
   limit 1;
$$;

-- ----------------------------------------------------------------------------
-- B) Geracao de faturas do associado (reescreve a versao do 0021)
-- ----------------------------------------------------------------------------
-- Continua idempotente por competencia (nao recria fatura existente) e o
-- snapshot segue imutavel: alternar o modo do veiculo so afeta o mes seguinte.
create or replace function gerar_faturas_cliente(
  p_cliente_id uuid,
  p_competencia date,
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

  -- AGRUPADO: uma fatura consolidada com um item por veiculo agrupado.
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

  -- INDIVIDUAL: uma fatura por veiculo desmembrado, no dia de vencimento dele.
  for v in
    select * from veiculos
     where cliente_id = p_cliente_id
       and tipo_faturamento = 'INDIVIDUAL_VEICULO'
       and veiculo_faturavel(id, v_comp)
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

-- ----------------------------------------------------------------------------
-- C) Lote do mes: gera as faturas de todos os associados com veiculo faturavel
-- ----------------------------------------------------------------------------
create or replace function gerar_faturas_competencia(
  p_competencia date,
  p_regional_id uuid default null
)
returns table (
  associados      integer,
  faturas_geradas integer,
  valor_total     numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  c        record;
  f        faturas;
  v_comp   date := date_trunc('month', p_competencia)::date;
  n_assoc  integer := 0;
  n_fat    integer := 0;
  v_soma   numeric := 0;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  for c in
    select distinct v.cliente_id
      from veiculos v
      join clientes cl on cl.id = v.cliente_id
     where veiculo_faturavel(v.id, v_comp)
       and (p_regional_id is null or coalesce(v.regional_id, cl.regional_id) = p_regional_id)
       and pode_regional(cl.regional_id)
  loop
    n_assoc := n_assoc + 1;
    for f in select * from gerar_faturas_cliente(c.cliente_id, v_comp) loop
      n_fat  := n_fat + 1;
      v_soma := v_soma + f.valor_total;
    end loop;
  end loop;

  associados := n_assoc;
  faturas_geradas := n_fat;
  valor_total := round(coalesce(v_soma, 0), 2);
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- D) Fatura -> titulo financeiro (base do boleto / 2a via / inadimplencia)
-- ----------------------------------------------------------------------------
create or replace function emitir_titulo_fatura(p_fatura_id uuid)
returns titulos_financeiros
language plpgsql
security definer
set search_path = public
as $$
declare
  f faturas;
  t titulos_financeiros;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  select * into f from faturas where id = p_fatura_id;
  if f.id is null then raise exception 'Fatura nao encontrada'; end if;
  if f.status = 'CANCELADA' then raise exception 'Fatura cancelada'; end if;

  -- Idempotente: fatura ja emitida devolve o titulo existente.
  if f.titulo_id is not null then
    select * into t from titulos_financeiros where id = f.titulo_id;
    if t.id is not null then return t; end if;
  end if;

  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (
      f.cliente_id,
      f.veiculo_id,                                  -- nulo na fatura agrupada
      f.valor_total,
      coalesce(f.vencimento, calcular_vencimento(f.competencia, null)),
      'pendente'
    )
    returning * into t;

  update faturas set titulo_id = t.id, updated_at = now() where id = f.id;
  return t;
end;
$$;

-- Emite os titulos de todas as faturas ABERTAS da competencia (sem titulo).
create or replace function emitir_titulos_competencia(
  p_competencia date,
  p_regional_id uuid default null
)
returns table (
  titulos_emitidos integer,
  valor_total      numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  f       faturas;
  v_comp  date := date_trunc('month', p_competencia)::date;
  n       integer := 0;
  v_soma  numeric := 0;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  for f in
    select * from faturas
     where competencia = v_comp
       and status = 'ABERTA'
       and titulo_id is null
       and (p_regional_id is null or regional_id = p_regional_id)
       and pode_regional(regional_id)
     order by vencimento
  loop
    perform emitir_titulo_fatura(f.id);
    n := n + 1;
    v_soma := v_soma + f.valor_total;
  end loop;

  titulos_emitidos := n;
  valor_total := round(coalesce(v_soma, 0), 2);
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- E) Titulo -> fatura: o pagamento (webhook bancario) fecha a fatura
-- ----------------------------------------------------------------------------
create or replace function fn_fatura_status_por_titulo()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'pago' then
      update faturas set status = 'PAGA', updated_at = now()
       where titulo_id = new.id and status <> 'CANCELADA';
    elsif new.status = 'cancelado' then
      update faturas set status = 'CANCELADA', updated_at = now()
       where titulo_id = new.id and status <> 'PAGA';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fatura_status_titulo on titulos_financeiros;
create trigger trg_fatura_status_titulo
  after update of status on titulos_financeiros
  for each row execute function fn_fatura_status_por_titulo();

-- ----------------------------------------------------------------------------
-- F) Cancelamento da fatura (e do titulo em aberto)
-- ----------------------------------------------------------------------------
create or replace function cancelar_fatura(p_fatura_id uuid)
returns faturas
language plpgsql
security definer
set search_path = public
as $$
declare f faturas;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  select * into f from faturas where id = p_fatura_id;
  if f.id is null then raise exception 'Fatura nao encontrada'; end if;
  if f.status = 'PAGA' then raise exception 'Fatura ja paga'; end if;

  if f.titulo_id is not null then
    update titulos_financeiros set status = 'cancelado', updated_at = now()
     where id = f.titulo_id and status <> 'pago';
  end if;

  update faturas set status = 'CANCELADA', updated_at = now()
   where id = f.id
   returning * into f;
  return f;
end;
$$;

-- ----------------------------------------------------------------------------
-- Indices / grants
-- ----------------------------------------------------------------------------
create index if not exists idx_faturas_competencia on faturas (competencia, status);
create index if not exists idx_faturas_titulo on faturas (titulo_id);

grant execute on function calcular_vencimento(date, int) to authenticated;
grant execute on function valor_mensalidade_veiculo(uuid) to authenticated;
grant execute on function veiculo_faturavel(uuid, date) to authenticated;
grant execute on function dia_vencimento_agrupado(uuid, date) to authenticated;
grant execute on function gerar_faturas_competencia(date, uuid) to authenticated;
grant execute on function emitir_titulo_fatura(uuid) to authenticated;
grant execute on function emitir_titulos_competencia(date, uuid) to authenticated;
grant execute on function cancelar_fatura(uuid) to authenticated;
