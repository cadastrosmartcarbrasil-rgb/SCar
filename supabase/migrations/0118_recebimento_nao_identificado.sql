-- ============================================================================
-- 0118 — RECEBIMENTO NAO IDENTIFICADO
-- ============================================================================
-- Decisao do usuario (18/10/2026): o pagamento que o Sicredi informa e que nao
-- casa com titulo do SCar nem com boleto do Mutual (23 de 13-16/10, R$ 4.487,25)
-- ENTROU NA CONTA, entao entra no caixa como "recebimento nao identificado":
--   * categoria nova 1.9.98, na MATRIZ (sem unidade), sem associado;
--   * baixa na conta SICREDI, NAO_CONCILIADO, mesma regra de data da 0117;
--   * so Sicredi de PRODUCAO e a partir de 13/10/2026 (inicio_baixa_banco_mutual);
--   * a trilha segue NAO_ENCONTRADO, agora com `lancamento_id` — e por isso o
--     reprocessar (0117) continua passando por ele.
-- Quando o pagador aparece:
--   * boleto do Mutual importado depois -> o MESMO lancamento vira a mensalidade
--     (associado, unidade, 1.1.00, competencia); nada e duplicado;
--   * titulo do SCar -> o nao identificado e CANCELADO (a baixa sai), para o
--     dinheiro nao contar duas vezes no DRE.
-- `registrar_liquidacao_banco` recriada com a MESMA assinatura.
-- ============================================================================

insert into categorias_dre (codigo_estruturado, nome, tipo)
select '1.9.98', 'Recebimentos nao identificados', 'RECEITA'
 where not exists (select 1 from categorias_dre where codigo_estruturado = '1.9.98');

create or replace function registrar_liquidacao_banco(
  p_provedor       text,
  p_ambiente       text,
  p_nosso_numero   text,
  p_seu_numero     text,
  p_data_pagamento date,
  p_valor_pago     numeric,
  p_dia_consultado date,
  p_payload        jsonb default null
) returns table (situacao text, titulo_id uuid, valor_divergente boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_nosso  text := nullif(trim(p_nosso_numero), '');
  v_seu    text := nullif(lower(regexp_replace(coalesce(p_seu_numero, ''), '[^0-9a-fA-F]', '', 'g')), '');
  v_tit    titulos_financeiros%rowtype;
  v_hist   boletos_historico%rowtype;
  v_qtd    int;
  v_sit    text;
  v_div    boolean := false;
  v_data   date := coalesce(p_data_pagamento, p_dia_consultado);
  v_lanc   uuid;
  v_valor  numeric(12,2);
  v_conta  uuid;
  v_cat    uuid;
  v_forma  forma_pagamento;
  v_ni     uuid;   -- recebimento nao identificado ja lancado para este pagamento
  v_cat_ni uuid;
begin
  -- Rotina do servidor (service_role, sem sessao) ou a matriz.
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Sem permissao para registrar baixa bancaria' using errcode = '42501';
  end if;
  if v_nosso is null then
    raise exception 'Pagamento sem nosso numero' using errcode = '22023';
  end if;
  if v_data is null then
    raise exception 'Pagamento sem data' using errcode = '22023';
  end if;

  -- Recebimento NAO IDENTIFICADO ja lancado para este pagamento (0118)?
  select id into v_cat_ni from categorias_dre where codigo_estruturado = '1.9.98';
  select lf.id into v_ni
    from cobranca_liquidacoes l
    join lancamentos_financeiros lf on lf.id = l.lancamento_id
   where l.provedor::text = p_provedor and l.ambiente::text = p_ambiente
     and l.nosso_numero = v_nosso and l.data_pagamento = v_data
     and lf.categoria_dre_id = v_cat_ni and lf.status <> 'cancelado';

  -- 1) titulo do SCar: nosso numero, dentro do provedor + ambiente que emitiu
  select t.* into v_tit
    from titulos_financeiros t
    join integracoes_bancarias i on i.id = t.integracao_id
   where t.nosso_numero = v_nosso
     and i.provedor::text = p_provedor
     and i.ambiente::text = p_ambiente
   order by t.created_at desc, t.id
   limit 1;

  -- 2) reserva: seuNumero, so com UM candidato
  if v_tit.id is null and v_seu is not null and length(v_seu) >= 8 then
    select count(*) into v_qtd
      from titulos_financeiros t
      join integracoes_bancarias i on i.id = t.integracao_id
     where replace(t.id::text, '-', '') like v_seu || '%'
       and i.provedor::text = p_provedor
       and i.ambiente::text = p_ambiente;
    if v_qtd = 1 then
      select t.* into v_tit
        from titulos_financeiros t
        join integracoes_bancarias i on i.id = t.integracao_id
       where replace(t.id::text, '-', '') like v_seu || '%'
         and i.provedor::text = p_provedor
         and i.ambiente::text = p_ambiente;
    end if;
  end if;

  if v_tit.id is not null then
    if v_tit.status = 'pago' then
      v_sit := 'JA_PAGO';
    elsif v_tit.status = 'cancelado' then
      v_sit := 'TITULO_CANCELADO';
    else
      v_sit := 'BAIXADO';
      update titulos_financeiros
         set status         = 'pago',
             data_pagamento = v_data,
             valor_pago     = coalesce(p_valor_pago, v_tit.valor),
             gateway_status = 'LIQUIDADO',
             gateway_erro   = null
       where id = v_tit.id;
    end if;
    if p_valor_pago is not null then
      v_div := abs(p_valor_pago - v_tit.valor) >= 0.01;
    end if;
    -- o dinheiro era de um titulo do SCar: o nao identificado sai (senao conta duas vezes)
    if v_ni is not null then
      delete from baixas_financeiras where lancamento_id = v_ni;
      update lancamentos_financeiros
         set status = 'cancelado',
             observacoes = coalesce(observacoes || ' | ', '')
                           || 'Cancelado: o pagamento foi identificado no titulo ' || v_tit.id::text
       where id = v_ni;
    end if;

  -- 3) boleto do MUTUAL (mesmo beneficiario; so o Sicredi de producao e real)
  elsif p_provedor = 'SICREDI' and p_ambiente = 'producao' then
    select h.* into v_hist
      from boletos_historico h
     where h.nosso_numero = v_nosso
     order by (h.situacao = 'cancelado'), abs(h.data_vencimento - v_data), h.id
     limit 1;

    if v_hist.id is null then
      v_sit := 'NAO_ENCONTRADO';
      v_valor := round(coalesce(p_valor_pago, 0), 2);
      -- (0118) o dinheiro entrou na conta: vira RECEBIMENTO NAO IDENTIFICADO na matriz
      if v_ni is not null then
        v_lanc := v_ni;
      elsif v_data >= inicio_baixa_banco_mutual() and v_valor > 0 then
        select id into v_conta
          from contas_bancarias
         where ativo and (banco ilike '%sicredi%' or nome ilike '%sicredi%')
         order by created_at, id
         limit 1;
        v_forma := case when upper(coalesce(p_payload->>'tipoLiquidacao', '')) like '%PIX%'
                        then 'PIX' else 'BOLETO' end::forma_pagamento;

        insert into lancamentos_financeiros
               (tipo, cliente_id, descricao, categoria_dre_id, regional_id, valor_original,
                data_emissao, data_vencimento, competencia, numero_documento, observacoes)
        values ('RECEITA', null,
                'Recebimento nao identificado - nosso numero ' || v_nosso,
                v_cat_ni, null, v_valor, v_data, v_data, date_trunc('month', v_data)::date,
                'SICREDI-' || v_nosso,
                'Pagamento informado pelo Sicredi sem boleto nem titulo correspondente (0118). '
                  || 'Ao identificar o boleto, reprocessar a baixa converte este lancamento.')
        returning id into v_lanc;

        insert into baixas_financeiras
               (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id,
                id_transacao_bancaria_externa, forma_pagamento, status_conciliacao, observacao)
        values (v_lanc, v_data, v_valor, v_valor, v_conta, v_nosso, v_forma, 'NAO_CONCILIADO',
                'Sicredi informou o pagamento; pagador nao identificado');
      end if;
    elsif v_hist.lancamento_id is not null
       or (v_hist.baixa_banco_em is not null and v_data < inicio_baixa_banco_mutual()) then
      v_sit  := 'JA_PAGO';
      v_lanc := v_hist.lancamento_id;
    else
      v_sit   := 'BAIXADO';
      v_valor := round(coalesce(p_valor_pago, v_hist.valor), 2);

      if v_ni is not null then
        -- (0118) o nao identificado vira a mensalidade do boleto achado
        select id into v_cat from categorias_dre where codigo_estruturado = '1.1.00';
        update lancamentos_financeiros lf
           set cliente_id       = v_hist.cliente_id,
               regional_id      = (select c.regional_id from clientes c where c.id = v_hist.cliente_id),
               categoria_dre_id = v_cat,
               descricao        = 'Mensalidade ' || coalesce(to_char(v_hist.competencia, 'MM/YYYY'), '')
                                    || ' (boleto do Mutual) - nosso numero ' || v_nosso,
               competencia      = coalesce(v_hist.competencia, date_trunc('month', v_hist.vencimento_original)::date),
               observacoes      = coalesce(lf.observacoes || ' | ', '')
                                    || 'Identificado: boleto do Mutual ' || v_hist.id_externo
         where lf.id = v_ni;
        v_lanc := v_ni;
      elsif v_data >= inicio_baixa_banco_mutual() and v_valor > 0 then
        select id into v_cat from categorias_dre where codigo_estruturado = '1.1.00';
        select id into v_conta
          from contas_bancarias
         where ativo and (banco ilike '%sicredi%' or nome ilike '%sicredi%')
         order by created_at, id
         limit 1;
        v_forma := case when upper(coalesce(p_payload->>'tipoLiquidacao', '')) like '%PIX%'
                        then 'PIX' else 'BOLETO' end::forma_pagamento;

        insert into lancamentos_financeiros
               (tipo, cliente_id, descricao, categoria_dre_id, regional_id, valor_original,
                data_emissao, data_vencimento, competencia, numero_documento, observacoes)
        select 'RECEITA', v_hist.cliente_id,
               'Mensalidade ' || coalesce(to_char(v_hist.competencia, 'MM/YYYY'), '')
                 || ' (boleto do Mutual) - nosso numero ' || v_nosso,
               v_cat, c.regional_id, v_valor,
               v_data, v_data,
               coalesce(v_hist.competencia, date_trunc('month', v_hist.vencimento_original)::date),
               'SICREDI-' || v_nosso,
               'Baixa automatica pelo banco (0117). Data provisoria = dia do pagamento; '
                 || 'a data do credito vem do extrato do Sicredi.'
          from clientes c where c.id = v_hist.cliente_id
        returning id into v_lanc;

        insert into baixas_financeiras
               (lancamento_id, data_pagamento, valor_pago, valor_liquido, conta_bancaria_id,
                id_transacao_bancaria_externa, forma_pagamento, status_conciliacao, observacao)
        values (v_lanc, v_data, v_valor, v_valor, v_conta, v_nosso, v_forma, 'NAO_CONCILIADO',
                'Sicredi informou o pagamento; aguarda o credito no extrato');
      end if;

      update boletos_historico
         set situacao       = 'pago',
             valor_pago     = v_valor,
             data_pagamento = v_data,
             baixa_banco_em = now(),
             lancamento_id  = v_lanc,
             atualizado_em  = now()
       where id = v_hist.id;
    end if;
    if v_hist.id is not null and p_valor_pago is not null then
      v_div := abs(p_valor_pago - v_hist.valor) >= 0.01;
    end if;
  else
    v_sit := 'NAO_ENCONTRADO';
  end if;

  -- Trilha re-executavel. Uma linha ja BAIXADA nao e rebaixada para JA_PAGO
  -- na segunda leitura (quem baixou foi a primeira).
  insert into cobranca_liquidacoes as l
         (provedor, ambiente, nosso_numero, seu_numero, data_pagamento, valor_pago,
          titulo_id, boleto_historico_id, lancamento_id, situacao, valor_divergente,
          dia_consultado, payload)
  values (p_provedor::provedor_banco, p_ambiente::ambiente_integracao, v_nosso,
          nullif(trim(p_seu_numero), ''), v_data, p_valor_pago,
          v_tit.id, v_hist.id, v_lanc, v_sit, v_div, coalesce(p_dia_consultado, v_data), p_payload)
  on conflict on constraint uq_cobranca_liquidacao do update
     set titulo_id           = coalesce(excluded.titulo_id, l.titulo_id),
         boleto_historico_id = coalesce(excluded.boleto_historico_id, l.boleto_historico_id),
         lancamento_id       = case when excluded.titulo_id is not null then excluded.lancamento_id
                                    else coalesce(excluded.lancamento_id, l.lancamento_id) end,
         situacao            = case when l.situacao = 'BAIXADO' and excluded.situacao = 'JA_PAGO'
                                    then 'BAIXADO' else excluded.situacao end,
         valor_divergente    = excluded.valor_divergente,
         valor_pago          = excluded.valor_pago,
         payload             = coalesce(excluded.payload, l.payload)
   where l.situacao is distinct from (case when l.situacao = 'BAIXADO' and excluded.situacao = 'JA_PAGO'
                                           then 'BAIXADO' else excluded.situacao end)
      or l.titulo_id is distinct from coalesce(excluded.titulo_id, l.titulo_id)
      or l.boleto_historico_id is distinct from coalesce(excluded.boleto_historico_id, l.boleto_historico_id)
      or l.lancamento_id is distinct from (case when excluded.titulo_id is not null then excluded.lancamento_id
                                                else coalesce(excluded.lancamento_id, l.lancamento_id) end)
      or l.valor_pago is distinct from excluded.valor_pago;

  situacao := (select l.situacao from cobranca_liquidacoes l
                where l.provedor::text = p_provedor and l.ambiente::text = p_ambiente
                  and l.nosso_numero = v_nosso and l.data_pagamento = v_data);
  titulo_id := v_tit.id;
  valor_divergente := v_div;
  return next;
end;
$$;

comment on function registrar_liquidacao_banco(text, text, text, text, date, numeric, date, jsonb) is
  'Baixa bancaria (0105/0117/0118): casa o pagamento com o titulo do SCar ou, no Sicredi de producao, com o boleto do Mutual (recebimento 1.1.00); sem nenhum dos dois, lanca RECEBIMENTO NAO IDENTIFICADO (1.9.98, matriz) que e convertido ou cancelado quando o pagador aparece. A partir de 13/10/2026. Re-executavel.';

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
