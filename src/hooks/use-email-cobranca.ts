'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { EmailConfigRow, EmailOutboxRow, EmailReguaRow, EmailStatus, EmailSupressoesRow } from '@/lib/database.types';

const CHAVE = ['email-cobranca'] as const;

export function useEmailConfig() {
  return useQuery({
    queryKey: [...CHAVE, 'config'],
    queryFn: async () => {
      const { data, error } = await createClient().from('email_config').select('*').eq('id', true).maybeSingle();
      if (error) throw error;
      return data as EmailConfigRow | null;
    },
  });
}

export function useSalvarEmailConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<EmailConfigRow>) => {
      const { error } = await createClient().from('email_config')
        .update({ ...v, updated_at: new Date().toISOString() }).eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useEmailRegua() {
  return useQuery({
    queryKey: [...CHAVE, 'regua'],
    queryFn: async () => {
      const { data, error } = await createClient().from('email_regua').select('*').order('ordem');
      if (error) throw error;
      return (data ?? []) as EmailReguaRow[];
    },
  });
}

export function useSalvarRegua() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { codigo: string; ativo?: boolean; offset_dias?: number }) => {
      const { codigo, ...resto } = v;
      const { error } = await createClient().from('email_regua')
        .update({ ...resto, updated_at: new Date().toISOString() }).eq('codigo', codigo);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useEmailResumo(dias: number) {
  return useQuery({
    queryKey: [...CHAVE, 'resumo', dias],
    queryFn: async () => {
      const { data, error } = await createClient().rpc('email_painel_resumo', { p_dias: dias });
      if (error) throw error;
      return (data ?? null) as Record<string, number> | null;
    },
  });
}

export type FiltroFila = { status: EmailStatus | ''; regua: string; busca: string; de: string; ate: string };

export type ItemFila = EmailOutboxRow & { clientes: { nome_razao_social: string } | null };

export function useEmailFila(f: FiltroFila) {
  return useQuery({
    queryKey: [...CHAVE, 'fila', f],
    queryFn: async () => {
      let q = createClient().from('email_outbox')
        .select('*, clientes(nome_razao_social)')
        .order('criado_em', { ascending: false })
        .limit(200);
      if (f.status) q = q.eq('status', f.status);
      if (f.regua) q = q.eq('regua_codigo', f.regua);
      if (f.busca.trim()) q = q.ilike('destinatario', `%${f.busca.trim().toLowerCase().replace(/[%,()]/g, '')}%`);
      if (f.de) q = q.gte('data_alvo', f.de);
      if (f.ate) q = q.lte('data_alvo', f.ate);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ItemFila[];
    },
  });
}

export function useEmailSupressoes(busca: string) {
  return useQuery({
    queryKey: [...CHAVE, 'supressoes', busca],
    queryFn: async () => {
      let q = createClient().from('email_supressoes').select('*').eq('ativo', true)
        .order('criado_em', { ascending: false }).limit(200);
      if (busca.trim()) q = q.ilike('email', `%${busca.trim().toLowerCase().replace(/[%,()]/g, '')}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EmailSupressoesRow[];
    },
  });
}

function rpcMutation<A extends Record<string, unknown>>(nome: 'reenviar_email' | 'cancelar_email' | 'liberar_supressao_email' | 'suprimir_email_manual') {
  return function useRpc() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (args: A) => {
        const { error } = await createClient().rpc(nome, args as never);
        if (error) throw error;
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
    });
  };
}

export const useReenviarEmail = rpcMutation<{ p_id: string }>('reenviar_email');
export const useCancelarEmail = rpcMutation<{ p_id: string; p_motivo?: string | null }>('cancelar_email');
export const useLiberarSupressao = rpcMutation<{ p_id: string; p_motivo: string }>('liberar_supressao_email');
export const useSuprimirEmail = rpcMutation<{ p_email: string; p_motivo: string }>('suprimir_email_manual');

async function postar(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export function useRodarRotinaEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (somenteFila: boolean) => postar('/api/v1/comunicacoes/email/rotina', { somente_fila: somenteFila }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useEnviarTesteEmail() {
  return useMutation({
    mutationFn: (v: { email: string; template: string; offset_dias: number }) => postar('/api/v1/comunicacoes/email/teste', v),
  });
}
