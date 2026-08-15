-- ============================================================================
-- SCar :: 0027_assistencia_centro_custo.sql
-- REFINO FINANCEIRO/OPERACIONAL DA ASSISTENCIA 24H:
--   A) CENTRO DE CUSTO: centro "Assistencia 24 Horas" (custo operacional direto)
--      criado no seed e aplicado OBRIGATORIAMENTE a todo lancamento gerado pelo
--      modulo. Prestadores seguem no cadastro unico de `fornecedores` e o
--      pagamento continua no fluxo padrao de Contas a Pagar (nada isolado).
--   B) EDICAO DINAMICA DA OS: `atualizar_acionamento` (valor, KM, destino,
--      prazo, observacoes), `trocar_prestador_acionamento` (com cancelamento do
--      lancamento anterior e criacao do novo) e cancelamento com justificativa
--      OBRIGATORIA.
--   C) SINCRONIA COM CONTAS A PAGAR: `sincronizar_lancamento_acionamento`
--      recalcula/atualiza o titulo enquanto ele nao foi pago; se ja houve baixa,
--      nao mexe no pago e registra a divergencia na auditoria.
--   D) AUDITORIA: `acionamento_edicoes` (campo, de, para, quem, quando, motivo)
--      alimentada por trigger — pega ate alteracao feita fora das funcoes.
--   E) RELATORIOS: `gerar_dre`/`gerar_dre_resumo` ganham filtro por CENTRO DE
--      CUSTO e passam a considerar as baixas de Contas a Pagar/Receber; novo
--      `resumo_por_centro_custo` (receitas x despesas por centro).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) Centro de custo da operacao 24h
-- ----------------------------------------------------------------------------
create unique index if not exists uq_centros_custo_codigo on centros_custo (codigo) where codigo is not null;

insert into centros_custo (nome, codigo, ativo)
  select 'Assistencia 24 Horas', 'ASSIST24', true
   where not exists (select 1 from centros_custo where codigo = 'ASSIST24');

-- Resolve (e cria, se faltar) o centro de custo do modulo.
create or replace function centro_custo_assistencia()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id from centros_custo where codigo = 'ASSIST24';
  if v_id is null then
    insert into centros_custo (nome, codigo, ativo)
      values ('Assistencia 24 Horas', 'ASSIST24', true)
      returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Lancamentos ja existentes do modulo passam a apontar para o centro de custo.
update lancamentos_financeiros l
   set centro_custo_id = centro_custo_assistencia()
  from acionamentos_assistencia a
 where a.lancamento_id = l.id and l.centro_custo_id is null;

-- ----------------------------------------------------------------------------
-- D) Auditoria das edicoes da OS
-- ----------------------------------------------------------------------------
create table if not exists acionamento_edicoes (
  id             uuid primary key default gen_random_uuid(),
  acionamento_id uuid not null references acionamentos_assistencia(id) on delete cascade,
  campo          text not null,
  valor_anterior text,
  valor_novo     text,
  motivo         text,
  usuario_id     uuid references usuarios(id) on delete set null,
  -- clock_timestamp (e nao now()) para que duas edicoes na MESMA transacao
  -- fiquem em ordem cronologica correta no historico.
  created_at     timestamptz not null default clock_timestamp()
);
create index if not exists idx_acion_edicoes on acionamento_edicoes (acionamento_id, created_at desc);

-- Registra automaticamente o que mudou (data/hora, operador, de -> para).
-- O motivo vem da variavel de sessao `scar.motivo_edicao`, setada pelas funcoes
-- de edicao; alteracoes diretas ficam sem motivo, mas continuam auditadas.
create or replace function fn_acionamento_auditoria()
returns trigger
language plpgsql
as $$
declare
  v_motivo text := nullif(current_setting('scar.motivo_edicao', true), '');
  v_uid    uuid := auth.uid();
begin
  if new.prestador_id is distinct from old.prestador_id then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'prestador',
              (select razao_social from fornecedores where id = old.prestador_id),
              (select razao_social from fornecedores where id = new.prestador_id),
              v_motivo, v_uid);
  end if;
  if new.valor_servico is distinct from old.valor_servico then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'valor_servico', old.valor_servico::text, new.valor_servico::text, v_motivo, v_uid);
  end if;
  if new.km_excedente is distinct from old.km_excedente then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'km_excedente', old.km_excedente::text, new.km_excedente::text, v_motivo, v_uid);
  end if;
  if new.valor_km_excedente is distinct from old.valor_km_excedente then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'valor_km_excedente', old.valor_km_excedente::text, new.valor_km_excedente::text, v_motivo, v_uid);
  end if;
  if new.valor_total is distinct from old.valor_total then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'valor_total', old.valor_total::text, new.valor_total::text, v_motivo, v_uid);
  end if;
  if new.destino is distinct from old.destino then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'destino', old.destino::text, new.destino::text, v_motivo, v_uid);
  end if;
  if new.km_percorrido is distinct from old.km_percorrido then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'km_percorrido', old.km_percorrido::text, new.km_percorrido::text, v_motivo, v_uid);
  end if;
  if new.prazo_estimado_min is distinct from old.prazo_estimado_min then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'prazo_estimado_min', old.prazo_estimado_min::text, new.prazo_estimado_min::text, v_motivo, v_uid);
  end if;
  if new.status is distinct from old.status then
    insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
      values (new.id, 'status', old.status::text, new.status::text,
              coalesce(v_motivo, new.cancelado_motivo), v_uid);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_acionamento_auditoria on acionamentos_assistencia;
create trigger trg_acionamento_auditoria
  after update on acionamentos_assistencia
  for each row execute function fn_acionamento_auditoria();

alter table acionamento_edicoes enable row level security;
create policy acion_edicoes_select on acionamento_edicoes for select to authenticated using (is_staff());
create policy acion_edicoes_insert on acionamento_edicoes for insert to authenticated with check (is_staff());
grant select, insert on acionamento_edicoes to authenticated;

-- ----------------------------------------------------------------------------
-- C) Sincronia OS -> Contas a Pagar
-- ----------------------------------------------------------------------------
-- Regras:
--   * OS sem lancamento e ja concluida  -> cria o lancamento;
--   * lancamento existente NAO pago     -> atualiza fornecedor/valor/descricao/
--     plano de contas/centro de custo;
--   * lancamento com baixa (pago total ou parcial) -> NAO altera; registra a
--     divergencia na auditoria para tratamento manual (estorno/complemento);
--   * OS cancelada                      -> cancela o lancamento nao pago.
create or replace function sincronizar_lancamento_acionamento(p_acionamento_id uuid)
returns lancamentos_financeiros
language plpgsql
security definer
set search_path = public
as $$
declare
  a       acionamentos_assistencia;
  s       servicos_assistencia;
  l       lancamentos_financeiros;
  v_placa text;
  v_desc  text;
  v_cc    uuid := centro_custo_assistencia();
begin
  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  select * into s from servicos_assistencia where id = a.servico_id;
  select placa into v_placa from veiculos where id = a.veiculo_id;

  v_desc := format('Assistencia 24h %s — %s (%s)',
                   coalesce(a.codigo_os, a.protocolo), s.descricao, coalesce(v_placa, ''));

  if a.lancamento_id is not null then
    select * into l from lancamentos_financeiros where id = a.lancamento_id;
  end if;

  -- OS cancelada: cancela o lancamento em aberto e desvincula.
  if a.status = 'CANCELADO' then
    if l.id is not null and l.status in ('pendente', 'atrasado') then
      update lancamentos_financeiros set status = 'cancelado', updated_at = now()
       where id = l.id returning * into l;
    elsif l.id is not null then
      insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
        values (a.id, 'contas_a_pagar', l.status::text, l.status::text,
                'OS cancelada, mas o lancamento ja tinha baixa — tratar estorno manualmente', auth.uid());
    end if;
    return l;
  end if;

  -- Ainda sem lancamento: so cria quando a OS esta concluida e tem valor.
  if l.id is null then
    if a.status = 'CONCLUIDO' and a.valor_total > 0 and a.prestador_id is not null then
      insert into lancamentos_financeiros (
        tipo, fornecedor_id, descricao, categoria_dre_id, centro_custo_id, regional_id,
        valor_original, data_emissao, data_vencimento, status
      ) values (
        'DESPESA', a.prestador_id, v_desc, s.categoria_dre_id, v_cc, a.regional_id,
        a.valor_total, current_date, current_date + 7, 'pendente'
      ) returning * into l;
      update acionamentos_assistencia set lancamento_id = l.id, updated_at = now() where id = a.id;
    end if;
    return l;
  end if;

  -- Lancamento ja pago (total ou parcial): nao mexe, apenas audita a divergencia.
  if l.status in ('quitado', 'pago_parcial') then
    if l.valor_original <> a.valor_total or l.fornecedor_id is distinct from a.prestador_id then
      insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
        values (a.id, 'contas_a_pagar', l.valor_original::text, a.valor_total::text,
                'Lancamento ja possui baixa — ajuste financeiro deve ser feito manualmente', auth.uid());
    end if;
    return l;
  end if;

  -- Em aberto: sincroniza tudo.
  update lancamentos_financeiros
     set fornecedor_id    = a.prestador_id,
         descricao        = v_desc,
         categoria_dre_id = s.categoria_dre_id,
         centro_custo_id  = v_cc,
         regional_id      = a.regional_id,
         valor_original   = a.valor_total,
         status           = case when status = 'cancelado' then 'pendente'::status_lancamento else status end,
         updated_at       = now()
   where id = l.id
   returning * into l;

  return l;
end;
$$;

-- ----------------------------------------------------------------------------
-- B) Edicao dinamica da OS
-- ----------------------------------------------------------------------------
-- Valores, trajeto e KM. Null = mantem o valor atual. Recalcula o total e
-- sincroniza o Contas a Pagar.
create or replace function atualizar_acionamento(
  p_acionamento_id uuid,
  p_valor_servico  numeric default null,
  p_km_excedente   numeric default null,
  p_valor_km       numeric default null,
  p_km_percorrido  numeric default null,
  p_destino        jsonb   default null,
  p_prazo_min      integer default null,
  p_observacoes    text    default null,
  p_motivo         text    default null
)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare
  a        acionamentos_assistencia;
  s        servicos_assistencia;
  v_valor  numeric;
  v_km     numeric;
  v_km_un  numeric;
  v_km_tot numeric;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  if a.status = 'CANCELADO' then raise exception 'Acionamento cancelado nao pode ser editado'; end if;
  select * into s from servicos_assistencia where id = a.servico_id;

  perform set_config('scar.motivo_edicao', coalesce(p_motivo, ''), true);

  v_valor := coalesce(p_valor_servico, a.valor_servico);
  v_km    := case when s.cobra_km_excedente then coalesce(p_km_excedente, a.km_excedente) else 0 end;
  v_km_un := coalesce(
    p_valor_km,
    case when a.km_excedente > 0 then a.valor_km_excedente / nullif(a.km_excedente, 0) end,
    (select valor_km from prestador_servicos
      where fornecedor_id = a.prestador_id and servico_id = a.servico_id),
    s.valor_km_excedente
  );
  v_km_tot := round(v_km * coalesce(v_km_un, 0), 2);

  update acionamentos_assistencia
     set valor_servico      = v_valor,
         km_excedente       = v_km,
         valor_km_excedente = v_km_tot,
         valor_total        = round(v_valor + v_km_tot, 2),
         km_percorrido      = coalesce(p_km_percorrido, km_percorrido),
         destino            = coalesce(p_destino, destino),
         prazo_estimado_min = coalesce(p_prazo_min, prazo_estimado_min),
         observacoes        = coalesce(p_observacoes, observacoes),
         updated_at         = now()
   where id = p_acionamento_id
   returning * into a;

  perform sincronizar_lancamento_acionamento(a.id);
  perform set_config('scar.motivo_edicao', '', true);
  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  return a;
end;
$$;

-- Troca de prestador (desistencia/demora): cancela o lancamento anterior em
-- aberto e gera o novo para o substituto. Justificativa obrigatoria.
create or replace function trocar_prestador_acionamento(
  p_acionamento_id uuid,
  p_fornecedor_id  uuid,
  p_motivo         text,
  p_valor_servico  numeric default null,
  p_valor_km       numeric default null,
  p_prazo_min      integer default null
)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare
  a        acionamentos_assistencia;
  s        servicos_assistencia;
  l        lancamentos_financeiros;
  v_valor  numeric;
  v_km_un  numeric;
  v_km_tot numeric;
  v_anterior uuid;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Informe a justificativa da troca de prestador';
  end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  if a.status = 'CANCELADO' then raise exception 'Acionamento cancelado'; end if;
  if p_fornecedor_id is null then raise exception 'Informe o novo prestador'; end if;
  select * into s from servicos_assistencia where id = a.servico_id;

  v_anterior := a.prestador_id;
  perform set_config('scar.motivo_edicao', p_motivo, true);

  v_valor := coalesce(
    p_valor_servico,
    (select valor_acordado from prestador_servicos
      where fornecedor_id = p_fornecedor_id and servico_id = a.servico_id),
    s.valor_padrao
  );
  v_km_un := coalesce(
    p_valor_km,
    (select valor_km from prestador_servicos
      where fornecedor_id = p_fornecedor_id and servico_id = a.servico_id),
    s.valor_km_excedente
  );
  v_km_tot := case when s.cobra_km_excedente then round(a.km_excedente * coalesce(v_km_un, 0), 2) else 0 end;

  -- Lancamento do prestador anterior: cancela se ainda estiver em aberto.
  if a.lancamento_id is not null then
    select * into l from lancamentos_financeiros where id = a.lancamento_id;
    if l.id is not null and l.status in ('pendente', 'atrasado') then
      update lancamentos_financeiros set status = 'cancelado', updated_at = now() where id = l.id;
      insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
        values (a.id, 'contas_a_pagar', 'lancamento cancelado (prestador anterior)', 'novo lancamento sera gerado',
                p_motivo, auth.uid());
      update acionamentos_assistencia set lancamento_id = null where id = a.id;
    else
      -- Ja pago: mantem o lancamento anterior e registra para conferencia.
      insert into acionamento_edicoes (acionamento_id, campo, valor_anterior, valor_novo, motivo, usuario_id)
        values (a.id, 'contas_a_pagar', 'lancamento anterior com baixa', 'novo lancamento sera gerado ao concluir',
                'Troca de prestador com pagamento ja realizado — conferir estorno', auth.uid());
      update acionamentos_assistencia set lancamento_id = null where id = a.id;
    end if;
  end if;

  update acionamentos_assistencia
     set prestador_id       = p_fornecedor_id,
         valor_servico      = v_valor,
         valor_km_excedente = v_km_tot,
         valor_total        = round(v_valor + v_km_tot, 2),
         prazo_estimado_min = coalesce(p_prazo_min, prazo_estimado_min),
         status             = case when status = 'CONCLUIDO' then status else 'AUTORIZADO'::status_acionamento end,
         voucher_enviado_em = null,   -- o novo prestador precisa receber o voucher
         updated_at         = now()
   where id = p_acionamento_id
   returning * into a;

  update acionamento_cotacoes set escolhida = (fornecedor_id = p_fornecedor_id)
   where acionamento_id = p_acionamento_id;

  perform sincronizar_lancamento_acionamento(a.id);
  perform set_config('scar.motivo_edicao', '', true);
  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  return a;
end;
$$;

-- Cancelamento com justificativa OBRIGATORIA (associado ou prestador desistiu).
create or replace function cancelar_acionamento(p_acionamento_id uuid, p_motivo text)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare a acionamentos_assistencia;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Informe a justificativa do cancelamento';
  end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  if a.status = 'CANCELADO' then return a; end if;

  perform set_config('scar.motivo_edicao', p_motivo, true);
  update acionamentos_assistencia
     set status = 'CANCELADO', cancelado_motivo = p_motivo, updated_at = now()
   where id = p_acionamento_id
   returning * into a;

  perform sincronizar_lancamento_acionamento(a.id);
  perform set_config('scar.motivo_edicao', '', true);
  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  return a;
end;
$$;

-- Conclusao passa a delegar a criacao do lancamento para o sincronizador
-- (garante centro de custo e evita duplicidade).
create or replace function concluir_acionamento(
  p_acionamento_id uuid,
  p_km_percorrido  numeric default null,
  p_observacao     text default null,
  p_vencimento     date default null
)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare
  a acionamentos_assistencia;
  l lancamentos_financeiros;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  if a.status = 'CANCELADO' then raise exception 'Acionamento cancelado'; end if;
  if a.prestador_id is null then raise exception 'Confirme o prestador (OS) antes de concluir'; end if;

  update acionamentos_assistencia
     set status = 'CONCLUIDO',
         km_percorrido = coalesce(p_km_percorrido, km_percorrido),
         observacoes = coalesce(observacoes, '') ||
                       case when p_observacao is null then '' else E'\n' || p_observacao end,
         concluido_em = coalesce(concluido_em, now()),
         updated_at = now()
   where id = p_acionamento_id
   returning * into a;

  l := sincronizar_lancamento_acionamento(a.id);
  if l.id is not null and p_vencimento is not null and l.status in ('pendente', 'atrasado') then
    update lancamentos_financeiros set data_vencimento = p_vencimento, updated_at = now() where id = l.id;
  end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  return a;
end;
$$;

-- Historico de edicoes da OS (auditoria para a tela).
create or replace function historico_edicoes_acionamento(p_acionamento_id uuid)
returns table (
  id             uuid,
  campo          text,
  valor_anterior text,
  valor_novo     text,
  motivo         text,
  operador       text,
  created_at     timestamptz
)
language sql stable
as $$
  select e.id, e.campo, e.valor_anterior, e.valor_novo, e.motivo,
         coalesce(u.nome, 'sistema'), e.created_at
    from acionamento_edicoes e
    left join usuarios u on u.id = e.usuario_id
   where e.acionamento_id = p_acionamento_id
   order by e.created_at desc;
$$;

-- ----------------------------------------------------------------------------
-- E) Relatorios: filtro por centro de custo
-- ----------------------------------------------------------------------------
-- Nova versao do DRE: alem das fontes originais (caixa, titulos pagos e notas
-- de evento), passa a considerar as BAIXAS de Contas a Pagar/Receber — que e
-- onde a despesa da Assistencia 24h aparece — e aceita filtro por centro de
-- custo. A versao de 3 argumentos delega para esta (sem filtro de centro).
create or replace function gerar_dre(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid,
  p_centro_custo_id uuid
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
    select cat.tipo as grupo, cat.codigo_estruturado as categoria_codigo, cat.nome as categoria_nome,
           case when m.tipo = 'RECEITA' then m.valor else -m.valor end as valor
      from movimentacoes_caixa m
      join categorias_dre cat on cat.id = m.categoria_dre_id
     where m.data_competencia between p_data_inicio and p_data_fim
       and m.status <> 'cancelado'
       and (p_regional_id is null or m.regional_id = p_regional_id)
       and p_centro_custo_id is null   -- caixa nao tem centro de custo

    union all

    -- Receita recorrente reconhecida por titulos pagos (sem lancamento no caixa)
    select 'RECEITA'::tipo_categoria_dre, '1.1.00', 'Receita de Mensalidades (Titulos)', t.valor_pago
      from titulos_financeiros t
      join veiculos v on v.id = t.veiculo_id
     where t.status = 'pago'
       and t.data_pagamento between p_data_inicio and p_data_fim
       and not exists (select 1 from movimentacoes_caixa mc where mc.titulo_id = t.id)
       and (p_regional_id is null or v.regional_id = p_regional_id)
       and p_centro_custo_id is null

    union all

    -- Custo de sinistro: notas fiscais de eventos (custo variavel)
    select 'CUSTO_VARIAVEL'::tipo_categoria_dre, '3.1.00', 'Custo com Sinistros (Notas Fiscais)', -nf.valor_nota
      from notas_fiscais_evento nf
      join eventos_sinistro e on e.id = nf.evento_id
     where nf.data_emissao between p_data_inicio and p_data_fim
       and (p_regional_id is null or e.regional_id = p_regional_id)
       and p_centro_custo_id is null

    union all

    -- Contas a pagar/receber liquidadas (regime de caixa), por centro de custo.
    -- E aqui que entra a despesa da Assistencia 24h (centro ASSIST24).
    select coalesce(cat.tipo::text, case when l.tipo = 'RECEITA' then 'RECEITA' else 'DESPESA_FIXA' end)::tipo_categoria_dre,
           coalesce(cat.codigo_estruturado, case when l.tipo = 'RECEITA' then '1.9.00' else '4.9.00' end),
           coalesce(cat.nome, case when l.tipo = 'RECEITA' then 'Outras Receitas' else 'Outras Despesas' end),
           case when l.tipo = 'RECEITA' then b.valor_liquido else -b.valor_liquido end
      from baixas_financeiras b
      join lancamentos_financeiros l on l.id = b.lancamento_id
      left join categorias_dre cat on cat.id = l.categoria_dre_id
     where b.data_pagamento between p_data_inicio and p_data_fim
       and l.status <> 'cancelado'
       and (p_regional_id is null or l.regional_id = p_regional_id)
       and (p_centro_custo_id is null or l.centro_custo_id = p_centro_custo_id)
  )
  select grupo, categoria_codigo, categoria_nome, round(sum(valor), 2) as total
    from base
   group by grupo, categoria_codigo, categoria_nome
   order by grupo, categoria_codigo;
$$;

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
  select * from gerar_dre(p_data_inicio, p_data_fim, p_regional_id, null::uuid);
$$;

create or replace function gerar_dre_resumo(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid,
  p_centro_custo_id uuid
)
returns table (
  receita_bruta     numeric,
  custo_variavel    numeric,
  despesa_fixa      numeric,
  resultado_liquido numeric,
  margem_percentual numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with d as (
    select grupo, total from gerar_dre(p_data_inicio, p_data_fim, p_regional_id, p_centro_custo_id)
  ),
  agg as (
    select
      coalesce(sum(total) filter (where grupo = 'RECEITA'), 0)        as receita,
      coalesce(sum(total) filter (where grupo = 'CUSTO_VARIAVEL'), 0) as custo,
      coalesce(sum(total) filter (where grupo = 'DESPESA_FIXA'), 0)   as despesa
    from d
  )
  select receita, custo, despesa,
         receita + custo + despesa,
         case when receita > 0 then round((receita + custo + despesa) / receita * 100, 2) else 0 end
    from agg;
$$;

-- Receitas x Despesas por CENTRO DE CUSTO (isola a operacao 24h).
create or replace function resumo_por_centro_custo(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null
)
returns table (
  centro_custo_id uuid,
  centro_custo    text,
  codigo          text,
  receitas        numeric,
  despesas        numeric,
  resultado       numeric,
  lancamentos     integer
)
language sql
stable
security definer
set search_path = public
as $$
  select cc.id,
         coalesce(cc.nome, 'Sem centro de custo'),
         cc.codigo,
         round(coalesce(sum(b.valor_liquido) filter (where l.tipo = 'RECEITA'), 0), 2),
         round(coalesce(sum(b.valor_liquido) filter (where l.tipo = 'DESPESA'), 0), 2),
         round(
           coalesce(sum(b.valor_liquido) filter (where l.tipo = 'RECEITA'), 0)
           - coalesce(sum(b.valor_liquido) filter (where l.tipo = 'DESPESA'), 0), 2),
         count(*)::int
    from baixas_financeiras b
    join lancamentos_financeiros l on l.id = b.lancamento_id
    left join centros_custo cc on cc.id = l.centro_custo_id
   where b.data_pagamento between p_data_inicio and p_data_fim
     and l.status <> 'cancelado'
     and (p_regional_id is null or l.regional_id = p_regional_id)
   group by cc.id, cc.nome, cc.codigo
   order by 6 desc;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
grant execute on function centro_custo_assistencia() to authenticated;
grant execute on function sincronizar_lancamento_acionamento(uuid) to authenticated;
grant execute on function atualizar_acionamento(uuid, numeric, numeric, numeric, numeric, jsonb, integer, text, text) to authenticated;
grant execute on function trocar_prestador_acionamento(uuid, uuid, text, numeric, numeric, integer) to authenticated;
grant execute on function historico_edicoes_acionamento(uuid) to authenticated;
grant execute on function gerar_dre(date, date, uuid, uuid) to authenticated;
grant execute on function gerar_dre_resumo(date, date, uuid, uuid) to authenticated;
grant execute on function resumo_por_centro_custo(date, date, uuid) to authenticated;
