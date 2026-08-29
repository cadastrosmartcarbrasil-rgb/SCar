'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { periodoAnterior } from '@/lib/financeiro';
import type { DreLinha, DreMes, DreResumo, RegimeDre } from '@/lib/database.types';

export interface DreFiltro {
  inicio: string;
  fim: string;
  regionalId?: string | null;
  /** CAIXA = quando o dinheiro circulou. COMPETENCIA = mes do fato gerador. */
  regime?: RegimeDre;
  centroCustoId?: string | null;
}

function args(f: DreFiltro) {
  return {
    p_data_inicio: f.inicio,
    p_data_fim: f.fim,
    p_regional_id: f.regionalId ?? null,
    p_regime: f.regime ?? ('CAIXA' as RegimeDre),
    p_centro_custo_id: f.centroCustoId ?? null,
  };
}

function chave(f: DreFiltro) {
  return [f.inicio, f.fim, f.regionalId ?? 'all', f.regime ?? 'CAIXA', f.centroCustoId ?? 'all'];
}

// DRE analitico por categoria (RPC gerar_dre_completo).
export function useDre(f: DreFiltro) {
  const supabase = createClient();
  return useQuery<DreLinha[]>({
    queryKey: ['dre', 'linhas', ...chave(f)],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('gerar_dre_completo', args(f));
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Mesmo relatorio no periodo imediatamente anterior (coluna comparativa).
export function useDreComparativo(f: DreFiltro, ativo: boolean) {
  const supabase = createClient();
  const anterior = periodoAnterior(f.inicio, f.fim);
  return useQuery<DreLinha[]>({
    queryKey: ['dre', 'linhas', 'anterior', ...chave({ ...f, ...anterior })],
    enabled: ativo,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('gerar_dre_completo', args({ ...f, ...anterior }));
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Resumo consolidado (RPC gerar_dre_resumo_completo).
export function useDreResumo(f: DreFiltro) {
  const supabase = createClient();
  return useQuery<DreResumo | null>({
    queryKey: ['dre', 'resumo', ...chave(f)],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('gerar_dre_resumo_completo', args(f));
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

// Serie mensal do resultado (grafico de evolucao).
export function useDreMensal(f: DreFiltro) {
  const supabase = createClient();
  return useQuery<DreMes[]>({
    queryKey: ['dre', 'mensal', ...chave(f)],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('gerar_dre_mensal', args(f));
      if (error) throw error;
      return data ?? [];
    },
  });
}
