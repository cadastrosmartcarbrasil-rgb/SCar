-- ============================================================================
-- SCar :: 0054_usuarios_protecao_admin.sql
--
-- A EQUIPE PASSA A SER EDITAVEL — e o sistema nao pode ficar sem dono.
--
-- A tela de Usuarios so criava. Editar papel/unidade existia como select solto
-- na lista e falhava EM SILENCIO para quem nao e admin (a RLS barrava, o
-- supabase-js devolvia sucesso com zero linhas). Redefinir senha nao existia,
-- porque senha vive em `auth.users` e so a service_role alcanca.
--
-- A edicao passa a acontecer pela rota `/api/usuarios` (PATCH, service_role,
-- admin-only). Como a service_role IGNORA RLS, a trava do "ultimo
-- administrador" nao pode ficar so na rota: ela desce para o banco, aqui.
--
--   . rebaixar o ultimo admin ativo  -> recusado
--   . desativar o ultimo admin ativo -> recusado
--   . apagar o ultimo admin ativo    -> recusado
--
-- Sem isso, um clique deixa a associacao sem ninguem que gerencie a equipe,
-- e o unico caminho de volta e o painel do Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ESCALADA DE PRIVILEGIO (achada ao testar esta migration).
--
-- A policy `usuarios_update_self` (0003) libera `update` na PROPRIA linha, para
-- a pessoa manter o cadastro dela. Mas RLS nao restringe COLUNA: com ela,
-- qualquer usuario da equipe podia rodar
--     update usuarios set papel = 'admin' where id = auth.uid()
-- e virar administrador sozinho. O consultor de vendas viraria dono do sistema.
--
-- RLS por coluna nao existe no Postgres; a trava certa e trigger: papel,
-- unidade e ativacao so mudam por ADMIN (ou pelo servidor, que roda sem sessao
-- com service_role e ja e caminho confiavel).
-- ----------------------------------------------------------------------------
create or replace function fn_usuarios_campos_sensiveis()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;             -- servidor (service_role): rota admin-only, ja checada
  end if;

  if (new.papel is distinct from old.papel
      or new.regional_id is distinct from old.regional_id
      or new.ativo is distinct from old.ativo)
     and not is_admin() then
    raise exception 'Papel, unidade e ativacao so mudam por um administrador';
  end if;

  return new;
end;
$$;

comment on function fn_usuarios_campos_sensiveis() is
  'RLS nao restringe coluna: sem isto qualquer usuario se promovia a admin na propria linha.';

drop trigger if exists trg_usuarios_campos_sensiveis on usuarios;
create trigger trg_usuarios_campos_sensiveis before update on usuarios
  for each row execute function fn_usuarios_campos_sensiveis();

create or replace function fn_usuarios_protege_ultimo_admin()
returns trigger
language plpgsql
as $$
declare
  perdeu_admin boolean;
  restantes    integer;
begin
  if tg_op = 'DELETE' then
    perdeu_admin := old.papel::text = 'admin' and old.ativo;
  else
    perdeu_admin := old.papel::text = 'admin' and old.ativo
                    and (new.papel::text <> 'admin' or not new.ativo);
  end if;

  if not perdeu_admin then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select count(*) into restantes
    from usuarios u
   where u.papel::text = 'admin' and u.ativo and u.id <> old.id;

  if restantes = 0 then
    raise exception
      'Este e o unico administrador ativo: promova outro antes de rebaixar, desativar ou remover este.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function fn_usuarios_protege_ultimo_admin() is
  'O sistema nao pode ficar sem administrador ativo. Vale ate para a service_role, que ignora RLS.';

drop trigger if exists trg_usuarios_ultimo_admin on usuarios;
create trigger trg_usuarios_ultimo_admin before update or delete on usuarios
  for each row execute function fn_usuarios_protege_ultimo_admin();

-- ----------------------------------------------------------------------------
-- Rito da 0052: funcao nova nasce com `execute` para PUBLIC (embutido no
-- Postgres). Toda migration que cria funcao fecha a porta no fim do arquivo.
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to service_role;
