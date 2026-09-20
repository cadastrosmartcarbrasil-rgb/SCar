/**
 * ADICIONAL DE RISCO POR REGIONAL (migration 0081).
 *
 * Espelho puro do SQL, para a TELA dizer exatamente o que o banco vai fazer.
 * A regra que vale e a do banco (`calcular_mensalidade`); esta copia existe
 * para o simulador e a grade mostrarem o resultado antes de salvar. Mexeu num
 * lado, mexa no outro e nos dois testes.
 *
 * A ideia em uma linha: a tabela da MATRIZ continua sendo a unica tabela de
 * preco. Cada regional cadastra UM valor em R$ por TIPO DE VEICULO, somado
 * UMA VEZ a mensalidade de qualquer faixa FIPE daquele tipo.
 */

export type AdicionalRegional = {
  regional_id: string;
  regional_nome: string;
  regional_ativa: boolean;
  adicional_id: string | null;
  valor: number | null;          // null = SEM adicional (diferente de R$ 0,00)
  justificativa: string | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  veiculos: number;
};

/**
 * 🔴 A regra que o desenho inteiro protege: o adicional entra UMA VEZ sobre o
 * total, nunca por produto. Cada faixa tem 2 produtos obrigatorios hoje; se
 * alguem somar dentro do laco, +R$ 5,00 vira +R$ 10,00 e o erro passa
 * despercebido porque o numero continua "parecendo certo".
 */
export function mensalidadeComAdicional(totalDaMatriz: number, adicional: number): number {
  return Math.round((totalDaMatriz + (adicional || 0)) * 100) / 100;
}

/**
 * O adicional vigente NAQUELA DATA. Vigencia e meio-aberta `[inicio, fim)`,
 * igual ao `daterange` da constraint de exclusao no banco — se aqui fosse
 * fechada, a tela mostraria um dia a mais que o banco cobra.
 */
export function adicionalVigente(
  linhas: Pick<AdicionalRegional, 'valor' | 'vigencia_inicio' | 'vigencia_fim'>[],
  data = new Date().toISOString().slice(0, 10),
): number {
  const achou = linhas.find(
    (l) =>
      l.valor != null &&
      (!l.vigencia_inicio || l.vigencia_inicio <= data) &&
      (!l.vigencia_fim || l.vigencia_fim > data),
  );
  return achou?.valor ?? 0;
}

/** "sem adicional" e "R$ 0,00 cadastrado" nao sao a mesma coisa na grade. */
export function temAdicional(linha: Pick<AdicionalRegional, 'valor'>): boolean {
  return linha.valor != null && linha.valor > 0;
}

/**
 * O que a grade mostra no rodape: quantas unidades cobram a mais e qual o maior
 * salto. Media nao serve aqui — o que a diretoria precisa ver e o EXTREMO, que
 * e onde a reclamacao aparece.
 */
export function resumoDaGrade(linhas: AdicionalRegional[]): {
  comAdicional: number;
  total: number;
  maior: number;
  veiculosAfetados: number;
} {
  const com = linhas.filter(temAdicional);
  return {
    comAdicional: com.length,
    total: linhas.length,
    maior: com.reduce((m, l) => Math.max(m, l.valor ?? 0), 0),
    veiculosAfetados: com.reduce((s, l) => s + (l.veiculos || 0), 0),
  };
}

/**
 * O aviso de que o cadastro NAO retroage. Veiculo que ja esta na base carrega o
 * adicional carimbado na entrada — mudar aqui so vale para venda nova. Sem esse
 * texto, "reajustei e nao mudou nada" vira chamado.
 */
export function avisoDeReajuste(linha: AdicionalRegional, novoValor: number | null): string | null {
  const antes = linha.valor ?? 0;
  const depois = novoValor ?? 0;
  if (antes === depois) return null;
  if (linha.veiculos === 0) {
    return depois === 0
      ? `${linha.regional_nome} volta ao preco da matriz.`
      : `Vale para as proximas vendas de ${linha.regional_nome}.`;
  }
  return (
    `${linha.veiculos} veiculo(s) ja na base de ${linha.regional_nome} continuam com o ` +
    `adicional da entrada — a mudanca so vale para venda nova.`
  );
}

/**
 * A divergencia que pede alcada: vendeu uma unidade, o associado e de outra.
 * Quem precifica e o ASSOCIADO (nao existe de-para CEP neste sistema, entao a
 * regional dele e o dado mais proximo do endereco que temos).
 */
export function textoDaDivergencia(
  precoNome: string | null,
  leadNome: string | null,
): string | null {
  if (!precoNome || !leadNome || precoNome === leadNome) return null;
  return (
    `O associado e de ${precoNome} e a venda e de ${leadNome}. ` +
    `O preco segue o do associado (${precoNome}).`
  );
}
