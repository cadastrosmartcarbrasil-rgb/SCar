// De onde veio um lancamento do contas a pagar/receber, e para onde levar quem
// clica nele: a OS da 24h, o evento (ou o terceiro do evento) ou, sem origem
// operacional, o proprio titulo no Financeiro. Usado pelo historico do fornecedor.

export type TipoOrigemLancamento = 'ASSISTENCIA' | 'TERCEIRO' | 'EVENTO' | 'FINANCEIRO';

export interface OrigemLancamento {
  tipo: TipoOrigemLancamento;
  /** Texto curto do selo: "OS da 24h", "Evento", "Terceiro do evento", "Financeiro". */
  rotulo: string;
  /** Identificacao legivel da origem (codigo da OS, protocolo), quando conhecida. */
  referencia: string | null;
  href: string;
}

export interface LancamentoComOrigem {
  id: string;
  evento_id: string | null;
  evento_terceiro_id: string | null;
  /** Reverso de acionamentos_assistencia.lancamento_id (0026/0027). */
  acionamentos_assistencia?: { id: string; codigo_os: string | null; protocolo: string | null }[] | null;
  eventos_sinistro?: { numero_protocolo: string | null } | null;
  evento_terceiros?: { codigo: string; nome: string } | null;
}

/**
 * Precedencia: OS da 24h (o titulo e da OS, 0027) > terceiro do evento > evento > Financeiro.
 * O terceiro vem antes do evento porque a tela dele mostra o financeiro do terceiro.
 */
export function origemDoLancamento(l: LancamentoComOrigem): OrigemLancamento {
  const os = (l.acionamentos_assistencia ?? [])[0];
  if (os) {
    return {
      tipo: 'ASSISTENCIA',
      rotulo: 'OS da 24h',
      referencia: os.codigo_os ?? os.protocolo ?? null,
      href: `/assistencia?acionamento=${os.id}`,
    };
  }
  if (l.evento_id && l.evento_terceiro_id) {
    return {
      tipo: 'TERCEIRO',
      rotulo: 'Terceiro do evento',
      referencia: l.evento_terceiros?.codigo ?? l.eventos_sinistro?.numero_protocolo ?? null,
      href: `/eventos/${l.evento_id}/terceiros/${l.evento_terceiro_id}?aba=financeiro`,
    };
  }
  if (l.evento_id) {
    return {
      tipo: 'EVENTO',
      rotulo: 'Evento',
      referencia: l.eventos_sinistro?.numero_protocolo ?? null,
      href: `/eventos/${l.evento_id}?aba=financeiro`,
    };
  }
  return {
    tipo: 'FINANCEIRO',
    rotulo: 'Financeiro',
    referencia: null,
    href: `/financeiro?lancamento=${l.id}`,
  };
}

export interface TituloParaResumo {
  tipo: 'RECEITA' | 'DESPESA';
  status: string;
  valor_original: number;
  valor_pago: number | null;
  valor_saldo: number | null;
  data_vencimento: string;
}

export interface ResumoHistoricoFornecedor {
  titulos: number;
  pago: number;
  recebido: number;
  aPagar: number;
  aReceber: number;
  vencido: number;
}

const centavos = (v: number | null | undefined) => Math.round(Number(v ?? 0) * 100);

/** Totais do historico do fornecedor. Cancelado nao conta em nada; vencido = a pagar/receber com vencimento antes de hoje. */
export function resumoHistoricoFornecedor(lista: TituloParaResumo[], hoje: string): ResumoHistoricoFornecedor {
  let pago = 0, recebido = 0, aPagar = 0, aReceber = 0, vencido = 0, titulos = 0;
  for (const l of lista) {
    if (l.status === 'cancelado') continue;
    titulos += 1;
    const quitado = centavos(l.valor_pago);
    const saldo = l.status === 'quitado' ? 0 : centavos(l.valor_saldo ?? Number(l.valor_original) - Number(l.valor_pago ?? 0));
    if (l.tipo === 'DESPESA') { pago += quitado; aPagar += saldo; } else { recebido += quitado; aReceber += saldo; }
    if (saldo > 0 && l.data_vencimento < hoje) vencido += saldo;
  }
  return {
    titulos,
    pago: pago / 100, recebido: recebido / 100,
    aPagar: aPagar / 100, aReceber: aReceber / 100, vencido: vencido / 100,
  };
}
