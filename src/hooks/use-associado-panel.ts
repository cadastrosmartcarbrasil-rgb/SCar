'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  ClientesRow,
  TitulosFinanceirosRow,
  EventosSinistroRow,
  ComunicacoesRow,
} from '@/lib/database.types';

export function useAssociado(id: string) {
  const supabase = createClient();
  return useQuery<ClientesRow | null>({
    queryKey: ['associado', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useTitulosAssociado(id: string) {
  const supabase = createClient();
  return useQuery<TitulosFinanceirosRow[]>({
    queryKey: ['associado', id, 'titulos'],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('titulos_financeiros')
        .select('*')
        .eq('cliente_id', id)
        .order('data_vencimento', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type EventoAssociado = EventosSinistroRow & { tipos_evento?: { nome: string } | null };

export function useEventosAssociado(id: string) {
  const supabase = createClient();
  return useQuery<EventoAssociado[]>({
    queryKey: ['associado', id, 'eventos'],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eventos_sinistro')
        .select('*, tipos_evento(nome)')
        .eq('cliente_id', id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EventoAssociado[];
    },
  });
}

export function useComunicacoes(id: string, canal?: 'EMAIL' | 'SMS' | 'WHATSAPP') {
  const supabase = createClient();
  return useQuery<ComunicacoesRow[]>({
    queryKey: ['associado', id, 'comunicacoes', canal ?? 'all'],
    enabled: !!id,
    queryFn: async () => {
      let q = supabase.from('comunicacoes').select('*').eq('cliente_id', id).order('created_at', { ascending: false });
      if (canal) q = q.eq('canal', canal);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}
