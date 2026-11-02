'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { RegraRastreadorLinha } from '@/lib/database.types';
import type { RegraRastreador } from '@/lib/produtos';

/**
 * 0173 — a regra do rastreador que vale para o tipo NA UNIDADE (a da unidade
 * ou, sem ela, a da matriz). E a MESMA leitura que o motor (`calcular_mensalidade`)
 * usa, entao a tela nunca oferece o opcional que o motor vai ignorar.
 * `regionalId` nulo = matriz.
 */
export function useRegraRastreador(tipoVeiculoId: string | null | undefined, regionalId: string | null | undefined) {
  const supabase = createClient();
  return useQuery<RegraRastreador | null>({
    queryKey: ['precificacao', 'regra-rastreador', tipoVeiculoId ?? '', regionalId ?? ''],
    enabled: !!tipoVeiculoId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('regra_rastreador', {
        p_tipo_veiculo_id: tipoVeiculoId!,
        p_regional_id: regionalId ?? null,
      });
      if (error) throw error;
      const r = data?.[0];
      if (!r) return null;
      return {
        exige_rastreador: !!r.exige,
        valor_limite_isencao: Number(r.limite ?? 0),
        valor_mensalidade_rastreador: Number(r.valor ?? 0),
        origem: r.origem,
      };
    },
  });
}

/** A unidade de quem esta cotando (vendedor: a do cadastro; equipe: a do usuario; matriz: null). */
export function useRegionalDeQuemCota() {
  const supabase = createClient();
  return useQuery<string | null>({
    queryKey: ['vendas', 'regional-de-quem-cota'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('regional_de_quem_cota');
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}

export function useRegrasRastreadorDoTipo(tipoVeiculoId?: string) {
  const supabase = createClient();
  return useQuery<RegraRastreadorLinha[]>({
    queryKey: ['precificacao', 'regras-rastreador', tipoVeiculoId ?? 'nenhum'],
    enabled: !!tipoVeiculoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('regras_rastreador_do_tipo', { p_tipo_veiculo_id: tipoVeiculoId! });
      if (error) throw error;
      return (data ?? []).map((l) => ({ ...l, limite: Number(l.limite), valor: Number(l.valor) }));
    },
  });
}

export function useSalvarRegraRastreadorRegional() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      regionalId: string; tipoVeiculoId: string;
      /** null = voltar a regra da matriz */
      regra: { exige: boolean; limite: number; valor: number; observacao?: string | null } | null;
    }) => {
      if (!v.regra) {
        const { error } = await supabase.rpc('remover_regra_rastreador_regional', {
          p_regional_id: v.regionalId, p_tipo_veiculo_id: v.tipoVeiculoId,
        });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.rpc('salvar_regra_rastreador_regional', {
        p_regional_id: v.regionalId, p_tipo_veiculo_id: v.tipoVeiculoId,
        p_exige: v.regra.exige, p_limite: v.regra.limite, p_valor: v.regra.valor,
        p_observacao: v.regra.observacao ?? null,
      });
      if (error) throw error;
    },
    // O preco mudou: qualquer cotacao em cache virou mentira.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['precificacao'] });
      qc.invalidateQueries({ queryKey: ['vendas'] });
    },
  });
}
