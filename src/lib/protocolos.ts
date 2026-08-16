// Regras/rotulos da Central de Protocolos e dos disparos rapidos do SAC
// (WhatsApp/e-mail), em TypeScript puro — cobertos por testes.
import type {
  PrioridadeAtendimento,
  StatusAtendimento,
  TipoAtendimento,
  TipoInteracaoProtocolo,
} from '@/lib/database.types';

// ---------------------------------------------------------------------------
// Categorias, prioridade e status
// ---------------------------------------------------------------------------
/** Categorias oferecidas na abertura de protocolo (Central/SAC). */
export const CATEGORIAS_PROTOCOLO: { value: TipoAtendimento; label: string }[] = [
  { value: 'FINANCEIRO', label: 'Financeiro' },
  { value: 'SINISTRO', label: 'Sinistro / Evento' },
  { value: 'ASSISTENCIA_24H', label: 'Assistencia 24h' },
  { value: 'DUVIDAS', label: 'Duvidas' },
  { value: 'RECLAMACAO', label: 'Reclamacao' },
  { value: 'UPGRADE_COBERTURA', label: 'Upgrade / Cobertura' },
  { value: 'SEGUNDA_VIA_BOLETO', label: '2a via de boleto' },
  { value: 'VISTORIA_ACESSORIOS', label: 'Vistoria / Acessorios' },
  { value: 'ALTERACAO_CADASTRAL', label: 'Alteracao cadastral' },
  { value: 'CANCELAMENTO', label: 'Cancelamento' },
  { value: 'OUTROS', label: 'Outros' },
];

export const PRIORIDADES: { value: PrioridadeAtendimento; label: string; cor: string }[] = [
  { value: 'BAIXA', label: 'Baixa', cor: 'bg-slate-100 text-slate-600' },
  { value: 'NORMAL', label: 'Normal', cor: 'bg-sky-50 text-sky-700' },
  { value: 'ALTA', label: 'Alta', cor: 'bg-amber-50 text-amber-700' },
  { value: 'URGENTE', label: 'Urgente', cor: 'bg-rose-50 text-rose-700' },
];

export const STATUS_PROTOCOLO: Record<StatusAtendimento, { label: string; cor: string }> = {
  ABERTO: { label: 'Aberto', cor: 'bg-cyan-50 text-cyan-700' },
  EM_ANDAMENTO: { label: 'Em atendimento', cor: 'bg-amber-50 text-amber-700' },
  CONCLUIDO: { label: 'Concluido', cor: 'bg-emerald-50 text-emerald-700' },
  CANCELADO: { label: 'Cancelado', cor: 'bg-slate-100 text-slate-500' },
};

export const TIPO_INTERACAO_LABEL: Record<TipoInteracaoProtocolo, string> = {
  COMENTARIO: 'Comentario',
  STATUS: 'Mudanca de status',
  TRANSFERENCIA: 'Transferencia',
  ENCERRAMENTO: 'Encerramento',
};

export function rotuloCategoria(tipo: TipoAtendimento): string {
  return CATEGORIAS_PROTOCOLO.find((c) => c.value === tipo)?.label ?? tipo;
}

export function corPrioridade(p: PrioridadeAtendimento): string {
  return PRIORIDADES.find((x) => x.value === p)?.cor ?? 'bg-slate-100 text-slate-600';
}

/** Protocolo encerrado nao aceita interacao/transferencia (espelha o SQL). */
export function protocoloAberto(status: StatusAtendimento, encerradoEm?: string | null): boolean {
  return !encerradoEm && status !== 'CONCLUIDO' && status !== 'CANCELADO';
}

/** Destaque da fila: urgente, ou parado ha mais de 7 dias. */
export function precisaAtencao(p: { prioridade: PrioridadeAtendimento; dias_aberto: number; encerrado_em?: string | null }): boolean {
  if (p.encerrado_em) return false;
  return p.prioridade === 'URGENTE' || p.prioridade === 'ALTA' || p.dias_aberto > 7;
}

// ---------------------------------------------------------------------------
// Disparos rapidos (WhatsApp / e-mail) — VCards do SAC
// ---------------------------------------------------------------------------
/** Link wa.me com DDI 55 e texto opcional. Null se o numero for invalido. */
export function linkWhatsAppAssociado(telefone: string | null | undefined, texto?: string): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  const numero = digitos.startsWith('55') ? digitos : `55${digitos}`;
  return texto ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : `https://wa.me/${numero}`;
}

export interface DadosMensagem {
  associado: string;
  placa?: string | null;
  empresa?: string | null;
  atendente?: string | null;
}

/** Texto padrao de abordagem do SAC (WhatsApp). */
export function mensagemPadrao(d: DadosMensagem): string {
  const empresa = d.empresa ?? 'Smart Car Brasil';
  const primeiro = (d.associado ?? '').trim().split(/\s+/)[0] || 'associado';
  const veiculo = d.placa ? ` referente ao veiculo ${d.placa}` : '';
  return [
    `Ola, ${primeiro}! Aqui e ${d.atendente ?? 'a equipe'} da ${empresa}.`,
    `Estamos entrando em contato${veiculo}.`,
    'Podemos falar agora?',
  ].join(' ');
}

/** Assunto sugerido para o e-mail rapido. */
export function assuntoPadrao(d: DadosMensagem): string {
  const empresa = d.empresa ?? 'Smart Car Brasil';
  return d.placa ? `${empresa} — atendimento sobre o veiculo ${d.placa}` : `${empresa} — atendimento`;
}

/** mailto: com assunto e corpo preenchidos (fallback do envio rapido). */
export function linkEmail(email: string | null | undefined, assunto: string, corpo: string): string | null {
  if (!email || !email.includes('@')) return null;
  return `mailto:${email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

// ---------------------------------------------------------------------------
// Ajuste de boleto (VCard Historico Financeiro)
// ---------------------------------------------------------------------------
/** Valor final do titulo: sempre a partir do ORIGINAL (nao acumula ajustes). */
export function valorAjustado(original: number, desconto: number, acrescimo: number): number {
  const orig = Number(original) || 0;
  const desc = Math.max(0, Number(desconto) || 0);
  const acre = Math.max(0, Number(acrescimo) || 0);
  return Math.round((orig - desc + acre) * 100) / 100;
}

/** O boleto pode ser editado? (espelha ajustar_titulo) */
export function tituloEditavel(status: string): boolean {
  return status !== 'pago' && status !== 'cancelado';
}

/** Validação do ajuste antes de mandar ao banco. */
export function validarAjuste(original: number, desconto: number, acrescimo: number): string | null {
  if (desconto < 0 || acrescimo < 0) return 'Desconto e acrescimo nao podem ser negativos';
  if (desconto > (Number(original) || 0) + (Number(acrescimo) || 0)) {
    return 'Desconto maior que o valor do titulo';
  }
  return null;
}
