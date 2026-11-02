'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { ComunicacaoModeloVersoesRow, ComunicacaoModelosRow } from '@/lib/database.types';
import type { TextosModelo } from '@/lib/comunicacao/modelos';

const CHAVE = ['modelos-comunicacao'] as const;

/** Os modelos de e-mail gravados (so os que ja foram alterados alguma vez). */
export function useModelosGravados() {
  return useQuery({
    queryKey: [...CHAVE, 'gravados'],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from('comunicacao_modelos').select('*, usuarios(nome)').eq('canal', 'EMAIL');
      if (error) throw error;
      return (data ?? []) as (ComunicacaoModelosRow & { usuarios: { nome: string } | null })[];
    },
  });
}

export function useVersoesModelo(codigo: string | null) {
  return useQuery({
    queryKey: [...CHAVE, 'versoes', codigo],
    enabled: !!codigo,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from('comunicacao_modelo_versoes').select('*, usuarios(nome)')
        .eq('canal', 'EMAIL').eq('codigo', codigo!).order('versao', { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as (ComunicacaoModeloVersoesRow & { usuarios: { nome: string } | null })[];
    },
  });
}

async function postar<T>(url: string, corpo: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? 'Falha na operação');
  return json as T;
}

export function useSalvarModelo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { codigo: string; textos?: TextosModelo; original?: boolean; motivo?: string }) =>
      postar<{ versao: number; alterados: number }>('/api/v1/comunicacoes/modelos', v),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function usePreviaModelo() {
  return useMutation({
    mutationFn: (v: { codigo: string; textos: TextosModelo; email?: string }) =>
      postar<{ assunto?: string; html?: string; ok?: boolean }>('/api/v1/comunicacoes/modelos/previa', v),
  });
}
