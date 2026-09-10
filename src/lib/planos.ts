/**
 * Troca de plano (upgrade / downgrade) — regra pura.
 *
 * O motor de cotacao vive no banco (`cotar_plano`, 0019): ele UNE os produtos
 * amarrados ao plano (`plano_produtos`) com os avulsos recebidos. Quem guarda o
 * que foi vendido a parte e `veiculo_produtos` — e ele tem de guardar SO o
 * avulso: item que ja vem no combo nao pode aparecer como escolha do atendente,
 * senao a ficha mente sobre o que foi contratado a parte (mesmo cuidado que a
 * tela de cotacao ja tinha, `avulsosParaCotacao` em src/lib/vistoria.ts).
 *
 * Aqui mora o que a tela de veiculos precisa para subir/descer de categoria sem
 * o atendente ter de decorar o que cada combo carrega.
 */

/** Direcao da troca, para a tela dizer o que aconteceu em uma palavra. */
export type SentidoTroca = 'ENTRADA' | 'SAIDA' | 'UPGRADE' | 'DOWNGRADE' | 'LATERAL';

export const ROTULO_SENTIDO: Record<SentidoTroca, string> = {
  ENTRADA: 'Plano contratado',
  SAIDA: 'Plano removido',
  UPGRADE: 'Upgrade de plano',
  DOWNGRADE: 'Downgrade de plano',
  LATERAL: 'Troca de plano',
};

/**
 * `planos_protecao.nivel` (0019) e a ordenacao comercial (Prata < Ouro <
 * Diamante). Sem plano de um dos lados a troca e entrada/saida, nao subida.
 */
export function sentidoDaTroca(
  nivelAnterior: number | null | undefined,
  nivelNovo: number | null | undefined,
): SentidoTroca {
  const antes = nivelAnterior ?? null;
  const depois = nivelNovo ?? null;
  if (antes === null && depois === null) return 'LATERAL';
  if (antes === null) return 'ENTRADA';
  if (depois === null) return 'SAIDA';
  if (depois > antes) return 'UPGRADE';
  if (depois < antes) return 'DOWNGRADE';
  return 'LATERAL';
}

export interface TrocaDePlano {
  /** O que continua sendo cobrado A PARTE depois da troca. */
  avulsos: string[];
  /** Avulso que o novo plano passou a incluir — para de ser cobrado a parte. */
  incorporados: string[];
  /** Vinha dentro do plano anterior e o novo NAO tem: a cobertura cai. */
  perdidos: string[];
  /** O novo plano traz e o anterior nao tinha. */
  ganhos: string[];
}

const semRepetir = (ids: Iterable<string>) => [...new Set(ids)];

/**
 * O diff da troca. `avulsos` de entrada e a selecao MANUAL do atendente (nunca
 * os itens do combo). Nada e adicionado sozinho: o que se perde no downgrade e
 * apenas ANUNCIADO — quem decide manter como avulso (e pagar por ele) e a
 * pessoa na tela, porque isso muda o preco.
 */
export function compararTrocaDePlano(input: {
  avulsos: Iterable<string>;
  idsPlanoAnterior: Iterable<string>;
  idsPlanoNovo: Iterable<string>;
}): TrocaDePlano {
  const escolhidos = semRepetir(input.avulsos);
  const antes = new Set(input.idsPlanoAnterior);
  const depois = new Set(input.idsPlanoNovo);

  return {
    avulsos: escolhidos.filter((id) => !depois.has(id)),
    incorporados: escolhidos.filter((id) => depois.has(id)),
    perdidos: semRepetir(antes).filter((id) => !depois.has(id)),
    ganhos: semRepetir(depois).filter((id) => !antes.has(id)),
  };
}

/**
 * O que gravar em `veiculo_produtos`: a selecao menos o que o plano ja carrega.
 * Serve tambem para LIMPAR ficha antiga, que nasceu com o item do combo dentro
 * da lista de avulsos. O preco nao muda (o `cotar_plano` unia os dois de
 * qualquer forma) — o que muda e a ficha passar a dizer a verdade.
 */
export function avulsosDoVeiculo(
  selecionados: Iterable<string>,
  idsDoPlano: Iterable<string>,
): string[] {
  const doPlano = new Set(idsDoPlano);
  return semRepetir(selecionados).filter((id) => !doPlano.has(id));
}

/**
 * `valor_mensalidade` no veiculo e OVERRIDE: `valor_mensalidade_veiculo` (0024)
 * prefere ele ao `cotar_plano`. Ou seja, subir de plano sem mexer nesse campo
 * nao muda um centavo do que e faturado — e o erro silencioso mais caro do
 * upgrade. A tela avisa quando os dois divergem.
 */
export function mensalidadeCongelada(
  override: number | null | undefined,
  cotado: number | null | undefined,
): boolean {
  if (override == null || cotado == null) return false;
  return Math.round(override * 100) !== Math.round(cotado * 100);
}

/**
 * Quando a tela pode atualizar sozinha o valor da mensalidade.
 *
 * Sim quando o campo esta vazio (ficha nova, nada a preservar) ou quando o que
 * esta gravado BATE com a ultima cotacao que a propria tela fez — ou seja, o
 * numero e nosso, nao um valor negociado. Diante de qualquer divergencia, ou
 * sem cotacao anterior para comparar (ficha aberta agora), a tela nao mexe:
 * so avisa. Valor negociado nao se sobrescreve em silencio.
 */
export function podeSincronizarMensalidade(
  override: number | null | undefined,
  ultimoCotado: number | null | undefined,
): boolean {
  if (override == null) return true;
  if (ultimoCotado == null) return false;
  return !mensalidadeCongelada(override, ultimoCotado);
}
