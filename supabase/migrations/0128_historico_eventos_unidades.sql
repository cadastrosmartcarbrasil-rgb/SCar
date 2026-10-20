-- 0128: o historico de eventos do Mutual respeita TODAS as unidades de atuacao.
-- O defeito (20/10/2026): GABRIELA SOUZA RAMOS (papel Eventos, sem unidade, 4 unidades
-- de atuacao marcadas -- 0127) via so GRANDE NATAL em /eventos?aba=historico.
-- eventos_historico_listar filtrava por escopo_regional(null), que para quem nao e da
-- matriz devolve UMA unidade (a do cadastro ou a primeira da lista). Agora: matriz ve
-- tudo; os demais veem as unidades de regionais_do_usuario(); escolher uma unidade
-- filtra so dentro do que a pessoa pode ver. Mesma assinatura.

create or replace function eventos_historico_listar(
  p_busca       text    default null,
  p_tipo        text    default null,
  p_de          date    default null,
  p_ate         date    default null,
  p_regional_id uuid    default null,
  p_limite      integer default 50,
  p_offset      integer default 0,
  p_no_kanban   boolean default null
)
returns table (
  id               uuid,
  cliente_id       uuid,
  associado        text,
  veiculo_id       uuid,
  placa            text,
  protocolo        text,
  data_evento      date,
  data_conclusao   date,
  tipos            text[],
  envolvimento     text,
  valor_total      numeric,
  unidade          text,
  evento_id        uuid,
  evento_protocolo text,
  evento_status    text,
  total_registros  bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with esc as (
    -- quem nao e da matriz ve TODAS as unidades de regionais_do_usuario() (0115/0127);
    -- escopo_regional() devolve uma so, e o time de eventos com 4 unidades via so a primeira
    select (tem_acesso_global() or auth.uid() is null) as global,
           regionais_do_usuario() as lista,
           is_staff() or auth.uid() is null as pode
  ),
  termo as (
    select nullif(texto_sem_acento(lower(trim(coalesce(p_busca, '')))), '') as t,
           nullif(regexp_replace(coalesce(p_busca, ''), '\W', '', 'g'), '') as alnum
  ),
  base as (
    select h.*, cl.nome_razao_social, cl.cpf_cnpj,
           coalesce(ve.regional_id, cl.regional_id) as rid,
           coalesce(ve.placa, h.placa) as placa_atual
      from eventos_historico h
      join clientes cl on cl.id = h.cliente_id
      left join veiculos ve on ve.id = h.veiculo_id
  ),
  f as (
    select b.* from base b, esc, termo
     where esc.pode
       and (p_regional_id is null or b.rid = p_regional_id)
       and (esc.global or b.rid = any (esc.lista))
       and (p_tipo is null or p_tipo = any (b.tipos))
       and (p_de  is null or b.data_evento >= p_de)
       and (p_ate is null or b.data_evento <= p_ate)
       and (p_no_kanban is null or (b.evento_id is not null) = p_no_kanban)
       and (termo.t is null
            or texto_sem_acento(lower(b.nome_razao_social)) like '%' || termo.t || '%'
            or upper(coalesce(b.placa_atual, '')) like '%' || upper(termo.alnum) || '%'
            or b.cpf_cnpj like '%' || regexp_replace(termo.t, '\D', '', 'g') || '%'
                 and length(regexp_replace(termo.t, '\D', '', 'g')) >= 4
            or coalesce(b.protocolo, '') = trim(p_busca))
  )
  select f.id, f.cliente_id, f.nome_razao_social, f.veiculo_id, f.placa_atual, f.protocolo,
         f.data_evento, f.data_conclusao, f.tipos, f.envolvimento, f.valor_total,
         r.nome, f.evento_id, es.numero_protocolo, es.status::text, count(*) over ()
    from f
    left join regionais r on r.id = f.rid
    left join eventos_sinistro es on es.id = f.evento_id
   order by f.data_evento desc nulls last, f.id
   limit least(greatest(coalesce(p_limite, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
