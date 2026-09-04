'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { ordenarVeiculos } from '@/lib/sac';
import { normalizarDigitos } from '@/lib/rastreador';
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
        .order('data_ativacao', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (associadoId) q = q.eq('cliente_id', associadoId);
      const { data, error } = await q;
      if (error) throw error;
      // Ordem padrao do sistema: ativos primeiro, inativos/cancelados no fim
      // (mesma regra do SQL ordem_status_veiculo, em src/lib/sac.ts).
      return ordenarVeiculos((data ?? []) as unknown as VeiculoComAssociado[]);
    },
  });
}

export type SaveVeiculoInput = Partial<VeiculosRow> & {
  opcionaisIds?: string[]; // produtos opcionais do veiculo (veiculo_produtos)
  alertasIds?: string[];   // tipos de alerta ativos no veiculo (veiculo_alertas)
};

export function useSaveVeiculo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<string, Error, SaveVeiculoInput>({
    mutationFn: async (v) => {
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
        tipo_veiculo_id: v.tipo_veiculo_id || null,
        // ficha ampliada
        plano_protecao_id: v.plano_protecao_id || null,
        alienado: v.alienado ?? false,
        alienado_financeira: v.alienado_financeira || null,
        numero_portas: v.numero_portas ?? null,
        valor_mensalidade: v.valor_mensalidade ?? null,
        dia_vencimento: v.dia_vencimento ?? null,
        // rastreamento
        rastreador_imei: normalizarDigitos(v.rastreador_imei) || null,
        rastreador_chip: normalizarDigitos(v.rastreador_chip) || null,
        empresa_rastreamento_id: v.empresa_rastreamento_id || null,
      };

      let veiculoId = v.id;
      if (veiculoId) {
        const { error } = await supabase.from('veiculos').update(payload).eq('id', veiculoId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('veiculos').insert(payload).select('id').single();
        if (error) throw error;
        veiculoId = data.id;
      }

      // Produtos opcionais do veiculo (substitui o conjunto).
      if (v.opcionaisIds) {
        await supabase.from('veiculo_produtos').delete().eq('veiculo_id', veiculoId);
        if (v.opcionaisIds.length) {
          const { error } = await supabase.from('veiculo_produtos')
            .insert(v.opcionaisIds.map((pid) => ({ veiculo_id: veiculoId!, produto_id: pid })));
          if (error) throw error;
        }
      }

      // Alertas ativos do veiculo (substitui o conjunto ativo).
      if (v.alertasIds) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('veiculo_alertas').delete().eq('veiculo_id', veiculoId).eq('ativo', true);
        if (v.alertasIds.length) {
          const { error } = await supabase.from('veiculo_alertas')
            .insert(v.alertasIds.map((tid) => ({ veiculo_id: veiculoId!, tipo_alerta_id: tid, ativo: true, created_by: user?.id ?? null })));
          if (error) throw error;
        }
      }

      return veiculoId!;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['veiculos'] });
      qc.invalidateQueries({ queryKey: ['ficha', 'veiculo-produtos', id] });
      qc.invalidateQueries({ queryKey: ['ficha', 'veiculo-alertas', id] });
    },
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
