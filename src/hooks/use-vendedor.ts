'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  ComissaoDoVendedor, LeadDoVendedor, PerfilVendedor, VendedorPainel,
} from '@/lib/database.types';

/**
 * Portal do vendedor.
 * Nenhuma destas RPCs recebe id de vendedor: o banco resolve por
 * `vendedor_atual()` a partir do login. Nao ha parametro para pedir os dados
 * de outra pessoa — a isolacao nao depende da tela.
 */
export function usePainelVendedor(p: { inicio: string; fim: string }) {
  const supabase = createClient();
  return useQuery<VendedorPainel | null>({
    queryKey: ['vendedor', 'painel', p.inicio, p.fim],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('vendedor_painel', {
        p_inicio: p.inicio, p_fim: p.fim,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function useLeadsDoVendedor(p: { status?: string; busca?: string }) {
  const supabase = createClient();
  return useQuery<LeadDoVendedor[]>({
    queryKey: ['vendedor', 'leads', p.status ?? 'todos', p.busca ?? ''],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('vendedor_leads', {
        p_status: p.status || null, p_busca: p.busca || null, p_limite: 200,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useComissoesDoVendedor(p: { status?: string; inicio?: string; fim?: string }) {
  const supabase = createClient();
  return useQuery<ComissaoDoVendedor[]>({
    queryKey: ['vendedor', 'comissoes', p.status ?? 'todas', p.inicio ?? '', p.fim ?? ''],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('vendedor_comissoes', {
        p_status: p.status || null, p_inicio: p.inicio || null, p_fim: p.fim || null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePerfilVendedor() {
  const supabase = createClient();
  return useQuery<PerfilVendedor | null>({
    queryKey: ['vendedor', 'perfil'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('vendedor_perfil', {});
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function useCriarLeadVendedor() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      nome: string; celular: string; email?: string | null;
      placa?: string | null; observacao?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('vendedor_criar_lead', {
        p_nome: v.nome, p_celular: v.celular, p_email: v.email ?? null,
        p_placa: v.placa ?? null, p_observacao: v.observacao ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendedor'] }),
  });
}

export function useAtualizarPerfilVendedor() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      telefone?: string | null; banco?: string | null; agencia?: string | null;
      conta?: string | null; chavePix?: string | null;
    }) => {
      const { error } = await supabase.rpc('vendedor_atualizar_perfil', {
        p_telefone: v.telefone ?? null, p_banco: v.banco ?? null,
        p_agencia: v.agencia ?? null, p_conta: v.conta ?? null,
        p_chave_pix: v.chavePix ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendedor'] }),
  });
}
