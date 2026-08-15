import type { CotacaoItem, StatusKanban, StatusLead } from '@/lib/database.types';

// Esteira do CRM (ordem + rotulo + cor). PERDIDO fica fora da esteira linear.
export const ESTEIRA: StatusLead[] = [
  'NOVO', 'ORCAMENTO_GERADO', 'PROPOSTA_ENVIADA', 'EM_NEGOCIACAO', 'APROVADO', 'EM_AUDITORIA', 'ATIVO',
];

export const STATUS_LEAD: Record<StatusLead, { label: string; cor: string; curto: string }> = {
  NOVO:             { label: 'Novo Lead',        curto: 'Novo',       cor: 'bg-slate-100 text-slate-700' },
  ORCAMENTO_GERADO: { label: 'Cotacao Criada',   curto: 'Cotacao',    cor: 'bg-sky-100 text-sky-700' },
  PROPOSTA_ENVIADA: { label: 'Proposta Enviada', curto: 'Proposta',   cor: 'bg-indigo-100 text-indigo-700' },
  EM_NEGOCIACAO:    { label: 'Em Negociacao',    curto: 'Negociacao', cor: 'bg-cyan-100 text-cyan-700' },
  APROVADO:         { label: 'Aprovado',         curto: 'Aprovado',   cor: 'bg-violet-100 text-violet-700' },
  EM_AUDITORIA:     { label: 'Em Auditoria',     curto: 'Auditoria',  cor: 'bg-amber-100 text-amber-800' },
  ATIVO:            { label: 'Ativo na Base',    curto: 'Ativo',      cor: 'bg-emerald-100 text-emerald-700' },
  PERDIDO:          { label: 'Perdido',          curto: 'Perdido',    cor: 'bg-rose-100 text-rose-700' },
};

export function proximoStatus(s: StatusLead): StatusLead | null {
  const i = ESTEIRA.indexOf(s);
  if (i < 0 || i >= ESTEIRA.length - 1) return null;
  // APROVADO -> o banco auto-avanca para EM_AUDITORIA (trava de auditoria)
  return ESTEIRA[i + 1];
}

// ---------------------------------------------------------------------------
// Kanban do funil (0028)
// ---------------------------------------------------------------------------
export interface ColunaKanban {
  id: StatusKanban;
  titulo: string;
  descricao: string;
  /** Status que caem nesta coluna (Aprovado agrega o que ja foi para auditoria). */
  aceita: StatusLead[];
  cor: string;
}

export const COLUNAS_KANBAN: ColunaKanban[] = [
  { id: 'NOVO', titulo: 'Novo Lead', descricao: 'Contato recebido', aceita: ['NOVO'], cor: 'border-slate-300' },
  { id: 'ORCAMENTO_GERADO', titulo: 'Cotacao Criada', descricao: 'Orcamento montado', aceita: ['ORCAMENTO_GERADO'], cor: 'border-sky-300' },
  { id: 'PROPOSTA_ENVIADA', titulo: 'Proposta Enviada', descricao: 'Link enviado ao cliente', aceita: ['PROPOSTA_ENVIADA'], cor: 'border-indigo-300' },
  { id: 'EM_NEGOCIACAO', titulo: 'Em Negociacao', descricao: 'Ajustando valores/itens', aceita: ['EM_NEGOCIACAO'], cor: 'border-cyan-300' },
  { id: 'APROVADO', titulo: 'Aprovado (Auditoria)', descricao: 'Enviado para auditoria', aceita: ['APROVADO', 'EM_AUDITORIA', 'ATIVO'], cor: 'border-violet-300' },
  { id: 'PERDIDO', titulo: 'Perdido', descricao: 'Negociacao encerrada', aceita: ['PERDIDO'], cor: 'border-rose-300' },
];

/** Em qual coluna o lead aparece. */
export function colunaDoLead(status: StatusLead): StatusKanban {
  return COLUNAS_KANBAN.find((c) => c.aceita.includes(status))?.id ?? 'NOVO';
}

/** O card pode ser arrastado? (auditoria/ativo saem do controle do vendedor) */
export function podeArrastar(status: StatusLead): boolean {
  return status !== 'EM_AUDITORIA' && status !== 'ATIVO';
}

/** Regras do drop — espelham `mover_lead_status` no banco. */
export function podeSoltarEm(status: StatusLead, destino: StatusKanban): boolean {
  if (!podeArrastar(status)) return false;
  return colunaDoLead(status) !== destino;
}

/** O drop em "Perdido" exige motivo. */
export function exigeMotivo(destino: StatusKanban): boolean {
  return destino === 'PERDIDO';
}

// ---------------------------------------------------------------------------
// Edicao da cotacao: itens obrigatorios x opcionais (0028)
// ---------------------------------------------------------------------------
/** O lead ainda esta na fase de venda? Depois da auditoria a cotacao congela. */
export function podeEditarCotacao(status: StatusLead): boolean {
  return status !== 'APROVADO' && status !== 'EM_AUDITORIA' && status !== 'ATIVO';
}

/** Ids dos produtos que NAO podem ser desmarcados (base + itens do plano). */
export function idsObrigatorios(itens: CotacaoItem[]): string[] {
  return itens.filter((i) => i.obrigatorio && i.produto_id).map((i) => i.produto_id as string);
}

/** Bloqueia a remocao de obrigatorios: eles voltam sempre para a selecao. */
export function selecaoValida(selecionados: string[], obrigatorios: string[]): string[] {
  return Array.from(new Set([...obrigatorios, ...selecionados]));
}

/** A selecao removeria algum item obrigatorio? (validacao antes de salvar) */
export function removeuObrigatorio(selecionados: string[], obrigatorios: string[]): boolean {
  return obrigatorios.some((o) => !selecionados.includes(o));
}

// ---------------------------------------------------------------------------
// Politica de desconto por regional/franquia (0028)
// ---------------------------------------------------------------------------
export interface ResultadoDesconto {
  percentual: number;
  limite: number;
  dentroDoLimite: boolean;
  exigeAprovacao: boolean;
  mensalidadeFinal: number;
  adesaoFinal: number;
  descontoMensalidade: number;
  descontoAdesao: number;
}

/** Espelha `fn_cotacao_valida_desconto` / `simular_desconto_cotacao`. */
export function calcularDesconto(
  mensalidade: number,
  adesao: number,
  percentual: number,
  limiteRegional: number,
): ResultadoDesconto {
  const pct = Math.max(0, Math.min(100, Number(percentual) || 0));
  const round = (v: number) => Math.round(v * 100) / 100;
  const descMensal = round((Number(mensalidade) || 0) * (pct / 100));
  const descAdesao = round((Number(adesao) || 0) * (pct / 100));
  return {
    percentual: pct,
    limite: Number(limiteRegional) || 0,
    dentroDoLimite: pct <= (Number(limiteRegional) || 0),
    exigeAprovacao: pct > (Number(limiteRegional) || 0),
    mensalidadeFinal: round((Number(mensalidade) || 0) - descMensal),
    adesaoFinal: round((Number(adesao) || 0) - descAdesao),
    descontoMensalidade: descMensal,
    descontoAdesao: descAdesao,
  };
}
