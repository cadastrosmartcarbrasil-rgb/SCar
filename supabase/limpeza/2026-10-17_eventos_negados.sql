-- LIMPEZA DE DADOS DE TESTE — eventos do Kanban na situacao NEGADO (17/10/2026)
-- Autorizado pelo usuario: "remover todos os registros atuais do kanban de eventos
-- (dados de testes anteriores) — apenas os que estao em NEGADO".
-- Nao e migration: e um script de uma vez so, guardado como registro do que rodou.
--
-- Conferido antes de rodar (producao, 17/10/2026): 6 eventos, TODOS em NEGADO.
--   EVT-20260803-0001 · EVT-20260810-0001 · EVT-20260815-0001 · EVT-20260815-0002
--   EVT-20260903-0001 · EVT-20261013-0001
-- Ligados a eles (tambem teste, saem junto para nao ficar orfao no DRE/Central):
--   1 conta a pagar "OFICINA" R$ 5.000 quitada (+ a baixa) · 4 movimentacoes de
--   caixa pendentes · 6 protocolos (atendimentos) do evento · e, em cascata, 20
--   linhas de historico, 4 cotacoes de pecas, 1 terceiro e 2 anexos.
-- A ORDEM importa: lancamentos_financeiros.evento_terceiro_id e RESTRICT, entao o
-- lancamento sai antes do evento. Os 2 arquivos no bucket de eventos ficam no
-- Storage (SQL nao apaga objeto de storage); sao inofensivos e podem sair pelo painel.

begin;

create temp table _negados on commit drop as
  select id from eventos_sinistro where status::text = 'NEGADO';

-- conta a pagar do evento (a baixa sai em cascata)
delete from lancamentos_financeiros where evento_id in (select id from _negados);

-- movimentacoes de caixa avulsas do evento
delete from movimentacoes_caixa where evento_id in (select id from _negados);

-- protocolos do evento na Central (as interacoes saem em cascata)
delete from atendimentos where evento_id in (select id from _negados);

-- os eventos (historico, anexos, cotacoes/itens, NF e terceiros em cascata)
delete from eventos_sinistro where id in (select id from _negados);

commit;

-- Conferencia:
-- select status::text, count(*) from eventos_sinistro group by 1;   -- sem NEGADO
