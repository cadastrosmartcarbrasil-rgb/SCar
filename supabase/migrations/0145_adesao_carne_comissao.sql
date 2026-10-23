-- =====================================================================
-- SCar :: 0145_adesao_carne_comissao.sql
--
-- A NOVA ADESAO, DA VENDA AO CARNE. Pedido do usuario (23/10/2026):
-- adesao pela tabela, boleto da adesao emitido pela Smart Car, carne das
-- mensalidades no ato da aprovacao da Qualidade (Auditoria) e a comissao do
-- vendedor (adesao e recorrencia) pelas taxas do cadastro dele.
--
-- Decisoes do usuario (23/10/2026):
--   * o valor da adesao e o da COTACAO ACEITA (tabela de adesao ja com o
--     desconto aprovado pela alcada da 0028) — valor diferente nao entra;
--   * quando o VENDEDOR recebe na hora, ele fica com a adesao toda (como era);
--   * cartao recorrente fica para uma fase seguinte (Asaas).
--
-- O que ja estava ERRADO e esta migration corrige:
--   (1) o valor da adesao era digitado livre: o checklist so pedia > 0;
--   (2) "Smart Car emite o boleto da adesao" (forma BOLETO/PIX) criava so uma
--       conta a receber interna — nenhum boleto ia ao banco;
--   (3) a comissao de RECORRENCIA nunca saia para fatura AGRUPADA (o padrao):
--       o boleto agrupado nao carrega o veiculo e `fn_calcular_comissao`
--       saia cedo; e o mesmo boleto nem aparecia no DRE (o join com
--       `veiculos` o descartava);
--   (4) a comissao de adesao paga pela Smart Car nascia PENDENTE antes de o
--       associado pagar — agora nasce quando o boleto da adesao e PAGO;
--   (5) a remessa ao banco so rodava com sessao de admin/financeiro: a
--       Auditoria nao conseguia emitir o carne na aprovacao.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (A) A ADESAO DA TABELA: o valor e o da cotacao aceita
-- ---------------------------------------------------------------------
-- A cotacao (0018/0028) ja guarda `taxa_adesao` = calcular_adesao(fipe, tipo)
-- e `adesao_com_desconto` (o desconto so passa pela alcada). A cotacao
-- ACEITA manda; sem aceite, a mais recente.
create or replace function lead_adesao_tabela(p_lead_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(c.adesao_com_desconto, c.taxa_adesao)
    from cotacoes c
    join leads l on l.id = c.lead_id
   where c.lead_id = p_lead_id
     and (is_staff() or auth.uid() is null)
   order by (c.id = l.aceite_cotacao_id) desc, c.created_at desc, c.id desc
   limit 1;
$$;

comment on function lead_adesao_tabela(uuid) is
  'Valor da adesao pela tabela: o da cotacao aceita (ja com o desconto aprovado), senao o da mais recente (0145).';

-- Por QUALQUER caminho que grave a forma da adesao, o valor vem da tabela.
create or replace function fn_lead_adesao_da_tabela()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v numeric;
begin
  if new.adesao_forma is null then
    return new;
  end if;
  v := lead_adesao_tabela(new.id);
  if v is not null then
    new.adesao_valor := v;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lead_adesao_da_tabela on leads;
create trigger trg_lead_adesao_da_tabela
  before insert or update of adesao_forma, adesao_valor on leads
  for each row execute function fn_lead_adesao_da_tabela();

-- A cotacao mudou (outro plano, outra FIPE, desconto): a adesao acompanha.
create or replace function fn_cotacao_sincroniza_adesao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v numeric;
begin
  v := lead_adesao_tabela(new.lead_id);
  if v is not null then
    update leads set adesao_valor = v
     where id = new.lead_id
       and adesao_forma is not null
       and veiculo_id is null
       and adesao_valor is distinct from v;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_cotacao_sincroniza_adesao on cotacoes;
create trigger trg_cotacao_sincroniza_adesao
  after insert or update of taxa_adesao, adesao_com_desconto on cotacoes
  for each row execute function fn_cotacao_sincroniza_adesao();

-- Backfill: so os leads ainda nao convertidos (o que ja entrou na base ficou
-- com o valor que foi cobrado).
update leads l
   set adesao_valor = lead_adesao_tabela(l.id)
 where l.adesao_forma is not null
   and l.veiculo_id is null
   and lead_adesao_tabela(l.id) is not null
   and l.adesao_valor is distinct from lead_adesao_tabela(l.id);

-- ---------------------------------------------------------------------
-- (B) O BOLETO DA ADESAO e um titulo do SCar, marcado
-- ---------------------------------------------------------------------
alter table titulos_financeiros
  add column if not exists adesao_lead_id uuid references leads(id) on delete set null;

comment on column titulos_financeiros.adesao_lead_id is
  'Boleto da TAXA DE ADESAO desta venda (0145): entra no DRE como 1.1.01 e gera a comissao de adesao quando pago.';

create unique index if not exists uq_titulo_adesao_lead
  on titulos_financeiros (adesao_lead_id)
  where adesao_lead_id is not null and status <> 'cancelado';

-- ---------------------------------------------------------------------
-- (C) A AUTORIZACAO DA ENTRADA: dia de vencimento e boleto da adesao
-- ---------------------------------------------------------------------
-- A lista de argumentos muda: DROP + CREATE (sobrecarga deixaria a chamada
-- de dois argumentos ambigua).
drop function if exists autorizar_entrada_lead(uuid, text);

create or replace function autorizar_entrada_lead(
  p_lead_id           uuid,
  p_cpf_cnpj          text default null,
  p_dia_vencimento    int  default null,
  p_vencimento_adesao date default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_adic      numeric := 0;
  v_reg_preco uuid;
  l           leads;
  v_doc       text;
  v_tipo      tipo_pessoa;
  v_cliente   uuid;
  v_veiculo   uuid;
  v_pendente  text;
  v_vend      vendedores;
  v_comissao  numeric := 0;
  v_lanc      uuid;
  v_cat       uuid;
  v_adesao    numeric;
  v_hoje      date := (now() at time zone 'America/Sao_Paulo')::date;
  v_venc_ad   date;
begin
  if not pode_auditar() then
    raise exception 'Sem permissao: apenas a Auditoria pode autorizar a entrada na base';
  end if;
  if p_dia_vencimento is not null and (p_dia_vencimento < 1 or p_dia_vencimento > 31) then
    raise exception 'Dia de vencimento invalido (1 a 31)' using errcode = 'check_violation';
  end if;

  select * into l from leads where id = p_lead_id for update;
  if not found then raise exception 'Lead nao encontrado'; end if;
  if l.status <> 'EM_AUDITORIA' then
    raise exception 'Lead nao esta Em Auditoria (status atual: %)', l.status;
  end if;
  if l.veiculo_id is not null then raise exception 'Lead ja foi convertido'; end if;

  if p_cpf_cnpj is not null then
    update leads set cpf_cnpj = regexp_replace(p_cpf_cnpj, '[^0-9]', '', 'g')
     where id = p_lead_id;
    select * into l from leads where id = p_lead_id;
  end if;

  -- ADESAO PELA TABELA (0145): o valor e o da cotacao aceita, sempre.
  v_adesao := lead_adesao_tabela(p_lead_id);
  if v_adesao is null then
    raise exception 'Adesao sem valor de tabela: gere a cotacao do veiculo antes de autorizar'
      using errcode = 'check_violation';
  end if;
  if l.adesao_valor is distinct from v_adesao then
    update leads set adesao_valor = v_adesao where id = p_lead_id;
    select * into l from leads where id = p_lead_id;
  end if;

  -- TRAVA: o veiculo so entra na base com a ficha completa.
  select string_agg(item, '; ') into v_pendente
    from checklist_lead(p_lead_id) where not ok;
  if v_pendente is not null then
    raise exception 'Cadastro incompleto - falta: %', v_pendente
      using errcode = 'check_violation';
  end if;

  v_doc  := regexp_replace(coalesce(l.cpf_cnpj, ''), '[^0-9]', '', 'g');
  v_tipo := coalesce(l.tipo_pessoa, (case when length(v_doc) > 11 then 'PJ' else 'PF' end)::tipo_pessoa);

  -- Associado: reaproveita pelo documento (atualizando a ficha) ou cria.
  select id into v_cliente from clientes where cpf_cnpj = v_doc;
  if v_cliente is null then
    insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, rg_ie, email, telefone,
                          endereco, regional_id)
    values (v_tipo, l.nome, v_doc, l.rg_ie, l.email, l.celular, l.endereco, l.regional_id)
    returning id into v_cliente;
  else
    update clientes set
      nome_razao_social = coalesce(nullif(l.nome, ''), nome_razao_social),
      rg_ie             = coalesce(nullif(l.rg_ie, ''), rg_ie),
      email             = coalesce(nullif(l.email, ''), email),
      telefone          = coalesce(nullif(l.celular, ''), telefone),
      endereco          = case when l.endereco = '{}'::jsonb then endereco else l.endereco end
    where id = v_cliente;
  end if;

  -- ADICIONAL DE RISCO (0081): sai da COTACAO, nao do cadastro de hoje.
  select coalesce(c.valor_adicional_regional, 0), c.regional_id
    into v_adic, v_reg_preco
    from cotacoes c
   where c.lead_id = p_lead_id
   order by (c.id = l.aceite_cotacao_id) desc, c.created_at desc
   limit 1;

  insert into veiculos (cliente_id, placa, chassi, renavam, numero_motor, marca, modelo,
                        ano_fabricacao, ano_modelo, cor, valor_fipe, codigo_fipe, combustivel, uso,
                        tipo_veiculo_id, cota_participacao_id, modelo_id, regional_id,
                        vendedor_id, plano_protecao_id, status,
                        valor_adicional_regional, regional_preco_id, dia_vencimento)
  values (v_cliente, upper(l.placa),
          nullif(upper(regexp_replace(coalesce(l.chassi, ''), '[^0-9A-Za-z]', '', 'g')), ''),
          nullif(regexp_replace(coalesce(l.renavam, ''), '[^0-9]', '', 'g'), ''),
          nullif(upper(btrim(coalesce(l.numero_motor, ''))), ''),
          l.marca, l.modelo, l.ano_fabricacao, l.ano_modelo, l.cor, l.valor_fipe, l.codigo_fipe,
          l.combustivel, l.uso, l.tipo_veiculo_id, l.cota_participacao_id, l.modelo_id,
          l.regional_id, l.vendedor_id, l.plano_id, 'ativo',
          coalesce(v_adic, 0), v_reg_preco, p_dia_vencimento::smallint)
  returning id into v_veiculo;

  -- A vistoria feita na venda passa a ser a vistoria do veiculo.
  update vistorias set veiculo_id = v_veiculo, status = 'APROVADA'
   where lead_id = p_lead_id and veiculo_id is null;

  -- ---------------------------------------------------------------- adesao
  select * into v_vend from vendedores where id = l.vendedor_id;
  v_comissao := round(coalesce(l.adesao_valor, 0) * coalesce(v_vend.taxa_comissao_adesao, 0), 2);

  if l.adesao_forma::text = 'VENDEDOR_NA_HORA' then
    -- O dinheiro nunca passou pela associacao: NADA entra no financeiro.
    -- A adesao inteira e do vendedor (decisao do usuario, 23/10/2026).
    insert into comissoes_vendas (vendedor_id, veiculo_id, valor_comissao, is_adesao, status_pagamento)
    values (l.vendedor_id, v_veiculo, coalesce(l.adesao_valor, 0), true, 'pago');

  elsif l.adesao_forma::text in ('BOLETO', 'PIX') and coalesce(l.adesao_valor, 0) > 0 then
    -- 0145: a SMART CAR emite o boleto da adesao (boleto + PIX no Sicredi).
    -- Vira TITULO do SCar, marcado; a comissao de adesao nasce quando ele
    -- for PAGO (fn_calcular_comissao), nao antes.
    v_venc_ad := coalesce(p_vencimento_adesao, v_hoje + 3);
    if v_venc_ad < v_hoje then
      raise exception 'O vencimento do boleto da adesao nao pode ser no passado'
        using errcode = 'check_violation';
    end if;
    insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status,
                                     adesao_lead_id, observacao)
    values (v_cliente, v_veiculo, l.adesao_valor, v_venc_ad, 'pendente', p_lead_id,
            'Taxa de adesao - ' || coalesce(upper(l.placa), 'veiculo'));

  else
    -- CARTAO (maquininha / link): conta a receber, baixa manual com a forma.
    select id into v_cat from categorias_dre where codigo_estruturado = '1.1.01';
    insert into lancamentos_financeiros
      (tipo, cliente_id, descricao, categoria_dre_id, regional_id, valor_original,
       data_emissao, data_vencimento, competencia, forma_pagamento_prevista, observacoes)
    values ('RECEITA', v_cliente,
            'Taxa de adesao - ' || upper(coalesce(l.placa, '')),
            v_cat, l.regional_id, l.adesao_valor,
            current_date, coalesce(l.adesao_recebida_em, current_date), current_date,
            'CARTAO'::forma_pagamento,
            'Adesao da venda ' || p_lead_id::text)
    returning id into v_lanc;

    insert into comissoes_vendas (vendedor_id, veiculo_id, valor_comissao, is_adesao, status_pagamento)
    values (l.vendedor_id, v_veiculo, v_comissao, true, 'pendente');
  end if;

  update leads set
    status = 'ATIVO', cliente_id = v_cliente, veiculo_id = v_veiculo,
    cpf_cnpj = v_doc, auditado_em = now(), auditado_por = auth.uid()
  where id = p_lead_id;

  return v_veiculo;
end;
$$;

-- ---------------------------------------------------------------------
-- (D) A COMISSAO: adesao e recorrencia pelo cadastro do vendedor
-- ---------------------------------------------------------------------
-- Uma comissao por (titulo, veiculo): o boleto AGRUPADO paga varios
-- veiculos, possivelmente de vendedores diferentes.
alter table comissoes_vendas drop constraint if exists comissoes_vendas_titulo_id_key;
create unique index if not exists uq_comissao_titulo_veiculo
  on comissoes_vendas (titulo_id, veiculo_id);

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
begin
  -- dispara apenas na transicao para 'pago' (ignora se ja estava pago)
  if new.status <> 'pago' or old.status is not distinct from 'pago' then
    return new;
  end if;
  -- 0121: titulo de RENEGOCIACAO cobra divida antiga: nao gera comissao.
  if new.renegociacao_id is not null then
    return new;
  end if;

  v_pago := coalesce(new.valor_pago, new.valor);

  -- Os veiculos que este titulo paga, com a parte de cada um:
  --   titulo do veiculo -> ele, pelo valor pago;
  --   titulo da fatura AGRUPADA (0145) -> cada item, na proporcao do item.
  for it in
    select new.veiculo_id as veiculo_id, v_pago as base
     where new.veiculo_id is not null
    union all
    select fi.veiculo_id,
           round(v_pago * fi.valor / nullif(fa.valor_total, 0), 2)
      from faturas fa
      join fatura_itens fi on fi.fatura_id = fa.id
     where new.veiculo_id is null
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
    else
      -- adesao = primeiro titulo pago do veiculo, quando ele nao tem boleto de
      -- adesao proprio nem comissao de adesao — e nunca para veiculo migrado
      -- do Mutual, cuja adesao foi paga no sistema antigo (0095).
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

    insert into comissoes_vendas (
      vendedor_id, veiculo_id, titulo_id, valor_comissao, is_adesao, status_pagamento
    ) values (
      v_vendedor.id, it.veiculo_id, new.id, round(coalesce(it.base, 0) * coalesce(v_taxa, 0), 2),
      v_is_adesao, 'pendente'
    )
    on conflict (titulo_id, veiculo_id) do nothing;   -- idempotente
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- (E) O DRE: boleto agrupado entra; o boleto da adesao entra como adesao
-- ---------------------------------------------------------------------
-- So o bloco 3 muda: o titulo de fatura AGRUPADA (sem veiculo) era descartado
-- pelo join com `veiculos`; a unidade sai do veiculo, da fatura ou do
-- associado. O boleto da adesao vai para 1.1.01.
create or replace function dre_movimentos(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid  default null,
  p_regime      text  default 'CAIXA'
)
returns table (
  data             date,
  grupo            tipo_categoria_dre,
  categoria_codigo text,
  categoria_nome   text,
  centro_custo_id  uuid,
  valor            numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with regime as (select upper(coalesce(p_regime, 'CAIXA')) as r)

  -- 1) Contas a pagar / a receber (modulo financeiro)
  --    Caixa: pelas baixas (dinheiro que efetivamente circulou).
  select b.data_pagamento,
         coalesce(cat.tipo, (case when l.tipo = 'RECEITA' then 'RECEITA' else 'DESPESA_FIXA' end)::tipo_categoria_dre),
         coalesce(cat.codigo_estruturado, case when l.tipo = 'RECEITA' then '1.9.99' else '4.9.99' end),
         coalesce(cat.nome, case when l.tipo = 'RECEITA' then 'Receitas nao classificadas' else 'Despesas nao classificadas' end),
         l.centro_custo_id,
         case when l.tipo = 'RECEITA' then b.valor_liquido else -b.valor_liquido end
    from baixas_financeiras b
    join lancamentos_financeiros l on l.id = b.lancamento_id
    left join categorias_dre cat on cat.id = l.categoria_dre_id
   cross join regime
   where regime.r = 'CAIXA'
     and b.data_pagamento between p_data_inicio and p_data_fim
     and l.status <> 'cancelado'
     and ((select escopo_regional(p_regional_id)) is null
            or l.regional_id = (select escopo_regional(p_regional_id)))

  union all

  --    Competencia: pelo titulo, no mes de competencia, independente do pagamento.
  select l.competencia,
         coalesce(cat.tipo, (case when l.tipo = 'RECEITA' then 'RECEITA' else 'DESPESA_FIXA' end)::tipo_categoria_dre),
         coalesce(cat.codigo_estruturado, case when l.tipo = 'RECEITA' then '1.9.99' else '4.9.99' end),
         coalesce(cat.nome, case when l.tipo = 'RECEITA' then 'Receitas nao classificadas' else 'Despesas nao classificadas' end),
         l.centro_custo_id,
         case when l.tipo = 'RECEITA' then l.valor_original else -l.valor_original end
    from lancamentos_financeiros l
    left join categorias_dre cat on cat.id = l.categoria_dre_id
   cross join regime
   where regime.r = 'COMPETENCIA'
     and l.competencia between p_data_inicio and p_data_fim
     and l.status <> 'cancelado'
     and ((select escopo_regional(p_regional_id)) is null
            or l.regional_id = (select escopo_regional(p_regional_id)))

  union all

  -- 2) Movimentacoes de caixa avulsas (nao vinculadas a um titulo do modulo).
  select case when (select r from regime) = 'CAIXA'
              then coalesce(m.data_caixa, m.data_competencia) else m.data_competencia end,
         cat.tipo, cat.codigo_estruturado, cat.nome, null::uuid,
         case when m.tipo = 'RECEITA' then m.valor else -m.valor end
    from movimentacoes_caixa m
    join categorias_dre cat on cat.id = m.categoria_dre_id
   where m.status <> 'cancelado'
     and m.lancamento_id is null
     and (case when (select r from regime) = 'CAIXA'
               then coalesce(m.data_caixa, m.data_competencia) else m.data_competencia end)
         between p_data_inicio and p_data_fim
     and ((select escopo_regional(p_regional_id)) is null
            or m.regional_id = (select escopo_regional(p_regional_id)))

  union all

  -- 3) Mensalidades (e a adesao, 0145) dos associados nao espelhadas no caixa.
  select case when (select r from regime) = 'CAIXA' then t.data_pagamento else t.data_vencimento end,
         'RECEITA'::tipo_categoria_dre,
         case when t.adesao_lead_id is not null then '1.1.01' else '1.1.00' end,
         case when t.adesao_lead_id is not null then 'Receita de Adesao'
              else 'Receita de Mensalidades (Titulos)' end,
         null::uuid,
         case when (select r from regime) = 'CAIXA' then coalesce(t.valor_pago, 0) else t.valor end
    from titulos_financeiros t
    left join veiculos v on v.id = t.veiculo_id
    left join faturas fa on fa.titulo_id = t.id
    left join clientes cl on cl.id = t.cliente_id
   where t.status <> 'cancelado'
     and (t.veiculo_id is not null or fa.id is not null)
     and not exists (select 1 from movimentacoes_caixa mc where mc.titulo_id = t.id)
     and (case when (select r from regime) = 'CAIXA' then t.data_pagamento else t.data_vencimento end)
         between p_data_inicio and p_data_fim
     and (case when (select r from regime) = 'CAIXA' then t.status = 'pago' else true end)
     and ((select escopo_regional(p_regional_id)) is null
            or coalesce(v.regional_id, fa.regional_id, cl.regional_id) = (select escopo_regional(p_regional_id)))

  union all

  -- 4) Custo de sinistro: notas fiscais dos eventos (competencia = emissao).
  --    No regime de caixa entram apenas as que nao viraram titulo a pagar.
  select nf.data_emissao, 'CUSTO_VARIAVEL'::tipo_categoria_dre,
         '3.1.00', 'Custo com Sinistros (Notas Fiscais)', null::uuid, -nf.valor_nota
    from notas_fiscais_evento nf
    join eventos_sinistro e on e.id = nf.evento_id
   where (select r from regime) = 'COMPETENCIA'
     and nf.data_emissao between p_data_inicio and p_data_fim
     and ((select escopo_regional(p_regional_id)) is null
            or e.regional_id = (select escopo_regional(p_regional_id)));
$$;

-- ---------------------------------------------------------------------
-- (F) O CARNE DO VEICULO: N meses de mensalidade de uma vez
-- ---------------------------------------------------------------------
-- O carne e DO VEICULO: ele passa a ter boleto proprio (INDIVIDUAL_VEICULO).
-- Gerar meses de uma fatura AGRUPADA so com ele faria o lote mensal pular os
-- outros veiculos do associado naquelas competencias (a agrupada do mes ja
-- existiria) — seria cobrar menos de quem tem mais carros.
--
-- O primeiro boleto e o primeiro vencimento a pelo menos 2 dias de hoje. A
-- fatura que a entrada na base gerou (0025) num vencimento que ja passou e
-- sem boleto e CANCELADA (ou o item sai da agrupada): o primeiro boleto do
-- carne cobre esse periodo (ciclo pos-pago, 0144).
--
-- Devolve os titulos a enviar ao banco (inclusive o boleto da adesao ainda nao
-- registrado). Re-executavel: competencia ja faturada nao e refeita.
create or replace function gerar_carne_veiculo(
  p_veiculo_id uuid,
  p_meses      int
)
returns table (
  titulo_id   uuid,
  competencia date,
  vencimento  date,
  valor       numeric,
  adesao      boolean,
  registrado  boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v        veiculos;
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_comp   date;
  v_ini    date;
  f        record;
  m        int;
  t        titulos_financeiros;
begin
  if not (tem_acesso_global() or pode_auditar() or perfil_pode('cobranca', 'criar')) then
    raise exception 'Sem permissao para emitir o carne';
  end if;
  -- 0 = so o boleto da adesao (sem mensalidade nova).
  if p_meses is null or p_meses < 0 or p_meses > 12 then
    raise exception 'Quantidade de meses invalida (0 a 12)' using errcode = 'check_violation';
  end if;

  select * into v from veiculos where id = p_veiculo_id for update;
  if v.id is null then raise exception 'Veiculo nao encontrado'; end if;
  if not (tem_acesso_global() or pode_auditar() or pode_regional(v.regional_id)) then
    raise exception 'Veiculo fora da sua unidade';
  end if;
  if v.cobranca_externa then
    raise exception 'A mensalidade deste veiculo ainda e cobrada no Mutual (cobranca externa)'
      using errcode = 'check_violation';
  end if;
  if v.status::text not in ('ativo', 'em_evento', 'vistoria_pendente', 'inadimplente') then
    raise exception 'Veiculo fora da base (status %): nao ha mensalidade a emitir', v.status
      using errcode = 'check_violation';
  end if;
  if p_meses > 0 and valor_mensalidade_veiculo(v.id) <= 0 then
    raise exception 'Veiculo sem valor de mensalidade' using errcode = 'check_violation';
  end if;

  -- O carne e do veiculo.
  if p_meses > 0 and v.tipo_faturamento <> 'INDIVIDUAL_VEICULO' then
    update veiculos set tipo_faturamento = 'INDIVIDUAL_VEICULO' where id = v.id;
  end if;

  -- Primeira competencia: a primeira (desde a ativacao) cujo vencimento esta a
  -- pelo menos 2 dias.
  v_comp := date_trunc('month', coalesce(v.data_ativacao, v_hoje))::date;
  for m in 1 .. 24 loop
    exit when calcular_vencimento(v_comp, v.dia_vencimento) >= v_hoje + 2;
    v_comp := (v_comp + interval '1 month')::date;
  end loop;
  v_ini := v_comp;

  if p_meses > 0 then
  -- Fatura de antes do carne, sem boleto e com vencimento ja inviavel: sai.
  for f in
    select fa.id, fa.tipo_faturamento, fa.valor_total, fi.id as item_id, fi.valor as item_valor,
           (select count(*) from fatura_itens x where x.fatura_id = fa.id) as itens
      from faturas fa
      join fatura_itens fi on fi.fatura_id = fa.id and fi.veiculo_id = v.id
     where fa.competencia < v_ini
       and fa.status = 'ABERTA'
       and fa.titulo_id is null
  loop
    if f.itens <= 1 then
      update faturas set status = 'CANCELADA', updated_at = now() where id = f.id;
    else
      delete from fatura_itens where id = f.item_id;
      update faturas set valor_total = valor_total - f.item_valor, updated_at = now() where id = f.id;
    end if;
  end loop;

  -- A competencia do carne que ainda estiver numa agrupada aberta sem boleto
  -- sai dela (o veiculo agora tem fatura propria).
  for f in
    select fa.id, fi.id as item_id, fi.valor as item_valor,
           (select count(*) from fatura_itens x where x.fatura_id = fa.id) as itens
      from faturas fa
      join fatura_itens fi on fi.fatura_id = fa.id and fi.veiculo_id = v.id
     where fa.tipo_faturamento = 'AGRUPADO_ASSOCIADO'
       and fa.competencia >= v_ini
       and fa.competencia < (v_ini + make_interval(months => p_meses))::date
       and fa.status = 'ABERTA'
       and fa.titulo_id is null
  loop
    if f.itens <= 1 then
      update faturas set status = 'CANCELADA', updated_at = now() where id = f.id;
    else
      delete from fatura_itens where id = f.item_id;
      update faturas set valor_total = valor_total - f.item_valor, updated_at = now() where id = f.id;
    end if;
  end loop;

  for m in 0 .. p_meses - 1 loop
    v_comp := (v_ini + make_interval(months => m))::date;
    perform gerar_faturas_cliente_veiculos(v.cliente_id, v_comp, array[v.id]);
    for f in
      select fa.id from faturas fa
       where fa.veiculo_id = v.id and fa.competencia = v_comp
         and fa.tipo_faturamento = 'INDIVIDUAL_VEICULO'
         and fa.status <> 'CANCELADA'
    loop
      t := emitir_titulo_fatura(f.id);
      titulo_id := t.id; competencia := v_comp; vencimento := t.data_vencimento;
      valor := t.valor; adesao := false; registrado := t.linha_digitavel is not null;
      return next;
    end loop;
  end loop;
  end if;

  -- O boleto da adesao desta venda, se ainda nao foi ao banco.
  for t in
    select * from titulos_financeiros ta
     where ta.veiculo_id = v.id and ta.adesao_lead_id is not null
       and ta.status in ('pendente', 'vencido')
  loop
    titulo_id := t.id; competencia := null; vencimento := t.data_vencimento;
    valor := t.valor; adesao := true; registrado := t.linha_digitavel is not null;
    return next;
  end loop;
end;
$$;

comment on function gerar_carne_veiculo(uuid, int) is
  'Carne do veiculo (0145): N meses (0-12; 0 = so o boleto da adesao) de mensalidade a partir do primeiro vencimento viavel; o veiculo passa a INDIVIDUAL_VEICULO. Devolve os titulos (com o boleto da adesao) para a remessa.';

-- ---------------------------------------------------------------------
-- (G) A REMESSA aceita o servidor (rota do carne, com a sessao conferida)
-- ---------------------------------------------------------------------
-- Mesma trava de antes + o caminho sem sessao (service_role, padrao 0052):
-- a rota do carne confere quem chama ANTES (gerar_carne_veiculo pela sessao).
create or replace function criar_remessa_cobranca(
  p_titulo_ids  uuid[],
  p_integracao_id uuid default null,
  p_referencia  text default null
)
returns cobranca_remessas
language plpgsql
security definer
set search_path = public
as $$
declare
  r    cobranca_remessas;
  v_int uuid := p_integracao_id;
  v_reg uuid;
begin
  if not (tem_acesso_global() or auth.uid() is null) then raise exception 'Sem permissao'; end if;
  if p_titulo_ids is null or array_length(p_titulo_ids, 1) is null then
    raise exception 'Nenhum titulo informado';
  end if;

  if v_int is null then
    select id into v_int from integracoes_bancarias
     where ativo and is_padrao order by regional_id nulls last limit 1;
  end if;
  select regional_id into v_reg from integracoes_bancarias where id = v_int;

  insert into cobranca_remessas (integracao_id, regional_id, referencia, status, created_by)
    values (v_int, v_reg, p_referencia, 'PENDENTE', auth.uid())
    returning * into r;

  insert into cobranca_remessa_itens (remessa_id, titulo_id)
    select r.id, t.id
      from titulos_financeiros t
     where t.id = any(p_titulo_ids)
       and t.status in ('pendente', 'vencido')
       and t.linha_digitavel is null
       and not exists (
         select 1 from cobranca_remessa_itens i
          where i.titulo_id = t.id and i.status in ('PENDENTE', 'ENVIADO', 'CONFIRMADO')
       );

  update cobranca_remessas c
     set total_titulos = agg.qtd, total_valor = agg.soma
    from (
      select count(*)::int as qtd, coalesce(sum(t.valor), 0) as soma
        from cobranca_remessa_itens i
        join titulos_financeiros t on t.id = i.titulo_id
       where i.remessa_id = r.id
    ) agg
   where c.id = r.id
   returning * into r;

  return r;
end;
$$;

create or replace function marcar_remessa_enviada(p_remessa_id uuid)
returns cobranca_remessas
language plpgsql
security definer
set search_path = public
as $$
declare r cobranca_remessas;
begin
  if not (tem_acesso_global() or auth.uid() is null) then raise exception 'Sem permissao'; end if;
  update cobranca_remessas
     set status = 'PROCESSANDO', enviado_em = now(), updated_at = now()
   where id = p_remessa_id
   returning * into r;
  if r.id is null then raise exception 'Remessa nao encontrada'; end if;

  update cobranca_remessa_itens set status = 'ENVIADO', updated_at = now()
   where remessa_id = p_remessa_id and status = 'PENDENTE';

  update titulos_financeiros t
     set enviado_em = now(), gateway_status = 'ENVIADO', integracao_id = coalesce(t.integracao_id, r.integracao_id)
    from cobranca_remessa_itens i
   where i.remessa_id = p_remessa_id and i.titulo_id = t.id;

  return r;
end;
$$;

create or replace function registrar_retorno_cobranca(
  p_titulo_id       uuid,
  p_gateway_id      text default null,
  p_nosso_numero    text default null,
  p_linha_digitavel text default null,
  p_url_boleto      text default null,
  p_pix_copia_cola  text default null,
  p_pix_qrcode_url  text default null,
  p_erro            text default null,
  p_retorno         jsonb default null
)
returns titulos_financeiros
language plpgsql
security definer
set search_path = public
as $$
declare t titulos_financeiros;
begin
  if not (tem_acesso_global() or auth.uid() is null) then raise exception 'Sem permissao'; end if;

  update titulos_financeiros
     set gateway_transacao_id = coalesce(p_gateway_id, gateway_transacao_id),
         nosso_numero         = coalesce(p_nosso_numero, nosso_numero),
         linha_digitavel      = coalesce(p_linha_digitavel, linha_digitavel),
         url_boleto           = coalesce(p_url_boleto, url_boleto),
         pix_copia_cola       = coalesce(p_pix_copia_cola, pix_copia_cola),
         pix_qrcode_url       = coalesce(p_pix_qrcode_url, pix_qrcode_url),
         gateway_status       = case when p_erro is null then 'REGISTRADO' else 'ERRO' end,
         gateway_erro         = p_erro,
         updated_at           = now()
   where id = p_titulo_id
   returning * into t;
  if t.id is null then raise exception 'Titulo nao encontrado'; end if;

  update cobranca_remessa_itens
     set status  = (case when p_erro is null then 'CONFIRMADO' else 'ERRO' end)::status_remessa_item,
         erro    = p_erro,
         retorno = coalesce(p_retorno, retorno),
         updated_at = now()
   where titulo_id = p_titulo_id and status in ('PENDENTE', 'ENVIADO');

  return t;
end;
$$;

create or replace function finalizar_remessa(p_remessa_id uuid)
returns cobranca_remessas
language plpgsql
security definer
set search_path = public
as $$
declare
  r        cobranca_remessas;
  n_total  int;
  n_erro   int;
  n_ok     int;
begin
  if not (tem_acesso_global() or auth.uid() is null) then raise exception 'Sem permissao'; end if;

  select count(*)::int,
         count(*) filter (where status = 'ERRO')::int,
         count(*) filter (where status = 'CONFIRMADO')::int
    into n_total, n_erro, n_ok
    from cobranca_remessa_itens where remessa_id = p_remessa_id;

  update cobranca_remessas
     set status = (case
                     when n_total = 0 then 'ERRO'
                     when n_erro = 0 then 'CONCLUIDA'
                     when n_ok = 0 then 'ERRO'
                     else 'PARCIAL'
                   end)::status_remessa,
         retorno_em = now(),
         updated_at = now()
   where id = p_remessa_id
   returning * into r;

  if r.id is null then raise exception 'Remessa nao encontrada'; end if;
  return r;
end;
$$;

-- ============================================================================
-- Rito de seguranca (0052): funcao nasce com EXECUTE para PUBLIC.
-- ============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
