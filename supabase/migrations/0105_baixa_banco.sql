-- ============================================================================
-- 0105 :: BAIXA AUTOMATICA PELO BANCO (Sicredi `liquidados/dia`)
-- ----------------------------------------------------------------------------
-- O Sicredi nao manda webhook (a colecao oficial nao traz): o pagamento e
-- lido por consulta diaria. Esta migration e o lado do banco dessa leitura:
--
-- (A) `cobranca_liquidacoes` — o registro de CADA pagamento que o banco
--     informou, casado ou nao com um titulo. E a trilha da conciliacao: o
--     que veio do banco, quando, e o que o SCar fez com isso. Pagamento que
--     nao casa com nada NAO some: fica como NAO_ENCONTRADO para alguem olhar.
-- (B) `registrar_liquidacao_banco(...)` — casa o pagamento com o titulo e da
--     a baixa. Re-executavel: consultar o mesmo dia duas vezes nao duplica
--     nada (unique por provedor+ambiente+nosso numero+data) e titulo ja pago
--     vira JA_PAGO, sem tocar.
--
-- Decisoes:
-- * O titulo e achado pelo NOSSO NUMERO dentro da MESMA integracao de
--   provedor E ambiente que o emitiu. O sandbox devolve sempre o mesmo nosso
--   numero (mock): sem o filtro de ambiente, um pagamento ficticio do sandbox
--   poderia baixar um titulo emitido em producao com o mesmo numero.
--   Reserva: o `seuNumero` (10 primeiros hex do id, ver sicredi.ts), so
--   quando casa com UM titulo daquele provedor/ambiente.
-- * Titulo CANCELADO pago no banco NAO e reaberto: vira TITULO_CANCELADO na
--   trilha (dinheiro entrou por um boleto que o SCar deu por morto — decisao
--   de gente, nao de rotina).
-- * Valor pago diferente do valor do titulo (juros, multa, pagamento a menor)
--   NAO impede a baixa: o banco ja liquidou. Fica marcado `valor_divergente`.
-- * A baixa e o mesmo UPDATE que o webhook (edge function) sempre fez:
--   status 'pago' + data_pagamento + valor_pago. Os triggers que ja existem
--   (fatura PAGA, comissao) seguem valendo.
-- ============================================================================

create table if not exists cobranca_liquidacoes (
  id               uuid primary key default gen_random_uuid(),
  provedor         provedor_banco not null,
  ambiente         ambiente_integracao not null,
  nosso_numero     text not null,
  seu_numero       text,
  data_pagamento   date not null,
  valor_pago       numeric(12,2),
  titulo_id        uuid references titulos_financeiros(id) on delete set null,
  situacao         text not null
                   check (situacao in ('BAIXADO','JA_PAGO','NAO_ENCONTRADO','TITULO_CANCELADO')),
  valor_divergente boolean not null default false,
  dia_consultado   date not null,
  payload          jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint uq_cobranca_liquidacao unique (provedor, ambiente, nosso_numero, data_pagamento)
);

create index if not exists idx_cobranca_liquidacoes_titulo on cobranca_liquidacoes (titulo_id);
create index if not exists idx_cobranca_liquidacoes_situacao on cobranca_liquidacoes (situacao, data_pagamento desc);

alter table cobranca_liquidacoes enable row level security;

drop policy if exists cobranca_liquidacoes_select on cobranca_liquidacoes;
create policy cobranca_liquidacoes_select on cobranca_liquidacoes
  for select to authenticated using (tem_acesso_global());
-- Escrita so pela RPC (security definer).

drop trigger if exists trg_cobranca_liquidacoes_updated on cobranca_liquidacoes;
create trigger trg_cobranca_liquidacoes_updated before update on cobranca_liquidacoes
  for each row execute function set_updated_at();

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
  v_qtd    int;
  v_sit    text;
  v_div    boolean := false;
  v_data   date := coalesce(p_data_pagamento, p_dia_consultado);
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

  -- 1) nosso numero, dentro do provedor + ambiente que emitiu
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

  if v_tit.id is null then
    v_sit := 'NAO_ENCONTRADO';
  elsif v_tit.status = 'pago' then
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

  if v_tit.id is not null and p_valor_pago is not null then
    v_div := abs(p_valor_pago - v_tit.valor) >= 0.01;
  end if;

  -- Trilha re-executavel. Uma linha ja BAIXADA nao e rebaixada para JA_PAGO
  -- na segunda leitura (quem baixou foi a primeira).
  insert into cobranca_liquidacoes as l
         (provedor, ambiente, nosso_numero, seu_numero, data_pagamento, valor_pago,
          titulo_id, situacao, valor_divergente, dia_consultado, payload)
  values (p_provedor::provedor_banco, p_ambiente::ambiente_integracao, v_nosso,
          nullif(trim(p_seu_numero), ''), v_data, p_valor_pago,
          v_tit.id, v_sit, v_div, coalesce(p_dia_consultado, v_data), p_payload)
  on conflict on constraint uq_cobranca_liquidacao do update
     set titulo_id        = coalesce(excluded.titulo_id, l.titulo_id),
         situacao         = case when l.situacao = 'BAIXADO' and excluded.situacao = 'JA_PAGO'
                                 then 'BAIXADO' else excluded.situacao end,
         valor_divergente = excluded.valor_divergente,
         valor_pago       = excluded.valor_pago,
         payload          = excluded.payload
   where l.situacao is distinct from (case when l.situacao = 'BAIXADO' and excluded.situacao = 'JA_PAGO'
                                           then 'BAIXADO' else excluded.situacao end)
      or l.titulo_id is distinct from coalesce(excluded.titulo_id, l.titulo_id)
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
  'Baixa bancaria (0105): casa o pagamento informado pelo banco com o titulo (nosso numero no mesmo provedor+ambiente; reserva seuNumero unico) e grava a trilha em cobranca_liquidacoes. Re-executavel.';

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
