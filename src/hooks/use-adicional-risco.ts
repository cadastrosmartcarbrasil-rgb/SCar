'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { AdicionalRiscoLinha } from '@/lib/database.types';

/**
 * O adicional de risco mora em Precificacao -> Tabela de Precos, junto da
 * regra do rastreador (0019) — as duas sao regras que sobem por cima da matriz
 * INTEIRA de um tipo de veiculo, e quem pensa preco esta olhando essa tela.
 */
export function useAdicionaisDoTipo(tipoVeiculoId?: string) {
  const supabase = createClient();
  return useQuery<AdicionalRiscoLinha[]>({
    queryKey: ['precificacao', 'adicional', tipoVeiculoId ?? 'nenhum'],
    enabled: !!tipoVeiculoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('adicionais_risco_do_tipo', {
        p_tipo_veiculo_id: tipoVeiculoId!,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSalvarAdicionalRisco() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      regionalId: string;
      tipoVeiculoId: string;
      valor: number | null;      // null/0 = RETIRA o adicional
      justificativa?: string | null;
    }) => {
      const { error } = await supabase.rpc('salvar_adicional_risco', {
        p_regional_id: v.regionalId,
        p_tipo_veiculo_id: v.tipoVeiculoId,
        p_valor: v.valor,
        p_justificativa: v.justificativa ?? null,
      });
      if (error) throw error;
    },
    // O preco mudou: qualquer cotacao em cache virou mentira.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['precificacao'] });
      qc.invalidateQueries({ queryKey: ['vendas'] });
    },
  });
}
