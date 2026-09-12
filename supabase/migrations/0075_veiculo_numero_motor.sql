-- ============================================================================
-- 0075 — NUMERO DO MOTOR: o campo que faltava para o registro caber na ficha
-- ============================================================================
-- A consulta por placa (Placa Fipe) SEMPRE devolveu o registro do documento no
-- bloco `informacoes_veiculo` — chassi, cor, municipio e o **numero do motor** —
-- e o nosso proxy lia so a avaliacao (`fipe[]`) e descartava o resto. Corrigido
-- do lado da aplicacao (`registroDaPlaca`, com teste sobre o payload real).
--
-- Sobrou o que o banco nao tinha: `chassi` e `cor` ja existem em `veiculos`
-- (0001) e em `leads` (0034), mas **numero do motor nao existia em lugar
-- nenhum**. Sem coluna, o dado chegaria da API e seria jogado fora de novo, so
-- que um passo adiante.
--
-- Entra nas DUAS pontas de propósito: o veiculo nasce por dois caminhos — o
-- cadastro direto (`/veiculos`) e a ROTA DA VENDA (lead -> Auditoria ->
-- `autorizar_entrada_lead`). Uma coluna so em `veiculos` faria o motor existir
-- no cadastro manual e sumir em toda venda, que e justamente o caminho em que a
-- placa e consultada primeiro.
--
-- ⚠️ NAO E UNIQUE, e isso e decisao, nao esquecimento. Motor se troca (motor
-- novo no mesmo carro, motor recuperado em outro) e base legada tem repetido e
-- digitado errado. Um unique aqui recusaria cadastro legitimo no balcao; a
-- duplicidade que interessa e RELATORIO, no padrao de
-- `rastreadores_divergencias` (0050), nao constraint.
-- ============================================================================

alter table veiculos add column if not exists numero_motor text;
alter table leads    add column if not exists numero_motor text;

comment on column veiculos.numero_motor is
  'Numero do motor (registro do documento). Vem da consulta por placa; nao e unique — ver 0075.';
comment on column leads.numero_motor is
  'Numero do motor capturado na venda; `autorizar_entrada_lead` o leva para o veiculo.';

-- ----------------------------------------------------------------------------
-- A entrada na base passa a carregar o motor
-- ----------------------------------------------------------------------------
-- Recriada a partir da versao da 0034 com UMA mudanca: `numero_motor` no insert
-- de `veiculos`, normalizado do mesmo jeito que o chassi ali do lado (caixa
-- alta, vazio vira NULL). O resto do corpo e identico — a assinatura e o
-- retorno nao mudam, entao `create or replace` basta.
create or replace function autorizar_entrada_lead(p_lead_id uuid, p_cpf_cnpj text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
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
begin
  if not pode_auditar() then
    raise exception 'Sem permissao: apenas a Auditoria pode autorizar a entrada na base';
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

  -- Veiculo oficial, agora com a ficha completa.
  insert into veiculos (cliente_id, placa, chassi, renavam, numero_motor, marca, modelo,
                        ano_fabricacao, ano_modelo, cor, valor_fipe, codigo_fipe, combustivel, uso,
                        tipo_veiculo_id, cota_participacao_id, modelo_id, regional_id,
                        vendedor_id, plano_protecao_id, status)
  values (v_cliente, upper(l.placa),
          nullif(upper(regexp_replace(coalesce(l.chassi, ''), '[^0-9A-Za-z]', '', 'g')), ''),
          nullif(regexp_replace(coalesce(l.renavam, ''), '[^0-9]', '', 'g'), ''),
          nullif(upper(btrim(coalesce(l.numero_motor, ''))), ''),
          l.marca, l.modelo, l.ano_fabricacao, l.ano_modelo, l.cor, l.valor_fipe, l.codigo_fipe,
          l.combustivel, l.uso, l.tipo_veiculo_id, l.cota_participacao_id, l.modelo_id,
          l.regional_id, l.vendedor_id, l.plano_id, 'ativo')
  returning id into v_veiculo;

  -- A vistoria feita na venda passa a ser a vistoria do veiculo.
  update vistorias set veiculo_id = v_veiculo, status = 'APROVADA'
   where lead_id = p_lead_id and veiculo_id is null;

  -- ---------------------------------------------------------------- adesao
  select * into v_vend from vendedores where id = l.vendedor_id;
  v_comissao := round(coalesce(l.adesao_valor, 0) * coalesce(v_vend.taxa_comissao_adesao, 0), 2);

  if l.adesao_forma::text = 'VENDEDOR_NA_HORA' then
    -- O dinheiro nunca passou pela associacao: NADA entra no financeiro.
    -- Fica so o registro da comissao, ja quitada na origem.
    insert into comissoes_vendas (vendedor_id, veiculo_id, valor_comissao, is_adesao, status_pagamento)
    values (l.vendedor_id, v_veiculo, coalesce(l.adesao_valor, 0), true, 'pago');
  else
    -- Recebido pelo nosso sistema: vira titulo a receber e a comissao do
    -- vendedor nasce PENDENTE (sai depois, no repasse).
    select id into v_cat from categorias_dre where codigo_estruturado = '1.1.01';
    insert into lancamentos_financeiros
      (tipo, cliente_id, descricao, categoria_dre_id, regional_id, valor_original,
       data_emissao, data_vencimento, competencia, forma_pagamento_prevista, observacoes)
    values ('RECEITA', v_cliente,
            'Taxa de adesao - ' || upper(l.placa),
            v_cat, l.regional_id, l.adesao_valor,
            current_date, coalesce(l.adesao_recebida_em, current_date), current_date,
            (case l.adesao_forma::text when 'BOLETO' then 'BOLETO'
                                       when 'PIX' then 'PIX'
                                       else 'CARTAO' end)::forma_pagamento,
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

-- ============================================================================
-- RITO DE SEGURANCA (0052)
-- ============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
