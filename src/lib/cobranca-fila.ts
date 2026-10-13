// ---------------------------------------------------------------------------
// Cobranca, Fase 2 (0098) — a FILA, os CONTATOS e as PROMESSAS.
//
// Espelho puro das regras que moram no banco (cobranca_fila_base,
// cobranca_acordos_situacao, registrar_contato_cobranca). Mexeu num lado,
// mexa no outro e nos dois testes.
// ---------------------------------------------------------------------------

/** Prazo de baixa do banco: a parcela so conta como quebrada depois disso. */
export const DIAS_PARA_BAIXA = 3;
/** Contato sem data de retorno volta para a fila em 2 dias. */
export const RETORNO_PADRAO_DIAS = 2;
export const MAX_PARCELAS_ACORDO = 36;

export const CANAIS = {
  LIGACAO: 'Ligação',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'E-mail',
  PRESENCIAL: 'Presencial',
  OUTRO: 'Outro',
} as const;
export type Canal = keyof typeof CANAIS;

export const RESULTADOS = {
  FALOU: 'Falou com o associado',
  NAO_ATENDEU: 'Não atendeu',
  RECADO: 'Deixou recado',
  NUMERO_ERRADO: 'Número errado',
  PROMETEU: 'Prometeu pagar',
  NEGOCIANDO: 'Em negociação',
  RECUSOU: 'Recusou pagar',
  JA_PAGOU: 'Diz que já pagou',
} as const;
export type Resultado = keyof typeof RESULTADOS;

export const SITUACOES_FILA = {
  promessa_quebrada: { rotulo: 'Promessa quebrada', prioridade: 1 },
  retorno_atrasado: { rotulo: 'Retorno atrasado', prioridade: 2 },
  retorno_hoje: { rotulo: 'Retorno hoje', prioridade: 3 },
  sem_contato: { rotulo: 'Sem contato', prioridade: 4 },
  aguardando: { rotulo: 'Aguardando retorno', prioridade: 5 },
  promessa_em_dia: { rotulo: 'Promessa em dia', prioridade: 6 },
} as const;
export type SituacaoFila = keyof typeof SITUACOES_FILA;
export const ORDEM_SITUACOES = (Object.keys(SITUACOES_FILA) as SituacaoFila[]).sort(
  (a, b) => SITUACOES_FILA[a].prioridade - SITUACOES_FILA[b].prioridade,
);

export const FAIXAS = {
  D01_05: '1 a 5 dias',
  D06_10: '6 a 10 dias',
  D11_15: '11 a 15 dias',
  D16_30: '16 a 30 dias',
  D31_60: '31 a 60 dias',
  D61_90: '61 a 90 dias',
  D90_MAIS: '+ de 90 dias',
} as const;
export type Faixa = keyof typeof FAIXAS;

export const STATUS_ACORDO = {
  EM_ANDAMENTO: 'Em andamento',
  CUMPRIDO: 'Cumprido',
  QUEBRADO: 'Quebrado',
  CANCELADO: 'Cancelado',
} as const;
export type StatusAcordo = keyof typeof STATUS_ACORDO;

export type SituacaoParcela = 'cumprida' | 'quebrada' | 'aguardando_baixa' | 'a_vencer';
export const ROTULO_PARCELA: Record<SituacaoParcela, string> = {
  cumprida: 'Cumprida',
  quebrada: 'Quebrada',
  aguardando_baixa: 'Aguardando baixa',
  a_vencer: 'A vencer',
};

/** Espelho de `cobranca_faixa_atraso` (0098). */
export function faixaDeAtraso(dias: number | null | undefined): Faixa | null {
  if (dias == null || dias <= 0) return null;
  if (dias <= 5) return 'D01_05';
  if (dias <= 10) return 'D06_10';
  if (dias <= 15) return 'D11_15';
  if (dias <= 30) return 'D16_30';
  if (dias <= 60) return 'D31_60';
  if (dias <= 90) return 'D61_90';
  return 'D90_MAIS';
}

/** Datas ISO (aaaa-mm-dd) em dias inteiros, sem fuso. */
function diaNum(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / 86_400_000);
}
export function somarDias(iso: string, dias: number): string {
  const d = new Date((diaNum(iso) + dias) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Situacao de uma parcela — espelho do CASE em `cobranca_acordos_situacao`.
 * `pagoAte` = o pago (desde a promessa) ate o vencimento da parcela;
 * `acumulado` = a soma das parcelas ate ela.
 */
export function situacaoParcela(p: {
  vencimento: string;
  acumulado: number;
  pagoAte: number;
  quitado: boolean;
  hoje: string;
}): SituacaoParcela {
  const h = diaNum(p.hoje);
  const v = diaNum(p.vencimento);
  if (p.pagoAte >= p.acumulado - 0.01) return 'cumprida';
  if (p.quitado && h <= v + DIAS_PARA_BAIXA) return 'cumprida';
  if (h > v + DIAS_PARA_BAIXA) return 'quebrada';
  if (h > v) return 'aguardando_baixa';
  return 'a_vencer';
}

export function statusAcordo(cancelado: boolean, parcelas: SituacaoParcela[]): StatusAcordo {
  if (cancelado) return 'CANCELADO';
  if (parcelas.length > 0 && parcelas.every((s) => s === 'cumprida')) return 'CUMPRIDO';
  if (parcelas.some((s) => s === 'quebrada')) return 'QUEBRADO';
  return 'EM_ANDAMENTO';
}

/** Espelho do CASE de `cobranca_fila_base` (0098). */
export function situacaoFila(l: {
  hoje: string;
  vencidoDesde: string;
  contatoEm: string | null;
  retornoEm: string | null;
  acordoStatus: StatusAcordo | null;
  quebraEm: string | null;
}): SituacaoFila {
  const contato = l.contatoEm ? diaNum(l.contatoEm) : null;
  if (l.acordoStatus === 'QUEBRADO' && (contato == null || (l.quebraEm != null && contato < diaNum(l.quebraEm)))) {
    return 'promessa_quebrada';
  }
  if (l.acordoStatus === 'EM_ANDAMENTO') return 'promessa_em_dia';
  if (contato == null || contato < diaNum(l.vencidoDesde)) return 'sem_contato';
  const retorno = l.retornoEm ? diaNum(l.retornoEm) : contato + RETORNO_PADRAO_DIAS;
  const h = diaNum(l.hoje);
  if (retorno < h) return 'retorno_atrasado';
  if (retorno === h) return 'retorno_hoje';
  return 'aguardando';
}

export type TipoAcordo = 'PROMESSA' | 'ACORDO';
export type ParcelaRascunho = { vencimento: string; valor: number | null };

/**
 * Espelho das regras de `registrar_contato_cobranca`. Devolve a lista de
 * problemas (vazia = pode gravar) — a tela mostra antes de enviar.
 */
export function validarAcordo(tipo: TipoAcordo, parcelas: ParcelaRascunho[], hoje: string): string[] {
  const erros: string[] = [];
  if (tipo === 'PROMESSA' && parcelas.length !== 1) erros.push('Promessa tem uma parcela só; para mais, use ACORDO.');
  if (tipo === 'ACORDO' && (parcelas.length < 2 || parcelas.length > MAX_PARCELAS_ACORDO)) {
    erros.push(`Acordo tem de 2 a ${MAX_PARCELAS_ACORDO} parcelas.`);
  }
  const h = diaNum(hoje);
  let ant: number | null = null;
  parcelas.forEach((p, i) => {
    const n = i + 1;
    if (!p.vencimento || !p.valor || p.valor <= 0) {
      erros.push(`Parcela ${n}: informe data e valor positivo.`);
      return;
    }
    const v = diaNum(p.vencimento);
    if (v < h || v > h + 365) erros.push(`Parcela ${n}: a data tem de ser de hoje até 1 ano.`);
    if (ant != null && v <= ant) erros.push(`Parcela ${n}: as datas têm de estar em ordem crescente.`);
    ant = v;
  });
  return erros;
}

/** Divide `total` em `n` parcelas mensais a partir de `primeira` (centavos na ultima). */
export function parcelasIguais(total: number, n: number, primeira: string): ParcelaRascunho[] {
  if (n < 1 || !(total > 0)) return [];
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / n);
  const [a, m, d] = primeira.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const valor = (i === n - 1 ? centavos - base * (n - 1) : base) / 100;
    const ultimoDia = new Date(Date.UTC(a, m - 1 + i + 1, 0)).getUTCDate();
    const dt = new Date(Date.UTC(a, m - 1 + i, Math.min(d, ultimoDia)));
    return { vencimento: dt.toISOString().slice(0, 10), valor };
  });
}

/** Taxa de cumprimento = cumpridas ÷ (cumpridas + quebradas). Em andamento fica fora. */
export function taxaCumprimento(cumpridas: number, quebradas: number): number | null {
  const d = cumpridas + quebradas;
  return d > 0 ? cumpridas / d : null;
}

/** Texto de abordagem da cobranca no WhatsApp. */
export function mensagemCobranca(d: {
  associado: string;
  boletos: number;
  valor: number;
  placas?: string | null;
  empresa?: string | null;
}): string {
  const nome = d.associado.split(' ')[0] ?? d.associado;
  const primeiro = nome.charAt(0) + nome.slice(1).toLowerCase();
  const valor = d.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const qtd = d.boletos === 1 ? '1 mensalidade em aberto' : `${d.boletos} mensalidades em aberto`;
  const veic = d.placas ? ` do veículo ${d.placas}` : '';
  return (
    `Olá, ${primeiro}! Aqui é da ${d.empresa ?? 'Smart Car Brasil'}. ` +
    `Identificamos ${qtd}${veic}, no total de ${valor}. ` +
    'Podemos ajudar a regularizar? Mantendo em dia, sua proteção e a assistência 24h continuam ativas.'
  );
}
