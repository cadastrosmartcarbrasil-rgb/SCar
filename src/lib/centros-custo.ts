/**
 * Centros de custo (tabela `centros_custo`, 0012) — o cadastro.
 *
 * O ASSIST24 nasce sozinho (0027): `centro_custo_assistencia()` o acha pelo
 * CODIGO e todo lancamento da 24h vai para ele. Trocar o codigo ou apagar o
 * registro faria a funcao criar outro e a 24h se dividir em dois centros —
 * por isso ele e protegido aqui.
 */
export const CODIGO_ASSISTENCIA = 'ASSIST24';

export interface CentroCustoEditavel {
  id?: string;
  nome?: string | null;
  codigo?: string | null;
}

export function ehCentroDoSistema(c: { codigo?: string | null }): boolean {
  return (c.codigo ?? '').trim().toUpperCase() === CODIGO_ASSISTENCIA;
}

function chave(v: string | null | undefined): string {
  return (v ?? '').trim().toUpperCase();
}

/** Erro para mostrar na tela, ou null quando pode salvar. */
export function validarCentroCusto(
  c: CentroCustoEditavel,
  existentes: { id: string; nome: string; codigo: string | null }[],
): string | null {
  if (!chave(c.nome)) return 'Informe o nome do centro de custo.';
  const outros = existentes.filter((e) => e.id !== c.id);
  if (outros.some((e) => chave(e.nome) === chave(c.nome))) return 'Já existe um centro de custo com esse nome.';
  if (chave(c.codigo) && outros.some((e) => chave(e.codigo) === chave(c.codigo)))
    return 'Já existe um centro de custo com esse código.';
  const original = existentes.find((e) => e.id === c.id);
  if (original && ehCentroDoSistema(original) && chave(c.codigo) !== CODIGO_ASSISTENCIA)
    return 'O código ASSIST24 e usado pela Assistência 24h e não pode ser trocado.';
  if (!original && chave(c.codigo) === CODIGO_ASSISTENCIA)
    return 'O código ASSIST24 e reservado para a Assistência 24h.';
  return null;
}

/** Excluir so sem lancamento: a FK e `on delete set null` e apagaria a classificacao em silencio. */
export function podeExcluirCentro(c: { codigo?: string | null }, lancamentos: number): boolean {
  return !ehCentroDoSistema(c) && lancamentos === 0;
}

/** Opcoes do lancamento: so os ativos, mais o ja escolhido (para o salvar nao apaga-lo calado). */
export function centrosParaEscolher<T extends { id: string; ativo: boolean; nome: string }>(
  centros: T[],
  atual?: string | null,
): T[] {
  return centros.filter((c) => c.ativo || c.id === atual);
}
