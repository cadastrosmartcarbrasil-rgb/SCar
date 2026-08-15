'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  FaturasRow,
  FaturaItensRow,
  ResumoGeracaoFaturas,
  ResumoEmissaoTitulos,
  StatusFatura,
  StatusTitulo,
} from '@/lib/database.types';

// Fatura da competencia com o associado, o veiculo (individual) e o titulo
// financeiro emitido (base do boleto / 2a via / inadimplencia).
export interface FaturaComRel extends FaturasRow {
  clientes?: { nome_razao_social: string; cpf_cnpj: string } | null;
  veiculos?: { placa: string; modelo: string | null } | null;
  titulos_financeiros?: {
    id: string;
    status: StatusTitulo;
    linha_digitavel: string | null;
    url_boleto: string | null;
  } | null;
}

export interface FiltroCobrancas {
  competencia: string;               // 'YYYY-MM-01'
  regionalId?: string | null;
  status?: StatusFatura | null;
}

export function useFaturas({ competencia, regionalId, status }: FiltroCobrancas) {
  const supabase = createClient();
  return useQuery<FaturaComRel[]>({
    queryKey: ['cobrancas', competencia, regionalId ?? 'all', status ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('faturas')
        .select(
          '*, clientes(nome_razao_social, cpf_cnpj), veiculos(placa, modelo), titulos_financeiros(id, status, linha_digitavel, url_boleto)',
        )
        .eq('competencia', competencia)
        .order('vencimento', { ascending: true });
      if (regionalId) q = q.eq('regional_id', regionalId);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as FaturaComRel[];
    },
  });
}

// Itens (um por veiculo) — carregados sob demanda ao abrir a fatura agrupada.
export function useFaturaItens(faturaId: string | null) {
  const supabase = createClient();
  return useQuery<FaturaItensRow[]>({
    queryKey: ['cobrancas', 'itens', faturaId],
    enabled: !!faturaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fatura_itens')
        .select('*')
        .eq('fatura_id', faturaId as string)
        .order('descricao');
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Lote do mes: gera as faturas de todos os associados com veiculo faturavel.
export function useGerarFaturas() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<ResumoGeracaoFaturas, Error, { competencia: string; regionalId?: string | null }>({
    mutationFn: async ({ competencia, regionalId }) => {
      const { data, error } = await supabase.rpc('gerar_faturas_competencia', {
        p_competencia: competencia,
        p_regional_id: regionalId ?? null,
      });
      if (error) throw error;
      return data?.[0] ?? { associados: 0, faturas_geradas: 0, valor_total: 0 };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cobrancas'] }),
  });
}

// Emite os titulos financeiros das faturas abertas da competencia.
export function useEmitirTitulos() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<ResumoEmissaoTitulos, Error, { competencia: string; regionalId?: string | null }>({
    mutationFn: async ({ competencia, regionalId }) => {
      const { data, error } = await supabase.rpc('emitir_titulos_competencia', {
        p_competencia: competencia,
        p_regional_id: regionalId ?? null,
      });
      if (error) throw error;
      return data?.[0] ?? { titulos_emitidos: 0, valor_total: 0 };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cobrancas'] }),
  });
}

export function useEmitirTituloFatura() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (faturaId) => {
      const { error } = await supabase.rpc('emitir_titulo_fatura', { p_fatura_id: faturaId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cobrancas'] }),
  });
}

export function useCancelarFatura() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (faturaId) => {
      const { error } = await supabase.rpc('cancelar_fatura', { p_fatura_id: faturaId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cobrancas'] }),
  });
}

// Faturas de um associado (usado no painel do associado / SAC).
export function useFaturasCliente(clienteId: string | null) {
  const supabase = createClient();
  return useQuery<FaturaComRel[]>({
    queryKey: ['cobrancas', 'cliente', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('faturas')
        .select('*, veiculos(placa, modelo), titulos_financeiros(id, status, linha_digitavel, url_boleto)')
        .eq('cliente_id', clienteId as string)
        .order('competencia', { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []) as unknown as FaturaComRel[];
    },
  });
}
