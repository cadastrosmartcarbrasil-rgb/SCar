'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { DreLinha, DreResumo, ResumoCentroCusto } from '@/lib/database.types';

export interface DreFiltro {
  inicio: string;
  fim: string;
  regionalId?: string | null;
  centroCustoId?: string | null;   // isola um centro de custo (ex.: Assistencia 24h)
}

// DRE detalhado por categoria (RPC gerar_dre).
export function useDre({ inicio, fim, regionalId, centroCustoId }: DreFiltro) {
  const supabase = createClient();
  return useQuery<DreLinha[]>({
    queryKey: ['dre', inicio, fim, regionalId ?? 'all', centroCustoId ?? 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('gerar_dre', {
        p_data_inicio: inicio,
        p_data_fim: fim,
        p_regional_id: regionalId ?? null,
        p_centro_custo_id: centroCustoId ?? null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Resumo consolidado (RPC gerar_dre_resumo).
export function useDreResumo({ inicio, fim, regionalId, centroCustoId }: DreFiltro) {
  const supabase = createClient();
  return useQuery<DreResumo | null>({
    queryKey: ['dre', 'resumo', inicio, fim, regionalId ?? 'all', centroCustoId ?? 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('gerar_dre_resumo', {
        p_data_inicio: inicio,
        p_data_fim: fim,
        p_regional_id: regionalId ?? null,
        p_centro_custo_id: centroCustoId ?? null,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

// Receitas x Despesas por CENTRO DE CUSTO (isola a operacao 24h e as demais).
export function useResumoCentroCusto({ inicio, fim, regionalId }: DreFiltro) {
  const supabase = createClient();
  return useQuery<ResumoCentroCusto[]>({
    queryKey: ['dre', 'centro-custo', inicio, fim, regionalId ?? 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('resumo_por_centro_custo', {
        p_data_inicio: inicio,
        p_data_fim: fim,
        p_regional_id: regionalId ?? null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
