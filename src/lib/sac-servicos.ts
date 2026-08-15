// Estrutura modular das opcoes de atendimento ligadas ao VEICULO selecionado.
// Fonte unica reutilizada pelo SAC interno e pelo Portal do Associado.
import {
  AlertTriangle, LifeBuoy, ArrowUpCircle, CreditCard, ClipboardCheck, UserCog,
  type LucideIcon,
} from 'lucide-react';
import type { TipoAtendimento, StatusAtendimento, StatusEvento } from '@/lib/database.types';

// 'chamado' abre um atendimento (modal); 'boleto' aciona o motor de faturas;
// 'evento' redireciona direto para a abertura de EVENTO (sinistro).
export type ModoServico = 'chamado' | 'boleto' | 'evento';

export interface ServicoSac {
  id: string;
  titulo: string;
  descricao: string;
  icon: LucideIcon;
  cor: string; // classes do chip do icone
  modo: ModoServico;
  tipos: { value: TipoAtendimento; label: string }[]; // tipo(s) de atendimento
  subtipos?: string[]; // opcoes internas (vao em dados.subtipo)
  linkSinistro?: boolean; // oferece atalho para o fluxo completo de sinistro
}

export const SERVICOS_SAC: ServicoSac[] = [
  {
    id: 'evento', titulo: 'Evento (Sinistro)', descricao: 'Abrir evento — vai direto para o registro completo',
    icon: AlertTriangle, cor: 'bg-rose-50 text-rose-600', modo: 'evento',
    tipos: [{ value: 'SINISTRO', label: 'Evento' }],
  },
  {
    id: 'assistencia', titulo: 'Assistencia 24h', descricao: 'Guincho, chaveiro, mecanico, pane seca...',
    icon: LifeBuoy, cor: 'bg-cyan-50 text-cyan-600', modo: 'chamado',
    tipos: [{ value: 'ASSISTENCIA_24H', label: 'Assistencia 24h' }],
    subtipos: ['Guincho', 'Chaveiro', 'Mecanico', 'Pane seca', 'Troca de pneu', 'Transporte'],
  },
  {
    id: 'upgrade', titulo: 'Upgrade / Cobertura', descricao: 'Alteracao de categoria ou cobertura',
    icon: ArrowUpCircle, cor: 'bg-brand-50 text-brand-600', modo: 'chamado',
    tipos: [{ value: 'UPGRADE_COBERTURA', label: 'Upgrade / Cobertura' }],
  },
  {
    id: 'boleto', titulo: '2a via de Boleto', descricao: 'Boleto ou comprovante de pagamento',
    icon: CreditCard, cor: 'bg-emerald-50 text-emerald-600', modo: 'boleto',
    tipos: [{ value: 'SEGUNDA_VIA_BOLETO', label: '2a via de Boleto' }],
  },
  {
    id: 'vistoria', titulo: 'Vistoria / Acessorios', descricao: 'Solicitar vistoria ou incluir acessorios',
    icon: ClipboardCheck, cor: 'bg-amber-50 text-amber-600', modo: 'chamado',
    tipos: [{ value: 'VISTORIA_ACESSORIOS', label: 'Vistoria / Acessorios' }],
    subtipos: ['Vistoria', 'Inclusao de acessorio'],
  },
  {
    id: 'cadastro', titulo: 'Cadastro / Cancelamento', descricao: 'Alteracao cadastral ou cancelamento',
    icon: UserCog, cor: 'bg-slate-100 text-slate-600', modo: 'chamado',
    tipos: [
      { value: 'ALTERACAO_CADASTRAL', label: 'Alteracao cadastral' },
      { value: 'CANCELAMENTO', label: 'Cancelamento' },
    ],
  },
];

export const STATUS_ATENDIMENTO_LABEL: Record<StatusAtendimento, { label: string; cor: string }> = {
  ABERTO: { label: 'Aberto', cor: 'bg-cyan-50 text-cyan-700' },
  EM_ANDAMENTO: { label: 'Em andamento', cor: 'bg-amber-50 text-amber-700' },
  CONCLUIDO: { label: 'Concluido', cor: 'bg-emerald-50 text-emerald-700' },
  CANCELADO: { label: 'Cancelado', cor: 'bg-slate-100 text-slate-600' },
};

export const STATUS_EVENTO_LABEL: Record<StatusEvento, { label: string; cor: string }> = {
  ABERTO: { label: 'Aberto', cor: 'bg-cyan-50 text-cyan-700' },
  EM_ANALISE: { label: 'Em analise', cor: 'bg-amber-50 text-amber-700' },
  COTACAO_PECAS: { label: 'Cotacao de pecas', cor: 'bg-amber-50 text-amber-700' },
  REPARO: { label: 'Em reparo', cor: 'bg-brand-50 text-brand-700' },
  CONCLUIDO: { label: 'Concluido', cor: 'bg-emerald-50 text-emerald-700' },
  NEGADO: { label: 'Negado', cor: 'bg-rose-50 text-rose-700' },
};
