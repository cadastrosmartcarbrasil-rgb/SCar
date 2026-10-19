-- 0123_termos
-- TERMOS DA SMART CAR: modelos com campos, versoes imutaveis e termos emitidos.
--
-- Pedido do usuario (19/10/2026): um lugar para os documentos da associacao
-- (Termo de Adesao, Regimento, Termo do rastreador...) e para criar outros no
-- caminho, escolhendo os campos do cadastro que entram no texto — como o
-- "Gerenciar Termos" dos outros sistemas, mas com o campo DENTRO do texto.
--
--   (A) PERMISSOES: dois modulos novos na grade (0111):
--         termos_modelos (Gerenciar Termos): ver/criar/editar/excluir —
--           nasce so com o admin; os demais so por EXTRA (0116), decisao do
--           usuario ("quem cria, so admin, ou se for autorizado como extras");
--         termos (Emitir): ver/criar/exportar para todo staff MENOS o
--           consultor de vendas ("consultores sem acesso"); cancelar para
--           financeiro e gestor.
--   (B) termos_modelos: o rascunho editavel (HTML com os campos como
--       <span data-campo="...">), para quem vale (planos, tipos, usos,
--       unidades — vazio = todos), escopo ASSOCIADO (preenchido por pessoa)
--       ou GERAL (o mesmo para todos, ex.: Regimento) e as marcas de portal e
--       de aceite (o aceite em si vem na proxima fase).
--   (C) termos_versoes: PUBLICAR congela o rascunho numa versao numerada, com
--       SHA-256 calculado aqui. A versao NAO muda (trigger); o PDF da versao
--       geral e preenchido uma unica vez. Apagar so se nada foi emitido nela.
--   (D) termos_emitidos: o termo preenchido de um associado/veiculo —
--       snapshot do HTML (com hash) + PDF (com hash), protocolo
--       TRM-AAAAMMDD-XXXX. Conteudo imutavel; so a situacao, a marca do portal
--       e o PDF (uma vez) mudam.
--   (E) Escrita da emissao so por RPC (registrar_termo_emitido,
--       anexar_pdf_termo, cancelar_termo_emitido), com a permissao e a
--       unidade conferidas no banco. Arquivos no bucket privado `termos`, lidos
--       so pelo servidor (service_role) depois da mesma conferencia.
--   (F) Portal: portal_documentos() — os termos emitidos visiveis + os
--       documentos gerais publicados no portal.
--   (G) empresa.regulamento_url — o link do regulamento que o Termo cita.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Permissoes
-- ----------------------------------------------------------------------------
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

-- Seed das celulas novas (re-executavel: nao sobrescreve ajuste do admin).
with papeis(papel) as (
  values ('financeiro'), ('gestor_regional'), ('consultor_vendas'), ('sinistro'),
         ('auditoria'), ('assistencia_24h'), ('supervisor'), ('cobranca')
),
padrao(modulo, acao, quem) as (values
  ('termos_modelos','ver',''), ('termos_modelos','criar',''),
  ('termos_modelos','editar',''), ('termos_modelos','excluir',''),
  ('termos','ver','financeiro,gestor_regional,sinistro,auditoria,assistencia_24h,supervisor,cobranca'),
  ('termos','criar','financeiro,gestor_regional,sinistro,auditoria,assistencia_24h,supervisor,cobranca'),
  ('termos','exportar','financeiro,gestor_regional,sinistro,auditoria,assistencia_24h,supervisor,cobranca'),
  ('termos','cancelar','financeiro,gestor_regional')
)
insert into perfil_permissoes (papel, modulo, acao, concedida)
select pp.papel, d.modulo, d.acao, pp.papel = any (string_to_array(d.quem, ','))
  from papeis pp cross join padrao d
 where not exists (select 1 from perfil_permissoes x
                    where x.papel = pp.papel and x.modulo = d.modulo and x.acao = d.acao);

-- minhas_permissoes com os modulos novos (mesma assinatura).
create or replace function minhas_permissoes()
returns text[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(k order by k), '{}') from (
    select c.modulo || '.' || c.acao as k
      from (
        select m.modulo, a.acao
          from (values ('painel'),('sac'),('protocolos'),('assistencia'),('vendas'),('associados'),
                       ('veiculos'),('rastreadores'),('eventos'),('cobranca'),('precificacao'),
                       ('fornecedores'),('financeiro'),('comunicados'),
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

-- ----------------------------------------------------------------------------
-- (G) Link do regulamento
-- ----------------------------------------------------------------------------
alter table empresa add column if not exists regulamento_url text;

-- ----------------------------------------------------------------------------
-- (B) Modelos
-- ----------------------------------------------------------------------------
create table if not exists termos_modelos (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  tipo             text not null default 'CONTRATO'
                   check (tipo in ('CONTRATO','REGULAMENTO','RASTREADOR','ADITIVO',
                                   'CANCELAMENTO','DECLARACAO','OUTRO')),
  descricao        text,
  escopo           text not null default 'ASSOCIADO' check (escopo in ('ASSOCIADO','GERAL')),
  rascunho_html    text not null default '',
  plano_ids        uuid[] not null default '{}',
  tipo_veiculo_ids uuid[] not null default '{}',
  usos             text[] not null default '{}',
  regional_ids     uuid[] not null default '{}',
  visivel_portal   boolean not null default false,
  exige_aceite     boolean not null default false,
  declaracoes      jsonb not null default '[]'::jsonb,
  ativo            boolean not null default true,
  versao_atual_id  uuid,
  criado_por       uuid references usuarios(id) on delete set null,
  atualizado_por   uuid references usuarios(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint chk_termo_declaracoes check (jsonb_typeof(declaracoes) = 'array')
);

comment on table termos_modelos is
  'Modelos de termo (Configuracoes -> Termos). O rascunho e editavel; o que vale e a versao publicada (termos_versoes). 0123.';

drop trigger if exists trg_termos_modelos_updated on termos_modelos;
create trigger trg_termos_modelos_updated before update on termos_modelos
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- (C) Versoes
-- ----------------------------------------------------------------------------
create table if not exists termos_versoes (
  id            uuid primary key default gen_random_uuid(),
  modelo_id     uuid not null references termos_modelos(id) on delete cascade,
  numero        int not null,
  nome          text not null,
  conteudo_html text not null,
  sha256        text not null,
  declaracoes   jsonb not null default '[]'::jsonb,
  observacao    text,
  pdf_path      text,
  pdf_sha256    text,
  publicada_por uuid references usuarios(id) on delete set null,
  publicada_em  timestamptz not null default now(),
  constraint uq_termo_versao unique (modelo_id, numero)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fk_termo_versao_atual') then
    alter table termos_modelos add constraint fk_termo_versao_atual
      foreign key (versao_atual_id) references termos_versoes(id) on delete set null;
  end if;
end $$;

-- A versao publicada nao muda: so o PDF (da versao geral) entra, uma vez.
create or replace function fn_termo_versao_imutavel()
returns trigger language plpgsql as $$
begin
  if new.modelo_id is distinct from old.modelo_id
     or new.numero is distinct from old.numero
     or new.nome is distinct from old.nome
     or new.conteudo_html is distinct from old.conteudo_html
     or new.sha256 is distinct from old.sha256
     or new.declaracoes is distinct from old.declaracoes
     or new.publicada_em is distinct from old.publicada_em
     or new.publicada_por is distinct from old.publicada_por
     or new.observacao is distinct from old.observacao then
    raise exception 'Versao publicada do termo nao pode ser alterada: publique uma nova versao.'
      using errcode = 'check_violation';
  end if;
  if old.pdf_path is not null and (new.pdf_path is distinct from old.pdf_path
                                   or new.pdf_sha256 is distinct from old.pdf_sha256) then
    raise exception 'O PDF desta versao ja foi gravado.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_termo_versao_imutavel on termos_versoes;
create trigger trg_termo_versao_imutavel before update on termos_versoes
  for each row execute function fn_termo_versao_imutavel();

-- ----------------------------------------------------------------------------
-- (D) Termos emitidos
-- ----------------------------------------------------------------------------
create table if not exists termos_emitidos (
  id                  uuid primary key default gen_random_uuid(),
  protocolo           text unique,
  modelo_id           uuid not null references termos_modelos(id) on delete restrict,
  versao_id           uuid not null references termos_versoes(id) on delete restrict,
  cliente_id          uuid not null references clientes(id) on delete restrict,
  veiculo_id          uuid references veiculos(id) on delete restrict,
  regional_id         uuid references regionais(id) on delete set null,
  titulo              text not null,
  conteudo_html       text not null,
  html_sha256         text not null,
  campos_vazios       text[] not null default '{}',
  pdf_path            text,
  pdf_sha256          text,
  pdf_bytes           int,
  visivel_portal      boolean not null default false,
  situacao            text not null default 'EMITIDO'
                      check (situacao in ('EMITIDO','ENVIADO','ACEITO','CANCELADO')),
  emitido_por         uuid references usuarios(id) on delete set null,
  emitido_em          timestamptz not null default now(),
  cancelado_por       uuid references usuarios(id) on delete set null,
  cancelado_em        timestamptz,
  cancelamento_motivo text,
  updated_at          timestamptz not null default now()
);

create index if not exists idx_termos_emitidos_cliente on termos_emitidos (cliente_id, emitido_em desc);
create index if not exists idx_termos_emitidos_veiculo on termos_emitidos (veiculo_id, emitido_em desc);
create index if not exists idx_termos_versoes_modelo on termos_versoes (modelo_id, numero desc);

comment on table termos_emitidos is
  'Termo preenchido de um associado/veiculo: HTML congelado com SHA-256 e o PDF com SHA-256. '
  'Conteudo imutavel; so situacao, portal e o PDF (uma vez) mudam. 0123.';

create or replace function proximo_protocolo_termo()
returns text language plpgsql set search_path = public as $$
declare v_data text; v_seq integer;
begin
  v_data := to_char(data_sp(now()), 'YYYYMMDD');
  perform pg_advisory_xact_lock(hashtext('termo_' || v_data));
  select coalesce(max((regexp_replace(protocolo, '^TRM-\d{8}-', ''))::integer), 0) + 1
    into v_seq
    from termos_emitidos
   where protocolo like 'TRM-' || v_data || '-%';
  return 'TRM-' || v_data || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

create or replace function fn_protocolo_termo()
returns trigger language plpgsql as $$
begin
  if new.protocolo is null then new.protocolo := proximo_protocolo_termo(); end if;
  return new;
end;
$$;
drop trigger if exists trg_protocolo_termo on termos_emitidos;
create trigger trg_protocolo_termo before insert on termos_emitidos
  for each row execute function fn_protocolo_termo();

create or replace function fn_termo_emitido_imutavel()
returns trigger language plpgsql as $$
begin
  if new.protocolo is distinct from old.protocolo
     or new.modelo_id is distinct from old.modelo_id
     or new.versao_id is distinct from old.versao_id
     or new.cliente_id is distinct from old.cliente_id
     or new.veiculo_id is distinct from old.veiculo_id
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
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_termo_emitido_imutavel on termos_emitidos;
create trigger trg_termo_emitido_imutavel before update on termos_emitidos
  for each row execute function fn_termo_emitido_imutavel();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table termos_modelos  enable row level security;
alter table termos_versoes  enable row level security;
alter table termos_emitidos enable row level security;

drop policy if exists termos_modelos_select on termos_modelos;
create policy termos_modelos_select on termos_modelos
  for select to authenticated using ((select is_staff()));
drop policy if exists termos_modelos_insert on termos_modelos;
create policy termos_modelos_insert on termos_modelos
  for insert to authenticated with check ((select perfil_pode('termos_modelos', 'criar')));
drop policy if exists termos_modelos_update on termos_modelos;
create policy termos_modelos_update on termos_modelos
  for update to authenticated using ((select perfil_pode('termos_modelos', 'editar')))
  with check ((select perfil_pode('termos_modelos', 'editar')));
drop policy if exists termos_modelos_delete on termos_modelos;
create policy termos_modelos_delete on termos_modelos
  for delete to authenticated using ((select perfil_pode('termos_modelos', 'excluir')));

drop policy if exists termos_versoes_select on termos_versoes;
create policy termos_versoes_select on termos_versoes
  for select to authenticated using ((select is_staff()));
-- versao: escrita so por publicar_versao_termo (security definer)

drop policy if exists termos_emitidos_select on termos_emitidos;
create policy termos_emitidos_select on termos_emitidos
  for select to authenticated using (
    (select tem_acesso_global())
    or ((select is_staff()) and regional_id = any ((select regionais_do_usuario())::uuid[]))
    or (cliente_id = (select auth_cliente_id()) and visivel_portal and situacao <> 'CANCELADO')
  );
-- emitido: escrita so pelas RPCs abaixo

revoke all on termos_modelos, termos_versoes, termos_emitidos from anon;

-- Bucket privado: lido e gravado so pelo servidor (service_role), depois de a
-- rota conferir a permissao. Nenhuma policy para authenticated de proposito.
insert into storage.buckets (id, name, public) values ('termos', 'termos', false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Publicar a versao (congela o rascunho)
-- ----------------------------------------------------------------------------
create or replace function termo_sha256(p_texto text)
returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(coalesce(p_texto, ''), 'UTF8')), 'hex');
$$;

create or replace function publicar_versao_termo(p_modelo_id uuid, p_observacao text default null)
returns termos_versoes
language plpgsql security definer set search_path = public
as $$
declare
  m termos_modelos;
  v termos_versoes;
  n int;
begin
  if not (perfil_pode('termos_modelos', 'criar') or perfil_pode('termos_modelos', 'editar')) then
    raise exception 'Sem permissao para publicar termos.' using errcode = 'insufficient_privilege';
  end if;
  select * into m from termos_modelos where id = p_modelo_id for update;
  if not found then
    raise exception 'Termo nao encontrado.' using errcode = 'no_data_found';
  end if;
  if btrim(regexp_replace(coalesce(m.rascunho_html, ''), '<[^>]*>', '', 'g')) = '' then
    raise exception 'O texto do termo esta vazio.' using errcode = 'check_violation';
  end if;
  if m.versao_atual_id is not null and exists (
       select 1 from termos_versoes x
        where x.id = m.versao_atual_id and x.conteudo_html = m.rascunho_html
          and x.declaracoes = m.declaracoes and x.nome = m.nome) then
    raise exception 'Nada mudou desde a versao % — nao ha o que publicar.',
      (select numero from termos_versoes where id = m.versao_atual_id)
      using errcode = 'check_violation';
  end if;
  select coalesce(max(numero), 0) + 1 into n from termos_versoes where modelo_id = m.id;
  insert into termos_versoes (modelo_id, numero, nome, conteudo_html, sha256, declaracoes,
                              observacao, publicada_por)
  values (m.id, n, m.nome, m.rascunho_html, termo_sha256(m.rascunho_html), m.declaracoes,
          nullif(btrim(coalesce(p_observacao, '')), ''), usuario_atual_id())
  returning * into v;
  update termos_modelos set versao_atual_id = v.id, atualizado_por = usuario_atual_id()
   where id = m.id;
  return v;
end;
$$;

-- PDF da versao GERAL (Regimento etc.), gravado uma vez pelo servidor.
create or replace function anexar_pdf_versao_termo(p_versao_id uuid, p_path text, p_sha256 text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not (perfil_pode('termos_modelos', 'criar')
                                     or perfil_pode('termos_modelos', 'editar')) then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;
  update termos_versoes set pdf_path = p_path, pdf_sha256 = p_sha256
   where id = p_versao_id and pdf_path is null;
end;
$$;

-- ----------------------------------------------------------------------------
-- (E) Emissao
-- ----------------------------------------------------------------------------
-- O HTML chega ja preenchido pela tela (src/lib/termos.ts). O protocolo nasce
-- aqui e entra no lugar da marca {{PROTOCOLO_DO_TERMO}} ANTES do hash.
create or replace function registrar_termo_emitido(
  p_versao_id     uuid,
  p_cliente_id    uuid,
  p_veiculo_id    uuid,
  p_html          text,
  p_campos_vazios text[] default '{}',
  p_visivel_portal boolean default null
)
returns termos_emitidos
language plpgsql security definer set search_path = public
as $$
declare
  v   termos_versoes;
  m   termos_modelos;
  c   clientes;
  vei veiculos;
  reg uuid;
  e   termos_emitidos;
  html text;
begin
  if not perfil_pode('termos', 'criar') then
    raise exception 'Seu perfil nao emite termos.' using errcode = 'insufficient_privilege';
  end if;
  select * into v from termos_versoes where id = p_versao_id;
  if not found then
    raise exception 'Versao do termo nao encontrada.' using errcode = 'no_data_found';
  end if;
  select * into m from termos_modelos where id = v.modelo_id;
  if not m.ativo then
    raise exception 'Este termo esta inativo.' using errcode = 'check_violation';
  end if;
  select * into c from clientes where id = p_cliente_id;
  if not found then
    raise exception 'Associado nao encontrado.' using errcode = 'no_data_found';
  end if;
  if p_veiculo_id is not null then
    select * into vei from veiculos where id = p_veiculo_id;
    if not found or vei.cliente_id <> c.id then
      raise exception 'O veiculo nao e deste associado.' using errcode = 'check_violation';
    end if;
  end if;
  reg := coalesce(vei.regional_id, c.regional_id);
  if not (tem_acesso_global() or (reg is not null and pode_regional(reg))) then
    raise exception 'Este associado e de outra unidade.' using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_html, '')) = '' then
    raise exception 'Termo vazio.' using errcode = 'check_violation';
  end if;

  -- o protocolo nasce antes e entra no texto ANTES do hash
  e.protocolo := proximo_protocolo_termo();
  html := replace(p_html, '{{PROTOCOLO_DO_TERMO}}', e.protocolo);

  insert into termos_emitidos (protocolo, modelo_id, versao_id, cliente_id, veiculo_id, regional_id,
                               titulo, conteudo_html, html_sha256, campos_vazios,
                               visivel_portal, emitido_por)
  values (e.protocolo, m.id, v.id, c.id, p_veiculo_id, reg, v.nome, html, termo_sha256(html),
          coalesce(p_campos_vazios, '{}'), coalesce(p_visivel_portal, m.visivel_portal),
          usuario_atual_id())
  returning * into e;
  return e;
end;
$$;

-- Quem pode mexer num termo emitido (para as RPCs e para a rota do PDF).
create or replace function pode_ver_termo_emitido(p_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from termos_emitidos e
     where e.id = p_id
       and (tem_acesso_global()
            or (is_staff() and e.regional_id is not null and pode_regional(e.regional_id))
            or (e.cliente_id = auth_cliente_id() and e.visivel_portal and e.situacao <> 'CANCELADO'))
  );
$$;

create or replace function anexar_pdf_termo(p_id uuid, p_path text, p_sha256 text, p_bytes int)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not (perfil_pode('termos', 'criar') and pode_ver_termo_emitido(p_id)) then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;
  update termos_emitidos set pdf_path = p_path, pdf_sha256 = p_sha256, pdf_bytes = p_bytes
   where id = p_id and pdf_path is null;
end;
$$;

create or replace function cancelar_termo_emitido(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (perfil_pode('termos', 'cancelar') and pode_ver_termo_emitido(p_id)) then
    raise exception 'Seu perfil nao cancela termos.' using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'check_violation';
  end if;
  update termos_emitidos
     set situacao = 'CANCELADO', cancelado_por = usuario_atual_id(), cancelado_em = now(),
         cancelamento_motivo = btrim(p_motivo), visivel_portal = false
   where id = p_id and situacao <> 'CANCELADO';
end;
$$;

create or replace function portal_termo_emitido(p_id uuid, p_visivel boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (perfil_pode('termos', 'criar') and pode_ver_termo_emitido(p_id)) then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;
  update termos_emitidos set visivel_portal = coalesce(p_visivel, false)
   where id = p_id and situacao <> 'CANCELADO';
end;
$$;

-- ----------------------------------------------------------------------------
-- (F) Portal do associado
-- ----------------------------------------------------------------------------
create or replace function portal_documentos()
returns table (
  origem      text,      -- EMITIDO | GERAL
  id          uuid,      -- termos_emitidos.id ou termos_versoes.id
  titulo      text,
  tipo        text,
  protocolo   text,
  placa       text,
  data        timestamptz,
  tem_pdf     boolean
)
language sql stable security definer set search_path = public
as $$
  select 'EMITIDO', e.id, e.titulo, m.tipo, e.protocolo, v.placa, e.emitido_em, e.pdf_path is not null
    from termos_emitidos e
    join termos_modelos m on m.id = e.modelo_id
    left join veiculos v on v.id = e.veiculo_id
   where auth_cliente_id() is not null
     and e.cliente_id = auth_cliente_id() and e.visivel_portal and e.situacao <> 'CANCELADO'
  union all
  select 'GERAL', x.id, x.nome, m.tipo, null, null, x.publicada_em, x.pdf_path is not null
    from termos_modelos m
    join termos_versoes x on x.id = m.versao_atual_id
   where auth_cliente_id() is not null
     and m.escopo = 'GERAL' and m.visivel_portal and m.ativo
  order by 7 desc;
$$;

-- ----------------------------------------------------------------------------
-- Rito da 0052
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
