-- ============================================================================
-- SCar :: 0042_aceite_venda.sql
-- ACEITE DA PROPOSTA na pagina publica do hotlink.
--
-- O hotlink parava na captura: o visitante deixava o contato e alguem ligava
-- depois. Agora a mesma pagina cota e fecha — e o ACEITE e o que empurra o lead
-- para a esteira de aprovacao (o trigger `fn_lead_aprovacao` de 0017 leva
-- APROVADO -> EM_AUDITORIA; a Auditoria efetiva com `autorizar_entrada_lead`,
-- e o 0025 gera a primeira cobranca quando o veiculo entra ativo).
--
-- (A) `leads.token_publico` — capacidade para as chamadas publicas seguintes.
--     Sem ele, cotar/contratar receberiam um `lead_id` adivinhavel e qualquer
--     um poderia pendurar proposta no lead de outra pessoa. O token sai do
--     `registrar_captura_hotlink` (por isso ela e recriada aqui) e nunca
--     aparece em listagem interna.
-- (B) Colunas do aceite: quem aceitou (o proprio cliente ou o vendedor
--     presencialmente), nome, documento, data/hora, IP e user-agent. E a prova
--     do consentimento — por isso guarda tambem QUAL cotacao foi aceita.
-- (C) `registrar_aceite_venda(...)`: valida, grava e move o lead. Recusa
--     aceite repetido e lead que ja saiu da fase de venda.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) + (B) Colunas
-- ----------------------------------------------------------------------------
alter table leads
  add column if not exists token_publico     uuid not null default gen_random_uuid(),
  add column if not exists aceite_em         timestamptz,
  add column if not exists aceite_por        text,
  add column if not exists aceite_nome       text,
  add column if not exists aceite_documento  text,
  add column if not exists aceite_ip         text,
  add column if not exists aceite_user_agent text,
  add column if not exists aceite_cotacao_id uuid references cotacoes(id) on delete set null;

create unique index if not exists uq_leads_token_publico on leads (token_publico);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_lead_aceite_por') then
    alter table leads add constraint chk_lead_aceite_por
      check (aceite_por is null or aceite_por in ('CLIENTE', 'VENDEDOR'));
  end if;
end $$;

comment on column leads.token_publico is
  'Capacidade das chamadas publicas do hotlink (cotar/contratar). Nao expor em tela interna.';
comment on column leads.aceite_por is
  'CLIENTE (aceitou no proprio celular) ou VENDEDOR (aceite presencial, na frente do cliente).';

-- ----------------------------------------------------------------------------
-- (C) O aceite
-- ----------------------------------------------------------------------------
create or replace function registrar_aceite_venda(
  p_lead_id    uuid,
  p_cotacao_id uuid,
  p_por        text,
  p_nome       text,
  p_documento  text,
  p_ip         text default null,
  p_user_agent text default null
)
returns leads
language plpgsql
security definer
set search_path = public
as $$
declare
  l      leads;
  v_doc  text := regexp_replace(coalesce(p_documento, ''), '[^0-9]', '', 'g');
  v_tipo tipo_pessoa;
begin
  select * into l from leads where id = p_lead_id for update;
  if not found then
    raise exception 'Proposta nao encontrada' using errcode = 'check_violation';
  end if;
  if l.aceite_em is not null then
    raise exception 'Esta proposta ja foi aceita em %',
      to_char(l.aceite_em, 'DD/MM/YYYY HH24:MI') using errcode = 'check_violation';
  end if;
  if not lead_em_negociacao(p_lead_id) then
    raise exception 'Esta proposta ja saiu da fase de venda' using errcode = 'check_violation';
  end if;
  if upper(coalesce(p_por, '')) not in ('CLIENTE', 'VENDEDOR') then
    raise exception 'Informe quem esta aceitando' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_nome), '') = '' or position(' ' in trim(p_nome)) = 0 then
    raise exception 'Informe o nome completo de quem aceita' using errcode = 'check_violation';
  end if;

  v_tipo := (case when length(v_doc) > 11 then 'PJ' else 'PF' end)::tipo_pessoa;
  if not validar_documento(v_doc, v_tipo) then
    raise exception 'CPF/CNPJ invalido' using errcode = 'check_violation';
  end if;

  if p_cotacao_id is not null
     and not exists (select 1 from cotacoes c where c.id = p_cotacao_id and c.lead_id = p_lead_id) then
    raise exception 'A proposta nao pertence a este atendimento' using errcode = 'check_violation';
  end if;

  update leads
     set aceite_em         = now(),
         aceite_por        = upper(p_por),
         aceite_nome       = trim(p_nome),
         aceite_documento  = v_doc,
         aceite_ip         = nullif(trim(coalesce(p_ip, '')), ''),
         aceite_user_agent = nullif(trim(coalesce(p_user_agent, '')), ''),
         aceite_cotacao_id = p_cotacao_id,
         cpf_cnpj          = coalesce(nullif(trim(coalesce(cpf_cnpj, '')), ''), v_doc),
         tipo_pessoa       = coalesce(tipo_pessoa, v_tipo),
         plano_id          = coalesce(plano_id, (select plano_id from cotacoes where id = p_cotacao_id)),
         ultima_interacao_em = now(),
         -- o trigger fn_lead_aprovacao (0017) transforma isto em EM_AUDITORIA
         status            = 'APROVADO'
   where id = p_lead_id;

  -- `l` e a variavel plpgsql; o alias da tabela precisa ser outro (senao
  -- "column reference l.vendedor_id is ambiguous" — mesma pegadinha do 0034).
  insert into lead_atribuicoes (lead_id, vendedor_id, motivo, observacao)
  select p_lead_id, ld.vendedor_id, 'ACEITE_' || upper(p_por),
         'Aceite de ' || trim(p_nome) || ' em ' || to_char(now(), 'DD/MM/YYYY HH24:MI')
    from leads ld where ld.id = p_lead_id;

  select * into l from leads where id = p_lead_id;
  return l;
end;
$$;

-- ----------------------------------------------------------------------------
-- A captura passa a devolver o token da sessao publica.
-- (drop + create: mudar coluna de OUT muda a assinatura)
-- ----------------------------------------------------------------------------
drop function if exists registrar_captura_hotlink(text, text, text, text, text, text);

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
  mensagem      text,
  token_publico uuid
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
      'Voce ja e nosso associado — vamos falar com voce pelo atendimento.',
      (select l.token_publico from leads l where l.id = v_id);
    return;
  end if;

  -- 2) Ja existe lead protegido: NAO cria outro.
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
      || ' vai falar com voce.',
      (select l.token_publico from leads l where l.id = c.lead_id);
    return;
  end if;

  -- 3) Reativacao: o lead antigo perdeu a protecao.
  if c.tipo = 'REATIVACAO' then
    v_motivo := 'HOTLINK_REATIVACAO';
    v_obs := 'Retomado por ' || upper(p_codigo) || '; ' || c.detalhe;
  else
    v_motivo := 'HOTLINK';
    v_obs := 'Captado por ' || upper(p_codigo);
  end if;

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
    'Recebemos o seu contato! Em breve falamos com voce.',
    (select l.token_publico from leads l where l.id = v_id);
end;
$$;

/**
 * Lead pelo token da sessao publica. E o unico caminho pelo qual as rotas
 * publicas do hotlink acham o atendimento — nunca por id adivinhavel.
 */
create or replace function lead_por_token_publico(p_token uuid)
returns table (
  lead_id     uuid,
  nome        text,
  celular     text,
  email       text,
  placa       text,
  regional_id uuid,
  status      text,
  carteira    boolean,
  aceito      boolean,
  em_negociacao boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.nome, l.celular, l.email, l.placa, l.regional_id, l.status::text,
         l.carteira, l.aceite_em is not null, lead_em_negociacao(l.id)
    from leads l
   where l.token_publico = p_token;
$$;

grant execute on function registrar_aceite_venda(uuid, uuid, text, text, text, text, text) to authenticated;
grant execute on function lead_por_token_publico(uuid) to authenticated;
