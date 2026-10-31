-- 0166_termo_pdf_original
-- TERMO GERAL COM O PDF ORIGINAL (pedido do usuario, 31/10/2026).
--
-- "Ja temos campo para importar Word; precisamos importar PDF tambem, para
-- termos como o Regimento, classificados como Geral." O Regimento ja existe
-- pronto em PDF (diagramado, assinado, registrado). Converter o PDF em texto
-- perderia a forma; o que se quer e o PROPRIO arquivo como documento.
--
--   (A) termos_modelos.arquivo_pdf_* — o PDF importado no rascunho. So para
--       escopo GERAL (CHECK): termo por associado precisa dos campos no texto,
--       e PDF nao tem onde preenche-los.
--   (B) definir_pdf_termo_modelo(modelo, path, sha, nome, bytes) — grava ou
--       tira (path nulo) o PDF do rascunho. Quem cria/edita modelo. O arquivo
--       sobe pelo servidor (bucket privado `termos`), que chama esta RPC.
--   (C) termos_versoes.pdf_original — a versao cujo PDF E o documento. O
--       sha256 da versao passa a ser o do ARQUIVO (o que se publica e ele) e
--       o conteudo_html guarda so uma nota. Imutavel como o resto da versao.
--   (D) publicar_versao_termo recriada (mesma assinatura): com PDF original,
--       o texto pode estar vazio e "nada mudou" compara o hash do arquivo.
--       O servidor copia o arquivo para a versao (anexar_pdf_versao_termo,
--       que ja existia e grava uma vez so).
-- ============================================================================

-- (A)
alter table termos_modelos add column if not exists arquivo_pdf_path   text;
alter table termos_modelos add column if not exists arquivo_pdf_sha256 text;
alter table termos_modelos add column if not exists arquivo_pdf_nome   text;
alter table termos_modelos add column if not exists arquivo_pdf_bytes  int;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_termo_pdf_so_geral') then
    alter table termos_modelos add constraint chk_termo_pdf_so_geral
      check (arquivo_pdf_path is null or escopo = 'GERAL');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_termo_pdf_completo') then
    alter table termos_modelos add constraint chk_termo_pdf_completo
      check (arquivo_pdf_path is null or (arquivo_pdf_sha256 is not null and arquivo_pdf_bytes > 0));
  end if;
end $$;

comment on column termos_modelos.arquivo_pdf_path is
  'PDF original do documento GERAL (Regimento etc.), no bucket termos. Publicado como o proprio documento. 0166.';

-- (C)
alter table termos_versoes add column if not exists pdf_original boolean not null default false;

create or replace function fn_termo_versao_imutavel()
returns trigger language plpgsql as $$
begin
  if new.modelo_id is distinct from old.modelo_id
     or new.numero is distinct from old.numero
     or new.nome is distinct from old.nome
     or new.conteudo_html is distinct from old.conteudo_html
     or new.sha256 is distinct from old.sha256
     or new.declaracoes is distinct from old.declaracoes
     or new.publicada_em is distinct from old.publicada_em
     or new.publicada_por is distinct from old.publicada_por
     or new.observacao is distinct from old.observacao
     or new.pdf_original is distinct from old.pdf_original then
    raise exception 'Versao publicada do termo nao pode ser alterada: publique uma nova versao.'
      using errcode = 'check_violation';
  end if;
  if old.pdf_path is not null and (new.pdf_path is distinct from old.pdf_path
                                   or new.pdf_sha256 is distinct from old.pdf_sha256) then
    raise exception 'O PDF desta versao ja foi gravado.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- (B)
create or replace function definir_pdf_termo_modelo(
  p_modelo_id uuid,
  p_path      text,
  p_sha256    text default null,
  p_nome      text default null,
  p_bytes     int  default null
)
returns termos_modelos
language plpgsql security definer set search_path = public
as $$
declare
  m termos_modelos;
begin
  if not (perfil_pode('termos_modelos', 'criar') or perfil_pode('termos_modelos', 'editar')) then
    raise exception 'Sem permissao para alterar termos.' using errcode = 'insufficient_privilege';
  end if;
  select * into m from termos_modelos where id = p_modelo_id for update;
  if not found then
    raise exception 'Termo nao encontrado.' using errcode = 'no_data_found';
  end if;
  if p_path is not null then
    if m.escopo <> 'GERAL' then
      raise exception 'PDF pronto so vale para documento GERAL (o mesmo para todos). Termo por associado precisa dos campos no texto.'
        using errcode = 'check_violation';
    end if;
    if coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' or coalesce(p_bytes, 0) <= 0 then
      raise exception 'Arquivo PDF invalido.' using errcode = 'check_violation';
    end if;
  end if;
  update termos_modelos
     set arquivo_pdf_path   = p_path,
         arquivo_pdf_sha256 = case when p_path is null then null else p_sha256 end,
         arquivo_pdf_nome   = case when p_path is null then null else nullif(btrim(coalesce(p_nome, '')), '') end,
         arquivo_pdf_bytes  = case when p_path is null then null else p_bytes end,
         atualizado_por     = usuario_atual_id()
   where id = m.id
  returning * into m;
  return m;
end;
$$;

-- (D)
create or replace function publicar_versao_termo(p_modelo_id uuid, p_observacao text default null)
returns termos_versoes
language plpgsql security definer set search_path = public
as $$
declare
  m termos_modelos;
  v termos_versoes;
  n int;
  com_pdf boolean;
  html text;
  hash text;
begin
  if not (perfil_pode('termos_modelos', 'criar') or perfil_pode('termos_modelos', 'editar')) then
    raise exception 'Sem permissao para publicar termos.' using errcode = 'insufficient_privilege';
  end if;
  select * into m from termos_modelos where id = p_modelo_id for update;
  if not found then
    raise exception 'Termo nao encontrado.' using errcode = 'no_data_found';
  end if;
  com_pdf := m.escopo = 'GERAL' and m.arquivo_pdf_path is not null;

  if com_pdf then
    html := '<p>Documento publicado a partir do arquivo PDF ' ||
            coalesce(replace(replace(m.arquivo_pdf_nome, '<', ''), '>', ''), 'original') || '.</p>';
    hash := m.arquivo_pdf_sha256;
    if m.versao_atual_id is not null and exists (
         select 1 from termos_versoes x
          where x.id = m.versao_atual_id and x.pdf_original and x.sha256 = hash
            and x.declaracoes = m.declaracoes and x.nome = m.nome) then
      raise exception 'Nada mudou desde a versao % — nao ha o que publicar.',
        (select numero from termos_versoes where id = m.versao_atual_id)
        using errcode = 'check_violation';
    end if;
  else
    if btrim(regexp_replace(coalesce(m.rascunho_html, ''), '<[^>]*>', '', 'g')) = '' then
      raise exception 'O texto do termo esta vazio.' using errcode = 'check_violation';
    end if;
    if m.versao_atual_id is not null and exists (
         select 1 from termos_versoes x
          where x.id = m.versao_atual_id and not x.pdf_original and x.conteudo_html = m.rascunho_html
            and x.declaracoes = m.declaracoes and x.nome = m.nome) then
      raise exception 'Nada mudou desde a versao % — nao ha o que publicar.',
        (select numero from termos_versoes where id = m.versao_atual_id)
        using errcode = 'check_violation';
    end if;
    html := m.rascunho_html;
    hash := termo_sha256(m.rascunho_html);
  end if;

  select coalesce(max(numero), 0) + 1 into n from termos_versoes where modelo_id = m.id;
  insert into termos_versoes (modelo_id, numero, nome, conteudo_html, sha256, declaracoes,
                              observacao, publicada_por, pdf_original)
  values (m.id, n, m.nome, html, hash, m.declaracoes,
          nullif(btrim(coalesce(p_observacao, '')), ''), usuario_atual_id(), com_pdf)
  returning * into v;
  update termos_modelos set versao_atual_id = v.id, atualizado_por = usuario_atual_id()
   where id = m.id;
  return v;
end;
$$;

-- ----------------------------------------------------------------------------
-- Rito da 0052
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
