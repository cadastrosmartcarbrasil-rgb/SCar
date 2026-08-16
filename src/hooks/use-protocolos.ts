'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  AtendimentosRow,
  ProtocoloLinha,
  InteracaoProtocolo,
  ResumoProtocolos,
  TituloCliente,
  TitulosFinanceirosRow,
  TipoAtendimento,
  PrioridadeAtendimento,
  StatusAtendimento,
  UsuariosRow,
} from '@/lib/database.types';

// ---------------------------------------------------------------------------
// Central de Protocolos
// ---------------------------------------------------------------------------
export interface FiltroProtocolos {
  status?: string | null;          // 'ABERTOS' | ABERTO | EM_ANDAMENTO | CONCLUIDO | CANCELADO
  responsavel?: string | null;
  busca?: string | null;
  prioridade?: PrioridadeAtendimento | null;
  regionalId?: string | null;
}

export function useProtocolos(f: FiltroProtocolos = {}) {
  const supabase = createClient();
  return useQuery<ProtocoloLinha[]>({
    queryKey: ['protocolos', f.status ?? 'all', f.responsavel ?? '', f.busca ?? '', f.prioridade ?? '', f.regionalId ?? ''],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('listar_protocolos', {
        p_status: f.status ?? null,
        p_responsavel: f.responsavel ?? null,
        p_busca: f.busca || null,
        p_prioridade: f.prioridade ?? null,
        p_regional_id: f.regionalId ?? null,
        p_limite: 300,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useResumoProtocolos() {
  const supabase = createClient();
  return useQuery<ResumoProtocolos | null>({
    queryKey: ['protocolos', 'resumo'],
    // O contador do dashboard precisa refletir a fila em tempo real.
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('resumo_protocolos', { p_regional_id: null });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function useInteracoesProtocolo(atendimentoId: string | null) {
  const supabase = createClient();
  return useQuery<InteracaoProtocolo[]>({
    queryKey: ['protocolos', 'interacoes', atendimentoId],
    enabled: !!atendimentoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('interacoes_protocolo', {
        p_atendimento_id: atendimentoId as string,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface AbrirProtocoloInput {
  cliente_id: string;
  tipo: TipoAtendimento;
  assunto?: string | null;
  descricao?: string | null;
  veiculo_id?: string | null;
  prioridade?: PrioridadeAtendimento;
  responsavel_id?: string | null;
}

export function useAbrirProtocolo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<AtendimentosRow, Error, AbrirProtocoloInput>({
    mutationFn: async (i) => {
      const { data, error } = await supabase.rpc('abrir_protocolo', {
        p_cliente_id: i.cliente_id,
        p_tipo: i.tipo,
        p_assunto: i.assunto ?? null,
        p_descricao: i.descricao ?? null,
        p_veiculo_id: i.veiculo_id ?? null,
        p_prioridade: i.prioridade ?? 'NORMAL',
        p_responsavel_id: i.responsavel_id ?? null,
        p_canal: 'SAC_INTERNO',
      });
      if (error) throw error;
      return data as AtendimentosRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocolos'] });
      qc.invalidateQueries({ queryKey: ['sac'] });
    },
  });
}

export function useRegistrarInteracao() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, { atendimento_id: string; mensagem: string; interno?: boolean }>({
    mutationFn: async (i) => {
      const { error } = await supabase.rpc('registrar_interacao_protocolo', {
        p_atendimento_id: i.atendimento_id,
        p_mensagem: i.mensagem,
        p_interno: i.interno ?? true,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['protocolos'] }),
  });
}

export function useTransferirProtocolo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<AtendimentosRow, Error, { atendimento_id: string; para_usuario: string; motivo?: string | null }>({
    mutationFn: async (i) => {
      const { data, error } = await supabase.rpc('transferir_atendimento', {
        p_atendimento_id: i.atendimento_id,
        p_para_usuario: i.para_usuario,
        p_motivo: i.motivo ?? null,
      });
      if (error) throw error;
      return data as AtendimentosRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['protocolos'] }),
  });
}

export function useAlterarStatusProtocolo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<AtendimentosRow, Error, { atendimento_id: string; status: StatusAtendimento; mensagem?: string | null }>({
    mutationFn: async (i) => {
      const { data, error } = await supabase.rpc('alterar_status_protocolo', {
        p_atendimento_id: i.atendimento_id,
        p_status: i.status,
        p_mensagem: i.mensagem ?? null,
      });
      if (error) throw error;
      return data as AtendimentosRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['protocolos'] }),
  });
}

export function useEncerrarProtocolo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<AtendimentosRow, Error, { atendimento_id: string; solucao: string }>({
    mutationFn: async (i) => {
      const { data, error } = await supabase.rpc('encerrar_protocolo', {
        p_atendimento_id: i.atendimento_id,
        p_solucao: i.solucao,
      });
      if (error) throw error;
      return data as AtendimentosRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['protocolos'] }),
  });
}

// Atendentes disponiveis para receber a transferencia.
export function useAtendentes() {
  const supabase = createClient();
  return useQuery<Pick<UsuariosRow, 'id' | 'nome' | 'papel'>[]>({
    queryKey: ['protocolos', 'atendentes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome, papel')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Historico financeiro do SAC (boletos do associado/veiculo)
// ---------------------------------------------------------------------------
export function useTitulosCliente(clienteId: string | null, veiculoId?: string | null) {
  const supabase = createClient();
  return useQuery<TituloCliente[]>({
    queryKey: ['sac', 'titulos', clienteId ?? '', veiculoId ?? 'todos'],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('titulos_do_cliente', {
        p_cliente_id: clienteId as string,
        p_veiculo_id: veiculoId ?? null,
        p_limite: 60,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAjustarTitulo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<TitulosFinanceirosRow, Error, {
    titulo_id: string;
    vencimento?: string | null;
    desconto?: number | null;
    acrescimo?: number | null;
    observacao?: string | null;
  }>({
    mutationFn: async (i) => {
      const { data, error } = await supabase.rpc('ajustar_titulo', {
        p_titulo_id: i.titulo_id,
        p_vencimento: i.vencimento ?? null,
        p_desconto: i.desconto ?? null,
        p_acrescimo: i.acrescimo ?? null,
        p_observacao: i.observacao ?? null,
      });
      if (error) throw error;
      return data as TitulosFinanceirosRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sac', 'titulos'] });
      qc.invalidateQueries({ queryKey: ['cobrancas'] });
    },
  });
}

export function useReemitirTitulo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (tituloId) => {
      const { error } = await supabase.rpc('reemitir_titulo', { p_titulo_id: tituloId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sac', 'titulos'] });
      qc.invalidateQueries({ queryKey: ['cobrancas'] });
    },
  });
}
