// ---------------------------------------------------------------------------
// ASSISTENCIA PROFISSIONAL (0158/0159) — o valor que o consultor embute na
// mensalidade. Aparece para quem cota e NUNCA para o cliente. Qualquer unidade
// cobra (dentro do limite dela); so a que REPASSA paga a Assistencia ao
// consultor, e no LUGAR da comissao recorrente (nunca as duas). O limite mora
// no banco (fn_cotacao_valida_desconto) e a comissao em fn_calcular_comissao;
// aqui ficam os espelhos, para a tela avisar antes, e o que o cliente ve.
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
  const min = regras?.minimo ?? 1;
  const max = regras?.maximo ?? 40;
  if (v < min || v > max) return `O valor deve ficar entre ${moeda(min)} e ${moeda(max)}`;
  return null;
}

/**
 * Espelho de fn_calcular_comissao (0159) para a MENSALIDADE paga: comissao OU
 * Assistencia, nunca as duas. `base` e a parte paga deste veiculo; a parte da
 * Assistencia e proporcional ao que o pagamento cobre da mensalidade (juros
 * nao a aumentam, salvo renegociacao de varios meses).
 */
export function comissaoDoPagamento(p: {
  base: number; taxaRecorrente: number; assistencia: number; mensalidade: number;
  unidadeRepassa: boolean; renegociacao?: boolean;
}): { comissao: number; assistencia: number } {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const base = Math.max(Number(p.base) || 0, 0);
  const ap = Math.max(Number(p.assistencia) || 0, 0);
  if (!p.unidadeRepassa || ap === 0) return { comissao: r2(base * p.taxaRecorrente), assistencia: 0 };
  let parte = p.mensalidade > 0 ? r2((ap * base) / p.mensalidade) : ap;
  if (!p.renegociacao) parte = Math.min(parte, ap);
  parte = Math.max(Math.min(parte, base), 0);
  return { comissao: parte, assistencia: parte };
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
