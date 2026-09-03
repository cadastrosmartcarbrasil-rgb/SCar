-- ============================================================================
-- SCar :: 0045_agenda_vendas.sql
-- AGENDA DO VENDEDOR: contato registrado, proximo retorno e "parado ha N dias".
--
-- O problema que este arquivo resolve
-- -----------------------------------
-- O CRM sabia em que FASE o lead esta, mas nao sabia nada sobre o TRABALHO em
-- cima dele. Nao havia onde escrever "liguei dia 3, ele pediu para chamar na
-- sexta", entao:
--   1. o vendedor abria o Kanban e nao tinha lista de trabalho do dia;
--   2. um lead esquecido so aparecia se alguem rolasse a tela e reparasse;
--   3. a devolucao por inatividade do 0041 (`dias_sem_contato_lead`, padrao 7)
--      acontecia sem o dono nunca ter sido avisado de que estava perto disso.
--
-- O que entra aqui
-- ----------------
--   (A) `lead_interacoes` — a trilha do contato: tipo, resultado, observacao e
--       o retorno combinado. E historico, nao rascunho: nao se edita nem apaga.
--   (B) `leads.proximo_contato_em` / `proximo_contato_nota` — o compromisso
--       vigente. Fica no lead (e nao so na interacao) porque a agenda precisa
--       de UMA data por lead para filtrar e ordenar barato.
--   (C) `registrar_interacao_lead()` — grava a interacao, carimba
--       `ultima_interacao_em` (o mesmo campo que o hotlink ja alimentava e que
--       a devolucao ao pool le) e move a agenda.
--   (D) `agenda_vendas()` — o que faco hoje: o que venceu e o que vence hoje.
--   (E) `leads_kanban()` recriada devolvendo `dias_parado` e o limite de
--       inatividade da franquia, para o card mostrar o risco ANTES da perda.
--
-- Escolha registrada: "parado" conta de `ultima_interacao_em` (ou da criacao),
-- NAO de `updated_at`. Corrigir o valor da FIPE nao e trabalhar o lead.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Vocabulario do contato
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'tipo_interacao_lead') then
    create type tipo_interacao_lead as enum
      ('LIGACAO', 'WHATSAPP', 'EMAIL', 'VISITA', 'OBSERVACAO');
  end if;
  if not exists (select 1 from pg_type where typname = 'resultado_interacao_lead') then
    create type resultado_interacao_lead as enum
      ('FALOU', 'NAO_ATENDEU', 'AGENDOU', 'SEM_INTERESSE');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (B) O compromisso vigente mora no lead
-- ----------------------------------------------------------------------------
alter table leads
  add column if not exists proximo_contato_em   timestamptz,
  add column if not exists proximo_contato_nota text;

comment on column leads.proximo_contato_em is
  'Retorno combinado com o interessado. Alimenta a agenda de vendas.';

create index if not exists idx_leads_agenda
  on leads (proximo_contato_em)
  where proximo_contato_em is not null;

-- ----------------------------------------------------------------------------
-- (A) A trilha do contato
-- ----------------------------------------------------------------------------
create table if not exists lead_interacoes (
  id                 uuid primary key default gen_random_uuid(),
  lead_id            uuid not null references leads(id) on delete cascade,
  tipo               tipo_interacao_lead not null,
  resultado          resultado_interacao_lead not null default 'FALOU',
  observacao         text,
  -- copia do que foi combinado NESTE contato (o lead guarda so o vigente)
  proximo_contato_em timestamptz,
  usuario_id         uuid references usuarios(id) on delete set null,
  created_at         timestamptz not null default clock_timestamp()
);

create index if not exists idx_lead_interacoes_lead
  on lead_interacoes (lead_id, created_at desc);

alter table lead_interacoes enable row level security;

-- Quem enxerga o lead enxerga a trilha dele (a policy de `leads` e a fonte).
-- A escrita e so pela RPC: interacao e prova de trabalho, nao formulario livre.
drop policy if exists linter_select on lead_interacoes;
create policy linter_select on lead_interacoes for select to authenticated using (
  exists (select 1 from leads l where l.id = lead_id)
);

grant select on lead_interacoes to authenticated;

-- ----------------------------------------------------------------------------
-- (C) Helper: este usuario trata este lead?
--     Espelha exatamente o `using` da policy `leads_update` (0038) — assim a
--     RPC SECURITY DEFINER nao abre nada que a tabela nao abriria.
-- ----------------------------------------------------------------------------
create or replace function pode_tratar_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from leads l
     where l.id = p_lead_id
       and (tem_acesso_global()
            or pode_auditar()
            or l.consultor_id = auth.uid()
            or l.created_by = auth.uid()
            or exists (select 1 from vendedores v
                        where v.id = l.vendedor_id and v.usuario_id = auth.uid())
            or (pode_ver_carteira_regional() and pode_regional(l.regional_id)))
  );
$$;

-- ----------------------------------------------------------------------------
-- (C) Registrar contato + mover a agenda
-- ----------------------------------------------------------------------------
create or replace function registrar_interacao_lead(
  p_lead_id              uuid,
  p_tipo                 text,
  p_resultado            text        default 'FALOU',
  p_observacao           text        default null,
  p_proximo_contato_em   timestamptz default null,
  p_proximo_contato_nota text        default null,
  p_limpar_agenda        boolean     default false
)
returns leads
language plpgsql
security definer
set search_path = public
as $$
declare
  l   leads;
  tp  tipo_interacao_lead;
  res resultado_interacao_lead;
begin
  if not pode_tratar_lead(p_lead_id) then
    raise exception 'Sem permissao para tratar este lead';
  end if;

  begin
    tp  := upper(btrim(coalesce(p_tipo, '')))::tipo_interacao_lead;
    res := upper(btrim(coalesce(p_resultado, 'FALOU')))::resultado_interacao_lead;
  exception when invalid_text_representation then
    raise exception 'Tipo ou resultado de contato desconhecido';
  end;

  -- Agenda no passado nao e agenda; e esquecimento com data.
  if p_proximo_contato_em is not null and p_proximo_contato_em < now() - interval '5 minutes' then
    raise exception 'O proximo contato tem de ser uma data futura';
  end if;

  -- "Agendou" sem data combinada seria so uma anotacao otimista.
  if res = 'AGENDOU' and p_proximo_contato_em is null then
    raise exception 'Marque a data do retorno para registrar um agendamento';
  end if;

  if p_limpar_agenda and p_proximo_contato_em is not null then
    raise exception 'Ou limpa a agenda, ou marca um retorno — nao os dois';
  end if;

  insert into lead_interacoes (lead_id, tipo, resultado, observacao, proximo_contato_em, usuario_id)
  values (p_lead_id, tp, res, nullif(btrim(coalesce(p_observacao, '')), ''),
          p_proximo_contato_em, auth.uid());

  update leads
     set ultima_interacao_em = now(),
         proximo_contato_em = case
           when p_limpar_agenda then null
           when p_proximo_contato_em is not null then p_proximo_contato_em
           else proximo_contato_em end,
         proximo_contato_nota = case
           when p_limpar_agenda then null
           when p_proximo_contato_em is not null
             then nullif(btrim(coalesce(p_proximo_contato_nota, '')), '')
           else proximo_contato_nota end
   where id = p_lead_id
   returning * into l;

  return l;
end;
$$;

-- ----------------------------------------------------------------------------
-- (D) A lista de trabalho: o que venceu e o que vence hoje
-- ----------------------------------------------------------------------------
create or replace function agenda_vendas(
  p_ate          timestamptz default null,  -- null = ate o fim do dia de hoje
  p_consultor_id uuid        default null,
  p_limite       int         default 100
)
returns table (
  id                   uuid,
  nome                 text,
  celular              text,
  status               status_lead,
  marca                text,
  modelo               text,
  placa                text,
  consultor            text,
  proximo_contato_em   timestamptz,
  proximo_contato_nota text,
  ultima_interacao_em  timestamptz,
  dias_parado          int
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.nome, l.celular, l.status, l.marca, l.modelo, l.placa,
         u.nome, l.proximo_contato_em, l.proximo_contato_nota, l.ultima_interacao_em,
         greatest(0, (current_date - coalesce(l.ultima_interacao_em, l.created_at)::date))
    from leads l
    left join usuarios u on u.id = l.consultor_id
   where l.proximo_contato_em is not null
     and l.proximo_contato_em < coalesce(p_ate, date_trunc('day', now()) + interval '1 day')
     and l.status::text not in ('ATIVO', 'PERDIDO')
     and (p_consultor_id is null or l.consultor_id = p_consultor_id)
     and (tem_acesso_global() or pode_auditar()
          or l.consultor_id = auth.uid()
          or (l.regional_id is not null and l.regional_id = auth_regional_id()))
   order by l.proximo_contato_em
   limit coalesce(p_limite, 100);
$$;

-- ----------------------------------------------------------------------------
-- (E) Kanban: o card passa a mostrar ha quanto tempo o lead esta parado
--     (muda a lista de colunas devolvidas, entao recria de verdade)
-- ----------------------------------------------------------------------------
drop function if exists leads_kanban(uuid, uuid, int);

create or replace function leads_kanban(
  p_regional_id uuid default null,
  p_consultor_id uuid default null,
  p_limite int default 500
)
returns table (
  id                    uuid,
  nome                  text,
  celular               text,
  status                status_lead,
  marca                 text,
  modelo                text,
  placa                 text,
  valor_fipe            numeric,
  consultor             text,
  regional_id           uuid,
  cotacao_id            uuid,
  total_mensalidade     numeric,
  total_com_desconto    numeric,
  desconto_percentual   numeric,
  desconto_aprovado     boolean,
  atualizado_em         timestamptz,
  ultima_interacao_em   timestamptz,
  proximo_contato_em    timestamptz,
  dias_parado           int,
  limite_sem_contato    int
)
language sql stable
security definer
set search_path = public
as $$
  select l.id, l.nome, l.celular, l.status, l.marca, l.modelo, l.placa, l.valor_fipe,
         u.nome, l.regional_id,
         c.id, c.total_mensalidade, c.total_com_desconto, c.desconto_percentual,
         (c.desconto_aprovado_por is not null), l.updated_at,
         l.ultima_interacao_em, l.proximo_contato_em,
         greatest(0, (current_date - coalesce(l.ultima_interacao_em, l.created_at)::date)),
         coalesce(r.dias_sem_contato_lead, 7)::int
    from leads l
    left join usuarios u on u.id = l.consultor_id
    left join regionais r on r.id = l.regional_id
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
-- Permissoes
-- ----------------------------------------------------------------------------
grant execute on function pode_tratar_lead(uuid) to authenticated;
grant execute on function registrar_interacao_lead(uuid, text, text, text, timestamptz, text, boolean) to authenticated;
grant execute on function agenda_vendas(timestamptz, uuid, int) to authenticated;
grant execute on function leads_kanban(uuid, uuid, int) to authenticated;
