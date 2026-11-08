// ---------------------------------------------------------------------------
// 2a via vencida e boleto NEGOCIADO (0121). Decisao do usuario (18/10/2026):
// toda 2a via vencida e toda negociacao viram BOLETO NOVO do SCar, registrado
// no Sicredi na hora, e os originais (Mutual ou SCar) recebem BAIXA no banco.
// Espelho das regras de `criar_renegociacao` para a tela nao oferecer o que o
// banco recusa.
// ---------------------------------------------------------------------------
import { gerarParcelas } from './financeiro';
import { formatCurrency, formatDate } from './utils';
import { parteWhatsApp, saudacao } from './comunicacao/modelos-whatsapp';
import type { TextosModelo } from './comunicacao/modelos';

export interface BoletoNegociavel {
  id: string;
  origem?: 'SCAR' | 'MUTUAL';
  status: string;
  valor: number;
  data_vencimento: string;
  linha_digitavel?: string | null;
  observacao?: string | null;
}

/** Banco Sicredi (748) na linha digitavel = o boleto tem nosso numero para a baixa. */
export function ehLinhaSicredi(linha: string | null | undefined): boolean {
  return (linha ?? '').replace(/\D/g, '').startsWith('748');
}

/**
 * Pode entrar numa negociacao? Em aberto ou vencido; do Mutual, so com a linha
 * do Sicredi (sem o nosso numero nao ha baixa — pagaria duas vezes).
 */
export function motivoNaoNegociavel(b: BoletoNegociavel): string | null {
  if (b.status !== 'aberto' && b.status !== 'vencido' && b.status !== 'pendente') {
    return `boleto ${b.status}`;
  }
  if (b.origem === 'MUTUAL' && !ehLinhaSicredi(b.linha_digitavel)) {
    return 'boleto do Mutual sem linha do Sicredi (trate no Mutual)';
  }
  // 0150: boleto avulso (adesao, vistoria...) nao vira 2a via de mensalidade.
  if (ehBoletoAvulso(b.observacao)) return 'boleto avulso (emita outro avulso)';
  return null;
}

/** O titulo e um boleto AVULSO do SAC (0150)? O banco grava a observacao assim. */
export function ehBoletoAvulso(observacao: string | null | undefined): boolean {
  return !!observacao && observacao.startsWith('Boleto avulso — ');
}

/**
 * Cancelamento (0157): em aberto e, se do Mutual, com a linha do Sicredi (a
 * baixa e pelo nosso numero). Boleto avulso TAMBEM se cancela — o avulso
 * emitido errado e o caso classico. null = cancelavel.
 */
export function motivoNaoCancelavel(b: BoletoNegociavel & { valor_pago?: number | null }): string | null {
  if (b.status !== 'aberto' && b.status !== 'vencido' && b.status !== 'pendente') {
    return `boleto ${b.status}`;
  }
  if (Number(b.valor_pago ?? 0) > 0) return 'boleto com pagamento parcial';
  if (b.origem === 'MUTUAL' && !ehLinhaSicredi(b.linha_digitavel)) {
    return 'boleto do Mutual sem linha do Sicredi (cancele no Mutual)';
  }
  return null;
}

export const MOTIVO_CANCELAMENTO_MINIMO = 5;

export function validarMotivoCancelamento(motivo: string): string | null {
  return motivo.trim().length < MOTIVO_CANCELAMENTO_MINIMO
    ? `Informe o motivo do cancelamento (mínimo ${MOTIVO_CANCELAMENTO_MINIMO} caracteres).`
    : null;
}

export function podeNegociar(b: BoletoNegociavel): boolean {
  return motivoNaoNegociavel(b) === null;
}

/** Total dos originais escolhidos (em centavos, sem erro de ponto flutuante). */
export function totalOriginais(boletos: { valor: number }[]): number {
  return Math.round(boletos.reduce((s, b) => s + Math.round(Number(b.valor) * 100), 0)) / 100;
}

/** Valor do boleto novo: originais + acrescimo − desconto (nunca negativo). */
export function valorNegociado(original: number, acrescimo: number, desconto: number): number {
  const c = Math.round(original * 100) + Math.round((acrescimo || 0) * 100) - Math.round((desconto || 0) * 100);
  return Math.max(0, c) / 100;
}

export interface ParcelaNegociada { vencimento: string; valor: number }

/** Divide o negociado em N parcelas mensais (centavos na ultima). */
export function parcelasDaNegociacao(total: number, quantidade: number, primeiroVencimento: string): ParcelaNegociada[] {
  return gerarParcelas({ valorTotal: total, quantidade, primeiroVencimento })
    .map((p) => ({ vencimento: p.data_vencimento, valor: p.valor }));
}

/** O que o banco recusaria — antes de mandar. `hoje` em 'YYYY-MM-DD'. */
export function validarNegociacao(args: {
  origens: number;
  parcelas: ParcelaNegociada[];
  hoje: string;
}): string | null {
  if (args.origens === 0) return 'Escolha ao menos um boleto em aberto.';
  if (args.parcelas.length < 1 || args.parcelas.length > 36) return 'De 1 a 36 parcelas.';
  const limite = new Date(`${args.hoje}T12:00:00`);
  limite.setDate(limite.getDate() + 365);
  const max = limite.toISOString().slice(0, 10);
  let ant: string | null = null;
  for (const [i, p] of args.parcelas.entries()) {
    if (!p.vencimento) return `Parcela ${i + 1}: informe o vencimento.`;
    if (!(p.valor > 0)) return `Parcela ${i + 1}: valor tem de ser positivo.`;
    if (p.vencimento < args.hoje) return `Parcela ${i + 1}: o vencimento não pode ficar no passado.`;
    if (p.vencimento > max) return `Parcela ${i + 1}: o vencimento tem de ser em até 1 ano.`;
    if (ant && p.vencimento <= ant) return `Parcela ${i + 1}: vencimentos em ordem crescente.`;
    ant = p.vencimento;
  }
  return null;
}

/** Mensagem pronta para o associado (WhatsApp/e-mail): linha + PIX por boleto. */
export function mensagemDoBoleto(args: {
  nome: string;
  /** false = 2a via do MESMO boleto (nada foi substituido). */
  substitui?: boolean;
  boletos: { parcela: number; vencimento: string; valor: number; linha_digitavel: string | null; pix_copia_cola: string | null }[];
  textos?: TextosModelo | null;
}): string {
  const primeiro = (args.nome || '').trim().split(/\s+/)[0] ?? '';
  const nome = primeiro ? primeiro.charAt(0) + primeiro.slice(1).toLowerCase() : '';
  const varios = args.boletos.length > 1;
  const v = { saudacao: nome ? `Olá, ${nome}!` : 'Olá!', nome, o_que: varios ? 'os boletos do seu acordo' : 'o seu boleto' };
  const linhas = [parteWhatsApp('boleto', 'abertura', v, args.textos), ''];
  for (const b of args.boletos) {
    linhas.push(
      `${varios ? `Parcela ${b.parcela} — ` : ''}Vencimento ${formatDate(b.vencimento)} · ${formatCurrency(Number(b.valor))}`,
    );
    if (b.linha_digitavel) linhas.push(`Linha digitavel: ${b.linha_digitavel}`);
    if (b.pix_copia_cola) linhas.push(`PIX copia e cola: ${b.pix_copia_cola}`);
    linhas.push('');
  }
  const fecho = args.substitui === false ? 'fecho_mesmo' : varios ? 'fecho_substitui_varios' : 'fecho_substitui';
  linhas.push(parteWhatsApp('boleto', fecho, v, args.textos));
  return linhas.join('\n');
}

export interface OrigemBaixa { baixa_status: 'PENDENTE' | 'BAIXADO' | 'ERRO' | 'SEM_REGISTRO' }

/** Quantos originais ainda nao foram baixados no banco (a tela oferece "tentar de novo"). */
export function baixasPendentes(origens: OrigemBaixa[]): number {
  return origens.filter((o) => o.baixa_status === 'PENDENTE' || o.baixa_status === 'ERRO').length;
}

/**
 * O banco recusou a baixa porque o titulo JA ESTAVA baixado (Sicredi 0078: "titulo ja baixado" —
 * acontece com boleto vencido ha muito tempo, que o banco baixa sozinho pelo prazo). O objetivo
 * da baixa — o original nao poder mais ser pago — ja esta cumprido, entao isso conta como BAIXADO,
 * nao como erro. Liquidado (pago) NAO entra aqui: esse e outro caso e segue como erro.
 */
export function baixaJaFeitaNoBanco(mensagem: string | null | undefined): boolean {
  const m = (mensagem ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/liquidad|pago/.test(m)) return false;
  return /\b0078\b/.test(m) || /(titulo|boleto) ja (esta )?baixado/.test(m);
}

export const ROTULO_BAIXA: Record<OrigemBaixa['baixa_status'], string> = {
  PENDENTE: 'baixa pendente',
  BAIXADO: 'baixado no banco',
  ERRO: 'baixa recusada',
  SEM_REGISTRO: 'cancelado (não estava no banco)',
};

// ---------------------------------------------------------------------------
// 0193: TIRAR UM VEICULO DE UM BOLETO (Boletos e 2a via)
// ---------------------------------------------------------------------------

/**
 * O boleto oferece "Tirar um veiculo"? So o negociavel e que pode cobrar mais
 * de um: o do Mutual sem veiculo (o agrupado, pelo contrato) e o do SCar (o
 * banco confere se a fatura tem mais de um item).
 */
export function podeTirarVeiculo(b: BoletoNegociavel & { placa?: string | null }): boolean {
  if (motivoNaoNegociavel(b)) return false;
  return b.origem === 'MUTUAL' ? !b.placa : true;
}

export interface VeiculoNoBoleto {
  veiculo_id: string;
  na_base: boolean;
  mensalidade: number;
  valor_veiculo: number;
  valor_boleto: number;
  soma_pesos: number;
}

/**
 * A conta da tela, igual a do banco: a parte do veiculo (a sugerida ou a
 * informada), o boleto novo e se a soma das mensalidades bate com o boleto.
 */
export function contaTirarVeiculo(
  veiculos: VeiculoNoBoleto[],
  veiculoId: string | null,
  parteInformada: number | null,
): { parte: number; novo: number; bate: boolean; erro: string | null } {
  const valor = veiculos[0]?.valor_boleto ?? 0;
  const soma = veiculos[0]?.soma_pesos ?? 0;
  const bate = Math.round(soma * 100) === Math.round(valor * 100);
  const v = veiculos.find((x) => x.veiculo_id === veiculoId);
  const parte = Math.round(((parteInformada ?? v?.valor_veiculo) ?? 0) * 100) / 100;
  const novo = Math.round((valor - parte) * 100) / 100;
  let erro: string | null = null;
  if (veiculos.length < 2) erro = 'Este boleto cobra um veículo só: para tirá-lo, cancele o boleto.';
  else if (!v) erro = 'Escolha o veículo que sai do boleto.';
  else if (parte <= 0) erro = 'Informe quanto do boleto é deste veículo.';
  else if (novo <= 0) erro = 'Tirando este veículo não sobra valor: cancele o boleto.';
  else if (!veiculos.some((x) => x.veiculo_id !== veiculoId && x.na_base)) erro = 'Nenhum outro veículo deste boleto está na base.';
  return { parte, novo, bate, erro };
}
