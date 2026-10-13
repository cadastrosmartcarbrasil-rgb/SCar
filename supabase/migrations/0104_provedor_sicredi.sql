-- ============================================================================
-- SCar :: 0104_provedor_sicredi.sql
-- O SICREDI passa a ser um provedor bancario cadastravel (boleto hibrido:
-- boleto + PIX). So o valor do enum: as CREDENCIAIS do Sicredi nao ficam em
-- `integracoes_bancarias` — vivem nas variaveis SICREDI_* do servidor
-- (src/lib/pagamentos/sicredi.ts). A linha da integracao so diz QUAL gateway a
-- remessa usa, em que ambiente e para qual unidade.
--
-- O literal novo nao e USADO neste arquivo (gotcha 55P04: valor de enum novo
-- nao pode ser usado na mesma transacao que o criou).
-- ============================================================================

alter type provedor_banco add value if not exists 'SICREDI';
