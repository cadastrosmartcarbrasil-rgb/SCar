// ---------------------------------------------------------------------------
// Gestao de comissoes (matriz) — logica pura do painel, testada com Vitest.
// Fonte: RPC comissoes_desempenho (1 linha por competencia x regional x
// consultor). Aqui montamos a serie dos ultimos meses, o resumo por regional
// e o ranking de consultores por melhor recebimento.
// ---------------------------------------------------------------------------
import { somarMoeda } from './money';

/** Politica atual (espelha comissoes_config em 0025). */
export const COMPETENCIA_INICIAL_COMISSAO = '2026-11-01';

export type DesempenhoLinha = {
  competencia: string; // 'YYYY-MM-01'
  regional_id: string | null;
  regional_nome: string | null;
  vendedor_id: string | null;
  vendedor_nome: string;
  boletos_emitidos: number;
  valor_emitido: number;
  boletos_recebidos: number;
  valor_recebido: number;
  comissao_vendedor: number;
  comissao_regional: number;
};

export type MesResumo = {
  competencia: string;
  boletosEmitidos: number;
  valorEmitido: number;
  boletosRecebidos: number;
  valorRecebido: number;
  /** recebido / emitido (0..1); null sem emissao. */
  taxaRecebimento: number | null;
  comissaoVendedores: number;
  comissaoRegional: number;
  comissaoTotal: number;
};

export type RegionalResumo = MesResumo & {
  regionalId: string | null;
  regionalNome: string;
  /** variacao do recebido contra o mes anterior. */
  crescimentoRecebido: number | null;
};

export type ConsultorRanking = {
  posicao: number;
  vendedorId: string;
  nome: string;
  regionalNome: string;
  /** recebido em cada mes da janela (mesma ordem de `meses`). */
  recebidoPorMes: number[];
  emitidoPorMes: number[];
  valorEmitido: number;
  valorRecebido: number;
  boletosEmitidos: number;
  boletosRecebidos: number;
  taxaRecebimento: number | null;
  comissao: number;
  /** recebido do mes vs mes anterior. */
  crescimentoMes: number | null;
  /** recebido do mes vs primeiro mes da janela. */
  crescimentoJanela: number | null;
};

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Normaliza qualquer data ISO para o 1o dia do mes ('YYYY-MM-01'). */
export function inicioMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Soma `delta` meses a uma competencia 'YYYY-MM-01'. */
export function somarMeses(competencia: string, delta: number): string {
  const [a, m] = competencia.split('-').map(Number);
  const total = a * 12 + (m - 1) + delta;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

/** Ultimo dia do mes da competencia ('YYYY-MM-DD'). */
export function fimMes(competencia: string): string {
  const [a, m] = competencia.split('-').map(Number);
  const dia = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${a}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Janela de `n` meses terminando na competencia (ordem cronologica). */
export function janelaMeses(competencia: string, n = 3): string[] {
  const fim = inicioMes(competencia);
  return Array.from({ length: Math.max(1, n) }, (_, i) => somarMeses(fim, i - (Math.max(1, n) - 1)));
}

/** Variacao relativa; null quando a base e zero (crescimento indefinido). */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return (atual - anterior) / anterior;
}

export function taxaRecebimento(recebido: number, emitido: number): number | null {
  return emitido > 0 ? recebido / emitido : null;
}

function acumular(linhas: DesempenhoLinha[], competencia: string): MesResumo {
  const doMes = linhas.filter((l) => inicioMes(l.competencia) === competencia);
  const valorEmitido = somarMoeda(...doMes.map((l) => num(l.valor_emitido)));
  const valorRecebido = somarMoeda(...doMes.map((l) => num(l.valor_recebido)));
  const comissaoVendedores = somarMoeda(...doMes.map((l) => num(l.comissao_vendedor)));
  const comissaoRegional = somarMoeda(...doMes.map((l) => num(l.comissao_regional)));
  return {
    competencia,
    boletosEmitidos: doMes.reduce((s, l) => s + num(l.boletos_emitidos), 0),
    valorEmitido,
    boletosRecebidos: doMes.reduce((s, l) => s + num(l.boletos_recebidos), 0),
    valorRecebido,
    taxaRecebimento: taxaRecebimento(valorRecebido, valorEmitido),
    comissaoVendedores,
    comissaoRegional,
    comissaoTotal: somarMoeda(comissaoVendedores, comissaoRegional),
  };
}

/** Serie mensal (emitidos x recebidos x comissao) na janela. */
export function serieMensal(linhas: DesempenhoLinha[], meses: string[]): MesResumo[] {
  return meses.map((m) => acumular(linhas, m));
}

/** Resumo por regional no mes, com crescimento do recebido vs mes anterior. */
export function resumoRegionais(linhas: DesempenhoLinha[], competencia: string): RegionalResumo[] {
  const comp = inicioMes(competencia);
  const anterior = somarMeses(comp, -1);
  const grupos = new Map<string, DesempenhoLinha[]>();
  for (const l of linhas) {
    const k = l.regional_id ?? '__sem__';
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  return Array.from(grupos.entries())
    .map(([k, ls]) => {
      const atual = acumular(ls, comp);
      const prev = acumular(ls, anterior);
      return {
        ...atual,
        regionalId: k === '__sem__' ? null : k,
        regionalNome: ls[0]?.regional_nome ?? 'Sem regional',
        crescimentoRecebido: variacao(atual.valorRecebido, prev.valorRecebido),
      };
    })
    .filter((r) => r.valorEmitido > 0 || r.valorRecebido > 0 || r.comissaoTotal > 0)
    .sort((a, b) => b.valorRecebido - a.valorRecebido);
}

/**
 * Ranking de consultores por MELHOR RECEBIMENTO no mes (desempate: taxa de
 * recebimento, depois emitido). "Sem consultor" fica fora do ranking.
 */
export function rankingConsultores(linhas: DesempenhoLinha[], meses: string[]): ConsultorRanking[] {
  const atual = meses[meses.length - 1];
  const anterior = meses.length > 1 ? meses[meses.length - 2] : somarMeses(atual, -1);
  const porVendedor = new Map<string, DesempenhoLinha[]>();
  for (const l of linhas) {
    if (!l.vendedor_id) continue;
    porVendedor.set(l.vendedor_id, [...(porVendedor.get(l.vendedor_id) ?? []), l]);
  }

  const lista = Array.from(porVendedor.entries()).map(([id, ls]) => {
    const mes = (m: string) => acumular(ls, m);
    const porMes = meses.map(mes);
    const doMes = porMes[porMes.length - 1];
    const prev = meses.includes(anterior) ? porMes[meses.indexOf(anterior)] : mes(anterior);
    // regional mais recente do consultor (pode ter mudado de regional)
    const ultima = [...ls].sort((a, b) => b.competencia.localeCompare(a.competencia))[0];
    return {
      posicao: 0,
      vendedorId: id,
      nome: ls[0].vendedor_nome,
      regionalNome: ultima?.regional_nome ?? 'Sem regional',
      recebidoPorMes: porMes.map((p) => p.valorRecebido),
      emitidoPorMes: porMes.map((p) => p.valorEmitido),
      valorEmitido: doMes.valorEmitido,
      valorRecebido: doMes.valorRecebido,
      boletosEmitidos: doMes.boletosEmitidos,
      boletosRecebidos: doMes.boletosRecebidos,
      taxaRecebimento: doMes.taxaRecebimento,
      comissao: doMes.comissaoVendedores,
      crescimentoMes: variacao(doMes.valorRecebido, prev.valorRecebido),
      crescimentoJanela: variacao(doMes.valorRecebido, porMes[0].valorRecebido),
    } satisfies ConsultorRanking;
  });

  return lista
    .filter((c) => c.valorEmitido > 0 || c.valorRecebido > 0 || c.recebidoPorMes.some((v) => v > 0))
    .sort(
      (a, b) =>
        b.valorRecebido - a.valorRecebido ||
        (b.taxaRecebimento ?? -1) - (a.taxaRecebimento ?? -1) ||
        b.valorEmitido - a.valorEmitido ||
        a.nome.localeCompare(b.nome),
    )
    .map((c, i) => ({ ...c, posicao: i + 1 }));
}

/** Competencia permitida? (antes de Nov/2026 nao ha comissao no SCar). */
export function competenciaComissionavel(competencia: string, inicial = COMPETENCIA_INICIAL_COMISSAO): boolean {
  return inicioMes(competencia) >= inicioMes(inicial);
}

/** Vencimento sugerido do contas a pagar: dia X do mes seguinte a competencia. */
export function vencimentoSugerido(competencia: string, dia = 10): string {
  const prox = somarMeses(inicioMes(competencia), 1);
  return `${prox.slice(0, 8)}${String(Math.min(Math.max(dia, 1), 28)).padStart(2, '0')}`;
}
