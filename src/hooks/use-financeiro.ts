'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  LancamentosFinanceirosRow,
  BaixasFinanceirasRow,
  ContasBancariasRow,
  CentrosCustoRow,
  TipoMovimentacao,
  StatusLancamento,
} from '@/lib/database.types';

export interface LancamentoComRel extends LancamentosFinanceirosRow {
  fornecedores?: { razao_social: string } | null;
  clientes?: { nome_razao_social: string } | null;
}

export function useLancamentos(filtro?: { tipo?: TipoMovimentacao; status?: StatusLancamento }) {
  const supabase = createClient();
  return useQuery<LancamentoComRel[]>({
    queryKey: ['lancamentos', filtro?.tipo ?? 'all', filtro?.status ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('lancamentos_financeiros')
        .select('*, fornecedores(razao_social), clientes(nome_razao_social)')
        .order('data_vencimento', { ascending: true });
      if (filtro?.tipo) q = q.eq('tipo', filtro.tipo);
      if (filtro?.status) q = q.eq('status', filtro.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as LancamentoComRel[];
    },
  });
}

export function useSaveLancamento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, Partial<LancamentosFinanceirosRow>>({
    mutationFn: async (l) => {
      const payload = {
        tipo: l.tipo,
        fornecedor_id: l.fornecedor_id || null,
        cliente_id: l.cliente_id || null,
        descricao: l.descricao,
        categoria_dre_id: l.categoria_dre_id || null,
        centro_custo_id: l.centro_custo_id || null,
        evento_id: l.evento_id || null,
        regional_id: l.regional_id || null,
        valor_original: l.valor_original ?? 0,
        data_emissao: l.data_emissao,
        data_vencimento: l.data_vencimento,
        forma_pagamento_prevista: l.forma_pagamento_prevista || null,
      };
      if (l.id) {
        const { error } = await supabase.from('lancamentos_financeiros').update(payload).eq('id', l.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('lancamentos_financeiros').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lancamentos'] }),
  });
}

export function useBaixas(lancamentoId: string) {
  const supabase = createClient();
  return useQuery<BaixasFinanceirasRow[]>({
    queryKey: ['baixas', lancamentoId],
    enabled: !!lancamentoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('baixas_financeiras')
        .select('*')
        .eq('lancamento_id', lancamentoId)
        .order('data_pagamento');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddBaixa() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, Partial<BaixasFinanceirasRow>>({
    mutationFn: async (b) => {
      const valorLiquido = (b.valor_pago ?? 0) - (b.desconto ?? 0) + (b.juros_multa ?? 0);
      const { error } = await supabase.from('baixas_financeiras').insert({
        lancamento_id: b.lancamento_id,
        data_pagamento: b.data_pagamento,
        valor_pago: b.valor_pago ?? 0,
        desconto: b.desconto ?? 0,
        juros_multa: b.juros_multa ?? 0,
        valor_liquido: valorLiquido,
        conta_bancaria_id: b.conta_bancaria_id || null,
        comprovante_transacao_id: b.comprovante_transacao_id || null,
        end_to_end_id_pix: b.end_to_end_id_pix || null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['baixas', v.lancamento_id] });
      qc.invalidateQueries({ queryKey: ['lancamentos'] });
    },
  });
}

export function useContasBancarias() {
  const supabase = createClient();
  return useQuery<ContasBancariasRow[]>({
    queryKey: ['contas-bancarias'],
    queryFn: async () => {
      const { data, error } = await supabase.from('contas_bancarias').select('*').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCentrosCusto() {
  const supabase = createClient();
  return useQuery<CentrosCustoRow[]>({
    queryKey: ['centros-custo'],
    queryFn: async () => {
      const { data, error } = await supabase.from('centros_custo').select('*').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}
