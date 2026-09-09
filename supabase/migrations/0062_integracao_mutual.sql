-- ============================================================================
-- SCar :: 0062_integracao_mutual.sql
-- FASE 1 da integracao com o MUTUAL: ESPELHO DE LEITURA E DIAGNOSTICO.
--
-- O plano completo esta em docs/modulos/integracao-mutual.md. Esta migration
-- entrega SO a fase de consulta, que foi o que o usuario pediu primeiro:
-- "consultar para avaliar os dados antes de importar".
--
-- REGRA DESTA FASE, sem excecao: NADA aqui escreve em `clientes`, `veiculos`,
-- `titulos_financeiros`, `faturas` ou `eventos_sinistro`. O destino e uma area
-- de captura propria, e o produto e um RELATORIO. O risco de verdade so comeca
-- na Fase 3 (carga), e ate la os numeros ja estarao na mesa.
--
-- Por que guardar o payload CRU em jsonb: quando o de-para mudar — e ele vai
-- mudar — reprocessar sai da area de captura, sem puxar 13 mil registros de
-- novo da API do Mutual.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Area de captura
-- ----------------------------------------------------------------------------
create table if not exists mutual_captura (
  id            bigserial primary key,
  entidade      text not null,
  id_externo    text not null,           -- o `id` inteiro do Mutual, como texto
  uuid_externo  uuid,                    -- o `uuid` que quase todo recurso expoe
  payload       jsonb not null,          -- o retorno EXATAMENTE como veio
  deletado      boolean not null default false,  -- o soft-delete do lado de la
  capturado_em  timestamptz not null default now(),
  capturado_por uuid references usuarios(id) on delete set null,
  constraint chk_mutual_entidade check (entidade in (
    'CONTRACT_OBJECT','PERSON','ADDRESS','INVOICE','EVENT','REGIONAL','CONSULTANT',
    'VEHICLE_TYPE','VEHICLE_COLOR','VEHICLE_CATEGORY','VEHICLE_USE_TYPE','EVENT_TYPE'
  )),
  -- Recapturar ATUALIZA a linha em vez de duplicar: a sondagem e re-executavel,
  -- que e a mesma exigencia de `gerar_faturas_cliente` e `abrir_alerta_veiculo`.
  constraint uq_mutual_captura unique (entidade, id_externo)
);

comment on table mutual_captura is
  'Fase 1 da integracao com o Mutual: espelho CRU da API, so para diagnostico. Nao alimenta a operacao.';

create index if not exists idx_mutual_captura_entidade on mutual_captura (entidade);
create index if not exists idx_mutual_captura_payload  on mutual_captura using gin (payload);

-- Cada rodada de sondagem, para saber o que ja foi puxado e ate onde.
create table if not exists mutual_sincronias (
  id            uuid primary key default gen_random_uuid(),
  entidade      text not null,
  iniciada_em   timestamptz not null default now(),
  concluida_em  timestamptz,
  paginas       integer not null default 0,
  registros     integer not null default 0,
  total_remoto  integer,                 -- o `count` que o servidor declarou
  erro          text,
  executada_por uuid references usuarios(id) on delete set null
);

comment on column mutual_sincronias.total_remoto is
  'O `count` do envelope do DRF: quantos existem la, contra quantos trouxemos.';

alter table mutual_captura    enable row level security;
alter table mutual_sincronias enable row level security;

-- A equipe LE o diagnostico; so a matriz PUXA (importacao e da matriz).
drop policy if exists mcap_select on mutual_captura;
create policy mcap_select on mutual_captura for select using (is_staff());
drop policy if exists mcap_write on mutual_captura;
create policy mcap_write on mutual_captura for all
  using (tem_acesso_global()) with check (tem_acesso_global());

drop policy if exists msinc_select on mutual_sincronias;
create policy msinc_select on mutual_sincronias for select using (is_staff());
drop policy if exists msinc_write on mutual_sincronias;
create policy msinc_write on mutual_sincronias for all
  using (tem_acesso_global()) with check (tem_acesso_global());

-- ----------------------------------------------------------------------------
-- (B) De-para de vocabulario — ESPELHO EXATO de src/lib/mutual.ts
--     Mexeu num lado, mexa no outro e no teste. Ha teste dos dois lados, pelo
--     mesmo motivo da maquina de estados do rastreador (0050).
-- ----------------------------------------------------------------------------
create or replace function mutual_texto(p_valor text)
returns text
language sql immutable
as $$
  -- Vazio vira NULL, nunca ''. chassi/renavam sao UNIQUE NULAVEIS: duas linhas
  -- com string vazia colidem (a mordida de fornecedores.documento, 0051).
  select nullif(btrim(coalesce(p_valor, '')), '');
$$;

create or replace function mutual_status_veiculo(
  p_contract_status text,
  p_object_status   text default null
)
returns status_veiculo
language sql immutable
as $$
  select case
    -- Objeto removido do contrato sai da base, mesmo com o contrato ativo.
    when upper(coalesce(p_object_status, '')) = 'REMOVIDO' then 'inativo'
    -- INADIMPLENTE segue ATIVO: no SCar a inadimplencia e DERIVADA dos titulos
    -- em aberto (dias_atraso_cliente, 0053), nao um status do cadastro.
    when upper(coalesce(p_contract_status, '')) in ('ATIVO','INADIMPLENTE') then 'ativo'
    when upper(coalesce(p_contract_status, '')) = 'SUSPENSO' then 'suspenso'
    when upper(coalesce(p_contract_status, '')) = 'PENDENTE_VISTORIA' then 'vistoria_pendente'
    when upper(coalesce(p_contract_status, '')) in ('SINISTRADO','INDENIZADO') then 'em_evento'
    when upper(coalesce(p_contract_status, '')) in (
      'INATIVO','CANCELADO','CANCELADO_PENDENCIA','CANCELADO_TROCA_TITULARIDADE',
      'NEGADO','RECUSADO','EXPIRADO','SUBSTITUIDO','REMOVIDO'
    ) then 'inativo'
    -- Os demais sao FUNIL DE VENDA (CRIADO, AGUARDANDO_ACEITE, AUTORIZADO...).
    -- NULL = nao importar: venda nova nasce no SCar, pelo hotlink e pelo CRM.
    else null
  end::status_veiculo;
$$;

comment on function mutual_status_veiculo(text, text) is
  'contract_status (25 valores) + status do objeto -> veiculos.status. NULL = funil de venda, nao importar. Espelho de statusVeiculoDoContrato em src/lib/mutual.ts.';

create or replace function mutual_tipo_pessoa(p_person_type text)
returns tipo_pessoa
language sql immutable
as $$
  -- O Mutual manda "1"/"2", nao PF/PJ.
  select case mutual_texto(p_person_type)
           when '1' then 'PF' when '2' then 'PJ' else null end::tipo_pessoa;
$$;

-- ----------------------------------------------------------------------------
-- (C) Gravacao da sondagem (a rota chama esta funcao; nada de service_role)
-- ----------------------------------------------------------------------------
create or replace function mutual_registrar_captura(
  p_entidade  text,
  p_registros jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer := 0;
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
        -- COALESCE de proposito: uma recaptura com payload parcial (ou de um
        -- endpoint que nao devolve `uuid`) NAO pode apagar a chave externa
        -- estavel que ja tinhamos. O payload e substituido; a identidade, nao.
        uuid_externo = coalesce(excluded.uuid_externo, mutual_captura.uuid_externo),
        deletado     = excluded.deletado,
        capturado_em = now(),
        capturado_por = excluded.capturado_por;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ----------------------------------------------------------------------------
-- (D) O DIAGNOSTICO — o produto desta fase
-- ----------------------------------------------------------------------------
create or replace function mutual_diagnostico()
returns table (
  grupo      text,
  indicador  text,
  valor      bigint,
  detalhe    text,
  severidade text          -- OK | ATENCAO | CRITICO
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
  with obj as (
    select c.payload as p,
           mutual_status_veiculo(c.payload->>'contract_status', c.payload->>'status') as st,
           mutual_texto(c.payload#>>'{vehicle_data,vehicle_plate}')   as placa,
           mutual_texto(c.payload#>>'{vehicle_data,vehicle_chassi}')  as chassi,
           mutual_texto(c.payload#>>'{person_data,person_cpf_cnpj}')  as cpf,
           mutual_texto(c.payload#>>'{person_data,person_name}')      as nome,
           mutual_texto(c.payload->>'due_day')                        as dia,
           mutual_texto(c.payload->>'first_activation_date')          as ativacao,
           nullif(c.payload->>'final_total_value','')::numeric        as vlr,
           c.payload->>'contract_id'                                  as contrato
      from mutual_captura c
     where c.entidade = 'CONTRACT_OBJECT' and not c.deletado
  ),
  base as (select * from obj where st is not null)   -- o que SERIA importado
  -- volume --------------------------------------------------------------------
  -- Este conta TUDO que veio da API, inclusive o soft-delete; os indicadores
  -- seguintes ja filtram. Sem isso, "capturados" mentiria contra o que a
  -- sondagem reporta ter trazido.
  select 'VOLUME', 'Objetos capturados', count(*)::bigint,
         'Tudo que veio da API, inclusive funil de venda e deletados', 'OK'
    from mutual_captura where entidade = 'CONTRACT_OBJECT'
  union all
  select 'VOLUME', 'Objetos que entrariam na base', count(*)::bigint,
         'Fora o funil de venda, que nasce no SCar', 'OK' from base
  union all
  select 'VOLUME', 'Veiculos que entrariam ATIVOS', count(*)::bigint,
         'Sao estes que a flag de cobranca externa precisa cobrir', 'OK'
    from base where st = 'ativo'
  union all
  select 'VOLUME', 'Descartados por serem funil de venda', count(*)::bigint,
         'CRIADO, AGUARDANDO_ACEITE, AUTORIZADO e afins', 'OK'
    from obj where st is null
  -- as tres minas terrestres --------------------------------------------------
  union all
  select 'BLOQUEIO', 'Sem data de ativacao', count(*)::bigint,
         'O trigger carimbaria HOJE e contaminaria faturamento e tempo de casa',
         case when count(*) = 0 then 'OK' else 'CRITICO' end
    from base where ativacao is null
  union all
  select 'BLOQUEIO', 'Sem valor cobrado (nulo ou zero)', count(*)::bigint,
         'Pararia de faturar EM SILENCIO; cortesia com zero voltaria a ser cobrada',
         case when count(*) = 0 then 'OK' else 'CRITICO' end
    from base where vlr is null or vlr <= 0
  union all
  select 'BLOQUEIO', 'Sem dia de vencimento', count(*)::bigint,
         'Cairia no padrao legado (dia 10 do mes seguinte) e mudaria o boleto do associado',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from base where dia is null
  -- cadastro ------------------------------------------------------------------
  union all
  select 'CADASTRO', 'Sem CPF/CNPJ', count(*)::bigint,
         'Quarentena: cpf_cnpj e not null unique e nao aceita placeholder',
         case when count(*) = 0 then 'OK' else 'CRITICO' end
    from base where cpf is null
  union all
  select 'CADASTRO', 'CPF/CNPJ que REPROVA na validacao', count(*)::bigint,
         'chk_documento_valido recusaria a linha',
         case when count(*) = 0 then 'OK' else 'CRITICO' end
    from base
   where cpf is not null
     and not validar_documento(regexp_replace(cpf, '\D', '', 'g'),
                               (case when length(regexp_replace(cpf,'\D','','g')) > 11
                                     then 'PJ' else 'PF' end)::tipo_pessoa)
  union all
  select 'CADASTRO', 'Sem nome', count(*)::bigint, 'Quarentena',
         case when count(*) = 0 then 'OK' else 'CRITICO' end
    from base where nome is null
  union all
  select 'CADASTRO', 'Sem placa', count(*)::bigint,
         'Quarentena: placa e not null unique',
         case when count(*) = 0 then 'OK' else 'CRITICO' end
    from base where placa is null
  -- unicidade -----------------------------------------------------------------
  union all
  select 'UNICIDADE', 'Placas repetidas', count(*)::bigint,
         'Mesma placa em objetos diferentes (transferencia entre associados)',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from (select placa from base where placa is not null
           group by placa having count(*) > 1) x
  union all
  select 'UNICIDADE', 'Chassi repetido', count(*)::bigint, 'chassi e unique nulavel',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from (select chassi from base where chassi is not null
           group by chassi having count(*) > 1) x
  union all
  select 'UNICIDADE', 'Associados repetidos (mesmo CPF)', count(*)::bigint,
         'Viram UM cliente no SCar; a tabela de vinculo guarda os dois ids',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from (select cpf from base where cpf is not null
           group by cpf having count(*) > 1) x
  -- estrutura -----------------------------------------------------------------
  union all
  select 'ESTRUTURA', 'Contratos com 2+ veiculos', count(*)::bigint,
         'E o que decide como tratar o nivel `contract`, que o SCar nao tem',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from (select contrato from base where contrato is not null
           group by contrato having count(*) > 1) x
  union all
  select 'ESTRUTURA', 'Registros marcados como deletados', count(*)::bigint,
         'Soft-delete do Mutual: nao importar, e inativar na sincronia',
         case when count(*) = 0 then 'OK' else 'ATENCAO' end
    from mutual_captura where deletado
  order by 1, 2;
end;
$$;

comment on function mutual_diagnostico() is
  'Relatorio de qualidade da Fase 1: volume, as tres minas terrestres, cadastro, unicidade e estrutura.';

-- Quantos objetos por status do Mutual — a leitura que sustenta o de-para.
create or replace function mutual_por_status()
returns table (
  contract_status text,
  status_scar     text,
  quantidade      bigint
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
  select c.payload->>'contract_status',
         coalesce(
           mutual_status_veiculo(c.payload->>'contract_status', c.payload->>'status')::text,
           '(nao importar - funil de venda)'),
         count(*)::bigint
    from mutual_captura c
   where c.entidade = 'CONTRACT_OBJECT' and not c.deletado
   group by 1, 2
   order by 3 desc;
end;
$$;

-- As filiais encontradas: e daqui que sai o de-para para `regionais` (Fase 2).
create or replace function mutual_filiais()
returns table (
  id_externo   text,
  nome         text,
  cnpj         text,
  objetos      bigint,
  ja_existe_id uuid          -- palpite por CNPJ/nome; NAO cria nada
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
  with reg as (
    select c.id_externo,
           mutual_texto(coalesce(c.payload->>'fantasy_name', c.payload->>'name')) as nome,
           mutual_texto(c.payload->>'cpf_cnpj') as cnpj
      from mutual_captura c
     where c.entidade = 'REGIONAL' and not c.deletado
  ),
  uso as (
    select c.payload->>'regional' as id_ext, count(*)::bigint as n
      from mutual_captura c
     where c.entidade = 'CONTRACT_OBJECT' and not c.deletado
     group by 1
  )
  select r.id_externo, r.nome, r.cnpj, coalesce(u.n, 0),
         (select g.id from regionais g
           where (r.cnpj is not null
                  and regexp_replace(coalesce(g.cnpj,''), '\D', '', 'g')
                    = regexp_replace(r.cnpj, '\D', '', 'g'))
              or upper(btrim(g.nome)) = upper(btrim(coalesce(r.nome, '')))
           limit 1)
    from reg r
    left join uso u on u.id_ext = r.id_externo
   order by 4 desc, 2;
end;
$$;

-- A fila de quarentena, linha a linha, com o motivo.
create or replace function mutual_quarentena(p_limite integer default 200)
returns table (
  id_externo text,
  placa      text,
  associado  text,
  cpf_cnpj   text,
  situacao   text,
  motivos    text[]
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
  with base as (
    select c.id_externo,
           mutual_texto(c.payload#>>'{vehicle_data,vehicle_plate}')  as placa,
           mutual_texto(c.payload#>>'{person_data,person_name}')     as nome,
           mutual_texto(c.payload#>>'{person_data,person_cpf_cnpj}') as cpf,
           c.payload->>'contract_status'                             as sit,
           mutual_texto(c.payload->>'due_day')                       as dia,
           mutual_texto(c.payload->>'first_activation_date')         as ativacao,
           nullif(c.payload->>'final_total_value','')::numeric       as valor
      from mutual_captura c
     where c.entidade = 'CONTRACT_OBJECT'
       and not c.deletado
       and mutual_status_veiculo(c.payload->>'contract_status', c.payload->>'status') is not null
  )
  select b.id_externo, b.placa, b.nome, b.cpf, b.sit,
         array_remove(array[
           case when b.placa is null    then 'SEM_PLACA' end,
           case when b.cpf is null      then 'SEM_CPF' end,
           case when b.nome is null     then 'SEM_NOME' end,
           case when b.ativacao is null then 'SEM_DATA_ATIVACAO' end,
           case when b.valor is null or b.valor <= 0 then 'SEM_VALOR_COBRADO' end,
           case when b.dia is null      then 'SEM_DIA_VENCIMENTO' end
         ], null)
    from base b
   where b.placa is null or b.cpf is null or b.nome is null
      or b.ativacao is null or b.valor is null or b.valor <= 0 or b.dia is null
   order by 1
   limit greatest(coalesce(p_limite, 200), 1);
end;
$$;

-- O que ja esta na area de captura.
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
         max(c.capturado_em),
         (select s.total_remoto from mutual_sincronias s
           where s.entidade = c.entidade and s.total_remoto is not null
           order by s.iniciada_em desc limit 1)
    from mutual_captura c
   group by c.entidade
   order by 1;
end;
$$;

-- ----------------------------------------------------------------------------
-- Rito de seguranca (0052): funcao nasce com EXECUTE para PUBLIC, e estas leem
-- a carteira inteira — nao podem ficar ao alcance da chave anon.
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
