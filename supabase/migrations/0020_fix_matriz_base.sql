-- ============================================================================
-- SCar :: 0020_fix_matriz_base.sql
-- Corrige/normaliza a MATRIZ BASE por faixa FIPE:
--   * A matriz base deve conter a VARIAVEL DE RISCO (Protecao Casco) e a Taxa
--     Administrativa -- ambos FAIXA_FIPE, obrigatorios, ativos.
--   * RCF (terceiros) e SEMPRE opcional e FIXO (preco por faixa de cobertura,
--     nunca por faixa FIPE); nao pode ocupar coluna na matriz base.
--   * Assistencia 24h base: FIXO, obrigatorio.
--   * Rastreador: aposentado (virou regra por tipo de veiculo).
-- Idempotente e auto-corretivo: reafirma as definicoes independentemente de
-- como o cadastro tenha derivado, e limpa faixas indevidas (RCF/Rastreador).
-- ============================================================================

-- Base variavel por faixa: Casco (risco) e Taxa Administrativa.
update produtos
   set metodo_preco = 'FAIXA_FIPE', obrigatorio = true, status = true, categoria = 'CASCO'
 where nome = 'Protecao Casco';

update produtos
   set metodo_preco = 'FAIXA_FIPE', obrigatorio = true, status = true, categoria = 'ADMIN'
 where nome = 'Taxa Administrativa';

-- Assistencia 24h base: FIXO obrigatorio (mantem o valor ja cadastrado).
update produtos
   set metodo_preco = 'FIXO', obrigatorio = true, status = true
 where nome = 'Assistencia 24h';

-- Rastreador: aposentado -> vira regra por tipo de veiculo (0019).
update produtos set obrigatorio = false, status = false where nome = 'Rastreador';

-- RCF: sempre opcional e FIXO (preco por faixa de cobertura escolhida).
update produtos
   set metodo_preco = 'FIXO', obrigatorio = false, categoria = 'RCF'
 where categoria = 'RCF' or nome ilike 'RCF%';

-- Limpa da matriz base quaisquer faixas indevidas: nada de RCF, Rastreador ou
-- de produtos que nao sejam FAIXA_FIPE (ex.: opcionais FIXO que foram parar la).
delete from tabela_precos_faixa
 where produto_id in (
   select id from produtos
    where categoria in ('RCF', 'RASTREADOR')
       or metodo_preco <> 'FAIXA_FIPE'
       or status = false
 );
