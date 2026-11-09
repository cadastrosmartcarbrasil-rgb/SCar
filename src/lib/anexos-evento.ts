// Quais anexos do evento a equipe pode excluir (inclusao errada). O que o
// sistema gerou tem caminho proprio: a OS se cancela/retifica, o termo de
// entrega se cancela e a via assinada se troca na aba Termos.
export interface AnexoEventoBasico {
  tipo_documento: string;
  termo_emitido_id?: string | null;
}

export function motivoAnexoNaoExcluivel(a: AnexoEventoBasico): string | null {
  if (a.tipo_documento === 'TERMO_ENTREGA_ASSINADO') return 'Via assinada do termo de entrega: troque-a pela aba Termos.';
  if (a.termo_emitido_id || a.tipo_documento === 'ORDEM_SERVICO' || a.tipo_documento === 'TERMO_ENTREGA') {
    return 'Documento gerado pelo sistema: cancele ou retifique pela aba correspondente.';
  }
  return null;
}

/** Motivo de exclusao com pelo menos 5 letras (fica no historico do evento). */
export function motivoExclusaoValido(m: string | null | undefined): boolean {
  return (m ?? '').trim().length >= 5;
}
