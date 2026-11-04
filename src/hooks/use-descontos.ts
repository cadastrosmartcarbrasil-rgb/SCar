'use client';

/** Desconto na mensalidade com aprovacao da diretoria (0178). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { DescontoPendente } from '@/lib/database.types';
import type { TipoDesconto } from '@/lib/desconto-mensalidade';

export function useDefinirDesconto() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, {
    cotacaoId: string; tipo: TipoDesconto; valor: number; validoAte: string | null; justificativa: string | null;
  }>({
    mutationFn: async (i) => {
      const { error } = await supabase.rpc('definir_desconto_cotacao', {
        p_cotacao_id: i.cotacaoId, p_tipo: i.tipo, p_valor: i.valor,
        p_valido_ate: i.validoAte, p_justificativa: i.justificativa,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendas'] });
      qc.invalidateQueries({ queryKey: ['descontos'] });
    },
  });
}

export function useDescontosPendentes() {
  const supabase = createClient();
  return useQuery<DescontoPendente[]>({
    queryKey: ['descontos', 'pendentes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('descontos_pendentes', {});
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useContagemDescontos(ativo: boolean) {
  const supabase = createClient();
  return useQuery<number>({
    queryKey: ['descontos', 'contagem'],
    enabled: ativo,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('descontos_pendentes_contagem', {});
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
}

export function useDecidirDesconto() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, { origem: DescontoPendente['origem']; id: string; aprovar: boolean; motivo?: string }>({
    mutationFn: async ({ origem, id, aprovar, motivo }) => {
      const { error } = origem === 'COTACAO'
        ? await supabase.rpc('decidir_desconto_cotacao', { p_cotacao_id: id, p_aprovar: aprovar, p_motivo: motivo ?? null })
        : origem === 'VEICULO'
          ? await supabase.rpc('decidir_desconto_veiculo', { p_pedido_id: id, p_aprovar: aprovar, p_motivo: motivo ?? null })
          : await supabase.rpc('decidir_desconto_titulo', { p_pedido_id: id, p_aprovar: aprovar, p_motivo: motivo ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['descontos'] });
      qc.invalidateQueries({ queryKey: ['vendas'] });
      qc.invalidateQueries({ queryKey: ['sac', 'titulos'] });
      qc.invalidateQueries({ queryKey: ['veiculo'] });
    },
  });
}

// ---------------------------------------------------------------------------
// 0179: desconto no veiculo que ja esta na base
export type PedidoDescontoVeiculo = {
  id: string; tipo: 'PERCENTUAL' | 'VALOR' | 'REMOCAO'; valor_informado: number; mensalidade_base: number;
  desconto: number; percentual: number; valido_ate: string | null; justificativa: string | null;
  situacao: 'PENDENTE' | 'APROVADO' | 'RECUSADO' | 'CANCELADO' | 'REMOVIDO';
  solicitado_por: string | null; solicitado_em: string; decidido_por: string | null;
  decidido_em: string | null; decisao_motivo: string | null;
};

export type DescontoAtualVeiculo = {
  desconto: number; validoAte: string | null; cobrancaExterna: boolean;
  mensalidade: number; limite: number;
};

export function useDescontoVeiculo(veiculoId: string) {
  const supabase = createClient();
  return useQuery<{ atual: DescontoAtualVeiculo; pedidos: PedidoDescontoVeiculo[] }>({
    queryKey: ['veiculo', veiculoId, 'desconto'],
    queryFn: async () => {
      const { data: v, error } = await supabase.from('veiculos')
        .select('desconto_mensalidade, desconto_mensalidade_ate, cobranca_externa, regional_id, regional_preco_id')
        .eq('id', veiculoId).maybeSingle();
      if (error) throw error;
      const reg = (v?.regional_preco_id ?? v?.regional_id) as string | null;
      const [mens, lim, ped] = await Promise.all([
        supabase.rpc('valor_mensalidade_veiculo', { p_veiculo_id: veiculoId }),
        reg ? supabase.rpc('limite_desconto_regional', { p_regional_id: reg }) : Promise.resolve({ data: 0, error: null }),
        supabase.rpc('descontos_do_veiculo', { p_veiculo_id: veiculoId }),
      ]);
      if (mens.error) throw mens.error;
      if (ped.error) throw ped.error;
      return {
        atual: {
          desconto: Number(v?.desconto_mensalidade ?? 0),
          validoAte: (v?.desconto_mensalidade_ate as string | null) ?? null,
          cobrancaExterna: Boolean(v?.cobranca_externa),
          mensalidade: Number(mens.data ?? 0),
          limite: Number(lim.data ?? 0),
        },
        pedidos: (ped.data ?? []) as PedidoDescontoVeiculo[],
      };
    },
  });
}

export function useSolicitarDescontoVeiculo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<PedidoDescontoVeiculo, Error, {
    veiculoId: string; tipo: TipoDesconto; valor: number; validoAte: string | null; justificativa: string;
  }>({
    mutationFn: async (i) => {
      const { data, error } = await supabase.rpc('solicitar_desconto_veiculo', {
        p_veiculo_id: i.veiculoId, p_tipo: i.tipo, p_valor: i.valor,
        p_valido_ate: i.validoAte, p_justificativa: i.justificativa,
      });
      if (error) throw error;
      return data as PedidoDescontoVeiculo;
    },
    onSuccess: (_d, i) => {
      qc.invalidateQueries({ queryKey: ['veiculo', i.veiculoId] });
      qc.invalidateQueries({ queryKey: ['descontos'] });
    },
  });
}

export function useRemoverDescontoVeiculo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, { veiculoId: string; motivo: string }>({
    mutationFn: async ({ veiculoId, motivo }) => {
      const { error } = await supabase.rpc('remover_desconto_veiculo', { p_veiculo_id: veiculoId, p_motivo: motivo });
      if (error) throw error;
    },
    onSuccess: (_d, i) => {
      qc.invalidateQueries({ queryKey: ['veiculo', i.veiculoId] });
      qc.invalidateQueries({ queryKey: ['descontos'] });
    },
  });
}
