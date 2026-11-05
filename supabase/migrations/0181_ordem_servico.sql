-- ============================================================================
-- SCar :: 0181_ordem_servico.sql
-- ORDEM DE SERVICO do departamento de eventos — a formalizacao do reparo
-- aprovado, emitida PELO MODULO DE TERMOS (0123), dentro do evento.
--
-- Decisoes do usuario (05/11/2026):
--   * a OS nasce da COTACAO APROVADA (cotacoes_pecas, 0009/0132): aprovar a
--     cotacao ja oferece gerar a OS com o fornecedor e os itens;
--   * a OS e so a formalizacao: o contas a pagar continua como esta (0132),
--     pelo valor da cotacao — nada aqui cria titulo;
--   * fuso do sistema (Sao Paulo); endereco de faturamento = o da empresa;
--   * o prestador pode ver a participacao do associado; CPF completo no PDF.
--
-- (A) Termos: tipo ORDEM_SERVICO e escopo EVENTO; termos_emitidos ganha
--     evento_id/fornecedor_id (nulos nos antigos) e entram no imutavel.
-- (B) itens_cotacao.tipo_item (MAO_DE_OBRA | PECA) e .codigo.
-- (C) fornecedores.inscricao_estadual/_municipal; empresa.email_departamento_eventos.
-- (D) ordens_servico + ordens_servico_itens (subtotal gerado) + envios;
--     numero OS-AAAA-NNNNNN por ano; conteudo IMUTAVEL (so status, envio,
--     entrega e cancelamento mudam); retificacao substitui a anterior so ao emitir.
-- (E) somar_dias_uteis (cobranca_feriados), RPCs de emissao, PDF/anexo,
--     envio, status, entrega e cancelamento — todas gravam historico_protocolo.
-- (F) anexos_evento.termo_emitido_id + tipo ORDEM_SERVICO (o PDF fica no
--     bucket `termos`; o anexo aponta para o termo emitido).
-- Permissao: a do EVENTO. Emite/move quem trata o evento (pode_tratar_evento,
-- 0077/0111); le quem ve o evento da unidade; o associado nunca ve.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Termos
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'termos_modelos'::regclass and contype = 'c'
              and (pg_get_constraintdef(oid) like '%tipo%CONTRATO%'
                   or pg_get_constraintdef(oid) like '%escopo%ASSOCIADO%')
  loop
    execute format('alter table termos_modelos drop constraint %I', r.conname);
  end loop;
end $$;
alter table termos_modelos add constraint chk_termo_modelo_tipo
  check (tipo in ('CONTRATO','REGULAMENTO','RASTREADOR','ADITIVO','CANCELAMENTO',
                  'DECLARACAO','OUTRO','ORDEM_SERVICO'));
alter table termos_modelos add constraint chk_termo_modelo_escopo
  check (escopo in ('ASSOCIADO','GERAL','EVENTO'));
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_termo_os_escopo_evento') then
    alter table termos_modelos add constraint chk_termo_os_escopo_evento
      check ((tipo = 'ORDEM_SERVICO') = (escopo = 'EVENTO'));
  end if;
end $$;

alter table termos_emitidos
  add column if not exists evento_id     uuid references eventos_sinistro(id) on delete restrict,
  add column if not exists fornecedor_id uuid references fornecedores(id) on delete restrict;
create index if not exists idx_termos_emitidos_evento on termos_emitidos (evento_id) where evento_id is not null;

comment on column termos_emitidos.evento_id is
  'Termo de EVENTO (Ordem de Servico, 0181). Nulo nos termos do associado.';

create or replace function fn_termo_emitido_imutavel()
returns trigger language plpgsql as $$
begin
  if new.protocolo is distinct from old.protocolo
     or new.modelo_id is distinct from old.modelo_id
     or new.versao_id is distinct from old.versao_id
     or new.cliente_id is distinct from old.cliente_id
     or new.veiculo_id is distinct from old.veiculo_id
     or new.evento_id is distinct from old.evento_id
     or new.fornecedor_id is distinct from old.fornecedor_id
     or new.titulo is distinct from old.titulo
     or new.conteudo_html is distinct from old.conteudo_html
     or new.html_sha256 is distinct from old.html_sha256
     or new.campos_vazios is distinct from old.campos_vazios
     or new.emitido_por is distinct from old.emitido_por
     or new.emitido_em is distinct from old.emitido_em then
    raise exception 'O conteudo de um termo emitido nao pode ser alterado: cancele e emita outro.'
      using errcode = 'check_violation';
  end if;
  if old.pdf_path is not null and (new.pdf_path is distinct from old.pdf_path
                                   or new.pdf_sha256 is distinct from old.pdf_sha256) then
    raise exception 'O PDF deste termo ja foi gravado.' using errcode = 'check_violation';
  end if;
  if old.situacao = 'CANCELADO' and new.situacao <> 'CANCELADO' then
    raise exception 'Termo cancelado nao volta.' using errcode = 'check_violation';
  end if;
  -- termo de evento (OS) nunca vai ao portal do associado
  if new.evento_id is not null and new.visivel_portal then
    raise exception 'Ordem de servico nao vai ao portal do associado.' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_termo_evento_fora_portal') then
    alter table termos_emitidos add constraint chk_termo_evento_fora_portal
      check (evento_id is null or not visivel_portal);
  end if;
end $$;

-- O termo do associado (0123) nao emite modelo de EVENTO por fora da OS.
do $$
declare d text;
begin
  select pg_get_functiondef('registrar_termo_emitido(uuid,uuid,uuid,text,text[],boolean)'::regprocedure) into d;
  if position('0181:' in d) = 0 then
    d := replace(d,
      $q$  select * into m from termos_modelos where id = v.modelo_id;$q$,
      $q$  select * into m from termos_modelos where id = v.modelo_id;
  -- 0181: modelo de evento (Ordem de Servico) so pela emissao da OS
  if m.escopo = 'EVENTO' then
    raise exception 'Este modelo e emitido pela Ordem de Servico do evento.' using errcode = 'check_violation';
  end if;$q$);
    if position('0181:' in d) = 0 then
      raise exception '0181: corpo de registrar_termo_emitido nao reconhecido';
    end if;
    execute d;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (B) Itens da cotacao: mao de obra x peca
-- ----------------------------------------------------------------------------
alter table itens_cotacao
  add column if not exists tipo_item text not null default 'PECA',
  add column if not exists codigo    text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_item_cotacao_tipo') then
    alter table itens_cotacao add constraint chk_item_cotacao_tipo check (tipo_item in ('MAO_DE_OBRA','PECA'));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (C) Cadastros
-- ----------------------------------------------------------------------------
alter table fornecedores
  add column if not exists inscricao_estadual  text,
  add column if not exists inscricao_municipal text;

alter table empresa add column if not exists email_departamento_eventos text;
update empresa set email_departamento_eventos = 'eventos@smartcarbrasil.com.br'
 where email_departamento_eventos is null;
comment on column empresa.email_departamento_eventos is
  'E-mail do departamento de eventos: vai na OS (nota fiscal) e como resposta do e-mail ao prestador. 0181.';

-- ----------------------------------------------------------------------------
-- (F) Anexo do evento que aponta para o termo emitido
-- ----------------------------------------------------------------------------
alter type tipo_documento_anexo add value if not exists 'ORDEM_SERVICO';
alter table anexos_evento add column if not exists termo_emitido_id uuid references termos_emitidos(id) on delete restrict;
create unique index if not exists uq_anexo_evento_termo on anexos_evento (termo_emitido_id) where termo_emitido_id is not null;

-- ----------------------------------------------------------------------------
-- Dias uteis (fim de semana e cobranca_feriados)
-- ----------------------------------------------------------------------------
-- security definer: so le o calendario de feriados (a RLS de cobranca_feriados
-- e da cobranca, e quem emite a OS e o time de eventos).
create or replace function somar_dias_uteis(p_inicio date, p_dias integer)
returns date language plpgsql stable security definer set search_path = public as $$
declare
  d date := p_inicio;
  n integer := 0;
begin
  if p_inicio is null or p_dias is null then return null; end if;
  if p_dias <= 0 then return p_inicio; end if;
  while n < p_dias loop
    d := d + 1;
    if extract(isodow from d) < 6 and not exists (select 1 from cobranca_feriados f where f.data = d) then
      n := n + 1;
    end if;
    exit when d > p_inicio + 400;
  end loop;
  return d;
end;
$$;

-- ----------------------------------------------------------------------------
-- (D) Ordens de servico
-- ----------------------------------------------------------------------------
create table if not exists ordens_servico (
  id                      uuid primary key default gen_random_uuid(),
  numero                  text unique,
  termo_emitido_id        uuid unique references termos_emitidos(id) on delete restrict,
  evento_id               uuid not null references eventos_sinistro(id) on delete restrict,
  cotacao_id              uuid references cotacoes_pecas(id) on delete set null,
  evento_terceiro_id      uuid references evento_terceiros(id) on delete set null,
  fornecedor_id           uuid not null references fornecedores(id) on delete restrict,
  cliente_id              uuid not null references clientes(id) on delete restrict,
  veiculo_id              uuid references veiculos(id) on delete restrict,
  regional_id             uuid references regionais(id) on delete set null,
  tipo_ordem              text not null check (tipo_ordem in ('MAO_DE_OBRA','PECAS','MISTA')),
  documento               text not null default 'AUTORIZACAO' check (documento in ('AUTORIZACAO','RETIFICACAO')),
  os_anterior_id          uuid references ordens_servico(id) on delete restrict,
  total_mao_obra          numeric(12,2) not null default 0 check (total_mao_obra >= 0),
  total_pecas             numeric(12,2) not null default 0 check (total_pecas >= 0),
  total_autorizado        numeric(12,2) not null default 0 check (total_autorizado >= 0),
  participacao_associado  numeric(12,2) not null default 0 check (participacao_associado >= 0),
  pecas_smartcar          numeric(12,2) not null default 0 check (pecas_smartcar >= 0),
  valor_liquido           numeric(12,2) not null default 0 check (valor_liquido >= 0),
  data_inicio_prevista    date,
  prazo_dias_uteis        integer check (prazo_dias_uteis is null or prazo_dias_uteis between 0 and 365),
  data_limite_entrega     date not null,
  data_entrega_real       date,
  local_entrega           text,
  garantia_dias           integer check (garantia_dias is null or garantia_dias between 0 and 3650),
  pagamento_previsto      date,
  observacoes             text,
  status                  text not null default 'EMITIDA'
                          check (status in ('EMITIDA','ENVIADA','EM_EXECUCAO','ENTREGUE','CANCELADA','SUBSTITUIDA')),
  enviada_em              timestamptz,
  entregue_por            uuid references usuarios(id) on delete set null,
  cancelada_em            timestamptz,
  cancelada_por           uuid references usuarios(id) on delete set null,
  cancelamento_motivo     text,
  substituida_por_id      uuid references ordens_servico(id) on delete set null,
  emitida_por             uuid references usuarios(id) on delete set null,
  emitida_em              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint chk_os_limite_inicio check (data_inicio_prevista is null or data_limite_entrega >= data_inicio_prevista),
  constraint chk_os_totais check (total_autorizado = total_mao_obra + total_pecas),
  constraint chk_os_liquido check (valor_liquido = total_autorizado - participacao_associado - pecas_smartcar),
  constraint chk_os_retificacao check ((documento = 'RETIFICACAO') = (os_anterior_id is not null))
);
create index if not exists idx_os_evento on ordens_servico (evento_id, emitida_em desc);
create index if not exists idx_os_fornecedor on ordens_servico (fornecedor_id);
create index if not exists idx_os_status on ordens_servico (status, data_limite_entrega);
create index if not exists idx_os_regional on ordens_servico (regional_id);

comment on table ordens_servico is
  'Ordem de Servico do evento (0181): a formalizacao do reparo aprovado, emitida como termo. '
  'Conteudo imutavel; so status, envio, entrega e cancelamento mudam. Nao gera contas a pagar.';

create table if not exists ordens_servico_itens (
  id              uuid primary key default gen_random_uuid(),
  ordem_servico_id uuid not null references ordens_servico(id) on delete restrict,
  ordem           integer not null,
  tipo            text not null check (tipo in ('MAO_DE_OBRA','PECA')),
  descricao       text not null check (btrim(descricao) <> ''),
  codigo          text,
  quantidade      numeric(10,2) not null check (quantidade > 0),
  valor_unitario  numeric(12,2) not null check (valor_unitario >= 0),
  subtotal        numeric(14,2) generated always as (round(quantidade * valor_unitario, 2)) stored,
  unique (ordem_servico_id, ordem)
);

create table if not exists ordens_servico_envios (
  id               uuid primary key default gen_random_uuid(),
  ordem_servico_id uuid not null references ordens_servico(id) on delete restrict,
  canal            text not null check (canal in ('WHATSAPP','EMAIL','MANUAL','DOWNLOAD')),
  destino          text,
  observacao       text,
  enviado_por      uuid references usuarios(id) on delete set null,
  enviado_em       timestamptz not null default clock_timestamp()
);
create index if not exists idx_os_envios on ordens_servico_envios (ordem_servico_id, enviado_em desc);

-- Numero OS-AAAA-NNNNNN, sequencia anual (mesmo padrao do protocolo do termo).
create or replace function proximo_numero_os()
returns text language plpgsql set search_path = public as $$
declare v_ano text; v_seq integer;
begin
  v_ano := to_char(data_sp(now()), 'YYYY');
  perform pg_advisory_xact_lock(hashtext('ordem_servico_' || v_ano));
  select coalesce(max((regexp_replace(numero, '^OS-\d{4}-', ''))::integer), 0) + 1
    into v_seq from ordens_servico where numero like 'OS-' || v_ano || '-%';
  return 'OS-' || v_ano || '-' || lpad(v_seq::text, 6, '0');
end;
$$;

create or replace function fn_os_numero()
returns trigger language plpgsql as $$
begin
  if new.numero is null then new.numero := proximo_numero_os(); end if;
  return new;
end;
$$;
drop trigger if exists trg_os_numero on ordens_servico;
create trigger trg_os_numero before insert on ordens_servico
  for each row execute function fn_os_numero();

-- Conteudo imutavel: so status, envio, entrega, cancelamento e substituicao mudam.
create or replace function fn_os_imutavel()
returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - array['status','enviada_em','data_entrega_real','entregue_por','cancelada_em',
                            'cancelada_por','cancelamento_motivo','substituida_por_id','updated_at',
                            'termo_emitido_id'])
     is distinct from
     (to_jsonb(old) - array['status','enviada_em','data_entrega_real','entregue_por','cancelada_em',
                            'cancelada_por','cancelamento_motivo','substituida_por_id','updated_at',
                            'termo_emitido_id']) then
    raise exception 'O conteudo da Ordem de Servico % nao pode ser alterado: emita uma retificacao.', old.numero
      using errcode = 'check_violation';
  end if;
  if old.termo_emitido_id is not null and new.termo_emitido_id is distinct from old.termo_emitido_id then
    raise exception 'A Ordem de Servico ja tem o termo emitido.' using errcode = 'check_violation';
  end if;
  if old.status in ('CANCELADA','SUBSTITUIDA') and new.status is distinct from old.status then
    raise exception 'Ordem de Servico % ja esta %.', old.numero, lower(old.status) using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_os_imutavel on ordens_servico;
create trigger trg_os_imutavel before update on ordens_servico
  for each row execute function fn_os_imutavel();

create or replace function fn_os_sem_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'Ordem de Servico nao se apaga: cancele ou retifique.' using errcode = 'check_violation';
end;
$$;
drop trigger if exists trg_os_sem_delete on ordens_servico;
create trigger trg_os_sem_delete before delete on ordens_servico
  for each row execute function fn_os_sem_delete();

-- Itens: entram so na emissao (GUC scar.os_emitindo) e nunca mudam.
create or replace function fn_os_item_imutavel()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(current_setting('scar.os_emitindo', true), '') = new.ordem_servico_id::text then
      return new;
    end if;
    raise exception 'Itens da Ordem de Servico entram so na emissao.' using errcode = 'check_violation';
  end if;
  raise exception 'Itens da Ordem de Servico emitida nao mudam: emita uma retificacao.' using errcode = 'check_violation';
end;
$$;
drop trigger if exists trg_os_item_imutavel on ordens_servico_itens;
create trigger trg_os_item_imutavel before insert or update or delete on ordens_servico_itens
  for each row execute function fn_os_item_imutavel();

-- RLS: le quem ve o evento da unidade; escrita so pelas RPCs.
alter table ordens_servico enable row level security;
alter table ordens_servico_itens enable row level security;
alter table ordens_servico_envios enable row level security;

drop policy if exists os_select on ordens_servico;
create policy os_select on ordens_servico for select to authenticated using (
  (select tem_acesso_global())
  or ((select is_staff()) and regional_id = any ((select regionais_do_usuario())::uuid[]))
);
drop policy if exists os_itens_select on ordens_servico_itens;
create policy os_itens_select on ordens_servico_itens for select to authenticated using (
  exists (select 1 from ordens_servico o where o.id = ordem_servico_id)
);
drop policy if exists os_envios_select on ordens_servico_envios;
create policy os_envios_select on ordens_servico_envios for select to authenticated using (
  exists (select 1 from ordens_servico o where o.id = ordem_servico_id)
);
revoke all on ordens_servico, ordens_servico_itens, ordens_servico_envios from anon;
grant select on ordens_servico, ordens_servico_itens, ordens_servico_envios to authenticated;

-- ----------------------------------------------------------------------------
-- (E) Emissao
-- ----------------------------------------------------------------------------
-- O HTML chega preenchido pela rota (src/lib/termos.ts) com duas marcas que
-- so existem na emissao: {{PROTOCOLO_DO_TERMO}} e {{NUMERO_DA_OS}}. Os totais
-- sao recalculados AQUI a partir dos itens; se divergirem do que a rota
-- desenhou, a emissao e recusada (o PDF nunca diz um valor e o banco outro).
create or replace function emitir_ordem_servico(
  p_versao_id     uuid,
  p_dados         jsonb,
  p_html          text,
  p_campos_vazios text[] default '{}'
)
returns ordens_servico
language plpgsql security definer set search_path = public
as $$
declare
  v    termos_versoes;
  m    termos_modelos;
  ev   eventos_sinistro;
  ant  ordens_servico;
  os   ordens_servico;
  te   termos_emitidos;
  it   jsonb;
  n    integer := 0;
  mo   numeric(12,2) := 0;
  pc   numeric(12,2) := 0;
  q    numeric;
  u    numeric;
  part numeric(12,2);
  psc  numeric(12,2);
  liq  numeric(12,2);
  ini  date;
  lim  date;
  forn uuid;
  html text;
  prot text;
  num  text;
  terc uuid;
  cot  uuid;
  vei  uuid;
begin
  select * into ev from eventos_sinistro where id = nullif(p_dados->>'evento_id', '')::uuid;
  if not found then
    raise exception 'Evento nao encontrado.' using errcode = 'no_data_found';
  end if;
  if not pode_tratar_evento(ev.regional_id) then
    raise exception 'Seu perfil nao emite Ordem de Servico neste evento.' using errcode = 'insufficient_privilege';
  end if;
  select * into v from termos_versoes where id = p_versao_id;
  if not found then
    raise exception 'Versao do modelo nao encontrada.' using errcode = 'no_data_found';
  end if;
  select * into m from termos_modelos where id = v.modelo_id;
  if m.tipo <> 'ORDEM_SERVICO' or not m.ativo then
    raise exception 'Este modelo nao e uma Ordem de Servico ativa.' using errcode = 'check_violation';
  end if;

  forn := nullif(p_dados->>'fornecedor_id', '')::uuid;
  if forn is null or not exists (select 1 from fornecedores f where f.id = forn) then
    raise exception 'Escolha o prestador (fornecedor cadastrado).' using errcode = 'check_violation';
  end if;

  cot := nullif(p_dados->>'cotacao_id', '')::uuid;
  if cot is not null and not exists (select 1 from cotacoes_pecas c where c.id = cot and c.evento_id = ev.id) then
    raise exception 'A cotacao nao e deste evento.' using errcode = 'check_violation';
  end if;
  terc := nullif(p_dados->>'evento_terceiro_id', '')::uuid;
  if terc is not null and not exists (select 1 from evento_terceiros t where t.id = terc and t.evento_id = ev.id) then
    raise exception 'O terceiro nao e deste evento.' using errcode = 'check_violation';
  end if;

  if jsonb_typeof(p_dados->'itens') <> 'array' or jsonb_array_length(p_dados->'itens') = 0 then
    raise exception 'A Ordem de Servico precisa de pelo menos um item.' using errcode = 'check_violation';
  end if;
  for it in select * from jsonb_array_elements(p_dados->'itens') loop
    q := (it->>'quantidade')::numeric;
    u := (it->>'valor_unitario')::numeric;
    if q is null or q <= 0 or u is null or u < 0 or btrim(coalesce(it->>'descricao', '')) = ''
       or coalesce(it->>'tipo', '') not in ('MAO_DE_OBRA','PECA') then
      raise exception 'Item invalido: informe tipo, descricao, quantidade (> 0) e valor (>= 0).'
        using errcode = 'check_violation';
    end if;
    if it->>'tipo' = 'MAO_DE_OBRA' then mo := mo + round(q * u, 2); else pc := pc + round(q * u, 2); end if;
  end loop;

  part := round(coalesce(nullif(p_dados->>'participacao_associado', '')::numeric, ev.valor_participacao, 0), 2);
  psc  := round(coalesce(nullif(p_dados->>'pecas_smartcar', '')::numeric, 0), 2);
  if part < 0 or psc < 0 then
    raise exception 'Valores nao podem ser negativos.' using errcode = 'check_violation';
  end if;
  liq := mo + pc - part - psc;
  if liq < 0 then
    raise exception 'O valor liquido a faturar ficaria negativo (autorizado % menos participacao % e pecas da Smart Car %).',
      mo + pc, part, psc using errcode = 'check_violation';
  end if;
  if (p_dados ? 'total_autorizado') and round((p_dados->>'total_autorizado')::numeric, 2) <> mo + pc then
    raise exception 'Os totais mudaram: gere a previa de novo.' using errcode = 'check_violation';
  end if;
  if (p_dados ? 'valor_liquido') and round((p_dados->>'valor_liquido')::numeric, 2) <> liq then
    raise exception 'O valor liquido mudou: gere a previa de novo.' using errcode = 'check_violation';
  end if;

  ini := nullif(p_dados->>'data_inicio_prevista', '')::date;
  lim := nullif(p_dados->>'data_limite_entrega', '')::date;
  if lim is null then
    raise exception 'Informe a data limite de entrega.' using errcode = 'check_violation';
  end if;
  if ini is not null and lim < ini then
    raise exception 'A data limite nao pode ser antes do inicio previsto.' using errcode = 'check_violation';
  end if;

  if coalesce(p_dados->>'documento', 'AUTORIZACAO') = 'RETIFICACAO' then
    select * into ant from ordens_servico where id = nullif(p_dados->>'os_anterior_id', '')::uuid for update;
    if not found or ant.evento_id <> ev.id then
      raise exception 'Escolha a Ordem de Servico que esta sendo retificada (do mesmo evento).'
        using errcode = 'check_violation';
    end if;
    if ant.status in ('CANCELADA','SUBSTITUIDA') then
      raise exception 'A Ordem de Servico % ja esta %.', ant.numero, lower(ant.status) using errcode = 'check_violation';
    end if;
  end if;
  if btrim(coalesce(p_html, '')) = '' then
    raise exception 'Texto da Ordem de Servico vazio.' using errcode = 'check_violation';
  end if;

  -- veiculo do termo: o do evento (o reparo de terceiro aparece no corpo da OS)
  vei := ev.veiculo_id;

  num  := proximo_numero_os();
  prot := proximo_protocolo_termo();
  html := replace(replace(p_html, '{{PROTOCOLO_DO_TERMO}}', prot), '{{NUMERO_DA_OS}}', num);

  insert into termos_emitidos (protocolo, modelo_id, versao_id, cliente_id, veiculo_id, regional_id,
                               evento_id, fornecedor_id, titulo, conteudo_html, html_sha256,
                               campos_vazios, visivel_portal, emitido_por)
  values (prot, m.id, v.id, ev.cliente_id, vei, ev.regional_id, ev.id, forn,
          v.nome || ' ' || num, html, termo_sha256(html), coalesce(p_campos_vazios, '{}'), false,
          usuario_atual_id())
  returning * into te;

  insert into ordens_servico (numero, termo_emitido_id, evento_id, cotacao_id, evento_terceiro_id, fornecedor_id,
                              cliente_id, veiculo_id, regional_id, tipo_ordem, documento, os_anterior_id,
                              total_mao_obra, total_pecas, total_autorizado, participacao_associado,
                              pecas_smartcar, valor_liquido, data_inicio_prevista, prazo_dias_uteis,
                              data_limite_entrega, local_entrega, garantia_dias, pagamento_previsto,
                              observacoes, emitida_por)
  values (num, te.id, ev.id, cot, terc, forn, ev.cliente_id, vei, ev.regional_id,
          case when mo > 0 and pc > 0 then 'MISTA' when mo > 0 then 'MAO_DE_OBRA' else 'PECAS' end,
          coalesce(p_dados->>'documento', 'AUTORIZACAO'), ant.id,
          mo, pc, mo + pc, part, psc, liq, ini, nullif(p_dados->>'prazo_dias_uteis', '')::integer, lim,
          nullif(btrim(coalesce(p_dados->>'local_entrega', '')), ''),
          nullif(p_dados->>'garantia_dias', '')::integer,
          nullif(p_dados->>'pagamento_previsto', '')::date,
          nullif(btrim(coalesce(p_dados->>'observacoes', '')), ''), usuario_atual_id())
  returning * into os;

  perform set_config('scar.os_emitindo', os.id::text, true);
  for it in select * from jsonb_array_elements(p_dados->'itens') loop
    n := n + 1;
    insert into ordens_servico_itens (ordem_servico_id, ordem, tipo, descricao, codigo, quantidade, valor_unitario)
    values (os.id, n, it->>'tipo', btrim(it->>'descricao'), nullif(btrim(coalesce(it->>'codigo', '')), ''),
            (it->>'quantidade')::numeric, (it->>'valor_unitario')::numeric);
  end loop;
  perform set_config('scar.os_emitindo', '', true);

  if ant.id is not null then
    update ordens_servico set status = 'SUBSTITUIDA', substituida_por_id = os.id where id = ant.id;
    insert into historico_protocolo (evento_id, usuario_origem_id, acao_realizada, observacoes)
    values (ev.id, usuario_atual_id(), 'OS_SUBSTITUIDA', ant.numero || ' substituida pela retificacao ' || num);
  end if;

  insert into historico_protocolo (evento_id, usuario_origem_id, acao_realizada, observacoes)
  values (ev.id, usuario_atual_id(), 'OS_EMITIDA',
          num || ' · ' || (select coalesce(nullif(f.nome_fantasia, ''), f.razao_social) from fornecedores f where f.id = forn)
          || ' · autorizado R$ ' || replace(to_char(mo + pc, 'FM999999990.00'), '.', ',')
          || ' · entrega ate ' || to_char(lim, 'DD/MM/YYYY')
          || case when ant.id is not null then ' · retifica ' || ant.numero else '' end);
  return os;
end;
$$;

-- PDF (uma vez) + anexo do evento. Chamada pela rota depois de gerar o PDF.
create or replace function anexar_pdf_ordem_servico(p_os_id uuid, p_path text, p_sha256 text, p_bytes int)
returns void
language plpgsql security definer set search_path = public
as $$
declare os ordens_servico;
begin
  select * into os from ordens_servico where id = p_os_id;
  if not found then
    raise exception 'Ordem de Servico nao encontrada.' using errcode = 'no_data_found';
  end if;
  if auth.uid() is not null and not pode_tratar_evento(os.regional_id) then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;
  update termos_emitidos set pdf_path = p_path, pdf_sha256 = p_sha256, pdf_bytes = p_bytes
   where id = os.termo_emitido_id and pdf_path is null;
  insert into anexos_evento (evento_id, tipo_documento, arquivo_url, nome_original, tamanho_bytes,
                             uploaded_by, termo_emitido_id)
  select os.evento_id, 'ORDEM_SERVICO'::tipo_documento_anexo, p_path, os.numero || '.pdf', p_bytes,
         usuario_atual_id(), os.termo_emitido_id
   where not exists (select 1 from anexos_evento a where a.termo_emitido_id = os.termo_emitido_id);
end;
$$;

-- Envio ao prestador (WhatsApp, e-mail, manual, download). EMITIDA -> ENVIADA.
create or replace function registrar_envio_ordem_servico(
  p_os_id uuid, p_canal text, p_destino text default null, p_observacao text default null
)
returns ordens_servico
language plpgsql security definer set search_path = public
as $$
declare os ordens_servico;
begin
  select * into os from ordens_servico where id = p_os_id for update;
  if not found then
    raise exception 'Ordem de Servico nao encontrada.' using errcode = 'no_data_found';
  end if;
  if auth.uid() is not null and not pode_tratar_evento(os.regional_id) then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;
  if os.status in ('CANCELADA','SUBSTITUIDA') then
    raise exception 'Ordem de Servico % esta %: nao se envia.', os.numero, lower(os.status) using errcode = 'check_violation';
  end if;
  if coalesce(p_canal, '') not in ('WHATSAPP','EMAIL','MANUAL','DOWNLOAD') then
    raise exception 'Canal invalido.' using errcode = 'check_violation';
  end if;
  insert into ordens_servico_envios (ordem_servico_id, canal, destino, observacao, enviado_por)
  values (os.id, p_canal, nullif(btrim(coalesce(p_destino, '')), ''), nullif(btrim(coalesce(p_observacao, '')), ''),
          usuario_atual_id());
  if p_canal <> 'DOWNLOAD' then
    update ordens_servico
       set status = case when status = 'EMITIDA' then 'ENVIADA' else status end,
           enviada_em = coalesce(enviada_em, now())
     where id = os.id returning * into os;
    insert into historico_protocolo (evento_id, usuario_origem_id, acao_realizada, observacoes)
    values (os.evento_id, usuario_atual_id(), 'OS_ENVIADA',
            os.numero || ' enviada ao prestador por ' ||
            case p_canal when 'WHATSAPP' then 'WhatsApp' when 'EMAIL' then 'e-mail' else 'registro manual' end
            || coalesce(' · ' || nullif(btrim(coalesce(p_observacao, '')), ''), ''));
  end if;
  return os;
end;
$$;

-- Em execucao / entregue.
create or replace function mudar_status_ordem_servico(p_os_id uuid, p_status text, p_data date default null)
returns ordens_servico
language plpgsql security definer set search_path = public
as $$
declare os ordens_servico;
begin
  select * into os from ordens_servico where id = p_os_id for update;
  if not found then
    raise exception 'Ordem de Servico nao encontrada.' using errcode = 'no_data_found';
  end if;
  if not pode_tratar_evento(os.regional_id) then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;
  if os.status in ('CANCELADA','SUBSTITUIDA','ENTREGUE') then
    raise exception 'Ordem de Servico % esta %.', os.numero, lower(os.status) using errcode = 'check_violation';
  end if;
  if p_status = 'EM_EXECUCAO' then
    update ordens_servico set status = 'EM_EXECUCAO' where id = os.id returning * into os;
    insert into historico_protocolo (evento_id, usuario_origem_id, acao_realizada, observacoes)
    values (os.evento_id, usuario_atual_id(), 'OS_EM_EXECUCAO', os.numero || ' em execucao pelo prestador');
  elsif p_status = 'ENTREGUE' then
    if p_data is null or p_data > data_sp(now()) then
      raise exception 'Informe a data da entrega (hoje ou antes).' using errcode = 'check_violation';
    end if;
    if p_data < data_sp(os.emitida_em) then
      raise exception 'A entrega nao pode ser antes da emissao da OS.' using errcode = 'check_violation';
    end if;
    update ordens_servico set status = 'ENTREGUE', data_entrega_real = p_data, entregue_por = usuario_atual_id()
     where id = os.id returning * into os;
    insert into historico_protocolo (evento_id, usuario_origem_id, acao_realizada, observacoes)
    values (os.evento_id, usuario_atual_id(), 'OS_ENTREGUE',
            os.numero || ' entregue em ' || to_char(p_data, 'DD/MM/YYYY')
            || case when p_data > os.data_limite_entrega
                    then ' (' || (p_data - os.data_limite_entrega) || ' dia(s) apos o prazo)' else ' (no prazo)' end);
  else
    raise exception 'Situacao invalida.' using errcode = 'check_violation';
  end if;
  return os;
end;
$$;

create or replace function cancelar_ordem_servico(p_os_id uuid, p_motivo text)
returns ordens_servico
language plpgsql security definer set search_path = public
as $$
declare os ordens_servico;
begin
  select * into os from ordens_servico where id = p_os_id for update;
  if not found then
    raise exception 'Ordem de Servico nao encontrada.' using errcode = 'no_data_found';
  end if;
  if not pode_tratar_evento(os.regional_id) then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'check_violation';
  end if;
  if os.status in ('CANCELADA','SUBSTITUIDA') then
    raise exception 'Ordem de Servico % ja esta %.', os.numero, lower(os.status) using errcode = 'check_violation';
  end if;
  update ordens_servico set status = 'CANCELADA', cancelada_em = now(), cancelada_por = usuario_atual_id(),
         cancelamento_motivo = btrim(p_motivo)
   where id = os.id returning * into os;
  update termos_emitidos set situacao = 'CANCELADO', cancelado_por = usuario_atual_id(), cancelado_em = now(),
         cancelamento_motivo = btrim(p_motivo)
   where id = os.termo_emitido_id and situacao <> 'CANCELADO';
  insert into historico_protocolo (evento_id, usuario_origem_id, acao_realizada, observacoes)
  values (os.evento_id, usuario_atual_id(), 'OS_CANCELADA', os.numero || ' cancelada: ' || btrim(p_motivo));
  return os;
end;
$$;

-- ----------------------------------------------------------------------------
-- Rito de seguranca (0052)
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
