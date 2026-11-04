// O resumo POR RASTREADORA (os cartões da aba "Planilha da rastreadora"):
// quantos veículos cada uma rastreia, onde estão, quanto custa e o que pede ação.
// Duas fontes, porque são dois níveis (ver CLAUDE.md, Rastreadores):
//   - a FICHA do veículo (veiculos.empresa_rastreamento_id) — o que diz quem rastreia;
//   - o PARQUE (rastreadores, por IMEI) — só quem mandou o IMEI está lá.

export interface VeiculoDaRastreadora {
  id: string;
  placa: string | null;
  status: string;
  empresa_rastreamento_id: string;
  rastreador_imei: string | null;
  regional: string | null;
  associado: string | null;
}

export interface EquipamentoDoParque {
  empresa_rastreamento_id: string | null;
  status: string;
  veiculo_id: string | null;
}

export interface RastreadoraBase {
  id: string;
  nome: string;
  custo_mensal_equipamento: number | null;
}

export interface ResumoRastreadora {
  id: string;
  nome: string;
  /** veículos cuja ficha aponta para ela */
  veiculos: number;
  /** desses, os que estão na base (ativo, em evento, vistoria, inadimplente) */
  naBase: number;
  /** ligados a ela e FORA da base: equipamento a recolher / cobrança a questionar */
  foraDaBase: number;
  /** ligados só pela ficha, sem equipamento no parque (planilha sem IMEI) */
  semParque: number;
  /** equipamentos no parque por status */
  parqueAtivo: number;
  parqueInadimplente: number;
  parqueInativo: number;
  parqueTotal: number;
  /** custo mensal estimado = veículos na base × custo do equipamento no cadastro */
  custoEstimado: number | null;
  porUnidade: { unidade: string; veiculos: number }[];
}

export const STATUS_NA_BASE = ['ativo', 'em_evento', 'vistoria_pendente', 'inadimplente'];

export function resumoPorRastreadora(
  rastreadoras: RastreadoraBase[],
  veiculos: VeiculoDaRastreadora[],
  parque: EquipamentoDoParque[],
): ResumoRastreadora[] {
  const out = new Map<string, ResumoRastreadora & { _un: Map<string, number> }>();
  for (const r of rastreadoras) {
    out.set(r.id, {
      id: r.id, nome: r.nome, veiculos: 0, naBase: 0, foraDaBase: 0, semParque: 0,
      parqueAtivo: 0, parqueInadimplente: 0, parqueInativo: 0, parqueTotal: 0,
      custoEstimado: null, porUnidade: [], _un: new Map(),
    });
  }
  // veículos com equipamento ativo/inadimplente no parque
  const noParque = new Set(
    parque.filter((p) => p.veiculo_id && (p.status === 'ATIVO' || p.status === 'INADIMPLENTE')).map((p) => p.veiculo_id!),
  );
  for (const v of veiculos) {
    const r = out.get(v.empresa_rastreamento_id);
    if (!r) continue;
    r.veiculos++;
    if (STATUS_NA_BASE.includes(v.status)) {
      r.naBase++;
      const un = v.regional ?? 'Matriz';
      r._un.set(un, (r._un.get(un) ?? 0) + 1);
      if (!noParque.has(v.id)) r.semParque++;
    } else {
      r.foraDaBase++;
    }
  }
  for (const p of parque) {
    const r = p.empresa_rastreamento_id ? out.get(p.empresa_rastreamento_id) : undefined;
    if (!r) continue;
    r.parqueTotal++;
    if (p.status === 'ATIVO') r.parqueAtivo++;
    else if (p.status === 'INADIMPLENTE') r.parqueInadimplente++;
    else if (p.status === 'INATIVO') r.parqueInativo++;
  }
  const custo = new Map(rastreadoras.map((r) => [r.id, r.custo_mensal_equipamento]));
  return [...out.values()]
    .map(({ _un, ...r }) => {
      const c = custo.get(r.id);
      return {
        ...r,
        custoEstimado: c && c > 0 ? Math.round(c * r.naBase * 100) / 100 : null,
        porUnidade: [..._un.entries()]
          .map(([unidade, n]) => ({ unidade, veiculos: n }))
          .sort((a, b) => b.veiculos - a.veiculos || a.unidade.localeCompare(b.unidade)),
      };
    })
    .filter((r) => r.veiculos > 0 || r.parqueTotal > 0)
    .sort((a, b) => b.naBase - a.naBase || a.nome.localeCompare(b.nome));
}
