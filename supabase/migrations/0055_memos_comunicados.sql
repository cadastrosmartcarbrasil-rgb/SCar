-- ============================================================================
-- SCar :: 0055_memos_comunicados.sql
--
-- MURAL INTERNO — a Central do Atendente.
--
-- A tela do SAC nasce vazia: enquanto ninguem foi buscado, o maior espaco do
-- sistema fica sem uso enquanto a equipe precisa de tres coisas justamente
-- nesse momento — o que ESTA na mao dela (protocolos), o que a gestao MANDOU
-- (comunicado, script de atendimento, aviso urgente) e o que esta PEGANDO
-- FOGO agora (24h em aberto). Este arquivo entrega a segunda parte.
--
--   (A) `memos` — o comunicado publicado pela gestao. Endereçavel: por unidade
--       (`regional_id` nulo = todas) e por papel (`papeis` nulo/vazio = todos).
--       `exige_leitura` marca o que a pessoa precisa dar ciencia.
--   (B) `memo_leituras` — quem deu ciencia e quando. Append-only na pratica:
--       ninguem "desle" um comunicado.
--   (C) RPCs: `memos_do_usuario()` (o mural de quem esta logado, ja com o
--       `lido`), `marcar_memo_lido()`, e o lado da gestao — `salvar_memo()`,
--       `memos_gestao()` (com quantos leram) e `arquivar_memo()`.
--
-- `categoria` e `prioridade` sao TEXTO com CHECK, nao enum: a lista vai crescer
-- (a gestao sempre inventa uma categoria nova) e enum novo nao pode ser usado
-- na mesma transacao em que nasce — gotcha ja conhecido (0026/0028/0048).
-- ============================================================================

create table if not exists memos (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  mensagem       text not null,
  categoria      text not null default 'COMUNICADO',
  prioridade     text not null default 'MEDIA',
  exige_leitura  boolean not null default false,
  publicado      boolean not null default true,
  -- endereçamento: nulo = todo mundo
  regional_id    uuid references regionais(id) on delete cascade,
  papeis         text[],
  expira_em      date,
  publicado_por  uuid references usuarios(id) on delete set null,
  publicado_em   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_memo_categoria') then
    alter table memos add constraint chk_memo_categoria
      check (categoria in ('COMUNICADO', 'SCRIPT', 'URGENTE'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_memo_prioridade') then
    alter table memos add constraint chk_memo_prioridade
      check (prioridade in ('BAIXA', 'MEDIA', 'ALTA'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_memo_titulo') then
    alter table memos add constraint chk_memo_titulo
      check (btrim(titulo) <> '' and btrim(mensagem) <> '');
  end if;
end $$;

create index if not exists idx_memos_mural on memos (publicado, publicado_em desc);
create index if not exists idx_memos_regional on memos (regional_id) where regional_id is not null;

comment on table memos is
  'Comunicados da gestao para a equipe (mural da Central do Atendente).';
comment on column memos.papeis is
  'Papeis destinatarios; nulo ou vazio = todos. Ex.: {sinistro,assistencia_24h}.';
comment on column memos.exige_leitura is
  'Comunicado de ciencia obrigatoria: fica em destaque ate a pessoa marcar como lido.';

drop trigger if exists trg_memos_updated on memos;
create trigger trg_memos_updated before update on memos
  for each row execute function set_updated_at();

create table if not exists memo_leituras (
  memo_id    uuid not null references memos(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  lido_em    timestamptz not null default now(),
  primary key (memo_id, usuario_id)
);
create index if not exists idx_memo_leituras_usuario on memo_leituras (usuario_id);

comment on table memo_leituras is
  'Ciencia do comunicado. Ninguem "desle": nao ha update nem delete pela aplicacao.';

-- ============================================================================
-- Quem publica comunicado
--   matriz (admin/financeiro) publica para qualquer unidade;
--   gestor regional publica para a PROPRIA unidade (aviso de operacao local).
-- ============================================================================
create or replace function pode_publicar_memo()
returns boolean
language sql
stable
as $$
  select tem_acesso_global() or auth_papel()::text = 'gestor_regional';
$$;

alter table memos          enable row level security;
alter table memo_leituras  enable row level security;

drop policy if exists memos_select on memos;
create policy memos_select on memos for select to authenticated using (is_staff());

drop policy if exists memos_write on memos;
create policy memos_write on memos for all to authenticated
  using (pode_publicar_memo() and (regional_id is null or pode_regional(regional_id)))
  with check (pode_publicar_memo() and (regional_id is null or pode_regional(regional_id)));

-- Cada um marca a PROPRIA leitura; a gestao le todas (para saber quem falta).
drop policy if exists memo_leit_select on memo_leituras;
create policy memo_leit_select on memo_leituras for select to authenticated
  using (usuario_id = auth.uid() or pode_publicar_memo());

drop policy if exists memo_leit_insert on memo_leituras;
create policy memo_leit_insert on memo_leituras for insert to authenticated
  with check (usuario_id = auth.uid() and is_staff());

grant select, insert, update, delete on memos to authenticated;
grant select, insert on memo_leituras to authenticated;

-- ============================================================================
-- O MURAL de quem esta logado
-- ============================================================================
create or replace function memos_do_usuario(
  p_incluir_lidos boolean default true,
  p_limite        integer default 20
)
returns table (
  id uuid, titulo text, mensagem text, categoria text, prioridade text,
  exige_leitura boolean, publicado_em timestamptz, expira_em date,
  autor text, regional text, lido boolean, lido_em timestamptz,
  pendente_ciencia boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with eu as (
    select u.id, u.papel::text as papel, u.regional_id
      from usuarios u where u.id = auth.uid()
  )
  select m.id, m.titulo, m.mensagem, m.categoria, m.prioridade,
         m.exige_leitura, m.publicado_em, m.expira_em,
         coalesce(a.nome, 'Gestao'), reg.nome,
         l.usuario_id is not null, l.lido_em,
         m.exige_leitura and l.usuario_id is null
    from memos m
    cross join eu
    left join usuarios  a   on a.id  = m.publicado_por
    left join regionais reg on reg.id = m.regional_id
    left join memo_leituras l on l.memo_id = m.id and l.usuario_id = eu.id
   where m.publicado
     and (m.expira_em is null or m.expira_em >= current_date)
     -- endereçamento: unidade e papel
     and (m.regional_id is null or m.regional_id = eu.regional_id or tem_acesso_global())
     and (m.papeis is null or cardinality(m.papeis) = 0 or eu.papel = any(m.papeis))
     and (p_incluir_lidos or l.usuario_id is null)
   order by
     -- o que exige ciencia e nao foi lido vem primeiro; depois prioridade e data
     (m.exige_leitura and l.usuario_id is null) desc,
     case m.prioridade when 'ALTA' then 1 when 'MEDIA' then 2 else 3 end,
     m.publicado_em desc
   limit greatest(coalesce(p_limite, 20), 1);
$$;

comment on function memos_do_usuario(boolean, integer) is
  'Mural do atendente: comunicados vigentes para a unidade e o papel dele, ja com a ciencia.';

create or replace function marcar_memo_lido(p_memo_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'Somente a equipe da ciencia em comunicado';
  end if;
  if not exists (select 1 from memos m where m.id = p_memo_id and m.publicado) then
    raise exception 'Comunicado nao encontrado';
  end if;

  insert into memo_leituras (memo_id, usuario_id) values (p_memo_id, auth.uid())
    on conflict (memo_id, usuario_id) do nothing;
  return true;
end;
$$;

-- ============================================================================
-- O lado da GESTAO
-- ============================================================================
create or replace function salvar_memo(
  p_titulo        text,
  p_mensagem      text,
  p_categoria     text default 'COMUNICADO',
  p_prioridade    text default 'MEDIA',
  p_exige_leitura boolean default false,
  p_regional_id   uuid default null,
  p_papeis        text[] default null,
  p_expira_em     date default null,
  p_publicado     boolean default true,
  p_id            uuid default null
)
returns memos
language plpgsql
security definer
set search_path = public
as $$
declare m memos;
begin
  if not pode_publicar_memo() then
    raise exception 'Somente a gestao publica comunicados';
  end if;
  if coalesce(btrim(p_titulo), '') = '' or coalesce(btrim(p_mensagem), '') = '' then
    raise exception 'Informe o titulo e a mensagem do comunicado';
  end if;
  if p_categoria not in ('COMUNICADO', 'SCRIPT', 'URGENTE') then
    raise exception 'Categoria invalida: %', p_categoria;
  end if;
  if p_prioridade not in ('BAIXA', 'MEDIA', 'ALTA') then
    raise exception 'Prioridade invalida: %', p_prioridade;
  end if;

  -- O gestor de unidade publica SO para a unidade dele; a matriz escolhe.
  if not tem_acesso_global() then
    if p_regional_id is null or not pode_regional(p_regional_id) then
      raise exception 'Voce so publica comunicado para a sua unidade';
    end if;
  end if;

  if p_id is null then
    insert into memos (titulo, mensagem, categoria, prioridade, exige_leitura,
                       regional_id, papeis, expira_em, publicado, publicado_por)
      values (btrim(p_titulo), btrim(p_mensagem), p_categoria, p_prioridade, p_exige_leitura,
              p_regional_id, nullif(p_papeis, '{}'), p_expira_em, p_publicado, auth.uid())
      returning * into m;
  else
    update memos
       set titulo = btrim(p_titulo), mensagem = btrim(p_mensagem),
           categoria = p_categoria, prioridade = p_prioridade,
           exige_leitura = p_exige_leitura, regional_id = p_regional_id,
           papeis = nullif(p_papeis, '{}'), expira_em = p_expira_em, publicado = p_publicado
     where id = p_id
     returning * into m;
    if m.id is null then raise exception 'Comunicado nao encontrado'; end if;
  end if;

  return m;
end;
$$;

create or replace function arquivar_memo(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not pode_publicar_memo() then
    raise exception 'Somente a gestao arquiva comunicados';
  end if;
  update memos set publicado = false where id = p_id;
  return found;
end;
$$;

/** Lista da gestao: o comunicado + quantos ja deram ciencia. */
create or replace function memos_gestao(p_limite integer default 100)
returns table (
  id uuid, titulo text, mensagem text, categoria text, prioridade text,
  exige_leitura boolean, publicado boolean, publicado_em timestamptz, expira_em date,
  regional_id uuid, regional text, papeis text[], autor text,
  leituras integer, destinatarios integer
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.titulo, m.mensagem, m.categoria, m.prioridade,
         m.exige_leitura, m.publicado, m.publicado_em, m.expira_em,
         m.regional_id, reg.nome, m.papeis, coalesce(a.nome, 'Gestao'),
         (select count(*)::int from memo_leituras l where l.memo_id = m.id),
         (select count(*)::int from usuarios u
           where u.ativo
             and (m.regional_id is null or u.regional_id = m.regional_id)
             and (m.papeis is null or cardinality(m.papeis) = 0 or u.papel::text = any(m.papeis)))
    from memos m
    left join usuarios  a   on a.id  = m.publicado_por
    left join regionais reg on reg.id = m.regional_id
   where pode_publicar_memo()
     and (tem_acesso_global() or m.regional_id is null or pode_regional(m.regional_id))
   order by m.publicado desc, m.publicado_em desc
   limit greatest(coalesce(p_limite, 100), 1);
$$;

grant execute on function memos_do_usuario(boolean, integer) to authenticated, service_role;
grant execute on function marcar_memo_lido(uuid) to authenticated, service_role;
grant execute on function salvar_memo(text, text, text, text, boolean, uuid, text[], date, boolean, uuid) to authenticated, service_role;
grant execute on function arquivar_memo(uuid) to authenticated, service_role;
grant execute on function memos_gestao(integer) to authenticated, service_role;
grant execute on function pode_publicar_memo() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Rito da 0052: funcao nova nasce com `execute` para PUBLIC (embutido no
-- Postgres). Toda migration que cria funcao fecha a porta no fim do arquivo.
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to service_role;
