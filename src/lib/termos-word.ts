/**
 * Importar o termo do Word (.docx) para o editor (0123).
 *
 * O Word usa uma IMAGEM minuscula para cada caixinha de marcar (no Termo de
 * Adesao da Smart Car e um PNG de ~1 KB repetido). Imagem tao pequena vira o
 * caractere ☐ — no editor ela pode depois ser trocada por um campo de marca
 * (☒/☐ conforme o cadastro). Imagem de verdade (logo, assinatura) fica.
 * Caractere de fonte simbolo (Wingdings, area de uso privado) tambem vira ☐.
 */

/** Base64 abaixo disto (~3 KB de arquivo) e caixinha, nao figura. */
const LIMITE_CAIXINHA_BASE64 = 4000;

import { alinharColunasDasTabelas } from './termos';

export function limparHtmlDoWord(html: string): string {
  return alinharColunasDasTabelas(html ?? '')
    .replace(/<img\b[^>]*\bsrc="data:[^";]+;base64,([^"]*)"[^>]*\/?>/g, (m, b64: string) =>
      b64.length < LIMITE_CAIXINHA_BASE64 ? '☐' : m)
    .replace(/[\uF000-\uF0FF]/g, '☐')
    // paragrafos vazios em sequencia viram um so
    .replace(/(<p>\s*<\/p>\s*){2,}/g, '<p></p>');
}

/** .docx -> HTML limpo, no navegador (o mammoth so carrega quando usado). */
export async function htmlDoWord(arquivo: ArrayBuffer): Promise<{ html: string; avisos: string[] }> {
  const mod = await import('mammoth');
  const mammoth = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const r = await mammoth.convertToHtml({ arrayBuffer: arquivo });
  return {
    html: limparHtmlDoWord(r.value),
    avisos: (r.messages ?? []).filter((m) => m.type === 'warning' && !m.message.startsWith('Unrecognised'))
      .map((m) => m.message),
  };
}
