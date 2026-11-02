-- ============================================================================
-- 0172 — MODELOS DE WHATSAPP (etapa 3 dos modelos de comunicacao, 02/11/2026)
-- ============================================================================
-- Os textos que os botoes "WhatsApp" do sistema abrem prontos (proposta, vistoria,
-- revistoria, cobranca, 2a via, carne, boas-vindas, SAC, comunicacao de evento) passam a
-- ser editaveis na mesma tela dos e-mails (0170): `comunicacao_modelos` com canal
-- WHATSAPP. O texto original continua no codigo (src/lib/comunicacao/modelos-whatsapp.ts).
--
-- O que faltava: a RLS de `comunicacao_modelos` so deixa ler quem tem a celula
-- comunicacao_modelos (quem EDITA). Mas quem USA o texto e toda a equipe (vendedor, SAC,
-- cobranca, eventos). `modelos_whatsapp()` devolve SO o canal WHATSAPP, so (codigo, textos),
-- a qualquer pessoa da equipe e ao servidor sem sessao. Associado do /portal nao le.
-- Editar segue sendo a celula comunicacao_modelos.editar (0170). Nada mais muda.
-- ============================================================================

create or replace function modelos_whatsapp()
returns table (codigo text, textos jsonb)
language sql stable security definer set search_path = public
as $$
  select m.codigo, m.textos
    from comunicacao_modelos m
   where m.canal = 'WHATSAPP'
     and (is_staff() or auth.uid() is null);
$$;
comment on function modelos_whatsapp() is
  'Textos dos modelos de WhatsApp (0172) para quem envia: toda a equipe e o servidor. O original mora no codigo.';

-- rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
