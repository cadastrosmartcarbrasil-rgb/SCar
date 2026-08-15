-- ============================================================================
-- SCar :: 0028_crm_vendas_refino.sql
-- REFINO DO CRM DE VENDAS:
--   A) PIPELINE: novo status `EM_NEGOCIACAO` (entre Proposta Enviada e
--      Aprovado) e `mover_lead_status()` — a funcao que o Kanban usa no
--      drag-and-drop, com as transicoes permitidas e a trilha no historico.
--   B) COTACAO EDITAVEL: `cotacoes` guarda o plano e os opcionais escolhidos;
--      `atualizar_cotacao()` recalcula o snapshot enquanto o lead estiver em
--      negociacao (antes da auditoria), preservando os itens OBRIGATORIOS do
--      plano/base (`produtos_obrigatorios_cotacao`).
--   C) DESCONTO POR REGIONAL/FRANQUIA: `regionais.percentual_maximo_desconto_venda`
--      + trava no banco (trigger) e alcada de excecao (Gestor/Diretor) via
--      `aplicar_desconto_cotacao()`.
-- ============================================================================

-- Novo valor de enum: o literal so pode ser usado em OUTRA transacao, por isso
-- todas as comparacoes deste arquivo usam TEXTO (mesmo motivo do 0017).
alter type status_lead add value if not exists 'EM_NEGOCIACAO';

-- ----------------------------------------------------------------------------
-- C) Parametro de desconto da franquia/regional
-- ----------------------------------------------------------------------------
alter table regionais
  add column if not exists percentual_maximo_desconto_venda numeric(5,2) not null default 0,
  add column if not exists desconto_observacao text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_regional_desconto_max'
  ) then
    alter table regionais add constraint chk_regional_desconto_max
      check (percentual_maximo_desconto_venda >= 0 and percentual_maximo_desconto_venda <= 100);
  end if;
end $$;

-- Limite de desconto da regional (0 quando nao parametrizado).
create or replace function limite_desconto_regional(p_regional_id uuid)
returns numeric
language sql stable
as $$
  select coalesce((select percentual_maximo_desconto_venda from regionais where id = p_regional_id), 0);
$$;

-- Alcada de excecao: Gestor/Diretor (admin e gestor_regional).
create or replace function pode_aprovar_desconto()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(auth_papel()::text in ('admin', 'gestor_regional'), false);
$$;

-- ----------------------------------------------------------------------------
-- B) Cotacao: plano/opcionais persistidos + campos de desconto
-- ----------------------------------------------------------------------------
alter table cotacoes
  add column if not exists plano_id                   uuid references planos_protecao(id) on delete set null,
  add column if not exists opcionais_ids              uuid[] not null default '{}'::uuid[],
  add column if not exists desconto_percentual        numeric(5,2) not null default 0,
  add column if not exists desconto_valor_mensalidade numeric(12,2) not null default 0,
  add column if not exists desconto_valor_adesao      numeric(12,2) not null default 0,
  add column if not exists total_com_desconto         numeric(12,2),
  add column if not exists adesao_com_desconto        numeric(12,2),
  add column if not exists desconto_aprovado_por      uuid references usuarios(id) on delete set null,
  add column if not exists desconto_aprovado_em       timestamptz,
  add column if not exists desconto_justificativa     text,
  add column if not exists atualizada_em              timestamptz,
  add column if not exists atualizada_por             uuid references usuarios(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_cotacao_desconto') then
    alter table cotacoes add constraint chk_cotacao_desconto
      check (desconto_percentual >= 0 and desconto_percentual <= 100);
  end if;
end $$;

-- Produtos OBRIGATORIOS da cotacao (base do tipo de veiculo + itens do plano).
-- Usa o proprio motor de precos como fonte da verdade.
create or replace function produtos_obrigatorios_cotacao(
  p_tipo_veiculo_id uuid,
  p_plano_id uuid default null,
  p_fipe numeric default 0
)
returns table (produto_id uuid, nome text, valor numeric)
language sql stable
as $$
  select (item->>'produto_id')::uuid, item->>'nome', (item->>'valor')::numeric
    from jsonb_array_elements(
      coalesce(cotar_plano(coalesce(p_fipe, 0), p_tipo_veiculo_id, p_plano_id)->'detalhamento_produtos', '[]'::jsonb)
    ) item
   where coalesce((item->>'obrigatorio')::boolean, false)
     and item->>'produto_id' is not null;
$$;

-- O lead ainda esta na fase de venda? (antes de ir para a auditoria)
create or replace function lead_em_negociacao(p_lead_id uuid)
returns boolean
language sql stable
as $$
  select coalesce(
    (select l.status::text not in ('APROVADO', 'EM_AUDITORIA', 'ATIVO') from leads l where l.id = p_lead_id),
    false);
$$;

-- ----------------------------------------------------------------------------
-- Trava do desconto (vale para qualquer caminho: RPC, UI ou insert direto)
-- ----------------------------------------------------------------------------
create or replace function fn_cotacao_valida_desconto()
returns trigger
language plpgsql
as $$
declare
  v_reg    uuid;
  v_limite numeric;
begin
  if coalesce(new.desconto_percentual, 0) <= 0 then
    new.desconto_valor_mensalidade := 0;
    new.desconto_valor_adesao := 0;
    new.total_com_desconto := new.total_mensalidade;
    new.adesao_com_desconto := new.taxa_adesao;
    return new;
  end if;

  select coalesce(l.regional_id, u.regional_id) into v_reg
    from leads l
    left join usuarios u on u.id = l.consultor_id
   where l.id = new.lead_id;
  v_limite := limite_desconto_regional(v_reg);

  if new.desconto_percentual > v_limite and new.desconto_aprovado_por is null then
    raise exception 'DESCONTO_ACIMA_DO_LIMITE: % %% excede o limite de % %% da regional — necessaria aprovacao de gestor',
      new.desconto_percentual, v_limite;
  end if;

  new.desconto_valor_mensalidade := round(new.total_mensalidade * new.desconto_percentual / 100, 2);
  new.desconto_valor_adesao      := round(coalesce(new.taxa_adesao, 0) * new.desconto_percentual / 100, 2);
  new.total_com_desconto         := round(new.total_mensalidade - new.desconto_valor_mensalidade, 2);
  new.adesao_com_desconto        := round(coalesce(new.taxa_adesao, 0) - new.desconto_valor_adesao, 2);
  return new;
end;
$$;

drop trigger if exists trg_cotacao_desconto on cotacoes;
create trigger trg_cotacao_desconto
  before insert or update on cotacoes
  for each row execute function fn_cotacao_valida_desconto();

-- Backfill dos totais das cotacoes ja existentes (sem desconto).
update cotacoes
   set total_com_desconto = coalesce(total_com_desconto, total_mensalidade),
       adesao_com_desconto = coalesce(adesao_com_desconto, taxa_adesao)
 where total_com_desconto is null;

-- ----------------------------------------------------------------------------
-- B) Edicao da cotacao (enquanto o lead esta em negociacao)
-- ----------------------------------------------------------------------------
-- Recalcula o snapshot pelo motor (cotar_plano), preservando os obrigatorios do
-- plano/base: os opcionais informados sao ADICIONADOS ao pacote do plano, nunca
-- substituem os itens obrigatorios.
create or replace function atualizar_cotacao(
  p_cotacao_id      uuid,
  p_fipe            numeric default null,
  p_tipo_veiculo_id uuid default null,
  p_cota_id         uuid default null,
  p_plano_id        uuid default null,
  p_opcionais_ids   uuid[] default null,
  p_modo_envio      text default null,
  p_desconto_percentual numeric default null,
  p_desconto_justificativa text default null
)
returns cotacoes
language plpgsql
security definer
set search_path = public
as $$
declare
  c        cotacoes;
  v_lead   leads;
  v_calc   jsonb;
  v_itens  jsonb;
  v_fipe   numeric;
  v_tipo   uuid;
  v_plano  uuid;
  v_opc    uuid[];
  v_desc   numeric;
  v_reg    uuid;
  v_limite numeric;
  v_aprov  uuid;
  v_aprov_em timestamptz;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  select * into c from cotacoes where id = p_cotacao_id;
  if c.id is null then raise exception 'Cotacao nao encontrada'; end if;
  select * into v_lead from leads where id = c.lead_id;

  if not lead_em_negociacao(c.lead_id) then
    raise exception 'Cotacao bloqueada: o lead ja foi enviado para auditoria (status %)', v_lead.status;
  end if;

  v_fipe  := coalesce(p_fipe, c.fipe);
  v_tipo  := coalesce(p_tipo_veiculo_id, c.tipo_veiculo_id);
  v_plano := coalesce(p_plano_id, c.plano_id);
  v_opc   := coalesce(p_opcionais_ids, c.opcionais_ids, '{}'::uuid[]);
  if v_tipo is null then raise exception 'Informe o tipo de veiculo da cotacao'; end if;

  -- Motor de precos: base obrigatoria + itens do plano + opcionais escolhidos.
  v_calc := cotar_plano(v_fipe, v_tipo, v_plano, v_opc);
  v_itens := coalesce(v_calc->'detalhamento_produtos', '[]'::jsonb);

  -- Seguranca: nenhum item obrigatorio pode ficar de fora do snapshot.
  if exists (
    select 1 from produtos_obrigatorios_cotacao(v_tipo, v_plano, v_fipe) o
     where not exists (
       select 1 from jsonb_array_elements(v_itens) i
        where (i->>'produto_id')::uuid = o.produto_id
     )
  ) then
    raise exception 'A edicao removeria itens obrigatorios do plano';
  end if;

  -- Desconto: mantem o atual quando nao informado.
  v_desc     := coalesce(p_desconto_percentual, c.desconto_percentual, 0);
  v_aprov    := c.desconto_aprovado_por;
  v_aprov_em := c.desconto_aprovado_em;

  if p_desconto_percentual is not null and p_desconto_percentual <> c.desconto_percentual then
    select coalesce(l.regional_id, u.regional_id) into v_reg
      from leads l left join usuarios u on u.id = l.consultor_id
     where l.id = c.lead_id;
    v_limite := limite_desconto_regional(v_reg);

    if v_desc > v_limite then
      -- Acima do limite: exige alcada + justificativa (a trava do trigger
      -- continua valendo para qualquer outro caminho).
      if not pode_aprovar_desconto() then
        raise exception 'DESCONTO_ACIMA_DO_LIMITE: % %% excede o limite de % %% da regional — necessaria aprovacao de gestor',
          v_desc, v_limite;
      end if;
      if p_desconto_justificativa is null or btrim(p_desconto_justificativa) = '' then
        raise exception 'Informe a justificativa da excecao de desconto';
      end if;
      v_aprov := auth.uid();
      v_aprov_em := now();
    else
      -- Dentro do limite: nao precisa de aprovacao.
      v_aprov := null;
      v_aprov_em := null;
    end if;
  end if;

  update cotacoes
     set fipe                 = v_fipe,
         tipo_veiculo_id      = v_tipo,
         cota_participacao_id = coalesce(p_cota_id, cota_participacao_id),
         plano_id             = v_plano,
         opcionais_ids        = v_opc,
         itens                = v_itens,
         total_mensalidade    = (v_calc->>'valor_total_mensalidade')::numeric,
         taxa_adesao          = coalesce((v_calc->>'taxa_adesao')::numeric, 0),
         participacao         = calcular_participacao(v_fipe, v_tipo, coalesce(p_cota_id, cota_participacao_id)),
         modo_envio           = coalesce(p_modo_envio, modo_envio),
         desconto_percentual  = v_desc,
         desconto_aprovado_por = v_aprov,
         desconto_aprovado_em  = v_aprov_em,
         desconto_justificativa = case when v_aprov is null then null
                                       else coalesce(p_desconto_justificativa, desconto_justificativa) end,
         atualizada_em        = now(),
         atualizada_por       = auth.uid()
   where id = p_cotacao_id
   returning * into c;

  return c;
end;
$$;

-- Aplica SOMENTE o desconto (usado pelo modal de alcada, que roda na sessao do
-- gestor quando o percentual ultrapassa o limite da franquia).
create or replace function aplicar_desconto_cotacao(
  p_cotacao_id  uuid,
  p_percentual  numeric,
  p_justificativa text default null
)
returns cotacoes
language plpgsql
security definer
set search_path = public
as $$
begin
  return atualizar_cotacao(
    p_cotacao_id, null, null, null, null, null, null, p_percentual, p_justificativa
  );
end;
$$;

-- Simulacao para a UI: devolve o limite da regional e o efeito do desconto.
create or replace function simular_desconto_cotacao(p_cotacao_id uuid, p_percentual numeric)
returns table (
  limite_regional      numeric,
  dentro_do_limite     boolean,
  exige_aprovacao      boolean,
  mensalidade_original numeric,
  mensalidade_final    numeric,
  adesao_original      numeric,
  adesao_final         numeric,
  desconto_mensalidade numeric,
  desconto_adesao      numeric
)
language sql stable
as $$
  select lim.valor,
         p_percentual <= lim.valor,
         p_percentual > lim.valor,
         c.total_mensalidade,
         round(c.total_mensalidade * (1 - p_percentual / 100), 2),
         coalesce(c.taxa_adesao, 0),
         round(coalesce(c.taxa_adesao, 0) * (1 - p_percentual / 100), 2),
         round(c.total_mensalidade * p_percentual / 100, 2),
         round(coalesce(c.taxa_adesao, 0) * p_percentual / 100, 2)
    from cotacoes c
    join leads l on l.id = c.lead_id
    cross join lateral (
      select limite_desconto_regional(coalesce(l.regional_id, (select regional_id from usuarios u where u.id = l.consultor_id))) as valor
    ) lim
   where c.id = p_cotacao_id;
$$;

-- ----------------------------------------------------------------------------
-- A) Pipeline / Kanban: movimentacao de status com trilha
-- ----------------------------------------------------------------------------
-- O historico ja e gravado por trigger; aqui apenas passamos a observacao
-- (motivo da perda, por exemplo) via variavel de sessao.
create or replace function fn_lead_historico()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_obs text := nullif(current_setting('scar.obs_lead', true), '');
begin
  if tg_op = 'INSERT' then
    insert into lead_historico(lead_id, de, para, usuario_id, obs)
      values (new.id, null, new.status, auth.uid(), v_obs);
  elsif new.status is distinct from old.status then
    insert into lead_historico(lead_id, de, para, usuario_id, obs)
      values (new.id, old.status, new.status, auth.uid(), coalesce(v_obs, new.perdido_motivo));
  end if;
  return new;
end;
$$;

-- Move o lead no funil (usado pelo drag-and-drop do Kanban).
-- Recebe TEXTO para nao depender do literal do enum recem-criado.
create or replace function mover_lead_status(
  p_lead_id uuid,
  p_status  text,
  p_obs     text default null
)
returns leads
language plpgsql
security definer
set search_path = public
as $$
declare
  l leads;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  select * into l from leads where id = p_lead_id;
  if l.id is null then raise exception 'Lead nao encontrado'; end if;

  if p_status not in ('NOVO','ORCAMENTO_GERADO','PROPOSTA_ENVIADA','EM_NEGOCIACAO','APROVADO','PERDIDO') then
    raise exception 'Status invalido para movimentacao no funil: %', p_status;
  end if;
  if l.status::text in ('EM_AUDITORIA','ATIVO') then
    raise exception 'Lead em auditoria/ativo nao volta pelo funil — trate pela Auditoria';
  end if;
  if p_status = 'PERDIDO' and (p_obs is null or btrim(p_obs) = '') then
    raise exception 'Informe o motivo da perda';
  end if;

  perform set_config('scar.obs_lead', coalesce(p_obs, ''), true);

  update leads
     set status = p_status::status_lead,
         perdido_motivo = case when p_status = 'PERDIDO' then p_obs else perdido_motivo end,
         updated_at = now()
   where id = p_lead_id
   returning * into l;

  perform set_config('scar.obs_lead', '', true);
  return l;
end;
$$;

-- Leads do Kanban com o resumo da ultima cotacao (uma consulta so).
create or replace function leads_kanban(
  p_regional_id uuid default null,
  p_consultor_id uuid default null,
  p_limite int default 500
)
returns table (
  id                  uuid,
  nome                text,
  celular             text,
  status              status_lead,
  marca               text,
  modelo              text,
  placa               text,
  valor_fipe          numeric,
  consultor           text,
  regional_id         uuid,
  cotacao_id          uuid,
  total_mensalidade   numeric,
  total_com_desconto  numeric,
  desconto_percentual numeric,
  desconto_aprovado   boolean,
  atualizado_em       timestamptz
)
language sql stable
security definer
set search_path = public
as $$
  select l.id, l.nome, l.celular, l.status, l.marca, l.modelo, l.placa, l.valor_fipe,
         u.nome, l.regional_id,
         c.id, c.total_mensalidade, c.total_com_desconto, c.desconto_percentual,
         (c.desconto_aprovado_por is not null), l.updated_at
    from leads l
    left join usuarios u on u.id = l.consultor_id
    left join lateral (
      select * from cotacoes co where co.lead_id = l.id order by co.created_at desc limit 1
    ) c on true
   where (p_regional_id is null or l.regional_id = p_regional_id)
     and (p_consultor_id is null or l.consultor_id = p_consultor_id)
     and (tem_acesso_global() or pode_auditar()
          or l.consultor_id = auth.uid()
          or (l.regional_id is not null and l.regional_id = auth_regional_id()))
   order by l.updated_at desc
   limit coalesce(p_limite, 500);
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
grant execute on function limite_desconto_regional(uuid) to authenticated;
grant execute on function pode_aprovar_desconto() to authenticated;
grant execute on function produtos_obrigatorios_cotacao(uuid, uuid, numeric) to authenticated;
grant execute on function lead_em_negociacao(uuid) to authenticated;
grant execute on function atualizar_cotacao(uuid, numeric, uuid, uuid, uuid, uuid[], text, numeric, text) to authenticated;
grant execute on function aplicar_desconto_cotacao(uuid, numeric, text) to authenticated;
grant execute on function simular_desconto_cotacao(uuid, numeric) to authenticated;
grant execute on function mover_lead_status(uuid, text, text) to authenticated;
grant execute on function leads_kanban(uuid, uuid, int) to authenticated;
