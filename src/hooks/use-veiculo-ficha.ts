'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  TiposAlertaRow, ContratosAdesaoRow, VistoriasRow, CotacaoPlano, AlertaVeiculo,
} from '@/lib/database.types';

// --- Catalogo de alertas reutilizaveis (Configuracoes) ---
export function useTiposAlerta(incluirInativos = false) {
  const supabase = createClient();
  return useQuery<TiposAlertaRow[]>({
    queryKey: ['ficha', 'tipos-alerta', incluirInativos],
    queryFn: async () => {
      let q = supabase.from('tipos_alerta').select('*').order('severidade', { ascending: false }).order('nome');
      if (!incluirInativos) q = q.eq('ativo', true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}
export function useSaveTipoAlerta() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Partial<TiposAlertaRow>) => {
      const payload = { nome: t.nome?.trim(), descricao: t.descricao ?? null, severidade: t.severidade ?? 'MEDIA', ativo: t.ativo ?? true };
      if (t.id) {
        const { error } = await supabase.from('tipos_alerta').update(payload).eq('id', t.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tipos_alerta').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ficha', 'tipos-alerta'] }),
  });
}

// --- Produtos opcionais e alertas do veiculo (para o form da ficha) ---
export function useVeiculoProdutos(veiculoId?: string) {
  const supabase = createClient();
  return useQuery<string[]>({
    queryKey: ['ficha', 'veiculo-produtos', veiculoId ?? 'none'],
    enabled: !!veiculoId,
    queryFn: async () => {
      const { data, error } = await supabase.from('veiculo_produtos').select('produto_id').eq('veiculo_id', veiculoId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.produto_id);
    },
  });
}
export function useVeiculoAlertas(veiculoId?: string) {
  const supabase = createClient();
  return useQuery<string[]>({
    queryKey: ['ficha', 'veiculo-alertas', veiculoId ?? 'none'],
    enabled: !!veiculoId,
    queryFn: async () => {
      const { data, error } = await supabase.from('veiculo_alertas').select('tipo_alerta_id').eq('veiculo_id', veiculoId!).eq('ativo', true);
      if (error) throw error;
      return (data ?? []).map((r) => r.tipo_alerta_id);
    },
  });
}

// --- Alertas/pendencias do veiculo (0030): MESMA fonte do card do SAC ---
// Le as linhas de veiculo_alertas (nao o catalogo), entao alerta de tipo
// desativado tambem aparece — era o que sumia da tela de edicao.
export function useAlertasVeiculo(veiculoId?: string, incluirResolvidos = false) {
  const supabase = createClient();
  return useQuery<AlertaVeiculo[]>({
    queryKey: ['ficha', 'alertas-veiculo', veiculoId ?? 'none', incluirResolvidos],
    enabled: !!veiculoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('alertas_veiculo', {
        p_veiculo_id: veiculoId!, p_incluir_resolvidos: incluirResolvidos,
      });
      if (error) throw error;
      return (data ?? []) as AlertaVeiculo[];
    },
  });
}

// Invalida tudo que exibe alerta: ficha, contador do card e visao 360 do SAC.
function invalidarAlertas(qc: ReturnType<typeof useQueryClient>, veiculoId: string) {
  qc.invalidateQueries({ queryKey: ['ficha', 'alertas-veiculo', veiculoId] });
  qc.invalidateQueries({ queryKey: ['ficha', 'veiculo-alertas', veiculoId] });
  qc.invalidateQueries({ queryKey: ['sac'] });
}

export function useAbrirAlertaVeiculo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<unknown, Error, { veiculo_id: string; tipo_alerta_id: string; mensagem?: string | null }>({
    mutationFn: async (i) => {
      const { data, error } = await supabase.rpc('abrir_alerta_veiculo', {
        p_veiculo_id: i.veiculo_id, p_tipo_alerta_id: i.tipo_alerta_id, p_mensagem: i.mensagem ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, i) => invalidarAlertas(qc, i.veiculo_id),
  });
}

export function useResolverAlertaVeiculo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<unknown, Error, { alerta_id: string; veiculo_id: string; observacao?: string | null }>({
    mutationFn: async (i) => {
      const { data, error } = await supabase.rpc('resolver_alerta_veiculo', {
        p_alerta_id: i.alerta_id, p_observacao: i.observacao ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, i) => invalidarAlertas(qc, i.veiculo_id),
  });
}

// Calcula a mensalidade (motor cotar_plano) para o veiculo em edicao.
export function useCalcularMensalidadeVeiculo() {
  const supabase = createClient();
  return useMutation<number, Error, { fipe: number; tipoVeiculoId: string | null; planoId: string | null; opcionaisIds: string[] }>({
    mutationFn: async ({ fipe, tipoVeiculoId, planoId, opcionaisIds }) => {
      if (!tipoVeiculoId) throw new Error('Selecione a categoria de risco (tipo de veiculo)');
      const { data, error } = await supabase.rpc('cotar_plano', {
        p_fipe: fipe, p_tipo_veiculo_id: tipoVeiculoId, p_plano_id: planoId ?? null, p_avulsos_ids: opcionaisIds,
      });
      if (error) throw error;
      return Number((data as unknown as CotacaoPlano)?.valor_total_mensalidade ?? 0);
    },
  });
}

// --- Ficha: contratos de adesao e vistorias (leitura na aba do veiculo) ---
export function useContratosVeiculo(veiculoId?: string) {
  const supabase = createClient();
  return useQuery<ContratosAdesaoRow[]>({
    queryKey: ['ficha', 'contratos', veiculoId ?? 'none'],
    enabled: !!veiculoId,
    queryFn: async () => {
      const { data, error } = await supabase.from('contratos_adesao').select('*').eq('veiculo_id', veiculoId!).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
export function useVistoriasVeiculo(veiculoId?: string) {
  const supabase = createClient();
  return useQuery<VistoriasRow[]>({
    queryKey: ['ficha', 'vistorias', veiculoId ?? 'none'],
    enabled: !!veiculoId,
    queryFn: async () => {
      const { data, error } = await supabase.from('vistorias').select('*').eq('veiculo_id', veiculoId!).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
