-- ============================================================================
-- SCar :: 0012_financeiro_fornecedores.sql
-- Fornecedores (auto-preenchimento CNPJ/CEP), contas a pagar/receber,
-- baixas (liquidacao) com reconciliacao Open Finance-ready e anexos.
-- ============================================================================

create type status_lancamento    as enum ('pendente', 'pago_parcial', 'quitado', 'cancelado', 'atrasado');
create type forma_pagamento      as enum ('PIX', 'BOLETO', 'TRANSFERENCIA', 'CARTAO', 'DINHEIRO');
create type status_conciliacao   as enum ('NAO_CONCILIADO', 'CONCILIADO_MANUAL', 'CONCILIADO_API');

-- ----------------------------------------------------------------------------
-- Fornecedores
-- ----------------------------------------------------------------------------
create table fornecedores (
  id                 uuid primary key default gen_random_uuid(),
  tipo_pessoa        tipo_pessoa not null default 'PJ',
  documento          text not null,                -- cpf/cnpj (digitos)
  razao_social       text not null,
  nome_fantasia      text,
  situacao_cadastral text,
  cnae_principal     text,
  email              text,
  telefone           text,
  endereco           jsonb not null default '{}'::jsonb,
  dados_receita      jsonb not null default '{}'::jsonb,  -- resposta bruta da API
  ativo              boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (documento),
  constraint chk_fornecedor_doc check (validar_documento(documento, tipo_pessoa))
);
create index idx_fornecedores_nome on fornecedores using gin (razao_social gin_trgm_ops);
create trigger trg_fornecedores_updated before update on fornecedores for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Centros de custo e contas bancarias
-- ----------------------------------------------------------------------------
create table centros_custo (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null,
  codigo text,
  ativo  boolean not null default true,
  created_at timestamptz not null default now()
);

create table contas_bancarias (
  id       uuid primary key default gen_random_uuid(),
  nome     text not null,
  banco    text,
  agencia  text,
  conta    text,
  tipo     text,                      -- corrente | poupanca | caixa
  chave_pix text,
  ativo    boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Lancamentos financeiros (contas a pagar / a receber)
-- ----------------------------------------------------------------------------
create table lancamentos_financeiros (
  id                       uuid primary key default gen_random_uuid(),
  tipo                     tipo_movimentacao not null,   -- RECEITA (receber) | DESPESA (pagar)
  fornecedor_id            uuid references fornecedores(id) on delete set null,
  cliente_id               uuid references clientes(id) on delete set null,
  descricao                text not null,
  categoria_dre_id         uuid references categorias_dre(id) on delete set null,
  centro_custo_id          uuid references centros_custo(id) on delete set null,
  evento_id                uuid references eventos_sinistro(id) on delete set null,
  regional_id              uuid references regionais(id) on delete set null,
  valor_original           numeric(12,2) not null check (valor_original >= 0),
  data_emissao             date not null default current_date,
  data_vencimento          date not null,
  status                   status_lancamento not null default 'pendente',
  forma_pagamento_prevista forma_pagamento,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index idx_lanc_tipo_status on lancamentos_financeiros (tipo, status);
create index idx_lanc_vencimento on lancamentos_financeiros (data_vencimento);
create index idx_lanc_fornecedor on lancamentos_financeiros (fornecedor_id);
create index idx_lanc_evento on lancamentos_financeiros (evento_id);
create trigger trg_lanc_updated before update on lancamentos_financeiros for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Baixas (liquidacao) com campos de reconciliacao Open Finance
-- ----------------------------------------------------------------------------
create table baixas_financeiras (
  id                          uuid primary key default gen_random_uuid(),
  lancamento_id               uuid not null references lancamentos_financeiros(id) on delete cascade,
  data_pagamento              date not null default current_date,
  valor_pago                  numeric(12,2) not null check (valor_pago >= 0),
  desconto                    numeric(12,2) not null default 0,
  juros_multa                 numeric(12,2) not null default 0,
  valor_liquido               numeric(12,2) not null default 0,
  conta_bancaria_id           uuid references contas_bancarias(id) on delete set null,
  comprovante_transacao_id    text,
  -- reconciliacao bancaria futura (Open Finance / Bankline)
  id_transacao_bancaria_externa text,
  end_to_end_id_pix           text,
  status_conciliacao          status_conciliacao not null default 'NAO_CONCILIADO',
  created_at                  timestamptz not null default now()
);
create index idx_baixas_lancamento on baixas_financeiras (lancamento_id);

-- ----------------------------------------------------------------------------
-- Anexos financeiros (multiplos por lancamento)
-- ----------------------------------------------------------------------------
create table anexos_financeiros (
  id            uuid primary key default gen_random_uuid(),
  lancamento_id uuid references lancamentos_financeiros(id) on delete cascade,
  baixa_id      uuid references baixas_financeiras(id) on delete cascade,
  nome_arquivo  text not null,
  mime_type     text,
  tamanho_bytes bigint,
  url_storage   text not null,
  hash_md5      text,
  created_at    timestamptz not null default now()
);
create index idx_anexos_fin_lanc on anexos_financeiros (lancamento_id);

-- ============================================================================
-- Regra de baixa: recalcula status e valida integridade do saldo.
-- ============================================================================
create or replace function fn_recalcular_lancamento()
returns trigger
language plpgsql
as $$
declare
  v_lanc lancamentos_financeiros;
  v_pago numeric; v_desc numeric; v_juros numeric;
  v_abatido numeric; v_devido numeric;
  v_id uuid := coalesce(new.lancamento_id, old.lancamento_id);
begin
  select * into v_lanc from lancamentos_financeiros where id = v_id;
  if not found then return null; end if;

  select coalesce(sum(valor_pago),0), coalesce(sum(desconto),0), coalesce(sum(juros_multa),0)
    into v_pago, v_desc, v_juros
    from baixas_financeiras where lancamento_id = v_id;

  v_abatido := v_pago + v_desc;             -- quanto ja foi quitado (pagamento + desconto concedido)
  v_devido  := v_lanc.valor_original + v_juros;  -- total devido (com juros/multa)

  -- Integridade: nao pode abater mais que o total devido (evita pagamento a maior).
  if v_abatido > v_devido + 0.005 then
    raise exception 'Baixa excede o saldo devedor. Devido: %, abatido: %', v_devido, v_abatido
      using errcode = 'check_violation';
  end if;

  update lancamentos_financeiros
     set status = (case
       when v_lanc.status = 'cancelado' then 'cancelado'
       when v_abatido >= v_devido - 0.005 and v_devido > 0 then 'quitado'
       when v_abatido > 0 then 'pago_parcial'
       when v_lanc.data_vencimento < current_date then 'atrasado'
       else 'pendente' end)::status_lancamento
   where id = v_id;
  return null;
end;
$$;

create trigger trg_recalcular_lancamento
  after insert or update or delete on baixas_financeiras
  for each row execute function fn_recalcular_lancamento();

-- Marca lancamentos vencidos como atrasado (cron/agendador).
create or replace function marcar_lancamentos_atrasados()
returns integer language sql as $$
  with upd as (
    update lancamentos_financeiros set status = 'atrasado'
     where status = 'pendente' and data_vencimento < current_date
     returning 1
  ) select count(*)::int from upd;
$$;

-- ============================================================================
-- Storage + RLS
-- ============================================================================
insert into storage.buckets (id, name, public) values ('financeiro', 'financeiro', false)
on conflict (id) do nothing;

alter table fornecedores            enable row level security;
alter table centros_custo           enable row level security;
alter table contas_bancarias        enable row level security;
alter table lancamentos_financeiros enable row level security;
alter table baixas_financeiras      enable row level security;
alter table anexos_financeiros      enable row level security;

-- Fornecedores e catalogos: leitura staff, escrita global.
create policy forn_select on fornecedores for select to authenticated using (is_staff());
create policy forn_write  on fornecedores for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());
create policy cc_select on centros_custo for select to authenticated using (is_staff());
create policy cc_write  on centros_custo for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());
create policy cb_select on contas_bancarias for select to authenticated using (is_staff());
create policy cb_write  on contas_bancarias for all to authenticated using (tem_acesso_global()) with check (tem_acesso_global());

-- Lancamentos/baixas/anexos: acesso global ou por regional.
create policy lanc_all on lancamentos_financeiros for all to authenticated
  using (pode_regional(regional_id)) with check (pode_regional(regional_id));
create policy baixas_all on baixas_financeiras for all to authenticated
  using (exists (select 1 from lancamentos_financeiros l where l.id = lancamento_id and pode_regional(l.regional_id)))
  with check (exists (select 1 from lancamentos_financeiros l where l.id = lancamento_id and pode_regional(l.regional_id)));
create policy anexosfin_all on anexos_financeiros for all to authenticated
  using (tem_acesso_global() or exists (select 1 from lancamentos_financeiros l where l.id = lancamento_id and pode_regional(l.regional_id)))
  with check (tem_acesso_global() or exists (select 1 from lancamentos_financeiros l where l.id = lancamento_id and pode_regional(l.regional_id)));

grant select, insert, update, delete on fornecedores, centros_custo, contas_bancarias,
  lancamentos_financeiros, baixas_financeiras, anexos_financeiros to authenticated;

create policy storage_financeiro_all on storage.objects for all to authenticated
  using (bucket_id = 'financeiro' and is_staff())
  with check (bucket_id = 'financeiro' and is_staff());
