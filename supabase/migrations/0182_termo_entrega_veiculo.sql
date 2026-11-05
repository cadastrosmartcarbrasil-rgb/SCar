-- ============================================================================
-- 0182 — TERMO DE ENTREGA DE VEICULO REPARADO (aba Termos do evento)
-- ----------------------------------------------------------------------------
-- Pedido do usuario (05/11/2026): no evento, uma aba "Termos" com a emissao do
-- termo de entrega. A entrega pode ser PARCIAL ou TOTAL, entao um evento pode
-- ter VARIOS termos. Quem assina e o recebedor (associado ou terceiro), na
-- oficina, na hora de receber o veiculo: a oficina imprime, colhe a assinatura
-- e devolve a imagem, que a equipe anexa ao termo.
--
-- Reaproveita o modulo de Termos (0123) e o escopo EVENTO da OS (0181):
--   * modelo tipo ENTREGA_VEICULO, escopo EVENTO (Configuracoes -> Termos);
--   * cada emissao = 1 termos_emitidos (protocolo TRM-, HTML congelado + hash,
--     PDF) + 1 linha em termos_entrega (recebedor, veiculo, OS, data, situacao);
--   * a via ASSINADA e um anexo do evento (TERMO_ENTREGA_ASSINADO) ligado ao
--     termo; anexar de novo substitui (o anexo anterior fica no evento).
-- Permissao: a do EVENTO (pode_tratar_evento). Le quem ve o evento da unidade.
-- Nada vai ao portal do associado (chk_termo_evento_fora_portal, 0181).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Tipo de modelo
-- ----------------------------------------------------------------------------
alter table termos_modelos drop constraint if exists chk_termo_modelo_tipo;
alter table termos_modelos add constraint chk_termo_modelo_tipo
  check (tipo in ('CONTRATO','REGULAMENTO','RASTREADOR','ADITIVO','CANCELAMENTO',
                  'DECLARACAO','OUTRO','ORDEM_SERVICO','ENTREGA_VEICULO'));
alter table termos_modelos drop constraint if exists chk_termo_os_escopo_evento;
alter table termos_modelos drop constraint if exists chk_termo_evento_escopo;
alter table termos_modelos add constraint chk_termo_evento_escopo
  check ((tipo in ('ORDEM_SERVICO','ENTREGA_VEICULO')) = (escopo = 'EVENTO'));

-- O termo do associado (0123) recusa modelo de EVENTO; a mensagem da 0181 so
-- falava da OS.
do $$
declare d text;
begin
  select pg_get_functiondef('registrar_termo_emitido(uuid,uuid,uuid,text,text[],boolean)'::regprocedure) into d;
  if position('0182:' in d) = 0 then
    d := replace(d, 'Este modelo e emitido pela Ordem de Servico do evento.',
                    '0182: este modelo e do evento: emita pela Ordem de Servico ou pela aba Termos do evento.');
    if position('0182:' in d) > 0 then
      execute d;
    end if;
  end if;
end $$;

alter type tipo_documento_anexo add value if not exists 'TERMO_ENTREGA';
alter type tipo_documento_anexo add value if not exists 'TERMO_ENTREGA_ASSINADO';

-- ----------------------------------------------------------------------------
-- (B) termos_entrega
-- ----------------------------------------------------------------------------
create table if not exists termos_entrega (
  id                  uuid primary key default gen_random_uuid(),
  termo_emitido_id    uuid not null unique references termos_emitidos(id) on delete restrict,
  evento_id           uuid not null references eventos_sinistro(id) on delete restrict,
  cliente_id          uuid not null references clientes(id) on delete restrict,
  regional_id         uuid references regionais(id) on delete set null,
  recebedor_tipo      text not null,
  evento_terceiro_id  uuid references evento_terceiros(id) on delete restrict,
  ordem_servico_id    uuid references ordens_servico(id) on delete restrict,
  fornecedor_id       uuid references fornecedores(id) on delete restrict,
  abrangencia         text not null default 'TOTAL',
  descricao           text,
  data_entrega        date not null,
  situacao            text not null default 'AGUARDANDO_ASSINATURA',
  assinado_anexo_id   uuid references anexos_evento(id) on delete restrict,
  assinado_em         timestamptz,
  assinado_registrado_por uuid references usuarios(id) on delete set null,
  emitido_por         uuid references usuarios(id) on delete set null,
  emitido_em          timestamptz not null default now(),
  cancelado_em        timestamptz,
  cancelado_por       uuid references usuarios(id) on delete set null,
  cancelamento_motivo text,
  constraint chk_entrega_recebedor check (recebedor_tipo in ('ASSOCIADO','TERCEIRO')),
  constraint chk_entrega_terceiro check ((recebedor_tipo = 'TERCEIRO') = (evento_terceiro_id is not null)),
  constraint chk_entrega_abrangencia check (abrangencia in ('TOTAL','PARCIAL')),
  constraint chk_entrega_parcial_descricao check (abrangencia = 'TOTAL' or btrim(coalesce(descricao, '')) <> ''),
  constraint chk_entrega_situacao check (situacao in ('AGUARDANDO_ASSINATURA','ASSINADO','CANCELADO')),
  constraint chk_entrega_assinado check ((situacao = 'ASSINADO') = (assinado_anexo_id is not null) or situacao = 'CANCELADO')
);
create index if not exists idx_termos_entrega_evento on termos_entrega (evento_id, emitido_em desc);

comment on table termos_entrega is
  'Termo de entrega do veiculo reparado (0182): varios por evento (entrega parcial ou total), assinado na oficina e anexado.';

-- Conteudo imutavel: so a assinatura e o cancelamento mudam; nunca se apaga.
create or replace function fn_termo_entrega_imutavel()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Termo de entrega nao se apaga: cancele com motivo.' using errcode = 'check_violation';
  end if;
  if new.termo_emitido_id is distinct from old.termo_emitido_id
     or new.evento_id is distinct from old.evento_id
     or new.cliente_id is distinct from old.cliente_id
     or new.recebedor_tipo is distinct from old.recebedor_tipo
     or new.evento_terceiro_id is distinct from old.evento_terceiro_id
     or new.ordem_servico_id is distinct from old.ordem_servico_id
     or new.fornecedor_id is distinct from old.fornecedor_id
     or new.abrangencia is distinct from old.abrangencia
     or new.descricao is distinct from old.descricao
     or new.data_entrega is distinct from old.data_entrega
     or new.emitido_por is distinct from old.emitido_por
     or new.emitido_em is distinct from old.emitido_em then
    raise exception 'O conteudo do termo de entrega nao muda: cancele e emita outro.' using errcode = 'check_violation';
  end if;
  if old.situacao = 'CANCELADO' and new.situacao <> 'CANCELADO' then
    raise exception 'Termo cancelado nao volta.' using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists trg_termo_entrega_imutavel on termos_entrega;
create trigger trg_termo_entrega_imutavel before update or delete on termos_entrega
  for each row execute function fn_termo_entrega_imutavel();

alter table termos_entrega enable row level security;
drop policy if exists termos_entrega_select on termos_entrega;
create policy termos_entrega_select on termos_entrega for select to authenticated using (
  (select tem_acesso_global())
  or ((select is_staff()) and regional_id = any ((select regionais_do_usuario())::uuid[]))
);
revoke all on termos_entrega from anon;
grant select on termos_entrega to authenticated;

-- ----------------------------------------------------------------------------
-- (C) Emissao
-- ----------------------------------------------------------------------------
-- O HTML chega preenchido pela rota (src/lib/termos.ts) com a marca
-- {{PROTOCOLO_DO_TERMO}}, trocada aqui antes do hash.
create or replace function emitir_termo_entrega(
  p_versao_id     uuid,
  p_dados         jsonb,
  p_html          text,
  p_campos_vazios text[] default '{}'
)
returns termos_entrega
language plpgsql security definer set search_path = public
as $$
declare
  v    termos_versoes;
  m    termos_modelos;
  ev   eventos_sinistro;
  os   ordens_servico;
  te   termos_emitidos;
  t    termos_entrega;
  tipo text;
  terc uuid;
  abr  text;
  dt   date;
  html text;
  prot text;
  quem text;
begin
  select * into ev from eventos_sinistro where id = nullif(p_dados->>'evento_id', '')::uuid;
  if not found then
    raise exception 'Evento nao encontrado.' using errcode = 'no_data_found';
  end if;
  if not pode_tratar_evento(ev.regional_id) then
    raise exception 'Seu perfil nao emite termo neste evento.' using errcode = 'insufficient_privilege';
  end if;
  select * into v from termos_versoes where id = p_versao_id;
  if not found then
    raise exception 'Versao do modelo nao encontrada.' using errcode = 'no_data_found';
  end if;
  select * into m from termos_modelos where id = v.modelo_id;
  if m.tipo <> 'ENTREGA_VEICULO' or not m.ativo then
    raise exception 'Este modelo nao e um Termo de Entrega ativo.' using errcode = 'check_violation';
  end if;

  tipo := coalesce(p_dados->>'recebedor_tipo', 'ASSOCIADO');
  if tipo not in ('ASSOCIADO','TERCEIRO') then
    raise exception 'Recebedor invalido.' using errcode = 'check_violation';
  end if;
  terc := nullif(p_dados->>'evento_terceiro_id', '')::uuid;
  if tipo = 'TERCEIRO' then
    if terc is null or not exists (select 1 from evento_terceiros x where x.id = terc and x.evento_id = ev.id) then
      raise exception 'Escolha o terceiro deste evento que recebe o veiculo.' using errcode = 'check_violation';
    end if;
  else
    terc := null;
  end if;

  if nullif(p_dados->>'ordem_servico_id', '') is not null then
    select * into os from ordens_servico where id = (p_dados->>'ordem_servico_id')::uuid;
    if not found or os.evento_id <> ev.id then
      raise exception 'A Ordem de Servico nao e deste evento.' using errcode = 'check_violation';
    end if;
    if os.status in ('CANCELADA','SUBSTITUIDA') then
      raise exception 'A Ordem de Servico % esta %.', os.numero, lower(os.status) using errcode = 'check_violation';
    end if;
  end if;

  abr := coalesce(p_dados->>'abrangencia', 'TOTAL');
  if abr not in ('TOTAL','PARCIAL') then
    raise exception 'Informe se a entrega e total ou parcial.' using errcode = 'check_violation';
  end if;
  if abr = 'PARCIAL' and btrim(coalesce(p_dados->>'descricao', '')) = '' then
    raise exception 'Entrega parcial: descreva o que foi entregue (e o que fica pendente).' using errcode = 'check_violation';
  end if;

  dt := nullif(p_dados->>'data_entrega', '')::date;
  if dt is null then
    raise exception 'Informe a data da entrega.' using errcode = 'check_violation';
  end if;
  if dt > data_sp(now()) + 30 then
    raise exception 'A data da entrega esta longe demais no futuro.' using errcode = 'check_violation';
  end if;
  if ev.data_ocorrencia is not null and dt < ev.data_ocorrencia::date then
    raise exception 'A entrega nao pode ser antes da ocorrencia do evento.' using errcode = 'check_violation';
  end if;
  if btrim(coalesce(p_html, '')) = '' then
    raise exception 'Texto do termo vazio.' using errcode = 'check_violation';
  end if;

  prot := proximo_protocolo_termo();
  html := replace(p_html, '{{PROTOCOLO_DO_TERMO}}', prot);

  insert into termos_emitidos (protocolo, modelo_id, versao_id, cliente_id, veiculo_id, regional_id,
                               evento_id, fornecedor_id, titulo, conteudo_html, html_sha256,
                               campos_vazios, visivel_portal, emitido_por)
  values (prot, m.id, v.id, ev.cliente_id, ev.veiculo_id, ev.regional_id, ev.id, os.fornecedor_id,
          v.nome || ' ' || prot, html, termo_sha256(html), coalesce(p_campos_vazios, '{}'), false,
          usuario_atual_id())
  returning * into te;

  insert into termos_entrega (termo_emitido_id, evento_id, cliente_id, regional_id, recebedor_tipo,
                              evento_terceiro_id, ordem_servico_id, fornecedor_id, abrangencia, descricao,
                              data_entrega, emitido_por)
  values (te.id, ev.id, ev.cliente_id, ev.regional_id, tipo, terc, os.id, os.fornecedor_id, abr,
          nullif(btrim(coalesce(p_dados->>'descricao', '')), ''), dt, usuario_atual_id())
  returning * into t;

  quem := case when tipo = 'TERCEIRO'
               then 'terceiro ' || coalesce((select x.nome from evento_terceiros x where x.id = terc), '')
               else 'associado' end;
  insert into historico_protocolo (evento_id, usuario_origem_id, acao_realizada, observacoes)
  values (ev.id, usuario_atual_id(), 'TERMO_ENTREGA_EMITIDO',
          'Termo de entrega ' || prot || ' (' || lower(abr) || ') · recebedor: ' || quem
          || ' · entrega em ' || to_char(dt, 'DD/MM/YYYY')
          || coalesce(' · OS ' || os.numero, ''));
  return t;
end;
$$;

-- PDF (uma vez) + anexo do evento com o PDF gerado.
create or replace function anexar_pdf_termo_entrega(p_id uuid, p_path text, p_sha256 text, p_bytes int)
returns void
language plpgsql security definer set search_path = public
as $$
declare t termos_entrega; te termos_emitidos;
begin
  select * into t from termos_entrega where id = p_id;
  if not found then
    raise exception 'Termo de entrega nao encontrado.' using errcode = 'no_data_found';
  end if;
  if auth.uid() is not null and not pode_tratar_evento(t.regional_id) then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;
  update termos_emitidos set pdf_path = p_path, pdf_sha256 = p_sha256, pdf_bytes = p_bytes
   where id = t.termo_emitido_id and pdf_path is null;
  select * into te from termos_emitidos where id = t.termo_emitido_id;
  insert into anexos_evento (evento_id, tipo_documento, arquivo_url, nome_original, tamanho_bytes,
                             uploaded_by, termo_emitido_id)
  select t.evento_id, 'TERMO_ENTREGA'::tipo_documento_anexo, p_path, 'Termo de entrega ' || te.protocolo || '.pdf',
         p_bytes, usuario_atual_id(), t.termo_emitido_id
   where not exists (select 1 from anexos_evento a where a.termo_emitido_id = t.termo_emitido_id);
end;
$$;

-- A via ASSINADA (foto/PDF devolvido pela oficina). O arquivo ja subiu ao
-- bucket do evento pela tela; aqui vira anexo e o termo fica ASSINADO.
-- Anexar de novo troca a via (a anterior continua nos anexos do evento).
create or replace function registrar_termo_entrega_assinado(
  p_id uuid, p_path text, p_nome text, p_bytes int
)
returns termos_entrega
language plpgsql security definer set search_path = public
as $$
declare t termos_entrega; te termos_emitidos; a uuid; troca boolean;
begin
  select * into t from termos_entrega where id = p_id for update;
  if not found then
    raise exception 'Termo de entrega nao encontrado.' using errcode = 'no_data_found';
  end if;
  if not pode_tratar_evento(t.regional_id) then
    raise exception 'Seu perfil nao registra a assinatura neste evento.' using errcode = 'insufficient_privilege';
  end if;
  if t.situacao = 'CANCELADO' then
    raise exception 'Termo cancelado: emita outro.' using errcode = 'check_violation';
  end if;
  if btrim(coalesce(p_path, '')) = '' or split_part(p_path, '/', 1) <> t.evento_id::text then
    raise exception 'Arquivo invalido para este evento.' using errcode = 'check_violation';
  end if;
  if p_bytes is not null and p_bytes > 10 * 1024 * 1024 then
    raise exception 'Arquivo maior que 10 MB.' using errcode = 'check_violation';
  end if;
  select * into te from termos_emitidos where id = t.termo_emitido_id;
  troca := t.situacao = 'ASSINADO';
  insert into anexos_evento (evento_id, tipo_documento, arquivo_url, nome_original, tamanho_bytes, uploaded_by)
  values (t.evento_id, 'TERMO_ENTREGA_ASSINADO'::tipo_documento_anexo, p_path,
          coalesce(nullif(btrim(p_nome), ''), 'Termo assinado ' || te.protocolo), p_bytes, usuario_atual_id())
  returning id into a;
  update termos_entrega set situacao = 'ASSINADO', assinado_anexo_id = a, assinado_em = now(),
         assinado_registrado_por = usuario_atual_id()
   where id = t.id returning * into t;
  insert into historico_protocolo (evento_id, usuario_origem_id, acao_realizada, observacoes)
  values (t.evento_id, usuario_atual_id(), 'TERMO_ENTREGA_ASSINADO',
          'Via assinada do termo de entrega ' || te.protocolo
          || case when troca then ' substituida' else ' anexada' end);
  return t;
end;
$$;

create or replace function cancelar_termo_entrega(p_id uuid, p_motivo text)
returns termos_entrega
language plpgsql security definer set search_path = public
as $$
declare t termos_entrega; te termos_emitidos;
begin
  select * into t from termos_entrega where id = p_id for update;
  if not found then
    raise exception 'Termo de entrega nao encontrado.' using errcode = 'no_data_found';
  end if;
  if not pode_tratar_evento(t.regional_id) then
    raise exception 'Sem permissao.' using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'check_violation';
  end if;
  if t.situacao = 'CANCELADO' then
    raise exception 'Termo ja cancelado.' using errcode = 'check_violation';
  end if;
  update termos_entrega set situacao = 'CANCELADO', cancelado_em = now(), cancelado_por = usuario_atual_id(),
         cancelamento_motivo = btrim(p_motivo)
   where id = t.id returning * into t;
  update termos_emitidos set situacao = 'CANCELADO', cancelado_por = usuario_atual_id(), cancelado_em = now(),
         cancelamento_motivo = btrim(p_motivo)
   where id = t.termo_emitido_id and situacao <> 'CANCELADO'
  returning * into te;
  insert into historico_protocolo (evento_id, usuario_origem_id, acao_realizada, observacoes)
  values (t.evento_id, usuario_atual_id(), 'TERMO_ENTREGA_CANCELADO',
          'Termo de entrega ' || coalesce(te.protocolo, '') || ' cancelado: ' || btrim(p_motivo));
  return t;
end;
$$;

-- ----------------------------------------------------------------------------
-- Rito de seguranca (0052)
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
