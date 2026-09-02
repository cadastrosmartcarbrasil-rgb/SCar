'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  PortalCartao, PortalFinanceiro, PortalPerfil, PortalSegundaVia, PortalTitulo, PortalVeiculo,
} from '@/lib/database.types';

/**
 * Portal do Associado.
 * Como no portal do vendedor, nenhuma RPC recebe id de cliente: o banco resolve
 * por `auth_cliente_id()` a partir do login. Nao ha o que forjar.
 */
export function usePortalPerfil() {
  const supabase = createClient();
  return useQuery<PortalPerfil | null>({
    queryKey: ['portal', 'perfil'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portal_perfil', {});
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function usePortalVeiculos() {
  const supabase = createClient();
  return useQuery<PortalVeiculo[]>({
    queryKey: ['portal', 'veiculos'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portal_veiculos', {});
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePortalTitulos() {
  const supabase = createClient();
  return useQuery<PortalTitulo[]>({
    queryKey: ['portal', 'titulos'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portal_titulos', { p_limite: 120 });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePortalFinanceiro() {
  const supabase = createClient();
  return useQuery<PortalFinanceiro | null>({
    queryKey: ['portal', 'financeiro'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portal_financeiro', {});
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function useSegundaVia() {
  const supabase = createClient();
  return useMutation<PortalSegundaVia | null, Error, string>({
    mutationFn: async (tituloId) => {
      const { data, error } = await supabase.rpc('portal_segunda_via', { p_titulo_id: tituloId });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function usePortalCartoes() {
  const supabase = createClient();
  return useQuery<PortalCartao[]>({
    queryKey: ['portal', 'cartoes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portal_cartoes', {});
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRemoverCartao() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase.rpc('portal_remover_cartao', { p_cartao_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', 'cartoes'] }),
  });
}

export function useAtualizarPerfilPortal() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, { email?: string; telefone?: string; endereco?: Record<string, string> }>({
    mutationFn: async (v) => {
      const { error } = await supabase.rpc('portal_atualizar_perfil', {
        p_email: v.email ?? null,
        p_telefone: v.telefone ?? null,
        p_endereco: v.endereco ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal'] }),
  });
}
