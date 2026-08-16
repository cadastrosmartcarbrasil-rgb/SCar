// Estrutura modular das opcoes de atendimento ligadas ao VEICULO selecionado.
// Fonte unica reutilizada pelo SAC interno e pelo Portal do Associado.
import {
  AlertTriangle, LifeBuoy, CreditCard, ClipboardCheck, Pencil, Wallet,
  MessageCircle, Mail, Ticket,
  type LucideIcon,
} from 'lucide-react';
import type { TipoAtendimento, StatusAtendimento, StatusEvento } from '@/lib/database.types';

// 'chamado'   abre um protocolo de atendimento (modal);
// 'boleto'    aciona o motor de faturas (2a via);
// 'evento'    redireciona para a abertura de EVENTO (sinistro);
// 'assistencia' leva ao painel da Assistencia 24h com o veiculo selecionado;
// 'editar'    abre o cadastro do veiculo (unifica os antigos Cadastro/Upgrade);
// 'financeiro' abre o historico de boletos (com edicao do que esta em aberto);
// 'whatsapp' / 'email' sao disparos rapidos ao associado.
export type ModoServico =
  | 'chamado' | 'boleto' | 'evento' | 'assistencia'
  | 'editar' | 'financeiro' | 'whatsapp' | 'email';

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
    icon: LifeBuoy, cor: 'bg-cyan-50 text-cyan-600', modo: 'assistencia',
    tipos: [{ value: 'ASSISTENCIA_24H', label: 'Assistencia 24h' }],
    subtipos: ['Guincho', 'Chaveiro', 'Mecanico', 'Pane seca', 'Troca de pneu', 'Transporte'],
  },
  {
    // Unifica os antigos "Cadastro" e "Upgrade": os dois levavam ao mesmo lugar.
    id: 'editar', titulo: 'Editar Veiculo/Item', descricao: 'Cadastro, plano, opcionais e cobertura',
    icon: Pencil, cor: 'bg-brand-50 text-brand-600', modo: 'editar',
    tipos: [{ value: 'ALTERACAO_CADASTRAL', label: 'Alteracao cadastral' }],
  },
  {
    id: 'financeiro', titulo: 'Historico Financeiro', descricao: 'Boletos, vencimento, desconto e 2a via',
    icon: Wallet, cor: 'bg-emerald-50 text-emerald-600', modo: 'financeiro',
    tipos: [{ value: 'FINANCEIRO', label: 'Financeiro' }],
  },
  {
    id: 'whatsapp', titulo: 'Enviar WhatsApp', descricao: 'Mensagem direta ao associado',
    icon: MessageCircle, cor: 'bg-emerald-50 text-emerald-600', modo: 'whatsapp',
    tipos: [{ value: 'OUTROS', label: 'Contato' }],
  },
  {
    id: 'email', titulo: 'Enviar E-mail', descricao: 'Mensagem por e-mail ao associado',
    icon: Mail, cor: 'bg-sky-50 text-sky-600', modo: 'email',
    tipos: [{ value: 'OUTROS', label: 'Contato' }],
  },
  {
    id: 'protocolo', titulo: 'Abrir Protocolo', descricao: 'Duvidas, reclamacao, financeiro...',
    icon: Ticket, cor: 'bg-violet-50 text-violet-600', modo: 'chamado',
    tipos: [
      { value: 'DUVIDAS', label: 'Duvidas' },
      { value: 'RECLAMACAO', label: 'Reclamacao' },
      { value: 'FINANCEIRO', label: 'Financeiro' },
      { value: 'OUTROS', label: 'Outros' },
    ],
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
    id: 'cancelamento', titulo: 'Cancelamento', descricao: 'Solicitacao de cancelamento do item',
    icon: ClipboardCheck, cor: 'bg-slate-100 text-slate-600', modo: 'chamado',
    tipos: [{ value: 'CANCELAMENTO', label: 'Cancelamento' }],
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
