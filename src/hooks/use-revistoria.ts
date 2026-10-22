'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  Json, RevistoriaASolicitar, RevistoriaExigida, RevistoriaLinha, RevistoriaMidia, RevistoriaSolicitada,
} from '@/lib/database.types';

// Revistoria do boleto vencido (0137). Tudo pelas RPCs: quem trava e o banco.

/** O que a 2a via destes boletos exige (um veiculo por linha). */
export function useRevistoriaExigida(clienteId: string | null | undefined, origens: { origem: string; id: string }[] | null) {
  const supabase = createClient();
  const chave = (origens ?? []).map((o) => `${o.origem}:${o.id}`).sort().join('|');
  return useQuery<RevistoriaExigida[]>({
    queryKey: ['revistoria', 'exigida', clienteId ?? '', chave],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('revistoria_exigida', {
        p_cliente_id: clienteId as string,
        p_origens: (origens ?? null) as Json | null,
      });
      if (error) throw error;
      return (data ?? []) as RevistoriaExigida[];
    },
  });
}

export function useRevistorias(situacao: string | null, busca: string) {
  const supabase = createClient();
  return useQuery<RevistoriaLinha[]>({
    queryKey: ['revistoria', 'lista', situacao ?? '', busca],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('revistorias_cobranca_listar', {
        p_situacao: situacao, p_busca: busca || null, p_limite: 300,
      });
      if (error) throw error;
      return (data ?? []) as RevistoriaLinha[];
    },
    refetchInterval: 60_000,
  });
}

export function useRevistoriasASolicitar(ativo: boolean) {
  const supabase = createClient();
  return useQuery<RevistoriaASolicitar[]>({
    queryKey: ['revistoria', 'a-solicitar'],
    enabled: ativo,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('revistorias_a_solicitar', { p_limite: 500 });
      if (error) throw error;
      return (data ?? []) as RevistoriaASolicitar[];
    },
  });
}

export function useRevistoriaMidias(revistoriaId: string | null) {
  const supabase = createClient();
  return useQuery<RevistoriaMidia[]>({
    queryKey: ['revistoria', 'midias', revistoriaId ?? ''],
    enabled: !!revistoriaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('revistoria_cobranca_midias', { p_revistoria_id: revistoriaId as string });
      if (error) throw error;
      return (data ?? []) as RevistoriaMidia[];
    },
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['revistoria'] });
  };
}

export function useSolicitarRevistoria() {
  const supabase = createClient();
  const invalidar = useInvalidar();
  return useMutation<RevistoriaSolicitada, Error, string>({
    mutationFn: async (veiculoId) => {
      const { data, error } = await supabase.rpc('solicitar_revistoria_cobranca', { p_veiculo_id: veiculoId });
      if (error) throw error;
      const r = (data ?? [])[0];
      if (!r) throw new Error('O banco não devolveu o link.');
      return r as RevistoriaSolicitada;
    },
    onSuccess: invalidar,
  });
}

export function useAnalisarRevistoria() {
  const supabase = createClient();
  const invalidar = useInvalidar();
  return useMutation<string, Error, { id: string; aprovar: boolean; motivo?: string | null }>({
    mutationFn: async (v) => {
      const { data, error } = await supabase.rpc('analisar_revistoria_cobranca', {
        p_revistoria_id: v.id, p_aprovar: v.aprovar, p_motivo: v.motivo ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidar,
  });
}

export function useDispensarRevistoria() {
  const supabase = createClient();
  const invalidar = useInvalidar();
  return useMutation<string, Error, { veiculoId: string; justificativa: string }>({
    mutationFn: async (v) => {
      const { data, error } = await supabase.rpc('dispensar_revistoria_cobranca', {
        p_veiculo_id: v.veiculoId, p_justificativa: v.justificativa,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidar,
  });
}

export function useCancelarRevistoria() {
  const supabase = createClient();
  const invalidar = useInvalidar();
  return useMutation<string, Error, { id: string; motivo: string }>({
    mutationFn: async (v) => {
      const { data, error } = await supabase.rpc('cancelar_revistoria_cobranca', {
        p_revistoria_id: v.id, p_motivo: v.motivo,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidar,
  });
}

/** O link publico da revistoria, montado pelo host em que a equipe esta. */
export function linkDaRevistoria(token: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/revistoria/${token}`;
}
