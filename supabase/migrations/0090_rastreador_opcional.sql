-- ============================================================================
-- 0090 — O RASTREADOR OPCIONAL SO APARECE ABAIXO DO MINIMO
-- ============================================================================
-- Regra do usuario (07/10/2026): "o rastreador ja atende a regra dos valores
-- minimos, porem tem casos que o associado, mesmo estando abaixo do minimo, quer
-- colocar o rastreador, que e um opcional; caso o veiculo ja esteja na condicao de
-- obrigatorio, nao e preciso oferecer o rastreador opcional". E: "o produto
-- rastreador e diferente do plano RASTREAMENTO".
--
-- O DEFEITO MEDIDO: o produto "Rastreador" (R$ 35, opcional, ativo) e a REGRA do
-- tipo (0019: Passeio acima de R$ 59.999,99 paga R$ 35) eram somados sem saber
-- um do outro. Um carro de R$ 80 mil com o opcional marcado pagaria R$ 70 por UM
-- equipamento.
--
-- DECISOES:
-- 1. Um MARCADOR no produto, nao a categoria: `produtos.rastreador_avulso`. A
--    categoria RASTREADOR tambem tem o "RASTREAMENTO SMART CAR BRASIL" (R$ 59,90),
--    que e o produto do PLANO RASTREAMENTO (rastreamento puro) e de PESADOS OURO —
--    outra coisa, e nao pode sumir porque a regra cobrou.
-- 2. A REGRA VALE NO MOTOR (`calcular_mensalidade`, corpo da 0089 + o marcador):
--    acima do minimo o opcional nao entra, venha ele avulso ou amarrado a um plano;
--    abaixo, ele e cobrado normalmente. A linha "Rastreador" da regra continua
--    sendo a unica cobranca acima do minimo.
-- 3. O produto "Rastreador" do cadastro (o unico com esse nome, categoria
--    RASTREADOR) ja nasce marcado — e o opcional que a regra descreve. Em
--    producao em 07/10 ele nao esta em plano nem em veiculo nenhum, entao nenhum
--    preco muda ao aplicar.
-- 4. Assinatura de `calcular_mensalidade` identica: create or replace.
-- ============================================================================

alter table produtos
  add column if not exists rastreador_avulso boolean not null default false;

comment on column produtos.rastreador_avulso is
  'E o rastreador OPCIONAL: so entra quando a regra do tipo (tipos_veiculo.exige_rastreador acima do limite de isencao) NAO cobra. Acima do minimo ele some — o equipamento ja esta na base (0090).';

update produtos
   set rastreador_avulso = true
 where categoria = 'RASTREADOR' and upper(trim(nome)) = 'RASTREADOR'
   and not rastreador_avulso;

-- ----------------------------------------------------------------------------
-- O motor — corpo da 0089 + o marcador (decisao 2)
-- ----------------------------------------------------------------------------
create or replace function calcular_mensalidade(
  p_fipe            numeric,
  p_tipo_veiculo_id uuid,
  p_produtos_ids    uuid[] default '{}'::uuid[],
  p_regional_id     uuid default null            -- null = MATRIZ PURA
)
returns jsonb
language plpgsql stable
as $$
declare
  rec record;
  v numeric;
  detalhe jsonb := '[]'::jsonb;
  total numeric := 0;
  sub_admin numeric := 0;
  sub_parceiros numeric := 0;
  tv tipos_veiculo;
  v_rast numeric := 0;
  v_adic numeric := 0;
  v_reg_nome text;
  v_regra_rastreador boolean := false;
begin
  -- A regra do rastreador do TIPO e decidida ANTES do laco (0090): quando ela
  -- ja cobra, o rastreador OPCIONAL nao entra — seria o mesmo equipamento duas vezes.
  select * into tv from tipos_veiculo where id = p_tipo_veiculo_id;
  v_regra_rastreador := coalesce(tv.exige_rastreador, false)
                        and p_fipe > coalesce(tv.valor_limite_isencao, 0);

  for rec in
    select * from produtos p
     where p.status = true
       and (p.obrigatorio = true or p.id = any(p_produtos_ids))
       -- 0089: produto que NAO atende o tipo de veiculo nao entra — nem da base,
       -- nem do plano, nem avulso. Sem tipo marcado, o produto vale para todos.
       and produto_atende_tipo(p.id, p_tipo_veiculo_id)
       -- 0090: o rastreador opcional so vale ABAIXO do minimo do tipo.
       and not (p.rastreador_avulso and v_regra_rastreador)
     order by p.categoria, p.nome
  loop
    v := calcular_valor_produto(rec.id, p_fipe, p_tipo_veiculo_id);
    detalhe := detalhe || jsonb_build_object(
      'produto_id', rec.id, 'nome', rec.nome, 'valor', v,
      'fornecedor', rec.fornecedor_nome, 'categoria', rec.categoria,
      'obrigatorio', rec.obrigatorio
    );
    total := total + v;
    if rec.categoria = 'ADMIN' then sub_admin := sub_admin + v; end if;
    if rec.fornecedor_nome is distinct from 'Interno' then sub_parceiros := sub_parceiros + v; end if;
  end loop;

  -- Regra de rastreador (gatilho de isencao por faixa FIPE).
  if v_regra_rastreador then
    v_rast := coalesce(tv.valor_mensalidade_rastreador, 0);
    detalhe := detalhe || jsonb_build_object(
      'produto_id', null, 'nome', 'Rastreador', 'valor', v_rast,
      'fornecedor', 'Interno', 'categoria', 'RASTREADOR', 'obrigatorio', true
    );
    total := total + v_rast;
  end if;

  -- ADICIONAL DE RISCO REGIONAL — UMA vez, sobre o total, DEPOIS de tudo.
  -- Dentro do laco de produtos ele seria somado uma vez POR PRODUTO: +R$ 5,00
  -- viraria +R$ 10,00 nas faixas de 2 produtos. E por isso que ele esta aqui.
  if p_regional_id is not null then
    v_adic := adicional_risco_regional(p_regional_id, p_tipo_veiculo_id);
    if v_adic <> 0 then
      select nome into v_reg_nome from regionais where id = p_regional_id;
      -- `produto_id` null, como a linha do Rastreador: `produtos_obrigatorios_
      -- cotacao` (0028) ja descarta item sem produto_id, entao o adicional NAO
      -- vira "item obrigatorio que sumiu da cotacao".
      detalhe := detalhe || jsonb_build_object(
        'produto_id', null,
        'nome', 'Adicional de risco regional — ' || coalesce(v_reg_nome, 'unidade'),
        'valor', v_adic,
        'fornecedor', 'Interno',
        'categoria', 'ADICIONAL_REGIONAL',
        'obrigatorio', true
      );
      total := total + v_adic;
    end if;
  end if;

  return jsonb_build_object(
    'valor_fipe', p_fipe,
    'detalhamento_produtos', detalhe,
    'subtotal_taxa_admin', sub_admin,
    'subtotal_beneficios_parceiros', sub_parceiros,
    'valor_total_mensalidade', total,
    'adicional_regional', v_adic,
    -- A adesao NAO leva adicional (decisao 2): segue vindo do calcular_adesao puro.
    'taxa_adesao', calcular_adesao(p_fipe, p_tipo_veiculo_id)
  );
end;
$$;

comment on function calcular_mensalidade(numeric, uuid, uuid[], uuid) is
  'Mensalidade = produtos QUE ATENDEM O TIPO (0089) + regra do rastreador (o rastreador OPCIONAL so entra abaixo do minimo, 0090) + adicional de risco da regional (uma vez, sobre o total). Sem regional = matriz pura.';

-- ----------------------------------------------------------------------------
-- Rito de seguranca da 0052 (toda migration que cria/recria funcao)
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
