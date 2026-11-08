-- =============================================================================
-- 0191 — SAIDA DE UM VEICULO DO BOLETO AGRUPADO e a COMISSAO DE TODA MENSALIDADE
--
-- Pedido do usuario (08/11/2026): o associado tem 5 motos no mesmo boleto e
-- vende uma. O cancelamento (0144) so mexia na fatura agrupada AINDA SEM
-- boleto; o boleto agrupado ja emitido seguia cobrando as 5. E: "todo boleto
-- de MENSALIDADE pago gera comissao, renegociado ou nao — pagou, o vendedor
-- recebe".
--
-- (A) Tipo novo de renegociacao: AJUSTE_AGRUPADO. Ele SUBSTITUI um boleto de
--     varios veiculos por outro sem o veiculo que saiu, pela maquina da 2a via
--     (0121): o novo e emitido no banco e, so depois, o original recebe baixa.
--     `cobranca_renegociacoes.veiculo_id` = o veiculo que SAIU.
--     A fatura original NAO e editada (snapshot, 0021): quando o boleto antigo
--     e baixado ela vira CANCELADA, e o lote do mes nao a refaz (uq_fatura_agrupada).
-- (B) `rateio_mensalidade_titulo(titulo)` — os veiculos que um boleto de
--     mensalidade paga, com o peso de cada um. UMA regra, usada pela comissao,
--     pela previa do cancelamento e pelo ajuste:
--       boleto da fatura (individual ou agrupada) -> os itens da fatura;
--       2a via / acordo / ajuste -> os veiculos dos ORIGINAIS (recursivo: um
--         boleto agrupado renegociado reparte pelos itens, e nao cai num
--         veiculo so como na 0159); o ajuste tira o veiculo que saiu;
--       pro-rata -> o veiculo dele;
--       taxa de adesao -> o veiculo dela;
--       boleto avulso, cobranca de rastreador e cancelamento -> NADA (nao e
--         mensalidade). A cobranca do rastreador nao devolvido gerava comissao
--         de recorrencia na 0159 — corrigido aqui.
-- (C) `gerar_comissoes_titulo(titulo)` — a comissao do boleto PAGO, idempotente.
--     O trigger `fn_calcular_comissao` passa a chama-la (regras da 0145/0159
--     mantidas: adesao, Assistencia Profissional no lugar do percentual).
--     BACKFILL: boletos de mensalidade ja pagos sem comissao recebem a dela
--     (as 2as vias pagas antes da 0159 entrar).
-- (D) `agrupados_do_cancelamento(veiculo, data)` — a previa para a tela;
--     `ajustar_agrupados_cancelamento(cancelamento, titulos[])` — cria os
--     ajustes; a rota emite e baixa.
-- (E) A revistoria (0137) nao vale para o ajuste; a baixa do original escreve
--     "substituido" no historico.
-- =============================================================================

-- (A) ------------------------------------------------------------------------
alter table cobranca_renegociacoes drop constraint if exists chk_reneg_tipo;
alter table cobranca_renegociacoes add constraint chk_reneg_tipo
  check (tipo in ('SEGUNDA_VIA', 'ACORDO', 'PRO_RATA', 'AVULSO', 'CANCELAMENTO', 'AJUSTE_AGRUPADO'));

comment on column cobranca_renegociacoes.veiculo_id is
  'PRO_RATA/AVULSO: o veiculo cobrado. AJUSTE_AGRUPADO (0191): o veiculo que SAIU do boleto agrupado.';

-- (B) ------------------------------------------------------------------------
/**
 * Os veiculos que um boleto de MENSALIDADE paga e o peso de cada um (os pesos
 * nao precisam somar o valor do boleto: quem usa reparte na proporcao).
 * Nenhuma linha = nao e mensalidade (avulso, rastreador, cancelamento...).
 */
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
    -- boleto da fatura: os itens (individual = 1 item; agrupada = N)
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
    select ro.origem, ro.valor, ro.titulo_id, bh.veiculo_id as veiculo_mutual
      from cobranca_renegociacao_origens ro
      left join boletos_historico bh on bh.id = ro.boleto_historico_id
     where ro.renegociacao_id = r.id and ro.valor > 0
  loop
    if o.origem = 'MUTUAL' then
      if o.veiculo_mutual is null then
        v_sem := v_sem + o.valor;            -- boleto do Mutual sem veiculo
      elsif not (r.tipo = 'AJUSTE_AGRUPADO' and o.veiculo_mutual = r.veiculo_id) then
        v_ids := v_ids || o.veiculo_mutual; v_pes := v_pes || o.valor;
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
      -- original que nao e mensalidade (rastreador, avulso): nao entra
    end if;
  end loop;

  -- 2a via/acordo sem original registrado: o veiculo do proprio boleto (0159)
  if not exists (select 1 from cobranca_renegociacao_origens x where x.renegociacao_id = r.id)
     and t.veiculo_id is not null and r.tipo <> 'AJUSTE_AGRUPADO' then
    v_ids := v_ids || t.veiculo_id; v_pes := v_pes || t.valor;
  end if;

  -- o que nao tem veiculo vai ao veiculo do boleto novo (regra da 0121/0159)
  if v_sem > 0 and t.veiculo_id is not null then
    v_ids := v_ids || t.veiculo_id; v_pes := v_pes || v_sem;
  end if;

  return query
    select u.v, sum(u.p) from unnest(v_ids, v_pes) as u(v, p) group by u.v;
end;
$$;

comment on function rateio_mensalidade_titulo(uuid, integer) is
  'Veiculos que um boleto de MENSALIDADE paga e o peso de cada um (0191). Sem linha = nao e mensalidade. Usada pela comissao e pelo ajuste do agrupado.';

-- (C) ------------------------------------------------------------------------
/**
 * A comissao de UM boleto pago (0145/0159 + 0191). Idempotente: o unique
 * (titulo, veiculo) impede a segunda. Devolve quantas linhas gravou.
 */
create or replace function gerar_comissoes_titulo(p_titulo_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  t           titulos_financeiros%rowtype;
  it          record;
  v_vendedor  vendedores;
  v_is_adesao boolean;
  v_taxa      numeric(6,4);
  v_pago      numeric(12,2);
  v_ap_veic   numeric(12,2);
  v_mensal    numeric(12,2);
  v_ap        numeric(12,2);
  v_comissao  numeric(12,2);
  v_repassa   boolean;
  v_n         integer := 0;
  v_k         integer;
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;
  select * into t from titulos_financeiros where id = p_titulo_id;
  if not found or t.status <> 'pago' then return 0; end if;

  v_pago := coalesce(t.valor_pago, t.valor);

  for it in
    with x as (select * from rateio_mensalidade_titulo(t.id)),
         tot as (select sum(peso) as s from x)
    select x.veiculo_id, round(v_pago * x.peso / tot.s, 2) as base
      from x cross join tot
     where coalesce(tot.s, 0) > 0
  loop
    select v.* into v_vendedor
      from veiculos ve
      join vendedores v on v.id = ve.vendedor_id
     where ve.id = it.veiculo_id;
    continue when not found;   -- veiculo sem vendedor: nada a comissionar

    if t.adesao_lead_id is not null then
      v_is_adesao := true;              -- 0145: boleto da TAXA DE ADESAO
    elsif t.renegociacao_id is not null then
      v_is_adesao := false;             -- renegociacao cobra mensalidade
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

    -- 0159: COMISSAO ou ASSISTENCIA, nunca as duas.
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
        if t.renegociacao_id is null then
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
      v_vendedor.id, it.veiculo_id, t.id, v_comissao, v_is_adesao, 'pendente', v_ap
    )
    on conflict (titulo_id, veiculo_id) do nothing;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;

  return v_n;
end;
$$;

create or replace function fn_calcular_comissao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- dispara apenas na transicao para 'pago' (ignora se ja estava pago)
  if new.status <> 'pago' or old.status is not distinct from 'pago' then
    return new;
  end if;
  perform gerar_comissoes_titulo(new.id);
  return new;
end;
$$;

-- (D) ------------------------------------------------------------------------
/**
 * A previa: os boletos do associado que cobram ESTE veiculo junto com outros
 * (agrupado, ou 2a via/ajuste de um agrupado), e o que acontece com cada um
 * se o veiculo sair em p_data.
 *   AJUSTAR       -> vira um boleto novo sem o veiculo (e o antigo e baixado)
 *   PAGO          -> ja pago: fica (o pro-rata considera o ciclo pago)
 *   DIVIDA        -> vence ate a data do cancelamento: e divida, fica
 *   PARCIAL       -> tem pagamento parcial: tratar no Historico
 *   EM_NEGOCIACAO -> ja esta em outra negociacao em andamento
 */
create or replace function agrupados_do_cancelamento(p_veiculo_id uuid, p_data date)
returns table (
  titulo_id       uuid,
  competencia     date,
  vencimento      date,
  valor_atual     numeric,
  valor_veiculo   numeric,
  valor_novo      numeric,
  novo_vencimento date,
  outros_veiculos integer,
  registrado      boolean,
  situacao        text,
  motivo          text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v      veiculos%rowtype;
  t      record;
  v_tot  numeric;
  v_me   numeric;
  v_out  integer;
  v_hoje date := data_sp(now());
begin
  select * into v from veiculos where id = p_veiculo_id;
  if not found then return; end if;
  if auth.uid() is not null and not (is_staff() and pode_regional(v.regional_id)) then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;

  for t in
    select tf.*, fa.competencia as fat_comp
      from titulos_financeiros tf
      left join faturas fa on fa.titulo_id = tf.id
      left join cobranca_renegociacoes r on r.id = tf.renegociacao_id
     where tf.cliente_id = v.cliente_id
       and tf.status::text in ('pendente', 'vencido', 'pago')
       and tf.tipo_avulso_id is null
       and tf.data_vencimento > p_data - 45
       and ((fa.id is not null and fa.tipo_faturamento = 'AGRUPADO_ASSOCIADO')
            or r.tipo in ('SEGUNDA_VIA', 'ACORDO', 'AJUSTE_AGRUPADO'))
     order by tf.data_vencimento
  loop
    select sum(x.peso), sum(x.peso) filter (where x.veiculo_id = p_veiculo_id),
           count(*) filter (where x.veiculo_id <> p_veiculo_id)
      into v_tot, v_me, v_out
      from rateio_mensalidade_titulo(t.id) x;
    continue when coalesce(v_me, 0) <= 0 or coalesce(v_out, 0) = 0 or coalesce(v_tot, 0) <= 0;

    titulo_id       := t.id;
    competencia     := coalesce(t.fat_comp, date_trunc('month', t.data_vencimento)::date);
    vencimento      := t.data_vencimento;
    valor_atual     := t.valor;
    valor_veiculo   := round(t.valor * v_me / v_tot, 2);
    valor_novo      := greatest(t.valor - round(t.valor * v_me / v_tot, 2), 0);
    novo_vencimento := greatest(t.data_vencimento, v_hoje + 2);
    outros_veiculos := v_out;
    registrado      := t.nosso_numero is not null;

    if t.status::text = 'pago' then
      situacao := 'PAGO'; motivo := 'Já pago.';
    elsif t.data_vencimento <= p_data then
      situacao := 'DIVIDA'; motivo := 'Vence até a data do cancelamento: é dívida, fica como está.';
    elsif coalesce(t.valor_pago, 0) > 0 then
      situacao := 'PARCIAL'; motivo := 'Tem pagamento parcial: trate no Histórico financeiro.';
    elsif exists (select 1 from cobranca_renegociacao_origens o
                    join cobranca_renegociacoes r on r.id = o.renegociacao_id
                   where o.titulo_id = t.id and r.situacao <> 'ERRO'
                     and o.baixa_status not in ('BAIXADO', 'SEM_REGISTRO')) then
      situacao := 'EM_NEGOCIACAO'; motivo := 'Já está em outra negociação em andamento.';
    else
      situacao := 'AJUSTAR'; motivo := null;
    end if;
    return next;
  end loop;
end;
$$;

/**
 * Cria, para cada boleto escolhido, o AJUSTE_AGRUPADO: renegociacao com o
 * boleto antigo de origem e (se sobrar valor) o boleto novo sem o veiculo.
 * Devolve os ids; a rota emite no banco e baixa os originais.
 */
create or replace function ajustar_agrupados_cancelamento(p_cancelamento_id uuid, p_titulos uuid[])
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  k      veiculo_cancelamentos%rowtype;
  v      veiculos%rowtype;
  t      titulos_financeiros%rowtype;
  a      record;
  v_id   uuid;
  v_veic uuid;
  v_ref  uuid;
  v_ident text;
begin
  select * into k from veiculo_cancelamentos where id = p_cancelamento_id;
  if not found then
    raise exception 'Cancelamento nao encontrado.' using errcode = 'no_data_found';
  end if;
  select * into v from veiculos where id = k.veiculo_id;
  if auth.uid() is not null and not (perfil_pode('veiculos', 'cancelar') and pode_regional(v.regional_id)) then
    raise exception 'Sem permissao (Veiculos: Cancelar).' using errcode = 'insufficient_privilege';
  end if;
  v_ident := coalesce(v.placa, '0 KM ' || right(coalesce(v.chassi, ''), 6));

  foreach v_ref in array coalesce(p_titulos, '{}'::uuid[]) loop
    select * into a from agrupados_do_cancelamento(k.veiculo_id, k.data_cancelamento) x
     where x.titulo_id = v_ref;
    if not found then
      raise exception 'O boleto escolhido nao cobra este veiculo junto com outros.' using errcode = 'check_violation';
    end if;
    if a.situacao <> 'AJUSTAR' then
      raise exception 'O boleto de % nao pode ser ajustado: %', to_char(a.vencimento, 'DD/MM/YYYY'), a.motivo
        using errcode = 'check_violation';
    end if;
    select * into t from titulos_financeiros where id = v_ref for update;

    insert into cobranca_renegociacoes (cliente_id, regional_id, tipo, valor_original, valor_total,
                                        observacao, situacao, emitida_em, criado_por, veiculo_id)
    values (t.cliente_id, (select regional_id from clientes where id = t.cliente_id),
            'AJUSTE_AGRUPADO', t.valor, a.valor_novo,
            format('Saida do veiculo %s (cancelado em %s)', v_ident, to_char(k.data_cancelamento, 'DD/MM/YYYY')),
            case when a.valor_novo > 0 then 'EMITINDO' else 'EMITIDA' end,
            case when a.valor_novo > 0 then null else now() end,
            (select id from usuarios where id = auth.uid()), k.veiculo_id)
    returning id into v_id;

    insert into cobranca_renegociacao_origens (renegociacao_id, origem, titulo_id, valor, vencimento, nosso_numero)
    values (v_id, 'SCAR', t.id, t.valor, t.data_vencimento, t.nosso_numero);

    if a.valor_novo > 0 then
      -- o boleto novo leva o veiculo de maior peso que FICA (DRE e 24h leem pelo veiculo, 0121)
      select x.veiculo_id into v_veic
        from rateio_mensalidade_titulo(t.id) x
       where x.veiculo_id <> k.veiculo_id
       order by x.peso desc, x.veiculo_id
       limit 1;
      insert into titulos_financeiros (cliente_id, veiculo_id, valor, valor_original, data_vencimento,
                                       status, renegociacao_id, renegociacao_parcela, observacao)
      values (t.cliente_id, v_veic, a.valor_novo, a.valor_novo, a.novo_vencimento, 'pendente', v_id, 1,
              format('Substitui o boleto de %s sem o veiculo %s', to_char(t.data_vencimento, 'DD/MM/YYYY'), v_ident));
    end if;

    return next v_id;
  end loop;
end;
$$;

-- (E) ------------------------------------------------------------------------
create or replace function fn_reneg_origem_exige_revistoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cli   uuid;
  v_veic  uuid;
  v_corte integer := dias_revistoria_boleto();
  v_dias  integer;
  r       record;
begin
  -- 0144/0157/0191: cancelamento, pro-rata e ajuste do agrupado nao sao 2a via.
  if exists (select 1 from cobranca_renegociacoes x
              where x.id = new.renegociacao_id and x.tipo in ('PRO_RATA', 'CANCELAMENTO', 'AJUSTE_AGRUPADO')) then
    return new;
  end if;

  v_dias := revistoria_hoje() - dia_util_seguinte(new.vencimento);
  if v_dias <= v_corte then
    return new;
  end if;

  select cliente_id into v_cli from cobranca_renegociacoes where id = new.renegociacao_id;
  if new.origem = 'MUTUAL' then
    select veiculo_id into v_veic from boletos_historico where id = new.boleto_historico_id;
  else
    select veiculo_id into v_veic from titulos_financeiros where id = new.titulo_id;
  end if;

  for r in
    select v.id, v.placa, v.chassi from veiculos v
     where (v.id = v_veic or (v_veic is null and v.cliente_id = v_cli))
       and revistoria_veiculo_na_base(v.status::text)
  loop
    update revistorias_cobranca rc set renegociacao_id = new.renegociacao_id
     where rc.veiculo_id = r.id
       and revistoria_libera(rc, new.renegociacao_id);
    if not found then
      raise exception 'REVISTORIA PENDENTE: o veiculo % tem boleto vencido ha % dias (o limite e %). A 2a via so sai com a revistoria aprovada — ou liberada com justificativa.',
        coalesce(r.placa, '0 KM chassi ' || right(coalesce(r.chassi, ''), 6)), v_dias, v_corte
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

create or replace function registrar_baixa_original(
  p_origem_id uuid,
  p_status    text,
  p_erro      text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o cobranca_renegociacao_origens%rowtype;
  v_r cobranca_renegociacoes%rowtype;
  v_s text := upper(coalesce(p_status, ''));
begin
  select * into v_o from cobranca_renegociacao_origens where id = p_origem_id for update;
  if not found then raise exception 'Origem nao encontrada.' using errcode = 'no_data_found'; end if;
  select * into v_r from cobranca_renegociacoes where id = v_o.renegociacao_id;
  if auth.uid() is not null and not cobranca_pode_cliente(v_r.cliente_id) then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;
  if v_r.situacao <> 'EMITIDA' then
    raise exception 'So se baixa o original depois que o boleto novo foi emitido.' using errcode = 'check_violation';
  end if;
  if v_s not in ('BAIXADO', 'ERRO', 'SEM_REGISTRO') then
    raise exception 'Status de baixa invalido.' using errcode = 'check_violation';
  end if;
  if v_o.baixa_status in ('BAIXADO', 'SEM_REGISTRO') then
    return v_o.baixa_status;   -- re-executavel
  end if;

  update cobranca_renegociacao_origens
     set baixa_status = v_s,
         baixa_erro   = case when v_s = 'ERRO' then nullif(btrim(coalesce(p_erro, '')), '') end,
         baixado_em   = case when v_s = 'ERRO' then null else now() end
   where id = p_origem_id;

  if v_s <> 'ERRO' then
    if v_o.origem = 'MUTUAL' then
      update boletos_historico
         set situacao = 'cancelado', renegociacao_id = v_r.id, atualizado_em = now()
       where id = v_o.boleto_historico_id and baixa_banco_em is null;
    else
      update titulos_financeiros
         set status = 'cancelado',
             observacao = coalesce(observacao || ' · ', '')
                          || case when v_r.tipo = 'CANCELAMENTO'
                                  then 'Cancelado: ' || coalesce(v_r.observacao, '')
                                  when v_r.tipo = 'AJUSTE_AGRUPADO'
                                  then 'Substituido: ' || coalesce(v_r.observacao, '')
                                  else 'renegociado' end
       where id = v_o.titulo_id and status::text in ('pendente', 'vencido');
    end if;
  end if;
  return v_s;
end;
$$;

-- (C) backfill ---------------------------------------------------------------
-- Boletos de mensalidade JA PAGOS sem comissao (as 2as vias pagas antes da
-- 0159). Idempotente; veiculo sem vendedor continua sem.
do $$
declare
  r record;
begin
  for r in
    select t.id from titulos_financeiros t
     where t.status = 'pago'
       and t.tipo_avulso_id is null
       and not exists (select 1 from comissoes_vendas c where c.titulo_id = t.id)
  loop
    perform gerar_comissoes_titulo(r.id);
  end loop;
end $$;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
