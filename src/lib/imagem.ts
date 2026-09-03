// ============================================================================
// Imagem enviada pelo celular — regras de peso e reducao.
//
// Foto de celular hoje sai com 4 a 12 MB. Subir isso cru custa dinheiro de
// armazenamento, trava o envio na rua (4G ruim) e, do outro lado, faz a
// auditoria esperar dez segundos por foto para conferir um detalhe que cabe em
// 1600px. Entao a foto e REDUZIDA no proprio navegador, antes de subir.
//
// O teto de 10 MB tambem existe no banco (`chk_vistoria_anexo_tamanho`, 0047):
// regra que so vive na tela nao e regra.
// ============================================================================

/** Maior lado da imagem depois da reducao. 1600px mostra placa e chassi. */
export const LADO_MAXIMO = 1600;
/** Qualidade do JPEG na primeira tentativa. */
export const QUALIDADE = 0.82;
/** Alvo de peso depois de comprimir. Acima disso, tenta de novo mais forte. */
export const ALVO_BYTES = 1_500_000;
/** Teto absoluto aceito no upload (o mesmo do banco). */
export const LIMITE_BYTES = 10 * 1024 * 1024;

export interface ArquivoBasico {
  type: string;
  size: number;
  name: string;
}

export function ehImagem(file: ArquivoBasico): boolean {
  return /^image\//i.test(file.type ?? '');
}

export function ehPdf(file: ArquivoBasico): boolean {
  return /pdf$/i.test(file.type ?? '') || /\.pdf$/i.test(file.name ?? '');
}

/** "1,4 MB" — para a tela dizer o peso sem o operador fazer conta. */
export function tamanhoLegivel(bytes?: number | null): string {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Novas dimensoes mantendo a proporcao. Imagem menor que o limite NAO e
 * ampliada — esticar foto pequena so inventa pixel e engorda o arquivo.
 */
export function dimensoesAlvo(
  largura: number,
  altura: number,
  lado: number = LADO_MAXIMO,
): { largura: number; altura: number } {
  const l = Math.max(0, Math.round(largura));
  const a = Math.max(0, Math.round(altura));
  if (l === 0 || a === 0) return { largura: l, altura: a };
  const maior = Math.max(l, a);
  if (maior <= lado) return { largura: l, altura: a };
  const fator = lado / maior;
  return {
    largura: Math.max(1, Math.round(l * fator)),
    altura: Math.max(1, Math.round(a * fator)),
  };
}

/** A extensao vira .jpg: o que sai do canvas e JPEG, diga o nome o que disser. */
export function nomeComprimido(nome: string): string {
  const base = (nome ?? 'foto').replace(/\.[^.]+$/, '').trim() || 'foto';
  return `${base}.jpg`;
}

/**
 * Recusa antes de gastar rede. Devolve a mensagem para o operador ou `null`
 * quando o arquivo pode seguir.
 */
export function validarArquivo(
  file: ArquivoBasico,
  opcoes?: {
    limiteBytes?: number;
    aceitaPdf?: boolean;
    /** Outros formatos que a tela aceita, casados pelo NOME (ex.: /\.xml$/i). */
    aceitaOutros?: RegExp;
  },
): string | null {
  const limite = opcoes?.limiteBytes ?? LIMITE_BYTES;
  const imagem = ehImagem(file);
  const pdf = ehPdf(file);
  const outro = opcoes?.aceitaOutros?.test(file.name ?? '') ?? false;

  if (!imagem && !(opcoes?.aceitaPdf && pdf) && !outro) {
    return opcoes?.aceitaPdf
      ? 'Envie uma imagem (JPG/PNG) ou um PDF.'
      : 'Envie uma imagem (JPG ou PNG).';
  }
  // Imagem grande nao e erro: ela vai ser reduzida antes de subir. O que nao
  // passa e o arquivo absurdo — e o PDF, que ninguem comprime por aqui.
  if (!imagem && file.size > limite) {
    return `Arquivo de ${tamanhoLegivel(file.size)} — o limite e ${tamanhoLegivel(limite)}.`;
  }
  if (imagem && file.size > 40 * 1024 * 1024) {
    return `Imagem de ${tamanhoLegivel(file.size)} — grande demais ate para reduzir.`;
  }
  return null;
}

/** Vale a pena mexer no arquivo? */
export function precisaComprimir(file: ArquivoBasico, alvo: number = ALVO_BYTES): boolean {
  return ehImagem(file) && file.size > alvo;
}

// ---------------------------------------------------------------------------
// A reducao de verdade (so roda no navegador)
// ---------------------------------------------------------------------------

/**
 * Reduz a imagem para no maximo `LADO_MAXIMO` e recodifica em JPEG.
 *
 * Nunca falha para o chamador: formato que o navegador nao decodifica (HEIC de
 * iPhone antigo, por exemplo) volta como veio — quem barra o tamanho depois e
 * `validarArquivo` e o teto do banco. Tambem devolve o original quando o
 * "comprimido" ficaria maior, que acontece com print de tela e imagem ja
 * otimizada.
 */
export async function comprimirImagem(
  file: File,
  opcoes?: { lado?: number; qualidade?: number; alvo?: number },
): Promise<File> {
  if (typeof document === 'undefined' || !ehImagem(file)) return file;

  const lado = opcoes?.lado ?? LADO_MAXIMO;
  const alvo = opcoes?.alvo ?? ALVO_BYTES;
  let qualidade = opcoes?.qualidade ?? QUALIDADE;

  try {
    const bitmap = await createImageBitmap(file);
    const { largura, altura } = dimensoesAlvo(bitmap.width, bitmap.height, lado);

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close?.();

    let blob = await paraBlob(canvas, qualidade);
    // Uma segunda passada resolve a foto de 12 MP que continua pesada mesmo
    // reduzida. Mais que isso comeca a estragar a leitura da placa.
    if (blob && blob.size > alvo) {
      qualidade = 0.65;
      blob = await paraBlob(canvas, qualidade);
    }
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], nomeComprimido(file.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file;   // navegador nao decodificou: sobe o original
  }
}

function paraBlob(canvas: HTMLCanvasElement, qualidade: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', qualidade));
}
