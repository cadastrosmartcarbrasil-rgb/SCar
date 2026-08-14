-- ============================================================================
-- SCar :: 0019_planos_combos_motor.sql
-- Evolucao do modulo de Precificacao e Vendas:
--   1) Rastreador vira REGRA por tipo de veiculo (gatilho de isencao por FIPE),
--      saindo da matriz produto-por-faixa.
--   2) RCF (terceiros) deixa de ser base e passa a MODULO OPCIONAL por faixa de
--      cobertura (30/50/75/100 mil).
--   3) Motor de COMBOS: planos pre-definidos (Prata/Ouro/Diamante) agrupando a
--      cotacao base + pacotes de opcionais; funcao cotar_plano(...).
-- Append-only. A "Cotacao Base" (Plano Prata) passa a ser:
--   Casco + Taxa Admin + Assistencia 24h + Rastreador (se aplicavel).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Regra de Rastreador por tipo de veiculo (gatilho de isencao)
-- ----------------------------------------------------------------------------
alter table tipos_veiculo
  add column if not exists exige_rastreador             boolean       not null default false,
  add column if not exists valor_limite_isencao         numeric(12,2) not null default 0,
  add column if not exists valor_mensalidade_rastreador numeric(12,2) not null default 0;

-- Passeio: isento ate FIPE 60k; acima disso cobra R$35 (conforme planilha).
update tipos_veiculo
   set exige_rastreador = true,
       valor_limite_isencao = 60000,
       valor_mensalidade_rastreador = 35
 where nome = 'Passeio';

-- Aposenta o produto "Rastreador" (agora e regra): sai da base obrigatoria e
-- some da matriz produto-por-faixa para nao haver dupla contagem.
update produtos set obrigatorio = false, status = false where nome = 'Rastreador';
delete from tabela_precos_faixa
 where produto_id = (select id from produtos where nome = 'Rastreador');

-- ----------------------------------------------------------------------------
-- 2) RCF como modulo opcional por faixa de cobertura
-- ----------------------------------------------------------------------------
-- O RCF de 30mil deixa de ser obrigatorio (sai da base) e vira um tier opcional.
update produtos
   set obrigatorio = false, categoria = 'RCF'
 where nome = 'RCF - Terceiros 30mil';

-- Novos tiers de RCF (opcionais, preco cadastravel em Configuracoes -> Produtos).
insert into produtos (nome, fornecedor_nome, metodo_preco, valor_fixo, obrigatorio, categoria) values
  ('RCF - Terceiros 50mil',  'Interno', 'FIXO', 0, false, 'RCF'),
  ('RCF - Terceiros 75mil',  'Interno', 'FIXO', 0, false, 'RCF'),
  ('RCF - Terceiros 100mil', 'Interno', 'FIXO', 0, false, 'RCF')
on conflict (nome) do nothing;

-- Opcionais dos combos (preco a definir no cadastro de Produtos).
insert into produtos (nome, fornecedor_nome, metodo_preco, valor_fixo, obrigatorio, categoria) values
  ('Carro Reserva 10 dias',        'Interno', 'FIXO', 0, false, 'BENEFICIO'),
  ('Carro Reserva 30 dias',        'Interno', 'FIXO', 0, false, 'BENEFICIO'),
  ('Protecao de Vidros III',       'Interno', 'FIXO', 0, false, 'VIDROS'),
  ('Protecao de Vidros Completa',  'Interno', 'FIXO', 0, false, 'VIDROS'),
  ('Assistencia 24h VIP',          'Interno', 'FIXO', 0, false, 'BENEFICIO')
on conflict (nome) do nothing;

-- ----------------------------------------------------------------------------
-- 3) Planos / Combos
-- ----------------------------------------------------------------------------
alter table planos_protecao
  add column if not exists descricao_comercial text,
  add column if not exists nivel               smallint not null default 0; -- ordenacao Prata<Ouro<Diamante

-- Seed dos combos padrao (idempotente por nome).
insert into planos_protecao (nome, descricao_comercial, nivel, taxa_administrativa, cota_participacao, coberturas, ativo)
select 'Plano Prata', 'Basico tradicional: cotacao base (casco + taxa admin + assistencia 24h + rastreador se aplicavel).', 1, 0, 0, '{}'::jsonb, true
 where not exists (select 1 from planos_protecao where nome = 'Plano Prata');
insert into planos_protecao (nome, descricao_comercial, nivel, taxa_administrativa, cota_participacao, coberturas, ativo)
select 'Plano Ouro', 'Intermediario: base + RCF 50mil + Protecao de Vidros III + Carro Reserva 10 dias.', 2, 0, 0, '{}'::jsonb, true
 where not exists (select 1 from planos_protecao where nome = 'Plano Ouro');
insert into planos_protecao (nome, descricao_comercial, nivel, taxa_administrativa, cota_participacao, coberturas, ativo)
select 'Plano Diamante', 'Premium: base + RCF 100mil + Protecao de Vidros Completa + Carro Reserva 30 dias + Assistencia 24h VIP.', 3, 0, 0, '{}'::jsonb, true
 where not exists (select 1 from planos_protecao where nome = 'Plano Diamante');

-- Vinculos plano -> produtos opcionais (Prata nao tem opcionais).
insert into plano_produtos (plano_id, produto_id)
select p.id, pr.id
  from planos_protecao p
  join produtos pr on pr.nome in ('RCF - Terceiros 50mil', 'Protecao de Vidros III', 'Carro Reserva 10 dias')
 where p.nome = 'Plano Ouro'
on conflict do nothing;

insert into plano_produtos (plano_id, produto_id)
select p.id, pr.id
  from planos_protecao p
  join produtos pr on pr.nome in ('RCF - Terceiros 100mil', 'Protecao de Vidros Completa', 'Carro Reserva 30 dias', 'Assistencia 24h VIP')
 where p.nome = 'Plano Diamante'
on conflict do nothing;

-- ============================================================================
-- MOTOR
-- ============================================================================

-- calcular_mensalidade passa a aplicar a REGRA de rastreador na base (uma linha
-- sintetica), alem dos obrigatorios (casco + admin + assistencia). RCF e
-- rastreador NAO sao mais obrigatorios; entram so quando selecionados/regra.
create or replace function calcular_mensalidade(
  p_fipe numeric,
  p_tipo_veiculo_id uuid,
  p_produtos_ids uuid[] default '{}'::uuid[]
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
begin
  for rec in
    select * from produtos p
     where p.status = true
       and (p.obrigatorio = true or p.id = any(p_produtos_ids))
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

  return jsonb_build_object(
    'valor_fipe', p_fipe,
    'detalhamento_produtos', detalhe,
    'subtotal_taxa_admin', sub_admin,
    'subtotal_beneficios_parceiros', sub_parceiros,
    'valor_total_mensalidade', total,
    'taxa_adesao', calcular_adesao(p_fipe, p_tipo_veiculo_id)
  );
end;
$$;

-- Motor de cotacao por COMBO: resolve os produtos do plano + avulsos, calcula a
-- mensalidade (base + regra rastreador + opcionais), a adesao e a franquia.
create or replace function cotar_plano(
  p_fipe numeric,
  p_tipo_veiculo_id uuid,
  p_plano_id uuid default null,
  p_avulsos_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql stable
as $$
declare
  v_ids  uuid[] := '{}'::uuid[];
  v_calc jsonb;
  v_plano planos_protecao;
begin
  -- 1) produtos amarrados ao plano
  if p_plano_id is not null then
    select coalesce(array_agg(produto_id), '{}'::uuid[]) into v_ids
      from plano_produtos where plano_id = p_plano_id;
    select * into v_plano from planos_protecao where id = p_plano_id;
  end if;

  -- 2) + avulsos (uniao distinta, ignorando nulos)
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
    from unnest(v_ids || coalesce(p_avulsos_ids, '{}'::uuid[])) x
   where x is not null;

  -- 3) mensalidade (base obrigatoria + regra rastreador + selecionados) + adesao
  v_calc := calcular_mensalidade(p_fipe, p_tipo_veiculo_id, v_ids);

  -- 4) retorno consolidado
  return jsonb_build_object(
    'valor_fipe', p_fipe,
    'plano_id', p_plano_id,
    'plano_nome', v_plano.nome,
    'detalhamento_produtos', v_calc->'detalhamento_produtos',
    'subtotal_taxa_admin', (v_calc->>'subtotal_taxa_admin')::numeric,
    'subtotal_beneficios_parceiros', (v_calc->>'subtotal_beneficios_parceiros')::numeric,
    'valor_total_mensalidade', (v_calc->>'valor_total_mensalidade')::numeric,
    'taxa_adesao', (v_calc->>'taxa_adesao')::numeric,
    'franquia_participacao', calcular_participacao(p_fipe, p_tipo_veiculo_id)
  );
end;
$$;

grant execute on function cotar_plano(numeric, uuid, uuid, uuid[]) to authenticated;
