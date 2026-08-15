// Regras de negocio do SAC / Visao 360 em TypeScript puro (sem I/O), espelhando
// as funcoes SQL (opcionais_elegibilidade / gerar_faturas_cliente). Ficam aqui
// para reuso na UI e cobertura por testes unitarios.
import type { OpcionalElegibilidade, TipoFaturamento } from '@/lib/database.types';

// ---------------------------------------------------------------------------
// Limite flutuante de opcionais (ultimos N dias a partir de "hoje")
// ---------------------------------------------------------------------------
export interface OpcionalCfg {
  produto_id: string;
  nome: string;
  quantidade_limite: number;
  janela_dias: number;
  tipo_evento_id: string | null;
}
export interface EventoUso {
  tipo_evento_id: string | null;
  data_ocorrencia: string; // YYYY-MM-DD
}

/** Elegibilidade por janela flutuante: conta eventos do mesmo tipo nos ultimos
 *  `janela_dias` (inclusive o limite) a partir de `hoje`. */
export function calcularElegibilidade(
  opcionais: OpcionalCfg[],
  eventos: EventoUso[],
  hoje: Date = new Date(),
): OpcionalElegibilidade[] {
  return opcionais.map((o) => {
    // Janela por DATA pura (igual ao SQL current_date - janela_dias), inclusiva.
    const base = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
    base.setUTCDate(base.getUTCDate() - o.janela_dias);
    const inicioStr = base.toISOString().slice(0, 10);
    const usos = eventos.filter(
      (e) =>
        e.tipo_evento_id != null &&
        e.tipo_evento_id === o.tipo_evento_id &&
        e.data_ocorrencia >= inicioStr,
    );
    const usados = usos.length;
    const ultimo = usos.reduce<string | null>(
      (m, e) => (m === null || e.data_ocorrencia > m ? e.data_ocorrencia : m),
      null,
    );
    return {
      produto_id: o.produto_id,
      nome: o.nome,
      quantidade_limite: o.quantidade_limite,
      janela_dias: o.janela_dias,
      usados,
      elegivel: usados < o.quantidade_limite,
      ultimo_uso: ultimo,
    };
  });
}

// ---------------------------------------------------------------------------
// Montagem de faturas por modo (Agrupado x Individual)
// ---------------------------------------------------------------------------
export interface VeiculoFaturavel {
  id: string;
  placa?: string | null;
  modelo?: string | null;
  tipo_faturamento: TipoFaturamento;
}
export interface FaturaItemPlan {
  veiculo_id: string;
  descricao: string;
  valor: number;
}
export interface PlanoFaturas {
  agrupada: { itens: FaturaItemPlan[]; total: number } | null;
  individuais: { veiculo_id: string; itens: FaturaItemPlan[]; total: number }[];
}

const descricaoVeiculo = (v: VeiculoFaturavel) => `${v.placa ?? ''} - ${v.modelo ?? 'veiculo'}`;

/** Monta o conjunto de faturas do associado respeitando o modo de cada veiculo:
 *  1 fatura AGRUPADA (com um item por veiculo agrupado) + N faturas INDIVIDUAIS. */
export function montarFaturas(
  veiculos: VeiculoFaturavel[],
  valorDe: (v: VeiculoFaturavel) => number,
): PlanoFaturas {
  const agrupados = veiculos.filter((v) => v.tipo_faturamento === 'AGRUPADO_ASSOCIADO');
  const individuais = veiculos.filter((v) => v.tipo_faturamento === 'INDIVIDUAL_VEICULO');

  const agrupada = agrupados.length
    ? {
        itens: agrupados.map((v) => ({ veiculo_id: v.id, descricao: descricaoVeiculo(v), valor: valorDe(v) })),
        total: agrupados.reduce((s, v) => s + valorDe(v), 0),
      }
    : null;

  return {
    agrupada,
    individuais: individuais.map((v) => {
      const item = { veiculo_id: v.id, descricao: descricaoVeiculo(v), valor: valorDe(v) };
      return { veiculo_id: v.id, itens: [item], total: item.valor };
    }),
  };
}

// ---------------------------------------------------------------------------
// Status financeiro (resumo de adimplencia a partir de titulos)
// ---------------------------------------------------------------------------
export interface TituloResumo {
  status: 'pendente' | 'pago' | 'cancelado' | 'vencido';
  data_vencimento: string;
  valor: number;
}
export interface StatusFinanceiro {
  abertos: number;
  pagos: number;
  vencidos: number;
  valorEmAberto: number;
  adimplente: boolean;
}

// Inadimplencia por veiculo: titulo vencido ligado ao veiculo, ou titulo
// agrupado (veiculo_id nulo) vencido quando o veiculo e faturado de forma agrupada.
export interface TituloVeiculo {
  veiculo_id: string | null;
  status: 'pendente' | 'pago' | 'cancelado' | 'vencido';
  data_vencimento: string;
}
export function veiculoInadimplente(
  veiculo: { id: string; tipo_faturamento: TipoFaturamento },
  titulos: TituloVeiculo[],
  hoje: Date = new Date(),
): boolean {
  const hojeStr = hoje.toISOString().slice(0, 10);
  const vencido = (t: TituloVeiculo) => t.status === 'vencido' || (t.status === 'pendente' && t.data_vencimento < hojeStr);
  return titulos.some(
    (t) => vencido(t) && (t.veiculo_id === veiculo.id || (t.veiculo_id === null && veiculo.tipo_faturamento === 'AGRUPADO_ASSOCIADO')),
  );
}

// Rotulo/cor de status para a LISTA resumida (Ativo/Inadimplente/Inativo/Cancelado...).
export function statusVeiculoResumo(status: string, inadimplente: boolean): { label: string; cor: string } {
  if (status === 'baixado') return { label: 'Cancelado', cor: 'bg-slate-100 text-slate-600' };
  if (status === 'inativo' || status === 'excluido') return { label: 'Inativo', cor: 'bg-slate-100 text-slate-600' };
  if (status === 'suspenso') return { label: 'Suspenso', cor: 'bg-amber-50 text-amber-700' };
  if (status === 'vistoria_pendente') return { label: 'Vistoria pendente', cor: 'bg-amber-50 text-amber-700' };
  if (status === 'em_evento') return { label: 'Em evento', cor: 'bg-cyan-50 text-cyan-700' };
  if (inadimplente) return { label: 'Inadimplente', cor: 'bg-rose-50 text-rose-700' };
  return { label: 'Ativo', cor: 'bg-emerald-50 text-emerald-700' };
}

export function resumoFinanceiro(titulos: TituloResumo[], hoje: Date = new Date()): StatusFinanceiro {
  let abertos = 0, pagos = 0, vencidos = 0, valorEmAberto = 0;
  const hojeStr = hoje.toISOString().slice(0, 10);
  for (const t of titulos) {
    if (t.status === 'pago' || t.status === 'cancelado') {
      if (t.status === 'pago') pagos += 1;
      continue;
    }
    abertos += 1;
    valorEmAberto += t.valor;
    if (t.status === 'vencido' || t.data_vencimento < hojeStr) vencidos += 1;
  }
  return { abertos, pagos, vencidos, valorEmAberto, adimplente: vencidos === 0 };
}
