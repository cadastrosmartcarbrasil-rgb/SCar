-- ============================================================================
-- 0031 — Assistencia 24h: GEOLOCALIZACAO, ROTA E LINKS DE NAVEGACAO
--
-- A "ordem de servico 24h" do SCar E a tabela `acionamentos_assistencia`
-- (coluna `codigo_os` = OS-YYYYMMDD-XXXX). Nao criamos `ordens_servico_24h`
-- paralela — mesma regra do resto do modulo: evoluir o que ja existe.
--
--   A) COLUNAS PLANAS de geo (endereco/lat/lng de origem e destino + distancia
--      calculada, duracao e polyline da rota). O jsonb `origem`/`destino`
--      continua sendo a fonte de digitacao; um trigger mantem as colunas
--      planas sincronizadas por QUALQUER caminho (abertura, edicao da OS,
--      update direto), entao relatorio e voucher leem sempre o mesmo dado.
--   B) `km_excedente_servico(servico, distancia)` — o KM que passa da franquia.
--   C) `definir_trajeto_acionamento(...)` — grava origem/destino/rota,
--      RECALCULA o KM excedente e os valores da OS e re-sincroniza o titulo em
--      Contas a Pagar (a auditoria do 0027 pega a mudanca automaticamente).
--   D) `links_navegacao_acionamento(...)` — Google Maps (rota completa) e Waze
--      (navegacao ate o local do resgate) montados no banco, para o voucher e
--      a tela usarem exatamente os mesmos links.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) Colunas de geolocalizacao da OS
-- ----------------------------------------------------------------------------
alter table acionamentos_assistencia
  add column if not exists endereco_origem        text,
  add column if not exists latitude_origem        numeric(10,7),
  add column if not exists longitude_origem       numeric(10,7),
  add column if not exists endereco_destino       text,
  add column if not exists latitude_destino       numeric(10,7),
  add column if not exists longitude_destino      numeric(10,7),
  add column if not exists distancia_km_calculada numeric(10,2),
  add column if not exists duracao_minutos        integer,
  add column if not exists rota_polyline          text,
  add column if not exists rota_calculada_em      timestamptz;

comment on column acionamentos_assistencia.distancia_km_calculada is
  'Distancia da rota origem->destino calculada pelo provedor de mapas; base da validacao do KM excedente.';

-- Endereco de uma linha a partir do jsonb digitado no acionamento.
create or replace function endereco_texto_jsonb(p_endereco jsonb)
returns text language sql immutable as $$
  select nullif(
    array_to_string(
      array_remove(array[
        nullif(btrim(coalesce(p_endereco->>'logradouro', '')), ''),
        nullif(btrim(coalesce(p_endereco->>'numero', '')), ''),
        nullif(btrim(coalesce(p_endereco->>'bairro', '')), ''),
        nullif(btrim(coalesce(p_endereco->>'cidade', '')), ''),
        nullif(btrim(coalesce(p_endereco->>'uf', '')), ''),
        nullif(btrim(coalesce(p_endereco->>'cep', '')), '')
      ], null),
      ', '),
    '');
$$;

-- Mantem as colunas planas espelhando o jsonb (fonte unica de digitacao).
create or replace function fn_acionamento_sync_geo()
returns trigger language plpgsql as $$
begin
  new.endereco_origem   := endereco_texto_jsonb(new.origem);
  new.latitude_origem   := nullif(new.origem->>'lat', '')::numeric;
  new.longitude_origem  := nullif(new.origem->>'lng', '')::numeric;
  new.endereco_destino  := endereco_texto_jsonb(new.destino);
  new.latitude_destino  := nullif(new.destino->>'lat', '')::numeric;
  new.longitude_destino := nullif(new.destino->>'lng', '')::numeric;
  return new;
end $$;

drop trigger if exists trg_acionamento_geo on acionamentos_assistencia;
create trigger trg_acionamento_geo
  before insert or update of origem, destino on acionamentos_assistencia
  for each row execute function fn_acionamento_sync_geo();

-- Backfill dos acionamentos ja existentes (o trigger so pega os proximos).
update acionamentos_assistencia
   set origem = origem
 where endereco_origem is null and origem <> '{}'::jsonb;

-- ----------------------------------------------------------------------------
-- B) KM excedente a partir da distancia da rota
-- ----------------------------------------------------------------------------
-- Espelho do `calcularKmExcedente` de src/lib/assistencia.ts: so o que passa da
-- franquia, e apenas quando o servico cobra KM excedente.
create or replace function km_excedente_servico(p_servico_id uuid, p_distancia_km numeric)
returns numeric language sql stable as $$
  select case
           when s.cobra_km_excedente is not true then 0
           else greatest(0, round(coalesce(p_distancia_km, 0) - coalesce(s.km_franquia, 0), 2))
         end
    from servicos_assistencia s
   where s.id = p_servico_id;
$$;

-- ----------------------------------------------------------------------------
-- C) Gravacao do trajeto (com recalculo da OS)
-- ----------------------------------------------------------------------------
-- Chamada na abertura e em QUALQUER edicao do trajeto. Recalcula o KM
-- excedente pela distancia da rota (quando o atendente nao informa um valor
-- manual), refaz os valores da OS e re-sincroniza o titulo em Contas a Pagar.
create or replace function definir_trajeto_acionamento(
  p_acionamento_id uuid,
  p_origem         jsonb   default null,
  p_destino        jsonb   default null,
  p_distancia_km   numeric default null,
  p_duracao_min    integer default null,
  p_polyline       text    default null,
  p_km_excedente   numeric default null,   -- override manual do atendente
  p_motivo         text    default null
)
returns acionamentos_assistencia
language plpgsql
security definer
set search_path = public
as $$
declare
  a        acionamentos_assistencia;
  s        servicos_assistencia;
  v_dist   numeric;
  v_km     numeric;
  v_km_un  numeric;
  v_km_tot numeric;
begin
  if not pode_assistencia() then raise exception 'Sem permissao'; end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  if a.id is null then raise exception 'Acionamento nao encontrado'; end if;
  if a.status = 'CANCELADO' then raise exception 'Acionamento cancelado nao pode ser editado'; end if;
  select * into s from servicos_assistencia where id = a.servico_id;

  perform set_config('scar.motivo_edicao', coalesce(p_motivo, 'Atualizacao do trajeto'), true);

  v_dist := coalesce(p_distancia_km, a.distancia_km_calculada);
  -- KM excedente: override manual > calculo pela rota > o que ja estava.
  v_km := coalesce(
    p_km_excedente,
    case when v_dist is not null then km_excedente_servico(a.servico_id, v_dist) end,
    a.km_excedente
  );
  if s.cobra_km_excedente is not true then v_km := 0; end if;

  v_km_un := coalesce(
    case when a.km_excedente > 0 then a.valor_km_excedente / nullif(a.km_excedente, 0) end,
    (select valor_km from prestador_servicos
      where fornecedor_id = a.prestador_id and servico_id = a.servico_id),
    s.valor_km_excedente
  );
  v_km_tot := round(coalesce(v_km, 0) * coalesce(v_km_un, 0), 2);

  update acionamentos_assistencia
     set origem                 = coalesce(p_origem, origem),
         destino                = coalesce(p_destino, destino),
         distancia_km_calculada = coalesce(p_distancia_km, distancia_km_calculada),
         duracao_minutos        = coalesce(p_duracao_min, duracao_minutos),
         rota_polyline          = coalesce(p_polyline, rota_polyline),
         rota_calculada_em      = case when p_distancia_km is not null then now() else rota_calculada_em end,
         km_previsto            = coalesce(p_distancia_km, km_previsto),
         km_excedente           = coalesce(v_km, 0),
         valor_km_excedente     = v_km_tot,
         valor_total            = round(coalesce(valor_servico, 0) + v_km_tot, 2),
         updated_at             = now()
   where id = p_acionamento_id;

  -- Titulo em Contas a Pagar acompanha o novo valor (0027).
  perform sincronizar_lancamento_acionamento(p_acionamento_id);
  perform set_config('scar.motivo_edicao', '', true);

  -- Re-seleciona: a sincronia acima pode ter mexido na linha (gotcha do 0027).
  select * into a from acionamentos_assistencia where id = p_acionamento_id;
  return a;
end;
$$;

-- ----------------------------------------------------------------------------
-- D) Links de navegacao (mesmos no voucher, no e-mail e na tela)
-- ----------------------------------------------------------------------------
-- Encoder de URL (o Postgres nao traz um pronto para texto). Cada byte UTF-8
-- vira %XX — por isso o regexp quebra o hex de dois em dois.
create or replace function urlencode(p_texto text)
returns text language sql immutable as $$
  select coalesce(string_agg(
    case
      when ch ~ '[a-zA-Z0-9_.~-]' then ch
      when ch = ' ' then '+'
      else upper(regexp_replace(encode(convert_to(ch, 'UTF8'), 'hex'), '(..)', '%\1', 'g'))
    end, '' order by i), '')
    from unnest(regexp_split_to_array(coalesce(p_texto, ''), '')) with ordinality as t(ch, i);
$$;

-- Coordenada tem precedencia sobre o texto: leva o guincho ao ponto exato.
create or replace function ponto_navegacao(p_endereco text, p_lat numeric, p_lng numeric)
returns text language sql immutable as $$
  -- trim_scale: numeric(10,7) imprime -15.5989000 e o app/Waze recebem melhor
  -- a coordenada enxuta (-15.5989).
  select case
           when p_lat is not null and p_lng is not null
             then trim_scale(p_lat)::text || ',' || trim_scale(p_lng)::text
           else nullif(btrim(coalesce(p_endereco, '')), '')
         end;
$$;

create or replace function links_navegacao_acionamento(p_acionamento_id uuid)
returns table (
  origem_texto  text,
  destino_texto text,
  google_rota   text,
  google_origem text,
  waze_origem   text,
  waze_destino  text
) language sql stable as $$
  with p as (
    select ponto_navegacao(a.endereco_origem, a.latitude_origem, a.longitude_origem)   as o,
           ponto_navegacao(a.endereco_destino, a.latitude_destino, a.longitude_destino) as d,
           (a.latitude_origem is not null and a.longitude_origem is not null)   as o_gps,
           (a.latitude_destino is not null and a.longitude_destino is not null) as d_gps,
           a.endereco_origem, a.endereco_destino
      from acionamentos_assistencia a
     where a.id = p_acionamento_id
  )
  select p.endereco_origem,
         p.endereco_destino,
         -- rota completa origem -> destino
         case when p.o is not null and p.d is not null
              then 'https://www.google.com/maps/dir/?api=1&origin=' || replace(urlencode(p.o), '%2C', ',')
                   || '&destination=' || replace(urlencode(p.d), '%2C', ',') || '&travelmode=driving'
         end,
         -- so o local do resgate (abre o pin no Maps)
         case when p.o is not null
              then 'https://www.google.com/maps/search/?api=1&query=' || replace(urlencode(p.o), '%2C', ',')
         end,
         -- Waze: `ll` para coordenada, `q` para endereco em texto
         case when p.o is null then null
              when p.o_gps then 'https://waze.com/ul?ll=' || p.o || '&navigate=yes'
              else 'https://waze.com/ul?q=' || urlencode(p.o) || '&navigate=yes'
         end,
         case when p.d is null then null
              when p.d_gps then 'https://waze.com/ul?ll=' || p.d || '&navigate=yes'
              else 'https://waze.com/ul?q=' || urlencode(p.d) || '&navigate=yes'
         end
    from p;
$$;
