-- ============================================================================
-- SCar :: 0158_assistencia_profissional.sql
-- ----------------------------------------------------------------------------
-- ASSISTENCIA PROFISSIONAL — o valor que o consultor embute na mensalidade
-- para a propria remuneracao. Pedido do usuario (28/10/2026), decisoes:
--   * o campo aparece para quem cota e NUNCA para o cliente: a proposta
--     publica mostra o total, sem linha propria;
--   * limite configuravel POR UNIDADE (padrao R$ 1,00 a R$ 40,00), e so as
--     unidades marcadas pagam (`regionais.paga_assistencia_profissional`);
--   * o valor INTEIRO e do consultor; a comissao percentual dele corre sobre
--     o resto da mensalidade (sem comissao sobre comissao);
--   * fica FORA do desconto da cotacao;
--   * no hotlink (o proprio cliente cota) entra R$ 0,00 — e o default.
--
-- (A) colunas: regionais (paga + min/max), cotacoes, veiculos e
--     comissoes_vendas (a parte da comissao que veio dela).
-- (B) `fn_cotacao_valida_desconto` recriada: valida o valor (so quando ele
--     MUDA) e soma-o ao total DEPOIS do desconto.
-- (C) `atualizar_cotacao` DROP + CREATE com `p_valor_assistencia_profissional`
--     no fim (nulo = mantem). Corpo da 0081.
-- (D) `autorizar_entrada_lead` recriada (mesma assinatura, corpo da 0145): o
--     valor da cotacao aceita vai no INSERT do veiculo — a primeira cobranca
--     nasce no insert (0025), um trigger depois chegaria tarde.
-- (E) `valor_mensalidade_veiculo` (corpo da 0081) soma o valor carimbado no
--     caminho sem override; o override ja o inclui.
-- (F) `fn_calcular_comissao` (corpo da 0145) separa a parte da Assistencia.
-- (G) MIGRADOS DO MUTUAL: o produto existe la ("Assistencia Profissional",
--     product_id 53, e os legados "N ASSISTENCIA PROFISSIONAL VVMIG"), sem
--     preco na listagem. O legado traz o valor no nome; o novo depende da
--     configuracao (`subproduct_config_id`), cujo valor a equipe informa uma
--     vez por configuracao. O boleto dos migrados NAO muda (override do
--     Mutual): carimbar o valor so separa a comissao.
-- ============================================================================

-- ---------------------------------------------------------------------
-- (A) Colunas
-- ---------------------------------------------------------------------
alter table regionais
  add column if not exists paga_assistencia_profissional boolean not null default false,
  add column if not exists assistencia_profissional_min numeric(12,2) not null default 1,
  add column if not exists assistencia_profissional_max numeric(12,2) not null default 40;

alter table regionais drop constraint if exists chk_regional_assistencia_profissional;
alter table regionais add constraint chk_regional_assistencia_profissional
  check (assistencia_profissional_min >= 0
         and assistencia_profissional_max >= assistencia_profissional_min
         and assistencia_profissional_max <= 1000);

comment on column regionais.paga_assistencia_profissional is
  'A unidade paga a Assistencia Profissional (embutida na mensalidade) aos seus consultores (0158).';

alter table cotacoes
  add column if not exists valor_assistencia_profissional numeric(12,2) not null default 0;
alter table cotacoes drop constraint if exists chk_cotacao_assistencia_profissional;
alter table cotacoes add constraint chk_cotacao_assistencia_profissional
  check (valor_assistencia_profissional >= 0);
comment on column cotacoes.valor_assistencia_profissional is
  'Assistencia Profissional do consultor (0158). Fica FORA do desconto e entra em total_com_desconto; nunca e item do detalhamento.';

alter table veiculos
  add column if not exists valor_assistencia_profissional numeric(12,2) not null default 0;
alter table veiculos drop constraint if exists chk_veiculo_assistencia_profissional;
alter table veiculos add constraint chk_veiculo_assistencia_profissional
  check (valor_assistencia_profissional >= 0);
comment on column veiculos.valor_assistencia_profissional is
  'Assistencia Profissional carimbada na entrada (0158). Somada a mensalidade so quando nao ha override; separa a comissao do vendedor.';

alter table comissoes_vendas
  add column if not exists valor_assistencia_profissional numeric(12,2) not null default 0;
comment on column comissoes_vendas.valor_assistencia_profissional is
  'Parte de valor_comissao que veio da Assistencia Profissional (0158). Ja somada em valor_comissao.';

-- ---------------------------------------------------------------------
-- Regras da unidade
-- ---------------------------------------------------------------------
-- A unidade que paga e a do VENDEDOR (e ele quem recebe); sem vendedor, a do
-- lead ou a de quem atende.
create or replace function regional_assistencia_do_lead(p_lead_id uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(v.regional_id, l.regional_id, u.regional_id)
    from leads l
    left join vendedores v on v.id = l.vendedor_id
    left join usuarios  u on u.id = l.consultor_id
   where l.id = p_lead_id;
$$;

-- A tela pergunta: esta cotacao pode ter Assistencia Profissional, e entre
-- quanto e quanto? Com lead, pela unidade dele; sem lead (a captura, antes
-- do lead nascer), pela unidade de quem cota.
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
    return query select null::uuid, null::text, false, 0::numeric, 0::numeric;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- (B) O desconto nao incide sobre a Assistencia; ela e validada aqui
-- ---------------------------------------------------------------------
-- Vale para QUALQUER caminho (atualizar_cotacao, insert direto do CRM). So
-- valida quando o valor MUDA: reconfigurar a unidade depois nao trava a
-- edicao de outra coisa na cotacao antiga.
create or replace function fn_cotacao_valida_desconto()
returns trigger
language plpgsql
as $$
declare
  v_reg    uuid;
  v_limite numeric;
  v_ap     numeric := round(coalesce(new.valor_assistencia_profissional, 0), 2);
  v_mudou  boolean;
  r        regionais;
begin
  new.valor_assistencia_profissional := v_ap;
  if tg_op = 'INSERT' then
    v_mudou := v_ap > 0;
  else
    v_mudou := v_ap is distinct from old.valor_assistencia_profissional;
  end if;
  if v_mudou and v_ap > 0 then
    select * into r from regionais where id = regional_assistencia_do_lead(new.lead_id);
    if r.id is null or not r.paga_assistencia_profissional then
      raise exception 'ASSISTENCIA_PROFISSIONAL: a unidade deste atendimento nao paga Assistencia Profissional'
        using errcode = 'check_violation';
    end if;
    if v_ap < r.assistencia_profissional_min or v_ap > r.assistencia_profissional_max then
      raise exception 'ASSISTENCIA_PROFISSIONAL: o valor deve ficar entre R$ % e R$ % (unidade %)',
        r.assistencia_profissional_min, r.assistencia_profissional_max, r.nome
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
-- (C) atualizar_cotacao: a lista de argumentos muda -> DROP + CREATE
-- ---------------------------------------------------------------------
drop function if exists atualizar_cotacao(uuid, numeric, uuid, uuid, uuid, uuid[], text, numeric, text, boolean);

create or replace function atualizar_cotacao(
  p_cotacao_id      uuid,
  p_fipe            numeric default null,
  p_tipo_veiculo_id uuid default null,
  p_cota_id         uuid default null,
  p_plano_id        uuid default null,
  p_opcionais_ids   uuid[] default null,
  p_modo_envio      text default null,
  p_desconto_percentual numeric default null,
  p_desconto_justificativa text default null,
  p_limpar_plano    boolean default false,
  p_valor_assistencia_profissional numeric default null
)
returns cotacoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg_preco uuid;
  v_adic      numeric := 0;
  c        cotacoes;
  v_lead   leads;
  v_calc   jsonb;
  v_itens  jsonb;
  v_fipe   numeric;
  v_tipo   uuid;
  v_plano  uuid;
  v_opc    uuid[];
  v_desc   numeric;
  v_reg    uuid;
  v_limite numeric;
  v_aprov  uuid;
  v_aprov_em timestamptz;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  select * into c from cotacoes where id = p_cotacao_id;
  if c.id is null then raise exception 'Cotacao nao encontrada'; end if;
  select * into v_lead from leads where id = c.lead_id;

  if not lead_em_negociacao(c.lead_id) then
    raise exception 'Cotacao bloqueada: o lead ja foi enviado para auditoria (status %)', v_lead.status;
  end if;

  v_fipe  := coalesce(p_fipe, c.fipe);
  v_tipo  := coalesce(p_tipo_veiculo_id, c.tipo_veiculo_id);
  -- Descer ate a base e uma escolha, nao um esquecimento: so limpa quem pediu.
  v_plano := case when p_limpar_plano then null else coalesce(p_plano_id, c.plano_id) end;
  v_opc   := coalesce(p_opcionais_ids, c.opcionais_ids, '{}'::uuid[]);
  if v_tipo is null then raise exception 'Informe o tipo de veiculo da cotacao'; end if;

  -- Motor de precos: base obrigatoria + itens do plano + opcionais escolhidos.
  -- 0081: a regional de PRECO e a do ASSOCIADO. Enquanto nao ha associado
  -- (cotacao de hotlink), vale a do lead — e o fechamento da venda recalcula.
  v_reg_preco := regional_preco_do_lead(c.lead_id);
  v_calc := cotar_plano(v_fipe, v_tipo, v_plano, v_opc, v_reg_preco);
  v_adic := coalesce((v_calc->>'adicional_regional')::numeric, 0);
  v_itens := coalesce(v_calc->'detalhamento_produtos', '[]'::jsonb);

  -- Seguranca: nenhum item obrigatorio pode ficar de fora do snapshot.
  if exists (
    select 1 from produtos_obrigatorios_cotacao(v_tipo, v_plano, v_fipe) o
     where not exists (
       select 1 from jsonb_array_elements(v_itens) i
        where (i->>'produto_id')::uuid = o.produto_id
     )
  ) then
    raise exception 'A edicao removeria itens obrigatorios do plano';
  end if;

  -- Desconto: mantem o atual quando nao informado.
  v_desc     := coalesce(p_desconto_percentual, c.desconto_percentual, 0);
  v_aprov    := c.desconto_aprovado_por;
  v_aprov_em := c.desconto_aprovado_em;

  if p_desconto_percentual is not null and p_desconto_percentual <> c.desconto_percentual then
    select coalesce(l.regional_id, u.regional_id) into v_reg
      from leads l left join usuarios u on u.id = l.consultor_id
     where l.id = c.lead_id;
    v_limite := limite_desconto_regional(v_reg);

    if v_desc > v_limite then
      -- Acima do limite: exige alcada + justificativa (a trava do trigger
      -- continua valendo para qualquer outro caminho).
      if not pode_aprovar_desconto() then
        raise exception 'DESCONTO_ACIMA_DO_LIMITE: % %% excede o limite de % %% da regional — necessaria aprovacao de gestor',
          v_desc, v_limite;
      end if;
      if p_desconto_justificativa is null or btrim(p_desconto_justificativa) = '' then
        raise exception 'Informe a justificativa da excecao de desconto';
      end if;
      v_aprov := auth.uid();
      v_aprov_em := now();
    else
      -- Dentro do limite: nao precisa de aprovacao.
      v_aprov := null;
      v_aprov_em := null;
    end if;
  end if;

  update cotacoes
     set regional_id = v_reg_preco,
         valor_adicional_regional = v_adic,
         fipe                 = v_fipe,
         tipo_veiculo_id      = v_tipo,
         cota_participacao_id = coalesce(p_cota_id, cota_participacao_id),
         plano_id             = v_plano,
         opcionais_ids        = v_opc,
         itens                = v_itens,
         total_mensalidade    = (v_calc->>'valor_total_mensalidade')::numeric,
         taxa_adesao          = coalesce((v_calc->>'taxa_adesao')::numeric, 0),
         participacao         = calcular_participacao(v_fipe, v_tipo, coalesce(p_cota_id, cota_participacao_id)),
         modo_envio           = coalesce(p_modo_envio, modo_envio),
         desconto_percentual  = v_desc,
         -- 0158: nulo = mantem; a validacao (limite e unidade) e do trigger.
         valor_assistencia_profissional = coalesce(round(p_valor_assistencia_profissional, 2),
                                                   valor_assistencia_profissional),
         desconto_aprovado_por = v_aprov,
         desconto_aprovado_em  = v_aprov_em,
         desconto_justificativa = case when v_aprov is null then null
                                       else coalesce(p_desconto_justificativa, desconto_justificativa) end,
         atualizada_em        = now(),
         atualizada_por       = auth.uid()
   where id = p_cotacao_id
   returning * into c;

  return c;
end;
$$;

-- ---------------------------------------------------------------------
-- (D) autorizar_entrada_lead: a Assistencia vai no INSERT do veiculo
-- ---------------------------------------------------------------------
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
  v_ap        numeric := 0;
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
  -- 0158: a ASSISTENCIA PROFISSIONAL sai da MESMA cotacao.
  select coalesce(c.valor_adicional_regional, 0), c.regional_id,
         coalesce(c.valor_assistencia_profissional, 0)
    into v_adic, v_reg_preco, v_ap
    from cotacoes c
   where c.lead_id = p_lead_id
   order by (c.id = l.aceite_cotacao_id) desc, c.created_at desc
   limit 1;

  insert into veiculos (cliente_id, placa, chassi, renavam, numero_motor, marca, modelo,
                        ano_fabricacao, ano_modelo, cor, valor_fipe, codigo_fipe, combustivel, uso,
                        tipo_veiculo_id, cota_participacao_id, modelo_id, regional_id,
                        vendedor_id, plano_protecao_id, status,
                        valor_adicional_regional, regional_preco_id, dia_vencimento,
                        valor_assistencia_profissional)
  values (v_cliente, upper(l.placa),
          nullif(upper(regexp_replace(coalesce(l.chassi, ''), '[^0-9A-Za-z]', '', 'g')), ''),
          nullif(regexp_replace(coalesce(l.renavam, ''), '[^0-9]', '', 'g'), ''),
          nullif(upper(btrim(coalesce(l.numero_motor, ''))), ''),
          l.marca, l.modelo, l.ano_fabricacao, l.ano_modelo, l.cor, l.valor_fipe, l.codigo_fipe,
          l.combustivel, l.uso, l.tipo_veiculo_id, l.cota_participacao_id, l.modelo_id,
          l.regional_id, l.vendedor_id, l.plano_id, 'ativo',
          coalesce(v_adic, 0), v_reg_preco, p_dia_vencimento::smallint,
          coalesce(v_ap, 0))
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

-- (E) valor_mensalidade_veiculo
create or replace function valor_mensalidade_veiculo(p_veiculo_id uuid)
returns numeric
language plpgsql
stable
as $$
declare
  v        veiculos;
  v_opcs   uuid[];
  v_valor  numeric;
begin
  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then return 0; end if;

  -- OVERRIDE: preco final negociado. Ele JA inclui o adicional (a tela que o
  -- grava cotou com a regional), entao somar de novo cobraria em dobro.
  if v.valor_mensalidade is not null and v.valor_mensalidade > 0 then
    return round(v.valor_mensalidade, 2);
  end if;

  if v.tipo_veiculo_id is null then return 0; end if;

  select coalesce(array_agg(produto_id), '{}'::uuid[]) into v_opcs
    from veiculo_produtos where veiculo_id = v.id;

  -- Matriz pura + o adicional CARIMBADO na entrada. Nao passamos a regional ao
  -- `cotar_plano` de proposito: ela releria o cadastro de hoje, e o veiculo na
  -- base nao flutua quando a unidade reajusta o adicional.
  v_valor := (
    cotar_plano(coalesce(v.valor_fipe, 0), v.tipo_veiculo_id, v.plano_protecao_id, v_opcs)
      ->>'valor_total_mensalidade'
  )::numeric;

  -- 0158: + a ASSISTENCIA PROFISSIONAL carimbada (o override ja a inclui).
  return round(coalesce(v_valor, 0) + coalesce(v.valor_adicional_regional, 0)
               + coalesce(v.valor_assistencia_profissional, 0), 2);
end;
$$;

-- (F) comissao: a parte da Assistencia Profissional e inteira do vendedor
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
  v_ap        numeric(12,2);
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

    -- 0158: ASSISTENCIA PROFISSIONAL. Na mensalidade (nunca no boleto da
    -- adesao), quando a unidade do VENDEDOR paga, o valor inteiro e do
    -- vendedor e a comissao percentual corre sobre o resto. Nunca passa da
    -- parte paga deste veiculo.
    v_ap := 0;
    if new.adesao_lead_id is null then
      select least(coalesce(ve.valor_assistencia_profissional, 0), greatest(coalesce(it.base, 0), 0))
        into v_ap
        from veiculos ve
        join regionais r on r.id = v_vendedor.regional_id and r.paga_assistencia_profissional
       where ve.id = it.veiculo_id;
      v_ap := coalesce(v_ap, 0);
    end if;

    insert into comissoes_vendas (
      vendedor_id, veiculo_id, titulo_id, valor_comissao, is_adesao, status_pagamento,
      valor_assistencia_profissional
    ) values (
      v_vendedor.id, it.veiculo_id, new.id,
      round((coalesce(it.base, 0) - v_ap) * coalesce(v_taxa, 0), 2) + v_ap,
      v_is_adesao, 'pendente', v_ap
    )
    on conflict (titulo_id, veiculo_id) do nothing;   -- idempotente
  end loop;

  return new;
end;
$$;
-- ---------------------------------------------------------------------
-- (G) MIGRADOS DO MUTUAL
-- ---------------------------------------------------------------------
-- Valor por configuracao do produto novo (o Mutual nao lista o preco).
create table if not exists mutual_assistencia_profissional_valores (
  subproduct_config_id text primary key,
  valor                numeric(12,2) not null check (valor >= 0 and valor <= 1000),
  definido_por         uuid references usuarios(id) on delete set null,
  definido_em          timestamptz not null default now()
);
alter table mutual_assistencia_profissional_valores enable row level security;
drop policy if exists mapv_select on mutual_assistencia_profissional_valores;
create policy mapv_select on mutual_assistencia_profissional_valores
  for select to authenticated using ((select tem_acesso_global()));

-- O valor que o NOME do produto legado carrega ("7 ASSISTENCIA PROFISSIONAL 28MIG" -> 28).
create or replace function mutual_valor_assistencia_do_nome(p_nome text)
returns numeric
language sql immutable as $$
  select nullif(
    replace(substring(upper(coalesce(p_nome, '')) from 'PROFISSIONAL\s+([0-9]+(?:[.,][0-9]+)?)'), ',', '.'),
    '')::numeric;
$$;

-- Uma linha por veiculo da base que tem o produto no Mutual.
create or replace function mutual_assistencia_profissional_veiculos(p_regional_id uuid default null)
returns table (
  veiculo_id uuid, placa text, associado text, regional_id uuid, regional_nome text,
  produto_nome text, subproduct_config_id text, valor_mutual numeric, valor_atual numeric,
  situacao text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (tem_acesso_global() or auth.uid() is null) then
    raise exception 'Sem permissao' using errcode = 'insufficient_privilege';
  end if;
  return query
  with prod as (
    select coalesce(c.payload->>'contract_object_id', c.id_externo) as obj,
           pr->>'product_name' as nome,
           pr->>'subproduct_config_id' as cfg
      from mutual_captura c
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(c.payload->'products') = 'array' then c.payload->'products' else '[]'::jsonb end
      ) pr
     where c.entidade = 'CONTRACT_OBJECT_PRODUCT'
       and not c.deletado
       and upper(texto_sem_acento(coalesce(pr->>'product_name', ''))) like '%ASSISTENCIA PROFISSIONAL%'
  ), um as (
    -- um produto por objeto (se vier repetido, o de maior valor conhecido)
    select distinct on (p.obj) p.obj, p.nome, p.cfg,
           coalesce(mutual_valor_assistencia_do_nome(p.nome), mv.valor) as valor
      from prod p
      left join mutual_assistencia_profissional_valores mv on mv.subproduct_config_id = p.cfg
     order by p.obj, coalesce(mutual_valor_assistencia_do_nome(p.nome), mv.valor) desc nulls last
  )
  select ve.id, ve.placa::text, cl.nome_razao_social::text, ve.regional_id, rg.nome::text,
         um.nome, case when mutual_valor_assistencia_do_nome(um.nome) is null then um.cfg end,
         um.valor, ve.valor_assistencia_profissional,
         case
           when um.valor is null then 'SEM_VALOR'
           when ve.valor_assistencia_profissional = um.valor then 'JA_APLICADO'
           when ve.valor_assistencia_profissional > 0 then 'DIFERENTE'
           else 'APLICAR'
         end
    from um
    join integracao_vinculos iv
      on iv.sistema = 'MUTUAL' and iv.entidade = 'CONTRACT_OBJECT'
     and iv.tabela = 'veiculos' and iv.id_externo = um.obj
    join veiculos ve on ve.id = iv.registro_id
    left join clientes cl on cl.id = ve.cliente_id
    left join regionais rg on rg.id = ve.regional_id
   where p_regional_id is null or ve.regional_id = p_regional_id
   order by rg.nome, ve.placa;
end;
$$;

-- O produto novo, por configuracao, com o peso e o valor ja informado.
create or replace function mutual_assistencia_profissional_configs()
returns table (subproduct_config_id text, veiculos bigint, valor numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (tem_acesso_global() or auth.uid() is null) then
    raise exception 'Sem permissao' using errcode = 'insufficient_privilege';
  end if;
  return query
    select coalesce(x.subproduct_config_id, '(sem configuracao)'), count(*), mv.valor
      from mutual_assistencia_profissional_veiculos(null) x
      left join mutual_assistencia_profissional_valores mv on mv.subproduct_config_id = x.subproduct_config_id
     where mutual_valor_assistencia_do_nome(x.produto_nome) is null
     group by 1, mv.valor
     order by 2 desc;
end;
$$;

create or replace function mutual_definir_valor_assistencia_profissional(p_config text, p_valor numeric)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_acesso_global() then
    raise exception 'Sem permissao' using errcode = 'insufficient_privilege';
  end if;
  if p_config is null or btrim(p_config) = '' then
    raise exception 'Informe a configuracao';
  end if;
  if p_valor is null then
    delete from mutual_assistencia_profissional_valores where subproduct_config_id = p_config;
    return;
  end if;
  if p_valor < 0 or p_valor > 1000 then
    raise exception 'Valor fora do intervalo (0 a 1000)' using errcode = 'check_violation';
  end if;
  insert into mutual_assistencia_profissional_valores (subproduct_config_id, valor, definido_por)
  values (p_config, round(p_valor, 2), usuario_atual_id())
  on conflict (subproduct_config_id)
    do update set valor = excluded.valor, definido_por = excluded.definido_por, definido_em = now();
end;
$$;

-- Carimba o valor nos veiculos em APLICAR (sem valor ainda). Nunca troca um
-- valor ja gravado e diferente. Sem p_confirmar so conta.
create or replace function mutual_aplicar_assistencia_profissional(
  p_regional_id uuid default null, p_confirmar boolean default false
)
returns table (aplicar bigint, ja_aplicado bigint, diferente bigint, sem_valor bigint, gravados bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_grav bigint := 0;
begin
  if not (tem_acesso_global() or auth.uid() is null) then
    raise exception 'Sem permissao' using errcode = 'insufficient_privilege';
  end if;
  if p_confirmar then
    update veiculos ve set valor_assistencia_profissional = x.valor_mutual
      from mutual_assistencia_profissional_veiculos(p_regional_id) x
     where x.veiculo_id = ve.id and x.situacao = 'APLICAR';
    get diagnostics v_grav = row_count;
  end if;
  return query
    select count(*) filter (where x.situacao = 'APLICAR' and not p_confirmar),
           count(*) filter (where x.situacao = 'JA_APLICADO'),
           count(*) filter (where x.situacao = 'DIFERENTE'),
           count(*) filter (where x.situacao = 'SEM_VALOR'),
           v_grav
      from mutual_assistencia_profissional_veiculos(p_regional_id) x;
end;
$$;

-- ---------------------------------------------------------------------
-- Rito de seguranca (0052)
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
