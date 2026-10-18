-- ============================================================================
-- SCar :: 0116_permissoes_usuario_extras.sql
--
-- PERMISSAO EXTRA POR USUARIO + COPIAR O PERFIL DE OUTRO USUARIO
-- (pedido do usuario, 18/10/2026: "as vezes e preciso conceder a algum usuario
-- uma permissao a mais do que os demais, mesmo estando no mesmo grupo ...
-- e copiar perfis de determinados usuarios, sem criar outro perfil").
--
-- (A) `usuario_permissoes` — o que UM usuario ganha alem do papel dele.
--     So SOMA (concede), nunca retira: tirar algo de uma pessoa so e trocar o
--     papel; uma lista de "negacoes" por usuario faria a grade do perfil mentir.
--     Cada extra tem MOTIVO e pode ter VALIDADE (cobrir ferias, por exemplo):
--     vencida, deixa de valer sozinha. Vale para as celulas da grade (0111) e
--     para as 3 alcadas (modulo 'alcada'); modulo fixo (Regionais, Mutual,
--     Usuarios, Configuracoes) nao entra — ele e protegido por papel no banco.
-- (B) `perfil_pode` e `papel_pode` passam a somar o extra vigente do usuario
--     logado. Com isso os helpers (pode_auditar, pode_tratar_evento,
--     pode_assistencia...), as policies RESTRICTIVE de excluir e
--     `minhas_permissoes` (o menu e os botoes) obedecem o extra sem mudar.
--     Inativo continua sem nada (auth_papel, 0068); admin continua com tudo.
-- (C) `salvar_permissoes_usuario` — so admin, troca a lista inteira de uma vez,
--     com trilha em `usuario_permissoes_log`.
-- (D) `copiar_perfil_usuario(origem, destino, copiar_unidade, motivo)` — o
--     destino passa a ter o MESMO acesso da origem: papel, extras, unidades de
--     supervisor e (opcional) a unidade. Tudo numa transacao, com trilha. As
--     travas da 0054 continuam valendo (so admin muda papel; o ultimo admin
--     ativo nao e rebaixado).
-- ============================================================================

create or replace function permissao_extra_valida(p_modulo text, p_acao text)
returns boolean
language sql immutable
as $$
  select permissao_celula_valida(p_modulo, p_acao)
      or (p_modulo = 'alcada' and p_acao in ('desconto', 'liberar_24h', 'leads'));
$$;

create table if not exists usuario_permissoes (
  usuario_id    uuid not null references usuarios(id) on delete cascade,
  modulo        text not null,
  acao          text not null,
  motivo        text not null,
  expira_em     date,
  concedido_por uuid references usuarios(id) on delete set null,
  concedido_em  timestamptz not null default now(),
  primary key (usuario_id, modulo, acao),
  constraint chk_usuario_permissoes_celula check (permissao_extra_valida(modulo, acao)),
  constraint chk_usuario_permissoes_motivo check (length(btrim(motivo)) > 0)
);

comment on table usuario_permissoes is
  'Permissao EXTRA de um usuario, alem do papel (0116). So soma. Expira em expira_em '
  '(inclusive). Escrita so por salvar_permissoes_usuario / copiar_perfil_usuario.';

create table if not exists usuario_permissoes_log (
  id           bigserial primary key,
  usuario_id   uuid not null references usuarios(id) on delete cascade,
  item         text not null,          -- 'modulo.acao', a alcada, 'papel', 'unidade', 'supervisor'
  de           text,
  para         text,
  motivo       text,
  origem       text not null default 'EXTRA',
  alterado_por uuid references usuarios(id) on delete set null,
  alterado_em  timestamptz not null default clock_timestamp(),
  constraint chk_usuario_permissoes_log_origem check (origem in ('EXTRA', 'COPIA'))
);

create index if not exists idx_usuario_permissoes_log_usuario
  on usuario_permissoes_log (usuario_id, alterado_em desc);

alter table usuario_permissoes     enable row level security;
alter table usuario_permissoes_log enable row level security;

drop policy if exists usuario_permissoes_select on usuario_permissoes;
create policy usuario_permissoes_select on usuario_permissoes for select to authenticated
  using ((select is_admin()) or usuario_id = (select auth.uid()));
drop policy if exists usuario_permissoes_log_select on usuario_permissoes_log;
create policy usuario_permissoes_log_select on usuario_permissoes_log for select to authenticated
  using ((select is_admin()));
-- Escrita: so pelas RPCs (security definer, exigem admin). Nenhuma policy de escrita.

grant select on usuario_permissoes, usuario_permissoes_log to authenticated;

-- ----------------------------------------------------------------------------
-- (B) A leitura soma o extra vigente
-- ----------------------------------------------------------------------------
create or replace function permissao_extra_vigente(p_modulo text, p_acao text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from usuario_permissoes up
     where up.usuario_id = auth.uid()
       and up.modulo = p_modulo and up.acao = p_acao
       and (up.expira_em is null or up.expira_em >= data_sp(now()))
  );
$$;

create or replace function perfil_pode(p_modulo text, p_acao text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when auth_papel() is null then false
    when auth_papel()::text = 'admin' then true
    else coalesce((select pp.concedida from perfil_permissoes pp
                    where pp.papel = auth_papel()::text
                      and pp.modulo = p_modulo and pp.acao = p_acao), false)
         or permissao_extra_vigente(p_modulo, p_acao)
  end;
$$;

comment on function perfil_pode(text, text) is
  'O papel de quem chama tem a acao no modulo, ou ele tem o extra vigente (0116)? '
  'Admin sempre; inativo nunca (auth_papel, 0068).';

create or replace function papel_pode(p_permissao text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when auth_papel() is null then false
    when auth_papel()::text = 'admin' then true
    else coalesce((select pp.concedida from papel_permissoes pp
                    where pp.papel = auth_papel()::text and pp.permissao = p_permissao), false)
         or permissao_extra_vigente('alcada', p_permissao)
  end;
$$;

comment on function papel_pode(text) is
  'A alcada (desconto, liberar_24h, leads) vale para quem chama: pelo papel ou pelo '
  'extra vigente (0116). Admin sempre; inativo nunca.';

-- ----------------------------------------------------------------------------
-- Leitura para a tela: os extras de um usuario (admin ve todos; a pessoa, os dela)
-- ----------------------------------------------------------------------------
create or replace function permissoes_extras_usuario(p_usuario uuid)
returns table (
  modulo           text,
  acao             text,
  motivo           text,
  expira_em        date,
  vigente          boolean,
  concedido_por    text,
  concedido_em     timestamptz
)
language sql stable security definer set search_path = public
as $$
  select up.modulo, up.acao, up.motivo, up.expira_em,
         (up.expira_em is null or up.expira_em >= data_sp(now())) as vigente,
         u.nome, up.concedido_em
    from usuario_permissoes up
    left join usuarios u on u.id = up.concedido_por
   where up.usuario_id = p_usuario
     and (is_admin() or p_usuario = auth.uid())
   order by up.modulo, up.acao;
$$;

-- ----------------------------------------------------------------------------
-- (C) A escrita: a lista inteira do usuario, so admin
-- p_extras = [{"modulo":"eventos","acao":"editar","expira_em":"2026-12-31"}, ...]
-- (alcada: {"modulo":"alcada","acao":"desconto"}). Quem nao vem na lista sai.
-- ----------------------------------------------------------------------------
create or replace function salvar_permissoes_usuario(
  p_usuario uuid,
  p_extras  jsonb,
  p_motivo  text
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_papel  text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  c        jsonb;
  v_mod    text;
  v_acao   text;
  v_exp    date;
  v_ant    usuario_permissoes;
  v_muda   integer := 0;
  v_chaves text[] := '{}';
begin
  if not coalesce(is_admin(), false) then
    raise exception 'Somente o administrador concede permissoes extras'
      using errcode = 'insufficient_privilege';
  end if;
  select papel::text into v_papel from usuarios where id = p_usuario;
  if v_papel is null then
    raise exception 'Usuario nao encontrado' using errcode = 'no_data_found';
  end if;
  if jsonb_typeof(p_extras) is distinct from 'array' then
    raise exception 'Informe a lista de permissoes extras';
  end if;
  if v_papel = 'admin' and jsonb_array_length(p_extras) > 0 then
    raise exception 'O administrador ja tem todas as permissoes';
  end if;

  for c in select * from jsonb_array_elements(p_extras) loop
    v_mod  := c->>'modulo';
    v_acao := c->>'acao';
    v_exp  := nullif(c->>'expira_em', '')::date;
    if not permissao_extra_valida(v_mod, v_acao) then
      raise exception 'A permissao % . % nao existe ou nao pode ser concedida por usuario', v_mod, v_acao;
    end if;
    if v_exp is not null and v_exp < data_sp(now()) then
      raise exception 'A validade da permissao % . % ja passou', v_mod, v_acao;
    end if;
    if (v_mod || '.' || v_acao) = any (v_chaves) then
      continue;
    end if;
    v_chaves := v_chaves || (v_mod || '.' || v_acao);

    select * into v_ant from usuario_permissoes
     where usuario_id = p_usuario and modulo = v_mod and acao = v_acao;

    if v_ant.usuario_id is null then
      if v_motivo is null then
        raise exception 'Informe o motivo da permissao extra';
      end if;
      insert into usuario_permissoes (usuario_id, modulo, acao, motivo, expira_em, concedido_por)
        values (p_usuario, v_mod, v_acao, v_motivo, v_exp, auth.uid());
      insert into usuario_permissoes_log (usuario_id, item, de, para, motivo, alterado_por)
        values (p_usuario, v_mod || '.' || v_acao, null,
                'concedida' || coalesce(' ate ' || to_char(v_exp, 'DD/MM/YYYY'), ''),
                v_motivo, auth.uid());
      v_muda := v_muda + 1;
    elsif v_ant.expira_em is distinct from v_exp then
      update usuario_permissoes
         set expira_em = v_exp, concedido_por = auth.uid(), concedido_em = now(),
             motivo = coalesce(v_motivo, motivo)
       where usuario_id = p_usuario and modulo = v_mod and acao = v_acao;
      insert into usuario_permissoes_log (usuario_id, item, de, para, motivo, alterado_por)
        values (p_usuario, v_mod || '.' || v_acao,
                'ate ' || coalesce(to_char(v_ant.expira_em, 'DD/MM/YYYY'), 'sem prazo'),
                'ate ' || coalesce(to_char(v_exp, 'DD/MM/YYYY'), 'sem prazo'),
                v_motivo, auth.uid());
      v_muda := v_muda + 1;
    end if;
  end loop;

  -- o que nao veio na lista sai
  with saiu as (
    delete from usuario_permissoes up
     where up.usuario_id = p_usuario
       and not ((up.modulo || '.' || up.acao) = any (v_chaves))
    returning up.modulo, up.acao
  ), log as (
    insert into usuario_permissoes_log (usuario_id, item, de, para, motivo, alterado_por)
    select p_usuario, s.modulo || '.' || s.acao, 'concedida', 'retirada', v_motivo, auth.uid()
      from saiu s
    returning 1
  )
  select v_muda + count(*) into v_muda from log;

  return v_muda;
end;
$$;

-- ----------------------------------------------------------------------------
-- (D) Copiar o perfil de outro usuario
-- ----------------------------------------------------------------------------
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
  update usuarios set papel = o.papel, regional_id = v_reg where id = p_destino;

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
  'O destino passa a ter o acesso da origem: papel, extras vigentes, unidades de supervisor '
  'e (opcional) a unidade. So admin; trilha em usuario_permissoes_log (0116).';

-- ----------------------------------------------------------------------------
-- Rito de seguranca da 0052
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
