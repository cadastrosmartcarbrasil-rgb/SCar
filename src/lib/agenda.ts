// ============================================================================
// Agenda de vendas — regras puras (espelho do 0045), sem React/Supabase.
//
// Duas perguntas que o vendedor faz o dia inteiro:
//   "quem eu tenho que chamar agora?"  -> situacaoAgenda / ordenarAgenda
//   "que lead esta esfriando?"         -> diasParado / riscoDevolucao
//
// A contagem e por DIA DE CALENDARIO, nao por 24h: quem foi contatado ontem as
// 23h esta parado ha 1 dia, e nao ha 0. E como o banco conta (`current_date`)
// e como a pessoa conta.
// ============================================================================

import type { ResultadoInteracaoLead, TipoInteracaoLead } from '@/lib/database.types';

export const TIPO_INTERACAO: Record<TipoInteracaoLead, { label: string; curto: string }> = {
  LIGACAO:    { label: 'Ligacao',     curto: 'Ligou' },
  WHATSAPP:   { label: 'WhatsApp',    curto: 'WhatsApp' },
  EMAIL:      { label: 'E-mail',      curto: 'E-mail' },
  VISITA:     { label: 'Visita',      curto: 'Visita' },
  OBSERVACAO: { label: 'Observacao',  curto: 'Nota' },
};

export const RESULTADO_INTERACAO: Record<ResultadoInteracaoLead, { label: string; cor: string }> = {
  FALOU:        { label: 'Falou com o cliente', cor: 'bg-emerald-100 text-emerald-700' },
  NAO_ATENDEU:  { label: 'Nao atendeu',         cor: 'bg-slate-100 text-slate-600' },
  AGENDOU:      { label: 'Retorno agendado',    cor: 'bg-cyan-100 text-cyan-700' },
  SEM_INTERESSE:{ label: 'Sem interesse',       cor: 'bg-rose-100 text-rose-700' },
};

/** Meia-noite local do dia da data informada. */
function inicioDoDia(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const DIA = 86_400_000;

/** Quantos dias de calendario separam as duas datas (negativo = no futuro). */
export function diasEntre(de: string | Date | null | undefined, ate: Date = new Date()): number | null {
  if (!de) return null;
  const d = de instanceof Date ? de : new Date(de);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((inicioDoDia(ate) - inicioDoDia(d)) / DIA);
}

/**
 * Ha quantos dias o lead nao e trabalhado. Conta a ULTIMA INTERACAO (ou, na
 * falta dela, a criacao) — mexer no cadastro nao e trabalhar o lead.
 */
export function diasParado(
  ultimaInteracaoEm: string | null | undefined,
  criadoEm: string | null | undefined,
  agora: Date = new Date(),
): number {
  return Math.max(0, diasEntre(ultimaInteracaoEm ?? criadoEm, agora) ?? 0);
}

export function rotuloParado(dias: number): string {
  if (dias <= 0) return 'trabalhado hoje';
  if (dias === 1) return 'parado ha 1 dia';
  return `parado ha ${dias} dias`;
}

/**
 * O lead esta perto de voltar ao pool da unidade (regra `dias_sem_contato_lead`
 * do 0041). Limite 0 = a franquia desligou a devolucao automatica.
 */
export function riscoDevolucao(dias: number, limiteSemContato: number): boolean {
  return limiteSemContato > 0 && dias >= limiteSemContato;
}

export type SituacaoAgenda = 'ATRASADO' | 'HOJE' | 'AGENDADO' | 'SEM_AGENDA';

export function situacaoAgenda(
  proximoContatoEm: string | null | undefined,
  agora: Date = new Date(),
): SituacaoAgenda {
  const dias = diasEntre(proximoContatoEm, agora);
  if (dias === null) return 'SEM_AGENDA';
  if (dias > 0) return 'ATRASADO';
  if (dias === 0) return 'HOJE';
  return 'AGENDADO';
}

export const SELO_AGENDA: Record<Exclude<SituacaoAgenda, 'SEM_AGENDA'>, { curto: string; cor: string }> = {
  ATRASADO:  { curto: 'Atrasado', cor: 'bg-rose-100 text-rose-700' },
  HOJE:      { curto: 'Hoje',     cor: 'bg-amber-100 text-amber-800' },
  AGENDADO:  { curto: 'Agendado', cor: 'bg-cyan-100 text-cyan-700' },
};

/** Texto curto do retorno combinado, do jeito que se fala. */
export function rotuloRetorno(
  proximoContatoEm: string | null | undefined,
  agora: Date = new Date(),
): string | null {
  const dias = diasEntre(proximoContatoEm, agora);
  if (dias === null) return null;
  const hora = new Date(proximoContatoEm as string)
    .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (dias > 1) return `atrasado ha ${dias} dias`;
  if (dias === 1) return 'atrasado desde ontem';
  if (dias === 0) return `hoje as ${hora}`;
  if (dias === -1) return `amanha as ${hora}`;
  return new Date(proximoContatoEm as string)
    .toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ---------------------------------------------------------------------------
// A lista de trabalho
// ---------------------------------------------------------------------------
export interface ItemAgenda {
  id: string;
  proximo_contato_em: string | null;
}

/** Mais atrasado primeiro: quem esperou mais e chamado antes. */
export function ordenarAgenda<T extends ItemAgenda>(itens: T[]): T[] {
  return [...itens].sort((a, b) => {
    const ta = a.proximo_contato_em ? new Date(a.proximo_contato_em).getTime() : Infinity;
    const tb = b.proximo_contato_em ? new Date(b.proximo_contato_em).getTime() : Infinity;
    return ta - tb;
  });
}

export function resumoAgenda<T extends ItemAgenda>(
  itens: T[],
  agora: Date = new Date(),
): { atrasados: number; hoje: number; total: number } {
  let atrasados = 0;
  let hoje = 0;
  itens.forEach((i) => {
    const s = situacaoAgenda(i.proximo_contato_em, agora);
    if (s === 'ATRASADO') atrasados += 1;
    if (s === 'HOJE') hoje += 1;
  });
  return { atrasados, hoje, total: itens.length };
}

/**
 * Valor inicial do campo "proximo retorno" no formulario (input
 * datetime-local, que trabalha em hora LOCAL e sem fuso no texto).
 */
export function sugestaoRetorno(dias: number, agora: Date = new Date()): string {
  const d = new Date(agora.getTime() + dias * DIA);
  d.setHours(9, 0, 0, 0);
  // Se o horario sugerido ja passou (agendar "hoje as 9h" as 15h), joga para
  // daqui a uma hora, arredondado.
  if (d.getTime() <= agora.getTime()) {
    d.setTime(agora.getTime() + 3600_000);
    d.setMinutes(0, 0, 0);
  }
  return paraDatetimeLocal(d);
}

export function paraDatetimeLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
