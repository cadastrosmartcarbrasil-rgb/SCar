-- ============================================================================
-- SCar :: 0033_baixa_sem_atalho.sql
-- Remove o atalho `quitar_lancamento` criado no 0032.
--
-- Motivo: ele gravava uma baixa "de um clique" com a data de hoje e SEM exigir
-- a conta bancaria nem o comprovante. Toda liquidacao tem de passar pelo
-- registro de baixa completo (data, valor, desconto, juros, conta que
-- pagou/recebeu e identificador da transacao) — que e o que sustenta a
-- conciliacao bancaria e a auditoria. Um botao que pula isso so gera baixa
-- pobre para alguem corrigir depois.
--
-- Nada mais depende da funcao: o app faz a baixa inserindo em
-- `baixas_financeiras`, e o trigger `fn_recalcular_lancamento` (0012) + o
-- `fn_lanc_calcular_saldo` (0032) seguem cuidando de status e saldo.
-- ============================================================================

drop function if exists quitar_lancamento(uuid, date, uuid);
