-- ============================================================================
-- 0196 :: VIDEO NOS ANEXOS DO EVENTO
-- ----------------------------------------------------------------------------
-- Pedido do usuario (12/11/2026): a aba Anexos do evento nao aceitava video.
-- O video e reduzido no navegador (720p, ~1,2 Mbps, ate 90 s) antes de subir;
-- o banco aceita o tipo novo VIDEO com teto de 50 MB (o mesmo da revistoria,
-- 0137). Os demais anexos seguem com o teto de 10 MB da 0048.
-- Novo valor de enum nao pode ser USADO na mesma transacao: a constraint
-- compara como texto.
-- ============================================================================
alter type tipo_documento_anexo add value if not exists 'VIDEO';

alter table anexos_evento drop constraint if exists chk_anexo_evento_tamanho;
alter table anexos_evento add constraint chk_anexo_evento_tamanho
  check (
    tamanho_bytes is null
    or tamanho_bytes <= case when tipo_documento::text = 'VIDEO' then 52428800 else 10485760 end
  ) not valid;

comment on constraint chk_anexo_evento_tamanho on anexos_evento is
  '0196: video (tipo VIDEO) ate 50 MB; os demais anexos ate 10 MB (0048). NOT VALID: o historico anterior a compressao fica onde esta.';
