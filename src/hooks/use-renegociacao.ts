'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { RenegociacaoCliente } from '@/lib/database.types';
import type { ParcelaNegociada } from '@/lib/renegociacao';

// 2a via vencida e boleto negociado (0121). As escritas passam pela rota do
// servidor, que fala com o Sicredi; a leitura e a RPC do banco.

export function useRenegociacoes(clienteId: string | null | undefined) {
  const supabase = createClient();
  return useQuery<RenegociacaoCliente[]>({
    queryKey: ['renegociacoes', clienteId ?? ''],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('renegociacoes_do_cliente', { p_cliente_id: clienteId as string });
      if (error) throw error;
      return (data ?? []) as RenegociacaoCliente[];
    },
  });
}

async function postar<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Falha (${res.status})`);
  return json as T;
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['renegociacoes'] });
    qc.invalidateQueries({ queryKey: ['sac', 'titulos'] });
    qc.invalidateQueries({ queryKey: ['cobrancas'] });
    qc.invalidateQueries({ queryKey: ['cobranca'] });
    qc.invalidateQueries({ queryKey: ['vida'] });
  };
}

export function useCriarRenegociacao() {
  const invalidar = useInvalidar();
  return useMutation<
    { renegociacao_id: string; erros_baixa: number },
    Error,
    {
      cliente_id: string;
      tipo: 'SEGUNDA_VIA' | 'ACORDO';
      origens: { origem: 'SCAR' | 'MUTUAL'; id: string }[];
      parcelas: ParcelaNegociada[];
      acordo_id?: string | null;
      observacao?: string | null;
    }
  >({
    mutationFn: (b) => postar('/api/v1/cobrancas/renegociacao', { acao: 'criar', ...b }),
    // Mesmo com erro: a renegociacao recusada tambem aparece (com o motivo).
    onSettled: invalidar,
  });
}

export function useBaixarOriginais() {
  const invalidar = useInvalidar();
  return useMutation<{ erros_baixa: number }, Error, string>({
    mutationFn: (id) => postar('/api/v1/cobrancas/renegociacao', { acao: 'baixar', renegociacao_id: id }),
    onSettled: invalidar,
  });
}

export function useEnviarBoletoEmail() {
  return useMutation<{ enviado: boolean; para?: string; aviso?: string; texto: string }, Error, { titulo_ids: string[] }>({
    mutationFn: (b) => postar('/api/v1/cobrancas/boleto', b),
  });
}
