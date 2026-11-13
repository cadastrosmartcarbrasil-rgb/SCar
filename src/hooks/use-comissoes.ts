'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  ComissaoDaMatriz,
  ComissaoRelatorioLinha,
  ComissoesFranquiaLotesRow,
  ComissaoMatrizDesempenho,
  ComissaoMatrizPrevia,
  ComissoesConfigRow,
  ComissoesMatrizLotesRow,
} from '@/lib/database.types';

// Gestao de comissoes pela matriz (0198). As RPCs sao escopadas no banco:
// matriz ve tudo; gestor regional, so a propria unidade.

export function useComissoesDesempenho(competencia: string, regionalId?: string | null, meses = 3) {
  const supabase = createClient();
  return useQuery<ComissaoMatrizDesempenho[]>({
    queryKey: ['comissoes-matriz', 'desempenho', competencia, regionalId ?? null, meses],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('comissoes_matriz_desempenho', {
        p_competencia: competencia,
        p_meses: meses,
        p_regional_id: regionalId || null,
      });
      if (error) throw error;
      return (data ?? []) as ComissaoMatrizDesempenho[];
    },
  });
}

export function useComissoesPrevia(competencia: string, regionalId: string | null, habilitado: boolean) {
  const supabase = createClient();
  return useQuery<ComissaoMatrizPrevia[]>({
    queryKey: ['comissoes-matriz', 'previa', competencia, regionalId],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('comissoes_matriz_previa', {
        p_competencia: competencia,
        p_regional_id: regionalId || null,
      });
      if (error) throw error;
      return (data ?? []) as ComissaoMatrizPrevia[];
    },
  });
}

export function useComissoesConfig() {
  const supabase = createClient();
  return useQuery<ComissoesConfigRow | null>({
    queryKey: ['comissoes-matriz', 'config'],
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
    mutationFn: async (c: ComissoesConfigRow) => {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comissoes-matriz', 'config'] }),
  });
}

export type LoteComRel = ComissoesMatrizLotesRow & {
  regionais?: { nome: string } | null;
  usuarios?: { nome: string } | null;
};

export function useComissoesLotes(habilitado: boolean) {
  const supabase = createClient();
  return useQuery<LoteComRel[]>({
    queryKey: ['comissoes-matriz', 'lotes'],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comissoes_matriz_lotes')
        .select('*, regionais(nome), usuarios(nome)')
        .order('created_at', { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []) as LoteComRel[];
    },
  });
}

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['comissoes-matriz'] });
  qc.invalidateQueries({ queryKey: ['lancamentos'] });
  qc.invalidateQueries({ queryKey: ['financeiro'] });
}

/** Recalcula a competencia (so o que ainda nao foi ao contas a pagar). */
export function useApurarComissoes() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { competencia: string; regionalId: string | null }) => {
      const { data, error } = await supabase.rpc('apurar_comissoes_matriz', {
        p_competencia: p.competencia,
        p_regional_id: p.regionalId || null,
      });
      if (error) throw error;
      return data as { itens: number; valor_total: number } | null;
    },
    onSuccess: () => invalidar(qc),
  });
}

/** 1 titulo por favorecido no contas a pagar, com o vencimento escolhido. */
export function useGerarContasPagarComissoes() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { competencia: string; vencimento: string; regionalId: string | null }) => {
      const { data, error } = await supabase.rpc('gerar_contas_pagar_comissoes_matriz', {
        p_competencia: p.competencia,
        p_vencimento: p.vencimento,
        p_regional_id: p.regionalId || null,
      });
      if (error) throw error;
      return data as ComissoesMatrizLotesRow;
    },
    onSuccess: () => invalidar(qc),
  });
}

/** 0199 — relatorio por consultor, pela DATA DO CREDITO no banco. */
export function useRelatorioConsultores(inicio: string, fim: string, regionalId: string | null, ativo = true) {
  const supabase = createClient();
  return useQuery<ComissaoRelatorioLinha[]>({
    queryKey: ['comissoes-matriz', 'relatorio', inicio, fim, regionalId],
    enabled: ativo && Boolean(inicio && fim && fim >= inicio),
    queryFn: async () => {
      // jsonb numa resposta so: a lista de linhas seria cortada em 1.000
      const { data, error } = await supabase.rpc('comissoes_consultores_relatorio_json', {
        p_inicio: inicio,
        p_fim: fim,
        p_regional_id: regionalId || null,
      });
      if (error) throw error;
      return ((data ?? []) as ComissaoRelatorioLinha[]).map((l) => ({
        ...l,
        valor_recebido: Number(l.valor_recebido),
        taxa: Number(l.taxa),
        valor_assistencia: Number(l.valor_assistencia),
        valor_comissao: Number(l.valor_comissao),
      }));
    },
  });
}

/** 0200 — o relatorio do PROPRIO vendedor (portal), a mesma fonte da matriz. */
export function useRelatorioVendedor(inicio: string, fim: string, ativo = true) {
  const supabase = createClient();
  return useQuery<ComissaoRelatorioLinha[]>({
    queryKey: ['comissoes-matriz', 'relatorio-vendedor', inicio, fim],
    enabled: ativo && Boolean(inicio && fim && fim >= inicio),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('vendedor_comissoes_relatorio_json', { p_inicio: inicio, p_fim: fim });
      if (error) throw error;
      return ((data ?? []) as ComissaoRelatorioLinha[]).map((l) => ({
        ...l,
        valor_recebido: Number(l.valor_recebido),
        taxa: Number(l.taxa),
        valor_assistencia: Number(l.valor_assistencia),
        valor_comissao: Number(l.valor_comissao),
      }));
    },
  });
}

/** 0200 — o que a franquia tem a receber da matriz no periodo (credito). */
export function useComissaoDaMatriz(regionalId: string | null, inicio: string, fim: string) {
  const supabase = createClient();
  return useQuery<ComissaoDaMatriz | null>({
    queryKey: ['comissoes-matriz', 'da-matriz', regionalId, inicio, fim],
    enabled: Boolean(inicio && fim && fim >= inicio),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('regional_comissao_da_matriz', {
        p_regional_id: regionalId || null, p_inicio: inicio, p_fim: fim,
      });
      if (error) throw error;
      if (!data) return null;
      const d = data as Record<string, unknown>;
      return {
        destino: d.destino as ComissaoDaMatriz['destino'],
        taxa: Number(d.taxa), base_recebida: Number(d.base_recebida), valor_estimado: Number(d.valor_estimado),
        apurado: Number(d.apurado), a_pagar: Number(d.a_pagar), pago: Number(d.pago),
      };
    },
  });
}

/** 0200 — repasse da franquia: 1 titulo por consultor, pelo periodo do credito. */
export function useGerarRepasseFranquia() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { regionalId: string | null; inicio: string; fim: string; vencimento: string }) => {
      const { data, error } = await supabase.rpc('regional_gerar_repasse_comissoes', {
        p_regional_id: p.regionalId || null, p_inicio: p.inicio, p_fim: p.fim, p_vencimento: p.vencimento,
      });
      if (error) throw error;
      return data as ComissoesFranquiaLotesRow;
    },
    onSuccess: () => {
      invalidar(qc);
      qc.invalidateQueries({ queryKey: ['regional'] });
    },
  });
}
