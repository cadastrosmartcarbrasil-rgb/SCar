-- ============================================================================
-- 0088 — PLANO SEM PROTECAO DE CASCO
-- ============================================================================
-- O PROBLEMA, medido na carga do Mutual (05/10/2026): a moto QCC9H13 tem no
-- Mutual Taxa Adm 25 + Cobertura de terceiros 20 + Rastreador 35 + 24h 23
-- - desconto 6 = R$ 97. NAO TEM CASCO. E o plano RASTREAMENTO (id 46 do
-- Mutual) e rastreamento sem protecao nenhuma.
--
-- Mas o motor do SCar (`calcular_mensalidade`, 0019/0081) SEMPRE soma os
-- produtos OBRIGATORIOS — e a Protecao Casco e um deles. Entao qualquer plano,
-- inclusive um montado so com terceiros + rastreador + 24h, devolvia o casco no
-- detalhamento. E esse detalhamento e a FICHA DO SAC (`opcionais_veiculo`,
-- 0029): o atendente via "Protecao Casco" num veiculo que nao tem, e podia
-- abrir evento de colisao/roubo para quem nao tem cobertura. Nao e cosmetico.
--
-- A SOLUCAO: `planos_protecao.sem_casco`. Marcado, `cotar_plano` tira do
-- detalhamento (e do total) o item OBRIGATORIO da categoria CASCO.
--
-- DECISOES:
-- 1. UM PONTO SO: `cotar_plano`. Ele alimenta a ficha do SAC
--    (`opcionais_veiculo`), os itens obrigatorios da cotacao
--    (`produtos_obrigatorios_cotacao`, 0028), o snapshot da venda, o hotlink e
--    o `valor_mensalidade_veiculo` (0024). Mexer em `calcular_mensalidade`
--    exigiria mudar a assinatura dele (DROP + CREATE, a mordida da 0070/0081);
--    aqui a assinatura de `cotar_plano` fica IDENTICA — create or replace.
-- 2. SO O CASCO DA BASE sai: item `categoria = 'CASCO'` E `obrigatorio`. Um
--    produto de casco que alguem amarre ao plano como OPCIONAL continua — quem
--    marcou "sem casco" e depois incluiu um casco opcional decidiu as duas coisas.
-- 3. Taxa Adm, Assistencia 24h e a regra do rastreador NAO sao tocadas: sao a
--    base que a QCC9H13 tambem tem.
-- 4. `default false`: NENHUM plano existente muda de preco ao aplicar. So muda
--    quem for marcado na tela de Planos.
-- 5. A FRANQUIA/PARTICIPACAO nao foi tocada: ela tem caminho proprio
--    (`calcular_participacao_veiculo`, 0016) usado pelas telas antes do valor
--    que volta aqui. O que fazer com a participacao de quem nao tem casco e
--    decisao a parte; o retorno passa a dizer `sem_casco` para a tela poder
--    perguntar.
-- 6. NAO MEXE NO BOLETO DOS MIGRADOS: eles tem `valor_mensalidade` (override)
--    e `valor_mensalidade_veiculo` (0024) nunca chama `cotar_plano` nesse ramo.
--    Para venda NOVA, marcar o plano BAIXA o preco (o casco deixa de ser cobrado),
--    que e exatamente o que "sem casco" significa.
-- ============================================================================

alter table planos_protecao
  add column if not exists sem_casco boolean not null default false;

comment on column planos_protecao.sem_casco is
  'Plano SEM protecao de casco (ex.: so terceiros/rastreador/24h, ou rastreamento puro). cotar_plano tira do detalhamento e do total o produto OBRIGATORIO da categoria CASCO. Default false: plano existente nao muda.';

create or replace function cotar_plano(
  p_fipe            numeric,
  p_tipo_veiculo_id uuid,
  p_plano_id        uuid default null,
  p_avulsos_ids     uuid[] default '{}'::uuid[],
  p_regional_id     uuid default null            -- null = MATRIZ PURA
)
returns jsonb
language plpgsql stable
as $$
declare
  v_ids   uuid[] := '{}'::uuid[];
  v_calc  jsonb;
  v_plano planos_protecao;
  v_sem_casco boolean := false;
  v_det   jsonb;
  v_menos numeric := 0;            -- o casco que saiu do total
  v_menos_parc numeric := 0;       -- a parte dele que contava como parceiro
begin
  if p_plano_id is not null then
    select coalesce(array_agg(produto_id), '{}'::uuid[]) into v_ids
      from plano_produtos where plano_id = p_plano_id;
    select * into v_plano from planos_protecao where id = p_plano_id;
    v_sem_casco := coalesce(v_plano.sem_casco, false);
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
    from unnest(v_ids || coalesce(p_avulsos_ids, '{}'::uuid[])) x
   where x is not null;

  v_calc := calcular_mensalidade(p_fipe, p_tipo_veiculo_id, v_ids, p_regional_id);
  v_det  := coalesce(v_calc->'detalhamento_produtos', '[]'::jsonb);

  -- PLANO SEM CASCO: tira o casco da BASE (obrigatorio). A ordem do
  -- detalhamento e preservada (`with ordinality`), e o subtotal de parceiros
  -- desconta pela MESMA regra de calcular_mensalidade (fornecedor <> Interno).
  if v_sem_casco then
    select coalesce(jsonb_agg(t.item order by t.ord) filter (where not t.tira), '[]'::jsonb),
           coalesce(sum((t.item->>'valor')::numeric) filter (where t.tira), 0),
           coalesce(sum((t.item->>'valor')::numeric)
                      filter (where t.tira and t.item->>'fornecedor' is distinct from 'Interno'), 0)
      into v_det, v_menos, v_menos_parc
      from (select e.item, e.ord,
                   (e.item->>'categoria' = 'CASCO'
                    and coalesce((e.item->>'obrigatorio')::boolean, false)) as tira
              from jsonb_array_elements(v_det) with ordinality as e(item, ord)) t;
  end if;

  return jsonb_build_object(
    'valor_fipe', p_fipe,
    'plano_id', p_plano_id,
    'plano_nome', v_plano.nome,
    'sem_casco', v_sem_casco,
    'regional_id', p_regional_id,
    'detalhamento_produtos', v_det,
    'subtotal_taxa_admin', (v_calc->>'subtotal_taxa_admin')::numeric,
    'subtotal_beneficios_parceiros', (v_calc->>'subtotal_beneficios_parceiros')::numeric - v_menos_parc,
    'valor_total_mensalidade', (v_calc->>'valor_total_mensalidade')::numeric - v_menos,
    'adicional_regional', (v_calc->>'adicional_regional')::numeric,
    'taxa_adesao', (v_calc->>'taxa_adesao')::numeric,
    -- A franquia/participacao NAO leva adicional (0081) e NAO foi tocada aqui (decisao 5).
    'franquia_participacao', calcular_participacao(p_fipe, p_tipo_veiculo_id)
  );
end;
$$;

comment on function cotar_plano(numeric, uuid, uuid, uuid[], uuid) is
  'Combo + avulsos + adicional da regional. Plano com sem_casco (0088) tira o CASCO obrigatorio do detalhamento e do total. Devolve `adicional_regional`, `regional_id` e `sem_casco` para a tela DISCRIMINAR, nunca embutir.';

-- ----------------------------------------------------------------------------
-- Rito de seguranca da 0052 (toda migration que cria/recria funcao)
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
