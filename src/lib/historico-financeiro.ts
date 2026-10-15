// ---------------------------------------------------------------------------
// Historico financeiro com as DUAS fontes (0099): os titulos do SCar e os
// boletos do Mutual (`boletos_historico`). O do Mutual e SO CONSULTA — quem
// cobra e o Mutual —, entao vem marcado com `origem` e sem os campos de edicao.
// ---------------------------------------------------------------------------
import type {
  BoletoMutualCliente, PortalBoletoMutual, PortalTitulo, TituloCliente,
} from './database.types';

/** Mais recente primeiro; empate no vencimento: o do SCar antes (e o que se edita). */
function porVencimento<T extends { data_vencimento: string; origem?: 'SCAR' | 'MUTUAL' }>(a: T, b: T): number {
  if (a.data_vencimento !== b.data_vencimento) return a.data_vencimento < b.data_vencimento ? 1 : -1;
  return (a.origem === 'MUTUAL' ? 1 : 0) - (b.origem === 'MUTUAL' ? 1 : 0);
}

/** SAC: une os titulos do SCar aos boletos do Mutual, numa lista so. */
export function unirHistoricoSac(scar: TituloCliente[], mutual: BoletoMutualCliente[]): TituloCliente[] {
  const doMutual: TituloCliente[] = mutual.map((m) => ({
    id: m.id,
    veiculo_id: m.veiculo_id,
    placa: m.placa,
    competencia: m.competencia,
    data_vencimento: m.data_vencimento,
    valor: Number(m.valor),
    valor_original: Number(m.valor),
    desconto: 0,
    acrescimo: 0,
    valor_pago: m.valor_pago,
    data_pagamento: m.data_pagamento,
    status: m.status as TituloCliente['status'],
    dias_atraso: m.dias_atraso,
    linha_digitavel: m.linha_digitavel,
    url_boleto: m.url_boleto,
    pix_copia_cola: null,
    observacao: null,
    origem: 'MUTUAL',
    url_pagamento: m.url_pagamento,
    em_serasa: m.em_serasa,
  }));
  return [...scar.map((t) => ({ ...t, origem: 'SCAR' as const })), ...doMutual].sort(porVencimento);
}

/** Portal do associado: mesma uniao, no formato da tela do portal. */
export function unirHistoricoPortal(scar: PortalTitulo[], mutual: PortalBoletoMutual[]): PortalTitulo[] {
  const doMutual: PortalTitulo[] = mutual.map((m) => ({
    id: m.id,
    veiculo_id: m.veiculo_id,
    placa: m.placa,
    competencia: m.competencia,
    data_vencimento: m.data_vencimento,
    valor: Number(m.valor),
    valor_pago: m.valor_pago,
    data_pagamento: m.data_pagamento,
    status: m.situacao,
    situacao: m.situacao,
    dias_atraso: m.dias_atraso,
    linha_digitavel: m.linha_digitavel,
    url_boleto: m.url_boleto,
    pix_copia_cola: null,
    origem: 'MUTUAL',
    url_pagamento: m.url_pagamento,
  }));
  return [...scar.map((t) => ({ ...t, origem: 'SCAR' as const })), ...doMutual].sort(porVencimento);
}

/** O boleto pode ser editado / reemitido AQUI? Do Mutual, nunca. */
export function editavelNoScar(t: { origem?: 'SCAR' | 'MUTUAL'; status: string }): boolean {
  return t.origem !== 'MUTUAL' && t.status !== 'pago' && t.status !== 'cancelado';
}

/** Situacao de leitura do boleto: pendente ja vencido conta como vencido. */
function situacaoDoBoleto(t: { status: string; data_vencimento: string }, hoje: string): 'pago' | 'aberto' | 'vencido' | 'cancelado' {
  if (t.status === 'pago') return 'pago';
  if (t.status === 'cancelado') return 'cancelado';
  if (t.status === 'vencido' || t.data_vencimento < hoje) return 'vencido';
  return 'aberto';
}

/**
 * Os quatro numeros da aba Financeiro (associado e veiculo), sobre as DUAS fontes.
 * Cancelado nao entra no total: nao e divida nem receita.
 */
export function resumoHistoricoFinanceiro(
  titulos: { status: string; data_vencimento: string; valor: number | string; valor_pago?: number | string | null }[],
  hoje: string,
) {
  const r = { total: 0, pago: 0, aberto: 0, vencido: 0, qtdVencidos: 0, qtd: 0 };
  for (const t of titulos) {
    const s = situacaoDoBoleto(t, hoje);
    if (s === 'cancelado') continue;
    const valor = Number(t.valor) || 0;
    r.qtd += 1;
    r.total += valor;
    if (s === 'pago') r.pago += Number(t.valor_pago ?? 0) || valor;
    else if (s === 'vencido') { r.vencido += valor; r.qtdVencidos += 1; }
    else r.aberto += valor;
  }
  for (const k of ['total', 'pago', 'aberto', 'vencido'] as const) r[k] = Math.round(r[k] * 100) / 100;
  return r;
}
