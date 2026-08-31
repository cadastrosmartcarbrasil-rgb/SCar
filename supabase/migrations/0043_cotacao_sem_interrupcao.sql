-- ============================================================================
-- SCar :: 0043_cotacao_sem_interrupcao.sql
-- A cotacao publica NAO para mais no meio, e o aceite NAO tranca o vendedor.
--
-- Dois erros de desenho do 0041/0042, corrigidos aqui:
--
-- (A) COTAR SEMPRE. A captura interrompia o atendimento em dois casos —
--     CARTEIRA (a pessoa ja e associada) e DUPLICADO (ja havia lead aberto) —
--     mandando o visitante esperar um humano. Isso joga fora a intencao de
--     compra no momento em que ela existe. Ser cliente da base ou ja estar em
--     atendimento e INFORMACAO para a equipe, nao motivo para travar a tela.
--     Agora os dois casos seguem para a cotacao; o que muda e o que a gente
--     REGISTRA e o que a equipe VE.
--     De quebra, quando a pessoa e da base o lead ja nasce com a ficha dela
--     (CPF/CNPJ, e-mail, endereco, tipo de pessoa) — e o que faz
--     `autorizar_entrada_lead` reaproveitar o associado em vez de duplicar.
--
-- (B) O ACEITE NAO PULA PARA A AUDITORIA. Ele levava o lead direto a
--     EM_AUDITORIA, e la `lead_em_negociacao()` e falso: a cotacao congela e o
--     vendedor nao consegue mais ajustar produto nenhum. Mas depois do "quero"
--     do cliente ainda falta trabalho de venda — acertar opcionais, completar
--     a ficha do associado, CRLV e vistoria. Entao o aceite passa a deixar o
--     lead em EM_NEGOCIACAO, marcado como aceito. Quem manda para a Auditoria
--     continua sendo a equipe, quando a ficha esta completa.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (0) Garantias de dependencia.
--
-- Este arquivo mexe em funcoes criadas no 0042. Se aquela migration nao tiver
-- rodado (ou tiver parado no meio), as colunas abaixo nao existiriam e o
-- hotlink quebraria em tempo de execucao — o corpo de uma funcao plpgsql so e
-- validado quando ela e CHAMADA. Como tudo aqui e `if not exists`, repetir nao
-- custa nada e o 0043 passa a funcionar sozinho.
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

-- ----------------------------------------------------------------------------
-- (B) O aceite marca o lead e o mantem trabalhavel
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
         -- EM_NEGOCIACAO, nao APROVADO: o cliente disse "quero", mas a venda
         -- ainda precisa do vendedor (opcionais, ficha do associado, CRLV e
         -- vistoria). Em EM_AUDITORIA a cotacao congelaria.
         status            = 'EM_NEGOCIACAO'
   where id = p_lead_id;

  insert into lead_atribuicoes (lead_id, vendedor_id, motivo, observacao)
  select p_lead_id, ld.vendedor_id, 'ACEITE_' || upper(p_por),
         'Aceite de ' || trim(p_nome) || ' em ' || to_char(now(), 'DD/MM/YYYY HH24:MI')
    from leads ld where ld.id = p_lead_id;

  select * into l from leads where id = p_lead_id;
  return l;
end;
$$;

-- ----------------------------------------------------------------------------
-- (A) A captura nunca mais interrompe a cotacao
--
-- O drop e obrigatorio: a versao instalada pode ser a do 0041, que devolve 4
-- colunas (sem `token_publico`). `create or replace` recusa qualquer mudanca
-- nas colunas de OUT com "cannot change return type of existing function".
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
  cli      clientes;
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

  -- ------------------------------------------------------------------
  -- DUPLICADO: continua no atendimento que JA existe (nao cria outro e
  -- nao troca o dono), e devolve o token dele para a cotacao seguir ali.
  -- ------------------------------------------------------------------
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
      'Ja temos um atendimento em andamento com '
        || coalesce(c.vendedor_nome, 'nossa equipe') || ' — vamos continuar por aqui.',
      (select l.token_publico from leads l where l.id = c.lead_id);
    return;
  end if;

  -- ------------------------------------------------------------------
  -- Dono do lead: o do link; sem vendedor no link, aplica a distribuicao.
  -- ------------------------------------------------------------------
  if c.tipo = 'REATIVACAO' then
    v_motivo := 'HOTLINK_REATIVACAO';
    v_obs := 'Retomado por ' || upper(p_codigo) || '; ' || c.detalhe;
  elsif c.tipo = 'CARTEIRA' then
    v_motivo := 'HOTLINK_CARTEIRA';
    v_obs := 'Captado por ' || upper(p_codigo) || '. ' || c.detalhe;
  else
    v_motivo := 'HOTLINK';
    v_obs := 'Captado por ' || upper(p_codigo);
  end if;

  v_vend := d.vendedor_id;
  if v_vend is null then
    if (select distribuicao from parametros_atribuicao(d.regional_id)) = 'RODIZIO' then
      v_vend := proximo_vendedor_rodizio(d.regional_id);
      if v_vend is not null then
        v_motivo := case when c.tipo = 'CARTEIRA' then v_motivo else 'RODIZIO' end;
        v_obs := v_obs || ' e distribuido pelo rodizio';
      end if;
    end if;
  end if;

  -- Quem ja e da base entra com a ficha PRONTA: e o que evita redigitar e o
  -- que faz `autorizar_entrada_lead` reaproveitar o associado (ele procura
  -- pelo CPF/CNPJ) em vez de criar um cadastro novo.
  if c.tipo = 'CARTEIRA' then
    select * into cli from clientes where id = c.cliente_id;
  end if;

  insert into leads (nome, celular, email, placa, cpf_cnpj, tipo_pessoa, rg_ie, endereco,
                     regional_id, vendedor_id, consultor_id, origem_hotlink, status,
                     carteira, cliente_carteira_id, cliente_existente_id,
                     atribuido_em, atribuicao_motivo, ultima_interacao_em, observacoes)
  values (trim(p_nome), trim(p_celular),
          coalesce(nullif(trim(coalesce(p_email, '')), ''), cli.email),
          upper(nullif(trim(coalesce(p_placa, '')), '')),
          coalesce(nullif(trim(coalesce(p_cpf_cnpj, '')), ''), cli.cpf_cnpj),
          cli.tipo_pessoa, cli.rg_ie, coalesce(cli.endereco, '{}'::jsonb),
          d.regional_id, v_vend, d.consultor_id, upper(p_codigo), 'NOVO',
          c.tipo = 'CARTEIRA', c.cliente_id, c.cliente_id,
          case when v_vend is null then null else now() end, v_motivo, now(), v_obs)
  returning id into v_id;

  insert into lead_atribuicoes (lead_id, vendedor_id, motivo, observacao)
  values (v_id, v_vend, v_motivo, v_obs);

  return query select v_id, c.tipo,
    coalesce((select nome from vendedores where id = v_vend), d.nome),
    case when c.tipo = 'CARTEIRA'
         then 'Que bom te ver de novo! Ja localizamos o seu cadastro — a cotacao continua normalmente.'
         else 'Recebemos o seu contato! Vamos montar a sua cotacao.' end,
    (select l.token_publico from leads l where l.id = v_id);
end;
$$;

/**
 * O que a pagina publica precisa saber para continuar (ou nao) o atendimento.
 * Substitui o antigo `lead_por_token_publico`, acrescentando o que ja se sabe
 * do veiculo e da carteira — a tela reaproveita em vez de perguntar de novo.
 */
drop function if exists lead_por_token_publico(uuid);

create or replace function lead_por_token_publico(p_token uuid)
returns table (
  lead_id       uuid,
  nome          text,
  celular       text,
  email         text,
  cpf_cnpj      text,
  placa         text,
  regional_id   uuid,
  tipo_veiculo_id uuid,
  valor_fipe    numeric,
  status        text,
  carteira      boolean,
  aceito        boolean,
  em_negociacao boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.nome, l.celular, l.email, l.cpf_cnpj, l.placa, l.regional_id,
         l.tipo_veiculo_id, l.valor_fipe, l.status::text,
         l.carteira, l.aceite_em is not null, lead_em_negociacao(l.id)
    from leads l
   where l.token_publico = p_token;
$$;

grant execute on function registrar_aceite_venda(uuid, uuid, text, text, text, text, text) to authenticated;
grant execute on function lead_por_token_publico(uuid) to authenticated;
