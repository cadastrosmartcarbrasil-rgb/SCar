'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { soDigitos } from '@/lib/documento';
import type { FornecedoresRow } from '@/lib/database.types';

export function useFornecedores() {
  const supabase = createClient();
  return useQuery<FornecedoresRow[]>({
    queryKey: ['fornecedores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fornecedores')
        .select('*')
        .order('razao_social');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveFornecedor() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, Partial<FornecedoresRow>>({
    mutationFn: async (f) => {
      const payload = {
        tipo_pessoa: f.tipo_pessoa ?? 'PJ',
        documento: soDigitos(f.documento ?? ''),
        razao_social: f.razao_social,
        nome_fantasia: f.nome_fantasia || null,
        situacao_cadastral: f.situacao_cadastral || null,
        cnae_principal: f.cnae_principal || null,
        email: f.email || null,
        telefone: f.telefone || null,
        endereco: f.endereco ?? {},
        dados_receita: f.dados_receita ?? {},
        ativo: f.ativo ?? true,
      };
      if (f.id) {
        const { error } = await supabase.from('fornecedores').update(payload).eq('id', f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('fornecedores').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fornecedores'] }),
  });
}
