'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  ComissaoRegional, DesempenhoVendedor, LeadRegional, RegionalPainel,
} from '@/lib/database.types';

/**
 * Dados do portal da franquia.
 * Todas as RPCs abaixo sao SECURITY DEFINER com escopo_regional(): o banco
 * FORCA a regional de quem chama. Passar outro id nao muda o que volta.
 */
export interface PeriodoRegional {
  regionalId: string | null;
  inicio: string;
  fim: string;
}

export function usePainelRegional(p: PeriodoRegional) {
  const supabase = createClient();
  return useQuery<RegionalPainel | null>({
    queryKey: ['regional', 'painel', p.regionalId ?? 'minha', p.inicio, p.fim],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('regional_painel', {
        p_regional_id: p.regionalId, p_inicio: p.inicio, p_fim: p.fim,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function useDesempenhoEquipe(p: PeriodoRegional) {
  const supabase = createClient();
  return useQuery<DesempenhoVendedor[]>({
    queryKey: ['regional', 'equipe', p.regionalId ?? 'minha', p.inicio, p.fim],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('regional_desempenho_vendedores', {
        p_regional_id: p.regionalId, p_inicio: p.inicio, p_fim: p.fim,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useComissoesRegional(p: PeriodoRegional & { status?: string }) {
  const supabase = createClient();
  return useQuery<ComissaoRegional[]>({
    queryKey: ['regional', 'comissoes', p.regionalId ?? 'minha', p.inicio, p.fim, p.status ?? 'todas'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('regional_comissoes', {
        p_regional_id: p.regionalId, p_status: p.status || null, p_inicio: p.inicio, p_fim: p.fim,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLeadsRegional(p: PeriodoRegional & { somenteHotlink?: boolean }) {
  const supabase = createClient();
  return useQuery<LeadRegional[]>({
    queryKey: ['regional', 'leads', p.regionalId ?? 'minha', p.inicio, p.fim, !!p.somenteHotlink],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('regional_leads', {
        p_regional_id: p.regionalId, p_inicio: p.inicio, p_fim: p.fim,
        p_somente_hotlink: !!p.somenteHotlink,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** A franquia do usuario logado (nome, codigo do hotlink e comissao). */
export function useMinhaRegional() {
  const supabase = createClient();
  return useQuery({
    queryKey: ['regional', 'minha'],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data: perfil } = await supabase
        .from('usuarios').select('nome, papel, regional_id').eq('id', auth.user.id).maybeSingle();
      if (!perfil?.regional_id) return { perfil, regional: null };
      const { data: regional } = await supabase
        .from('regionais').select('*').eq('id', perfil.regional_id).maybeSingle();
      return { perfil, regional };
    },
  });
}
