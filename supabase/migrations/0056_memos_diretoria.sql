-- ============================================================================
-- SCar :: 0056_memos_diretoria.sql
--
-- O MURAL PASSA A TER MAO DUPLA — e para de gritar para quem nao interessa.
--
-- (A) A FRANQUIA FALA COM A MATRIZ. Ate aqui o gestor so publicava para a
--     PROPRIA unidade: dava para avisar a equipe dele, nao para mandar um
--     recado a diretoria ("faltou material", "duvida sobre a regra nova").
--     Agora ha dois destinos, e so dois:
--       . MINHA EQUIPE  -> `regional_id` = a unidade dele;
--       . DIRETORIA     -> `regional_id` nulo + `papeis` dentro de
--                          {admin, financeiro} — a administracao da matriz.
--     Continua barrado: publicar para a unidade VIZINHA, ou soltar aviso
--     geral para o sistema inteiro (isso e da matriz).
--
-- (B) O MURAL PESSOAL DEIXA DE SER UM DESPEJO. `memos_do_usuario` mandava
--     TODO memo de TODA unidade para admin/financeiro (`or tem_acesso_global()`).
--     Com nove franquias publicando aviso interno, a diretoria abriria o SAC
--     com dezenas de recados que nao sao dela — e o mural perde a serventia
--     justamente para quem precisa dele. O mural agora e o que foi ENDEREÇADO
--     a pessoa; para acompanhar tudo existe a tela da gestao.
--
-- (C) `memos_gestao` ganha escopo: a matriz ve tudo; o gestor ve o que e da
--     unidade dele MAIS o que ele proprio enviou (inclusive a diretoria).
-- ============================================================================

-- Papeis que formam a "diretoria / administracao" para efeito de comunicado.
create or replace function papeis_diretoria()
returns text[]
language sql
immutable
as $$ select array['admin', 'financeiro']::text[]; $$;

comment on function papeis_diretoria() is
  'Destino "diretoria" do mural: a administracao da matriz.';

-- ----------------------------------------------------------------------------
-- (B) Mural pessoal: o que foi endereçado A MIM
-- ----------------------------------------------------------------------------
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
     -- ENDEREÇAMENTO (0056): unidade + papel. Sem atalho para acesso global —
     -- o mural e o que e da pessoa, nao o arquivo de tudo que se publicou.
     and (m.regional_id is null or m.regional_id is not distinct from eu.regional_id)
     and (m.papeis is null or cardinality(m.papeis) = 0 or eu.papel = any(m.papeis))
     and (p_incluir_lidos or l.usuario_id is null)
   order by
     (m.exige_leitura and l.usuario_id is null) desc,
     case m.prioridade when 'ALTA' then 1 when 'MEDIA' then 2 else 3 end,
     m.publicado_em desc
   limit greatest(coalesce(p_limite, 20), 1);
$$;

comment on function memos_do_usuario(boolean, integer) is
  'Mural do atendente: SO o que foi endereçado a ele (unidade + papel). Ver tudo e na tela da gestao.';

-- ----------------------------------------------------------------------------
-- (A) Publicar: a franquia ganha o destino "diretoria"
-- ----------------------------------------------------------------------------
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
declare
  m           memos;
  v_papeis    text[] := nullif(p_papeis, '{}');
  para_direcao boolean;
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

  -- Quem NAO e da matriz tem dois destinos possiveis, e so dois.
  if not tem_acesso_global() then
    para_direcao := p_regional_id is null
                    and v_papeis is not null
                    and v_papeis <@ papeis_diretoria();

    if not para_direcao and (p_regional_id is null or not pode_regional(p_regional_id)) then
      raise exception
        'Voce publica para a sua unidade ou para a diretoria (papeis %)',
        array_to_string(papeis_diretoria(), ', ');
    end if;
  end if;

  if p_id is null then
    insert into memos (titulo, mensagem, categoria, prioridade, exige_leitura,
                       regional_id, papeis, expira_em, publicado, publicado_por)
      values (btrim(p_titulo), btrim(p_mensagem), p_categoria, p_prioridade, p_exige_leitura,
              p_regional_id, v_papeis, p_expira_em, p_publicado, auth.uid())
      returning * into m;
  else
    -- Editar so o que e seu (ou qualquer um, se for da matriz).
    update memos
       set titulo = btrim(p_titulo), mensagem = btrim(p_mensagem),
           categoria = p_categoria, prioridade = p_prioridade,
           exige_leitura = p_exige_leitura, regional_id = p_regional_id,
           papeis = v_papeis, expira_em = p_expira_em, publicado = p_publicado
     where id = p_id
       and (tem_acesso_global() or publicado_por = auth.uid() or pode_regional(regional_id))
     returning * into m;
    if m.id is null then
      raise exception 'Comunicado nao encontrado ou fora do seu alcance';
    end if;
  end if;

  return m;
end;
$$;

-- ----------------------------------------------------------------------------
-- (C) A lista da gestao, com escopo
-- ----------------------------------------------------------------------------
-- `memos_gestao` ganha a coluna `meu` — muda a lista de OUT, entao e drop +
-- create (o `create or replace` recusa: "cannot change return type").
drop function if exists memos_gestao(integer);
create or replace function memos_gestao(p_limite integer default 100)
returns table (
  id uuid, titulo text, mensagem text, categoria text, prioridade text,
  exige_leitura boolean, publicado boolean, publicado_em timestamptz, expira_em date,
  regional_id uuid, regional text, papeis text[], autor text,
  leituras integer, destinatarios integer, meu boolean
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
         m.publicado_por = auth.uid()
    from memos m
    left join usuarios  a   on a.id  = m.publicado_por
    left join regionais reg on reg.id = m.regional_id
   where pode_publicar_memo()
     -- matriz ve tudo; a franquia ve o que e da unidade dela e o que ela enviou
     and (tem_acesso_global()
          or pode_regional(m.regional_id)
          or m.publicado_por = auth.uid())
   order by m.publicado desc, m.publicado_em desc
   limit greatest(coalesce(p_limite, 100), 1);
$$;

grant execute on function papeis_diretoria() to authenticated, service_role;
grant execute on function memos_gestao(integer) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Rito da 0052: funcao nova nasce com `execute` para PUBLIC (embutido no
-- Postgres). Toda migration que cria funcao fecha a porta no fim do arquivo.
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to service_role;
