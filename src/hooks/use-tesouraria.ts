'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  CandidatoExtratoRow,
  ConferenciaCaixaDreRow,
  DemonstrativoRow,
  ExtratoContaRow,
  ExtratoImportacoesRow,
  ExtratoItensRow,
  FluxoDiarioRow,
  Json,
  ModoMensalidadeOfx,
  SaldoContaRow,
  TipoConciliacaoExtrato,
  TransferenciasBancariasRow,
} from '@/lib/database.types';
import type { ItemOfx } from '@/lib/ofx';

// Tudo da tesouraria (0119) e da MATRIZ. Mexeu no caixa, invalida a raiz:
// saldo, extrato, fluxo e relatorios leem a MESMA fonte no banco.
const RAIZ = ['tesouraria'] as const;

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: RAIZ });
    qc.invalidateQueries({ queryKey: ['lancamentos'] });
    qc.invalidateQueries({ queryKey: ['financeiro'] });
    qc.invalidateQueries({ queryKey: ['contas-bancarias'] });
    qc.invalidateQueries({ queryKey: ['dre'] });
    qc.invalidateQueries({ queryKey: ['baixas'] });
  };
}

export function useSaldosContas(data?: string | null) {
  const supabase = createClient();
  return useQuery<SaldoContaRow[]>({
    queryKey: [...RAIZ, 'saldos', data ?? null],
    queryFn: async () => {
      const { data: d, error } = await supabase.rpc('saldos_contas', { p_data: data ?? null });
      if (error) throw error;
      return d ?? [];
    },
  });
}

export function useSaldoEm(data: string | null, conta?: string | null) {
  const supabase = createClient();
  return useQuery<number>({
    queryKey: [...RAIZ, 'saldo-em', data, conta ?? null],
    enabled: !!data,
    queryFn: async () => {
      const { data: d, error } = await supabase.rpc('saldo_consolidado_em', { p_data: data!, p_conta: conta ?? null });
      if (error) throw error;
      return Number(d ?? 0);
    },
  });
}

export interface FiltroExtrato {
  conta: string | null;
  inicio: string;
  fim: string;
  centro?: string | null;
  categoria?: string | null;
  conciliacao?: 'CONCILIADO' | 'NAO_CONCILIADO' | null;
  transferencias?: boolean;
}

export function useExtratoConta(f: FiltroExtrato, ativo = true) {
  const supabase = createClient();
  return useQuery<ExtratoContaRow[]>({
    queryKey: [...RAIZ, 'extrato', f],
    enabled: ativo && !!f.inicio && !!f.fim && f.inicio <= f.fim,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('extrato_conta', {
        p_conta: f.conta,
        p_inicio: f.inicio,
        p_fim: f.fim,
        p_centro: f.centro ?? null,
        p_categoria: f.categoria ?? null,
        p_conciliacao: f.conciliacao ?? null,
        p_transferencias: f.transferencias ?? null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFluxoDiario(inicio: string, fim: string, conta?: string | null, ativo = true) {
  const supabase = createClient();
  return useQuery<FluxoDiarioRow[]>({
    queryKey: [...RAIZ, 'fluxo-diario', inicio, fim, conta ?? null],
    enabled: ativo && !!inicio && !!fim && inicio <= fim,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fluxo_caixa_diario', { p_inicio: inicio, p_fim: fim, p_conta: conta ?? null });
      if (error) throw error;
      return (data ?? []).map((d) => ({
        ...d,
        realizado_entrada: Number(d.realizado_entrada), realizado_saida: Number(d.realizado_saida),
        previsto_entrada: Number(d.previsto_entrada), previsto_saida: Number(d.previsto_saida),
        previsto_boletos: Number(d.previsto_boletos), vencido_entrada: Number(d.vencido_entrada),
        vencido_saida: Number(d.vencido_saida),
      }));
    },
  });
}

export interface FiltroDemonstrativo {
  inicio: string;
  fim: string;
  conta?: string | null;
  centro?: string | null;
  categoria?: string | null;
  status?: 'PAGO' | 'PENDENTE' | 'ATRASADO' | 'CONCILIADO' | null;
}

export function useDemonstrativo(f: FiltroDemonstrativo, ativo = true) {
  const supabase = createClient();
  return useQuery<DemonstrativoRow[]>({
    queryKey: [...RAIZ, 'demonstrativo', f],
    enabled: ativo && !!f.inicio && !!f.fim && f.inicio <= f.fim,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('financeiro_demonstrativo', {
        p_inicio: f.inicio, p_fim: f.fim, p_conta: f.conta ?? null, p_centro: f.centro ?? null,
        p_categoria: f.categoria ?? null, p_status: f.status ?? null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useConferenciaCaixaDre(inicio: string, fim: string) {
  const supabase = createClient();
  return useQuery<ConferenciaCaixaDreRow | null>({
    queryKey: [...RAIZ, 'conferencia', inicio, fim],
    enabled: !!inicio && !!fim && inicio <= fim,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('conferencia_caixa_dre', { p_inicio: inicio, p_fim: fim });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function useTransferencias(inicio: string, fim: string) {
  const supabase = createClient();
  return useQuery<TransferenciasBancariasRow[]>({
    queryKey: [...RAIZ, 'transferencias', inicio, fim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transferencias_bancarias')
        .select('*')
        .gte('data', inicio)
        .lte('data', fim)
        .order('data', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useItensExtrato(conta: string | null, inicio: string, fim: string, situacao?: string | null) {
  const supabase = createClient();
  return useQuery<ExtratoItensRow[]>({
    queryKey: [...RAIZ, 'itens', conta, inicio, fim, situacao ?? null],
    enabled: !!conta,
    queryFn: async () => {
      let q = supabase
        .from('extrato_itens')
        .select('*')
        .eq('conta_id', conta!)
        .gte('data', inicio)
        .lte('data', fim)
        .order('data')
        .order('fitid')
        .limit(5000);
      if (situacao) q = q.eq('situacao', situacao as ExtratoItensRow['situacao']);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useImportacoesExtrato(conta: string | null) {
  const supabase = createClient();
  return useQuery<ExtratoImportacoesRow[]>({
    queryKey: [...RAIZ, 'importacoes', conta],
    enabled: !!conta,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('extrato_importacoes')
        .select('*')
        .eq('conta_id', conta!)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCandidatosExtrato(item: string | null) {
  const supabase = createClient();
  return useQuery<CandidatoExtratoRow[]>({
    queryKey: [...RAIZ, 'candidatos', item],
    enabled: !!item,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('candidatos_extrato_item', { p_item: item!, p_dias: 5 });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// --------------------------------------------------------------------- escrita

export interface ImportacaoOfx {
  conta: string;
  arquivo: string;
  hash: string;
  dataInicio: string | null;
  dataFim: string | null;
  saldo: number | null;
  saldoEm: string | null;
  itens: ItemOfx[];
}

export function useImportarOfx() {
  const supabase = createClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (i: ImportacaoOfx) => {
      const { data, error } = await supabase.rpc('importar_extrato_ofx', {
        p_conta: i.conta,
        p_arquivo: i.arquivo,
        p_hash: i.hash,
        p_data_inicio: i.dataInicio,
        p_data_fim: i.dataFim,
        p_saldo_banco: i.saldo,
        p_saldo_em: i.saldoEm,
        p_itens: i.itens as unknown as Json,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    onSuccess: invalidar,
  });
}

export function useConciliarItem() {
  const supabase = createClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (a: { item: string; tipo: TipoConciliacaoExtrato; ref: string }) => {
      const { error } = await supabase.rpc('conciliar_extrato_item', { p_item: a.item, p_tipo: a.tipo, p_ref: a.ref });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useConfirmarSugestoes() {
  const supabase = createClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (a: { conta: string; itens?: string[] | null }) => {
      const { data, error } = await supabase.rpc('confirmar_sugestoes_extrato', { p_conta: a.conta, p_itens: a.itens ?? null });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: invalidar,
  });
}

export function useReclassificarExtrato() {
  const supabase = createClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (conta: string) => {
      const { data, error } = await supabase.rpc('classificar_extrato_itens', { p_conta: conta, p_importacao: null });
      if (error) throw error;
      return data?.[0] ?? { sugeridos: 0, ignorados: 0 };
    },
    onSuccess: invalidar,
  });
}

export function useCriarLancamentoExtrato() {
  const supabase = createClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (a: {
      item: string; descricao: string; categoria: string; centro?: string | null;
      fornecedor?: string | null; cliente?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('criar_lancamento_extrato', {
        p_item: a.item, p_descricao: a.descricao, p_categoria: a.categoria, p_centro: a.centro ?? null,
        p_fornecedor: a.fornecedor ?? null, p_cliente: a.cliente ?? null, p_regional: null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
  });
}

export function useTransferenciaExtrato() {
  const supabase = createClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (a: { item: string; outraConta: string; descricao?: string | null }) => {
      const { error } = await supabase.rpc('transferencia_extrato_item', {
        p_item: a.item, p_outra_conta: a.outraConta, p_descricao: a.descricao ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useIgnorarItem() {
  const supabase = createClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (a: { item: string; motivo: string }) => {
      const { error } = await supabase.rpc('ignorar_extrato_item', { p_item: a.item, p_motivo: a.motivo });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useDesfazerItem() {
  const supabase = createClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (item: string) => {
      const { error } = await supabase.rpc('desfazer_extrato_item', { p_item: item });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useCriarTransferencia() {
  const supabase = createClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (a: { origem: string; destino: string; valor: number; data: string; descricao?: string | null }) => {
      const { error } = await supabase.rpc('criar_transferencia_bancaria', {
        p_origem: a.origem, p_destino: a.destino, p_valor: a.valor, p_data: a.data, p_descricao: a.descricao ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useCancelarTransferencia() {
  const supabase = createClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (a: { id: string; motivo: string }) => {
      const { error } = await supabase.rpc('cancelar_transferencia_bancaria', { p_id: a.id, p_motivo: a.motivo });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

/** Saldo inicial e a regra de mensalidade do OFX (a conta e da matriz: cb_write). */
export function useConfigurarConta() {
  const supabase = createClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (a: {
      id: string; saldoInicial: number; saldoInicialEm: string | null;
      modo: ModoMensalidadeOfx; textos: string[];
    }) => {
      const { error } = await supabase
        .from('contas_bancarias')
        .update({
          saldo_inicial: a.saldoInicial,
          saldo_inicial_em: a.saldoInicialEm,
          ofx_mensalidades: a.modo,
          ofx_textos_mensalidade: a.textos,
        })
        .eq('id', a.id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

/** Mensagem do erro do banco (o supabase-js devolve {message}, nao Error). */
export function mensagemErro(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Nao foi possivel concluir. Tente de novo.';
}
