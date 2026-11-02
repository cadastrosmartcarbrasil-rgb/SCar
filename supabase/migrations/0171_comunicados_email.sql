-- ============================================================================
-- 0171 — COMUNICADOS POR E-MAIL (etapa 2 dos modelos de mensagens)
-- ============================================================================
-- Pedido do usuario (02/11/2026): criar um comunicado do zero e mandar a UM associado ou a
-- uma LISTA filtrada (unidade, situacao do veiculo, plano, tipo de veiculo), vendo quantos
-- recebem antes de enviar.
--
-- (A) comunicados_email: o rascunho (titulo interno, assunto, titulo, previa, corpo com
--     campos e **negrito**, botao opcional), a FINALIDADE e os filtros. Enviado nao muda.
--     INFORMATIVO = relacionamento: rodape com descadastro e respeita email_descadastros.
--     SERVICO = aviso da associacao ao associado (regimento, mudanca de atendimento): sem
--     descadastro, mas respeita a supressao (bounce/reclamacao) como todo envio.
-- (B) email_descadastros: quem pediu para nao receber INFORMATIVO. Nao bloqueia cobranca
--     nem servico (por isso nao e email_supressoes).
-- (C) o envio usa a MESMA fila de e-mail (email_outbox): janela, taxa, modo teste,
--     supressao, webhook e o painel ja valem. Coluna comunicado_id + unique por destinatario;
--     reservar_lote_email recriada (DROP + CREATE) devolvendo comunicado_id.
-- (D) celula `comunicacao_envios` (ver | criar); seed so no financeiro. Quem nao e da
--     matriz so alcanca associados das proprias unidades (regionais_do_usuario).
-- Re-executavel.
-- ============================================================================

-- (D) a grade -----------------------------------------------------------------
create or replace function permissao_celula_valida(p_modulo text, p_acao text)
returns boolean
language sql immutable
as $$
  select (p_modulo, p_acao) in (
    ('painel','ver'), ('painel','exportar'),
    ('sac','ver'), ('sac','criar'), ('sac','editar'), ('sac','transferir'), ('sac','fechar'),
    ('protocolos','ver'), ('protocolos','criar'), ('protocolos','editar'),
      ('protocolos','transferir'), ('protocolos','fechar'),
    ('assistencia','ver'), ('assistencia','criar'), ('assistencia','editar'),
      ('assistencia','excluir'),
      ('assistencia','cancelar'), ('assistencia','transferir'), ('assistencia','fechar'),
    ('vendas','ver'), ('vendas','criar'), ('vendas','editar'), ('vendas','excluir'),
      ('vendas','exportar'), ('vendas','cancelar'), ('vendas','transferir'), ('vendas','fechar'),
    ('associados','ver'), ('associados','criar'), ('associados','editar'),
      ('associados','excluir'), ('associados','exportar'),
    ('veiculos','ver'), ('veiculos','criar'), ('veiculos','editar'), ('veiculos','excluir'),
      ('veiculos','exportar'), ('veiculos','cancelar'),
    ('rastreadores','ver'), ('rastreadores','criar'), ('rastreadores','editar'),
      ('rastreadores','transferir'), ('rastreadores','baixar'),
    ('eventos','ver'), ('eventos','criar'), ('eventos','editar'), ('eventos','excluir'),
      ('eventos','exportar'), ('eventos','cancelar'), ('eventos','transferir'), ('eventos','fechar'),
    ('cobranca','ver'), ('cobranca','criar'), ('cobranca','editar'), ('cobranca','exportar'),
      ('cobranca','baixar'), ('cobranca','cancelar'),
    ('cobranca_emails','ver'), ('cobranca_emails','editar'),
    ('comunicacao_modelos','ver'), ('comunicacao_modelos','editar'),
    ('comunicacao_envios','ver'), ('comunicacao_envios','criar'),
    ('revistoria','ver'), ('revistoria','criar'), ('revistoria','fechar'), ('revistoria','cancelar'),
    ('precificacao','ver'), ('precificacao','editar'), ('precificacao','exportar'),
    ('fornecedores','ver'), ('fornecedores','criar'), ('fornecedores','editar'),
      ('fornecedores','excluir'), ('fornecedores','exportar'),
    ('financeiro','ver'), ('financeiro','criar'), ('financeiro','editar'), ('financeiro','excluir'),
      ('financeiro','exportar'), ('financeiro','baixar'), ('financeiro','estornar'),
      ('financeiro','cancelar'),
    ('financeiro_dre','ver'), ('financeiro_dre','exportar'),
    ('comunicados','ver'), ('comunicados','criar'), ('comunicados','editar'), ('comunicados','excluir'),
    ('termos_modelos','ver'), ('termos_modelos','criar'), ('termos_modelos','editar'),
      ('termos_modelos','excluir'),
    ('termos','ver'), ('termos','criar'), ('termos','exportar'), ('termos','cancelar')
  )
  or (p_modulo in ('cfg_empresa', 'cfg_regionais', 'cfg_vendedores', 'cfg_marcas_modelos',
                   'cfg_tipos_veiculo', 'cfg_cores', 'cfg_cotas', 'cfg_tipos_evento',
                   'cfg_documentos_evento', 'cfg_alertas', 'cfg_produtos', 'cfg_planos',
                   'cfg_contas_bancarias', 'cfg_integracoes', 'cfg_plano_contas',
                   'cfg_centros_custo')
      and p_acao in ('ver', 'criar', 'editar', 'excluir'));
$$;

create or replace function minhas_permissoes()
returns text[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(k order by k), '{}') from (
    select c.modulo || '.' || c.acao as k
      from (
        select m.modulo, a.acao
          from (values ('painel'),('sac'),('protocolos'),('assistencia'),('vendas'),('associados'),
                       ('veiculos'),('rastreadores'),('eventos'),('cobranca'),('cobranca_emails'),('comunicacao_modelos'),('comunicacao_envios'),('revistoria'),
                       ('precificacao'),('fornecedores'),('financeiro'),('financeiro_dre'),('comunicados'),
                       ('termos_modelos'),('termos'),
                       ('cfg_empresa'),('cfg_regionais'),('cfg_vendedores'),('cfg_marcas_modelos'),
                       ('cfg_tipos_veiculo'),('cfg_cores'),('cfg_cotas'),('cfg_tipos_evento'),
                       ('cfg_documentos_evento'),('cfg_alertas'),('cfg_produtos'),('cfg_planos'),
                       ('cfg_contas_bancarias'),('cfg_integracoes'),('cfg_plano_contas'),
                       ('cfg_centros_custo')) m(modulo)
         cross join (values ('ver'),('criar'),('editar'),('excluir'),('exportar'),('baixar'),
                            ('estornar'),('cancelar'),('transferir'),('fechar')) a(acao)
         where permissao_celula_valida(m.modulo, a.acao)
      ) c
     where perfil_pode(c.modulo, c.acao)
    union all
    select k from unnest(array['desconto', 'liberar_24h', 'leads']) k where papel_pode(k)
  ) t;
$$;

insert into perfil_permissoes (papel, modulo, acao, concedida)
select k.papel, 'comunicacao_envios', a.acao, (k.papel = 'financeiro')
  from (select distinct papel from perfil_permissoes) k
 cross join (values ('ver'), ('criar')) a(acao)
 where not exists (select 1 from perfil_permissoes x
                    where x.papel = k.papel and x.modulo = 'comunicacao_envios' and x.acao = a.acao);

create or replace function pode_comunicados(p_acao text default 'ver')
returns boolean
language sql stable security definer set search_path = public
as $$
  select perfil_pode('comunicacao_envios', coalesce(p_acao, 'ver'))
      or (coalesce(p_acao, 'ver') = 'ver' and perfil_pode('comunicacao_envios', 'criar'));
$$;

-- (A) o comunicado --------------------------------------------------------------
create table if not exists comunicados_email (
  id              uuid primary key default gen_random_uuid(),
  nome_interno    text not null,
  finalidade      text not null default 'INFORMATIVO',
  assunto         text not null default '',
  titulo          text not null default '',
  previa          text,
  corpo           text not null default '',
  botao_texto     text,
  botao_url       text,
  filtros         jsonb not null default '{}'::jsonb,
  situacao        text not null default 'RASCUNHO',
  total_enfileirado integer,
  criado_por      uuid references usuarios(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  enviado_por     uuid references usuarios(id) on delete set null,
  enviado_em      timestamptz,
  cancelado_por   uuid references usuarios(id) on delete set null,
  cancelado_em    timestamptz,
  constraint chk_comunicado_finalidade check (finalidade in ('INFORMATIVO', 'SERVICO')),
  constraint chk_comunicado_situacao check (situacao in ('RASCUNHO', 'ENVIADO', 'CANCELADO')),
  constraint chk_comunicado_filtros check (jsonb_typeof(filtros) = 'object'),
  constraint chk_comunicado_botao check (botao_url is null or botao_url ~ '^https://')
);
create index if not exists idx_comunicados_email_criado on comunicados_email (criado_em desc);
alter table comunicados_email enable row level security;
drop policy if exists comunicados_email_select on comunicados_email;
create policy comunicados_email_select on comunicados_email for select to authenticated
  using ((select pode_comunicados('ver')));
revoke all on comunicados_email from anon;

-- (B) descadastro -----------------------------------------------------------------
create table if not exists email_descadastros (
  id        uuid primary key default gen_random_uuid(),
  email     text not null check (email = lower(btrim(email))),
  origem    text,
  criado_em timestamptz not null default now(),
  ativo     boolean not null default true,
  liberado_em  timestamptz,
  liberado_por uuid references usuarios(id) on delete set null
);
create unique index if not exists uq_email_descadastro_ativo on email_descadastros (email) where ativo;
alter table email_descadastros enable row level security;
drop policy if exists email_descadastros_select on email_descadastros;
create policy email_descadastros_select on email_descadastros for select to authenticated
  using ((select pode_comunicados('ver')) or (select pode_emails_cobranca('ver')));
revoke all on email_descadastros from anon;

create or replace function email_descadastrado(p_email text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from email_descadastros d where d.email = email_normalizado(p_email) and d.ativo);
$$;

-- So o servidor (link publico assinado) registra o pedido do associado.
create or replace function registrar_descadastro_email(p_email text, p_origem text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_email text := email_normalizado(p_email);
begin
  if auth.uid() is not null then
    raise exception 'So o link do e-mail registra o descadastro' using errcode = 'insufficient_privilege';
  end if;
  if not email_valido(v_email) then raise exception 'E-mail invalido'; end if;
  if email_descadastrado(v_email) then return; end if;
  insert into email_descadastros (email, origem) values (v_email, left(p_origem, 200));
  update email_outbox o set status = 'cancelado', motivo = 'descadastrado', atualizado_em = now()
   where o.destinatario = v_email and o.status = 'pendente'
     and exists (select 1 from comunicados_email c where c.id = o.comunicado_id and c.finalidade = 'INFORMATIVO');
end;
$$;

-- (C) a fila ------------------------------------------------------------------------
alter table email_outbox add column if not exists comunicado_id uuid references comunicados_email(id) on delete cascade;
create unique index if not exists uq_email_outbox_comunicado on email_outbox (comunicado_id, destinatario)
  where comunicado_id is not null;

-- O publico de um comunicado: uma linha por associado do filtro, com o motivo de ficar fora.
create or replace function comunicado_publico(p_filtros jsonb, p_finalidade text default 'INFORMATIVO')
returns table (cliente_id uuid, nome text, email text, regional_id uuid, motivo_fora text)
language plpgsql stable security definer set search_path = public
as $$
declare
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_cliente uuid := nullif(f->>'cliente_id', '')::uuid;
  v_regionais uuid[] := array(select jsonb_array_elements_text(coalesce(f->'regional_ids', '[]'::jsonb))::uuid);
  v_situacoes text[] := array(select jsonb_array_elements_text(coalesce(f->'situacoes', '[]'::jsonb)));
  v_planos uuid[] := array(select jsonb_array_elements_text(coalesce(f->'plano_ids', '[]'::jsonb))::uuid);
  v_tipos uuid[] := array(select jsonb_array_elements_text(coalesce(f->'tipo_veiculo_ids', '[]'::jsonb))::uuid);
  v_global boolean := tem_acesso_global() or auth.uid() is null;
  v_alcance uuid[] := regionais_do_usuario();
begin
  if auth.uid() is not null and not pode_comunicados('ver') then
    raise exception 'Sem permissao' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(array_length(v_situacoes, 1), 0) = 0 then
    v_situacoes := array['ativo', 'inadimplente', 'em_evento', 'vistoria_pendente', 'suspenso'];
  end if;

  return query
  with base as (
    select c.id, c.nome_razao_social::text as nome, email_normalizado(c.email) as em, c.regional_id
      from clientes c
     where c.status::text <> 'cancelado'
       and (v_global or c.regional_id = any(v_alcance))
       and (
         (v_cliente is not null and c.id = v_cliente)
         or (v_cliente is null
             and (coalesce(array_length(v_regionais, 1), 0) = 0 or c.regional_id = any(v_regionais))
             and exists (
               select 1 from veiculos v
                where v.cliente_id = c.id
                  and v.status::text = any(v_situacoes)
                  and (coalesce(array_length(v_planos, 1), 0) = 0 or v.plano_protecao_id = any(v_planos))
                  and (coalesce(array_length(v_tipos, 1), 0) = 0 or v.tipo_veiculo_id = any(v_tipos))))
       )
  ), marcado as (
    select b.*, row_number() over (partition by b.em order by b.nome, b.id) as rn
      from base b
  )
  select m.id, m.nome, m.em, m.regional_id,
         case
           when not email_valido(m.em) then 'SEM_EMAIL'
           when m.rn > 1 then 'EMAIL_REPETIDO'
           when email_suprimido(m.em) then 'SUPRIMIDO'
           when coalesce(p_finalidade, 'INFORMATIVO') = 'INFORMATIVO' and email_descadastrado(m.em) then 'DESCADASTRADO'
         end
    from marcado m;
end;
$$;

-- A previa que a tela mostra antes de enviar.
create or replace function comunicado_previa_publico(p_filtros jsonb, p_finalidade text default 'INFORMATIVO')
returns jsonb
language sql stable security definer set search_path = public
as $$
  with p as (select * from comunicado_publico(p_filtros, p_finalidade))
  select jsonb_build_object(
    'associados', count(*),
    'recebem', count(*) filter (where motivo_fora is null),
    'sem_email', count(*) filter (where motivo_fora = 'SEM_EMAIL'),
    'email_repetido', count(*) filter (where motivo_fora = 'EMAIL_REPETIDO'),
    'suprimidos', count(*) filter (where motivo_fora = 'SUPRIMIDO'),
    'descadastrados', count(*) filter (where motivo_fora = 'DESCADASTRADO'),
    'amostra', coalesce((select jsonb_agg(jsonb_build_object('nome', x.nome, 'email', x.email))
                          from (select nome, email from p where motivo_fora is null order by nome limit 10) x), '[]'::jsonb)
  ) from p;
$$;

create or replace function salvar_comunicado_email(p_id uuid, p_dados jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid := p_id; v_sit text;
begin
  if not pode_comunicados('criar') then
    raise exception 'Sem permissao para criar comunicados' using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_dados->>'nome_interno', ''))) < 3 then raise exception 'Informe um nome para o comunicado'; end if;
  if coalesce(p_dados->>'finalidade', 'INFORMATIVO') not in ('INFORMATIVO', 'SERVICO') then raise exception 'Finalidade invalida'; end if;
  if length(coalesce(p_dados->>'assunto', '')) > 150 or length(coalesce(p_dados->>'titulo', '')) > 120
     or length(coalesce(p_dados->>'previa', '')) > 200 or length(coalesce(p_dados->>'corpo', '')) > 5000 then
    raise exception 'Texto acima do tamanho permitido';
  end if;
  if v_id is not null then
    select situacao into v_sit from comunicados_email where id = v_id;
    if v_sit is null then raise exception 'Comunicado nao encontrado'; end if;
    if v_sit <> 'RASCUNHO' then raise exception 'Comunicado ja enviado ou cancelado nao muda'; end if;
    update comunicados_email set
      nome_interno = btrim(p_dados->>'nome_interno'),
      finalidade = coalesce(p_dados->>'finalidade', 'INFORMATIVO'),
      assunto = coalesce(p_dados->>'assunto', ''), titulo = coalesce(p_dados->>'titulo', ''),
      previa = nullif(btrim(coalesce(p_dados->>'previa', '')), ''), corpo = coalesce(p_dados->>'corpo', ''),
      botao_texto = nullif(btrim(coalesce(p_dados->>'botao_texto', '')), ''),
      botao_url = nullif(btrim(coalesce(p_dados->>'botao_url', '')), ''),
      filtros = coalesce(p_dados->'filtros', '{}'::jsonb), atualizado_em = now()
     where id = v_id;
  else
    insert into comunicados_email (nome_interno, finalidade, assunto, titulo, previa, corpo, botao_texto, botao_url, filtros, criado_por)
    values (btrim(p_dados->>'nome_interno'), coalesce(p_dados->>'finalidade', 'INFORMATIVO'),
            coalesce(p_dados->>'assunto', ''), coalesce(p_dados->>'titulo', ''),
            nullif(btrim(coalesce(p_dados->>'previa', '')), ''), coalesce(p_dados->>'corpo', ''),
            nullif(btrim(coalesce(p_dados->>'botao_texto', '')), ''), nullif(btrim(coalesce(p_dados->>'botao_url', '')), ''),
            coalesce(p_dados->'filtros', '{}'::jsonb), usuario_atual_id())
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Enviar = enfileirar na fila de e-mail. Depois disso o comunicado nao muda mais.
create or replace function enviar_comunicado_email(p_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  c comunicados_email;
  cfg email_config;
  v_dia date := data_sp(now());
  v_n integer;
begin
  if not pode_comunicados('criar') then
    raise exception 'Sem permissao para enviar comunicados' using errcode = 'insufficient_privilege';
  end if;
  select * into c from comunicados_email where id = p_id for update;
  if not found then raise exception 'Comunicado nao encontrado'; end if;
  if c.situacao <> 'RASCUNHO' then raise exception 'Este comunicado ja foi enviado ou cancelado'; end if;
  if btrim(c.assunto) = '' or btrim(c.titulo) = '' or btrim(c.corpo) = '' then
    raise exception 'Preencha assunto, titulo e texto antes de enviar';
  end if;
  select * into cfg from email_config where id;
  -- depois do fim da janela de envio, a fila e do dia seguinte (senao expiraria)
  if (now() at time zone 'America/Sao_Paulo')::time >= cfg.janela_fim then v_dia := v_dia + 1; end if;

  insert into email_outbox (comunicado_id, cliente_id, regua_codigo, template, destinatario, data_alvo, assunto)
  select c.id, p.cliente_id, 'comunicado', 'comunicado', p.email, v_dia, c.assunto
    from comunicado_publico(c.filtros, c.finalidade) p
   where p.motivo_fora is null
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Nenhum destinatario recebe este comunicado com os filtros escolhidos'; end if;

  update comunicados_email set situacao = 'ENVIADO', total_enfileirado = v_n,
         enviado_por = usuario_atual_id(), enviado_em = now(), atualizado_em = now()
   where id = c.id;
  return v_n;
end;
$$;

-- Cancelar: rascunho some da fila de trabalho; enviado para de sair (o que ja saiu, saiu).
create or replace function cancelar_comunicado_email(p_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_n integer := 0; v_sit text;
begin
  if not pode_comunicados('criar') then
    raise exception 'Sem permissao' using errcode = 'insufficient_privilege';
  end if;
  select situacao into v_sit from comunicados_email where id = p_id;
  if v_sit is null then raise exception 'Comunicado nao encontrado'; end if;
  if v_sit = 'CANCELADO' then return 0; end if;
  update email_outbox set status = 'cancelado', motivo = 'comunicado cancelado', atualizado_em = now()
   where comunicado_id = p_id and status = 'pendente';
  get diagnostics v_n = row_count;
  update comunicados_email set situacao = 'CANCELADO', cancelado_por = usuario_atual_id(), cancelado_em = now(),
         atualizado_em = now()
   where id = p_id;
  return v_n;
end;
$$;

create or replace function comunicados_email_listar()
returns table (
  id uuid, nome_interno text, finalidade text, assunto text, situacao text, criado_em timestamptz,
  enviado_em timestamptz, criado_por_nome text, total integer,
  pendentes integer, enviados integer, entregues integer, falhas integer, cancelados integer
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.nome_interno, c.finalidade, c.assunto, c.situacao, c.criado_em, c.enviado_em, u.nome,
         c.total_enfileirado,
         count(o.id) filter (where o.status in ('pendente', 'enviando'))::int,
         count(o.id) filter (where o.status in ('enviado', 'entregue'))::int,
         count(o.id) filter (where o.status = 'entregue')::int,
         count(o.id) filter (where o.status in ('falhou', 'bounce', 'reclamado'))::int,
         count(o.id) filter (where o.status in ('cancelado', 'suprimido', 'expirado'))::int
    from comunicados_email c
    left join usuarios u on u.id = c.criado_por
    left join email_outbox o on o.comunicado_id = c.id
   where pode_comunicados('ver')
   group by c.id, u.nome
   order by c.criado_em desc
   limit 200;
$$;

-- A fila devolve o comunicado (DROP + CREATE: muda a lista de colunas).
drop function if exists reservar_lote_email(int, timestamptz);
create or replace function reservar_lote_email(p_limite int default 50, p_agora timestamptz default null)
returns table (
  id uuid, titulo_id uuid, cliente_id uuid, regua_codigo text, template text,
  destinatario text, tentativas int, cliente_nome text, valor numeric, data_vencimento date,
  linha_digitavel text, pix_copia_cola text, titulo_status text, comunicado_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  cfg email_config;
  v_agora timestamptz := coalesce(p_agora, now());
  v_hora time := (v_agora at time zone 'America/Sao_Paulo')::time;
  v_dow int := extract(isodow from (v_agora at time zone 'America/Sao_Paulo'));
begin
  if auth.uid() is not null then
    raise exception 'So a rotina reserva o lote' using errcode = 'insufficient_privilege';
  end if;
  select * into cfg from email_config c where c.id;
  if cfg.pausado then return; end if;
  if v_hora < cfg.janela_inicio or v_hora >= cfg.janela_fim then return; end if;
  if v_dow = 7 and not cfg.permite_domingo then return; end if;

  -- reserva que ficou presa (processo caiu no meio) volta para a fila
  update email_outbox o set status = 'pendente', reservado_em = null, atualizado_em = now()
   where o.status = 'enviando' and o.reservado_em < v_agora - interval '15 minutes';

  return query
  with lote as (
    select o.id from email_outbox o
     where o.status = 'pendente' and o.proxima_tentativa_em <= v_agora
       and o.data_alvo = data_sp(v_agora)
     order by o.proxima_tentativa_em, o.criado_em
     limit greatest(1, least(coalesce(p_limite, 50), cfg.lote_maximo))
     for update skip locked
  ), marcados as (
    update email_outbox o set status = 'enviando', reservado_em = v_agora,
           tentativas = o.tentativas + 1, atualizado_em = now()
      from lote where o.id = lote.id
    returning o.*
  )
  select m.id, m.titulo_id, m.cliente_id, m.regua_codigo, m.template, m.destinatario, m.tentativas,
         c.nome_razao_social, t.valor, t.data_vencimento, t.linha_digitavel, t.pix_copia_cola, t.status::text, m.comunicado_id
    from marcados m
    left join titulos_financeiros t on t.id = m.titulo_id
    left join clientes c on c.id = m.cliente_id;
end;
$$;

-- rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
