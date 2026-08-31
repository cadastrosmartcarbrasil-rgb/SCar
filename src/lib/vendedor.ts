/**
 * Portal do vendedor — regras puras.
 *
 * O vendedor nao precisa do vocabulario interno do CRM. Para ele existem
 * quatro momentos: o lead esta em andamento, esta em analise pela empresa,
 * virou venda ou se perdeu. `APROVADO` e `EM_AUDITORIA` sao etapas nossas —
 * do lado dele e "em analise", e nao ha nada a fazer ate sair o resultado.
 */
import { STATUS_LEAD } from '@/lib/crm';
import type { StatusLead } from '@/lib/database.types';

export type EtapaVendedor = 'andamento' | 'analise' | 'venda' | 'perdido';

const ETAPA_POR_STATUS: Record<string, EtapaVendedor> = {
  NOVO: 'andamento',
  ORCAMENTO_GERADO: 'andamento',
  PROPOSTA_ENVIADA: 'andamento',
  EM_NEGOCIACAO: 'andamento',
  APROVADO: 'analise',
  EM_AUDITORIA: 'analise',
  ATIVO: 'venda',
  PERDIDO: 'perdido',
};

export function etapaDoVendedor(status: string): EtapaVendedor {
  return ETAPA_POR_STATUS[status] ?? 'andamento';
}

export const SELO_STATUS_LEAD: Record<string, { rotulo: string; classe: string }> = {
  NOVO:             { rotulo: 'Novo',        classe: 'bg-slate-50 text-slate-600 ring-slate-200' },
  ORCAMENTO_GERADO: { rotulo: 'Cotacao',     classe: 'bg-sky-50 text-sky-700 ring-sky-200' },
  PROPOSTA_ENVIADA: { rotulo: 'Proposta',    classe: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  EM_NEGOCIACAO:    { rotulo: 'Negociacao',  classe: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  APROVADO:         { rotulo: 'Em analise',  classe: 'bg-amber-50 text-amber-800 ring-amber-200' },
  EM_AUDITORIA:     { rotulo: 'Em analise',  classe: 'bg-amber-50 text-amber-800 ring-amber-200' },
  ATIVO:            { rotulo: 'Venda feita', classe: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  PERDIDO:          { rotulo: 'Perdido',     classe: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

/** Rotulo interno completo (usado onde cabe o vocabulario do CRM). */
export function rotuloStatusLead(status: string): string {
  return STATUS_LEAD[status as StatusLead]?.label ?? status;
}

/** Filtros da tela de leads: agrupam os status internos pela visao do vendedor. */
export const FILTROS_LEAD: { chave: string; rotulo: string; status: string[] }[] = [
  { chave: '',          rotulo: 'Todos',       status: [] },
  { chave: 'andamento', rotulo: 'Em andamento', status: ['NOVO', 'ORCAMENTO_GERADO', 'PROPOSTA_ENVIADA', 'EM_NEGOCIACAO'] },
  { chave: 'analise',   rotulo: 'Em analise',   status: ['APROVADO', 'EM_AUDITORIA'] },
  { chave: 'venda',     rotulo: 'Vendas',       status: ['ATIVO'] },
  { chave: 'perdido',   rotulo: 'Perdidos',     status: ['PERDIDO'] },
];

export function filtrarPorEtapa<T extends { status: string }>(leads: T[], etapa: string): T[] {
  if (!etapa) return leads;
  return leads.filter((l) => etapaDoVendedor(l.status) === etapa);
}

export interface ComissaoBase {
  is_adesao: boolean;
  valor_comissao: number | string;
  status_pagamento: string;
}

/** Totais do extrato de comissao. */
export function resumoComissoes(lista: ComissaoBase[]): {
  total: number; pendente: number; pago: number; adesao: number; recorrente: number;
} {
  const soma = (f: (c: ComissaoBase) => boolean) =>
    lista.filter(f).reduce((acc, c) => acc + Number(c.valor_comissao ?? 0), 0);
  return {
    total: soma(() => true),
    pendente: soma((c) => c.status_pagamento === 'pendente'),
    pago: soma((c) => c.status_pagamento === 'pago'),
    adesao: soma((c) => c.is_adesao),
    recorrente: soma((c) => !c.is_adesao),
  };
}

const DIAS_SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

/**
 * Proximo pagamento da ADESAO, que e semanal: `dia` vai de 1 (segunda) a 7
 * (domingo), como o cadastro do vendedor guarda. Caindo hoje, e hoje.
 */
export function proximoPagamentoSemanal(dia: number | null, hoje = new Date()): Date | null {
  if (!dia || dia < 1 || dia > 7) return null;
  const alvo = dia === 7 ? 0 : dia;              // domingo = 0 no getDay()
  const faltam = (alvo - hoje.getDay() + 7) % 7; // 0 = e hoje
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + faltam);
  return d;
}

/**
 * Proximo pagamento da RECORRENCIA, que e mensal: `dia` de 1 a 31. Dia maior
 * que o mes tem (31 em fevereiro) cai no ultimo dia do mes — mesma regra do
 * vencimento da cobranca.
 */
export function proximoPagamentoMensal(dia: number | null, hoje = new Date()): Date | null {
  if (!dia || dia < 1 || dia > 31) return null;
  const noMes = (ano: number, mes: number) =>
    new Date(ano, mes, Math.min(dia, new Date(ano, mes + 1, 0).getDate()));

  const desteMes = noMes(hoje.getFullYear(), hoje.getMonth());
  if (desteMes.getDate() >= hoje.getDate()) return desteMes;
  return noMes(hoje.getFullYear(), hoje.getMonth() + 1);
}

export function rotuloDiaSemana(dia: number | null): string | null {
  if (!dia || dia < 1 || dia > 7) return null;
  return DIAS_SEMANA[dia === 7 ? 0 : dia];
}
