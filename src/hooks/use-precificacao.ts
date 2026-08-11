'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  TiposVeiculoRow,
  ProdutosRow,
  CalculoMensalidade,
  TabelaPrecosFaixaRow,
  ParticipacaoFaixaRow,
} from '@/lib/database.types';

export function useTiposVeiculo() {
  const supabase = createClient();
  return useQuery<TiposVeiculoRow[]>({
    queryKey: ['precificacao', 'tipos-veiculo'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tipos_veiculo').select('*').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProdutos() {
  const supabase = createClient();
  return useQuery<ProdutosRow[]>({
    queryKey: ['precificacao', 'produtos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('produtos').select('*').order('categoria').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface ResultadoSimulacao {
  calculo: CalculoMensalidade;
  participacao: number;
}

// Chama o motor de calculo no banco (fonte unica de verdade).
export function useSimularPreco() {
  const supabase = createClient();
  return useMutation<ResultadoSimulacao, Error, { fipe: number; tipoVeiculoId: string; produtosIds: string[] }>({
    mutationFn: async ({ fipe, tipoVeiculoId, produtosIds }) => {
      const [mensal, part] = await Promise.all([
        supabase.rpc('calcular_mensalidade', {
          p_fipe: fipe,
          p_tipo_veiculo_id: tipoVeiculoId,
          p_produtos_ids: produtosIds,
        }),
        supabase.rpc('calcular_participacao', { p_fipe: fipe, p_tipo_veiculo_id: tipoVeiculoId }),
      ]);
      if (mensal.error) throw mensal.error;
      if (part.error) throw part.error;
      return {
        calculo: mensal.data as unknown as CalculoMensalidade,
        participacao: Number(part.data ?? 0),
      };
    },
  });
}

// --- CRUD de catalogos (Configuracoes) ---
export function useSaveTipoVeiculo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await supabase.from('tipos_veiculo').insert({ nome });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['precificacao', 'tipos-veiculo'] }),
  });
}
export function useDeleteTipoVeiculo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tipos_veiculo').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['precificacao', 'tipos-veiculo'] }),
  });
}

// --- Editor da matriz de precos ---
export function useTabelaPrecos(tipoVeiculoId?: string) {
  const supabase = createClient();
  return useQuery<TabelaPrecosFaixaRow[]>({
    queryKey: ['precificacao', 'tabela', tipoVeiculoId ?? 'none'],
    enabled: !!tipoVeiculoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tabela_precos_faixa')
        .select('*')
        .eq('tipo_veiculo_id', tipoVeiculoId!)
        .order('fipe_minimo');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useParticipacoes(tipoVeiculoId?: string) {
  const supabase = createClient();
  return useQuery<ParticipacaoFaixaRow[]>({
    queryKey: ['precificacao', 'participacao', tipoVeiculoId ?? 'none'],
    enabled: !!tipoVeiculoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('participacao_faixa')
        .select('*')
        .eq('tipo_veiculo_id', tipoVeiculoId!)
        .order('fipe_minimo');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface SalvarTabelaPayload {
  tipoVeiculoId: string;
  faixas: { produto_id: string; fipe_minimo: number; fipe_maximo: number; valor_mensal: number; tipo_valor: string }[];
  participacoes: { fipe_minimo: number; fipe_maximo: number; valor: number; tipo_valor: string }[];
}

// Substitui a matriz do tipo de veiculo de forma atomica (RPC transacional).
export function useSalvarTabela() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, SalvarTabelaPayload>({
    mutationFn: async ({ tipoVeiculoId, faixas, participacoes }) => {
      const { error } = await supabase.rpc('substituir_tabela_precos', {
        p_tipo_veiculo: tipoVeiculoId,
        p_faixas: faixas,
        p_participacoes: participacoes,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['precificacao', 'tabela', v.tipoVeiculoId] });
      qc.invalidateQueries({ queryKey: ['precificacao', 'participacao', v.tipoVeiculoId] });
    },
  });
}

export function useSaveProduto() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Partial<ProdutosRow>) => {
      const payload = {
        nome: p.nome,
        fornecedor_nome: p.fornecedor_nome || 'Interno',
        metodo_preco: p.metodo_preco ?? 'FIXO',
        valor_fixo: p.valor_fixo ?? null,
        percentual: p.percentual ?? null,
        obrigatorio: p.obrigatorio ?? false,
        categoria: p.categoria || 'BENEFICIO',
        status: p.status ?? true,
      };
      if (p.id) {
        const { error } = await supabase.from('produtos').update(payload).eq('id', p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('produtos').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['precificacao', 'produtos'] }),
  });
}
