// ============================================================================
// Moeda (BRL) — regra unica de digitacao/leitura usada por todo o sistema.
//
// Problema que isto resolve: <input type="number"> comeca preenchido com "0",
// obriga o operador a apagar/posicionar o cursor e ainda aceita "0012".
//
// Regra: DIGITACAO LIVRE. O campo nasce vazio (placeholder 0,00) e enquanto
// esta em foco mostra exatamente o que foi digitado — nada de mascara viva
// reposicionando o cursor. Ao sair do campo o valor e normalizado para o
// padrao BR com 2 casas.
//
//   "352"      -> 352,00        (trezentos e cinquenta e dois reais)
//   "352,00"   -> 352,00
//   "1500,5"   -> 1.500,50
//   "1.234,56" -> 1.234,56      (colado de boleto)
//   "1234.56"  -> 1.234,56      (colado de CSV/FIPE)
//
// NAO usar mascara por centavos aqui: ela insere uma virgula ja na primeira
// tecla e, quem digita o separador em seguida, acaba com "0,0352,00".
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
 * Interpreta o que foi digitado/colado no campo de moeda.
 * O texto e apenas higienizado (fora digito, virgula e ponto, nada passa) e
 * devolvido como esta: reformatar a cada tecla faria o cursor pular.
 * A formatacao final acontece no blur, com `formatarMoedaBR`.
 */
export function digitarMoeda(entrada: string): Digitacao {
  const limpo = (entrada ?? '').replace(/[^\d.,]/g, '');
  if (!/\d/.test(limpo)) return { valor: null, texto: limpo.replace(/[.,]/g, '') };
  return { valor: parseMoedaBR(limpo), texto: limpo };
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
