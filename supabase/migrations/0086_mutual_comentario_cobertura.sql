-- =====================================================================
-- 0086_mutual_comentario_cobertura — o conserto de passagem que a 0085 deixou
-- =====================================================================
-- A 0085 esta APLICADA e migration e append-only, entao o arquivo dela nao foi
-- reescrito: ele e o registro do que rodou. Mas o `comment on function` que ela
-- gravou NO BANCO carrega um numero ERRADO meu, e comentario e o primeiro lugar
-- onde a proxima sessao procura a conclusao:
--
--   diz  "17 ids cobrem 90%" da matriz e "26 de 91" da base viva
--   e sao   **18**                    e   **29**
--
-- Nao e arredondamento. Medido na carteira real em 01/10/2026 com a regra certa
-- (*a primeira posicao cujo acumulado ALCANCA o alvo*), em fracao exata, sem
-- `numeric(5,1)`: a posicao 17 cobre 89,81% e a 18 cobre 90,64%. O erro saiu de
-- uma consulta avulsa minha, anterior a migration, com uma contagem acumulada
-- frouxa (`count(cob <= 90) + 1`).
--
-- A CONCLUSAO nao muda ("e entregavel, e a tela diz onde parar") e
-- `idsPara90Pct` (src/lib/mutual.ts) sempre esteve certa — ela e a regua, e foi
-- contra ela que o SQL foi conferido. O que muda e o numero, e numero errado
-- escrito com confianca e exatamente a familia de erro que este projeto
-- persegue (o branch "espelhado", a `schema_migrations` vazia).
--
-- Esta migration NAO muda comportamento: nenhuma funcao, tabela, policy ou
-- permissao e tocada. Ela existe para o banco parar de afirmar o numero errado.
-- =====================================================================

comment on function mutual_planos_externos(uuid) is
  'O de-para do PLANO: um `plan_id` do Mutual -> um `planos_protecao` do SCar, com o PESO da '
  'carteira e a COBERTURA ACUMULADA. E a cobertura que diz onde parar: medido em 01/10/2026, '
  '18 dos 42 ids cobrem 90% dos 481 faturaveis da SMART CAR MATRIZ, e 29 dos 91 cobrem 90% dos '
  '3.041 da base viva inteira. `p_regional_id` nulo = a base toda; com unidade, o peso e o '
  'daquela unidade, porque a carga roda POR UNIDADE. '
  'O perfil (`mensalidade_mediana`, `fipe_min`, `fipe_max`) serve para RECONHECER e para '
  'DESCONFIAR, nunca para identificar: dentro do MESMO id a FIPE varia de 6x a 14x (1.111x no '
  'id 48), logo o id e combo comercial e nao faixa de preco. A mediana e `percentile_cont`, que '
  'INTERPOLA (mesma escolha da 0064) — serve para perfil, nao e um preco real. '
  'So leitura: nao carrega, nao muda preco e nao toca em `veiculos`.';

-- A 0085 tambem gravou o numero no comentario da tabela de vinculo? Nao — ela
-- so comentou a funcao. Nada mais a corrigir aqui, e e de proposito que esta
-- migration e curta: ela paga UMA divida registrada, nao arruma a vizinhanca.
