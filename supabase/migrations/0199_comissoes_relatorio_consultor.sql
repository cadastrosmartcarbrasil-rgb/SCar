-- ============================================================================
-- SCar :: 0199_comissoes_relatorio_consultor.sql
-- RELATORIO DE COMISSOES POR CONSULTOR, filtrado pela DATA DO CREDITO.
--
-- Pedido do usuario (13/11/2026): relatorio por consultor, exportavel em PDF e
-- Excel, com filtro entre datas — e a data de referencia e a do RECEBIMENTO do
-- boleto, o dia em que o dinheiro CREDITOU no caixa/banco (nao o vencimento,
-- nao o dia em que o associado pagou).
--
-- Data do credito de cada boleto (a mesma regua da Tesouraria, 0119/0146):
--   SCar   -> titulos_financeiros.data_credito (baixa pelo banco: PIX no dia,
--             COMPE/REDE no dia util seguinte); sem ela, a data do pagamento.
--   Mutual -> a baixa do recebimento ligado ao boleto (boletos_historico.
--             lancamento_id: Sicredi 0117/0146 e MutualPay 0185/0189 gravam a
--             baixa NA DATA DO CREDITO); sem recebimento ligado (pago fora do
--             nosso banco), a data do pagamento — marcada como ESTIMADA.
--
-- O valor da comissao de cada boleto e o MESMO da gestao (0198) e das regras
-- antigas, nunca uma conta nova:
--   * linha do ledger da matriz (comissoes_matriz) quando existe -> ela manda,
--     com a situacao (pendente / a pagar / paga);
--   * boleto do SCar -> a comissao que o trigger ja gerou (comissoes_vendas,
--     0191: rateio + Assistencia Profissional 0159), sem adesao;
--   * boleto do Mutual -> recebido x taxa do consultor, ou a Assistencia
--     Profissional no lugar quando a unidade repassa (a regra de 0159/0198).
-- So boletos com VENCIMENTO a partir da competencia inicial (11/2026): antes
-- disso nao ha comissao no SCar (decisao de 12/11/2026).
--
-- E grava data_credito no ledger (trigger), para a tela mostrar e exportar.
-- So leitura alem disso: nao muda valor, nao gera nada no financeiro.
-- ============================================================================

-- (A) a data do credito de UM boleto ------------------------------------------
create or replace function data_credito_boleto(p_origem text, p_boleto_id uuid)
returns table (data_credito date, estimada boolean)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(t.data_credito, t.data_pagamento), t.data_credito is null
    from titulos_financeiros t
   where p_origem = 'SCAR' and t.id = p_boleto_id
  union all
  select coalesce(bx.dia, h.data_pagamento), bx.dia is null
    from boletos_historico h
    left join lateral (
      select max(b.data_pagamento) as dia
        from baixas_financeiras b
       where h.lancamento_id is not null and b.lancamento_id = h.lancamento_id
    ) bx on true
   where p_origem = 'MUTUAL' and h.id = p_boleto_id;
$$;

-- (B) o ledger guarda o credito -----------------------------------------------
alter table comissoes_matriz add column if not exists data_credito date;
alter table comissoes_matriz add column if not exists credito_estimado boolean not null default false;
create index if not exists idx_com_matriz_credito on comissoes_matriz (data_credito);

create or replace function fn_comissoes_matriz_credito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  if new.data_credito is null then
    select * into r from data_credito_boleto(new.origem, new.boleto_id) limit 1;
    new.data_credito     := coalesce(r.data_credito, new.data_recebimento);
    new.credito_estimado := coalesce(r.estimada, true);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_comissoes_matriz_credito on comissoes_matriz;
create trigger trg_comissoes_matriz_credito
  before insert on comissoes_matriz
  for each row execute function fn_comissoes_matriz_credito();

update comissoes_matriz c
   set data_credito = coalesce((select d.data_credito from data_credito_boleto(c.origem, c.boleto_id) d limit 1),
                               c.data_recebimento),
       credito_estimado = coalesce((select d.estimada from data_credito_boleto(c.origem, c.boleto_id) d limit 1), true)
 where c.data_credito is null;

-- (C) o relatorio --------------------------------------------------------------
-- Uma linha por boleto x veiculo recebido (credito no intervalo). Quem nao tem
-- consultor aparece como "Sem consultor" (valor zero), para o total recebido
-- bater com o caixa.
create or replace function comissoes_consultores_relatorio(
  p_inicio      date,
  p_fim         date,
  p_regional_id uuid default null,
  p_vendedor_id uuid default null
)
returns table (
  data_credito      date,
  credito_estimado  boolean,
  data_pagamento    date,
  vencimento        date,
  origem            text,
  boleto_id         uuid,
  regional_id       uuid,
  regional_nome     text,
  quem_paga         text,
  vendedor_id       uuid,
  vendedor_nome     text,
  vendedor_ativo    boolean,
  associado         text,
  placa             text,
  valor_recebido    numeric,
  taxa              numeric,
  valor_assistencia numeric,
  valor_comissao    numeric,
  situacao          text,
  documento         text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  cfg   comissoes_config;
  v_reg uuid := escopo_regional(p_regional_id);
  v_vi  date;
  v_vf  date;
begin
  if not (tem_acesso_global() or auth_papel()::text = 'gestor_regional') then
    raise exception 'Sem permissao para o relatorio de comissoes.' using errcode = 'insufficient_privilege';
  end if;
  if not tem_acesso_global() and v_reg is null then return; end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then
    raise exception 'Informe o periodo (data inicial ate a final).';
  end if;
  if p_fim - p_inicio > 400 then
    raise exception 'Periodo maximo de 13 meses.';
  end if;

  select * into cfg from comissoes_config where id;
  -- boleto pago com ate 12 meses de atraso ou adiantado ate 3 meses
  v_vi := greatest(cfg.competencia_inicial, (p_inicio - interval '12 months')::date);
  v_vf := (p_fim + interval '3 months')::date;
  if v_vf < v_vi then return; end if;

  return query
  with b as (
    select x.origem, x.boleto_id, x.veiculo_id, x.regional_id, x.cliente_id, x.vencimento,
           x.data_pagamento, coalesce(x.valor_pago, x.valor) as recebido
      from cobranca_boletos_base(v_vi, v_vf, v_reg) x
     where x.situacao in ('pago_no_prazo', 'pago_em_atraso')
       and coalesce(x.valor_pago, x.valor) > 0
  ),
  -- data do credito (SCar pelo titulo; Mutual pela baixa do recebimento)
  c as (
    select b.*,
           case when b.origem = 'SCAR' then coalesce(t.data_credito, t.data_pagamento, b.data_pagamento)
                else coalesce(bx.dia, b.data_pagamento) end as dia_credito,
           case when b.origem = 'SCAR' then t.data_credito is null
                else bx.dia is null end as estimado
      from b
      left join titulos_financeiros t on b.origem = 'SCAR' and t.id = b.boleto_id
      left join boletos_historico h  on b.origem = 'MUTUAL' and h.id = b.boleto_id
      left join lateral (
        select max(bf.data_pagamento) as dia from baixas_financeiras bf
         where h.lancamento_id is not null and bf.lancamento_id = h.lancamento_id
      ) bx on true
  ),
  noperiodo as (
    select * from c where c.dia_credito between p_inicio and p_fim
  ),
  -- veiculos de cada boleto (agrupado reparte; com veiculo = ele mesmo)
  partes as (
    select n.*, n.veiculo_id as vid, n.recebido as base
      from noperiodo n
     where n.veiculo_id is not null and n.origem = 'MUTUAL'
    union all
    select n.*, p.vid, p.base
      from noperiodo n
      cross join lateral (
        select x.veiculo_id as vid,
               round(n.recebido * x.peso / nullif(sum(x.peso) over (), 0), 2) as base
          from veiculos_do_boleto_mutual(n.boleto_id) x
      ) p
     where n.veiculo_id is null and n.origem = 'MUTUAL'
    union all
    select n.*, p.vid, p.base
      from noperiodo n
      cross join lateral (
        select x.veiculo_id as vid,
               round(n.recebido * x.peso / nullif(sum(x.peso) over (), 0), 2) as base
          from rateio_mensalidade_titulo(n.boleto_id) x
      ) p
     where n.origem = 'SCAR'
  ),
  enr as (
    select pa.*, r.nome as reg_nome, r.comissao_matriz_destino as destino,
           coalesce(r.paga_assistencia_profissional, false) as repassa_ap,
           ve.vendedor_id as vend, ve.placa as placa_v, coalesce(ve.valor_assistencia_profissional, 0) as ap_veic,
           vd.ativo as vend_ativo, vd.taxa_comissao_recorrente as vend_taxa,
           coalesce(vd.nome, u.nome) as vend_nome, cl.nome_razao_social as cli_nome,
           cm.valor_comissao as led_valor, cm.taxa as led_taxa, cm.valor_assistencia_profissional as led_ap,
           cm.data_pagamento as led_pago, cm.lancamento_id as led_lanc, lf.numero_documento as led_doc,
           cv.valor_comissao as cv_valor, cv.valor_assistencia_profissional as cv_ap
      from partes pa
      join regionais r        on r.id = pa.regional_id
      left join veiculos ve   on ve.id = pa.vid
      left join vendedores vd on vd.id = ve.vendedor_id
      left join usuarios u    on u.id = vd.usuario_id
      left join clientes cl   on cl.id = pa.cliente_id
      left join comissoes_matriz cm
             on cm.origem = pa.origem and cm.boleto_id = pa.boleto_id and cm.beneficiario = 'VENDEDOR'
            and cm.veiculo_id is not distinct from pa.vid
      left join lancamentos_financeiros lf on lf.id = cm.lancamento_id
      left join lateral (
        select sum(x.valor_comissao) as valor_comissao, sum(x.valor_assistencia_profissional) as valor_assistencia_profissional
          from comissoes_vendas x
         where pa.origem = 'SCAR' and x.titulo_id = pa.boleto_id
           and x.veiculo_id is not distinct from pa.vid and not x.is_adesao
      ) cv on true
     where p_vendedor_id is null or ve.vendedor_id = p_vendedor_id
  ),
  calc as (
    select e.*,
           -- comissao do Mutual pela regra (AP no lugar quando a unidade repassa)
           case
             when e.vend is null then 0::numeric
             when e.repassa_ap and e.ap_veic > 0 then
               greatest(least(
                 case when coalesce(valor_mensalidade_veiculo(e.vid), 0) > 0
                      then round(e.ap_veic * coalesce(e.base, 0) / valor_mensalidade_veiculo(e.vid), 2)
                      else e.ap_veic end,
                 e.ap_veic, coalesce(e.base, 0)), 0)
             else round(coalesce(e.base, 0) * coalesce(e.vend_taxa, 0), 2)
           end as mut_valor,
           (e.repassa_ap and e.ap_veic > 0) as mut_ap
      from enr e
  )
  select k.dia_credito, k.estimado, k.data_pagamento, k.vencimento, k.origem, k.boleto_id,
         k.regional_id, k.reg_nome,
         case k.destino when 'VENDEDORES' then 'MATRIZ' when 'FRANQUIA' then 'FRANQUIA' else 'NENHUM' end,
         k.vend, coalesce(k.vend_nome, 'Sem consultor'), coalesce(k.vend_ativo, false),
         k.cli_nome, k.placa_v,
         coalesce(k.base, 0),
         coalesce(k.led_taxa, k.vend_taxa, 0),
         -- assistencia profissional
         case when k.vend is null then 0
              when k.led_valor is not null then coalesce(k.led_ap, 0)
              when k.origem = 'SCAR' then coalesce(k.cv_ap, 0)
              when k.mut_ap then k.mut_valor
              else 0 end,
         -- comissao do consultor
         case when k.vend is null then 0
              when k.led_valor is not null then k.led_valor
              when cfg.exigir_vendedor_ativo and not coalesce(k.vend_ativo, false) then 0
              when k.origem = 'SCAR' then coalesce(k.cv_valor, 0)
              else k.mut_valor end,
         -- situacao
         case when k.vend is null then 'SEM_CONSULTOR'
              when k.led_valor is not null and k.led_pago is not null then 'PAGO'
              when k.led_valor is not null and k.led_lanc is not null then 'A_PAGAR'
              when k.led_valor is not null then 'PENDENTE'
              when cfg.exigir_vendedor_ativo and not coalesce(k.vend_ativo, false) then 'CONSULTOR_INATIVO'
              when k.destino = 'FRANQUIA' then 'PELA_FRANQUIA'
              when k.destino = 'NENHUM' then 'SEM_COMISSAO'
              else 'NAO_APURADO' end,
         k.led_doc
    from calc k
   order by coalesce(k.vend_nome, 'zzz'), k.dia_credito, k.placa_v;
end;
$$;

-- (D) o mesmo relatorio numa resposta so (jsonb) ------------------------------
-- O PostgREST corta resposta em 1.000 LINHAS, em silencio, e um mes da carteira
-- tem ~2.500 boletos recebidos; paginar a RPC recalcularia tudo a cada pagina.
-- Um jsonb e UMA linha: a tela le o relatorio inteiro numa chamada.
create or replace function comissoes_consultores_relatorio_json(
  p_inicio      date,
  p_fim         date,
  p_regional_id uuid default null,
  p_vendedor_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    from comissoes_consultores_relatorio(p_inicio, p_fim, p_regional_id, p_vendedor_id) r;
$$;

-- RITO 0052 ------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;

revoke execute on function _comissoes_matriz_gerar(date, uuid) from authenticated;
revoke execute on function _comissoes_matriz_contas_pagar(date, date, uuid, text, uuid) from authenticated;
