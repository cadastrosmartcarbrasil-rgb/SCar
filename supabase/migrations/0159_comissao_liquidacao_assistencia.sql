-- ============================================================================
-- 0159 — Comissao na LIQUIDACAO (inclusive renegociacao) e Assistencia
--        Profissional como ALTERNATIVA a comissao (corrige a 0158)
-- ----------------------------------------------------------------------------
-- Decisoes do usuario (28/10/2026):
-- (A) A comissao e sempre paga pela LIQUIDACAO do boleto. Boleto renegociado
--     (2a via, acordo, pro-rata) que o associado pagou gera comissao — a 0121
--     o pulava. O valor pago e repartido pelos veiculos dos boletos ORIGINAIS
--     (2a via/acordo), na proporcao de cada um; pro-rata vai ao veiculo do
--     titulo. Boleto AVULSO (vistoria, rastreador...) nao e mensalidade e
--     continua sem comissao. Renegociacao nunca e comissao de ADESAO.
-- (B) "Ou e comissao ou e Assistencia, nunca as duas." A unidade que marca
--     `paga_assistencia_profissional` paga ao consultor a Assistencia do
--     veiculo NO LUGAR da comissao recorrente (sem percentual nenhum). Veiculo
--     sem Assistencia segue com a comissao percentual normal. A parte da
--     Assistencia num pagamento e proporcional ao que ele cobre da
--     mensalidade (pro-rata paga uma fracao; acordo de 3 meses paga 3x).
-- (C) QUALQUER unidade pode cobrar a Assistencia (dentro do minimo e maximo
--     dela). A que nao repassa paga a comissao percentual sobre o valor
--     CHEIO — a Assistencia aumenta a base, e e esse o ganho do consultor.
-- ============================================================================

comment on column regionais.paga_assistencia_profissional is
  'A unidade REPASSA ao consultor a Assistencia Profissional do veiculo NO LUGAR da comissao recorrente (0159). Sem a marca, a Assistencia entra na base da comissao percentual.';

-- ---------------------------------------------------------------------
-- (C) Regras: toda unidade pode cobrar; o limite vale para todas
-- ---------------------------------------------------------------------
create or replace function assistencia_profissional_regras(p_lead_id uuid default null)
returns table (regional_id uuid, regional_nome text, paga boolean, minimo numeric, maximo numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_reg uuid;
begin
  if not (is_staff() or vendedor_atual() is not null) then
    raise exception 'Sem permissao' using errcode = 'insufficient_privilege';
  end if;
  if p_lead_id is not null then
    v_reg := regional_assistencia_do_lead(p_lead_id);
  else
    select coalesce((select v.regional_id from vendedores v where v.id = vendedor_atual()),
                    auth_regional_id())
      into v_reg;
  end if;
  return query
    select r.id, r.nome::text, r.paga_assistencia_profissional,
           r.assistencia_profissional_min, r.assistencia_profissional_max
      from regionais r where r.id = v_reg;
  if not found then
    -- sem unidade: o limite padrao (o mesmo default das colunas)
    return query select null::uuid, null::text, false, 1::numeric, 40::numeric;
  end if;
end;
$$;

create or replace function fn_cotacao_valida_desconto()
returns trigger
language plpgsql
as $$
declare
  v_reg    uuid;
  v_limite numeric;
  v_ap     numeric := round(coalesce(new.valor_assistencia_profissional, 0), 2);
  v_mudou  boolean;
  v_min    numeric := 1;
  v_max    numeric := 40;
  v_nome   text := 'padrao';
  r        regionais;
begin
  new.valor_assistencia_profissional := v_ap;
  if tg_op = 'INSERT' then
    v_mudou := v_ap > 0;
  else
    v_mudou := v_ap is distinct from old.valor_assistencia_profissional;
  end if;
  if v_mudou and v_ap > 0 then
    -- 0159: qualquer unidade cobra; so o limite dela vale.
    select * into r from regionais where id = regional_assistencia_do_lead(new.lead_id);
    if r.id is not null then
      v_min := r.assistencia_profissional_min;
      v_max := r.assistencia_profissional_max;
      v_nome := r.nome;
    end if;
    if v_ap < v_min or v_ap > v_max then
      raise exception 'ASSISTENCIA_PROFISSIONAL: o valor deve ficar entre R$ % e R$ % (unidade %)',
        v_min, v_max, v_nome
        using errcode = 'check_violation';
    end if;
  end if;

  if coalesce(new.desconto_percentual, 0) <= 0 then
    new.desconto_valor_mensalidade := 0;
    new.desconto_valor_adesao := 0;
    new.total_com_desconto := round(new.total_mensalidade + v_ap, 2);
    new.adesao_com_desconto := new.taxa_adesao;
    return new;
  end if;

  select coalesce(l.regional_id, u.regional_id) into v_reg
    from leads l
    left join usuarios u on u.id = l.consultor_id
   where l.id = new.lead_id;
  v_limite := limite_desconto_regional(v_reg);

  if new.desconto_percentual > v_limite and new.desconto_aprovado_por is null then
    raise exception 'DESCONTO_ACIMA_DO_LIMITE: % %% excede o limite de % %% da regional — necessaria aprovacao de gestor',
      new.desconto_percentual, v_limite;
  end if;

  -- O desconto corre sobre a mensalidade da TABELA; a Assistencia entra depois.
  new.desconto_valor_mensalidade := round(new.total_mensalidade * new.desconto_percentual / 100, 2);
  new.desconto_valor_adesao      := round(coalesce(new.taxa_adesao, 0) * new.desconto_percentual / 100, 2);
  new.total_com_desconto         := round(new.total_mensalidade - new.desconto_valor_mensalidade + v_ap, 2);
  new.adesao_com_desconto        := round(coalesce(new.taxa_adesao, 0) - new.desconto_valor_adesao, 2);
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- (A)(B) A comissao do titulo pago
-- ---------------------------------------------------------------------
create or replace function fn_calcular_comissao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  it          record;
  v_vendedor  vendedores;
  v_is_adesao boolean;
  v_taxa      numeric(6,4);
  v_pago      numeric(12,2);
  v_ap_veic   numeric(12,2);
  v_mensal    numeric(12,2);
  v_ap        numeric(12,2);
  v_comissao  numeric(12,2);
  v_reneg     text;
  v_repassa   boolean;
begin
  -- dispara apenas na transicao para 'pago' (ignora se ja estava pago)
  if new.status <> 'pago' or old.status is not distinct from 'pago' then
    return new;
  end if;
  -- 0150: boleto AVULSO (vistoria, rastreador...) nao e mensalidade.
  if new.tipo_avulso_id is not null then
    return new;
  end if;
  if new.renegociacao_id is not null then
    select tipo into v_reneg from cobranca_renegociacoes where id = new.renegociacao_id;
    if v_reneg is null or v_reneg not in ('SEGUNDA_VIA', 'ACORDO', 'PRO_RATA') then
      return new;
    end if;
  end if;

  v_pago := coalesce(new.valor_pago, new.valor);

  -- Os veiculos que este titulo paga, com a parte de cada um:
  --   2a via / acordo (0159) -> os veiculos dos boletos ORIGINAIS, na proporcao
  --                             do valor de cada um (sem veiculo: o do titulo);
  --   titulo do veiculo      -> ele, pelo valor pago;
  --   fatura AGRUPADA (0145) -> cada item, na proporcao do item.
  for it in
    with ori as (
      select coalesce(bh.veiculo_id, tf.veiculo_id, new.veiculo_id) as veiculo_id, o.valor
        from cobranca_renegociacao_origens o
        left join boletos_historico   bh on bh.id = o.boleto_historico_id
        left join titulos_financeiros tf on tf.id = o.titulo_id
       where v_reneg in ('SEGUNDA_VIA', 'ACORDO')
         and o.renegociacao_id = new.renegociacao_id
    ), tot as (select sum(valor) as s from ori)
    select o.veiculo_id, round(v_pago * sum(o.valor) / nullif(t.s, 0), 2) as base
      from ori o cross join tot t
     where o.veiculo_id is not null and coalesce(t.s, 0) > 0
     group by o.veiculo_id, t.s
    union all
    select new.veiculo_id, v_pago
     where new.veiculo_id is not null
       and not exists (
             select 1 from cobranca_renegociacao_origens o
               left join boletos_historico   bh on bh.id = o.boleto_historico_id
               left join titulos_financeiros tf on tf.id = o.titulo_id
              where v_reneg in ('SEGUNDA_VIA', 'ACORDO')
                and o.renegociacao_id = new.renegociacao_id
                and coalesce(bh.veiculo_id, tf.veiculo_id, new.veiculo_id) is not null
                and o.valor > 0)
    union all
    select fi.veiculo_id,
           round(v_pago * fi.valor / nullif(fa.valor_total, 0), 2)
      from faturas fa
      join fatura_itens fi on fi.fatura_id = fa.id
     where new.veiculo_id is null
       and new.renegociacao_id is null
       and fa.titulo_id = new.id
       and fi.veiculo_id is not null
  loop
    select v.* into v_vendedor
      from veiculos ve
      join vendedores v on v.id = ve.vendedor_id
     where ve.id = it.veiculo_id;
    continue when not found;   -- veiculo sem vendedor: nada a comissionar

    if new.adesao_lead_id is not null then
      -- 0145: o boleto da TAXA DE ADESAO emitido pela Smart Car
      v_is_adesao := true;
    elsif new.renegociacao_id is not null then
      -- 0159: renegociacao cobra mensalidade, nunca adesao
      v_is_adesao := false;
    else
      select not exists (
               select 1 from comissoes_vendas c
                where c.veiculo_id = it.veiculo_id and c.is_adesao = true
             )
         and not exists (
               select 1 from titulos_financeiros ta
                where ta.veiculo_id = it.veiculo_id
                  and ta.adesao_lead_id is not null
                  and ta.status <> 'cancelado'
             )
         and not exists (
               select 1 from integracao_vinculos iv
                where iv.sistema = 'MUTUAL' and iv.entidade = 'CONTRACT_OBJECT'
                  and iv.tabela = 'veiculos' and iv.registro_id = it.veiculo_id
             )
        into v_is_adesao;
    end if;

    v_taxa := case when v_is_adesao
                   then v_vendedor.taxa_comissao_adesao
                   else v_vendedor.taxa_comissao_recorrente end;

    -- 0159: COMISSAO ou ASSISTENCIA, nunca as duas. Na mensalidade de um
    -- veiculo com Assistencia, se a unidade do VENDEDOR repassa, ele recebe
    -- so a parte da Assistencia; senao, o percentual sobre o valor cheio.
    v_ap := 0;
    v_comissao := round(coalesce(it.base, 0) * coalesce(v_taxa, 0), 2);
    if not v_is_adesao then
      select coalesce(r.paga_assistencia_profissional, false) into v_repassa
        from regionais r where r.id = v_vendedor.regional_id;
      select coalesce(ve.valor_assistencia_profissional, 0) into v_ap_veic
        from veiculos ve where ve.id = it.veiculo_id;
      if coalesce(v_repassa, false) and v_ap_veic > 0 then
        v_mensal := valor_mensalidade_veiculo(it.veiculo_id);
        if coalesce(v_mensal, 0) > 0 then
          v_ap := round(v_ap_veic * coalesce(it.base, 0) / v_mensal, 2);
        else
          v_ap := v_ap_veic;
        end if;
        if new.renegociacao_id is null then
          v_ap := least(v_ap, v_ap_veic);   -- juros nao aumentam a Assistencia
        end if;
        v_ap := greatest(least(v_ap, coalesce(it.base, 0)), 0);
        v_comissao := v_ap;
      end if;
    end if;

    insert into comissoes_vendas (
      vendedor_id, veiculo_id, titulo_id, valor_comissao, is_adesao, status_pagamento,
      valor_assistencia_profissional
    ) values (
      v_vendedor.id, it.veiculo_id, new.id, v_comissao, v_is_adesao, 'pendente', v_ap
    )
    on conflict (titulo_id, veiculo_id) do nothing;   -- idempotente
  end loop;

  return new;
end;
$$;

comment on column comissoes_vendas.valor_assistencia_profissional is
  'Quando > 0, a comissao deste pagamento E a Assistencia Profissional repassada (0159): valor_comissao = este valor, sem percentual.';

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
