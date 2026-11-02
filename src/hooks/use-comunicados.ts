'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { ComunicadoListaItem, ComunicadosEmailRow } from '@/lib/database.types';
import {
  filtrosParaGravar, type DadosComunicado, type FinalidadeComunicado, type FiltrosComunicado, type PreviaPublico,
} from '@/lib/comunicacao/comunicados';

const CHAVE = ['comunicados-email'] as const;

export function useComunicados() {
  return useQuery({
    queryKey: [...CHAVE, 'lista'],
    queryFn: async () => {
      const { data, error } = await createClient().rpc('comunicados_email_listar');
      if (error) throw error;
      return (data ?? []) as ComunicadoListaItem[];
    },
    refetchInterval: 30_000,
  });
}

export function useComunicado(id: string | null) {
  return useQuery({
    queryKey: [...CHAVE, 'um', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await createClient().from('comunicados_email').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as ComunicadosEmailRow | null;
    },
  });
}

export function usePreviaPublico(filtros: FiltrosComunicado, finalidade: FinalidadeComunicado, ativo = true) {
  const f = filtrosParaGravar(filtros);
  return useQuery({
    queryKey: [...CHAVE, 'publico', JSON.stringify(f), finalidade],
    enabled: ativo,
    queryFn: async () => {
      const { data, error } = await createClient().rpc('comunicado_previa_publico', {
        p_filtros: f as Record<string, unknown>, p_finalidade: finalidade,
      });
      if (error) throw error;
      return data as unknown as PreviaPublico;
    },
  });
}

function dadosParaGravar(d: DadosComunicado): Record<string, unknown> {
  return { ...d, filtros: filtrosParaGravar(d.filtros) };
}

export function useSalvarComunicado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string | null; dados: DadosComunicado }) => {
      const { data, error } = await createClient().rpc('salvar_comunicado_email', { p_id: v.id, p_dados: dadosParaGravar(v.dados) });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useEnviarComunicado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await createClient().rpc('enviar_comunicado_email', { p_id: id });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useCancelarComunicado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await createClient().rpc('cancelar_comunicado_email', { p_id: id });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function usePreviaComunicado() {
  return useMutation({
    mutationFn: async (v: { dados: DadosComunicado; email?: string }) => {
      const res = await fetch('/api/v1/comunicacoes/comunicados/previa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'Falha na prévia');
      return json as { assunto?: string; html?: string; ok?: boolean };
    },
  });
}
