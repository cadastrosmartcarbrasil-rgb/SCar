-- 0127: O TIME DE EVENTOS ATENDE VARIAS UNIDADES.
--
-- O defeito (19/10/2026): quem tem o perfil EVENTOS (papel `sinistro`) nao achava
-- associado nenhum na busca do SAC. Nao era o perfil: era a UNIDADE. A leitura de
-- clientes/veiculos/eventos passa por `regionais_do_usuario()` (0115), que so
-- devolve a unidade do cadastro — e o time de eventos trabalha a base inteira:
--   . HYASKARA estava sem unidade  -> lista vazia -> 0 associados;
--   . NILMA estava na SMART CAR MATRIZ -> so os associados da matriz.
--
-- Agora o papel `sinistro` usa as mesmas "unidades de atuacao" do supervisor
-- (`supervisor_regionais`, marcadas pelo admin em Configuracoes -> Usuarios).
-- Isso vale em toda a RLS de unidade (`pode_regional`, `escopo_regional`, as
-- policies de clientes/veiculos/regionais) e, por tabela, em
-- `pode_tratar_evento` — o time trata evento das unidades marcadas.
-- A COBRANCA (`cobranca_escopo`, 0097) NAO muda: segue so para o supervisor.
-- Sem unidade marcada, nada muda para ninguem. Mesma assinatura.

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
       and auth_papel()::text in ('supervisor', 'sinistro')
  ), '{}'::uuid[]);
$$;

comment on function regionais_do_usuario() is
  'Unidades do usuario logado: a do cadastro + as unidades de atuacao (supervisor_regionais) para os papeis supervisor e sinistro (eventos). Vazio para inativo/nao-staff. (0115/0127)';

comment on table supervisor_regionais is
  'Unidades de atuacao do SUPERVISOR (0097) e do time de EVENTOS, papel sinistro (0127). '
  'Escrita so por definir_regionais_supervisor (admin). A cobranca (cobranca_escopo) le so o supervisor.';

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
