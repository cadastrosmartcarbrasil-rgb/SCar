-- ============================================================================
-- 0030 — SAC: alertas do veiculo com resolucao + ordenacao padrao das listagens
--
-- BUG QUE ORIGINOU ESTA MIGRATION (placa EWG9B46): o card do SAC mostrava
-- "1 alerta" e a tela de edicao do veiculo nao mostrava nada. Causa: o SAC lia
-- as LINHAS de `veiculo_alertas` (ativo = true) e o formulario montava
-- checkboxes a partir do CATALOGO `tipos_alerta` filtrando `ativo = true` —
-- alerta cujo tipo foi desativado no catalogo (ou duplicado no veiculo) some da
-- tela, e o atendente fica sem como resolver.
--
-- (A) ALERTAS  — dedup dos ativos + indice unico parcial (um alerta ativo por
--     tipo por veiculo), colunas de resolucao e as funcoes que passam a ser a
--     FONTE UNICA das duas telas: `alertas_veiculo`, `abrir_alerta_veiculo` e
--     `resolver_alerta_veiculo`.
-- (B) ORDENACAO — `ordem_status_veiculo(status)` (ativo primeiro, inativo/
--     cancelado por ultimo) e `veiculos_do_cliente(cliente)`, que ja devolve a
--     lista do SAC ordenada e com os contadores (alertas/eventos/assistencia)
--     resolvidos no banco, em vez de 4 consultas separadas na rota.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) Alertas do veiculo
-- ----------------------------------------------------------------------------
alter table veiculo_alertas
  add column if not exists resolvido_por uuid references usuarios(id) on delete set null,
  add column if not exists resolucao_observacao text;

-- Duplicados ativos do mesmo tipo contavam 2x no SAC e apareciam como um unico
-- checkbox no formulario. Mantem o mais recente e resolve os demais.
update veiculo_alertas a
   set ativo = false,
       resolvido_em = coalesce(a.resolvido_em, now()),
       resolucao_observacao = coalesce(a.resolucao_observacao, 'Duplicado consolidado na migration 0030')
 where a.ativo
   and exists (
     select 1 from veiculo_alertas b
      where b.ativo
        and b.veiculo_id = a.veiculo_id
        and b.tipo_alerta_id = a.tipo_alerta_id
        and (b.created_at, b.id) > (a.created_at, a.id)
   );

create unique index if not exists uq_veiculo_alerta_ativo
  on veiculo_alertas (veiculo_id, tipo_alerta_id) where ativo;

-- Alertas do veiculo COM o tipo resolvido. Traz tambem os de tipo desativado no
-- catalogo (`tipo_ativo = false`) — sao exatamente os que sumiam da tela.
create or replace function alertas_veiculo(
  p_veiculo_id uuid,
  p_incluir_resolvidos boolean default false
) returns table (
  id uuid,
  veiculo_id uuid,
  tipo_alerta_id uuid,
  nome text,
  descricao text,
  severidade severidade_alerta,
  tipo_ativo boolean,
  mensagem text,
  ativo boolean,
  created_at timestamptz,
  criado_por text,
  resolvido_em timestamptz,
  resolvido_por_nome text,
  resolucao_observacao text
) language sql stable as $$
  select a.id, a.veiculo_id, a.tipo_alerta_id,
         t.nome, t.descricao, t.severidade, t.ativo,
         a.mensagem, a.ativo, a.created_at,
         uc.nome, a.resolvido_em, ur.nome, a.resolucao_observacao
    from veiculo_alertas a
    join tipos_alerta t on t.id = a.tipo_alerta_id
    left join usuarios uc on uc.id = a.created_by
    left join usuarios ur on ur.id = a.resolvido_por
   where a.veiculo_id = p_veiculo_id
     and (p_incluir_resolvidos or a.ativo)
   order by a.ativo desc,
            case t.severidade when 'ALTA' then 0 when 'MEDIA' then 1 else 2 end,
            a.created_at desc;
$$;

-- Abre (ou atualiza) o alerta do veiculo. Idempotente por tipo: se ja existe um
-- ativo do mesmo tipo, so atualiza a mensagem — nunca duplica a contagem.
create or replace function abrir_alerta_veiculo(
  p_veiculo_id uuid,
  p_tipo_alerta_id uuid,
  p_mensagem text default null
) returns veiculo_alertas language plpgsql security invoker as $$
declare
  v_alerta veiculo_alertas;
begin
  select * into v_alerta
    from veiculo_alertas
   where veiculo_id = p_veiculo_id and tipo_alerta_id = p_tipo_alerta_id and ativo;

  if found then
    update veiculo_alertas
       set mensagem = coalesce(p_mensagem, mensagem)
     where id = v_alerta.id
     returning * into v_alerta;
    return v_alerta;
  end if;

  insert into veiculo_alertas (veiculo_id, tipo_alerta_id, mensagem, ativo, created_by)
  values (p_veiculo_id, p_tipo_alerta_id, p_mensagem, true, auth.uid())
  returning * into v_alerta;
  return v_alerta;
end $$;

-- Resolve (baixa) o alerta: sai do SAC e vira historico com quem resolveu.
create or replace function resolver_alerta_veiculo(
  p_alerta_id uuid,
  p_observacao text default null
) returns veiculo_alertas language plpgsql security invoker as $$
declare
  v_alerta veiculo_alertas;
begin
  select * into v_alerta from veiculo_alertas where id = p_alerta_id;
  if not found then
    raise exception 'Alerta nao encontrado';
  end if;
  if not v_alerta.ativo then
    raise exception 'Alerta ja resolvido em %', to_char(v_alerta.resolvido_em, 'DD/MM/YYYY HH24:MI');
  end if;

  update veiculo_alertas
     set ativo = false,
         resolvido_em = now(),
         resolvido_por = auth.uid(),
         resolucao_observacao = p_observacao
   where id = p_alerta_id
   returning * into v_alerta;
  return v_alerta;
end $$;

-- ----------------------------------------------------------------------------
-- B) Ordenacao padrao das listagens de veiculo
-- ----------------------------------------------------------------------------
-- Ativo primeiro; inativo/cancelado no fim. Usada no order by das listagens.
create or replace function ordem_status_veiculo(p_status status_veiculo)
returns integer language sql immutable as $$
  select case p_status
           when 'ativo'             then 0
           when 'em_evento'         then 1
           when 'vistoria_pendente' then 2
           when 'suspenso'          then 3
           when 'inativo'           then 4
           when 'baixado'           then 5
           else 6                                  -- excluido
         end;
$$;

-- Lista do SAC ja ordenada e com os contadores prontos (eager loading): evita
-- as consultas separadas de plano, alertas e assistencia na rota /visao-360.
create or replace function veiculos_do_cliente(p_cliente_id uuid)
returns table (
  id uuid,
  placa text,
  marca text,
  modelo text,
  ano_modelo integer,
  status status_veiculo,
  tipo_faturamento tipo_faturamento,
  data_ativacao date,
  plano_nome text,
  alertas_qtd integer,
  eventos_qtd integer,
  tem_assistencia boolean
) language sql stable as $$
  select v.id, v.placa, v.marca, v.modelo, v.ano_modelo, v.status, v.tipo_faturamento,
         v.data_ativacao,
         p.nome,
         (select count(*)::int from veiculo_alertas a where a.veiculo_id = v.id and a.ativo),
         (select count(*)::int from eventos_sinistro e where e.veiculo_id = v.id),
         exists (select 1 from atendimentos ate
                  where ate.veiculo_id = v.id and ate.tipo::text = 'ASSISTENCIA_24H')
    from veiculos v
    left join planos_protecao p on p.id = v.plano_protecao_id
   where v.cliente_id = p_cliente_id
     and v.status::text <> 'excluido'
   order by ordem_status_veiculo(v.status),
            v.data_ativacao desc nulls last,
            v.modelo nulls last,
            v.placa;
$$;

comment on function veiculos_do_cliente(uuid) is
  'Lista de veiculos do associado para o SAC: ativos primeiro, depois inativos/cancelados; desempate por data de ativacao (recentes primeiro) e modelo/placa.';
