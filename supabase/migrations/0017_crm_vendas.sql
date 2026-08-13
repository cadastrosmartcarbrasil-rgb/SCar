-- ============================================================================
-- SCar :: 0017_crm_vendas.sql
-- Rotina de Vendas + CRM de Leads com trava de Auditoria.
-- Esteira: NOVO -> ORCAMENTO_GERADO -> PROPOSTA_ENVIADA -> APROVADO
--          -(auto)-> EM_AUDITORIA -> ATIVO   (ou PERDIDO a qualquer momento)
-- Regra-chave: aprovar NAO cria o veiculo/associado na base; so a Auditoria,
-- via autorizar_entrada_lead(), efetiva o cadastro (SECURITY DEFINER).
-- ============================================================================

-- Papel de Auditoria (admin tambem pode auditar).
alter type papel_usuario add value if not exists 'auditoria';

-- Status da esteira do lead.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'status_lead') then
    create type status_lead as enum (
      'NOVO','ORCAMENTO_GERADO','PROPOSTA_ENVIADA','APROVADO','EM_AUDITORIA','ATIVO','PERDIDO'
    );
  end if;
end $$;

-- Origem do valor FIPE usado no lead.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'origem_fipe') then
    create type origem_fipe as enum ('API','MANUAL','CONTINGENCIA');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Leads
-- ----------------------------------------------------------------------------
create table if not exists leads (
  id                   uuid primary key default gen_random_uuid(),
  -- Lead / contato
  nome                 text not null,
  celular              text not null,
  email                text,
  cpf_cnpj             text,                 -- capturado/confirmado na auditoria
  -- Veiculo (cotado; ainda nao e um registro oficial)
  placa                text,
  tipo_veiculo_id      uuid references tipos_veiculo(id) on delete set null,
  marca                text,
  modelo               text,
  modelo_id            uuid references modelos(id) on delete set null,
  ano_modelo           smallint,
  combustivel          combustivel,
  valor_fipe           numeric(12,2),
  codigo_fipe          text,
  cota_participacao_id uuid references cotas_participacao(id) on delete set null,
  uso                  uso_veiculo not null default 'passeio',
  origem_fipe          origem_fipe not null default 'API',
  -- CRM
  status               status_lead not null default 'NOVO',
  consultor_id         uuid references usuarios(id) on delete set null,
  regional_id          uuid references regionais(id) on delete set null,
  observacoes          text,
  perdido_motivo       text,
  -- Conversao (preenchidos quando a Auditoria autoriza)
  cliente_id           uuid references clientes(id) on delete set null,
  veiculo_id           uuid references veiculos(id) on delete set null,
  aprovado_em          timestamptz,
  auditado_em          timestamptz,
  auditado_por         uuid references usuarios(id) on delete set null,
  created_by           uuid references usuarios(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_leads_status    on leads (status);
create index if not exists idx_leads_consultor  on leads (consultor_id);
create index if not exists idx_leads_regional    on leads (regional_id);
create index if not exists idx_leads_placa       on leads (placa);

-- ----------------------------------------------------------------------------
-- Cotacoes (snapshot do orcamento; gera o link publico)
-- ----------------------------------------------------------------------------
create table if not exists cotacoes (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid not null references leads(id) on delete cascade,
  fipe                 numeric(12,2) not null,
  tipo_veiculo_id      uuid references tipos_veiculo(id) on delete set null,
  cota_participacao_id uuid references cotas_participacao(id) on delete set null,
  itens                jsonb not null default '[]'::jsonb,  -- [{produto_id,nome,valor,obrigatorio}]
  total_mensalidade    numeric(12,2) not null default 0,
  participacao         numeric(12,2) not null default 0,
  modo_envio           text not null default 'DETALHADA',   -- DETALHADA | CONSOLIDADA
  token                uuid not null unique default gen_random_uuid(),
  enviada_em           timestamptz,
  created_by           uuid references usuarios(id) on delete set null,
  created_at           timestamptz not null default now()
);
create index if not exists idx_cotacoes_lead on cotacoes (lead_id);

-- ----------------------------------------------------------------------------
-- Historico de status (trilha de auditoria do CRM)
-- ----------------------------------------------------------------------------
create table if not exists lead_historico (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  de          status_lead,
  para        status_lead not null,
  usuario_id  uuid references usuarios(id) on delete set null,
  obs         text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_lead_hist_lead on lead_historico (lead_id);

-- ----------------------------------------------------------------------------
-- Tabela de contingencia FIPE (fallback quando a API falha)
-- Populada por importacao mensal (ETL a parte).
-- ----------------------------------------------------------------------------
create table if not exists fipe_precos_local (
  id             uuid primary key default gen_random_uuid(),
  tipo_veiculo   text,
  marca          text not null,
  modelo         text not null,
  ano_modelo     smallint not null,
  codigo_fipe    text,
  valor          numeric(12,2) not null,
  mes_referencia text,
  updated_at     timestamptz not null default now(),
  unique (marca, modelo, ano_modelo)
);
create index if not exists idx_fipe_local_codigo on fipe_precos_local (codigo_fipe, ano_modelo);

-- ============================================================================
-- FUNCOES / TRIGGERS
-- ============================================================================

-- Quem pode auditar (autorizar entrada na base).
-- Compara como TEXTO de proposito: assim o literal 'auditoria' nao e resolvido
-- como valor de enum na mesma transacao que o adicionou (erro 55P04 no Supabase).
create or replace function pode_auditar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth_papel()::text in ('auditoria','admin'), false);
$$;

-- updated_at
create trigger trg_leads_updated before update on leads
  for each row execute function set_updated_at();

-- Aprovar o orcamento NAO cria nada: auto-avanca para EM_AUDITORIA (trava).
create or replace function fn_lead_aprovacao()
returns trigger language plpgsql as $$
begin
  if new.status = 'APROVADO' and old.status is distinct from 'APROVADO' then
    new.status := 'EM_AUDITORIA';
    new.aprovado_em := coalesce(new.aprovado_em, now());
  end if;
  return new;
end;
$$;
create trigger trg_lead_aprovacao before update on leads
  for each row execute function fn_lead_aprovacao();

-- Trilha de historico a cada mudanca de status.
create or replace function fn_lead_historico()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into lead_historico(lead_id, de, para, usuario_id) values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into lead_historico(lead_id, de, para, usuario_id) values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;
create trigger trg_lead_hist_ins after insert on leads
  for each row execute function fn_lead_historico();
create trigger trg_lead_hist_upd after update on leads
  for each row execute function fn_lead_historico();

-- AUTORIZAR ENTRADA: unica porta para a base oficial. So Auditoria/admin.
-- Cria (ou reaproveita) o cliente pelo CPF/CNPJ, cria o veiculo e marca ATIVO.
create or replace function autorizar_entrada_lead(p_lead_id uuid, p_cpf_cnpj text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  l          leads;
  v_doc      text;
  v_tipo     tipo_pessoa;
  v_cliente  uuid;
  v_veiculo  uuid;
begin
  if not pode_auditar() then
    raise exception 'Sem permissao: apenas a Auditoria pode autorizar a entrada na base';
  end if;

  select * into l from leads where id = p_lead_id for update;
  if not found then raise exception 'Lead nao encontrado'; end if;
  if l.status <> 'EM_AUDITORIA' then
    raise exception 'Lead nao esta Em Auditoria (status atual: %)', l.status;
  end if;
  if l.veiculo_id is not null then
    raise exception 'Lead ja foi convertido';
  end if;

  v_doc := regexp_replace(coalesce(p_cpf_cnpj, l.cpf_cnpj, ''), '[^0-9]', '', 'g');
  v_tipo := (case when length(v_doc) > 11 then 'PJ' else 'PF' end)::tipo_pessoa;
  if not validar_documento(v_doc, v_tipo) then
    raise exception 'CPF/CNPJ invalido ou ausente - confira a documentacao';
  end if;

  -- cliente: reaproveita se ja existir pelo documento, senao cria
  select id into v_cliente from clientes where cpf_cnpj = v_doc;
  if v_cliente is null then
    insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, email, telefone, regional_id)
    values (v_tipo, l.nome, v_doc, l.email, l.celular, l.regional_id)
    returning id into v_cliente;
  end if;

  -- veiculo oficial
  insert into veiculos (cliente_id, placa, marca, modelo, ano_modelo, valor_fipe, codigo_fipe,
                        combustivel, uso, tipo_veiculo_id, cota_participacao_id, modelo_id, regional_id, status)
  values (v_cliente, upper(coalesce(l.placa, '')), l.marca, l.modelo, l.ano_modelo, l.valor_fipe, l.codigo_fipe,
          l.combustivel, l.uso, l.tipo_veiculo_id, l.cota_participacao_id, l.modelo_id, l.regional_id, 'ativo')
  returning id into v_veiculo;

  update leads set
    status = 'ATIVO', cliente_id = v_cliente, veiculo_id = v_veiculo,
    cpf_cnpj = v_doc, auditado_em = now(), auditado_por = auth.uid()
  where id = p_lead_id;

  return v_veiculo;
end;
$$;

-- ============================================================================
-- RLS
-- ============================================================================
alter table leads             enable row level security;
alter table cotacoes          enable row level security;
alter table lead_historico    enable row level security;
alter table fipe_precos_local enable row level security;

-- Visibilidade do lead: acesso global / auditoria / dono (consultor) / regional.
create policy leads_select on leads for select to authenticated using (
  tem_acesso_global() or pode_auditar()
  or consultor_id = auth.uid() or created_by = auth.uid()
  or pode_regional(regional_id)
);
create policy leads_insert on leads for insert to authenticated with check (is_staff());
create policy leads_update on leads for update to authenticated using (
  tem_acesso_global() or pode_auditar()
  or consultor_id = auth.uid() or created_by = auth.uid()
  or pode_regional(regional_id)
);
create policy leads_delete on leads for delete to authenticated using (tem_acesso_global());

create policy cotacoes_all on cotacoes for all to authenticated
  using (is_staff()) with check (is_staff());
create policy leadhist_select on lead_historico for select to authenticated using (is_staff());
create policy leadhist_insert on lead_historico for insert to authenticated with check (is_staff());
create policy fipelocal_select on fipe_precos_local for select to authenticated using (is_staff());
create policy fipelocal_write  on fipe_precos_local for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

grant select, insert, update, delete on leads, cotacoes, lead_historico, fipe_precos_local to authenticated;
grant execute on function pode_auditar() to authenticated;
grant execute on function autorizar_entrada_lead(uuid, text) to authenticated;
