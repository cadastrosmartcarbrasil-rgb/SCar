// ---------------------------------------------------------------------------
// CARNE do veiculo e boleto da ADESAO (0145) — regras puras.
// Espelho de `gerar_carne_veiculo` e `autorizar_entrada_lead` (SQL): mexeu
// num lado, mexa no outro e nos dois testes.
// ---------------------------------------------------------------------------
import { calcularVencimento } from './cobranca';
import { somarDias } from './pro-rata';
import { formatCurrency, formatDate } from './utils';

/** O carne vai de 1 a 12 meses (o banco recusa fora disso). */
export const MESES_CARNE_MAX = 12;
export const MESES_CARNE_PADRAO = 6;
/** O primeiro boleto vence a pelo menos este numero de dias de hoje. */
export const FOLGA_PRIMEIRO_VENCIMENTO = 2;
/** O boleto da adesao, sem data escolhida, vence em hoje + 3. */
export const FOLGA_ADESAO = 3;

/** Os ciclos de vencimento usados pela cobranca (0097). */
export const DIAS_VENCIMENTO = [5, 10, 15, 20, 25, 30] as const;

export function vencimentoPadraoAdesao(hoje: string): string {
  return somarDias(hoje, FOLGA_ADESAO);
}

function competenciaDaData(data: string): string {
  return `${data.slice(0, 7)}-01`;
}

function proximaCompetencia(comp: string): string {
  const [a, m] = comp.split('-').map(Number);
  const d = new Date(Date.UTC(a, m, 1)); // m ja e o proximo mes (0-based)
  return d.toISOString().slice(0, 10);
}

/**
 * As competencias do carne: a primeira (desde a ativacao) cujo vencimento esta
 * a pelo menos `FOLGA_PRIMEIRO_VENCIMENTO` dias de hoje, e as seguintes.
 */
export function vencimentosDoCarne(args: {
  ativacao: string | null;
  dia: number | null;
  hoje: string;
  meses: number;
}): { competencia: string; vencimento: string }[] {
  const minimo = somarDias(args.hoje, FOLGA_PRIMEIRO_VENCIMENTO);
  let comp = competenciaDaData(args.ativacao ?? args.hoje);
  for (let i = 0; i < 24 && calcularVencimento(comp, args.dia) < minimo; i++) {
    comp = proximaCompetencia(comp);
  }
  const out: { competencia: string; vencimento: string }[] = [];
  for (let i = 0; i < Math.max(0, Math.min(args.meses, MESES_CARNE_MAX)); i++) {
    out.push({ competencia: comp, vencimento: calcularVencimento(comp, args.dia) });
    comp = proximaCompetencia(comp);
  }
  return out;
}

/** 0 = so o boleto da adesao (na aprovacao). */
export function validarMesesCarne(meses: number): string | null {
  if (!Number.isInteger(meses) || meses < 0 || meses > MESES_CARNE_MAX) {
    return `Escolha de 0 a ${MESES_CARNE_MAX} meses.`;
  }
  return null;
}

export interface BoletoDoCarne {
  titulo_id: string;
  vencimento: string;
  valor: number;
  adesao: boolean;
  linha_digitavel: string | null;
  pix_copia_cola: string | null;
  erro: string | null;
}

export function resumoDoCarne(boletos: BoletoDoCarne[]) {
  const mensalidades = boletos.filter((b) => !b.adesao).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const adesao = boletos.find((b) => b.adesao) ?? null;
  const total = Math.round(boletos.reduce((s, b) => s + b.valor, 0) * 100) / 100;
  return {
    mensalidades: mensalidades.length,
    primeiro: mensalidades[0]?.vencimento ?? null,
    ultimo: mensalidades[mensalidades.length - 1]?.vencimento ?? null,
    adesao,
    total,
    registrados: boletos.filter((b) => b.linha_digitavel && !b.erro).length,
    comErro: boletos.filter((b) => b.erro).length,
  };
}

/** A mensagem do WhatsApp com todos os boletos (linha digitavel de cada um). */
export function mensagemDoCarne(nome: string, placa: string | null, boletos: BoletoDoCarne[]): string {
  const ordem = [...boletos].sort((a, b) =>
    a.adesao === b.adesao ? a.vencimento.localeCompare(b.vencimento) : a.adesao ? -1 : 1);
  const linhas = ordem
    .filter((b) => b.linha_digitavel)
    .map((b) => `${b.adesao ? 'Adesão' : 'Mensalidade'} · vence ${formatDate(b.vencimento)} · ${formatCurrency(b.valor)}\n${b.linha_digitavel}`);
  const primeiroNome = (nome || '').trim().split(/\s+/)[0] ?? '';
  return [
    `Olá${primeiroNome ? `, ${primeiroNome}` : ''}! Seguem os boletos da sua proteção veicular${placa ? ` (${placa})` : ''}:`,
    '',
    ...linhas.flatMap((l) => [l, '']),
    'Todos também podem ser pagos por PIX (o código está no boleto).',
  ].join('\n');
}
