// Labels e metadados de apresentacao dos enums do dominio.
import type { StatusEvento, TipoEvento, StatusTitulo, StatusVeiculo } from '@/lib/database.types';

// Colunas do Kanban de sinistros, na ordem do pipeline.
export const PIPELINE_SINISTRO: { status: StatusEvento; titulo: string; cor: string }[] = [
  { status: 'ABERTO', titulo: 'Aberto', cor: 'bg-sky-100 text-sky-800 border-sky-200' },
  { status: 'EM_ANALISE', titulo: 'Em Analise', cor: 'bg-amber-100 text-amber-800 border-amber-200' },
  { status: 'COTACAO_PECAS', titulo: 'Cotacao de Pecas', cor: 'bg-violet-100 text-violet-800 border-violet-200' },
  { status: 'REPARO', titulo: 'Em Reparo', cor: 'bg-blue-100 text-blue-800 border-blue-200' },
  { status: 'CONCLUIDO', titulo: 'Concluido', cor: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { status: 'NEGADO', titulo: 'Negado', cor: 'bg-rose-100 text-rose-800 border-rose-200' },
];

export const TIPO_EVENTO_LABEL: Record<TipoEvento, string> = {
  ROUBO: 'Roubo',
  FURTO: 'Furto',
  COLISAO: 'Colisao',
  TERCEIROS: 'Danos a Terceiros',
  GUINCHO: 'Guincho / Assistencia',
};

export const STATUS_TITULO_LABEL: Record<StatusTitulo, { label: string; cor: string }> = {
  pendente: { label: 'Pendente', cor: 'text-amber-700 bg-amber-50' },
  pago: { label: 'Pago', cor: 'text-emerald-700 bg-emerald-50' },
  cancelado: { label: 'Cancelado', cor: 'text-slate-600 bg-slate-100' },
  vencido: { label: 'Vencido', cor: 'text-rose-700 bg-rose-50' },
};

export const STATUS_VEICULO_LABEL: Record<StatusVeiculo, string> = {
  ativo: 'Ativo',
  suspenso: 'Suspenso',
  baixado: 'Baixado',
  inativo: 'Inativo',
  excluido: 'Excluido',
};
