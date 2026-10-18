-- ============================================================================
-- 0117 — BAIXA DOS BOLETOS DO MUTUAL PELO BANCO
-- ============================================================================
-- O contrato de webhook do Sicredi e UM por beneficiario (confirmado pelo
-- Sicredi em 18/10/2026) e foi desligado no Mutual para operar aqui. Os
-- boletos que o Mutual ainda emite (ate dezembro) sao do MESMO beneficiario,
-- entao o pagamento deles agora so chega a este sistema — e o FECHAMENTO
-- BANCARIO passa a ser feito aqui (decisao do usuario, 18/10/2026).
--
-- Ate a 0105 a baixa automatica so casava com `titulos_financeiros`: o boleto
-- do Mutual ia para a trilha como NAO_ENCONTRADO (602 pagamentos, R$ 125.560,81
-- entre 13 e 16/10). Agora:
--
-- (A) `boletos_historico.nosso_numero` — GERADO da linha digitavel do Sicredi
--     (banco 748): campo livre = tipo(1) + carteira(1) + NOSSO NUMERO(9) +
--     cooperativa(4) + posto(2) + beneficiario(5) + ... Medido em producao:
--     579 dos 602 casam com UM boleto, nenhum com dois.
-- (B) `registrar_liquidacao_banco` (mesma assinatura) — sem titulo do SCar,
--     procura o boleto do Mutual pelo nosso numero e:
--       * marca o boleto como PAGO (valor e data do banco) e carimba
--         `baixa_banco_em`;
--       * a partir de 13/10/2026 (decisao do usuario) cria UM RECEBIMENTO por
--         boleto em `lancamentos_financeiros` (1.1.00 mensalidade, unidade do
--         associado) com a BAIXA na conta SICREDI — status de conciliacao
--         NAO_CONCILIADO e a data do PAGAMENTO, provisoria: a data do CREDITO
--         (decisao do usuario) vem do extrato do banco (Francesinha) e entra
--         quando o formato dele for conhecido.
--     Re-executavel: boleto que ja tem recebimento volta JA_PAGO.
-- (C) Trava: importacao do Mutual nunca desfaz pagamento confirmado pelo banco
--     (o Mutual perdeu o webhook e vai ficar atrasado). Trigger BEFORE UPDATE.
-- (D) `reprocessar_liquidacoes_banco(p_desde)` — passa de novo os
--     NAO_ENCONTRADO (o boleto pode ter sido importado depois do pagamento).
--
-- Por que o boleto do Mutual nao vira `titulos_financeiros`: la ele entraria
-- na trava da 24h e na cobranca do SCar (0097). O dinheiro entra pelo
-- `lancamentos_financeiros`, que e o caminho do DRE e do fechamento.
-- ============================================================================

-- (A) colunas -----------------------------------------------------------------
alter table boletos_historico
  add column if not exists nosso_numero text generated always as (
    case when linha_digitavel ~ '^748[0-9]{44}$'
         then substr(substr(linha_digitavel, 5, 5) || substr(linha_digitavel, 11, 10)
                     || substr(linha_digitavel, 22, 10), 3, 9)
    end) stored,
  add column if not exists baixa_banco_em timestamptz,
  add column if not exists lancamento_id uuid references lancamentos_financeiros(id) on delete set null;

create index if not exists idx_boletos_historico_nosso_numero
  on boletos_historico (nosso_numero) where nosso_numero is not null;

comment on column boletos_historico.nosso_numero is
  'Nosso numero do Sicredi, tirado da linha digitavel (0117). E por ele que o pagamento informado pelo banco acha o boleto.';
comment on column boletos_historico.baixa_banco_em is
  'Quando o BANCO confirmou o pagamento (0117). Preenchido = a importacao do Mutual nao desfaz o pago.';

alter table cobranca_liquidacoes
  add column if not exists boleto_historico_id uuid references boletos_historico(id) on delete set null,
  add column if not exists lancamento_id uuid references lancamentos_financeiros(id) on delete set null;

create index if not exists idx_cobranca_liquidacoes_boleto on cobranca_liquidacoes (boleto_historico_id);

-- (C) a importacao do Mutual nao desfaz o que o banco confirmou ------------------
create or replace function fn_boleto_historico_baixa_banco()
returns trigger
language plpgsql
as $$
begin
  if old.baixa_banco_em is not null then
    new.situacao       := 'pago';
    new.valor_pago     := old.valor_pago;
    new.data_pagamento := old.data_pagamento;
    new.baixa_banco_em := old.baixa_banco_em;
    new.lancamento_id  := coalesce(new.lancamento_id, old.lancamento_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_boleto_historico_baixa_banco on boletos_historico;
create trigger trg_boleto_historico_baixa_banco
  before update on boletos_historico
  for each row execute function fn_boleto_historico_baixa_banco();

-- (B) a baixa ------------------------------------------------------------------
/** A partir de quando o pagamento de boleto do Mutual entra no caixa do SCar. */
create or replace function inicio_baixa_banco_mutual()
returns date
language sql
immutable
as $$ select date '2026-10-13' $$;

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

  -- 3) boleto do MUTUAL (mesmo beneficiario; so o Sicredi de producao e real)
  elsif p_provedor = 'SICREDI' and p_ambiente = 'producao' then
    select h.* into v_hist
      from boletos_historico h
     where h.nosso_numero = v_nosso
     order by (h.situacao = 'cancelado'), abs(h.data_vencimento - v_data), h.id
     limit 1;

    if v_hist.id is null then
      v_sit := 'NAO_ENCONTRADO';
    elsif v_hist.lancamento_id is not null
       or (v_hist.baixa_banco_em is not null and v_data < inicio_baixa_banco_mutual()) then
      v_sit  := 'JA_PAGO';
      v_lanc := v_hist.lancamento_id;
    else
      v_sit   := 'BAIXADO';
      v_valor := round(coalesce(p_valor_pago, v_hist.valor), 2);

      if v_data >= inicio_baixa_banco_mutual() and v_valor > 0 then
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
         lancamento_id       = coalesce(excluded.lancamento_id, l.lancamento_id),
         situacao            = case when l.situacao = 'BAIXADO' and excluded.situacao = 'JA_PAGO'
                                    then 'BAIXADO' else excluded.situacao end,
         valor_divergente    = excluded.valor_divergente,
         valor_pago          = excluded.valor_pago,
         payload             = coalesce(excluded.payload, l.payload)
   where l.situacao is distinct from (case when l.situacao = 'BAIXADO' and excluded.situacao = 'JA_PAGO'
                                           then 'BAIXADO' else excluded.situacao end)
      or l.titulo_id is distinct from coalesce(excluded.titulo_id, l.titulo_id)
      or l.boleto_historico_id is distinct from coalesce(excluded.boleto_historico_id, l.boleto_historico_id)
      or l.lancamento_id is distinct from coalesce(excluded.lancamento_id, l.lancamento_id)
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
  'Baixa bancaria (0105/0117): casa o pagamento informado pelo banco com o titulo do SCar ou, no Sicredi de producao, com o boleto do Mutual (nosso numero da linha digitavel) — este ganha o recebimento no financeiro a partir de 13/10/2026. Re-executavel.';

-- (D) reprocessar o que ainda nao casou ------------------------------------------
create or replace function reprocessar_liquidacoes_banco(p_desde date default null)
returns table (situacao text, quantidade int, valor numeric)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  r        record;
  v_sits   text[] := '{}';
  v_vals   numeric[] := '{}';
  v_sit    text;
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Sem permissao para reprocessar a baixa bancaria' using errcode = '42501';
  end if;
  for r in
    select l.provedor::text as provedor, l.ambiente::text as ambiente, l.nosso_numero, l.seu_numero,
           l.data_pagamento, l.valor_pago, l.dia_consultado, l.payload
      from cobranca_liquidacoes l
     where l.situacao = 'NAO_ENCONTRADO'
       and l.data_pagamento >= coalesce(p_desde, inicio_baixa_banco_mutual())
     order by l.data_pagamento, l.nosso_numero
  loop
    select x.situacao into v_sit
      from registrar_liquidacao_banco(r.provedor, r.ambiente, r.nosso_numero, r.seu_numero,
                                      r.data_pagamento, r.valor_pago, r.dia_consultado, r.payload) x;
    v_sits := v_sits || v_sit;
    v_vals := v_vals || coalesce(r.valor_pago, 0);
  end loop;
  return query
    select t.sit, count(*)::int, coalesce(sum(t.val), 0)
      from unnest(v_sits, v_vals) as t(sit, val)
     group by t.sit
     order by t.sit;
end;
$$;

comment on function reprocessar_liquidacoes_banco(date) is
  'Passa de novo os pagamentos NAO_ENCONTRADO (desde 13/10/2026 por padrao) pela baixa bancaria (0117) — o boleto pode ter sido importado depois do pagamento.';

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
