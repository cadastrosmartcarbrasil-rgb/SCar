-- ============================================================================
-- 0092 — OS PRODUTOS VEM ANINHADOS: uma linha por veiculo, `products[]` dentro
-- ============================================================================
-- A 0091 foi escrita sem ver o payload de `/contract/contract_object_product/`
-- e supos UMA LINHA POR PRODUTO. Capturado em 07/10/2026 (467 veiculos da
-- matriz), o formato real e UMA LINHA POR VEICULO:
--   { contract_object_id, contract_id, plate, model, plan_id, plan_name,
--     price_total, products: [ { object_id, product_id, product_name, ... } ] }
-- Com a leitura da 0091, `mutual_terceiros_por_objeto` devolveria "nao sei"
-- para todos — e `mutual_aplicar_plano_por_terceiros` nao tocaria ninguem.
-- Por isso NADA foi aplicado antes desta correcao.
--
-- So `mutual_terceiros_por_objeto` muda (mesma assinatura e retorno: create or
-- replace). Ela passa a abrir `products[]` item a item; linha sem a lista segue
-- lida como antes. Medido na matriz com a leitura nova: 71 motos = 67 com
-- terceiros, 3 sem, 1 sem produto nenhum (o plano 46, Rastreador e Assistencia).
--
-- Bonus que o payload trouxe e NAO e usado aqui: `plan_name` — o nome dos planos
-- legados que o `/quotation/plan/` nunca devolveu (48 = "V5 AUTOMOVEL COMUM").
-- ============================================================================

create or replace function mutual_terceiros_por_objeto(
  p_regional_id     uuid,
  p_tipo_veiculo_id uuid default null
)
returns table(
  veiculo_id     uuid,
  placa          text,
  objeto_id      text,
  plan_id        text,
  plano_atual_id uuid,
  plano_atual    text,
  produtos       int,
  tem_terceiros  boolean,
  nomes          text,
  chave_objeto   text,
  chave_nome     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reg uuid;
begin
  if auth.uid() is not null and not is_staff() then
    return;   -- o associado do /portal e `authenticated` tambem (0052)
  end if;
  v_reg := case when auth.uid() is null then p_regional_id else escopo_regional(p_regional_id) end;

  return query
  with veic as (
    select v.id, v.placa::text as placa, v.plano_protecao_id, iv.id_externo
      from veiculos v
      join integracao_vinculos iv
        on iv.sistema = 'MUTUAL' and iv.entidade = 'CONTRACT_OBJECT'
       and iv.tabela = 'veiculos' and iv.registro_id = v.id
     where (v_reg is null or v.regional_id = v_reg)
       and (p_tipo_veiculo_id is null or v.tipo_veiculo_id = p_tipo_veiculo_id)
  ),
  -- O Mutual devolve UMA linha por veiculo com a lista `products[]` dentro
  -- (medido em 07/10/2026). Cada item vira uma linha; o veiculo sai do item
  -- (`object_id`) ou, na falta, da linha de fora (`contract_object_id`, que a
  -- captura grava). Linha SEM `products` continua lida como produto avulso — o
  -- formato que a 0091 previa.
  itens as (
    select c.payload as fora, e.value as item
      from mutual_captura c
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(c.payload->'products') = 'array'
             then c.payload->'products' else jsonb_build_array(c.payload) end) e
     where c.entidade = 'CONTRACT_OBJECT_PRODUCT'
       and not c.deletado
  ),
  linhas as (
    select coalesce(l.objeto, mutual_texto_em(i.fora, mutual_chaves_produto_objeto())) as objeto,
           l.produto_id, l.nome, l.chave_objeto, l.chave_nome
      from itens i
      cross join lateral mutual_produto_da_linha(i.item) l
     where coalesce(lower(i.item->>'selected'), 'true') <> 'false'
  ),
  por_obj as (
    select l.objeto,
           count(*)::int                                   as n,
           bool_or(mutual_produto_terceiros(l.nome))       as terceiros,
           bool_or(l.nome is not null)                     as algum_nome,
           string_agg(distinct coalesce(l.nome, '#' || l.produto_id), ' · ') as nomes,
           min(l.chave_objeto)                             as chave_objeto,
           min(l.chave_nome)                               as chave_nome
      from linhas l
     where l.objeto is not null
     group by l.objeto
  )
  select ve.id, ve.placa, ve.id_externo,
         mutual_texto(o.payload->>'plan_id'),
         ve.plano_protecao_id, pp.nome::text,
         coalesce(po.n, 0),
         -- sem produto capturado, ou sem NENHUM nome legivel: "nao sei", nunca "nao tem"
         case when po.n is null or not po.algum_nome then null else po.terceiros end,
         po.nomes, po.chave_objeto, po.chave_nome
    from veic ve
    left join mutual_captura o
      on o.entidade = 'CONTRACT_OBJECT' and o.id_externo = ve.id_externo
    left join planos_protecao pp on pp.id = ve.plano_protecao_id
    left join por_obj po on po.objeto = ve.id_externo
   order by ve.placa;
end;
$$;


-- ----------------------------------------------------------------------------
-- Rito de seguranca da 0052 (toda migration que cria/recria funcao)
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
