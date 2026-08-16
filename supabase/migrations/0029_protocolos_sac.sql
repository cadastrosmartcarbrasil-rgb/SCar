-- ============================================================================
-- SCar :: 0029_protocolos_sac.sql
--   A) FICHA DO VEICULO (SAC): `opcionais_veiculo()` devolve SO o que o veiculo
--      tem contratado (itens do plano + avulsos de veiculo_produtos), com o
--      consumo do limite quando o produto tem janela. Corrige a listagem que
--      mostrava todo produto com limite, contratado ou nao.
--   B) HISTORICO FINANCEIRO editavel no SAC: `titulos_financeiros` ganha
--      `valor_original`/`desconto`/`acrescimo`/`observacao` + `ajustar_titulo()`
--      (vencimento, desconto, acrescimo — so enquanto nao pago) e
--      `reemitir_titulo()` (2a via: devolve o titulo para a fila da remessa).
--      `titulos_do_cliente()` alimenta o card.
--   C) CENTRAL DE PROTOCOLOS: a entidade Protocolo E a tabela `atendimentos`
--      (ja nasce com numero unico ATD-YYYYMMDD-XXXX, associado, veiculo, tipo,
--      canal e status) — evoluida aqui em vez de duplicada, para nao existirem
--      duas centrais paralelas. Ganha prioridade, responsavel, encerramento e
--      passa a aceitar protocolo SEM veiculo (aberto pela ficha do associado).
--      Nova tabela `protocolo_interacoes` (comentarios, mudancas de status e
--      transferencias) + funcoes de abertura, tramitacao, transferencia,
--      encerramento, listagem e o contador do dashboard.
-- ============================================================================

-- Categorias de protocolo (o literal so pode ser usado em OUTRA transacao:
-- comparamos como TEXTO no restante do arquivo — gotcha do 0017).
alter type tipo_atendimento add value if not exists 'FINANCEIRO';
alter type tipo_atendimento add value if not exists 'DUVIDAS';
alter type tipo_atendimento add value if not exists 'RECLAMACAO';
alter type tipo_atendimento add value if not exists 'OUTROS';

do $$ begin
  if not exists (select 1 from pg_type where typname = 'prioridade_atendimento') then
    create type prioridade_atendimento as enum ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE');
  end if;
  if not exists (select 1 from pg_type where typname = 'tipo_interacao_protocolo') then
    create type tipo_interacao_protocolo as enum ('COMENTARIO', 'STATUS', 'TRANSFERENCIA', 'ENCERRAMENTO');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- A) Opcionais REALMENTE contratados pelo veiculo
-- ----------------------------------------------------------------------------
-- Fonte da verdade: o mesmo motor da cotacao (`cotar_plano`), alimentado com o
-- plano do veiculo + os avulsos de `veiculo_produtos`. Assim a ficha do SAC
-- mostra exatamente o pacote daquele item — nada de catalogo geral.
create or replace function opcionais_veiculo(p_veiculo_id uuid)
returns table (
  produto_id        uuid,
  nome              text,
  valor             numeric,
  obrigatorio       boolean,
  origem            text,          -- PLANO | AVULSO
  tem_limite        boolean,
  quantidade_limite integer,
  janela_dias       integer,
  usados            integer,
  elegivel          boolean,
  ultimo_uso        date
)
language plpgsql
stable
as $$
declare
  v      veiculos;
  v_opc  uuid[];
  v_calc jsonb;
begin
  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null or v.tipo_veiculo_id is null then return; end if;

  select coalesce(array_agg(vp.produto_id), '{}'::uuid[]) into v_opc
    from veiculo_produtos vp
    join produtos pr on pr.id = vp.produto_id and pr.status
   where vp.veiculo_id = v.id;

  v_calc := cotar_plano(coalesce(v.valor_fipe, 0), v.tipo_veiculo_id, v.plano_protecao_id, v_opc);

  return query
  select (i->>'produto_id')::uuid,
         i->>'nome',
         (i->>'valor')::numeric,
         coalesce((i->>'obrigatorio')::boolean, false),
         case when (i->>'produto_id')::uuid = any(v_opc) then 'AVULSO' else 'PLANO' end,
         coalesce(pr.tem_limite_uso, false),
         pr.quantidade_limite,
         pr.janela_dias_limite,
         coalesce(u.usados, 0)::int,
         (not coalesce(pr.tem_limite_uso, false)) or coalesce(u.usados, 0) < pr.quantidade_limite,
         u.ultimo_uso
    from jsonb_array_elements(coalesce(v_calc->'detalhamento_produtos', '[]'::jsonb)) i
    left join produtos pr on pr.id = (i->>'produto_id')::uuid
    left join lateral (
      select count(e.id)::int as usados, max(e.data_ocorrencia) as ultimo_uso
        from eventos_sinistro e
       where e.veiculo_id = p_veiculo_id
         and e.tipo_evento_id = pr.tipo_evento_id
         and e.data_ocorrencia >= current_date - coalesce(pr.janela_dias_limite, 365)
    ) u on true
   where i->>'produto_id' is not null
   order by coalesce((i->>'obrigatorio')::boolean, false) desc, i->>'nome';
end;
$$;

-- ----------------------------------------------------------------------------
-- B) Historico financeiro editavel (boletos em aberto)
-- ----------------------------------------------------------------------------
alter table titulos_financeiros
  add column if not exists valor_original numeric(12,2),
  add column if not exists desconto       numeric(12,2) not null default 0,
  add column if not exists acrescimo      numeric(12,2) not null default 0,
  add column if not exists observacao     text,
  add column if not exists alterado_por   uuid references usuarios(id) on delete set null,
  add column if not exists alterado_em    timestamptz;

update titulos_financeiros set valor_original = valor where valor_original is null;

-- Ajusta o boleto EM ABERTO: vencimento, desconto e acrescimo. O valor final e
-- sempre recalculado a partir do valor original (nao acumula ajuste sobre ajuste).
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

  -- Mantem a fatura de origem coerente com o novo valor.
  update faturas set valor_total = t.valor, updated_at = now()
   where titulo_id = t.id and status = 'ABERTA';

  return t;
end;
$$;

-- 2a via: devolve o titulo para a fila de remessa (limpa o registro do gateway).
create or replace function reemitir_titulo(p_titulo_id uuid)
returns titulos_financeiros
language plpgsql
security definer
set search_path = public
as $$
declare t titulos_financeiros;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  select * into t from titulos_financeiros where id = p_titulo_id;
  if t.id is null then raise exception 'Titulo nao encontrado'; end if;
  if t.status = 'pago' then raise exception 'Titulo ja pago'; end if;

  update titulos_financeiros
     set linha_digitavel = null, url_boleto = null, nosso_numero = null,
         pix_copia_cola = null, pix_qrcode_url = null,
         gateway_status = null, gateway_erro = null, enviado_em = null,
         alterado_por = auth.uid(), alterado_em = now(), updated_at = now()
   where id = p_titulo_id
   returning * into t;

  -- Solta o titulo das remessas anteriores para entrar na proxima.
  update cobranca_remessa_itens set status = 'ERRO', erro = 'Reemitido (2a via)', updated_at = now()
   where titulo_id = p_titulo_id and status in ('PENDENTE', 'ENVIADO');

  return t;
end;
$$;

-- Historico financeiro do associado (opcionalmente de um veiculo).
create or replace function titulos_do_cliente(
  p_cliente_id uuid,
  p_veiculo_id uuid default null,
  p_limite     int default 60
)
returns table (
  id              uuid,
  veiculo_id      uuid,
  placa           text,
  competencia     date,
  data_vencimento date,
  valor           numeric,
  valor_original  numeric,
  desconto        numeric,
  acrescimo       numeric,
  valor_pago      numeric,
  data_pagamento  date,
  status          text,
  dias_atraso     integer,
  linha_digitavel text,
  url_boleto      text,
  pix_copia_cola  text,
  observacao      text
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.veiculo_id, ve.placa, f.competencia, t.data_vencimento,
         t.valor, coalesce(t.valor_original, t.valor), t.desconto, t.acrescimo,
         t.valor_pago, t.data_pagamento,
         status_cobranca_efetivo(t.status, t.data_vencimento),
         greatest(0, current_date - t.data_vencimento)::int,
         t.linha_digitavel, t.url_boleto, t.pix_copia_cola, t.observacao
    from titulos_financeiros t
    join clientes cl on cl.id = t.cliente_id
    left join veiculos ve on ve.id = t.veiculo_id
    left join faturas f on f.titulo_id = t.id
   where t.cliente_id = p_cliente_id
     and (p_veiculo_id is null or t.veiculo_id = p_veiculo_id or t.veiculo_id is null)
     and (tem_acesso_global() or pode_regional(cl.regional_id) or cl.id = auth_cliente_id())
   order by t.data_vencimento desc
   limit coalesce(p_limite, 60);
$$;

-- ----------------------------------------------------------------------------
-- C) Central de Protocolos (a entidade Protocolo e `atendimentos`)
-- ----------------------------------------------------------------------------
alter table atendimentos
  add column if not exists prioridade     prioridade_atendimento not null default 'NORMAL',
  add column if not exists responsavel_id uuid references usuarios(id) on delete set null,
  add column if not exists encerrado_em   timestamptz,
  add column if not exists encerrado_por  uuid references usuarios(id) on delete set null,
  add column if not exists solucao        text;

-- Protocolo pode nascer da ficha do ASSOCIADO (sem veiculo vinculado).
alter table atendimentos alter column veiculo_id drop not null;

create index if not exists idx_atend_responsavel on atendimentos (responsavel_id) where encerrado_em is null;
create index if not exists idx_atend_abertos on atendimentos (status) where encerrado_em is null;

-- Interacoes: comentarios, mudancas de status, transferencias e encerramento.
create table if not exists protocolo_interacoes (
  id             uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references atendimentos(id) on delete cascade,
  tipo           tipo_interacao_protocolo not null default 'COMENTARIO',
  mensagem       text,
  de_status      status_atendimento,
  para_status    status_atendimento,
  de_usuario     uuid references usuarios(id) on delete set null,
  para_usuario   uuid references usuarios(id) on delete set null,
  interno        boolean not null default true,   -- false = visivel ao associado (Portal)
  usuario_id     uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default clock_timestamp()
);
create index if not exists idx_protocolo_inter on protocolo_interacoes (atendimento_id, created_at);

alter table protocolo_interacoes enable row level security;
create policy protocolo_inter_select on protocolo_interacoes for select to authenticated using (
  exists (
    select 1 from atendimentos a
     where a.id = atendimento_id
       and (tem_acesso_global() or pode_regional(a.regional_id)
            or (a.cliente_id = auth_cliente_id() and not protocolo_interacoes.interno))
  )
);
create policy protocolo_inter_insert on protocolo_interacoes for insert to authenticated with check (is_staff());
grant select, insert on protocolo_interacoes to authenticated;

-- Abre protocolo pela ficha do VEICULO ou do ASSOCIADO (veiculo opcional).
create or replace function abrir_protocolo(
  p_cliente_id  uuid,
  p_tipo        text,
  p_assunto     text default null,
  p_descricao   text default null,
  p_veiculo_id  uuid default null,
  p_prioridade  text default 'NORMAL',
  p_responsavel_id uuid default null,
  p_canal       text default 'SAC_INTERNO'
)
returns atendimentos
language plpgsql
security definer
set search_path = public
as $$
declare
  a   atendimentos;
  cli clientes;
  v   veiculos;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  select * into cli from clientes where id = p_cliente_id;
  if cli.id is null then raise exception 'Associado nao encontrado'; end if;

  if p_veiculo_id is not null then
    select * into v from veiculos where id = p_veiculo_id;
    if v.id is null then raise exception 'Veiculo nao encontrado'; end if;
    if v.cliente_id <> p_cliente_id then
      raise exception 'O veiculo informado nao pertence a este associado';
    end if;
  end if;

  insert into atendimentos (
    cliente_id, veiculo_id, tipo, canal, status, assunto, descricao,
    prioridade, responsavel_id, regional_id, aberto_por
  ) values (
    p_cliente_id, p_veiculo_id, p_tipo::tipo_atendimento, p_canal::canal_atendimento, 'ABERTO',
    p_assunto, p_descricao, p_prioridade::prioridade_atendimento,
    coalesce(p_responsavel_id, auth.uid()),
    coalesce(v.regional_id, cli.regional_id), auth.uid()
  ) returning * into a;

  insert into protocolo_interacoes (atendimento_id, tipo, mensagem, para_status, para_usuario, usuario_id)
    values (a.id, 'STATUS', coalesce(p_descricao, p_assunto), 'ABERTO', a.responsavel_id, auth.uid());

  return a;
end;
$$;

-- Comentario/interacao no protocolo.
create or replace function registrar_interacao_protocolo(
  p_atendimento_id uuid,
  p_mensagem       text,
  p_interno        boolean default true
)
returns protocolo_interacoes
language plpgsql
security definer
set search_path = public
as $$
declare i protocolo_interacoes;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;
  if p_mensagem is null or btrim(p_mensagem) = '' then raise exception 'Escreva a interacao'; end if;

  insert into protocolo_interacoes (atendimento_id, tipo, mensagem, interno, usuario_id)
    values (p_atendimento_id, 'COMENTARIO', p_mensagem, coalesce(p_interno, true), auth.uid())
    returning * into i;

  -- Primeiro retorno move o protocolo para "em andamento".
  update atendimentos set status = 'EM_ANDAMENTO', updated_at = now()
   where id = p_atendimento_id and status = 'ABERTO';

  return i;
end;
$$;

-- Transferencia de responsavel (fila entre atendentes).
-- Nome `transferir_atendimento` de proposito: `transferir_protocolo` ja existe
-- para EVENTOS/sinistros (0009) e chamar com 3 args ficaria ambiguo.
create or replace function transferir_atendimento(
  p_atendimento_id uuid,
  p_para_usuario   uuid,
  p_motivo         text default null
)
returns atendimentos
language plpgsql
security definer
set search_path = public
as $$
declare
  a   atendimentos;
  de  uuid;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;
  if p_para_usuario is null then raise exception 'Informe o atendente de destino'; end if;

  select * into a from atendimentos where id = p_atendimento_id;
  if a.id is null then raise exception 'Protocolo nao encontrado'; end if;
  if a.encerrado_em is not null then raise exception 'Protocolo ja encerrado'; end if;
  if not exists (select 1 from usuarios where id = p_para_usuario and ativo) then
    raise exception 'Atendente de destino invalido ou inativo';
  end if;

  de := a.responsavel_id;

  update atendimentos
     set responsavel_id = p_para_usuario,
         status = case when status::text = 'ABERTO' then status else 'EM_ANDAMENTO'::status_atendimento end,
         updated_at = now()
   where id = p_atendimento_id
   returning * into a;

  insert into protocolo_interacoes (atendimento_id, tipo, mensagem, de_usuario, para_usuario, usuario_id)
    values (p_atendimento_id, 'TRANSFERENCIA', p_motivo, de, p_para_usuario, auth.uid());

  return a;
end;
$$;

-- Tramitacao de status (Aberto / Em atendimento / Pendente / Concluido).
create or replace function alterar_status_protocolo(
  p_atendimento_id uuid,
  p_status         text,
  p_mensagem       text default null
)
returns atendimentos
language plpgsql
security definer
set search_path = public
as $$
declare
  a  atendimentos;
  de status_atendimento;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;
  if p_status not in ('ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO') then
    raise exception 'Status invalido: %', p_status;
  end if;

  select * into a from atendimentos where id = p_atendimento_id;
  if a.id is null then raise exception 'Protocolo nao encontrado'; end if;
  de := a.status;

  update atendimentos
     set status = p_status::status_atendimento,
         encerrado_em = case when p_status in ('CONCLUIDO', 'CANCELADO') then coalesce(encerrado_em, now()) else null end,
         encerrado_por = case when p_status in ('CONCLUIDO', 'CANCELADO') then coalesce(encerrado_por, auth.uid()) else null end,
         solucao = case when p_status = 'CONCLUIDO' then coalesce(p_mensagem, solucao) else solucao end,
         updated_at = now()
   where id = p_atendimento_id
   returning * into a;

  insert into protocolo_interacoes (atendimento_id, tipo, mensagem, de_status, para_status, usuario_id)
    values (
      p_atendimento_id,
      case when p_status in ('CONCLUIDO', 'CANCELADO') then 'ENCERRAMENTO'::tipo_interacao_protocolo
           else 'STATUS'::tipo_interacao_protocolo end,
      p_mensagem, de, a.status, auth.uid()
    );

  return a;
end;
$$;

-- Encerramento com solucao obrigatoria (atalho de alterar_status).
create or replace function encerrar_protocolo(p_atendimento_id uuid, p_solucao text)
returns atendimentos
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_solucao is null or btrim(p_solucao) = '' then
    raise exception 'Descreva a solucao para encerrar o protocolo';
  end if;
  return alterar_status_protocolo(p_atendimento_id, 'CONCLUIDO', p_solucao);
end;
$$;

-- Listagem da Central (filtros do painel).
create or replace function listar_protocolos(
  p_status       text default null,     -- null = todos; 'ABERTOS' = nao encerrados
  p_responsavel  uuid default null,
  p_busca        text default null,     -- protocolo, associado, placa
  p_prioridade   text default null,
  p_regional_id  uuid default null,
  p_limite       int default 300
)
returns table (
  id             uuid,
  protocolo      text,
  cliente_id     uuid,
  associado      text,
  veiculo_id     uuid,
  placa          text,
  tipo           tipo_atendimento,
  assunto        text,
  descricao      text,
  status         status_atendimento,
  prioridade     prioridade_atendimento,
  responsavel_id uuid,
  responsavel    text,
  canal          canal_atendimento,
  interacoes     integer,
  aberto_em      timestamptz,
  atualizado_em  timestamptz,
  encerrado_em   timestamptz,
  dias_aberto    integer
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.numero_protocolo, a.cliente_id, cl.nome_razao_social, a.veiculo_id, ve.placa,
         a.tipo, a.assunto, a.descricao, a.status, a.prioridade, a.responsavel_id, u.nome, a.canal,
         (select count(*)::int from protocolo_interacoes pi where pi.atendimento_id = a.id),
         a.created_at, a.updated_at, a.encerrado_em,
         (extract(day from now() - a.created_at))::int
    from atendimentos a
    join clientes cl on cl.id = a.cliente_id
    left join veiculos ve on ve.id = a.veiculo_id
    left join usuarios u on u.id = a.responsavel_id
   where (tem_acesso_global() or pode_regional(a.regional_id))
     and (p_regional_id is null or a.regional_id = p_regional_id)
     and (p_responsavel is null or a.responsavel_id = p_responsavel)
     and (p_prioridade is null or a.prioridade::text = p_prioridade)
     and (
       p_status is null
       or (p_status = 'ABERTOS' and a.encerrado_em is null)
       or a.status::text = p_status
     )
     and (
       p_busca is null or btrim(p_busca) = ''
       or a.numero_protocolo ilike '%' || p_busca || '%'
       or cl.nome_razao_social ilike '%' || p_busca || '%'
       or coalesce(ve.placa, '') ilike '%' || p_busca || '%'
       or coalesce(a.assunto, '') ilike '%' || p_busca || '%'
     )
   order by (a.encerrado_em is null) desc,
            case a.prioridade when 'URGENTE' then 1 when 'ALTA' then 2 when 'NORMAL' then 3 else 4 end,
            a.created_at desc
   limit coalesce(p_limite, 300);
$$;

-- Interacoes de um protocolo (com o nome de quem escreveu).
create or replace function interacoes_protocolo(p_atendimento_id uuid)
returns table (
  id           uuid,
  tipo         tipo_interacao_protocolo,
  mensagem     text,
  de_status    status_atendimento,
  para_status  status_atendimento,
  de_usuario   text,
  para_usuario text,
  interno      boolean,
  operador     text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.tipo, i.mensagem, i.de_status, i.para_status,
         du.nome, pu.nome, i.interno, coalesce(ou_.nome, 'sistema'), i.created_at
    from protocolo_interacoes i
    left join usuarios du on du.id = i.de_usuario
    left join usuarios pu on pu.id = i.para_usuario
    left join usuarios ou_ on ou_.id = i.usuario_id
   where i.atendimento_id = p_atendimento_id
   order by i.created_at;
$$;

-- Contador do dashboard (protocolos em aberto, por prioridade e atrasados).
create or replace function resumo_protocolos(p_regional_id uuid default null)
returns table (
  abertos        integer,
  em_andamento   integer,
  urgentes       integer,
  meus           integer,
  sem_responsavel integer,
  mais_7_dias    integer
)
language sql
stable
security definer
set search_path = public
as $$
  select count(*) filter (where a.encerrado_em is null)::int,
         count(*) filter (where a.encerrado_em is null and a.status::text = 'EM_ANDAMENTO')::int,
         count(*) filter (where a.encerrado_em is null and a.prioridade::text in ('ALTA', 'URGENTE'))::int,
         count(*) filter (where a.encerrado_em is null and a.responsavel_id = auth.uid())::int,
         count(*) filter (where a.encerrado_em is null and a.responsavel_id is null)::int,
         count(*) filter (where a.encerrado_em is null and a.created_at < now() - interval '7 days')::int
    from atendimentos a
   where (tem_acesso_global() or pode_regional(a.regional_id))
     and (p_regional_id is null or a.regional_id = p_regional_id);
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
grant execute on function opcionais_veiculo(uuid) to authenticated;
grant execute on function ajustar_titulo(uuid, date, numeric, numeric, text) to authenticated;
grant execute on function reemitir_titulo(uuid) to authenticated;
grant execute on function titulos_do_cliente(uuid, uuid, int) to authenticated;
grant execute on function abrir_protocolo(uuid, text, text, text, uuid, text, uuid, text) to authenticated;
grant execute on function registrar_interacao_protocolo(uuid, text, boolean) to authenticated;
grant execute on function transferir_atendimento(uuid, uuid, text) to authenticated;
grant execute on function alterar_status_protocolo(uuid, text, text) to authenticated;
grant execute on function encerrar_protocolo(uuid, text) to authenticated;
grant execute on function listar_protocolos(text, uuid, text, text, uuid, int) to authenticated;
grant execute on function interacoes_protocolo(uuid) to authenticated;
grant execute on function resumo_protocolos(uuid) to authenticated;
