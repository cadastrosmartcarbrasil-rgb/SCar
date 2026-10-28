// ---------------------------------------------------------------------------
// ASSISTENCIA PROFISSIONAL (0158) — o valor que o consultor embute na
// mensalidade. Aparece para quem cota e NUNCA para o cliente; o limite e a
// unidade que paga moram no banco (fn_cotacao_valida_desconto). Aqui ficam o
// espelho da validacao, para a tela avisar antes, e a montagem do que o
// cliente ve.
// ---------------------------------------------------------------------------

export type RegrasAssistenciaProfissional = {
  regional_id: string | null;
  regional_nome: string | null;
  paga: boolean;
  minimo: number;
  maximo: number;
};

/** Mensagem do problema, ou null quando o valor pode ser gravado. Zero sempre pode. */
export function validarAssistenciaProfissional(
  valor: number | null | undefined,
  regras: RegrasAssistenciaProfissional | null | undefined,
): string | null {
  const v = Number(valor ?? 0);
  if (!Number.isFinite(v) || v < 0) return 'Valor inválido';
  if (v === 0) return null;
  if (!regras?.paga) return 'A unidade deste atendimento não paga Assistência Profissional';
  if (v < regras.minimo || v > regras.maximo) {
    return `O valor deve ficar entre ${moeda(regras.minimo)} e ${moeda(regras.maximo)}`;
  }
  return null;
}

/** O total que o cliente paga: tabela com desconto + a Assistência (fora do desconto). */
export function totalDoCliente(c: {
  total_mensalidade: number | null; total_com_desconto?: number | null; valor_assistencia_profissional?: number | null;
}): number {
  if (c.total_com_desconto != null) return Number(c.total_com_desconto);
  return Math.round((Number(c.total_mensalidade ?? 0) + Number(c.valor_assistencia_profissional ?? 0)) * 100) / 100;
}

type ItemProposta = { nome: string; valor: number; obrigatorio: boolean; categoria?: string | null; produto_id?: string | null };

const ehTaxaAdm = (i: ItemProposta) =>
  i.categoria === 'ADMIN' || /taxa\s*adm/i.test(i.nome.normalize('NFD').replace(/[̀-ͯ]/g, ''));

/**
 * O detalhamento que o cliente ve. A Assistência não ganha linha: é somada
 * à Taxa Administrativa (na falta dela, ao primeiro item obrigatório; na
 * falta, ao primeiro), para a soma dos itens continuar batendo com o total.
 */
export function itensParaCliente<T extends ItemProposta>(itens: T[], assistencia: number | null | undefined): T[] {
  const ap = Math.round(Number(assistencia ?? 0) * 100) / 100;
  if (!ap || itens.length === 0) return itens;
  let alvo = itens.findIndex(ehTaxaAdm);
  if (alvo < 0) alvo = itens.findIndex((i) => i.obrigatorio);
  if (alvo < 0) alvo = 0;
  return itens.map((i, k) => (k === alvo ? { ...i, valor: Math.round((Number(i.valor) + ap) * 100) / 100 } : i));
}

const moeda = (n: number) =>
  Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export type SituacaoApMigrado = 'APLICAR' | 'JA_APLICADO' | 'DIFERENTE' | 'SEM_VALOR';

/** Os totais da tela dos migrados (0158), contados por situacao. */
export function totaisApMigrados(linhas: { situacao: SituacaoApMigrado }[]) {
  const t = { total: linhas.length, aplicar: 0, jaAplicado: 0, diferente: 0, semValor: 0 };
  for (const l of linhas) {
    if (l.situacao === 'APLICAR') t.aplicar++;
    else if (l.situacao === 'JA_APLICADO') t.jaAplicado++;
    else if (l.situacao === 'DIFERENTE') t.diferente++;
    else t.semValor++;
  }
  return t;
}
