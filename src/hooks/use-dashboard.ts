'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { PainelVisaoGeral } from '@/lib/visao-geral';
import type { PainelProdutos } from '@/lib/painel-produtos';

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

/** Aba Produtos do Painel (0194): opcionais contratados pela base. */
export function usePainelProdutos(regionalId: string | null) {
  const supabase = createClient();
  return useQuery<PainelProdutos | null>({
    queryKey: ['dashboard', 'produtos', regionalId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('painel_produtos', { p_regional_id: regionalId });
      if (error) throw error;
      return (data as unknown as PainelProdutos | null) ?? null;
    },
    staleTime: 60_000,
  });
}
