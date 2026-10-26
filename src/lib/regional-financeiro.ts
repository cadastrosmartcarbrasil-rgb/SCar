/**
 * Financeiro da franquia — regras puras.
 *
 * O financeiro da unidade e deliberadamente COMPACTO: a operacao (mensalidade,
 * evento, assistencia, fornecedor) e toda da matriz. A franquia so precisa de
 * duas contas: a comissao que ela tem a RECEBER da matriz e a comissao que ela
 * tem a PAGAR aos seus vendedores.
 *
 * Por isso a unidade nao escolhe plano de contas, nem centro de custo, nem
 * conta bancaria: o movimento ja carrega a classificacao (o banco resolve em
 * `regional_categoria_movimento`) e a baixa registra a FORMA do pagamento.
 * Espelho de `supabase/migrations/0037_financeiro_regional.sql`.
 */

export type MovimentoRegional = 'COMISSAO_RECEBER' | 'COMISSAO_PAGAR';

export interface DefinicaoMovimento {
  chave: MovimentoRegional;
  rotulo: string;
  /** Sinal no caixa da unidade. */
  tipo: 'RECEITA' | 'DESPESA';
  /** Codigo no plano de contas da matriz (resolvido pelo banco). */
  categoria: string;
  categoriaNome: string;
  ajuda: string;
  /** So o repasse tem favorecido. */
  pedeVendedor: boolean;
}

export const MOVIMENTOS_REGIONAIS: DefinicaoMovimento[] = [
  {
    chave: 'COMISSAO_RECEBER',
    rotulo: 'Comissão a receber da matriz',
    tipo: 'RECEITA',
    categoria: '3.1.1.06',
    categoriaNome: 'Comissão de Franquia (Repasse da Matriz)',
    ajuda: 'O que a matriz deve a sua unidade pela carteira do período.',
    pedeVendedor: false,
  },
  {
    chave: 'COMISSAO_PAGAR',
    rotulo: 'Comissão a pagar ao vendedor',
    tipo: 'DESPESA',
    categoria: '4.1.2.01',
    categoriaNome: 'Comissões Diretas sobre Vendas',
    ajuda: 'O repasse da sua unidade para um vendedor da equipe.',
    pedeVendedor: true,
  },
];

export function movimentoRegional(chave: string): DefinicaoMovimento | null {
  return MOVIMENTOS_REGIONAIS.find((m) => m.chave === chave) ?? null;
}

export type SituacaoRegional = 'aberto' | 'parcial' | 'vencido' | 'quitado' | 'cancelado';

export const SITUACOES_REGIONAIS: { chave: SituacaoRegional; rotulo: string }[] = [
  { chave: 'aberto', rotulo: 'Em aberto' },
  { chave: 'parcial', rotulo: 'Baixa parcial' },
  { chave: 'vencido', rotulo: 'Vencido' },
  { chave: 'quitado', rotulo: 'Quitado' },
  { chave: 'cancelado', rotulo: 'Cancelado' },
];

/** Formas de pagamento oferecidas na baixa da unidade (enum `forma_pagamento`). */
export const FORMAS_PAGAMENTO = ['PIX', 'TRANSFERENCIA', 'BOLETO', 'CARTAO', 'DINHEIRO'] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  PIX: 'PIX',
  TRANSFERENCIA: 'Transferência',
  BOLETO: 'Boleto',
  CARTAO: 'Cartão',
  DINHEIRO: 'Dinheiro',
};

export interface TituloRegional {
  tipo: string;
  situacao: string;
  valor_saldo: number | string;
}

/**
 * Totais da fila em tela. O resumo do banco cobre a unidade inteira; este aqui
 * soma exatamente o que o gestor esta vendo depois dos filtros.
 */
export function totaisDaFila(titulos: TituloRegional[]): {
  receber: number; pagar: number; vencidoReceber: number; vencidoPagar: number; saldo: number;
} {
  const vivo = (t: TituloRegional) => t.situacao !== 'quitado' && t.situacao !== 'cancelado';
  const soma = (f: (t: TituloRegional) => boolean) =>
    titulos.filter(f).reduce((acc, t) => acc + Number(t.valor_saldo ?? 0), 0);

  const receber = soma((t) => vivo(t) && t.tipo === 'RECEITA');
  const pagar = soma((t) => vivo(t) && t.tipo === 'DESPESA');
  return {
    receber,
    pagar,
    vencidoReceber: soma((t) => t.situacao === 'vencido' && t.tipo === 'RECEITA'),
    vencidoPagar: soma((t) => t.situacao === 'vencido' && t.tipo === 'DESPESA'),
    saldo: receber - pagar,
  };
}

/** Validacao do lancamento antes de bater no banco (mesma regra do SQL). */
export function validarLancamentoRegional(v: {
  tipo?: string | null;
  descricao?: string | null;
  valor?: number | null;
  vencimento?: string | null;
  vendedorId?: string | null;
}): string | null {
  const mov = movimentoRegional(v.tipo ?? '');
  if (!mov) return 'Escolha o tipo do lançamento';
  if (!v.descricao?.trim()) return 'Descreva o lançamento';
  if (!v.valor || v.valor <= 0) return 'Informe um valor maior que zero';
  if (!v.vencimento) return 'Informe o vencimento';
  if (mov.pedeVendedor && !v.vendedorId) return 'Escolha o vendedor que vai receber o repasse';
  return null;
}
