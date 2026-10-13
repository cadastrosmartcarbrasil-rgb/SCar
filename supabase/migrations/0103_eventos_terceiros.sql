-- ============================================================================
-- 0103 — EVENTOS/SINISTROS COM TERCEIROS e compras do evento com FAVORECIDO
-- ============================================================================
-- Pedido do usuario (13/10/2026): todo evento pode envolver Causador, Vitima e
-- um ou mais Terceiros; o associado e sempre o vinculante principal; o
-- terceiro tem tela propria e fica vinculado de forma unica a "Terceiro do
-- Evento X do Associado Y"; toda compra/pagamento lancado pelo evento tem
-- FORNECEDOR (favorecido).
--
--   (A) Terceiros do evento: N terceiros por evento, cada um com papel proprio
--       (Causador/Vitima), status de tratativa, dados pessoais, condutor,
--       veiculo, seguro e danos. O vinculo "Terceiro do Evento X do Associado Y"
--       e garantido NO BANCO por FK composta (evento_id, cliente_id) ->
--       eventos_sinistro(id, cliente_id): nao existe terceiro solto nem
--       terceiro apontando para um associado diferente do dono do evento.
--       Codigo legivel: <protocolo>-T01, -T02...
--   (B) eventos_sinistro.possui_terceiros: flag informada na abertura; a tela
--       usa para abrir o cadastro do terceiro e alertar enquanto faltar cadastro.
--   (C) Contas a pagar do evento: lancamentos_financeiros ganha
--       evento_terceiro_id (terceiro relacionado). Toda DESPESA de evento exige
--       FAVORECIDO: fornecedor cadastrado OU o proprio terceiro (indenizacao).
--       Regra: fornecedor_id preenchido = favorecido e o fornecedor; sem
--       fornecedor e com terceiro = favorecido e o terceiro.
--   (D) Reparos (cotacoes_pecas) e anexos podem apontar o terceiro.
--
-- ACESSO (segue o recorte da 0077 — ABRIR evento e atendimento, TRATAR e do time):
--   * ver e CADASTRAR terceiro: staff da unidade do evento (o atendente que
--     registra a ligacao ja anota a outra parte);
--   * ALTERAR terceiro (dados, status da tratativa): pode_tratar_evento();
--   * apagar: admin. O associado do portal NAO ve terceiro (LGPD: CPF/telefone
--     da outra parte).
-- Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type status_terceiro as enum (
    'EM_ANALISE', 'AGUARDANDO_DOCUMENTOS', 'EM_REPARO', 'ACORDO', 'INDENIZADO', 'NEGADO', 'ENCERRADO'
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- (B) Flag no evento
-- ----------------------------------------------------------------------------
alter table eventos_sinistro
  add column if not exists possui_terceiros boolean not null default false;

-- Eventos antigos marcados como "veiculo de terceiro" passam a sinalizar terceiros.
update eventos_sinistro set possui_terceiros = true
 where envolvido_tipo = 'TERCEIRO' and not possui_terceiros;

-- Alvo da FK composta (id ja e unico; a constraint so habilita a referencia).
do $$ begin
  alter table eventos_sinistro add constraint uq_evento_cliente unique (id, cliente_id);
exception when duplicate_table or duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- (A) Terceiros do evento
-- ----------------------------------------------------------------------------
create table if not exists evento_terceiros (
  id                       uuid primary key default gen_random_uuid(),
  evento_id                uuid not null,
  cliente_id               uuid not null references clientes(id) on delete restrict,  -- associado vinculante (= dono do evento)
  regional_id              uuid references regionais(id) on delete set null,  -- copia do evento (RLS)
  sequencia                integer not null,          -- 1..N dentro do evento
  codigo                   text not null,             -- <protocolo>-T01
  papel                    tipo_envolvimento,         -- CAUSADOR | VITIMA (null = a apurar)
  status                   status_terceiro not null default 'EM_ANALISE',

  -- Pessoa
  tipo_pessoa              tipo_pessoa not null default 'PF',
  nome                     text not null,
  cpf_cnpj                 text,                      -- so digitos
  rg                       text,
  data_nascimento          date,
  telefone                 text,
  celular                  text,
  email                    text,
  endereco                 jsonb not null default '{}'::jsonb,

  -- Condutor no momento do evento
  condutor_e_proprietario  boolean not null default true,
  condutor_nome            text,
  condutor_cpf             text,
  condutor_cnh             text,

  -- Veiculo do terceiro (opcional: pode ser pedestre/imovel)
  possui_veiculo           boolean not null default true,
  veiculo_placa            text,
  veiculo_marca            text,
  veiculo_modelo           text,
  veiculo_ano              integer,
  veiculo_cor              text,
  veiculo_valor_fipe       numeric(12,2),

  -- Seguro do terceiro
  possui_seguro            boolean not null default false,
  seguradora               text,
  numero_apolice           text,

  -- Danos / tratativa
  descricao_danos          text,
  valor_estimado_danos     numeric(12,2) check (valor_estimado_danos is null or valor_estimado_danos >= 0),
  observacoes              text,

  created_by               uuid references usuarios(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint fk_terceiro_evento_associado
    foreign key (evento_id, cliente_id)
    references eventos_sinistro (id, cliente_id)
    on update cascade on delete cascade,
  constraint uq_terceiro_sequencia unique (evento_id, sequencia),
  constraint uq_terceiro_codigo unique (codigo),
  constraint chk_terceiro_doc check (
    cpf_cnpj is null or cpf_cnpj = '' or validar_documento(cpf_cnpj, tipo_pessoa)
  )
);
create index if not exists idx_terceiros_evento  on evento_terceiros (evento_id);
create index if not exists idx_terceiros_cliente on evento_terceiros (cliente_id);
create index if not exists idx_terceiros_doc     on evento_terceiros (cpf_cnpj);
create index if not exists idx_terceiros_placa   on evento_terceiros (veiculo_placa);

-- Amarra o terceiro ao evento: herda associado/regional, numera e trava a troca
-- de evento. O cliente/regional informados pelo front sao IGNORADOS.
create or replace function fn_terceiro_vincular()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evt eventos_sinistro;
begin
  if tg_op = 'UPDATE' and new.evento_id is distinct from old.evento_id then
    raise exception 'Terceiro % pertence ao evento original; nao pode trocar de evento', old.codigo;
  end if;

  select * into v_evt from eventos_sinistro where id = new.evento_id;
  if not found then
    raise exception 'Evento % nao encontrado', new.evento_id;
  end if;

  new.cliente_id  := v_evt.cliente_id;
  new.regional_id := v_evt.regional_id;
  new.cpf_cnpj    := nullif(regexp_replace(coalesce(new.cpf_cnpj, ''), '\D', '', 'g'), '');
  new.condutor_cpf := nullif(regexp_replace(coalesce(new.condutor_cpf, ''), '\D', '', 'g'), '');
  new.veiculo_placa := nullif(upper(regexp_replace(coalesce(new.veiculo_placa, ''), '[^A-Za-z0-9]', '', 'g')), '');

  if tg_op = 'INSERT' then
    -- Serializa a numeracao por evento (dois cadastros simultaneos nao colidem).
    perform 1 from eventos_sinistro where id = new.evento_id for update;
    select coalesce(max(sequencia), 0) + 1 into new.sequencia
      from evento_terceiros where evento_id = new.evento_id;
    new.codigo := coalesce(v_evt.numero_protocolo, left(v_evt.id::text, 8))
                  || '-T' || lpad(new.sequencia::text, 2, '0');
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    new.sequencia := old.sequencia;
    new.codigo    := old.codigo;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_terceiro_vincular on evento_terceiros;
create trigger trg_terceiro_vincular
  before insert or update on evento_terceiros
  for each row execute function fn_terceiro_vincular();

-- Cadastro do terceiro marca o evento e registra no historico do protocolo.
create or replace function fn_terceiro_historico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update eventos_sinistro set possui_terceiros = true
     where id = new.evento_id and not possui_terceiros;
    insert into historico_protocolo (evento_id, usuario_origem_id, acao_realizada, observacoes)
    values (new.evento_id, auth.uid(), 'TERCEIRO',
            new.codigo || ' · ' || new.nome || coalesce(' (' || new.papel::text || ')', ''));
  elsif new.status is distinct from old.status then
    insert into historico_protocolo (evento_id, usuario_origem_id, acao_realizada, observacoes)
    values (new.evento_id, auth.uid(), 'TERCEIRO_STATUS',
            new.codigo || ': ' || old.status || ' -> ' || new.status);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_terceiro_historico on evento_terceiros;
create trigger trg_terceiro_historico
  after insert or update on evento_terceiros
  for each row execute function fn_terceiro_historico();

-- Se o evento mudar de regional, os terceiros acompanham (RLS consistente).
create or replace function fn_evento_propagar_regional()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.regional_id is distinct from old.regional_id then
    update evento_terceiros set regional_id = new.regional_id where evento_id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_evento_propagar_regional on eventos_sinistro;
create trigger trg_evento_propagar_regional
  after update of regional_id on eventos_sinistro
  for each row execute function fn_evento_propagar_regional();

-- ----------------------------------------------------------------------------
-- (D) Reparos e anexos podem apontar o terceiro
-- ----------------------------------------------------------------------------
alter table cotacoes_pecas
  add column if not exists evento_terceiro_id uuid references evento_terceiros(id) on delete set null;
create index if not exists idx_cotacoes_terceiro on cotacoes_pecas (evento_terceiro_id);

alter table anexos_evento
  add column if not exists evento_terceiro_id uuid references evento_terceiros(id) on delete set null;
create index if not exists idx_anexos_terceiro on anexos_evento (evento_terceiro_id);

-- ----------------------------------------------------------------------------
-- (C) Contas a pagar do evento: terceiro relacionado + favorecido obrigatorio
-- ----------------------------------------------------------------------------
alter table lancamentos_financeiros
  add column if not exists evento_terceiro_id uuid references evento_terceiros(id) on delete restrict;
create index if not exists idx_lanc_terceiro on lancamentos_financeiros (evento_terceiro_id);

create or replace function fn_lanc_evento_favorecido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento uuid;
begin
  -- Terceiro manda no evento: o lancamento fica no mesmo evento do terceiro.
  -- (definer: le o terceiro mesmo sem policy; quem grava ja passou pela RLS
  -- de lancamentos_financeiros)
  if new.evento_terceiro_id is not null then
    select evento_id into v_evento from evento_terceiros where id = new.evento_terceiro_id;
    if not found then
      raise exception 'Terceiro do evento nao encontrado';
    end if;
    if new.evento_id is not null and new.evento_id <> v_evento then
      raise exception 'O terceiro informado nao pertence ao evento do lancamento';
    end if;
    new.evento_id := v_evento;
  end if;

  -- Despesa de evento sem favorecido e barrada. Em UPDATE so barra quem tinha
  -- favorecido e perdeu: titulos legados (pre-0025) continuam podendo receber
  -- baixa/cancelamento sem exigir cadastro retroativo.
  if new.tipo = 'DESPESA' and new.evento_id is not null
     and new.fornecedor_id is null and new.evento_terceiro_id is null then
    if tg_op = 'INSERT'
       or old.fornecedor_id is not null or old.evento_terceiro_id is not null
       or old.evento_id is null then
      raise exception 'Conta a pagar do evento exige favorecido: informe o fornecedor ou o terceiro';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lanc_evento_favorecido on lancamentos_financeiros;
create trigger trg_lanc_evento_favorecido
  before insert or update on lancamentos_financeiros
  for each row execute function fn_lanc_evento_favorecido();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table evento_terceiros enable row level security;

drop policy if exists terceiros_select on evento_terceiros;
create policy terceiros_select on evento_terceiros for select to authenticated
  using (pode_regional(regional_id));

-- No INSERT o trigger ainda vai preencher regional_id: a checagem olha o evento.
drop policy if exists terceiros_insert on evento_terceiros;
create policy terceiros_insert on evento_terceiros for insert to authenticated
  with check (exists (select 1 from eventos_sinistro e
                      where e.id = evento_id and pode_regional(e.regional_id)));

-- Alterar e TRATAR o evento (0077): sinistro/gestor da unidade ou acesso global.
drop policy if exists terceiros_update on evento_terceiros;
create policy terceiros_update on evento_terceiros for update to authenticated
  using (pode_tratar_evento(regional_id)) with check (pode_tratar_evento(regional_id));

drop policy if exists terceiros_delete on evento_terceiros;
create policy terceiros_delete on evento_terceiros for delete to authenticated
  using (is_admin());

grant select, insert, update, delete on evento_terceiros to authenticated;

-- ----------------------------------------------------------------------------
-- Plano de contas: custos de evento separados (a tela do evento sugere estas)
-- ----------------------------------------------------------------------------
insert into categorias_dre (codigo_estruturado, nome, tipo) values
  ('3.1.04', 'Reparos de Eventos (pecas e mao de obra)', 'CUSTO_VARIAVEL'),
  ('3.1.05', 'Indenizacoes a Terceiros',                 'CUSTO_VARIAVEL')
on conflict (codigo_estruturado) do nothing;

-- ============================================================================
-- Rito de seguranca (0052)
-- ============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
