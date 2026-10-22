-- =============================================================================
-- 0137 — REVISTORIA PARA O BOLETO VENCIDO (pedido do usuario, 22/10/2026)
--
-- A regra da associacao: quem nao pagou no vencimento pede a 2a via. Passados N
-- dias de atraso (padrao 5, configuravel), o boleto novo SO SAI depois de uma
-- REVISTORIA do veiculo — foto da frente, foto da traseira e um video dando a
-- volta no carro — aprovada pela equipe. E o que impede o associado de deixar
-- vencer, bater o carro e so entao pagar para ter cobertura.
--
-- Decisoes do usuario (22/10/2026):
--  1. A equipe PODE liberar sem revistoria, com justificativa, quem tiver a
--     permissao (`revistoria.cancelar` na grade — "liberar sem revistoria").
--  2. Reprovou: o MESMO link reabre com o motivo para o associado refazer.
--  3. Video de ate 30 segundos.
--  4. NUNCA reaproveita: cada 2a via/negociacao acima de N dias consome uma
--     revistoria; aprovada e nao usada expira em 10 dias.
--
-- O que entra:
--  (A) `empresa.dias_revistoria_boleto` (padrao 5) + `dias_revistoria_boleto()`.
--  (B) `revistoria_itens`: o catalogo do que se pede (FOTO/VIDEO). Proprio, e
--      nao `vistoria_fotos_modelo`: aquele alimenta o checklist da VENDA (0040)
--      e misturar faria a venda pedir video de revistoria.
--  (C) `vistoria_anexos`: o video cabe ate 50 MB (foto segue em 10 MB) e ganha
--      `duracao_segundos`. A midia mora na MESMA `vistorias` do veiculo — a
--      revistoria e uma vistoria, e aparece na vida do veiculo.
--  (D) `revistorias_cobranca` (o pedido, com token proprio, prazo e situacao) +
--      `revistoria_cobranca_historico` (trilha por trigger).
--  (E) A TRAVA vive no BANCO, por trigger em `cobranca_renegociacao_origens`:
--      boleto vencido ha mais de N dias so entra numa 2a via/negociacao se o
--      veiculo tem revistoria APROVADA (ou liberada) ainda nao usada. A
--      renegociacao EMITIDA consome; a que deu ERRO devolve. Nada da 0121 foi
--      reescrito — os triggers acompanham as RPCs que ja existem.
--  (F) RPCs da equipe, do link publico e a rotina diaria.
--  (G) Permissao: modulo `revistoria` na grade (ver/criar/fechar/cancelar).
-- =============================================================================

-- (A) ------------------------------------------------------------------------
alter table empresa add column if not exists dias_revistoria_boleto integer not null default 5;
alter table empresa drop constraint if exists chk_empresa_dias_revistoria;
alter table empresa add constraint chk_empresa_dias_revistoria
  check (dias_revistoria_boleto between 0 and 90);

comment on column empresa.dias_revistoria_boleto is
  'Dias de atraso (do vencimento efetivo) a partir dos quais a 2a via exige revistoria do veiculo (0137). Padrao 5.';

create or replace function dias_revistoria_boleto()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select dias_revistoria_boleto from empresa limit 1), 5);
$$;

-- (B) ------------------------------------------------------------------------
create table if not exists revistoria_itens (
  codigo      text primary key,
  nome        text not null,
  instrucao   text,
  midia       text not null default 'FOTO',
  obrigatorio boolean not null default true,
  ordem       smallint not null default 0,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint chk_revistoria_item_midia check (midia in ('FOTO', 'VIDEO')),
  constraint chk_revistoria_item_codigo check (codigo like 'REV\_%')
);

insert into revistoria_itens (codigo, nome, instrucao, midia, obrigatorio, ordem)
select v.* from (values
  ('REV_FRENTE', 'Frente do veículo',
   'De frente, a uns 3 metros, com o carro inteiro na foto e a placa legível.', 'FOTO', true, 1::smallint),
  ('REV_TRASEIRA', 'Traseira do veículo',
   'Por trás, a uns 3 metros, com o carro inteiro na foto e a placa legível.', 'FOTO', true, 2::smallint),
  ('REV_VIDEO_VOLTA', 'Vídeo dando a volta no carro',
   'Comece pela frente e ande devagar em volta do carro inteiro, filmando a lataria. Até 30 segundos.',
   'VIDEO', true, 3::smallint)
) v(codigo, nome, instrucao, midia, obrigatorio, ordem)
where not exists (select 1 from revistoria_itens i where i.codigo = v.codigo);

alter table revistoria_itens enable row level security;
drop policy if exists revistoria_itens_select on revistoria_itens;
create policy revistoria_itens_select on revistoria_itens for select to authenticated using (is_staff());
drop policy if exists revistoria_itens_write on revistoria_itens;
create policy revistoria_itens_write on revistoria_itens for all to authenticated
  using (is_admin()) with check (is_admin());
grant select on revistoria_itens to authenticated;
revoke all on revistoria_itens from anon;

-- (C) ------------------------------------------------------------------------
alter table vistoria_anexos add column if not exists duracao_segundos numeric(6,1);
alter table vistoria_anexos drop constraint if exists chk_vistoria_anexo_tamanho;
alter table vistoria_anexos add constraint chk_vistoria_anexo_tamanho check (
  tamanho_bytes is null
  or tamanho_bytes <= case when tipo like 'REV\_VIDEO%' then 52428800 else 10485760 end);

-- (D) ------------------------------------------------------------------------
create table if not exists revistorias_cobranca (
  id                     uuid primary key default gen_random_uuid(),
  vistoria_id            uuid unique references vistorias(id) on delete cascade,
  cliente_id             uuid not null references clientes(id) on delete cascade,
  veiculo_id             uuid not null references veiculos(id) on delete cascade,
  regional_id            uuid references regionais(id) on delete set null,
  token                  uuid not null default gen_random_uuid(),
  token_expira_em        timestamptz not null default now(),
  situacao               text not null default 'AGUARDANDO',
  origem                 text not null default 'MANUAL',
  dias_atraso            integer,
  vencimento_referencia  date,
  solicitado_por         uuid references usuarios(id) on delete set null,
  enviado_em             timestamptz,
  analisado_por          uuid references usuarios(id) on delete set null,
  analisado_em           timestamptz,
  observacao_analise     text,
  reprovacoes            integer not null default 0,
  motivo_reprovacao      text,
  reenvio_desde          timestamptz,
  dispensa_justificativa text,
  dispensado_por         uuid references usuarios(id) on delete set null,
  dispensado_em          timestamptz,
  renegociacao_id        uuid references cobranca_renegociacoes(id) on delete set null,
  utilizada_em           timestamptz,
  encerrada_motivo       text,
  created_at             timestamptz not null default clock_timestamp(),
  updated_at             timestamptz not null default now(),
  constraint chk_revistoria_situacao check (situacao in
    ('AGUARDANDO', 'EM_ANALISE', 'APROVADA', 'DISPENSADA', 'UTILIZADA', 'CANCELADA', 'EXPIRADA')),
  constraint chk_revistoria_origem check (origem in ('MANUAL', 'ROTINA')),
  constraint chk_revistoria_vistoria check (vistoria_id is not null or situacao in ('DISPENSADA', 'UTILIZADA', 'CANCELADA', 'EXPIRADA'))
);

create unique index if not exists uq_revistoria_token on revistorias_cobranca (token);
-- Uma revistoria VIVA por veiculo: pedir de novo devolve a mesma.
create unique index if not exists uq_revistoria_viva on revistorias_cobranca (veiculo_id)
  where situacao in ('AGUARDANDO', 'EM_ANALISE', 'APROVADA', 'DISPENSADA');
create index if not exists idx_revistoria_situacao on revistorias_cobranca (situacao, created_at desc);
create index if not exists idx_revistoria_cliente on revistorias_cobranca (cliente_id);
create index if not exists idx_revistoria_reneg on revistorias_cobranca (renegociacao_id)
  where renegociacao_id is not null;

drop trigger if exists trg_revistorias_cobranca_updated on revistorias_cobranca;
create trigger trg_revistorias_cobranca_updated before update on revistorias_cobranca
  for each row execute function set_updated_at();

comment on table revistorias_cobranca is
  'Revistoria exigida para a 2a via de boleto vencido ha mais de N dias (0137). Link publico com token proprio; aprovada pela equipe; consumida por UMA renegociacao.';

create table if not exists revistoria_cobranca_historico (
  id            uuid primary key default gen_random_uuid(),
  revistoria_id uuid not null references revistorias_cobranca(id) on delete cascade,
  situacao_de   text,
  situacao_para text not null,
  detalhe       text,
  usuario_id    uuid references usuarios(id) on delete set null,
  created_at    timestamptz not null default clock_timestamp()
);
create index if not exists idx_revistoria_hist on revistoria_cobranca_historico (revistoria_id, created_at);

/** Trilha: toda troca de situacao, por QUALQUER caminho. O detalhe chega por
 *  `set_config('scar.motivo_revistoria', ...)` (mesmo mecanismo da OS 24h). */
create or replace function fn_revistoria_historico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.situacao is distinct from old.situacao then
    insert into revistoria_cobranca_historico (revistoria_id, situacao_de, situacao_para, detalhe, usuario_id)
    values (new.id, case when tg_op = 'UPDATE' then old.situacao end, new.situacao,
            nullif(current_setting('scar.motivo_revistoria', true), ''), usuario_atual_id());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_revistoria_historico on revistorias_cobranca;
create trigger trg_revistoria_historico after insert or update of situacao on revistorias_cobranca
  for each row execute function fn_revistoria_historico();

/** A unidade da revistoria esta no alcance de quem chama? (cobranca ou unidade) */
create or replace function revistoria_no_escopo(p_regional_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is null
      or tem_acesso_global()
      or exists (select 1 from cobranca_escopo() e where e.global or p_regional_id = any (e.regionais))
      or (p_regional_id is not null and p_regional_id = any (regionais_do_usuario()));
$$;

alter table revistorias_cobranca enable row level security;
alter table revistoria_cobranca_historico enable row level security;
drop policy if exists revistorias_cobranca_select on revistorias_cobranca;
create policy revistorias_cobranca_select on revistorias_cobranca for select to authenticated
  using (is_staff() and revistoria_no_escopo(regional_id));
drop policy if exists revistoria_hist_select on revistoria_cobranca_historico;
create policy revistoria_hist_select on revistoria_cobranca_historico for select to authenticated
  using (exists (select 1 from revistorias_cobranca r
                  where r.id = revistoria_id and is_staff() and revistoria_no_escopo(r.regional_id)));
-- sem policy de escrita: grava SO pelas RPCs e triggers.
grant select on revistorias_cobranca, revistoria_cobranca_historico to authenticated;
revoke all on revistorias_cobranca, revistoria_cobranca_historico from anon;

-- (E) ------------------------------------------------------------------------
/** Hoje em Sao Paulo (o banco roda em UTC). */
create or replace function revistoria_hoje()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

/**
 * Os boletos EM ABERTO e VENCIDOS de um associado (SCar e Mutual), com os dias
 * de atraso contados do VENCIMENTO EFETIVO (proximo dia util, como o painel de
 * inadimplencia, 0097).
 */
create or replace function revistoria_boletos_vencidos(p_cliente_id uuid)
returns table (origem text, ref_id uuid, veiculo_id uuid, vencimento date, valor numeric, dias_atraso integer)
language sql
stable
security definer
set search_path = public
as $$
  select b.origem, b.ref_id, b.veiculo_id, b.venc, b.valor,
         (revistoria_hoje() - dia_util_seguinte(b.venc))::integer
    from (
      select 'MUTUAL'::text as origem, h.id as ref_id, h.veiculo_id, h.data_vencimento as venc, h.valor
        from boletos_historico h
       where h.cliente_id = p_cliente_id and h.situacao = 'aberto' and h.baixa_banco_em is null
      union all
      select 'SCAR', t.id, t.veiculo_id, t.data_vencimento, t.valor
        from titulos_financeiros t
       where t.cliente_id = p_cliente_id and t.status::text in ('pendente', 'vencido')
    ) b
   where revistoria_hoje() > dia_util_seguinte(b.venc)
     and (is_staff() or auth.uid() is null);
$$;

/** Veiculo "na base" para fins de revistoria (contrato que segue vivo). */
create or replace function revistoria_veiculo_na_base(p_status text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_status, '') not in ('inativo', 'baixado', 'excluido');
$$;

/** Revistoria que LIBERA (aprovada ou dispensada, ainda nao consumida). */
create or replace function revistoria_libera(p_r revistorias_cobranca, p_renegociacao uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_r.situacao in ('APROVADA', 'DISPENSADA')
     and (p_r.renegociacao_id is null
          or p_r.renegociacao_id = p_renegociacao
          or exists (select 1 from cobranca_renegociacoes x
                      where x.id = p_r.renegociacao_id and x.situacao = 'ERRO'));
$$;

/**
 * A TRAVA. Antes de cada boleto original entrar numa 2a via/negociacao: vencido
 * ha mais de N dias exige revistoria liberada do veiculo dele (sem veiculo no
 * boleto: de todos os veiculos do associado na base). A revistoria fica
 * RESERVADA para esta renegociacao; quem a consome e o trigger abaixo.
 */
create or replace function fn_reneg_origem_exige_revistoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cli   uuid;
  v_veic  uuid;
  v_corte integer := dias_revistoria_boleto();
  v_dias  integer;
  r       record;
begin
  v_dias := revistoria_hoje() - dia_util_seguinte(new.vencimento);
  if v_dias <= v_corte then
    return new;
  end if;

  select cliente_id into v_cli from cobranca_renegociacoes where id = new.renegociacao_id;
  if new.origem = 'MUTUAL' then
    select veiculo_id into v_veic from boletos_historico where id = new.boleto_historico_id;
  else
    select veiculo_id into v_veic from titulos_financeiros where id = new.titulo_id;
  end if;

  for r in
    select v.id, v.placa, v.chassi from veiculos v
     where (v.id = v_veic or (v_veic is null and v.cliente_id = v_cli))
       and revistoria_veiculo_na_base(v.status::text)
  loop
    update revistorias_cobranca rc set renegociacao_id = new.renegociacao_id
     where rc.veiculo_id = r.id
       and revistoria_libera(rc, new.renegociacao_id);
    if not found then
      raise exception 'REVISTORIA PENDENTE: o veiculo % tem boleto vencido ha % dias (o limite e %). A 2a via so sai com a revistoria aprovada — ou liberada com justificativa.',
        coalesce(r.placa, '0 KM chassi ' || right(coalesce(r.chassi, ''), 6)), v_dias, v_corte
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_reneg_origem_revistoria on cobranca_renegociacao_origens;
create trigger trg_reneg_origem_revistoria before insert on cobranca_renegociacao_origens
  for each row execute function fn_reneg_origem_exige_revistoria();

/** EMITIDA consome a revistoria reservada (nunca reaproveita); ERRO devolve. */
create or replace function fn_reneg_consome_revistoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.situacao = 'EMITIDA' and old.situacao is distinct from 'EMITIDA' then
    perform set_config('scar.motivo_revistoria', 'Usada na 2a via/negociacao', true);
    update revistorias_cobranca set situacao = 'UTILIZADA', utilizada_em = now()
     where renegociacao_id = new.id and situacao in ('APROVADA', 'DISPENSADA');
    perform set_config('scar.motivo_revistoria', '', true);
  elsif new.situacao = 'ERRO' and old.situacao is distinct from 'ERRO' then
    update revistorias_cobranca set renegociacao_id = null
     where renegociacao_id = new.id and situacao in ('APROVADA', 'DISPENSADA');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reneg_consome_revistoria on cobranca_renegociacoes;
create trigger trg_reneg_consome_revistoria after update of situacao on cobranca_renegociacoes
  for each row execute function fn_reneg_consome_revistoria();

-- (F) ------------------------------------------------------------------------
/**
 * O que a 2a via destes boletos (ou de todos os vencidos do associado, sem
 * `p_origens`) exige: um veiculo por linha, com a revistoria viva dele.
 * `p_origens` = [{"origem":"MUTUAL"|"SCAR","id":"<uuid>"}].
 */
create or replace function revistoria_exigida(p_cliente_id uuid, p_origens jsonb default null)
returns table (
  veiculo_id        uuid,
  placa             text,
  chassi            text,
  modelo            text,
  dias_atraso       integer,
  vencimento        date,
  revistoria_id     uuid,
  situacao          text,
  token             uuid,
  token_expira_em   timestamptz,
  motivo_reprovacao text,
  liberada          boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reg uuid;
begin
  select regional_id into v_reg from clientes where id = p_cliente_id;
  if auth.uid() is not null and not (is_staff() and (cobranca_pode_cliente(p_cliente_id) or pode_regional(v_reg))) then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;

  return query
  with venc as (
    select b.* from revistoria_boletos_vencidos(p_cliente_id) b
     where b.dias_atraso > dias_revistoria_boleto()
       and (p_origens is null or exists (
             select 1 from jsonb_array_elements(p_origens) o
              where upper(o->>'origem') = b.origem and (o->>'id') = b.ref_id::text))
  ),
  alvo as (
    select v.id as vid, max(x.dias_atraso) as dias, min(x.vencimento) as venc
      from venc x
      join veiculos v on (v.id = x.veiculo_id or (x.veiculo_id is null and v.cliente_id = p_cliente_id))
     where revistoria_veiculo_na_base(v.status::text)
     group by v.id
  )
  select v.id, v.placa, v.chassi, nullif(btrim(coalesce(v.marca, '') || ' ' || coalesce(v.modelo, '')), ''),
         a.dias, a.venc, rc.id, rc.situacao, rc.token, rc.token_expira_em, rc.motivo_reprovacao,
         coalesce(revistoria_libera(rc), false)
    from alvo a
    join veiculos v on v.id = a.vid
    left join revistorias_cobranca rc
      on rc.veiculo_id = v.id and rc.situacao in ('AGUARDANDO', 'EM_ANALISE', 'APROVADA', 'DISPENSADA')
   order by v.placa nulls last;
end;
$$;

/**
 * Pede a revistoria do veiculo (ou devolve a que ja esta viva). O link vale 7
 * dias; reemitir devolve o MESMO token enquanto vigente (a mensagem que ja foi
 * no WhatsApp nao pode parar de funcionar — mesma regra da 0076).
 */
create or replace function solicitar_revistoria_cobranca(p_veiculo_id uuid, p_origem text default 'MANUAL')
returns table (revistoria_id uuid, token uuid, expira_em timestamptz, situacao text, reaproveitada boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_veic  veiculos%rowtype;
  v_r     revistorias_cobranca%rowtype;
  v_vist  uuid;
  v_dias  integer;
  v_venc  date;
  v_orig  text := upper(coalesce(nullif(btrim(p_origem), ''), 'MANUAL'));
begin
  select * into v_veic from veiculos where id = p_veiculo_id;
  if not found then
    raise exception 'Veiculo nao encontrado.' using errcode = 'no_data_found';
  end if;
  if auth.uid() is not null then
    if not is_staff() or not perfil_pode('revistoria', 'criar') then
      raise exception 'Sem permissao para pedir revistoria.' using errcode = 'insufficient_privilege';
    end if;
    if not (cobranca_pode_cliente(v_veic.cliente_id) or pode_regional(v_veic.regional_id)) then
      raise exception 'Este veiculo nao esta no seu alcance.' using errcode = 'insufficient_privilege';
    end if;
    v_orig := 'MANUAL';
  end if;
  if not revistoria_veiculo_na_base(v_veic.status::text) then
    raise exception 'O veiculo esta fora da base (%): nao ha revistoria a pedir.', v_veic.status
      using errcode = 'check_violation';
  end if;

  select * into v_r from revistorias_cobranca rc
   where rc.veiculo_id = p_veiculo_id
     and rc.situacao in ('AGUARDANDO', 'EM_ANALISE', 'APROVADA', 'DISPENSADA')
   for update;

  if found then
    if v_r.situacao = 'AGUARDANDO' and v_r.token_expira_em <= now() then
      update revistorias_cobranca
         set token = gen_random_uuid(), token_expira_em = now() + interval '7 days'
       where id = v_r.id
       returning * into v_r;
      return query select v_r.id, v_r.token, v_r.token_expira_em, v_r.situacao, false;
      return;
    end if;
    return query select v_r.id, v_r.token, v_r.token_expira_em, v_r.situacao, true;
    return;
  end if;

  select max(b.dias_atraso), min(b.vencimento) into v_dias, v_venc
    from revistoria_boletos_vencidos(v_veic.cliente_id) b
   where b.veiculo_id = p_veiculo_id or b.veiculo_id is null;

  insert into vistorias (veiculo_id, tipo, status, data_vistoria, created_by)
  values (p_veiculo_id, 'revistoria_cobranca', 'PENDENTE', revistoria_hoje(), usuario_atual_id())
  returning id into v_vist;

  insert into revistorias_cobranca (vistoria_id, cliente_id, veiculo_id, regional_id, token_expira_em,
                                    origem, dias_atraso, vencimento_referencia, solicitado_por)
  values (v_vist, v_veic.cliente_id, p_veiculo_id,
          coalesce(v_veic.regional_id, (select regional_id from clientes where id = v_veic.cliente_id)),
          now() + interval '7 days', case when v_orig = 'ROTINA' then 'ROTINA' else 'MANUAL' end,
          v_dias, v_venc, usuario_atual_id())
  returning * into v_r;

  return query select v_r.id, v_r.token, v_r.token_expira_em, v_r.situacao, false;
end;
$$;

/**
 * Abrir o link (caminho publico, service_role). Devolve SEMPRE uma linha com o
 * motivo — a pagina precisa distinguir link errado, vencido, em analise e ja
 * aprovado (mesma postura da 0076).
 */
create or replace function revistoria_por_token(p_token uuid)
returns table (
  valida            boolean,
  motivo            text,
  revistoria_id     uuid,
  situacao          text,
  nome              text,
  placa             text,
  chassi            text,
  marca             text,
  modelo            text,
  expira_em         timestamptz,
  motivo_reprovacao text,
  reprovacoes       integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_r revistorias_cobranca%rowtype;
  v_v veiculos%rowtype;
  v_c clientes%rowtype;
  v_m text;
begin
  if not (is_staff() or auth.uid() is null) then
    raise exception 'Sem permissao';
  end if;
  select * into v_r from revistorias_cobranca where token = p_token;
  if not found then
    return query select false, 'LINK_INVALIDO', null::uuid, null::text, null::text, null::text,
                        null::text, null::text, null::text, null::timestamptz, null::text, 0;
    return;
  end if;
  select * into v_v from veiculos where id = v_r.veiculo_id;
  select * into v_c from clientes where id = v_r.cliente_id;

  v_m := case
    when v_r.situacao = 'EM_ANALISE' then 'EM_ANALISE'
    when v_r.situacao in ('APROVADA', 'DISPENSADA', 'UTILIZADA') then 'APROVADA'
    when v_r.situacao in ('CANCELADA', 'EXPIRADA') then 'ENCERRADA'
    when v_r.token_expira_em <= now() then 'LINK_EXPIRADO'
    else 'OK' end;

  return query select v_m = 'OK', v_m, v_r.id, v_r.situacao, v_c.nome_razao_social, v_v.placa,
                      v_v.chassi, v_v.marca, v_v.modelo, v_r.token_expira_em, v_r.motivo_reprovacao,
                      v_r.reprovacoes;
end;
$$;

/** Os itens pedidos e o que ja chegou NESTA rodada (depois da ultima reprovacao). */
create or replace function revistoria_itens_publica(p_token uuid)
returns table (
  codigo           text,
  nome             text,
  instrucao        text,
  midia            text,
  obrigatorio      boolean,
  ordem            smallint,
  enviado          boolean,
  enviado_em       timestamptz,
  duracao_segundos numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select * from (
    with r as (select * from revistorias_cobranca where token = p_token),
    a as (
      select distinct on (an.tipo) an.tipo, an.created_at, an.duracao_segundos
        from vistoria_anexos an, r
       where an.vistoria_id = r.vistoria_id
         and an.created_at >= coalesce(r.reenvio_desde, '-infinity'::timestamptz)
       order by an.tipo, an.created_at desc, an.id desc
    )
    select i.codigo, i.nome, i.instrucao, i.midia, i.obrigatorio, i.ordem,
           a.tipo is not null, a.created_at, a.duracao_segundos
      from revistoria_itens i
      left join a on a.tipo = i.codigo
     where i.ativo and exists (select 1 from r)
     order by i.ordem, i.codigo
  ) _x where is_staff() or auth.uid() is null;
$$;

/** Recebe UMA midia pelo link. Revistoria e veiculo saem do TOKEN, nunca de parametro. */
create or replace function registrar_midia_revistoria_publica(
  p_token    uuid,
  p_tipo     text,
  p_url      text,
  p_tamanho  bigint default null,
  p_arquivo  text default null,
  p_duracao  numeric default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r     revistorias_cobranca%rowtype;
  v_item  revistoria_itens%rowtype;
  v_id    uuid;
begin
  if not (is_staff() or auth.uid() is null) then
    raise exception 'Sem permissao';
  end if;
  select * into v_r from revistorias_cobranca where token = p_token for update;
  if not found then raise exception 'Link invalido'; end if;
  if v_r.situacao <> 'AGUARDANDO' then
    raise exception 'Esta revistoria nao esta aberta para envio (%).', v_r.situacao;
  end if;
  if v_r.token_expira_em <= now() then raise exception 'Link expirado'; end if;

  select * into v_item from revistoria_itens where codigo = p_tipo and ativo;
  if not found then raise exception 'Item % nao existe na revistoria', p_tipo; end if;
  if v_item.midia = 'VIDEO' then
    if p_duracao is null then
      raise exception 'O video chegou sem a duracao. Grave de novo pelo botao da pagina.';
    end if;
    if p_duracao > 32 then
      raise exception 'O video tem % segundos; o limite e 30.', round(p_duracao);
    end if;
  end if;

  -- `clock_timestamp()`, nao `now()`: e ele que separa a rodada reprovada da nova
  -- (`reenvio_desde`), e `now()` e o inicio da transacao.
  insert into vistoria_anexos (vistoria_id, url, tipo, descricao, tamanho_bytes, enviado_pelo_cliente,
                               duracao_segundos, created_at)
  values (v_r.vistoria_id, p_url, p_tipo, p_arquivo, p_tamanho, true, p_duracao, clock_timestamp())
  returning id into v_id;
  return v_id;
end;
$$;

/** O associado terminou: tudo o que e obrigatorio chegou nesta rodada -> EM ANALISE. */
create or replace function concluir_revistoria_publica(p_token uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r     revistorias_cobranca%rowtype;
  v_falta text;
begin
  if not (is_staff() or auth.uid() is null) then
    raise exception 'Sem permissao';
  end if;
  select * into v_r from revistorias_cobranca where token = p_token for update;
  if not found then raise exception 'Link invalido'; end if;
  if v_r.situacao <> 'AGUARDANDO' then
    raise exception 'Esta revistoria nao esta aberta para envio (%).', v_r.situacao;
  end if;
  if v_r.token_expira_em <= now() then raise exception 'Link expirado'; end if;

  select string_agg(i.nome, ', ' order by i.ordem) into v_falta
    from revistoria_itens i
   where i.ativo and i.obrigatorio
     and not exists (select 1 from vistoria_anexos an
                      where an.vistoria_id = v_r.vistoria_id and an.tipo = i.codigo
                        and an.created_at >= coalesce(v_r.reenvio_desde, '-infinity'::timestamptz));
  if v_falta is not null then
    raise exception 'Ainda falta: %.', v_falta using errcode = 'check_violation';
  end if;

  perform set_config('scar.motivo_revistoria', 'Enviada pelo associado', true);
  update revistorias_cobranca set situacao = 'EM_ANALISE', enviado_em = now() where id = v_r.id;
  return 'EM_ANALISE';
end;
$$;

/** A fila da equipe. EM ANALISE primeiro (a mais antiga no topo). */
create or replace function revistorias_cobranca_listar(
  p_situacao text default null,
  p_busca    text default null,
  p_limite   integer default 200
)
returns table (
  id                     uuid,
  situacao               text,
  origem                 text,
  cliente_id             uuid,
  associado              text,
  cpf_cnpj               text,
  celular                text,
  veiculo_id             uuid,
  placa                  text,
  chassi                 text,
  modelo                 text,
  regional               text,
  dias_atraso            integer,
  vencimento_referencia  date,
  created_at             timestamptz,
  enviado_em             timestamptz,
  analisado_em           timestamptz,
  analisado_por_nome     text,
  reprovacoes            integer,
  motivo_reprovacao      text,
  token                  uuid,
  token_expira_em        timestamptz,
  dispensa_justificativa text,
  renegociacao_id        uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.situacao, r.origem, r.cliente_id, c.nome_razao_social, c.cpf_cnpj,
         coalesce(c.celular, c.telefone), r.veiculo_id, v.placa, v.chassi,
         nullif(btrim(coalesce(v.marca, '') || ' ' || coalesce(v.modelo, '')), ''),
         g.nome, r.dias_atraso, r.vencimento_referencia, r.created_at, r.enviado_em, r.analisado_em,
         u.nome, r.reprovacoes, r.motivo_reprovacao, r.token, r.token_expira_em,
         r.dispensa_justificativa, r.renegociacao_id
    from revistorias_cobranca r
    join clientes c on c.id = r.cliente_id
    join veiculos v on v.id = r.veiculo_id
    left join regionais g on g.id = r.regional_id
    left join usuarios u on u.id = r.analisado_por
   where is_staff()
     and revistoria_no_escopo(r.regional_id)
     and (p_situacao is null or r.situacao = upper(p_situacao)
          or (upper(p_situacao) = 'ABERTAS' and r.situacao in ('AGUARDANDO', 'EM_ANALISE')))
     and (nullif(btrim(coalesce(p_busca, '')), '') is null
          or c.nome_razao_social ilike '%' || btrim(p_busca) || '%'
          or v.placa ilike '%' || regexp_replace(btrim(p_busca), '[^A-Za-z0-9]', '', 'g') || '%'
          or c.cpf_cnpj like '%' || nullif(regexp_replace(p_busca, '\D', '', 'g'), '') || '%'
          or v.chassi ilike '%' || btrim(p_busca) || '%')
   order by case r.situacao when 'EM_ANALISE' then 0 when 'AGUARDANDO' then 1 else 2 end,
            case when r.situacao = 'EM_ANALISE' then r.enviado_em end asc nulls last,
            r.created_at desc
   limit greatest(1, least(coalesce(p_limite, 200), 1000));
$$;

/**
 * As midias para a analise: ATUAL (esta revistoria; `rodada_atual` marca o que
 * chegou depois da ultima reprovacao) e ANTERIOR (a vistoria mais recente do
 * mesmo veiculo que tenha anexos — da venda ou de outra revistoria), para
 * comparar o carro de hoje com o de antes.
 */
create or replace function revistoria_cobranca_midias(p_revistoria_id uuid)
returns table (
  grupo            text,
  anexo_id         uuid,
  codigo           text,
  nome             text,
  midia            text,
  url              text,
  enviado_em       timestamptz,
  tamanho_bytes    bigint,
  duracao_segundos numeric,
  rodada_atual     boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_r   revistorias_cobranca%rowtype;
  v_ant uuid;
begin
  select * into v_r from revistorias_cobranca where id = p_revistoria_id;
  if not found then return; end if;
  if auth.uid() is not null and not (is_staff() and revistoria_no_escopo(v_r.regional_id)) then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;

  select vi.id into v_ant
    from vistorias vi
   where vi.veiculo_id = v_r.veiculo_id
     and vi.id is distinct from v_r.vistoria_id
     and exists (select 1 from vistoria_anexos an where an.vistoria_id = vi.id)
   order by vi.created_at desc
   limit 1;

  return query
  select 'ATUAL'::text, an.id, an.tipo, coalesce(i.nome, an.tipo),
         case when an.tipo like 'REV\_VIDEO%' then 'VIDEO' else 'FOTO' end,
         an.url, an.created_at, an.tamanho_bytes, an.duracao_segundos,
         an.created_at >= coalesce(v_r.reenvio_desde, '-infinity'::timestamptz)
    from vistoria_anexos an
    left join revistoria_itens i on i.codigo = an.tipo
   where v_r.vistoria_id is not null and an.vistoria_id = v_r.vistoria_id
  union all
  select 'ANTERIOR', an.id, an.tipo,
         coalesce(i.nome, m.nome, an.tipo),
         case when an.tipo like 'REV\_VIDEO%' then 'VIDEO' else 'FOTO' end,
         an.url, an.created_at, an.tamanho_bytes, an.duracao_segundos, false
    from vistoria_anexos an
    left join revistoria_itens i on i.codigo = an.tipo
    left join vistoria_fotos_modelo m on upper(m.codigo) = upper(an.tipo)
   where v_ant is not null and an.vistoria_id = v_ant
   order by 1 desc, 7 desc;
end;
$$;

/** Aprovar (libera a 2a via) ou reprovar (o mesmo link reabre com o motivo). */
create or replace function analisar_revistoria_cobranca(
  p_revistoria_id uuid,
  p_aprovar       boolean,
  p_motivo        text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r      revistorias_cobranca%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into v_r from revistorias_cobranca where id = p_revistoria_id for update;
  if not found then raise exception 'Revistoria nao encontrada.' using errcode = 'no_data_found'; end if;
  if auth.uid() is not null and not (is_staff() and perfil_pode('revistoria', 'fechar')
                                     and revistoria_no_escopo(v_r.regional_id)) then
    raise exception 'Sem permissao para analisar revistoria.' using errcode = 'insufficient_privilege';
  end if;
  if v_r.situacao <> 'EM_ANALISE' then
    raise exception 'So se analisa revistoria enviada (esta esta %).', v_r.situacao using errcode = 'check_violation';
  end if;

  if p_aprovar then
    perform set_config('scar.motivo_revistoria', coalesce(v_motivo, 'Aprovada'), true);
    update revistorias_cobranca
       set situacao = 'APROVADA', analisado_por = usuario_atual_id(), analisado_em = now(),
           observacao_analise = v_motivo
     where id = v_r.id;
    update vistorias set status = 'APROVADA', data_vistoria = revistoria_hoje() where id = v_r.vistoria_id;
    return 'APROVADA';
  end if;

  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'Diga ao associado o que refazer (motivo com pelo menos 5 letras).' using errcode = 'check_violation';
  end if;
  perform set_config('scar.motivo_revistoria', 'Reprovada: ' || v_motivo, true);
  update revistorias_cobranca
     set situacao = 'AGUARDANDO', analisado_por = usuario_atual_id(), analisado_em = now(),
         reprovacoes = reprovacoes + 1, motivo_reprovacao = v_motivo,
         reenvio_desde = clock_timestamp(), enviado_em = null,
         token_expira_em = greatest(token_expira_em, now() + interval '7 days')
   where id = v_r.id;
  return 'REPROVADA';
end;
$$;

/** Liberar a 2a via SEM revistoria (decisao do usuario: com permissao e justificativa). */
create or replace function dispensar_revistoria_cobranca(p_veiculo_id uuid, p_justificativa text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_veic veiculos%rowtype;
  v_r    revistorias_cobranca%rowtype;
  v_just text := nullif(btrim(coalesce(p_justificativa, '')), '');
  v_reg  uuid;
begin
  select * into v_veic from veiculos where id = p_veiculo_id;
  if not found then raise exception 'Veiculo nao encontrado.' using errcode = 'no_data_found'; end if;
  v_reg := coalesce(v_veic.regional_id, (select regional_id from clientes where id = v_veic.cliente_id));
  if auth.uid() is not null and not (is_staff() and perfil_pode('revistoria', 'cancelar')
                                     and revistoria_no_escopo(v_reg)) then
    raise exception 'Sem permissao para liberar sem revistoria.' using errcode = 'insufficient_privilege';
  end if;
  if v_just is null or length(v_just) < 10 then
    raise exception 'Justifique a liberacao (pelo menos 10 letras): ela fica na trilha.' using errcode = 'check_violation';
  end if;

  perform set_config('scar.motivo_revistoria', 'Liberada sem revistoria: ' || v_just, true);
  select * into v_r from revistorias_cobranca rc
   where rc.veiculo_id = p_veiculo_id
     and rc.situacao in ('AGUARDANDO', 'EM_ANALISE', 'APROVADA', 'DISPENSADA')
   for update;
  if found then
    if v_r.situacao in ('APROVADA', 'DISPENSADA') then
      raise exception 'Este veiculo ja esta liberado (%).', v_r.situacao using errcode = 'check_violation';
    end if;
    update revistorias_cobranca
       set situacao = 'DISPENSADA', dispensa_justificativa = v_just,
           dispensado_por = usuario_atual_id(), dispensado_em = now()
     where id = v_r.id;
    return v_r.id;
  end if;

  insert into revistorias_cobranca (cliente_id, veiculo_id, regional_id, situacao, origem,
                                    dispensa_justificativa, dispensado_por, dispensado_em, solicitado_por)
  values (v_veic.cliente_id, p_veiculo_id, v_reg, 'DISPENSADA', 'MANUAL', v_just,
          usuario_atual_id(), now(), usuario_atual_id())
  returning id into v_r.id;
  return v_r.id;
end;
$$;

/** Cancelar um pedido aberto (ex.: pedido por engano). Nao mexe no que ja foi reservado. */
create or replace function cancelar_revistoria_cobranca(p_revistoria_id uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r      revistorias_cobranca%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into v_r from revistorias_cobranca where id = p_revistoria_id for update;
  if not found then raise exception 'Revistoria nao encontrada.' using errcode = 'no_data_found'; end if;
  if auth.uid() is not null and not (is_staff() and perfil_pode('revistoria', 'criar')
                                     and revistoria_no_escopo(v_r.regional_id)) then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;
  if v_r.situacao not in ('AGUARDANDO', 'EM_ANALISE', 'APROVADA', 'DISPENSADA') then
    raise exception 'Esta revistoria ja esta encerrada (%).', v_r.situacao using errcode = 'check_violation';
  end if;
  if v_r.renegociacao_id is not null and not exists (
       select 1 from cobranca_renegociacoes x where x.id = v_r.renegociacao_id and x.situacao = 'ERRO') then
    raise exception 'Esta revistoria esta sendo usada numa 2a via em emissao.' using errcode = 'check_violation';
  end if;
  if v_motivo is null then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'check_violation';
  end if;
  perform set_config('scar.motivo_revistoria', 'Cancelada: ' || v_motivo, true);
  update revistorias_cobranca set situacao = 'CANCELADA', encerrada_motivo = v_motivo, renegociacao_id = null
   where id = v_r.id;
  return 'CANCELADA';
end;
$$;

/**
 * Quem PRECISA de revistoria e ainda nao tem pedido vivo: veiculos na base com
 * boleto vencido ha mais de N dias. E a entrada do robo de cobranca (que vai
 * pedir e mandar o link sozinho) e a aba "A pedir" da tela.
 */
create or replace function revistorias_a_solicitar(p_limite integer default 300)
returns table (
  cliente_id  uuid,
  associado   text,
  cpf_cnpj    text,
  celular     text,
  veiculo_id  uuid,
  placa       text,
  chassi      text,
  modelo      text,
  regional    text,
  dias_atraso integer,
  vencimento  date,
  valor_vencido numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with corte as (select dias_revistoria_boleto() as n),
  b as (
    select 'MUTUAL'::text as origem, h.cliente_id, h.veiculo_id, h.data_vencimento as venc, h.valor
      from boletos_historico h
     where h.situacao = 'aberto' and h.baixa_banco_em is null
    union all
    select 'SCAR', t.cliente_id, t.veiculo_id, t.data_vencimento, t.valor
      from titulos_financeiros t
     where t.status::text in ('pendente', 'vencido') and t.cliente_id is not null
  ),
  venc as (
    select b.*, (revistoria_hoje() - dia_util_seguinte(b.venc))::integer as dias
      from b, corte
     where b.venc < revistoria_hoje() - corte.n
       and revistoria_hoje() - dia_util_seguinte(b.venc) > corte.n
  ),
  alvo as (
    select v.id as vid, v.cliente_id, max(x.dias) as dias, min(x.venc) as venc, sum(x.valor) as valor
      from venc x
      join veiculos v on (v.id = x.veiculo_id or (x.veiculo_id is null and v.cliente_id = x.cliente_id))
     where revistoria_veiculo_na_base(v.status::text)
     group by v.id, v.cliente_id
  )
  select a.cliente_id, c.nome_razao_social, c.cpf_cnpj, coalesce(c.celular, c.telefone),
         v.id, v.placa, v.chassi, nullif(btrim(coalesce(v.marca, '') || ' ' || coalesce(v.modelo, '')), ''),
         g.nome, a.dias, a.venc, a.valor
    from alvo a
    join veiculos v on v.id = a.vid
    join clientes c on c.id = a.cliente_id
    left join regionais g on g.id = coalesce(v.regional_id, c.regional_id)
   where (is_staff() or auth.uid() is null)
     and revistoria_no_escopo(coalesce(v.regional_id, c.regional_id))
     and not exists (select 1 from revistorias_cobranca rc
                      where rc.veiculo_id = v.id
                        and rc.situacao in ('AGUARDANDO', 'EM_ANALISE', 'APROVADA', 'DISPENSADA'))
   order by a.dias desc, c.nome_razao_social
   limit greatest(1, least(coalesce(p_limite, 300), 5000));
$$;

/**
 * A rotina diaria (agendador, sem sessao; ou a matriz pela tela):
 *  - pedido vivo e nao reservado de quem nao tem mais nada vencido acima de N
 *    dias -> CANCELADA (o associado pagou o original, ou o boleto foi tratado);
 *  - aprovada/liberada e nao usada ha mais de 10 dias -> EXPIRADA (nunca
 *    reaproveita: o proximo atraso pede revistoria nova).
 */
create or replace function rotina_revistorias_cobranca()
returns table (canceladas integer, expiradas integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c integer := 0;
  v_e integer := 0;
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'So a matriz roda a rotina.' using errcode = 'insufficient_privilege';
  end if;

  perform set_config('scar.motivo_revistoria', 'Nada vencido acima do limite: o debito foi tratado', true);
  with alvo as (
    select r.id from revistorias_cobranca r
     where r.situacao in ('AGUARDANDO', 'EM_ANALISE', 'APROVADA', 'DISPENSADA')
       and (r.renegociacao_id is null or exists (
             select 1 from cobranca_renegociacoes x where x.id = r.renegociacao_id and x.situacao = 'ERRO'))
       and not exists (
             select 1 from revistoria_boletos_vencidos(r.cliente_id) b
              where b.dias_atraso > dias_revistoria_boleto()
                and (b.veiculo_id = r.veiculo_id or b.veiculo_id is null))
  )
  update revistorias_cobranca r set situacao = 'CANCELADA',
         encerrada_motivo = 'Nada vencido acima do limite: o debito foi tratado', renegociacao_id = null
    from alvo where r.id = alvo.id;
  get diagnostics v_c = row_count;

  perform set_config('scar.motivo_revistoria', 'Aprovada e nao usada em 10 dias (nunca reaproveita)', true);
  update revistorias_cobranca r set situacao = 'EXPIRADA',
         encerrada_motivo = 'Aprovada e nao usada em 10 dias', renegociacao_id = null
   where r.situacao in ('APROVADA', 'DISPENSADA')
     and coalesce(r.analisado_em, r.dispensado_em, r.updated_at) < now() - interval '10 days'
     and (r.renegociacao_id is null or exists (
           select 1 from cobranca_renegociacoes x where x.id = r.renegociacao_id and x.situacao = 'ERRO'));
  get diagnostics v_e = row_count;
  perform set_config('scar.motivo_revistoria', '', true);

  return query select v_c, v_e;
end;
$$;

-- (G) ------------------------------------------------------------------------
create or replace function permissao_celula_valida(p_modulo text, p_acao text)
returns boolean
language sql immutable
as $$
  select (p_modulo, p_acao) in (
    ('painel','ver'), ('painel','exportar'),
    ('sac','ver'), ('sac','criar'), ('sac','editar'), ('sac','transferir'), ('sac','fechar'),
    ('protocolos','ver'), ('protocolos','criar'), ('protocolos','editar'),
      ('protocolos','transferir'), ('protocolos','fechar'),
    ('assistencia','ver'), ('assistencia','criar'), ('assistencia','editar'),
      ('assistencia','excluir'),
      ('assistencia','cancelar'), ('assistencia','transferir'), ('assistencia','fechar'),
    ('vendas','ver'), ('vendas','criar'), ('vendas','editar'), ('vendas','excluir'),
      ('vendas','exportar'), ('vendas','cancelar'), ('vendas','transferir'), ('vendas','fechar'),
    ('associados','ver'), ('associados','criar'), ('associados','editar'),
      ('associados','excluir'), ('associados','exportar'),
    ('veiculos','ver'), ('veiculos','criar'), ('veiculos','editar'), ('veiculos','excluir'),
      ('veiculos','exportar'), ('veiculos','cancelar'),
    ('rastreadores','ver'), ('rastreadores','criar'), ('rastreadores','editar'),
      ('rastreadores','transferir'), ('rastreadores','baixar'),
    ('eventos','ver'), ('eventos','criar'), ('eventos','editar'), ('eventos','excluir'),
      ('eventos','exportar'), ('eventos','cancelar'), ('eventos','transferir'), ('eventos','fechar'),
    ('cobranca','ver'), ('cobranca','criar'), ('cobranca','editar'), ('cobranca','exportar'),
      ('cobranca','baixar'), ('cobranca','cancelar'),
    ('revistoria','ver'), ('revistoria','criar'), ('revistoria','fechar'), ('revistoria','cancelar'),
    ('precificacao','ver'), ('precificacao','editar'), ('precificacao','exportar'),
    ('fornecedores','ver'), ('fornecedores','criar'), ('fornecedores','editar'),
      ('fornecedores','excluir'), ('fornecedores','exportar'),
    ('financeiro','ver'), ('financeiro','criar'), ('financeiro','editar'), ('financeiro','excluir'),
      ('financeiro','exportar'), ('financeiro','baixar'), ('financeiro','estornar'),
      ('financeiro','cancelar'),
    ('comunicados','ver'), ('comunicados','criar'), ('comunicados','editar'), ('comunicados','excluir'),
    ('termos_modelos','ver'), ('termos_modelos','criar'), ('termos_modelos','editar'),
      ('termos_modelos','excluir'),
    ('termos','ver'), ('termos','criar'), ('termos','exportar'), ('termos','cancelar')
  );
$$;

create or replace function minhas_permissoes()
returns text[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(k order by k), '{}') from (
    select c.modulo || '.' || c.acao as k
      from (
        select m.modulo, a.acao
          from (values ('painel'),('sac'),('protocolos'),('assistencia'),('vendas'),('associados'),
                       ('veiculos'),('rastreadores'),('eventos'),('cobranca'),('revistoria'),
                       ('precificacao'),('fornecedores'),('financeiro'),('comunicados'),
                       ('termos_modelos'),('termos')) m(modulo)
         cross join (values ('ver'),('criar'),('editar'),('excluir'),('exportar'),('baixar'),
                            ('estornar'),('cancelar'),('transferir'),('fechar')) a(acao)
         where permissao_celula_valida(m.modulo, a.acao)
      ) c
     where perfil_pode(c.modulo, c.acao)
    union all
    select k from unnest(array['desconto', 'liberar_24h', 'leads']) k where papel_pode(k)
  ) t;
$$;

-- Seed das celulas novas (re-executavel: nao sobrescreve ajuste do admin).
-- ver/criar (pedir e reenviar o link): todo staff. fechar (aprovar/reprovar):
-- financeiro, gestor, supervisor e cobranca. cancelar (liberar SEM revistoria):
-- financeiro e gestor regional.
insert into perfil_permissoes (papel, modulo, acao, concedida)
select p.papel, 'revistoria', a.acao,
       case a.acao
         when 'ver'      then true
         when 'criar'    then true
         when 'fechar'   then p.papel in ('financeiro', 'gestor_regional', 'supervisor', 'cobranca')
         when 'cancelar' then p.papel in ('financeiro', 'gestor_regional')
       end
  from (values ('financeiro'), ('gestor_regional'), ('consultor_vendas'), ('sinistro'),
               ('auditoria'), ('assistencia_24h'), ('supervisor'), ('cobranca')) p(papel)
 cross join (values ('ver'), ('criar'), ('fechar'), ('cancelar')) a(acao)
 where not exists (select 1 from perfil_permissoes x
                    where x.papel = p.papel and x.modulo = 'revistoria' and x.acao = a.acao);

-- Perfis personalizados (0130): nascem com o que o papel de base recebeu acima.
insert into perfil_permissoes (papel, modulo, acao, concedida)
select pa.id::text, 'revistoria', b.acao, b.concedida
  from perfis_acesso pa
  join perfil_permissoes b on b.papel = pa.papel_base and b.modulo = 'revistoria'
 where not exists (select 1 from perfil_permissoes x
                    where x.papel = pa.id::text and x.modulo = 'revistoria' and x.acao = b.acao);

-- ============================================================================
-- RITO DE SEGURANCA (0052)
-- ============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
