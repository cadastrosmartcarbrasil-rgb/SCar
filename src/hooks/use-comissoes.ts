'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  ComissaoDesempenho,
  ComissaoPrevia,
  ComissoesConfigRow,
  ComissoesLotesRow,
} from '@/lib/database.types';

// Painel por regional: ultimos N meses ate a competencia (RPC escopada no banco).
export function useComissoesDesempenho(competencia: string, regionalId?: string | null, meses = 3) {
  const supabase = createClient();
  return useQuery<ComissaoDesempenho[]>({
    queryKey: ['comissoes', 'desempenho', competencia, regionalId ?? null, meses],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('comissoes_desempenho', {
        p_competencia: competencia,
        p_meses: meses,
        p_regional_id: regionalId || null,
      });
      if (error) throw error;
      return (data ?? []) as ComissaoDesempenho[];
    },
  });
}

// O que ainda nao foi enviado ao contas a pagar (ate a competencia).
export function useComissoesPrevia(competencia: string, regionalId?: string | null, habilitado = true) {
  const supabase = createClient();
  return useQuery<ComissaoPrevia[]>({
    queryKey: ['comissoes', 'previa', competencia, regionalId ?? null],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('comissoes_previa_pagamento', {
        p_competencia: competencia,
        p_regional_id: regionalId || null,
      });
      if (error) throw error;
      return (data ?? []) as ComissaoPrevia[];
    },
  });
}

export function useComissoesConfig() {
  const supabase = createClient();
  return useQuery<ComissoesConfigRow | null>({
    queryKey: ['comissoes', 'config'],
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
    mutationFn: async (c: Partial<ComissoesConfigRow>) => {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comissoes', 'config'] }),
  });
}

export type LoteComRel = ComissoesLotesRow & {
  regionais?: { nome: string } | null;
  usuarios?: { nome: string } | null;
};

export function useComissoesLotes() {
  const supabase = createClient();
  return useQuery<LoteComRel[]>({
    queryKey: ['comissoes', 'lotes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comissoes_lotes')
        .select('*, regionais(nome), usuarios(nome)')
        .order('created_at', { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []) as LoteComRel[];
    },
  });
}

function invalidarTudo(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['comissoes'] });
  qc.invalidateQueries({ queryKey: ['lancamentos'] });
  qc.invalidateQueries({ queryKey: ['financeiro'] });
}

// Recalcula a competencia com as taxas atuais (nao mexe no que ja foi lancado).
export function useApurarComissoes() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { competencia: string; regionalId?: string | null }) => {
      const { data, error } = await supabase.rpc('apurar_comissoes', {
        p_competencia: p.competencia,
        p_regional_id: p.regionalId || null,
      });
      if (error) throw error;
      return data as { itens_gerados: number; valor_total: number } | null;
    },
    onSuccess: () => invalidarTudo(qc),
  });
}

// Gera o contas a pagar (1 titulo por favorecido x regional) na data escolhida.
export function useGerarContasPagarComissoes() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { competencia: string; vencimento: string; regionalId?: string | null }) => {
      const { data, error } = await supabase.rpc('gerar_contas_pagar_comissoes', {
        p_competencia: p.competencia,
        p_vencimento: p.vencimento,
        p_regional_id: p.regionalId || null,
      });
      if (error) throw error;
      return data as ComissoesLotesRow;
    },
    onSuccess: () => invalidarTudo(qc),
  });
}
