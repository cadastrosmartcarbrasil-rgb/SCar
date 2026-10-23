// ---------------------------------------------------------------------------
// PRO-RATA pela data de VENCIMENTO do veiculo (0144). Espelho exato de
// `pro_rata_veiculo` no banco — mexeu num, mexa no outro e nos dois testes.
//
// Decisao do usuario (23/10/2026): CICLO POS-PAGO. O boleto que vence no dia D
// cobre de D do mes anterior a D-1 deste (o de 20/10 cobre 20/09 a 19/10). Os
// dias contam os dois extremos; valor = mensalidade x dias usados / dias do
// ciclo, arredondado em centavos e nunca acima da mensalidade.
// ---------------------------------------------------------------------------
import { podeNegociar, type BoletoNegociavel } from './renegociacao';
import { formatCurrency, formatDate } from './utils';

/** Dia de vencimento padrao quando o veiculo nao tem (o legado da 0024: dia 10). */
export const DIA_VENCIMENTO_PADRAO = 10;

function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return [a, m, d];
}

function iso(a: number, m: number, d: number): string {
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function diasNoMes(a: number, m: number): number {
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** Vencimento do mes (`calcular_vencimento`): dia 31 cai no ultimo dia do mes. */
export function vencimentoDoMes(ano: number, mes: number, dia: number): string {
  return iso(ano, mes, Math.min(dia, diasNoMes(ano, mes)));
}

function somarMes(ano: number, mes: number, n: number): [number, number] {
  const t = ano * 12 + (mes - 1) + n;
  return [Math.floor(t / 12), (t % 12) + 1];
}

/** Diferenca em dias entre duas datas ISO (b - a). */
export function diasEntre(a: string, b: string): number {
  const [aa, am, ad] = partes(a);
  const [ba, bm, bd] = partes(b);
  return Math.round((Date.UTC(ba, bm - 1, bd) - Date.UTC(aa, am - 1, ad)) / 86_400_000);
}

export function somarDias(data: string, n: number): string {
  const [a, m, d] = partes(data);
  const t = new Date(Date.UTC(a, m - 1, d + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export interface CicloProRata {
  inicio: string;      // ultimo vencimento <= a data
  fim: string;         // vespera do proximo vencimento
  vencimento: string;  // o boleto que cobre o ciclo (pos-pago)
  dias: number;
}

/** O ciclo (pos-pago) que contem a data, pelo dia de vencimento do veiculo. */
export function cicloDaData(diaVencimento: number | null | undefined, data: string): CicloProRata {
  const dia = diaVencimento && diaVencimento > 0 ? diaVencimento : DIA_VENCIMENTO_PADRAO;
  const [a, m] = partes(data);
  const cur = vencimentoDoMes(a, m, dia);
  let inicio: string;
  let prox: string;
  if (cur <= data) {
    inicio = cur;
    const [pa, pm] = somarMes(a, m, 1);
    prox = vencimentoDoMes(pa, pm, dia);
  } else {
    const [aa, am] = somarMes(a, m, -1);
    inicio = vencimentoDoMes(aa, am, dia);
    prox = cur;
  }
  return { inicio, fim: somarDias(prox, -1), vencimento: prox, dias: diasEntre(inicio, prox) };
}

export interface ProRata extends CicloProRata {
  valorMensal: number;
  desde: string;
  ate: string;
  diasUsados: number;
  valor: number;
}

/**
 * O pro-rata de `desde` (padrao: inicio do ciclo) a `ate`. Devolve `null` se o
 * inicio estiver fora do ciclo — o banco recusa o mesmo caso.
 */
export function calcularProRata(args: {
  valorMensal: number;
  diaVencimento: number | null | undefined;
  ate: string;
  desde?: string | null;
}): ProRata | null {
  const ciclo = cicloDaData(args.diaVencimento, args.ate);
  const desde = args.desde || ciclo.inicio;
  if (desde < ciclo.inicio || desde > args.ate) return null;
  const mensal = Math.max(0, Number(args.valorMensal) || 0);
  const diasUsados = diasEntre(desde, args.ate) + 1;
  const valor = Math.min(mensal, Math.round((mensal * diasUsados / ciclo.dias) * 100) / 100);
  return { ...ciclo, valorMensal: mensal, desde, ate: args.ate, diasUsados, valor };
}

/** A conta escrita por extenso, para a tela e para o protocolo. */
export function textoDoProRata(p: ProRata): string {
  return `${formatCurrency(p.valorMensal)} ÷ ${p.dias} dias do ciclo × ${p.diasUsados} dia(s) usado(s) `
    + `(${formatDate(p.desde)} a ${formatDate(p.ate)}) = ${formatCurrency(p.valor)}`;
}

// ---------------------------------------------------------------------------
// Os boletos do veiculo no cancelamento.
// ---------------------------------------------------------------------------
export interface BoletoDoVeiculo extends BoletoNegociavel {
  veiculo_id?: string | null;
}

export interface BoletoFuturo<T extends BoletoDoVeiculo> {
  boleto: T;
  /** Pode ser baixado (em aberto, e do Mutual so com linha do Sicredi). */
  baixavel: boolean;
  motivo: string | null;
}

/**
 * Os boletos que o cancelamento BAIXA (decisao do usuario: marcados por padrao,
 * com opcao de desmarcar): os em aberto DESTE veiculo com vencimento DEPOIS do
 * pedido. Boleto sem veiculo e de outro veiculo nunca entram; o que venceu ate
 * o pedido e divida e fica.
 */
export function boletosFuturosDoVeiculo<T extends BoletoDoVeiculo>(
  boletos: T[], veiculoId: string, dataCancelamento: string,
): BoletoFuturo<T>[] {
  return boletos
    .filter((b) => b.veiculo_id === veiculoId && b.data_vencimento > dataCancelamento)
    .filter((b) => b.status !== 'pago' && b.status !== 'cancelado')
    .sort((a, b) => (a.data_vencimento < b.data_vencimento ? -1 : 1))
    .map((b) => {
      const baixavel = podeNegociar(b);
      return {
        boleto: b,
        baixavel,
        motivo: baixavel ? null : 'boleto do Mutual sem linha do Sicredi: baixe no Mutual',
      };
    });
}

/**
 * O boleto do ciclo do pedido ja foi PAGO? (pos-pago: o que vence no fim do
 * ciclo). Se sim, cobrar o pro-rata cobraria de novo os mesmos dias — a tela
 * avisa e desliga a cobranca por padrao.
 */
export function cicloJaPago(
  boletos: { veiculo_id?: string | null; data_vencimento: string; status: string }[],
  veiculoId: string, ciclo: CicloProRata,
): boolean {
  return boletos.some((b) => b.veiculo_id === veiculoId && b.status === 'pago'
    && b.data_vencimento === ciclo.vencimento);
}

/** Validacao da tela (o banco confere de novo). */
export function validarCancelamento(args: {
  motivo: string;
  data: string;
  hoje: string;
  dataAtivacao?: string | null;
  previsaoRetorno: boolean;
  dataRetorno?: string | null;
  cobrar: boolean;
  vencimento?: string | null;
}): string | null {
  if (args.motivo.trim().length < 5) return 'Informe o motivo do cancelamento.';
  if (!args.data) return 'Informe a data do pedido.';
  if (args.data > args.hoje) return 'A data do pedido não pode ser futura.';
  if (diasEntre(args.data, args.hoje) > 60) return 'A data do pedido pode voltar no máximo 60 dias.';
  if (args.dataAtivacao && args.data < args.dataAtivacao) return 'A data do pedido é anterior à ativação do veículo.';
  if (args.previsaoRetorno && (!args.dataRetorno || args.dataRetorno <= args.data)) {
    return 'Informe a data prevista do retorno (depois do cancelamento).';
  }
  if (args.cobrar) {
    if (!args.vencimento) return 'Informe o vencimento do boleto do pró-rata.';
    if (args.vencimento < args.hoje || diasEntre(args.hoje, args.vencimento) > 60) {
      return 'O vencimento do boleto do pró-rata tem de ser de hoje até 60 dias.';
    }
  }
  return null;
}
