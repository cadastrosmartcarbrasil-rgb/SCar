-- ============================================================================
-- SCar :: 0021_sac_faturamento_opcionais.sql
-- Core unificado (SAC/Assistencia/Vendas/Chatbot):
--   A) Cadastro amplo do veiculo (categoria, data de ativacao, novos status).
--   B) Faturamento flexivel por veiculo (AGRUPADO x INDIVIDUAL) + Fatura/ItemFatura
--      com historico imutavel (troca de modo nao reescreve faturas passadas).
--   C) Opcionais com limite de uso por JANELA FLUTUANTE de N dias (padrao 365),
--      contados sobre eventos_sinistro.
--   + Motor: elegibilidade de opcionais, toggle de faturamento, geracao de faturas.
-- Append-only. ADD VALUE de enum nao e usado na mesma migration (evita 55P04).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) Cadastro amplo do veiculo
-- ----------------------------------------------------------------------------
alter table veiculos
  add column if not exists categoria     text,
  add column if not exists data_ativacao date;

-- Novos status operacionais (apenas ADD VALUE; nao usar nesta migration).
alter type status_veiculo add value if not exists 'inativo';
alter type status_veiculo add value if not exists 'vistoria_pendente';
alter type status_veiculo add value if not exists 'em_evento';

-- ----------------------------------------------------------------------------
-- B) Faturamento por veiculo + Fatura/ItemFatura
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'tipo_faturamento') then
    create type tipo_faturamento as enum ('AGRUPADO_ASSOCIADO', 'INDIVIDUAL_VEICULO');
  end if;
end $$;

alter table veiculos
  add column if not exists tipo_faturamento tipo_faturamento not null default 'AGRUPADO_ASSOCIADO';

do $$ begin
  if not exists (select 1 from pg_type where typname = 'status_fatura') then
    create type status_fatura as enum ('ABERTA', 'PAGA', 'CANCELADA');
  end if;
end $$;

-- Fatura: consolidada (AGRUPADO, 1 por cliente/competencia) ou individual
-- (INDIVIDUAL, 1 por veiculo/competencia). Cada fatura e um snapshot: alternar
-- o modo do veiculo afeta so as competencias futuras, nunca as ja emitidas.
create table if not exists faturas (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references clientes(id) on delete restrict,
  regional_id      uuid references regionais(id) on delete set null,
  tipo_faturamento tipo_faturamento not null,
  veiculo_id       uuid references veiculos(id) on delete set null, -- setado p/ INDIVIDUAL
  competencia      date not null,                                   -- 1o dia do mes de referencia
  valor_total      numeric(12,2) not null default 0,
  vencimento       date,
  status           status_fatura not null default 'ABERTA',
  titulo_id        uuid references titulos_financeiros(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_faturas_cliente on faturas (cliente_id, competencia);
create index if not exists idx_faturas_veiculo on faturas (veiculo_id);
create unique index if not exists uq_fatura_agrupada
  on faturas (cliente_id, competencia) where tipo_faturamento = 'AGRUPADO_ASSOCIADO';
create unique index if not exists uq_fatura_individual
  on faturas (veiculo_id, competencia) where tipo_faturamento = 'INDIVIDUAL_VEICULO';

create table if not exists fatura_itens (
  id         uuid primary key default gen_random_uuid(),
  fatura_id  uuid not null references faturas(id) on delete cascade,
  veiculo_id uuid references veiculos(id) on delete set null,
  descricao  text not null,
  valor      numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_fatura_itens_fatura on fatura_itens (fatura_id);

create trigger trg_faturas_updated before update on faturas
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- C) Opcionais com limite por janela flutuante
-- ----------------------------------------------------------------------------
alter table produtos
  add column if not exists tem_limite_uso     boolean not null default false,
  add column if not exists quantidade_limite  integer not null default 1,
  add column if not exists janela_dias_limite integer not null default 365;

-- ============================================================================
-- MOTOR
-- ============================================================================

-- Elegibilidade de opcionais do veiculo por JANELA FLUTUANTE: conta os eventos
-- do mesmo tipo (produtos.tipo_evento_id) nos ultimos janela_dias_limite a
-- partir de hoje (nao por ano civil).
create or replace function opcionais_elegibilidade(p_veiculo_id uuid)
returns table (
  produto_id        uuid,
  nome              text,
  quantidade_limite integer,
  janela_dias       integer,
  usados            bigint,
  elegivel          boolean,
  ultimo_uso        date
)
language sql stable
as $$
  select pr.id, pr.nome, pr.quantidade_limite, pr.janela_dias_limite,
         count(e.id) as usados,
         (count(e.id) < pr.quantidade_limite) as elegivel,
         max(e.data_ocorrencia) as ultimo_uso
    from produtos pr
    left join eventos_sinistro e
      on e.veiculo_id = p_veiculo_id
     and e.tipo_evento_id = pr.tipo_evento_id
     and e.data_ocorrencia >= current_date - pr.janela_dias_limite
   where pr.tem_limite_uso = true and pr.status = true
   group by pr.id, pr.nome, pr.quantidade_limite, pr.janela_dias_limite
   order by pr.nome;
$$;

-- Alterna o modo de faturamento do veiculo (a qualquer momento do contrato).
create or replace function definir_faturamento_veiculo(p_veiculo_id uuid, p_tipo tipo_faturamento)
returns veiculos
language plpgsql security definer set search_path = public
as $$
declare v veiculos;
begin
  if not is_staff() then
    raise exception 'Sem permissao para alterar faturamento';
  end if;
  update veiculos set tipo_faturamento = p_tipo, updated_at = now()
   where id = p_veiculo_id
   returning * into v;
  if v.id is null then raise exception 'Veiculo nao encontrado'; end if;
  return v;
end;
$$;

-- Gera as faturas do cliente para a competencia, respeitando o modo de cada
-- veiculo. Idempotente por competencia (protege o historico): se a fatura ja
-- existe, nao recria. Valor por veiculo vem do motor de cotacao (cotar_plano).
create or replace function gerar_faturas_cliente(
  p_cliente_id uuid,
  p_competencia date,
  p_vencimento date default null
)
returns setof faturas
language plpgsql security definer set search_path = public
as $$
declare
  v        veiculos;
  f_agrup  faturas;
  f_ind    faturas;
  v_reg    uuid;
  v_val    numeric;
  v_total  numeric := 0;
  v_venc   date := coalesce(p_vencimento, (date_trunc('month', p_competencia) + interval '1 month 9 days')::date);
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;
  select regional_id into v_reg from clientes where id = p_cliente_id;

  -- AGRUPADO: uma fatura consolidada com um item por veiculo agrupado.
  if exists (
        select 1 from veiculos
         where cliente_id = p_cliente_id and tipo_faturamento = 'AGRUPADO_ASSOCIADO' and status <> 'baixado'
      )
     and not exists (
        select 1 from faturas
         where cliente_id = p_cliente_id and competencia = p_competencia and tipo_faturamento = 'AGRUPADO_ASSOCIADO'
      )
  then
    insert into faturas (cliente_id, regional_id, tipo_faturamento, competencia, vencimento, valor_total)
      values (p_cliente_id, v_reg, 'AGRUPADO_ASSOCIADO', p_competencia, v_venc, 0)
      returning * into f_agrup;
    for v in
      select * from veiculos
       where cliente_id = p_cliente_id and tipo_faturamento = 'AGRUPADO_ASSOCIADO' and status <> 'baixado'
    loop
      v_val := coalesce((cotar_plano(coalesce(v.valor_fipe, 0), v.tipo_veiculo_id, v.plano_protecao_id)->>'valor_total_mensalidade')::numeric, 0);
      insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
        values (f_agrup.id, v.id, coalesce(v.placa, '') || ' - ' || coalesce(v.modelo, 'veiculo'), v_val);
      v_total := v_total + v_val;
    end loop;
    update faturas set valor_total = v_total where id = f_agrup.id;
    select * into f_agrup from faturas where id = f_agrup.id;
    return next f_agrup;
  end if;

  -- INDIVIDUAL: uma fatura por veiculo desmembrado.
  for v in
    select * from veiculos
     where cliente_id = p_cliente_id and tipo_faturamento = 'INDIVIDUAL_VEICULO' and status <> 'baixado'
  loop
    if not exists (
          select 1 from faturas
           where veiculo_id = v.id and competencia = p_competencia and tipo_faturamento = 'INDIVIDUAL_VEICULO'
        )
    then
      v_val := coalesce((cotar_plano(coalesce(v.valor_fipe, 0), v.tipo_veiculo_id, v.plano_protecao_id)->>'valor_total_mensalidade')::numeric, 0);
      insert into faturas (cliente_id, regional_id, tipo_faturamento, veiculo_id, competencia, vencimento, valor_total)
        values (p_cliente_id, v_reg, 'INDIVIDUAL_VEICULO', v.id, p_competencia, v_venc, v_val)
        returning * into f_ind;
      insert into fatura_itens (fatura_id, veiculo_id, descricao, valor)
        values (f_ind.id, v.id, coalesce(v.placa, '') || ' - ' || coalesce(v.modelo, 'veiculo'), v_val);
      return next f_ind;
    end if;
  end loop;

  return;
end;
$$;

-- ============================================================================
-- RLS
-- ============================================================================
alter table faturas      enable row level security;
alter table fatura_itens enable row level security;

create policy faturas_select on faturas for select to authenticated using (
  tem_acesso_global() or pode_regional(regional_id) or cliente_id = auth_cliente_id()
);
create policy faturas_write on faturas for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

create policy fatura_itens_select on fatura_itens for select to authenticated using (
  exists (
    select 1 from faturas f
     where f.id = fatura_id
       and (tem_acesso_global() or pode_regional(f.regional_id) or f.cliente_id = auth_cliente_id())
  )
);
create policy fatura_itens_write on fatura_itens for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

grant select, insert, update, delete on faturas, fatura_itens to authenticated;
grant execute on function opcionais_elegibilidade(uuid) to authenticated;
grant execute on function definir_faturamento_veiculo(uuid, tipo_faturamento) to authenticated;
grant execute on function gerar_faturas_cliente(uuid, date, date) to authenticated;

-- ============================================================================
-- SEED: marca alguns opcionais com limite por janela flutuante (exemplos SAC)
-- ============================================================================
insert into tipos_evento (nome) values ('Vidros'), ('Guincho / Assistencia')
  on conflict (nome) do nothing;

-- Vidros/Para-brisa: 1 uso a cada 365 dias.
update produtos set tem_limite_uso = true, quantidade_limite = 1, janela_dias_limite = 365,
       tipo_evento_id = (select id from tipos_evento where nome = 'Vidros')
 where nome in ('Protecao Parabrisas', 'Vidros Basicos', 'Kit Total Vidros',
                'Protecao de Vidros III', 'Protecao de Vidros Completa');

-- Carro Reserva / Reboque: 2 usos a cada 365 dias.
update produtos set tem_limite_uso = true, quantidade_limite = 2, janela_dias_limite = 365,
       tipo_evento_id = (select id from tipos_evento where nome = 'Guincho / Assistencia')
 where nome in ('Carro Reserva 7 dias', 'Carro Reserva 10 dias', 'Carro Reserva 15 dias', 'Carro Reserva 30 dias');
