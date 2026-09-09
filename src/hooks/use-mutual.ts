'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { EntidadeMutual } from '@/lib/mutual';
import type {
  MutualDiagnostico, MutualPorStatus, MutualFilial,
  MutualQuarentena, MutualResumoCaptura, MutualStatusNaoMapeado,
} from '@/lib/database.types';

/** O que ja esta na area de captura. */
export function useMutualCapturas() {
  const supabase = createClient();
  return useQuery<MutualResumoCaptura[]>({
    queryKey: ['mutual', 'capturas'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_resumo_capturas', {});
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** O relatorio de qualidade — o produto da Fase 1. */
export function useMutualDiagnostico() {
  const supabase = createClient();
  return useQuery<MutualDiagnostico[]>({
    queryKey: ['mutual', 'diagnostico'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_diagnostico', {});
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMutualPorStatus() {
  const supabase = createClient();
  return useQuery<MutualPorStatus[]>({
    queryKey: ['mutual', 'status'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_por_status', {});
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** As filiais do Mutual + o palpite de de-para. NAO cria regional nenhuma. */
export function useMutualFiliais() {
  const supabase = createClient();
  return useQuery<MutualFilial[]>({
    queryKey: ['mutual', 'filiais'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_filiais', {});
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMutualQuarentena(limite = 200, somenteFaturaveis = true) {
  const supabase = createClient();
  return useQuery<MutualQuarentena[]>({
    queryKey: ['mutual', 'quarentena', limite, somenteFaturaveis],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_quarentena', {
        p_limite: limite,
        p_somente_faturaveis: somenteFaturaveis,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * O vocabulario do Mutual que o nosso de-para ainda nao cobre. O enum do
 * swagger NAO e exaustivo — `AGUARDADO A RETIRADA DO RASTREADOR` so apareceu
 * na base real. Sem esta lista, status desconhecido some como "funil de venda".
 */
export function useMutualStatusNaoMapeados() {
  const supabase = createClient();
  return useQuery<MutualStatusNaoMapeado[]>({
    queryKey: ['mutual', 'status-nao-mapeados'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_status_nao_mapeados', {});
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface RespostaMutual {
  configured: boolean;
  ok?: boolean;
  http?: number;
  url?: string;
  registros?: number;
  paginas?: number;
  total_remoto?: number | null;
  proxima_pagina?: number | null;
  amostra?: unknown;
  erro?: string;
  error?: string;
}

async function chamar(body: Record<string, unknown>): Promise<RespostaMutual> {
  const res = await fetch('/api/v1/mutual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as RespostaMutual;
}

/** Testa a conexao sem gravar nada. */
export function usePingMutual() {
  return useMutation<RespostaMutual, Error, void>({
    mutationFn: () => chamar({ action: 'ping' }),
  });
}

/** Puxa paginas de uma entidade para a area de captura. */
export function useCapturarMutual() {
  const qc = useQueryClient();
  return useMutation<RespostaMutual, Error, {
    entidade: EntidadeMutual; paginas?: number; pagina_inicial?: number;
    page_size?: number; updated_at__gte?: string;
  }>({
    mutationFn: (v) => chamar({ action: 'capturar', ...v }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['mutual'] }); },
  });
}
