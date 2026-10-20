-- ============================================================================
-- 0130 — PERFIS PERSONALIZADOS: o admin cria perfil do zero
--
-- Pedido do usuario (20/10/2026): "preciso criar perfis de usuarios do zero; ja
-- temos tudo pronto nas configuracoes mas nao consigo criar novo perfil".
--
-- O perfil, ate aqui, era o PAPEL (`papel_usuario`, enum com 9 valores) e a
-- grade modulo x acao (0111) era por papel. Enum nao se cria por clique, e o
-- papel sustenta a ESTRUTURA do acesso (matriz x unidade, supervisor com varias
-- unidades, cobranca do Brasil...) em ~190 policies. Por isso o perfil novo e:
--
--   perfil personalizado = NOME + PAPEL DE BASE + GRADE PROPRIA
--
--   * o PAPEL DE BASE decide o ALCANCE (o que tem_acesso_global, pode_regional,
--     regionais_do_usuario e cobranca_escopo ja decidem hoje) — gravado em
--     `usuarios.papel`, entao nenhuma policy muda;
--   * a GRADE (perfil_permissoes + as 3 alcadas de papel_permissoes) e do
--     perfil: nasce COPIADA da base (ou de outro perfil) e o admin ajusta.
--     A chave da grade e o id do perfil (texto), ao lado das chaves dos papeis.
--
-- (A) `perfis_acesso` + `usuarios.perfil_id` (trigger mantem papel = base)
-- (B) a chave da grade aceita perfil (trigger no lugar dos CHECKs de papel)
-- (C) `auth_perfil_chave()`; `perfil_pode`/`papel_pode` leem a grade do perfil
-- (D) `salvar_perfil_acesso` / `excluir_perfil_acesso` (so admin)
-- (E) `usuarios_listar` com o perfil; `copiar_perfil_usuario` copia o perfil;
--     `fn_usuarios_campos_sensiveis` protege perfil_id
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) O cadastro do perfil
-- ----------------------------------------------------------------------------
create table if not exists perfis_acesso (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  descricao   text,
  papel_base  text not null,
  criado_por  uuid references usuarios(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint chk_perfis_acesso_nome check (length(btrim(nome)) >= 3),
  constraint chk_perfis_acesso_base check (papel_base in (
    'financeiro', 'gestor_regional', 'consultor_vendas', 'sinistro',
    'auditoria', 'assistencia_24h', 'supervisor', 'cobranca'))
);

create unique index if not exists uq_perfis_acesso_nome on perfis_acesso (lower(btrim(nome)));

comment on table perfis_acesso is
  'Perfil criado pelo admin (0130): nome + papel de base (o alcance) + grade propria '
  '(perfil_permissoes/papel_permissoes com papel = id::text).';

drop trigger if exists trg_perfis_acesso_updated on perfis_acesso;
create trigger trg_perfis_acesso_updated before update on perfis_acesso
  for each row execute function set_updated_at();

alter table perfis_acesso enable row level security;
drop policy if exists perfis_acesso_select on perfis_acesso;
create policy perfis_acesso_select on perfis_acesso for select to authenticated
  using ((select is_staff()));
revoke all on perfis_acesso from anon;
grant select on perfis_acesso to authenticated;

alter table usuarios add column if not exists perfil_id uuid
  references perfis_acesso(id) on delete restrict;
create index if not exists idx_usuarios_perfil on usuarios (perfil_id) where perfil_id is not null;

comment on column usuarios.perfil_id is
  'Perfil personalizado (0130). Com perfil, `papel` e sempre o papel de base dele (trigger).';

-- Com perfil, o papel e o da base. Trocar o papel direto (sem mexer no perfil)
-- e sair do perfil personalizado.
create or replace function fn_usuarios_perfil()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_base text;
begin
  if tg_op = 'UPDATE'
     and new.perfil_id is not distinct from old.perfil_id
     and new.papel is distinct from old.papel then
    new.perfil_id := null;
  end if;

  if new.perfil_id is not null then
    select papel_base into v_base from perfis_acesso where id = new.perfil_id;
    if v_base is null then
      raise exception 'Perfil nao encontrado' using errcode = 'foreign_key_violation';
    end if;
    new.papel := v_base::papel_usuario;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_usuarios_perfil on usuarios;
create trigger trg_usuarios_perfil before insert or update on usuarios
  for each row execute function fn_usuarios_perfil();

-- perfil_id tambem e campo sensivel (mesma regra de papel/unidade/ativo, 0054)
create or replace function fn_usuarios_campos_sensiveis()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;             -- servidor (service_role): rota admin-only, ja checada
  end if;

  if (new.papel is distinct from old.papel
      or new.perfil_id is distinct from old.perfil_id
      or new.regional_id is distinct from old.regional_id
      or new.ativo is distinct from old.ativo)
     and not is_admin() then
    raise exception 'Papel, perfil, unidade e ativacao so mudam por um administrador';
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- (B) A chave da grade: papel (menos admin) OU id de perfil personalizado
-- ----------------------------------------------------------------------------
create or replace function perfil_chave_valida(p_chave text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_chave in ('financeiro', 'gestor_regional', 'consultor_vendas', 'sinistro',
                     'auditoria', 'assistencia_24h', 'supervisor', 'cobranca')
      or (p_chave ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and exists (select 1 from perfis_acesso where id = p_chave::uuid));
$$;

alter table perfil_permissoes drop constraint if exists chk_perfil_permissoes_papel;
alter table papel_permissoes  drop constraint if exists chk_papel_permissoes_papel;

create or replace function fn_grade_chave_valida()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not perfil_chave_valida(new.papel) then
    raise exception 'Perfil % nao existe', new.papel using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_perfil_permissoes_chave on perfil_permissoes;
create trigger trg_perfil_permissoes_chave before insert or update of papel on perfil_permissoes
  for each row execute function fn_grade_chave_valida();
drop trigger if exists trg_papel_permissoes_chave on papel_permissoes;
create trigger trg_papel_permissoes_chave before insert or update of papel on papel_permissoes
  for each row execute function fn_grade_chave_valida();

-- ----------------------------------------------------------------------------
-- (C) A leitura: a grade de quem chama e a do PERFIL (se houver) ou a do papel
-- ----------------------------------------------------------------------------
create or replace function auth_perfil_chave()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(u.perfil_id::text, u.papel::text)
    from usuarios u where u.id = auth.uid() and u.ativo;
$$;

create or replace function perfil_pode(p_modulo text, p_acao text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when auth_papel() is null then false
    when auth_papel()::text = 'admin' then true
    else coalesce((select pp.concedida from perfil_permissoes pp
                    where pp.papel = auth_perfil_chave()
                      and pp.modulo = p_modulo and pp.acao = p_acao), false)
         or permissao_extra_vigente(p_modulo, p_acao)
  end;
$$;

create or replace function papel_pode(p_permissao text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when auth_papel() is null then false
    when auth_papel()::text = 'admin' then true
    else coalesce((select pp.concedida from papel_permissoes pp
                    where pp.papel = auth_perfil_chave() and pp.permissao = p_permissao), false)
         or permissao_extra_vigente('alcada', p_permissao)
  end;
$$;

-- ----------------------------------------------------------------------------
-- (D) Criar, editar e excluir perfil (so admin)
-- ----------------------------------------------------------------------------
create or replace function salvar_perfil_acesso(
  p_id         uuid,
  p_nome       text,
  p_descricao  text default null,
  p_papel_base text default null,
  p_copiar_de  text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_nome  text := upper(btrim(coalesce(p_nome, '')));
  v_id    uuid;
  v_atual perfis_acesso;
  v_orig  text;
begin
  if not coalesce(is_admin(), false) then
    raise exception 'Somente o administrador cria e edita perfis'
      using errcode = 'insufficient_privilege';
  end if;
  if length(v_nome) < 3 then
    raise exception 'Informe o nome do perfil (minimo 3 letras)';
  end if;

  if p_id is null then
    if p_papel_base is null or p_papel_base not in (
        'financeiro', 'gestor_regional', 'consultor_vendas', 'sinistro',
        'auditoria', 'assistencia_24h', 'supervisor', 'cobranca') then
      raise exception 'Escolha o papel de base do perfil (ele define o alcance: matriz ou unidade)';
    end if;
    v_orig := coalesce(nullif(btrim(coalesce(p_copiar_de, '')), ''), p_papel_base);
    if not perfil_chave_valida(v_orig) then
      raise exception 'Perfil de origem da copia nao existe';
    end if;

    insert into perfis_acesso (nome, descricao, papel_base, criado_por)
      values (v_nome, nullif(btrim(coalesce(p_descricao, '')), ''), p_papel_base, auth.uid())
      returning id into v_id;

    -- a grade nasce igual a origem; o admin ajusta depois
    insert into perfil_permissoes (papel, modulo, acao, concedida, alterado_por, alterado_em)
    select v_id::text, modulo, acao, concedida, auth.uid(), now()
      from perfil_permissoes where papel = v_orig;
    insert into papel_permissoes (papel, permissao, concedida, alterado_por, alterado_em)
    select v_id::text, permissao, concedida, auth.uid(), now()
      from papel_permissoes where papel = v_orig;

    insert into papel_permissoes_log (papel, permissao, de, para, alterado_por)
      values (v_id::text, 'perfil criado (copia de ' || v_orig || ')', null, true, auth.uid());
    return v_id;
  end if;

  select * into v_atual from perfis_acesso where id = p_id;
  if v_atual.id is null then
    raise exception 'Perfil nao encontrado' using errcode = 'no_data_found';
  end if;
  if p_papel_base is not null and p_papel_base <> v_atual.papel_base
     and exists (select 1 from usuarios where perfil_id = p_id) then
    raise exception 'O papel de base nao muda com usuarios no perfil (o alcance deles mudaria): crie outro perfil';
  end if;
  if p_papel_base is not null and p_papel_base not in (
      'financeiro', 'gestor_regional', 'consultor_vendas', 'sinistro',
      'auditoria', 'assistencia_24h', 'supervisor', 'cobranca') then
    raise exception 'Papel de base invalido';
  end if;

  update perfis_acesso
     set nome = v_nome,
         descricao = nullif(btrim(coalesce(p_descricao, '')), ''),
         papel_base = coalesce(p_papel_base, papel_base)
   where id = p_id;
  return p_id;
end;
$$;

create or replace function excluir_perfil_acesso(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_n integer;
begin
  if not coalesce(is_admin(), false) then
    raise exception 'Somente o administrador exclui perfis' using errcode = 'insufficient_privilege';
  end if;
  select count(*) into v_n from usuarios where perfil_id = p_id;
  if v_n > 0 then
    raise exception 'O perfil tem % usuario(s): troque o perfil deles antes de excluir', v_n;
  end if;
  delete from perfil_permissoes where papel = p_id::text;
  delete from papel_permissoes  where papel = p_id::text;
  delete from perfis_acesso where id = p_id;
  if not found then
    raise exception 'Perfil nao encontrado' using errcode = 'no_data_found';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (E) A lista da equipe com o perfil (muda o OUT: drop + create)
-- ----------------------------------------------------------------------------
drop function if exists usuarios_listar(boolean);
create or replace function usuarios_listar(p_incluir_inativos boolean default true)
returns table (
  id uuid, nome text, email text, telefone text, documento text, cargo text,
  papel papel_usuario, regional_id uuid, regional_nome text,
  ativo boolean, data_inicio date, data_desligamento date, observacoes text,
  criado_em timestamptz,
  vendedor_id uuid, vendedor_codigo text, vendedor_ativo boolean,
  responsavel_por bigint,
  perfil_id uuid, perfil_nome text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then
    raise exception 'Sem permissao' using errcode = 'insufficient_privilege';
  end if;

  return query
  select u.id, u.nome, u.email, u.telefone, u.documento, u.cargo,
         u.papel, u.regional_id, r.nome,
         u.ativo, u.data_inicio, u.data_desligamento, u.observacoes,
         u.created_at,
         v.id, v.codigo, v.ativo,
         (select count(*) from regionais x where x.responsavel_id = u.id),
         u.perfil_id, pa.nome
    from usuarios u
    left join regionais  r  on r.id = u.regional_id
    left join vendedores v  on v.usuario_id = u.id
    left join perfis_acesso pa on pa.id = u.perfil_id
   where (tem_acesso_global() or pode_regional(u.regional_id) or u.id = auth.uid())
     and (coalesce(p_incluir_inativos, true) or u.ativo)
   order by u.ativo desc, u.nome;
end;
$$;

create or replace function copiar_perfil_usuario(
  p_origem         uuid,
  p_destino        uuid,
  p_copiar_unidade boolean default true,
  p_motivo         text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  o        usuarios;
  d        usuarios;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_obs    text;
  v_reg    uuid;
  v_extras integer;
  v_sup    integer;
  v_aviso  text;
begin
  if not coalesce(is_admin(), false) then
    raise exception 'Somente o administrador copia o perfil de um usuario'
      using errcode = 'insufficient_privilege';
  end if;
  if p_origem is null or p_destino is null then
    raise exception 'Informe o usuario de origem e o de destino';
  end if;
  if p_origem = p_destino then
    raise exception 'Escolha um usuario de origem diferente do destino';
  end if;
  select * into o from usuarios where id = p_origem;
  if o.id is null then raise exception 'Usuario de origem nao encontrado' using errcode = 'no_data_found'; end if;
  select * into d from usuarios where id = p_destino;
  if d.id is null then raise exception 'Usuario de destino nao encontrado' using errcode = 'no_data_found'; end if;

  v_obs := 'Copiado de ' || o.nome || coalesce(': ' || v_motivo, '');
  v_reg := case when coalesce(p_copiar_unidade, true) then o.regional_id else d.regional_id end;

  -- papel e unidade (as travas da 0054 seguem valendo: o ultimo admin nao cai)
  update usuarios set papel = o.papel, perfil_id = o.perfil_id, regional_id = v_reg where id = p_destino;

  if d.perfil_id is distinct from o.perfil_id then
    insert into usuario_permissoes_log (usuario_id, item, de, para, motivo, origem, alterado_por)
      values (p_destino, 'perfil',
              coalesce((select nome from perfis_acesso where id = d.perfil_id), d.papel::text),
              coalesce((select nome from perfis_acesso where id = o.perfil_id), o.papel::text),
              v_obs, 'COPIA', auth.uid());
  end if;

  if d.papel is distinct from o.papel then
    insert into usuario_permissoes_log (usuario_id, item, de, para, motivo, origem, alterado_por)
      values (p_destino, 'papel', d.papel::text, o.papel::text, v_obs, 'COPIA', auth.uid());
  end if;
  if d.regional_id is distinct from v_reg then
    insert into usuario_permissoes_log (usuario_id, item, de, para, motivo, origem, alterado_por)
      values (p_destino, 'unidade',
              coalesce((select nome from regionais where id = d.regional_id), 'Global'),
              coalesce((select nome from regionais where id = v_reg), 'Global'),
              v_obs, 'COPIA', auth.uid());
  end if;

  -- extras: o destino fica com os da origem (os vencidos nao sao copiados)
  insert into usuario_permissoes_log (usuario_id, item, de, para, motivo, origem, alterado_por)
  select p_destino, x.modulo || '.' || x.acao, 'concedida', 'retirada', v_obs, 'COPIA', auth.uid()
    from usuario_permissoes x
   where x.usuario_id = p_destino
     and not exists (select 1 from usuario_permissoes y
                      where y.usuario_id = p_origem and y.modulo = x.modulo and y.acao = x.acao
                        and (y.expira_em is null or y.expira_em >= data_sp(now())));
  delete from usuario_permissoes where usuario_id = p_destino;

  insert into usuario_permissoes (usuario_id, modulo, acao, motivo, expira_em, concedido_por)
  select p_destino, y.modulo, y.acao, left(v_obs || ' (' || y.motivo || ')', 500), y.expira_em, auth.uid()
    from usuario_permissoes y
   where y.usuario_id = p_origem
     and o.papel::text <> 'admin'
     and (y.expira_em is null or y.expira_em >= data_sp(now()));
  get diagnostics v_extras = row_count;

  insert into usuario_permissoes_log (usuario_id, item, de, para, motivo, origem, alterado_por)
  select p_destino, y.modulo || '.' || y.acao, null,
         'concedida' || coalesce(' ate ' || to_char(y.expira_em, 'DD/MM/YYYY'), ''),
         v_obs, 'COPIA', auth.uid()
    from usuario_permissoes y
   where y.usuario_id = p_destino;

  -- unidades do supervisor: as mesmas da origem (vazio quando ela nao e supervisor)
  delete from supervisor_regionais where usuario_id = p_destino;
  insert into supervisor_regionais (usuario_id, regional_id, created_by)
  select p_destino, s.regional_id, auth.uid()
    from supervisor_regionais s
   where s.usuario_id = p_origem and o.papel::text = 'supervisor';
  get diagnostics v_sup = row_count;
  if v_sup > 0 then
    insert into usuario_permissoes_log (usuario_id, item, de, para, motivo, origem, alterado_por)
      values (p_destino, 'supervisor', null, v_sup || ' unidade(s)', v_obs, 'COPIA', auth.uid());
  end if;

  if o.papel::text = 'gestor_regional' and v_reg is null then
    v_aviso := 'O gestor regional so funciona com uma unidade: escolha a unidade de ' || d.nome || '.';
  elsif not d.ativo then
    v_aviso := d.nome || ' esta com o acesso desativado: o perfil vale quando for reativado.';
  end if;

  return jsonb_build_object(
    'papel_de', d.papel::text, 'papel_para', o.papel::text,
    'regional_de', d.regional_id, 'regional_para', v_reg,
    'extras', v_extras, 'unidades_supervisor', v_sup,
    'aviso', v_aviso
  );
end;
$$;

comment on function copiar_perfil_usuario(uuid, uuid, boolean, text) is
  'O destino passa a ter o acesso da origem: papel, perfil personalizado (0130), extras '
  'vigentes, unidades de supervisor e (opcional) a unidade. So admin; trilha em usuario_permissoes_log.';

-- ----------------------------------------------------------------------------
-- Rito de seguranca da 0052
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
