-- ============================================================================
-- 0151 — API EXTERNA DO SCar (integracao com outros sistemas)
--
-- Pedido do usuario (25/10/2026): "criar a API do software para integrar com
-- outros sistemas; a primeira integracao sera com um software de RASTREADOR,
-- que fara o cruzamento das informacoes para ligacao nesse sistema".
--
-- O desenho:
--   * Cada sistema externo e uma INTEGRACAO com chave propria (api_integracoes).
--     A chave e gerada no servidor (Node), mostrada UMA vez e guardada so como
--     SHA-256. O prefixo (parte publica da chave) localiza a linha.
--   * A chave tem ESCOPOS (o que pode ler/escrever), UNIDADES (null = todas),
--     IPs permitidos (null = qualquer) e validade. Revogar e definitivo.
--   * As leituras/escritas sao RPCs que SO rodam sem sessao (service_role, a
--     rota da API) e conferem DE NOVO a integracao e o escopo — a rota valida
--     a chave, o banco valida o que ela pode.
--   * Dado pessoal do associado (nome, CPF, telefone) so sai com o escopo
--     `associados:ler` (LGPD: a rastreadora so recebe o que precisa).
--   * Trilha de cada requisicao em api_requisicoes.
--
-- Corrige de passagem: fn_rastreador_espelha_veiculo (0050) regravava o
-- veiculo a cada UPDATE do rastreador ativo, mesmo sem mudanca — e cada
-- regravacao mexe em veiculos.updated_at. Com a rastreadora informando a
-- ultima comunicacao pela API, toda a frota "mudaria" a cada minuto e a
-- sincronia incremental (por alterado_em) devolveria tudo de novo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Integracoes (chaves) e trilha
-- ----------------------------------------------------------------------------
create table if not exists api_integracoes (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  descricao          text,
  fornecedor_id      uuid references fornecedores(id) on delete set null,
  escopos            text[] not null default '{}',
  regional_ids       uuid[],                -- null = todas as unidades
  ips_permitidos     text[],                -- null/vazio = qualquer IP
  chave_prefixo      text not null unique,
  chave_hash         text not null,
  ativo              boolean not null default true,
  expira_em          timestamptz,
  revogada_em        timestamptz,
  revogada_por       uuid references usuarios(id) on delete set null,
  revogacao_motivo   text,
  ultimo_uso_em      timestamptz,
  ultimo_ip          text,
  criado_por         uuid references usuarios(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_api_escopos') then
    alter table api_integracoes add constraint chk_api_escopos
      check (escopos <@ array['veiculos:ler','associados:ler','rastreadores:ler','rastreadores:escrever']::text[]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_api_hash') then
    alter table api_integracoes add constraint chk_api_hash check (chave_hash ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_api_prefixo') then
    alter table api_integracoes add constraint chk_api_prefixo check (chave_prefixo ~ '^[a-z0-9]{8,16}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_api_nome') then
    alter table api_integracoes add constraint chk_api_nome check (length(btrim(nome)) >= 2);
  end if;
end $$;

drop trigger if exists trg_api_integracoes_updated on api_integracoes;
create trigger trg_api_integracoes_updated before update on api_integracoes
  for each row execute function set_updated_at();

create table if not exists api_requisicoes (
  id             bigint generated always as identity primary key,
  integracao_id  uuid references api_integracoes(id) on delete cascade,
  metodo         text not null,
  rota           text not null,
  status         int not null,
  ip             text,
  duracao_ms     int,
  registros      int,
  erro           text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_api_requisicoes_integracao on api_requisicoes (integracao_id, created_at desc);

alter table api_integracoes enable row level security;
alter table api_requisicoes enable row level security;

-- Le so o admin. Escrita: RPC (admin) ou service_role (a rota da API).
drop policy if exists api_integracoes_select on api_integracoes;
create policy api_integracoes_select on api_integracoes for select to authenticated
  using ((select is_admin()));
drop policy if exists api_requisicoes_select on api_requisicoes;
create policy api_requisicoes_select on api_requisicoes for select to authenticated
  using ((select is_admin()));

revoke all on api_integracoes from anon;
revoke all on api_requisicoes from anon;

-- ----------------------------------------------------------------------------
-- (B) Administracao das chaves (admin, pela sessao)
-- A chave em si nasce no servidor (rota /api/v1/api-integracoes): aqui chega
-- so o prefixo e o hash.
-- ----------------------------------------------------------------------------
create or replace function api_normalizar_escopos(p_escopos text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct e order by e), '{}')
    from unnest(coalesce(p_escopos, '{}')) e
   where e is not null and btrim(e) <> '';
$$;

create or replace function criar_api_integracao(
  p_nome text, p_descricao text, p_fornecedor_id uuid, p_escopos text[],
  p_regional_ids uuid[], p_ips text[], p_expira_em timestamptz,
  p_prefixo text, p_hash text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not is_admin() then
    raise exception 'Somente o administrador cria integracoes da API' using errcode = '42501';
  end if;
  if coalesce(array_length(api_normalizar_escopos(p_escopos), 1), 0) = 0 then
    raise exception 'Escolha ao menos um escopo para a chave' using errcode = 'check_violation';
  end if;
  insert into api_integracoes (nome, descricao, fornecedor_id, escopos, regional_ids, ips_permitidos,
                               expira_em, chave_prefixo, chave_hash, criado_por)
  values (upper(btrim(p_nome)), nullif(btrim(coalesce(p_descricao, '')), ''), p_fornecedor_id,
          api_normalizar_escopos(p_escopos),
          case when coalesce(array_length(p_regional_ids, 1), 0) = 0 then null else p_regional_ids end,
          case when coalesce(array_length(p_ips, 1), 0) = 0 then null else p_ips end,
          p_expira_em, lower(p_prefixo), lower(p_hash), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function atualizar_api_integracao(
  p_id uuid, p_nome text, p_descricao text, p_fornecedor_id uuid, p_escopos text[],
  p_regional_ids uuid[], p_ips text[], p_expira_em timestamptz, p_ativo boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Somente o administrador altera integracoes da API' using errcode = '42501';
  end if;
  if coalesce(array_length(api_normalizar_escopos(p_escopos), 1), 0) = 0 then
    raise exception 'Escolha ao menos um escopo para a chave' using errcode = 'check_violation';
  end if;
  if exists (select 1 from api_integracoes where id = p_id and revogada_em is not null) and p_ativo then
    raise exception 'Chave revogada nao volta a valer: crie uma nova integracao' using errcode = 'check_violation';
  end if;
  update api_integracoes
     set nome = upper(btrim(p_nome)),
         descricao = nullif(btrim(coalesce(p_descricao, '')), ''),
         fornecedor_id = p_fornecedor_id,
         escopos = api_normalizar_escopos(p_escopos),
         regional_ids = case when coalesce(array_length(p_regional_ids, 1), 0) = 0 then null else p_regional_ids end,
         ips_permitidos = case when coalesce(array_length(p_ips, 1), 0) = 0 then null else p_ips end,
         expira_em = p_expira_em,
         ativo = p_ativo
   where id = p_id;
  if not found then raise exception 'Integracao nao encontrada' using errcode = 'no_data_found'; end if;
end;
$$;

create or replace function girar_chave_api_integracao(p_id uuid, p_prefixo text, p_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Somente o administrador gera chave nova' using errcode = '42501';
  end if;
  update api_integracoes
     set chave_prefixo = lower(p_prefixo), chave_hash = lower(p_hash)
   where id = p_id and revogada_em is null;
  if not found then raise exception 'Integracao nao encontrada ou revogada' using errcode = 'no_data_found'; end if;
end;
$$;

create or replace function revogar_api_integracao(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Somente o administrador revoga chave' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo da revogacao' using errcode = 'check_violation';
  end if;
  update api_integracoes
     set ativo = false, revogada_em = now(), revogada_por = auth.uid(), revogacao_motivo = btrim(p_motivo)
   where id = p_id and revogada_em is null;
  if not found then raise exception 'Integracao nao encontrada ou ja revogada' using errcode = 'no_data_found'; end if;
end;
$$;

create or replace function api_integracoes_listar()
returns table (
  id uuid, nome text, descricao text, fornecedor_id uuid, fornecedor_nome text,
  escopos text[], regional_ids uuid[], ips_permitidos text[], chave_prefixo text,
  ativo boolean, expira_em timestamptz, revogada_em timestamptz, revogacao_motivo text,
  ultimo_uso_em timestamptz, ultimo_ip text, created_at timestamptz,
  requisicoes_24h bigint, erros_24h bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.nome, i.descricao, i.fornecedor_id,
         coalesce(f.nome_fantasia, f.razao_social),
         i.escopos, i.regional_ids, i.ips_permitidos, i.chave_prefixo,
         i.ativo, i.expira_em, i.revogada_em, i.revogacao_motivo,
         i.ultimo_uso_em, i.ultimo_ip, i.created_at,
         (select count(*) from api_requisicoes r where r.integracao_id = i.id and r.created_at > now() - interval '24 hours'),
         (select count(*) from api_requisicoes r where r.integracao_id = i.id and r.created_at > now() - interval '24 hours' and r.status >= 400)
    from api_integracoes i
    left join fornecedores f on f.id = i.fornecedor_id
   where is_admin()
   order by i.revogada_em nulls first, i.nome;
$$;

-- ----------------------------------------------------------------------------
-- (C) A regra que a rastreadora mais precisa: o veiculo deve ser rastreado?
-- Espelho em src/lib/api-externa.ts (situacaoRastreamento) — mexeu num, mexa
-- no outro e nos dois testes.
--   ATIVO     -> manter o rastreamento (veiculo na base, com beneficios)
--   SUSPENSO  -> inadimplente ou suspenso: benefícios bloqueados, equipamento fica
--   ENCERRADO -> saiu da base: encerrar e recolher o equipamento
-- ----------------------------------------------------------------------------
create or replace function api_situacao_rastreamento(p_status text)
returns text
language sql
immutable
as $$
  select case
    when p_status in ('ativo', 'em_evento', 'vistoria_pendente') then 'ATIVO'
    when p_status in ('inadimplente', 'suspenso') then 'SUSPENSO'
    else 'ENCERRADO'
  end;
$$;

-- Confere a integracao e o escopo. So o caminho do servidor (sem sessao).
create or replace function api_exigir(p_integracao_id uuid, p_escopo text)
returns api_integracoes
language plpgsql
stable
security definer
set search_path = public
as $$
declare v api_integracoes;
begin
  if auth.uid() is not null then
    raise exception 'Funcao da API externa: so o servidor chama' using errcode = '42501';
  end if;
  select * into v from api_integracoes where id = p_integracao_id;
  if not found or not v.ativo or v.revogada_em is not null
     or (v.expira_em is not null and v.expira_em <= now()) then
    raise exception 'Integracao inativa, revogada ou vencida' using errcode = '42501';
  end if;
  if not (p_escopo = any(v.escopos)) then
    raise exception 'A chave nao tem o escopo %', p_escopo using errcode = '42501';
  end if;
  return v;
end;
$$;

-- ----------------------------------------------------------------------------
-- (D) Leitura dos VEICULOS — o cruzamento
-- Paginacao por cursor (alterado_em, id): estavel mesmo com a base mudando.
-- alterado_em = o mais recente entre o veiculo e o associado.
-- ----------------------------------------------------------------------------
create or replace function api_veiculos(
  p_integracao_id uuid,
  p_desde        timestamptz default null,
  p_cursor_em    timestamptz default null,
  p_cursor_id    uuid default null,
  p_limite       int default 100,
  p_placa        text default null,
  p_chassi       text default null,
  p_imei         text default null,
  p_veiculo_id   uuid default null,
  p_situacao     text default null
) returns table (
  veiculo_id uuid, placa text, chassi text, renavam text, zero_km boolean,
  marca text, modelo text, ano_fabricacao smallint, ano_modelo smallint, cor text,
  tipo_veiculo text, status text, situacao_rastreamento text, status_desde timestamptz,
  data_ativacao date, data_saida date, unidade_id uuid, unidade_nome text,
  rastreador_imei text, rastreador_chip text, rastreadora_id uuid, rastreadora_nome text,
  cliente_id uuid, associado_nome text, associado_documento text, associado_tipo_pessoa text,
  associado_telefone text, associado_celular text, associado_email text,
  alterado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v       api_integracoes := api_exigir(p_integracao_id, 'veiculos:ler');
  v_pess  boolean := 'associados:ler' = any(v.escopos);
  v_lim   int := least(greatest(coalesce(p_limite, 100), 1), 500);
  v_placa text := nullif(upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_chas  text := nullif(upper(regexp_replace(coalesce(p_chassi, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_imei  text := nullif(regexp_replace(coalesce(p_imei, ''), '\D', '', 'g'), '');
begin
  return query
  with base as (
    select ve.*, greatest(ve.updated_at, c.updated_at) as alt, c.nome_razao_social, c.cpf_cnpj,
           c.tipo_pessoa::text as tp, c.telefone, c.celular, c.email
      from veiculos ve
      join clientes c on c.id = ve.cliente_id
     where (v.regional_ids is null or ve.regional_id = any(v.regional_ids))
       and (p_veiculo_id is null or ve.id = p_veiculo_id)
       and (v_placa is null or ve.placa = v_placa)
       and (v_chas is null or ve.chassi = v_chas)
       and (v_imei is null or ve.rastreador_imei = v_imei)
  )
  select b.id, b.placa, b.chassi, b.renavam, b.zero_km,
         b.marca, b.modelo, b.ano_fabricacao, b.ano_modelo, b.cor,
         tv.nome, b.status::text, api_situacao_rastreamento(b.status::text), b.status_desde,
         b.data_ativacao, b.data_saida, b.regional_id, rg.nome,
         b.rastreador_imei, b.rastreador_chip, b.empresa_rastreamento_id,
         coalesce(f.nome_fantasia, f.razao_social),
         b.cliente_id,
         case when v_pess then b.nome_razao_social end,
         case when v_pess then b.cpf_cnpj end,
         case when v_pess then b.tp end,
         case when v_pess then b.telefone end,
         case when v_pess then b.celular end,
         case when v_pess then b.email end,
         b.alt
    from base b
    left join tipos_veiculo tv on tv.id = b.tipo_veiculo_id
    left join regionais rg on rg.id = b.regional_id
    left join fornecedores f on f.id = b.empresa_rastreamento_id
   where (p_desde is null or b.alt >= p_desde)
     and (p_situacao is null or api_situacao_rastreamento(b.status::text) = upper(p_situacao))
     and (p_cursor_em is null or (b.alt, b.id) > (p_cursor_em, coalesce(p_cursor_id, '00000000-0000-0000-0000-000000000000'::uuid)))
   order by b.alt, b.id
   limit v_lim;
end;
$$;

-- ----------------------------------------------------------------------------
-- (E) Leitura do PARQUE de rastreadores
-- Integracao ligada a um fornecedor ve SO os equipamentos dele.
-- ----------------------------------------------------------------------------
create or replace function api_rastreadores(
  p_integracao_id uuid,
  p_desde        timestamptz default null,
  p_cursor_em    timestamptz default null,
  p_cursor_id    uuid default null,
  p_limite       int default 100,
  p_imei         text default null
) returns table (
  rastreador_id uuid, imei text, numero_serie text, iccid text, linha text, operadora text,
  modelo text, fabricante text, status text, status_numero smallint, status_desde timestamptz,
  rastreadora_id uuid, rastreadora_nome text, unidade_id uuid, unidade_nome text,
  veiculo_id uuid, placa text, chassi text, veiculo_status text, situacao_rastreamento text,
  data_instalacao timestamptz, ultima_comunicacao timestamptz, ultima_posicao jsonb,
  alterado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v      api_integracoes := api_exigir(p_integracao_id, 'rastreadores:ler');
  v_lim  int := least(greatest(coalesce(p_limite, 100), 1), 500);
  v_imei text := nullif(regexp_replace(coalesce(p_imei, ''), '\D', '', 'g'), '');
begin
  return query
  select r.id, r.imei, r.numero_serie, r.iccid, r.linha, r.operadora,
         r.modelo, r.fabricante, r.status::text, numero_status_rastreador(r.status::text), r.status_desde,
         r.empresa_rastreamento_id, coalesce(f.nome_fantasia, f.razao_social),
         r.regional_id, rg.nome,
         r.veiculo_id, ve.placa, ve.chassi, ve.status::text,
         case when ve.id is null then null else api_situacao_rastreamento(ve.status::text) end,
         r.data_instalacao, r.ultima_comunicacao, r.ultima_posicao,
         r.updated_at
    from rastreadores r
    left join fornecedores f on f.id = r.empresa_rastreamento_id
    left join regionais rg on rg.id = r.regional_id
    left join veiculos ve on ve.id = r.veiculo_id
   where (v.fornecedor_id is null or r.empresa_rastreamento_id = v.fornecedor_id)
     and (v.regional_ids is null or r.regional_id = any(v.regional_ids))
     and (v_imei is null or r.imei = v_imei)
     and (p_desde is null or r.updated_at >= p_desde)
     and (p_cursor_em is null or (r.updated_at, r.id) > (p_cursor_em, coalesce(p_cursor_id, '00000000-0000-0000-0000-000000000000'::uuid)))
   order by r.updated_at, r.id
   limit v_lim;
end;
$$;

-- ----------------------------------------------------------------------------
-- (F) A rastreadora devolve a ULTIMA COMUNICACAO de cada equipamento
-- Itens: [{imei, comunicado_em, latitude?, longitude?, velocidade?, ignicao?,
--          endereco?}] — ate 500 por chamada. Nao muda status nem veiculo:
-- e telemetria. Comunicacao mais velha que a gravada e ignorada (a ordem de
-- chegada nao e garantida).
-- ----------------------------------------------------------------------------
create or replace function api_registrar_comunicacoes(p_integracao_id uuid, p_itens jsonb)
returns table (imei text, resultado text, situacao_rastreamento text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v      api_integracoes := api_exigir(p_integracao_id, 'rastreadores:escrever');
  it     jsonb;
  v_imei text;
  v_em   timestamptz;
  r      rastreadores;
  v_pos  jsonb;
  v_sit  text;
begin
  if jsonb_typeof(p_itens) is distinct from 'array' then
    raise exception 'Envie uma lista de comunicacoes' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_itens) > 500 then
    raise exception 'No maximo 500 comunicacoes por chamada' using errcode = 'check_violation';
  end if;

  for it in select * from jsonb_array_elements(p_itens) loop
    v_imei := regexp_replace(coalesce(it->>'imei', ''), '\D', '', 'g');
    v_sit := null;
    begin
      v_em := (it->>'comunicado_em')::timestamptz;
    exception when others then
      v_em := null;
    end;
    if v_imei !~ '^[0-9]{14,17}$' or v_em is null or v_em > now() + interval '5 minutes' then
      imei := v_imei; resultado := 'INVALIDO'; situacao_rastreamento := null;
      return next; continue;
    end if;

    select * into r from rastreadores x where x.imei = v_imei;
    if not found or (v.regional_ids is not null and not (r.regional_id = any(v.regional_ids))) then
      imei := v_imei; resultado := 'NAO_ENCONTRADO'; situacao_rastreamento := null;
      return next; continue;
    end if;
    if v.fornecedor_id is not null and r.empresa_rastreamento_id is distinct from v.fornecedor_id then
      imei := v_imei; resultado := 'OUTRA_PLATAFORMA'; situacao_rastreamento := null;
      return next; continue;
    end if;

    select api_situacao_rastreamento(ve.status::text) into v_sit from veiculos ve where ve.id = r.veiculo_id;

    if r.ultima_comunicacao is not null and r.ultima_comunicacao >= v_em then
      imei := v_imei; resultado := 'IGNORADO_ANTIGO'; situacao_rastreamento := v_sit;
      return next; continue;
    end if;

    v_pos := jsonb_strip_nulls(jsonb_build_object(
      'latitude',  case when (it->>'latitude')  ~ '^-?[0-9]+(\.[0-9]+)?$' and abs((it->>'latitude')::numeric)  <= 90  then (it->>'latitude')::numeric end,
      'longitude', case when (it->>'longitude') ~ '^-?[0-9]+(\.[0-9]+)?$' and abs((it->>'longitude')::numeric) <= 180 then (it->>'longitude')::numeric end,
      'velocidade', case when (it->>'velocidade') ~ '^[0-9]+(\.[0-9]+)?$' then (it->>'velocidade')::numeric end,
      'ignicao',   case when jsonb_typeof(it->'ignicao') = 'boolean' then it->'ignicao' end,
      'endereco',  nullif(left(btrim(coalesce(it->>'endereco', '')), 300), ''),
      'em',        v_em,
      'origem',    v.nome
    ));

    update rastreadores x
       set ultima_comunicacao = v_em,
           ultima_posicao = case when v_pos ? 'latitude' and v_pos ? 'longitude' then v_pos else x.ultima_posicao end
     where x.id = r.id;

    imei := v_imei; resultado := 'ATUALIZADO'; situacao_rastreamento := v_sit;
    return next;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- (G) Espelho na ficha do veiculo sem regravar o que nao mudou (0050)
-- ----------------------------------------------------------------------------
create or replace function fn_rastreador_espelha_veiculo()
returns trigger
language plpgsql
as $$
begin
  -- desinstalou / deixou de estar ativo: limpa a ficha (se ainda e este IMEI)
  if tg_op = 'UPDATE' and old.veiculo_id is not null
     and (new.veiculo_id is distinct from old.veiculo_id
          or (new.status::text <> 'ATIVO' and old.status::text = 'ATIVO')) then
    update veiculos
       set rastreador_imei = null, rastreador_chip = null, empresa_rastreamento_id = null
     where id = old.veiculo_id and rastreador_imei = old.imei;
  end if;

  -- instalado e ativo: a ficha passa a mostrar este equipamento
  if new.veiculo_id is not null and new.status::text = 'ATIVO' then
    update veiculos ve
       set rastreador_imei = new.imei,
           rastreador_chip = x.c,
           empresa_rastreamento_id = new.empresa_rastreamento_id
      from (select (select c from (select coalesce(new.linha, new.iccid) as c) y
                     where c ~ '^[0-9]{8,22}$') as c) x
     where ve.id = new.veiculo_id
       and (ve.rastreador_imei is distinct from new.imei
            or ve.rastreador_chip is distinct from x.c
            or ve.empresa_rastreamento_id is distinct from new.empresa_rastreamento_id);
  end if;

  return new;
end;
$$;

comment on table api_integracoes is
  'API externa (0151): uma linha por sistema integrado. Chave so como SHA-256; escopos, unidades, IPs e validade.';
comment on function api_veiculos(uuid, timestamptz, timestamptz, uuid, int, text, text, text, uuid, text) is
  'API externa (0151): veiculos para o cruzamento, por cursor (alterado_em, id). Dado pessoal so com associados:ler.';
comment on function api_registrar_comunicacoes(uuid, jsonb) is
  'API externa (0151): a rastreadora informa a ultima comunicacao/posicao por IMEI. Nao muda status.';

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
