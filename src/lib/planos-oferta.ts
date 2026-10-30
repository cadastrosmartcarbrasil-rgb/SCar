// ---------------------------------------------------------------------------
// O que a cotacao OFERECE para um veiculo (0162).
//
// Pedido do usuario (30/10/2026):
//  - plano so para o tipo de veiculo dele (sem plano de moto para carro e vice-versa);
//  - beneficios PRE-MARCADOS no plano, que o consultor ou o cliente tira ou TROCA
//    (vidros completo -> so parabrisa) para chegar ao valor.
// A trava do tipo tambem vive no banco (trigger em `cotacoes`); aqui e para a
// tela nao oferecer.
// ---------------------------------------------------------------------------
import { grupoDaCobertura, type GrupoCobertura } from './coberturas';

/** plano_id -> tipos marcados. Sem entrada = todos os tipos. */
export type TiposPorPlano = Record<string, string[]>;
/** plano_id -> produtos pre-marcados. */
export type SugestoesPorPlano = Record<string, string[]>;

/** Espelho de `plano_atende_tipo` (0162). */
export function planoAtendeTipo(
  planoId: string | null | undefined, tipoId: string | null | undefined, mapa: TiposPorPlano | undefined,
): boolean {
  if (!planoId || !tipoId) return true;
  const tipos = mapa?.[planoId];
  return !tipos || tipos.length === 0 || tipos.includes(tipoId);
}

export function planosDoTipo<T extends { id: string }>(
  planos: T[], tipoId: string | null | undefined, mapa: TiposPorPlano | undefined,
): T[] {
  return planos.filter((p) => planoAtendeTipo(p.id, tipoId, mapa));
}

/**
 * Grupos em que um opcional SUBSTITUI o outro: so cabe um vidro, uma faixa de
 * terceiros, um carro reserva. Marcar "parabrisa" desmarca "vidros completo".
 */
export const GRUPOS_EXCLUSIVOS: GrupoCobertura[] = ['VIDROS', 'TERCEIROS', 'CARRO_RESERVA'];

type ProdutoGrupo = { id: string; nome: string; categoria?: string | null };

/** Marca/desmarca um opcional; ao marcar, tira o outro do mesmo grupo exclusivo. */
export function alternarOpcional(sel: Iterable<string>, id: string, produtos: ProdutoGrupo[]): Set<string> {
  const n = new Set(sel);
  if (n.has(id)) { n.delete(id); return n; }
  const p = produtos.find((x) => x.id === id);
  const g = p ? grupoDaCobertura(p) : null;
  if (g && GRUPOS_EXCLUSIVOS.includes(g)) {
    for (const outro of produtos) {
      if (outro.id !== id && n.has(outro.id) && grupoDaCobertura(outro) === g) n.delete(outro.id);
    }
  }
  n.add(id);
  return n;
}

/**
 * Os pre-marcados de um plano que fazem sentido aqui: so o que esta sendo
 * oferecido (atende o tipo, ativo) e que o plano ja nao inclui.
 */
export function sugestoesDoPlano(
  planoId: string | null | undefined, mapa: SugestoesPorPlano | undefined,
  oferecidos: string[], incluidosNoPlano: string[] = [],
): string[] {
  if (!planoId) return [];
  return (mapa?.[planoId] ?? []).filter((id) => oferecidos.includes(id) && !incluidosNoPlano.includes(id));
}

// ---------------------------------------------------------------------------
// PLANO PREFERENCIAL (0163) — pedido do usuario (30/10/2026): o preferencial
// aparece no TOPO e ja vem escolhido; os demais aparecem SEM o valor ate o
// consultor (ou o cliente) clicar neles. Sem preferencial entre os oferecidos,
// nada se esconde (esconder tudo seria pior que o de antes).
// ---------------------------------------------------------------------------
export type PlanoOrdenavel = { plano_id: string | null; preferencial?: boolean | null };

/** Preferenciais primeiro; o resto mantem a ordem que veio (nivel, nome). */
export function ordenarPorPreferencia<T extends PlanoOrdenavel>(planos: T[]): T[] {
  return planos
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(!!b.p.preferencial) - Number(!!a.p.preferencial) || a.i - b.i)
    .map((x) => x.p);
}

/** O plano que ja vem escolhido: o preferencial; sem ele, `reserva` (a regra antiga da tela). */
export function planoInicial<T extends PlanoOrdenavel>(planos: T[], reserva: T | null | undefined): T | null {
  return planos.find((p) => p.preferencial) ?? reserva ?? planos[0] ?? null;
}

/** O valor deste plano ja pode aparecer? */
export function valorVisivel(
  plano: PlanoOrdenavel, todos: PlanoOrdenavel[], revelados: ReadonlySet<string>, chave: string,
): boolean {
  if (!todos.some((p) => p.preferencial)) return true;
  return !!plano.preferencial || revelados.has(chave);
}
