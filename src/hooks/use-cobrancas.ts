'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  FaturasRow,
  FaturaItensRow,
  ResumoGeracaoFaturas,
  ResumoEmissaoTitulos,
  ResumoCobrancas,
  ResumoPeriodoFaturas,
  CobrancaLinha,
  CobrancaRemessasRow,
  CobrancaRemessaItensRow,
  StatusCobranca,
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

// ---------------------------------------------------------------------------
// Dashboard de Cobranca (KPIs + listagem de boletos com filtros avancados)
// ---------------------------------------------------------------------------
export interface FiltroDashboard {
  inicio?: string | null;        // vencimento de
  fim?: string | null;           // vencimento ate
  placa?: string | null;
  associado?: string | null;     // nome ou CPF/CNPJ
  valorMin?: number | null;
  valorMax?: number | null;
  status?: StatusCobranca | null;
  regionalId?: string | null;
  limite?: number;
}

const chaveFiltro = (f: FiltroDashboard) => [
  f.inicio ?? '', f.fim ?? '', f.placa ?? '', f.associado ?? '',
  f.valorMin ?? '', f.valorMax ?? '', f.status ?? '', f.regionalId ?? '',
];

export function useResumoCobrancas(f: FiltroDashboard) {
  const supabase = createClient();
  return useQuery<ResumoCobrancas | null>({
    queryKey: ['cobrancas', 'resumo', f.inicio ?? '', f.fim ?? '', f.regionalId ?? ''],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('resumo_cobrancas', {
        p_inicio: f.inicio ?? null,
        p_fim: f.fim ?? null,
        p_regional_id: f.regionalId ?? null,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function useListaCobrancas(f: FiltroDashboard) {
  const supabase = createClient();
  return useQuery<CobrancaLinha[]>({
    queryKey: ['cobrancas', 'lista', ...chaveFiltro(f)],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('listar_cobrancas', {
        p_inicio: f.inicio ?? null,
        p_fim: f.fim ?? null,
        p_placa: f.placa || null,
        p_associado: f.associado || null,
        p_valor_min: f.valorMin ?? null,
        p_valor_max: f.valorMax ?? null,
        p_status: f.status ?? null,
        p_regional_id: f.regionalId ?? null,
        p_limite: f.limite ?? 500,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Boletagem recorrente (lote por periodo) e remessa bancaria
// ---------------------------------------------------------------------------
export interface GeracaoLoteInput {
  competencia: string;              // 'YYYY-MM'
  meses: number;                    // 1..24 (padrao do modulo: 6)
  cliente_id?: string | null;
  veiculo_ids?: string[] | null;
  regional_id?: string | null;
  emitir_titulos?: boolean;
}
export interface GeracaoLoteResultado {
  periodos: ResumoPeriodoFaturas[];
  titulos: { competencia: string; titulos_emitidos: number; valor_total: number }[];
  total_faturas: number;
  total_valor: number;
}

export function useGerarLotePeriodo() {
  const qc = useQueryClient();
  return useMutation<GeracaoLoteResultado, Error, GeracaoLoteInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/v1/cobrancas/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Falha ao gerar as cobrancas');
      return json as GeracaoLoteResultado;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cobrancas'] }),
  });
}

export interface RemessaResultado {
  provedor: string;
  remessa: CobrancaRemessasRow | null;
  enviados: number;
  erros?: number;
  mensagem?: string;
}

export function useEnviarRemessa() {
  const qc = useQueryClient();
  return useMutation<RemessaResultado, Error, { competencia?: string | null; regional_id?: string | null; titulo_ids?: string[] }>({
    mutationFn: async (input) => {
      const res = await fetch('/api/v1/cobrancas/remessa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Falha ao enviar a remessa');
      return json as RemessaResultado;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cobrancas'] }),
  });
}

export function useRemessas(limite = 20) {
  const supabase = createClient();
  return useQuery<CobrancaRemessasRow[]>({
    queryKey: ['cobrancas', 'remessas', limite],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cobranca_remessas')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limite);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRemessaItens(remessaId: string | null) {
  const supabase = createClient();
  return useQuery<CobrancaRemessaItensRow[]>({
    queryKey: ['cobrancas', 'remessa-itens', remessaId],
    enabled: !!remessaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cobranca_remessa_itens')
        .select('*')
        .eq('remessa_id', remessaId as string)
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
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
