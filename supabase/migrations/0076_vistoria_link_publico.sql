-- ============================================================================
-- 0076 — A VISTORIA PELO CELULAR DO CLIENTE: link proprio, com prazo
-- ============================================================================
-- O que estava quebrado no fluxo: o hotlink cota, o cliente ACEITA na hora — e
-- a rotina para. A tela de sucesso dizia "seu consultor vai combinar a
-- vistoria", e o unico jeito de as fotos existirem era alguem LOGADO abrir o
-- lead: `<FotosVistoria>` so vive no CRM e no portal do vendedor, a RLS de
-- `vistorias`/`vistoria_anexos` e `to authenticated`, e a policy do bucket
-- `vendas` exige `is_staff()`. Ou seja: **o cliente nunca teve como enviar
-- foto**, no exato momento em que ele esta com o carro na frente e decidido.
--
-- Aqui entra a capacidade que faltava.
--
-- ⚠️ POR QUE UM TOKEN NOVO, E NAO O `leads.token_publico` (0042).
-- Aquele token e a capacidade de COTAR e CONTRATAR, e o link da proposta
-- (`/cotacao/<token>`) e feito para ser guardado e reaberto — vai para o
-- WhatsApp, fica no historico, o cliente reabre meses depois. Pendurar UPLOAD
-- nele seria transformar um link de leitura, distribuido a vontade, em
-- permissao de ESCRITA no nosso storage, sem prazo. Capacidades diferentes,
-- tokens diferentes: este nasce para a vistoria, expira, e morre com a venda.
--
-- DECISOES DO USUARIO (12/09/2026), arquivadas para nao reabrir:
--  1. A foto do CLIENTE VALE como vistoria — completa o `checklist_lead` e o
--     lead segue para a Auditoria, que confere as imagens antes de autorizar.
--     A trava continua sendo a Auditoria, nao uma etapa a mais no vendedor.
--  2. O link vale 7 DIAS. Tempo de achar o carro com luz boa, sem deixar
--     permissao de upload aberta para sempre. Vencido, o vendedor reemite.
--
-- Como a foto do cliente e do vendedor passam a conviver na mesma vistoria,
-- `vistoria_anexos.enviado_pelo_cliente` diz a ORIGEM — quem audita precisa
-- saber se a imagem veio de quem esta vendendo o carro ou de quem o comprou.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) A capacidade: token + prazo na propria vistoria
-- ----------------------------------------------------------------------------
alter table vistorias
  add column if not exists token_publico   uuid,
  add column if not exists token_expira_em timestamptz;

-- Unique PARCIAL: o token e opcional (vistoria de veiculo, feita internamente,
-- nunca tem um) e duas linhas com NULL nao podem colidir — mesmo cuidado de
-- `fornecedores.documento` (0051) e `vendedores.documento` (0069).
create unique index if not exists uq_vistoria_token_publico
  on vistorias (token_publico) where token_publico is not null;

alter table vistoria_anexos
  add column if not exists enviado_pelo_cliente boolean not null default false;

comment on column vistorias.token_publico is
  'Capacidade do link publico da vistoria. NAO e o `leads.token_publico` (0042) — ver 0076.';
comment on column vistoria_anexos.enviado_pelo_cliente is
  'A foto veio pelo link do cliente (true) ou de alguem logado (false). A Auditoria precisa da origem.';

-- ----------------------------------------------------------------------------
-- (B) Gerar o link — quem trata o lead
-- ----------------------------------------------------------------------------
-- REEMITIR NAO INVALIDA O LINK QUE JA ESTA NA MAO DO CLIENTE: enquanto o token
-- vigente nao venceu, a funcao devolve O MESMO. Girar o token a cada clique do
-- vendedor quebraria, em silencio, a mensagem que ele acabou de mandar no
-- WhatsApp — e ninguem entenderia por que "o link parou de funcionar".
create or replace function gerar_link_vistoria(p_lead_id uuid, p_dias integer default 7)
returns table (token uuid, expira_em timestamptz, reaproveitado boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead   leads;
  v_vist   vistorias;
  v_dias   integer := greatest(coalesce(p_dias, 7), 1);
begin
  select * into v_lead from leads where id = p_lead_id;
  if not found then raise exception 'Lead nao encontrado'; end if;

  -- Mesma trava de propriedade do resto da venda (0045): quem pode tratar o
  -- lead pode convidar o cliente a fotografar o carro dele.
  --
  -- `auth.uid() is null` e o caminho PUBLICO (padrao da 0052): a pagina do
  -- hotlink roda com service_role e chega aqui logo apos o aceite, ja tendo
  -- provado a posse do atendimento pelo `leads.token_publico`. O `anon` nao
  -- alcanca esta funcao — o revoke do fim do arquivo tira o execute dele.
  if auth.uid() is not null and not pode_tratar_lead(p_lead_id) then
    raise exception 'Sem permissao para gerar o link deste atendimento';
  end if;

  if v_lead.status::text in ('ATIVO', 'PERDIDO') then
    raise exception 'Atendimento encerrado (%) — nao ha vistoria a fazer', v_lead.status;
  end if;

  select * into v_vist from vistorias where lead_id = p_lead_id limit 1;
  if not found then
    insert into vistorias (lead_id, tipo, status, data_vistoria)
    values (p_lead_id, 'inicial', 'PENDENTE', current_date)
    returning * into v_vist;
  end if;

  if v_vist.token_publico is not null
     and v_vist.token_expira_em is not null
     and v_vist.token_expira_em > now() then
    return query select v_vist.token_publico, v_vist.token_expira_em, true;
    return;
  end if;

  update vistorias
     set token_publico   = gen_random_uuid(),
         token_expira_em = now() + make_interval(days => v_dias)
   where id = v_vist.id
   returning token_publico, token_expira_em into v_vist.token_publico, v_vist.token_expira_em;

  return query select v_vist.token_publico, v_vist.token_expira_em, false;
end;
$$;

comment on function gerar_link_vistoria(uuid, integer) is
  'Link publico da vistoria (7 dias). Reemitir devolve o MESMO token enquanto vigente — ver 0076.';

-- ----------------------------------------------------------------------------
-- (C) Abrir o link — o caminho publico
-- ----------------------------------------------------------------------------
-- Devolve SEMPRE uma linha, com `valida` e `motivo`: a pagina precisa saber a
-- diferenca entre "link errado", "link vencido" e "venda ja concluida" para
-- dizer ao cliente o que fazer. Um `null` generico viraria "algo deu errado",
-- que e o texto que faz a pessoa ligar para o vendedor.
create or replace function vistoria_por_token(p_token uuid)
returns table (
  valida       boolean,
  motivo       text,
  lead_id      uuid,
  vistoria_id  uuid,
  nome         text,
  placa        text,
  marca        text,
  modelo       text,
  expira_em    timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_vist vistorias;
  v_lead leads;
begin
  -- Caminho publico: roda por service_role, sem sessao (rito da 0052).
  if not (is_staff() or auth.uid() is null) then
    raise exception 'Sem permissao';
  end if;

  select * into v_vist from vistorias where token_publico = p_token;
  if not found then
    return query select false, 'LINK_INVALIDO', null::uuid, null::uuid,
                        null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select * into v_lead from leads where id = v_vist.lead_id;

  if v_vist.token_expira_em is null or v_vist.token_expira_em <= now() then
    return query select false, 'LINK_EXPIRADO', v_lead.id, v_vist.id,
                        v_lead.nome, v_lead.placa, v_lead.marca, v_lead.modelo, v_vist.token_expira_em;
    return;
  end if;

  if v_lead.status::text in ('ATIVO', 'PERDIDO') then
    return query select false, 'ATENDIMENTO_ENCERRADO', v_lead.id, v_vist.id,
                        v_lead.nome, v_lead.placa, v_lead.marca, v_lead.modelo, v_vist.token_expira_em;
    return;
  end if;

  return query select true, 'OK', v_lead.id, v_vist.id,
                      v_lead.nome, v_lead.placa, v_lead.marca, v_lead.modelo, v_vist.token_expira_em;
end;
$$;

-- ----------------------------------------------------------------------------
-- (D) Receber a foto — a unica escrita que o link autoriza
-- ----------------------------------------------------------------------------
-- O token da ESCRITA e o mesmo da leitura, mas o que ele autoriza e minimo:
-- inserir UM anexo, numa pose do catalogo, na vistoria daquele lead. Nao ha
-- parametro de vistoria nem de lead — sao derivados do token, entao nao existe
-- o que forjar (mesma postura das RPCs do portal do vendedor, 0038).
create or replace function registrar_foto_vistoria_publica(
  p_token    uuid,
  p_tipo     text,
  p_url      text,
  p_tamanho  bigint default null,
  p_arquivo  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vist   vistorias;
  v_lead   leads;
  v_anexo  uuid;
begin
  if not (is_staff() or auth.uid() is null) then
    raise exception 'Sem permissao';
  end if;

  select * into v_vist from vistorias where token_publico = p_token;
  if not found then raise exception 'Link invalido'; end if;
  if v_vist.token_expira_em is null or v_vist.token_expira_em <= now() then
    raise exception 'Link expirado';
  end if;

  select * into v_lead from leads where id = v_vist.lead_id;
  if v_lead.status::text in ('ATIVO', 'PERDIDO') then
    raise exception 'Atendimento encerrado';
  end if;

  -- A POSE tem de existir no catalogo e valer para o tipo do veiculo. Sem
  -- isto, `tipo` livre encheria a vistoria de codigo que nenhuma tela mostra —
  -- foto que sobe, nao aparece e nao conta para o checklist.
  if not exists (
    select 1 from vistoria_fotos_modelo m
     where m.codigo = p_tipo and m.ativo
       and (m.tipo_veiculo_id is null or m.tipo_veiculo_id = v_lead.tipo_veiculo_id)
  ) then
    raise exception 'Pose % nao existe no modelo de vistoria', p_tipo;
  end if;

  insert into vistoria_anexos
    (vistoria_id, url, tipo, descricao, tamanho_bytes, enviado_pelo_cliente)
  values
    (v_vist.id, p_url, p_tipo, p_arquivo, p_tamanho, true)
  returning id into v_anexo;

  -- Foto que chega e trabalho no lead: renova a protecao (0041) e tira o
  -- atendimento da fila de "parado" (0045). Sem isto, o cliente faria a
  -- vistoria e o lead voltaria ao pool por falta de contato.
  update leads set ultima_interacao_em = now() where id = v_lead.id;

  return v_anexo;
end;
$$;

comment on function registrar_foto_vistoria_publica(uuid, text, text, bigint, text) is
  'Anexo da vistoria enviado pelo link do cliente. Vistoria e lead saem do TOKEN, nunca de parametro.';

-- ----------------------------------------------------------------------------
-- (E) A ORIGEM aparece para quem AUDITA
-- ----------------------------------------------------------------------------
-- Guardar `enviado_pelo_cliente` sem nenhuma funcao que o leia seria repetir o
-- gotcha do `usuarios.ativo` (0068): campo que a tela promete e o sistema
-- ignora. Quem confere a vistoria precisa saber se a foto veio de quem VENDE o
-- carro ou de quem o COMPRA — sao niveis de conferencia diferentes.
--
-- Muda a lista de colunas de OUT, entao e DROP + CREATE (o `create or replace`
-- recusa: "cannot change return type of existing function").
drop function if exists fotos_vistoria_lead(uuid);

create function fotos_vistoria_lead(p_lead_id uuid)
returns table (
  codigo               text,
  nome                 text,
  instrucao            text,
  obrigatorio          boolean,
  ordem                smallint,
  anexo_id             uuid,
  url                  text,
  enviada              boolean,
  enviada_em           timestamptz,
  tamanho_bytes        bigint,
  arquivo              text,
  enviado_pelo_cliente boolean
)
language sql
stable
security definer
set search_path = public
as $$
  -- A trava de acesso da 0052 continua: a consulta so responde a staff; o
  -- caminho publico (a pagina da vistoria) roda com service_role, sem sessao.
  -- Recriar a funcao sem reescrever este `where` reabriria o buraco em silencio.
  select * from (
  with l as (select * from leads where id = p_lead_id),
  vist as (
    select id from vistorias where lead_id = p_lead_id
     order by created_at desc limit 1
  ),
  modelo as (
    select m.* from vistoria_fotos_modelo m, l
     where m.ativo
       and (m.tipo_veiculo_id is null or m.tipo_veiculo_id = l.tipo_veiculo_id)
  ),
  -- uma foto por pose: se repetir, vale a mais recente
  foto as (
    select distinct on (upper(coalesce(a.tipo, ''))) upper(coalesce(a.tipo, '')) as codigo,
           a.id, a.url, a.created_at, a.tamanho_bytes, a.descricao, a.enviado_pelo_cliente
      from vistoria_anexos a
     where a.vistoria_id = (select id from vist)
     -- `a.id` desempata: dois anexos gravados na MESMA transacao tem o mesmo
     -- `created_at` (o default e `now()`), e sem isto a escolha seria arbitraria.
     order by upper(coalesce(a.tipo, '')), a.created_at desc, a.id desc
  )
  select m.codigo, m.nome, m.instrucao, m.obrigatorio, m.ordem,
         f.id, f.url, f.id is not null,
         f.created_at, f.tamanho_bytes, f.descricao,
         coalesce(f.enviado_pelo_cliente, false)
    from modelo m
    left join foto f on f.codigo = m.codigo
   order by m.ordem, m.codigo
  ) _x where is_staff() or auth.uid() is null;
$$;

comment on function fotos_vistoria_lead(uuid) is
  'Poses da vistoria do lead, com a foto mais recente de cada e a ORIGEM (0076).';

-- ============================================================================
-- RITO DE SEGURANCA (0052)
-- ============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
