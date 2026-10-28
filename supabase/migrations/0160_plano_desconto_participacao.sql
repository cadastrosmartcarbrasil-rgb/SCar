-- ============================================================================
-- 0160 — PLANO COM DESCONTO NA BASE E PARTICIPACAO MULTIPLICADA (Plano Economico)
-- ============================================================================
-- Pedido do usuario (28/10/2026): o PLANO ECONOMICO tem 30% de desconto sobre a
-- Taxa Administrativa, a Assistencia 24h e a Protecao do Casco, nao tem
-- terceiros nem vidros, e em compensacao a participacao (franquia) e o DOBRO da
-- do veiculo: quem tem cota de 5% passa a ter 10%.
--
-- Nada disso cabia no plano: o motor (`cotar_plano`) so sabia SOMAR produtos ao
-- combo e tirar o casco (0088). Entram dois campos no PLANO, que valem para
-- qualquer plano (nao so o Economico):
--   * `desconto_base_percentual` (0..90) — desconto sobre os itens OBRIGATORIOS
--     da base (os PRODUTOS obrigatorios: hoje Taxa Administrativa, Assistencia
--     24h e Protecao Casco). A regra do rastreador e o adicional da regional NAO
--     tem desconto (nao sao produto). Opcional/avulso NAO tem desconto.
--   * `multiplicador_participacao` (0,5..5) — a participacao do veiculo (cota do
--     veiculo > cota do modelo > faixa da tabela) vezes o multiplicador.
-- Default 0 e 1: NENHUM plano existente muda ao aplicar.
--
-- ONDE VALE (um lugar para cada coisa, nenhum caminho paralelo):
--   * `cotar_plano` — mensalidade (item a item, com o valor de tabela ao lado)
--     e `franquia_participacao`. Alimenta simulador, captura da venda, hotlink,
--     cotacao, ficha do SAC e `valor_mensalidade_veiculo` (0024).
--   * `participacao_do_plano(fipe, tipo, cota, plano)` — nova; e a que as telas
--     e o hotlink passam a chamar no lugar de `calcular_participacao`.
--   * `calcular_participacao_veiculo` — a ficha do veiculo/SAC e os Termos: le o
--     plano do VEICULO.
--   * `atualizar_cotacao` — o snapshot `cotacoes.participacao` (troca do literal
--     sobre a definicao em vigor, como a 0152; a funcao recusa se nao achar).
--
-- O BOLETO DOS MIGRADOS NAO MUDA: eles tem `valor_mensalidade` (override) e o
-- motor nao e chamado. A participacao deles muda se alguem os puser num plano
-- com multiplicador — e o que o plano significa.
-- ============================================================================

alter table planos_protecao
  add column if not exists desconto_base_percentual numeric(5,2) not null default 0,
  add column if not exists multiplicador_participacao numeric(4,2) not null default 1;

alter table planos_protecao drop constraint if exists chk_plano_desconto_base;
alter table planos_protecao add constraint chk_plano_desconto_base
  check (desconto_base_percentual >= 0 and desconto_base_percentual <= 90);

alter table planos_protecao drop constraint if exists chk_plano_multiplicador_participacao;
alter table planos_protecao add constraint chk_plano_multiplicador_participacao
  check (multiplicador_participacao >= 0.5 and multiplicador_participacao <= 5);

comment on column planos_protecao.desconto_base_percentual is
  'Desconto (%) sobre os PRODUTOS obrigatorios da base (Taxa Adm, Assistencia 24h, Casco). Nao vale para a regra do rastreador, o adicional regional nem opcionais. 0 = sem desconto (0160).';
comment on column planos_protecao.multiplicador_participacao is
  'Multiplica a participacao/franquia do veiculo neste plano (2 = o dobro: cota de 5% vira 10%). 1 = participacao normal (0160).';

-- ----------------------------------------------------------------------------
-- Multiplicador do plano (1 quando nao ha plano)
-- ----------------------------------------------------------------------------
-- security definer: o portal do associado (Termos, ficha) le a participacao
-- e a RLS de planos_protecao pode nao deixa-lo ler o plano; aqui so sai o numero.
create or replace function multiplicador_participacao_plano(p_plano_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select multiplicador_participacao from planos_protecao where id = p_plano_id), 1);
$$;

-- ----------------------------------------------------------------------------
-- Participacao da cotacao/simulacao: a de sempre x o multiplicador do plano
-- ----------------------------------------------------------------------------
create or replace function participacao_do_plano(
  p_fipe numeric, p_tipo_veiculo_id uuid, p_cota_id uuid, p_plano_id uuid
) returns numeric language sql stable as $$
  select round(coalesce(calcular_participacao(p_fipe, p_tipo_veiculo_id, p_cota_id), 0)
               * multiplicador_participacao_plano(p_plano_id), 2);
$$;

comment on function participacao_do_plano(numeric, uuid, uuid, uuid) is
  'calcular_participacao(fipe, tipo, cota) x multiplicador_participacao do plano (0160). Usada pela captura da venda, simulador e hotlink.';

-- ----------------------------------------------------------------------------
-- cotar_plano: corpo da 0088 + o desconto da base + a participacao do plano
-- ----------------------------------------------------------------------------
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
  v_desc_pct numeric := 0;
  v_mult  numeric := 1;
  v_det   jsonb;
  v_menos numeric := 0;            -- o casco que saiu do total
  v_menos_parc numeric := 0;       -- a parte dele que contava como parceiro
  v_desc  numeric := 0;            -- desconto da base (total)
  v_desc_admin numeric := 0;       -- a parte do desconto na Taxa Adm
  v_desc_parc numeric := 0;        -- a parte do desconto em parceiros
begin
  if p_plano_id is not null then
    select coalesce(array_agg(produto_id), '{}'::uuid[]) into v_ids
      from plano_produtos where plano_id = p_plano_id;
    select * into v_plano from planos_protecao where id = p_plano_id;
    v_sem_casco := coalesce(v_plano.sem_casco, false);
    v_desc_pct  := coalesce(v_plano.desconto_base_percentual, 0);
    v_mult      := coalesce(v_plano.multiplicador_participacao, 1);
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
    from unnest(v_ids || coalesce(p_avulsos_ids, '{}'::uuid[])) x
   where x is not null;

  v_calc := calcular_mensalidade(p_fipe, p_tipo_veiculo_id, v_ids, p_regional_id);
  v_det  := coalesce(v_calc->'detalhamento_produtos', '[]'::jsonb);

  -- PLANO SEM CASCO (0088): tira o casco da BASE (obrigatorio).
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

  -- DESCONTO DA BASE (0160): so PRODUTO obrigatorio (produto_id preenchido) —
  -- a regra do rastreador e o adicional regional tem produto_id nulo e ficam
  -- cheios. Cada item com desconto leva `valor_tabela` e `desconto_plano` para
  -- a tela mostrar o "de/por"; `valor` passa a ser o cobrado.
  if v_desc_pct > 0 then
    with itens as (
      select e.item, e.ord,
             (e.item->>'produto_id' is not null
              and coalesce((e.item->>'obrigatorio')::boolean, false)) as aplica,
             (e.item->>'valor')::numeric as cheio
        from jsonb_array_elements(v_det) with ordinality as e(item, ord)
    ), calc as (
      select item, ord, aplica, cheio,
             case when aplica then round(cheio * v_desc_pct / 100, 2) else 0 end as d
        from itens
    )
    select coalesce(jsonb_agg(
             case when aplica and d > 0
                  then item || jsonb_build_object('valor', cheio - d,
                                                  'valor_tabela', cheio,
                                                  'desconto_plano', d,
                                                  'desconto_plano_percentual', v_desc_pct)
                  else item end
             order by ord), '[]'::jsonb),
           coalesce(sum(d), 0),
           coalesce(sum(d) filter (where item->>'categoria' = 'ADMIN'), 0),
           coalesce(sum(d) filter (where item->>'fornecedor' is distinct from 'Interno'), 0)
      into v_det, v_desc, v_desc_admin, v_desc_parc
      from calc;
  end if;

  return jsonb_build_object(
    'valor_fipe', p_fipe,
    'plano_id', p_plano_id,
    'plano_nome', v_plano.nome,
    'sem_casco', v_sem_casco,
    'regional_id', p_regional_id,
    'detalhamento_produtos', v_det,
    'subtotal_taxa_admin', (v_calc->>'subtotal_taxa_admin')::numeric - v_desc_admin,
    'subtotal_beneficios_parceiros', (v_calc->>'subtotal_beneficios_parceiros')::numeric - v_menos_parc - v_desc_parc,
    'valor_total_mensalidade', (v_calc->>'valor_total_mensalidade')::numeric - v_menos - v_desc,
    'adicional_regional', (v_calc->>'adicional_regional')::numeric,
    'taxa_adesao', (v_calc->>'taxa_adesao')::numeric,
    'desconto_base_percentual', v_desc_pct,
    'desconto_base_valor', v_desc,
    'multiplicador_participacao', v_mult,
    -- A franquia/participacao NAO leva adicional (0081); leva o multiplicador do plano (0160).
    'franquia_participacao', round(coalesce(calcular_participacao(p_fipe, p_tipo_veiculo_id), 0) * v_mult, 2)
  );
end;
$$;

comment on function cotar_plano(numeric, uuid, uuid, uuid[], uuid) is
  'Combo + avulsos + adicional da regional. sem_casco (0088) tira o CASCO obrigatorio; desconto_base_percentual (0160) desconta os PRODUTOS obrigatorios (item com valor_tabela/desconto_plano); multiplicador_participacao (0160) multiplica a franquia_participacao.';

-- ----------------------------------------------------------------------------
-- Participacao do VEICULO: corpo da 0016 x o multiplicador do plano dele
-- ----------------------------------------------------------------------------
create or replace function calcular_participacao_veiculo(
  p_veiculo_id uuid, p_fipe numeric
) returns numeric language plpgsql stable as $$
declare
  v_pct   numeric;
  v_tipo  uuid;
  v_plano uuid;
  v_base  numeric;
begin
  -- 1) override do veiculo  2) cota herdada do modelo
  select coalesce(cv.percentual, cm.percentual), v.tipo_veiculo_id, v.plano_protecao_id
    into v_pct, v_tipo, v_plano
  from veiculos v
  left join cotas_participacao cv on cv.id = v.cota_participacao_id
  left join modelos            md on md.id = v.modelo_id
  left join cotas_participacao cm on cm.id = md.cota_participacao_id
  where v.id = p_veiculo_id;

  if v_pct is not null then
    v_base := round(p_fipe * v_pct, 2);
  else
    -- 3) fallback: tabela padrao por tipo/faixa FIPE
    v_base := calcular_participacao(p_fipe, v_tipo);
  end if;

  if v_base is null then return null; end if;
  -- 0160: o plano do veiculo multiplica (Economico = 2x)
  return round(v_base * multiplicador_participacao_plano(v_plano), 2);
end;
$$;

-- ----------------------------------------------------------------------------
-- atualizar_cotacao: o snapshot da participacao passa a levar o plano.
-- Troca do literal sobre a definicao EM VIGOR (a 0158), sem reescrever o resto.
-- ----------------------------------------------------------------------------
do $$
declare
  v_def  text;
  v_novo text;
begin
  v_def := pg_get_functiondef(
    'atualizar_cotacao(uuid, numeric, uuid, uuid, uuid, uuid[], text, numeric, text, boolean, numeric)'::regprocedure);
  if position('participacao_do_plano(' in v_def) > 0 then
    return;   -- ja aplicada (migration re-executavel)
  end if;
  v_novo := replace(v_def,
    'calcular_participacao(v_fipe, v_tipo, coalesce(p_cota_id, cota_participacao_id))',
    'participacao_do_plano(v_fipe, v_tipo, coalesce(p_cota_id, cota_participacao_id), v_plano)');
  if v_novo = v_def then
    raise exception '0160: nao achei o calculo da participacao em atualizar_cotacao — conferir a versao em vigor';
  end if;
  execute v_novo;
end;
$$;

-- ----------------------------------------------------------------------------
-- Rito de seguranca da 0052 (toda migration que cria/recria funcao)
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
