'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { PainelVisaoGeral } from '@/lib/visao-geral';

// Visao Geral (0100): o painel inteiro em UMA chamada — ~12 blocos em
// requisicoes separadas disputariam o teto de tempo do banco.
export function useVisaoGeral(regionalId: string | null, meses: number) {
  const supabase = createClient();
  return useQuery<PainelVisaoGeral | null>({
    queryKey: ['dashboard', 'visao-geral', regionalId, meses],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('painel_visao_geral', {
        p_regional_id: regionalId,
        p_meses: meses,
      });
      if (error) throw error;
      return (data as unknown as PainelVisaoGeral | null) ?? null;
    },
    staleTime: 60_000,
  });
}
