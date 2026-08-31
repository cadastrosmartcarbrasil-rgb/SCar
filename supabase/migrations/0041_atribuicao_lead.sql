-- ============================================================================
-- SCar :: 0041_atribuicao_lead.sql
-- REGRAS DE ATRIBUICAO DO LEAD (hotlink, duplicidade e devolucao ao pool).
--
-- O problema que este arquivo resolve
-- -----------------------------------
-- Ate aqui o hotlink fazia um INSERT cru: cada clique virava um lead novo
-- amarrado a quem tinha o link. Na pratica isso produz tres situacoes ruins:
--   1. o mesmo interessado preenche dois links e vira dois leads, com dois
--      vendedores achando que a venda e deles;
--   2. quem ja e ASSOCIADO preenche o formulario e entra como venda nova,
--      gerando comissao de adesao sobre um cliente que ja esta na casa;
--   3. lead captado e esquecido fica preso ao vendedor para sempre.
--
-- As regras (todas parametrizadas por franquia, nenhuma no codigo)
-- ----------------------------------------------------------------
--   . JANELA DE PROTECAO (`dias_protecao_lead`, padrao 30): dentro dela o lead
--     e de quem captou PRIMEIRO. Um segundo clique, mesmo em outro hotlink,
--     nao rouba o lead — ele so registra a nova passagem no historico.
--   . DEVOLUCAO POR INATIVIDADE (`dias_sem_contato_lead`, padrao 7): lead sem
--     interacao volta para o pool da unidade e pode ser redistribuido.
--   . DISTRIBUICAO (`distribuicao_lead`): MANUAL (o gestor escolhe) ou RODIZIO
--     (o proximo da fila, por ordem de ultima atribuicao). Vale para o lead que
--     chega pelo hotlink DA UNIDADE, que nasce sem vendedor.
--   . CARTEIRA: se o CPF/celular ja e de associado, a captura NAO vira venda
--     nova — nasce marcada como carteira, para o atendimento tratar.
--
-- Escolha registrada: **quem captou primeiro fica com o lead**. E a norma do
-- mercado e a unica que protege o trabalho de prospeccao; o contrario (ultimo
-- clique leva) premia quem manda link para a base do colega.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Parametros da franquia
-- ----------------------------------------------------------------------------
alter table regionais
  add column if not exists dias_protecao_lead    smallint not null default 30,
  add column if not exists dias_sem_contato_lead smallint not null default 7,
  add column if not exists distribuicao_lead     text     not null default 'MANUAL';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_regional_atribuicao') then
    alter table regionais add constraint chk_regional_atribuicao check (
      dias_protecao_lead between 0 and 365
      and dias_sem_contato_lead between 0 and 365
      and distribuicao_lead in ('MANUAL', 'RODIZIO')
    );
  end if;
end $$;

comment on column regionais.dias_protecao_lead is
  'Dias em que o lead pertence a quem captou. 0 = sem protecao (o ultimo leva).';
comment on column regionais.dias_sem_contato_lead is
  'Dias sem interacao ate o lead voltar ao pool da unidade. 0 = nunca volta.';

-- ----------------------------------------------------------------------------
-- (B) Rastro da atribuicao no lead
-- ----------------------------------------------------------------------------
alter table leads
  add column if not exists atribuido_em        timestamptz,
  add column if not exists atribuicao_motivo   text,
  add column if not exists ultima_interacao_em timestamptz,
  add column if not exists recapturas          smallint not null default 0,
  add column if not exists carteira            boolean not null default false,
  add column if not exists cliente_carteira_id uuid references clientes(id) on delete set null;

comment on column leads.recapturas is
  'Quantas vezes a MESMA pessoa voltou por um hotlink enquanto este lead vivia.';
comment on column leads.carteira is
  'A pessoa ja e associada: a captura nao e venda nova.';

create index if not exists idx_leads_atribuicao on leads (regional_id, vendedor_id, ultima_interacao_em);

-- Historico de quem foi dono do lead e por que.
create table if not exists lead_atribuicoes (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  vendedor_id uuid references vendedores(id) on delete set null,  -- nulo = pool
  motivo      text not null,
  observacao  text,
  created_by  uuid references usuarios(id) on delete set null,
  created_at  timestamptz not null default clock_timestamp()
);
create index if not exists idx_lead_atrib_lead on lead_atribuicoes (lead_id, created_at desc);

alter table lead_atribuicoes enable row level security;

drop policy if exists latrib_select on lead_atribuicoes;
drop policy if exists latrib_insert on lead_atribuicoes;
create policy latrib_select on lead_atribuicoes for select to authenticated using (
  exists (select 1 from leads l where l.id = lead_id)
);
create policy latrib_insert on lead_atribuicoes for insert to authenticated with check (
  exists (select 1 from leads l where l.id = lead_id)
);

grant select, insert on lead_atribuicoes to authenticated;

-- ----------------------------------------------------------------------------
-- (C) Helpers
-- ----------------------------------------------------------------------------

/** So os digitos: e como celular e CPF sao comparados entre lead e cadastro. */
create or replace function chave_contato(p_valor text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p_valor, ''), '[^0-9]', '', 'g'), '');
$$;

/** Os parametros de atribuicao da franquia (com o padrao quando nao ha regional). */
create or replace function parametros_atribuicao(p_regional_id uuid)
returns table (
  dias_protecao    smallint,
  dias_sem_contato smallint,
  distribuicao     text
)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(r.dias_protecao_lead, 30)::smallint,
         coalesce(r.dias_sem_contato_lead, 7)::smallint,
         coalesce(r.distribuicao_lead, 'MANUAL')
    from (select 1) x
    left join regionais r on r.id = p_regional_id;
$$;

/**
 * O lead ainda esta protegido para o vendedor que o captou?
 * Perdido ou ja convertido nao protege nada; sem vendedor tambem nao.
 * `dias_protecao = 0` desliga a regra (o ultimo clique passa a levar).
 */
create or replace function protecao_lead_ativa(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select l.vendedor_id is not null
       and l.status::text not in ('PERDIDO', 'ATIVO')
       and p.dias_protecao > 0
       and coalesce(l.ultima_interacao_em, l.atribuido_em, l.created_at)
             > now() - make_interval(days => p.dias_protecao)
      from leads l
      cross join lateral parametros_atribuicao(l.regional_id) p
     where l.id = p_lead_id
  ), false);
$$;

/** O lead ABERTO mais recente da mesma pessoa nesta unidade. */
create or replace function lead_da_pessoa(
  p_regional_id uuid,
  p_celular     text default null,
  p_cpf_cnpj    text default null,
  p_placa       text default null
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.id
    from leads l
   where (p_regional_id is null or l.regional_id = p_regional_id)
     and l.status::text <> 'ATIVO'
     and (
       (chave_contato(p_celular) is not null
         and chave_contato(l.celular) = chave_contato(p_celular))
       or (chave_contato(p_cpf_cnpj) is not null
         and chave_contato(l.cpf_cnpj) = chave_contato(p_cpf_cnpj))
       or (nullif(trim(p_placa), '') is not null
         and upper(l.placa) = upper(trim(p_placa)))
     )
   order by coalesce(l.ultima_interacao_em, l.created_at) desc
   limit 1;
$$;

/** Ja e associado? (a captura entao nao e venda nova) */
create or replace function cliente_da_pessoa(
  p_celular  text default null,
  p_cpf_cnpj text default null,
  p_placa    text default null
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
    from clientes c
   where c.status::text <> 'cancelado'
     and (
       (chave_contato(p_cpf_cnpj) is not null
         and chave_contato(c.cpf_cnpj) = chave_contato(p_cpf_cnpj))
       or (chave_contato(p_celular) is not null
         and chave_contato(c.telefone) = chave_contato(p_celular))
       or (nullif(trim(p_placa), '') is not null
         and exists (select 1 from veiculos v
                      where v.cliente_id = c.id
                        and upper(v.placa) = upper(trim(p_placa))
                        and v.status::text not in ('baixado', 'excluido')))
     )
   order by c.created_at
   limit 1;
$$;

/**
 * Classifica uma captura ANTES de gravar. E a mesma funcao que a tela usa para
 * avisar o operador e que o hotlink usa para decidir.
 *   CARTEIRA   -> ja e associado
 *   DUPLICADO  -> ha lead aberto e protegido de outro (ou do mesmo) vendedor
 *   REATIVACAO -> ha lead antigo, fora da protecao ou perdido: pode ser retomado
 *   NOVO       -> ninguem conhece esta pessoa
 */
create or replace function classificar_captura(
  p_regional_id uuid,
  p_celular     text default null,
  p_cpf_cnpj    text default null,
  p_placa       text default null
)
returns table (
  tipo         text,
  lead_id      uuid,
  vendedor_id  uuid,
  vendedor_nome text,
  cliente_id   uuid,
  detalhe      text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cli  uuid;
  v_lead leads;
  v_nome text;
begin
  v_cli := cliente_da_pessoa(p_celular, p_cpf_cnpj, p_placa);
  if v_cli is not null then
    return query
      select 'CARTEIRA', null::uuid, null::uuid, null::text, v_cli,
             'Ja e associado: ' || coalesce((select nome_razao_social from clientes where id = v_cli), '');
    return;
  end if;

  select * into v_lead from leads where id = lead_da_pessoa(p_regional_id, p_celular, p_cpf_cnpj, p_placa);
  if not found then
    return query select 'NOVO', null::uuid, null::uuid, null::text, null::uuid, 'Primeiro contato';
    return;
  end if;

  select coalesce(v.nome, 'sem vendedor') into v_nome
    from vendedores v where v.id = v_lead.vendedor_id;

  if protecao_lead_ativa(v_lead.id) then
    return query
      select 'DUPLICADO', v_lead.id, v_lead.vendedor_id, v_nome, null::uuid,
             'Lead aberto com ' || coalesce(v_nome, 'a unidade') || ' desde ' ||
             to_char(v_lead.created_at, 'DD/MM/YYYY');
  else
    return query
      select 'REATIVACAO', v_lead.id, v_lead.vendedor_id, v_nome, null::uuid,
             case when v_lead.status::text = 'PERDIDO'
                  then 'Lead perdido em ' || to_char(coalesce(v_lead.updated_at, v_lead.created_at), 'DD/MM/YYYY')
                  else 'Sem contato desde ' ||
                       to_char(coalesce(v_lead.ultima_interacao_em, v_lead.created_at), 'DD/MM/YYYY') end;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (D) Atribuir / devolver ao pool
-- ----------------------------------------------------------------------------
create or replace function atribuir_lead(
  p_lead_id     uuid,
  p_vendedor_id uuid,           -- nulo = devolve ao pool da unidade
  p_motivo      text,
  p_observacao  text default null
)
returns leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead leads;
  v_reg  uuid;
begin
  select * into v_lead from leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead nao encontrado' using errcode = 'check_violation';
  end if;

  if p_vendedor_id is not null then
    select regional_id into v_reg from vendedores where id = p_vendedor_id and ativo;
    if not found then
      raise exception 'Vendedor nao encontrado ou inativo' using errcode = 'check_violation';
    end if;
    if v_lead.regional_id is not null and v_reg is distinct from v_lead.regional_id then
      raise exception 'Este vendedor nao e da unidade do lead' using errcode = 'check_violation';
    end if;
  end if;

  update leads
     set vendedor_id       = p_vendedor_id,
         atribuido_em      = now(),
         atribuicao_motivo = upper(coalesce(p_motivo, 'MANUAL'))
   where id = p_lead_id;

  insert into lead_atribuicoes (lead_id, vendedor_id, motivo, observacao, created_by)
  values (p_lead_id, p_vendedor_id, upper(coalesce(p_motivo, 'MANUAL')), p_observacao, auth.uid());

  select * into v_lead from leads where id = p_lead_id;
  return v_lead;
end;
$$;

/**
 * Rodizio: o proximo da fila e o vendedor ativo que esta ha mais tempo sem
 * receber lead. Quem nunca recebeu vem primeiro.
 */
create or replace function proximo_vendedor_rodizio(p_regional_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select v.id
    from vendedores v
   where v.regional_id = p_regional_id
     and v.ativo
   order by (select max(l.atribuido_em) from leads l where l.vendedor_id = v.id)
              nulls first,
            v.nome
   limit 1;
$$;

/**
 * Devolve ao pool os leads parados alem da janela da unidade.
 * Nao mexe em lead perdido nem em lead que ja virou veiculo.
 */
create or replace function liberar_leads_sem_contato(p_regional_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  n int := 0;
begin
  for v_lead in
    select l.id, l.vendedor_id, p.dias_sem_contato
      from leads l
      cross join lateral parametros_atribuicao(l.regional_id) p
     where l.vendedor_id is not null
       and l.status::text not in ('PERDIDO', 'ATIVO', 'EM_AUDITORIA', 'APROVADO')
       and p.dias_sem_contato > 0
       and (p_regional_id is null or l.regional_id = p_regional_id)
       and coalesce(l.ultima_interacao_em, l.atribuido_em, l.created_at)
             < now() - make_interval(days => p.dias_sem_contato)
  loop
    perform atribuir_lead(v_lead.id, null, 'DEVOLVIDO_SEM_CONTATO',
      'Sem interacao ha mais de ' || v_lead.dias_sem_contato || ' dia(s)');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ----------------------------------------------------------------------------
-- (E) A captura pelo hotlink, com as regras aplicadas
-- ----------------------------------------------------------------------------
create or replace function registrar_captura_hotlink(
  p_codigo   text,
  p_nome     text,
  p_celular  text,
  p_email    text default null,
  p_placa    text default null,
  p_cpf_cnpj text default null
)
returns table (
  lead_id       uuid,
  tipo          text,
  vendedor_nome text,
  mensagem      text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  d        record;
  c        record;
  v_id     uuid;
  v_vend   uuid;
  v_motivo text;
  v_obs    text;
begin
  select * into d from resolver_hotlink(p_codigo);
  if not found then
    raise exception 'Este link de vendas nao esta ativo' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome' using errcode = 'check_violation';
  end if;
  if length(chave_contato(p_celular)) < 10 then
    raise exception 'Informe um celular valido com DDD' using errcode = 'check_violation';
  end if;

  select * into c from classificar_captura(d.regional_id, p_celular, p_cpf_cnpj, p_placa);

  -- 1) Ja e associado: registra, mas nao como venda nova.
  if c.tipo = 'CARTEIRA' then
    insert into leads (nome, celular, email, placa, cpf_cnpj, regional_id, vendedor_id,
                       consultor_id, origem_hotlink, status, carteira, cliente_carteira_id,
                       atribuido_em, atribuicao_motivo, ultima_interacao_em, observacoes)
    values (trim(p_nome), trim(p_celular), nullif(trim(coalesce(p_email, '')), ''),
            upper(nullif(trim(coalesce(p_placa, '')), '')), nullif(trim(coalesce(p_cpf_cnpj, '')), ''),
            d.regional_id, d.vendedor_id, d.consultor_id, upper(p_codigo), 'NOVO',
            true, c.cliente_id, now(), 'HOTLINK_CARTEIRA', now(),
            'Captado pelo hotlink ' || upper(p_codigo) || '. ATENCAO: ' || c.detalhe)
    returning id into v_id;

    insert into lead_atribuicoes (lead_id, vendedor_id, motivo, observacao)
    values (v_id, d.vendedor_id, 'HOTLINK_CARTEIRA', c.detalhe);

    return query select v_id, 'CARTEIRA', d.nome,
      'Voce ja e nosso associado — vamos falar com voce pelo atendimento.';
    return;
  end if;

  -- 2) Ja existe lead protegido: NAO cria outro. Registra a nova passagem no
  --    lead que ja existe e ele continua com quem captou primeiro.
  if c.tipo = 'DUPLICADO' then
    update leads
       set recapturas          = recapturas + 1,
           ultima_interacao_em = now(),
           email               = coalesce(email, nullif(trim(coalesce(p_email, '')), '')),
           placa               = coalesce(placa, upper(nullif(trim(coalesce(p_placa, '')), ''))),
           observacoes         = coalesce(observacoes || E'\n', '')
                                 || 'Voltou pelo hotlink ' || upper(p_codigo)
                                 || ' em ' || to_char(now(), 'DD/MM/YYYY HH24:MI') || '.'
     where id = c.lead_id;

    insert into lead_atribuicoes (lead_id, vendedor_id, motivo, observacao)
    values (c.lead_id, c.vendedor_id, 'RECAPTURA_PROTEGIDA',
            'Novo clique em ' || upper(p_codigo) || '; ' || c.detalhe);

    return query select c.lead_id, 'DUPLICADO', c.vendedor_nome,
      'Ja temos o seu contato — ' || coalesce(c.vendedor_nome, 'nossa equipe')
      || ' vai falar com voce.';
    return;
  end if;

  -- 3) Reativacao: o lead antigo perdeu a protecao, entao quem trouxe agora leva.
  if c.tipo = 'REATIVACAO' then
    v_motivo := 'HOTLINK_REATIVACAO';
    v_obs := 'Retomado por ' || upper(p_codigo) || '; ' || c.detalhe;
  else
    v_motivo := 'HOTLINK';
    v_obs := 'Captado por ' || upper(p_codigo);
  end if;

  -- Sem vendedor no link (hotlink da unidade): aplica a distribuicao.
  v_vend := d.vendedor_id;
  if v_vend is null then
    if (select distribuicao from parametros_atribuicao(d.regional_id)) = 'RODIZIO' then
      v_vend := proximo_vendedor_rodizio(d.regional_id);
      if v_vend is not null then
        v_motivo := 'RODIZIO';
        v_obs := v_obs || ' e distribuido pelo rodizio';
      end if;
    end if;
  end if;

  insert into leads (nome, celular, email, placa, cpf_cnpj, regional_id, vendedor_id,
                     consultor_id, origem_hotlink, status,
                     atribuido_em, atribuicao_motivo, ultima_interacao_em, observacoes)
  values (trim(p_nome), trim(p_celular), nullif(trim(coalesce(p_email, '')), ''),
          upper(nullif(trim(coalesce(p_placa, '')), '')), nullif(trim(coalesce(p_cpf_cnpj, '')), ''),
          d.regional_id, v_vend, d.consultor_id, upper(p_codigo), 'NOVO',
          case when v_vend is null then null else now() end, v_motivo, now(), v_obs)
  returning id into v_id;

  insert into lead_atribuicoes (lead_id, vendedor_id, motivo, observacao)
  values (v_id, v_vend, v_motivo, v_obs);

  return query select v_id, c.tipo, coalesce((select nome from vendedores where id = v_vend), d.nome),
    'Recebemos o seu contato! Em breve falamos com voce.';
end;
$$;

-- ----------------------------------------------------------------------------
-- (F) Toda mudanca de etapa conta como interacao (a protecao anda com o trabalho)
-- ----------------------------------------------------------------------------
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
    -- trabalhar o lead renova a protecao; parar de trabalhar e o que a derruba
    update leads set ultima_interacao_em = now() where id = new.id;
  end if;
  return new;
end;
$$;

/** Marca contato com o lead sem mudar a etapa (ligou, mandou WhatsApp). */
create or replace function registrar_contato_lead(p_lead_id uuid, p_obs text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update leads set ultima_interacao_em = now() where id = p_lead_id;
  if coalesce(trim(p_obs), '') <> '' then
    insert into lead_atribuicoes (lead_id, vendedor_id, motivo, observacao, created_by)
    select p_lead_id, l.vendedor_id, 'CONTATO', trim(p_obs), auth.uid()
      from leads l where l.id = p_lead_id;
  end if;
end;
$$;

-- Leads sem dono na unidade (o pool que o gestor distribui).
create or replace function leads_sem_vendedor(p_regional_id uuid default null)
returns table (
  id            uuid,
  nome          text,
  celular       text,
  placa         text,
  status        text,
  origem_hotlink text,
  carteira      boolean,
  parado_dias   integer,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with reg as (select escopo_regional(p_regional_id) as id)
  select l.id, l.nome, l.celular, l.placa, l.status::text, l.origem_hotlink, l.carteira,
         greatest(0, extract(day from now() - coalesce(l.ultima_interacao_em, l.created_at))::int),
         l.created_at
    from leads l
   where l.regional_id = (select id from reg)
     and l.vendedor_id is null
     and l.status::text not in ('ATIVO', 'PERDIDO')
   order by l.created_at;
$$;

grant execute on function chave_contato(text) to authenticated, anon;
grant execute on function parametros_atribuicao(uuid) to authenticated;
grant execute on function protecao_lead_ativa(uuid) to authenticated;
grant execute on function lead_da_pessoa(uuid, text, text, text) to authenticated;
grant execute on function cliente_da_pessoa(text, text, text) to authenticated;
grant execute on function classificar_captura(uuid, text, text, text) to authenticated;
grant execute on function atribuir_lead(uuid, uuid, text, text) to authenticated;
grant execute on function proximo_vendedor_rodizio(uuid) to authenticated;
grant execute on function liberar_leads_sem_contato(uuid) to authenticated;
grant execute on function registrar_contato_lead(uuid, text) to authenticated;
grant execute on function leads_sem_vendedor(uuid) to authenticated;
