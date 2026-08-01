-- ============================================================================
-- SCar :: 0002_functions_triggers.sql
-- Regras de negocio em PL/pgSQL: protocolo, tramitacao, comissoes e DRE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers de autenticacao (usados tambem pelas policies de RLS em 0003).
-- SECURITY DEFINER + search_path fixo para leitura segura de usuarios.
-- ----------------------------------------------------------------------------
create or replace function auth_papel()
returns papel_usuario
language sql
stable
security definer
set search_path = public
as $$
  select papel from public.usuarios where id = auth.uid();
$$;

create or replace function auth_regional_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select regional_id from public.usuarios where id = auth.uid();
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_papel() = 'admin', false);
$$;

-- id do cliente vinculado ao usuario logado (Portal do Associado)
create or replace function auth_cliente_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.clientes where auth_user_id = auth.uid();
$$;

-- ============================================================================
-- 3.1 :: Geracao do Numero de Protocolo (EVT-YYYYMMDD-XXXX)
-- Sequencial diario, unico. XXXX reinicia a cada dia.
-- ============================================================================
create or replace function fn_gerar_numero_protocolo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data   text := to_char(coalesce(new.created_at, now()), 'YYYYMMDD');
  v_seq    integer;
begin
  if new.numero_protocolo is not null then
    return new;
  end if;

  -- Lock consultivo por dia para evitar corrida na numeracao concorrente.
  perform pg_advisory_xact_lock(hashtext('protocolo_' || v_data));

  select coalesce(max(
           (regexp_replace(numero_protocolo, '^EVT-\d{8}-', ''))::integer
         ), 0) + 1
    into v_seq
    from eventos_sinistro
   where numero_protocolo like 'EVT-' || v_data || '-%';

  new.numero_protocolo := 'EVT-' || v_data || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

create trigger trg_gerar_protocolo
  before insert on eventos_sinistro
  for each row execute function fn_gerar_numero_protocolo();

-- Registra automaticamente a abertura no historico do protocolo.
create or replace function fn_log_abertura_protocolo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into historico_protocolo (
    evento_id, usuario_origem_id, usuario_destino_id,
    acao_realizada, status_anterior, status_novo, observacoes
  ) values (
    new.id, auth.uid(), new.operador_atual_id,
    'ABERTURA_PROTOCOLO', null, new.status,
    'Protocolo ' || new.numero_protocolo || ' criado.'
  );
  return new;
end;
$$;

create trigger trg_log_abertura_protocolo
  after insert on eventos_sinistro
  for each row execute function fn_log_abertura_protocolo();

-- ============================================================================
-- 3.2 :: Tramitacao de Protocolos
-- transferir_protocolo(evento, destino, parecer[, novo_status])
-- Atualiza operador_atual_id e grava o historico atomicamente.
-- ============================================================================
create or replace function transferir_protocolo(
  p_evento_id          uuid,
  p_usuario_destino_id uuid,
  p_parecer            text default null,
  p_novo_status        status_evento default null
)
returns eventos_sinistro
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origem   uuid := auth.uid();
  v_atual    eventos_sinistro;
  v_status_anterior status_evento;
  v_status_novo status_evento;
begin
  select * into v_atual from eventos_sinistro where id = p_evento_id for update;
  if not found then
    raise exception 'Evento % nao encontrado', p_evento_id using errcode = 'no_data_found';
  end if;

  v_status_anterior := v_atual.status;                    -- guarda status antes do update
  v_status_novo := coalesce(p_novo_status, v_atual.status);

  update eventos_sinistro
     set operador_atual_id = p_usuario_destino_id,
         status            = v_status_novo
   where id = p_evento_id
   returning * into v_atual;

  insert into historico_protocolo (
    evento_id, usuario_origem_id, usuario_destino_id,
    acao_realizada, status_anterior, status_novo, observacoes
  ) values (
    p_evento_id, v_origem, p_usuario_destino_id,
    'TRANSFERENCIA', v_status_anterior, v_status_novo, p_parecer
  );

  return v_atual;
end;
$$;

-- ============================================================================
-- 3.3 :: Calculo Automatico de Comissoes
-- Ao liquidar um titulo (status -> 'pago'), gera a comissao do vendedor
-- vinculado ao veiculo. Primeira parcela paga do veiculo = adesao.
-- ============================================================================
create or replace function fn_calcular_comissao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor   vendedores;
  v_is_adesao  boolean;
  v_taxa       numeric(6,4);
  v_base       numeric(12,2);
begin
  -- dispara apenas na transicao para 'pago' (ignora se ja estava pago)
  if new.status <> 'pago' or old.status is not distinct from 'pago' then
    return new;
  end if;
  if new.veiculo_id is null then
    return new;
  end if;

  select v.* into v_vendedor
    from veiculos ve
    join vendedores v on v.id = ve.vendedor_id
   where ve.id = new.veiculo_id;

  if not found then
    return new;  -- veiculo sem vendedor: nada a comissionar
  end if;

  -- adesao = primeiro titulo pago deste veiculo
  select not exists (
    select 1 from comissoes_vendas c
    where c.veiculo_id = new.veiculo_id and c.is_adesao = true
  ) into v_is_adesao;

  v_taxa := case when v_is_adesao
                 then v_vendedor.taxa_comissao_adesao
                 else v_vendedor.taxa_comissao_recorrente end;

  v_base := coalesce(new.valor_pago, new.valor);

  insert into comissoes_vendas (
    vendedor_id, veiculo_id, titulo_id, valor_comissao, is_adesao, status_pagamento
  ) values (
    v_vendedor.id, new.veiculo_id, new.id, round(v_base * v_taxa, 2), v_is_adesao, 'pendente'
  )
  on conflict (titulo_id) do nothing;   -- idempotente

  return new;
end;
$$;

create trigger trg_calcular_comissao
  after update of status on titulos_financeiros
  for each row execute function fn_calcular_comissao();

-- Marca titulos vencidos (chamado por cron/agendador do Supabase, opcional).
create or replace function marcar_titulos_vencidos()
returns integer
language sql
as $$
  with upd as (
    update titulos_financeiros
       set status = 'vencido'
     where status = 'pendente' and data_vencimento < current_date
     returning 1
  )
  select count(*)::int from upd;
$$;

-- ============================================================================
-- 3.4 :: DRE (Demonstracao do Resultado do Exercicio)
-- Agrega receitas, custos variaveis (inclui custo de sinistro) e despesas
-- fixas por categoria, no periodo informado. Filtro opcional por regional.
-- ============================================================================
create or replace function gerar_dre(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null
)
returns table (
  grupo              tipo_categoria_dre,
  categoria_codigo   text,
  categoria_nome     text,
  total              numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    -- Movimentacoes de caixa classificadas por categoria DRE
    select cat.tipo  as grupo,
           cat.codigo_estruturado as categoria_codigo,
           cat.nome  as categoria_nome,
           case when m.tipo = 'RECEITA' then m.valor else -m.valor end as valor
      from movimentacoes_caixa m
      join categorias_dre cat on cat.id = m.categoria_dre_id
     where m.data_competencia between p_data_inicio and p_data_fim
       and m.status <> 'cancelado'
       and (p_regional_id is null or m.regional_id = p_regional_id)

    union all

    -- Receita recorrente reconhecida por titulos pagos (caso nao lancados no caixa)
    select 'RECEITA'::tipo_categoria_dre,
           '1.1.00', 'Receita de Mensalidades (Titulos)',
           t.valor_pago
      from titulos_financeiros t
      join veiculos v on v.id = t.veiculo_id
     where t.status = 'pago'
       and t.data_pagamento between p_data_inicio and p_data_fim
       and not exists (select 1 from movimentacoes_caixa mc where mc.titulo_id = t.id)
       and (p_regional_id is null or v.regional_id = p_regional_id)

    union all

    -- Custo de sinistro: notas fiscais de eventos (custo variavel)
    select 'CUSTO_VARIAVEL'::tipo_categoria_dre,
           '3.1.00', 'Custo com Sinistros (Notas Fiscais)',
           -nf.valor_nota
      from notas_fiscais_evento nf
      join eventos_sinistro e on e.id = nf.evento_id
     where nf.data_emissao between p_data_inicio and p_data_fim
       and (p_regional_id is null or e.regional_id = p_regional_id)
  )
  select grupo, categoria_codigo, categoria_nome, round(sum(valor), 2) as total
    from base
   group by grupo, categoria_codigo, categoria_nome
   order by grupo, categoria_codigo;
$$;

-- Resumo consolidado do DRE (receita liquida, margem, resultado).
create or replace function gerar_dre_resumo(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null
)
returns table (
  receita_bruta   numeric,
  custo_variavel  numeric,
  despesa_fixa    numeric,
  resultado_liquido numeric,
  margem_percentual numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with d as (
    select grupo, total from gerar_dre(p_data_inicio, p_data_fim, p_regional_id)
  ),
  agg as (
    select
      coalesce(sum(total) filter (where grupo = 'RECEITA'), 0)          as receita,
      coalesce(sum(total) filter (where grupo = 'CUSTO_VARIAVEL'), 0)   as custo,
      coalesce(sum(total) filter (where grupo = 'DESPESA_FIXA'), 0)     as despesa
    from d
  )
  select
    receita,
    custo,
    despesa,
    (receita + custo + despesa) as resultado_liquido,
    case when receita <> 0
         then round(((receita + custo + despesa) / receita) * 100, 2)
         else 0 end as margem_percentual
  from agg;
$$;

-- ============================================================================
-- Recalculo do valor_total de uma cotacao a partir dos itens.
-- ============================================================================
create or replace function fn_recalcular_cotacao()
returns trigger
language plpgsql
as $$
declare
  v_cotacao_id uuid := coalesce(new.cotacao_id, old.cotacao_id);
begin
  update cotacoes_pecas
     set valor_total = coalesce((
           select sum(quantidade * valor_unitario)
             from itens_cotacao where cotacao_id = v_cotacao_id
         ), 0)
   where id = v_cotacao_id;
  return null;
end;
$$;

create trigger trg_recalcular_cotacao
  after insert or update or delete on itens_cotacao
  for each row execute function fn_recalcular_cotacao();

-- ============================================================================
-- Provisiona perfil em public.usuarios ao criar auth.users (signup interno).
-- Metadados esperados em raw_user_meta_data: nome, papel, regional_id.
-- ============================================================================
create or replace function fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- So cria perfil interno se o metadata indicar papel (evita criar para associados do portal).
  if new.raw_user_meta_data ? 'papel' then
    insert into public.usuarios (id, nome, email, papel, regional_id)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'nome', new.email),
      new.email,
      (new.raw_user_meta_data->>'papel')::papel_usuario,
      nullif(new.raw_user_meta_data->>'regional_id', '')::uuid
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function fn_handle_new_user();
