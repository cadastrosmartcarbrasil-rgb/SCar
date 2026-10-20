-- ============================================================================
-- 0129 — COMUNICACAO DE EVENTO ONLINE: um link por envolvido
-- ============================================================================
-- Pedido do usuario (20/10/2026, estudo do Cowork): o evento chega por
-- telefone, a equipe abre o protocolo e manda UM LINK POR ENVOLVIDO (associado,
-- condutor, terceiros, passageiro, testemunha). Cada um preenche no celular o
-- que sabe do evento e envia as fotos; tudo cai no protocolo EVT-.
--
-- DECISOES DO USUARIO (20/10/2026):
--  1. Sem OTP por enquanto (nao ha canal: SMS, API de WhatsApp e Resend estao
--     fora). O ASSOCIADO confirma a identidade com os 3 primeiros digitos do
--     CPF/CNPJ + a data de nascimento do cadastro (sem data no cadastro: os 6
--     primeiros digitos). Terceiro/testemunha nao veem dado nenhum, so o
--     protocolo — o link basta.
--  2. A tela nao fala de cobertura, prazo nem perda de direito.
--  3. Os textos de privacidade/declaracao entram como o estudo propos; o
--     juridico revisa depois.
--  4. A EQUIPE tambem preenche e anexa (pessoa sem familiaridade com o
--     celular): a versao fica marcada com origem EQUIPE e quem registrou.
--
-- O QUE FOI REAPROVEITADO (e por que nao ha tabela nova de terceiros):
--  * `evento_terceiros` (0103) ja e o cadastro do terceiro do evento. O que o
--    terceiro declara preenche a ficha dele (so os campos vazios).
--  * `anexos_evento` + bucket privado `sinistros-docs`: a foto do envolvido e
--    um anexo do evento como outro qualquer, marcado com o convite e a pose.
--  * `historico_protocolo`: convite criado, enviado, respondido, correcao,
--    conferido.
--  * O padrao do link publico da vistoria (0076): a pagina roda com
--    service_role e acha o convite SO pelo token; `anon` nao le nada.
--
-- POR QUE O TOKEN FICA LEGIVEL (e nao so o hash, como o estudo sugeria): a
-- equipe precisa REENVIAR o mesmo link dias depois (WhatsApp de novo, QR no
-- balcao). Guardar so o hash obrigaria a gerar um novo a cada reenvio e
-- derrubaria o link que ja esta no celular da pessoa. O token tem 244 bits
-- aleatorios, prazo, pode ser revogado/renovado, e so a equipe da unidade o le
-- (RLS); o `anon` nao alcanca a tabela.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Tipos novos de anexo (comparados como TEXTO nesta migration — gotcha do
--     enum na mesma transacao)
-- ----------------------------------------------------------------------------
alter type tipo_documento_anexo add value if not exists 'FOTO_VEICULO';
alter type tipo_documento_anexo add value if not exists 'FOTO_LOCAL';
alter type tipo_documento_anexo add value if not exists 'CROQUI';
alter type tipo_documento_anexo add value if not exists 'OUTRO';

-- ----------------------------------------------------------------------------
-- (B) O convite: um por envolvido
-- ----------------------------------------------------------------------------
create table if not exists evento_comunicacoes (
  id                    uuid primary key default gen_random_uuid(),
  evento_id             uuid not null references eventos_sinistro(id) on delete cascade,
  papel                 text not null,
  nome                  text,
  telefone              text,
  email                 text,
  terceiro_id           uuid references evento_terceiros(id) on delete set null,
  token                 text not null,
  expira_em             timestamptz not null,
  status                text not null default 'ABERTO',
  rascunho              jsonb not null default '{}'::jsonb,
  rascunho_em           timestamptz,
  verificado_em         timestamptz,
  tentativas_verificacao integer not null default 0,
  envios                integer not null default 0,
  ultimo_envio_canal    text,
  ultimo_envio_em       timestamptz,
  primeiro_acesso_em    timestamptz,
  ultimo_acesso_em      timestamptz,
  respondido_em         timestamptz,
  correcao_comentario   text,
  conferido_em          timestamptz,
  conferido_por         uuid references usuarios(id) on delete set null,
  revogado_em           timestamptz,
  criado_por            uuid references usuarios(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint uq_evento_comunicacao_token unique (token),
  constraint chk_evento_com_papel check (papel in (
    'associado','condutor_associado','terceiro_condutor','terceiro_proprietario',
    'passageiro_vitima','testemunha')),
  constraint chk_evento_com_status check (status in (
    'ABERTO','EM_PREENCHIMENTO','ENVIADO','CORRECAO','CONFERIDO','REVOGADO')),
  constraint chk_evento_com_rascunho check (jsonb_typeof(rascunho) = 'object'
    and octet_length(rascunho::text) <= 200000)
);

create index if not exists idx_evento_com_evento on evento_comunicacoes (evento_id);

comment on table evento_comunicacoes is
  'Convite de comunicacao de evento: um link por envolvido (0129). O token e a capacidade do link publico /comunicar/<token>.';

-- ----------------------------------------------------------------------------
-- (C) O que foi declarado: versoes IMUTAVEIS
-- ----------------------------------------------------------------------------
create table if not exists evento_declaracoes (
  id               uuid primary key default gen_random_uuid(),
  comunicacao_id   uuid not null references evento_comunicacoes(id) on delete cascade,
  evento_id        uuid not null references eventos_sinistro(id) on delete cascade,
  versao           integer not null,
  dados            jsonb not null,
  origem           text not null,
  texto_declaracao text not null,
  ip               text,
  user_agent       text,
  registrado_por   uuid references usuarios(id) on delete set null,
  hash_conteudo    text not null,
  created_at       timestamptz not null default clock_timestamp(),
  constraint uq_evento_declaracao_versao unique (comunicacao_id, versao),
  constraint chk_evento_decl_origem check (origem in ('ENVOLVIDO','EQUIPE')),
  constraint chk_evento_decl_dados check (jsonb_typeof(dados) = 'object'
    and octet_length(dados::text) <= 200000)
);

create index if not exists idx_evento_decl_evento on evento_declaracoes (evento_id);

create or replace function fn_evento_declaracao_imutavel()
returns trigger language plpgsql as $$
begin
  raise exception 'Declaracao de evento e imutavel: corrigir gera uma nova versao';
end;
$$;

drop trigger if exists trg_evento_declaracao_imutavel on evento_declaracoes;
create trigger trg_evento_declaracao_imutavel
  before update or delete on evento_declaracoes
  for each row when (pg_trigger_depth() = 0)
  execute function fn_evento_declaracao_imutavel();

-- A cascata do evento/convite apaga as versoes (pg_trigger_depth > 0); apagar
-- uma versao na mao, nao.

-- ----------------------------------------------------------------------------
-- (D) O anexo sabe de qual convite veio e qual foto e
-- ----------------------------------------------------------------------------
alter table anexos_evento
  add column if not exists comunicacao_id uuid references evento_comunicacoes(id) on delete set null,
  add column if not exists pose text,
  add column if not exists enviado_pelo_envolvido boolean not null default false;

create index if not exists idx_anexos_comunicacao on anexos_evento (comunicacao_id);

-- ----------------------------------------------------------------------------
-- (E) RLS: so leitura para a equipe da unidade; toda escrita pela RPC
-- ----------------------------------------------------------------------------
alter table evento_comunicacoes enable row level security;
alter table evento_declaracoes enable row level security;

drop policy if exists evento_com_select on evento_comunicacoes;
create policy evento_com_select on evento_comunicacoes for select to authenticated
  using (pode_ver_evento(evento_id));

drop policy if exists evento_decl_select on evento_declaracoes;
create policy evento_decl_select on evento_declaracoes for select to authenticated
  using (pode_ver_evento(evento_id));

revoke all on evento_comunicacoes from anon;
revoke all on evento_declaracoes from anon;
grant select on evento_comunicacoes to authenticated;
grant select on evento_declaracoes to authenticated;

-- ----------------------------------------------------------------------------
-- (F) Ajudantes
-- ----------------------------------------------------------------------------
create or replace function comunicacao_novo_token()
returns text language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

-- Trilha no protocolo (usuario nulo = veio pelo link publico).
create or replace function comunicacao_registrar_historico(p_evento uuid, p_acao text, p_obs text)
returns void language sql security definer set search_path = public as $$
  insert into historico_protocolo (evento_id, usuario_origem_id, acao_realizada, observacoes)
  values (p_evento, usuario_atual_id(), p_acao, p_obs);
$$;

create or replace function comunicacao_rotulo_papel(p_papel text)
returns text language sql immutable as $$
  select case p_papel
    when 'associado' then 'Associado'
    when 'condutor_associado' then 'Condutor do veiculo do associado'
    when 'terceiro_condutor' then 'Terceiro (condutor)'
    when 'terceiro_proprietario' then 'Terceiro (proprietario)'
    when 'passageiro_vitima' then 'Passageiro / vitima'
    when 'testemunha' then 'Testemunha'
    else p_papel end;
$$;

-- Situacao efetiva (o vencido e calculado, nao gravado).
create or replace function comunicacao_situacao(c evento_comunicacoes)
returns text language sql stable as $$
  select case
    when c.status in ('REVOGADO','ENVIADO','CONFERIDO') then c.status
    when c.expira_em < now() then 'EXPIRADO'
    else c.status end;
$$;

-- Texto da declaracao: guardado em cada versao (o texto pode mudar depois).
create or replace function comunicacao_texto_declaracao(p_origem text)
returns text language sql immutable as $$
  select case p_origem
    when 'EQUIPE' then 'Registrado pela equipe da Smart Car Brasil com as informacoes prestadas pelo envolvido, que nao assinou eletronicamente.'
    else 'Declaro que as informacoes prestadas sao verdadeiras e completas, e autorizo a Smart Car Brasil a verifica-las junto aos orgaos competentes e aos demais envolvidos.'
  end;
$$;

-- ----------------------------------------------------------------------------
-- (G) A equipe: criar, reenviar, renovar, revogar, pedir correcao, conferir
-- ----------------------------------------------------------------------------
create or replace function criar_comunicacao_evento(
  p_evento_id   uuid,
  p_papel       text,
  p_nome        text default null,
  p_telefone    text default null,
  p_email       text default null,
  p_terceiro_id uuid default null,
  p_dias        integer default 7
) returns evento_comunicacoes
language plpgsql security definer set search_path = public as $$
declare
  v_evt eventos_sinistro;
  v_cli clientes;
  v_ter evento_terceiros;
  r     evento_comunicacoes;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_tel  text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_mail text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if not pode_ver_evento(p_evento_id) then
    raise exception 'Sem permissao para este evento';
  end if;
  select * into v_evt from eventos_sinistro where id = p_evento_id;
  if p_papel not in ('associado','condutor_associado','terceiro_condutor','terceiro_proprietario',
                     'passageiro_vitima','testemunha') then
    raise exception 'Papel invalido: %', p_papel;
  end if;

  if p_papel = 'associado' then
    if exists (select 1 from evento_comunicacoes
                where evento_id = p_evento_id and papel = 'associado' and status <> 'REVOGADO') then
      raise exception 'O associado ja tem um link neste evento: reenvie ou renove o existente';
    end if;
    select * into v_cli from clientes where id = v_evt.cliente_id;
    v_nome := coalesce(v_nome, v_cli.nome_razao_social);
    v_tel  := coalesce(v_tel, nullif(regexp_replace(coalesce(v_cli.celular, v_cli.telefone, ''), '\D', '', 'g'), ''));
    v_mail := coalesce(v_mail, nullif(lower(btrim(coalesce(v_cli.email, ''))), ''));
  end if;

  if p_terceiro_id is not null then
    select * into v_ter from evento_terceiros where id = p_terceiro_id and evento_id = p_evento_id;
    if not found then raise exception 'Terceiro nao pertence a este evento'; end if;
    if p_papel not in ('terceiro_condutor','terceiro_proprietario') then
      raise exception 'So convite de terceiro pode apontar para a ficha de terceiro';
    end if;
    v_nome := coalesce(v_nome, v_ter.nome);
    v_tel  := coalesce(v_tel, nullif(regexp_replace(coalesce(v_ter.celular, v_ter.telefone, ''), '\D', '', 'g'), ''));
    v_mail := coalesce(v_mail, nullif(lower(btrim(coalesce(v_ter.email, ''))), ''));
  end if;

  insert into evento_comunicacoes (evento_id, papel, nome, telefone, email, terceiro_id, token, expira_em, criado_por)
  values (p_evento_id, p_papel, v_nome, v_tel, v_mail, p_terceiro_id, comunicacao_novo_token(),
          now() + make_interval(days => least(greatest(coalesce(p_dias, 7), 1), 60)), usuario_atual_id())
  returning * into r;

  perform comunicacao_registrar_historico(p_evento_id, 'COMUNICACAO',
    'Link de comunicacao criado: ' || comunicacao_rotulo_papel(p_papel) || coalesce(' · ' || v_nome, ''));
  return r;
end;
$$;

create or replace function comunicacao_da_equipe(p_id uuid)
returns evento_comunicacoes
language plpgsql security definer set search_path = public as $$
declare r evento_comunicacoes;
begin
  select * into r from evento_comunicacoes where id = p_id;
  if not found or not pode_ver_evento(r.evento_id) then
    raise exception 'Comunicacao nao encontrada';
  end if;
  return r;
end;
$$;

create or replace function registrar_envio_comunicacao(p_id uuid, p_canal text)
returns evento_comunicacoes
language plpgsql security definer set search_path = public as $$
declare r evento_comunicacoes;
begin
  r := comunicacao_da_equipe(p_id);
  if r.status = 'REVOGADO' then raise exception 'Link revogado: renove antes de enviar'; end if;
  update evento_comunicacoes
     set envios = envios + 1, ultimo_envio_canal = left(coalesce(p_canal, 'OUTRO'), 20),
         ultimo_envio_em = now(), updated_at = now()
   where id = p_id returning * into r;
  perform comunicacao_registrar_historico(r.evento_id, 'COMUNICACAO',
    'Link enviado (' || coalesce(p_canal, 'outro') || '): ' || comunicacao_rotulo_papel(r.papel)
    || coalesce(' · ' || r.nome, ''));
  return r;
end;
$$;

-- Renovar: token NOVO e prazo novo. O link antigo para de funcionar.
create or replace function renovar_comunicacao_evento(p_id uuid, p_dias integer default 7)
returns evento_comunicacoes
language plpgsql security definer set search_path = public as $$
declare r evento_comunicacoes;
begin
  r := comunicacao_da_equipe(p_id);
  update evento_comunicacoes
     set token = comunicacao_novo_token(),
         expira_em = now() + make_interval(days => least(greatest(coalesce(p_dias, 7), 1), 60)),
         status = case when status = 'REVOGADO' then 'ABERTO' else status end,
         revogado_em = null, tentativas_verificacao = 0, updated_at = now()
   where id = p_id returning * into r;
  perform comunicacao_registrar_historico(r.evento_id, 'COMUNICACAO',
    'Link renovado (o anterior deixou de valer): ' || comunicacao_rotulo_papel(r.papel)
    || coalesce(' · ' || r.nome, ''));
  return r;
end;
$$;

create or replace function revogar_comunicacao_evento(p_id uuid, p_motivo text default null)
returns evento_comunicacoes
language plpgsql security definer set search_path = public as $$
declare r evento_comunicacoes;
begin
  r := comunicacao_da_equipe(p_id);
  update evento_comunicacoes set status = 'REVOGADO', revogado_em = now(), updated_at = now()
   where id = p_id returning * into r;
  perform comunicacao_registrar_historico(r.evento_id, 'COMUNICACAO',
    'Link revogado: ' || comunicacao_rotulo_papel(r.papel) || coalesce(' · ' || r.nome, '')
    || coalesce(' — ' || nullif(btrim(p_motivo), ''), ''));
  return r;
end;
$$;

create or replace function pedir_correcao_comunicacao(p_id uuid, p_comentario text)
returns evento_comunicacoes
language plpgsql security definer set search_path = public as $$
declare r evento_comunicacoes;
begin
  r := comunicacao_da_equipe(p_id);
  if not pode_tratar_evento_id(r.evento_id) then raise exception 'Sem permissao para tratar este evento'; end if;
  if nullif(btrim(coalesce(p_comentario, '')), '') is null then
    raise exception 'Diga o que precisa ser corrigido';
  end if;
  if r.status not in ('ENVIADO','CONFERIDO') then
    raise exception 'So da para pedir correcao de uma comunicacao ja enviada';
  end if;
  update evento_comunicacoes
     set status = 'CORRECAO', correcao_comentario = btrim(p_comentario),
         expira_em = greatest(expira_em, now() + interval '7 days'),
         conferido_em = null, conferido_por = null, updated_at = now()
   where id = p_id returning * into r;
  perform comunicacao_registrar_historico(r.evento_id, 'COMUNICACAO',
    'Correcao pedida a ' || comunicacao_rotulo_papel(r.papel) || coalesce(' · ' || r.nome, '')
    || ': ' || btrim(p_comentario));
  return r;
end;
$$;

create or replace function conferir_comunicacao(p_id uuid)
returns evento_comunicacoes
language plpgsql security definer set search_path = public as $$
declare r evento_comunicacoes;
begin
  r := comunicacao_da_equipe(p_id);
  if not pode_tratar_evento_id(r.evento_id) then raise exception 'Sem permissao para tratar este evento'; end if;
  if r.status <> 'ENVIADO' then raise exception 'So da para conferir uma comunicacao enviada'; end if;
  update evento_comunicacoes set status = 'CONFERIDO', conferido_em = now(),
         conferido_por = usuario_atual_id(), updated_at = now()
   where id = p_id returning * into r;
  perform comunicacao_registrar_historico(r.evento_id, 'COMUNICACAO',
    'Comunicacao conferida: ' || comunicacao_rotulo_papel(r.papel) || coalesce(' · ' || r.nome, ''));
  return r;
end;
$$;

-- ----------------------------------------------------------------------------
-- (H) A declaracao: grava a versao e alimenta a ficha do terceiro
-- ----------------------------------------------------------------------------
-- Comum ao envio publico e ao registro pela equipe. Terceiro: a ficha de
-- `evento_terceiros` recebe so o que estiver VAZIO (a equipe pode ter
-- corrigido algo; a declaracao nao passa por cima). CPF invalido nao entra na
-- ficha (a constraint da 0103 recusaria) — fica so na declaracao.
create or replace function comunicacao_gravar_versao(
  p_com evento_comunicacoes, p_dados jsonb, p_origem text, p_ip text, p_user_agent text
) returns evento_declaracoes
language plpgsql security definer set search_path = public as $$
declare
  v_decl  evento_declaracoes;
  v_versao integer;
  v_ter   uuid := p_com.terceiro_id;
  v_id    jsonb := coalesce(p_dados->'identificacao', '{}'::jsonb);
  v_vt    jsonb := coalesce(p_dados->'veiculo_terceiro', '{}'::jsonb);
  v_cd    jsonb := coalesce(p_dados->'condutor', '{}'::jsonb);
  v_nome  text := nullif(btrim(coalesce(v_id->>'nome', '')), '');
  v_cpf   text := nullif(regexp_replace(coalesce(v_id->>'cpf', ''), '\D', '', 'g'), '');
  v_tipo  tipo_pessoa;
  v_texto text := comunicacao_texto_declaracao(p_origem);
begin
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados da comunicacao invalidos';
  end if;

  select coalesce(max(versao), 0) + 1 into v_versao
    from evento_declaracoes where comunicacao_id = p_com.id;

  insert into evento_declaracoes (comunicacao_id, evento_id, versao, dados, origem, texto_declaracao,
                                  ip, user_agent, registrado_por, hash_conteudo)
  values (p_com.id, p_com.evento_id, v_versao, p_dados, p_origem, v_texto,
          left(p_ip, 80), left(p_user_agent, 400), usuario_atual_id(),
          encode(sha256(convert_to(p_com.id::text || '|' || v_versao || '|' || p_origem || '|'
                 || p_dados::text || '|' || v_texto, 'UTF8')), 'hex'))
  returning * into v_decl;

  if p_com.papel in ('terceiro_condutor','terceiro_proprietario') and v_nome is not null then
    v_tipo := case when length(coalesce(v_cpf, '')) = 14 then 'PJ'::tipo_pessoa else 'PF'::tipo_pessoa end;
    if v_cpf is not null and not validar_documento(v_cpf, v_tipo) then v_cpf := null; end if;

    if v_ter is null then
      insert into evento_terceiros (evento_id, cliente_id, nome, tipo_pessoa, cpf_cnpj, celular, email,
             condutor_e_proprietario, condutor_cnh,
             possui_veiculo, veiculo_placa, veiculo_marca, veiculo_cor,
             possui_seguro, seguradora, numero_apolice, observacoes)
      select p_com.evento_id, e.cliente_id, v_nome, v_tipo, v_cpf,
             nullif(regexp_replace(coalesce(v_id->>'telefone', ''), '\D', '', 'g'), ''),
             nullif(lower(btrim(coalesce(v_id->>'email', ''))), ''),
             p_com.papel = 'terceiro_condutor',
             nullif(btrim(coalesce(v_cd->>'cnh_numero', '')), ''),
             nullif(btrim(coalesce(v_vt->>'placa', '')), '') is not null,
             nullif(btrim(coalesce(v_vt->>'placa', '')), ''),
             nullif(btrim(coalesce(v_vt->>'marca_modelo', '')), ''),
             nullif(btrim(coalesce(v_vt->>'cor', '')), ''),
             coalesce((v_vt->>'tem_protecao')::boolean, false),
             nullif(btrim(coalesce(v_vt->>'empresa_protecao', '')), ''),
             nullif(btrim(coalesce(v_vt->>'contrato_protecao', '')), ''),
             'Cadastrado a partir da comunicacao online do evento.'
        from eventos_sinistro e where e.id = p_com.evento_id
      returning id into v_ter;
      update evento_comunicacoes set terceiro_id = v_ter where id = p_com.id;
    else
      update evento_terceiros t set
        cpf_cnpj      = coalesce(t.cpf_cnpj, v_cpf),
        celular       = coalesce(t.celular, nullif(regexp_replace(coalesce(v_id->>'telefone', ''), '\D', '', 'g'), '')),
        email         = coalesce(t.email, nullif(lower(btrim(coalesce(v_id->>'email', ''))), '')),
        condutor_cnh  = coalesce(t.condutor_cnh, nullif(btrim(coalesce(v_cd->>'cnh_numero', '')), '')),
        veiculo_placa = coalesce(t.veiculo_placa, nullif(btrim(coalesce(v_vt->>'placa', '')), '')),
        veiculo_marca = coalesce(t.veiculo_marca, nullif(btrim(coalesce(v_vt->>'marca_modelo', '')), '')),
        veiculo_cor   = coalesce(t.veiculo_cor, nullif(btrim(coalesce(v_vt->>'cor', '')), '')),
        possui_seguro = t.possui_seguro or coalesce((v_vt->>'tem_protecao')::boolean, false),
        seguradora    = coalesce(t.seguradora, nullif(btrim(coalesce(v_vt->>'empresa_protecao', '')), '')),
        numero_apolice = coalesce(t.numero_apolice, nullif(btrim(coalesce(v_vt->>'contrato_protecao', '')), ''))
      where t.id = v_ter;
    end if;
  end if;

  update evento_comunicacoes
     set status = 'ENVIADO', respondido_em = now(), correcao_comentario = null,
         rascunho = p_dados, rascunho_em = now(),
         nome = coalesce(nome, v_nome), updated_at = now()
   where id = p_com.id;

  perform comunicacao_registrar_historico(p_com.evento_id, 'COMUNICACAO',
    case p_origem when 'EQUIPE' then 'Comunicacao registrada pela equipe' else 'Comunicacao recebida pelo link' end
    || ' (versao ' || v_versao || '): ' || comunicacao_rotulo_papel(p_com.papel)
    || coalesce(' · ' || coalesce(p_com.nome, v_nome), ''));
  return v_decl;
end;
$$;

create or replace function registrar_declaracao_equipe(p_id uuid, p_dados jsonb)
returns evento_declaracoes
language plpgsql security definer set search_path = public as $$
declare r evento_comunicacoes;
begin
  r := comunicacao_da_equipe(p_id);
  if r.status in ('REVOGADO','CONFERIDO') then
    raise exception 'Comunicacao %: reabra (renovar ou pedir correcao) antes de registrar outra versao',
      lower(r.status);
  end if;
  return comunicacao_gravar_versao(r, p_dados, 'EQUIPE', null, null);
end;
$$;

-- A equipe guarda o rascunho do que esta digitando (sem virar versao).
create or replace function salvar_rascunho_comunicacao_equipe(p_id uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r evento_comunicacoes;
begin
  r := comunicacao_da_equipe(p_id);
  update evento_comunicacoes set rascunho = coalesce(p_dados, '{}'::jsonb), rascunho_em = now(), updated_at = now()
   where id = p_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- (I) O caminho PUBLICO (service_role, sem sessao) — acha so pelo token
-- ----------------------------------------------------------------------------
create or replace function comunicacao_publica_por_token(p_token text)
returns evento_comunicacoes
language plpgsql stable security definer set search_path = public as $$
declare r evento_comunicacoes;
begin
  if not (is_staff() or auth.uid() is null) then raise exception 'Sem permissao'; end if;
  if p_token is null or length(p_token) < 32 then return null; end if;
  select * into r from evento_comunicacoes where token = p_token;
  return r;
end;
$$;

-- O que a pagina pode mostrar. Terceiro/testemunha: so protocolo e data.
-- Associado: dados do cadastro SO depois de confirmar a identidade.
create or replace function comunicacao_publica(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r     evento_comunicacoes;
  v_evt eventos_sinistro;
  v_cli clientes;
  v_vei veiculos;
  v_sit text;
  v_precisa boolean;
  v_ult evento_declaracoes;
  v_pre jsonb := null;
  v_end jsonb;
begin
  r := comunicacao_publica_por_token(p_token);
  if r.id is null then return jsonb_build_object('valida', false, 'motivo', 'LINK_INVALIDO'); end if;
  v_sit := comunicacao_situacao(r);
  if v_sit = 'REVOGADO' then return jsonb_build_object('valida', false, 'motivo', 'LINK_REVOGADO'); end if;
  if v_sit = 'EXPIRADO' then return jsonb_build_object('valida', false, 'motivo', 'LINK_EXPIRADO'); end if;

  update evento_comunicacoes
     set primeiro_acesso_em = coalesce(primeiro_acesso_em, now()), ultimo_acesso_em = now()
   where id = r.id;

  select * into v_evt from eventos_sinistro where id = r.evento_id;
  select * into v_cli from clientes where id = v_evt.cliente_id;
  v_precisa := r.papel = 'associado' and r.verificado_em is null;

  if r.papel = 'associado' and not v_precisa then
    select * into v_vei from veiculos where id = v_evt.veiculo_id;
    v_end := coalesce(v_cli.endereco, '{}'::jsonb);
    v_pre := jsonb_build_object(
      'identificacao', jsonb_build_object(
        'nome', v_cli.nome_razao_social, 'cpf', v_cli.cpf_cnpj,
        'telefone', coalesce(v_cli.celular, v_cli.telefone), 'email', v_cli.email,
        'cidade', v_end->>'cidade', 'uf', coalesce(v_end->>'uf', v_end->>'estado')),
      'veiculo', jsonb_build_object(
        'placa', v_vei.placa, 'marca', v_vei.marca, 'modelo', v_vei.modelo,
        'ano', concat_ws('/', v_vei.ano_fabricacao, v_vei.ano_modelo), 'cor', v_vei.cor, 'chassi', v_vei.chassi));
  end if;

  select * into v_ult from evento_declaracoes where comunicacao_id = r.id order by versao desc limit 1;

  return jsonb_build_object(
    'valida', true,
    'motivo', null,
    'papel', r.papel,
    'status', r.status,
    'nome', r.nome,
    'protocolo', v_evt.numero_protocolo,
    'data_evento', v_evt.data_ocorrencia,
    'expira_em', r.expira_em,
    'precisa_verificar', v_precisa,
    'bloqueado', v_precisa and r.tentativas_verificacao >= 5,
    'verificacao_modo', case when v_cli.data_nascimento is null then 'DOC6' else 'DOC3_NASCIMENTO' end,
    'correcao_comentario', r.correcao_comentario,
    'prefill', v_pre,
    'rascunho', case when v_precisa then '{}'::jsonb else r.rascunho end,
    'enviado_em', v_ult.created_at,
    'versao', v_ult.versao,
    'hash', v_ult.hash_conteudo
  );
end;
$$;

-- Confirmacao de identidade do ASSOCIADO (sem OTP — decisao do usuario).
create or replace function verificar_comunicacao(p_token text, p_doc_inicio text, p_nascimento date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r     evento_comunicacoes;
  v_cli clientes;
  v_doc text;
  v_dig text := regexp_replace(coalesce(p_doc_inicio, ''), '\D', '', 'g');
  v_ok  boolean;
begin
  r := comunicacao_publica_por_token(p_token);
  if r.id is null or comunicacao_situacao(r) in ('REVOGADO','EXPIRADO') then
    return jsonb_build_object('ok', false, 'motivo', 'LINK_INVALIDO');
  end if;
  if r.papel <> 'associado' or r.verificado_em is not null then
    return jsonb_build_object('ok', true);
  end if;
  if r.tentativas_verificacao >= 5 then
    return jsonb_build_object('ok', false, 'motivo', 'BLOQUEADO');
  end if;

  select c.* into v_cli from clientes c join eventos_sinistro e on e.cliente_id = c.id where e.id = r.evento_id;
  v_doc := regexp_replace(coalesce(v_cli.cpf_cnpj, ''), '\D', '', 'g');
  if v_cli.data_nascimento is null then
    v_ok := length(v_dig) >= 6 and left(v_doc, 6) = left(v_dig, 6);
  else
    v_ok := length(v_dig) >= 3 and left(v_doc, 3) = left(v_dig, 3) and p_nascimento = v_cli.data_nascimento;
  end if;

  if v_ok then
    update evento_comunicacoes set verificado_em = now(), updated_at = now() where id = r.id;
    return jsonb_build_object('ok', true);
  end if;
  update evento_comunicacoes set tentativas_verificacao = tentativas_verificacao + 1, updated_at = now()
   where id = r.id returning * into r;
  return jsonb_build_object('ok', false,
    'motivo', case when r.tentativas_verificacao >= 5 then 'BLOQUEADO' else 'NAO_CONFERE' end,
    'restantes', greatest(5 - r.tentativas_verificacao, 0));
end;
$$;

-- Trava comum das escritas publicas.
create or replace function comunicacao_publica_editavel(p_token text)
returns evento_comunicacoes
language plpgsql security definer set search_path = public as $$
declare r evento_comunicacoes; v_sit text;
begin
  r := comunicacao_publica_por_token(p_token);
  if r.id is null then raise exception 'Link invalido'; end if;
  v_sit := comunicacao_situacao(r);
  if v_sit = 'REVOGADO' then raise exception 'Este link foi cancelado pela Smart Car Brasil'; end if;
  if v_sit = 'EXPIRADO' then raise exception 'Este link expirou: peca um novo a Smart Car Brasil'; end if;
  if r.status in ('ENVIADO','CONFERIDO') then raise exception 'Esta comunicacao ja foi enviada'; end if;
  if r.papel = 'associado' and r.verificado_em is null then
    raise exception 'Confirme seus dados antes de continuar';
  end if;
  return r;
end;
$$;

create or replace function salvar_rascunho_comunicacao(p_token text, p_dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r evento_comunicacoes;
begin
  r := comunicacao_publica_editavel(p_token);
  update evento_comunicacoes
     set rascunho = coalesce(p_dados, '{}'::jsonb), rascunho_em = now(),
         status = case when status = 'ABERTO' then 'EM_PREENCHIMENTO' else status end,
         updated_at = now()
   where id = r.id;
end;
$$;

create or replace function enviar_comunicacao(
  p_token text, p_dados jsonb, p_declarou boolean, p_ip text default null, p_user_agent text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r evento_comunicacoes; d evento_declaracoes;
begin
  r := comunicacao_publica_editavel(p_token);
  if not coalesce(p_declarou, false) then
    raise exception 'Marque a declaracao de veracidade para enviar';
  end if;
  d := comunicacao_gravar_versao(r, p_dados, 'ENVOLVIDO', p_ip, p_user_agent);
  return jsonb_build_object('versao', d.versao, 'hash', d.hash_conteudo, 'enviado_em', d.created_at);
end;
$$;

-- A foto/documento do envolvido (o arquivo sobe pela rota, com service_role).
create or replace function registrar_anexo_comunicacao(
  p_token text, p_pose text, p_tipo text, p_url text, p_tamanho bigint, p_arquivo text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare r evento_comunicacoes; v_id uuid;
begin
  r := comunicacao_publica_editavel(p_token);
  if p_tipo not in ('FOTO_AVARIA','FOTO_VEICULO','FOTO_LOCAL','CROQUI','BOLETIM_OCORRENCIA','CNH','CRLV','OUTRO') then
    raise exception 'Tipo de anexo invalido';
  end if;
  if p_url is null or split_part(p_url, '/', 1) <> r.evento_id::text then
    raise exception 'Caminho do arquivo invalido';
  end if;
  insert into anexos_evento (evento_id, tipo_documento, arquivo_url, nome_original, tamanho_bytes,
                             comunicacao_id, pose, enviado_pelo_envolvido)
  values (r.evento_id, p_tipo::tipo_documento_anexo, p_url, left(p_arquivo, 200), p_tamanho,
          r.id, left(p_pose, 40), true)
  returning id into v_id;
  update evento_comunicacoes
     set status = case when status = 'ABERTO' then 'EM_PREENCHIMENTO' else status end, updated_at = now()
   where id = r.id;
  return v_id;
end;
$$;

-- As fotos ja enviadas por este link (para a pagina mostrar o progresso).
create or replace function anexos_comunicacao_publica(p_token text)
returns table (id uuid, pose text, tipo text, arquivo_url text, nome_original text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare r evento_comunicacoes;
begin
  r := comunicacao_publica_por_token(p_token);
  if r.id is null or (r.papel = 'associado' and r.verificado_em is null) then return; end if;
  return query
    select a.id, a.pose, a.tipo_documento::text, a.arquivo_url, a.nome_original, a.created_at
      from anexos_evento a where a.comunicacao_id = r.id order by a.created_at;
end;
$$;

-- O envolvido apaga uma foto ENQUANTO ainda nao enviou (errou a pose).
create or replace function remover_anexo_comunicacao(p_token text, p_anexo uuid)
returns text language plpgsql security definer set search_path = public as $$
declare r evento_comunicacoes; v_url text;
begin
  r := comunicacao_publica_editavel(p_token);
  delete from anexos_evento where id = p_anexo and comunicacao_id = r.id and enviado_pelo_envolvido
  returning arquivo_url into v_url;
  return v_url;
end;
$$;

-- Selo do Kanban: respondidos / total (revogado nao conta).
create or replace function comunicacoes_resumo_eventos(p_eventos uuid[])
returns table (evento_id uuid, total integer, respondidas integer)
language sql stable security definer set search_path = public as $$
  select c.evento_id, count(*)::int,
         count(*) filter (where c.status in ('ENVIADO','CONFERIDO'))::int
    from evento_comunicacoes c
   where c.evento_id = any(p_eventos) and c.status <> 'REVOGADO' and pode_ver_evento(c.evento_id)
   group by c.evento_id;
$$;

-- ----------------------------------------------------------------------------
-- Rito da 0052
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
