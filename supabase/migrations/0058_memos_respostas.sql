-- ============================================================================
-- SCar :: 0058_memos_respostas.sql
--
-- O COMUNICADO VIRA CONVERSA.
--
-- Ate aqui o mural so ia de ida: a matriz publicava, a pessoa lia e dava
-- ciencia. Mas o uso real e outro — a matriz manda um recado ao Marcio, gestor
-- de uma unidade, e ele PRECISA devolver ali mesmo ("ja resolvi", "falta o
-- material", "quem autoriza?"), com a matriz respondendo de volta. Sem isso a
-- resposta sai do sistema e vai para o WhatsApp, onde ninguem mais acha.
--
-- COMO A CONVERSA E RECORTADA (esta e a decisao que importa)
-- Um comunicado pode ir para dezenas de pessoas. Se a resposta fosse um mural
-- unico, o desabafo do gestor de Cuiaba sobre a unidade dele seria lido pelas
-- outras oito — e ninguem responderia mais nada. Entao cada destinatario tem a
-- SUA conversa com quem publicou:
--   . `com_usuario_id` = o lado destinatario, fixo na linha inteira do papo;
--   . o destinatario ve so a conversa dele;
--   . quem publicou (e a matriz) ve todas, uma por pessoa, e responde em cada.
--
-- `memo_visivel_para()` responde "esse comunicado e dessa pessoa?" e passa a
-- ser a UNICA definicao de endereçamento — a mesma que o mural usa e a que
-- autoriza responder. De proposito ela NAO olha `publicado`/`expira_em`: a
-- conversa nao pode sumir no meio so porque o aviso venceu.
-- ============================================================================

create table if not exists memo_respostas (
  id             uuid primary key default gen_random_uuid(),
  memo_id        uuid not null references memos(id) on delete cascade,
  -- o lado DESTINATARIO da conversa (nao muda; e o que separa um papo do outro)
  com_usuario_id uuid not null references usuarios(id) on delete cascade,
  autor_id       uuid not null references usuarios(id) on delete cascade,
  mensagem       text not null,
  lida_em        timestamptz,
  created_at     timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_memo_resposta_texto') then
    alter table memo_respostas add constraint chk_memo_resposta_texto
      check (btrim(mensagem) <> '');
  end if;
end $$;

create index if not exists idx_memo_respostas_conversa
  on memo_respostas (memo_id, com_usuario_id, created_at);
create index if not exists idx_memo_respostas_autor on memo_respostas (autor_id);

comment on table memo_respostas is
  'Resposta ao comunicado. Uma conversa por destinatario (com_usuario_id) com quem publicou.';
comment on column memo_respostas.com_usuario_id is
  'O destinatario dono da conversa — nao e o autor da mensagem: quem publicou tambem escreve aqui.';

-- ----------------------------------------------------------------------------
-- A definicao UNICA de "este comunicado e desta pessoa?"
-- ----------------------------------------------------------------------------
create or replace function memo_visivel_para(p_memo_id uuid, p_usuario_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from memos m
      join usuarios u on u.id = p_usuario_id
     where m.id = p_memo_id
       and (
         m.publicado_por = u.id                       -- o autor sempre ve o que publicou (0057)
         or (
           (m.regional_id is null or m.regional_id is not distinct from u.regional_id)
           and (m.papeis is null or cardinality(m.papeis) = 0 or u.papel::text = any(m.papeis))
         )
       )
  );
$$;

comment on function memo_visivel_para(uuid, uuid) is
  'Endereçamento do comunicado (unidade + papel, ou o proprio autor). Ignora publicado/expira_em de proposito: a conversa sobrevive ao aviso.';

-- ----------------------------------------------------------------------------
-- Responder
-- ----------------------------------------------------------------------------
create or replace function responder_memo(
  p_memo_id     uuid,
  p_mensagem    text,
  p_com_usuario uuid default null   -- nulo = respondo NA MINHA conversa
)
returns memo_respostas
language plpgsql
security definer
set search_path = public
as $$
declare
  m   memos;
  r   memo_respostas;
  eu  uuid := auth.uid();
  com uuid;
begin
  if not is_staff() then raise exception 'Somente a equipe responde comunicado'; end if;
  if coalesce(btrim(p_mensagem), '') = '' then raise exception 'Escreva a resposta'; end if;

  select * into m from memos where id = p_memo_id;
  if m.id is null then raise exception 'Comunicado nao encontrado'; end if;

  com := coalesce(p_com_usuario, eu);

  if com = eu then
    -- respondendo na propria conversa: preciso ter recebido o comunicado
    if not memo_visivel_para(p_memo_id, eu) then
      raise exception 'Este comunicado nao foi endereçado a voce';
    end if;
    -- o autor tambem "recebe" o proprio memo (0057) — mas responder a si mesmo
    -- nao e conversa nenhuma: ele precisa dizer com QUEM esta falando.
    if m.publicado_por = eu and p_com_usuario is null then
      raise exception 'Escolha a conversa que voce quer responder';
    end if;
  else
    -- falar DENTRO da conversa de outra pessoa e de quem publicou (ou da matriz)
    if not (m.publicado_por = eu or tem_acesso_global()) then
      raise exception 'Somente quem publicou o comunicado responde nesta conversa';
    end if;
    if not memo_visivel_para(p_memo_id, com) then
      raise exception 'Essa pessoa nao recebeu este comunicado';
    end if;
  end if;

  insert into memo_respostas (memo_id, com_usuario_id, autor_id, mensagem)
    values (p_memo_id, com, eu, btrim(p_mensagem))
    returning * into r;

  return r;
end;
$$;

comment on function responder_memo(uuid, text, uuid) is
  'Responde o comunicado. Sem p_com_usuario responde na propria conversa; com ele, quem publicou responde a conversa daquela pessoa.';

-- ----------------------------------------------------------------------------
-- Ler: as conversas (visao de quem publicou) e as mensagens de uma delas
-- ----------------------------------------------------------------------------
create or replace function memo_conversas(p_memo_id uuid)
returns table (
  com_usuario_id uuid, pessoa text, papel text, unidade text,
  mensagens integer, nao_lidas integer,
  ultima_mensagem text, ultima_em timestamptz, ultima_minha boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with eu as (select auth.uid() as id),
  base as (
    select r.*
      from memo_respostas r
      join memos m on m.id = r.memo_id
      cross join eu
     where r.memo_id = p_memo_id
       and is_staff()
       -- quem publicou (e a matriz) ve todas as conversas; os demais, so a sua
       and (m.publicado_por = eu.id or tem_acesso_global() or r.com_usuario_id = eu.id)
  )
  select b.com_usuario_id, u.nome, u.papel::text, reg.nome,
         count(*)::int,
         count(*) filter (where b.autor_id <> (select id from eu) and b.lida_em is null)::int,
         (array_agg(b.mensagem  order by b.created_at desc))[1],
         max(b.created_at),
         (array_agg(b.autor_id  order by b.created_at desc))[1] = (select id from eu)
    from base b
    join usuarios u on u.id = b.com_usuario_id
    left join regionais reg on reg.id = u.regional_id
   group by b.com_usuario_id, u.nome, u.papel, reg.nome
   order by max(b.created_at) desc;
$$;

comment on function memo_conversas(uuid) is
  'Conversas de um comunicado: todas para quem publicou, so a propria para os demais.';

create or replace function memo_mensagens(
  p_memo_id     uuid,
  p_com_usuario uuid default null   -- nulo = a minha conversa
)
returns table (
  id uuid, autor_id uuid, autor text, minha boolean,
  mensagem text, lida_em timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with eu as (select auth.uid() as id)
  select r.id, r.autor_id, coalesce(a.nome, 'Gestao'), r.autor_id = eu.id,
         r.mensagem, r.lida_em, r.created_at
    from memo_respostas r
    join memos m on m.id = r.memo_id
    cross join eu
    left join usuarios a on a.id = r.autor_id
   where r.memo_id = p_memo_id
     and r.com_usuario_id = coalesce(p_com_usuario, eu.id)
     and is_staff()
     and (m.publicado_por = eu.id or tem_acesso_global() or r.com_usuario_id = eu.id)
   order by r.created_at;
$$;

create or replace function marcar_conversa_lida(
  p_memo_id     uuid,
  p_com_usuario uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  eu  uuid := auth.uid();
  com uuid := coalesce(p_com_usuario, auth.uid());
  n   integer;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  update memo_respostas r
     set lida_em = now()
    from memos m
   where m.id = r.memo_id
     and r.memo_id = p_memo_id
     and r.com_usuario_id = com
     and r.autor_id <> eu
     and r.lida_em is null
     and (m.publicado_por = eu or tem_acesso_global() or r.com_usuario_id = eu);

  get diagnostics n = row_count;
  return n;
end;
$$;

-- ----------------------------------------------------------------------------
-- RLS: leitura pela propria conversa ou por quem publicou. Escrita so por RPC.
-- ----------------------------------------------------------------------------
alter table memo_respostas enable row level security;

drop policy if exists memo_resp_select on memo_respostas;
create policy memo_resp_select on memo_respostas for select to authenticated
  using (
    is_staff() and (
      com_usuario_id = auth.uid()
      or tem_acesso_global()
      or exists (select 1 from memos m where m.id = memo_id and m.publicado_por = auth.uid())
    )
  );

grant select on memo_respostas to authenticated;

-- ----------------------------------------------------------------------------
-- O mural e a tela da gestao passam a mostrar que ha conversa
-- (entram colunas de OUT nas duas — drop + create)
-- ----------------------------------------------------------------------------
drop function if exists memos_do_usuario(boolean, integer);
create or replace function memos_do_usuario(
  p_incluir_lidos boolean default true,
  p_limite        integer default 20
)
returns table (
  id uuid, titulo text, mensagem text, categoria text, prioridade text,
  exige_leitura boolean, publicado_em timestamptz, expira_em date,
  autor text, regional text, lido boolean, lido_em timestamptz,
  pendente_ciencia boolean, papeis text[], meu boolean,
  respostas integer, respostas_nao_lidas integer
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
         m.exige_leitura and l.usuario_id is null,
         m.papeis,
         m.publicado_por = eu.id,
         -- a conversa que aparece no mural e a DA PESSOA; para quem publicou, a
         -- soma de todas (o retorno dos outros e o que ele espera ver)
         (select count(*)::int from memo_respostas r
           where r.memo_id = m.id
             and (case when m.publicado_por = eu.id then true
                       else r.com_usuario_id = eu.id end)),
         (select count(*)::int from memo_respostas r
           where r.memo_id = m.id
             and r.autor_id <> eu.id and r.lida_em is null
             and (case when m.publicado_por = eu.id then true
                       else r.com_usuario_id = eu.id end))
    from memos m
    cross join eu
    left join usuarios  a   on a.id  = m.publicado_por
    left join regionais reg on reg.id = m.regional_id
    left join memo_leituras l on l.memo_id = m.id and l.usuario_id = eu.id
   where m.publicado
     and (m.expira_em is null or m.expira_em >= current_date)
     and memo_visivel_para(m.id, eu.id)
     and (p_incluir_lidos or l.usuario_id is null)
   order by
     (m.exige_leitura and l.usuario_id is null) desc,
     case m.prioridade when 'ALTA' then 1 when 'MEDIA' then 2 else 3 end,
     m.publicado_em desc
   limit greatest(coalesce(p_limite, 20), 1);
$$;

comment on function memos_do_usuario(boolean, integer) is
  'Mural: o que foi endereçado a pessoa (ou publicado por ela), ja com a conversa e o que falta ler.';

drop function if exists memos_gestao(integer);
create or replace function memos_gestao(p_limite integer default 100)
returns table (
  id uuid, titulo text, mensagem text, categoria text, prioridade text,
  exige_leitura boolean, publicado boolean, publicado_em timestamptz, expira_em date,
  regional_id uuid, regional text, papeis text[], autor text,
  leituras integer, destinatarios integer, meu boolean,
  conversas integer, respostas integer, respostas_nao_lidas integer
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
             and (m.regional_id is null or u.regional_id is not distinct from m.regional_id)
             and (m.papeis is null or cardinality(m.papeis) = 0 or u.papel::text = any(m.papeis))),
         m.publicado_por = auth.uid(),
         -- as conversas so contam para quem pode LE-LAS (quem publicou e a matriz);
         -- o gestor que apenas recebe um aviso da matriz nao fica sabendo do que
         -- as outras unidades responderam.
         (select count(distinct r.com_usuario_id)::int from memo_respostas r
           where r.memo_id = m.id
             and (m.publicado_por = auth.uid() or tem_acesso_global() or r.com_usuario_id = auth.uid())),
         (select count(*)::int from memo_respostas r
           where r.memo_id = m.id
             and (m.publicado_por = auth.uid() or tem_acesso_global() or r.com_usuario_id = auth.uid())),
         (select count(*)::int from memo_respostas r
           where r.memo_id = m.id and r.autor_id <> auth.uid() and r.lida_em is null
             and (m.publicado_por = auth.uid() or tem_acesso_global() or r.com_usuario_id = auth.uid()))
    from memos m
    left join usuarios  a   on a.id  = m.publicado_por
    left join regionais reg on reg.id = m.regional_id
   where pode_publicar_memo()
     and (tem_acesso_global()
          or pode_regional(m.regional_id)
          or m.publicado_por = auth.uid())
   order by m.publicado desc, m.publicado_em desc
   limit greatest(coalesce(p_limite, 100), 1);
$$;

-- ----------------------------------------------------------------------------
-- Rito de seguranca (0052): funcao nasce com EXECUTE para PUBLIC.
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
