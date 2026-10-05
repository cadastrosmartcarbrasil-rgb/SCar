-- ============================================================================
-- 0089 — PRODUTO POR TIPO DE VEICULO
-- ============================================================================
-- Pedido do usuario (05/10/2026): "ao cadastrar produtos, precisa deixar claro
-- para qual tipo de veiculo ele se aplica, dessa forma quando for apresentar uma
-- cotacao, so aparecera o que realmente atende aquele tipo, e nao parabrisa para
-- motos".
--
-- ATE AQUI `produtos` nao sabia de tipo de veiculo nenhum: o catalogo inteiro era
-- oferecido a qualquer veiculo, e um plano (Ouro, Prata) amarrado a "Vidros"
-- cobrava vidro de moto. A unica coisa por tipo era o PRECO das faixas FIPE.
--
-- DECISOES:
-- 1. TABELA, nao array: `produto_tipos_veiculo (produto_id, tipo_veiculo_id)`
--    com FK nas duas pontas. Array em coluna nao garante que o tipo existe, e
--    apagar um tipo deixaria um produto restrito a ninguem, em silencio.
-- 2. SEM LINHA = TODOS OS TIPOS. E o que faz a migration ser no-op ao aplicar:
--    nenhum produto existente muda, nenhum preco muda. Restringir e um ato na
--    tela de Produtos.
-- 3. A REGRA VALE NO MOTOR, nao so na tela: `calcular_mensalidade` (corpo
--    IDENTICO ao da 0081 — conferido em producao por md5 em 05/10 — mais UMA
--    condicao no laco). Assim parabrisa amarrado ao plano Ouro some do preco E da
--    ficha do SAC da moto que esta no Ouro; o mesmo plano continua servindo carro
--    e moto, cada um com o que lhe cabe. Filtrar so a tela deixaria o combo
--    cobrando o que a tela escondeu.
-- 4. Vale para TODO produto: obrigatorio da base, do plano e avulso. Avulso
--    antigo que nao atende o tipo deixa de ser cobrado pelo motor; a tela da
--    ficha continua mostrando-o marcado, com o aviso, para ninguem apagar sem ver.
-- 5. Efeito em boleto: so veiculo SEM `valor_mensalidade` (override) e recalculado
--    pelo motor — 3 na base em 05/10. Os migrados do Mutual tem override.
-- 6. Assinatura de `calcular_mensalidade` IDENTICA: create or replace, sem drop
--    (o drop + create e o que a 0070/0081 tiveram de fazer por MUDAR argumento).
-- 7. `produto_atende_tipo` e SECURITY DEFINER: o motor tambem roda para o
--    associado do /portal (authenticated, nao staff), que a RLS da tabela nao
--    deixa ler — sem isso, para ele, todo produto "atenderia todos os tipos".
--    A funcao so devolve um boolean sobre o catalogo; nao expoe dado de ninguem.
-- ============================================================================

create table if not exists produto_tipos_veiculo (
  produto_id      uuid not null references produtos(id)      on delete cascade,
  tipo_veiculo_id uuid not null references tipos_veiculo(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (produto_id, tipo_veiculo_id)
);

comment on table produto_tipos_veiculo is
  'Para quais tipos de veiculo o produto se aplica. Produto SEM linha aqui vale para TODOS os tipos (0089).';

create index if not exists idx_produto_tipos_tipo on produto_tipos_veiculo (tipo_veiculo_id);

alter table produto_tipos_veiculo enable row level security;

-- Mesma postura de `produtos` e `plano_produtos` (0003/0019): staff le, matriz mantem.
drop policy if exists ptv_select on produto_tipos_veiculo;
create policy ptv_select on produto_tipos_veiculo for select to authenticated using (is_staff());
drop policy if exists ptv_write on produto_tipos_veiculo;
create policy ptv_write on produto_tipos_veiculo for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

create or replace function produto_atende_tipo(p_produto_id uuid, p_tipo_veiculo_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select p_tipo_veiculo_id is null
      or not exists (select 1 from produto_tipos_veiculo t where t.produto_id = p_produto_id)
      or exists (select 1 from produto_tipos_veiculo t
                  where t.produto_id = p_produto_id and t.tipo_veiculo_id = p_tipo_veiculo_id);
$$;

comment on function produto_atende_tipo(uuid, uuid) is
  'O produto se aplica a este tipo de veiculo? Sem tipo marcado = todos; tipo nulo (nao informado) = sim.';

-- ----------------------------------------------------------------------------
-- O motor — corpo da 0081 + a condicao do tipo (decisao 3)
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
begin
  for rec in
    select * from produtos p
     where p.status = true
       and (p.obrigatorio = true or p.id = any(p_produtos_ids))
       -- 0089: produto que NAO atende o tipo de veiculo nao entra — nem da base,
       -- nem do plano, nem avulso. Sem tipo marcado, o produto vale para todos.
       and produto_atende_tipo(p.id, p_tipo_veiculo_id)
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
  select * into tv from tipos_veiculo where id = p_tipo_veiculo_id;
  if coalesce(tv.exige_rastreador, false) and p_fipe > coalesce(tv.valor_limite_isencao, 0) then
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
  'Mensalidade = produtos QUE ATENDEM O TIPO (0089) + regra do rastreador + adicional de risco da regional (uma vez, sobre o total). Sem regional = matriz pura. Adesao e franquia NAO recebem adicional.';

-- ----------------------------------------------------------------------------
-- Rito de seguranca da 0052 (toda migration que cria/recria funcao)
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
