// ============================================================================
// VISAO GERAL do /dashboard (0100) — a regua pura da tela.
// O banco devolve o painel inteiro em jsonb (`painel_visao_geral`); aqui mora o
// que a tela decide: fatias com "Outros", cor por ENTIDADE (nunca por posicao),
// rotulos de mes e as comparacoes contra o mes anterior.
// ============================================================================

export interface PainelFatia { nome: string; veiculos: number; associados?: number; carteira?: number }
export interface PainelUf { uf: string; veiculos: number }
export interface PainelMes {
  mes: string;            // 'YYYY-MM'
  adesoes: number;
  saidas: number;
  base_fim: number;
  eventos: number;
  /** 0101: eventos do historico do Mutual no mes (pela data do evento). */
  eventos_historico?: number;
  acionamentos: number;
  leads: number;
}

export interface PainelVisaoGeral {
  gerado_em: string;
  regional_id: string | null;
  kpis: {
    veiculos_base: number;
    associados_base: number;
    carteira_mensal: number;
    ticket_medio: number;
    sem_valor: number;
    cobranca_externa: number;
    carteira_externa: number;
    adesoes_mes: number;
    adesoes_mes_anterior: number;
    saidas_mes: number;
    saidas_mes_anterior: number;
    base_mes_anterior: number;
    inadimplentes: number;
    vistoria_pendente: number;
    em_evento: number;
    suspensos: number;
    regionais: number;
  };
  por_regional: PainelFatia[];
  por_uf: PainelUf[];
  por_tipo: PainelFatia[];
  por_plano: PainelFatia[];
  por_status: { status: string; veiculos: number }[];
  serie: PainelMes[];
  eventos: {
    abertos: number; novos_mes: number; concluidos: number; negados: number; total: number;
    por_status: { status: string; n: number }[];
    por_tipo: { tipo: string; n: number }[];
    /** 0101 */
    por_tipo_12m?: { tipo: string; n: number }[];
    ultimos_12m?: number;
    historico?: {
      total: number; ultimos_12m: number; mes: number;
      por_tipo_12m: { tipo: string; n: number }[];
    };
  };
  assistencia: { mes: number; em_aberto: number; custo_mes: number };
  vendas: {
    em_aberto: number; novos_mes: number; convertidos_mes: number;
    funil: { status: string; n: number }[];
  };
  pagar: { em_aberto: number; proximos_7: number; vencido: number };
  rastreadores: { instalados: number; estoque: number; inadimplentes: number };
}

// ---------------------------------------------------------------------------
// Paleta categorica — validada (CVD, contraste) sobre a superficie dos DOIS
// temas: claro #FFFFFF e escuro #171E30. Ordem fixa; o 9o vira "Outros".
// No claro, 3 fatias ficam abaixo de 3:1 contra o fundo: por isso toda fatia
// tem rotulo e valor visiveis na legenda — identidade nunca so pela cor.
// ---------------------------------------------------------------------------
export const PALETA_CATEGORICA = {
  claro:  ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  escuro: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
} as const;
export const COR_OUTROS = '#94A3B8';
export const ROTULO_OUTROS = 'Outros';

/**
 * A cor segue a ENTIDADE, nunca a posicao no ranking: a unidade que cresce e
 * passa a outra nao pode trocar de cor. A ordem estavel e a alfabetica do
 * conjunto inteiro (nao do recorte), entao filtrar nao repinta quem sobra.
 */
export function coresPorEntidade(nomes: string[], escuro = false): Record<string, string> {
  const paleta = escuro ? PALETA_CATEGORICA.escuro : PALETA_CATEGORICA.claro;
  const unicos = [...new Set(nomes.filter((n) => n !== ROTULO_OUTROS))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const mapa: Record<string, string> = { [ROTULO_OUTROS]: COR_OUTROS };
  unicos.forEach((n, i) => { mapa[n] = i < paleta.length ? paleta[i] : COR_OUTROS; });
  return mapa;
}

export interface Fatia { nome: string; valor: number; pct: number }

/**
 * Ordena por valor e dobra a cauda em "Outros" a partir de `maximo` fatias.
 * Sem total, devolve vazio — pizza de zero e grafico que mente.
 */
export function fatiasComOutros<T>(
  itens: T[],
  nome: (t: T) => string,
  valor: (t: T) => number,
  maximo = 6,
): Fatia[] {
  const lista = itens
    .map((t) => ({ nome: nome(t), valor: Number(valor(t)) || 0 }))
    .filter((f) => f.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  const total = lista.reduce((s, f) => s + f.valor, 0);
  if (total === 0) return [];
  const cabe = lista.length > maximo ? lista.slice(0, maximo - 1) : lista;
  const resto = lista.length > maximo ? lista.slice(maximo - 1) : [];
  const fatias = cabe.map((f) => ({ ...f, pct: f.valor / total }));
  if (resto.length) {
    const v = resto.reduce((s, f) => s + f.valor, 0);
    fatias.push({ nome: ROTULO_OUTROS, valor: v, pct: v / total });
  }
  return fatias;
}

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** '2026-10' -> 'out/26'. */
export function rotuloMesCurto(mes: string): string {
  const [ano, m] = mes.split('-');
  const nome = MES_CURTO[Number(m) - 1];
  return nome && ano ? `${nome}/${ano.slice(2)}` : mes;
}

/** Variacao relativa; base zero nao tem comparacao (null), e zero com zero e 0. */
export function variacaoRelativa(atual: number, anterior: number): number | null {
  if (!anterior) return atual > 0 ? null : 0;
  return (atual - anterior) / anterior;
}

/** Crescimento liquido do mes: quem entrou menos quem saiu. */
export function crescimentoLiquido(m: Pick<PainelMes, 'adesoes' | 'saidas'>): number {
  return Number(m.adesoes) - Number(m.saidas);
}

/** Churn do mes sobre a base do inicio dele. */
export function taxaChurn(saidas: number, baseInicio: number): number | null {
  if (!baseInicio) return null;
  return saidas / baseInicio;
}

/**
 * O mes corrente esta pela METADE: comparar 13 dias de outubro com setembro
 * inteiro sempre "cai". A projecao linear diz onde o mes deve fechar no ritmo
 * atual — e e ela que a tela compara, rotulada como projecao.
 */
export function projecaoDoMes(valorAteHoje: number, hoje: Date = new Date()): number {
  const dia = hoje.getDate();
  const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  if (dia <= 0) return valorAteHoje;
  return Math.round((valorAteHoje / dia) * diasNoMes);
}

// ---------------------------------------------------------------------------
// Vocabulario
// ---------------------------------------------------------------------------
export const ROTULO_STATUS_VEICULO: Record<string, string> = {
  ativo: 'Ativos',
  vistoria_pendente: 'Vistoria pendente',
  em_evento: 'Em evento',
  inadimplente: 'Inadimplentes',
  suspenso: 'Suspensos',
};

export const ORDEM_STATUS_EVENTO = ['ABERTO', 'EM_ANALISE', 'COTACAO_PECAS', 'REPARO', 'CONCLUIDO', 'NEGADO'] as const;
export const ROTULO_STATUS_EVENTO: Record<string, string> = {
  ABERTO: 'Aberto',
  EM_ANALISE: 'Em análise',
  COTACAO_PECAS: 'Cotação de peças',
  REPARO: 'Em reparo',
  CONCLUIDO: 'Concluído',
  NEGADO: 'Negado',
};

/** A esteira do CRM na ordem do trabalho (0028), sem os desfechos. */
export const ETAPAS_FUNIL = [
  { status: 'NOVO', rotulo: 'Novo lead' },
  { status: 'PROPOSTA_ENVIADA', rotulo: 'Proposta enviada' },
  { status: 'EM_NEGOCIACAO', rotulo: 'Em negociação' },
  { status: 'AGUARDANDO_VISTORIA', rotulo: 'Aguardando vistoria' },
  { status: 'APROVADO', rotulo: 'Aprovado' },
  { status: 'EM_AUDITORIA', rotulo: 'Em auditoria' },
] as const;

/** Funil sempre completo e na ordem da esteira — etapa vazia aparece com zero. */
export function funilOrdenado(funil: { status: string; n: number }[]): { status: string; rotulo: string; n: number }[] {
  const mapa = new Map(funil.map((f) => [f.status, Number(f.n) || 0]));
  return ETAPAS_FUNIL.map((e) => ({ ...e, n: mapa.get(e.status) ?? 0 }));
}

/** Eventos por etapa, na ordem do processo, so com as que tem algo. */
export function eventosPorEtapa(lista: { status: string; n: number }[]): { status: string; rotulo: string; n: number }[] {
  const mapa = new Map(lista.map((f) => [f.status, Number(f.n) || 0]));
  return ORDEM_STATUS_EVENTO
    .map((s) => ({ status: s as string, rotulo: ROTULO_STATUS_EVENTO[s], n: mapa.get(s) ?? 0 }))
    .filter((e) => e.n > 0);
}

// ---------------------------------------------------------------------------
// Mensalidades — a serie vem de `cobranca_serie_mensal` (SCar + historico do
// Mutual, modulo de cobranca). Aqui so o que a Visao Geral resume dela.
// ---------------------------------------------------------------------------
export interface MesCobranca {
  mes: string;
  valor_emitido: number | string;
  valor_venceram: number | string;
  valor_aberto_vencido: number | string;
  valor_pago_no_prazo: number | string;
  valor_pago_em_atraso: number | string;
}

/**
 * Inadimplencia em VALOR: o que venceu e segue em aberto sobre o que venceu.
 * O mes que ainda nao venceu nada nao entra (seria 0/0); boleto a vencer nao
 * e inadimplencia.
 */
export function inadimplenciaDoMes(m: MesCobranca): number | null {
  const venceu = Number(m.valor_venceram) || 0;
  if (venceu <= 0) return null;
  return (Number(m.valor_aberto_vencido) || 0) / venceu;
}

export function recebidoDoMes(m: MesCobranca): number {
  return (Number(m.valor_pago_no_prazo) || 0) + (Number(m.valor_pago_em_atraso) || 0);
}

/** Inadimplencia do periodo inteiro, ponderada pelo valor (nunca media de %). */
export function inadimplenciaDoPeriodo(serie: MesCobranca[]): number | null {
  const venceu = serie.reduce((s, m) => s + (Number(m.valor_venceram) || 0), 0);
  if (venceu <= 0) return null;
  return serie.reduce((s, m) => s + (Number(m.valor_aberto_vencido) || 0), 0) / venceu;
}

/**
 * Soma duas contagens por tipo (SCar + historico do Mutual). O nome casa sem
 * caixa e sem acento — "COLISÃO" do Mutual e "Colisao" do SCar sao o mesmo
 * tipo; vence a grafia de quem tem mais.
 */
export function somarPorTipo(
  ...listas: ({ tipo: string; n: number | string }[] | null | undefined)[]
): { tipo: string; n: number }[] {
  const chave = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  const mapa = new Map<string, { tipo: string; n: number; maior: number }>();
  for (const lista of listas) {
    for (const x of lista ?? []) {
      const k = chave(x.tipo);
      const n = Number(x.n) || 0;
      const atual = mapa.get(k);
      if (!atual) mapa.set(k, { tipo: x.tipo, n, maior: n });
      else {
        atual.n += n;
        if (n > atual.maior) { atual.tipo = x.tipo; atual.maior = n; }
      }
    }
  }
  return [...mapa.values()].map(({ tipo, n }) => ({ tipo, n })).sort((a, b) => b.n - a.n);
}
