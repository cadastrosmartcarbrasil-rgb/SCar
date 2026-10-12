'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  CobrancaAcordoSituacao, CobrancaBoletoCliente, CobrancaContato, CobrancaFilaLinha,
  CobrancaFilaResumo, CobrancaPromessasResumo, Json,
} from '@/lib/database.types';
import type { ParcelaRascunho, TipoAcordo } from '@/lib/cobranca-fila';

/**
 * Cobranca, Fase 2 (0098): a fila, a ficha do associado e o registro de
 * contato/promessa. O escopo e do banco (`cobranca_escopo`); a unidade da
 * tela e um FILTRO.
 */
const RAIZ = ['cobranca', 'fila'] as const;
export const POR_PAGINA_FILA = 50;

export interface FiltroFila {
  regionalId: string | null;
  situacao: string | null;
  faixa: string | null;
  busca: string;
  pagina: number;
}

export function useCobrancaFila(f: FiltroFila) {
  const supabase = createClient();
  return useQuery<CobrancaFilaLinha[]>({
    queryKey: [...RAIZ, 'lista', f],
    placeholderData: (anterior) => anterior,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cobranca_fila', {
        p_regional_id: f.regionalId,
        p_situacao: f.situacao,
        p_faixa: f.faixa,
        p_busca: f.busca.trim() || null,
        p_limite: POR_PAGINA_FILA,
        p_offset: f.pagina * POR_PAGINA_FILA,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCobrancaFilaResumo(regionalId: string | null) {
  const supabase = createClient();
  return useQuery<CobrancaFilaResumo[]>({
    queryKey: [...RAIZ, 'resumo', regionalId ?? 'todas'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cobranca_fila_resumo', { p_regional_id: regionalId });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCobrancaPromessasResumo(inicio: string, fim: string, regionalId: string | null) {
  const supabase = createClient();
  return useQuery<CobrancaPromessasResumo | null>({
    queryKey: [...RAIZ, 'promessas', inicio, fim, regionalId ?? 'todas'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cobranca_promessas_resumo', {
        p_inicio: inicio, p_fim: fim, p_regional_id: regionalId,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function useCobrancaContatosCliente(clienteId: string | null) {
  const supabase = createClient();
  return useQuery<CobrancaContato[]>({
    queryKey: [...RAIZ, 'contatos', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cobranca_contatos_cliente', { p_cliente_id: clienteId! });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCobrancaBoletosCliente(clienteId: string | null) {
  const supabase = createClient();
  return useQuery<CobrancaBoletoCliente[]>({
    queryKey: [...RAIZ, 'boletos', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cobranca_boletos_cliente', { p_cliente_id: clienteId! });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCobrancaAcordosCliente(clienteId: string | null) {
  const supabase = createClient();
  return useQuery<CobrancaAcordoSituacao[]>({
    queryKey: [...RAIZ, 'acordos', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cobranca_acordos_situacao', {
        p_regional_id: null, p_cliente_id: clienteId!,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface NovoContato {
  clienteId: string;
  canal: string;
  resultado: string;
  observacao?: string | null;
  proximaAcaoEm?: string | null;
  proximaAcao?: string | null;
  acordo?: { tipo: TipoAcordo; observacao?: string | null; parcelas: ParcelaRascunho[] } | null;
}

export function useRegistrarContatoCobranca() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: NovoContato) => {
      const acordo: Json | null = c.acordo
        ? {
            tipo: c.acordo.tipo,
            observacao: c.acordo.observacao ?? null,
            parcelas: c.acordo.parcelas.map((p) => ({ vencimento: p.vencimento, valor: p.valor })),
          }
        : null;
      const { data, error } = await supabase.rpc('registrar_contato_cobranca', {
        p_cliente_id: c.clienteId,
        p_canal: c.canal,
        p_resultado: c.resultado,
        p_observacao: c.observacao ?? null,
        p_proxima_acao_em: c.proximaAcaoEm || null,
        p_proxima_acao: c.proximaAcao ?? null,
        p_acordo: acordo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RAIZ }),
  });
}

export function useCancelarAcordoCobranca() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { acordoId: string; motivo: string }) => {
      const { error } = await supabase.rpc('cancelar_acordo_cobranca', {
        p_acordo_id: p.acordoId, p_motivo: p.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RAIZ }),
  });
}
