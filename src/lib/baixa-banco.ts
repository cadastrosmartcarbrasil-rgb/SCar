// Baixa automatica pelo banco (0105) — regras puras da rotina diaria.

export type SituacaoLiquidacao = 'BAIXADO' | 'JA_PAGO' | 'NAO_ENCONTRADO' | 'TITULO_CANCELADO';

export interface ResultadoLiquidacao {
  nosso_numero: string | null;
  situacao: SituacaoLiquidacao | 'ERRO';
  valor_pago: number | null;
  valor_divergente?: boolean;
  erro?: string;
}

/** Data 'YYYY-MM-DD' no fuso de Sao Paulo (o dia do banco, nao o UTC do servidor). */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
}

export function diaAnterior(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Dias a consultar. Sem dia informado: ONTEM e HOJE — o pagamento feito
 * tarde (ou compensado depois da ultima rodada) entra na rodada seguinte, e
 * reler um dia nao duplica nada (a trilha e unica por nosso numero + data).
 */
export function diasDaBaixa(hoje: string, dia?: string | null): string[] {
  if (dia) return [dia];
  return [diaAnterior(hoje), hoje];
}

export function diaValido(dia: unknown): dia is string {
  return typeof dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dia) && !Number.isNaN(Date.parse(`${dia}T00:00:00Z`));
}

export interface ResumoBaixa {
  lidos: number;
  baixados: number;
  ja_pagos: number;
  nao_encontrados: number;
  cancelados: number;
  erros: number;
  divergentes: number;
  valor_baixado: number;
}

export function resumoDaBaixa(rs: ResultadoLiquidacao[]): ResumoBaixa {
  const r: ResumoBaixa = {
    lidos: rs.length, baixados: 0, ja_pagos: 0, nao_encontrados: 0, cancelados: 0,
    erros: 0, divergentes: 0, valor_baixado: 0,
  };
  let centavos = 0;
  for (const x of rs) {
    if (x.situacao === 'BAIXADO') { r.baixados++; centavos += Math.round((x.valor_pago ?? 0) * 100); }
    else if (x.situacao === 'JA_PAGO') r.ja_pagos++;
    else if (x.situacao === 'NAO_ENCONTRADO') r.nao_encontrados++;
    else if (x.situacao === 'TITULO_CANCELADO') r.cancelados++;
    else r.erros++;
    if (x.valor_divergente) r.divergentes++;
  }
  r.valor_baixado = centavos / 100;
  return r;
}

/** Comparacao de segredo sem atalho por tamanho/prefixo. */
export function segredoConfere(recebido: string | null | undefined, esperado: string | null | undefined): boolean {
  if (!recebido || !esperado || esperado.length < 16) return false;
  if (recebido.length !== esperado.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  return diff === 0;
}
