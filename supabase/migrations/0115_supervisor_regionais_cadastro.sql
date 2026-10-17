-- ============================================================================
-- 0115 — O SUPERVISOR ENXERGA O CADASTRO DAS UNIDADES DELE
-- ============================================================================
-- Relatado em 17/10/2026: "o supervisor, mesmo liberado para acessar as placas
-- de todas as regionais, algumas placas nao aparecem".
--
-- A CAUSA: as unidades do supervisor (`supervisor_regionais`, 0097) so eram
-- lidas por `cobranca_escopo()`, ou seja DENTRO das RPCs de cobranca. A RLS de
-- `veiculos`/`clientes` (0108), `pode_regional()` (as ~87 policies regionais) e
-- `escopo_regional()` olham so `usuarios.regional_id` — e o supervisor tem
-- `regional_id` nulo. Medido em producao com a sessao dela: 0 veiculos e
-- 0 associados visiveis. As placas que "apareciam" eram so as que as telas de
-- cobranca devolvem (RPC security definer).
--
-- A CORRECAO: `regionais_do_usuario()` — a unidade do cadastro + as de
-- `supervisor_regionais` quando o papel e supervisor — passa a ser a regra de
-- "minha unidade". O supervisor vira, em cada unidade dele, o mesmo que um
-- staff daquela unidade (ler e operar). O que cada tela deixa FAZER continua
-- pela grade de permissoes do perfil (0111). Os demais papeis nao mudam: para
-- eles a lista e exatamente `{auth_regional_id()}`.
-- ============================================================================

create or replace function regionais_do_usuario()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array(
    select auth_regional_id() where auth_regional_id() is not null
    union
    select sr.regional_id
      from supervisor_regionais sr
     where sr.usuario_id = auth.uid()
       and auth_papel()::text = 'supervisor'
  ), '{}'::uuid[]);
$$;

comment on function regionais_do_usuario() is
  'Unidades do usuario logado: a do cadastro + supervisor_regionais (papel supervisor). Vazio para inativo/nao-staff. (0115)';

-- `pode_regional`: mesma regra, agora com a lista.
create or replace function pode_regional(p_regional uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select tem_acesso_global()
      or (is_staff() and p_regional is not null and p_regional = any(regionais_do_usuario()));
$$;

-- `escopo_regional` devolve UMA unidade: para o supervisor, a pedida quando e
-- dele; senao a do cadastro; senao a primeira das dele; senao o uuid impossivel.
create or replace function escopo_regional(p_regional_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
           when tem_acesso_global() then p_regional_id
           when p_regional_id is not null and p_regional_id = any(regionais_do_usuario()) then p_regional_id
           else coalesce(auth_regional_id(), (regionais_do_usuario())[1],
                         '00000000-0000-0000-0000-000000000000'::uuid)
         end;
$$;

-- ------------------------------------------------------------------ regionais
drop policy if exists regionais_select on regionais;
create policy regionais_select on regionais for select to authenticated
  using ((select tem_acesso_global()) or id = any((select regionais_do_usuario())::uuid[]));

-- ------------------------------------------------------------------ veiculos
drop policy if exists veiculos_select on veiculos;
create policy veiculos_select on veiculos for select to authenticated
  using (
    (select tem_acesso_global())
    or (regional_id is not null and regional_id = any((select regionais_do_usuario())::uuid[]))
    or cliente_id = (select auth_cliente_id())
  );

drop policy if exists veiculos_write on veiculos;
create policy veiculos_write on veiculos for all to authenticated
  using (
    (select tem_acesso_global())
    or (regional_id is not null and regional_id = any((select regionais_do_usuario())::uuid[]))
  )
  with check (
    (select tem_acesso_global())
    or (regional_id is not null and regional_id = any((select regionais_do_usuario())::uuid[]))
  );

-- ------------------------------------------------------------------ clientes
drop policy if exists clientes_select on clientes;
create policy clientes_select on clientes for select to authenticated
  using (
    (select tem_acesso_global())
    or (regional_id is not null and regional_id = any((select regionais_do_usuario())::uuid[]))
    or auth_user_id = (select auth.uid())
  );

drop policy if exists clientes_write on clientes;
create policy clientes_write on clientes for all to authenticated
  using (
    (select tem_acesso_global())
    or (regional_id is not null and regional_id = any((select regionais_do_usuario())::uuid[]))
  )
  with check (
    (select tem_acesso_global())
    or (regional_id is not null and regional_id = any((select regionais_do_usuario())::uuid[]))
  );

-- --------------------------------------------------------- eventos_historico
drop policy if exists eventos_historico_select on eventos_historico;
create policy eventos_historico_select on eventos_historico for select to authenticated
  using (
    (select tem_acesso_global())
    or cliente_id = (select auth_cliente_id())
    or exists (
      select 1 from clientes c
       where c.id = eventos_historico.cliente_id
         and c.regional_id is not null
         and c.regional_id = any((select regionais_do_usuario())::uuid[])
    )
  );

-- Rito da 0052.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
