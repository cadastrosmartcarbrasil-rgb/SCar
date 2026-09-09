// ---------------------------------------------------------------------------
// Regras puras do cadastro da REGIONAL (unidade/franquia) — espelho do que a
// 0067 faz no banco. Mexeu num lado, mexa no outro e nos dois testes.
//
// A regra que da nome ao arquivo: `ativo` decide onde a unidade e OFERECIDA,
// nunca o que ela ja produziu. Unidade inativa some das listas de escolha, do
// hotlink e do rodizio; continua inteira no historico dos relatorios e do DRE.
// Esconder o passado de uma franquia encerrada nao "limpa" o relatorio —
// falsifica o resultado da associacao.
// ---------------------------------------------------------------------------

export interface RegionalSelecionavel {
  id: string;
  nome: string;
  ativo?: boolean | null;
}

/**
 * Lista para ESCOLHER a unidade (novo usuario, novo vendedor, novo associado,
 * lancamento, comunicado, seletor da matriz): so as ativas.
 *
 * A inativa selecionada continua na lista — senao o campo apareceria em branco
 * ao abrir um registro antigo e o primeiro "salvar" trocaria a unidade dele
 * sem ninguem perceber.
 */
export function opcoesParaEscolher<T extends RegionalSelecionavel>(
  regionais: T[] | undefined,
  selecionada?: string | null,
): T[] {
  return (regionais ?? []).filter((r) => r.ativo !== false || r.id === selecionada);
}

/**
 * Lista para FILTRAR relatorio (DRE, cobrancas, assistencia, rastreadores):
 * ativas primeiro, inativas depois e marcadas. Consolidado de periodo passado
 * precisa poder ser aberto por uma unidade ja encerrada.
 */
export function opcoesParaFiltrar<T extends RegionalSelecionavel>(
  regionais: T[] | undefined,
): { ativas: T[]; inativas: T[] } {
  const todas = regionais ?? [];
  return {
    ativas: todas.filter((r) => r.ativo !== false),
    inativas: todas.filter((r) => r.ativo === false),
  };
}

export interface ContagemRegional {
  usuarios?: number | null;
  vendedores?: number | null;
  associados?: number | null;
  veiculos?: number | null;
  leads?: number | null;
  lancamentos?: number | null;
}

/**
 * O que impede a exclusao — mesma conta do trigger `fn_regional_bloqueia_exclusao`.
 * Devolve a lista pronta para a tela dizer POR QUE nao da, em vez de so
 * desabilitar o botao.
 */
export function pendenciasDaUnidade(c: ContagemRegional | null | undefined): string[] {
  if (!c) return [];
  const partes: Array<[number, string, string]> = [
    [Number(c.usuarios ?? 0), 'usuario', 'usuarios'],
    [Number(c.vendedores ?? 0), 'vendedor', 'vendedores'],
    [Number(c.associados ?? 0), 'associado', 'associados'],
    [Number(c.veiculos ?? 0), 'veiculo', 'veiculos'],
    [Number(c.leads ?? 0), 'lead', 'leads'],
    [Number(c.lancamentos ?? 0), 'lancamento financeiro', 'lancamentos financeiros'],
  ];
  return partes
    .filter(([n]) => n > 0)
    .map(([n, sing, plur]) => `${n} ${n === 1 ? sing : plur}`);
}

export function podeExcluirUnidade(c: ContagemRegional | null | undefined): boolean {
  return pendenciasDaUnidade(c).length === 0;
}

/**
 * O aviso que a tela mostra antes de inativar. Inativar e sempre permitido —
 * a mensagem existe para quem clica saber o que vai acontecer com a operacao
 * que ficou para tras, nao para impedir.
 */
export function avisoDeInativacao(
  nome: string,
  c: ContagemRegional | null | undefined,
): string {
  const pend = pendenciasDaUnidade(c);
  if (pend.length === 0) {
    return `Inativar "${nome}"? Ela sai das listas de escolha e dos hotlinks. Nao ha nenhum registro vinculado.`;
  }
  return (
    `Inativar "${nome}"?\n\n` +
    `Ela sai das listas de escolha, para de captar por hotlink e nao entra no rodizio.\n` +
    `O que ja existe NAO e apagado nem some dos relatorios: ${pend.join(', ')}.`
  );
}

/** Rotulo curto da situacao, usado na lista e no selo. */
export function rotuloSituacao(ativo: boolean | null | undefined): 'Ativa' | 'Inativa' {
  return ativo === false ? 'Inativa' : 'Ativa';
}

/**
 * Rotulo da unidade em FILTRO de relatorio. A inativa continua na lista — o
 * consolidado de um periodo passado precisa poder ser aberto por uma franquia
 * ja encerrada — mas tem de aparecer marcada, senao quem filtra nao entende
 * por que aquela unidade parou de crescer.
 */
export function rotuloUnidade(r: { nome: string; ativo?: boolean | null }): string {
  return r.ativo === false ? `${r.nome} (inativa)` : r.nome;
}
