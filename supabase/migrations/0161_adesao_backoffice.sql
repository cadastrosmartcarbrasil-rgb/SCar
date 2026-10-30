-- =====================================================================
-- 0161 — A ROTINA DA NOVA ADESAO, revista com o usuario (30/10/2026)
-- =====================================================================
-- Decisoes do usuario:
--   1. A esteira perde "Cotacao criada" e ganha "AGUARDANDO VISTORIA":
--      Novo -> Proposta enviada -> Em negociacao -> Aguardando vistoria ->
--      Aprovado/Em auditoria -> Ativo (+ Perdido).
--      Lead que ganha cotacao vai DIRETO para Proposta enviada.
--   2. O consultor faz o basico (placa, nome, contato, endereco) e o aceite;
--      o aceite (ou o botao "Cotacao aprovada") leva para Aguardando
--      vistoria, e dali o BACK-OFFICE completa a ficha e manda a Auditoria
--      quando o checklist fecha 100%. O auditor corrige e aprova; reprovado
--      fica parado onde esta.
--   3. A adesao fica (quase sempre) com o consultor: a forma de recebimento
--      NAO trava o processo — sem ela vale "recebida pelo consultor".
--      Renavam e data de nascimento tambem deixam de travar.
--   4. Cobertura em ate 24 horas da entrada na base: CARENCIA de 24h. A 24h
--      recusa (com liberacao de superior) e evento ocorrido antes e recusado.
--   5. Pro-rata POS-PAGO no 1o boleto do carne: ele cobra so os dias usados
--      desde a ativacao (coerente com o cancelamento, 0144).
--   6. Na ativacao: pedido de instalacao do rastreador (protocolo) quando a
--      cotacao cobra rastreador. Boas-vindas por e-mail/WhatsApp sao da tela.
--
-- (A) enum + backfill            (F) liberar_leads_sem_contato sem a vistoria
-- (B) cotacao nova -> proposta   (G) carencia de 24h (coluna + 24h + evento)
-- (C) mover_lead_status          (H) autorizar_entrada_lead (carencia, adesao
-- (D) registrar_aceite_venda         padrao, pedido do rastreador)
-- (E) checklist_lead             (I) gerar_carne_veiculo com o pro-rata
-- =====================================================================

-- (A) ---------------------------------------------------------------------
alter type status_lead add value if not exists 'AGUARDANDO_VISTORIA';

-- "Cotacao criada" sai da esteira: quem estava la ja tem cotacao.
update leads set status = 'PROPOSTA_ENVIADA', updated_at = now()
 where status::text = 'ORCAMENTO_GERADO';

-- A adesao recebida pelo consultor e o padrao (decisao do usuario).
alter table leads alter column adesao_forma set default 'VENDEDOR_NA_HORA';
update leads set adesao_forma = 'VENDEDOR_NA_HORA'
 where adesao_forma is null and status::text not in ('ATIVO', 'PERDIDO');

-- (B) ---------------------------------------------------------------------
-- Toda cotacao nova (CRM, portal do vendedor, hotlink) leva o lead de Novo
-- para Proposta enviada. Um ponto so: antes era a TELA que fazia isso.
create or replace function fn_cotacao_lead_proposta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update leads set status = 'PROPOSTA_ENVIADA', updated_at = now()
   where id = new.lead_id and status::text in ('NOVO', 'ORCAMENTO_GERADO');
  return new;
end;
$$;

drop trigger if exists trg_cotacao_lead_proposta on cotacoes;
create trigger trg_cotacao_lead_proposta
  after insert on cotacoes
  for each row execute function fn_cotacao_lead_proposta();

-- (C) ---------------------------------------------------------------------
-- O funil. Agora com:
--   . quem pode: quem trata o lead (antes bastava ser staff — um atendente de
--     outra unidade movia o lead pela RPC);
--   . AGUARDANDO_VISTORIA exige cotacao e ja deixa o link da vistoria pronto;
--   . APROVADO (mandar a Auditoria) exige o checklist 100%.
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
  l          leads;
  v_pendente text;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  select * into l from leads where id = p_lead_id;
  if l.id is null then raise exception 'Lead nao encontrado'; end if;
  if not pode_tratar_lead(p_lead_id) then
    raise exception 'Sem permissao para mover este atendimento' using errcode = 'check_violation';
  end if;

  if p_status not in ('NOVO','PROPOSTA_ENVIADA','EM_NEGOCIACAO','AGUARDANDO_VISTORIA','APROVADO','PERDIDO') then
    raise exception 'Status invalido para movimentacao no funil: %', p_status;
  end if;
  if l.status::text in ('EM_AUDITORIA','ATIVO') then
    raise exception 'Lead em auditoria/ativo nao volta pelo funil — trate pela Auditoria';
  end if;
  if p_status = 'PERDIDO' and (p_obs is null or btrim(p_obs) = '') then
    raise exception 'Informe o motivo da perda';
  end if;
  if p_status in ('AGUARDANDO_VISTORIA', 'APROVADO')
     and not exists (select 1 from cotacoes c where c.lead_id = p_lead_id) then
    raise exception 'Gere a cotacao antes de aprovar a venda' using errcode = 'check_violation';
  end if;
  if p_status = 'APROVADO' then
    select string_agg(item, '; ') into v_pendente from checklist_lead(p_lead_id) where not ok;
    if v_pendente is not null then
      raise exception 'A Auditoria so recebe a ficha completa - falta: %', v_pendente
        using errcode = 'check_violation';
    end if;
  end if;

  perform set_config('scar.obs_lead', coalesce(p_obs, ''), true);

  update leads
     set status = p_status::status_lead,
         perdido_motivo = case when p_status = 'PERDIDO' then p_obs else perdido_motivo end,
         ultima_interacao_em = case when p_status = 'AGUARDANDO_VISTORIA' then now() else ultima_interacao_em end,
         updated_at = now()
   where id = p_lead_id
   returning * into l;

  perform set_config('scar.obs_lead', '', true);

  -- O link da vistoria fica pronto para o back-office mandar.
  if p_status = 'AGUARDANDO_VISTORIA' then
    begin
      perform gerar_link_vistoria(p_lead_id);
    exception when others then
      null; -- vistoria ja completa ou outro motivo: o link se gera na ficha
    end;
  end if;

  return l;
end;
$$;

-- (D) ---------------------------------------------------------------------
-- O aceite (do cliente ou presencial) leva para AGUARDANDO VISTORIA: o
-- cliente disse "quero" e o back-office assume. A cotacao continua editavel
-- (lead_em_negociacao so congela em APROVADO/EM_AUDITORIA/ATIVO).
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
         -- 0161: o aceite entrega a venda ao back-office.
         status            = 'AGUARDANDO_VISTORIA'
   where id = p_lead_id;

  insert into lead_atribuicoes (lead_id, vendedor_id, motivo, observacao)
  select p_lead_id, ld.vendedor_id, 'ACEITE_' || upper(p_por),
         'Aceite de ' || trim(p_nome) || ' em ' || to_char(now(), 'DD/MM/YYYY HH24:MI')
    from leads ld where ld.id = p_lead_id;

  select * into l from leads where id = p_lead_id;
  return l;
end;
$$;

-- (E) ---------------------------------------------------------------------
-- O checklist da entrada na base. Mudam (decisao do usuario):
--   . Renavam e data de nascimento viram OPCIONAIS (aparecem, nao travam);
--   . a forma da adesao nao trava: sem ela vale "recebida pelo consultor".
-- O resto (inclusive o E-MAIL, sem o qual nao ha boas-vindas nem portal)
-- continua obrigatorio.
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

  return query select 'Vistoria registrada', 'Documentos',
    (v_vist > 0), (v_vist || ' vistoria(s)')::text;

  return query select 'Fotos obrigatorias da vistoria', 'Documentos',
    (v_obrig > 0 and v_fotos >= v_obrig),
    (v_fotos || ' de ' || v_obrig || ' foto(s) obrigatoria(s)')::text;

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

-- (F) ---------------------------------------------------------------------
-- O lead em Aguardando vistoria e do back-office: nao volta ao pool por falta
-- de contato do vendedor.
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
  if not (is_staff() or auth.uid() is null) then
    raise exception 'Sem permissao para esta consulta';
  end if;
  for v_lead in
    select l.id, l.vendedor_id, p.dias_sem_contato
      from leads l
      cross join lateral parametros_atribuicao(l.regional_id) p
     where l.vendedor_id is not null
       and l.status::text not in ('PERDIDO', 'ATIVO', 'EM_AUDITORIA', 'APROVADO', 'AGUARDANDO_VISTORIA')
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

-- (G) ---------------------------------------------------------------------
-- CARENCIA DE 24 HORAS. Nulo = sem carencia (toda a base que ja existe e a
-- carteira migrada do Mutual). Preenchida so pela entrada via venda.
alter table veiculos add column if not exists cobertura_desde timestamptz;
comment on column veiculos.cobertura_desde is
  'Inicio da cobertura (0161): entrada na base pela venda + 24h. Antes disso a 24h exige liberacao de superior e evento nao e aceito. Nulo = sem carencia.';

create or replace function situacao_assistencia_veiculo(p_veiculo_id uuid)
returns table (
  veiculo_id        uuid,
  placa             text,
  cliente_id        uuid,
  associado         text,
  status_veiculo    status_veiculo,
  veiculo_ativo     boolean,
  inadimplente      boolean,
  titulos_vencidos  integer,
  valor_em_atraso   numeric,
  pendencia_cadastral boolean,
  alertas_ativos    integer,
  pode_acionar      boolean,
  motivos           text[]
)
language plpgsql stable
as $$
declare
  v        veiculos;
  cli      clientes;
  v_venc   integer := 0;
  v_valor  numeric := 0;
  v_alert  integer := 0;
  v_mot    text[] := '{}';
  v_dias   integer;
begin
  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then return; end if;
  select * into cli from clientes where id = v.cliente_id;

  select x.boletos, x.valor into v_venc, v_valor
    from vencidos_veiculo(v.id, dias_bloqueio_inadimplencia()) x;

  select count(*)::int into v_alert
    from veiculo_alertas al where al.veiculo_id = v.id and al.ativo;

  if v.status::text = 'inadimplente' then
    v_dias := dias_no_status_veiculo(v.id);
    v_mot := v_mot || format(
      'Veiculo INADIMPLENTE ha %s dia(s) — beneficios bloqueados ate a regularizacao (inativa em %s dia(s))',
      v_dias, greatest(0, tolerancia_inadimplencia() - v_dias));
  elsif v.status::text <> 'ativo' then
    v_mot := v_mot || format('Veiculo com status %s (necessario ATIVO)', v.status);
  end if;
  if v_venc > 0 then
    v_mot := v_mot || format('%s boleto(s) em atraso — %s (bloqueio a partir de %s dia(s) de vencido)',
                             v_venc, to_char(v_valor, 'FM999G999D00'), dias_bloqueio_inadimplencia());
  end if;
  if cli.status::text = 'inadimplente' then
    v_mot := v_mot || 'Associado marcado como inadimplente';
  end if;
  if v_alert > 0 then
    v_mot := v_mot || format('%s alerta(s) cadastral(is) ativo(s)', v_alert);
  end if;
  -- 0161: carencia de 24h da entrada na base.
  if v.cobertura_desde is not null and v.cobertura_desde > now() then
    v_mot := v_mot || format('Carencia: cobertura a partir de %s (24h da entrada na base)',
                             to_char(v.cobertura_desde at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'));
  end if;

  veiculo_id := v.id;
  placa := v.placa;
  cliente_id := v.cliente_id;
  associado := cli.nome_razao_social;
  status_veiculo := v.status;
  veiculo_ativo := (v.status::text = 'ativo');
  inadimplente := (v_venc > 0 or cli.status::text = 'inadimplente' or v.status::text = 'inadimplente');
  titulos_vencidos := v_venc;
  valor_em_atraso := round(v_valor, 2);
  pendencia_cadastral := (v_alert > 0);
  alertas_ativos := v_alert;
  pode_acionar := (array_length(v_mot, 1) is null);
  motivos := v_mot;
  return next;
end;
$$;

-- Evento ocorrido antes do inicio da cobertura nao tem cobertura. No PROPRIO
-- dia do inicio a hora decide, e a data do evento nao tem hora: so a matriz
-- registra (conferindo a hora).
create or replace function fn_evento_carencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ini timestamptz;
  v_dia date;
  v_p   text;
begin
  select cobertura_desde, placa into v_ini, v_p from veiculos where id = new.veiculo_id;
  if v_ini is null then return new; end if;
  v_dia := (v_ini at time zone 'America/Sao_Paulo')::date;
  if new.data_ocorrencia < v_dia
     or (new.data_ocorrencia = v_dia and not tem_acesso_global()) then
    raise exception 'O veiculo % so tem cobertura a partir de % (carencia de 24h da entrada na base): evento ocorrido antes disso nao tem cobertura.',
      coalesce(v_p, ''), to_char(v_ini at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_evento_carencia on eventos_sinistro;
create trigger trg_evento_carencia
  before insert or update of veiculo_id, data_ocorrencia on eventos_sinistro
  for each row execute function fn_evento_carencia();

-- (H) ---------------------------------------------------------------------
-- A autorizacao da entrada. Corpo da 0158 (Assistencia Profissional, com a
-- conta da adesao corrigida para 3.1.1.03 — a 0152 recodificou 1.1.01) e:
--   . adesao sem forma = recebida pelo consultor;
--   . carencia: cobertura_desde = agora + 24h;
--   . pedido de instalacao do rastreador (protocolo sem responsavel, na fila
--     da unidade) quando a cotacao aceita cobra rastreador ou o plano exige.
create or replace function autorizar_entrada_lead(
  p_lead_id           uuid,
  p_cpf_cnpj          text default null,
  p_dia_vencimento    int  default null,
  p_vencimento_adesao date default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_adic      numeric := 0;
  v_reg_preco uuid;
  l           leads;
  v_doc       text;
  v_tipo      tipo_pessoa;
  v_cliente   uuid;
  v_veiculo   uuid;
  v_pendente  text;
  v_vend      vendedores;
  v_comissao  numeric := 0;
  v_lanc      uuid;
  v_cat       uuid;
  v_adesao    numeric;
  v_hoje      date := (now() at time zone 'America/Sao_Paulo')::date;
  v_venc_ad   date;
  v_forma     text;
  v_cot       uuid;
  v_rastr     boolean;
  v_atend     uuid;
  v_ap        numeric := 0;
begin
  if not pode_auditar() then
    raise exception 'Sem permissao: apenas a Auditoria pode autorizar a entrada na base';
  end if;
  if p_dia_vencimento is not null and (p_dia_vencimento < 1 or p_dia_vencimento > 31) then
    raise exception 'Dia de vencimento invalido (1 a 31)' using errcode = 'check_violation';
  end if;

  select * into l from leads where id = p_lead_id for update;
  if not found then raise exception 'Lead nao encontrado'; end if;
  if l.status <> 'EM_AUDITORIA' then
    raise exception 'Lead nao esta Em Auditoria (status atual: %)', l.status;
  end if;
  if l.veiculo_id is not null then raise exception 'Lead ja foi convertido'; end if;

  if p_cpf_cnpj is not null then
    update leads set cpf_cnpj = regexp_replace(p_cpf_cnpj, '[^0-9]', '', 'g')
     where id = p_lead_id;
    select * into l from leads where id = p_lead_id;
  end if;

  v_adesao := lead_adesao_tabela(p_lead_id);
  if v_adesao is null then
    raise exception 'Adesao sem valor de tabela: gere a cotacao do veiculo antes de autorizar'
      using errcode = 'check_violation';
  end if;
  if l.adesao_valor is distinct from v_adesao then
    update leads set adesao_valor = v_adesao where id = p_lead_id;
    select * into l from leads where id = p_lead_id;
  end if;

  select string_agg(item, '; ') into v_pendente
    from checklist_lead(p_lead_id) where not ok;
  if v_pendente is not null then
    raise exception 'Cadastro incompleto - falta: %', v_pendente
      using errcode = 'check_violation';
  end if;

  v_doc   := regexp_replace(coalesce(l.cpf_cnpj, ''), '[^0-9]', '', 'g');
  v_tipo  := coalesce(l.tipo_pessoa, (case when length(v_doc) > 11 then 'PJ' else 'PF' end)::tipo_pessoa);
  v_forma := coalesce(l.adesao_forma::text, 'VENDEDOR_NA_HORA');

  select id into v_cliente from clientes where cpf_cnpj = v_doc;
  if v_cliente is null then
    insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, rg_ie, email, telefone,
                          endereco, regional_id)
    values (v_tipo, l.nome, v_doc, l.rg_ie, l.email, l.celular, l.endereco, l.regional_id)
    returning id into v_cliente;
  else
    update clientes set
      nome_razao_social = coalesce(nullif(l.nome, ''), nome_razao_social),
      rg_ie             = coalesce(nullif(l.rg_ie, ''), rg_ie),
      email             = coalesce(nullif(l.email, ''), email),
      telefone          = coalesce(nullif(l.celular, ''), telefone),
      endereco          = case when l.endereco = '{}'::jsonb then endereco else l.endereco end
    where id = v_cliente;
  end if;

  -- 0158: a ASSISTENCIA PROFISSIONAL sai da MESMA cotacao.
  select c.id, coalesce(c.valor_adicional_regional, 0), c.regional_id,
         coalesce(c.valor_assistencia_profissional, 0)
    into v_cot, v_adic, v_reg_preco, v_ap
    from cotacoes c
   where c.lead_id = p_lead_id
   order by (c.id = l.aceite_cotacao_id) desc, c.created_at desc
   limit 1;

  insert into veiculos (cliente_id, placa, chassi, renavam, numero_motor, marca, modelo,
                        ano_fabricacao, ano_modelo, cor, valor_fipe, codigo_fipe, combustivel, uso,
                        tipo_veiculo_id, cota_participacao_id, modelo_id, regional_id,
                        vendedor_id, plano_protecao_id, status,
                        valor_adicional_regional, regional_preco_id, dia_vencimento,
                        valor_assistencia_profissional, cobertura_desde)
  values (v_cliente, upper(l.placa),
          nullif(upper(regexp_replace(coalesce(l.chassi, ''), '[^0-9A-Za-z]', '', 'g')), ''),
          nullif(regexp_replace(coalesce(l.renavam, ''), '[^0-9]', '', 'g'), ''),
          nullif(upper(btrim(coalesce(l.numero_motor, ''))), ''),
          l.marca, l.modelo, l.ano_fabricacao, l.ano_modelo, l.cor, l.valor_fipe, l.codigo_fipe,
          l.combustivel, l.uso, l.tipo_veiculo_id, l.cota_participacao_id, l.modelo_id,
          l.regional_id, l.vendedor_id, l.plano_id, 'ativo',
          coalesce(v_adic, 0), v_reg_preco, p_dia_vencimento::smallint,
          coalesce(v_ap, 0), now() + interval '24 hours')
  returning id into v_veiculo;

  update vistorias set veiculo_id = v_veiculo, status = 'APROVADA'
   where lead_id = p_lead_id and veiculo_id is null;

  -- ---------------------------------------------------------------- adesao
  select * into v_vend from vendedores where id = l.vendedor_id;
  v_comissao := round(coalesce(l.adesao_valor, 0) * coalesce(v_vend.taxa_comissao_adesao, 0), 2);

  if v_forma = 'VENDEDOR_NA_HORA' then
    insert into comissoes_vendas (vendedor_id, veiculo_id, valor_comissao, is_adesao, status_pagamento)
    values (l.vendedor_id, v_veiculo, coalesce(l.adesao_valor, 0), true, 'pago');

  elsif v_forma in ('BOLETO', 'PIX') and coalesce(l.adesao_valor, 0) > 0 then
    v_venc_ad := coalesce(p_vencimento_adesao, v_hoje + 3);
    if v_venc_ad < v_hoje then
      raise exception 'O vencimento do boleto da adesao nao pode ser no passado'
        using errcode = 'check_violation';
    end if;
    insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status,
                                     adesao_lead_id, observacao)
    values (v_cliente, v_veiculo, l.adesao_valor, v_venc_ad, 'pendente', p_lead_id,
            'Taxa de adesao - ' || coalesce(upper(l.placa), 'veiculo'));

  else
    select id into v_cat from categorias_dre where codigo_estruturado = '3.1.1.03';
    insert into lancamentos_financeiros
      (tipo, cliente_id, descricao, categoria_dre_id, regional_id, valor_original,
       data_emissao, data_vencimento, competencia, forma_pagamento_prevista, observacoes)
    values ('RECEITA', v_cliente,
            'Taxa de adesao - ' || upper(coalesce(l.placa, '')),
            v_cat, l.regional_id, l.adesao_valor,
            current_date, coalesce(l.adesao_recebida_em, current_date), current_date,
            'CARTAO'::forma_pagamento,
            'Adesao da venda ' || p_lead_id::text)
    returning id into v_lanc;

    insert into comissoes_vendas (vendedor_id, veiculo_id, valor_comissao, is_adesao, status_pagamento)
    values (l.vendedor_id, v_veiculo, v_comissao, true, 'pendente');
  end if;

  -- ------------------------------------------------- pedido do rastreador
  select exists (
           select 1 from cotacoes c, jsonb_array_elements(coalesce(c.itens, '[]'::jsonb)) i
            where c.id = v_cot
              and (i->>'nome' ilike '%rastread%'
                   or exists (select 1 from produtos p
                               where p.id::text = i->>'produto_id' and p.categoria::text = 'RASTREADOR')))
         or coalesce((select pp.exige_rastreador from planos_protecao pp where pp.id = l.plano_id), false)
    into v_rastr;

  if v_rastr then
    insert into atendimentos (
      cliente_id, veiculo_id, tipo, canal, status, assunto, descricao,
      prioridade, responsavel_id, regional_id, aberto_por
    ) values (
      v_cliente, v_veiculo, 'OUTROS'::tipo_atendimento, 'SAC_INTERNO'::canal_atendimento, 'ABERTO',
      'Instalacao de rastreador - ' || coalesce(upper(l.placa), 'veiculo novo'),
      'Veiculo novo na base (venda ' || coalesce(upper(l.placa), '') || ', associado ' || l.nome
        || '). Agendar a instalacao do rastreador com o associado (celular ' || coalesce(l.celular, '-') || ').',
      'ALTA'::prioridade_atendimento, null, l.regional_id, auth.uid()
    ) returning id into v_atend;

    insert into protocolo_interacoes (atendimento_id, tipo, mensagem, para_status, usuario_id)
    values (v_atend, 'STATUS', 'Pedido de instalacao aberto na entrada na base', 'ABERTO', auth.uid());
  end if;

  update leads set
    status = 'ATIVO', cliente_id = v_cliente, veiculo_id = v_veiculo,
    adesao_forma = v_forma::forma_recebimento_adesao,
    cpf_cnpj = v_doc, auditado_em = now(), auditado_por = auth.uid()
  where id = p_lead_id;

  return v_veiculo;
end;
$$;

-- (I) ---------------------------------------------------------------------
-- O carne com o PRO-RATA POS-PAGO no 1o boleto. Corpo da 0145 e uma passagem:
-- depois de gerar a fatura da 1a competencia (ainda sem titulo), o valor dela
-- vira os dias usados desde a ativacao ate a vespera do vencimento, sobre os
-- dias do ciclo. Veiculo ativado antes do ciclo paga cheio (pro-rata = 100%).
create or replace function gerar_carne_veiculo(
  p_veiculo_id uuid,
  p_meses      int
)
returns table (
  titulo_id   uuid,
  competencia date,
  vencimento  date,
  valor       numeric,
  adesao      boolean,
  registrado  boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v        veiculos;
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_comp   date;
  v_ini    date;
  f        record;
  m        int;
  t        titulos_financeiros;
  v_venc   date;
  v_prev   date;
  v_desde  date;
  v_mens   numeric;
  v_pr     numeric;
begin
  if not (tem_acesso_global() or pode_auditar() or perfil_pode('cobranca', 'criar')) then
    raise exception 'Sem permissao para emitir o carne';
  end if;
  if p_meses is null or p_meses < 0 or p_meses > 12 then
    raise exception 'Quantidade de meses invalida (0 a 12)' using errcode = 'check_violation';
  end if;

  select * into v from veiculos where id = p_veiculo_id for update;
  if v.id is null then raise exception 'Veiculo nao encontrado'; end if;
  if not (tem_acesso_global() or pode_auditar() or pode_regional(v.regional_id)) then
    raise exception 'Veiculo fora da sua unidade';
  end if;
  if v.cobranca_externa then
    raise exception 'A mensalidade deste veiculo ainda e cobrada no Mutual (cobranca externa)'
      using errcode = 'check_violation';
  end if;
  if v.status::text not in ('ativo', 'em_evento', 'vistoria_pendente', 'inadimplente') then
    raise exception 'Veiculo fora da base (status %): nao ha mensalidade a emitir', v.status
      using errcode = 'check_violation';
  end if;
  if p_meses > 0 and valor_mensalidade_veiculo(v.id) <= 0 then
    raise exception 'Veiculo sem valor de mensalidade' using errcode = 'check_violation';
  end if;

  if p_meses > 0 and v.tipo_faturamento <> 'INDIVIDUAL_VEICULO' then
    update veiculos set tipo_faturamento = 'INDIVIDUAL_VEICULO' where id = v.id;
  end if;

  v_comp := date_trunc('month', coalesce(v.data_ativacao, v_hoje))::date;
  for m in 1 .. 24 loop
    exit when calcular_vencimento(v_comp, v.dia_vencimento) >= v_hoje + 2;
    v_comp := (v_comp + interval '1 month')::date;
  end loop;
  v_ini := v_comp;

  if p_meses > 0 then
  for f in
    select fa.id, fa.tipo_faturamento, fa.valor_total, fi.id as item_id, fi.valor as item_valor,
           (select count(*) from fatura_itens x where x.fatura_id = fa.id) as itens
      from faturas fa
      join fatura_itens fi on fi.fatura_id = fa.id and fi.veiculo_id = v.id
     where fa.competencia < v_ini
       and fa.status = 'ABERTA'
       and fa.titulo_id is null
  loop
    if f.itens <= 1 then
      update faturas set status = 'CANCELADA', updated_at = now() where id = f.id;
    else
      delete from fatura_itens where id = f.item_id;
      update faturas set valor_total = valor_total - f.item_valor, updated_at = now() where id = f.id;
    end if;
  end loop;

  for f in
    select fa.id, fi.id as item_id, fi.valor as item_valor,
           (select count(*) from fatura_itens x where x.fatura_id = fa.id) as itens
      from faturas fa
      join fatura_itens fi on fi.fatura_id = fa.id and fi.veiculo_id = v.id
     where fa.tipo_faturamento = 'AGRUPADO_ASSOCIADO'
       and fa.competencia >= v_ini
       and fa.competencia < (v_ini + make_interval(months => p_meses))::date
       and fa.status = 'ABERTA'
       and fa.titulo_id is null
  loop
    if f.itens <= 1 then
      update faturas set status = 'CANCELADA', updated_at = now() where id = f.id;
    else
      delete from fatura_itens where id = f.item_id;
      update faturas set valor_total = valor_total - f.item_valor, updated_at = now() where id = f.id;
    end if;
  end loop;

  for m in 0 .. p_meses - 1 loop
    v_comp := (v_ini + make_interval(months => m))::date;
    perform gerar_faturas_cliente_veiculos(v.cliente_id, v_comp, array[v.id]);
    for f in
      select fa.id, fa.titulo_id, fa.vencimento from faturas fa
       where fa.veiculo_id = v.id and fa.competencia = v_comp
         and fa.tipo_faturamento = 'INDIVIDUAL_VEICULO'
         and fa.status <> 'CANCELADA'
    loop
      -- 0161: o 1o boleto (ainda sem titulo) cobra so os dias usados.
      if m = 0 and f.titulo_id is null and v.data_ativacao is not null then
        v_venc  := coalesce(f.vencimento, calcular_vencimento(v_comp, v.dia_vencimento));
        v_prev  := calcular_vencimento((v_comp - interval '1 month')::date, v.dia_vencimento);
        v_desde := greatest(v.data_ativacao, v_prev);
        if v_desde > v_prev and v_desde < v_venc then
          v_mens := coalesce(valor_mensalidade_veiculo(v.id), 0);
          v_pr   := least(v_mens, round(v_mens * (v_venc - v_desde) / (v_venc - v_prev), 2));
          update fatura_itens
             set valor = v_pr,
                 descricao = descricao || ' (pro-rata ' || to_char(v_desde, 'DD/MM') || ' a '
                             || to_char(v_venc - 1, 'DD/MM') || ': ' || (v_venc - v_desde) || ' de '
                             || (v_venc - v_prev) || ' dias)'
           where fatura_id = f.id and veiculo_id = v.id;
          update faturas set valor_total = (select coalesce(sum(x.valor), 0) from fatura_itens x
                                             where x.fatura_id = f.id),
                             updated_at = now()
           where id = f.id;
        end if;
      end if;

      t := emitir_titulo_fatura(f.id);
      titulo_id := t.id; competencia := v_comp; vencimento := t.data_vencimento;
      valor := t.valor; adesao := false; registrado := t.linha_digitavel is not null;
      return next;
    end loop;
  end loop;
  end if;

  for t in
    select * from titulos_financeiros ta
     where ta.veiculo_id = v.id and ta.adesao_lead_id is not null
       and ta.status in ('pendente', 'vencido')
  loop
    titulo_id := t.id; competencia := null; vencimento := t.data_vencimento;
    valor := t.valor; adesao := true; registrado := t.linha_digitavel is not null;
    return next;
  end loop;
end;
$$;

comment on function gerar_carne_veiculo(uuid, int) is
  'Carne do veiculo (0145/0161): N meses (0-12) a partir do 1o vencimento viavel; o 1o boleto cobra o pro-rata pos-pago desde a ativacao. Devolve os titulos (com o boleto da adesao) para a remessa.';

-- ============================================================================
-- Rito de seguranca (0052)
-- ============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
