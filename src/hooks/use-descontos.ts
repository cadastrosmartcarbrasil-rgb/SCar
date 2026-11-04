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
  return useMutation<void, Error, { origem: 'COTACAO' | 'TITULO'; id: string; aprovar: boolean; motivo?: string }>({
    mutationFn: async ({ origem, id, aprovar, motivo }) => {
      const { error } = origem === 'COTACAO'
        ? await supabase.rpc('decidir_desconto_cotacao', { p_cotacao_id: id, p_aprovar: aprovar, p_motivo: motivo ?? null })
        : await supabase.rpc('decidir_desconto_titulo', { p_pedido_id: id, p_aprovar: aprovar, p_motivo: motivo ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['descontos'] });
      qc.invalidateQueries({ queryKey: ['vendas'] });
      qc.invalidateQueries({ queryKey: ['sac', 'titulos'] });
    },
  });
}
