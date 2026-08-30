// ============================================================================
// Regras puras da rota de venda (espelho do 0034) — sem React/Supabase.
//   - teto de comissao: regional (franquia) -> vendedor
//   - agrupamento do checklist de entrada na base
//   - rateio da adesao entre associacao e vendedor
// ============================================================================

import { arredondarMoeda } from './money';

/** Arredonda uma FRACAO de comissao em 4 casas — o mesmo numeric(6,4) do banco.
 *  (arredondarMoeda tem 2 casas e transformaria 15,5% em 16%.) */
const fracao4 = (v: number) => Math.round((v + Number.EPSILON) * 1e4) / 1e4;

// ---------------------------------------------------------------------------
// Comissao em dois niveis
// ---------------------------------------------------------------------------
export interface TetoComissao {
  adesao: number;      // fracao (1 = 100%)
  recorrente: number;
}

export interface ValidacaoComissao {
  ok: boolean;
  erros: string[];
}

const pct = (f: number) => `${arredondarMoeda(f * 100)}%`;

/**
 * A regional e uma franquia: recebe um percentual da associacao e distribui
 * parte dele aos seus vendedores. O vendedor NUNCA pode passar a regional.
 */
export function validarComissaoVendedor(vendedor: TetoComissao, regional: TetoComissao): ValidacaoComissao {
  const erros: string[] = [];
  const folga = 0.00005; // tolerancia de arredondamento

  if (vendedor.adesao > regional.adesao + folga) {
    erros.push(`Adesao: ${pct(vendedor.adesao)} passa o teto da regional (${pct(regional.adesao)}).`);
  }
  if (vendedor.recorrente > regional.recorrente + folga) {
    erros.push(`Recorrencia: ${pct(vendedor.recorrente)} passa o teto da regional (${pct(regional.recorrente)}).`);
  }
  if (vendedor.adesao < 0 || vendedor.recorrente < 0) {
    erros.push('Comissao nao pode ser negativa.');
  }
  return { ok: erros.length === 0, erros };
}

/** Quanto sobra para a regional depois do que ela cedeu ao vendedor. */
export function margemRegional(vendedor: TetoComissao, regional: TetoComissao): TetoComissao {
  return {
    adesao: fracao4(Math.max(0, regional.adesao - vendedor.adesao)),
    recorrente: fracao4(Math.max(0, regional.recorrente - vendedor.recorrente)),
  };
}

// ---------------------------------------------------------------------------
// Adesao
// ---------------------------------------------------------------------------
export type FormaAdesao = 'VENDEDOR_NA_HORA' | 'BOLETO' | 'PIX' | 'CARTAO';

export const FORMA_ADESAO_ROTULO: Record<FormaAdesao, string> = {
  VENDEDOR_NA_HORA: 'Vendedor recebeu na hora',
  BOLETO: 'Boleto',
  PIX: 'PIX',
  CARTAO: 'Cartao',
};

/** O dinheiro passou pela conta da associacao? So entao entra no DRE. */
export function adesaoEntraNoCaixa(forma: FormaAdesao | null | undefined): boolean {
  return !!forma && forma !== 'VENDEDOR_NA_HORA';
}

export interface RateioAdesao {
  valor: number;
  /** Quanto do valor fica com o vendedor. */
  vendedor: number;
  /** Quanto sobra para a associacao/regional. */
  associacao: number;
  entraNoCaixa: boolean;
  /** Explicacao curta para a tela. */
  resumo: string;
}

/**
 * Como a adesao se reparte. Recebida na mao do vendedor, nada transita pela
 * associacao — o registro existe so para historico e conferencia.
 */
export function ratearAdesao(
  valor: number,
  forma: FormaAdesao | null | undefined,
  taxaVendedor: number,
): RateioAdesao {
  const total = arredondarMoeda(valor || 0);
  const naCaixa = adesaoEntraNoCaixa(forma);

  if (!naCaixa) {
    return {
      valor: total,
      vendedor: total,
      associacao: 0,
      entraNoCaixa: false,
      resumo: 'Recebida pelo vendedor: nada entra no financeiro da associacao.',
    };
  }

  const doVendedor = arredondarMoeda(total * (taxaVendedor || 0));
  return {
    valor: total,
    vendedor: doVendedor,
    associacao: arredondarMoeda(total - doVendedor),
    entraNoCaixa: true,
    resumo: `Entra como receita e ${pct(taxaVendedor || 0)} sai depois no repasse ao vendedor.`,
  };
}

// ---------------------------------------------------------------------------
// Checklist de entrada na base
// ---------------------------------------------------------------------------
export interface ItemChecklist {
  item: string;
  grupo: string;
  ok: boolean;
  detalhe: string | null;
}

export interface GrupoChecklist {
  grupo: string;
  itens: ItemChecklist[];
  concluidos: number;
  total: number;
  completo: boolean;
}

export const ORDEM_CHECKLIST = ['Associado', 'Veiculo', 'Documentos', 'Venda'];

export function agruparChecklist(itens: ItemChecklist[]): GrupoChecklist[] {
  const grupos = new Map<string, ItemChecklist[]>();
  itens.forEach((i) => {
    const lista = grupos.get(i.grupo) ?? [];
    lista.push(i);
    grupos.set(i.grupo, lista);
  });

  return [...grupos.entries()]
    .sort((a, b) => {
      const ia = ORDEM_CHECKLIST.indexOf(a[0]);
      const ib = ORDEM_CHECKLIST.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .map(([grupo, lista]) => ({
      grupo,
      itens: lista,
      concluidos: lista.filter((i) => i.ok).length,
      total: lista.length,
      completo: lista.every((i) => i.ok),
    }));
}

export function progressoChecklist(itens: ItemChecklist[]): { concluidos: number; total: number; percentual: number } {
  const total = itens.length;
  const concluidos = itens.filter((i) => i.ok).length;
  return { concluidos, total, percentual: total ? Math.round((concluidos / total) * 100) : 0 };
}

export function pendencias(itens: ItemChecklist[]): string[] {
  return itens.filter((i) => !i.ok).map((i) => i.item);
}
