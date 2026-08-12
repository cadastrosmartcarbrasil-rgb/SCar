-- ============================================================================
-- SCar :: 0016_cotas_participacao.sql
-- Desacopla a COTA DE PARTICIPACAO (rateio no evento) do Plano.
-- Estrategia: catalogo de cotas (V5..V15) + heranca pelo modelo (padrao SGA)
-- + sobrescrita opcional no veiculo, resolvida por precedencia:
--   veiculo (override) -> modelo (herdado) -> participacao_faixa (padrao atual).
-- Assim uma variacao de % nao exige um novo Plano inteiro.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Catalogo das cotas (fonte unica). Trocar V10 aqui reflete em tudo.
-- ----------------------------------------------------------------------------
create table if not exists cotas_participacao (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique,          -- 'V5','V6','V10','V12','V15'
  percentual  numeric(5,4) not null,         -- 0.10 = 10% da FIPE
  descricao   text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into cotas_participacao (codigo, percentual, descricao) values
  ('V5',  0.05, 'Cota 5% da FIPE'),
  ('V6',  0.06, 'Cota 6% da FIPE'),
  ('V10', 0.10, 'Cota 10% da FIPE'),
  ('V12', 0.12, 'Cota 12% da FIPE'),
  ('V15', 0.15, 'Cota 15% da FIPE')
on conflict (codigo) do nothing;

-- ----------------------------------------------------------------------------
-- (B) Modelo herda a cota (via parser do texto SGA) + guarda grupo/especial.
-- ----------------------------------------------------------------------------
alter table modelos
  add column if not exists cota_participacao_id uuid references cotas_participacao(id) on delete set null,
  add column if not exists grupo_veiculo        text,
  add column if not exists especial             boolean not null default false;

-- ----------------------------------------------------------------------------
-- (C) Veiculo pode sobrescrever manualmente (exceção pontual). NULL = herda.
--     modelo_id liga o veiculo ao catalogo de modelos (para herdar a cota).
-- ----------------------------------------------------------------------------
alter table veiculos
  add column if not exists cota_participacao_id uuid references cotas_participacao(id) on delete set null,
  add column if not exists modelo_id            uuid references modelos(id) on delete set null;

create index if not exists idx_modelos_cota  on modelos (cota_participacao_id);
create index if not exists idx_veiculos_cota on veiculos (cota_participacao_id);
create index if not exists idx_veiculos_modelo on veiculos (modelo_id);

-- ----------------------------------------------------------------------------
-- (D) Backfill: extrai [ESPECIAL] V<N> <GRUPO> do texto ja importado (SGA).
--     - especial      = prefixo "ESPECIAL"
--     - cota (V<N>)    = casa com o catalogo cotas_participacao
--     - grupo_veiculo  = restante, sem acentos, sem ESPECIAL, sem V<N>
-- ----------------------------------------------------------------------------
update modelos m set
  especial = (upper(coalesce(m.tipo_veiculo,'')) like 'ESPECIAL%'),
  grupo_veiculo = nullif(
    trim(both ' /-' from regexp_replace(
      regexp_replace(upper(unaccent(coalesce(m.tipo_veiculo,''))), '^ESPECIAL', ''),
      '\yV\s*[0-9]+\y', '', 'g')), ''),
  cota_participacao_id = (
    select cp.id
    from regexp_match(upper(coalesce(m.tipo_veiculo,'')), '\yV\s*([0-9]+)\y') rm
    join cotas_participacao cp on cp.codigo = 'V' || rm[1]
  )
where m.tipo_veiculo is not null;

-- ============================================================================
-- MOTOR DE CALCULO
-- ============================================================================

-- Preview no simulador: participacao por tipo/faixa, com cota opcional.
-- Se p_cota_id informado -> % da FIPE da cota; senao -> faixa padrao (atual).
-- (overload de 3 args; a versao de 2 args do 0010 continua existindo)
create or replace function calcular_participacao(
  p_fipe numeric, p_tipo_veiculo_id uuid, p_cota_id uuid
) returns numeric language plpgsql stable as $$
declare v_pct numeric;
begin
  if p_cota_id is not null then
    select percentual into v_pct from cotas_participacao where id = p_cota_id;
    if v_pct is not null then return round(p_fipe * v_pct, 2); end if;
  end if;
  return calcular_participacao(p_fipe, p_tipo_veiculo_id);   -- fallback faixa padrao
end;
$$;

-- Participacao real de um veiculo, com precedencia completa.
create or replace function calcular_participacao_veiculo(
  p_veiculo_id uuid, p_fipe numeric
) returns numeric language plpgsql stable as $$
declare
  v_pct  numeric;
  v_tipo uuid;
begin
  -- 1) override do veiculo  2) cota herdada do modelo
  select coalesce(cv.percentual, cm.percentual), v.tipo_veiculo_id
    into v_pct, v_tipo
  from veiculos v
  left join cotas_participacao cv on cv.id = v.cota_participacao_id
  left join modelos            md on md.id = v.modelo_id
  left join cotas_participacao cm on cm.id = md.cota_participacao_id
  where v.id = p_veiculo_id;

  if v_pct is not null then
    return round(p_fipe * v_pct, 2);
  end if;

  -- 3) fallback: tabela padrao por tipo/faixa FIPE (comportamento atual)
  return calcular_participacao(p_fipe, v_tipo);
end;
$$;

-- ============================================================================
-- RLS + grants
-- ============================================================================
alter table cotas_participacao enable row level security;

drop policy if exists cotas_select on cotas_participacao;
drop policy if exists cotas_write  on cotas_participacao;
create policy cotas_select on cotas_participacao for select to authenticated using (is_staff());
create policy cotas_write  on cotas_participacao for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

grant select, insert, update, delete on cotas_participacao to authenticated;
grant execute on function calcular_participacao(numeric, uuid, uuid) to authenticated;
grant execute on function calcular_participacao_veiculo(uuid, numeric) to authenticated;
