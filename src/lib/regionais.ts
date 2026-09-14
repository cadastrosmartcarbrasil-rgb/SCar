/**
 * Regra do PAINEL EXECUTIVO DAS REGIONAIS (0078).
 *
 * Espelho puro do que o banco devolve: aqui mora o que a TELA decide — o
 * periodo padrao, a variacao contra o periodo anterior, a leitura de risco de
 * uma unidade e o rotulo de cada ponto do grafico. O que o banco calcula
 * (contagem, soma, sinistralidade) NAO e recalculado aqui.
 */

import type { RegionaisPainelLinha, RegionaisPainelPonto } from '@/lib/database.types';

// ---------------------------------------------------------------------------
// Periodo
// ---------------------------------------------------------------------------
export interface PeriodoPainel {
  inicio: string;
  fim: string;
}

export type PresetPainel = 'sete_dias' | 'trinta_dias' | 'mes' | 'ano';

export const PRESETS_PAINEL: { chave: PresetPainel; rotulo: string }[] = [
  { chave: 'sete_dias', rotulo: 'Ultimos 7 dias' },
  { chave: 'trinta_dias', rotulo: 'Ultimos 30 dias' },
  { chave: 'mes', rotulo: 'Mes atual' },
  { chave: 'ano', rotulo: 'Ano atual' },
];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * O padrao do painel e "ultimos 30 dias" — inclui hoje, entao sao 29 dias
 * para tras. Contar 30 para tras daria 31 dias no periodo, e a comparacao com
 * o periodo anterior (que o banco monta do mesmo tamanho) ficaria torta.
 */
export function periodoPainel(chave: PresetPainel, hoje = new Date()): PeriodoPainel {
  const a = hoje.getFullYear();
  const m = hoje.getMonth();
  const d = hoje.getDate();
  switch (chave) {
    case 'sete_dias':
      return { inicio: iso(new Date(a, m, d - 6)), fim: iso(hoje) };
    case 'mes':
      return { inicio: iso(new Date(a, m, 1)), fim: iso(hoje) };
    case 'ano':
      return { inicio: iso(new Date(a, 0, 1)), fim: iso(hoje) };
    case 'trinta_dias':
    default:
      return { inicio: iso(new Date(a, m, d - 29)), fim: iso(hoje) };
  }
}

export const PERIODO_PADRAO_PAINEL = 'trinta_dias' satisfies PresetPainel;

/** Qual preset (se algum) corresponde ao periodo em tela. */
export function presetAtivo(p: PeriodoPainel, hoje = new Date()): PresetPainel | null {
  for (const { chave } of PRESETS_PAINEL) {
    const alvo = periodoPainel(chave, hoje);
    if (alvo.inicio === p.inicio && alvo.fim === p.fim) return chave;
  }
  return null;
}

/** Periodo invertido e erro de digitacao, nao filtro: a tela avisa. */
export function periodoValido(p: PeriodoPainel): boolean {
  return !!p.inicio && !!p.fim && p.inicio <= p.fim;
}

// ---------------------------------------------------------------------------
// Variacao contra o periodo anterior
// ---------------------------------------------------------------------------
/**
 * Fracao de variacao (0,12 = +12%). Devolve `null` quando nao ha base de
 * comparacao — sem periodo anterior, "+100%" e uma invencao; a tela mostra
 * "sem base de comparacao".
 */
export function variacao(atual: number, anterior: number): number | null {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior)) return null;
  if (anterior === 0) return atual === 0 ? 0 : null;
  return (atual - anterior) / Math.abs(anterior);
}

/**
 * Como LER a variacao. Crescer carteira e bom; crescer churn, inadimplencia ou
 * gasto com evento e ruim. Sem isso a seta verde apareceria no indicador
 * errado — que e pior do que nao ter seta.
 */
export type Direcao = 'boa' | 'ruim' | 'neutra';

export function direcaoVariacao(fracao: number | null, subirEBom: boolean): Direcao {
  if (fracao === null || fracao === 0) return 'neutra';
  return fracao > 0 === subirEBom ? 'boa' : 'ruim';
}

// ---------------------------------------------------------------------------
// Serie temporal
// ---------------------------------------------------------------------------
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Rotulo do eixo conforme a granularidade que o banco escolheu. */
export function rotuloPonto(p: Pick<RegionaisPainelPonto, 'balde' | 'fim_balde' | 'granularidade'>): string {
  const [ano, mes, dia] = p.balde.split('-');
  const m = MES_CURTO[Number(mes) - 1] ?? mes;
  if (p.granularidade === 'MES') return `${m}/${ano.slice(2)}`;
  if (p.granularidade === 'SEMANA') {
    const [, fm, fd] = p.fim_balde.split('-');
    return `${dia}/${mes}–${fd}/${fm}`;
  }
  return `${dia}/${mes}`;
}

export interface PontoGrafico extends RegionaisPainelPonto {
  rotulo: string;
  resultado: number;
}

/** Prepara a serie para o Recharts (rotulo pronto + resultado do balde). */
export function serieParaGrafico(pontos: RegionaisPainelPonto[]): PontoGrafico[] {
  return pontos.map((p) => ({
    ...p,
    rotulo: rotuloPonto(p),
    resultado: Number((p.recebido - p.gasto_eventos).toFixed(2)),
  }));
}

// ---------------------------------------------------------------------------
// Comparativo por regional
// ---------------------------------------------------------------------------
export type OrdemComparativo =
  | 'ativos' | 'inadimplencia' | 'sinistros' | 'recebido' | 'sinistralidade' | 'resultado' | 'nome';

/**
 * A tabela ordena por qualquer coluna, sempre do "pior/maior" para o menor —
 * quem olha um ranking quer o extremo no topo. Nome e a excecao (alfabetico).
 */
export function ordenarComparativo(
  linhas: RegionaisPainelLinha[],
  ordem: OrdemComparativo,
): RegionaisPainelLinha[] {
  const copia = [...linhas];
  if (ordem === 'nome') return copia.sort((a, b) => a.regional.localeCompare(b.regional, 'pt-BR'));
  const chave: Record<Exclude<OrdemComparativo, 'nome'>, (l: RegionaisPainelLinha) => number> = {
    ativos: (l) => l.veiculos_ativos,
    inadimplencia: (l) => l.inadimplencia,
    sinistros: (l) => l.sinistros,
    recebido: (l) => l.recebido,
    sinistralidade: (l) => l.sinistralidade,
    resultado: (l) => -l.resultado,   // pior resultado primeiro
  };
  const f = chave[ordem];
  return copia.sort((a, b) => f(b) - f(a) || a.regional.localeCompare(b.regional, 'pt-BR'));
}

export type RiscoRegional = 'critico' | 'atencao' | 'saudavel' | 'sem_dados';

/**
 * Leitura de risco da unidade. Duas reguas, e a pior manda:
 *  . SINISTRALIDADE — acima de 1 a unidade gasta com evento mais do que
 *    arrecada; de 0,7 para cima ja nao sobra para custo fixo nem comissao.
 *  . INADIMPLENCIA — 15% da carteira em atraso e o limiar que a operacao usa
 *    para acionar cobranca; acima de 25% a carteira esta furada.
 * Unidade sem carteira nao e "saudavel": e `sem_dados`, e dizer isso e o
 * honesto — verde numa unidade vazia manda a gestao olhar para o lado errado.
 */
export function riscoRegional(l: Pick<RegionaisPainelLinha,
  'veiculos_ativos' | 'sinistralidade' | 'inadimplencia' | 'recebido'>): RiscoRegional {
  if (l.veiculos_ativos === 0) return 'sem_dados';
  if (l.sinistralidade > 1 || l.inadimplencia > 0.25) return 'critico';
  if (l.sinistralidade >= 0.7 || l.inadimplencia >= 0.15) return 'atencao';
  return 'saudavel';
}

export const ROTULO_RISCO: Record<RiscoRegional, string> = {
  critico: 'Critico',
  atencao: 'Atencao',
  saudavel: 'Saudavel',
  sem_dados: 'Sem carteira',
};

/** Totais do rodape da tabela — soma o que esta em tela, nao a base inteira. */
export function totaisComparativo(linhas: RegionaisPainelLinha[]) {
  const soma = (f: (l: RegionaisPainelLinha) => number) =>
    linhas.reduce((a, l) => a + f(l), 0);
  const ativos = soma((l) => l.veiculos_ativos);
  const recebido = Number(soma((l) => l.recebido).toFixed(2));
  const gasto = Number(soma((l) => l.gasto_eventos).toFixed(2));
  const inadimplentes = soma((l) => l.veiculos_inadimplentes);
  return {
    unidades: linhas.length,
    ativos,
    novos: soma((l) => l.veiculos_novos),
    cancelados: soma((l) => l.veiculos_cancelados),
    inadimplentes,
    // Percentual do TOTAL, nao media dos percentuais: media de percentual dá
    // o mesmo peso a uma unidade de 12 veiculos e a uma de 3.000.
    inadimplencia: ativos > 0 ? inadimplentes / ativos : 0,
    sinistros: soma((l) => l.sinistros),
    recebido,
    gasto_eventos: gasto,
    resultado: Number((recebido - gasto).toFixed(2)),
    sinistralidade: recebido > 0 ? gasto / recebido : 0,
  };
}

// ---------------------------------------------------------------------------
// Intervalo de contas (a engrenagem)
// ---------------------------------------------------------------------------
/** Codigo comparavel: cada segmento vira numero. Espelha `codigo_conta_ordenavel`. */
export function contaOrdenavel(codigo: string): string {
  return (codigo || '')
    .split('.')
    .map((s) => s.replace(/\D/g, '').padStart(4, '0'))
    .join('.');
}

export function contaValida(codigo: string): boolean {
  return /^[0-9]+(\.[0-9]+)*$/.test(codigo.trim());
}

/** Mensagem de recusa do intervalo (null = pode salvar). Espelha a RPC. */
export function validarIntervaloContas(de: string, ate: string): string | null {
  const d = de.trim();
  const a = ate.trim();
  if (d && !contaValida(d)) return `Conta inicial invalida: use apenas numeros e pontos (ex.: 1.0.00).`;
  if (a && !contaValida(a)) return `Conta final invalida: use apenas numeros e pontos (ex.: 3.9.99).`;
  if (d && a && contaOrdenavel(d) > contaOrdenavel(a)) {
    return `A conta inicial (${d}) e maior que a final (${a}).`;
  }
  return null;
}

/** Como o recorte aparece no botao da engrenagem. */
export function rotuloIntervalo(de: string | null, ate: string | null): string {
  if (!de && !ate) return 'Todas as contas';
  if (de && ate) return `${de} a ${ate}`;
  return de ? `de ${de}` : `ate ${ate}`;
}
