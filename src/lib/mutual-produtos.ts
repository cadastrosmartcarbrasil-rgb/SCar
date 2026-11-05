// =====================================================================
// De-para dos PRODUTOS do Mutual -> opcionais do SCar (0184).
//
// Politica (decisao do usuario, 05/11/2026): o migrado fica no plano ESSENCIAL
// do tipo, e o que ele contratou no Mutual vira OPCIONAL contratado. Muitos
// produtos do Mutual sao a propria BASE do plano (taxa adm, 24h, chaveiro,
// casco) e nao viram opcional. Aqui so mora a SUGESTAO de base e os totais —
// quem decide e quem grava e o banco (`mutual_definir_produto`).
// =====================================================================
import type { MutualProdutoExterno } from '@/lib/database.types';

export type AcaoProdutoMutual = 'OPCIONAL' | 'BASE' | 'IGNORAR';

export const ROTULO_ACAO_PRODUTO: Record<AcaoProdutoMutual, string> = {
  OPCIONAL: 'Opcional do SCar',
  BASE: 'Faz parte da base do plano',
  IGNORAR: 'Ignorar',
};

function normalizar(nome: string): string {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/MIG$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trechos que, no nome do Mutual, indicam item da base do plano essencial. */
const TRECHOS_BASE = [
  'TAXA ADM',
  'ASSISTENCIA 24',
  'ASSIST 24',
  'GUINCHO',
  'CHAVEIRO',
  'PANE SECA',
  'SOCORRO ELETRIC',
  'HOSPEDAGEM',
  'RETORNO AO DOMICILIO',
  'TROCA DE PNEU',
  'ROUBO/ FURTO',
  'ROUBO, FURTO',
  'PERDA TOTAL',
];

/** Trechos de produto que NAO entram como opcional (tem tratamento proprio). */
const TRECHOS_IGNORAR = ['ASSISTENCIA PROFISSIONAL'];

/**
 * A sugestao para um produto ainda sem de-para. `null` = sem sugestao (a pessoa
 * decide). Nunca sugere OPCIONAL: qual opcional do SCar corresponde e decisao.
 */
export function sugestaoDestinoProduto(nome: string | null | undefined): AcaoProdutoMutual | null {
  if (!nome) return null;
  const n = normalizar(nome);
  if (TRECHOS_IGNORAR.some((t) => n.includes(t))) return 'IGNORAR';
  if (TRECHOS_BASE.some((t) => n.includes(t))) return 'BASE';
  return null;
}

export type TotaisDeParaProdutos = {
  produtos: number;
  semDePara: number;
  opcionais: number;
  base: number;
  ignorados: number;
  /** Veiculos na base viva cobertos por produtos que ja tem de-para (soma por produto). */
  itensNaBaseResolvidos: number;
  itensNaBase: number;
};

export function totaisDeParaProdutos(linhas: MutualProdutoExterno[]): TotaisDeParaProdutos {
  const t: TotaisDeParaProdutos = {
    produtos: linhas.length, semDePara: 0, opcionais: 0, base: 0, ignorados: 0,
    itensNaBaseResolvidos: 0, itensNaBase: 0,
  };
  for (const l of linhas) {
    const peso = Number(l.veiculos_na_base ?? 0);
    t.itensNaBase += peso;
    if (!l.acao) { t.semDePara += 1; continue; }
    t.itensNaBaseResolvidos += peso;
    if (l.acao === 'OPCIONAL') t.opcionais += 1;
    else if (l.acao === 'BASE') t.base += 1;
    else t.ignorados += 1;
  }
  return t;
}

/** Valor do seletor da tela: 'BASE' | 'IGNORAR' | 'OPCIONAL:<produto_id>' | ''. */
export function valorDoDestino(l: Pick<MutualProdutoExterno, 'acao' | 'produto_id'>): string {
  if (!l.acao) return '';
  return l.acao === 'OPCIONAL' ? `OPCIONAL:${l.produto_id}` : l.acao;
}

export function lerDestino(valor: string): { acao: AcaoProdutoMutual | null; produtoId: string | null } {
  if (!valor) return { acao: null, produtoId: null };
  if (valor.startsWith('OPCIONAL:')) return { acao: 'OPCIONAL', produtoId: valor.slice('OPCIONAL:'.length) || null };
  if (valor === 'BASE' || valor === 'IGNORAR') return { acao: valor, produtoId: null };
  return { acao: null, produtoId: null };
}
