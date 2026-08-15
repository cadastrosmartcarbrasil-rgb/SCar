// Regras de COBRANCA (mensalidade) em TypeScript puro (sem I/O), espelhando as
// funcoes SQL da migration 0024 (calcular_vencimento / valor_mensalidade_veiculo
// / veiculo_faturavel / dia_vencimento_agrupado). Ficam aqui para reuso na UI
// (previa antes de gerar o lote) e cobertura por testes unitarios.
import type { StatusVeiculo, TipoFaturamento } from '@/lib/database.types';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (ano: number, mes: number, dia: number) => `${ano}-${pad(mes)}-${pad(dia)}`;

/** Competencia (mes de referencia) sempre no dia 1: 'YYYY-MM' | 'YYYY-MM-DD' -> 'YYYY-MM-01'. */
export function competenciaDe(mes: string): string {
  const [ano, m] = mes.split('-').map(Number);
  return iso(ano, m, 1);
}

const MESES = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** 'YYYY-MM-01' -> 'Marco/2026' */
export function rotuloCompetencia(competencia: string): string {
  const [ano, m] = competencia.split('-').map(Number);
  return `${MESES[m - 1]}/${ano}`;
}

/** Competencias de um lote por periodo (espelha `gerar_faturas_periodo`):
 *  N meses consecutivos a partir da competencia inicial. */
export function competenciasDoPeriodo(competenciaInicial: string, meses: number): string[] {
  const [ano, m] = competenciaInicial.split('-').map(Number);
  const total = Math.min(Math.max(Math.trunc(meses), 1), 24);
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(Date.UTC(ano, m - 1 + i, 1));
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  });
}

/** Ultimo dia do mes da competencia. */
export function ultimoDiaDoMes(competencia: string): number {
  const [ano, m] = competencia.split('-').map(Number);
  return new Date(Date.UTC(ano, m, 0)).getUTCDate();
}

/** Vencimento da competencia pelo dia escolhido pelo associado.
 *  Dia maior que o ultimo dia do mes cai no ultimo dia (31 em fevereiro -> 28/29).
 *  Sem dia definido mantem o padrao historico: dia 10 do mes seguinte. */
export function calcularVencimento(competencia: string, dia: number | null | undefined): string {
  const [ano, m] = competencia.split('-').map(Number);
  if (dia == null || dia < 1) {
    const anoSeg = m === 12 ? ano + 1 : ano;
    const mesSeg = m === 12 ? 1 : m + 1;
    return iso(anoSeg, mesSeg, 10);
  }
  return iso(ano, m, Math.min(dia, ultimoDiaDoMes(competencia)));
}

// ---------------------------------------------------------------------------
// Quem entra na cobranca do mes
// ---------------------------------------------------------------------------
const STATUS_FATURAVEL: StatusVeiculo[] = ['ativo', 'em_evento', 'vistoria_pendente'];

export interface VeiculoCobranca {
  id: string;
  status: StatusVeiculo;
  tipo_faturamento: TipoFaturamento;
  data_ativacao?: string | null;
  dia_vencimento?: number | null;
  valor_mensalidade?: number | null;
}

/** Cobramos veiculo em vigencia (ativo / em evento / vistoria pendente) e ja
 *  ativado ate o fim do mes de referencia. Suspenso/inativo/baixado nao geram. */
export function veiculoFaturavel(v: VeiculoCobranca, competencia: string): boolean {
  if (!STATUS_FATURAVEL.includes(v.status)) return false;
  if (!v.data_ativacao) return true;
  const fimMes = iso(
    Number(competencia.slice(0, 4)),
    Number(competencia.slice(5, 7)),
    ultimoDiaDoMes(competencia),
  );
  return v.data_ativacao <= fimMes;
}

/** Dia de vencimento da fatura AGRUPADA: o mais usado entre os veiculos
 *  agrupados faturaveis (desempate pelo menor dia). Null = padrao legado. */
export function diaVencimentoAgrupado(veiculos: VeiculoCobranca[], competencia: string): number | null {
  const contagem = new Map<number, number>();
  for (const v of veiculos) {
    if (v.tipo_faturamento !== 'AGRUPADO_ASSOCIADO') continue;
    if (v.dia_vencimento == null) continue;
    if (!veiculoFaturavel(v, competencia)) continue;
    contagem.set(v.dia_vencimento, (contagem.get(v.dia_vencimento) ?? 0) + 1);
  }
  let melhor: number | null = null;
  let qtd = 0;
  for (const [dia, n] of contagem) {
    if (n > qtd || (n === qtd && melhor !== null && dia < melhor)) {
      melhor = dia;
      qtd = n;
    }
  }
  return melhor;
}

/** Valor mensal do veiculo: override da ficha > motor de precos (cotar_plano) > 0. */
export function valorMensalidadeVeiculo(
  v: VeiculoCobranca,
  cotar: (veiculo: VeiculoCobranca) => number = () => 0,
): number {
  if (v.valor_mensalidade != null && v.valor_mensalidade > 0) {
    return Math.round(v.valor_mensalidade * 100) / 100;
  }
  const valor = cotar(v);
  return Math.round((Number.isFinite(valor) ? valor : 0) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Previa do lote (o que gerar_faturas_cliente vai emitir)
// ---------------------------------------------------------------------------
export interface PreviaFatura {
  tipo_faturamento: TipoFaturamento;
  veiculo_id: string | null;
  vencimento: string;
  valor_total: number;
  itens: { veiculo_id: string; valor: number }[];
}

/** Monta a previa das faturas do associado na competencia: 1 agrupada (se houver
 *  veiculo agrupado com valor) + 1 por veiculo individual. Faturas zeradas nao
 *  sao emitidas — mesma regra do SQL. */
export function previaFaturas(
  veiculos: VeiculoCobranca[],
  competencia: string,
  cotar?: (v: VeiculoCobranca) => number,
): PreviaFatura[] {
  const faturaveis = veiculos.filter((v) => veiculoFaturavel(v, competencia));
  const faturas: PreviaFatura[] = [];

  const itens = faturaveis
    .filter((v) => v.tipo_faturamento === 'AGRUPADO_ASSOCIADO')
    .map((v) => ({ veiculo_id: v.id, valor: valorMensalidadeVeiculo(v, cotar) }))
    .filter((i) => i.valor > 0);
  const total = Math.round(itens.reduce((s, i) => s + i.valor, 0) * 100) / 100;
  if (total > 0) {
    faturas.push({
      tipo_faturamento: 'AGRUPADO_ASSOCIADO',
      veiculo_id: null,
      vencimento: calcularVencimento(competencia, diaVencimentoAgrupado(faturaveis, competencia)),
      valor_total: total,
      itens,
    });
  }

  for (const v of faturaveis.filter((x) => x.tipo_faturamento === 'INDIVIDUAL_VEICULO')) {
    const valor = valorMensalidadeVeiculo(v, cotar);
    if (valor <= 0) continue;
    faturas.push({
      tipo_faturamento: 'INDIVIDUAL_VEICULO',
      veiculo_id: v.id,
      vencimento: calcularVencimento(competencia, v.dia_vencimento),
      valor_total: valor,
      itens: [{ veiculo_id: v.id, valor }],
    });
  }

  return faturas;
}
