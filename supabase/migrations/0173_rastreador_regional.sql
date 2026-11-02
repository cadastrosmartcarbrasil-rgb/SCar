-- ============================================================================
-- 0173 — REGRA DO RASTREADOR POR REGIONAL
-- ============================================================================
-- Pedido do usuario (02/11/2026): "criar o limitador de exigir rastreador por
-- Regional, algumas tem variaveis diferentes da matriz. Passeio, Moto,
-- Pickups/van e pesados." E: "o calculo da mensalidade deve reconhecer a
-- obrigatoriedade do rastreador ainda na cotacao — desobrigado (abaixo do
-- exigido) aparece como contratacao opcional; obrigatorio ja sai na lista dos
-- produtos contratados, sem aparecer como opcional".
--
-- A regra da matriz (0019) mora em `tipos_veiculo` (exige_rastreador,
-- valor_limite_isencao, valor_mensalidade_rastreador). O motor (0090) ja decidia
-- regra x opcional; faltava a UNIDADE poder ter variaveis proprias.
--
-- DECISOES:
-- 1. Uma linha por (unidade, tipo) em `regional_regra_rastreador`, com as TRES
--    variaveis da matriz. Sem linha = vale a da matriz (no-op ao aplicar). A
--    linha substitui a regra INTEIRA, inclusive "nao exige" (desobrigar a moto
--    numa unidade e uma linha com exige = false).
-- 2. `regra_rastreador(tipo, regional)` e a UNICA leitura da regra efetiva — o
--    motor, a tela e a proposta perguntam a ela. Security definer porque o motor
--    roda tambem para o associado do /portal e para o hotlink (sem sessao).
-- 3. `calcular_mensalidade` com a MESMA assinatura (corpo da 0090): a regra sai
--    de `regra_rastreador(p_tipo, p_regional_id)`. Sem regional = matriz pura,
--    como antes. O veiculo ja na base nao muda: o override do valor manda.
-- 4. Quem edita e quem edita preco (`pode_editar_precos`, 0110/0111), como a
--    regra da matriz na mesma tela.
-- 5. `regional_de_quem_cota()`: a captura da venda (antes de o lead existir)
--    cota pela unidade de quem esta cotando — a mesma que o lead vai receber
--    (vendedor: a do cadastro dele; equipe: a do usuario; matriz: null).
-- ============================================================================

create table if not exists regional_regra_rastreador (
  id                           uuid primary key default gen_random_uuid(),
  regional_id                  uuid not null references regionais(id) on delete cascade,
  tipo_veiculo_id              uuid not null references tipos_veiculo(id) on delete cascade,
  exige_rastreador             boolean not null default true,
  valor_limite_isencao         numeric(12,2) not null default 0,
  valor_mensalidade_rastreador numeric(12,2) not null default 0,
  observacao                   text,
  atualizado_por               uuid references usuarios(id) on delete set null,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  constraint uq_regional_regra_rastreador unique (regional_id, tipo_veiculo_id),
  constraint chk_regra_rastreador_valores
    check (valor_limite_isencao >= 0 and valor_mensalidade_rastreador >= 0)
);

comment on table regional_regra_rastreador is
  'Regra do rastreador da UNIDADE por tipo de veiculo (0173). Sem linha = vale a da matriz (tipos_veiculo). A linha substitui as tres variaveis, inclusive "nao exige".';

alter table regional_regra_rastreador enable row level security;

drop policy if exists regra_rastreador_select on regional_regra_rastreador;
create policy regra_rastreador_select on regional_regra_rastreador for select to authenticated
  using ((select is_staff()));
-- Escrita so pela RPC (security definer); nenhuma policy de escrita.

grant select on regional_regra_rastreador to authenticated;

-- ----------------------------------------------------------------------------
-- A regra EFETIVA (decisao 2)
-- ----------------------------------------------------------------------------
create or replace function regra_rastreador(p_tipo_veiculo_id uuid, p_regional_id uuid default null)
returns table (exige boolean, limite numeric, valor numeric, origem text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(r.exige_rastreador, tv.exige_rastreador, false),
         coalesce(r.valor_limite_isencao, tv.valor_limite_isencao, 0),
         coalesce(r.valor_mensalidade_rastreador, tv.valor_mensalidade_rastreador, 0),
         case when r.id is not null then 'REGIONAL' else 'MATRIZ' end
    from tipos_veiculo tv
    left join regional_regra_rastreador r
      on r.tipo_veiculo_id = tv.id and r.regional_id = p_regional_id
   where tv.id = p_tipo_veiculo_id;
$$;

comment on function regra_rastreador(uuid, uuid) is
  'A regra do rastreador que vale para o tipo na unidade: a da unidade (0173) ou, sem ela, a da matriz (tipos_veiculo). Sem unidade = matriz.';

-- O rastreador ja e COBRADO pela regra? (FIPE acima do limite de um tipo que exige)
create or replace function rastreador_obrigatorio(p_fipe numeric, p_tipo_veiculo_id uuid, p_regional_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select r.exige and coalesce(p_fipe, 0) > r.limite
                     from regra_rastreador(p_tipo_veiculo_id, p_regional_id) r), false);
$$;

-- A unidade de quem esta cotando (decisao 5).
create or replace function regional_de_quem_cota()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select v.regional_id from vendedores v where v.id = vendedor_atual()),
                  auth_regional_id());
$$;

-- ----------------------------------------------------------------------------
-- O motor — corpo da 0090, a regra pela unidade (decisao 3)
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
  rr record;
  v_rast numeric := 0;
  v_adic numeric := 0;
  v_reg_nome text;
  v_regra_rastreador boolean := false;
begin
  -- 0173: a regra do rastreador e a da UNIDADE quando ela tem uma; senao a da
  -- matriz. Decidida ANTES do laco (0090): quando ela cobra, o rastreador
  -- OPCIONAL nao entra — seria o mesmo equipamento duas vezes.
  select * into rr from regra_rastreador(p_tipo_veiculo_id, p_regional_id);
  v_regra_rastreador := coalesce(rr.exige, false) and p_fipe > coalesce(rr.limite, 0);

  for rec in
    select * from produtos p
     where p.status = true
       and (p.obrigatorio = true or p.id = any(p_produtos_ids))
       and produto_atende_tipo(p.id, p_tipo_veiculo_id)
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

  if v_regra_rastreador then
    v_rast := coalesce(rr.valor, 0);
    detalhe := detalhe || jsonb_build_object(
      'produto_id', null, 'nome', 'Rastreador', 'valor', v_rast,
      'fornecedor', 'Interno', 'categoria', 'RASTREADOR', 'obrigatorio', true
    );
    total := total + v_rast;
  end if;

  if p_regional_id is not null then
    v_adic := adicional_risco_regional(p_regional_id, p_tipo_veiculo_id);
    if v_adic <> 0 then
      select nome into v_reg_nome from regionais where id = p_regional_id;
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
    'rastreador_obrigatorio', v_regra_rastreador,
    'taxa_adesao', calcular_adesao(p_fipe, p_tipo_veiculo_id)
  );
end;
$$;

comment on function calcular_mensalidade(numeric, uuid, uuid[], uuid) is
  'Mensalidade = produtos QUE ATENDEM O TIPO (0089) + regra do rastreador DA UNIDADE ou da matriz (0173; o opcional so entra abaixo do minimo, 0090) + adicional de risco da regional. Sem regional = matriz pura.';

-- ----------------------------------------------------------------------------
-- O veiculo na base SEM override (corpo da 0158): a regra do rastreador e a da
-- unidade que o precificou (regional_preco_id, senao a dele). O adicional segue
-- o CARIMBADO na entrada (0081): tira-se o adicional de hoje que o cotar_plano
-- somou e soma-se o gravado — a unidade reajustar o adicional nao mexe aqui.
-- Com override (a imensa maioria) nada muda.
-- ----------------------------------------------------------------------------
create or replace function valor_mensalidade_veiculo(p_veiculo_id uuid)
returns numeric
language plpgsql
stable
as $$
declare
  v        veiculos;
  v_opcs   uuid[];
  v_calc   jsonb;
  v_valor  numeric;
begin
  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then return 0; end if;

  if v.valor_mensalidade is not null and v.valor_mensalidade > 0 then
    return round(v.valor_mensalidade, 2);
  end if;

  if v.tipo_veiculo_id is null then return 0; end if;

  select coalesce(array_agg(produto_id), '{}'::uuid[]) into v_opcs
    from veiculo_produtos where veiculo_id = v.id;

  v_calc := cotar_plano(coalesce(v.valor_fipe, 0), v.tipo_veiculo_id, v.plano_protecao_id, v_opcs,
                        coalesce(v.regional_preco_id, v.regional_id));
  v_valor := (v_calc->>'valor_total_mensalidade')::numeric
             - coalesce((v_calc->>'adicional_regional')::numeric, 0);

  return round(coalesce(v_valor, 0) + coalesce(v.valor_adicional_regional, 0)
               + coalesce(v.valor_assistencia_profissional, 0), 2);
end;
$$;

-- ----------------------------------------------------------------------------
-- A tela: uma linha por unidade para o tipo escolhido
-- ----------------------------------------------------------------------------
create or replace function regras_rastreador_do_tipo(p_tipo_veiculo_id uuid)
returns table (
  regional_id    uuid,
  regional_nome  text,
  regional_ativa boolean,
  personalizada  boolean,
  exige          boolean,
  limite         numeric,
  valor          numeric,
  observacao     text,
  atualizado_em  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.nome, r.ativo,
         x.id is not null,
         coalesce(x.exige_rastreador, tv.exige_rastreador, false),
         coalesce(x.valor_limite_isencao, tv.valor_limite_isencao, 0),
         coalesce(x.valor_mensalidade_rastreador, tv.valor_mensalidade_rastreador, 0),
         x.observacao,
         x.updated_at
    from regionais r
    cross join tipos_veiculo tv
    left join regional_regra_rastreador x
      on x.regional_id = r.id and x.tipo_veiculo_id = tv.id
   where tv.id = p_tipo_veiculo_id
     and is_staff()
   order by r.ativo desc, r.nome;
$$;

create or replace function salvar_regra_rastreador_regional(
  p_regional_id     uuid,
  p_tipo_veiculo_id uuid,
  p_exige           boolean,
  p_limite          numeric,
  p_valor           numeric,
  p_observacao      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not pode_editar_precos() then
    raise exception 'Sem permissao para editar a precificacao.';
  end if;
  if p_regional_id is null or p_tipo_veiculo_id is null then
    raise exception 'Informe a unidade e o tipo de veiculo.';
  end if;
  if coalesce(p_limite, 0) < 0 or coalesce(p_valor, 0) < 0 then
    raise exception 'Limite e valor do rastreador nao podem ser negativos.';
  end if;

  insert into regional_regra_rastreador as x
    (regional_id, tipo_veiculo_id, exige_rastreador, valor_limite_isencao,
     valor_mensalidade_rastreador, observacao, atualizado_por)
  values (p_regional_id, p_tipo_veiculo_id, coalesce(p_exige, false), coalesce(p_limite, 0),
          coalesce(p_valor, 0), nullif(trim(p_observacao), ''), usuario_atual_id())
  on conflict on constraint uq_regional_regra_rastreador do update
     set exige_rastreador             = excluded.exige_rastreador,
         valor_limite_isencao         = excluded.valor_limite_isencao,
         valor_mensalidade_rastreador = excluded.valor_mensalidade_rastreador,
         observacao                   = excluded.observacao,
         atualizado_por               = excluded.atualizado_por,
         updated_at                   = now()
  returning x.id into v_id;
  return v_id;
end;
$$;

-- Volta a unidade para a regra da matriz.
create or replace function remover_regra_rastreador_regional(p_regional_id uuid, p_tipo_veiculo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not pode_editar_precos() then
    raise exception 'Sem permissao para editar a precificacao.';
  end if;
  delete from regional_regra_rastreador
   where regional_id = p_regional_id and tipo_veiculo_id = p_tipo_veiculo_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Rito de seguranca da 0052
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
