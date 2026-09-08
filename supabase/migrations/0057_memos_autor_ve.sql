-- ============================================================================
-- SCar :: 0057_memos_autor_ve.sql
--
-- QUEM PUBLICA PRECISA VER O QUE PUBLICOU.
--
-- Sintoma: "fiz um comunicado de teste e ele nao apareceu na tela".
-- Causa: a 0056 tirou o `or tem_acesso_global()` de `memos_do_usuario` (certo:
-- o mural virou o que foi ENDEREÇADO a pessoa, e nao o despejo de nove
-- franquias). So que a regra passou a valer tambem para o AUTOR — entao a
-- matriz que endereça um aviso a UMA unidade, ou a um PAPEL que nao e o dela,
-- publica e nao ve nada; e o gestor que manda um recado a diretoria tambem nao.
-- Sem retorno na tela, a unica leitura possivel e "o sistema esta quebrado".
--
-- Correcao: o autor sempre ve o proprio comunicado, marcado como `meu`, com o
-- destino ao lado ("voce publicou · Cuiaba"). O mural continua enxuto — quem
-- nao publicou so recebe o que e dele.
--
-- A lista de OUT muda (entram `papeis` e `meu`), entao e drop + create: o
-- `create or replace` recusa com "cannot change return type" (gotcha conhecido).
-- ============================================================================

drop function if exists memos_do_usuario(boolean, integer);
create or replace function memos_do_usuario(
  p_incluir_lidos boolean default true,
  p_limite        integer default 20
)
returns table (
  id uuid, titulo text, mensagem text, categoria text, prioridade text,
  exige_leitura boolean, publicado_em timestamptz, expira_em date,
  autor text, regional text, lido boolean, lido_em timestamptz,
  pendente_ciencia boolean, papeis text[], meu boolean
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
         m.publicado_por = eu.id
    from memos m
    cross join eu
    left join usuarios  a   on a.id  = m.publicado_por
    left join regionais reg on reg.id = m.regional_id
    left join memo_leituras l on l.memo_id = m.id and l.usuario_id = eu.id
   where m.publicado
     and (m.expira_em is null or m.expira_em >= current_date)
     -- ENDEREÇAMENTO: unidade + papel (0056) — ou o proprio autor (0057).
     and (
       m.publicado_por = eu.id
       or (
         (m.regional_id is null or m.regional_id is not distinct from eu.regional_id)
         and (m.papeis is null or cardinality(m.papeis) = 0 or eu.papel = any(m.papeis))
       )
     )
     and (p_incluir_lidos or l.usuario_id is null)
   order by
     (m.exige_leitura and l.usuario_id is null) desc,
     case m.prioridade when 'ALTA' then 1 when 'MEDIA' then 2 else 3 end,
     m.publicado_em desc
   limit greatest(coalesce(p_limite, 20), 1);
$$;

comment on function memos_do_usuario(boolean, integer) is
  'Mural do atendente: o que foi endereçado a ele (unidade + papel) mais o que ele mesmo publicou.';

-- ----------------------------------------------------------------------------
-- Rito de seguranca (0052): funcao nasce com EXECUTE para PUBLIC.
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
