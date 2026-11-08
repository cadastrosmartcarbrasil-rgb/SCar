-- =============================================================================
-- 0193 — TIRAR UM VEICULO DE UM BOLETO (SCar e Mutual), direto no Historico
--
-- Pedido do usuario (08/11/2026): "a tela deve estar em Boletos e 2a via". A
-- 0191 so ajustava o boleto agrupado DENTRO do cancelamento e so o do SCar —
-- e em producao nao ha nenhuma fatura do SCar: todo agrupado hoje e do Mutual.
--
-- (A) `veiculos_do_boleto(origem, id)` — os veiculos que um boleto cobra e a
--     parte de cada um:
--       SCAR   -> o rateio da 0191 (itens da fatura / originais);
--       MUTUAL -> com veiculo: so ele; sem veiculo (o agrupado): os veiculos do
--                 MESMO CONTRATO do Mutual (vinculo CONTRACT_OBJECT + o
--                 contract_id do objeto capturado), com a mensalidade de cada
--                 um. Medido em 08/11: a soma bate com o valor do boleto em
--                 quase todos; quando nao bate, a parte e proporcional e a tela
--                 avisa. Sem a captura (depois do corte): os veiculos do
--                 associado na base.
-- (B) `ajustar_boleto_sem_veiculo(origem, id, veiculo, valor?, vencimento?,
--     motivo)` — cria a renegociacao AJUSTE_AGRUPADO (0191): boleto novo sem o
--     veiculo; a rota emite no banco e so depois baixa o antigo.
-- (C) `cobranca_renegociacoes.veiculos_rateio` — os veiculos que FICARAM no
--     boleto novo, com o peso; `rateio_mensalidade_titulo` passa a usa-lo (e,
--     sem ele, os veiculos do contrato) para o boleto do Mutual sem veiculo —
--     a comissao de cada moto vai ao vendedor dela, e nao toda a um veiculo so.
-- =============================================================================

-- (C) ------------------------------------------------------------------------
alter table cobranca_renegociacoes add column if not exists veiculos_rateio jsonb;
comment on column cobranca_renegociacoes.veiculos_rateio is
  '0193: [{veiculo_id, peso}] dos veiculos que ficam no boleto novo do AJUSTE_AGRUPADO de um boleto do Mutual sem veiculo.';

-- (A) ------------------------------------------------------------------------
/** Os veiculos de um boleto do MUTUAL sem veiculo: os do mesmo contrato. */
create or replace function veiculos_do_boleto_mutual(p_boleto_id uuid)
returns table (veiculo_id uuid, peso numeric, na_base boolean, fonte text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  h boletos_historico%rowtype;
  v_achou boolean := false;
begin
  select * into h from boletos_historico where id = p_boleto_id;
  if not found then return; end if;

  if h.veiculo_id is not null then
    return query
      select v.id, coalesce(nullif(v.valor_mensalidade, 0), h.valor), true, 'VEICULO'::text
        from veiculos v where v.id = h.veiculo_id;
    return;
  end if;

  -- o contrato do Mutual: veiculos do associado cujo objeto e daquele contrato.
  -- Na base, ou que sairam ate 45 dias antes do vencimento (o que saiu
  -- recentemente e justamente o que se quer tirar).
  if h.contrato_externo is not null then
    begin
      return query
        select v.id, coalesce(v.valor_mensalidade, 0),
               v.status::text in ('ativo', 'inadimplente', 'em_evento', 'vistoria_pendente', 'suspenso'),
               'CONTRATO'::text
          from veiculos v
          join integracao_vinculos iv
            on iv.sistema = 'MUTUAL' and iv.entidade = 'CONTRACT_OBJECT'
           and iv.tabela = 'veiculos' and iv.registro_id = v.id
          join mutual_captura mc
            on mc.entidade = 'CONTRACT_OBJECT' and mc.id_externo = iv.id_externo
         where v.cliente_id = h.cliente_id
           and (mc.payload->>'contract_id') = h.contrato_externo
           and (v.status::text in ('ativo', 'inadimplente', 'em_evento', 'vistoria_pendente', 'suspenso')
                or coalesce(v.data_saida, v.cancelado_em) >= h.data_vencimento - 45);
      v_achou := found;
    exception when undefined_table then
      v_achou := false;   -- depois do corte a captura nao existe mais
    end;
  end if;
  if v_achou then return; end if;

  -- reserva: os veiculos do associado na base
  return query
    select v.id, coalesce(v.valor_mensalidade, 0), true, 'ASSOCIADO'::text
      from veiculos v
     where v.cliente_id = h.cliente_id
       and v.status::text in ('ativo', 'inadimplente', 'em_evento', 'vistoria_pendente', 'suspenso');
end;
$$;

/** A tela: os veiculos do boleto, a parte de cada um e a soma. */
create or replace function veiculos_do_boleto(p_origem text, p_id uuid)
returns table (
  veiculo_id     uuid,
  placa          text,
  chassi         text,
  modelo         text,
  status         text,
  na_base        boolean,
  mensalidade    numeric,
  valor_veiculo  numeric,
  valor_boleto   numeric,
  soma_pesos     numeric,
  fonte          text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cli   uuid;
  v_valor numeric;
  v_soma  numeric;
  v_orig  text := upper(coalesce(p_origem, ''));
begin
  if v_orig = 'MUTUAL' then
    select cliente_id, valor into v_cli, v_valor from boletos_historico where id = p_id;
  else
    select cliente_id, valor into v_cli, v_valor from titulos_financeiros where id = p_id;
  end if;
  if v_cli is null then return; end if;
  if auth.uid() is not null and not (is_staff() and cobranca_pode_cliente(v_cli)) then
    raise exception 'Fora do seu escopo de cobranca.' using errcode = 'insufficient_privilege';
  end if;

  return query
    with x as (
      select r.veiculo_id, r.peso, true as na_base, 'RATEIO'::text as fonte
        from rateio_mensalidade_titulo(p_id) r where v_orig <> 'MUTUAL'
      union all
      select m.veiculo_id, m.peso, m.na_base, m.fonte
        from veiculos_do_boleto_mutual(p_id) m where v_orig = 'MUTUAL'
    ),
    s as (select sum(peso) as soma from x)
    select x.veiculo_id, v.placa, v.chassi,
           nullif(btrim(coalesce(v.marca, '') || ' ' || coalesce(v.modelo, '')), ''),
           v.status::text, x.na_base, x.peso,
           case when coalesce(s.soma, 0) <= 0 then 0
                when v_orig = 'MUTUAL' and s.soma = v_valor then x.peso
                else round(v_valor * x.peso / s.soma, 2) end,
           v_valor, s.soma, x.fonte
      from x cross join s
      join veiculos v on v.id = x.veiculo_id
     order by x.peso desc, v.placa;
end;
$$;

comment on function veiculos_do_boleto(text, uuid) is
  '0193: os veiculos que um boleto (SCAR ou MUTUAL) cobra e a parte de cada um. MUTUAL sem veiculo = os do mesmo contrato.';

-- (C) o rateio com o boleto do Mutual sem veiculo ----------------------------
create or replace function rateio_mensalidade_titulo(p_titulo_id uuid, p_nivel integer default 0)
returns table (veiculo_id uuid, peso numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t      titulos_financeiros%rowtype;
  r      cobranca_renegociacoes%rowtype;
  o      record;
  s      record;
  v_tot  numeric;
  v_sem  numeric := 0;
  v_ids  uuid[] := '{}';
  v_pes  numeric[] := '{}';
begin
  if p_nivel > 6 then return; end if;
  select * into t from titulos_financeiros where id = p_titulo_id;
  if not found or t.tipo_avulso_id is not null then return; end if;

  if t.adesao_lead_id is not null then
    if t.veiculo_id is not null then
      veiculo_id := t.veiculo_id; peso := t.valor; return next;
    end if;
    return;
  end if;

  if t.renegociacao_id is null then
    return query
      select fi.veiculo_id, sum(fi.valor)
        from faturas fa
        join fatura_itens fi on fi.fatura_id = fa.id
       where fa.titulo_id = t.id and fi.veiculo_id is not null and fi.valor > 0
       group by fi.veiculo_id;
    return;
  end if;

  select * into r from cobranca_renegociacoes where id = t.renegociacao_id;
  if r.tipo = 'PRO_RATA' then
    if coalesce(t.veiculo_id, r.veiculo_id) is not null then
      veiculo_id := coalesce(t.veiculo_id, r.veiculo_id); peso := t.valor; return next;
    end if;
    return;
  end if;
  if r.tipo is null or r.tipo not in ('SEGUNDA_VIA', 'ACORDO', 'AJUSTE_AGRUPADO') then
    return;
  end if;

  for o in
    select ro.origem, ro.valor, ro.titulo_id, ro.boleto_historico_id, bh.veiculo_id as veiculo_mutual
      from cobranca_renegociacao_origens ro
      left join boletos_historico bh on bh.id = ro.boleto_historico_id
     where ro.renegociacao_id = r.id and ro.valor > 0
  loop
    if o.origem = 'MUTUAL' then
      if o.veiculo_mutual is not null then
        if not (r.tipo = 'AJUSTE_AGRUPADO' and o.veiculo_mutual = r.veiculo_id) then
          v_ids := v_ids || o.veiculo_mutual; v_pes := v_pes || o.valor;
        end if;
      else
        -- 0193: boleto do Mutual sem veiculo. Pesos gravados no ajuste; senao,
        -- os veiculos do contrato; sem nada, vai ao veiculo do boleto novo.
        select sum(x.peso) into v_tot from (
          select (e->>'veiculo_id')::uuid as veiculo_id, (e->>'peso')::numeric as peso
            from jsonb_array_elements(coalesce(r.veiculos_rateio, '[]'::jsonb)) e
          union all
          select m.veiculo_id, m.peso from veiculos_do_boleto_mutual(o.boleto_historico_id) m
           where r.veiculos_rateio is null and m.na_base
        ) x where not (r.tipo = 'AJUSTE_AGRUPADO' and x.veiculo_id = r.veiculo_id);
        if coalesce(v_tot, 0) > 0 then
          for s in
            select x.veiculo_id, x.peso from (
              select (e->>'veiculo_id')::uuid as veiculo_id, (e->>'peso')::numeric as peso
                from jsonb_array_elements(coalesce(r.veiculos_rateio, '[]'::jsonb)) e
              union all
              select m.veiculo_id, m.peso from veiculos_do_boleto_mutual(o.boleto_historico_id) m
               where r.veiculos_rateio is null and m.na_base
            ) x where not (r.tipo = 'AJUSTE_AGRUPADO' and x.veiculo_id = r.veiculo_id) and x.peso > 0
          loop
            v_ids := v_ids || s.veiculo_id;
            v_pes := v_pes || round(o.valor * s.peso / v_tot, 6);
          end loop;
        else
          v_sem := v_sem + o.valor;
        end if;
      end if;
    else
      select sum(x.peso) into v_tot
        from rateio_mensalidade_titulo(o.titulo_id, p_nivel + 1) x
       where not (r.tipo = 'AJUSTE_AGRUPADO' and x.veiculo_id = r.veiculo_id);
      if coalesce(v_tot, 0) > 0 then
        for s in
          select x.veiculo_id, x.peso
            from rateio_mensalidade_titulo(o.titulo_id, p_nivel + 1) x
           where not (r.tipo = 'AJUSTE_AGRUPADO' and x.veiculo_id = r.veiculo_id)
        loop
          v_ids := v_ids || s.veiculo_id;
          v_pes := v_pes || round(o.valor * s.peso / v_tot, 6);
        end loop;
      end if;
    end if;
  end loop;

  if not exists (select 1 from cobranca_renegociacao_origens x where x.renegociacao_id = r.id)
     and t.veiculo_id is not null and r.tipo <> 'AJUSTE_AGRUPADO' then
    v_ids := v_ids || t.veiculo_id; v_pes := v_pes || t.valor;
  end if;

  if v_sem > 0 and t.veiculo_id is not null then
    v_ids := v_ids || t.veiculo_id; v_pes := v_pes || v_sem;
  end if;

  return query
    select u.v, sum(u.p) from unnest(v_ids, v_pes) as u(v, p) group by u.v;
end;
$$;

-- (B) ------------------------------------------------------------------------
create or replace function ajustar_boleto_sem_veiculo(
  p_origem        text,
  p_id            uuid,
  p_veiculo_id    uuid,
  p_valor_veiculo numeric default null,
  p_vencimento    date default null,
  p_motivo        text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig   text := upper(coalesce(p_origem, ''));
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_hoje   date := data_sp(now());
  v_cli    uuid;
  v_valor  numeric;
  v_venc   date;
  v_nosso  text;
  v_parte  numeric;
  v_novo   numeric;
  v_veic   uuid;
  v_ident  text;
  v_id     uuid;
  v_rateio jsonb;
  v_n      integer;
  h        boletos_historico%rowtype;
  t        titulos_financeiros%rowtype;
begin
  if v_orig = 'MUTUAL' then
    select * into h from boletos_historico where id = p_id for update;
    if not found then raise exception 'Boleto nao encontrado.' using errcode = 'no_data_found'; end if;
    if h.situacao <> 'aberto' or h.baixa_banco_em is not null or coalesce(h.valor_pago, 0) > 0 then
      raise exception 'O boleto do Mutual de % nao esta em aberto.', to_char(h.data_vencimento, 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end if;
    if h.nosso_numero is null then
      raise exception 'Este boleto do Mutual nao tem a linha do Sicredi: sem ela nao ha baixa no banco. Ajuste no Mutual.'
        using errcode = 'check_violation';
    end if;
    v_cli := h.cliente_id; v_valor := h.valor; v_venc := h.data_vencimento; v_nosso := h.nosso_numero;
  elsif v_orig = 'SCAR' then
    select * into t from titulos_financeiros where id = p_id for update;
    if not found then raise exception 'Boleto nao encontrado.' using errcode = 'no_data_found'; end if;
    if t.status::text not in ('pendente', 'vencido') or coalesce(t.valor_pago, 0) > 0 then
      raise exception 'O boleto de % nao esta em aberto.', to_char(t.data_vencimento, 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end if;
    if t.tipo_avulso_id is not null then
      raise exception 'Boleto avulso nao e mensalidade: cancele e emita outro.' using errcode = 'check_violation';
    end if;
    v_cli := t.cliente_id; v_valor := t.valor; v_venc := t.data_vencimento; v_nosso := t.nosso_numero;
  else
    raise exception 'Origem invalida: use MUTUAL ou SCAR.' using errcode = 'check_violation';
  end if;

  if auth.uid() is not null and not (is_staff() and cobranca_pode_cliente(v_cli)) then
    raise exception 'Fora do seu escopo de cobranca.' using errcode = 'insufficient_privilege';
  end if;
  if length(v_motivo) < 5 then
    raise exception 'Informe o motivo (minimo 5 caracteres).' using errcode = 'check_violation';
  end if;
  if exists (select 1 from cobranca_renegociacao_origens o
               join cobranca_renegociacoes r on r.id = o.renegociacao_id
              where r.situacao <> 'ERRO'
                and ((v_orig = 'MUTUAL' and o.boleto_historico_id = p_id)
                  or (v_orig = 'SCAR' and o.titulo_id = p_id))) then
    raise exception 'Este boleto ja esta em outra negociacao, ajuste ou cancelamento.' using errcode = 'unique_violation';
  end if;

  select count(*) into v_n from veiculos_do_boleto(v_orig, p_id);
  if v_n < 2 then
    raise exception 'Este boleto cobra um veiculo so: para tira-lo, cancele o boleto.' using errcode = 'check_violation';
  end if;
  select x.valor_veiculo into v_parte from veiculos_do_boleto(v_orig, p_id) x where x.veiculo_id = p_veiculo_id;
  if not found then
    raise exception 'O veiculo escolhido nao esta neste boleto.' using errcode = 'check_violation';
  end if;
  if p_valor_veiculo is not null then
    v_parte := round(p_valor_veiculo, 2);
  end if;
  if v_parte is null or v_parte <= 0 then
    raise exception 'Informe quanto do boleto e deste veiculo.' using errcode = 'check_violation';
  end if;
  v_novo := round(v_valor - v_parte, 2);
  if v_novo <= 0 then
    raise exception 'Tirando este veiculo nao sobra valor: cancele o boleto.' using errcode = 'check_violation';
  end if;
  v_venc := coalesce(p_vencimento, greatest(v_venc, v_hoje + 2));
  if v_venc < v_hoje then
    raise exception 'O vencimento do boleto novo nao pode ser no passado.' using errcode = 'check_violation';
  end if;

  select coalesce(placa, '0 KM ' || right(coalesce(chassi, ''), 6)) into v_ident from veiculos where id = p_veiculo_id;

  -- os que ficam: peso de cada um (o boleto novo leva o de maior peso)
  select jsonb_agg(jsonb_build_object('veiculo_id', x.veiculo_id, 'peso', x.mensalidade) order by x.mensalidade desc),
         (array_agg(x.veiculo_id order by x.mensalidade desc, x.placa))[1]
    into v_rateio, v_veic
    from veiculos_do_boleto(v_orig, p_id) x
   where x.veiculo_id <> p_veiculo_id and x.na_base;
  if v_veic is null then
    raise exception 'Nenhum outro veiculo deste boleto esta na base.' using errcode = 'check_violation';
  end if;

  insert into cobranca_renegociacoes (cliente_id, regional_id, tipo, valor_original, valor_total,
                                      observacao, situacao, criado_por, veiculo_id, veiculos_rateio)
  values (v_cli, (select regional_id from clientes where id = v_cli), 'AJUSTE_AGRUPADO', v_valor, v_novo,
          format('Saida do veiculo %s: %s', v_ident, v_motivo), 'EMITINDO',
          (select id from usuarios where id = auth.uid()), p_veiculo_id,
          case when v_orig = 'MUTUAL' then v_rateio end)
  returning id into v_id;

  insert into cobranca_renegociacao_origens (renegociacao_id, origem, titulo_id, boleto_historico_id, valor, vencimento, nosso_numero)
  values (v_id, v_orig, case when v_orig = 'SCAR' then p_id end, case when v_orig = 'MUTUAL' then p_id end,
          v_valor, case when v_orig = 'MUTUAL' then h.data_vencimento else t.data_vencimento end, v_nosso);

  insert into titulos_financeiros (cliente_id, veiculo_id, valor, valor_original, data_vencimento,
                                   status, renegociacao_id, renegociacao_parcela, observacao)
  values (v_cli, v_veic, v_novo, v_novo, v_venc, 'pendente', v_id, 1,
          format('Substitui o boleto de %s sem o veiculo %s',
                 to_char(case when v_orig = 'MUTUAL' then h.data_vencimento else t.data_vencimento end, 'DD/MM/YYYY'),
                 v_ident));

  return v_id;
end;
$$;

comment on function ajustar_boleto_sem_veiculo(text, uuid, uuid, numeric, date, text) is
  '0193: boleto novo sem o veiculo (AJUSTE_AGRUPADO); a rota emite e baixa o antigo.';

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
