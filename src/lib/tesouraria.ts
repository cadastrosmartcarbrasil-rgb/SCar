/**
 * Regras puras da tesouraria (0119) — testadas em tesouraria.test.ts.
 * O banco devolve os movimentos por dia; aqui se monta o saldo dia a dia
 * (realizado ate hoje, projetado depois) e a leitura de carga de cada dia.
 */

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
  SUGERIDO: 'Sugestao',
  CONCILIADO: 'Conciliado',
  IGNORADO: 'Ignorado',
};

export const ROTULO_ORIGEM: Record<string, string> = {
  BAIXA: 'Lancamento',
  TITULO: 'Mensalidade (titulo)',
  TRANSFERENCIA: 'Transferencia',
};

export const MODOS_MENSALIDADE_OFX = [
  { valor: 'POR_TEXTO', rotulo: 'Ignorar credito cujo historico tenha um dos textos', },
  { valor: 'TODOS_CREDITOS', rotulo: 'Ignorar todo credito que nao casar com um recebimento ja registrado' },
  { valor: 'NENHUM', rotulo: 'Nao ignorar nada (todo credito fica para conciliar)' },
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

/** Dia anterior (AAAA-MM-DD). */
export function diaAnteriorIso(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Resumo da fila de conciliacao. */
export function resumoConciliacao(itens: { situacao: string; valor: number }[]) {
  const r = { PENDENTE: 0, SUGERIDO: 0, CONCILIADO: 0, IGNORADO: 0, total: itens.length };
  for (const i of itens) if (i.situacao in r) (r as Record<string, number>)[i.situacao]++;
  return r;
}
