-- =============================================================================
-- 0120 — O QUE CADA COBERTURA COBRE (pedido do usuario, 18/10/2026)
--
-- A ficha do veiculo (SAC e /veiculos/[id]) mostrava o NOME do plano e uma
-- lista de nomes de produto: para saber o que o associado tem de fato
-- ("vidros: so parabrisa? com franquia?") o atendente ia consultar o cadastro
-- dos planos. `produtos.descricao_cobertura` guarda o texto que a ficha mostra
-- aberto, ao lado de cada cobertura. Opcional: produto sem texto aparece so
-- com o nome, como antes. Nenhuma funcao, preco ou policy muda — a RLS de
-- `produtos` (select para staff, escrita pela matriz) ja vale para a coluna.
-- =============================================================================

alter table produtos add column if not exists descricao_cobertura text;

comment on column produtos.descricao_cobertura is
  'O que a cobertura cobre, em texto para o atendente (0120). Mostrado aberto na ficha do veiculo (SAC e /veiculos). Nulo = so o nome.';
