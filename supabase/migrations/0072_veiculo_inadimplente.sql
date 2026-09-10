-- ============================================================================
-- 0072 — STATUS `inadimplente` DO VEICULO (a tolerancia antes de inativar)
-- ============================================================================
-- O ciclo pedido: mensalidade atrasada -> o veiculo vai IMEDIATAMENTE para
-- `inadimplente`, o que ja BLOQUEIA todos os beneficios; passados N dias
-- (padrao 20) nesse status, ele vira `inativo`. O CRON que faz as duas
-- passagens sera construido depois — esta migration entrega o ESTADO, o
-- RELOGIO e o PARAMETRO de que ele vai precisar, mais o ajuste de todas as
-- funcoes que decidem alguma coisa a partir do status do veiculo.
--
-- (A) enum `status_veiculo` ganha `inadimplente`
-- (B) `veiculos.status_desde` / `status_motivo` — o RELOGIO. Sem ele nao existe
--     "20 dias inadimplente" para contar, e o CRON nao teria de onde partir.
--     Mesmo padrao de `rastreadores.status_desde` (0050).
-- (C) `empresa.dias_tolerancia_inadimplencia` (20) — a tolerancia e PARAMETRO,
--     nao numero no codigo (convencao do 0041). Lida hoje por
--     `situacao_inadimplencia_veiculo`, que a tela mostra como contagem
--     regressiva: parametro que ninguem le e promessa falsa (gotcha da 0068).
-- (D) `veiculo_faturavel` passa a INCLUIR `inadimplente` — ver a nota abaixo
-- (E) `ordem_status_veiculo` posiciona o novo status
-- (F) `situacao_assistencia_veiculo` explica o bloqueio em vez de so recusar
-- (G) o rastreador acompanha o ciclo (inadimplente -> 3; inativo -> 4)
-- (H) o painel da 24h conta `inadimplente` como BLOQUEADO, nao como inativo
--
-- ---------------------------------------------------------------------------
-- ⚠️ DECISAO REGISTRADA — INADIMPLENTE **FATURA**.
-- `veiculo_faturavel` (0024) e o interruptor da mensalidade. Deixar
-- `inadimplente` de fora dela pareceria conservador e e o contrario: no dia em
-- que o CRON entrar, a carteira inadimplente PARARIA DE SER COBRADA em
-- silencio — a associacao deixaria de emitir o boleto exatamente de quem
-- deve. O associado inadimplente segue CONTRATADO (so bloqueado); quem encerra
-- o contrato e a passagem para `inativo`, no fim da tolerancia, e ai sim a
-- cobranca para. Cobrar quem esta em tolerancia e o que da sentido a
-- tolerancia.
--
-- ⚠️ O QUE ESTA MIGRATION **NAO** FAZ, de proposito:
--   1. Nao existe rotina que mova ninguem — nenhum veiculo nasce `inadimplente`
--      hoje. Todas as mudancas abaixo sao no-op ate o CRON existir.
--   2. `inadimplente` NAO entra no formulario do veiculo. Ele e decidido pelos
--      TITULOS, entao marcar na mao seria desfeito na proxima passagem do CRON
--      — ou, pior, inativaria o associado em 20 dias por engano. Bloqueio
--      manual continua sendo `suspenso`, que ja existe.
--   3. O de-para do Mutual segue como esta: `INADIMPLENTE` de la continua
--      virando `ativo` na importacao (0062/0071). E a inadimplencia apurada
--      sobre os titulos DELES, e importar esse veredito bloquearia associados
--      por uma divida que esta base ainda nem enxerga — alem de largar o
--      relogio de 20 dias correndo no dia da carga. Quem decide `inadimplente`
--      aqui e o CRON, sobre `titulos_financeiros` daqui.
--      (O comentario da 0062 dizendo "no SCar a inadimplencia e DERIVADA dos
--       titulos" descreve o passado; a decisao de nao remapear continua a mesma.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) O novo status
-- ----------------------------------------------------------------------------
-- GOTCHA (0017/0026/0028/0029): valor de enum adicionado NAO pode ser USADO na
-- mesma transacao. Daqui para baixo toda comparacao e por TEXTO (`::text`).
alter type status_veiculo add value if not exists 'inadimplente';

-- ----------------------------------------------------------------------------
-- (B) O RELOGIO — desde quando o veiculo esta no status atual
-- ----------------------------------------------------------------------------
alter table veiculos add column if not exists status_desde  timestamptz;
alter table veiculos add column if not exists status_motivo text;

comment on column veiculos.status_desde is
  'Quando o veiculo entrou no status atual. Base do prazo de tolerancia da inadimplencia.';
comment on column veiculos.status_motivo is
  'Por que ele entrou nesse status (via set_config(''scar.motivo_status_veiculo'')).';

-- Linha antiga nao tem historico: o melhor palpite honesto e a ultima
-- alteracao dela. Sem isso `dias_no_status_veiculo` devolveria null para a
-- base inteira e o CRON nao teria de onde contar.
update veiculos
   set status_desde = coalesce(updated_at, created_at, now())
 where status_desde is null;

-- BEFORE: carimba `status_desde` a cada troca de status, por QUALQUER caminho
-- (tela, RPC, auditoria da venda, trigger de outro modulo). A aplicacao
-- esquece; a trigger nao — mesma escolha do parque de rastreadores (0050).
create or replace function fn_veiculo_status_desde()
returns trigger
language plpgsql
as $$
begin
  -- clock_timestamp(), nao now(): `now()` e o inicio da TRANSACAO, entao duas
  -- trocas de status na mesma transacao (a auditoria da venda cria o veiculo e
  -- outro trigger o move) nasceriam com o mesmo instante. Mesmo gotcha da
  -- auditoria da OS 24h (0027).
  if tg_op = 'INSERT' then
    new.status_desde := coalesce(new.status_desde, clock_timestamp());
    return new;
  end if;

  if new.status::text is distinct from old.status::text then
    new.status_desde  := clock_timestamp();
    new.status_motivo := nullif(current_setting('scar.motivo_status_veiculo', true), '');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_veiculo_status_desde on veiculos;
create trigger trg_veiculo_status_desde
  before insert or update of status on veiculos
  for each row execute function fn_veiculo_status_desde();

comment on function fn_veiculo_status_desde() is
  'Carimba veiculos.status_desde/status_motivo a cada troca de status. Sustenta o prazo da inadimplencia.';

-- ----------------------------------------------------------------------------
-- (C) O PARAMETRO — quantos dias de tolerancia antes de inativar
-- ----------------------------------------------------------------------------
-- Fica em `empresa` porque a tolerancia e termo do contrato de adesao, valido
-- para a associacao inteira; e a cobranca e toda da matriz (0037), nao da
-- franquia. 0 = sem tolerancia (inativa na primeira passagem).
alter table empresa
  add column if not exists dias_tolerancia_inadimplencia integer not null default 20;

alter table empresa drop constraint if exists chk_empresa_tolerancia;
alter table empresa add constraint chk_empresa_tolerancia
  check (dias_tolerancia_inadimplencia between 0 and 365);

comment on column empresa.dias_tolerancia_inadimplencia is
  'Dias em `inadimplente` antes de o veiculo virar `inativo`. Padrao 20.';

create or replace function tolerancia_inadimplencia()
returns integer
language sql
stable
as $$
  select coalesce((select dias_tolerancia_inadimplencia from empresa limit 1), 20);
$$;

comment on function tolerancia_inadimplencia() is
  'Dias de tolerancia da inadimplencia (empresa; 20 quando a empresa ainda nao foi cadastrada).';

-- ----------------------------------------------------------------------------
-- Quanto tempo o veiculo esta no status atual
-- ----------------------------------------------------------------------------
create or replace function dias_no_status_veiculo(p_veiculo_id uuid)
returns integer
language sql
stable
as $$
  select greatest(0, (current_date - coalesce(v.status_desde, v.created_at, now())::date))::int
    from veiculos v where v.id = p_veiculo_id;
$$;

-- A leitura que a TELA mostra e que o CRON vai consumir: esta na tolerancia?
-- quantos dias faltam? em que dia ela vence?
create or replace function situacao_inadimplencia_veiculo(p_veiculo_id uuid)
returns table (
  veiculo_id       uuid,
  inadimplente     boolean,
  dias_no_status   integer,
  dias_tolerancia  integer,
  dias_restantes   integer,
  vence_em         date,
  tolerancia_vencida boolean
)
language sql
stable
as $$
  select v.id,
         v.status::text = 'inadimplente',
         dias_no_status_veiculo(v.id),
         tolerancia_inadimplencia(),
         case when v.status::text = 'inadimplente'
              then greatest(0, tolerancia_inadimplencia() - dias_no_status_veiculo(v.id))
              else null end,
         case when v.status::text = 'inadimplente'
              then (coalesce(v.status_desde, v.created_at)::date + tolerancia_inadimplencia())
              else null end,
         v.status::text = 'inadimplente'
           and dias_no_status_veiculo(v.id) >= tolerancia_inadimplencia()
    from veiculos v
   where v.id = p_veiculo_id;
$$;

comment on function situacao_inadimplencia_veiculo(uuid) is
  'Contagem regressiva da tolerancia. `tolerancia_vencida` e o gatilho que o CRON vai ler.';

-- ----------------------------------------------------------------------------
-- (D) FATURAMENTO — inadimplente CONTINUA sendo cobrado (ver a nota do topo)
-- ----------------------------------------------------------------------------
create or replace function veiculo_faturavel(p_veiculo_id uuid, p_competencia date)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from veiculos v
     where v.id = p_veiculo_id
       -- `inadimplente` esta aqui de PROPOSITO: ele ainda tem contrato, so
       -- perdeu os beneficios. Quem para de gerar mensalidade e `inativo`.
       and v.status::text in ('ativo', 'em_evento', 'vistoria_pendente', 'inadimplente')
       and (
         v.data_ativacao is null
         or v.data_ativacao <= (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date
       )
  );
$$;

comment on function veiculo_faturavel(uuid, date) is
  'Gera mensalidade na competencia? ativo/em_evento/vistoria_pendente/inadimplente e ja ativado ate o fim do mes.';

-- ----------------------------------------------------------------------------
-- (E) ORDENACAO das listagens
-- ----------------------------------------------------------------------------
-- `inadimplente` fica ANTES de `suspenso`: ele e o unico com relogio correndo,
-- entao e o que precisa aparecer primeiro na fila de quem trabalha a carteira.
create or replace function ordem_status_veiculo(p_status status_veiculo)
returns integer language sql immutable as $$
  select case p_status::text
           when 'ativo'             then 0
           when 'em_evento'         then 1
           when 'vistoria_pendente' then 2
           when 'inadimplente'      then 3
           when 'suspenso'          then 4
           when 'inativo'           then 5
           when 'baixado'           then 6
           else 7                                  -- excluido
         end;
$$;

-- ----------------------------------------------------------------------------
-- (F) ASSISTENCIA 24H — o bloqueio ja acontecia; agora ele se EXPLICA
-- ----------------------------------------------------------------------------
-- A trava sempre foi "status <> ativo recusa", entao `inadimplente` ja nasce
-- bloqueado sem tocar em nada. O que muda e a mensagem: "necessario ATIVO" nao
-- diz ao atendente o que resolver, e este e o caso em que ha o que resolver.
create or replace function situacao_assistencia_veiculo(p_veiculo_id uuid)
returns table (
  veiculo_id        uuid,
  placa             text,
  cliente_id        uuid,
  associado         text,
  status_veiculo    status_veiculo,
  veiculo_ativo     boolean,
  inadimplente      boolean,
  titulos_vencidos  integer,
  valor_em_atraso   numeric,
  pendencia_cadastral boolean,
  alertas_ativos    integer,
  pode_acionar      boolean,
  motivos           text[]
)
language plpgsql stable
as $$
declare
  v        veiculos;
  cli      clientes;
  v_venc   integer := 0;
  v_valor  numeric := 0;
  v_alert  integer := 0;
  v_mot    text[] := '{}';
  v_dias   integer;
begin
  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then return; end if;
  select * into cli from clientes where id = v.cliente_id;

  select count(*)::int, coalesce(sum(t.valor), 0)
    into v_venc, v_valor
    from titulos_financeiros t
   where t.cliente_id = v.cliente_id
     and t.status in ('pendente', 'vencido')
     and t.data_vencimento < current_date
     and (t.veiculo_id = v.id
          or (t.veiculo_id is null and v.tipo_faturamento = 'AGRUPADO_ASSOCIADO'));

  select count(*)::int into v_alert
    from veiculo_alertas al where al.veiculo_id = v.id and al.ativo;

  if v.status::text = 'inadimplente' then
    v_dias := dias_no_status_veiculo(v.id);
    v_mot := v_mot || format(
      'Veiculo INADIMPLENTE ha %s dia(s) — beneficios bloqueados ate a regularizacao (inativa em %s dia(s))',
      v_dias, greatest(0, tolerancia_inadimplencia() - v_dias));
  elsif v.status::text <> 'ativo' then
    v_mot := v_mot || format('Veiculo com status %s (necessario ATIVO)', v.status);
  end if;
  if v_venc > 0 then
    v_mot := v_mot || format('%s titulo(s) em atraso — %s', v_venc, to_char(v_valor, 'FM999G999D00'));
  end if;
  if cli.status::text = 'inadimplente' then
    v_mot := v_mot || 'Associado marcado como inadimplente';
  end if;
  if v_alert > 0 then
    v_mot := v_mot || format('%s alerta(s) cadastral(is) ativo(s)', v_alert);
  end if;

  veiculo_id := v.id;
  placa := v.placa;
  cliente_id := v.cliente_id;
  associado := cli.nome_razao_social;
  status_veiculo := v.status;
  veiculo_ativo := (v.status::text = 'ativo');
  inadimplente := (v_venc > 0 or cli.status::text = 'inadimplente' or v.status::text = 'inadimplente');
  titulos_vencidos := v_venc;
  valor_em_atraso := round(v_valor, 2);
  pendencia_cadastral := (v_alert > 0);
  alertas_ativos := v_alert;
  pode_acionar := (array_length(v_mot, 1) is null);
  motivos := v_mot;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- (G) O RASTREADOR ACOMPANHA O CICLO
-- ----------------------------------------------------------------------------
-- Antes: qualquer saida da base mandava o equipamento para "4 - Inativo (pedir
-- devolucao)". Com a tolerancia isso vira DOIS passos, e o segundo tinha um
-- buraco: o laco so pegava equipamento em 'ATIVO', entao o que ja estivesse em
-- 'INADIMPLENTE' (3) NUNCA chegaria ao recolhimento quando o veiculo virasse
-- `inativo` no fim dos 20 dias.
--   veiculo -> inadimplente  ...  equipamento -> 3 (Inadimplente), sem recolher
--   veiculo -> inativo/etc.  ...  equipamento -> 4 (pedir devolucao)
create or replace function fn_veiculo_move_rastreador()
returns trigger
language plpgsql
as $$
declare r record;
begin
  if new.status::text = old.status::text then return new; end if;

  -- Passo 1: tolerancia. Suspende o rastreamento, nao pede o aparelho de volta.
  if new.status::text = 'inadimplente' then
    for r in select * from rastreadores
              where veiculo_id = new.id and status::text = 'ATIVO' loop
      perform set_config('scar.motivo_rastreador',
        format('Veiculo %s entrou em INADIMPLENCIA — rastreamento suspenso durante a tolerancia', new.placa), true);
      update rastreadores set status = 'INADIMPLENTE' where id = r.id;
    end loop;
    return new;
  end if;

  if new.status::text not in ('inativo', 'suspenso', 'baixado', 'excluido') then return new; end if;

  -- Passo 2: saiu da base. Recolhe — inclusive o que a tolerancia ja tinha
  -- deixado em 'INADIMPLENTE'.
  for r in select * from rastreadores
            where veiculo_id = new.id and status::text in ('ATIVO', 'INADIMPLENTE') loop
    perform set_config('scar.motivo_rastreador',
      format('Veiculo %s passou para %s — equipamento vai para recolhimento', new.placa, new.status), true);
    update rastreadores
       set status = 'INATIVO',            -- 4: pedir devolucao
           data_desinstalacao = coalesce(data_desinstalacao, now())
     where id = r.id;
  end loop;

  return new;
end;
$$;

comment on function fn_veiculo_move_rastreador() is
  'Inadimplente suspende o rastreamento (3); sair da base recolhe o equipamento (4), inclusive o que estava em 3.';

-- `sincronizar_rastreadores_inadimplencia` (0053) devolve o equipamento a
-- 'ATIVO' quando o associado regulariza — e ela exigia o veiculo em
-- ativo/em_evento. Um veiculo que ainda esta em `inadimplente` no momento da
-- varredura ficaria com o rastreador preso em 3 mesmo com os titulos pagos.
create or replace function sincronizar_rastreadores_inadimplencia(
  p_dias        integer default 35,
  p_regional_id uuid default null
)
returns table (marcados integer, regularizados integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  v_marc   integer := 0;
  v_reg    integer := 0;
  v_dias   integer := greatest(coalesce(p_dias, 35), 1);
  v_escopo uuid;
begin
  if not (is_staff() or auth.uid() is null) then
    raise exception 'Sem permissao para sincronizar o parque';
  end if;
  v_escopo := escopo_regional(p_regional_id);

  for r in
    select ra.id, ra.cliente_id, dias_atraso_cliente(ra.cliente_id) as dias
      from rastreadores ra
     where ra.status::text = 'ATIVO'
       and ra.cliente_id is not null
       and (v_escopo is null or ra.regional_id = v_escopo)
       and dias_atraso_cliente(ra.cliente_id) > v_dias
  loop
    perform set_config('scar.motivo_rastreador',
      format('Associado com %s dias de atraso (limite %s)', r.dias, v_dias), true);
    update rastreadores set status = 'INADIMPLENTE' where id = r.id;
    v_marc := v_marc + 1;
  end loop;

  for r in
    select ra.id
      from rastreadores ra
      join veiculos v on v.id = ra.veiculo_id
     where ra.status::text = 'INADIMPLENTE'
       and ra.cliente_id is not null
       and (v_escopo is null or ra.regional_id = v_escopo)
       and v.status::text in ('ativo', 'em_evento', 'inadimplente')
       and dias_atraso_cliente(ra.cliente_id) = 0
  loop
    perform set_config('scar.motivo_rastreador', 'Associado regularizou os titulos em aberto', true);
    update rastreadores set status = 'ATIVO' where id = r.id;
    v_reg := v_reg + 1;
  end loop;

  return query select v_marc, v_reg;
end;
$$;

-- ----------------------------------------------------------------------------
-- (H) PAINEL DA 24H — inadimplente e BLOQUEADO, nao inativo
-- ----------------------------------------------------------------------------
-- A faixa da frota separa quem PODE acionar de quem esta bloqueado. Contar o
-- inadimplente junto dos inativos esconderia justamente a fatia que da para
-- recuperar com uma cobranca.
create or replace function assist_painel_resumo(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null
)
returns table (
  veiculos_total       bigint,
  veiculos_ativos      bigint,
  veiculos_inativos    bigint,
  veiculos_bloqueados  bigint,
  acionamentos         bigint,
  acionamentos_hoje    bigint,
  acionamentos_abertos bigint,
  media_diaria         numeric,
  indice_acionamento   numeric,
  tempo_medio_horas    numeric,
  custo_total          numeric,
  custo_medio          numeric,
  custo_por_veiculo    numeric,
  veiculos_acionaram   bigint,
  reincidentes         bigint
)
language sql stable security definer set search_path = public
as $$
  with frota as (
    select count(*)                                                       as total,
           count(*) filter (where v.status::text = 'ativo')                as ativos,
           count(*) filter (where v.status::text in ('suspenso','inadimplente')) as bloqueados,
           count(*) filter (where v.status::text
                              not in ('ativo','suspenso','inadimplente'))  as inativos
      from veiculos v
     where ((select escopo_regional(p_regional_id)) is null
              or v.regional_id = (select escopo_regional(p_regional_id)))
  ),
  mov as (select * from assist_painel_movimentos(p_data_inicio, p_data_fim, p_regional_id)),
  porveic as (select veiculo_id, count(*) as n from mov group by veiculo_id),
  dias as (select greatest(1, (least(p_data_fim, current_date) - p_data_inicio) + 1)::numeric as d)
  select f.total, f.ativos, f.inativos, f.bloqueados,
         (select count(*) from mov),
         (select count(*) from mov where aberto_em::date = current_date),
         (select count(*) from mov where status in ('ABERTO','EM_COTACAO','AUTORIZADO','EM_ATENDIMENTO')),
         round((select count(*) from mov)::numeric / (select d from dias), 2),
         case when f.ativos > 0 then round((select count(*) from mov)::numeric / f.ativos, 4) else 0 end,
         coalesce((select round(avg(horas), 2) from mov where horas is not null), 0),
         coalesce((select sum(custo) from mov), 0),
         coalesce((select round(avg(custo), 2) from mov where custo > 0), 0),
         case when f.ativos > 0
              then round(coalesce((select sum(custo) from mov), 0) / f.ativos, 2) else 0 end,
         (select count(*) from porveic),
         (select count(*) from porveic where n >= 2)
    from frota f;
$$;

-- ----------------------------------------------------------------------------
-- (I) Espelho do Mutual: `mutual_vitalidade` passa a conhecer o novo status
-- ----------------------------------------------------------------------------
-- No-op na pratica — o de-para do Mutual nunca devolve `inadimplente` (ver a
-- nota 3 do topo) — mas o mapa e exaustivo dos dois lados (src/lib/mutual.ts),
-- e um status faltando aqui cairia no `else 0`, ou seja seria tratado como
-- morto. `inadimplente` empata com `suspenso`: os dois sao BLOQUEIO, nao baixa.
create or replace function mutual_vitalidade(p_status status_veiculo)
returns integer
language sql immutable
as $$
  select case p_status::text
    when 'ativo'             then 4
    when 'em_evento'         then 3
    when 'vistoria_pendente' then 2
    when 'suspenso'          then 1
    when 'inadimplente'      then 1
    when 'inativo'           then 0
    else 0
  end;
$$;

-- ============================================================================
-- RITO DE SEGURANCA (0052) — sem isto as funcoes novas nascem chamaveis pelo
-- `anon`, a chave que vai no bundle do navegador.
-- ============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
