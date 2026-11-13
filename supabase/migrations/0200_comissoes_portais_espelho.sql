-- ============================================================================
-- SCar :: 0200_comissoes_portais_espelho.sql
-- OS PORTAIS (franquia e vendedor) ESPELHAM A MATRIZ NAS COMISSOES.
--
-- Conferencia de 13/11/2026: os portais liam so comissoes_vendas (titulos do
-- SCar), entao nao viam os boletos do Mutual (~95% do recebido), misturavam
-- adesao com recorrencia, contavam pela data de criacao (no vendedor, em UTC)
-- e a 0198 marcava a comissao como "paga" ja ao gerar o contas a pagar.
--
-- Decisoes do usuario (13/11/2026):
--   1. a franquia repassa aos consultores com UM TITULO POR CONSULTOR, agrupado
--      pelo periodo consultado (data do credito no banco, como o relatorio 0199);
--   2. comissao de ADESAO some dos portais: adesao e boleto avulso proprio e
--      nunca se mistura com a recorrencia.
--
-- O que muda:
--   (A) cobranca_escopo() aceita a GUC local scar.cobranca_global, que so as
--       funcoes do portal do vendedor ligam (para ler os boletos dos veiculos
--       dele); o PostgREST nao alcanca set_config, e a GUC morre com a transacao.
--   (B) _comissoes_relatorio: o nucleo do relatorio 0199 (sem permissao, com o
--       escopo ja resolvido), agora sabendo do repasse da franquia. As publicas
--       comissoes_consultores_relatorio(_json) seguem com a mesma assinatura e
--       o mesmo resultado, so passam por ele.
--   (C) repasse da franquia: comissoes_franquia_lotes/_itens e
--       regional_gerar_repasse_comissoes (1 titulo por consultor, contas a pagar
--       da unidade, conta de comissao). Quitou -> pago; cancelou -> volta.
--   (D) comissoes_vendas recorrente so vira "pago" na QUITACAO do titulo (da
--       matriz ou da franquia): a 0198 marcava ao gerar. Trava por trigger:
--       repasse linha a linha (0034/0037) fica so para adesao.
--   (E) vendedor_comissoes_relatorio_json e vendedor_painel (mesma assinatura)
--       pela fonte unica; leads pela data em Sao Paulo; veiculos na base.
--   (F) regional_comissao_da_matriz: o que a franquia tem a receber da matriz.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) escopo da cobranca com a chave do portal do vendedor
-- ----------------------------------------------------------------------------
create or replace function cobranca_escopo()
returns table (global boolean, regionais uuid[])
language sql
stable
security definer
set search_path = public
as $$
  select
    (auth.uid() is null
      or tem_acesso_global()
      or (auth_papel()::text = 'cobranca' and auth_regional_id() is null)
      or coalesce(current_setting('scar.cobranca_global', true), '') = 'on') as global,
    array(
      select auth_regional_id()
       where auth_papel()::text in ('gestor_regional', 'cobranca', 'supervisor')
         and auth_regional_id() is not null
      union
      select sr.regional_id
        from supervisor_regionais sr
       where auth_papel()::text = 'supervisor'
         and sr.usuario_id = auth.uid()
    ) as regionais;
$$;

-- ----------------------------------------------------------------------------
-- (C1) o repasse da franquia: lote + itens (um item = boleto x veiculo)
-- ----------------------------------------------------------------------------
create table if not exists comissoes_franquia_lotes (
  id              uuid primary key default gen_random_uuid(),
  regional_id     uuid not null references regionais(id) on delete restrict,
  periodo_inicio  date not null,
  periodo_fim     date not null,
  data_vencimento date not null,
  qtd_lancamentos integer not null default 0,
  qtd_itens       integer not null default 0,
  valor_total     numeric(14,2) not null default 0,
  created_by      uuid references usuarios(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists comissoes_franquia_itens (
  id                uuid primary key default gen_random_uuid(),
  lote_id           uuid not null references comissoes_franquia_lotes(id) on delete cascade,
  lancamento_id     uuid references lancamentos_financeiros(id) on delete cascade,
  regional_id       uuid not null references regionais(id) on delete restrict,
  vendedor_id       uuid not null references vendedores(id) on delete restrict,
  origem            text not null check (origem in ('SCAR', 'MUTUAL')),
  boleto_id         uuid not null,
  veiculo_id        uuid references veiculos(id) on delete set null,
  comissao_venda_id uuid references comissoes_vendas(id) on delete set null,
  data_credito      date,
  base_calculo      numeric(12,2) not null default 0,
  valor_comissao    numeric(12,2) not null default 0,
  data_pagamento    date,
  created_at        timestamptz not null default now()
);

create unique index if not exists uq_com_franquia_item
  on comissoes_franquia_itens (origem, boleto_id, coalesce(veiculo_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists idx_com_franquia_item_lanc on comissoes_franquia_itens (lancamento_id);
create index if not exists idx_com_franquia_item_vend on comissoes_franquia_itens (vendedor_id);

alter table comissoes_franquia_lotes enable row level security;
alter table comissoes_franquia_itens enable row level security;

drop policy if exists com_franquia_lotes_select on comissoes_franquia_lotes;
create policy com_franquia_lotes_select on comissoes_franquia_lotes for select to authenticated
  using ((select tem_acesso_global())
         or ((select auth_papel())::text = 'gestor_regional' and regional_id = (select auth_regional_id())));

drop policy if exists com_franquia_itens_select on comissoes_franquia_itens;
create policy com_franquia_itens_select on comissoes_franquia_itens for select to authenticated
  using ((select tem_acesso_global())
         or ((select auth_papel())::text = 'gestor_regional' and regional_id = (select auth_regional_id()))
         or vendedor_id = (select vendedor_atual()));

-- ----------------------------------------------------------------------------
-- (B) o nucleo do relatorio (0199) — sem permissao; quem chama resolve o escopo
-- ----------------------------------------------------------------------------
create or replace function _comissoes_relatorio(
  p_inicio      date,
  p_fim         date,
  p_reg         uuid,
  p_vendedor_id uuid
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
  documento         text,
  veiculo_id        uuid,
  comissao_venda_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  cfg  comissoes_config;
  v_vi date;
  v_vf date;
begin
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
      from cobranca_boletos_base(v_vi, v_vf, p_reg) x
     where x.situacao in ('pago_no_prazo', 'pago_em_atraso')
       and coalesce(x.valor_pago, x.valor) > 0
  ),
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
           cv.valor_comissao as cv_valor, cv.valor_assistencia_profissional as cv_ap, cv.cv_id,
           fi.valor_comissao as fr_valor, fi.data_pagamento as fr_pago, lf2.numero_documento as fr_doc
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
      left join comissoes_franquia_itens fi
             on fi.origem = pa.origem and fi.boleto_id = pa.boleto_id
            and fi.veiculo_id is not distinct from pa.vid
      left join lancamentos_financeiros lf2 on lf2.id = fi.lancamento_id
      left join lateral (
        select sum(x.valor_comissao) as valor_comissao, sum(x.valor_assistencia_profissional) as valor_assistencia_profissional,
               max(x.id::text)::uuid as cv_id
          from comissoes_vendas x
         where pa.origem = 'SCAR' and x.titulo_id = pa.boleto_id
           and x.veiculo_id is not distinct from pa.vid and not x.is_adesao
      ) cv on true
     where p_vendedor_id is null or ve.vendedor_id = p_vendedor_id
  ),
  calc as (
    select e.*,
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
         case when k.vend is null then 0
              when k.led_valor is not null then coalesce(k.led_ap, 0)
              when k.origem = 'SCAR' then coalesce(k.cv_ap, 0)
              when k.mut_ap then k.mut_valor
              else 0 end,
         case when k.vend is null then 0
              when k.led_valor is not null then k.led_valor
              when k.fr_valor is not null then k.fr_valor
              when cfg.exigir_vendedor_ativo and not coalesce(k.vend_ativo, false) then 0
              when k.origem = 'SCAR' then coalesce(k.cv_valor, 0)
              else k.mut_valor end,
         case when k.vend is null then 'SEM_CONSULTOR'
              when k.led_valor is not null and k.led_pago is not null then 'PAGO'
              when k.led_valor is not null and k.led_lanc is not null then 'A_PAGAR'
              when k.led_valor is not null then 'PENDENTE'
              when k.fr_valor is not null and k.fr_pago is not null then 'PAGO'
              when k.fr_valor is not null then 'A_PAGAR'
              when cfg.exigir_vendedor_ativo and not coalesce(k.vend_ativo, false) then 'CONSULTOR_INATIVO'
              when k.destino = 'FRANQUIA' then 'PELA_FRANQUIA'
              when k.destino = 'NENHUM' then 'SEM_COMISSAO'
              else 'NAO_APURADO' end,
         coalesce(k.led_doc, k.fr_doc),
         k.vid,
         k.cv_id
    from calc k
   order by coalesce(k.vend_nome, 'zzz'), k.dia_credito, k.placa_v;
end;
$$;

-- as publicas do 0199: mesma assinatura e resultado, pelo nucleo
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
declare
  v_reg uuid := escopo_regional(p_regional_id);
begin
  if not (tem_acesso_global() or auth_papel()::text = 'gestor_regional') then
    raise exception 'Sem permissao para o relatorio de comissoes.' using errcode = 'insufficient_privilege';
  end if;
  if not tem_acesso_global() and v_reg is null then return; end if;
  return query
  select r.data_credito, r.credito_estimado, r.data_pagamento, r.vencimento, r.origem, r.boleto_id,
         r.regional_id, r.regional_nome, r.quem_paga, r.vendedor_id, r.vendedor_nome, r.vendedor_ativo,
         r.associado, r.placa, r.valor_recebido, r.taxa, r.valor_assistencia, r.valor_comissao,
         r.situacao, r.documento
    from _comissoes_relatorio(p_inicio, p_fim, v_reg, p_vendedor_id) r;
end;
$$;

-- ----------------------------------------------------------------------------
-- (D) comissoes_vendas recorrente: "pago" so na quitacao
-- ----------------------------------------------------------------------------
create or replace function fn_comissao_venda_pago_guarda()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status_pagamento = 'pago' and old.status_pagamento is distinct from 'pago'
     and not new.is_adesao
     and coalesce(current_setting('scar.comissao_lote', true), '') <> 'on' then
    raise exception 'A comissao recorrente e paga pelo repasse do periodo (Comissoes -> Gerar repasse), nao linha a linha.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_comissao_venda_pago_guarda on comissoes_vendas;
create trigger trg_comissao_venda_pago_guarda
  before update of status_pagamento on comissoes_vendas
  for each row execute function fn_comissao_venda_pago_guarda();

-- (D1) 0198: gerar o contas a pagar nao marca mais a comissao do SCar como paga
create or replace function _comissoes_matriz_contas_pagar(
  p_competencia date, p_vencimento date, p_regional_id uuid, p_origem text, p_usuario uuid
)
returns comissoes_matriz_lotes
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg    comissoes_config;
  v_comp date := date_trunc('month', p_competencia)::date;
  v_fim  date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_cat  uuid := regional_categoria_movimento('COMISSAO_PAGAR');
  v_lote comissoes_matriz_lotes;
  g      record;
  v_lanc uuid;
  v_seq  integer := 0;
  v_k    integer;
begin
  select * into cfg from comissoes_config where id;
  if v_comp < cfg.competencia_inicial then
    raise exception 'As comissoes no SCar comecam na competencia %.', to_char(cfg.competencia_inicial, 'MM/YYYY');
  end if;
  if p_vencimento is null then raise exception 'Informe a data de vencimento.'; end if;

  perform _comissoes_matriz_gerar(m::date, p_regional_id)
     from generate_series(greatest(cfg.competencia_inicial, (v_comp - interval '5 months')::date),
                          v_comp, interval '1 month') m;

  insert into comissoes_matriz_lotes (competencia, regional_id, data_vencimento, origem, created_by)
    values (v_comp, p_regional_id, p_vencimento, p_origem, p_usuario) returning * into v_lote;

  for g in
    select c.regional_id, c.beneficiario,
           case when c.beneficiario = 'VENDEDOR' then c.vendedor_id end as vend,
           r.nome as reg_nome, coalesce(v.nome, u.nome, 'Consultor') as vend_nome,
           count(*)::int as qtd, sum(c.base_calculo) as base, sum(c.valor_comissao) as valor,
           min(c.competencia) as comp_min
      from comissoes_matriz c
      join regionais r on r.id = c.regional_id
      left join vendedores v on v.id = c.vendedor_id
      left join usuarios u   on u.id = v.usuario_id
     where c.lancamento_id is null
       and c.competencia >= cfg.competencia_inicial and c.competencia <= v_fim
       and (p_regional_id is null or c.regional_id = p_regional_id)
     group by 1, 2, 3, 4, 5
    having sum(c.valor_comissao) > 0
     order by 4, 2
  loop
    v_seq := v_seq + 1;
    insert into lancamentos_financeiros (
      tipo, descricao, categoria_dre_id, regional_id, vendedor_id, valor_original,
      data_emissao, data_vencimento, competencia, numero_documento, observacoes
    ) values (
      'DESPESA',
      case when g.beneficiario = 'FRANQUIA'
           then 'Comissao da franquia ' || to_char(v_comp, 'MM/YYYY') || ' - ' || g.reg_nome
           else 'Comissao recorrente ' || to_char(v_comp, 'MM/YYYY') || ' - ' || g.vend_nome || ' (' || g.reg_nome || ')' end,
      v_cat,
      case when g.beneficiario = 'FRANQUIA' then null else g.regional_id end,
      g.vend,
      g.valor, current_date, p_vencimento, v_comp,
      'COM-' || to_char(v_comp, 'YYYYMM') || '-' || substr(v_lote.id::text, 1, 4) || '-' || lpad(v_seq::text, 3, '0'),
      'Gestao de comissoes (matriz) | lote ' || v_lote.id || ' | ' || g.qtd || ' boleto(s) recebido(s) | base R$ '
        || to_char(g.base, 'FM999G999G990D00')
        || case when g.comp_min < v_comp then ' | inclui recebimentos atrasados desde ' || to_char(g.comp_min, 'MM/YYYY') else '' end
    ) returning id into v_lanc;

    update comissoes_matriz c set lancamento_id = v_lanc, lote_id = v_lote.id
     where c.lancamento_id is null
       and c.competencia >= cfg.competencia_inicial and c.competencia <= v_fim
       and c.regional_id = g.regional_id and c.beneficiario = g.beneficiario
       and (g.beneficiario = 'FRANQUIA' or c.vendedor_id = g.vend);
    get diagnostics v_k = row_count;

    update comissoes_matriz_lotes
       set qtd_lancamentos = qtd_lancamentos + 1, qtd_itens = qtd_itens + v_k, valor_total = valor_total + g.valor
     where id = v_lote.id;
  end loop;

  select * into v_lote from comissoes_matriz_lotes where id = v_lote.id;
  if v_lote.qtd_lancamentos = 0 then
    delete from comissoes_matriz_lotes where id = v_lote.id;
    raise exception 'Nenhuma comissao pendente para enviar ao contas a pagar ate esta competencia.';
  end if;
  return v_lote;
end;
$$;

-- (D2) 0198: a volta do financeiro marca a comissao do SCar so na quitacao
create or replace function fn_lanc_comissoes_matriz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  if not exists (select 1 from comissoes_matriz where lancamento_id = v_id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' or new.status = 'cancelado' then
    update comissoes_vendas cv set status_pagamento = 'pendente'
      from comissoes_matriz c
     where c.lancamento_id = v_id and c.comissao_venda_id = cv.id;
    update comissoes_matriz set lancamento_id = null, lote_id = null, data_pagamento = null
     where lancamento_id = v_id;
  elsif new.status = 'quitado' then
    update comissoes_matriz
       set data_pagamento = coalesce((select max(b.data_pagamento) from baixas_financeiras b
                                       where b.lancamento_id = v_id), current_date)
     where lancamento_id = v_id;
    perform set_config('scar.comissao_lote', 'on', true);
    update comissoes_vendas cv set status_pagamento = 'pago'
      from comissoes_matriz c
     where c.lancamento_id = v_id and c.comissao_venda_id = cv.id and cv.status_pagamento = 'pendente';
    perform set_config('scar.comissao_lote', '', true);
  elsif old.status = 'quitado' then
    update comissoes_matriz set data_pagamento = null where lancamento_id = v_id;   -- estorno
    update comissoes_vendas cv set status_pagamento = 'pendente'
      from comissoes_matriz c
     where c.lancamento_id = v_id and c.comissao_venda_id = cv.id;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- (D3) correcao do que a 0198 ja marcou como pago sem quitar
update comissoes_vendas cv set status_pagamento = 'pendente'
  from comissoes_matriz c
  join lancamentos_financeiros l on l.id = c.lancamento_id
 where c.comissao_venda_id = cv.id and cv.status_pagamento = 'pago' and not cv.is_adesao
   and l.status::text <> 'quitado';

-- ----------------------------------------------------------------------------
-- (C2) gerar o repasse da franquia: 1 titulo por consultor, pelo periodo
-- ----------------------------------------------------------------------------
create or replace function regional_gerar_repasse_comissoes(
  p_regional_id uuid,
  p_inicio      date,
  p_fim         date,
  p_vencimento  date
)
returns comissoes_franquia_lotes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg  uuid := escopo_regional(p_regional_id);
  v_nome text;
  v_dest text;
  v_cat  uuid := regional_categoria_movimento('COMISSAO_PAGAR');
  v_lote comissoes_franquia_lotes;
  g      record;
  v_lanc uuid;
  v_seq  integer := 0;
begin
  if v_reg is null then
    raise exception 'Escolha a unidade.' using errcode = 'insufficient_privilege';
  end if;
  if not (tem_acesso_global()
          or (auth_papel()::text = 'gestor_regional' and v_reg = auth_regional_id())) then
    raise exception 'Somente o gestor da unidade (ou a matriz) gera o repasse.' using errcode = 'insufficient_privilege';
  end if;
  if p_vencimento is null then raise exception 'Informe a data de vencimento.'; end if;

  select nome, comissao_matriz_destino into v_nome, v_dest from regionais where id = v_reg;
  if v_dest is distinct from 'FRANQUIA' then
    raise exception 'Nesta unidade quem paga os consultores e a matriz (Gestao de comissoes).';
  end if;

  insert into comissoes_franquia_lotes (regional_id, periodo_inicio, periodo_fim, data_vencimento, created_by)
    values (v_reg, p_inicio, p_fim, p_vencimento, auth.uid()) returning * into v_lote;

  -- os itens a repassar (lidos UMA vez), ainda sem titulo
  insert into comissoes_franquia_itens (
    lote_id, regional_id, vendedor_id, origem, boleto_id, veiculo_id, comissao_venda_id,
    data_credito, base_calculo, valor_comissao
  )
  select v_lote.id, v_reg, r.vendedor_id, r.origem, r.boleto_id, r.veiculo_id, r.comissao_venda_id,
         r.data_credito, r.valor_recebido, r.valor_comissao
    from _comissoes_relatorio(p_inicio, p_fim, v_reg, null) r
   where r.situacao = 'PELA_FRANQUIA' and r.vendedor_id is not null and r.valor_comissao > 0
     and r.regional_id = v_reg;

  for g in
    select i.vendedor_id, coalesce(v.nome, u.nome, 'Consultor') as nome,
           count(*)::int as qtd, sum(i.base_calculo) as base, sum(i.valor_comissao) as valor
      from comissoes_franquia_itens i
      join vendedores v on v.id = i.vendedor_id
      left join usuarios u on u.id = v.usuario_id
     where i.lote_id = v_lote.id
     group by 1, 2
     order by 2
  loop
    v_seq := v_seq + 1;
    insert into lancamentos_financeiros (
      tipo, descricao, categoria_dre_id, regional_id, vendedor_id, valor_original,
      data_emissao, data_vencimento, competencia, numero_documento, observacoes
    ) values (
      'DESPESA',
      'Comissao recorrente ' || to_char(p_inicio, 'DD/MM/YYYY') || ' a ' || to_char(p_fim, 'DD/MM/YYYY')
        || ' - ' || g.nome,
      v_cat, v_reg, g.vendedor_id, g.valor, current_date, p_vencimento,
      date_trunc('month', p_inicio)::date,
      'REP-' || to_char(p_fim, 'YYYYMMDD') || '-' || substr(v_lote.id::text, 1, 4) || '-' || lpad(v_seq::text, 3, '0'),
      'Repasse da franquia ' || v_nome || ' | lote ' || v_lote.id || ' | ' || g.qtd
        || ' boleto(s) creditado(s) | base R$ ' || to_char(g.base, 'FM999G999G990D00')
    ) returning id into v_lanc;

    update comissoes_franquia_itens set lancamento_id = v_lanc
     where lote_id = v_lote.id and vendedor_id = g.vendedor_id;

    update comissoes_franquia_lotes
       set qtd_lancamentos = qtd_lancamentos + 1, qtd_itens = qtd_itens + g.qtd, valor_total = valor_total + g.valor
     where id = v_lote.id;
  end loop;

  select * into v_lote from comissoes_franquia_lotes where id = v_lote.id;
  if v_lote.qtd_lancamentos = 0 then
    delete from comissoes_franquia_lotes where id = v_lote.id;
    raise exception 'Nenhuma comissao a repassar neste periodo.';
  end if;
  return v_lote;
end;
$$;

-- volta do financeiro da franquia: quitou -> pago; cancelou -> volta a repassar
create or replace function fn_lanc_comissoes_franquia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from comissoes_franquia_itens where lancamento_id = new.id) then
    return new;
  end if;

  if new.status = 'cancelado' then
    update comissoes_vendas cv set status_pagamento = 'pendente'
      from comissoes_franquia_itens i
     where i.lancamento_id = new.id and i.comissao_venda_id = cv.id;
    delete from comissoes_franquia_itens where lancamento_id = new.id;
  elsif new.status = 'quitado' then
    update comissoes_franquia_itens
       set data_pagamento = coalesce((select max(b.data_pagamento) from baixas_financeiras b
                                       where b.lancamento_id = new.id), current_date)
     where lancamento_id = new.id;
    perform set_config('scar.comissao_lote', 'on', true);
    update comissoes_vendas cv set status_pagamento = 'pago'
      from comissoes_franquia_itens i
     where i.lancamento_id = new.id and i.comissao_venda_id = cv.id and cv.status_pagamento = 'pendente';
    perform set_config('scar.comissao_lote', '', true);
  elsif old.status = 'quitado' then
    update comissoes_franquia_itens set data_pagamento = null where lancamento_id = new.id;
    update comissoes_vendas cv set status_pagamento = 'pendente'
      from comissoes_franquia_itens i
     where i.lancamento_id = new.id and i.comissao_venda_id = cv.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lanc_comissoes_franquia on lancamentos_financeiros;
create trigger trg_lanc_comissoes_franquia
  after update of status on lancamentos_financeiros
  for each row when (new.status is distinct from old.status)
  execute function fn_lanc_comissoes_franquia();

-- excluir o titulo: os itens saem pelo cascade; a comissao do SCar volta
create or replace function fn_lanc_comissoes_franquia_del()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update comissoes_vendas cv set status_pagamento = 'pendente'
    from comissoes_franquia_itens i
   where i.lancamento_id = old.id and i.comissao_venda_id = cv.id;
  return old;
end;
$$;

drop trigger if exists trg_lanc_comissoes_franquia_del on lancamentos_financeiros;
create trigger trg_lanc_comissoes_franquia_del
  before delete on lancamentos_financeiros
  for each row execute function fn_lanc_comissoes_franquia_del();

-- ----------------------------------------------------------------------------
-- (F) o que a franquia tem a receber da matriz, no periodo (data do credito)
-- ----------------------------------------------------------------------------
create or replace function regional_comissao_da_matriz(p_regional_id uuid, p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reg uuid := escopo_regional(p_regional_id);
  r     regionais;
  v_base numeric;
  v_res jsonb;
begin
  if v_reg is null or not (tem_acesso_global()
                           or (auth_papel()::text = 'gestor_regional' and v_reg = auth_regional_id())) then
    return null;
  end if;
  select * into r from regionais where id = v_reg;

  select coalesce(sum(q.valor_recebido), 0) into v_base
    from _comissoes_relatorio(p_inicio, p_fim, v_reg, null) q
   where q.regional_id = v_reg;

  select jsonb_build_object(
           'destino', r.comissao_matriz_destino,
           'taxa', coalesce(r.taxa_comissao_recorrente, 0),
           'base_recebida', v_base,
           'valor_estimado', round(v_base * coalesce(r.taxa_comissao_recorrente, 0), 2),
           'apurado', coalesce(sum(c.valor_comissao), 0),
           'a_pagar', coalesce(sum(c.valor_comissao) filter (where c.lancamento_id is not null and c.data_pagamento is null), 0),
           'pago', coalesce(sum(c.valor_comissao) filter (where c.data_pagamento is not null), 0))
    into v_res
    from comissoes_matriz c
   where c.beneficiario = 'FRANQUIA' and c.regional_id = v_reg
     and c.data_credito between p_inicio and p_fim;
  return v_res;
end;
$$;

-- ----------------------------------------------------------------------------
-- (E) portal do vendedor
-- ----------------------------------------------------------------------------
create or replace function vendedor_comissoes_relatorio_json(p_inicio date, p_fim date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eu  uuid := vendedor_atual();
  v_res jsonb;
begin
  if v_eu is null then return '[]'::jsonb; end if;
  perform set_config('scar.cobranca_global', 'on', true);
  select coalesce(jsonb_agg(to_jsonb(r) - 'comissao_venda_id' - 'veiculo_id'), '[]'::jsonb) into v_res
    from _comissoes_relatorio(p_inicio, p_fim, null, v_eu) r;
  perform set_config('scar.cobranca_global', '', true);
  return v_res;
end;
$$;

create or replace function vendedor_painel(
  p_inicio date,
  p_fim    date
)
returns table (
  vendedor_id        uuid,
  nome               text,
  codigo             text,
  regional_nome      text,
  leads_periodo      integer,
  leads_hotlink      integer,
  leads_convertidos  integer,
  leads_abertos      integer,
  taxa_conversao     numeric,
  veiculos_ativos    integer,
  comissao_periodo   numeric,
  comissao_pendente  numeric,
  comissao_paga      numeric,
  taxa_adesao        numeric,
  taxa_recorrente    numeric,
  dia_entrada        smallint,
  dia_recorrencia    smallint
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_eu   uuid := vendedor_atual();
  v_tot  numeric := 0;
  v_pend numeric := 0;
  v_pago numeric := 0;
begin
  if v_eu is null then return; end if;

  -- a comissao recorrente do periodo pela data do credito (a fonte da matriz)
  perform set_config('scar.cobranca_global', 'on', true);
  select coalesce(sum(q.valor_comissao), 0),
         coalesce(sum(q.valor_comissao) filter (where q.situacao <> 'PAGO'), 0),
         coalesce(sum(q.valor_comissao) filter (where q.situacao = 'PAGO'), 0)
    into v_tot, v_pend, v_pago
    from _comissoes_relatorio(p_inicio, p_fim, null, v_eu) q
   where q.situacao not in ('SEM_CONSULTOR', 'CONSULTOR_INATIVO', 'SEM_COMISSAO');
  perform set_config('scar.cobranca_global', '', true);

  return query
  with v as (select * from vendedores where id = v_eu),
  l as (
    select * from leads
     where leads.vendedor_id = v_eu
       and data_sp(leads.created_at) between p_inicio and p_fim
  ),
  prazo as (select * from prazo_pagamento_vendedor(v_eu))
  select
    v.id,
    coalesce(v.nome, u.nome, 'Vendedor'),
    v.codigo,
    r.nome,
    (select count(*)::int from l),
    (select count(*)::int from l where l.origem_hotlink is not null),
    (select count(*)::int from l where l.status::text = 'ATIVO'),
    (select count(*)::int from l where l.status::text not in ('ATIVO', 'PERDIDO')),
    case when (select count(*) from l) = 0 then 0::numeric
         else round((select count(*) from l where l.status::text = 'ATIVO')::numeric
                    * 100 / (select count(*) from l), 1) end,
    (select count(*)::int from veiculos ve
      where ve.vendedor_id = v.id
        and ve.status::text in ('ativo', 'em_evento', 'vistoria_pendente', 'inadimplente')),
    v_tot,
    v_pend,
    v_pago,
    v.taxa_comissao_adesao,
    v.taxa_comissao_recorrente,
    (select pr.dia_entrada from prazo pr),
    (select pr.dia_recorrencia from prazo pr)
  from v
  left join usuarios  u on u.id = v.usuario_id
  left join regionais r on r.id = v.regional_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- RITO 0052 + internas fora do alcance da sessao
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;

revoke execute on function _comissoes_matriz_gerar(date, uuid) from authenticated;
revoke execute on function _comissoes_matriz_contas_pagar(date, date, uuid, text, uuid) from authenticated;
revoke execute on function _comissoes_relatorio(date, date, uuid, uuid) from authenticated;
