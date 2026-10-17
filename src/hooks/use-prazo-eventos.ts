'use client';

// Prazo regulatorio do evento (0113 — Art. 22, CNSP 491/2026). As chaves ficam
// debaixo de ['eventos'] de proposito: mudar o status do evento (Kanban,
// tramitacao) ja invalida ['eventos'], e o prazo acompanha sem codigo a mais.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  EventoDocumentosModeloRow,
  EventoDocumentosRow,
  EventoPrazo,
  EventoPrazoHistoricoRow,
  SituacaoDocumentoEvento,
} from '@/lib/database.types';

export function useEventosPrazos(opts: { incluirEncerrados?: boolean } = {}) {
  const supabase = createClient();
  return useQuery<EventoPrazo[]>({
    queryKey: ['eventos', 'prazos', { encerrados: !!opts.incluirEncerrados }],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('eventos_prazos', {
        p_incluir_encerrados: !!opts.incluirEncerrados,
      });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5 * 60_000,
  });
}

export function useEventoPrazo(eventoId: string) {
  const supabase = createClient();
  return useQuery<EventoPrazo | null>({
    queryKey: ['eventos', eventoId, 'prazo'],
    enabled: !!eventoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('eventos_prazos', { p_evento: eventoId });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function useDocumentosEvento(eventoId: string) {
  const supabase = createClient();
  return useQuery<EventoDocumentosRow[]>({
    queryKey: ['eventos', eventoId, 'documentos'],
    enabled: !!eventoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('evento_documentos')
        .select('*')
        .eq('evento_id', eventoId)
        .order('obrigatorio', { ascending: false })
        .order('solicitado_em')
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type HistoricoPrazo = EventoPrazoHistoricoRow & { usuarios: { nome: string } | null };

export function useHistoricoPrazo(eventoId: string) {
  const supabase = createClient();
  return useQuery<HistoricoPrazo[]>({
    queryKey: ['eventos', eventoId, 'prazo-historico'],
    enabled: !!eventoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('evento_prazo_historico')
        .select('*, usuarios(nome)')
        .eq('evento_id', eventoId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as HistoricoPrazo[];
    },
  });
}

function useInvalidarEvento() {
  const qc = useQueryClient();
  return (eventoId: string) => {
    qc.invalidateQueries({ queryKey: ['eventos', eventoId] });
    qc.invalidateQueries({ queryKey: ['eventos', 'prazos'] });
  };
}

export function useAdicionarDocumentoEvento() {
  const supabase = createClient();
  const invalidar = useInvalidarEvento();
  return useMutation({
    mutationFn: async (v: { eventoId: string; nome: string; obrigatorio: boolean }) => {
      const { error } = await supabase
        .from('evento_documentos')
        .insert({ evento_id: v.eventoId, nome: v.nome, obrigatorio: v.obrigatorio });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidar(v.eventoId),
  });
}

export function useAtualizarDocumentoEvento() {
  const supabase = createClient();
  const invalidar = useInvalidarEvento();
  return useMutation({
    mutationFn: async (v: {
      eventoId: string;
      id: string;
      situacao: SituacaoDocumentoEvento;
      entregueEm?: string | null;
      observacao?: string | null;
      anexoId?: string | null;
    }) => {
      const patch: Partial<EventoDocumentosRow> = {
        situacao: v.situacao,
        entregue_em: v.situacao === 'ENTREGUE' ? v.entregueEm ?? null : null,
      };
      if (v.observacao !== undefined) patch.observacao = v.observacao;
      if (v.anexoId !== undefined) patch.anexo_id = v.anexoId;
      const { error } = await supabase.from('evento_documentos').update(patch).eq('id', v.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidar(v.eventoId),
  });
}

export function useRemoverDocumentoEvento() {
  const supabase = createClient();
  const invalidar = useInvalidarEvento();
  return useMutation({
    mutationFn: async (v: { eventoId: string; id: string }) => {
      const { error } = await supabase.from('evento_documentos').delete().eq('id', v.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidar(v.eventoId),
  });
}

export function useAplicarListaPadrao() {
  const supabase = createClient();
  const invalidar = useInvalidarEvento();
  return useMutation({
    mutationFn: async (eventoId: string) => {
      const { data, error } = await supabase.rpc('aplicar_documentos_padrao_evento', { p_evento: eventoId });
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: (_d, eventoId) => invalidar(eventoId),
  });
}

export function useMarcarDocumentacaoCompleta() {
  const supabase = createClient();
  const invalidar = useInvalidarEvento();
  return useMutation({
    mutationFn: async (v: { eventoId: string; data: string; observacao?: string }) => {
      const { error } = await supabase.rpc('marcar_documentacao_completa', {
        p_evento: v.eventoId, p_data: v.data, p_observacao: v.observacao || null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidar(v.eventoId),
  });
}

export function useReabrirDocumentacao() {
  const supabase = createClient();
  const invalidar = useInvalidarEvento();
  return useMutation({
    mutationFn: async (v: { eventoId: string; motivo: string }) => {
      const { error } = await supabase.rpc('reabrir_documentacao_evento', { p_evento: v.eventoId, p_motivo: v.motivo });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidar(v.eventoId),
  });
}

export function useDarCienciaPrazo() {
  const supabase = createClient();
  const invalidar = useInvalidarEvento();
  return useMutation({
    mutationFn: async (eventoId: string) => {
      const { data, error } = await supabase.rpc('dar_ciencia_prazo_evento', { p_evento: eventoId });
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: (_d, eventoId) => invalidar(eventoId),
  });
}

// ---------------------------------------------------------------------------
// Catalogo (Configuracoes -> Documentos do Evento)
// ---------------------------------------------------------------------------
export type ModeloDocumento = EventoDocumentosModeloRow & { tipos_evento: { nome: string } | null };

export function useModelosDocumentoEvento() {
  const supabase = createClient();
  return useQuery<ModeloDocumento[]>({
    queryKey: ['config', 'documentos-evento'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('evento_documentos_modelo')
        .select('*, tipos_evento(nome)')
        .order('ordem')
        .order('nome');
      if (error) throw error;
      return (data ?? []) as unknown as ModeloDocumento[];
    },
  });
}

export function useSalvarModeloDocumento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<EventoDocumentosModeloRow> & { nome: string }) => {
      const linha = {
        nome: v.nome.trim().toUpperCase(),
        descricao: v.descricao ?? null,
        obrigatorio: v.obrigatorio ?? true,
        tipo_evento_id: v.tipo_evento_id ?? null,
        ordem: v.ordem ?? 100,
        ativo: v.ativo ?? true,
      };
      const { error } = v.id
        ? await supabase.from('evento_documentos_modelo').update(linha).eq('id', v.id)
        : await supabase.from('evento_documentos_modelo').insert(linha);
      if (error) {
        if (error.code === '23505') throw new Error('Ja existe um documento com esse nome para esse tipo de evento.');
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'documentos-evento'] }),
  });
}

export function useExcluirModeloDocumento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('evento_documentos_modelo').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'documentos-evento'] }),
  });
}
