'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  EventoHistoricoLinha, EventosHistoricoResumo, ImportacaoEventosHistorico, TransporteEventoHistorico,
} from '@/lib/database.types';

const RAIZ = ['eventos-historico'] as const;

/** O quadro da secao na Integracao Mutual (0101). */
export function useEventosHistoricoResumo() {
  const supabase = createClient();
  return useQuery<EventosHistoricoResumo | null>({
    queryKey: [...RAIZ, 'resumo'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('eventos_historico_resumo');
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

/** Importa (ou so conta, com `confirmar: false`) os eventos do Mutual. Re-executavel. */
export function useImportarEventosHistorico() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (confirmar: boolean): Promise<ImportacaoEventosHistorico | null> => {
      const { data, error } = await supabase.rpc('mutual_importar_eventos_historico', { p_confirmar: confirmar });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    onSuccess: (_d, confirmar) => {
      if (!confirmar) return;
      qc.invalidateQueries({ queryKey: RAIZ });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['sac'] });
    },
  });
}

export interface FiltroEventosHistorico {
  busca: string;
  tipo: string | null;
  de: string | null;
  ate: string | null;
  /** 0112: null = todos · false = ainda nao levados ao Kanban · true = ja levados. */
  noKanban: boolean | null;
  pagina: number;
}

export const POR_PAGINA_HISTORICO = 50;

/** A aba Historico de /eventos — paginada no banco. */
export function useEventosHistoricoLista(f: FiltroEventosHistorico) {
  const supabase = createClient();
  return useQuery<EventoHistoricoLinha[]>({
    queryKey: [...RAIZ, 'lista', f],
    queryFn: async () => {
      const termo = f.busca.trim();
      const { data, error } = await supabase.rpc('eventos_historico_listar', {
        p_busca: termo.length >= 2 ? termo : null,
        p_tipo: f.tipo,
        p_de: f.de,
        p_ate: f.ate,
        p_limite: POR_PAGINA_HISTORICO,
        p_offset: f.pagina * POR_PAGINA_HISTORICO,
        p_no_kanban: f.noKanban,
      });
      if (error) throw error;
      return data ?? [];
    },
    placeholderData: (anterior) => anterior,
  });
}

/**
 * Leva ao Kanban os eventos ESCOLHIDOS do historico (0112) — sempre em ABERTO.
 * Devolve uma linha por id com a situacao (LEVADO, JA_NO_KANBAN, SEM_VEICULO...).
 */
export function useTransportarEventosHistorico() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]): Promise<TransporteEventoHistorico[]> => {
      const { data, error } = await supabase.rpc('transportar_eventos_historico', { p_ids: ids });
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RAIZ });
      qc.invalidateQueries({ queryKey: ['eventos'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['sac'] });
    },
  });
}
