'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  CobrancaBoletoLinha, CobrancaCalendarioLinha, CobrancaCarteira, CobrancaEscopo,
  CobrancaHistoricoResumo, CobrancaImportacaoBloco, CobrancaIndicadores, CobrancaParametros,
  CobrancaPorRegional, CobrancaSerieMes,
} from '@/lib/database.types';

/**
 * Painel de Inadimplencia e Cobrancas (0097). Todas as leituras passam por
 * `cobranca_escopo()` no banco — a unidade pedida pela tela e um FILTRO, nao
 * uma permissao: quem nao ve a unidade recebe vazio.
 */
const RAIZ = ['cobranca', 'painel'] as const;

export function useCobrancaEscopo() {
  const supabase = createClient();
  return useQuery<CobrancaEscopo | null>({
    queryKey: [...RAIZ, 'escopo'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cobranca_escopo');
      if (error) throw error;
      return data?.[0] ?? null;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCobrancaParametros() {
  const supabase = createClient();
  return useQuery<CobrancaParametros>({
    queryKey: [...RAIZ, 'parametros'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cobranca_parametros');
      if (error) throw error;
      return data?.[0] ?? { meta: 5, limite: 10, feriados: [] };
    },
  });
}

export function useCobrancaIndicadores(inicio: string, fim: string, regionalId: string | null) {
  const supabase = createClient();
  return useQuery<CobrancaIndicadores[]>({
    queryKey: [...RAIZ, 'indicadores', inicio, fim, regionalId ?? 'todas'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cobranca_indicadores', {
        p_inicio: inicio, p_fim: fim, p_regional_id: regionalId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCobrancaCarteira(regionalId: string | null) {
  const supabase = createClient();
  return useQuery<CobrancaCarteira | null>({
    queryKey: [...RAIZ, 'carteira', regionalId ?? 'todas'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cobranca_carteira', { p_regional_id: regionalId });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function useCobrancaCalendario(mes: string, regionalId: string | null) {
  const supabase = createClient();
  return useQuery<CobrancaCalendarioLinha[]>({
    queryKey: [...RAIZ, 'calendario', mes, regionalId ?? 'todas'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cobranca_calendario', {
        p_mes: mes, p_regional_id: regionalId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCobrancaPorRegional(inicio: string, fim: string, ativo = true) {
  const supabase = createClient();
  return useQuery<CobrancaPorRegional[]>({
    queryKey: [...RAIZ, 'por-regional', inicio, fim],
    // No portal da franquia a tabela "por regional" nao aparece: nao consulta.
    enabled: ativo,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cobranca_por_regional', { p_inicio: inicio, p_fim: fim });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCobrancaSerie(regionalId: string | null, meses = 12) {
  const supabase = createClient();
  return useQuery<CobrancaSerieMes[]>({
    queryKey: [...RAIZ, 'serie', meses, regionalId ?? 'todas'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cobranca_serie_mensal', {
        p_meses: meses, p_regional_id: regionalId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** O detalhamento de um numero: os boletos que o compoem. */
export interface FiltroListaBoletos {
  titulo: string;
  inicio?: string | null;
  fim?: string | null;
  regionalId?: string | null;
  situacoes?: string[] | null;
  ciclo?: number | null;
  somentePrimeiro?: boolean;
  pagoInicio?: string | null;
  pagoFim?: string | null;
}

export function useCobrancaBoletos(f: FiltroListaBoletos | null) {
  const supabase = createClient();
  return useQuery<CobrancaBoletoLinha[]>({
    queryKey: [...RAIZ, 'lista', f],
    enabled: !!f,
    queryFn: async () => {
      if (!f) return [];
      const { data, error } = await supabase.rpc('cobranca_boletos_lista', {
        p_inicio: f.inicio ?? null,
        p_fim: f.fim ?? null,
        p_regional_id: f.regionalId ?? null,
        p_situacoes: f.situacoes ?? null,
        p_ciclo: f.ciclo ?? null,
        p_somente_primeiro: f.somentePrimeiro ?? false,
        p_pago_inicio: f.pagoInicio ?? null,
        p_pago_fim: f.pagoFim ?? null,
        p_limite: 2000,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSalvarParametrosCobranca() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { meta: number; limite: number }) => {
      const { error } = await supabase.rpc('salvar_parametros_cobranca', { p_meta: p.meta, p_limite: p.limite });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...RAIZ, 'parametros'] }),
  });
}

export function useFeriadoCobranca() {
  const supabase = createClient();
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: RAIZ });
  const salvar = useMutation({
    mutationFn: async (p: { data: string; descricao: string }) => {
      const { error } = await supabase.rpc('salvar_feriado_cobranca', { p_data: p.data, p_descricao: p.descricao });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
  const remover = useMutation({
    mutationFn: async (data: string) => {
      const { error } = await supabase.rpc('remover_feriado_cobranca', { p_data: data });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
  return { salvar, remover };
}

// ---------------------------------------------------------------------------
// Historico de boletos do Mutual (caminho B)
// ---------------------------------------------------------------------------
export function useCobrancaHistoricoResumo() {
  const supabase = createClient();
  return useQuery<CobrancaHistoricoResumo | null>({
    queryKey: ['cobranca', 'historico', 'resumo'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cobranca_historico_resumo');
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export interface ProgressoImportacao {
  lidos: number;
  mensalidades: number;
  semAssociado: number;
  statusDesconhecido: number;
  gravados: number;
  fim: boolean;
}

/**
 * Importa em BLOCOS (cada chamada e curta e cabe no teto de tempo), com o
 * cursor no navegador — mesmo desenho da captura (`useCapturaMutual`). Parar
 * no meio nao perde nada: a importacao e re-executavel e so regrava o que mudou.
 */
export function useImportarHistoricoBoletos(onProgresso?: (p: ProgressoImportacao) => void) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const total: ProgressoImportacao = {
        lidos: 0, mensalidades: 0, semAssociado: 0, statusDesconhecido: 0, gravados: 0, fim: false,
      };
      let cursor: string | null = null;
      for (let i = 0; i < 1000; i++) {
        const resp: { data: CobrancaImportacaoBloco[] | null; error: unknown } =
          await supabase.rpc('cobranca_importar_historico_mutual', {
            p_cursor: cursor, p_lote: 4000, p_confirmar: true,
          });
        if (resp.error) throw resp.error;
        const b = resp.data?.[0];
        if (!b) break;
        total.lidos += b.lidos;
        total.mensalidades += b.mensalidades;
        total.semAssociado += b.sem_associado;
        total.statusDesconhecido += b.status_desconhecido;
        total.gravados += b.gravados;
        total.fim = b.fim;
        onProgresso?.({ ...total });
        if (b.fim || !b.proximo_cursor) break;
        cursor = b.proximo_cursor;
      }
      return total;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['cobranca'] });
    },
  });
}
