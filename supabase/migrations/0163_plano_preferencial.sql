-- =============================================================================
-- 0163 — PLANO PREFERENCIAL
--
-- Pedido do usuario (30/10/2026): marcar nos planos qual e o PREFERENCIAL. Na
-- cotacao (CRM, portal do vendedor e hotlink) ele aparece no topo e ja vem
-- escolhido; os demais aparecem sem o valor ate alguem clicar neles.
--
-- Pode haver mais de um marcado de proposito: os planos sao por tipo de
-- veiculo (0162), entao o preferencial do carro e o da moto convivem. Na tela,
-- vence o primeiro marcado entre os oferecidos para o tipo.
-- Default false: nenhum plano muda ao aplicar e, sem preferencial, a cotacao
-- se comporta como antes (todos os valores a mostra).
-- =============================================================================

alter table planos_protecao
  add column if not exists preferencial boolean not null default false;

comment on column planos_protecao.preferencial is
  '0163: plano que aparece no topo da cotacao e ja vem escolhido; os demais mostram o valor so ao clicar.';
