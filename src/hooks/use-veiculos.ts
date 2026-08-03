'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { VeiculosRow } from '@/lib/database.types';

export interface VeiculoComAssociado extends VeiculosRow {
  clientes?: { nome_razao_social: string; matricula: string | null } | null;
}

export function useVeiculos(associadoId?: string) {
  const supabase = createClient();
  return useQuery<VeiculoComAssociado[]>({
    queryKey: ['veiculos', associadoId ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('veiculos')
        .select('*, clientes(nome_razao_social, matricula)')
        .neq('status', 'excluido')
        .order('created_at', { ascending: false });
      if (associadoId) q = q.eq('cliente_id', associadoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as VeiculoComAssociado[];
    },
  });
}

export function useSaveVeiculo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<VeiculosRow>) => {
      const payload = {
        cliente_id: v.cliente_id,
        placa: (v.placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
        renavam: v.renavam || null,
        chassi: v.chassi || null,
        marca: v.marca || null,
        modelo: v.modelo || null,
        cor: v.cor || null,
        ano_fabricacao: v.ano_fabricacao || null,
        ano_modelo: v.ano_modelo || null,
        uso: v.uso ?? 'passeio',
        regional_id: v.regional_id || null,
        vendedor_id: v.vendedor_id || null,
        status: v.status ?? 'ativo',
        data_contrato: v.data_contrato || null,
        tipo_negociacao: v.tipo_negociacao || null,
        codigo_fipe: v.codigo_fipe || null,
        valor_fipe: v.valor_fipe ?? null,
        quilometragem: v.quilometragem ?? null,
        tipo_cambio: v.tipo_cambio || null,
        combustivel: v.combustivel || null,
      };
      if (v.id) {
        const { error } = await supabase.from('veiculos').update(payload).eq('id', v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('veiculos').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['veiculos'] }),
  });
}

export function useExcluirVeiculo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('veiculos').update({ status: 'excluido' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['veiculos'] }),
  });
}
