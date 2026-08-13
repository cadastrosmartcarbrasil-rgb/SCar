import type { StatusLead } from '@/lib/database.types';

// Esteira do CRM (ordem + rotulo + cor). PERDIDO fica fora da esteira linear.
export const ESTEIRA: StatusLead[] = [
  'NOVO', 'ORCAMENTO_GERADO', 'PROPOSTA_ENVIADA', 'APROVADO', 'EM_AUDITORIA', 'ATIVO',
];

export const STATUS_LEAD: Record<StatusLead, { label: string; cor: string; curto: string }> = {
  NOVO:             { label: 'Novo Lead',        curto: 'Novo',       cor: 'bg-slate-100 text-slate-700' },
  ORCAMENTO_GERADO: { label: 'Orcamento Gerado',  curto: 'Orcamento',  cor: 'bg-sky-100 text-sky-700' },
  PROPOSTA_ENVIADA: { label: 'Proposta Enviada',  curto: 'Proposta',   cor: 'bg-indigo-100 text-indigo-700' },
  APROVADO:         { label: 'Aprovado',          curto: 'Aprovado',   cor: 'bg-violet-100 text-violet-700' },
  EM_AUDITORIA:     { label: 'Em Auditoria',      curto: 'Auditoria',  cor: 'bg-amber-100 text-amber-800' },
  ATIVO:            { label: 'Ativo na Base',     curto: 'Ativo',      cor: 'bg-emerald-100 text-emerald-700' },
  PERDIDO:          { label: 'Perdido',           curto: 'Perdido',    cor: 'bg-rose-100 text-rose-700' },
};

export function proximoStatus(s: StatusLead): StatusLead | null {
  const i = ESTEIRA.indexOf(s);
  if (i < 0 || i >= ESTEIRA.length - 1) return null;
  // APROVADO -> o banco auto-avanca para EM_AUDITORIA (trava de auditoria)
  return ESTEIRA[i + 1];
}
