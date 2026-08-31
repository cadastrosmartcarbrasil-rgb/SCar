/**
 * Vistoria por modelo de fotos — regras puras.
 *
 * A regra antiga era "no minimo 4 fotos", e quatro fotos da frente do carro
 * passavam. O que vale e ter as POSES obrigatorias: frente, traseira, as duas
 * laterais, o chassi e o hodometro. Espelho de
 * `supabase/migrations/0040_vistoria_modelo_fotos.sql`.
 */

export interface PoseVistoria {
  codigo: string;
  nome: string;
  instrucao: string | null;
  obrigatorio: boolean;
  ordem: number;
  enviada: boolean;
}

export interface ProgressoVistoria {
  obrigatorias: number;
  obrigatoriasFeitas: number;
  totalFeitas: number;
  completa: boolean;
  percentual: number;
  faltando: string[];
}

export function progressoVistoria(poses: PoseVistoria[]): ProgressoVistoria {
  const obrig = poses.filter((p) => p.obrigatorio);
  const feitasObrig = obrig.filter((p) => p.enviada);
  const faltando = obrig.filter((p) => !p.enviada).map((p) => p.nome);
  return {
    obrigatorias: obrig.length,
    obrigatoriasFeitas: feitasObrig.length,
    totalFeitas: poses.filter((p) => p.enviada).length,
    // Sem pose obrigatoria cadastrada a vistoria nao esta "completa": esta
    // sem regra. Melhor barrar do que aprovar por omissao.
    completa: obrig.length > 0 && faltando.length === 0,
    percentual: obrig.length === 0 ? 0 : Math.round((feitasObrig.length / obrig.length) * 100),
    faltando,
  };
}

/** A proxima foto a pedir: obrigatoria pendente na ordem; depois as opcionais. */
export function proximaPose(poses: PoseVistoria[]): PoseVistoria | null {
  const ordenadas = [...poses].sort((a, b) => a.ordem - b.ordem);
  return ordenadas.find((p) => p.obrigatorio && !p.enviada)
      ?? ordenadas.find((p) => !p.enviada)
      ?? null;
}

/**
 * Separa os opcionais entre "ja vem no plano" e "adicional avulso de verdade".
 * E o que impede o vendedor de oferecer duas vezes o mesmo item.
 */
export function separarOpcionais<T extends { id: string }>(
  opcionais: T[],
  idsDoPlano: string[],
): { inclusos: T[]; avulsos: T[] } {
  const doPlano = new Set(idsDoPlano);
  return {
    inclusos: opcionais.filter((p) => doPlano.has(p.id)),
    avulsos: opcionais.filter((p) => !doPlano.has(p.id)),
  };
}

/**
 * O que enviar como AVULSO na cotacao: o que o vendedor marcou menos o que o
 * plano ja carrega. `cotar_plano` uniria os dois de qualquer forma, mas o
 * snapshot da cotacao tem de dizer a verdade sobre o que foi vendido a parte.
 */
export function avulsosParaCotacao(selecionados: Iterable<string>, idsDoPlano: string[]): string[] {
  const doPlano = new Set(idsDoPlano);
  return [...selecionados].filter((id) => !doPlano.has(id));
}
