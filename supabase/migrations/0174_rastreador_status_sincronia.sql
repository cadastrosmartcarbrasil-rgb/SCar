-- ============================================================================
-- SCar :: 0174_rastreador_status_sincronia.sql
--
-- O STATUS DO RASTREADOR PASSA A ACOMPANHAR O VEICULO E A COBRANCA.
--
-- Medido em producao em 02/11/2026, depois da importacao da New Tracker: 1.713
-- rastreadores, TODOS em "2 - Ativo" — 281 deles em veiculo INATIVO e 275 com
-- boleto vencido. Tres causas:
--   1. A 0053 nunca chegou inteira a producao: o trigger que manda o equipamento
--      para "4 - Inativo" quando o veiculo sai da base (trg_veiculo_move_rastreador),
--      `dias_atraso_cliente`, `cobrar_rastreador` e `situacao_rastreamento_veiculo`
--      nao existem la. O botao "Aplicar inadimplencia" falhava.
--   2. Mesmo com o trigger, ele so age quando o status do VEICULO muda; o
--      equipamento instalado num veiculo que JA estava inativo nao se move.
--   3. A inadimplencia lia so `titulos_financeiros`; a carteira e cobrada
--      pelo Mutual (`boletos_historico`). A conta certa ja existe:
--      `vencidos_veiculo` (0139), que soma as duas fontes.
--
-- DECISAO DO USUARIO (02/11/2026): o rastreador vira "3 - Inadimplente" com o
-- mesmo prazo do BLOQUEIO dos beneficios da regua (`dias_bloqueio_inadimplencia`,
-- Configuracoes -> Empresa), que e o que o e-mail de atraso avisa.
--
-- Esta migration:
--   (A) `sincronizar_status_rastreadores(regional, dias)` — reconcilia o
--       parque inteiro: fora da base -> 4; vencido no prazo do bloqueio -> 3;
--       pagou / voltou -> 2. Motivo no historico de cada equipamento.
--   (B) `sincronizar_rastreadores_inadimplencia` (o botao) passa a delegar a ela.
--   (C) recria o que faltou da 0053: o trigger em `veiculos`,
--       `dias_atraso_cliente` (agora com as duas fontes), `cobrar_rastreador`
--       e `situacao_rastreamento_veiculo`.
-- A rotina diaria (06:15, a mesma da regua) e a importacao da New Tracker
-- chamam (A).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (C1) dias de atraso do associado: o maior atraso entre os veiculos dele,
-- pelas duas fontes (SCar + Mutual antes do corte) — a leitura da regua.
-- ----------------------------------------------------------------------------
create or replace function dias_atraso_cliente(p_cliente_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(x.dias), 0)::int
    from (
      select (select vv.dias from vencidos_veiculo(v.id, 1) vv) as dias
        from veiculos v
       where v.cliente_id = p_cliente_id
      union all
      select coalesce(max(current_date - t.data_vencimento), 0)
        from titulos_financeiros t
       where t.cliente_id = p_cliente_id
         and t.status::text in ('pendente', 'vencido')
         and t.data_vencimento < current_date
         and t.tipo_avulso_id is null
    ) x
   where is_staff() or auth.uid() is null or p_cliente_id = auth_cliente_id();
$$;

comment on function dias_atraso_cliente(uuid) is
  '0174: maior atraso em dias do associado, nas duas fontes (titulos do SCar e boletos do Mutual antes do corte). 0 = em dia.';

-- ----------------------------------------------------------------------------
-- (A) a sincronia do parque
-- ----------------------------------------------------------------------------
create or replace function sincronizar_status_rastreadores(
  p_regional_id uuid    default null,
  p_dias        integer default null
)
returns table (inativados integer, inadimplentes integer, reativados integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  v_inat   integer := 0;
  v_inad   integer := 0;
  v_reat   integer := 0;
  v_dias   integer := greatest(coalesce(p_dias, dias_bloqueio_inadimplencia(), 1), 1);
  v_escopo uuid;
begin
  if not (is_staff() or auth.uid() is null) then
    raise exception 'Sem permissao para sincronizar o parque';
  end if;
  -- sem sessao (rotina do servidor) vale o parametro; com sessao, o escopo de quem chama
  v_escopo := case when auth.uid() is null then p_regional_id else escopo_regional(p_regional_id) end;

  -- 1) veiculo fora da base -> 4 - Inativo (pedir devolucao)
  for r in
    select ra.id, v.placa, v.status::text as vs
      from rastreadores ra
      join veiculos v on v.id = ra.veiculo_id
     where ra.status::text in ('ATIVO', 'INADIMPLENTE')
       and v.status::text in ('inativo', 'suspenso', 'baixado', 'excluido')
       and (v_escopo is null or ra.regional_id = v_escopo)
  loop
    perform set_config('scar.motivo_rastreador',
      format('Veiculo %s esta %s — equipamento vai para recolhimento', coalesce(r.placa, 'sem placa'), r.vs), true);
    update rastreadores
       set status = 'INATIVO',
           data_desinstalacao = coalesce(data_desinstalacao, now())
     where id = r.id;
    v_inat := v_inat + 1;
  end loop;

  -- 2) veiculo na base com boleto vencido no prazo do bloqueio (ou ja inadimplente) -> 3
  for r in
    select ra.id, v.placa, v.status::text as vs, vv.boletos, vv.dias
      from rastreadores ra
      join veiculos v on v.id = ra.veiculo_id
      cross join lateral vencidos_veiculo(v.id, v_dias) vv
     where ra.status::text = 'ATIVO'
       and v.status::text in ('ativo', 'em_evento', 'vistoria_pendente', 'inadimplente')
       and (v_escopo is null or ra.regional_id = v_escopo)
       and (vv.boletos > 0 or v.status::text = 'inadimplente')
  loop
    perform set_config('scar.motivo_rastreador',
      case when r.boletos > 0
        then format('Veiculo %s com %s boleto(s) vencido(s): %s dias de atraso (bloqueio a partir de %s)',
                    coalesce(r.placa, 'sem placa'), r.boletos, r.dias, v_dias)
        else format('Veiculo %s em inadimplencia — rastreamento suspenso', coalesce(r.placa, 'sem placa'))
      end, true);
    update rastreadores set status = 'INADIMPLENTE' where id = r.id;
    v_inad := v_inad + 1;
  end loop;

  -- 3) inadimplente que pagou (e o veiculo nao esta mais inadimplente) -> 2
  for r in
    select ra.id, v.placa
      from rastreadores ra
      join veiculos v on v.id = ra.veiculo_id
      cross join lateral vencidos_veiculo(v.id, v_dias) vv
     where ra.status::text = 'INADIMPLENTE'
       and v.status::text in ('ativo', 'em_evento', 'vistoria_pendente')
       and (v_escopo is null or ra.regional_id = v_escopo)
       and vv.boletos = 0
  loop
    perform set_config('scar.motivo_rastreador',
      format('Veiculo %s regularizou os boletos — rastreamento ativo', coalesce(r.placa, 'sem placa')), true);
    update rastreadores set status = 'ATIVO' where id = r.id;
    v_reat := v_reat + 1;
  end loop;

  return query select v_inat, v_inad, v_reat;
end;
$$;

comment on function sincronizar_status_rastreadores(uuid, integer) is
  '0174: reconcilia o parque com o veiculo e a cobranca — fora da base -> 4 Inativo; vencido no prazo do bloqueio da regua -> 3 Inadimplente; regularizou -> 2 Ativo. Re-executavel.';

-- ----------------------------------------------------------------------------
-- (B) o botao "Aplicar inadimplencia" (mesma assinatura e retorno)
-- ----------------------------------------------------------------------------
create or replace function sincronizar_rastreadores_inadimplencia(
  p_dias        integer default null,
  p_regional_id uuid    default null
)
returns table (marcados integer, regularizados integer)
language plpgsql
security definer
set search_path = public
as $$
declare s record;
begin
  select * into s from sincronizar_status_rastreadores(p_regional_id, p_dias);
  return query select s.inadimplentes + s.inativados, s.reativados;
end;
$$;

comment on function sincronizar_rastreadores_inadimplencia(integer, uuid) is
  '0174: delega a sincronizar_status_rastreadores. marcados = inadimplentes + inativados.';

-- ----------------------------------------------------------------------------
-- (C2) o trigger que faltava em producao (a funcao e a da 0072)
-- ----------------------------------------------------------------------------
drop trigger if exists trg_veiculo_move_rastreador on veiculos;
create trigger trg_veiculo_move_rastreador after update of status on veiculos
  for each row execute function fn_veiculo_move_rastreador();

-- ----------------------------------------------------------------------------
-- (C3) equipamento nao devolvido vira titulo a receber (corpo da 0053)
-- ----------------------------------------------------------------------------
create or replace function cobrar_rastreador(
  p_rastreador_id uuid,
  p_valor         numeric,
  p_vencimento    date default null,
  p_observacao    text default null
)
returns titulos_financeiros
language plpgsql
security definer
set search_path = public
as $$
declare
  r rastreadores;
  t titulos_financeiros;
begin
  select * into r from rastreadores where id = p_rastreador_id;
  if r.id is null then raise exception 'Rastreador nao encontrado'; end if;
  if not pode_mexer_rastreador(r.id) then
    raise exception 'Sem permissao para movimentar este equipamento';
  end if;
  if r.status::text <> 'COBRAR_RASTREADOR' then
    raise exception 'A cobranca sai do status 6 - Cobrar rastreador (atual: %)', r.status;
  end if;
  if r.cliente_id is null then
    raise exception 'Equipamento sem associado vinculado: nao ha quem cobrar';
  end if;
  if coalesce(p_valor, 0) <= 0 then
    raise exception 'Informe o valor a cobrar pelo equipamento';
  end if;

  insert into titulos_financeiros (cliente_id, veiculo_id, valor, valor_original,
                                   data_vencimento, status, observacao)
    values (r.cliente_id, r.veiculo_id, p_valor, p_valor,
            coalesce(p_vencimento, current_date + 10), 'pendente',
            coalesce(p_observacao, 'Equipamento de rastreamento nao devolvido — IMEI ' || r.imei))
    returning * into t;

  perform set_config('scar.motivo_rastreador',
    format('Cobranca gerada: R$ %s, vencimento %s', p_valor,
           to_char(coalesce(p_vencimento, current_date + 10), 'DD/MM/YYYY')), true);
  update rastreadores set status = 'BOLETO_GERADO' where id = r.id;

  insert into rastreador_eventos (rastreador_id, tipo, descricao, payload, usuario_id)
    values (r.id, 'STATUS', 'Titulo de cobranca do equipamento emitido',
            jsonb_build_object('titulo_id', t.id, 'valor', p_valor),
            (select u.id from usuarios u where u.id = auth.uid()));

  return t;
end;
$$;

-- ----------------------------------------------------------------------------
-- (C4) o que o SAC mostra (corpo da 0053; o atraso agora le as duas fontes)
-- ----------------------------------------------------------------------------
create or replace function situacao_rastreamento_veiculo(p_veiculo_id uuid)
returns table (
  tem_equipamento    boolean,
  rastreador_id      uuid,
  imei               text,
  status             status_rastreador,
  status_numero      smallint,
  rastreadora        text,
  suspenso_por_debito boolean,
  dias_atraso        integer,
  exige_rastreador   boolean,
  situacao           text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id is not null,
    r.id, r.imei, r.status, numero_status_rastreador(r.status::text),
    coalesce(nullif(btrim(f.nome_fantasia), ''), f.razao_social),
    coalesce(r.status::text = 'INADIMPLENTE', false),
    dias_atraso_cliente(v.cliente_id),
    coalesce(tv.exige_rastreador, false) or coalesce(pp.exige_rastreador, false),
    case
      when r.id is null and (coalesce(tv.exige_rastreador, false) or coalesce(pp.exige_rastreador, false))
        then 'A cobertura exige rastreador e o veiculo nao tem equipamento instalado'
      when r.id is null then 'Veiculo sem rastreador'
      when r.status::text = 'ATIVO' then 'Rastreamento ativo'
      when r.status::text = 'INADIMPLENTE'
        then format('Rastreamento suspenso: associado com %s dias de atraso',
                    dias_atraso_cliente(v.cliente_id))
      else 'Equipamento em ' || numero_status_rastreador(r.status::text) || ' - ' || r.status::text
    end
  from veiculos v
  left join rastreadores r on r.veiculo_id = v.id
        and r.status::text in ('ATIVO', 'INADIMPLENTE')
  left join fornecedores f     on f.id  = r.empresa_rastreamento_id
  left join tipos_veiculo tv   on tv.id = v.tipo_veiculo_id
  left join planos_protecao pp on pp.id = v.plano_protecao_id
 where v.id = p_veiculo_id
   and (is_staff() or v.cliente_id = auth_cliente_id());
$$;

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
