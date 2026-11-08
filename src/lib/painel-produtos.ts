// ============================================================================
// ABA PRODUTOS do Painel (0194) — a regua pura da tela.
// O banco devolve os opcionais contratados pelos veiculos da base
// (`painel_produtos`); aqui mora o que a tela decide: rotulo da categoria,
// o top 5, a penetracao na base e a pilha "produto dentro do tipo".
// ============================================================================

export interface PainelProdutoItem {
  produto_id: string;
  nome: string;
  categoria: string;
  contratacoes: number;
  receita: number;
  sem_preco: number;
}
export interface PainelProdutoTipo {
  tipo: string;
  veiculos: number;
  com_opcional: number;
  contratacoes: number;
  receita: number;
}
export interface PainelProdutoMatriz { produto: string; tipo: string; contratacoes: number; receita: number }
export interface PainelProdutoCategoria { categoria: string; contratacoes: number; receita: number }

export interface PainelProdutos {
  gerado_em: string;
  regional_id: string | null;
  kpis: {
    veiculos_base: number;
    veiculos_com_opcional: number;
    contratacoes: number;
    receita_mensal: number;
    sem_preco: number;
    produtos_distintos: number;
  };
  por_tipo: PainelProdutoTipo[];
  produtos: PainelProdutoItem[];
  matriz: PainelProdutoMatriz[];
  categorias: PainelProdutoCategoria[];
}

export const ROTULO_OUTROS_PRODUTOS = 'Outros produtos';

const CATEGORIAS: Record<string, string> = {
  RCF: 'Proteção a terceiros',
  VIDROS: 'Vidros',
  BENEFICIO: 'Benefícios',
  RASTREADOR: 'Rastreamento',
  CASCO: 'Proteção do casco',
  ADMIN: 'Taxas',
  OUTROS: 'Outros',
};

/** Nome da categoria para quem lê o painel (o código cru nunca aparece). */
export function rotuloCategoria(categoria: string | null | undefined): string {
  const c = (categoria ?? '').trim().toUpperCase();
  if (!c) return 'Outros';
  return CATEGORIAS[c] ?? c.charAt(0) + c.slice(1).toLowerCase();
}

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Os N mais contratados (desempate pela receita, depois pelo nome). */
export function maisContratados(produtos: PainelProdutoItem[], n = 5): PainelProdutoItem[] {
  return [...produtos]
    .filter((p) => num(p.contratacoes) > 0)
    .sort((a, b) =>
      num(b.contratacoes) - num(a.contratacoes)
      || num(b.receita) - num(a.receita)
      || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, n);
}

/** Fração da base que tem o item; base zero = null (não inventa 0%). */
export function penetracao(parte: number, base: number): number | null {
  const b = num(base);
  if (b <= 0) return null;
  return Math.min(1, num(parte) / b);
}

/** Receita média por veículo que tem opcional (quem não tem não entra). */
export function receitaPorVeiculo(receita: number, veiculosComOpcional: number): number {
  const v = num(veiculosComOpcional);
  return v > 0 ? Math.round((num(receita) / v) * 100) / 100 : 0;
}

/**
 * Uma linha por tipo de veículo com as contratações dos produtos de `destaque`
 * em colunas próprias e o resto em "Outros produtos" — é a pilha do gráfico.
 * A ordem dos tipos é a recebida (o banco já ordena pela frota).
 */
export function pilhaPorTipo(
  tipos: PainelProdutoTipo[],
  matriz: PainelProdutoMatriz[],
  destaque: string[],
): Array<Record<string, number | string>> {
  const set = new Set(destaque);
  return tipos
    .filter((t) => num(t.contratacoes) > 0)
    .map((t) => {
      const linha: Record<string, number | string> = { tipo: t.tipo };
      for (const d of destaque) linha[d] = 0;
      linha[ROTULO_OUTROS_PRODUTOS] = 0;
      for (const m of matriz) {
        if (m.tipo !== t.tipo) continue;
        const chave = set.has(m.produto) ? m.produto : ROTULO_OUTROS_PRODUTOS;
        linha[chave] = num(linha[chave]) + num(m.contratacoes);
      }
      return linha;
    });
}

/** Agrupa categorias pelo rótulo (duas grafias da mesma categoria viram uma). */
export function categoriasRotuladas(categorias: PainelProdutoCategoria[]): Array<{ nome: string; receita: number; contratacoes: number }> {
  const mapa = new Map<string, { nome: string; receita: number; contratacoes: number }>();
  for (const c of categorias) {
    const nome = rotuloCategoria(c.categoria);
    const atual = mapa.get(nome) ?? { nome, receita: 0, contratacoes: 0 };
    atual.receita += num(c.receita);
    atual.contratacoes += num(c.contratacoes);
    mapa.set(nome, atual);
  }
  return [...mapa.values()].sort((a, b) => b.receita - a.receita || b.contratacoes - a.contratacoes);
}
