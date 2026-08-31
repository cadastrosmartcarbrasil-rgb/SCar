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

// ---------------------------------------------------------------------------
// Identificacao do veiculo: quem manda e a PLACA
// ---------------------------------------------------------------------------
/**
 * O tipo do veiculo sai dos dados coletados, nao de uma escolha previa.
 *
 * A consulta da placa devolve o registro bruto da FIPE; procuramos ali um
 * indicador de tipo (o campo varia conforme o endpoint) e, so quando nao ha
 * nenhum, caimos em Passeio — que e a esmagadora maioria. O visitante sempre
 * pode corrigir na tela: isto e um palpite informado, nao uma decisao travada.
 */
export function inferirTipoFipe(bruto: Record<string, unknown> | null | undefined): 'CARRO' | 'MOTO' | 'CAMINHAO' {
  const texto = Object.entries(bruto ?? {})
    .filter(([k]) => /tipo|segmento|categoria|veiculo/i.test(k))
    .map(([, v]) => String(v ?? ''))
    .join(' ')
    .toLowerCase();

  if (/moto|motocicl|ciclomotor|scooter|\b2\b/.test(texto)) return 'MOTO';
  if (/caminh|truck|carreta|onibus|\b3\b/.test(texto)) return 'CAMINHAO';
  return 'CARRO';
}

/** Casa o tipo da FIPE com o cadastro de `tipos_veiculo` da associacao. */
export function tipoVeiculoSugerido(
  bruto: Record<string, unknown> | null | undefined,
  tipos: TipoVeiculoPublico[],
): string | null {
  if (tipos.length === 0) return null;
  const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const acha = (re: RegExp) => tipos.find((t) => re.test(sem(t.nome)))?.id ?? null;

  switch (inferirTipoFipe(bruto)) {
    case 'MOTO':
      return acha(/moto/) ?? tipos[0].id;
    case 'CAMINHAO':
      return acha(/caminhao|pesado/) ?? acha(/utilitario/) ?? tipos[0].id;
    default:
      return acha(/passeio/) ?? tipos[0].id;
  }
}

/** A placa esta completa o bastante para consultar? (ABC1234 ou ABC1D23) */
export function placaCompleta(placa: string): boolean {
  const p = (placa ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/.test(p);
}
