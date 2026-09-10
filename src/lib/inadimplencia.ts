/**
 * Inadimplencia do VEICULO (0072) — a tolerancia antes de inativar.
 *
 * O ciclo: mensalidade atrasada -> `inadimplente` (beneficios bloqueados na
 * hora) -> passados N dias nesse status, `inativo`. O CRON que executa as duas
 * passagens sera construido depois; o que mora aqui e a REGRA que ele vai
 * aplicar, espelhada do SQL da 0072 (`situacao_inadimplencia_veiculo`,
 * `tolerancia_inadimplencia`, `dias_no_status_veiculo`).
 *
 * Mexeu de um lado, mexa do outro — e nos dois testes.
 */
import type { StatusVeiculo } from '@/lib/database.types';

/** Tolerancia usada quando a empresa ainda nao foi cadastrada. Espelha o SQL. */
export const DIAS_TOLERANCIA_PADRAO = 20;

/**
 * Quem gera mensalidade. **`inadimplente` esta aqui de proposito**: ele ainda
 * tem contrato, so perdeu os beneficios — quem encerra a cobranca e `inativo`,
 * no fim da tolerancia. Espelha `veiculo_faturavel` (0024/0072).
 */
export const STATUS_FATURAVEIS: StatusVeiculo[] = [
  'ativo', 'em_evento', 'vistoria_pendente', 'inadimplente',
];

/** Status que impedem qualquer beneficio (24h, evento, carro reserva). */
export const STATUS_BLOQUEADOS: StatusVeiculo[] = ['suspenso', 'inadimplente'];

export function bloqueiaBeneficios(status: StatusVeiculo): boolean {
  return status !== 'ativo';
}

/** Dias corridos no status atual. `status_desde` nulo = sem relogio (0). */
export function diasNoStatus(statusDesde: string | null | undefined, hoje = new Date()): number {
  if (!statusDesde) return 0;
  const desde = new Date(statusDesde);
  if (Number.isNaN(desde.getTime())) return 0;
  const dia = 24 * 60 * 60 * 1000;
  const d0 = Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const d1 = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.max(0, Math.round((d1 - d0) / dia));
}

export interface VeiculoComRelogio {
  status: StatusVeiculo;
  status_desde?: string | null;
}

export interface Tolerancia {
  inadimplente: boolean;
  diasNoStatus: number;
  diasTolerancia: number;
  /** Null quando o veiculo nao esta inadimplente — nao ha prazo correndo. */
  diasRestantes: number | null;
  vencida: boolean;
}

/**
 * Contagem regressiva da tolerancia. Espelho de
 * `situacao_inadimplencia_veiculo`: `vencida` e o gatilho que o CRON le para
 * mover o veiculo a `inativo`.
 */
export function tolerancia(
  veiculo: VeiculoComRelogio,
  diasTolerancia = DIAS_TOLERANCIA_PADRAO,
  hoje = new Date(),
): Tolerancia {
  const limite = Math.max(0, Math.trunc(diasTolerancia));
  const dias = diasNoStatus(veiculo.status_desde, hoje);
  if (veiculo.status !== 'inadimplente') {
    return { inadimplente: false, diasNoStatus: dias, diasTolerancia: limite, diasRestantes: null, vencida: false };
  }
  return {
    inadimplente: true,
    diasNoStatus: dias,
    diasTolerancia: limite,
    diasRestantes: Math.max(0, limite - dias),
    vencida: dias >= limite,
  };
}

/**
 * O texto que a tela mostra ao lado do selo. Fala em dias RESTANTES, nao em
 * dias corridos: o que a operacao precisa saber e quanto tempo ainda tem para
 * cobrar antes de perder o associado.
 */
export function avisoDeTolerancia(t: Tolerancia): string | null {
  if (!t.inadimplente) return null;
  if (t.vencida) return 'Tolerancia vencida — sera inativado';
  if (t.diasRestantes === 1) return 'Inativa amanha';
  return `Inativa em ${t.diasRestantes} dias`;
}
