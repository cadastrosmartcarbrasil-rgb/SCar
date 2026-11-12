// ---------------------------------------------------------------------------
// Gestao de comissoes pela MATRIZ (0198) — logica pura do painel, testada.
// Fonte: RPC comissoes_matriz_desempenho (1 linha por competencia x regional x
// consultor, pelo MES DE VENCIMENTO, juntando SCar + Mutual). Aqui montamos a
// serie dos ultimos meses, o resumo por regional e o ranking de consultores.
//
// Regra da taxa de recebimento (a mesma do Painel de Inadimplencia): boleto que
// ainda nao venceu NAO entra no denominador. Taxa = recebido dos boletos ja
// vencidos / valor ja vencido. Sem isso, o mes corrente pareceria um desastre.
// ---------------------------------------------------------------------------
import { somarMoeda } from './money';
import type { ComissaoMatrizDesempenho, ComissaoMatrizDestino } from './database.types';

/** Politica atual (espelha comissoes_config em 0198). */
export const COMPETENCIA_INICIAL_COMISSAO = '2026-11-01';

export const DESTINO_COMISSAO: Record<ComissaoMatrizDestino, { rotulo: string; detalhe: string }> = {
  FRANQUIA: {
    rotulo: 'Paga a franquia',
    detalhe: 'A matriz paga a franquia (taxa da regional sobre o recebido); a franquia repassa aos consultores pelo portal dela.',
  },
  VENDEDORES: {
    rotulo: 'Paga os consultores',
    detalhe: 'A matriz paga cada consultor direto (taxa do cadastro do vendedor). Padrao da unidade da matriz.',
  },
  NENHUM: { rotulo: 'Sem comissao', detalhe: 'A matriz nao paga comissao desta unidade.' },
};

export type MesResumo = {
  competencia: string;
  boletosEmitidos: number;
  valorEmitido: number;
  boletosVencidos: number;
  valorVencido: number;
  boletosRecebidos: number;
  valorRecebido: number;
  valorRecebidoVencidos: number;
  /** recebido dos vencidos / vencido (0..1); null se nada venceu. */
  taxaRecebimento: number | null;
  comissaoFranquia: number;
  comissaoVendedores: number;
  comissaoTotal: number;
};

export type RegionalResumo = MesResumo & {
  regionalId: string | null;
  regionalNome: string;
  destino: ComissaoMatrizDestino | null;
  taxaRegional: number | null;
  /** variacao do recebido contra o mes anterior. */
  crescimentoRecebido: number | null;
  /** diferenca da taxa de recebimento contra o mes anterior, em pontos (0.05 = 5 p.p.). */
  variacaoTaxa: number | null;
};

export type ConsultorRanking = {
  posicao: number;
  vendedorId: string;
  nome: string;
  ativo: boolean;
  regionalNome: string;
  taxaVendedor: number | null;
  /** recebido em cada mes da janela (mesma ordem de `meses`). */
  recebidoPorMes: number[];
  emitidoPorMes: number[];
  taxaPorMes: (number | null)[];
  valorEmitido: number;
  valorRecebido: number;
  boletosEmitidos: number;
  boletosRecebidos: number;
  taxaRecebimento: number | null;
  /** comissao do mes atribuida ao consultor (a dele, ou a da franquia sobre a carteira dele). */
  comissao: number;
  crescimentoMes: number | null;
  crescimentoJanela: number | null;
};

const num = (v: unknown) => Number(v ?? 0) || 0;

export function inicioMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function somarMeses(competencia: string, delta: number): string {
  const [a, m] = competencia.split('-').map(Number);
  const total = a * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

/** Janela de `n` meses terminando na competencia (ordem cronologica). */
export function janelaMeses(competencia: string, n = 3): string[] {
  const k = Math.max(1, n);
  const fim = inicioMes(competencia);
  return Array.from({ length: k }, (_, i) => somarMeses(fim, i - (k - 1)));
}

/** Variacao relativa; null quando a base e zero. */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return (atual - anterior) / anterior;
}

export function taxaRecebimento(recebidoVencidos: number, vencido: number): number | null {
  return vencido > 0 ? recebidoVencidos / vencido : null;
}

function acumular(linhas: ComissaoMatrizDesempenho[], competencia: string): MesResumo {
  const d = linhas.filter((l) => inicioMes(l.competencia) === competencia);
  const soma = (k: keyof ComissaoMatrizDesempenho) => somarMoeda(...d.map((l) => num(l[k])));
  const conta = (k: keyof ComissaoMatrizDesempenho) => d.reduce((s, l) => s + num(l[k]), 0);
  const valorVencido = soma('valor_vencido');
  const valorRecebidoVencidos = soma('valor_recebido_vencidos');
  const comissaoFranquia = soma('comissao_franquia');
  const comissaoVendedores = soma('comissao_vendedor');
  return {
    competencia,
    boletosEmitidos: conta('boletos_emitidos'),
    valorEmitido: soma('valor_emitido'),
    boletosVencidos: conta('boletos_vencidos'),
    valorVencido,
    boletosRecebidos: conta('boletos_recebidos'),
    valorRecebido: soma('valor_recebido'),
    valorRecebidoVencidos,
    taxaRecebimento: taxaRecebimento(valorRecebidoVencidos, valorVencido),
    comissaoFranquia,
    comissaoVendedores,
    comissaoTotal: somarMoeda(comissaoFranquia, comissaoVendedores),
  };
}

export function serieMensal(linhas: ComissaoMatrizDesempenho[], meses: string[]): MesResumo[] {
  return meses.map((m) => acumular(linhas, m));
}

export function resumoRegionais(linhas: ComissaoMatrizDesempenho[], competencia: string): RegionalResumo[] {
  const comp = inicioMes(competencia);
  const anterior = somarMeses(comp, -1);
  const grupos = new Map<string, ComissaoMatrizDesempenho[]>();
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
        destino: ls[0]?.destino ?? null,
        taxaRegional: ls[0]?.taxa_regional == null ? null : num(ls[0].taxa_regional),
        crescimentoRecebido: variacao(atual.valorRecebido, prev.valorRecebido),
        variacaoTaxa:
          atual.taxaRecebimento == null || prev.taxaRecebimento == null
            ? null
            : atual.taxaRecebimento - prev.taxaRecebimento,
      };
    })
    .filter((r) => r.valorEmitido > 0 || r.valorRecebido > 0 || r.comissaoTotal > 0)
    .sort((a, b) => b.valorRecebido - a.valorRecebido);
}

/**
 * Ranking por MELHOR RECEBIMENTO no mes (desempate: taxa de recebimento,
 * depois o emitido). "Sem consultor" fica fora do ranking.
 */
export function rankingConsultores(linhas: ComissaoMatrizDesempenho[], meses: string[]): ConsultorRanking[] {
  const atual = meses[meses.length - 1];
  const porVendedor = new Map<string, ComissaoMatrizDesempenho[]>();
  for (const l of linhas) {
    if (!l.vendedor_id) continue;
    porVendedor.set(l.vendedor_id, [...(porVendedor.get(l.vendedor_id) ?? []), l]);
  }
  const lista = Array.from(porVendedor.entries()).map(([id, ls]) => {
    const porMes = meses.map((m) => acumular(ls, m));
    const doMes = porMes[porMes.length - 1];
    const prev = porMes.length > 1 ? porMes[porMes.length - 2] : acumular(ls, somarMeses(atual, -1));
    const ultima = [...ls].sort((a, b) => b.competencia.localeCompare(a.competencia))[0];
    return {
      posicao: 0,
      vendedorId: id,
      nome: ls[0].vendedor_nome,
      ativo: Boolean(ls[0].vendedor_ativo),
      regionalNome: ultima?.regional_nome ?? 'Sem regional',
      taxaVendedor: ls[0].taxa_vendedor == null ? null : num(ls[0].taxa_vendedor),
      recebidoPorMes: porMes.map((p) => p.valorRecebido),
      emitidoPorMes: porMes.map((p) => p.valorEmitido),
      taxaPorMes: porMes.map((p) => p.taxaRecebimento),
      valorEmitido: doMes.valorEmitido,
      valorRecebido: doMes.valorRecebido,
      boletosEmitidos: doMes.boletosEmitidos,
      boletosRecebidos: doMes.boletosRecebidos,
      taxaRecebimento: doMes.taxaRecebimento,
      comissao: doMes.comissaoTotal,
      crescimentoMes: variacao(doMes.valorRecebido, prev.valorRecebido),
      crescimentoJanela: variacao(doMes.valorRecebido, porMes[0].valorRecebido),
    } satisfies ConsultorRanking;
  });
  return lista
    .filter((c) => c.valorEmitido > 0 || c.recebidoPorMes.some((v) => v > 0))
    .sort(
      (a, b) =>
        b.valorRecebido - a.valorRecebido ||
        (b.taxaRecebimento ?? -1) - (a.taxaRecebimento ?? -1) ||
        b.valorEmitido - a.valorEmitido ||
        a.nome.localeCompare(b.nome),
    )
    .map((c, i) => ({ ...c, posicao: i + 1 }));
}

/** Antes de 11/2026 nao ha comissao no SCar. */
export function competenciaComissionavel(competencia: string, inicial = COMPETENCIA_INICIAL_COMISSAO): boolean {
  return inicioMes(competencia) >= inicioMes(inicial);
}

/** Vencimento sugerido do contas a pagar: dia X do mes seguinte a competencia. */
export function vencimentoSugerido(competencia: string, dia = 10): string {
  const prox = somarMeses(inicioMes(competencia), 1);
  return `${prox.slice(0, 8)}${String(Math.min(Math.max(dia, 1), 28)).padStart(2, '0')}`;
}
