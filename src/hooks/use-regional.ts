'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  ComissaoRegional, DesempenhoVendedor, LeadRegional, RegionalPainel,
  ResumoFinanceiroRegional, TituloRegionalRow,
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

// ---------------------------------------------------------------------------
// Financeiro COMPACTO da unidade (0037)
// A franquia nao escolhe plano de contas, centro de custo nem conta bancaria:
// o movimento ja carrega a classificacao e a baixa registra a forma. Todas as
// RPCs abaixo sao SECURITY DEFINER com escopo_regional().
// ---------------------------------------------------------------------------
export function useResumoFinanceiroRegional(p: PeriodoRegional) {
  const supabase = createClient();
  return useQuery<ResumoFinanceiroRegional | null>({
    queryKey: ['regional', 'fin-resumo', p.regionalId ?? 'minha', p.inicio, p.fim],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('regional_financeiro_resumo', {
        p_regional_id: p.regionalId, p_inicio: p.inicio, p_fim: p.fim,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function useTitulosRegional(
  p: PeriodoRegional & { tipo?: string | null; situacao?: string | null },
) {
  const supabase = createClient();
  return useQuery<TituloRegionalRow[]>({
    queryKey: ['regional', 'fin-titulos', p.regionalId ?? 'minha', p.inicio, p.fim,
      p.tipo ?? 'todos', p.situacao ?? 'todas'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('regional_financeiro_titulos', {
        p_regional_id: p.regionalId, p_inicio: p.inicio, p_fim: p.fim,
        p_tipo: p.tipo || null, p_situacao: p.situacao || null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Vendedores da propria unidade, para escolher o favorecido do repasse. */
export function useVendedoresDaUnidade(regionalId: string | null) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['regional', 'vendedores', regionalId ?? 'minha'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendedores').select('id, nome, ativo')
        .eq('ativo', true).order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

function invalidarFinanceiro(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['regional'] });
}

export function useLancarTituloRegional() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      regionalId: string | null; tipo: string; descricao: string; valor: number;
      vencimento: string; vendedorId?: string | null; observacoes?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('regional_lancar_titulo', {
        p_regional_id: v.regionalId, p_tipo: v.tipo, p_descricao: v.descricao,
        p_valor: v.valor, p_vencimento: v.vencimento,
        p_vendedor_id: v.vendedorId ?? null, p_observacoes: v.observacoes ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidarFinanceiro(qc),
  });
}

export function useBaixarTituloRegional() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      id: string; data: string; valor: number; forma?: string | null; observacao?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('regional_baixar_titulo', {
        p_lancamento_id: v.id, p_data: v.data, p_valor: v.valor,
        p_forma: v.forma ?? null, p_observacao: v.observacao ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidarFinanceiro(qc),
  });
}

export function useCancelarTituloRegional() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; motivo: string }) => {
      const { error } = await supabase.rpc('regional_cancelar_titulo', {
        p_lancamento_id: v.id, p_motivo: v.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidarFinanceiro(qc),
  });
}

/** Transforma a comissao pendente do vendedor em contas a pagar da unidade. */
export function useRepassarComissao() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (comissaoId: string) => {
      const { data, error } = await supabase.rpc('regional_repassar_comissao', {
        p_comissao_id: comissaoId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidarFinanceiro(qc),
  });
}
