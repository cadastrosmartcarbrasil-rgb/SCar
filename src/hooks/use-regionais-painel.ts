'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  ContaPlanoPainel, IntervaloContasPainel, RegionaisPainelLinha,
  RegionaisPainelPonto, RegionaisPainelResumo,
} from '@/lib/database.types';

/**
 * Painel executivo das Regionais (0078).
 *
 * O recorte do plano de contas NAO e enviado pela tela: as RPCs caem no que
 * esta salvo em `empresa` quando o parametro vem nulo. Assim o numero que a
 * diretoria le e o mesmo para todo mundo, e trocar o recorte e um `invalidate`
 * de `['regionais','painel']` — nao uma mudanca de chave de cache por usuario.
 */
export interface FiltroPainelRegionais {
  inicio: string;
  fim: string;
  regionalId?: string | null;
}

const chave = (f: FiltroPainelRegionais) => [f.inicio, f.fim, f.regionalId ?? 'todas'];

export function usePainelRegionaisResumo(f: FiltroPainelRegionais, habilitado = true) {
  const supabase = createClient();
  return useQuery<RegionaisPainelResumo | null>({
    queryKey: ['regionais', 'painel', 'resumo', ...chave(f)],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('regionais_painel_resumo', {
        p_data_inicio: f.inicio, p_data_fim: f.fim, p_regional_id: f.regionalId ?? null,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function usePainelRegionaisSerie(
  f: FiltroPainelRegionais,
  granularidade: string | null = null,
  habilitado = true,
) {
  const supabase = createClient();
  return useQuery<RegionaisPainelPonto[]>({
    queryKey: ['regionais', 'painel', 'serie', ...chave(f), granularidade ?? 'auto'],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('regionais_painel_serie', {
        p_data_inicio: f.inicio, p_data_fim: f.fim,
        p_regional_id: f.regionalId ?? null, p_granularidade: granularidade,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * O comparativo NAO recebe regional: e a visao de todas as unidades, e o
 * banco ja limita quem nao tem acesso global a propria linha. Filtrar o
 * ranking pela unidade escolhida esvaziaria justamente a comparacao.
 */
export function usePainelRegionaisComparativo(
  periodo: { inicio: string; fim: string },
  habilitado = true,
) {
  const supabase = createClient();
  return useQuery<RegionaisPainelLinha[]>({
    queryKey: ['regionais', 'painel', 'comparativo', periodo.inicio, periodo.fim],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('regionais_painel_comparativo', {
        p_data_inicio: periodo.inicio, p_data_fim: periodo.fim,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Intervalo de contas (a engrenagem) — institucional, nao do navegador
// ---------------------------------------------------------------------------
export function useIntervaloContas() {
  const supabase = createClient();
  return useQuery<IntervaloContasPainel>({
    queryKey: ['regionais', 'painel', 'intervalo-contas'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('intervalo_contas_painel');
      if (error) throw error;
      return data?.[0] ?? { conta_de: null, conta_ate: null };
    },
  });
}

export function useContasPlano() {
  const supabase = createClient();
  return useQuery<ContaPlanoPainel[]>({
    queryKey: ['regionais', 'painel', 'contas-plano'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('contas_plano_painel');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSalvarIntervaloContas() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { de: string | null; ate: string | null }) => {
      const { error } = await supabase.rpc('salvar_intervalo_contas_painel', {
        p_conta_de: v.de, p_conta_ate: v.ate,
      });
      if (error) throw error;
    },
    // Muda o numero de TODOS os blocos: o painel inteiro sai de cache.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['regionais', 'painel'] }),
  });
}
