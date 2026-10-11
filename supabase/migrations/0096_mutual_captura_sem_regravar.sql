-- =============================================================================
-- 0096 — A RECAPTURA DO MUTUAL PARA DE REGRAVAR O QUE NAO MUDOU
-- =============================================================================
-- Medido em producao em 11/10/2026: uma recaptura completa de CONTRACT_OBJECT
-- (17.777 objetos, 36 blocos, 11:02 -> 11:05) regravou TODAS as linhas, mudasse
-- o payload ou nao. Resultado: 39.709 versoes mortas em `mutual_captura`
-- (1,1 GB), e o autovacuum NAO dispara (o padrao e 20% da tabela; isso era 13%).
-- Logo depois, as tres leituras que varrem a captura — `mutual_carga_previa`,
-- `mutual_carga_linhas` e `mutual_cobertura_consultor` — passaram a estourar o
-- teto de 8 s do `authenticated` MESMO SOZINHAS (a fila da tela ja as mandava
-- uma por vez: os cancelamentos sairam espacados de 8 em 8 s).
--
-- E isto nao e um acidente de um dia: a rotina combinada para a convivencia e
-- RECAPTURAR + rodar a carga de novo toda semana (a deriva, 0084). Do jeito que
-- estava, cada rodada semanal deixaria a carga mais lenta logo antes de ela
-- precisar rodar.
--
-- O que muda:
--   (A) `mutual_registrar_captura` so ESCREVE a linha quando algo mudou:
--       payload, deletado ou o uuid externo (que o coalesce so deixa trocar de
--       nulo para valor). Linha identica nao vira versao morta.
--       O RETORNO continua sendo quantos registros a chamada RECEBEU — e o que
--       a tela soma como progresso ("registros puxados"); devolver so os
--       alterados faria uma recaptura sem mudanca parecer que nao trouxe nada.
--   (B) `capturado_em` passa a significar "quando ESTE conteudo chegou", e nao
--       "quando foi visto pela ultima vez" — e e o que as leituras da carga ja
--       esperavam dele (reserva do `updated_at` do payload). Para o resumo nao
--       mentir sobre a ultima captura, `mutual_resumo_capturas.ultima` passa a
--       ser a mais recente entre o conteudo e a ultima sincronizacao concluida
--       sem erro daquela entidade.
--   (C) `mutual_captura` ganha limpeza automatica mais cedo (2% em vez de 20%):
--       a tabela tem ~300 mil linhas, e 20% delas sao 60 mil versoes mortas
--       antes de alguem limpar.
--
-- Nada aqui toca em `clientes`, `veiculos`, faturas ou titulos.
-- A limpeza das 39.709 versoes que JA existem e um VACUUM a parte (nao roda
-- dentro de transacao, entao nao cabe numa migration).
-- =============================================================================

-- (A) ---------------------------------------------------------------------------
create or replace function mutual_registrar_captura(p_entidade text, p_registros jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not tem_acesso_global() then
    raise exception 'Somente a matriz (admin/financeiro) pode puxar dados do Mutual';
  end if;
  if jsonb_typeof(p_registros) <> 'array' then
    raise exception 'p_registros precisa ser um array json';
  end if;

  insert into mutual_captura (entidade, id_externo, uuid_externo, payload, deletado, capturado_por)
  select p_entidade,
         coalesce(r->>'id', r->>'uuid', md5(r::text)),
         case when r->>'uuid' ~ '^[0-9a-fA-F-]{36}$' then (r->>'uuid')::uuid end,
         r,
         coalesce((r->>'deleted')::boolean, false),
         auth.uid()
    from jsonb_array_elements(p_registros) r
  on conflict (entidade, id_externo) do update
    set payload      = excluded.payload,
        -- COALESCE de proposito (0062): uma recaptura com payload parcial (ou de
        -- um endpoint que nao devolve `uuid`) NAO pode apagar a chave externa
        -- estavel que ja tinhamos. O payload e substituido; a identidade, nao.
        uuid_externo = coalesce(excluded.uuid_externo, mutual_captura.uuid_externo),
        deletado     = excluded.deletado,
        capturado_em = now(),
        capturado_por = excluded.capturado_por
    -- 0096: linha identica NAO e regravada. `is distinct from` porque o jsonb
    -- compara por valor (ordem de chave e espaco nao contam) e trata nulo.
    where mutual_captura.payload  is distinct from excluded.payload
       or mutual_captura.deletado is distinct from excluded.deletado
       or (excluded.uuid_externo is not null
           and mutual_captura.uuid_externo is distinct from excluded.uuid_externo);

  -- Quantos a chamada RECEBEU (ver (A) no cabecalho), nao quantos regravou.
  return jsonb_array_length(p_registros);
end;
$$;

-- (B) ---------------------------------------------------------------------------
create or replace function mutual_resumo_capturas()
returns table (
  entidade     text,
  registros    bigint,
  deletados    bigint,
  ultima       timestamptz,
  total_remoto integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'Somente a equipe pode ler o diagnostico da integracao';
  end if;
  return query
  select c.entidade, count(*)::bigint, count(*) filter (where c.deletado)::bigint,
         -- 0096: recapturar sem mudanca nao mexe mais em `capturado_em`; a
         -- sincronizacao concluida e quem diz que a entidade foi olhada.
         greatest(
           max(c.capturado_em),
           (select max(s.concluida_em) from mutual_sincronias s
             where s.entidade = c.entidade and s.erro is null)
         ),
         (select s.total_remoto from mutual_sincronias s
           where s.entidade = c.entidade and s.total_remoto is not null
           order by s.iniciada_em desc limit 1)
    from mutual_captura c
   group by c.entidade
   order by 1;
end;
$$;

-- (C) ---------------------------------------------------------------------------
alter table mutual_captura set (
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_analyze_scale_factor = 0.02
);

comment on function mutual_registrar_captura(text, jsonb) is
  'Upsert da captura do Mutual (0062). Desde a 0096 so regrava a linha quando '
  'payload, deletado ou uuid externo mudaram — recaptura identica nao gera '
  'versao morta. Devolve quantos registros RECEBEU (progresso da tela).';

-- ----------------------------------------------------------------------------
-- Rito de seguranca (0052).
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
