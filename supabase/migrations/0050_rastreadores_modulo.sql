-- ============================================================================
-- SCar :: 0050_rastreadores_modulo.sql
--
-- MODULO DE RASTREADORES — fase 2 (o parque de equipamentos).
--
-- A fase 1 (0049) deu ao VEICULO os campos do rastreador instalado. Isso
-- responde "o que esta neste carro?", mas nao responde as perguntas da
-- operacao: quantos equipamentos existem, onde estao, quantos estao parados no
-- estoque, quais precisam ser recolhidos, quanto se paga por plataforma.
--
-- Aqui o EQUIPAMENTO passa a ser a entidade, com ciclo de vida proprio:
--   (A) `rastreadores` — um registro por IMEI, com estoque, status, filial e
--       plataforma. A instalacao aponta para o veiculo.
--   (B) `status_rastreador` — os 11 status que a equipe ja opera hoje (o numero
--       de cada um e preservado: "2 - Ativo/Instalado").
--   (C) `rastreador_eventos` — historico append-only, gravado por TRIGGER. Nao
--       se confia na aplicacao para escrever historico.
--   (D) `rastreador_manutencoes` — o equipamento que foi para o conserto.
--   (E) A ficha do veiculo (0049) vira a INSTALACAO VIGENTE: instalar/
--       desinstalar espelha IMEI/chip/rastreadora no veiculo por trigger, entao
--       o SAC e a ficha continuam funcionando sem saber deste modulo.
--
-- MAPEAMENTO com o que ja existe (a especificacao pedia tabelas novas; aqui
-- elas seriam estruturas paralelas as que o SCar ja tem):
--   . "filial"     -> `regionais`. E a unidade operacional do sistema e ja
--                     carrega toda a RLS (`pode_regional`, `escopo_regional`).
--                     Criar `filiais` forkaria o multi-tenant em dois eixos.
--   . "plataforma" -> `empresas_rastreamento` (0049). Mesma coisa com outro
--                     nome: a empresa que rastreia. Ganha aqui o custo mensal
--                     por equipamento e o `api_config` da fase 3.
--   . "associado"  -> `clientes`;  "veiculo" -> `veiculos`;  "usuario" -> `usuarios`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (B) Status do equipamento — a numeracao e a que a equipe ja usa.
-- Enum novo NAO pode ser usado na mesma transacao em que e criado, entao todo
-- o resto do arquivo compara como TEXTO (gotcha de 0017/0026/0028/0029).
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'status_rastreador') then
    create type status_rastreador as enum (
      'DISPONIVEL',           -- 1  em estoque, pronto para instalar
      'ATIVO',                -- 2  instalado em veiculo
      'INADIMPLENTE',         -- 3  35+ dias sem pagamento, tentar recuperar
      'INATIVO',              -- 4  pedir devolucao
      'A_DEVOLVER',           -- 5  devolucao solicitada, prazo de 5 dias
      'COBRAR_RASTREADOR',    -- 6  cobrar o equipamento nao devolvido
      'BOLETO_GERADO',        -- 7  boleto do equipamento emitido
      'PENDENCIA_DADOS',      -- 8  cadastro incompleto
      'MANUTENCAO',           -- 9  em reparo
      'DUPLICADO',            -- 10 registro duplicado
      'BAIXADO'               -- 11 sem condicao de uso
    );
  end if;
end $$;

create or replace function numero_status_rastreador(p_status text)
returns smallint
language sql
immutable
as $$
  select case p_status
    when 'DISPONIVEL' then 1  when 'ATIVO' then 2   when 'INADIMPLENTE' then 3
    when 'INATIVO' then 4     when 'A_DEVOLVER' then 5
    when 'COBRAR_RASTREADOR' then 6 when 'BOLETO_GERADO' then 7
    when 'PENDENCIA_DADOS' then 8 when 'MANUTENCAO' then 9
    when 'DUPLICADO' then 10  when 'BAIXADO' then 11
  end::smallint;
$$;

comment on function numero_status_rastreador(text) is
  'Numero do status como a equipe fala ("2 - Ativo"). A ordem e a do sistema antigo.';

-- ----------------------------------------------------------------------------
-- (A.0) A plataforma ganha o custo e a fronteira da integracao futura
-- ----------------------------------------------------------------------------
alter table empresas_rastreamento
  add column if not exists custo_mensal_equipamento numeric(10,2) not null default 0,
  add column if not exists api_config jsonb not null default '{}'::jsonb;

comment on column empresas_rastreamento.custo_mensal_equipamento is
  'Quanto se paga a esta plataforma por equipamento ATIVO no mes.';
comment on column empresas_rastreamento.api_config is
  'Fronteira da integracao (fase 3). Credencial NAO entra aqui em texto puro.';

-- ----------------------------------------------------------------------------
-- (A) O equipamento
-- ----------------------------------------------------------------------------
create table if not exists rastreadores (
  id                       uuid primary key default gen_random_uuid(),
  imei                     text not null unique,
  numero_serie             text,
  iccid                    text,                 -- chip
  linha                    text,                 -- MSISDN
  operadora                text,
  modelo                   text,
  fabricante               text,
  empresa_rastreamento_id  uuid references empresas_rastreamento(id) on delete restrict,
  regional_id              uuid references regionais(id) on delete restrict,
  status                   status_rastreador not null default 'DISPONIVEL',
  veiculo_id               uuid references veiculos(id) on delete set null,
  cliente_id               uuid references clientes(id) on delete set null,
  data_aquisicao           date,
  valor_aquisicao          numeric(10,2),
  nota_fiscal              text,
  data_instalacao          timestamptz,
  data_desinstalacao       timestamptz,
  local_instalacao         text,
  instalador               text,
  observacoes              text,
  status_desde             timestamptz not null default now(),
  -- fronteira da fase 3: existem, ninguem alimenta ainda
  ultima_comunicacao       timestamptz,
  ultima_posicao           jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid references usuarios(id) on delete set null,
  updated_by               uuid references usuarios(id) on delete set null
);

-- Formato conferido no BANCO, igual ao da ficha do veiculo (0049).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_rastreador_imei') then
    alter table rastreadores add constraint chk_rastreador_imei
      check (imei ~ '^[0-9]{14,17}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_rastreador_iccid') then
    alter table rastreadores add constraint chk_rastreador_iccid
      check (iccid is null or iccid ~ '^[0-9]{8,22}$');
  end if;
end $$;

-- Um veiculo nao pode ter dois equipamentos ATIVOS ao mesmo tempo.
create unique index if not exists uq_rastreador_veiculo_ativo
  on rastreadores (veiculo_id)
  where veiculo_id is not null and status = 'ATIVO';

create index if not exists idx_rastreadores_status     on rastreadores (status);
create index if not exists idx_rastreadores_regional   on rastreadores (regional_id, status);
create index if not exists idx_rastreadores_plataforma on rastreadores (empresa_rastreamento_id, status);
create index if not exists idx_rastreadores_veiculo    on rastreadores (veiculo_id) where veiculo_id is not null;
create index if not exists idx_rastreadores_cliente    on rastreadores (cliente_id) where cliente_id is not null;
create index if not exists idx_rastreadores_linha      on rastreadores (linha) where linha is not null;

comment on table rastreadores is
  'Parque de equipamentos por IMEI. A ficha do veiculo (0049) e o espelho da instalacao vigente.';

drop trigger if exists trg_rastreadores_updated on rastreadores;
create trigger trg_rastreadores_updated before update on rastreadores
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- (C) Historico — append only, escrito por trigger
-- ----------------------------------------------------------------------------
create table if not exists rastreador_eventos (
  id                 uuid primary key default gen_random_uuid(),
  rastreador_id      uuid not null references rastreadores(id) on delete cascade,
  tipo               text not null,
  status_anterior    status_rastreador,
  status_novo        status_rastreador,
  veiculo_anterior_id uuid references veiculos(id) on delete set null,
  veiculo_novo_id    uuid references veiculos(id) on delete set null,
  regional_anterior_id uuid references regionais(id) on delete set null,
  regional_nova_id   uuid references regionais(id) on delete set null,
  descricao          text,
  payload            jsonb not null default '{}'::jsonb,
  usuario_id         uuid references usuarios(id) on delete set null,
  -- clock_timestamp: dois eventos da MESMA transacao precisam ordenar
  -- (gotcha da auditoria da OS 24h, 0027).
  created_at         timestamptz not null default clock_timestamp()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_rastreador_evento_tipo') then
    alter table rastreador_eventos add constraint chk_rastreador_evento_tipo
      check (tipo in ('STATUS', 'INSTALACAO', 'DESINSTALACAO', 'TRANSFERENCIA_FILIAL',
                      'TROCA_PLATAFORMA', 'MANUTENCAO', 'IMPORTACAO', 'OBSERVACAO', 'CADASTRO'));
  end if;
end $$;

create index if not exists idx_rastreador_eventos on rastreador_eventos (rastreador_id, created_at desc);

comment on table rastreador_eventos is
  'Historico do equipamento. So a trigger escreve; ninguem edita nem apaga.';

-- ----------------------------------------------------------------------------
-- (D) Manutencao
-- ----------------------------------------------------------------------------
create table if not exists rastreador_manutencoes (
  id            uuid primary key default gen_random_uuid(),
  rastreador_id uuid not null references rastreadores(id) on delete cascade,
  aberta_em     timestamptz not null default now(),
  fechada_em    timestamptz,
  defeito       text,
  solucao       text,
  custo         numeric(10,2),
  fornecedor_id uuid references fornecedores(id) on delete set null,
  fornecedor    text,
  status        text not null default 'ABERTA',
  aberta_por    uuid references usuarios(id) on delete set null,
  fechada_por   uuid references usuarios(id) on delete set null
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_rastreador_manut_status') then
    alter table rastreador_manutencoes add constraint chk_rastreador_manut_status
      check (status in ('ABERTA', 'CONCLUIDA', 'SEM_REPARO'));
  end if;
end $$;

create index if not exists idx_rastreador_manut on rastreador_manutencoes (rastreador_id, aberta_em desc);
-- Uma manutencao aberta por equipamento: duas ordens abertas para o mesmo
-- aparelho e erro de digitacao, nao operacao.
create unique index if not exists uq_rastreador_manut_aberta
  on rastreador_manutencoes (rastreador_id) where status = 'ABERTA';

-- ----------------------------------------------------------------------------
-- O plano tambem pode exigir rastreador (a regra por TIPO DE VEICULO ja existe
-- em `tipos_veiculo.exige_rastreador`, 0019; as duas valem, e a divergencia le
-- as duas).
-- ----------------------------------------------------------------------------
alter table planos_protecao
  add column if not exists exige_rastreador boolean not null default false;

comment on column planos_protecao.exige_rastreador is
  'Combo que so vale com rastreador. Soma-se a regra por tipo de veiculo (0019).';

-- ============================================================================
-- MAQUINA DE ESTADOS (espelhada em src/lib/rastreador.ts)
-- ============================================================================
create or replace function transicao_rastreador_valida(p_de text, p_para text)
returns boolean
language sql
immutable
as $$
  select case
    when p_de = p_para then true
    when p_de = 'DISPONIVEL'        then p_para in ('ATIVO','MANUTENCAO','PENDENCIA_DADOS','DUPLICADO','BAIXADO')
    when p_de = 'ATIVO'             then p_para in ('DISPONIVEL','INADIMPLENTE','INATIVO','A_DEVOLVER','MANUTENCAO','BAIXADO')
    when p_de = 'INADIMPLENTE'      then p_para in ('ATIVO','INATIVO','A_DEVOLVER','DISPONIVEL','BAIXADO')
    when p_de = 'INATIVO'           then p_para in ('A_DEVOLVER','COBRAR_RASTREADOR','DISPONIVEL','MANUTENCAO','BAIXADO')
    when p_de = 'A_DEVOLVER'        then p_para in ('DISPONIVEL','COBRAR_RASTREADOR','MANUTENCAO','BAIXADO')
    when p_de = 'COBRAR_RASTREADOR' then p_para in ('BOLETO_GERADO','DISPONIVEL','BAIXADO')
    when p_de = 'BOLETO_GERADO'     then p_para in ('DISPONIVEL','COBRAR_RASTREADOR','BAIXADO')
    when p_de = 'PENDENCIA_DADOS'   then p_para in ('DISPONIVEL','DUPLICADO','MANUTENCAO','BAIXADO')
    when p_de = 'MANUTENCAO'        then p_para in ('DISPONIVEL','BAIXADO')
    when p_de = 'DUPLICADO'         then p_para in ('DISPONIVEL','BAIXADO')
    when p_de = 'BAIXADO'           then false   -- terminal: nada volta do sucateado
    else false
  end;
$$;

comment on function transicao_rastreador_valida(text, text) is
  'Transicoes permitidas do equipamento. Espelho exato de src/lib/rastreador.ts.';

-- Destinos que exigem justificativa (perda de patrimonio ou cobranca do cliente).
create or replace function status_rastreador_exige_motivo(p_status text)
returns boolean
language sql
immutable
as $$ select p_status in ('BAIXADO', 'DUPLICADO', 'COBRAR_RASTREADOR'); $$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- (1) BEFORE: carimba `status_desde` e a autoria. `status_desde` e a base de
--     todos os prazos (§ A_DEVOLVER > 5 dias, INADIMPLENTE > 35).
create or replace function fn_rastreador_antes()
returns trigger
language plpgsql
as $$
declare v_uid uuid := auth.uid();
begin
  -- digitos apenas: a ficha do veiculo (0049) tem CHECK de formato no chip, e
  -- "(65) 99999-9999" copiado da plataforma quebraria a instalacao la na frente.
  new.imei  := regexp_replace(coalesce(new.imei, ''), '\D', '', 'g');
  new.iccid := nullif(regexp_replace(coalesce(new.iccid, ''), '\D', '', 'g'), '');
  new.linha := nullif(regexp_replace(coalesce(new.linha, ''), '\D', '', 'g'), '');

  if tg_op = 'INSERT' then
    new.status_desde := coalesce(new.status_desde, now());
    if exists (select 1 from usuarios u where u.id = v_uid) then
      new.created_by := coalesce(new.created_by, v_uid);
      new.updated_by := coalesce(new.updated_by, v_uid);
    end if;
  else
    if new.status is distinct from old.status then
      new.status_desde := now();
    end if;
    if exists (select 1 from usuarios u where u.id = v_uid) then
      new.updated_by := v_uid;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rastreador_antes on rastreadores;
create trigger trg_rastreador_antes before insert or update on rastreadores
  for each row execute function fn_rastreador_antes();

-- (2) AFTER: historico. A aplicacao pode esquecer de registrar; a trigger nao.
--     O motivo digitado na tela chega por `set_config('scar.motivo_rastreador')`,
--     mesmo mecanismo da auditoria da OS 24h (0027).
create or replace function fn_rastreador_historico()
returns trigger
language plpgsql
as $$
declare
  v_uid    uuid := auth.uid();
  v_autor  uuid;
  v_motivo text := nullif(current_setting('scar.motivo_rastreador', true), '');
begin
  select u.id into v_autor from usuarios u where u.id = v_uid;

  if tg_op = 'INSERT' then
    insert into rastreador_eventos (rastreador_id, tipo, status_novo, veiculo_novo_id,
                                    regional_nova_id, descricao, usuario_id)
      values (new.id, 'CADASTRO', new.status, new.veiculo_id, new.regional_id,
              coalesce(v_motivo, 'Equipamento cadastrado'), v_autor);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into rastreador_eventos (rastreador_id, tipo, status_anterior, status_novo,
                                    descricao, usuario_id)
      values (new.id, 'STATUS', old.status, new.status, v_motivo, v_autor);
  end if;

  if new.veiculo_id is distinct from old.veiculo_id then
    insert into rastreador_eventos (rastreador_id, tipo, veiculo_anterior_id, veiculo_novo_id,
                                    descricao, usuario_id)
      values (new.id,
              case when new.veiculo_id is null then 'DESINSTALACAO' else 'INSTALACAO' end,
              old.veiculo_id, new.veiculo_id, v_motivo, v_autor);
  end if;

  if new.regional_id is distinct from old.regional_id then
    insert into rastreador_eventos (rastreador_id, tipo, regional_anterior_id, regional_nova_id,
                                    descricao, usuario_id)
      values (new.id, 'TRANSFERENCIA_FILIAL', old.regional_id, new.regional_id, v_motivo, v_autor);
  end if;

  if new.empresa_rastreamento_id is distinct from old.empresa_rastreamento_id then
    insert into rastreador_eventos (rastreador_id, tipo, descricao, payload, usuario_id)
      values (new.id, 'TROCA_PLATAFORMA', v_motivo,
              jsonb_build_object('de', old.empresa_rastreamento_id, 'para', new.empresa_rastreamento_id),
              v_autor);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_rastreador_historico on rastreadores;
create trigger trg_rastreador_historico after insert or update on rastreadores
  for each row execute function fn_rastreador_historico();

-- (3) AFTER: espelho na FICHA DO VEICULO (0049).
--     A ficha continua sendo o lugar onde o SAC olha "o que esta neste carro";
--     ela passa a ser mantida pelo modulo, e nao digitada.
create or replace function fn_rastreador_espelha_veiculo()
returns trigger
language plpgsql
as $$
begin
  -- saiu de um veiculo (desinstalou, trocou de carro ou deixou de estar ativo):
  -- limpa a ficha ANTIGA, mas so se ela ainda apontar para este equipamento.
  if tg_op = 'UPDATE' and old.veiculo_id is not null
     and (new.veiculo_id is distinct from old.veiculo_id
          or (new.status::text <> 'ATIVO' and old.status::text = 'ATIVO')) then
    update veiculos
       set rastreador_imei = null, rastreador_chip = null, empresa_rastreamento_id = null
     where id = old.veiculo_id and rastreador_imei = old.imei;
  end if;

  -- instalado e ativo: a ficha passa a refletir o equipamento.
  if new.veiculo_id is not null and new.status::text = 'ATIVO' then
    update veiculos
       set rastreador_imei = new.imei,
           -- so o que passa no CHECK do veiculo (8 a 22 digitos); fora disso, nulo.
           rastreador_chip = (select c from (select coalesce(new.linha, new.iccid) as c) x
                               where c ~ '^[0-9]{8,22}$'),
           empresa_rastreamento_id = new.empresa_rastreamento_id
     where id = new.veiculo_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_rastreador_espelha_veiculo on rastreadores;
create trigger trg_rastreador_espelha_veiculo after insert or update on rastreadores
  for each row execute function fn_rastreador_espelha_veiculo();

-- ============================================================================
-- RLS
--   ver     -> qualquer staff (o SAC precisa achar o equipamento pelo IMEI)
--   mexer   -> admin/financeiro (global) ou gestor da PROPRIA regional
--   baixar  -> so quem tem acesso global (patrimonio nao se apaga de filial)
--   eventos -> ninguem escreve pela API: so a trigger. Sem update/delete.
-- Os papeis da especificacao mapeiam nos que existem: gestor_filial ->
-- gestor_regional; operador -> staff da regional; consulta -> is_staff().
-- ============================================================================
alter table rastreadores           enable row level security;
alter table rastreador_eventos     enable row level security;
alter table rastreador_manutencoes enable row level security;

drop policy if exists rast_select on rastreadores;
create policy rast_select on rastreadores for select to authenticated using (is_staff());

drop policy if exists rast_insert on rastreadores;
create policy rast_insert on rastreadores for insert to authenticated
  with check (tem_acesso_global() or pode_regional(regional_id));

drop policy if exists rast_update on rastreadores;
create policy rast_update on rastreadores for update to authenticated
  using (tem_acesso_global() or pode_regional(regional_id))
  with check (tem_acesso_global() or pode_regional(regional_id));

-- Delete nao existe de proposito: equipamento sai por BAIXADO/DUPLICADO.

drop policy if exists rast_ev_select on rastreador_eventos;
create policy rast_ev_select on rastreador_eventos for select to authenticated using (is_staff());

drop policy if exists rast_manut_select on rastreador_manutencoes;
create policy rast_manut_select on rastreador_manutencoes for select to authenticated using (is_staff());

drop policy if exists rast_manut_write on rastreador_manutencoes;
create policy rast_manut_write on rastreador_manutencoes for all to authenticated
  using (exists (select 1 from rastreadores r where r.id = rastreador_id
                   and (tem_acesso_global() or pode_regional(r.regional_id))))
  with check (exists (select 1 from rastreadores r where r.id = rastreador_id
                   and (tem_acesso_global() or pode_regional(r.regional_id))));

grant select, insert, update on rastreadores to authenticated;
grant select on rastreador_eventos to authenticated;
grant select, insert, update on rastreador_manutencoes to authenticated;

-- ============================================================================
-- OPERACAO (RPCs) — toda escrita de negocio passa por aqui.
-- ============================================================================

-- Quem pode mexer NESTE equipamento (espelha o `using` da policy de update).
create or replace function pode_mexer_rastreador(p_rastreador_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from rastreadores r
     where r.id = p_rastreador_id
       and (tem_acesso_global() or pode_regional(r.regional_id))
  );
$$;

-- ---------------------------------------------------------------- instalar
create or replace function instalar_rastreador(
  p_rastreador_id uuid,
  p_veiculo_id    uuid,
  p_data          timestamptz default now(),
  p_local         text default null,
  p_instalador    text default null,
  p_observacoes   text default null
)
returns rastreadores
language plpgsql
security definer
set search_path = public
as $$
declare
  r   rastreadores;
  v   veiculos;
  n   integer;
begin
  select * into r from rastreadores where id = p_rastreador_id;
  if r.id is null then raise exception 'Rastreador nao encontrado'; end if;
  if not pode_mexer_rastreador(r.id) then
    raise exception 'Sem permissao para movimentar este equipamento';
  end if;

  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then raise exception 'Veiculo nao encontrado'; end if;
  if v.status::text = 'excluido' then raise exception 'Veiculo excluido nao recebe instalacao'; end if;

  if r.status::text <> 'DISPONIVEL' then
    raise exception 'So instala equipamento em estoque (status atual: %)', r.status;
  end if;

  select count(*) into n from rastreadores
   where veiculo_id = p_veiculo_id and status::text = 'ATIVO' and id <> r.id;
  if n > 0 then
    raise exception 'O veiculo % ja tem rastreador ativo. Desinstale o atual antes.', v.placa;
  end if;

  perform set_config('scar.motivo_rastreador',
                     coalesce(p_observacoes, 'Instalado no veiculo ' || v.placa), true);

  update rastreadores
     set status             = 'ATIVO',
         veiculo_id         = p_veiculo_id,
         cliente_id         = v.cliente_id,
         regional_id        = coalesce(v.regional_id, regional_id),
         data_instalacao    = coalesce(p_data, now()),
         data_desinstalacao = null,
         local_instalacao   = coalesce(p_local, local_instalacao),
         instalador         = coalesce(p_instalador, instalador)
   where id = r.id
   returning * into r;

  return r;
end;
$$;

-- -------------------------------------------------------------- desinstalar
create or replace function desinstalar_rastreador(
  p_rastreador_id uuid,
  p_status_novo   text default 'DISPONIVEL',   -- DISPONIVEL | MANUTENCAO | BAIXADO
  p_motivo        text default null,
  p_data          timestamptz default now()
)
returns rastreadores
language plpgsql
security definer
set search_path = public
as $$
declare r rastreadores;
begin
  select * into r from rastreadores where id = p_rastreador_id;
  if r.id is null then raise exception 'Rastreador nao encontrado'; end if;
  if not pode_mexer_rastreador(r.id) then
    raise exception 'Sem permissao para movimentar este equipamento';
  end if;
  if r.veiculo_id is null then raise exception 'Este equipamento nao esta instalado'; end if;
  if p_status_novo not in ('DISPONIVEL', 'MANUTENCAO', 'BAIXADO') then
    raise exception 'Destino invalido na desinstalacao: %', p_status_novo;
  end if;
  if status_rastreador_exige_motivo(p_status_novo) and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo para mover o equipamento para %', p_status_novo;
  end if;

  perform set_config('scar.motivo_rastreador', coalesce(p_motivo, 'Retirado do veiculo'), true);

  update rastreadores
     set status             = p_status_novo::status_rastreador,
         veiculo_id         = null,
         cliente_id         = null,
         data_desinstalacao = coalesce(p_data, now())
   where id = r.id
   returning * into r;

  return r;
end;
$$;

-- ------------------------------------------------------------- mudar status
create or replace function mover_status_rastreador(
  p_rastreador_id uuid,
  p_status        text,
  p_motivo        text default null
)
returns rastreadores
language plpgsql
security definer
set search_path = public
as $$
declare r rastreadores;
begin
  select * into r from rastreadores where id = p_rastreador_id;
  if r.id is null then raise exception 'Rastreador nao encontrado'; end if;
  if not pode_mexer_rastreador(r.id) then
    raise exception 'Sem permissao para movimentar este equipamento';
  end if;
  if p_status = 'ATIVO' then
    raise exception 'Ativar e instalar: use a acao de instalacao, que exige o veiculo';
  end if;
  if not transicao_rastreador_valida(r.status::text, p_status) then
    raise exception 'Transicao nao permitida: % -> %', r.status, p_status;
  end if;
  if status_rastreador_exige_motivo(p_status) and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo para mover o equipamento para %', p_status;
  end if;
  if p_status in ('BAIXADO', 'DUPLICADO') and not tem_acesso_global() then
    raise exception 'Baixa de patrimonio e da matriz (admin/financeiro)';
  end if;

  perform set_config('scar.motivo_rastreador', p_motivo, true);

  update rastreadores
     set status = p_status::status_rastreador,
         -- sai de campo: o vinculo com o veiculo nao sobrevive a estes status
         veiculo_id = case when p_status in ('DISPONIVEL','MANUTENCAO','BAIXADO','DUPLICADO')
                           then null else veiculo_id end,
         cliente_id = case when p_status in ('DISPONIVEL','MANUTENCAO','BAIXADO','DUPLICADO')
                           then null else cliente_id end
   where id = r.id
   returning * into r;

  return r;
end;
$$;

-- ------------------------------------------------------- transferir filial
create or replace function transferir_rastreador_regional(
  p_rastreador_id uuid,
  p_regional_id   uuid,
  p_motivo        text default null
)
returns rastreadores
language plpgsql
security definer
set search_path = public
as $$
declare r rastreadores;
begin
  select * into r from rastreadores where id = p_rastreador_id;
  if r.id is null then raise exception 'Rastreador nao encontrado'; end if;
  if not pode_mexer_rastreador(r.id) then
    raise exception 'Sem permissao para movimentar este equipamento';
  end if;
  if r.status::text = 'ATIVO' then
    raise exception 'Equipamento instalado acompanha o veiculo: desinstale antes de transferir';
  end if;
  if not exists (select 1 from regionais where id = p_regional_id) then
    raise exception 'Unidade nao encontrada';
  end if;

  perform set_config('scar.motivo_rastreador', p_motivo, true);
  update rastreadores set regional_id = p_regional_id where id = r.id returning * into r;
  return r;
end;
$$;

-- --------------------------------------------------------------- manutencao
create or replace function abrir_manutencao_rastreador(
  p_rastreador_id uuid,
  p_defeito       text,
  p_fornecedor_id uuid default null,
  p_fornecedor    text default null
)
returns rastreador_manutencoes
language plpgsql
security definer
set search_path = public
as $$
declare
  r rastreadores;
  m rastreador_manutencoes;
begin
  select * into r from rastreadores where id = p_rastreador_id;
  if r.id is null then raise exception 'Rastreador nao encontrado'; end if;
  if not pode_mexer_rastreador(r.id) then
    raise exception 'Sem permissao para movimentar este equipamento';
  end if;
  if coalesce(btrim(p_defeito), '') = '' then raise exception 'Descreva o defeito'; end if;
  if not transicao_rastreador_valida(r.status::text, 'MANUTENCAO') then
    raise exception 'Nao da para mandar para manutencao a partir de %', r.status;
  end if;

  insert into rastreador_manutencoes (rastreador_id, defeito, fornecedor_id, fornecedor, aberta_por)
    values (r.id, p_defeito, p_fornecedor_id, p_fornecedor,
            (select u.id from usuarios u where u.id = auth.uid()))
    returning * into m;

  perform set_config('scar.motivo_rastreador', 'Manutencao: ' || p_defeito, true);
  update rastreadores
     set status = 'MANUTENCAO', veiculo_id = null, cliente_id = null,
         data_desinstalacao = case when veiculo_id is not null then now() else data_desinstalacao end
   where id = r.id;

  insert into rastreador_eventos (rastreador_id, tipo, descricao, payload, usuario_id)
    values (r.id, 'MANUTENCAO', p_defeito, jsonb_build_object('manutencao_id', m.id),
            (select u.id from usuarios u where u.id = auth.uid()));

  return m;
end;
$$;

create or replace function concluir_manutencao_rastreador(
  p_manutencao_id uuid,
  p_solucao       text,
  p_custo         numeric default null,
  p_sem_reparo    boolean default false
)
returns rastreador_manutencoes
language plpgsql
security definer
set search_path = public
as $$
declare m rastreador_manutencoes;
begin
  select * into m from rastreador_manutencoes where id = p_manutencao_id;
  if m.id is null then raise exception 'Manutencao nao encontrada'; end if;
  if m.status <> 'ABERTA' then raise exception 'Esta manutencao ja foi encerrada'; end if;
  if not pode_mexer_rastreador(m.rastreador_id) then
    raise exception 'Sem permissao para movimentar este equipamento';
  end if;
  if coalesce(btrim(p_solucao), '') = '' then raise exception 'Descreva o que foi feito'; end if;
  if p_sem_reparo and not tem_acesso_global() then
    raise exception 'Baixa de patrimonio e da matriz (admin/financeiro)';
  end if;

  update rastreador_manutencoes
     set status = case when p_sem_reparo then 'SEM_REPARO' else 'CONCLUIDA' end,
         solucao = p_solucao, custo = p_custo, fechada_em = now(),
         fechada_por = (select u.id from usuarios u where u.id = auth.uid())
   where id = m.id
   returning * into m;

  perform set_config('scar.motivo_rastreador', p_solucao, true);
  update rastreadores
     set status = case when p_sem_reparo then 'BAIXADO' else 'DISPONIVEL' end::status_rastreador
   where id = m.rastreador_id;

  insert into rastreador_eventos (rastreador_id, tipo, descricao, payload, usuario_id)
    values (m.rastreador_id, 'MANUTENCAO', p_solucao,
            jsonb_build_object('manutencao_id', m.id, 'custo', p_custo, 'sem_reparo', p_sem_reparo),
            (select u.id from usuarios u where u.id = auth.uid()));

  return m;
end;
$$;

grant execute on function instalar_rastreador(uuid, uuid, timestamptz, text, text, text) to authenticated;
grant execute on function desinstalar_rastreador(uuid, text, text, timestamptz) to authenticated;
grant execute on function mover_status_rastreador(uuid, text, text) to authenticated;
grant execute on function transferir_rastreador_regional(uuid, uuid, text) to authenticated;
grant execute on function abrir_manutencao_rastreador(uuid, text, uuid, text) to authenticated;
grant execute on function concluir_manutencao_rastreador(uuid, text, numeric, boolean) to authenticated;
grant execute on function pode_mexer_rastreador(uuid) to authenticated;
grant execute on function transicao_rastreador_valida(text, text) to authenticated;
grant execute on function status_rastreador_exige_motivo(text) to authenticated;
grant execute on function numero_status_rastreador(text) to authenticated;

-- ============================================================================
-- CONSULTA — lista paginada, ficha, historico e dashboard.
-- SECURITY DEFINER + escopo_regional(): passar o id de outra unidade nao muda
-- o que volta (mesma postura de 0032/0036).
-- ============================================================================
create or replace function rastreadores_listar(
  p_busca       text default null,   -- IMEI, linha, serie, placa ou nome do associado
  p_status      text default null,
  p_regional_id uuid default null,
  p_plataforma_id uuid default null,
  p_com_veiculo boolean default null,
  p_limite      integer default 50,
  p_offset      integer default 0
)
returns table (
  id uuid, imei text, numero_serie text, linha text, iccid text, operadora text,
  modelo text, fabricante text,
  status status_rastreador, status_numero smallint, status_desde timestamptz, dias_no_status integer,
  regional_id uuid, regional text,
  empresa_rastreamento_id uuid, plataforma text,
  veiculo_id uuid, placa text, veiculo text,
  cliente_id uuid, associado text,
  data_instalacao timestamptz, local_instalacao text, instalador text,
  total_registros bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with escopo as (
    select case when tem_acesso_global() then p_regional_id else auth_regional_id() end as reg,
           tem_acesso_global() as global
  ),
  base as (
    select r.*,
           reg.nome  as regional_nome,
           pl.nome   as plataforma_nome,
           v.placa   as veiculo_placa,
           nullif(btrim(concat_ws(' ', v.marca, v.modelo)), '') as veiculo_desc,
           c.nome_razao_social as associado_nome
      from rastreadores r
      left join regionais reg            on reg.id = r.regional_id
      left join empresas_rastreamento pl on pl.id = r.empresa_rastreamento_id
      left join veiculos v               on v.id  = r.veiculo_id
      left join clientes c               on c.id  = r.cliente_id
      cross join escopo e
     where is_staff()
       and (e.global or r.regional_id is not distinct from e.reg)
       and (not e.global or e.reg is null or r.regional_id = e.reg)
       and (p_status is null or r.status::text = p_status)
       and (p_plataforma_id is null or r.empresa_rastreamento_id = p_plataforma_id)
       and (p_com_veiculo is null
            or (p_com_veiculo and r.veiculo_id is not null)
            or (not p_com_veiculo and r.veiculo_id is null))
       and (
         p_busca is null or btrim(p_busca) = ''
         or r.imei ilike '%' || btrim(p_busca) || '%'
         or coalesce(r.linha, '') ilike '%' || btrim(p_busca) || '%'
         or coalesce(r.numero_serie, '') ilike '%' || btrim(p_busca) || '%'
         or coalesce(v.placa, '') ilike '%' || btrim(p_busca) || '%'
         or coalesce(c.nome_razao_social, '') ilike '%' || btrim(p_busca) || '%'
       )
  )
  select b.id, b.imei, b.numero_serie, b.linha, b.iccid, b.operadora, b.modelo, b.fabricante,
         b.status, numero_status_rastreador(b.status::text),
         b.status_desde, (extract(day from now() - b.status_desde))::int,
         b.regional_id, b.regional_nome,
         b.empresa_rastreamento_id, b.plataforma_nome,
         b.veiculo_id, b.veiculo_placa, b.veiculo_desc,
         b.cliente_id, b.associado_nome,
         b.data_instalacao, b.local_instalacao, b.instalador,
         count(*) over () as total_registros
    from base b
   order by numero_status_rastreador(b.status::text), b.status_desde desc
   limit greatest(coalesce(p_limite, 50), 1) offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function rastreador_ficha(p_id uuid)
returns table (
  id uuid, imei text, numero_serie text, iccid text, linha text, operadora text,
  modelo text, fabricante text, status status_rastreador, status_numero smallint,
  status_desde timestamptz, dias_no_status integer,
  regional_id uuid, regional text, empresa_rastreamento_id uuid, plataforma text,
  plataforma_url text, custo_mensal numeric,
  veiculo_id uuid, placa text, veiculo text, cliente_id uuid, associado text, associado_documento text,
  data_aquisicao date, valor_aquisicao numeric, nota_fiscal text,
  data_instalacao timestamptz, data_desinstalacao timestamptz,
  local_instalacao text, instalador text, observacoes text,
  manutencao_aberta_id uuid, pode_editar boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.imei, r.numero_serie, r.iccid, r.linha, r.operadora, r.modelo, r.fabricante,
         r.status, numero_status_rastreador(r.status::text), r.status_desde,
         (extract(day from now() - r.status_desde))::int,
         r.regional_id, reg.nome, r.empresa_rastreamento_id, pl.nome, pl.plataforma_url,
         pl.custo_mensal_equipamento,
         r.veiculo_id, v.placa, nullif(btrim(concat_ws(' ', v.marca, v.modelo)), ''),
         r.cliente_id, c.nome_razao_social, c.cpf_cnpj,
         r.data_aquisicao, r.valor_aquisicao, r.nota_fiscal,
         r.data_instalacao, r.data_desinstalacao, r.local_instalacao, r.instalador, r.observacoes,
         (select m.id from rastreador_manutencoes m
           where m.rastreador_id = r.id and m.status = 'ABERTA' limit 1),
         pode_mexer_rastreador(r.id)
    from rastreadores r
    left join regionais reg            on reg.id = r.regional_id
    left join empresas_rastreamento pl on pl.id = r.empresa_rastreamento_id
    left join veiculos v               on v.id  = r.veiculo_id
    left join clientes c               on c.id  = r.cliente_id
   where r.id = p_id and is_staff();
$$;

create or replace function rastreador_historico(p_id uuid, p_limite integer default 100)
returns table (
  id uuid, tipo text, status_anterior status_rastreador, status_novo status_rastreador,
  veiculo_anterior text, veiculo_novo text,
  regional_anterior text, regional_nova text,
  descricao text, autor text, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.tipo, e.status_anterior, e.status_novo,
         va.placa, vn.placa, ra.nome, rn.nome,
         e.descricao, u.nome, e.created_at
    from rastreador_eventos e
    left join veiculos  va on va.id = e.veiculo_anterior_id
    left join veiculos  vn on vn.id = e.veiculo_novo_id
    left join regionais ra on ra.id = e.regional_anterior_id
    left join regionais rn on rn.id = e.regional_nova_id
    left join usuarios  u  on u.id  = e.usuario_id
   where e.rastreador_id = p_id and is_staff()
   order by e.created_at desc
   limit greatest(coalesce(p_limite, 100), 1);
$$;

-- Dashboard: quantos por status, por unidade e por plataforma (+ custo mensal).
create or replace function rastreadores_resumo(p_regional_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with escopo as (
    select case when tem_acesso_global() then p_regional_id else auth_regional_id() end as reg,
           tem_acesso_global() as global
  ),
  base as (
    select r.* from rastreadores r cross join escopo e
     where is_staff()
       and (e.global or r.regional_id is not distinct from e.reg)
       and (not e.global or e.reg is null or r.regional_id = e.reg)
  )
  select jsonb_build_object(
    'total',    (select count(*) from base),
    'ativos',   (select count(*) from base where status::text = 'ATIVO'),
    'estoque',  (select count(*) from base where status::text = 'DISPONIVEL'),
    'por_status', coalesce((
      select jsonb_agg(jsonb_build_object('status', t.status, 'numero', t.numero,
                                          'quantidade', t.quantidade) order by t.numero)
        from (select b.status::text as status,
                     numero_status_rastreador(b.status::text) as numero,
                     count(*) as quantidade
                from base b group by b.status) t
    ), '[]'::jsonb),
    'por_regional', coalesce((
      select jsonb_agg(jsonb_build_object('regional_id', t.regional_id, 'regional', t.regional,
                                          'total', t.total, 'ativos', t.ativos, 'estoque', t.estoque)
                       order by t.total desc)
        from (select b.regional_id, coalesce(reg.nome, 'Sem unidade') as regional,
                     count(*) as total,
                     count(*) filter (where b.status::text = 'ATIVO') as ativos,
                     count(*) filter (where b.status::text = 'DISPONIVEL') as estoque
                from base b left join regionais reg on reg.id = b.regional_id
               group by b.regional_id, reg.nome) t
    ), '[]'::jsonb),
    'por_plataforma', coalesce((
      select jsonb_agg(jsonb_build_object('plataforma_id', t.plataforma_id, 'plataforma', t.plataforma,
                                          'total', t.total, 'ativos', t.ativos,
                                          'custo_mensal', t.custo_mensal)
                       order by t.total desc)
        from (select b.empresa_rastreamento_id as plataforma_id,
                     coalesce(pl.nome, 'Sem plataforma') as plataforma,
                     count(*) as total,
                     count(*) filter (where b.status::text = 'ATIVO') as ativos,
                     round(coalesce(pl.custo_mensal_equipamento, 0)
                           * count(*) filter (where b.status::text = 'ATIVO'), 2) as custo_mensal
                from base b left join empresas_rastreamento pl on pl.id = b.empresa_rastreamento_id
               group by b.empresa_rastreamento_id, pl.nome, pl.custo_mensal_equipamento) t
    ), '[]'::jsonb)
  );
$$;

grant execute on function rastreadores_listar(text, text, uuid, uuid, boolean, integer, integer) to authenticated;
grant execute on function rastreador_ficha(uuid) to authenticated;
grant execute on function rastreador_historico(uuid, integer) to authenticated;
grant execute on function rastreadores_resumo(uuid) to authenticated;

-- ============================================================================
-- CRUZAMENTO COM O CADASTRO DE VEICULOS — as divergencias.
-- E o que a operacao olha todo dia: onde os dois lados discordam.
-- ============================================================================
create or replace function rastreadores_divergencias(
  p_regional_id uuid default null,
  p_tipo        text default null,
  p_severidade  text default null,
  p_dias_inadimplencia integer default 35,
  p_limite      integer default 500
)
returns table (
  tipo          text,
  severidade    text,
  rastreador_id uuid,
  imei          text,
  veiculo_id    uuid,
  placa         text,
  cliente_id    uuid,
  associado     text,
  regional_id   uuid,
  regional      text,
  descricao     text
)
language sql
stable
security definer
set search_path = public
as $$
  with escopo as (
    select case when tem_acesso_global() then p_regional_id else auth_regional_id() end as reg,
           tem_acesso_global() as global
  ),
  rast as (
    select r.* from rastreadores r cross join escopo e
     where (e.global or r.regional_id is not distinct from e.reg)
       and (not e.global or e.reg is null or r.regional_id = e.reg)
  ),
  veic as (
    select v.* from veiculos v cross join escopo e
     where v.status::text <> 'excluido'
       and (e.global or v.regional_id is not distinct from e.reg)
       and (not e.global or e.reg is null or v.regional_id = e.reg)
  ),
  -- inadimplencia pela mesma regra da 24h (0026): titulo vencido do veiculo
  -- ou do associado no faturamento agrupado.
  atraso as (
    select t.cliente_id, max(current_date - t.data_vencimento) as dias
      from titulos_financeiros t
     where t.status::text in ('pendente', 'vencido')
       and t.data_vencimento < current_date
     group by t.cliente_id
  ),
  achados as (
    -- 1. o plano/tipo exige rastreador e o veiculo nao tem nenhum ativo
    select 'VEICULO_SEM_RASTREADOR' as tipo, 'ALTA' as severidade,
           null::uuid as rastreador_id, null::text as imei,
           v.id as veiculo_id, v.placa, v.cliente_id, v.regional_id,
           'Veiculo ativo cuja cobertura exige rastreador e nao tem equipamento instalado' as descricao
      from veic v
      left join tipos_veiculo tv    on tv.id = v.tipo_veiculo_id
      left join planos_protecao pp  on pp.id = v.plano_protecao_id
     where v.status::text in ('ativo', 'em_evento')
       and (coalesce(tv.exige_rastreador, false) or coalesce(pp.exige_rastreador, false))
       and not exists (select 1 from rastreadores r
                        where r.veiculo_id = v.id and r.status::text = 'ATIVO')

    union all
    -- 2. equipamento ativo sem veiculo (ou apontando para veiculo excluido)
    select 'RASTREADOR_ORFAO', 'ALTA', r.id, r.imei, r.veiculo_id, v.placa, r.cliente_id, r.regional_id,
           case when r.veiculo_id is null
                then 'Equipamento marcado como ativo sem veiculo vinculado'
                else 'Equipamento ativo apontando para veiculo excluido' end
      from rast r
      left join veiculos v on v.id = r.veiculo_id
     where r.status::text = 'ATIVO'
       and (r.veiculo_id is null or v.id is null or v.status::text = 'excluido')

    union all
    -- 3. equipamento ativo em veiculo que saiu da base -> recolher
    select 'RASTREADOR_EM_VEICULO_INATIVO', 'ALTA', r.id, r.imei, v.id, v.placa, r.cliente_id, r.regional_id,
           'Equipamento ativo em veiculo com status ' || v.status::text || ' — candidato a recolhimento'
      from rast r
      join veiculos v on v.id = r.veiculo_id
     where r.status::text = 'ATIVO'
       and v.status::text in ('inativo', 'suspenso', 'baixado')

    union all
    -- 4. associado devendo ha mais de N dias com equipamento ativo
    select 'INADIMPLENTE_COM_EQUIPAMENTO_ATIVO', 'ALTA', r.id, r.imei, v.id, v.placa, r.cliente_id, r.regional_id,
           format('Associado com %s dias de atraso e equipamento ainda ativo (status sugerido: 3 - Inadimplente)', a.dias)
      from rast r
      join veiculos v on v.id = r.veiculo_id
      join atraso a   on a.cliente_id = r.cliente_id
     where r.status::text = 'ATIVO'
       and a.dias > greatest(coalesce(p_dias_inadimplencia, 35), 1)

    union all
    -- 5. dois equipamentos ativos no mesmo veiculo (o indice parcial impede
    --    hoje; a checagem existe para dado que entre por carga futura)
    select 'VEICULO_COM_MAIS_DE_UM_ATIVO', 'ALTA', r.id, r.imei, v.id, v.placa, r.cliente_id, r.regional_id,
           'Ha mais de um equipamento ativo neste veiculo'
      from rast r
      join veiculos v on v.id = r.veiculo_id
     where r.status::text = 'ATIVO'
       and (select count(*) from rastreadores r2
             where r2.veiculo_id = r.veiculo_id and r2.status::text = 'ATIVO') > 1

    union all
    -- 6. status que nao fecha com os dados / prazo estourado
    select 'STATUS_INCOERENTE', 'MEDIA', r.id, r.imei, r.veiculo_id, v.placa, r.cliente_id, r.regional_id,
           case
             when r.status::text = 'ATIVO' and r.data_instalacao is null
               then 'Equipamento ativo sem data de instalacao'
             when r.status::text = 'DISPONIVEL' and r.veiculo_id is not null
               then 'Equipamento em estoque ainda vinculado a um veiculo'
             when r.status::text = 'A_DEVOLVER'
               then format('Devolucao pedida ha %s dias (prazo de 5) — sugerido 6 - Cobrar rastreador',
                           (extract(day from now() - r.status_desde))::int)
             when r.status::text = 'BOLETO_GERADO'
               then format('Boleto do equipamento emitido ha %s dias sem desfecho',
                           (extract(day from now() - r.status_desde))::int)
             else format('Equipamento ha %s dias em manutencao',
                         (extract(day from now() - r.status_desde))::int)
           end
      from rast r
      left join veiculos v on v.id = r.veiculo_id
     where (r.status::text = 'ATIVO'      and r.data_instalacao is null)
        or (r.status::text = 'DISPONIVEL' and r.veiculo_id is not null)
        or (r.status::text = 'A_DEVOLVER'    and r.status_desde < now() - interval '5 days')
        or (r.status::text = 'BOLETO_GERADO' and r.status_desde < now() - interval '30 days')
        or (r.status::text = 'MANUTENCAO'    and r.status_desde < now() - interval '30 days')

    union all
    -- 7. cadastro pela metade
    select 'CADASTRO_INCOMPLETO', 'BAIXA', r.id, r.imei, r.veiculo_id, v.placa, r.cliente_id, r.regional_id,
           'Falta ' || array_to_string(array_remove(array[
             case when coalesce(r.linha, r.iccid) is null then 'chip/linha' end,
             case when r.empresa_rastreamento_id is null  then 'plataforma' end,
             case when r.regional_id is null              then 'unidade' end
           ], null), ', ') || ' — sugerido 8 - Pendencia de dados'
      from rast r
      left join veiculos v on v.id = r.veiculo_id
     where r.status::text <> 'PENDENCIA_DADOS'
       and (coalesce(r.linha, r.iccid) is null
            or r.empresa_rastreamento_id is null
            or r.regional_id is null)

    union all
    -- 8. mesmo numero de serie em dois registros (o IMEI e unico no banco)
    select 'EQUIPAMENTO_DUPLICADO', 'ALTA', r.id, r.imei, r.veiculo_id, v.placa, r.cliente_id, r.regional_id,
           'Numero de serie repetido em outro registro — sugerido 10 - Duplicado'
      from rast r
      left join veiculos v on v.id = r.veiculo_id
     where r.numero_serie is not null
       and r.status::text <> 'DUPLICADO'
       and (select count(*) from rastreadores r2
             where r2.numero_serie = r.numero_serie and r2.status::text <> 'DUPLICADO') > 1

    union all
    -- 9. a FICHA do veiculo (0049) tem IMEI que nao existe no parque.
    --    E a divergencia que liga as duas fases: quem digitou o rastreador na
    --    ficha antes do modulo existir aparece aqui para ser cadastrado.
    select 'FICHA_SEM_EQUIPAMENTO', 'MEDIA', null::uuid, v.rastreador_imei, v.id, v.placa,
           v.cliente_id, v.regional_id,
           'A ficha do veiculo tem IMEI que nao esta cadastrado no parque de equipamentos'
      from veic v
     where v.rastreador_imei is not null
       and not exists (select 1 from rastreadores r where r.imei = v.rastreador_imei)
  )
  select a.tipo, a.severidade, a.rastreador_id, a.imei, a.veiculo_id, a.placa,
         a.cliente_id, c.nome_razao_social, a.regional_id, reg.nome, a.descricao
    from achados a
    left join clientes  c   on c.id = a.cliente_id
    left join regionais reg on reg.id = a.regional_id
   where is_staff()
     and (p_tipo is null or a.tipo = p_tipo)
     and (p_severidade is null or a.severidade = p_severidade)
   order by case a.severidade when 'ALTA' then 1 when 'MEDIA' then 2 else 3 end, a.tipo, a.placa
   limit greatest(coalesce(p_limite, 500), 1);
$$;

comment on function rastreadores_divergencias(uuid, text, text, integer, integer) is
  'Onde o parque de equipamentos e o cadastro de veiculos discordam. E o painel diario da operacao.';

-- ============================================================================
-- RELATORIOS
-- ============================================================================

-- Equipamentos a recuperar: status 3, 4, 5 e 6 com o contato do associado.
create or replace function rastreadores_a_recuperar(p_regional_id uuid default null)
returns table (
  rastreador_id uuid, imei text, status status_rastreador, status_numero smallint,
  dias_no_status integer, regional text, plataforma text,
  placa text, associado text, documento text, telefone text, celular text,
  ultima_instalacao timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with escopo as (
    select case when tem_acesso_global() then p_regional_id else auth_regional_id() end as reg,
           tem_acesso_global() as global
  )
  select r.id, r.imei, r.status, numero_status_rastreador(r.status::text),
         (extract(day from now() - r.status_desde))::int,
         reg.nome, pl.nome, v.placa, c.nome_razao_social, c.cpf_cnpj, c.telefone, c.celular,
         r.data_instalacao
    from rastreadores r
    cross join escopo e
    left join regionais reg            on reg.id = r.regional_id
    left join empresas_rastreamento pl on pl.id = r.empresa_rastreamento_id
    left join veiculos v               on v.id  = r.veiculo_id
    left join clientes c               on c.id  = r.cliente_id
   where is_staff()
     and r.status::text in ('INADIMPLENTE', 'INATIVO', 'A_DEVOLVER', 'COBRAR_RASTREADOR', 'BOLETO_GERADO')
     and (e.global or r.regional_id is not distinct from e.reg)
     and (not e.global or e.reg is null or r.regional_id = e.reg)
   order by numero_status_rastreador(r.status::text), r.status_desde;
$$;

-- Instalacoes e desinstalacoes por periodo (le o historico, nao o cadastro).
create or replace function rastreadores_movimentacao(
  p_inicio date,
  p_fim    date,
  p_regional_id uuid default null
)
returns table (
  data date, tipo text, imei text, placa text, regional text, instalador text, autor text
)
language sql
stable
security definer
set search_path = public
as $$
  with escopo as (
    select case when tem_acesso_global() then p_regional_id else auth_regional_id() end as reg,
           tem_acesso_global() as global
  )
  select ev.created_at::date, ev.tipo, r.imei,
         coalesce(vn.placa, va.placa), reg.nome, r.instalador, u.nome
    from rastreador_eventos ev
    join rastreadores r on r.id = ev.rastreador_id
    cross join escopo e
    left join veiculos  vn on vn.id = ev.veiculo_novo_id
    left join veiculos  va on va.id = ev.veiculo_anterior_id
    left join regionais reg on reg.id = r.regional_id
    left join usuarios  u  on u.id = ev.usuario_id
   where is_staff()
     and ev.tipo in ('INSTALACAO', 'DESINSTALACAO')
     and ev.created_at::date between p_inicio and p_fim
     and (e.global or r.regional_id is not distinct from e.reg)
     and (not e.global or e.reg is null or r.regional_id = e.reg)
   order by ev.created_at desc;
$$;

-- Giro do estoque: quanto tempo o equipamento fica parado ate ser instalado.
create or replace function rastreadores_giro_estoque(p_regional_id uuid default null)
returns table (regional text, instalacoes bigint, dias_medio_em_estoque numeric)
language sql
stable
security definer
set search_path = public
as $$
  with escopo as (
    select case when tem_acesso_global() then p_regional_id else auth_regional_id() end as reg,
           tem_acesso_global() as global
  ),
  instal as (
    select r.regional_id, ev.rastreador_id, ev.created_at as instalado_em,
           (select max(ev2.created_at) from rastreador_eventos ev2
             where ev2.rastreador_id = ev.rastreador_id
               and ev2.status_novo::text = 'DISPONIVEL'
               and ev2.created_at < ev.created_at) as disponivel_em
      from rastreador_eventos ev
      join rastreadores r on r.id = ev.rastreador_id
      cross join escopo e
     where is_staff()
       and ev.tipo = 'INSTALACAO'
       and (e.global or r.regional_id is not distinct from e.reg)
       and (not e.global or e.reg is null or r.regional_id = e.reg)
  )
  select coalesce(reg.nome, 'Sem unidade'), count(*),
         round(avg(extract(epoch from (i.instalado_em - i.disponivel_em)) / 86400)
               filter (where i.disponivel_em is not null), 1)
    from instal i
    left join regionais reg on reg.id = i.regional_id
   group by reg.nome
   order by 2 desc;
$$;

grant execute on function rastreadores_divergencias(uuid, text, text, integer, integer) to authenticated;
grant execute on function rastreadores_a_recuperar(uuid) to authenticated;
grant execute on function rastreadores_movimentacao(date, date, uuid) to authenticated;
grant execute on function rastreadores_giro_estoque(uuid) to authenticated;
