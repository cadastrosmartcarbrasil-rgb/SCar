'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { RenegociacaoCliente, TiposBoletoAvulsoRow } from '@/lib/database.types';
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

/** Cancela boleto(s) com motivo (0157): sem boleto novo, so a baixa no banco. */
export function useCancelarBoletos() {
  const invalidar = useInvalidar();
  return useMutation<
    { renegociacao_id: string; erros_baixa: number },
    Error,
    { cliente_id: string; origens: { origem: 'SCAR' | 'MUTUAL'; id: string }[]; motivo: string }
  >({
    mutationFn: (b) => postar('/api/v1/cobrancas/renegociacao', { acao: 'cancelar', ...b }),
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

// ---------------------------------------------------------------------------
// BOLETO AVULSO do SAC (0150): o catalogo de tipos e a emissao no banco padrao.
// ---------------------------------------------------------------------------
export type TipoBoletoAvulso = TiposBoletoAvulsoRow & {
  categorias_dre?: { codigo_estruturado: string; nome: string } | null;
};

export function useTiposBoletoAvulso() {
  const supabase = createClient();
  return useQuery<TipoBoletoAvulso[]>({
    queryKey: ['tipos-boleto-avulso'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tipos_boleto_avulso')
        .select('*, categorias_dre(codigo_estruturado, nome)')
        .order('ordem').order('nome');
      if (error) throw error;
      return (data ?? []) as unknown as TipoBoletoAvulso[];
    },
  });
}

export function useSalvarTipoBoletoAvulso() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, Partial<TiposBoletoAvulsoRow> & { nome: string }>({
    mutationFn: async ({ id, nome, categoria_dre_id, exige_veiculo, ativo, ordem }) => {
      const linha = {
        nome: nome.trim(), categoria_dre_id: categoria_dre_id ?? null,
        exige_veiculo: !!exige_veiculo, ativo: ativo ?? true, ordem: ordem ?? 0,
      };
      const { error } = id
        ? await supabase.from('tipos_boleto_avulso').update(linha).eq('id', id)
        : await supabase.from('tipos_boleto_avulso').insert(linha);
      if (error) {
        if (error.code === '23505') throw new Error('Já existe um tipo com esse nome.');
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tipos-boleto-avulso'] }),
  });
}

export function useEmitirBoletoAvulso() {
  const invalidar = useInvalidar();
  return useMutation<
    { renegociacao_id: string },
    Error,
    { cliente_id: string; tipo_id: string; valor: number; vencimento: string; veiculo_id?: string | null; descricao?: string | null }
  >({
    mutationFn: (b) => postar('/api/v1/cobrancas/avulso', b),
    onSettled: invalidar,
  });
}
