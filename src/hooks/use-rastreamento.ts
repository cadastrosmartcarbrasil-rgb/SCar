'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { normalizarDigitos } from '@/lib/rastreador';
import type { EmpresasRastreamentoRow } from '@/lib/database.types';

// --- Catalogo de empresas de rastreamento (o "Rastreador por:" do veiculo) ---
export function useEmpresasRastreamento(incluirInativas = false) {
  const supabase = createClient();
  return useQuery<EmpresasRastreamentoRow[]>({
    queryKey: ['rastreamento', 'empresas', incluirInativas],
    queryFn: async () => {
      let q = supabase.from('empresas_rastreamento').select('*').order('nome');
      if (!incluirInativas) q = q.eq('ativo', true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveEmpresaRastreamento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, Partial<EmpresasRastreamentoRow>>({
    mutationFn: async (e) => {
      const payload = {
        nome: (e.nome ?? '').trim(),
        razao_social: e.razao_social?.trim() || null,
        cnpj: normalizarDigitos(e.cnpj) || null,
        contato: e.contato?.trim() || null,
        telefone: e.telefone?.trim() || null,
        email: e.email?.trim() || null,
        plataforma_url: e.plataforma_url?.trim() || null,
        observacoes: e.observacoes?.trim() || null,
        ativo: e.ativo ?? true,
      };
      if (e.id) {
        const { error } = await supabase.from('empresas_rastreamento').update(payload).eq('id', e.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('empresas_rastreamento').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rastreamento', 'empresas'] }),
  });
}
