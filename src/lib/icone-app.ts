/**
 * Regras puras do icone do app (PWA instalado no celular/PC e favicon).
 * O icone e gerado a partir da logo OFICIAL (`empresa.logo_url`) pela rota
 * `/icones/<tamanho>.png` — ver `src/app/icones/[arquivo]/route.tsx`.
 */

/** Tamanhos servidos: 192/512 (manifesto), 180 (Apple), 32 (aba do navegador). */
export const TAMANHOS_ICONE = [32, 180, 192, 512] as const;
export type TamanhoIcone = (typeof TAMANHOS_ICONE)[number];

/** `"192.png"` -> 192; qualquer outra coisa -> null (a rota responde 404). */
export function tamanhoDoArquivo(arquivo: string): TamanhoIcone | null {
  const m = /^(\d+)\.png$/.exec(arquivo);
  if (!m) return null;
  const n = Number(m[1]);
  return (TAMANHOS_ICONE as readonly number[]).includes(n) ? (n as TamanhoIcone) : null;
}

/** Largura e altura lidas do cabecalho IHDR de um PNG; null se nao for PNG. */
export function dimensoesPng(bytes: Uint8Array): { largura: number; altura: number } | null {
  const assinatura = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || assinatura.some((b, i) => bytes[i] !== b)) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const largura = v.getUint32(16);
  const altura = v.getUint32(20);
  return largura > 0 && altura > 0 ? { largura, altura } : null;
}

/**
 * Onde a logo cabe dentro do quadrado do icone. A margem deixa a logo inteira
 * dentro da "zona segura" do icone mascaravel do Android (circulo de 80%), que
 * recorta as bordas — logo larga encostada na borda perderia as pontas.
 */
export function caixaDoLogo(
  tamanho: number,
  logo: { largura: number; altura: number } | null,
  ocupacao = 0.7,
): { largura: number; altura: number } {
  const lado = Math.round(tamanho * ocupacao);
  if (!logo) return { largura: lado, altura: lado };
  const escala = Math.min(lado / logo.largura, lado / logo.altura);
  return {
    largura: Math.max(1, Math.round(logo.largura * escala)),
    altura: Math.max(1, Math.round(logo.altura * escala)),
  };
}
