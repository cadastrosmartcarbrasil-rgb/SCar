'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { soDigitos } from '@/lib/documento';
import type { FornecedoresRow } from '@/lib/database.types';

/** Tipo do fornecedor — e so uma marcacao na MESMA tabela (0051). */
export type TipoFornecedor = 'todos' | 'geral' | 'prestador' | 'rastreadora';

export function useFornecedores(tipo: TipoFornecedor = 'todos') {
  const supabase = createClient();
  return useQuery<FornecedoresRow[]>({
    queryKey: ['fornecedores', tipo],
    queryFn: async () => {
      let q = supabase.from('fornecedores').select('*').order('razao_social');
      if (tipo === 'prestador') q = q.eq('prestador_assistencia', true);
      if (tipo === 'rastreadora') q = q.eq('empresa_rastreamento', true);
      if (tipo === 'geral') q = q.eq('prestador_assistencia', false).eq('empresa_rastreamento', false);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveFornecedor() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<string, Error, Partial<FornecedoresRow>>({
    mutationFn: async (f) => {
      const payload = {
        tipo_pessoa: f.tipo_pessoa ?? 'PJ',
        // documento e opcional desde a 0051 — rastreadora e prestador pequeno
        // as vezes entram sem CNPJ. Vazio vira null, nao string vazia.
        documento: soDigitos(f.documento ?? '') || null,
        razao_social: f.razao_social,
        nome_fantasia: f.nome_fantasia || null,
        situacao_cadastral: f.situacao_cadastral || null,
        cnae_principal: f.cnae_principal || null,
        contato: f.contato || null,
        email: f.email || null,
        telefone: f.telefone || null,
        endereco: f.endereco ?? {},
        dados_receita: f.dados_receita ?? {},
        ativo: f.ativo ?? true,
        // tipos e campos proprios de cada um
        prestador_assistencia: f.prestador_assistencia ?? false,
        whatsapp: f.whatsapp || null,
        cobertura: f.cobertura || null,
        chave_pix: f.chave_pix || null,
        observacoes: f.observacoes || null,
        empresa_rastreamento: f.empresa_rastreamento ?? false,
        plataforma_url: f.plataforma_url || null,
        custo_mensal_equipamento: f.custo_mensal_equipamento ?? 0,
      };
      if (f.id) {
        const { error } = await supabase.from('fornecedores').update(payload).eq('id', f.id);
        if (error) throw error;
        return f.id;
      }
      const { data, error } = await supabase.from('fornecedores').insert(payload).select('id').single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fornecedores'] });
      qc.invalidateQueries({ queryKey: ['rastreamento'] });
      qc.invalidateQueries({ queryKey: ['assistencia'] });
    },
  });
}
