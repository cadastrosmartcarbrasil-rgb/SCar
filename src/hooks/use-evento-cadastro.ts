'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { normalizarPlaca } from '@/lib/placa';
import type { EventosSinistroRow } from '@/lib/database.types';

export interface VeiculoLocalizado {
  id: string;
  placa: string;
  marca: string | null;
  modelo: string | null;
  ano_fabricacao: number | null;
  ano_modelo: number | null;
  cor: string | null;
  valor_fipe: number | null;
  regional_id: string | null;
  cliente_id: string;
  clientes: {
    id: string;
    nome_razao_social: string;
    matricula: string | null;
    cpf_cnpj: string;
    tipo_pessoa: 'PF' | 'PJ';
  } | null;
}

// Busca o veiculo pela placa, trazendo os dados do proprietario (associado).
export function useBuscarVeiculoPorPlaca() {
  const supabase = createClient();
  return useMutation<VeiculoLocalizado | null, Error, string>({
    mutationFn: async (placa: string) => {
      const p = normalizarPlaca(placa);
      const { data, error } = await supabase
        .from('veiculos')
        .select(
          'id, placa, marca, modelo, ano_fabricacao, ano_modelo, cor, valor_fipe, regional_id, cliente_id, clientes(id, nome_razao_social, matricula, cpf_cnpj, tipo_pessoa)',
        )
        .eq('placa', p)
        .neq('status', 'excluido')
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as VeiculoLocalizado) ?? null;
    },
  });
}

// Cria o evento (protocolo gerado automaticamente pela trigger).
export function useCriarEvento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: Partial<EventosSinistroRow>) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('eventos_sinistro')
        .insert({
          veiculo_id: e.veiculo_id,
          cliente_id: e.cliente_id,
          data_ocorrencia: e.data_ocorrencia,
          data_comunicacao: e.data_comunicacao || null,
          envolvido_tipo: e.envolvido_tipo ?? 'ASSOCIADO',
          possui_terceiros: e.possui_terceiros ?? false,
          tipo_envolvimento: e.tipo_envolvimento || null,
          tipo_evento_id: e.tipo_evento_id || null,
          local_evento: e.local_evento ?? {},
          valor_fipe_atualizado: e.valor_fipe_atualizado ?? null,
          valor_participacao: e.valor_participacao ?? null,
          bo_numero: e.bo_numero || null,
          bo_data: e.bo_data || null,
          bo_unidade: e.bo_unidade || null,
          bo_resumo: e.bo_resumo || null,
          descricao: e.descricao || null,
          regional_id: e.regional_id || null,
          operador_atual_id: userData.user?.id ?? null,
          status: 'ABERTO',
        })
        .select('id, numero_protocolo')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eventos'] }),
  });
}
