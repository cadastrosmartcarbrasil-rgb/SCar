-- ============================================================================
-- SCar :: 0026_assistencia_24h.sql
-- MODULO ASSISTENCIA 24 HORAS — central de acionamento integrada ao SAC, a
-- ficha do veiculo, ao cadastro de prestadores e ao Contas a Pagar.
--
--   A) PARAMETRIZACAO: catalogo `servicos_assistencia` (valor padrao, plano de
--      contas, KM excedente, regra de limite por janela flutuante em MESES) e
--      `prestador_servicos` (quais prestadores atendem cada servico e por
--      quanto). `fornecedores` ganha os campos de prestador 24h (whatsapp,
--      cobertura, chave PIX).
--   B) TRAVA + ALCADA: `situacao_assistencia_veiculo()` diz se o veiculo pode
--      acionar (ativo, adimplente, sem pendencia cadastral) e
--      `elegibilidade_assistencia()` devolve o consumo do limite em tempo real.
--      `abrir_acionamento()` bloqueia quando ha impedimento e so prossegue com
--      LIBERACAO DE SUPERIOR (a chamada tem de ser feita pelo gestor, que
--      carimba liberado_por/justificativa).
--   C) OPERACAO: cotacao com prestadores (`acionamento_cotacoes`), geracao da
--      OS com codigo unico (`confirmar_prestador`), trilha de status
--      (`acionamento_historico`) e conclusao.
--   D) FINANCEIRO: ao concluir, a OS vira LANCAMENTO em Contas a Pagar
--      (fornecedor + plano de contas do servico), pronto para baixa. O papel
--      `assistencia_24h` recebe acesso a prestadores e ao contas a pagar.
-- ============================================================================

-- Novo papel (o literal so pode ser usado em OUTRA transacao — comparamos como
-- texto no restante do arquivo, mesmo motivo do 0017).
alter type papel_usuario add value if not exists 'assistencia_24h';

do $$ begin
  if not exists (select 1 from pg_type where typname = 'status_acionamento') then
    create type status_acionamento as enum (
      'ABERTO', 'EM_COTACAO', 'AUTORIZADO', 'EM_ATENDIMENTO', 'CONCLUIDO', 'CANCELADO'
    );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- A) Parametrizacao: servicos 24h e prestadores
-- ----------------------------------------------------------------------------
create table if not exists servicos_assistencia (
  id                  uuid primary key default gen_random_uuid(),
  descricao           text not null unique,          -- Reboque Passeio, Chaveiro, Carro Reserva...
  valor_padrao        numeric(12,2) not null default 0,   -- valor base pago ao prestador
  categoria_dre_id    uuid references categorias_dre(id) on delete set null,  -- plano de contas
  cobra_km_excedente  boolean not null default false,
  valor_km_excedente  numeric(12,2) not null default 0,
  km_franquia         numeric(12,2) not null default 0,   -- KM incluidos antes do excedente
  computa_limite      boolean not null default false,     -- computa no limite do opcional?
  limite_quantidade   integer not null default 1,         -- ex.: 2 utilizacoes
  limite_janela_meses integer not null default 12,        -- ...a cada 12 meses (janela flutuante)
  produto_id          uuid references produtos(id) on delete set null,  -- opcional que da direito
  observacoes         text,
  ativo               boolean not null default true,
  ordem               integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint chk_servico_limite check (limite_quantidade >= 0 and limite_janela_meses > 0)
);
create trigger trg_servicos_assist_updated before update on servicos_assistencia
  for each row execute function set_updated_at();

-- Campos de prestador 24h no cadastro de fornecedores (reuso, sem duplicar).
alter table fornecedores
  add column if not exists prestador_assistencia boolean not null default false,
  add column if not exists whatsapp   text,
  add column if not exists cobertura  text,               -- regiao/cidades atendidas
  add column if not exists chave_pix  text,
  add column if not exists observacoes text;

-- Quais servicos cada prestador atende (e por quanto).
create table if not exists prestador_servicos (
  fornecedor_id   uuid not null references fornecedores(id) on delete cascade,
  servico_id      uuid not null references servicos_assistencia(id) on delete cascade,
  valor_acordado  numeric(12,2),
  valor_km        numeric(12,2),
  prazo_medio_min integer,
  ativo           boolean not null default true,
  primary key (fornecedor_id, servico_id)
);
create index if not exists idx_prestador_servicos_servico on prestador_servicos (servico_id) where ativo;

-- ----------------------------------------------------------------------------
-- C) Acionamentos (Ordem de Servico) + cotacoes + trilha
-- ----------------------------------------------------------------------------
create table if not exists acionamentos_assistencia (
  id                  uuid primary key default gen_random_uuid(),
  protocolo           text unique,                    -- ASS-YYYYMMDD-XXXX (trigger)
  codigo_os           text unique,                    -- OS-YYYYMMDD-XXXX (na autorizacao)
  veiculo_id          uuid not null references veiculos(id) on delete restrict,
  cliente_id          uuid not null references clientes(id) on delete restrict,
  servico_id          uuid not null references servicos_assistencia(id) on delete restrict,
  atendimento_id      uuid references atendimentos(id) on delete set null,   -- chamado do SAC
  evento_id           uuid references eventos_sinistro(id) on delete set null,
  status              status_acionamento not null default 'ABERTO',
  -- solicitacao
  solicitante_nome    text,
  solicitante_telefone text,
  origem              jsonb not null default '{}'::jsonb,   -- {logradouro,cidade,uf,referencia,lat,lng}
  destino             jsonb not null default '{}'::jsonb,
  km_previsto         numeric(12,2),
  km_percorrido       numeric(12,2),
  km_excedente        numeric(12,2) not null default 0,
  observacoes         text,
  -- prestador / valores (OS)
  prestador_id        uuid references fornecedores(id) on delete set null,
  valor_servico       numeric(12,2) not null default 0,
  valor_km_excedente  numeric(12,2) not null default 0,
  valor_total         numeric(12,2) not null default 0,
  prazo_estimado_min  integer,
  -- trava / alcada
  computa_limite      boolean not null default false,       -- snapshot da regra do servico
  bloqueio_motivos    text[] not null default '{}',         -- por que estava bloqueado
  liberado_por        uuid references usuarios(id) on delete set null,
  liberado_em         timestamptz,
  liberacao_justificativa text,
  -- integracao financeira / trilha
  lancamento_id       uuid references lancamentos_financeiros(id) on delete set null,
  voucher_enviado_em  timestamptz,
  aberto_por          uuid references usuarios(id) on delete set null,
  concluido_em        timestamptz,
  cancelado_motivo    text,
  regional_id         uuid references regionais(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_acion_veiculo on acionamentos_assistencia (veiculo_id, created_at desc);
create index if not exists idx_acion_cliente on acionamentos_assistencia (cliente_id, created_at desc);
create index if not exists idx_acion_status  on acionamentos_assistencia (status);
create index if not exists idx_acion_servico on acionamentos_assistencia (servico_id, veiculo_id);
create index if not exists idx_acion_prestador on acionamentos_assistencia (prestador_id);

create table if not exists acionamento_cotacoes (
  id             uuid primary key default gen_random_uuid(),
  acionamento_id uuid not null references acionamentos_assistencia(id) on delete cascade,
  fornecedor_id  uuid not null references fornecedores(id) on delete restrict,
  valor          numeric(12,2) not null default 0,
  valor_km       numeric(12,2),
  prazo_estimado_min integer,
  observacao     text,
  escolhida      boolean not null default false,
  created_by     uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (acionamento_id, fornecedor_id)
);

create table if not exists acionamento_historico (
  id             uuid primary key default gen_random_uuid(),
  acionamento_id uuid not null references acionamentos_assistencia(id) on delete cascade,
  status         status_acionamento not null,
  observacao     text,
  usuario_id     uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_acion_hist on acionamento_historico (acionamento_id, created_at);

-- Protocolo ASS-YYYYMMDD-XXXX (espelha eventos/atendimentos).
create or replace function fn_protocolo_acionamento()
returns trigger language plpgsql as $$
declare v_data text; v_seq integer;
begin
  if new.protocolo is not null then return new; end if;
  v_data := to_char(now(), 'YYYYMMDD');
  perform pg_advisory_xact_lock(hashtext('acionamento_' || v_data));
  select coalesce(max((regexp_replace(protocolo, '^ASS-\d{8}-', ''))::integer), 0) + 1
    into v_seq
    from acionamentos_assistencia
   where protocolo like 'ASS-' || v_data || '-%';
  new.protocolo := 'ASS-' || v_data || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;
create trigger trg_protocolo_acionamento before insert on acionamentos_assistencia
  for each row execute function fn_protocolo_acionamento();
create trigger trg_acion_updated before update on acionamentos_assistencia
  for each row execute function set_updated_at();

-- Trilha automatica de status.
create or replace function fn_acionamento_historico()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into acionamento_historico (acionamento_id, status, usuario_id)
      values (new.id, new.status, auth.uid());
  end if;
  return new;
end;
$$;
create trigger trg_acionamento_historico after insert or update of status on acionamentos_assistencia
  for each row execute function fn_acionamento_historico();

-- ----------------------------------------------------------------------------
-- Permissoes do modulo
-- ----------------------------------------------------------------------------
-- Atendente 24h opera o modulo (inclui as funcoes financeiras do fluxo).
create or replace function pode_assistencia()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(auth_papel()::text in ('admin', 'financeiro', 'gestor_regional', 'assistencia_24h', 'sinistro'), false);
$$;

-- Alcada de liberacao (excecao a trava financeira/cadastral).
create or replace function pode_liberar_assistencia()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(auth_papel()::text in ('admin', 'financeiro', 'gestor_regional'), false);
$$;

-- ----------------------------------------------------------------------------
-- B) Limite de uso (janela flutuante em MESES) e trava do veiculo
-- ----------------------------------------------------------------------------
-- Consumo por servico do veiculo na janela: conta os acionamentos que sairam do
-- papel (autorizados em diante) dentro dos ultimos N meses.
create or replace function elegibilidade_assistencia(p_veiculo_id uuid)
returns table (
  servico_id        uuid,
  descricao         text,
  computa_limite    boolean,
  limite_quantidade integer,
  janela_meses      integer,
  usados            integer,
  restantes         integer,
  elegivel          boolean,
  ultimo_uso        date
)
language sql stable
as $$
  select s.id,
         s.descricao,
         s.computa_limite,
         s.limite_quantidade,
         s.limite_janela_meses,
         coalesce(u.usados, 0)::int,
         case when s.computa_limite
              then greatest(0, s.limite_quantidade - coalesce(u.usados, 0))::int
              else null end,
         (not s.computa_limite) or coalesce(u.usados, 0) < s.limite_quantidade,
         u.ultimo_uso
    from servicos_assistencia s
    left join lateral (
      select count(*)::int as usados, max(a.created_at::date) as ultimo_uso
        from acionamentos_assistencia a
       where a.veiculo_id = p_veiculo_id
         and a.servico_id = s.id
         and a.status in ('AUTORIZADO', 'EM_ATENDIMENTO', 'CONCLUIDO')
         and a.created_at >= now() - make_interval(months => s.limite_janela_meses)
    ) u on true
   where s.ativo
   order by s.ordem, s.descricao;
$$;

-- Situacao do veiculo para acionar: ativo + adimplente + sem pendencia cadastral.
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
begin
  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then return; end if;
  select * into cli from clientes where id = v.cliente_id;

  -- Inadimplencia: titulo do veiculo (ou do associado, no agrupado) vencido.
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

  if v.status <> 'ativo' then
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
  veiculo_ativo := (v.status = 'ativo');
  inadimplente := (v_venc > 0 or cli.status::text = 'inadimplente');
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
-- Abertura do acionamento (com trava + alcada de liberacao)
-- ----------------------------------------------------------------------------
-- Regra: veiculo ATIVO e em dia -> abre direto. Caso contrario (ou limite do
-- opcional esgotado) o acionamento SO e aberto por quem tem alcada
-- (pode_liberar_assistencia) e mediante justificativa — que fica registrada.
create or replace function abrir_acionamento(
  p_veiculo_id  uuid,
  p_servico_id  uuid,
  p_solicitante text default null,
  p_telefone    text default null,
  p_origem      jsonb default '{}'::jsonb,
  p_destino     jsonb default '{}'::jsonb,
  p_km_previsto numeric default null,
  p_observacoes text default null,
  p_liberacao_justificativa text default null,
  p_atendimento_id uuid default null
)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare
  v     veiculos;
  s     servicos_assistencia;
  sit   record;
  eleg  record;
  a     acionamentos_assistencia;
  v_mot text[] := '{}';
begin
  if not pode_assistencia() then raise exception 'Sem permissao para acionar assistencia'; end if;

  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then raise exception 'Veiculo nao encontrado'; end if;
  select * into s from servicos_assistencia where id = p_servico_id;
  if s.id is null or not s.ativo then raise exception 'Servico de assistencia invalido ou inativo'; end if;

  select * into sit from situacao_assistencia_veiculo(p_veiculo_id);
  if not sit.pode_acionar then v_mot := sit.motivos; end if;

  select * into eleg from elegibilidade_assistencia(p_veiculo_id) where servico_id = p_servico_id;
  if eleg.servico_id is not null and not eleg.elegivel then
    v_mot := v_mot || format('Limite do opcional atingido: %s de %s uso(s) em %s meses',
                             eleg.usados, eleg.limite_quantidade, eleg.janela_meses);
  end if;

  -- Bloqueio: exige alcada + justificativa.
  if array_length(v_mot, 1) is not null then
    if p_liberacao_justificativa is null or btrim(p_liberacao_justificativa) = '' then
      raise exception 'BLOQUEADO: % — necessaria liberacao de superior', array_to_string(v_mot, '; ');
    end if;
    if not pode_liberar_assistencia() then
      raise exception 'BLOQUEADO: % — o usuario logado nao tem alcada para liberar', array_to_string(v_mot, '; ');
    end if;
  end if;

  insert into acionamentos_assistencia (
    veiculo_id, cliente_id, servico_id, atendimento_id, status,
    solicitante_nome, solicitante_telefone, origem, destino, km_previsto, observacoes,
    valor_servico, computa_limite, bloqueio_motivos,
    liberado_por, liberado_em, liberacao_justificativa,
    aberto_por, regional_id
  ) values (
    v.id, v.cliente_id, s.id, p_atendimento_id, 'ABERTO',
    p_solicitante, p_telefone, coalesce(p_origem, '{}'::jsonb), coalesce(p_destino, '{}'::jsonb),
    p_km_previsto, p_observacoes,
    s.valor_padrao, s.computa_limite, coalesce(v_mot, '{}'),
    case when array_length(v_mot, 1) is not null then auth.uid() end,
    case when array_length(v_mot, 1) is not null then now() end,
    case when array_length(v_mot, 1) is not null then p_liberacao_justificativa end,
    auth.uid(), coalesce(v.regional_id, (select regional_id from clientes where id = v.cliente_id))
  ) returning * into a;

  return a;
end;
$$;

-- Cotacao com prestadores.
create or replace function registrar_cotacao_assistencia(
  p_acionamento_id uuid,
  p_fornecedor_id  uuid,
  p_valor          numeric,
  p_valor_km       numeric default null,
  p_prazo_min      integer default null,
  p_observacao     text default null
)
returns acionamento_cotacoes
language plpgsql
security definer
set search_path = public
as $$
declare c acionamento_cotacoes;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;

  insert into acionamento_cotacoes (acionamento_id, fornecedor_id, valor, valor_km, prazo_estimado_min, observacao, created_by)
    values (p_acionamento_id, p_fornecedor_id, coalesce(p_valor, 0), p_valor_km, p_prazo_min, p_observacao, auth.uid())
    on conflict (acionamento_id, fornecedor_id) do update
      set valor = excluded.valor, valor_km = excluded.valor_km,
          prazo_estimado_min = excluded.prazo_estimado_min, observacao = excluded.observacao
    returning * into c;

  update acionamentos_assistencia
     set status = 'EM_COTACAO', updated_at = now()
   where id = p_acionamento_id and status = 'ABERTO';

  return c;
end;
$$;

-- Confirma o prestador e GERA A OS (codigo unico + valores fechados).
create or replace function confirmar_prestador_assistencia(
  p_acionamento_id uuid,
  p_fornecedor_id  uuid,
  p_valor_servico  numeric,
  p_km_excedente   numeric default 0,
  p_valor_km       numeric default null,
  p_prazo_min      integer default null
)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare
  a       acionamentos_assistencia;
  s       servicos_assistencia;
  v_data  text;
  v_seq   integer;
  v_km_un numeric;
  v_km_tot numeric;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  if a.status in ('CONCLUIDO', 'CANCELADO') then raise exception 'Acionamento ja finalizado'; end if;
  select * into s from servicos_assistencia where id = a.servico_id;

  v_km_un := coalesce(p_valor_km, (select valor_km from prestador_servicos
                                    where fornecedor_id = p_fornecedor_id and servico_id = a.servico_id),
                      s.valor_km_excedente);
  v_km_tot := case when s.cobra_km_excedente then round(coalesce(p_km_excedente, 0) * coalesce(v_km_un, 0), 2) else 0 end;

  if a.codigo_os is null then
    v_data := to_char(now(), 'YYYYMMDD');
    perform pg_advisory_xact_lock(hashtext('os_assist_' || v_data));
    select coalesce(max((regexp_replace(codigo_os, '^OS-\d{8}-', ''))::integer), 0) + 1
      into v_seq from acionamentos_assistencia where codigo_os like 'OS-' || v_data || '-%';
  end if;

  update acionamentos_assistencia
     set prestador_id = p_fornecedor_id,
         valor_servico = coalesce(p_valor_servico, s.valor_padrao),
         km_excedente = case when s.cobra_km_excedente then coalesce(p_km_excedente, 0) else 0 end,
         valor_km_excedente = v_km_tot,
         valor_total = coalesce(p_valor_servico, s.valor_padrao) + v_km_tot,
         prazo_estimado_min = coalesce(p_prazo_min, prazo_estimado_min),
         codigo_os = coalesce(codigo_os, 'OS-' || v_data || '-' || lpad(v_seq::text, 4, '0')),
         status = 'AUTORIZADO',
         updated_at = now()
   where id = p_acionamento_id
   returning * into a;

  update acionamento_cotacoes set escolhida = (fornecedor_id = p_fornecedor_id)
   where acionamento_id = p_acionamento_id;

  return a;
end;
$$;

-- Conclui a OS e LANCA EM CONTAS A PAGAR (fornecedor + plano de contas).
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
  a   acionamentos_assistencia;
  s   servicos_assistencia;
  l   lancamentos_financeiros;
  v_placa text;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  if a.status = 'CANCELADO' then raise exception 'Acionamento cancelado'; end if;
  if a.prestador_id is null then raise exception 'Confirme o prestador (OS) antes de concluir'; end if;

  select * into s from servicos_assistencia where id = a.servico_id;
  select placa into v_placa from veiculos where id = a.veiculo_id;

  update acionamentos_assistencia
     set status = 'CONCLUIDO',
         km_percorrido = coalesce(p_km_percorrido, km_percorrido),
         observacoes = coalesce(observacoes, '') ||
                       case when p_observacao is null then '' else E'\n' || p_observacao end,
         concluido_em = coalesce(concluido_em, now()),
         updated_at = now()
   where id = p_acionamento_id
   returning * into a;

  -- Contas a pagar (idempotente: nao duplica lancamento).
  if a.lancamento_id is null and a.valor_total > 0 then
    insert into lancamentos_financeiros (
      tipo, fornecedor_id, descricao, categoria_dre_id, regional_id,
      valor_original, data_emissao, data_vencimento, status
    ) values (
      'DESPESA', a.prestador_id,
      format('Assistencia 24h %s — %s (%s)', coalesce(a.codigo_os, a.protocolo), s.descricao, coalesce(v_placa, '')),
      s.categoria_dre_id, a.regional_id,
      a.valor_total, current_date, coalesce(p_vencimento, current_date + 7), 'pendente'
    ) returning * into l;

    update acionamentos_assistencia set lancamento_id = l.id, updated_at = now()
     where id = a.id returning * into a;
  end if;

  return a;
end;
$$;

create or replace function cancelar_acionamento(p_acionamento_id uuid, p_motivo text)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare a acionamentos_assistencia;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;
  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  if a.status = 'CONCLUIDO' then raise exception 'Acionamento ja concluido'; end if;

  update acionamentos_assistencia
     set status = 'CANCELADO', cancelado_motivo = p_motivo, updated_at = now()
   where id = p_acionamento_id
   returning * into a;
  return a;
end;
$$;

-- Marca o envio do voucher/comunicado ao prestador (e-mail/WhatsApp).
create or replace function marcar_voucher_enviado(p_acionamento_id uuid)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare a acionamentos_assistencia;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;
  update acionamentos_assistencia
     set voucher_enviado_em = now(),
         status = case when status = 'AUTORIZADO' then 'EM_ATENDIMENTO'::status_acionamento else status end,
         updated_at = now()
   where id = p_acionamento_id
   returning * into a;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  return a;
end;
$$;

-- Historico de acionamentos do veiculo (ficha do veiculo / SAC).
create or replace function historico_assistencia_veiculo(p_veiculo_id uuid, p_limite int default 50)
returns table (
  id             uuid,
  protocolo      text,
  codigo_os      text,
  servico        text,
  status         status_acionamento,
  prestador      text,
  valor_total    numeric,
  computa_limite boolean,
  criado_em      timestamptz,
  concluido_em   timestamptz
)
language sql stable
as $$
  select a.id, a.protocolo, a.codigo_os, s.descricao, a.status,
         f.razao_social, a.valor_total, a.computa_limite, a.created_at, a.concluido_em
    from acionamentos_assistencia a
    join servicos_assistencia s on s.id = a.servico_id
    left join fornecedores f on f.id = a.prestador_id
   where a.veiculo_id = p_veiculo_id
   order by a.created_at desc
   limit coalesce(p_limite, 50);
$$;

-- Prestadores habilitados para um servico (base da cotacao).
create or replace function prestadores_do_servico(p_servico_id uuid)
returns table (
  fornecedor_id  uuid,
  razao_social   text,
  telefone       text,
  whatsapp       text,
  email          text,
  cobertura      text,
  valor_acordado numeric,
  valor_km       numeric,
  prazo_medio_min integer
)
language sql stable
as $$
  select f.id, f.razao_social, f.telefone, f.whatsapp, f.email, f.cobertura,
         ps.valor_acordado, ps.valor_km, ps.prazo_medio_min
    from prestador_servicos ps
    join fornecedores f on f.id = ps.fornecedor_id
   where ps.servico_id = p_servico_id and ps.ativo and f.ativo
   order by ps.valor_acordado nulls last, f.razao_social;
$$;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table servicos_assistencia      enable row level security;
alter table prestador_servicos        enable row level security;
alter table acionamentos_assistencia  enable row level security;
alter table acionamento_cotacoes      enable row level security;
alter table acionamento_historico     enable row level security;

create policy servicos_assist_select on servicos_assistencia for select to authenticated using (is_staff());
create policy servicos_assist_write  on servicos_assistencia for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

create policy prest_serv_select on prestador_servicos for select to authenticated using (is_staff());
create policy prest_serv_write  on prestador_servicos for all to authenticated
  using (pode_assistencia()) with check (pode_assistencia());

-- Acionamento: staff da regional do veiculo (ou acesso global) e o operador 24h.
create policy acion_select on acionamentos_assistencia for select to authenticated
  using (pode_regional(regional_id) or pode_assistencia());
create policy acion_write on acionamentos_assistencia for all to authenticated
  using (pode_assistencia()) with check (pode_assistencia());

create policy acion_cot_all on acionamento_cotacoes for all to authenticated
  using (pode_assistencia()) with check (pode_assistencia());
create policy acion_hist_select on acionamento_historico for select to authenticated using (is_staff());
create policy acion_hist_insert on acionamento_historico for insert to authenticated with check (is_staff());

-- O atendente 24h precisa cadastrar prestadores e lancar/baixar contas a pagar.
create policy forn_write_assistencia on fornecedores for all to authenticated
  using (pode_assistencia()) with check (pode_assistencia());
create policy lanc_assistencia on lancamentos_financeiros for all to authenticated
  using (pode_assistencia()) with check (pode_assistencia());
create policy baixas_assistencia on baixas_financeiras for all to authenticated
  using (pode_assistencia()) with check (pode_assistencia());

grant select, insert, update, delete on
  servicos_assistencia, prestador_servicos, acionamentos_assistencia,
  acionamento_cotacoes, acionamento_historico to authenticated;

grant execute on function pode_assistencia() to authenticated;
grant execute on function pode_liberar_assistencia() to authenticated;
grant execute on function elegibilidade_assistencia(uuid) to authenticated;
grant execute on function situacao_assistencia_veiculo(uuid) to authenticated;
grant execute on function abrir_acionamento(uuid, uuid, text, text, jsonb, jsonb, numeric, text, text, uuid) to authenticated;
grant execute on function registrar_cotacao_assistencia(uuid, uuid, numeric, numeric, integer, text) to authenticated;
grant execute on function confirmar_prestador_assistencia(uuid, uuid, numeric, numeric, numeric, integer) to authenticated;
grant execute on function concluir_acionamento(uuid, numeric, text, date) to authenticated;
grant execute on function cancelar_acionamento(uuid, text) to authenticated;
grant execute on function marcar_voucher_enviado(uuid) to authenticated;
grant execute on function historico_assistencia_veiculo(uuid, int) to authenticated;
grant execute on function prestadores_do_servico(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Seed dos servicos classicos (idempotente; valores/planos ajustaveis na tela)
-- ----------------------------------------------------------------------------
insert into servicos_assistencia (descricao, valor_padrao, cobra_km_excedente, valor_km_excedente, km_franquia, computa_limite, limite_quantidade, limite_janela_meses, ordem)
values
  ('Reboque Passeio',   250.00, true,  4.50, 100, true,  2, 12, 1),
  ('Reboque Utilitario',400.00, true,  6.00, 100, true,  2, 12, 2),
  ('Chaveiro',          180.00, false, 0,    0,   true,  1, 12, 3),
  ('Auxilio Mecanico',  150.00, false, 0,    0,   true,  2, 12, 4),
  ('Troca de Pneu',     120.00, false, 0,    0,   true,  2, 12, 5),
  ('Pane Seca',         120.00, false, 0,    0,   true,  2, 12, 6),
  ('Carga de Bateria',  120.00, false, 0,    0,   true,  2, 12, 7),
  ('Carro Reserva',     0.00,   false, 0,    0,   true,  1, 12, 8),
  ('Transporte / Taxi', 80.00,  false, 0,    0,   false, 1, 12, 9)
on conflict (descricao) do nothing;
