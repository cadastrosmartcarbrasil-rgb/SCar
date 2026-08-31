/**
 * Pagina publica de venda (hotlink) — regras puras.
 * Espelho leve do que a tela e as rotas `/api/v1/hotlink/*` fazem.
 */
import { validarDocumento } from '@/lib/documento';

export const ORDEM_ETAPAS = ['contato', 'veiculo', 'planos', 'aceite', 'fim'] as const;
export type EtapaVenda = (typeof ORDEM_ETAPAS)[number];

export interface TipoVeiculoPublico {
  id: string;
  nome: string;
}

export interface PlanoCotado {
  plano_id: string;
  nome: string;
  descricao: string | null;
  nivel: number | null;
  mensalidade: number;
  adesao: number;
  participacao: number;
  itens: { nome: string; valor: number }[];
}

/** Habilita o botao de cada passo. A trava de verdade esta no banco. */
export const podeAvancar = {
  contato(v: { nome: string; celular: string }): boolean {
    return v.nome.trim().length >= 3
      && v.celular.replace(/\D/g, '').length >= 10;
  },
  aceite(v: { nome: string; documento: string; marcado: boolean }): boolean {
    const doc = v.documento.replace(/\D/g, '');
    return v.marcado
      && v.nome.trim().includes(' ')
      && validarDocumento(doc, doc.length > 11 ? 'PJ' : 'PF');
  },
};

/**
 * Mensagem de erro para o visitante. Erro de banco nao vai cru para a tela do
 * cliente — mas o texto que a nossa RPC escreveu (em portugues, explicando a
 * regra) e justamente o que ele precisa ler.
 */
export function mensagemDeErro(bruto: unknown): string {
  const texto = typeof bruto === 'string' ? bruto.trim() : '';
  if (!texto) return 'Nao consegui concluir agora. Tente de novo em instantes.';
  const tecnico = /duplicate key|violates|null value|syntax|permission denied|relation |column /i;
  if (tecnico.test(texto)) return 'Nao consegui concluir agora. Tente de novo em instantes.';
  return texto;
}

/** Ordena os planos do mais simples ao mais completo (nivel, depois preco). */
export function ordenarPlanos(planos: PlanoCotado[]): PlanoCotado[] {
  return [...planos].sort((a, b) =>
    (a.nivel ?? 99) - (b.nivel ?? 99) || a.mensalidade - b.mensalidade);
}

/** O plano sugerido: o do meio, que e onde a maioria fecha. */
export function planoSugerido(planos: PlanoCotado[]): PlanoCotado | null {
  const ord = ordenarPlanos(planos);
  if (ord.length === 0) return null;
  return ord[Math.min(1, ord.length - 1)];
}
