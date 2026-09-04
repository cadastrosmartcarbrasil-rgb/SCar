'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { normalizarDigitos } from '@/lib/rastreador';
import type {
  RastreadoresRow, RastreadorLista, RastreadorFicha, RastreadorEvento,
  RastreadorDivergencia, RastreadoresResumo, RastreadorARecuperar,
  RastreadorManutencoesRow, StatusRastreador,
} from '@/lib/database.types';

export interface FiltrosRastreador {
  busca?: string;
  status?: StatusRastreador | '';
  regionalId?: string;
  plataformaId?: string;
  comVeiculo?: boolean | null;
  limite?: number;
  offset?: number;
}

/** Lista paginada no BANCO — o parque tem milhares de linhas, nunca vem inteiro. */
export function useRastreadores(f: FiltrosRastreador = {}) {
  const supabase = createClient();
  return useQuery<RastreadorLista[]>({
    queryKey: ['rastreadores', 'lista', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rastreadores_listar', {
        p_busca: f.busca?.trim() || null,
        p_status: f.status || null,
        p_regional_id: f.regionalId || null,
        p_plataforma_id: f.plataformaId || null,
        p_com_veiculo: f.comVeiculo ?? null,
        p_limite: f.limite ?? 50,
        p_offset: f.offset ?? 0,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRastreadoresResumo(regionalId?: string) {
  const supabase = createClient();
  return useQuery<RastreadoresResumo>({
    queryKey: ['rastreadores', 'resumo', regionalId ?? 'todas'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rastreadores_resumo', {
        p_regional_id: regionalId || null,
      });
      if (error) throw error;
      return data as RastreadoresResumo;
    },
  });
}

export function useRastreadorFicha(id?: string) {
  const supabase = createClient();
  return useQuery<RastreadorFicha | null>({
    queryKey: ['rastreadores', 'ficha', id ?? 'none'],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rastreador_ficha', { p_id: id! });
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
  });
}

export function useRastreadorHistorico(id?: string) {
  const supabase = createClient();
  return useQuery<RastreadorEvento[]>({
    queryKey: ['rastreadores', 'historico', id ?? 'none'],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rastreador_historico', { p_id: id!, p_limite: 100 });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDivergenciasRastreadores(filtros: { tipo?: string; severidade?: string; regionalId?: string } = {}) {
  const supabase = createClient();
  return useQuery<RastreadorDivergencia[]>({
    queryKey: ['rastreadores', 'divergencias', filtros],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rastreadores_divergencias', {
        p_regional_id: filtros.regionalId || null,
        p_tipo: filtros.tipo || null,
        p_severidade: filtros.severidade || null,
        p_limite: 500,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRastreadoresARecuperar(regionalId?: string) {
  const supabase = createClient();
  return useQuery<RastreadorARecuperar[]>({
    queryKey: ['rastreadores', 'recuperar', regionalId ?? 'todas'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rastreadores_a_recuperar', {
        p_regional_id: regionalId || null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGiroEstoque(regionalId?: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['rastreadores', 'giro', regionalId ?? 'todas'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rastreadores_giro_estoque', {
        p_regional_id: regionalId || null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// --- Cadastro do equipamento (a unica porta de entrada de dados nesta fase) ---
export function useSalvarRastreador() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<string, Error, Partial<RastreadoresRow>>({
    mutationFn: async (r) => {
      const payload = {
        imei: normalizarDigitos(r.imei),
        numero_serie: r.numero_serie?.trim() || null,
        iccid: normalizarDigitos(r.iccid) || null,
        linha: normalizarDigitos(r.linha) || null,
        operadora: r.operadora?.trim() || null,
        modelo: r.modelo?.trim() || null,
        fabricante: r.fabricante?.trim() || null,
        empresa_rastreamento_id: r.empresa_rastreamento_id || null,
        regional_id: r.regional_id || null,
        data_aquisicao: r.data_aquisicao || null,
        valor_aquisicao: r.valor_aquisicao ?? null,
        nota_fiscal: r.nota_fiscal?.trim() || null,
        observacoes: r.observacoes?.trim() || null,
      };
      if (r.id) {
        const { error } = await supabase.from('rastreadores').update(payload).eq('id', r.id);
        if (error) throw error;
        return r.id;
      }
      const { data, error } = await supabase.from('rastreadores').insert(payload).select('id').single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rastreadores'] }),
  });
}

/** Toda acao de negocio passa por RPC — as regras moram no banco. */
function useAcaoRastreador<T extends Record<string, unknown>>(
  rpc: 'instalar_rastreador' | 'desinstalar_rastreador' | 'mover_status_rastreador'
     | 'transferir_rastreador_regional' | 'abrir_manutencao_rastreador' | 'concluir_manutencao_rastreador',
) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<unknown, Error, T>({
    mutationFn: async (args) => {
      // O nome da RPC vem de uma uniao; o cast estreito (sem `any`) mantem o
      // supabase-js util no resto do arquivo.
      const chamar = supabase.rpc as unknown as (
        fn: string,
        params: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
      const { data, error } = await chamar(rpc, args);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rastreadores'] });
      qc.invalidateQueries({ queryKey: ['veiculos'] });   // a ficha do veiculo e espelho
      qc.invalidateQueries({ queryKey: ['sac'] });
    },
  });
}

export const useInstalarRastreador = () => useAcaoRastreador<{
  p_rastreador_id: string; p_veiculo_id: string; p_data?: string;
  p_local?: string | null; p_instalador?: string | null; p_observacoes?: string | null;
}>('instalar_rastreador');

export const useDesinstalarRastreador = () => useAcaoRastreador<{
  p_rastreador_id: string; p_status_novo?: string; p_motivo?: string | null;
}>('desinstalar_rastreador');

export const useMoverStatusRastreador = () => useAcaoRastreador<{
  p_rastreador_id: string; p_status: string; p_motivo?: string | null;
}>('mover_status_rastreador');

export const useTransferirRastreador = () => useAcaoRastreador<{
  p_rastreador_id: string; p_regional_id: string; p_motivo?: string | null;
}>('transferir_rastreador_regional');

export const useAbrirManutencao = () => useAcaoRastreador<{
  p_rastreador_id: string; p_defeito: string; p_fornecedor_id?: string | null;
}>('abrir_manutencao_rastreador');

export const useConcluirManutencao = () => useAcaoRastreador<{
  p_manutencao_id: string; p_solucao: string; p_custo?: number | null; p_sem_reparo?: boolean;
}>('concluir_manutencao_rastreador');

export type { RastreadorLista, RastreadorFicha, RastreadorManutencoesRow };
