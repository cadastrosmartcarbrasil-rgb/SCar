// ---------------------------------------------------------------------------
// Painel de Inadimplencia e Cobrancas (0097) — as FORMULAS moram aqui.
//
// O banco (`cobranca_indicadores`, `cobranca_calendario`...) devolve contagens
// e somas; os percentuais saem destas funcoes, com teste. A formula de cada
// indicador e a do documento "Modulo de Inadimplencia e Cobrancas" (30/09/2026):
//
//   Inadimplencia por clientes = clientes inadimplentes ÷ clientes com cobranca vencida
//   Inadimplencia financeira   = valor vencido nao pago ÷ valor total vencido
//   Taxa de recuperacao        = valor pago em atraso ÷ (pago em atraso + ainda em aberto)
//   Inadimplencia inicial      = 1º boleto vencido nao pago ÷ 1ºs boletos vencidos
//
// REGRA ESSENCIAL: boleto que ainda nao venceu NAO entra em nenhuma delas — o
// denominador e sempre o que JA venceu, nunca o que foi emitido.
// ---------------------------------------------------------------------------

/** Os seis ciclos de vencimento da Smartcar. */
export const CICLOS = [5, 10, 15, 20, 25, 30] as const;
export type Ciclo = (typeof CICLOS)[number];

/** Espelho de `ciclo_vencimento()` (0097). Dia 1-2 volta para o 30 (virada). */
export function cicloDoDia(dia: number): Ciclo {
  if (dia <= 2) return 30;
  if (dia <= 7) return 5;
  if (dia <= 12) return 10;
  if (dia <= 17) return 15;
  if (dia <= 22) return 20;
  if (dia <= 27) return 25;
  return 30;
}

export type SituacaoBoleto =
  | 'a_vencer' | 'vence_hoje' | 'vencido' | 'pago_no_prazo' | 'pago_em_atraso' | 'cancelado';

export const ROTULO_SITUACAO: Record<SituacaoBoleto, string> = {
  a_vencer: 'A vencer',
  vence_hoje: 'Vence hoje',
  vencido: 'Vencido',
  pago_no_prazo: 'Pago no prazo',
  pago_em_atraso: 'Pago em atraso',
  cancelado: 'Cancelado',
};

/** Fracao (0..1) ou null quando nao ha base — "sem dado" nunca vira 0%. */
export function fracao(parte: number, todo: number): number | null {
  if (!Number.isFinite(parte) || !Number.isFinite(todo) || todo <= 0) return null;
  return parte / todo;
}

/** O que `cobranca_indicadores` devolve por recorte (subconjunto usado aqui). */
export interface NumerosCobranca {
  boletos: number;
  valor_emitido: number;
  valor_venceram: number;
  valor_aberto_vencido: number;
  valor_pago_no_prazo: number;
  valor_pago_em_atraso: number;
  valor_a_vencer: number;
  valor_vence_hoje: number;
  clientes_venceram: number;
  clientes_inadimplentes: number;
  primeiros_venceram: number;
  primeiros_nao_pagos: number;
  primeiros_pagos_atraso: number;
  reincidentes: number;
  regularizados: number;
}

export interface Taxas {
  inadFinanceira: number | null;
  inadClientes: number | null;
  recuperacao: number | null;
  pontualidade: number | null;
  inadInicial: number | null;
}

export type ChaveTaxa = keyof Taxas;

export const ROTULO_TAXA: Record<ChaveTaxa, string> = {
  inadFinanceira: 'Inadimplência financeira',
  inadClientes: 'Inadimplência por clientes',
  recuperacao: 'Taxa de recuperação',
  pontualidade: 'Pagamento no prazo',
  inadInicial: 'Inadimplência no 1º boleto',
};

/** Subir e bom? (define a cor da seta). */
export const SUBIR_E_BOM: Record<ChaveTaxa, boolean> = {
  inadFinanceira: false,
  inadClientes: false,
  recuperacao: true,
  pontualidade: true,
  inadInicial: false,
};

const n = (v: unknown) => Number(v ?? 0) || 0;

export function taxas(x: Partial<NumerosCobranca> | null | undefined): Taxas {
  if (!x) {
    return { inadFinanceira: null, inadClientes: null, recuperacao: null, pontualidade: null, inadInicial: null };
  }
  const atraso = n(x.valor_pago_em_atraso);
  const aberto = n(x.valor_aberto_vencido);
  return {
    inadFinanceira: fracao(aberto, n(x.valor_venceram)),
    inadClientes: fracao(n(x.clientes_inadimplentes), n(x.clientes_venceram)),
    recuperacao: fracao(atraso, atraso + aberto),
    pontualidade: fracao(n(x.valor_pago_no_prazo), n(x.valor_venceram)),
    inadInicial: fracao(n(x.primeiros_nao_pagos), n(x.primeiros_venceram)),
  };
}

/**
 * Media SIMPLES dos recortes que tem dado — "media dos ultimos tres meses" e a
 * media dos tres percentuais mensais. Recorte sem base nao entra como zero.
 */
export function mediaTaxas(lista: Taxas[]): Taxas {
  const media = (k: ChaveTaxa) => {
    const vals = lista.map((t) => t[k]).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  return {
    inadFinanceira: media('inadFinanceira'),
    inadClientes: media('inadClientes'),
    recuperacao: media('recuperacao'),
    pontualidade: media('pontualidade'),
    inadInicial: media('inadInicial'),
  };
}

/**
 * PONTOS PERCENTUAIS x VARIACAO RELATIVA — os dois, sempre.
 * Agosto 6% e setembro 8%: +2 p.p. e +33,33%.
 * `pp` vem em pontos (2 = 2 p.p.); `relativa` em fracao (0.3333).
 */
export function compararTaxa(atual: number | null, referencia: number | null) {
  if (atual === null || referencia === null) return { pp: null, relativa: null };
  const pp = Math.round((atual - referencia) * 100 * 100) / 100;
  const relativa = referencia === 0 ? (atual === 0 ? 0 : null) : (atual - referencia) / referencia;
  return { pp, relativa };
}

/** "+2,0 p.p." / "-0,5 p.p." / "estavel". */
export function textoPp(pp: number | null): string {
  if (pp === null) return 'sem base';
  if (pp === 0) return 'estavel';
  const s = Math.abs(pp).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${pp > 0 ? '+' : '-'}${s} p.p.`;
}

export type Semaforo = 'verde' | 'ambar' | 'vermelho' | 'sem_dados';

/** Meta e limite em PERCENTUAL (5 = 5%); a taxa em fracao. */
export function semaforo(taxa: number | null, meta: number, limite: number): Semaforo {
  if (taxa === null) return 'sem_dados';
  const pct = taxa * 100;
  if (pct <= meta) return 'verde';
  if (pct <= limite) return 'ambar';
  return 'vermelho';
}

export const ROTULO_SEMAFORO: Record<Semaforo, string> = {
  verde: 'Dentro da meta',
  ambar: 'Atenção',
  vermelho: 'Acima do limite',
  sem_dados: 'Sem vencidos',
};

/** Linha do calendario por ciclo -> taxas do ciclo. */
export interface LinhaCiclo {
  ciclo: number;
  valor_emitido: number;
  valor_venceram: number;
  valor_aberto_vencido: number;
  valor_pago_no_prazo: number;
  valor_pago_em_atraso: number;
  valor_a_vencer: number;
  valor_vence_hoje: number;
}

export function taxasDoCiclo(l: LinhaCiclo) {
  const recebido = n(l.valor_pago_no_prazo) + n(l.valor_pago_em_atraso);
  return {
    inadimplencia: fracao(n(l.valor_aberto_vencido), n(l.valor_venceram)),
    recebimento: fracao(recebido, n(l.valor_emitido)),
    recuperacao: fracao(n(l.valor_pago_em_atraso), n(l.valor_pago_em_atraso) + n(l.valor_aberto_vencido)),
  };
}

// ---------------------------------------------------------------------------
// Leitura automatica em linguagem simples (item 11 do documento). Toda frase
// sai de numero do painel — nada de conclusao sem dado rastreavel.
// ---------------------------------------------------------------------------
const pctTxt = (f: number) =>
  (f * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export type Tom = 'positivo' | 'atencao' | 'negativo' | 'neutro';
export interface Frase { tom: Tom; texto: string }

export function leituraAutomatica(
  atual: Partial<NumerosCobranca> | null,
  anterior: Partial<NumerosCobranca> | null,
  rotuloAnterior = 'o periodo anterior',
): Frase[] {
  if (!atual) return [];
  const frases: Frase[] = [];
  const ta = taxas(atual);
  const tp = taxas(anterior);

  if (ta.inadFinanceira !== null) {
    const c = compararTaxa(ta.inadFinanceira, tp.inadFinanceira);
    if (c.pp === null || c.pp === 0) {
      frases.push({ tom: 'neutro', texto: `Inadimplência financeira de ${pctTxt(ta.inadFinanceira)}: ${brl(n(atual.valor_aberto_vencido))} vencidos sem pagamento.` });
    } else {
      const rel = c.relativa === null ? '' : ` (${c.relativa > 0 ? '+' : ''}${pctTxt(c.relativa)} relativo)`;
      frases.push({
        tom: c.pp > 0 ? 'negativo' : 'positivo',
        texto: `A inadimplência financeira ${c.pp > 0 ? 'subiu' : 'caiu'} ${textoPp(Math.abs(c.pp)).replace('+', '')}${rel} contra ${rotuloAnterior}: ${pctTxt(ta.inadFinanceira)} hoje, ${brl(n(atual.valor_aberto_vencido))} em aberto.`,
      });
    }
  }

  if (ta.recuperacao !== null && n(atual.valor_pago_em_atraso) > 0) {
    const c = compararTaxa(ta.recuperacao, tp.recuperacao);
    const cmp = c.pp === null || c.pp === 0 ? '' : `, ${textoPp(c.pp)} sobre ${rotuloAnterior}`;
    frases.push({
      tom: c.pp !== null && c.pp < 0 ? 'atencao' : 'positivo',
      texto: `Foram recuperados ${brl(n(atual.valor_pago_em_atraso))}: ${pctTxt(ta.recuperacao)} do valor que atrasou${cmp}.`,
    });
  }

  if (ta.inadInicial !== null && n(atual.primeiros_venceram) > 0) {
    const tom: Tom = ta.inadInicial > (tp.inadInicial ?? ta.inadInicial) ? 'negativo' : 'neutro';
    frases.push({
      tom,
      texto: `${n(atual.primeiros_venceram)} associados tiveram o 1º boleto vencido no período e ${n(atual.primeiros_nao_pagos)} não pagaram: inadimplência inicial de ${pctTxt(ta.inadInicial)}.`,
    });
  }

  if (n(atual.reincidentes) > 0) {
    frases.push({
      tom: 'atencao',
      texto: `${n(atual.reincidentes)} dos ${n(atual.clientes_inadimplentes)} inadimplentes já tinham atrasado nos 12 meses anteriores (reincidentes).`,
    });
  }

  // Classificacao do documento (item 10), na versao que os dados de cobranca sustentam.
  const emit = compararTaxa(n(atual.valor_emitido), n(anterior?.valor_emitido)).relativa;
  const inadRel = compararTaxa(ta.inadFinanceira, tp.inadFinanceira).relativa;
  if (emit !== null && inadRel !== null && anterior) {
    if (emit > 0 && inadRel < 0) {
      frases.push({ tom: 'positivo', texto: 'A carteira faturada cresceu e a inadimplência caiu.' });
    } else if (emit > 0 && inadRel > emit) {
      frases.push({ tom: 'negativo', texto: 'A carteira faturada cresceu, mas a inadimplência cresceu mais: o crescimento não está sendo acompanhado pela mesma qualidade de recebimento.' });
    }
  }
  return frases;
}

/** Idade do dado: o historico do Mutual so e tao novo quanto a ultima captura. */
export function diasDesde(iso: string | null | undefined, hoje = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((hoje.getTime() - t) / 86_400_000);
}

/** Acima disto a tela avisa que os dados estao defasados (item 14). */
export const DIAS_DADO_DEFASADO = 7;

// ---------------------------------------------------------------------------
// Periodo do painel. Os presets sao MESES CHEIOS de proposito: assim o banco
// compara com os meses de calendario anteriores (`cobranca_recortes`). "Mes
// atual" vai ate o ultimo dia — o que ainda nao venceu aparece como "a vencer"
// e nao entra em taxa nenhuma.
// ---------------------------------------------------------------------------
export interface PeriodoCobranca { inicio: string; fim: string }
export type PresetCobranca = 'mes_atual' | 'mes_anterior' | 'tres_meses' | 'ano';

export const PRESETS_COBRANCA: { chave: PresetCobranca; rotulo: string }[] = [
  { chave: 'mes_atual', rotulo: 'Mês atual' },
  { chave: 'mes_anterior', rotulo: 'Mês anterior' },
  { chave: 'tres_meses', rotulo: 'Últimos 3 meses' },
  { chave: 'ano', rotulo: 'Ano atual' },
];

export const isoData = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function periodoCobranca(chave: PresetCobranca, hoje = new Date()): PeriodoCobranca {
  const a = hoje.getFullYear();
  const m = hoje.getMonth();
  switch (chave) {
    case 'mes_anterior':
      return { inicio: isoData(new Date(a, m - 1, 1)), fim: isoData(new Date(a, m, 0)) };
    case 'tres_meses':
      return { inicio: isoData(new Date(a, m - 3, 1)), fim: isoData(new Date(a, m, 0)) };
    case 'ano':
      return { inicio: isoData(new Date(a, 0, 1)), fim: isoData(new Date(a, 11, 31)) };
    case 'mes_atual':
    default:
      return { inicio: isoData(new Date(a, m, 1)), fim: isoData(new Date(a, m + 1, 0)) };
  }
}

export function presetCobrancaAtivo(p: PeriodoCobranca, hoje = new Date()): PresetCobranca | null {
  for (const { chave } of PRESETS_COBRANCA) {
    const alvo = periodoCobranca(chave, hoje);
    if (alvo.inicio === p.inicio && alvo.fim === p.fim) return chave;
  }
  return null;
}

/** Periodo e um mes cheio? (mesma regra de `cobranca_recortes`). */
export function ehMesCheio(p: PeriodoCobranca): boolean {
  const [a, m, d] = p.inicio.split('-').map(Number);
  if (d !== 1) return false;
  return p.fim === isoData(new Date(a, m, 0));
}

/** Como chamar cada recorte na tela. */
export function rotuloRecorte(recorte: string, mesCheio: boolean): string {
  switch (recorte) {
    case 'atual': return mesCheio ? 'Mês' : 'Período';
    case 'anterior_1': return mesCheio ? 'Mês anterior' : 'Período anterior';
    case 'media_3': return mesCheio ? 'Média 3 meses' : 'Média 3 períodos';
    case 'ano_anterior': return mesCheio ? 'Mesmo mês ano passado' : 'Ano anterior';
    default: return recorte;
  }
}

/** Primeiro dia do mes deslocado em `delta` meses (navegacao do calendario). */
export function deslocarMes(mesIso: string, delta: number): string {
  const [a, m] = mesIso.split('-').map(Number);
  return isoData(new Date(a, m - 1 + delta, 1));
}

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function rotuloMes(mesIso: string): string {
  const [a, m] = mesIso.split('-').map(Number);
  return `${MESES[m - 1]} de ${a}`;
}
