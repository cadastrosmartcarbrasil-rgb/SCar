-- ============================================================================
-- 0194_painel_produtos
-- Aba "Produtos" do Painel (/dashboard): os opcionais contratados pelos
-- veiculos que estao na base, por tipo de veiculo, o ranking dos produtos e a
-- receita mensal que eles representam.
--
-- Decisoes:
--  1. "Produto do veiculo" = OPCIONAL contratado (`veiculo_produtos`). O que o
--     plano ja traz (base e combo) nao entra: e cobertura do plano, nao venda.
--  2. A base e a mesma da Visao Geral (0100): ativado ate hoje e ainda nao saiu.
--  3. A receita e o VALOR DE TABELA do produto (`calcular_valor_produto`) por
--     mes. A carteira migrada paga um valor unico negociado no Mutual (override),
--     entao isto e o que os opcionais representam pela tabela, nao o recebido
--     separado — o boleto nao discrimina produto. A tela diz isso.
--  4. Produto contratado com preco zero (sem valor cadastrado) e contado como
--     contratacao e aparece em `sem_preco` — nunca some.
--  5. Mesmo isolamento do painel: staff, `escopo_regional`; nao-staff = NULL.
--  6. So LEITURA.
-- ============================================================================

create or replace function painel_produtos(p_regional_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_rid  uuid;
  v_hoje date := current_date;
  v_res  jsonb;
begin
  if not (is_staff() or auth.uid() is null) then
    return null;
  end if;
  v_rid := escopo_regional(p_regional_id);

  with
  base as materialized (
    select v.id, v.tipo_veiculo_id, coalesce(v.valor_fipe, 0) as fipe,
           coalesce(tv.nome, 'Sem tipo') as tipo
      from veiculos v
      left join tipos_veiculo tv on tv.id = v.tipo_veiculo_id
     where (v_rid is null or v.regional_id = v_rid)
       and v.data_ativacao is not null
       and v.data_ativacao <= v_hoje
       and (v.data_saida is null or v.data_saida > v_hoje)
  ),
  itens as materialized (
    select b.id as veiculo_id, b.tipo, p.id as produto_id, p.nome,
           coalesce(p.categoria::text, 'OUTROS') as categoria,
           coalesce(calcular_valor_produto(p.id, b.fipe, b.tipo_veiculo_id), 0) as valor
      from base b
      join veiculo_produtos vp on vp.veiculo_id = b.id
      join produtos p on p.id = vp.produto_id
  ),
  por_tipo as (
    select b.tipo,
           count(distinct b.id) as veiculos,
           count(distinct i.veiculo_id) as com_opcional,
           count(i.produto_id) as contratacoes,
           coalesce(sum(i.valor), 0) as receita
      from base b
      left join itens i on i.veiculo_id = b.id
     group by b.tipo
  ),
  produtos_agg as (
    select produto_id, nome, categoria,
           count(*) as contratacoes,
           sum(valor) as receita,
           count(*) filter (where valor <= 0) as sem_preco
      from itens
     group by produto_id, nome, categoria
  ),
  matriz as (
    select nome as produto, tipo, count(*) as contratacoes, sum(valor) as receita
      from itens
     group by nome, tipo
  ),
  categorias as (
    select categoria, count(*) as contratacoes, sum(valor) as receita
      from itens
     group by categoria
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'regional_id', v_rid,
    'kpis', jsonb_build_object(
      'veiculos_base',         (select count(*) from base),
      'veiculos_com_opcional', (select count(distinct veiculo_id) from itens),
      'contratacoes',          (select count(*) from itens),
      'receita_mensal',        (select coalesce(sum(valor), 0) from itens),
      'sem_preco',             (select count(*) from itens where valor <= 0),
      'produtos_distintos',    (select count(distinct produto_id) from itens)
    ),
    'por_tipo', coalesce((select jsonb_agg(to_jsonb(t) order by t.veiculos desc, t.tipo) from por_tipo t), '[]'::jsonb),
    'produtos', coalesce((select jsonb_agg(to_jsonb(p) order by p.contratacoes desc, p.nome) from produtos_agg p), '[]'::jsonb),
    'matriz', coalesce((select jsonb_agg(to_jsonb(m)) from matriz m), '[]'::jsonb),
    'categorias', coalesce((select jsonb_agg(to_jsonb(c) order by c.receita desc) from categorias c), '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$$;

comment on function painel_produtos(uuid) is
  '0194: opcionais contratados pelos veiculos na base (por tipo, ranking, receita mensal pela tabela). Staff, escopo_regional.';

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
