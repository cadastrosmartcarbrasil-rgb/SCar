/**
 * Produto por TIPO DE VEICULO (0089).
 *
 * Espelho de `produto_atende_tipo` no banco: produto SEM tipo marcado vale para
 * TODOS; tipo ainda nao escolhido na tela tambem nao filtra nada. A regra que
 * vale e a do banco (o motor `calcular_mensalidade` ignora o produto que nao
 * atende o tipo); esta copia existe para a TELA nao oferecer o que o motor nao
 * vai cobrar — parabrisa para moto, por exemplo. Mexeu num lado, mexa no outro
 * e nos dois testes.
 */

/** produto_id -> tipos de veiculo a que ele se aplica (ausente = todos). */
export type TiposPorProduto = Record<string, string[]>;

export function produtoAtendeTipo(
  produtoId: string,
  tipoVeiculoId: string | null | undefined,
  mapa: TiposPorProduto | undefined,
): boolean {
  if (!tipoVeiculoId) return true;
  const tipos = mapa?.[produtoId];
  if (!tipos || tipos.length === 0) return true;
  return tipos.includes(tipoVeiculoId);
}

/**
 * Os produtos que a tela oferece para o tipo escolhido. `manter` preserva o que
 * ja esta gravado (um avulso antigo de um tipo que deixou de ser atendido):
 * esconder faria o proximo "salvar" apagar a escolha sem ninguem ver — a mesma
 * mordida da cor (0080) e da unidade inativa (0067). Quem fica por esse motivo e
 * marcado com `foraDoTipo`, para a tela avisar.
 */
export function produtosParaTipo<P extends { id: string }>(
  produtos: P[],
  tipoVeiculoId: string | null | undefined,
  mapa: TiposPorProduto | undefined,
  manter: Iterable<string> = [],
): (P & { foraDoTipo: boolean })[] {
  const fica = new Set(manter);
  const out: (P & { foraDoTipo: boolean })[] = [];
  for (const p of produtos) {
    const atende = produtoAtendeTipo(p.id, tipoVeiculoId, mapa);
    if (atende || fica.has(p.id)) out.push({ ...p, foraDoTipo: !atende });
  }
  return out;
}

/** Rotulo curto dos tipos de um produto: "Todos os tipos" ou "Passeio, Pick-up". */
export function rotuloTiposDoProduto(
  produtoId: string,
  mapa: TiposPorProduto | undefined,
  nomeDoTipo: (id: string) => string | undefined,
): string {
  const tipos = mapa?.[produtoId];
  if (!tipos || tipos.length === 0) return 'Todos os tipos';
  const nomes = tipos.map((t) => nomeDoTipo(t)).filter((n): n is string => !!n);
  return nomes.length ? nomes.sort((a, b) => a.localeCompare(b)).join(', ') : 'Todos os tipos';
}

/**
 * A regra do rastreador do TIPO (0019) ja cobra este veiculo? Espelho da
 * condicao de `calcular_mensalidade`: tipo que exige e FIPE ACIMA do limite de
 * isencao. Tipo ou FIPE desconhecidos = nao (nao esconda nada no escuro).
 */
export function regraRastreadorCobra(
  tipo: { exige_rastreador?: boolean | null; valor_limite_isencao?: number | null } | null | undefined,
  fipe: number | null | undefined,
): boolean {
  if (!tipo || !tipo.exige_rastreador || !fipe) return false;
  return fipe > Number(tipo.valor_limite_isencao ?? 0);
}

/**
 * Tira da lista o rastreador OPCIONAL (0090) quando a regra do tipo ja cobra —
 * oferecer seria vender o mesmo equipamento duas vezes. O que ja esta gravado
 * fica (`manter`), e o motor ignora de qualquer jeito.
 */
export function semRastreadorDaRegra<P extends { id: string; rastreador_avulso?: boolean | null }>(
  produtos: P[],
  regraCobra: boolean,
  manter: Iterable<string> = [],
): P[] {
  if (!regraCobra) return produtos;
  const fica = new Set(manter);
  return produtos.filter((p) => !p.rastreador_avulso || fica.has(p.id));
}
