/**
 * Regras puras da tesouraria (0119) — testadas em tesouraria.test.ts.
 * O banco devolve os movimentos por dia; aqui se monta o saldo dia a dia
 * (realizado ate hoje, projetado depois) e a leitura de carga de cada dia.
 */

import { somarMoeda } from './money';

export interface DiaFluxo {
  dia: string;
  realizado_entrada: number;
  realizado_saida: number;
  previsto_entrada: number;
  previsto_saida: number;
  previsto_boletos: number;
  vencido_entrada: number;
  vencido_saida: number;
  qtd_previsto_saida: number;
}

export interface OpcoesProjecao {
  /** Somar os boletos em aberto (mensalidades) como entrada prevista. Padrao: sim. */
  comBoletos?: boolean;
  /** Contar o vencido e nao pago na linha de hoje. Padrao: so as SAIDAS (lado prudente). */
  vencidos?: 'nenhum' | 'saidas' | 'tudo';
}

export type SituacaoDia = 'passado' | 'hoje' | 'futuro';
export type CargaDia = 'livre' | 'atencao' | 'critico';

export interface DiaProjetado extends DiaFluxo {
  situacao: SituacaoDia;
  entradas: number;
  saidas: number;
  resultado: number;
  saldo: number;
  /** Peso das saidas sobre as entradas do dia (null quando nao ha entradas). */
  pesoSaidas: number | null;
  carga: CargaDia;
}

const c = (v: number) => Math.round((Number(v) || 0) * 100);

/**
 * Saldo dia a dia. `saldoInicial` = saldo no FIM do dia anterior ao primeiro
 * dia da lista (o banco responde por `saldo_consolidado_em`).
 * Dia passado: so o realizado. Hoje: realizado + previsto (+ vencido conforme a
 * opcao). Futuro: so o previsto.
 */
export function projetarFluxo(dias: DiaFluxo[], saldoInicial: number, hoje: string, op: OpcoesProjecao = {}): DiaProjetado[] {
  const comBoletos = op.comBoletos ?? true;
  const vencidos = op.vencidos ?? 'saidas';
  let saldo = c(saldoInicial);
  return [...dias]
    .sort((a, b) => a.dia.localeCompare(b.dia))
    .map((d) => {
      const situacao: SituacaoDia = d.dia < hoje ? 'passado' : d.dia === hoje ? 'hoje' : 'futuro';
      let ent = situacao === 'futuro' ? 0 : c(d.realizado_entrada);
      let sai = situacao === 'futuro' ? 0 : c(d.realizado_saida);
      if (situacao !== 'passado') {
        ent += c(d.previsto_entrada) + (comBoletos ? c(d.previsto_boletos) : 0);
        sai += c(d.previsto_saida);
        if (vencidos === 'tudo') ent += c(d.vencido_entrada);
        if (vencidos !== 'nenhum') sai += c(d.vencido_saida);
      }
      saldo += ent - sai;
      const peso = ent > 0 ? sai / ent : null;
      const carga: CargaDia = saldo < 0 ? 'critico' : sai > 0 && (ent === 0 || sai > ent) ? 'atencao' : 'livre';
      return {
        ...d,
        situacao,
        entradas: ent / 100,
        saidas: sai / 100,
        resultado: (ent - sai) / 100,
        saldo: saldo / 100,
        pesoSaidas: peso === null ? null : Math.round(peso * 1000) / 1000,
        carga,
      };
    });
}

/** Totais do periodo (realizado e a realizar separados). */
export function totaisFluxo(dias: DiaFluxo[]) {
  let re = 0, rs = 0, pe = 0, ps = 0, pb = 0, ve = 0, vs = 0;
  for (const d of dias) {
    re += c(d.realizado_entrada); rs += c(d.realizado_saida);
    pe += c(d.previsto_entrada); ps += c(d.previsto_saida); pb += c(d.previsto_boletos);
    ve += c(d.vencido_entrada); vs += c(d.vencido_saida);
  }
  return {
    realizadoEntrada: re / 100, realizadoSaida: rs / 100, realizadoResultado: (re - rs) / 100,
    previstoEntrada: pe / 100, previstoSaida: ps / 100, previstoBoletos: pb / 100,
    vencidoEntrada: ve / 100, vencidoSaida: vs / 100,
  };
}

/** Primeiro dia em que o saldo projetado fica negativo (o alerta da fila de pagamentos). */
export function primeiroDiaNegativo(proj: DiaProjetado[]): DiaProjetado | null {
  return proj.find((d) => d.saldo < 0) ?? null;
}

export const ROTULO_SITUACAO_EXTRATO: Record<string, string> = {
  PENDENTE: 'Pendente',
  SUGERIDO: 'Sugestão',
  CONCILIADO: 'Conciliado',
  IGNORADO: 'Ignorado',
};

export const ROTULO_ORIGEM: Record<string, string> = {
  BAIXA: 'Lançamento',
  TITULO: 'Mensalidade (título)',
  TRANSFERENCIA: 'Transferência',
};

export const MODOS_MENSALIDADE_OFX = [
  { valor: 'POR_TEXTO', rotulo: 'Ignorar crédito cujo histórico tenha um dos textos', },
  { valor: 'TODOS_CREDITOS', rotulo: 'Ignorar todo crédito que não casar com um recebimento já registrado' },
  { valor: 'NENHUM', rotulo: 'Não ignorar nada (todo crédito fica para conciliar)' },
] as const;

/** Textos digitados (um por linha ou separados por virgula) -> lista limpa e sem repetir. */
export function textosDeMensalidade(entrada: string): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const t of entrada.split(/[\n,;]+/)) {
    const v = t.trim().toUpperCase();
    if (v.length < 3 || vistos.has(v)) continue;
    vistos.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Dia anterior (AAAA-MM-DD). Data vazia ou incompleta (o campo "De" sendo
 * digitado) devolve '' em vez de quebrar a tela com "Invalid time value".
 */
export function diaAnteriorIso(dia: string | null | undefined): string {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return '';
  const d = new Date(`${dia}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type GrupoExtrato = 'PIX' | 'COMPE_REDE' | 'COBRANCA';

export const ROTULO_GRUPO_EXTRATO: Record<GrupoExtrato, string> = {
  PIX: 'Recebimentos PIX da cobrança',
  COMPE_REDE: 'Boletos liquidados (COMPE e REDE)',
  COBRANCA: 'Recebimentos da cobrança',
};

type LinhaAgrupavel = {
  data: string;
  conta_id: string;
  grupo?: GrupoExtrato | null;
  entrada: number | string;
  saida: number | string;
  saldo: number | string | null;
  conciliado: boolean;
};

export type ItemExtrato<L> =
  | { tipo: 'linha'; linha: L }
  | {
      tipo: 'grupo';
      chave: string;
      grupo: GrupoExtrato;
      data: string;
      conta_id: string;
      linhas: L[];
      entrada: number;
      saida: number;
      saldo: number | null;
      conciliados: number;
    };

/**
 * Junta as linhas CONTIGUAS do mesmo dia, conta e grupo (o banco ja as entrega juntas,
 * 0149) numa linha de total. O saldo do grupo e o da ultima linha: o saldo real depois
 * do grupo inteiro. Grupo de um so vira linha comum; sem `agrupar`, tudo e linha.
 */
export function agruparExtrato<L extends LinhaAgrupavel>(linhas: L[], agrupar = true): ItemExtrato<L>[] {
  const out: ItemExtrato<L>[] = [];
  let atual: L[] = [];
  const fechar = () => {
    if (!atual.length) return;
    if (atual.length === 1) {
      out.push({ tipo: 'linha', linha: atual[0] });
    } else {
      const p = atual[0];
      const ult = atual[atual.length - 1];
      out.push({
        tipo: 'grupo',
        chave: `${p.data}|${p.conta_id}|${p.grupo}`,
        grupo: p.grupo as GrupoExtrato,
        data: p.data,
        conta_id: p.conta_id,
        linhas: atual,
        entrada: somarMoeda(...atual.map((l) => Number(l.entrada))),
        saida: somarMoeda(...atual.map((l) => Number(l.saida))),
        saldo: ult.saldo === null ? null : Number(ult.saldo),
        conciliados: atual.filter((l) => l.conciliado).length,
      });
    }
    atual = [];
  };
  for (const l of linhas) {
    if (!agrupar || !l.grupo) {
      fechar();
      out.push({ tipo: 'linha', linha: l });
      continue;
    }
    const p = atual[0];
    if (p && (p.data !== l.data || p.conta_id !== l.conta_id || p.grupo !== l.grupo)) fechar();
    atual.push(l);
  }
  fechar();
  return out;
}

/** Resumo da fila de conciliacao. */
export function resumoConciliacao(itens: { situacao: string; valor: number }[]) {
  const r = { PENDENTE: 0, SUGERIDO: 0, CONCILIADO: 0, IGNORADO: 0, total: itens.length };
  for (const i of itens) if (i.situacao in r) (r as Record<string, number>)[i.situacao]++;
  return r;
}
