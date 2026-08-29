// ============================================================================
// Moeda (BRL) — regra unica de digitacao/leitura usada por todo o sistema.
//
// Problema que isto resolve: <input type="number"> comeca preenchido com "0",
// obriga o operador a apagar/posicionar o cursor e ainda aceita "0012".
// Aqui o campo nasce vazio (placeholder 0,00) e o operador simplesmente digita:
//
//   - So digitos  -> mascara por centavos, da direita para a esquerda:
//       1 -> 0,01 | 15 -> 0,15 | 150 -> 1,50 | 150000 -> 1.500,00
//   - Com virgula/ponto -> respeita o que foi digitado ou colado:
//       "1234,56" -> 1234.56 | "1.234,56" -> 1234.56 | "1234.56" -> 1234.56
//
// Assim funciona tanto para quem digita corrido quanto para quem cola valor
// vindo de boleto/planilha.
// ============================================================================

const NUM_BR = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formata um numero no padrao BR com 2 casas: 1500 -> "1.500,00". */
export function formatarMoedaBR(valor: number | null | undefined): string {
  if (valor == null || Number.isNaN(valor)) return '';
  return NUM_BR.format(valor);
}

/**
 * Le um texto digitado/colado e devolve o numero.
 * Aceita "1.234,56" (BR), "1234.56" (US/CSV), "1234,5" e "1234".
 * Retorna null quando nao ha digito algum.
 */
export function parseMoedaBR(texto: string): number | null {
  const limpo = (texto ?? '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(limpo)) return null;

  const negativo = limpo.trimStart().startsWith('-');
  const corpo = limpo.replace(/-/g, '');

  let normalizado: string;
  if (corpo.includes(',')) {
    // Virgula presente = separador decimal BR; pontos sao milhar.
    const partes = corpo.split(',');
    const decimais = partes.pop() ?? '';
    normalizado = `${partes.join('').replace(/\./g, '')}.${decimais}`;
  } else if (corpo.includes('.')) {
    const partes = corpo.split('.');
    const ultima = partes[partes.length - 1];
    // "1234.56" -> decimal. "1.234" / "1.234.567" -> milhar.
    if (partes.length === 2 && ultima.length > 0 && ultima.length <= 2) {
      normalizado = `${partes[0]}.${ultima}`;
    } else {
      normalizado = partes.join('');
    }
  } else {
    normalizado = corpo;
  }

  const n = Number(normalizado);
  if (Number.isNaN(n)) return null;
  return negativo ? -n : n;
}

export interface Digitacao {
  /** Valor numerico ja interpretado (null = campo vazio). */
  valor: number | null;
  /** Texto que deve continuar aparecendo no input enquanto se digita. */
  texto: string;
}

/**
 * Interpreta uma tecla/colagem no campo de moeda.
 * Sem separador -> mascara viva por centavos. Com separador -> preserva o
 * que esta sendo digitado (senao o cursor "pularia" a cada tecla).
 */
export function digitarMoeda(entrada: string): Digitacao {
  const limpo = (entrada ?? '').replace(/[^\d.,]/g, '');
  if (limpo === '') return { valor: null, texto: '' };

  if (limpo.includes(',') || limpo.includes('.')) {
    return { valor: parseMoedaBR(limpo), texto: limpo };
  }

  const digitos = limpo.replace(/^0+(?=\d)/, ''); // "007" -> "7"
  const valor = Number(digitos) / 100;
  return { valor, texto: formatarMoedaBR(valor) };
}

/** Soma centavos com seguranca (evita 0.1 + 0.2 = 0.30000000000000004). */
export function somarMoeda(...valores: Array<number | null | undefined>): number {
  const centavos = valores.reduce<number>((acc, v) => acc + Math.round((v ?? 0) * 100), 0);
  return centavos / 100;
}

/** Arredonda para 2 casas de forma estavel (meio para cima). */
export function arredondarMoeda(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
