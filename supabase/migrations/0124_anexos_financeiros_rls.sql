-- 0124: ANEXO DO TITULO SEGUE QUEM VE O TITULO.
--
-- O defeito (19/10/2026, supervisora FRANCIELLI): ela abre e edita a conta a
-- pagar da Assistencia 24h da MATRIZ (regional nula) pela policy
-- `lanc_assistencia` (pode_assistencia), mas o anexo era recusado:
-- "new row violates row-level security policy for table anexos_financeiros".
-- A policy do anexo (0012) repetia a regra do titulo pela metade:
-- tem_acesso_global() ou pode_regional(l.regional_id) — sem o caminho da 24h,
-- e pode_regional(null) e falso para quem nao e da matriz.
--
-- Agora o anexo pergunta UMA coisa: "voce ve o titulo?". O EXISTS roda sob a
-- RLS de lancamentos_financeiros, entao qualquer caminho que abre o titulo
-- (unidade, 24h, matriz, e o que vier depois) abre o anexo — sem uma segunda
-- copia da regra para ficar velha de novo. Anexo pendurado so na baixa
-- resolve o titulo pela baixa.

drop policy if exists anexosfin_all on anexos_financeiros;
create policy anexosfin_all on anexos_financeiros for all to authenticated
  using (
    (select is_staff()) and exists (
      select 1 from lancamentos_financeiros l
       where l.id = coalesce(anexos_financeiros.lancamento_id,
                             (select b.lancamento_id from baixas_financeiras b
                               where b.id = anexos_financeiros.baixa_id))))
  with check (
    (select is_staff()) and exists (
      select 1 from lancamentos_financeiros l
       where l.id = coalesce(anexos_financeiros.lancamento_id,
                             (select b.lancamento_id from baixas_financeiras b
                               where b.id = anexos_financeiros.baixa_id))));
