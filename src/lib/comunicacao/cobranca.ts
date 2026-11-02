/**
 * E-mails de cobranca (0168) — regras PURAS: dados do aviso, decisao de envio e backoff.
 * O visual sai dos templates React Email (./templates, renderizados em ./render-email).
 *
 * Decisoes do usuario (02/11/2026): so boletos do SCar; regua D-5, D-1, D0, D+2
 * e D+7; sem confirmacao de pagamento; linha digitavel no corpo.
 * Tom: so cobranca, objetivo e sem ameaca (CDC art. 42) — ha teste.
 */

export type TemplateEmail = 'aviso_vencimento' | 'vence_hoje' | 'atraso';

export type DadosAviso = {
  nome: string | null;
  valor: number | null;
  vencimento: string | null; // AAAA-MM-DD
  linhaDigitavel: string | null;
  pixCopiaCola: string | null;
  linkBoleto: string | null;
  /** dias em relacao ao vencimento (negativo = antes) — reserva quando nao ha "hoje" */
  offsetDias: number;
  /** "Modelo · placa final 23" — nunca a placa inteira na cobranca */
  veiculo?: string | null;
  /** veiculo com rastreador na ficha: o atraso afirma o bloqueio do sinal; sem: texto condicional */
  temRastreador?: boolean;
};

export type Rodape = {
  razaoSocial: string;
  cnpj: string | null;
  whatsapp: string | null;
  email: string | null;
  site: string | null;
};

export const RAZAO_SOCIAL_PADRAO = 'SMART CAR BRASIL PROTEÇÃO PATRIMONIAL MUTUALISTA';

/** Palavras que nao podem aparecer em e-mail de cobranca (tom de ameaca/alarme). */
export const PALAVRAS_PROIBIDAS = [
  'urgente', 'ultimo aviso', 'último aviso', 'protesto', 'serasa', 'spc', 'negativa',
  'judicial', 'processo', 'cancelamento imediato',
];
// "bloqueado" saiu da lista (02/11/2026): o aviso de atraso diz, por decisao da diretoria,
// que o sinal do rastreador e bloqueado enquanto houver contribuicao em aberto.

export function dataBr(iso: string | null): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function valorBr(v: number | null): string {
  if (v == null) return '';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function primeiroNome(nome: string | null): string {
  const p = (nome ?? '').trim().split(/\s+/)[0] ?? '';
  if (!p) return '';
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

export function formatarCnpj(c: string | null): string | null {
  const d = (c ?? '').replace(/\D/g, '');
  if (d.length !== 14) return c;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** "ONIX LT 1.0" + "ABC1D23" -> "Onix Lt 1.0 · placa final 23". Sem placa (0 km): so o modelo. */
export function veiculoDoAviso(modelo: string | null | undefined, placa: string | null | undefined): string | null {
  const m = (modelo ?? '').trim().replace(/\s+/g, ' ');
  const p = (placa ?? '').replace(/[^A-Za-z0-9]/g, '');
  const nome = m ? m.toLocaleLowerCase('pt-BR').replace(/(^|\s)(\p{L})/gu, (_x, a: string, b: string) => a + b.toLocaleUpperCase('pt-BR')) : '';
  if (!nome) return p.length >= 2 ? `Placa final ${p.slice(-2).toUpperCase()}` : null;
  return p.length >= 2 ? `${nome} · placa final ${p.slice(-2).toUpperCase()}` : nome;
}

/** Hoje (AAAA-MM-DD) em Sao Paulo — mesmo fuso da fila (data_sp). */
export function hojeSp(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}

/** Dias de `de` ate `ate` (datas AAAA-MM-DD, sem fuso). */
export function diasEntre(de: string, ate: string): number {
  const ms = Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10))
    - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10));
  return Math.round(ms / 86_400_000);
}

/** AAAA-MM-DD + n dias. */
export function somarDias(iso: string, n: number): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n));
  return d.toISOString().slice(0, 10);
}

/** Dados de exemplo para a pre-visualizacao e o envio de teste. */
export function exemploAviso(template: TemplateEmail, offsetDias: number, linkBoleto: string | null = null): DadosAviso {
  return {
    nome: 'MARIA DA SILVA',
    valor: 189.9,
    vencimento: '2026-11-16',
    linhaDigitavel: '74891.12345 67890.123456 78901.234567 8 12345678901234',
    pixCopiaCola: '00020126580014BR.GOV.BCB.PIX0136exemplo-de-pix-copia-e-cola5204000053039865406189.905802BR',
    linkBoleto,
    offsetDias,
    veiculo: 'Fiat Argo · placa final 23',
  };
}

// ---------------------------------------------------------------------------
// Decisao de envio
// ---------------------------------------------------------------------------
export type ConfigEnvio = { modo: 'sandbox' | 'live'; allowlist: string[] };

export type Decisao =
  | { acao: 'enviar' }
  | { acao: 'cancelar'; motivo: string };

export function normalizarEmail(e: string | null | undefined): string {
  return (e ?? '').trim().toLowerCase();
}

export function emailValido(e: string | null | undefined): boolean {
  return /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(normalizarEmail(e));
}

export function decidirEnvio(
  item: { destinatario: string; titulo_status: string | null; linha_digitavel: string | null },
  cfg: ConfigEnvio,
): Decisao {
  if (item.titulo_status === 'pago') return { acao: 'cancelar', motivo: 'boleto pago' };
  if (item.titulo_status === 'cancelado') return { acao: 'cancelar', motivo: 'boleto cancelado' };
  if (!item.linha_digitavel) return { acao: 'cancelar', motivo: 'boleto sem linha digitavel' };
  if (!emailValido(item.destinatario)) return { acao: 'cancelar', motivo: 'e-mail invalido' };
  if (cfg.modo !== 'live') {
    const lista = cfg.allowlist.map(normalizarEmail);
    if (!lista.includes(normalizarEmail(item.destinatario))) {
      return { acao: 'cancelar', motivo: 'modo sandbox: destinatario fora da lista de teste' };
    }
  }
  return { acao: 'enviar' };
}

export const TENTATIVAS_MAXIMAS = 5;

/** Backoff exponencial: 1, 2, 4, 8, 16 minutos (teto 30). */
export function proximaTentativa(tentativas: number, agora: Date = new Date()): Date {
  const minutos = Math.min(30, 2 ** Math.max(0, tentativas - 1));
  return new Date(agora.getTime() + minutos * 60_000);
}

/** Erro do provedor: transitorio (tenta de novo) ou permanente (desiste). */
export function erroTransitorio(status: number | null): boolean {
  if (status == null) return true; // queda de rede
  return status === 408 || status === 429 || status >= 500;
}

export type SituacaoEmail =
  | 'pendente' | 'enviando' | 'enviado' | 'entregue' | 'falhou' | 'bounce'
  | 'reclamado' | 'suprimido' | 'cancelado' | 'expirado';

export const ROTULO_SITUACAO_EMAIL: Record<SituacaoEmail, string> = {
  pendente: 'Na fila',
  enviando: 'Enviando',
  enviado: 'Enviado',
  entregue: 'Entregue',
  falhou: 'Falhou',
  bounce: 'Devolvido',
  reclamado: 'Marcado como spam',
  suprimido: 'Bloqueado (supressão)',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
};

/** Limites de alerta (conservadores; o provedor age perto de 4-5% e 0,1%). */
export const LIMITE_BOUNCE = 0.02;
export const LIMITE_RECLAMACAO = 0.0005;

export function taxasDoPainel(r: { enviados: number; bounces: number; reclamacoes: number }) {
  const base = r.enviados || 0;
  const bounce = base ? r.bounces / base : 0;
  const reclamacao = base ? r.reclamacoes / base : 0;
  return {
    bounce,
    reclamacao,
    alertaBounce: base > 0 && bounce > LIMITE_BOUNCE,
    alertaReclamacao: base > 0 && reclamacao > LIMITE_RECLAMACAO,
  };
}
