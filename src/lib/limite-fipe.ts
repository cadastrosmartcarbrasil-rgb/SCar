// ---------------------------------------------------------------------------
// FIPE ACIMA DA TABELA (0165) — o limite do tipo e o VALOR PROTEGIDO.
//
// Acima da ultima faixa o motor zera casco e taxa administrativa (nao ha preco):
// a cotacao nao pode seguir calada. Quem cota escolhe entre proteger PELO LIMITE
// (digitando o valor protegido, que vira a base do calculo), cotar so o
// rastreamento sem protecao ou recusar. O banco recusa a cotacao acima do
// limite (trg_cotacao_limite_fipe); aqui a tela pergunta antes.
// ---------------------------------------------------------------------------

export type DecisaoLimite = 'LIMITE' | 'RASTREAMENTO' | 'RECUSAR';

/** A FIPE passa do que a tabela do tipo cobre? (sem tabela = sem limite) */
export function acimaDoLimite(fipe: number | null | undefined, limite: number | null | undefined): boolean {
  return fipe != null && fipe > 0 && limite != null && limite > 0 && fipe > limite;
}

/** O valor protegido digitado: positivo, ate o limite e ate a FIPE. Devolve o erro ou null. */
export function erroValorProtegido(valor: number | null | undefined, fipe: number, limite: number): string | null {
  if (valor == null || !(valor > 0)) return 'Informe o valor protegido.';
  if (valor > limite) return `O valor protegido vai até o limite da tabela (${brl(limite)}).`;
  if (valor > fipe) return 'O valor protegido não pode passar a FIPE do veículo.';
  return null;
}

/**
 * A base do calculo e a FIPE de mercado a gravar.
 * - dentro do limite: base = FIPE, mercado = null (protecao pela FIPE inteira);
 * - acima, protegendo pelo limite com valor valido: base = valor protegido, mercado = FIPE;
 * - acima sem decisao valida: base = null (a tela nao cota).
 */
export function baseDoCalculo(entrada: {
  fipe: number | null | undefined; limite: number | null | undefined;
  decisao: DecisaoLimite | null; valorProtegido: number | null | undefined;
}): { base: number | null; mercado: number | null } {
  const { fipe, limite, decisao, valorProtegido } = entrada;
  if (!fipe || fipe <= 0) return { base: null, mercado: null };
  if (!acimaDoLimite(fipe, limite)) return { base: fipe, mercado: null };
  if (decisao === 'LIMITE' && erroValorProtegido(valorProtegido, fipe, limite as number) === null) {
    return { base: valorProtegido as number, mercado: fipe };
  }
  return { base: null, mercado: null };
}

/** O tipo "rastreamento sem protecao": o que tem "rastreamento" no nome. */
export function tipoRastreamentoSemProtecao<T extends { id: string; nome: string }>(tipos: T[]): T | null {
  return tipos.find((t) => /rastreamento/i.test(t.nome)) ?? null;
}

/** O texto do aviso para quem cota. */
export function textoAcimaDoLimite(fipe: number, limite: number, tipoNome?: string | null): string {
  return `A FIPE deste veículo (${brl(fipe)}) passa do limite da tabela${tipoNome ? ` de ${tipoNome}` : ''} `
    + `(${brl(limite)}). Ofereça a proteção pelo limite — a proteção cobre até o valor protegido — `
    + 'ou só o rastreamento, sem proteção. Se nenhuma das duas servir, a adesão é recusada.';
}

/** A frase que acompanha a cotacao limitada. */
export function textoProtecaoLimitada(protegido: number, mercado: number): string {
  return `Protegido por ${brl(protegido)} (FIPE ${brl(mercado)}): em perda total ou roubo, a proteção cobre até `
    + `${brl(protegido)}; a diferença de ${brl(mercado - protegido)} fica por conta do associado.`;
}

function brl(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v).replace(/ /g, ' ');
}
