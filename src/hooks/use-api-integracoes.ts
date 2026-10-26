'use client';

// API externa (0151): as integracoes (chaves) e a trilha de requisicoes. So admin.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { ApiIntegracaoLista, ApiRequisicoesRow } from '@/lib/database.types';

export type DadosIntegracao = {
  nome: string;
  descricao: string | null;
  fornecedor_id: string | null;
  escopos: string[];
  regional_ids: string[] | null;
  ips: string[] | null;
  expira_em: string | null;
};

export function useApiIntegracoes() {
  const supabase = createClient();
  return useQuery<ApiIntegracaoLista[]>({
    queryKey: ['api-integracoes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('api_integracoes_listar');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useApiRequisicoes(integracaoId: string | null) {
  const supabase = createClient();
  return useQuery<ApiRequisicoesRow[]>({
    queryKey: ['api-integracoes', 'requisicoes', integracaoId],
    enabled: !!integracaoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_requisicoes')
        .select('*')
        .eq('integracao_id', integracaoId!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

async function postar(corpo: Record<string, unknown>): Promise<{ id: string; chave: string; prefixo: string }> {
  const r = await fetch('/api/v1/api-integracoes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? 'Falha ao gravar a integração');
  return j;
}

export function useCriarApiIntegracao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: DadosIntegracao) => postar({ acao: 'criar', ...d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-integracoes'] }),
  });
}

export function useGirarChaveApi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postar({ acao: 'girar', id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-integracoes'] }),
  });
}

export function useAtualizarApiIntegracao() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: DadosIntegracao & { id: string; ativo: boolean }) => {
      const { error } = await supabase.rpc('atualizar_api_integracao', {
        p_id: d.id, p_nome: d.nome, p_descricao: d.descricao, p_fornecedor_id: d.fornecedor_id,
        p_escopos: d.escopos, p_regional_ids: d.regional_ids, p_ips: d.ips, p_expira_em: d.expira_em, p_ativo: d.ativo,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-integracoes'] }),
  });
}

export function useRevogarApiIntegracao() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { id: string; motivo: string }) => {
      const { error } = await supabase.rpc('revogar_api_integracao', { p_id: d.id, p_motivo: d.motivo });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-integracoes'] }),
  });
}
