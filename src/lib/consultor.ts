// ============================================================================
// O CONSULTOR DO VEICULO (0195) — como a tela agrupa e escreve.
// Um associado pode ter veiculos vendidos por consultores diferentes: a fila
// de cobranca mostra cada consultor com as placas dele; o veiculo sem
// consultor aparece como "sem consultor", nunca some.
// ============================================================================
import type { ConsultorDoVeiculo } from '@/lib/database.types';
import { identificacaoVeiculo } from '@/lib/placa';

const FORA_DA_BASE = ['inativo', 'baixado', 'excluido'];

export interface ConsultorAgrupado {
  vendedorId: string | null;
  nome: string;
  telefone: string | null;
  ativo: boolean;
  unidade: string | null;
  placas: string[];
}

/**
 * Agrupa os veiculos por consultor. Por padrao so os veiculos na base (a
 * cobranca fala de quem ainda esta ativo); se todos estao fora, usa todos,
 * para a ficha nunca ficar sem resposta. Quem tem consultor vem antes; os
 * sem consultor vao ao fim.
 */
export function consultoresAgrupados(linhas: ConsultorDoVeiculo[], soNaBase = true): ConsultorAgrupado[] {
  const naBase = linhas.filter((l) => !FORA_DA_BASE.includes((l.status ?? '').toLowerCase()));
  const base = soNaBase && naBase.length > 0 ? naBase : linhas;
  const mapa = new Map<string, ConsultorAgrupado>();
  for (const l of base) {
    const chave = l.vendedor_id ?? '__sem__';
    const atual = mapa.get(chave) ?? {
      vendedorId: l.vendedor_id,
      nome: l.vendedor_id ? (l.consultor?.trim() || 'Consultor sem nome') : 'Sem consultor',
      telefone: l.consultor_telefone,
      ativo: l.vendedor_id ? l.consultor_ativo !== false : true,
      unidade: l.consultor_regional,
      placas: [],
    };
    atual.placas.push(identificacaoVeiculo(l.placa, l.chassi));
    mapa.set(chave, atual);
  }
  return [...mapa.values()].sort((a, b) =>
    Number(a.vendedorId === null) - Number(b.vendedorId === null) || b.placas.length - a.placas.length || a.nome.localeCompare(b.nome));
}

/** "CLAUDIA (inativo) · SP" — o rotulo do consultor de um veiculo. */
export function rotuloConsultor(l: Pick<ConsultorDoVeiculo, 'vendedor_id' | 'consultor' | 'consultor_ativo' | 'consultor_regional'> | null | undefined): string {
  if (!l || !l.vendedor_id) return 'Sem consultor';
  const nome = l.consultor?.trim() || 'Consultor sem nome';
  const partes = [l.consultor_ativo === false ? `${nome} (inativo)` : nome];
  if (l.consultor_regional) partes.push(l.consultor_regional);
  return partes.join(' · ');
}
