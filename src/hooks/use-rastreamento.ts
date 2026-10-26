'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { lerTodas } from '@/lib/paginacao';
import type { FornecedoresRow } from '@/lib/database.types';

// A rastreadora e um FORNECEDOR com `empresa_rastreamento = true` (0051).
// Nao existe mais tabela `empresas_rastreamento`: o cadastro vive em
// /fornecedores, com o resto dos prestadores.
export interface Rastreadora extends FornecedoresRow {
  /** nome como aparece nas telas (fantasia > razao social) */
  nome: string;
}

export function useEmpresasRastreamento(incluirInativas = false) {
  const supabase = createClient();
  return useQuery<Rastreadora[]>({
    queryKey: ['rastreamento', 'empresas', incluirInativas],
    queryFn: async () => {
      const data = await lerTodas<FornecedoresRow>((de, ate) => {
        let q = supabase.from('fornecedores').select('*')
          .eq('empresa_rastreamento', true)
          .order('razao_social').order('id');
        if (!incluirInativas) q = q.eq('ativo', true);
        return q.range(de, ate);
      });
      return data.map((f) => ({ ...f, nome: f.nome_fantasia?.trim() || f.razao_social }));
    },
  });
}
