-- 0131: UNIDADES DE ATUACAO PARA QUALQUER PERFIL.
--
-- O defeito (20/10/2026): o usuario ANDERSON NEW TRACKER (perfil personalizado
-- RASTREAMENTO, base consultor_vendas, unidade "Global") abria Veiculos e
-- Associados VAZIOS. A grade do perfil (0111/0130) libera a TELA; os REGISTROS
-- vem do alcance, e `regionais_do_usuario()` (0115/0127) so somava as unidades
-- de atuacao (`supervisor_regionais`) para supervisor e sinistro. Ele ja tinha
-- as 4 unidades marcadas (veio de "Copiar perfil") e o banco as ignorava.
--
-- Agora as unidades de atuacao valem para TODO papel que nao tem acesso global
-- (admin/financeiro ja veem tudo). Quem nao tem linha em supervisor_regionais
-- nao muda nada (conferido em producao: so ANDERSON ganha alcance).
-- O que NAO muda:
--   . a COBRANCA (`cobranca_escopo`, 0097) segue lendo so o supervisor;
--   . a carteira de LEADS do consultor (`pode_ver_carteira_regional`, 0038)
--     segue sendo so a propria — a unidade de atuacao nao abre lead alheio;
--   . quem marca as unidades continua sendo so o admin.
-- Junto: `usuarios_listar` (DROP + CREATE, coluna nova no fim) devolve
-- `unidades_atuacao`, para a lista de usuarios nao acusar "sem unidade" quem
-- tem unidades de atuacao marcadas.

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
       and auth_papel() is not null
  ), '{}'::uuid[]);
$$;

comment on function regionais_do_usuario() is
  'Unidades do usuario logado: a do cadastro + as unidades de atuacao (supervisor_regionais), para qualquer papel ativo. Vazio para inativo/nao-staff. (0115/0127/0131)';

comment on table supervisor_regionais is
  'Unidades de ATUACAO do usuario (0097/0127/0131): somam-se a unidade do cadastro na RLS de unidade, para qualquer papel. '
  'Escrita so por definir_regionais_supervisor (admin). A cobranca (cobranca_escopo) le so as do supervisor.';

drop function if exists usuarios_listar(boolean);
create function usuarios_listar(p_incluir_inativos boolean default true)
returns table (
  id uuid, nome text, email text, telefone text, documento text, cargo text,
  papel papel_usuario, regional_id uuid, regional_nome text,
  ativo boolean, data_inicio date, data_desligamento date, observacoes text,
  criado_em timestamptz,
  vendedor_id uuid, vendedor_codigo text, vendedor_ativo boolean,
  responsavel_por bigint,
  perfil_id uuid, perfil_nome text,
  unidades_atuacao bigint
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
         u.perfil_id, pa.nome,
         (select count(*) from supervisor_regionais s where s.usuario_id = u.id)
    from usuarios u
    left join regionais  r  on r.id = u.regional_id
    left join vendedores v  on v.usuario_id = u.id
    left join perfis_acesso pa on pa.id = u.perfil_id
   where (tem_acesso_global() or pode_regional(u.regional_id) or u.id = auth.uid())
     and (coalesce(p_incluir_inativos, true) or u.ativo)
   order by u.ativo desc, u.nome;
end;
$$;

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
