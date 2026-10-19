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

/**
 * Dias em que o WEBHOOK procura o pagamento em `liquidados/dia` para
 * confirmar o aviso: a data que o aviso trouxe (se trouxe), a previsao do
 * credito (se ja chegou: dia futuro ainda nao tem lista) + ontem e hoje.
 * Sem repeticao e sem data invalida.
 */
export function diasParaConfirmar(hoje: string, dataDoAviso?: string | null, previsao?: string | null): string[] {
  const prev = previsao && diaValido(previsao) && previsao <= hoje ? previsao : null;
  const dias = [dataDoAviso, prev, diaAnterior(hoje), hoje].filter((d): d is string => diaValido(d));
  return Array.from(new Set(dias));
}

/** Prazo para um aviso do banco aparecer em `liquidados/dia` antes de virar EXPIRADO (0122). */
export const PRAZO_AVISO_DIAS = 15;
/** Quantos dias para tras, no maximo, a reconferencia consulta por aviso. */
export const JANELA_RECONFERENCIA_DIAS = 10;

function diaSeguinte(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
}

/**
 * Dias a reconsultar para um aviso que ficou AGUARDANDO (0122): do mais cedo
 * entre o aviso e a previsao do credito ate HOJE — o pagamento do fim de
 * semana entra na lista do dia util seguinte, que pode ser qualquer um desses.
 * Limitado aos ultimos JANELA_RECONFERENCIA_DIAS para nao varrer o mes inteiro;
 * sem data valida, so ontem e hoje.
 */
export function diasParaReconferir(hoje: string, dataDoAviso?: string | null, previsao?: string | null): string[] {
  const datas = [dataDoAviso, previsao].filter((d): d is string => diaValido(d) && d <= hoje).sort();
  const limite = (() => {
    let d = hoje;
    for (let i = 1; i < JANELA_RECONFERENCIA_DIAS; i++) d = diaAnterior(d);
    return d;
  })();
  let inicio = datas[0] ?? diaAnterior(hoje);
  if (inicio < limite) inicio = limite;
  const dias: string[] = [];
  for (let d = inicio; d <= hoje; d = diaSeguinte(d)) dias.push(d);
  return dias;
}

/** O aviso passou do prazo sem aparecer no banco? (conta do recebimento, em dias de SP). */
export function avisoExpirou(recebidoEm: string, hoje: string, prazo: number = PRAZO_AVISO_DIAS): boolean {
  const recebido = hojeEmSaoPaulo(new Date(recebidoEm));
  return diasEntre(recebido, hoje) > prazo;
}
