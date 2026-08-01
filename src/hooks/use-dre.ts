'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { DreLinha, DreResumo } from '@/lib/database.types';

export interface DreFiltro {
  inicio: string;
  fim: string;
  regionalId?: string | null;
}

// DRE detalhado por categoria (RPC gerar_dre).
export function useDre({ inicio, fim, regionalId }: DreFiltro) {
  const supabase = createClient();
  return useQuery<DreLinha[]>({
    queryKey: ['dre', inicio, fim, regionalId ?? 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('gerar_dre', {
        p_data_inicio: inicio,
        p_data_fim: fim,
        p_regional_id: regionalId ?? null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Resumo consolidado (RPC gerar_dre_resumo).
export function useDreResumo({ inicio, fim, regionalId }: DreFiltro) {
  const supabase = createClient();
  return useQuery<DreResumo | null>({
    queryKey: ['dre', 'resumo', inicio, fim, regionalId ?? 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('gerar_dre_resumo', {
        p_data_inicio: inicio,
        p_data_fim: fim,
        p_regional_id: regionalId ?? null,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}
