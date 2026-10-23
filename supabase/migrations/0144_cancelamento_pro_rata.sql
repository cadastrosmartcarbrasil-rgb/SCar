-- =============================================================================
-- 0144 — CANCELAMENTO DO VEICULO E O PRO-RATA
--
-- Pedido do usuario (23/10/2026): o card "Cancelamento" do SAC so abria um
-- protocolo. Ele passa a CANCELAR o veiculo de verdade — e SO o veiculo
-- escolhido; os outros do associado ficam como estao — com o motivo, a previsao
-- de retorno e a cobranca dos dias usados (pro-rata). Decisoes do usuario:
--   * CICLO POS-PAGO: o boleto que vence no dia D de um mes cobre de D do mes
--     anterior a D-1 deste (o de 20/10 cobre 20/09 a 19/10);
--   * BOLETOS FUTUROS do veiculo (vencimento depois do cancelamento): BAIXADOS
--     no banco, com opcao de desmarcar. Boleto sem veiculo (fatura agrupada,
--     boleto do Mutual sem veiculo) NAO e tocado;
--   * RETORNO PREVISTO vira lead no CRM, com o retorno agendado na data.
--
-- (A) `pro_rata_veiculo(veiculo, ate, desde)` — o calculo reutilizavel, SEMPRE
--     pela data de vencimento do veiculo. Espelho puro em `src/lib/pro-rata.ts`.
-- (B) `veiculo_cancelamentos` (a trilha) + `veiculos.cancelado_em` (limpo por
--     trigger quando o veiculo volta para a base).
-- (C) `cancelar_veiculo(...)` — status INATIVO com motivo, data de saida = a
--     data do pedido, faturas abertas futuras do veiculo retiradas, lead de
--     retorno. Permissao: `veiculos.cancelar` (grade da 0111) na unidade.
-- (D) `criar_renegociacao_pro_rata(...)` — o boleto do pro-rata e a baixa dos
--     boletos futuros pela MESMA maquina da 2a via (0121): tipo PRO_RATA. Serve
--     ao cancelamento e a emissao avulsa de pro-rata (Historico Financeiro).
-- (E) TRAVAS a partir da data do cancelamento: evento ocorrido nesse dia ou
--     depois e recusado; acionamento da 24h tambem (o NEGADO continua sendo
--     registrado — e a contagem de pedidos negados, 0134).
-- (F) A CARGA DO MUTUAL nao reativa o veiculo cancelado aqui: enquanto o dono
--     e o mesmo, o status do SCar fica. Troca de dono (revenda, 0138) segue o
--     Mutual.
-- =============================================================================

-- (A) ------------------------------------------------------------------------
/**
 * O pro-rata do veiculo, pela data de VENCIMENTO dele (ciclo pos-pago).
 *   p_ate   = ultimo dia usado (no cancelamento, a data do pedido);
 *   p_desde = primeiro dia cobrado (padrao: o inicio do ciclo de p_ate).
 * O ciclo de p_ate vai do ultimo vencimento <= p_ate ao dia anterior ao
 * proximo; o boleto que o cobre e o do proximo vencimento. Dias contados com
 * os dois extremos; valor = mensalidade x dias usados / dias do ciclo.
 */
create or replace function pro_rata_veiculo(
  p_veiculo_id uuid,
  p_ate        date,
  p_desde      date default null
) returns table (
  valor_mensal     numeric,
  dia_vencimento   integer,
  ciclo_inicio     date,
  ciclo_fim        date,
  vencimento_ciclo date,
  desde            date,
  ate              date,
  dias_ciclo       integer,
  dias_usados      integer,
  valor            numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reg   uuid;
  v_dia   integer;
  v_mes   date;
  v_cur   date;
  v_ini   date;
  v_prox  date;
  v_desde date;
  v_mens  numeric;
  v_dias  integer;
  v_usa   integer;
begin
  select v.regional_id, coalesce(v.dia_vencimento, 10)
    into v_reg, v_dia
    from veiculos v where v.id = p_veiculo_id;
  if not found then
    raise exception 'Veiculo nao encontrado.' using errcode = 'no_data_found';
  end if;
  if auth.uid() is not null and not (is_staff() and pode_regional(v_reg)) then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;
  if p_ate is null then
    raise exception 'Informe a data final do pro-rata.' using errcode = 'check_violation';
  end if;

  v_mes := date_trunc('month', p_ate)::date;
  v_cur := calcular_vencimento(v_mes, v_dia);
  if v_cur <= p_ate then
    v_ini  := v_cur;
    v_prox := calcular_vencimento((v_mes + interval '1 month')::date, v_dia);
  else
    v_ini  := calcular_vencimento((v_mes - interval '1 month')::date, v_dia);
    v_prox := v_cur;
  end if;

  v_desde := coalesce(p_desde, v_ini);
  if v_desde < v_ini or v_desde > p_ate then
    raise exception 'O inicio do pro-rata tem de estar no ciclo de % a % e antes de %.',
      to_char(v_ini, 'DD/MM/YYYY'), to_char(v_prox - 1, 'DD/MM/YYYY'), to_char(p_ate, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;

  v_mens := coalesce(valor_mensalidade_veiculo(p_veiculo_id), 0);
  v_dias := v_prox - v_ini;
  v_usa  := p_ate - v_desde + 1;

  return query select v_mens, v_dia, v_ini, v_prox - 1, v_prox, v_desde, p_ate,
                      v_dias, v_usa,
                      least(v_mens, round(v_mens * v_usa / v_dias, 2));
end;
$$;

comment on function pro_rata_veiculo(uuid, date, date) is
  'Pro-rata pela data de vencimento do veiculo (ciclo pos-pago, 0144). Espelho em src/lib/pro-rata.ts.';

-- (B) ------------------------------------------------------------------------
alter table veiculos add column if not exists cancelado_em date;
comment on column veiculos.cancelado_em is
  'Data do pedido de cancelamento (0144). A partir dela nao ha evento nem 24h. Limpa ao voltar para a base.';

create table if not exists veiculo_cancelamentos (
  id                 uuid primary key default gen_random_uuid(),
  veiculo_id         uuid not null references veiculos(id) on delete cascade,
  cliente_id         uuid not null references clientes(id),
  regional_id        uuid references regionais(id),
  data_cancelamento  date not null,
  motivo             text not null,
  previsao_retorno   boolean not null default false,
  data_retorno       date,
  status_anterior    text not null,
  cobranca_externa   boolean not null default false,
  pro_rata           jsonb,
  lead_retorno_id    uuid references leads(id) on delete set null,
  renegociacao_id    uuid references cobranca_renegociacoes(id),
  faturas_ajustadas  integer not null default 0,
  observacao         text,
  criado_por         uuid references usuarios(id),
  created_at         timestamptz not null default clock_timestamp(),
  reativado_em       timestamptz,
  constraint chk_cancel_motivo check (length(btrim(motivo)) >= 5),
  constraint chk_cancel_retorno check (
    (previsao_retorno and data_retorno is not null and data_retorno > data_cancelamento)
    or (not previsao_retorno and data_retorno is null))
);
create index if not exists idx_veic_cancel_veiculo on veiculo_cancelamentos (veiculo_id, created_at desc);
create index if not exists idx_veic_cancel_cliente on veiculo_cancelamentos (cliente_id);

alter table veiculo_cancelamentos enable row level security;
drop policy if exists veic_cancel_select on veiculo_cancelamentos;
create policy veic_cancel_select on veiculo_cancelamentos for select to authenticated
  using (is_staff() and pode_regional(regional_id));
-- sem policy de escrita: grava SO pela RPC.
grant select on veiculo_cancelamentos to authenticated;

/** Voltou para a base: o cancelamento deixa de valer (a trilha fica). */
create or replace function fn_veiculo_limpa_cancelamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.cancelado_em is not null and not veiculo_fora_da_base(new.status) then
    new.cancelado_em := null;
    update veiculo_cancelamentos set reativado_em = now()
     where veiculo_id = new.id and reativado_em is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_veiculo_limpa_cancelamento on veiculos;
create trigger trg_veiculo_limpa_cancelamento
  before update of status on veiculos
  for each row execute function fn_veiculo_limpa_cancelamento();

-- (C) ------------------------------------------------------------------------
/**
 * Cancela UM veiculo. Nao mexe nos outros veiculos do associado, nem no
 * cadastro dele. Faturas ABERTAS (sem titulo) do veiculo com vencimento depois
 * do pedido saem: a individual e cancelada, na agrupada sai so o item dele.
 * Os boletos ja emitidos sao baixados por `criar_renegociacao_pro_rata`.
 */
create or replace function cancelar_veiculo(
  p_veiculo_id       uuid,
  p_data             date,
  p_motivo           text,
  p_previsao_retorno boolean default false,
  p_data_retorno     date default null,
  p_observacao       text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v      veiculos%rowtype;
  c      clientes%rowtype;
  v_hoje date := data_sp(now());
  v_id   uuid;
  v_lead uuid;
  v_pr   jsonb;
  v_fat  integer := 0;
  f      record;
  v_uid  uuid := (select id from usuarios where id = auth.uid());
  v_vend uuid;
  v_cons uuid;
begin
  select * into v from veiculos where id = p_veiculo_id for update;
  if not found then
    raise exception 'Veiculo nao encontrado.' using errcode = 'no_data_found';
  end if;
  if auth.uid() is not null and not (perfil_pode('veiculos', 'cancelar') and pode_regional(v.regional_id)) then
    raise exception 'Sem permissao para cancelar veiculo (Veiculos: Cancelar).' using errcode = 'insufficient_privilege';
  end if;
  if veiculo_fora_da_base(v.status) then
    raise exception 'O veiculo ja esta fora da base (%).', v.status using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'check_violation';
  end if;
  if p_data is null or p_data > v_hoje then
    raise exception 'A data do pedido nao pode ser futura.' using errcode = 'check_violation';
  end if;
  if p_data < v_hoje - 60 then
    raise exception 'A data do pedido pode voltar no maximo 60 dias.' using errcode = 'check_violation';
  end if;
  if v.data_ativacao is not null and p_data < v.data_ativacao then
    raise exception 'A data do pedido e anterior a ativacao do veiculo (%).',
      to_char(v.data_ativacao, 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;
  if coalesce(p_previsao_retorno, false) and (p_data_retorno is null or p_data_retorno <= p_data) then
    raise exception 'Informe a data prevista do retorno (depois do cancelamento).' using errcode = 'check_violation';
  end if;

  select * into c from clientes where id = v.cliente_id;

  select to_jsonb(p) into v_pr from pro_rata_veiculo(p_veiculo_id, p_data) p;

  -- O veiculo sai da base na data do pedido.
  perform set_config('scar.motivo_status_veiculo', 'Cancelamento: ' || btrim(p_motivo), true);
  update veiculos
     set status = 'inativo', cancelado_em = p_data, data_saida = p_data
   where id = p_veiculo_id;
  perform set_config('scar.motivo_status_veiculo', '', true);

  -- Faturas abertas (ainda sem titulo) com vencimento depois do pedido.
  for f in
    select fa.id, fa.tipo_faturamento, fa.veiculo_id
      from faturas fa
     where fa.status = 'ABERTA' and fa.titulo_id is null
       and fa.vencimento > p_data
       and (fa.veiculo_id = p_veiculo_id
            or exists (select 1 from fatura_itens i where i.fatura_id = fa.id and i.veiculo_id = p_veiculo_id))
  loop
    if f.veiculo_id = p_veiculo_id then
      update faturas set status = 'CANCELADA', updated_at = now() where id = f.id;
    else
      delete from fatura_itens where fatura_id = f.id and veiculo_id = p_veiculo_id;
      if exists (select 1 from fatura_itens where fatura_id = f.id) then
        update faturas set valor_total = (select coalesce(sum(valor), 0) from fatura_itens where fatura_id = f.id),
                           updated_at = now()
         where id = f.id;
      else
        update faturas set status = 'CANCELADA', updated_at = now() where id = f.id;
      end if;
    end if;
    v_fat := v_fat + 1;
  end loop;

  -- O retorno previsto vira trabalho no CRM: lead com o retorno agendado.
  if coalesce(p_previsao_retorno, false) then
    select vd.id, vd.usuario_id into v_vend, v_cons from vendedores vd where vd.id = v.vendedor_id;
    insert into leads (nome, celular, email, cpf_cnpj, placa, tipo_veiculo_id, marca, modelo,
                       ano_modelo, valor_fipe, codigo_fipe, regional_id, vendedor_id, consultor_id,
                       created_by, status, cliente_existente_id, observacoes,
                       proximo_contato_em, proximo_contato_nota)
    values (c.nome_razao_social,
            coalesce(nullif(c.celular, ''), nullif(c.telefone, ''), 'SEM TELEFONE'),
            c.email, c.cpf_cnpj, v.placa, v.tipo_veiculo_id, v.marca, v.modelo,
            v.ano_modelo, v.valor_fipe, v.codigo_fipe, v.regional_id, v_vend, v_cons,
            v_uid, 'NOVO', c.id,
            format('Retorno de associado: veiculo %s cancelado em %s. Motivo: %s. '
                   || 'O veiculo ja existe na base: ao fechar, REATIVE o cadastro dele '
                   || '(nao autorize nova entrada).',
                   coalesce(v.placa, '0 KM ' || coalesce(v.chassi, '')),
                   to_char(p_data, 'DD/MM/YYYY'), btrim(p_motivo)),
            (p_data_retorno::timestamp + interval '9 hours') at time zone 'America/Sao_Paulo',
            'Retorno previsto do associado (cancelou em ' || to_char(p_data, 'DD/MM/YYYY') || ')')
    returning id into v_lead;
  end if;

  insert into veiculo_cancelamentos (veiculo_id, cliente_id, regional_id, data_cancelamento, motivo,
                                     previsao_retorno, data_retorno, status_anterior,
                                     cobranca_externa, pro_rata, lead_retorno_id,
                                     faturas_ajustadas, observacao, criado_por)
  values (p_veiculo_id, v.cliente_id, v.regional_id, p_data, btrim(p_motivo),
          coalesce(p_previsao_retorno, false),
          case when coalesce(p_previsao_retorno, false) then p_data_retorno end,
          v.status::text, coalesce(v.cobranca_externa, false), v_pr, v_lead, v_fat,
          nullif(btrim(coalesce(p_observacao, '')), ''), v_uid)
  returning id into v_id;

  return v_id;
end;
$$;

-- (D) ------------------------------------------------------------------------
alter table cobranca_renegociacoes drop constraint if exists chk_reneg_tipo;
alter table cobranca_renegociacoes add constraint chk_reneg_tipo
  check (tipo in ('SEGUNDA_VIA', 'ACORDO', 'PRO_RATA'));

alter table cobranca_renegociacoes add column if not exists veiculo_id uuid references veiculos(id);
alter table cobranca_renegociacoes add column if not exists pro_rata jsonb;

/**
 * O boleto do PRO-RATA e/ou a baixa dos boletos futuros do veiculo, pela
 * maquina da 2a via (0121). `p_origens` = [{"origem":"MUTUAL"|"SCAR","id"}] —
 * so boletos EM ABERTO DESTE veiculo (nunca de outro, nunca sem veiculo).
 * Sem cobranca nem origem nao cria nada (devolve null). Sem cobranca, nasce
 * EMITIDA (nao ha boleto novo para esperar) e a rota so pede as baixas.
 * Com `p_cancelamento_id`: permissao do cancelamento e boletos com vencimento
 * depois do pedido; sem ele: o escopo da cobranca (`cobranca_pode_cliente`).
 */
create or replace function criar_renegociacao_pro_rata(
  p_veiculo_id      uuid,
  p_ate             date,
  p_desde           date default null,
  p_cobrar          boolean default true,
  p_vencimento      date default null,
  p_origens         jsonb default '[]'::jsonb,
  p_cancelamento_id uuid default null,
  p_observacao      text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v       veiculos%rowtype;
  k       veiculo_cancelamentos%rowtype;
  p       record;
  v_hoje  date := data_sp(now());
  v_id    uuid;
  v_o     jsonb;
  v_ref   uuid;
  v_orig  text;
  v_h     boletos_historico%rowtype;
  v_t     titulos_financeiros%rowtype;
  v_soma  numeric := 0;
  v_cobra boolean;
  v_n     integer := jsonb_array_length(coalesce(p_origens, '[]'::jsonb));
begin
  select * into v from veiculos where id = p_veiculo_id;
  if not found then
    raise exception 'Veiculo nao encontrado.' using errcode = 'no_data_found';
  end if;

  if p_cancelamento_id is not null then
    select * into k from veiculo_cancelamentos where id = p_cancelamento_id;
    if not found or k.veiculo_id <> p_veiculo_id then
      raise exception 'Cancelamento nao encontrado para este veiculo.' using errcode = 'check_violation';
    end if;
    if auth.uid() is not null and not (perfil_pode('veiculos', 'cancelar') and pode_regional(v.regional_id)) then
      raise exception 'Sem permissao (Veiculos: Cancelar).' using errcode = 'insufficient_privilege';
    end if;
    if exists (select 1 from cobranca_renegociacoes r
                where r.id = k.renegociacao_id and r.situacao <> 'ERRO') then
      raise exception 'A cobranca deste cancelamento ja foi gerada.' using errcode = 'unique_violation';
    end if;
  elsif auth.uid() is not null and not cobranca_pode_cliente(v.cliente_id) then
    raise exception 'Fora do seu escopo de cobranca.' using errcode = 'insufficient_privilege';
  end if;

  select * into p from pro_rata_veiculo(p_veiculo_id, p_ate, p_desde);
  v_cobra := coalesce(p_cobrar, false) and p.valor > 0;

  if not v_cobra and v_n = 0 then
    return null;
  end if;
  if v_cobra and (p_vencimento is null or p_vencimento < v_hoje or p_vencimento > v_hoje + 60) then
    raise exception 'O vencimento do boleto do pro-rata tem de ser de hoje ate 60 dias.' using errcode = 'check_violation';
  end if;

  insert into cobranca_renegociacoes (cliente_id, regional_id, tipo, valor_original, valor_total,
                                      observacao, situacao, emitida_em, criado_por, veiculo_id, pro_rata)
  values (v.cliente_id, v.regional_id, 'PRO_RATA', 0, case when v_cobra then p.valor else 0 end,
          nullif(btrim(coalesce(p_observacao, '')), ''),
          case when v_cobra then 'EMITINDO' else 'EMITIDA' end,
          case when v_cobra then null else now() end,
          (select id from usuarios where id = auth.uid()), p_veiculo_id, to_jsonb(p))
  returning id into v_id;

  for v_o in select * from jsonb_array_elements(coalesce(p_origens, '[]'::jsonb)) loop
    v_orig := upper(coalesce(v_o->>'origem', ''));
    begin
      v_ref := (v_o->>'id')::uuid;
    exception when others then
      raise exception 'Boleto de origem ilegivel.' using errcode = 'check_violation';
    end;
    if v_orig = 'MUTUAL' then
      select * into v_h from boletos_historico where id = v_ref for update;
      if not found or v_h.veiculo_id is distinct from p_veiculo_id then
        raise exception 'Boleto do Mutual nao e deste veiculo.' using errcode = 'check_violation';
      end if;
      if v_h.situacao <> 'aberto' or v_h.baixa_banco_em is not null then
        raise exception 'O boleto do Mutual de % nao esta em aberto.',
          to_char(v_h.data_vencimento, 'DD/MM/YYYY') using errcode = 'check_violation';
      end if;
      if v_h.nosso_numero is null then
        raise exception 'O boleto do Mutual de % nao tem nosso numero: sem ele nao ha baixa no Sicredi. Trate no Mutual.',
          to_char(v_h.data_vencimento, 'DD/MM/YYYY') using errcode = 'check_violation';
      end if;
      if p_cancelamento_id is not null and v_h.data_vencimento <= k.data_cancelamento then
        raise exception 'O boleto de % vence antes do cancelamento: e divida, nao e baixado.',
          to_char(v_h.data_vencimento, 'DD/MM/YYYY') using errcode = 'check_violation';
      end if;
      if exists (select 1 from cobranca_renegociacao_origens o
                   join cobranca_renegociacoes r on r.id = o.renegociacao_id
                  where o.boleto_historico_id = v_ref and r.situacao <> 'ERRO' and r.id <> v_id) then
        raise exception 'O boleto do Mutual de % ja esta em outra negociacao.',
          to_char(v_h.data_vencimento, 'DD/MM/YYYY') using errcode = 'unique_violation';
      end if;
      insert into cobranca_renegociacao_origens (renegociacao_id, origem, boleto_historico_id, valor, vencimento, nosso_numero)
      values (v_id, 'MUTUAL', v_ref, v_h.valor, v_h.data_vencimento, v_h.nosso_numero);
      v_soma := v_soma + v_h.valor;
    elsif v_orig = 'SCAR' then
      select * into v_t from titulos_financeiros where id = v_ref for update;
      if not found or v_t.veiculo_id is distinct from p_veiculo_id then
        raise exception 'Boleto do SCar nao e deste veiculo.' using errcode = 'check_violation';
      end if;
      if v_t.status::text not in ('pendente', 'vencido') then
        raise exception 'O boleto de % nao esta em aberto.',
          to_char(v_t.data_vencimento, 'DD/MM/YYYY') using errcode = 'check_violation';
      end if;
      if p_cancelamento_id is not null and v_t.data_vencimento <= k.data_cancelamento then
        raise exception 'O boleto de % vence antes do cancelamento: e divida, nao e baixado.',
          to_char(v_t.data_vencimento, 'DD/MM/YYYY') using errcode = 'check_violation';
      end if;
      if exists (select 1 from cobranca_renegociacao_origens o
                   join cobranca_renegociacoes r on r.id = o.renegociacao_id
                  where o.titulo_id = v_ref and r.situacao <> 'ERRO' and r.id <> v_id) then
        raise exception 'O boleto de % ja esta em outra negociacao.',
          to_char(v_t.data_vencimento, 'DD/MM/YYYY') using errcode = 'unique_violation';
      end if;
      insert into cobranca_renegociacao_origens (renegociacao_id, origem, titulo_id, valor, vencimento, nosso_numero)
      values (v_id, 'SCAR', v_ref, v_t.valor, v_t.data_vencimento, v_t.nosso_numero);
      v_soma := v_soma + v_t.valor;
    else
      raise exception 'Origem invalida: use MUTUAL ou SCAR.' using errcode = 'check_violation';
    end if;
  end loop;

  update cobranca_renegociacoes set valor_original = v_soma where id = v_id;

  if v_cobra then
    insert into titulos_financeiros (cliente_id, veiculo_id, valor, valor_original, data_vencimento,
                                     status, renegociacao_id, renegociacao_parcela, observacao)
    values (v.cliente_id, p_veiculo_id, p.valor, p.valor, p_vencimento, 'pendente', v_id, 1,
            format('Pro-rata de %s a %s (%s de %s dias)',
                   to_char(p.desde, 'DD/MM/YYYY'), to_char(p.ate, 'DD/MM/YYYY'),
                   p.dias_usados, p.dias_ciclo));
  end if;

  if p_cancelamento_id is not null then
    update veiculo_cancelamentos set renegociacao_id = v_id where id = p_cancelamento_id;
  end if;

  return v_id;
end;
$$;

/** A baixa por cancelamento/pro-rata nao e 2a via: nao exige revistoria (0137). */
create or replace function fn_reneg_origem_exige_revistoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cli   uuid;
  v_veic  uuid;
  v_corte integer := dias_revistoria_boleto();
  v_dias  integer;
  r       record;
begin
  -- 0144: cancelamento e pro-rata nao sao 2a via.
  if exists (select 1 from cobranca_renegociacoes x
              where x.id = new.renegociacao_id and x.tipo = 'PRO_RATA') then
    return new;
  end if;

  v_dias := revistoria_hoje() - dia_util_seguinte(new.vencimento);
  if v_dias <= v_corte then
    return new;
  end if;

  select cliente_id into v_cli from cobranca_renegociacoes where id = new.renegociacao_id;
  if new.origem = 'MUTUAL' then
    select veiculo_id into v_veic from boletos_historico where id = new.boleto_historico_id;
  else
    select veiculo_id into v_veic from titulos_financeiros where id = new.titulo_id;
  end if;

  for r in
    select v.id, v.placa, v.chassi from veiculos v
     where (v.id = v_veic or (v_veic is null and v.cliente_id = v_cli))
       and revistoria_veiculo_na_base(v.status::text)
  loop
    update revistorias_cobranca rc set renegociacao_id = new.renegociacao_id
     where rc.veiculo_id = r.id
       and revistoria_libera(rc, new.renegociacao_id);
    if not found then
      raise exception 'REVISTORIA PENDENTE: o veiculo % tem boleto vencido ha % dias (o limite e %). A 2a via so sai com a revistoria aprovada — ou liberada com justificativa.',
        coalesce(r.placa, '0 KM chassi ' || right(coalesce(r.chassi, ''), 6)), v_dias, v_corte
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

/** O cancelamento do veiculo e o que veio dele (SAC, fichas). */
create or replace function cancelamentos_do_veiculo(p_veiculo_id uuid)
returns table (
  id                uuid,
  data_cancelamento date,
  motivo            text,
  previsao_retorno  boolean,
  data_retorno      date,
  status_anterior   text,
  cobranca_externa  boolean,
  pro_rata          jsonb,
  lead_retorno_id   uuid,
  renegociacao_id   uuid,
  renegociacao_situacao text,
  faturas_ajustadas integer,
  observacao        text,
  criado_por        text,
  created_at        timestamptz,
  reativado_em      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select k.id, k.data_cancelamento, k.motivo, k.previsao_retorno, k.data_retorno, k.status_anterior,
         k.cobranca_externa, k.pro_rata, k.lead_retorno_id, k.renegociacao_id, r.situacao,
         k.faturas_ajustadas, k.observacao, u.nome, k.created_at, k.reativado_em
    from veiculo_cancelamentos k
    left join usuarios u on u.id = k.criado_por
    left join cobranca_renegociacoes r on r.id = k.renegociacao_id
   where k.veiculo_id = p_veiculo_id
     and (auth.uid() is null or (is_staff() and pode_regional(k.regional_id)))
   order by k.created_at desc;
$$;

-- (E) ------------------------------------------------------------------------
/** Evento ocorrido no dia do cancelamento ou depois: sem cobertura. */
create or replace function fn_evento_veiculo_cancelado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c date;
  v_p text;
begin
  select cancelado_em, placa into v_c, v_p from veiculos where id = new.veiculo_id;
  if v_c is not null and new.data_ocorrencia >= v_c then
    raise exception 'O veiculo % foi cancelado em %: evento ocorrido a partir dessa data nao tem cobertura.',
      coalesce(v_p, ''), to_char(v_c, 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_evento_veiculo_cancelado on eventos_sinistro;
create trigger trg_evento_veiculo_cancelado
  before insert or update of veiculo_id, data_ocorrencia on eventos_sinistro
  for each row execute function fn_evento_veiculo_cancelado();

/** Acionamento da 24h de veiculo cancelado: so como pedido NEGADO (0134). */
create or replace function fn_acionamento_veiculo_cancelado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c date;
  v_p text;
begin
  if new.status::text = 'NEGADO' then
    return new;
  end if;
  select cancelado_em, placa into v_c, v_p from veiculos where id = new.veiculo_id;
  if v_c is not null then
    raise exception 'O veiculo % foi cancelado em %: nao ha assistencia a partir dessa data (registre como pedido negado).',
      coalesce(v_p, ''), to_char(v_c, 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_acionamento_veiculo_cancelado on acionamentos_assistencia;
create trigger trg_acionamento_veiculo_cancelado
  before insert on acionamentos_assistencia
  for each row execute function fn_acionamento_veiculo_cancelado();

-- (F) ------------------------------------------------------------------------
-- `mutual_executar_carga` recriada com o corpo da 0136 e UMA mudanca: o status.
-- Veiculo cancelado AQUI (cancelado_em) e com o MESMO dono fica como esta — o
-- Mutual so manda nele de novo quando reativado no SCar (o trigger limpa
-- cancelado_em) ou quando o carro troca de dono (revenda, 0138).
create or replace function mutual_executar_carga(
  p_regional_id      uuid,
  p_incluir_inativos boolean default false,
  p_confirmar        boolean default false,
  p_lote             integer default null,
  p_preparar         boolean default true
)
returns table (
  clientes_criados     bigint,
  clientes_atualizados bigint,
  veiculos_criados     bigint,
  veiculos_atualizados bigint,
  recusados            bigint,
  restantes            bigint,
  mensagem             text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r          record;
  v_cliente  uuid;
  v_veiculo  uuid;
  v_doc_ant  text;
  c_cria     bigint := 0;
  c_atu      bigint := 0;
  v_cria     bigint := 0;
  v_atu      bigint := 0;
  v_rec      bigint := 0;
  v_rest     bigint := 0;
  v_nome     text;
  v_ate      integer;
  v_doc_fim  text;
  v_quando   timestamptz;
  v_inat     boolean;
begin
  -- A carga escreve na operacao inteira: e da matriz, nunca da unidade.
  -- 0107: idem — o agendador recarrega as unidades sem sessao.
  if not (tem_acesso_global() or auth.uid() is null) then
    raise exception 'Somente a matriz pode executar a carga do Mutual';
  end if;

  if p_regional_id is null then
    raise exception 'A carga e POR UNIDADE: informe a regional';
  end if;

  if p_lote is not null and p_lote < 1 then
    raise exception 'O bloco tem de ter ao menos 1 linha';
  end if;

  select rg.nome into v_nome from regionais rg where rg.id = p_regional_id;
  if v_nome is null then
    raise exception 'Regional % nao existe', p_regional_id;
  end if;

  ---------------------------------------------------------------- simulacao
  if not p_confirmar then
    -- UMA leitura so (a 0084 lia duas vezes). Associado se conta por PESSOA.
    select count(distinct l.id_pessoa) filter (where l.problema is null and l.cliente_id is null),
           count(distinct l.id_pessoa) filter (where l.problema is null and l.cliente_id is not null),
           count(*)                    filter (where l.problema is null and l.acao = 'CRIAR'),
           count(*)                    filter (where l.problema is null and l.acao = 'ATUALIZAR'),
           count(*)                    filter (where l.problema is not null)
      into c_cria, c_atu, v_cria, v_atu, v_rec
      from mutual_carga_linhas(p_regional_id, p_incluir_inativos, false, null) l;

    return query select c_cria, c_atu, v_cria, v_atu, v_rec, 0::bigint,
      'SIMULACAO (p_confirmar = false): nada foi gravado em ' || v_nome;
    return;
  end if;

  -- Duas abas carregando a mesma unidade ao mesmo tempo disputariam a fila:
  -- a trava e da transacao, entao a segunda espera a primeira terminar.
  perform pg_advisory_xact_lock(hashtext('mutual_carga:' || p_regional_id::text));

  ------------------------------------------------------------------ preparo
  if p_preparar then
    delete from mutual_carga_fila f where f.regional_id = p_regional_id;

    with l as materialized (
      select * from mutual_carga_linhas(p_regional_id, p_incluir_inativos, false, null)
    ),
    ins as (
      insert into mutual_carga_fila
      select p_regional_id,
             (row_number() over (order by l.cpf_cnpj, l.id_objeto))::integer,
             p_incluir_inativos,
             now(),
             l.*
        from l
       where l.problema is null
      returning 1
    )
    select (select count(*) from ins), count(*) filter (where l.problema is not null)
      into v_rest, v_rec
      from l;

    -- Com bloco, a chamada que prepara so prepara: a leitura ja gastou o
    -- tempo dela. Quem grava sao as chamadas seguintes.
    if p_lote is not null then
      return query select 0::bigint, 0::bigint, 0::bigint, 0::bigint, v_rec, v_rest,
        'Fila preparada em ' || v_nome || ': ' || v_rest || ' veiculo(s) a gravar, '
        || v_rec || ' recusado(s).';
      return;
    end if;
  else
    -- Continuar uma fila: ela tem de existir, ser do MESMO recorte e ser recente.
    select min(f.preparada_em), bool_and(f.incluir_inativos)
      into v_quando, v_inat
      from mutual_carga_fila f where f.regional_id = p_regional_id;

    if v_quando is null then
      return query select 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint,
        'Nada na fila de ' || v_nome || ': a carga ja terminou (ou nao foi preparada).';
      return;
    end if;
    if v_inat is distinct from p_incluir_inativos then
      raise exception 'A fila de % foi preparada com outro recorte (acervo historico). Prepare de novo.', v_nome;
    end if;
    if v_quando < now() - interval '1 hour' then
      raise exception 'A fila de % foi preparada ha mais de 1 hora; o Mutual pode ter mudado. Prepare de novo.', v_nome;
    end if;
  end if;

  ----------------------------------------------------------- o bloco da vez
  -- Ate a linha `p_lote` da fila, ESTENDIDO ate o fim do associado: o mesmo
  -- CPF nunca fica dividido entre dois blocos.
  if p_lote is null then
    v_ate := null;
  else
    select f.ordem, f.cpf_cnpj into v_ate, v_doc_fim
      from mutual_carga_fila f
     where f.regional_id = p_regional_id
     order by f.ordem
     offset p_lote - 1 limit 1;

    if v_ate is not null then
      select max(f.ordem) into v_ate
        from mutual_carga_fila f
       where f.regional_id = p_regional_id
         and f.cpf_cnpj is not distinct from v_doc_fim;
    end if;
  end if;

  for r in
    select * from mutual_carga_fila f
     where f.regional_id = p_regional_id
       and (v_ate is null or f.ordem <= v_ate)
     order by f.ordem
  loop
    -- ================================================================
    -- Daqui ate o fim do laco o corpo e o da 0084, sem mudanca.
    -- ================================================================
    ------------------------------------------------------------------ cliente
    -- 🔴 O `cliente_id` da leitura e um RETRATO de antes do laco: no segundo
    -- veiculo do mesmo associado ele ainda viria nulo e o insert estouraria
    -- no unique de `cpf_cnpj`. Por isso o vinculo e re-resolvido A CADA
    -- volta, e o agrupamento acima e que evita o UPDATE repetido.
    if r.cpf_cnpj is distinct from v_doc_ant then
      v_doc_ant := r.cpf_cnpj;

      select coalesce(
               registro_do_externo('PERSON', r.id_pessoa, 'MUTUAL'),
               (select c.id from clientes c where c.cpf_cnpj = r.cpf_cnpj limit 1))
        into v_cliente;

      if v_cliente is null then
        insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, email, telefone,
                              celular, endereco, status, regional_id, data_nascimento,
                              nome_mae)
        values (r.tipo_pessoa, r.nome, r.cpf_cnpj, r.email, r.telefone,
                r.telefone, r.endereco, 'ativo', p_regional_id, r.data_nascimento,
                r.nome_mae)
        returning id into v_cliente;

        c_cria := c_cria + 1;
      else
        update clientes c
           set nome_razao_social = r.nome,
               email             = coalesce(r.email, c.email),
               telefone          = coalesce(r.telefone, c.telefone),
               endereco          = case when r.endereco = '{}'::jsonb
                                        then c.endereco else r.endereco end,
               data_nascimento   = coalesce(r.data_nascimento, c.data_nascimento),
               nome_mae          = coalesce(r.nome_mae, c.nome_mae),
               regional_id       = coalesce(c.regional_id, p_regional_id)
         where c.id = v_cliente;

        c_atu := c_atu + 1;
      end if;

      if r.id_pessoa is not null then
        perform vincular_externo('PERSON', r.id_pessoa, 'clientes', v_cliente,
                                 'MUTUAL', 'Carga ' || v_nome);
      end if;
    end if;

    ------------------------------------------------------------------ veiculo
    -- O vinculo e re-lido aqui (e nao tirado da fila): entre o preparo e
    -- este bloco, outro bloco pode ter criado o veiculo.
    v_veiculo := coalesce(r.veiculo_id,
                          registro_do_externo('CONTRACT_OBJECT', r.id_objeto, 'MUTUAL'));

    if v_veiculo is null then
      insert into veiculos (
        cliente_id, placa, zero_km, chassi, renavam, marca, modelo,
        ano_fabricacao, ano_modelo, cor_id, cor, uso, valor_fipe, codigo_fipe,
        regional_id, plano_protecao_id, tipo_veiculo_id, status,
        data_ativacao, valor_mensalidade, dia_vencimento,
        -- (1) O interruptor. E ele que faz `veiculo_faturavel` devolver
        -- false, e com isso `gerar_primeira_cobranca_veiculo` (chamada
        -- pelo trigger AFTER INSERT) retorna sem gerar nada.
        cobranca_externa, cobranca_externa_desde
      )
      values (
        -- 0136: sem placa entra como 0 km (placa pendente), pelo chassi.
        v_cliente, r.placa, r.placa is null, r.chassi, r.renavam, r.marca, r.modelo,
        r.ano_fabricacao, r.ano_modelo, r.cor_id, r.cor, r.uso, r.valor_fipe, r.codigo_fipe,
        p_regional_id, r.plano_id, r.tipo_veiculo_id, r.status,
        r.data_ativacao, r.valor_mensalidade, r.dia_vencimento,
        true, r.data_ativacao
      )
      returning id into v_veiculo;

      v_cria := v_cria + 1;
    else
      -- (10) Atualiza o que o Mutual e dono. NAO mexe em
      -- `cobranca_externa` (o cutover ja pode ter sido virado), nem em
      -- plano quando alguem escolheu um aqui, nem em rastreador,
      -- alienacao, tipo de faturamento, cota, km ou vendedor.
      update veiculos v
         -- 0136: a placa do Mutual manda QUANDO EXISTE. Sem ela (0 km
         -- ainda sem placa la), fica a que a operacao preencheu aqui —
         -- senao a proxima rodada apagaria a placa digitada no SCar.
         set placa             = coalesce(r.placa, v.placa),
             zero_km           = case when coalesce(r.placa, v.placa) is null
                                      then true else v.zero_km end,
             chassi            = coalesce(r.chassi, v.chassi),
             renavam           = r.renavam,
             marca             = coalesce(r.marca, v.marca),
             modelo            = coalesce(r.modelo, v.modelo),
             ano_fabricacao    = coalesce(r.ano_fabricacao, v.ano_fabricacao),
             ano_modelo        = coalesce(r.ano_modelo, v.ano_modelo),
             cor               = coalesce(r.cor, v.cor),
             cor_id            = coalesce(r.cor_id, v.cor_id),
             valor_fipe        = coalesce(r.valor_fipe, v.valor_fipe),
             codigo_fipe       = coalesce(r.codigo_fipe, v.codigo_fipe),
             tipo_veiculo_id   = coalesce(v.tipo_veiculo_id, r.tipo_veiculo_id),
             plano_protecao_id = coalesce(v.plano_protecao_id, r.plano_id),
             status            = case when v.cancelado_em is not null and v.cliente_id = v_cliente
                                      then v.status else r.status end,
             data_ativacao     = coalesce(r.data_ativacao, v.data_ativacao),
             valor_mensalidade = coalesce(r.valor_mensalidade, v.valor_mensalidade),
             dia_vencimento    = coalesce(r.dia_vencimento, v.dia_vencimento),
             cliente_id        = v_cliente,
             regional_id       = p_regional_id
       where v.id = v_veiculo;

      v_atu := v_atu + 1;
    end if;

    perform vincular_externo('CONTRACT_OBJECT', r.id_objeto, 'veiculos', v_veiculo,
                             'MUTUAL', 'Carga ' || v_nome);

    -- Gravou: sai da fila. Se o bloco falhar no meio, a transacao inteira
    -- volta — e a fila volta junto, intacta, para tentar de novo.
    delete from mutual_carga_fila f
     where f.regional_id = p_regional_id and f.ordem = r.ordem;
  end loop;

  select count(*) into v_rest
    from mutual_carga_fila f where f.regional_id = p_regional_id;

  return query select c_cria, c_atu, v_cria, v_atu, v_rec, v_rest,
    case when v_rest > 0
         then 'Bloco gravado em ' || v_nome || '. Faltam ' || v_rest || ' veiculo(s) na fila.'
         else 'Carga de ' || v_nome || ' concluida. Os veiculos entraram com '
              || 'cobranca_externa: nenhuma fatura foi gerada. O cutover e '
              || 'definir_cobranca_externa_regional.'
    end;
end;
$$;

-- Rito da 0052: nenhuma RPC aberta ao anon.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
