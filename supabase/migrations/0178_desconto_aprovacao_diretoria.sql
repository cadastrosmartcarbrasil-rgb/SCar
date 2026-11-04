-- ============================================================================
-- 0178 — DESCONTO NA MENSALIDADE COM APROVACAO DA DIRETORIA
--
-- Pedido do usuario (04/11/2026), com as decisoes dele:
--   * ADESAO e LIVRE: o consultor cobra o valor que quiser (ate zero); a tabela
--     e so a sugestao. Ela sai do desconto (que antes levava o mesmo % junto).
--   * DESCONTO so na MENSALIDADE: em % OU em R$ por mes, nunca acima do limite
--     da unidade (`regionais.percentual_maximo_desconto_venda`), com VALIDADE
--     opcional ("valido ate": os boletos com vencimento ate a data).
--   * QUALQUER desconto precisa da aprovacao da diretoria (quem tem a alcada
--     `desconto`, `pode_aprovar_desconto()` — hoje so o admin). Enquanto pende,
--     o checklist da venda trava a entrada na base, e portanto o carne.
--   * Edicao do boleto do SCar com desconto tambem vira pedido de aprovacao.
--   * Aviso so na tela: fila de pendencias (`descontos_pendentes`).
--
-- O desconto aprovado vai para o VEICULO (`veiculos.desconto_mensalidade` +
-- `_ate`) e entra na fatura pelo trigger de `fatura_itens` (coluna `desconto`),
-- mes a mes, pela data de vencimento — sem mexer nas funcoes de faturamento.
-- ============================================================================

-- (A) cotacao -----------------------------------------------------------------
alter table cotacoes
  add column if not exists desconto_tipo            text not null default 'PERCENTUAL',
  add column if not exists desconto_valor_informado numeric(12,2),
  add column if not exists desconto_valido_ate      date,
  add column if not exists desconto_situacao        text,
  add column if not exists desconto_solicitado_por  uuid references usuarios(id) on delete set null,
  add column if not exists desconto_solicitado_em   timestamptz,
  add column if not exists desconto_decisao_motivo  text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_cotacao_desconto_tipo') then
    alter table cotacoes add constraint chk_cotacao_desconto_tipo check (desconto_tipo in ('PERCENTUAL', 'VALOR'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_cotacao_desconto_situacao') then
    alter table cotacoes add constraint chk_cotacao_desconto_situacao
      check (desconto_situacao is null or desconto_situacao in ('PENDENTE', 'APROVADO', 'RECUSADO'));
  end if;
end $$;

create index if not exists idx_cotacoes_desconto_pendente on cotacoes (desconto_solicitado_em)
  where desconto_situacao = 'PENDENTE';

-- Quem aprovou antes desta migration (alcada da 0028) fica APROVADO.
update cotacoes
   set desconto_situacao = case when desconto_aprovado_por is not null then 'APROVADO' else 'PENDENTE' end,
       desconto_solicitado_em = coalesce(desconto_solicitado_em, atualizada_em, created_at)
 where coalesce(desconto_valor_mensalidade, 0) > 0 and desconto_situacao is null;

create or replace function fn_cotacao_valida_desconto()
returns trigger
language plpgsql
as $$
declare
  v_reg    uuid;
  v_limite numeric;
  v_ap     numeric := round(coalesce(new.valor_assistencia_profissional, 0), 2);
  v_mudou  boolean;
  v_min    numeric := 1;
  v_max    numeric := 40;
  v_nome   text := 'padrao';
  r        regionais;
  v_tab    numeric := round(coalesce(new.total_mensalidade, 0), 2);
  v_desc   numeric := 0;
  v_pct    numeric := 0;
  v_alterou boolean;
begin
  new.valor_assistencia_profissional := v_ap;
  if tg_op = 'INSERT' then
    v_mudou := v_ap > 0;
  else
    v_mudou := v_ap is distinct from old.valor_assistencia_profissional;
  end if;
  if v_mudou and v_ap > 0 then
    select * into r from regionais where id = regional_assistencia_do_lead(new.lead_id);
    if r.id is not null then
      v_min := r.assistencia_profissional_min;
      v_max := r.assistencia_profissional_max;
      v_nome := r.nome;
    end if;
    if v_ap < v_min or v_ap > v_max then
      raise exception 'ASSISTENCIA_PROFISSIONAL: o valor deve ficar entre R$ % e R$ % (unidade %)',
        v_min, v_max, v_nome
        using errcode = 'check_violation';
    end if;
  end if;

  -- 0178: a adesao nao tem desconto (o consultor define o valor no fechamento).
  new.desconto_valor_adesao := 0;
  new.adesao_com_desconto   := new.taxa_adesao;
  new.desconto_tipo := coalesce(new.desconto_tipo, 'PERCENTUAL');

  if new.desconto_tipo = 'VALOR' then
    v_desc := least(greatest(round(coalesce(new.desconto_valor_informado, 0), 2), 0), v_tab);
    v_pct  := case when v_tab > 0 then round(v_desc * 100 / v_tab, 2) else 0 end;
  else
    v_pct  := least(greatest(coalesce(new.desconto_percentual, 0), 0), 100);
    v_desc := round(v_tab * v_pct / 100, 2);
    new.desconto_valor_informado := null;
  end if;

  if v_desc <= 0 then
    new.desconto_percentual := 0;
    new.desconto_valor_mensalidade := 0;
    new.desconto_valor_informado := null;
    new.desconto_valido_ate := null;
    new.desconto_situacao := null;
    new.desconto_aprovado_por := null;
    new.desconto_aprovado_em := null;
    new.desconto_decisao_motivo := null;
    new.total_com_desconto := round(v_tab + v_ap, 2);
    return new;
  end if;

  select coalesce(l.regional_id, u.regional_id) into v_reg
    from leads l
    left join usuarios u on u.id = l.consultor_id
   where l.id = new.lead_id;
  v_limite := limite_desconto_regional(v_reg);
  if v_pct > v_limite then
    raise exception 'DESCONTO_ACIMA_DO_LIMITE: o desconto (% %%) passa do limite de % %% da unidade',
      v_pct, v_limite
      using errcode = 'check_violation';
  end if;

  new.desconto_percentual        := v_pct;
  new.desconto_valor_mensalidade := v_desc;
  new.total_com_desconto         := round(v_tab - v_desc + v_ap, 2);

  v_alterou := tg_op = 'INSERT'
    or coalesce(old.desconto_valor_mensalidade, 0) is distinct from v_desc
    or old.desconto_valido_ate is distinct from new.desconto_valido_ate
    or old.desconto_tipo is distinct from new.desconto_tipo;

  if v_alterou then
    -- Desconto novo ou mudado: volta a pedir aprovacao (quem aprova ja aprova).
    new.desconto_solicitado_por := usuario_atual_id();
    new.desconto_solicitado_em  := now();
    new.desconto_decisao_motivo := null;
    if auth.uid() is not null and pode_aprovar_desconto() then
      new.desconto_situacao    := 'APROVADO';
      new.desconto_aprovado_por := usuario_atual_id();
      new.desconto_aprovado_em  := now();
    else
      new.desconto_situacao    := 'PENDENTE';
      new.desconto_aprovado_por := null;
      new.desconto_aprovado_em  := null;
    end if;
  elsif tg_op = 'UPDATE' and new.desconto_situacao is distinct from old.desconto_situacao
        and new.desconto_situacao in ('APROVADO', 'RECUSADO')
        and auth.uid() is not null and not pode_aprovar_desconto() then
    raise exception 'Somente a diretoria aprova ou recusa desconto' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Grava o desconto da proposta (o calculo e a trava ficam no trigger).
create or replace function definir_desconto_cotacao(
  p_cotacao_id    uuid,
  p_tipo          text,
  p_valor         numeric,
  p_valido_ate    date default null,
  p_justificativa text default null
)
returns cotacoes
language plpgsql
security definer
set search_path = public
as $$
declare
  c cotacoes;
begin
  select * into c from cotacoes where id = p_cotacao_id;
  if c.id is null then raise exception 'Cotacao nao encontrada'; end if;
  if not (is_staff() and pode_tratar_lead(c.lead_id)) then
    raise exception 'Sem permissao para alterar esta proposta' using errcode = '42501';
  end if;
  if not lead_em_negociacao(c.lead_id) then
    raise exception 'A venda ja saiu da negociacao: o desconto nao pode mais mudar';
  end if;
  if upper(coalesce(p_tipo, 'PERCENTUAL')) not in ('PERCENTUAL', 'VALOR') then
    raise exception 'Tipo de desconto invalido';
  end if;
  if p_valido_ate is not null and p_valido_ate < data_sp(now()) then
    raise exception 'A validade do desconto nao pode estar no passado';
  end if;

  update cotacoes
     set desconto_tipo            = upper(coalesce(p_tipo, 'PERCENTUAL')),
         desconto_percentual      = case when upper(coalesce(p_tipo, 'PERCENTUAL')) = 'PERCENTUAL'
                                         then greatest(coalesce(p_valor, 0), 0) else desconto_percentual end,
         desconto_valor_informado = case when upper(p_tipo) = 'VALOR' then greatest(coalesce(p_valor, 0), 0) end,
         desconto_valido_ate      = case when coalesce(p_valor, 0) > 0 then p_valido_ate end,
         desconto_justificativa   = nullif(btrim(coalesce(p_justificativa, '')), ''),
         atualizada_em            = now(),
         atualizada_por           = usuario_atual_id()
   where id = p_cotacao_id
  returning * into c;
  return c;
end;
$$;

create or replace function decidir_desconto_cotacao(p_cotacao_id uuid, p_aprovar boolean, p_motivo text default null)
returns cotacoes
language plpgsql
security definer
set search_path = public
as $$
declare
  c cotacoes;
begin
  if not pode_aprovar_desconto() then
    raise exception 'Somente a diretoria aprova ou recusa desconto' using errcode = '42501';
  end if;
  select * into c from cotacoes where id = p_cotacao_id for update;
  if c.id is null then raise exception 'Cotacao nao encontrada'; end if;
  if coalesce(c.desconto_situacao, '') <> 'PENDENTE' then
    raise exception 'Este desconto nao esta aguardando aprovacao';
  end if;
  if not p_aprovar and length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo da recusa' using errcode = 'check_violation';
  end if;
  update cotacoes
     set desconto_situacao       = case when p_aprovar then 'APROVADO' else 'RECUSADO' end,
         desconto_aprovado_por   = case when p_aprovar then usuario_atual_id() end,
         desconto_aprovado_em    = case when p_aprovar then now() end,
         desconto_decisao_motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = p_cotacao_id
  returning * into c;
  return c;
end;
$$;

-- (B) adesao livre ---------------------------------------------------------------
-- A tabela so SUGERE: preenche quando o lead ainda nao tem valor.
create or replace function fn_lead_adesao_da_tabela()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v numeric;
begin
  if new.adesao_forma is null or new.adesao_valor is not null then
    return new;
  end if;
  v := lead_adesao_tabela(new.id);
  if v is not null then
    new.adesao_valor := v;
  end if;
  return new;
end;
$$;

create or replace function fn_cotacao_sincroniza_adesao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v numeric;
begin
  v := lead_adesao_tabela(new.lead_id);
  if v is not null then
    update leads set adesao_valor = v
     where id = new.lead_id
       and adesao_forma is not null
       and veiculo_id is null
       and adesao_valor is null;
  end if;
  return null;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_lead_adesao_valor') then
    alter table leads add constraint chk_lead_adesao_valor check (adesao_valor is null or adesao_valor >= 0) not valid;
  end if;
end $$;

-- autorizar_entrada_lead: deixa de impor o valor da tabela (troca de literal).
do $$
declare
  v_def text;
  v_old text := 'if l.adesao_valor is distinct from v_adesao then';
  v_new text := 'if l.adesao_valor is null then  -- 0178: a adesao e livre; a tabela so sugere';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'autorizar_entrada_lead';
  if v_def is null then raise exception '0178: autorizar_entrada_lead nao existe'; end if;
  if position('0178: a adesao e livre' in v_def) > 0 then return; end if;
  if position(v_old in v_def) = 0 then
    raise exception '0178: trecho esperado nao encontrado em autorizar_entrada_lead';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

-- (C) o desconto aprovado vai para o veiculo e entra na fatura ----------------------
alter table veiculos
  add column if not exists desconto_mensalidade     numeric(12,2) not null default 0,
  add column if not exists desconto_mensalidade_ate date,
  add column if not exists desconto_cotacao_id      uuid references cotacoes(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_veiculo_desconto_mensalidade') then
    alter table veiculos add constraint chk_veiculo_desconto_mensalidade check (desconto_mensalidade >= 0);
  end if;
end $$;

alter table fatura_itens add column if not exists desconto numeric(12,2) not null default 0;

comment on column veiculos.desconto_mensalidade is
  '0178: desconto por mes APROVADO pela diretoria (R$), nas faturas com vencimento ate desconto_mensalidade_ate (nulo = sem prazo).';
comment on column fatura_itens.desconto is
  '0178: desconto da mensalidade aplicado neste item (valor ja e o liquido).';

create or replace function desconto_vigente_veiculo(p_veiculo_id uuid, p_vencimento date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select v.desconto_mensalidade from veiculos v
     where v.id = p_veiculo_id and v.desconto_mensalidade > 0
       and (v.desconto_mensalidade_ate is null or p_vencimento is null or p_vencimento <= v.desconto_mensalidade_ate)
  ), 0);
$$;

create or replace function fn_fatura_item_desconto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venc  date;
  v_bruto numeric;
  v_d     numeric;
begin
  if coalesce(current_setting('scar.recalcula_desconto', true), '') = 'on' then
    return new;
  end if;
  if new.veiculo_id is null then return new; end if;

  if tg_op = 'INSERT' then
    select vencimento into v_venc from faturas where id = new.fatura_id;
    v_d := least(desconto_vigente_veiculo(new.veiculo_id, v_venc), greatest(new.valor, 0));
    if v_d > 0 then
      new.desconto := v_d;
      new.valor    := round(new.valor - v_d, 2);
      -- a fatura ja nasceu com o valor cheio (ou soma o cheio depois): acerta.
      update faturas set valor_total = round(valor_total - v_d, 2), updated_at = now()
       where id = new.fatura_id;
    end if;
  elsif new.valor is distinct from old.valor and coalesce(old.desconto, 0) > 0 then
    -- quem muda o valor (pro-rata do carne) manda o BRUTO: o desconto acompanha a proporcao.
    v_bruto := old.valor + old.desconto;
    v_d := case when v_bruto > 0 then round(old.desconto * new.valor / v_bruto, 2) else 0 end;
    new.desconto := least(v_d, greatest(new.valor, 0));
    new.valor    := round(new.valor - new.desconto, 2);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fatura_item_desconto on fatura_itens;
create trigger trg_fatura_item_desconto
  before insert or update of valor on fatura_itens
  for each row execute function fn_fatura_item_desconto();

-- Reaplica o desconto nas faturas ainda sem boleto do veiculo.
create or replace function aplicar_desconto_faturas_abertas(p_veiculo_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r   record;
  v_d numeric;
  n   integer := 0;
begin
  perform set_config('scar.recalcula_desconto', 'on', true);
  for r in
    select fi.id, fi.fatura_id, fi.valor, fi.desconto, fa.vencimento
      from fatura_itens fi
      join faturas fa on fa.id = fi.fatura_id
     where fi.veiculo_id = p_veiculo_id and fa.status = 'ABERTA' and fa.titulo_id is null
  loop
    v_d := least(desconto_vigente_veiculo(p_veiculo_id, r.vencimento), r.valor + r.desconto);
    if v_d is distinct from r.desconto then
      update fatura_itens set valor = round(r.valor + r.desconto - v_d, 2), desconto = v_d where id = r.id;
      update faturas set valor_total = (select coalesce(sum(x.valor), 0) from fatura_itens x where x.fatura_id = r.fatura_id),
                         updated_at = now()
       where id = r.fatura_id;
      n := n + 1;
    end if;
  end loop;
  perform set_config('scar.recalcula_desconto', 'off', true);
  return n;
end;
$$;

create or replace function fn_veiculo_desconto_faturas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.desconto_mensalidade is distinct from old.desconto_mensalidade
     or new.desconto_mensalidade_ate is distinct from old.desconto_mensalidade_ate then
    perform aplicar_desconto_faturas_abertas(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_veiculo_desconto_faturas on veiculos;
create trigger trg_veiculo_desconto_faturas
  after update of desconto_mensalidade, desconto_mensalidade_ate on veiculos
  for each row execute function fn_veiculo_desconto_faturas();

-- A venda entrou na base: o desconto APROVADO da proposta passa ao veiculo.
create or replace function fn_lead_desconto_veiculo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c cotacoes;
begin
  if new.veiculo_id is null or new.veiculo_id is not distinct from old.veiculo_id then
    return new;
  end if;
  select * into c from cotacoes
   where lead_id = new.id
   order by (id = new.aceite_cotacao_id) desc, created_at desc, id desc
   limit 1;
  if c.id is not null and c.desconto_situacao = 'APROVADO' and coalesce(c.desconto_valor_mensalidade, 0) > 0 then
    update veiculos
       set desconto_mensalidade     = c.desconto_valor_mensalidade,
           desconto_mensalidade_ate = c.desconto_valido_ate,
           desconto_cotacao_id      = c.id
     where id = new.veiculo_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lead_desconto_veiculo on leads;
create trigger trg_lead_desconto_veiculo
  after update of veiculo_id on leads
  for each row execute function fn_lead_desconto_veiculo();

-- (D) desconto na edicao do boleto do SCar: vira pedido ----------------------------
create table if not exists titulo_desconto_pedidos (
  id              uuid primary key default gen_random_uuid(),
  titulo_id       uuid not null references titulos_financeiros(id) on delete cascade,
  cliente_id      uuid references clientes(id) on delete set null,
  valor_original  numeric(12,2) not null,
  desconto        numeric(12,2) not null,
  situacao        text not null default 'PENDENTE',
  motivo          text,
  solicitado_por  uuid references usuarios(id) on delete set null,
  solicitado_em   timestamptz not null default now(),
  decidido_por    uuid references usuarios(id) on delete set null,
  decidido_em     timestamptz,
  decisao_motivo  text,
  constraint chk_tit_desc_situacao check (situacao in ('PENDENTE', 'APROVADO', 'RECUSADO', 'CANCELADO')),
  constraint chk_tit_desc_valor check (desconto > 0)
);
create unique index if not exists uq_tit_desc_pendente on titulo_desconto_pedidos (titulo_id) where situacao = 'PENDENTE';

alter table titulo_desconto_pedidos enable row level security;
drop policy if exists tit_desc_select on titulo_desconto_pedidos;
create policy tit_desc_select on titulo_desconto_pedidos for select to authenticated using (
  (select is_staff()) and exists (select 1 from titulos_financeiros t where t.id = titulo_id)
);
grant select on titulo_desconto_pedidos to authenticated;

create or replace function ajustar_titulo(
  p_titulo_id  uuid,
  p_vencimento date default null,
  p_desconto   numeric default null,
  p_acrescimo  numeric default null,
  p_observacao text default null
)
returns titulos_financeiros
language plpgsql
security definer
set search_path = public
as $$
declare
  t     titulos_financeiros;
  v_orig numeric;
  v_desc numeric;
  v_acre numeric;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  select * into t from titulos_financeiros where id = p_titulo_id;
  if t.id is null then raise exception 'Titulo nao encontrado'; end if;
  if t.status = 'pago' then raise exception 'Titulo ja pago — nao pode ser alterado'; end if;
  if t.status = 'cancelado' then raise exception 'Titulo cancelado'; end if;

  v_orig := coalesce(t.valor_original, t.valor);
  v_desc := greatest(0, coalesce(p_desconto, t.desconto, 0));
  v_acre := greatest(0, coalesce(p_acrescimo, t.acrescimo, 0));
  if v_desc > v_orig + v_acre then
    raise exception 'Desconto maior que o valor do titulo';
  end if;

  -- 0178: aumentar o desconto sem a alcada vira PEDIDO para a diretoria; o resto
  -- (vencimento, acrescimo, observacao) e gravado ja.
  if v_desc > coalesce(t.desconto, 0)
     and auth.uid() is not null and not pode_aprovar_desconto()
     and coalesce(current_setting('scar.desconto_aprovado', true), '') <> 'on' then
    update titulo_desconto_pedidos set situacao = 'CANCELADO'
     where titulo_id = t.id and situacao = 'PENDENTE';
    insert into titulo_desconto_pedidos (titulo_id, cliente_id, valor_original, desconto, motivo, solicitado_por)
      values (t.id, t.cliente_id, v_orig, v_desc, nullif(btrim(coalesce(p_observacao, '')), ''), usuario_atual_id());
    v_desc := coalesce(t.desconto, 0);
  end if;

  update titulos_financeiros
     set valor_original  = v_orig,
         desconto        = v_desc,
         acrescimo       = v_acre,
         valor           = round(v_orig - v_desc + v_acre, 2),
         data_vencimento = coalesce(p_vencimento, data_vencimento),
         status          = case
                             when coalesce(p_vencimento, data_vencimento) >= current_date and status = 'vencido'
                               then 'pendente'::status_titulo
                             else status
                           end,
         observacao      = coalesce(p_observacao, observacao),
         alterado_por    = auth.uid(),
         alterado_em     = now(),
         updated_at      = now()
   where id = p_titulo_id
   returning * into t;

  update faturas set valor_total = t.valor, updated_at = now()
   where titulo_id = t.id and status = 'ABERTA';

  return t;
end;
$$;

create or replace function decidir_desconto_titulo(p_pedido_id uuid, p_aprovar boolean, p_motivo text default null)
returns titulo_desconto_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  p titulo_desconto_pedidos;
begin
  if not pode_aprovar_desconto() then
    raise exception 'Somente a diretoria aprova ou recusa desconto' using errcode = '42501';
  end if;
  select * into p from titulo_desconto_pedidos where id = p_pedido_id for update;
  if p.id is null or p.situacao <> 'PENDENTE' then
    raise exception 'Este pedido nao esta aguardando aprovacao';
  end if;
  if not p_aprovar and length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo da recusa' using errcode = 'check_violation';
  end if;
  if p_aprovar then
    perform set_config('scar.desconto_aprovado', 'on', true);
    perform ajustar_titulo(p.titulo_id, null, p.desconto, null, null);
    perform set_config('scar.desconto_aprovado', 'off', true);
  end if;
  update titulo_desconto_pedidos
     set situacao = case when p_aprovar then 'APROVADO' else 'RECUSADO' end,
         decidido_por = usuario_atual_id(), decidido_em = now(),
         decisao_motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = p_pedido_id
  returning * into p;
  return p;
end;
$$;

-- (E) a fila da diretoria ----------------------------------------------------------
create or replace function descontos_pendentes()
returns table (
  origem         text,
  id             uuid,
  lead_id        uuid,
  titulo_id      uuid,
  cliente_id     uuid,
  nome           text,
  placa          text,
  regional       text,
  valor_tabela   numeric,
  desconto       numeric,
  percentual     numeric,
  valor_final    numeric,
  valido_ate     date,
  vencimento     date,
  justificativa  text,
  solicitado_por text,
  solicitado_em  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select 'COTACAO', c.id, c.lead_id, null::uuid, l.cliente_existente_id,
         l.nome, l.placa, r.nome,
         c.total_mensalidade, c.desconto_valor_mensalidade, c.desconto_percentual,
         round(c.total_mensalidade - c.desconto_valor_mensalidade, 2),
         c.desconto_valido_ate, null::date, c.desconto_justificativa,
         u.nome, c.desconto_solicitado_em
    from cotacoes c
    join leads l on l.id = c.lead_id
    left join regionais r on r.id = l.regional_id
    left join usuarios u on u.id = c.desconto_solicitado_por
   where pode_aprovar_desconto() and c.desconto_situacao = 'PENDENTE'
  union all
  select 'TITULO', p.id, null::uuid, p.titulo_id, p.cliente_id,
         cl.nome_razao_social, ve.placa, r.nome,
         p.valor_original, p.desconto,
         case when p.valor_original > 0 then round(p.desconto * 100 / p.valor_original, 2) else 0 end,
         round(p.valor_original - p.desconto, 2),
         null::date, t.data_vencimento, p.motivo,
         u.nome, p.solicitado_em
    from titulo_desconto_pedidos p
    join titulos_financeiros t on t.id = p.titulo_id
    left join clientes cl on cl.id = p.cliente_id
    left join veiculos ve on ve.id = t.veiculo_id
    left join regionais r on r.id = cl.regional_id
    left join usuarios u on u.id = p.solicitado_por
   where pode_aprovar_desconto() and p.situacao = 'PENDENTE'
   order by 17;
$$;

create or replace function descontos_pendentes_contagem()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when not pode_aprovar_desconto() then 0 else
    (select count(*)::int from cotacoes where desconto_situacao = 'PENDENTE')
    + (select count(*)::int from titulo_desconto_pedidos where situacao = 'PENDENTE') end;
$$;

-- (F) checklist: o desconto aprovado trava a entrada ---------------------------------
create or replace function checklist_lead(p_lead_id uuid)
returns table (
  item     text,
  grupo    text,
  ok       boolean,
  detalhe  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l        leads;
  v_doc    text;
  v_tipo   tipo_pessoa;
  v_fotos  int;
  v_obrig  int;
  v_vist   int;
  v_ren    text;
  v_cli    uuid;
  v_ident  text;
  v_compr  int;
  v_cnh    date;
  v_cotd   cotacoes;
begin
  select * into l from leads where id = p_lead_id;
  if not found then
    return query select 'Lead'::text, 'Geral'::text, false, 'Lead nao encontrado'::text;
    return;
  end if;

  v_doc  := regexp_replace(coalesce(l.cpf_cnpj, ''), '[^0-9]', '', 'g');
  v_tipo := coalesce(l.tipo_pessoa, (case when length(v_doc) > 11 then 'PJ' else 'PF' end)::tipo_pessoa);
  v_ren  := regexp_replace(coalesce(l.renavam, ''), '[^0-9]', '', 'g');

  select count(*) into v_vist from vistorias where lead_id = p_lead_id;

  -- 0177: os documentos pessoais podem ter vindo pelo lead ou ja estar na
  -- ficha do associado (cliente da base que contrata outro veiculo).
  v_cli := coalesce(l.cliente_existente_id,
                    (select c.id from clientes c where c.cpf_cnpj = v_doc and v_doc <> '' limit 1));
  select string_agg(distinct d.tipo, ', ' order by d.tipo) into v_ident
    from associado_documentos d
   where (d.lead_id = p_lead_id or (v_cli is not null and d.cliente_id = v_cli))
     and d.situacao in ('AGUARDANDO', 'CONFERIDO')
     and (d.tipo = 'RG'
          or (d.tipo = 'CNH' and d.validade >= data_sp(now()))
          or (v_tipo = 'PJ' and d.tipo = 'CONTRATO_SOCIAL'));
  select count(*) into v_compr
    from associado_documentos d
   where (d.lead_id = p_lead_id or (v_cli is not null and d.cliente_id = v_cli))
     and d.situacao in ('AGUARDANDO', 'CONFERIDO')
     and d.tipo = 'COMPROVANTE_ENDERECO';
  select max(d.validade) into v_cnh
    from associado_documentos d
   where (d.lead_id = p_lead_id or (v_cli is not null and d.cliente_id = v_cli))
     and d.situacao in ('AGUARDANDO', 'CONFERIDO')
     and d.tipo = 'CNH';
  select count(*) into v_obrig
    from vistoria_fotos_modelo m
   where m.obrigatorio and m.ativo
     and (m.tipo_veiculo_id is null or m.tipo_veiculo_id = l.tipo_veiculo_id);

  select count(distinct m.codigo) into v_fotos
    from vistoria_fotos_modelo m
    join vistoria_anexos a on upper(coalesce(a.tipo, '')) = m.codigo
    join vistorias vi on vi.id = a.vistoria_id
   where vi.lead_id = p_lead_id
     and m.obrigatorio and m.ativo
     and (m.tipo_veiculo_id is null or m.tipo_veiculo_id = l.tipo_veiculo_id);

  -- Associado -------------------------------------------------------------
  return query select 'CPF/CNPJ valido', 'Associado',
    (v_doc <> '' and validar_documento(v_doc, v_tipo)),
    coalesce(nullif(v_doc, ''), 'nao informado');

  return query select 'Nome completo', 'Associado',
    (coalesce(trim(l.nome), '') <> '' and position(' ' in trim(l.nome)) > 0),
    coalesce(nullif(l.nome, ''), 'nao informado');

  return query select 'Celular', 'Associado',
    (length(regexp_replace(coalesce(l.celular, ''), '[^0-9]', '', 'g')) >= 10),
    coalesce(nullif(l.celular, ''), 'nao informado');

  return query select 'E-mail', 'Associado',
    (coalesce(l.email, '') ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
    coalesce(nullif(l.email, ''), 'nao informado');

  return query select 'Endereco completo', 'Associado',
    (coalesce(l.endereco->>'cep', '') <> '' and coalesce(l.endereco->>'logradouro', '') <> ''
     and coalesce(l.endereco->>'numero', '') <> '' and coalesce(l.endereco->>'cidade', '') <> ''
     and coalesce(l.endereco->>'uf', '') <> ''),
    coalesce(nullif(concat_ws(', ', l.endereco->>'logradouro', l.endereco->>'numero',
                              l.endereco->>'cidade', l.endereco->>'uf'), ''), 'nao informado');

  return query select
    (case when v_tipo = 'PJ' then 'Inscricao estadual / RG' else 'RG' end), 'Associado',
    (coalesce(l.rg_ie, '') <> ''), coalesce(nullif(l.rg_ie, ''), 'nao informado');

  -- Opcional (0161): aparece, nao trava.
  return query select 'Data de nascimento / fundacao (opcional)', 'Associado',
    true,
    coalesce(to_char(l.data_nascimento, 'DD/MM/YYYY'), 'nao informada');

  -- Veiculo ---------------------------------------------------------------
  return query select 'Placa', 'Veiculo',
    (coalesce(l.placa, '') <> ''), coalesce(nullif(l.placa, ''), 'nao informada');

  return query select 'Chassi', 'Veiculo',
    (length(regexp_replace(coalesce(l.chassi, ''), '[^0-9A-Za-z]', '', 'g')) = 17),
    coalesce(nullif(l.chassi, ''), 'nao informado');

  -- Opcional (0161), mas se vier tem de ter o tamanho certo.
  return query select 'Renavam (opcional)', 'Veiculo',
    (v_ren = '' or length(v_ren) between 9 and 11),
    (case when v_ren = '' then 'nao informado'
          when length(v_ren) between 9 and 11 then l.renavam
          else l.renavam || ' (tamanho invalido)' end);

  return query select 'Marca e modelo', 'Veiculo',
    (coalesce(l.marca, '') <> '' and coalesce(l.modelo, '') <> ''),
    coalesce(nullif(concat_ws(' ', l.marca, l.modelo), ''), 'nao informado');

  return query select 'Ano fabricacao / modelo', 'Veiculo',
    (l.ano_fabricacao is not null and l.ano_modelo is not null),
    coalesce(concat_ws('/', l.ano_fabricacao::text, l.ano_modelo::text), 'nao informado');

  return query select 'Cor', 'Veiculo',
    (coalesce(l.cor, '') <> ''), coalesce(nullif(l.cor, ''), 'nao informada');

  return query select 'Valor FIPE', 'Veiculo',
    (coalesce(l.valor_fipe, 0) > 0),
    coalesce(to_char(l.valor_fipe, 'FM999G999D00'), 'nao informado');

  return query select 'Tipo de veiculo (precificacao)', 'Veiculo',
    (l.tipo_veiculo_id is not null),
    coalesce((select nome from tipos_veiculo where id = l.tipo_veiculo_id), 'nao informado');

  -- Documentos ------------------------------------------------------------
  return query select 'CRLV do veiculo', 'Documentos',
    (coalesce(l.crlv_url, '') <> '' or coalesce(l.crlv_qrcode, '') <> ''),
    (case when coalesce(l.crlv_qrcode, '') <> '' then 'QR Code lido'
          when coalesce(l.crlv_url, '') <> '' then 'arquivo anexado'
          else 'nao anexado' end);

  -- 0177: documentos pessoais do associado (aba Anexos).
  return query select
    (case when v_tipo = 'PJ' then 'Documento da empresa ou do responsavel (contrato social, RG ou CNH)'
          else 'Documento de identidade (RG ou CNH)' end), 'Documentos',
    (v_ident is not null),
    coalesce(v_ident, (case when v_cnh is not null and v_cnh < data_sp(now())
                            then 'so ha CNH vencida em ' || to_char(v_cnh, 'DD/MM/YYYY')
                            else 'nao anexado' end));

  return query select 'Comprovante de endereco', 'Documentos',
    (v_compr > 0), (case when v_compr > 0 then 'anexado' else 'nao anexado' end);

  if v_cnh is not null then
    return query select 'CNH dentro da validade', 'Documentos',
      (v_cnh >= data_sp(now())),
      (case when v_cnh >= data_sp(now()) then 'valida ate ' else 'VENCIDA em ' end)
        || to_char(v_cnh, 'DD/MM/YYYY');
  end if;

  return query select 'Vistoria registrada', 'Documentos',
    (v_vist > 0), (v_vist || ' vistoria(s)')::text;

  return query select 'Fotos obrigatorias da vistoria', 'Documentos',
    (v_obrig > 0 and v_fotos >= v_obrig),
    (v_fotos || ' de ' || v_obrig || ' foto(s) obrigatoria(s)')::text;

  -- 0178: desconto na mensalidade so passa aprovado pela diretoria.
  select c.* into v_cotd
    from cotacoes c
   where c.lead_id = p_lead_id
   order by (c.id = l.aceite_cotacao_id) desc, c.created_at desc, c.id desc
   limit 1;
  if coalesce(v_cotd.desconto_valor_mensalidade, 0) > 0 then
    return query select 'Desconto aprovado pela diretoria', 'Venda',
      (v_cotd.desconto_situacao = 'APROVADO'),
      (case v_cotd.desconto_situacao
         when 'APROVADO' then 'aprovado'
         when 'RECUSADO' then 'RECUSADO: ' || coalesce(v_cotd.desconto_decisao_motivo, 'retire o desconto da proposta')
         else 'aguardando aprovacao (' || to_char(v_cotd.desconto_valor_mensalidade, 'FM999G990D00') || '/mes)' end);
  end if;

  -- Venda -----------------------------------------------------------------
  return query select 'Plano contratado', 'Venda',
    (l.plano_id is not null),
    coalesce((select nome from planos_protecao where id = l.plano_id), 'nao informado');

  return query select 'Vendedor responsavel', 'Venda',
    (l.vendedor_id is not null),
    coalesce((select coalesce(v.nome, u.nome) from vendedores v
               left join usuarios u on u.id = v.usuario_id
               where v.id = l.vendedor_id), 'nao informado');

  -- Nao trava (0161): sem forma, vale "recebida pelo consultor".
  return query select 'Forma de recebimento da adesao', 'Venda',
    true,
    (case coalesce(l.adesao_forma::text, 'VENDEDOR_NA_HORA')
       when 'VENDEDOR_NA_HORA' then 'Recebida pelo consultor'
       when 'BOLETO' then 'Boleto da Smart Car'
       when 'PIX' then 'PIX da Smart Car'
       else coalesce(l.adesao_forma::text, '') end);
end;
$$;

-- rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
