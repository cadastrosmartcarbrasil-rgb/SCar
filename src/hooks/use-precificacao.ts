'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  TiposVeiculoRow,
  ProdutosRow,
  CotacaoPlano,
  TabelaPrecosFaixaRow,
  ParticipacaoFaixaRow,
  AdesaoFaixaRow,
  CotasParticipacaoRow,
  PlanosProtecaoRow,
} from '@/lib/database.types';

export function useCotasParticipacao() {
  const supabase = createClient();
  return useQuery<CotasParticipacaoRow[]>({
    queryKey: ['precificacao', 'cotas-participacao'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cotas_participacao')
        .select('*')
        .order('percentual');
      if (error) throw error;
      return data ?? [];
    },
  });
}

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
  calculo: CotacaoPlano;
  participacao: number;
  adesao: number;
}

// Motor de combos (cotar_plano): base + regra de rastreador + produtos do plano
// + avulsos. A participacao respeita a cota override quando informada.
export function useSimularPreco() {
  const supabase = createClient();
  return useMutation<
    ResultadoSimulacao,
    Error,
    { fipe: number; tipoVeiculoId: string; produtosIds: string[]; planoId?: string | null; cotaId?: string | null }
  >({
    mutationFn: async ({ fipe, tipoVeiculoId, produtosIds, planoId, cotaId }) => {
      const [cot, part] = await Promise.all([
        supabase.rpc('cotar_plano', {
          p_fipe: fipe,
          p_tipo_veiculo_id: tipoVeiculoId,
          p_plano_id: planoId ?? null,
          p_avulsos_ids: produtosIds,
        }),
        supabase.rpc('calcular_participacao', {
          p_fipe: fipe,
          p_tipo_veiculo_id: tipoVeiculoId,
          p_cota_id: cotaId ?? null,
        }),
      ]);
      if (cot.error) throw cot.error;
      if (part.error) throw part.error;
      const calculo = cot.data as unknown as CotacaoPlano;
      return {
        calculo,
        participacao: Number(part.data ?? calculo.franquia_participacao ?? 0),
        adesao: Number(calculo.taxa_adesao ?? 0),
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

export function useAdesoes(tipoVeiculoId?: string) {
  const supabase = createClient();
  return useQuery<AdesaoFaixaRow[]>({
    queryKey: ['precificacao', 'adesao', tipoVeiculoId ?? 'none'],
    enabled: !!tipoVeiculoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('adesao_faixa')
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
  adesoes: { fipe_minimo: number; fipe_maximo: number; valor: number }[];
}

// Substitui a matriz do tipo de veiculo de forma atomica (RPC transacional).
export function useSalvarTabela() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, SalvarTabelaPayload>({
    mutationFn: async ({ tipoVeiculoId, faixas, participacoes, adesoes }) => {
      const { error } = await supabase.rpc('substituir_tabela_precos', {
        p_tipo_veiculo: tipoVeiculoId,
        p_faixas: faixas,
        p_participacoes: participacoes,
        p_adesoes: adesoes,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['precificacao', 'tabela', v.tipoVeiculoId] });
      qc.invalidateQueries({ queryKey: ['precificacao', 'participacao', v.tipoVeiculoId] });
      qc.invalidateQueries({ queryKey: ['precificacao', 'adesao', v.tipoVeiculoId] });
    },
  });
}

export function useSaveCota() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: { id?: string; codigo: string; percentual: number; descricao?: string | null; ativo?: boolean }) => {
      const payload = {
        codigo: c.codigo.trim().toUpperCase(),
        percentual: c.percentual,
        descricao: c.descricao ?? null,
        ativo: c.ativo ?? true,
      };
      if (c.id) {
        const { error } = await supabase.from('cotas_participacao').update(payload).eq('id', c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('cotas_participacao').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['precificacao', 'cotas-participacao'] }),
  });
}

export function useDeleteCota() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cotas_participacao').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['precificacao', 'cotas-participacao'] }),
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

// --- Regra de rastreador (por tipo de veiculo) ---
export function useSalvarRegraRastreador() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { tipoVeiculoId: string; exige: boolean; limite: number; valor: number }
  >({
    mutationFn: async ({ tipoVeiculoId, exige, limite, valor }) => {
      const { error } = await supabase
        .from('tipos_veiculo')
        .update({
          exige_rastreador: exige,
          valor_limite_isencao: limite,
          valor_mensalidade_rastreador: valor,
        })
        .eq('id', tipoVeiculoId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['precificacao', 'tipos-veiculo'] }),
  });
}

// --- Planos / Combos ---
export function usePlanos() {
  const supabase = createClient();
  return useQuery<PlanosProtecaoRow[]>({
    queryKey: ['precificacao', 'planos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('planos_protecao')
        .select('*')
        .order('nivel')
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePlanoProdutos(planoId?: string) {
  const supabase = createClient();
  return useQuery<string[]>({
    queryKey: ['precificacao', 'plano-produtos', planoId ?? 'none'],
    enabled: !!planoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plano_produtos')
        .select('produto_id')
        .eq('plano_id', planoId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.produto_id);
    },
  });
}

export function useSavePlano() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<
    string,
    Error,
    { id?: string; nome: string; descricao_comercial?: string | null; nivel?: number; ativo?: boolean; produtosIds: string[] }
  >({
    mutationFn: async ({ id, nome, descricao_comercial, nivel, ativo, produtosIds }) => {
      const payload = {
        nome: nome.trim(),
        descricao_comercial: descricao_comercial ?? null,
        nivel: nivel ?? 0,
        ativo: ativo ?? true,
      };
      let planoId = id;
      if (planoId) {
        const { error } = await supabase.from('planos_protecao').update(payload).eq('id', planoId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('planos_protecao').insert(payload).select('id').single();
        if (error) throw error;
        planoId = data.id;
      }
      // Substitui os vinculos de produtos do plano.
      const { error: delErr } = await supabase.from('plano_produtos').delete().eq('plano_id', planoId);
      if (delErr) throw delErr;
      if (produtosIds.length > 0) {
        const { error: insErr } = await supabase
          .from('plano_produtos')
          .insert(produtosIds.map((pid) => ({ plano_id: planoId!, produto_id: pid })));
        if (insErr) throw insErr;
      }
      return planoId!;
    },
    onSuccess: (planoId) => {
      qc.invalidateQueries({ queryKey: ['precificacao', 'planos'] });
      qc.invalidateQueries({ queryKey: ['precificacao', 'plano-produtos', planoId] });
    },
  });
}

export function useDeletePlano() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('planos_protecao').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['precificacao', 'planos'] }),
  });
}
