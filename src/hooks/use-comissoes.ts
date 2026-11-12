'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  ComissaoMatrizDesempenho,
  ComissaoMatrizPrevia,
  ComissoesConfigRow,
  ComissoesMatrizLotesRow,
} from '@/lib/database.types';

// Gestao de comissoes pela matriz (0198). As RPCs sao escopadas no banco:
// matriz ve tudo; gestor regional, so a propria unidade.

export function useComissoesDesempenho(competencia: string, regionalId?: string | null, meses = 3) {
  const supabase = createClient();
  return useQuery<ComissaoMatrizDesempenho[]>({
    queryKey: ['comissoes-matriz', 'desempenho', competencia, regionalId ?? null, meses],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('comissoes_matriz_desempenho', {
        p_competencia: competencia,
        p_meses: meses,
        p_regional_id: regionalId || null,
      });
      if (error) throw error;
      return (data ?? []) as ComissaoMatrizDesempenho[];
    },
  });
}

export function useComissoesPrevia(competencia: string, regionalId: string | null, habilitado: boolean) {
  const supabase = createClient();
  return useQuery<ComissaoMatrizPrevia[]>({
    queryKey: ['comissoes-matriz', 'previa', competencia, regionalId],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('comissoes_matriz_previa', {
        p_competencia: competencia,
        p_regional_id: regionalId || null,
      });
      if (error) throw error;
      return (data ?? []) as ComissaoMatrizPrevia[];
    },
  });
}

export function useComissoesConfig() {
  const supabase = createClient();
  return useQuery<ComissoesConfigRow | null>({
    queryKey: ['comissoes-matriz', 'config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('comissoes_config').select('*').maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveComissoesConfig() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: ComissoesConfigRow) => {
      const { error } = await supabase
        .from('comissoes_config')
        .update({
          exigir_vendedor_ativo: c.exigir_vendedor_ativo,
          dia_vencimento_padrao: c.dia_vencimento_padrao,
          geracao_automatica: c.geracao_automatica,
          dia_geracao_automatica: c.dia_geracao_automatica,
        })
        .eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comissoes-matriz', 'config'] }),
  });
}

export type LoteComRel = ComissoesMatrizLotesRow & {
  regionais?: { nome: string } | null;
  usuarios?: { nome: string } | null;
};

export function useComissoesLotes(habilitado: boolean) {
  const supabase = createClient();
  return useQuery<LoteComRel[]>({
    queryKey: ['comissoes-matriz', 'lotes'],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comissoes_matriz_lotes')
        .select('*, regionais(nome), usuarios(nome)')
        .order('created_at', { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []) as LoteComRel[];
    },
  });
}

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['comissoes-matriz'] });
  qc.invalidateQueries({ queryKey: ['lancamentos'] });
  qc.invalidateQueries({ queryKey: ['financeiro'] });
}

/** Recalcula a competencia (so o que ainda nao foi ao contas a pagar). */
export function useApurarComissoes() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { competencia: string; regionalId: string | null }) => {
      const { data, error } = await supabase.rpc('apurar_comissoes_matriz', {
        p_competencia: p.competencia,
        p_regional_id: p.regionalId || null,
      });
      if (error) throw error;
      return data as { itens: number; valor_total: number } | null;
    },
    onSuccess: () => invalidar(qc),
  });
}

/** 1 titulo por favorecido no contas a pagar, com o vencimento escolhido. */
export function useGerarContasPagarComissoes() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { competencia: string; vencimento: string; regionalId: string | null }) => {
      const { data, error } = await supabase.rpc('gerar_contas_pagar_comissoes_matriz', {
        p_competencia: p.competencia,
        p_vencimento: p.vencimento,
        p_regional_id: p.regionalId || null,
      });
      if (error) throw error;
      return data as ComissoesMatrizLotesRow;
    },
    onSuccess: () => invalidar(qc),
  });
}
