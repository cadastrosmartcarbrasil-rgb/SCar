// ============================================================================
// Regras puras do departamento financeiro (sem React/Supabase) — testaveis.
//   - situacao real do titulo (o banco so marca "atrasado" via rotina)
//   - aging / dias de atraso
//   - geracao de parcelas (com ajuste de centavos na ultima)
//   - estruturacao do DRE (subtotais, analise vertical, variacao)
// ============================================================================

import { arredondarMoeda, somarMoeda } from './money';
import type { StatusLancamento, TipoCategoriaDre, TipoMovimentacao } from './database.types';

// ---------------------------------------------------------------------------
// Titulos
// ---------------------------------------------------------------------------
export interface TituloBase {
  tipo: TipoMovimentacao;
  status: StatusLancamento;
  data_vencimento: string;
  valor_original: number;
  valor_pago?: number | null;
  valor_saldo?: number | null;
}

/** Dias corridos de atraso (0 quando ainda nao venceu). */
export function diasAtraso(vencimento: string, hoje = new Date()): number {
  const venc = new Date(`${vencimento}T00:00:00`);
  const ref = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = Math.floor((ref.getTime() - venc.getTime()) / 86_400_000);
  return dias > 0 ? dias : 0;
}

/** Dias que faltam para vencer (negativo = ja venceu). */
export function diasParaVencer(vencimento: string, hoje = new Date()): number {
  const venc = new Date(`${vencimento}T00:00:00`);
  const ref = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((venc.getTime() - ref.getTime()) / 86_400_000);
}

export type SituacaoTitulo = 'quitado' | 'cancelado' | 'atrasado' | 'vence_hoje' | 'a_vencer' | 'pago_parcial';

/**
 * Situacao exibida na tela. Diferente do status do banco porque considera a
 * data de hoje: um titulo "pendente" vencido ontem aparece como atrasado
 * mesmo antes da rotina marcar_lancamentos_atrasados() rodar.
 */
export function situacaoTitulo(t: TituloBase, hoje = new Date()): SituacaoTitulo {
  if (t.status === 'quitado') return 'quitado';
  if (t.status === 'cancelado') return 'cancelado';
  const faltam = diasParaVencer(t.data_vencimento, hoje);
  if (faltam < 0) return 'atrasado';
  if (t.status === 'pago_parcial') return 'pago_parcial';
  return faltam === 0 ? 'vence_hoje' : 'a_vencer';
}

/** Saldo devedor do titulo (usa o cache do banco quando disponivel). */
export function saldoTitulo(t: TituloBase): number {
  if (t.valor_saldo != null) return Number(t.valor_saldo);
  return arredondarMoeda(Number(t.valor_original) - Number(t.valor_pago ?? 0));
}

export const FAIXAS_AGING = [
  { chave: 'a_vencer', rotulo: 'A vencer', max: 0 },
  { chave: 'd1_30', rotulo: '1 a 30 dias', max: 30 },
  { chave: 'd31_60', rotulo: '31 a 60 dias', max: 60 },
  { chave: 'd61_90', rotulo: '61 a 90 dias', max: 90 },
  { chave: 'd90_mais', rotulo: 'Acima de 90 dias', max: Infinity },
] as const;
export type FaixaAging = (typeof FAIXAS_AGING)[number]['chave'];

export function faixaAging(dias: number): FaixaAging {
  if (dias <= 0) return 'a_vencer';
  if (dias <= 30) return 'd1_30';
  if (dias <= 60) return 'd31_60';
  if (dias <= 90) return 'd61_90';
  return 'd90_mais';
}

// ---------------------------------------------------------------------------
// Parcelamento
// ---------------------------------------------------------------------------
export type Periodicidade = 'MENSAL' | 'QUINZENAL' | 'SEMANAL' | 'ANUAL';

/** Soma meses preservando o fim do mes (31/01 + 1 mes = 28/02). */
export function addMeses(isoDate: string, meses: number): string {
  const [a, m, d] = isoDate.split('-').map(Number);
  const alvo = new Date(a, m - 1 + meses, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d, ultimoDia));
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(alvo.getDate()).padStart(2, '0')}`;
}

export function addDias(isoDate: string, dias: number): string {
  const [a, m, d] = isoDate.split('-').map(Number);
  const alvo = new Date(a, m - 1, d + dias);
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(alvo.getDate()).padStart(2, '0')}`;
}

export function proximaData(base: string, indice: number, periodicidade: Periodicidade): string {
  switch (periodicidade) {
    case 'SEMANAL': return addDias(base, 7 * indice);
    case 'QUINZENAL': return addDias(base, 15 * indice);
    case 'ANUAL': return addMeses(base, 12 * indice);
    default: return addMeses(base, indice);
  }
}

export interface Parcela {
  parcela_numero: number;
  parcela_total: number;
  data_vencimento: string;
  competencia: string;
  valor: number;
}

/**
 * Divide um valor em N parcelas sem perder centavos: a diferenca do
 * arredondamento vai toda para a ULTIMA parcela (praxe contabil).
 * `valorTotal` é o total do documento; para "repetir" o mesmo valor todo mes
 * use `repetirValor = true`.
 */
export function gerarParcelas(opts: {
  valorTotal: number;
  quantidade: number;
  primeiroVencimento: string;
  competenciaInicial?: string;
  periodicidade?: Periodicidade;
  repetirValor?: boolean;
}): Parcela[] {
  const qtd = Math.max(1, Math.floor(opts.quantidade || 1));
  const periodicidade = opts.periodicidade ?? 'MENSAL';
  const competenciaBase = opts.competenciaInicial ?? opts.primeiroVencimento;

  const centavosTotal = Math.round(opts.valorTotal * 100);
  const centavosParcela = opts.repetirValor ? centavosTotal : Math.floor(centavosTotal / qtd);
  const resto = opts.repetirValor ? 0 : centavosTotal - centavosParcela * qtd;

  return Array.from({ length: qtd }, (_, i) => ({
    parcela_numero: i + 1,
    parcela_total: qtd,
    data_vencimento: proximaData(opts.primeiroVencimento, i, periodicidade),
    competencia: proximaData(competenciaBase, i, periodicidade),
    valor: (centavosParcela + (i === qtd - 1 ? resto : 0)) / 100,
  }));
}

// ---------------------------------------------------------------------------
// DRE
// ---------------------------------------------------------------------------
export interface LinhaDre {
  grupo: TipoCategoriaDre;
  categoria_codigo: string;
  categoria_nome: string;
  total: number;
}

export interface LinhaDreCalculada extends LinhaDre {
  /** Valor sempre positivo, para exibicao. O sinal fica no rotulo do grupo. */
  valorAbsoluto: number;
  /** Analise vertical: participacao sobre a receita bruta (%). */
  analiseVertical: number;
  /** Mesmo periodo anterior, quando comparativo estiver ligado. */
  totalAnterior?: number;
  variacao?: number | null;
}

export interface GrupoDre {
  grupo: TipoCategoriaDre;
  rotulo: string;
  subtotal: number;
  subtotalAnterior?: number;
  analiseVertical: number;
  linhas: LinhaDreCalculada[];
}

export const ROTULO_GRUPO: Record<TipoCategoriaDre, string> = {
  RECEITA: '(+) Receita Bruta',
  CUSTO_VARIAVEL: '(-) Custos Variaveis',
  DESPESA_FIXA: '(-) Despesas Fixas / Operacionais',
};

const ORDEM_GRUPO: TipoCategoriaDre[] = ['RECEITA', 'CUSTO_VARIAVEL', 'DESPESA_FIXA'];

/** Variacao percentual entre dois periodos (null quando nao ha base). */
export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return arredondarMoeda(((Math.abs(atual) - Math.abs(anterior)) / Math.abs(anterior)) * 100);
}

/** Monta o DRE em grupos com subtotais, AV% e comparativo opcional. */
export function estruturarDre(linhas: LinhaDre[], anteriores?: LinhaDre[]): GrupoDre[] {
  const receitaBruta = somarMoeda(
    ...linhas.filter((l) => l.grupo === 'RECEITA').map((l) => Number(l.total)),
  );
  const base = Math.abs(receitaBruta) || 0;
  const mapaAnterior = new Map((anteriores ?? []).map((l) => [l.categoria_codigo, Number(l.total)]));

  return ORDEM_GRUPO.map((grupo) => {
    const doGrupo = linhas.filter((l) => l.grupo === grupo);
    const subtotal = somarMoeda(...doGrupo.map((l) => Number(l.total)));
    const subtotalAnterior = anteriores
      ? somarMoeda(...(anteriores.filter((l) => l.grupo === grupo).map((l) => Number(l.total))))
      : undefined;

    return {
      grupo,
      rotulo: ROTULO_GRUPO[grupo],
      subtotal,
      subtotalAnterior,
      analiseVertical: base ? arredondarMoeda((Math.abs(subtotal) / base) * 100) : 0,
      linhas: doGrupo
        .map((l): LinhaDreCalculada => {
          const anterior = mapaAnterior.get(l.categoria_codigo);
          return {
            ...l,
            total: Number(l.total),
            valorAbsoluto: Math.abs(Number(l.total)),
            analiseVertical: base ? arredondarMoeda((Math.abs(Number(l.total)) / base) * 100) : 0,
            totalAnterior: anterior,
            variacao: anterior === undefined ? undefined : variacaoPercentual(Number(l.total), anterior),
          };
        })
        .sort((a, b) => b.valorAbsoluto - a.valorAbsoluto),
    };
  }).filter((g) => g.linhas.length > 0);
}

export interface IndicadoresDre {
  receitaBruta: number;
  custoVariavel: number;
  despesaFixa: number;
  margemContribuicao: number;
  margemContribuicaoPercentual: number;
  resultadoLiquido: number;
  margemLiquidaPercentual: number;
  /** Receita necessaria no periodo para cobrir a despesa fixa. */
  pontoEquilibrio: number;
}

/**
 * Indicadores gerenciais. Custos/despesas chegam NEGATIVOS do banco;
 * aqui viram positivos para leitura, e o resultado e receita - custo - despesa.
 */
export function calcularIndicadores(resumo: {
  receita_bruta?: number | null;
  custo_variavel?: number | null;
  despesa_fixa?: number | null;
}): IndicadoresDre {
  const receita = Math.abs(Number(resumo.receita_bruta ?? 0));
  const custo = Math.abs(Number(resumo.custo_variavel ?? 0));
  const despesa = Math.abs(Number(resumo.despesa_fixa ?? 0));

  const margemContribuicao = arredondarMoeda(receita - custo);
  const resultado = arredondarMoeda(margemContribuicao - despesa);
  const mcPercentual = receita ? arredondarMoeda((margemContribuicao / receita) * 100) : 0;

  return {
    receitaBruta: receita,
    custoVariavel: custo,
    despesaFixa: despesa,
    margemContribuicao,
    margemContribuicaoPercentual: mcPercentual,
    resultadoLiquido: resultado,
    margemLiquidaPercentual: receita ? arredondarMoeda((resultado / receita) * 100) : 0,
    pontoEquilibrio: mcPercentual > 0 ? arredondarMoeda(despesa / (mcPercentual / 100)) : 0,
  };
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Periodo imediatamente anterior, para o comparativo do DRE.
 * Quando o filtro cobre um mes fechado, devolve o MES anterior inteiro
 * (comparacao contabil correta); caso contrario, uma janela do mesmo tamanho.
 */
export function periodoAnterior(inicio: string, fim: string): { inicio: string; fim: string } {
  const i = new Date(`${inicio}T00:00:00`);
  const f = new Date(`${fim}T00:00:00`);

  const ehMesFechado =
    i.getDate() === 1 && f.getDate() === new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
  if (ehMesFechado && i.getFullYear() === f.getFullYear() && i.getMonth() === f.getMonth()) {
    const ini = new Date(i.getFullYear(), i.getMonth() - 1, 1);
    return { inicio: iso(ini), fim: iso(new Date(ini.getFullYear(), ini.getMonth() + 1, 0)) };
  }

  const dias = Math.round((f.getTime() - i.getTime()) / 86_400_000) + 1;
  const novoFim = new Date(i.getFullYear(), i.getMonth(), i.getDate() - 1);
  const novoInicio = new Date(novoFim.getFullYear(), novoFim.getMonth(), novoFim.getDate() - (dias - 1));
  return { inicio: iso(novoInicio), fim: iso(novoFim) };
}
