/**
 * Desconto na mensalidade (0178): so a mensalidade, em % ou R$ por mes, dentro
 * do limite da unidade, com validade opcional — e sempre aprovado pela
 * diretoria. Espelha `fn_cotacao_valida_desconto`.
 */
export type TipoDesconto = 'PERCENTUAL' | 'VALOR';
export type SituacaoDesconto = 'PENDENTE' | 'APROVADO' | 'RECUSADO' | null;

export type CalculoDesconto = {
  percentual: number;
  desconto: number;
  mensalidadeFinal: number;
  acimaDoLimite: boolean;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

export function calcularDescontoMensalidade(
  mensalidadeTabela: number, tipo: TipoDesconto, valor: number | null, limitePercentual: number,
): CalculoDesconto {
  const tab = r2(Math.max(0, Number(mensalidadeTabela) || 0));
  const v = Math.max(0, Number(valor) || 0);
  let desconto: number;
  let percentual: number;
  if (tipo === 'VALOR') {
    desconto = r2(Math.min(v, tab));
    percentual = tab > 0 ? r2((desconto * 100) / tab) : 0;
  } else {
    percentual = Math.min(v, 100);
    desconto = r2((tab * percentual) / 100);
  }
  return {
    percentual,
    desconto,
    mensalidadeFinal: r2(tab - desconto),
    acimaDoLimite: percentual > (Number(limitePercentual) || 0),
  };
}

export const ROTULO_SITUACAO_DESCONTO: Record<'PENDENTE' | 'APROVADO' | 'RECUSADO', string> = {
  PENDENTE: 'Aguardando aprovação da diretoria',
  APROVADO: 'Aprovado pela diretoria',
  RECUSADO: 'Recusado pela diretoria',
};

/** Texto da validade: "até 30/11/2026" ou "sem prazo". */
export function textoValidade(validoAte: string | null | undefined): string {
  if (!validoAte) return 'sem prazo';
  const d = validoAte.slice(0, 10);
  return `boletos com vencimento até ${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}
