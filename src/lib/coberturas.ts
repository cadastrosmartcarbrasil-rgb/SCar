/**
 * O que o veiculo TEM, escrito para o atendente (0120).
 *
 * A ficha do veiculo (SAC e /veiculos/[id]) mostra as coberturas ABERTAS, em
 * grupos (casco, terceiros, vidros, assistencia...), com o texto de cada uma
 * (`produtos.descricao_cobertura`), o limite de uso e o que o plano NAO inclui
 * — para ninguem precisar abrir o cadastro dos planos no meio do atendimento.
 *
 * O "nao inclui" so cita grupo que EXISTE para contratar neste tipo de veiculo
 * (produto ativo que atende o tipo): dizer "sem vidros" para uma moto, quando a
 * casa nem vende vidros de moto, seria ruido.
 */

export type GrupoCobertura =
  | 'CASCO'
  | 'TERCEIROS'
  | 'VIDROS'
  | 'ASSISTENCIA'
  | 'CARRO_RESERVA'
  | 'VIDA'
  | 'RASTREAMENTO'
  | 'OUTROS';

export const ROTULO_GRUPO: Record<GrupoCobertura, string> = {
  CASCO: 'Proteção do veículo (casco)',
  TERCEIROS: 'Danos a terceiros',
  VIDROS: 'Vidros',
  ASSISTENCIA: 'Assistência 24h',
  CARRO_RESERVA: 'Carro reserva',
  VIDA: 'Seguro de vida / acidentes',
  RASTREAMENTO: 'Rastreamento',
  OUTROS: 'Outros benefícios',
};

/** Ordem em que a ficha mostra os grupos: o que mais pesa num evento primeiro. */
export const ORDEM_GRUPOS: GrupoCobertura[] = [
  'CASCO', 'TERCEIROS', 'VIDROS', 'ASSISTENCIA', 'CARRO_RESERVA', 'VIDA', 'RASTREAMENTO', 'OUTROS',
];

/** Grupos que entram no "nao inclui" (os demais nao sao lacuna de cobertura). */
const GRUPOS_LACUNA: GrupoCobertura[] = ['CASCO', 'TERCEIROS', 'VIDROS', 'ASSISTENCIA', 'CARRO_RESERVA', 'VIDA'];

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * O grupo de um produto. A categoria decide (CASCO, RCF, VIDROS, RASTREADOR);
 * BENEFICIO e largo demais, entao o nome separa assistencia, carro reserva e
 * seguro de vida. Taxa administrativa (ADMIN) nao e cobertura: devolve null.
 */
export function grupoDaCobertura(p: { categoria?: string | null; nome: string }): GrupoCobertura | null {
  const cat = (p.categoria ?? '').toUpperCase();
  if (cat === 'ADMIN') return null;
  if (cat === 'CASCO') return 'CASCO';
  if (cat === 'RCF') return 'TERCEIROS';
  if (cat === 'VIDROS') return 'VIDROS';
  if (cat === 'RASTREADOR') return 'RASTREAMENTO';
  const n = semAcento(p.nome);
  if (n.includes('vidro') || n.includes('parabrisa')) return 'VIDROS';
  if (n.includes('terceiro')) return 'TERCEIROS';
  if (n.includes('carro reserva')) return 'CARRO_RESERVA';
  if (n.includes('assist')) return 'ASSISTENCIA';
  if (n.includes('vida') || n.includes('acidente')) return 'VIDA';
  if (n.includes('rastre')) return 'RASTREAMENTO';
  return 'OUTROS';
}

/** "a cada 12 meses" para janelas em ano/mes inteiro; senao em dias. */
export function textoJanela(dias: number | null | undefined): string {
  const d = Number(dias ?? 0);
  if (!d) return '';
  if (d % 365 === 0) {
    const anos = d / 365;
    return anos === 1 ? 'a cada 12 meses' : `a cada ${anos * 12} meses`;
  }
  if (d % 30 === 0) {
    const meses = d / 30;
    return meses === 1 ? 'por mês' : `a cada ${meses} meses`;
  }
  return `a cada ${d} dias`;
}

/** "2 usos a cada 12 meses · 1 usado" — vazio quando o item nao tem limite. */
export function textoDoLimite(i: {
  tem_limite: boolean; quantidade_limite: number | null; janela_dias: number | null; usados: number;
}): string {
  if (!i.tem_limite || !i.quantidade_limite) return '';
  const q = i.quantidade_limite;
  const base = `${q} ${q === 1 ? 'uso' : 'usos'} ${textoJanela(i.janela_dias)}`.trim();
  const u = Number(i.usados ?? 0);
  return `${base} · ${u} ${u === 1 ? 'usado' : 'usados'}`;
}

export type ItemCobertura = {
  produto_id: string;
  nome: string;
  valor: number;
  origem: 'PLANO' | 'AVULSO';
  tem_limite: boolean;
  quantidade_limite: number | null;
  janela_dias: number | null;
  usados: number;
  elegivel: boolean;
  ultimo_uso: string | null;
  categoria?: string | null;
  descricao?: string | null;
};

export type SecaoCobertura<I extends ItemCobertura = ItemCobertura> = {
  grupo: GrupoCobertura;
  rotulo: string;
  itens: I[];
};

/** Itens agrupados na ordem da ficha; taxa (ADMIN) fica de fora. */
export function agruparCoberturas<I extends ItemCobertura>(itens: I[]): SecaoCobertura<I>[] {
  const por = new Map<GrupoCobertura, I[]>();
  for (const i of itens) {
    const g = grupoDaCobertura(i);
    if (!g) continue;
    (por.get(g) ?? por.set(g, []).get(g)!).push(i);
  }
  return ORDEM_GRUPOS.filter((g) => por.has(g)).map((g) => ({
    grupo: g,
    rotulo: ROTULO_GRUPO[g],
    itens: por.get(g)!.sort((a, b) =>
      a.origem === b.origem ? a.nome.localeCompare(b.nome) : a.origem === 'PLANO' ? -1 : 1),
  }));
}

/**
 * O que o veiculo NAO tem, entre o que a casa vende para o tipo dele.
 * `disponiveis` = produtos ATIVOS que atendem o tipo do veiculo (quem chama ja
 * filtrou com `produtoAtendeTipo`). Plano sem casco (0088) declara a falta do
 * casco mesmo sem produto para contratar a parte.
 */
export function gruposNaoIncluidos(args: {
  itens: { categoria?: string | null; nome: string }[];
  disponiveis: { categoria?: string | null; nome: string }[];
  semCasco?: boolean;
}): GrupoCobertura[] {
  const tem = new Set(args.itens.map(grupoDaCobertura).filter((g): g is GrupoCobertura => !!g));
  const vende = new Set(args.disponiveis.map(grupoDaCobertura).filter((g): g is GrupoCobertura => !!g));
  if (args.semCasco) vende.add('CASCO');
  return GRUPOS_LACUNA.filter((g) => !tem.has(g) && vende.has(g));
}
