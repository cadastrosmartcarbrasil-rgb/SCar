-- ============================================================================
-- SCar :: 0046_vendas_duplicidade_aceite.sql
--
-- Duas lacunas da tela de vendas, as duas do mesmo tipo: a regra JA existia no
-- banco e nenhuma tela chamava.
--
--   (A) AVISO DE DUPLICIDADE NO CRM. `classificar_captura` (0041) decide o
--       destino de cada captura do hotlink — mas ela pede a regional como
--       PARAMETRO, e um parametro que a tela escolhe e um parametro que
--       qualquer um pode trocar: com o id de outra franquia, a funcao conta
--       quem sao os leads e os vendedores de la. Por isso a versao que a tela
--       usa e outra, SEM esse parametro: `classificar_captura_no_escopo`
--       resolve a unidade por `escopo_regional()` (0032), a mesma postura do
--       portal do vendedor (0038). Ela tambem devolve `pode_abrir`, para a
--       tela so oferecer o link do lead existente quando ele for mesmo
--       visivel para quem esta olhando.
--
--   (B) ACEITE PRESENCIAL, COM DONO. `registrar_aceite_venda` (0042/0043)
--       nasceu para a pagina publica, que roda com service_role e ja provou a
--       posse pelo `token_publico`. Mas ela e SECURITY DEFINER e esta
--       concedida a `authenticated` SEM checar quem chama: hoje qualquer
--       usuario logado — incluindo um ASSOCIADO do `/portal` — poderia
--       carimbar aceite em lead alheio, com nome e CPF inventados. Agora,
--       quando ha sessao (`auth.uid()` nao nulo), exige `pode_tratar_lead()`;
--       o caminho publico segue igual, porque la nao ha sessao.
--       So depois disso o CRM pode colher o aceite com o cliente na frente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Classificacao da captura sem parametro de regional
-- ----------------------------------------------------------------------------
create or replace function classificar_captura_no_escopo(
  p_celular  text default null,
  p_cpf_cnpj text default null,
  p_placa    text default null
)
returns table (
  tipo          text,
  lead_id       uuid,
  vendedor_nome text,
  detalhe       text,
  pode_abrir    boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_regional uuid;
  c          record;
begin
  if not is_staff() then
    raise exception 'Sem permissao';
  end if;

  -- Sem nada para procurar nao ha o que avisar (evita varrer a tabela a cada
  -- tecla enquanto o operador ainda esta digitando).
  if chave_contato(p_celular) is null
     and chave_contato(p_cpf_cnpj) is null
     and nullif(btrim(coalesce(p_placa, '')), '') is null then
    return;
  end if;

  -- admin/financeiro enxergam a casa toda; os demais, so a propria unidade.
  -- Staff sem regional cai no uuid-sentinela e nao encontra lead nenhum.
  v_regional := escopo_regional(null);

  for c in
    select * from classificar_captura(v_regional, p_celular, p_cpf_cnpj, p_placa)
  loop
    return query
      select c.tipo, c.lead_id, c.vendedor_nome, c.detalhe,
             coalesce(pode_tratar_lead(c.lead_id), false);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- (B) Aceite: quem tem sessao precisa ser dono do atendimento
--     (mesmo corpo do 0043; muda so a trava do inicio)
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

  -- A pagina publica roda com service_role (sem `auth.uid()`) e ja provou a
  -- posse pelo token. Com sessao, so quem trata o lead colhe o aceite dele.
  if auth.uid() is not null and not pode_tratar_lead(p_lead_id) then
    raise exception 'Sem permissao para registrar o aceite deste atendimento'
      using errcode = 'check_violation';
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
-- Permissoes
-- ----------------------------------------------------------------------------
grant execute on function classificar_captura_no_escopo(text, text, text) to authenticated;
grant execute on function registrar_aceite_venda(uuid, uuid, text, text, text, text, text) to authenticated;
