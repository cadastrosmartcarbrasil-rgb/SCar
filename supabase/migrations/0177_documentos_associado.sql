-- ============================================================================
-- 0177 — DOCUMENTOS DO ASSOCIADO (aba Anexos) E A VALIDADE DA CNH
--
-- Pedido do usuario (04/11/2026): a ficha do associado ganha os documentos
-- pessoais — identidade (RG/CNH), comprovante de endereco e outros. A CNH exige
-- a data de VENCIMENTO: no evento, o sistema reconhece que temos a CNH e diz se
-- ela esta vencida, para pedir uma nova. Os documentos sao item de AUDITORIA:
-- (1) na primeira entrada do associado (checklist da venda); (2) quando a CNH
-- vence (fila de auditoria de documentos).
--
--   (A) `associado_documentos` — do associado OU do lead (a venda anexa antes de
--       o associado existir; a autorizacao leva o documento para a ficha).
--       CNH sem validade e recusada pelo banco. Teto de 10 MB (padrao 0047).
--       Arquivo no bucket `vendas` (policy de staff ja existente), caminho
--       `associados/<cliente ou lead-id>/...` — nenhuma policy nova em storage.
--   (B) situacao AGUARDANDO -> CONFERIDO | RECUSADO; a CNH nova SUBSTITUI a
--       anterior. Conferir/recusar = `pode_auditar()` (vendas.fechar).
--   (C) `checklist_lead` (corpo da 0161) + 3 itens: identidade, comprovante e,
--       havendo CNH, a validade. Associado da base que ja tem os documentos
--       passa sem reenviar.
--   (D) leads.cliente_id preenchido (a autorizacao) leva os documentos do lead
--       para o associado, ja CONFERIDOS por quem autorizou.
--   (E) `cliente_documentacao` (resumo para ficha, SAC e evento) e
--       `auditoria_documentos_associados` (a fila: aguardando conferencia,
--       CNH vencida — com a marca de evento em aberto —, recusados).
-- A base existente NAO passa a ser bloqueada: nada trava fora do checklist da
-- venda; a CNH vencida aparece na fila e nos avisos.
-- ============================================================================

-- (A) --------------------------------------------------------------------------
create table if not exists associado_documentos (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid references clientes(id) on delete cascade,
  lead_id        uuid references leads(id) on delete set null,
  tipo           text not null,
  descricao      text,
  numero         text,
  validade       date,
  url            text not null,
  nome_arquivo   text,
  mime           text,
  tamanho_bytes  bigint,
  situacao       text not null default 'AGUARDANDO',
  conferido_por  uuid references usuarios(id) on delete set null,
  conferido_em   timestamptz,
  motivo_recusa  text,
  enviado_por    uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint chk_assoc_doc_dono check (cliente_id is not null or lead_id is not null),
  constraint chk_assoc_doc_tipo check (tipo in ('RG','CNH','CPF','COMPROVANTE_ENDERECO','CONTRATO_SOCIAL','OUTRO')),
  constraint chk_assoc_doc_situacao check (situacao in ('AGUARDANDO','CONFERIDO','RECUSADO','SUBSTITUIDO')),
  constraint chk_assoc_doc_cnh_validade check (tipo <> 'CNH' or validade is not null),
  constraint chk_assoc_doc_outro check (tipo <> 'OUTRO' or length(btrim(coalesce(descricao, ''))) > 0),
  constraint chk_assoc_doc_tamanho check (tamanho_bytes is null or tamanho_bytes <= 10485760),
  constraint chk_assoc_doc_recusa check (situacao <> 'RECUSADO' or length(btrim(coalesce(motivo_recusa, ''))) > 0)
);

create index if not exists idx_assoc_doc_cliente on associado_documentos (cliente_id, tipo);
create index if not exists idx_assoc_doc_lead on associado_documentos (lead_id) where lead_id is not null;
create index if not exists idx_assoc_doc_aguardando on associado_documentos (created_at) where situacao = 'AGUARDANDO';

drop trigger if exists trg_assoc_doc_updated on associado_documentos;
create trigger trg_assoc_doc_updated before update on associado_documentos
  for each row execute function set_updated_at();

-- RLS: ve quem ve o associado (ou o lead) — a policy das tabelas-mae decide.
alter table associado_documentos enable row level security;
drop policy if exists assoc_doc_select on associado_documentos;
create policy assoc_doc_select on associado_documentos for select to authenticated using (
  (select is_staff()) and (
    (cliente_id is not null and exists (select 1 from clientes c where c.id = cliente_id))
    or (lead_id is not null and exists (select 1 from leads l where l.id = lead_id))
  )
);
drop policy if exists assoc_doc_insert on associado_documentos;
create policy assoc_doc_insert on associado_documentos for insert to authenticated with check (
  (select is_staff()) and (
    (cliente_id is not null and exists (select 1 from clientes c where c.id = cliente_id))
    or (cliente_id is null and lead_id is not null and exists (select 1 from leads l where l.id = lead_id))
  )
);
-- Apagar: o que ainda nao foi conferido, ou a auditoria. Conferir e RPC.
drop policy if exists assoc_doc_delete on associado_documentos;
create policy assoc_doc_delete on associado_documentos for delete to authenticated using (
  (select is_staff()) and (situacao <> 'CONFERIDO' or (select pode_auditar())) and (
    (cliente_id is not null and exists (select 1 from clientes c where c.id = cliente_id))
    or (lead_id is not null and exists (select 1 from leads l where l.id = lead_id))
  )
);
grant select, insert, delete on associado_documentos to authenticated;

-- (B) --------------------------------------------------------------------------
-- A CNH vigente e a de maior validade; as outras viram SUBSTITUIDO.
create or replace function cnh_marcar_substituidas(p_cliente uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vigente uuid;
begin
  if p_cliente is null then return; end if;
  select id into v_vigente
    from associado_documentos
   where cliente_id = p_cliente and tipo = 'CNH' and situacao in ('AGUARDANDO', 'CONFERIDO')
   order by validade desc, created_at desc, id desc
   limit 1;
  if v_vigente is null then return; end if;
  update associado_documentos
     set situacao = 'SUBSTITUIDO'
   where cliente_id = p_cliente and tipo = 'CNH'
     and situacao in ('AGUARDANDO', 'CONFERIDO') and id <> v_vigente;
end;
$$;

create or replace function fn_assoc_doc_antes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.situacao      := 'AGUARDANDO';
  new.conferido_por := null;
  new.conferido_em  := null;
  new.motivo_recusa := null;
  new.enviado_por   := coalesce(usuario_atual_id(), new.enviado_por);
  new.tipo          := upper(btrim(new.tipo));
  new.numero        := nullif(btrim(coalesce(new.numero, '')), '');
  new.descricao     := nullif(btrim(coalesce(new.descricao, '')), '');
  return new;
end;
$$;

drop trigger if exists trg_assoc_doc_antes on associado_documentos;
create trigger trg_assoc_doc_antes before insert on associado_documentos
  for each row execute function fn_assoc_doc_antes();

create or replace function fn_assoc_doc_depois()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo = 'CNH' then perform cnh_marcar_substituidas(new.cliente_id); end if;
  return new;
end;
$$;

drop trigger if exists trg_assoc_doc_depois on associado_documentos;
create trigger trg_assoc_doc_depois after insert on associado_documentos
  for each row execute function fn_assoc_doc_depois();

create or replace function conferir_documento_associado(p_documento uuid, p_aprovar boolean, p_motivo text default null)
returns associado_documentos
language plpgsql
security definer
set search_path = public
as $$
declare
  d associado_documentos;
  v_ok boolean;
begin
  if not pode_auditar() then
    raise exception 'Somente a auditoria confere documentos do associado.' using errcode = '42501';
  end if;
  select * into d from associado_documentos where id = p_documento for update;
  if not found then
    raise exception 'Documento nao encontrado.' using errcode = 'P0002';
  end if;
  -- o alcance da unidade (a RPC ignora RLS)
  select tem_acesso_global()
      or (d.cliente_id is not null and exists (select 1 from clientes c where c.id = d.cliente_id and pode_regional(c.regional_id)))
      or (d.cliente_id is null and d.lead_id is not null and pode_tratar_lead(d.lead_id))
    into v_ok;
  if not coalesce(v_ok, false) then
    raise exception 'Documento fora da sua unidade.' using errcode = '42501';
  end if;
  if d.situacao = 'SUBSTITUIDO' then
    raise exception 'Documento substituido por um mais recente.' using errcode = 'check_violation';
  end if;
  if not p_aprovar and length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo da recusa.' using errcode = 'check_violation';
  end if;

  update associado_documentos
     set situacao      = case when p_aprovar then 'CONFERIDO' else 'RECUSADO' end,
         conferido_por = usuario_atual_id(),
         conferido_em  = now(),
         motivo_recusa = case when p_aprovar then null else btrim(p_motivo) end
   where id = p_documento
  returning * into d;
  if d.tipo = 'CNH' then perform cnh_marcar_substituidas(d.cliente_id); end if;
  return d;
end;
$$;

-- (D) --------------------------------------------------------------------------
create or replace function fn_lead_leva_documentos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cliente_id is null or new.cliente_id is not distinct from old.cliente_id then
    return new;
  end if;
  update associado_documentos
     set cliente_id    = new.cliente_id,
         situacao      = case when situacao = 'AGUARDANDO' then 'CONFERIDO' else situacao end,
         conferido_por = case when situacao = 'AGUARDANDO' then usuario_atual_id() else conferido_por end,
         conferido_em  = case when situacao = 'AGUARDANDO' then now() else conferido_em end
   where lead_id = new.id and cliente_id is null;
  perform cnh_marcar_substituidas(new.cliente_id);
  return new;
end;
$$;

drop trigger if exists trg_lead_leva_documentos on leads;
create trigger trg_lead_leva_documentos after update of cliente_id on leads
  for each row execute function fn_lead_leva_documentos();

-- (E) --------------------------------------------------------------------------
-- Resumo (invoker: a RLS decide o que se le).
create or replace function cliente_documentacao(p_cliente uuid)
returns table (
  tem_identidade   boolean,
  tem_comprovante  boolean,
  cnh_validade     date,
  cnh_vencida      boolean,
  cnh_dias         integer,
  aguardando       integer,
  recusados        integer,
  total            integer
)
language sql
stable
set search_path = public
as $$
  with d as (
    select * from associado_documentos
     where cliente_id = p_cliente and situacao in ('AGUARDANDO', 'CONFERIDO', 'RECUSADO')
  ), cnh as (
    select max(validade) as v from d where tipo = 'CNH' and situacao <> 'RECUSADO'
  )
  select
    exists (select 1 from d where situacao <> 'RECUSADO'
             and (tipo in ('RG', 'CONTRATO_SOCIAL') or (tipo = 'CNH' and validade >= data_sp(now())))),
    exists (select 1 from d where situacao <> 'RECUSADO' and tipo = 'COMPROVANTE_ENDERECO'),
    (select v from cnh),
    (select v < data_sp(now()) from cnh),
    (select (v - data_sp(now()))::int from cnh),
    (select count(*)::int from d where situacao = 'AGUARDANDO'),
    (select count(*)::int from d where situacao = 'RECUSADO'),
    (select count(*)::int from d where situacao <> 'RECUSADO');
$$;

-- A fila da auditoria. p_filtro: AGUARDANDO | CNH_VENCIDA | CNH_A_VENCER | RECUSADO
create or replace function auditoria_documentos_associados(
  p_filtro text default 'AGUARDANDO',
  p_busca  text default null,
  p_limite integer default 200
)
returns table (
  documento_id    uuid,
  cliente_id      uuid,
  lead_id         uuid,
  associado       text,
  cpf_cnpj        text,
  celular         text,
  regional        text,
  tipo            text,
  descricao       text,
  validade        date,
  situacao        text,
  motivo_recusa   text,
  url             text,
  nome_arquivo    text,
  enviado_em      timestamptz,
  evento_aberto   boolean
)
language sql
stable
set search_path = public
as $$
  with base as (
    select d.*,
           coalesce(c.nome_razao_social, l.nome) as nome,
           coalesce(c.cpf_cnpj, l.cpf_cnpj) as doc,
           coalesce(c.celular, c.telefone, l.celular) as fone,
           r.nome as unidade,
           row_number() over (partition by d.cliente_id, d.tipo
                              order by d.validade desc nulls last, d.created_at desc) as rn
      from associado_documentos d
      left join clientes c on c.id = d.cliente_id
      left join leads l on l.id = d.lead_id
      left join regionais r on r.id = coalesce(c.regional_id, l.regional_id)
     where d.situacao <> 'SUBSTITUIDO'
  )
  select b.id, b.cliente_id, b.lead_id, b.nome, b.doc, b.fone, b.unidade, b.tipo, b.descricao,
         b.validade, b.situacao, b.motivo_recusa, b.url, b.nome_arquivo, b.created_at,
         exists (select 1 from eventos_sinistro e
                  where e.cliente_id = b.cliente_id and e.status::text not in ('CONCLUIDO', 'NEGADO'))
    from base b
   where case upper(coalesce(p_filtro, 'AGUARDANDO'))
           when 'AGUARDANDO'   then b.situacao = 'AGUARDANDO'
           when 'RECUSADO'     then b.situacao = 'RECUSADO'
           when 'CNH_VENCIDA'  then b.tipo = 'CNH' and b.situacao <> 'RECUSADO' and b.rn = 1
                                    and b.cliente_id is not null and b.validade < data_sp(now())
           when 'CNH_A_VENCER' then b.tipo = 'CNH' and b.situacao <> 'RECUSADO' and b.rn = 1
                                    and b.cliente_id is not null
                                    and b.validade between data_sp(now()) and data_sp(now()) + 30
           else false end
     and (coalesce(btrim(p_busca), '') = ''
          or texto_sem_acento(lower(coalesce(b.nome, ''))) like '%' || texto_sem_acento(lower(btrim(p_busca))) || '%'
          or (regexp_replace(p_busca, '[^0-9]', '', 'g') <> ''
              and coalesce(b.doc, '') like '%' || regexp_replace(p_busca, '[^0-9]', '', 'g') || '%'))
   order by (exists (select 1 from eventos_sinistro e
                      where e.cliente_id = b.cliente_id and e.status::text not in ('CONCLUIDO', 'NEGADO'))) desc,
            b.validade asc nulls last, b.created_at asc
   limit greatest(1, least(coalesce(p_limite, 200), 1000));
$$;

-- Contagem da fila (o numero no menu e na aba).
create or replace function auditoria_documentos_resumo()
returns table (aguardando integer, cnh_vencida integer, cnh_a_vencer integer, recusados integer)
language sql
stable
set search_path = public
as $$
  with cnh as (
    select distinct on (d.cliente_id) d.cliente_id, d.validade
      from associado_documentos d
     where d.tipo = 'CNH' and d.cliente_id is not null and d.situacao in ('AGUARDANDO', 'CONFERIDO')
     order by d.cliente_id, d.validade desc, d.created_at desc
  )
  select
    (select count(*)::int from associado_documentos where situacao = 'AGUARDANDO'),
    (select count(*)::int from cnh where validade < data_sp(now())),
    (select count(*)::int from cnh where validade between data_sp(now()) and data_sp(now()) + 30),
    (select count(*)::int from associado_documentos where situacao = 'RECUSADO');
$$;

-- (C) --------------------------------------------------------------------------
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
  v_cli    uuid;
  v_ident  text;
  v_compr  int;
  v_cnh    date;
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

  -- 0177: os documentos pessoais podem ter vindo pelo lead ou ja estar na
  -- ficha do associado (cliente da base que contrata outro veiculo).
  v_cli := coalesce(l.cliente_existente_id,
                    (select c.id from clientes c where c.cpf_cnpj = v_doc and v_doc <> '' limit 1));
  select string_agg(distinct d.tipo, ', ' order by d.tipo) into v_ident
    from associado_documentos d
   where (d.lead_id = p_lead_id or (v_cli is not null and d.cliente_id = v_cli))
     and d.situacao in ('AGUARDANDO', 'CONFERIDO')
     and (d.tipo = 'RG'
          or (d.tipo = 'CNH' and d.validade >= data_sp(now()))
          or (v_tipo = 'PJ' and d.tipo = 'CONTRATO_SOCIAL'));
  select count(*) into v_compr
    from associado_documentos d
   where (d.lead_id = p_lead_id or (v_cli is not null and d.cliente_id = v_cli))
     and d.situacao in ('AGUARDANDO', 'CONFERIDO')
     and d.tipo = 'COMPROVANTE_ENDERECO';
  select max(d.validade) into v_cnh
    from associado_documentos d
   where (d.lead_id = p_lead_id or (v_cli is not null and d.cliente_id = v_cli))
     and d.situacao in ('AGUARDANDO', 'CONFERIDO')
     and d.tipo = 'CNH';
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

  -- 0177: documentos pessoais do associado (aba Anexos).
  return query select
    (case when v_tipo = 'PJ' then 'Documento da empresa ou do responsavel (contrato social, RG ou CNH)'
          else 'Documento de identidade (RG ou CNH)' end), 'Documentos',
    (v_ident is not null),
    coalesce(v_ident, (case when v_cnh is not null and v_cnh < data_sp(now())
                            then 'so ha CNH vencida em ' || to_char(v_cnh, 'DD/MM/YYYY')
                            else 'nao anexado' end));

  return query select 'Comprovante de endereco', 'Documentos',
    (v_compr > 0), (case when v_compr > 0 then 'anexado' else 'nao anexado' end);

  if v_cnh is not null then
    return query select 'CNH dentro da validade', 'Documentos',
      (v_cnh >= data_sp(now())),
      (case when v_cnh >= data_sp(now()) then 'valida ate ' else 'VENCIDA em ' end)
        || to_char(v_cnh, 'DD/MM/YYYY');
  end if;

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

comment on table associado_documentos is
  '0177: documentos pessoais do associado (ou do lead, antes da entrada). CNH com validade obrigatoria; conferencia pela auditoria.';

-- rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
