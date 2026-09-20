/**
 * Quando um clique no FUNDO deve fechar o modal — e quando NAO deve.
 *
 * O BUG QUE ISTO CONSERTA (relatado em producao): num cadastro longo, selecionar
 * o texto de um campo com o mouse e soltar o botao FORA do modal fechava tudo,
 * sem salvar, com a ficha inteira preenchida. Nao era descuido do operador: o
 * navegador dispara o `click` no **ancestral comum** do mousedown e do mouseup,
 * e quando a selecao comeca no campo e termina no fundo esse ancestral e o
 * PROPRIO FUNDO. Por isso o `stopPropagation()` do conteudo nunca rodava — o
 * evento nao passava por ele, nascia ja no fundo.
 *
 * A regra certa nao e "o clique foi no fundo?", e sim **"o GESTO inteiro
 * aconteceu no fundo?"**: so fecha quando o botao desceu no fundo E subiu no
 * fundo. Arrastar de dentro para fora (selecionar texto) e arrastar de fora
 * para dentro deixam de fechar.
 */
export type GestoNoFundo = {
  /** O botao DESCEU sobre o fundo (e nao sobre o conteudo do modal)? */
  inicio: boolean;
  /** O botao SUBIU sobre o fundo? */
  fim: boolean;
};

export const GESTO_ZERADO: GestoNoFundo = { inicio: false, fim: false };

/**
 * So fecha o gesto que comecou E terminou no fundo.
 *
 * Nao basta olhar o fim: numa selecao de texto o `mouseup` pode ser entregue ao
 * fundo (o cursor esta la) ou ao campo de origem (quando o navegador captura o
 * ponteiro na selecao) — os dois casos existem, e os dois tem de NAO fechar.
 * Exigir tambem o inicio cobre os dois de uma vez.
 */
export function deveFecharPeloFundo(gesto: GestoNoFundo): boolean {
  return gesto.inicio && gesto.fim;
}
