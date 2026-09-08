'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { MemoConversa, MemoDoUsuario, MemoGestao, MemoMensagem } from '@/lib/database.types';

/** O mural de quem esta logado (Central do Atendente). */
export function useMeuMural(incluirLidos = true) {
  const supabase = createClient();
  return useQuery<MemoDoUsuario[]>({
    queryKey: ['memos', 'mural', incluirLidos],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('memos_do_usuario', {
        p_incluir_lidos: incluirLidos,
        p_limite: 20,
      });
      if (error) throw error;
      return data ?? [];
    },
    // O mural e o canal da gestao com a operacao: vale reconferir de tempos em
    // tempos sem obrigar o atendente a recarregar a pagina.
    refetchInterval: 120_000,
  });
}

export function useMarcarMemoLido() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<boolean, Error, string>({
    mutationFn: async (memoId) => {
      const { data, error } = await supabase.rpc('marcar_memo_lido', { p_memo_id: memoId });
      if (error) throw error;
      return !!data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memos'] }),
  });
}

// --- lado da gestao ---------------------------------------------------------
export function useMemosGestao() {
  const supabase = createClient();
  return useQuery<MemoGestao[]>({
    queryKey: ['memos', 'gestao'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('memos_gestao', { p_limite: 100 });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface FormMemo {
  id?: string | null;
  titulo: string;
  mensagem: string;
  categoria: string;
  prioridade: string;
  exige_leitura: boolean;
  regional_id: string | null;
  papeis: string[] | null;
  expira_em: string | null;
  publicado: boolean;
}

export function useSalvarMemo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<unknown, Error, FormMemo>({
    mutationFn: async (m) => {
      const { data, error } = await supabase.rpc('salvar_memo', {
        p_id: m.id ?? null,
        p_titulo: m.titulo,
        p_mensagem: m.mensagem,
        p_categoria: m.categoria,
        p_prioridade: m.prioridade,
        p_exige_leitura: m.exige_leitura,
        p_regional_id: m.regional_id,
        p_papeis: m.papeis && m.papeis.length ? m.papeis : null,
        p_expira_em: m.expira_em,
        p_publicado: m.publicado,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memos'] }),
  });
}

export function useArquivarMemo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<boolean, Error, string>({
    mutationFn: async (id) => {
      const { data, error } = await supabase.rpc('arquivar_memo', { p_id: id });
      if (error) throw error;
      return !!data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memos'] }),
  });
}

/** Acionamentos 24h em aberto — o "pegando fogo agora" do quadro de alertas. */
export function useAcionamentosAbertos() {
  const supabase = createClient();
  return useQuery({
    queryKey: ['memos', 'acionamentos-abertos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acionamentos_assistencia')
        .select('id, protocolo, status, created_at, veiculos(placa), clientes(nome_razao_social)')
        .in('status', ['ABERTO', 'EM_COTACAO', 'AUTORIZADO', 'EM_ATENDIMENTO'])
        .order('created_at', { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });
}

// ---------------------------------------------------------------------------
// A conversa do comunicado (0058)
// ---------------------------------------------------------------------------

/** As conversas de um comunicado: todas para quem publicou, a propria para os demais. */
export function useMemoConversas(memoId: string | null) {
  const supabase = createClient();
  return useQuery<MemoConversa[]>({
    queryKey: ['memos', 'conversas', memoId],
    enabled: !!memoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('memo_conversas', { p_memo_id: memoId! });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** As mensagens de UMA conversa (sem `comUsuario`, a de quem esta logado). */
export function useMemoMensagens(memoId: string | null, comUsuario?: string | null) {
  const supabase = createClient();
  return useQuery<MemoMensagem[]>({
    queryKey: ['memos', 'mensagens', memoId, comUsuario ?? 'eu'],
    enabled: !!memoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('memo_mensagens', {
        p_memo_id: memoId!,
        p_com_usuario: comUsuario ?? null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useResponderMemo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<unknown, Error, { memoId: string; mensagem: string; comUsuario?: string | null }>({
    mutationFn: async ({ memoId, mensagem, comUsuario }) => {
      const { data, error } = await supabase.rpc('responder_memo', {
        p_memo_id: memoId,
        p_mensagem: mensagem,
        p_com_usuario: comUsuario ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memos'] }),
  });
}

/** Abrir a conversa ja e dar ciencia do que o outro lado escreveu. */
export function useMarcarConversaLida() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<number, Error, { memoId: string; comUsuario?: string | null }>({
    mutationFn: async ({ memoId, comUsuario }) => {
      const { data, error } = await supabase.rpc('marcar_conversa_lida', {
        p_memo_id: memoId,
        p_com_usuario: comUsuario ?? null,
      });
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: (n) => { if (n > 0) qc.invalidateQueries({ queryKey: ['memos'] }); },
  });
}
