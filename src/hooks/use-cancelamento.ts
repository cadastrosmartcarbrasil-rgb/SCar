'use client';

// Cancelamento do veiculo e boleto PRO-RATA (0144).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { CancelamentoVeiculo, ProRataVeiculo } from '@/lib/database.types';

/** O pro-rata calculado PELO BANCO (a fonte da verdade do valor). */
export function useProRataVeiculo(veiculoId: string | null | undefined, ate: string | null, desde?: string | null) {
  const supabase = createClient();
  return useQuery<ProRataVeiculo | null>({
    queryKey: ['pro-rata', veiculoId ?? '', ate ?? '', desde ?? ''],
    enabled: !!veiculoId && !!ate,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('pro_rata_veiculo', {
        p_veiculo_id: veiculoId as string, p_ate: ate as string, p_desde: desde || null,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function useCancelamentosVeiculo(veiculoId: string | null | undefined) {
  const supabase = createClient();
  return useQuery<CancelamentoVeiculo[]>({
    queryKey: ['veiculo', veiculoId ?? '', 'cancelamentos'],
    enabled: !!veiculoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cancelamentos_do_veiculo', { p_veiculo_id: veiculoId as string });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface TituloEmitido {
  id: string;
  valor: number;
  data_vencimento: string;
  linha_digitavel: string | null;
  pix_copia_cola: string | null;
  nosso_numero: string | null;
}

export interface ResultadoCancelamento {
  ok: boolean;
  cancelamento_id: string;
  cobranca: null
    | { ok: true; renegociacao_id: string; erros_baixa: number; titulo: TituloEmitido | null; resumo: string | null }
    | { ok: false; renegociacao_id?: string; erro: string };
}

export interface PedidoCancelamento {
  acao?: 'cancelar' | 'cobrar';
  veiculo_id?: string;
  cancelamento_id?: string;
  data?: string;
  motivo?: string;
  previsao_retorno?: boolean;
  data_retorno?: string | null;
  observacao?: string | null;
  cobrar: boolean;
  vencimento?: string | null;
  origens: { origem: 'MUTUAL' | 'SCAR'; id: string }[];
}

function invalidarTudo(qc: ReturnType<typeof useQueryClient>) {
  for (const k of [['sac'], ['veiculo'], ['veiculos'], ['vida'], ['renegociacoes'], ['cobrancas'], ['cobranca'],
    ['leads'], ['vendas'], ['pro-rata']]) {
    qc.invalidateQueries({ queryKey: k });
  }
}

export function useCancelarVeiculo() {
  const qc = useQueryClient();
  return useMutation<ResultadoCancelamento, Error, PedidoCancelamento>({
    mutationFn: async (p) => {
      const r = await fetch('/api/v1/veiculos/cancelamento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? 'Falha ao cancelar');
      return j as ResultadoCancelamento;
    },
    onSettled: () => invalidarTudo(qc),
  });
}

export function useEmitirProRata() {
  const qc = useQueryClient();
  return useMutation<{ renegociacao_id: string; erros_baixa: number }, Error, {
    veiculo_id: string; ate: string; desde?: string | null; vencimento: string;
  }>({
    mutationFn: async (p) => {
      const r = await fetch('/api/v1/cobrancas/renegociacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'pro_rata', ...p }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? 'Falha ao emitir');
      return j;
    },
    onSettled: () => invalidarTudo(qc),
  });
}
