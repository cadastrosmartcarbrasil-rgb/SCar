-- ============================================================================
-- SCar :: 0113_eventos_prazo_regulatorio.sql
--
-- PRAZO REGULATORIO DO EVENTO — Resolucao CNSP 491/2026, Art. 22 (pedido do
-- usuario, 17/10/2026): o prazo maximo de regulacao e liquidacao e de 90 DIAS
-- CORRIDOS, contados do AVISO do evento EM CONJUNTO com a entrega COMPLETA da
-- documentacao exigida. Estourado o prazo, a associacao perde o direito de recusa.
--
-- A REGRA DO RELOGIO (uma so, aqui e em src/lib/prazo-regulatorio.ts):
--   aviso         = eventos_sinistro.data_comunicacao (nulo -> o dia da abertura)
--   inicio        = greatest(aviso, documentacao_completa_em)   -- os DOIS marcos
--   limite        = inicio + 90 (ultimo dia dentro do prazo)
--   dias          = (encerramento ou hoje, em Sao Paulo) - inicio
--   vencido       = dias > 90
--   Sem documentacao completa o relogio oficial NAO corre (DOCUMENTACAO_PENDENTE).
--
-- DECISOES (conservadoras, a favor da associacao nao perder prazo):
--   * A documentacao fica COMPLETA sozinha quando o ultimo documento OBRIGATORIO
--     e entregue (ou dispensado): a data e a da ENTREGA, nao a do clique — e a
--     data real que a norma conta. Sem checklist, a equipe marca a mao (com data).
--   * Pedir documento DEPOIS do inicio NAO para nem reinicia o relogio: o pedido
--     fica marcado como COMPLEMENTAR. Suspensao por documento complementar e
--     decisao juridica, nao do sistema. So a diretoria (tem_acesso_global) reabre
--     a documentacao, com motivo, e fica na trilha.
--   * Encerrar a regulacao = status CONCLUIDO ou NEGADO; o relogio para no dia.
--   * NEGAR evento com prazo vencido e RECUSADO pelo banco para a ponta; a
--     diretoria pode registrar (decisao dela), e o evento fica marcado
--     `recusa_fora_do_prazo` na trilha.
--
-- (A) `evento_documentos_modelo` — o catalogo da documentacao exigida (por tipo
--     de evento ou para todos), em Configuracoes. Seed minimo, AJUSTAVEL: a lista
--     contratual e da associacao.
-- (B) `evento_documentos` — as pendencias de cada evento (PENDENTE/ENTREGUE/
--     DISPENSADO), com quem e quando. Aplicada a lista padrao na abertura.
-- (C) `eventos_sinistro` ganha o marco da documentacao completa, o encerramento
--     da regulacao e a marca da recusa fora do prazo.
-- (D) `evento_prazo_historico` — trilha append-only (escrita por trigger).
-- (E) `evento_prazo_alertas` — um por marco (30/60/75/85 e 91 = vencido), unico
--     por evento: a rotina diaria e re-executavel. Ciencia por evento.
-- (F) `evento_prazo_situacao` — o contador gravado pela rotina diaria (dias,
--     nivel, limite). A TELA le o calculo VIVO (`eventos_prazos`), nunca o cache.
-- (G) RPCs: eventos_prazos, marcar_documentacao_completa,
--     reabrir_documentacao_evento, aplicar_documentos_padrao_evento,
--     dar_ciencia_prazo_evento, atualizar_prazos_eventos (a rotina),
--     marcar_alertas_prazo_notificados.
-- (H) `transportar_eventos_historico` (0112) recriada gravando o AVISO = data do
--     evento no Mutual (o aviso aconteceu la, antes; o dia de hoje adiaria o prazo).
-- ============================================================================

-- Quem fez: so vira FK quando quem chama e da EQUIPE. O associado do /portal abre
-- evento (e a lista padrao nasce junto) sem ter linha em `usuarios`.
create or replace function usuario_atual_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from usuarios where id = auth.uid();
$$;

-- (A) ------------------------------------------------------------------------
create table if not exists evento_documentos_modelo (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  descricao       text,
  obrigatorio     boolean not null default true,
  tipo_evento_id  uuid references tipos_evento(id) on delete cascade,  -- nulo = todos os tipos
  ordem           integer not null default 100,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint chk_evento_doc_modelo_nome check (length(btrim(nome)) > 0)
);

create unique index if not exists uq_evento_doc_modelo
  on evento_documentos_modelo (upper(btrim(nome)), coalesce(tipo_evento_id, '00000000-0000-0000-0000-000000000000'::uuid));

drop trigger if exists trg_evento_doc_modelo_updated on evento_documentos_modelo;
create trigger trg_evento_doc_modelo_updated before update on evento_documentos_modelo
  for each row execute function set_updated_at();

alter table evento_documentos_modelo enable row level security;
drop policy if exists evento_doc_modelo_select on evento_documentos_modelo;
create policy evento_doc_modelo_select on evento_documentos_modelo
  for select to authenticated using (is_staff());
drop policy if exists evento_doc_modelo_write on evento_documentos_modelo;
create policy evento_doc_modelo_write on evento_documentos_modelo
  for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update, delete on evento_documentos_modelo to authenticated;

-- seed: o minimo comum; a lista contratual e ajustada em Configuracoes
insert into evento_documentos_modelo (nome, descricao, obrigatorio, tipo_evento_id, ordem)
select s.nome, s.descricao, s.obrigatorio, null, s.ordem
  from (values
    ('AVISO DO EVENTO ASSINADO', 'Relato do evento assinado pelo associado.', true, 10),
    ('CNH DO CONDUTOR', 'Carteira de habilitacao de quem conduzia o veiculo.', true, 20),
    ('CRLV DO VEICULO', 'Documento do veiculo do associado.', true, 30),
    ('FOTOS DO VEICULO / AVARIAS', 'Fotos que mostram o dano.', true, 40)
  ) as s(nome, descricao, obrigatorio, ordem)
 where not exists (select 1 from evento_documentos_modelo m
                    where upper(btrim(m.nome)) = s.nome and m.tipo_evento_id is null);

insert into evento_documentos_modelo (nome, descricao, obrigatorio, tipo_evento_id, ordem)
select 'BOLETIM DE OCORRENCIA', 'Obrigatorio para este tipo de evento.', true, t.id, 50
  from tipos_evento t
 where upper(texto_sem_acento(t.nome)) ~ '^(ROUBO|FURTO|INCENDIO)'
   and not exists (select 1 from evento_documentos_modelo m
                    where upper(btrim(m.nome)) = 'BOLETIM DE OCORRENCIA' and m.tipo_evento_id = t.id);

-- (C) ------------------------------------------------------------------------
alter table eventos_sinistro
  add column if not exists documentacao_completa_em     date,
  add column if not exists documentacao_completa_origem text,
  add column if not exists documentacao_completa_por    uuid references usuarios(id) on delete set null,
  add column if not exists regulacao_encerrada_em       date,
  add column if not exists recusa_fora_do_prazo         boolean not null default false;

do $$ begin
  alter table eventos_sinistro add constraint chk_evento_doc_completa_origem
    check (documentacao_completa_origem is null or documentacao_completa_origem in ('AUTOMATICA', 'MANUAL'));
exception when duplicate_object then null; end $$;

comment on column eventos_sinistro.documentacao_completa_em is
  'Dia em que a documentacao exigida ficou completa (0113). Com o aviso, e o inicio dos 90 dias do Art. 22 (CNSP 491/2026).';

-- (B) ------------------------------------------------------------------------
create table if not exists evento_documentos (
  id              uuid primary key default gen_random_uuid(),
  evento_id       uuid not null references eventos_sinistro(id) on delete cascade,
  modelo_id       uuid references evento_documentos_modelo(id) on delete set null,
  nome            text not null,
  obrigatorio     boolean not null default true,
  situacao        text not null default 'PENDENTE',
  complementar    boolean not null default false,   -- pedido depois do inicio do prazo
  solicitado_em   timestamptz not null default now(),
  solicitado_por  uuid references usuarios(id) on delete set null,
  entregue_em     date,
  situacao_em     timestamptz not null default now(),
  situacao_por    uuid references usuarios(id) on delete set null,
  anexo_id        uuid references anexos_evento(id) on delete set null,
  observacao      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint chk_evento_doc_situacao check (situacao in ('PENDENTE', 'ENTREGUE', 'DISPENSADO')),
  constraint chk_evento_doc_nome check (length(btrim(nome)) > 0)
);

create index if not exists idx_evento_documentos_evento on evento_documentos (evento_id);
create unique index if not exists uq_evento_documento_modelo
  on evento_documentos (evento_id, modelo_id) where modelo_id is not null;

-- (D) ------------------------------------------------------------------------
create table if not exists evento_prazo_historico (
  id            uuid primary key default gen_random_uuid(),
  evento_id     uuid not null references eventos_sinistro(id) on delete cascade,
  tipo          text not null,
  detalhe       text,
  documento_id  uuid,
  dias          integer,
  usuario_id    uuid references usuarios(id) on delete set null default usuario_atual_id(),
  created_at    timestamptz not null default clock_timestamp()
);
create index if not exists idx_evento_prazo_hist on evento_prazo_historico (evento_id, created_at);

-- (E) ------------------------------------------------------------------------
create table if not exists evento_prazo_alertas (
  id            uuid primary key default gen_random_uuid(),
  evento_id     uuid not null references eventos_sinistro(id) on delete cascade,
  marco         integer not null,
  dias          integer not null,
  limite_prazo  date not null,
  disparado_em  timestamptz not null default now(),
  notificado_em timestamptz,
  ciente_em     timestamptz,
  ciente_por    uuid references usuarios(id) on delete set null,
  constraint chk_evento_prazo_marco check (marco in (30, 60, 75, 85, 91)),
  constraint uq_evento_prazo_alerta unique (evento_id, marco)
);

-- (F) ------------------------------------------------------------------------
create table if not exists evento_prazo_situacao (
  evento_id     uuid primary key references eventos_sinistro(id) on delete cascade,
  nivel         text not null,
  dias          integer,
  inicio_prazo  date,
  limite_prazo  date,
  atualizado_em timestamptz not null default now()
);

-- RLS: quem ve o evento ve a documentacao, a trilha e os alertas.
create or replace function pode_ver_evento(p_evento uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from eventos_sinistro e
                  where e.id = p_evento and is_staff()
                    and (tem_acesso_global() or pode_regional(e.regional_id)));
$$;

create or replace function pode_tratar_evento_id(p_evento uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from eventos_sinistro e
                  where e.id = p_evento and pode_tratar_evento(e.regional_id));
$$;

alter table evento_documentos enable row level security;
drop policy if exists evento_documentos_select on evento_documentos;
create policy evento_documentos_select on evento_documentos
  for select to authenticated using (pode_ver_evento(evento_id));
drop policy if exists evento_documentos_insert on evento_documentos;
create policy evento_documentos_insert on evento_documentos
  for insert to authenticated with check (pode_ver_evento(evento_id));
drop policy if exists evento_documentos_update on evento_documentos;
create policy evento_documentos_update on evento_documentos
  for update to authenticated using (pode_ver_evento(evento_id)) with check (pode_ver_evento(evento_id));
drop policy if exists evento_documentos_delete on evento_documentos;
create policy evento_documentos_delete on evento_documentos
  for delete to authenticated using (pode_tratar_evento_id(evento_id));
grant select, insert, update, delete on evento_documentos to authenticated;

alter table evento_prazo_historico enable row level security;
drop policy if exists evento_prazo_hist_select on evento_prazo_historico;
create policy evento_prazo_hist_select on evento_prazo_historico
  for select to authenticated using (pode_ver_evento(evento_id));
grant select on evento_prazo_historico to authenticated;

alter table evento_prazo_alertas enable row level security;
drop policy if exists evento_prazo_alertas_select on evento_prazo_alertas;
create policy evento_prazo_alertas_select on evento_prazo_alertas
  for select to authenticated using (pode_ver_evento(evento_id));
grant select on evento_prazo_alertas to authenticated;

alter table evento_prazo_situacao enable row level security;
drop policy if exists evento_prazo_situacao_select on evento_prazo_situacao;
create policy evento_prazo_situacao_select on evento_prazo_situacao
  for select to authenticated using (pode_ver_evento(evento_id));
grant select on evento_prazo_situacao to authenticated;

-- ============================================================================
-- O CALCULO (espelho de src/lib/prazo-regulatorio.ts)
-- ============================================================================
create or replace function prazo_regulatorio_nivel(p_dias integer, p_iniciado boolean, p_encerrado boolean)
returns text
language sql immutable
as $$
  select case
    when not coalesce(p_iniciado, false) then
      case when coalesce(p_encerrado, false) then 'ENCERRADO_SEM_PRAZO' else 'DOCUMENTACAO_PENDENTE' end
    when coalesce(p_encerrado, false) then
      case when p_dias > 90 then 'ENCERRADO_FORA_DO_PRAZO' else 'ENCERRADO_NO_PRAZO' end
    when p_dias > 90 then 'VENCIDO'
    when p_dias >= 85 then 'CRITICO'
    when p_dias >= 75 then 'URGENCIA'
    when p_dias >= 60 then 'ATENCAO'
    when p_dias >= 30 then 'AVISO'
    else 'NO_PRAZO'
  end;
$$;

comment on function prazo_regulatorio_nivel(integer, boolean, boolean) is
  'Nivel do prazo regulatorio de 90 dias (0113): marcos 30/60/75/85 e vencido acima de 90. Espelho de nivelDoPrazo (TS).';

create or replace function prazo_regulatorio_ordem(p_nivel text)
returns integer
language sql immutable
as $$
  select case p_nivel
    when 'VENCIDO' then 0 when 'CRITICO' then 1 when 'URGENCIA' then 2 when 'ATENCAO' then 3
    when 'AVISO' then 4 when 'NO_PRAZO' then 5 when 'DOCUMENTACAO_PENDENTE' then 6
    when 'ENCERRADO_FORA_DO_PRAZO' then 7 when 'ENCERRADO_NO_PRAZO' then 8 else 9 end;
$$;

create or replace function evento_aviso_em(p_data_comunicacao date, p_created_at timestamptz)
returns date
language sql stable
set search_path = public
as $$
  select coalesce(p_data_comunicacao, data_sp(p_created_at));
$$;

-- ============================================================================
-- (G) A LEITURA: o prazo de cada evento, calculado AGORA
-- ============================================================================
create or replace function eventos_prazos(
  p_regional            uuid    default null,
  p_evento              uuid    default null,
  p_incluir_encerrados  boolean default false
)
returns table (
  evento_id                 uuid,
  numero_protocolo          text,
  status                    text,
  regional_id               uuid,
  regional_nome             text,
  cliente_nome              text,
  placa                     text,
  aviso_em                  date,
  documentacao_completa_em  date,
  documentacao_origem       text,
  inicio_prazo              date,
  limite_prazo              date,
  dias_transcorridos        integer,
  dias_restantes            integer,
  dias_desde_aviso          integer,
  nivel                     text,
  docs_obrigatorios         integer,
  docs_pendentes            integer,
  docs_complementares       integer,
  encerrado_em              date,
  recusa_fora_do_prazo      boolean,
  alertas_sem_ciencia       integer,
  maior_marco_sem_ciencia   integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_hoje  date := data_sp(now());
  v_todos boolean := tem_acesso_global() or auth.uid() is null;
  v_rid   uuid := escopo_regional(p_regional);
begin
  if auth.uid() is not null and not is_staff() then
    return;
  end if;

  return query
  with base as (
    select e.id, e.numero_protocolo, e.status::text as status, e.regional_id, r.nome as regional_nome,
           c.nome_razao_social as cliente_nome, v.placa,
           evento_aviso_em(e.data_comunicacao, e.created_at) as aviso,
           e.documentacao_completa_em, e.documentacao_completa_origem,
           e.regulacao_encerrada_em, e.recusa_fora_do_prazo
      from eventos_sinistro e
      left join regionais r on r.id = e.regional_id
      left join clientes  c on c.id = e.cliente_id
      left join veiculos  v on v.id = e.veiculo_id
     where (p_evento is null or e.id = p_evento)
       and (p_evento is not null or p_incluir_encerrados or e.status::text not in ('CONCLUIDO', 'NEGADO'))
       and case
             when p_evento is not null then v_todos or pode_regional(e.regional_id)
             when v_todos then p_regional is null or e.regional_id = p_regional
             else e.regional_id = v_rid
           end
  ), calc as (
    select b.*,
           case when b.documentacao_completa_em is not null
                then greatest(b.aviso, b.documentacao_completa_em) end as inicio
      from base b
  ), docs as (
    select d.evento_id,
           count(*) filter (where d.obrigatorio)::int                                   as obrig,
           count(*) filter (where d.situacao = 'PENDENTE' and d.obrigatorio)::int       as pend,
           count(*) filter (where d.situacao = 'PENDENTE' and d.complementar)::int      as compl
      from evento_documentos d
     where d.evento_id in (select id from calc)
     group by d.evento_id
  ), al as (
    select a.evento_id, count(*)::int as n, max(a.marco) as maior
      from evento_prazo_alertas a
     where a.ciente_em is null and a.evento_id in (select id from calc)
     group by a.evento_id
  )
  select c.id, c.numero_protocolo, c.status, c.regional_id, c.regional_nome, c.cliente_nome, c.placa,
         c.aviso, c.documentacao_completa_em, c.documentacao_completa_origem,
         c.inicio,
         c.inicio + 90,
         (coalesce(c.regulacao_encerrada_em, v_hoje) - c.inicio)::int,
         case when c.inicio is not null and c.regulacao_encerrada_em is null
              then (c.inicio + 90 - v_hoje)::int end,
         (coalesce(c.regulacao_encerrada_em, v_hoje) - c.aviso)::int,
         prazo_regulatorio_nivel((coalesce(c.regulacao_encerrada_em, v_hoje) - c.inicio)::int,
                                 c.inicio is not null, c.regulacao_encerrada_em is not null),
         coalesce(d.obrig, 0), coalesce(d.pend, 0), coalesce(d.compl, 0),
         c.regulacao_encerrada_em, c.recusa_fora_do_prazo,
         coalesce(al.n, 0), al.maior
    from calc c
    left join docs d on d.evento_id = c.id
    left join al on al.evento_id = c.id
   order by prazo_regulatorio_ordem(prazo_regulatorio_nivel((coalesce(c.regulacao_encerrada_em, v_hoje) - c.inicio)::int,
                                    c.inicio is not null, c.regulacao_encerrada_em is not null)),
            c.inicio nulls last, c.aviso, c.id;
end;
$$;

comment on function eventos_prazos(uuid, uuid, boolean) is
  'Prazo regulatorio (Art. 22, CNSP 491/2026) de cada evento, calculado no dia de Sao Paulo (0113). Sem p_evento: so os abertos, no escopo da unidade.';

-- ============================================================================
-- A DOCUMENTACAO
-- ============================================================================
create or replace function recalcular_documentacao_evento(p_evento uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_completa date;
  v_obrig    integer;
  v_pend     integer;
  v_data     date;
begin
  select documentacao_completa_em into v_completa from eventos_sinistro where id = p_evento for update;
  if not found or v_completa is not null then
    return;   -- completa uma vez, o relogio nao volta sozinho
  end if;

  select count(*) filter (where obrigatorio),
         count(*) filter (where obrigatorio and situacao = 'PENDENTE'),
         max(case when obrigatorio and situacao <> 'PENDENTE'
                  then coalesce(entregue_em, data_sp(situacao_em)) end)
    into v_obrig, v_pend, v_data
    from evento_documentos where evento_id = p_evento;

  if v_obrig > 0 and v_pend = 0 then
    update eventos_sinistro
       set documentacao_completa_em = v_data,
           documentacao_completa_origem = 'AUTOMATICA',
           documentacao_completa_por = usuario_atual_id()
     where id = p_evento;
    insert into evento_prazo_historico (evento_id, tipo, detalhe)
    values (p_evento, 'DOCUMENTACAO_COMPLETA',
            'Todos os documentos obrigatorios entregues ou dispensados; completa em ' || to_char(v_data, 'DD/MM/YYYY') || '.');
  end if;
end;
$$;

create or replace function fn_evento_documento_validar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje      date := data_sp(now());
  v_regional  uuid;
  v_completa  date;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from eventos_sinistro where id = old.evento_id) then
      return old;   -- cascata do evento apagado
    end if;
    if old.situacao <> 'PENDENTE' then
      raise exception 'Documento % ja registrado: dispense em vez de apagar (a entrega e prova do prazo).', old.nome
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  select regional_id, documentacao_completa_em into v_regional, v_completa
    from eventos_sinistro where id = new.evento_id;

  new.nome := upper(btrim(new.nome));

  if tg_op = 'UPDATE' and new.evento_id is distinct from old.evento_id then
    raise exception 'O documento nao muda de evento.' using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    new.solicitado_por := coalesce(new.solicitado_por, usuario_atual_id());
    new.complementar := v_completa is not null;
  end if;

  if new.situacao = 'ENTREGUE' then
    new.entregue_em := coalesce(new.entregue_em, v_hoje);
    if new.entregue_em > v_hoje then
      raise exception 'A data da entrega nao pode ser futura.' using errcode = 'check_violation';
    end if;
  else
    new.entregue_em := null;
  end if;

  if tg_op = 'INSERT' or new.situacao is distinct from old.situacao or new.entregue_em is distinct from old.entregue_em then
    new.situacao_em := clock_timestamp();
    new.situacao_por := usuario_atual_id();
  end if;

  if new.situacao = 'DISPENSADO' and (tg_op = 'INSERT' or old.situacao <> 'DISPENSADO') then
    if auth.uid() is not null and not pode_tratar_evento(v_regional) then
      raise exception 'Somente quem trata o evento dispensa documento.' using errcode = 'insufficient_privilege';
    end if;
    if length(btrim(coalesce(new.observacao, ''))) < 3 then
      raise exception 'Informe o motivo da dispensa.' using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.situacao <> 'PENDENTE' and new.situacao = 'PENDENTE'
     and auth.uid() is not null and not pode_tratar_evento(v_regional) then
    raise exception 'Somente quem trata o evento volta um documento para pendente.' using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'UPDATE' and new.obrigatorio is distinct from old.obrigatorio
     and auth.uid() is not null and not pode_tratar_evento(v_regional) then
    raise exception 'Somente quem trata o evento muda a obrigatoriedade.' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_evento_documento_validar on evento_documentos;
create trigger trg_evento_documento_validar
  before insert or update or delete on evento_documentos
  for each row execute function fn_evento_documento_validar();

drop trigger if exists trg_evento_documento_updated on evento_documentos;
create trigger trg_evento_documento_updated before update on evento_documentos
  for each row execute function set_updated_at();

create or replace function fn_evento_documento_apos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from eventos_sinistro where id = old.evento_id) then   -- nao e a cascata do evento
      insert into evento_prazo_historico (evento_id, tipo, detalhe, documento_id)
      values (old.evento_id, 'DOC_REMOVIDO', old.nome, old.id);
      perform recalcular_documentacao_evento(old.evento_id);
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(current_setting('scar.evento_docs_padrao', true), '') <> '1' then
      insert into evento_prazo_historico (evento_id, tipo, detalhe, documento_id)
      values (new.evento_id, case when new.complementar then 'DOC_COMPLEMENTAR' else 'DOC_SOLICITADO' end,
              new.nome || case when new.complementar
                               then ' (pedido depois do inicio do prazo — o relogio NAO para)' else '' end,
              new.id);
    end if;
  elsif new.situacao is distinct from old.situacao or new.entregue_em is distinct from old.entregue_em then
    insert into evento_prazo_historico (evento_id, tipo, detalhe, documento_id)
    values (new.evento_id,
            case new.situacao when 'ENTREGUE' then 'DOC_ENTREGUE' when 'DISPENSADO' then 'DOC_DISPENSADO' else 'DOC_PENDENTE' end,
            new.nome
              || case when new.situacao = 'ENTREGUE' then ' em ' || to_char(new.entregue_em, 'DD/MM/YYYY') else '' end
              || case when new.situacao = 'DISPENSADO' then ': ' || new.observacao else '' end,
            new.id);
  end if;

  perform recalcular_documentacao_evento(new.evento_id);
  return new;
end;
$$;

drop trigger if exists trg_evento_documento_apos on evento_documentos;
create trigger trg_evento_documento_apos
  after insert or update or delete on evento_documentos
  for each row execute function fn_evento_documento_apos();

-- interna: sem trava (a abertura pelo /portal tambem aplica a lista)
create or replace function aplicar_documentos_padrao_evento_interno(p_evento uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tipo uuid;
  v_n    integer;
begin
  select tipo_evento_id into v_tipo from eventos_sinistro where id = p_evento;
  if not found then
    raise exception 'Evento nao encontrado.' using errcode = 'no_data_found';
  end if;

  perform set_config('scar.evento_docs_padrao', '1', true);
  insert into evento_documentos (evento_id, modelo_id, nome, obrigatorio)
  select p_evento, m.id, m.nome, m.obrigatorio
    from evento_documentos_modelo m
   where m.ativo
     and (m.tipo_evento_id is null or m.tipo_evento_id = v_tipo)
     and not exists (select 1 from evento_documentos d where d.evento_id = p_evento and d.modelo_id = m.id)
   order by m.ordem, m.nome;
  get diagnostics v_n = row_count;
  perform set_config('scar.evento_docs_padrao', '', true);

  if v_n > 0 then
    insert into evento_prazo_historico (evento_id, tipo, detalhe)
    values (p_evento, 'LISTA_PADRAO', v_n || ' documento(s) da lista padrao solicitado(s).');
  end if;
  return v_n;
end;
$$;

-- o botao "Aplicar lista padrao" da ficha
create or replace function aplicar_documentos_padrao_evento(p_evento uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not pode_ver_evento(p_evento) then
    raise exception 'Evento fora da sua unidade.' using errcode = 'insufficient_privilege';
  end if;
  return aplicar_documentos_padrao_evento_interno(p_evento);
end;
$$;

create or replace function marcar_documentacao_completa(
  p_evento     uuid,
  p_data       date default null,
  p_observacao text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ev    record;
  v_data  date := coalesce(p_data, data_sp(now()));
  v_pend  text;
begin
  select id, regional_id, documentacao_completa_em, data_comunicacao, created_at
    into v_ev from eventos_sinistro where id = p_evento for update;
  if not found then
    raise exception 'Evento nao encontrado.' using errcode = 'no_data_found';
  end if;
  if auth.uid() is not null and not pode_tratar_evento(v_ev.regional_id) then
    raise exception 'Somente quem trata o evento marca a documentacao como completa.' using errcode = 'insufficient_privilege';
  end if;
  if v_ev.documentacao_completa_em is not null then
    raise exception 'A documentacao ja esta completa desde %.', to_char(v_ev.documentacao_completa_em, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;
  if v_data > data_sp(now()) then
    raise exception 'A data nao pode ser futura.' using errcode = 'check_violation';
  end if;
  if v_data < evento_aviso_em(v_ev.data_comunicacao, v_ev.created_at) then
    raise exception 'A data nao pode ser anterior ao aviso do evento (%).',
      to_char(evento_aviso_em(v_ev.data_comunicacao, v_ev.created_at), 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;

  select string_agg(nome, ', ' order by nome) into v_pend
    from evento_documentos where evento_id = p_evento and obrigatorio and situacao = 'PENDENTE';
  if v_pend is not null then
    raise exception 'Ainda ha documento obrigatorio pendente: %. Registre a entrega ou dispense.', v_pend
      using errcode = 'check_violation';
  end if;

  update eventos_sinistro
     set documentacao_completa_em = v_data,
         documentacao_completa_origem = 'MANUAL',
         documentacao_completa_por = usuario_atual_id()
   where id = p_evento;

  insert into evento_prazo_historico (evento_id, tipo, detalhe)
  values (p_evento, 'DOCUMENTACAO_COMPLETA',
          'Marcada a mao: completa em ' || to_char(v_data, 'DD/MM/YYYY') || '.'
            || coalesce(' ' || nullif(btrim(p_observacao), ''), ''));
end;
$$;

create or replace function reabrir_documentacao_evento(p_evento uuid, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_completa date;
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Somente a diretoria reabre a documentacao (o prazo regulatorio muda).' using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo da reabertura.' using errcode = 'check_violation';
  end if;
  select documentacao_completa_em into v_completa from eventos_sinistro where id = p_evento for update;
  if not found then
    raise exception 'Evento nao encontrado.' using errcode = 'no_data_found';
  end if;
  if v_completa is null then
    raise exception 'A documentacao nao esta completa.' using errcode = 'check_violation';
  end if;

  update eventos_sinistro
     set documentacao_completa_em = null, documentacao_completa_origem = null, documentacao_completa_por = null
   where id = p_evento;
  insert into evento_prazo_historico (evento_id, tipo, detalhe)
  values (p_evento, 'DOCUMENTACAO_REABERTA',
          'Completa em ' || to_char(v_completa, 'DD/MM/YYYY') || ' desfeita: ' || btrim(p_motivo));
end;
$$;

-- ============================================================================
-- O EVENTO: aviso padrao, lista padrao na abertura, encerramento e a recusa
-- ============================================================================
create or replace function fn_evento_prazo_antes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio date;
  v_dias   integer;
begin
  if tg_op = 'INSERT' then
    new.data_comunicacao := coalesce(new.data_comunicacao, data_sp(now()));
    return new;
  end if;

  if new.data_comunicacao is distinct from old.data_comunicacao then
    insert into evento_prazo_historico (evento_id, tipo, detalhe)
    values (new.id, 'AVISO_ALTERADO',
            coalesce(to_char(old.data_comunicacao, 'DD/MM/YYYY'), '-') || ' -> '
              || coalesce(to_char(new.data_comunicacao, 'DD/MM/YYYY'), '-'));
  end if;

  if new.status is distinct from old.status then
    if new.status::text in ('CONCLUIDO', 'NEGADO') then
      if old.status::text not in ('CONCLUIDO', 'NEGADO') then
        new.regulacao_encerrada_em := data_sp(now());
      end if;
    elsif old.status::text in ('CONCLUIDO', 'NEGADO') then
      new.regulacao_encerrada_em := null;
      new.recusa_fora_do_prazo := false;
      insert into evento_prazo_historico (evento_id, tipo, detalhe)
      values (new.id, 'REGULACAO_REABERTA', old.status::text || ' -> ' || new.status::text);
    end if;

    if new.documentacao_completa_em is not null then
      v_inicio := greatest(evento_aviso_em(new.data_comunicacao, new.created_at), new.documentacao_completa_em);
      v_dias := data_sp(now()) - v_inicio;
    end if;

    if new.status::text = 'NEGADO' and v_dias > 90 then
      if auth.uid() is not null and not tem_acesso_global() then
        raise exception 'Prazo regulatorio vencido em % (% dias desde a documentacao completa): a recusa fora do prazo (Art. 22, CNSP 491/2026) so pode ser registrada pela diretoria.',
          to_char(v_inicio + 90, 'DD/MM/YYYY'), v_dias using errcode = 'check_violation';
      end if;
      new.recusa_fora_do_prazo := true;
      insert into evento_prazo_historico (evento_id, tipo, detalhe, dias)
      values (new.id, 'RECUSA_FORA_DO_PRAZO',
              'Negado com o prazo vencido em ' || to_char(v_inicio + 90, 'DD/MM/YYYY') || '.', v_dias);
    elsif new.status::text in ('CONCLUIDO', 'NEGADO') and old.status::text not in ('CONCLUIDO', 'NEGADO') then
      insert into evento_prazo_historico (evento_id, tipo, detalhe, dias)
      values (new.id, 'REGULACAO_ENCERRADA',
              new.status::text || case when v_dias is null then ' (sem documentacao completa)'
                                       when v_dias > 90 then ' fora do prazo'
                                       else ' dentro do prazo' end, v_dias);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_evento_prazo_antes on eventos_sinistro;
create trigger trg_evento_prazo_antes
  before insert or update of status, data_comunicacao on eventos_sinistro
  for each row execute function fn_evento_prazo_antes();

create or replace function fn_evento_prazo_documentos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or (new.tipo_evento_id is distinct from old.tipo_evento_id and new.documentacao_completa_em is null) then
    perform aplicar_documentos_padrao_evento_interno(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_evento_prazo_documentos on eventos_sinistro;
create trigger trg_evento_prazo_documentos
  after insert or update of tipo_evento_id on eventos_sinistro
  for each row execute function fn_evento_prazo_documentos();

-- ============================================================================
-- ALERTAS: ciencia e a ROTINA DIARIA
-- ============================================================================
create or replace function dar_ciencia_prazo_evento(p_evento uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not pode_ver_evento(p_evento) then
    raise exception 'Evento fora da sua unidade.' using errcode = 'insufficient_privilege';
  end if;
  update evento_prazo_alertas
     set ciente_em = now(), ciente_por = usuario_atual_id()
   where evento_id = p_evento and ciente_em is null;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into evento_prazo_historico (evento_id, tipo, detalhe)
    values (p_evento, 'ALERTA_CIENCIA', v_n || ' alerta(s) com ciencia.');
  end if;
  return v_n;
end;
$$;

create or replace function atualizar_prazos_eventos()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  p       record;
  m       integer;
  v_id    uuid;
  v_novos jsonb := '[]'::jsonb;
  v_niv   jsonb := '{}'::jsonb;
  v_n     integer := 0;
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Somente a matriz roda a rotina de prazos.' using errcode = 'insufficient_privilege';
  end if;

  for p in select * from eventos_prazos(null, null, false) loop
    v_n := v_n + 1;
    v_niv := jsonb_set(v_niv, array[p.nivel], to_jsonb(coalesce((v_niv ->> p.nivel)::int, 0) + 1));

    insert into evento_prazo_situacao (evento_id, nivel, dias, inicio_prazo, limite_prazo, atualizado_em)
    values (p.evento_id, p.nivel, p.dias_transcorridos, p.inicio_prazo, p.limite_prazo, now())
    on conflict (evento_id) do update
      set nivel = excluded.nivel, dias = excluded.dias, inicio_prazo = excluded.inicio_prazo,
          limite_prazo = excluded.limite_prazo, atualizado_em = excluded.atualizado_em;

    if p.inicio_prazo is null then
      continue;
    end if;

    foreach m in array array[30, 60, 75, 85, 91] loop
      exit when p.dias_transcorridos < m;
      insert into evento_prazo_alertas (evento_id, marco, dias, limite_prazo)
      values (p.evento_id, m, p.dias_transcorridos, p.limite_prazo)
      on conflict (evento_id, marco) do nothing
      returning id into v_id;
      if v_id is not null then
        insert into evento_prazo_historico (evento_id, tipo, detalhe, dias)
        values (p.evento_id, 'ALERTA',
                case when m = 91 then 'Prazo regulatorio VENCIDO (limite ' || to_char(p.limite_prazo, 'DD/MM/YYYY') || ').'
                     else 'Marco de ' || m || ' dias (limite ' || to_char(p.limite_prazo, 'DD/MM/YYYY') || ').' end,
                p.dias_transcorridos);
        v_novos := v_novos || jsonb_build_object(
          'alerta_id', v_id, 'evento_id', p.evento_id, 'numero_protocolo', p.numero_protocolo,
          'marco', m, 'dias', p.dias_transcorridos, 'limite_prazo', p.limite_prazo,
          'regional_id', p.regional_id, 'regional_nome', p.regional_nome,
          'placa', p.placa, 'cliente_nome', p.cliente_nome);
        v_id := null;
      end if;
    end loop;
  end loop;

  -- encerrados saem do cache
  delete from evento_prazo_situacao s
   using eventos_sinistro e
   where e.id = s.evento_id and e.status::text in ('CONCLUIDO', 'NEGADO');

  return jsonb_build_object('eventos_abertos', v_n, 'por_nivel', v_niv, 'alertas_novos', v_novos);
end;
$$;

comment on function atualizar_prazos_eventos() is
  'Rotina diaria (0113): grava o contador de cada evento aberto e dispara os alertas de 30/60/75/85 dias e de vencido (91), uma vez por marco. Re-executavel.';

create or replace function marcar_alertas_prazo_notificados(p_ids uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Somente a matriz.' using errcode = 'insufficient_privilege';
  end if;
  update evento_prazo_alertas set notificado_em = now()
   where id = any (coalesce(p_ids, '{}')) and notificado_em is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ============================================================================
-- (H) O evento trazido do Mutual: o AVISO foi la, na data do evento
-- ============================================================================
create or replace function transportar_eventos_historico(p_ids uuid[])
returns table (
  historico_id     uuid,
  evento_id        uuid,
  numero_protocolo text,
  situacao         text,
  motivo           text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  h      record;
  v_rid  uuid;
  v_env  text;
  v_desc text;
begin
  if not is_staff() then
    raise exception 'Somente a equipe leva evento ao Kanban.' using errcode = 'insufficient_privilege';
  end if;
  if not perfil_pode('eventos', 'criar') then
    raise exception 'Seu perfil nao pode abrir evento.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(cardinality(p_ids), 0) = 0 then
    return;
  end if;
  if cardinality(p_ids) > 200 then
    raise exception 'Leve no maximo 200 eventos por vez.' using errcode = 'check_violation';
  end if;

  for h in
    select eh.*, coalesce(ve.regional_id, cl.regional_id) as rid,
           es.numero_protocolo as protocolo_kanban
      from eventos_historico eh
      join clientes cl on cl.id = eh.cliente_id
      left join veiculos ve on ve.id = eh.veiculo_id
      left join eventos_sinistro es on es.id = eh.evento_id
     where eh.id = any (p_ids)
     order by eh.data_evento nulls last, eh.id
       for update of eh
  loop
    historico_id := h.id;
    evento_id := h.evento_id;
    numero_protocolo := h.protocolo_kanban;
    v_rid := h.rid;

    if not (tem_acesso_global() or pode_regional(v_rid)) then
      evento_id := null; numero_protocolo := null;
      situacao := 'FORA_DA_UNIDADE'; motivo := 'O evento e de outra unidade.';
      return next; continue;
    end if;
    if h.evento_id is not null then
      situacao := 'JA_NO_KANBAN'; motivo := 'Ja foi levado ao Kanban.';
      return next; continue;
    end if;
    if h.veiculo_id is null then
      situacao := 'SEM_VEICULO';
      motivo := 'O veiculo ' || coalesce(h.placa, '(sem placa)') || ' nao esta na base; o Kanban exige veiculo.';
      return next; continue;
    end if;
    if h.data_evento is null then
      situacao := 'SEM_DATA'; motivo := 'O Mutual nao informou a data da ocorrencia.';
      return next; continue;
    end if;

    v_env := upper(texto_sem_acento(coalesce(h.envolvimento, '')));
    v_desc := concat_ws(E'\n',
      'Trazido do historico do Mutual em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || '.',
      'Protocolo no Mutual: ' || coalesce(h.protocolo, 'nao informado') || '.',
      case when cardinality(h.tipos) > 0 then 'Tipo(s) no Mutual: ' || array_to_string(h.tipos, ', ') || '.' end,
      case when h.envolvimento is not null then 'Envolvimento no Mutual: ' || h.envolvimento || '.' end,
      case when coalesce(h.valor_total, 0) <> 0
           then 'Valor no Mutual: R$ ' || replace(to_char(h.valor_total, 'FM999999990.00'), '.', ',') || '.' end);

    insert into eventos_sinistro (
      veiculo_id, cliente_id, data_ocorrencia, data_comunicacao, tipo_evento_id, descricao,
      status, regional_id, tipo_envolvimento
    ) values (
      h.veiculo_id, h.cliente_id, h.data_evento, h.data_evento, tipo_evento_do_historico(h.tipos), v_desc,
      'ABERTO', v_rid,
      case when v_env in ('CAUSADOR', 'VITIMA') then v_env::tipo_envolvimento end
    )
    returning eventos_sinistro.id, eventos_sinistro.numero_protocolo
      into evento_id, numero_protocolo;

    update eventos_historico set evento_id = transportar_eventos_historico.evento_id where id = h.id;

    situacao := 'LEVADO'; motivo := null;
    return next;
  end loop;

  for historico_id in
    select x from unnest(p_ids) x
     where not exists (select 1 from eventos_historico eh where eh.id = x)
  loop
    evento_id := null; numero_protocolo := null;
    situacao := 'NAO_ENCONTRADO'; motivo := 'Evento do historico nao encontrado.';
    return next;
  end loop;
end;
$$;

comment on function transportar_eventos_historico(uuid[]) is
  'Leva eventos escolhidos do historico do Mutual para o Kanban, sempre em ABERTO (0112); desde a 0113 o aviso e a data do evento no Mutual.';

-- ============================================================================
-- BACKFILL: aviso dos eventos ja existentes e a lista padrao dos abertos
-- ============================================================================
update eventos_sinistro e
   set data_comunicacao = coalesce(
         (select e.data_ocorrencia from eventos_historico h where h.evento_id = e.id limit 1),
         data_sp(e.created_at))
 where e.data_comunicacao is null;

do $$
declare r record;
begin
  for r in select id from eventos_sinistro where status::text not in ('CONCLUIDO', 'NEGADO') loop
    perform aplicar_documentos_padrao_evento_interno(r.id);
  end loop;
end $$;

-- ============================================================================
-- Rito de seguranca (0052)
-- ============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
