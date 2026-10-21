-- 0133: a lista da EQUIPE para transferir protocolo, tramitar evento e pedir
-- parecer.
--
-- O defeito (21/10/2026): HYASKARA (Eventos) abriu "Passar para" na tramitacao
-- do evento e so via o proprio nome. As telas liam `usuarios` direto, e a
-- policy usuarios_select_self (0003) so mostra a propria linha a quem nao e
-- admin/financeiro (ou gestor, a da unidade). Transferir passou a ser
-- impossivel para todo o resto da equipe — inclusive na Central de Protocolos.
--
-- A policy NAO muda (a ficha do usuario tem CPF, telefone, observacoes). Esta
-- funcao devolve SO o necessario para escolher o destinatario: id, nome, papel
-- e unidade dos usuarios ATIVOS. So staff le; o associado do /portal recebe
-- vazio.

create or replace function equipe_ativa()
returns table (id uuid, nome text, papel text, regional_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.nome::text, u.papel::text, u.regional_id
    from usuarios u
   where u.ativo
     and is_staff()
   order by u.nome;
$$;

comment on function equipe_ativa() is
  'Equipe ativa (id, nome, papel, unidade) para escolher destinatario de transferencia/parecer (0133). So staff.';

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
