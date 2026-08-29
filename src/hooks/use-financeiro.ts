'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Parcela } from '@/lib/financeiro';
import type {
  LancamentosFinanceirosRow,
  BaixasFinanceirasRow,
  ContasBancariasRow,
  CentrosCustoRow,
  TipoMovimentacao,
  StatusLancamento,
  FinanceiroResumo,
  FluxoMes,
  AgingLinha,
} from '@/lib/database.types';

export interface LancamentoComRel extends LancamentosFinanceirosRow {
  fornecedores?: { razao_social: string } | null;
  clientes?: { nome_razao_social: string } | null;
  categorias_dre?: { codigo_estruturado: string; nome: string } | null;
  centros_custo?: { nome: string } | null;
}

export interface FiltroLancamentos {
  tipo?: TipoMovimentacao;
  status?: StatusLancamento;
  inicio?: string;
  fim?: string;
  categoriaId?: string;
  centroCustoId?: string;
  /** Filtra pelo campo de data escolhido na tela. */
  campoData?: 'data_vencimento' | 'data_emissao' | 'competencia';
}

export function useLancamentos(filtro?: FiltroLancamentos) {
  const supabase = createClient();
  const campo = filtro?.campoData ?? 'data_vencimento';
  return useQuery<LancamentoComRel[]>({
    queryKey: [
      'lancamentos', filtro?.tipo ?? 'all', filtro?.status ?? 'all',
      filtro?.inicio ?? '-', filtro?.fim ?? '-', campo,
      filtro?.categoriaId ?? '-', filtro?.centroCustoId ?? '-',
    ],
    queryFn: async () => {
      let q = supabase
        .from('lancamentos_financeiros')
        .select(
          '*, fornecedores(razao_social), clientes(nome_razao_social), ' +
            'categorias_dre(codigo_estruturado, nome), centros_custo(nome)',
        )
        .order('data_vencimento', { ascending: true });
      if (filtro?.tipo) q = q.eq('tipo', filtro.tipo);
      if (filtro?.status) q = q.eq('status', filtro.status);
      if (filtro?.inicio) q = q.gte(campo, filtro.inicio);
      if (filtro?.fim) q = q.lte(campo, filtro.fim);
      if (filtro?.categoriaId) q = q.eq('categoria_dre_id', filtro.categoriaId);
      if (filtro?.centroCustoId) q = q.eq('centro_custo_id', filtro.centroCustoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as LancamentoComRel[];
    },
  });
}

/** Painel de indicadores do periodo (RPC financeiro_resumo). */
export function useFinanceiroResumo(p: { inicio: string; fim: string; regionalId?: string | null }) {
  const supabase = createClient();
  return useQuery<FinanceiroResumo | null>({
    queryKey: ['financeiro', 'resumo', p.inicio, p.fim, p.regionalId ?? 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('financeiro_resumo', {
        p_data_inicio: p.inicio, p_data_fim: p.fim, p_regional_id: p.regionalId ?? null,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

/** Fluxo de caixa mensal previsto x realizado. */
export function useFluxoMensal(p: { inicio: string; fim: string; regionalId?: string | null }) {
  const supabase = createClient();
  return useQuery<FluxoMes[]>({
    queryKey: ['financeiro', 'fluxo', p.inicio, p.fim, p.regionalId ?? 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('financeiro_fluxo_mensal', {
        p_data_inicio: p.inicio, p_data_fim: p.fim, p_regional_id: p.regionalId ?? null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Aging da carteira (inadimplencia por faixa de atraso). */
export function useAging(regionalId?: string | null) {
  const supabase = createClient();
  return useQuery<AgingLinha[]>({
    queryKey: ['financeiro', 'aging', regionalId ?? 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('financeiro_aging', {
        p_regional_id: regionalId ?? null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function payloadLancamento(l: Partial<LancamentosFinanceirosRow>) {
  return {
    tipo: l.tipo,
    fornecedor_id: l.fornecedor_id || null,
    cliente_id: l.cliente_id || null,
    descricao: l.descricao,
    numero_documento: l.numero_documento || null,
    observacoes: l.observacoes || null,
    categoria_dre_id: l.categoria_dre_id || null,
    centro_custo_id: l.centro_custo_id || null,
    evento_id: l.evento_id || null,
    regional_id: l.regional_id || null,
    valor_original: l.valor_original ?? 0,
    data_emissao: l.data_emissao,
    data_vencimento: l.data_vencimento,
    competencia: l.competencia || l.data_vencimento,
    forma_pagamento_prevista: l.forma_pagamento_prevista || null,
  };
}

export interface SalvarLancamento extends Partial<LancamentosFinanceirosRow> {
  /** Quando > 1, gera o carne de parcelas em um unico insert. */
  parcelas?: Parcela[];
}

export function useSaveLancamento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, SalvarLancamento>({
    mutationFn: async (l) => {
      if (l.id) {
        const { error } = await supabase
          .from('lancamentos_financeiros')
          .update(payloadLancamento(l))
          .eq('id', l.id);
        if (error) throw error;
        return;
      }

      // Parcelado: um unico insert em lote (atomico) com o grupo em comum.
      if (l.parcelas && l.parcelas.length > 1) {
        const grupo = (globalThis.crypto?.randomUUID?.() ?? null) as string | null;
        const base = payloadLancamento(l);
        const linhas = l.parcelas.map((p) => ({
          ...base,
          descricao: `${base.descricao} (${p.parcela_numero}/${p.parcela_total})`,
          valor_original: p.valor,
          data_vencimento: p.data_vencimento,
          competencia: p.competencia,
          parcela_numero: p.parcela_numero,
          parcela_total: p.parcela_total,
          grupo_parcelas: grupo,
        }));
        const { error } = await supabase.from('lancamentos_financeiros').insert(linhas);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from('lancamentos_financeiros').insert(payloadLancamento(l));
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lancamentos'] });
      qc.invalidateQueries({ queryKey: ['financeiro'] });
      qc.invalidateQueries({ queryKey: ['dre'] });
    },
  });
}

/** Cancela um titulo (nunca apaga: o historico financeiro e imutavel). */
export function useCancelarLancamento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('lancamentos_financeiros')
        .update({ status: 'cancelado' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lancamentos'] });
      qc.invalidateQueries({ queryKey: ['financeiro'] });
      qc.invalidateQueries({ queryKey: ['dre'] });
    },
  });
}

/** Baixa o saldo remanescente em uma unica operacao (RPC quitar_lancamento). */
export function useQuitarLancamento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; data?: string; contaBancariaId?: string | null }>({
    mutationFn: async ({ id, data, contaBancariaId }) => {
      const { error } = await supabase.rpc('quitar_lancamento', {
        p_lancamento_id: id,
        p_data_pagamento: data ?? new Date().toISOString().slice(0, 10),
        p_conta_bancaria_id: contaBancariaId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lancamentos'] });
      qc.invalidateQueries({ queryKey: ['baixas'] });
      qc.invalidateQueries({ queryKey: ['financeiro'] });
      qc.invalidateQueries({ queryKey: ['dre'] });
    },
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
      qc.invalidateQueries({ queryKey: ['financeiro'] });
      qc.invalidateQueries({ queryKey: ['dre'] });
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

export function useSaveContaBancaria() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, Partial<ContasBancariasRow>>({
    mutationFn: async (c) => {
      const payload = {
        nome: c.nome,
        banco: c.banco || null,
        agencia: c.agencia || null,
        conta: c.conta || null,
        tipo: c.tipo || null,
        chave_pix: c.chave_pix || null,
        ativo: c.ativo ?? true,
      };
      if (c.id) {
        const { error } = await supabase.from('contas_bancarias').update(payload).eq('id', c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('contas_bancarias').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contas-bancarias'] }),
  });
}

export function useDeleteContaBancaria() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from('contas_bancarias').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contas-bancarias'] }),
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
