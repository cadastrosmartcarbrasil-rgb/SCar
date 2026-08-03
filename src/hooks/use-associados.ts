'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { soDigitos } from '@/lib/documento';
import type { ClientesRow } from '@/lib/database.types';

export interface EnderecoAssociado {
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  // index signature torna o tipo compativel com Json (coluna endereco)
  [key: string]: string | undefined;
}

export function useAssociados(incluirExcluidos = false) {
  const supabase = createClient();
  return useQuery<ClientesRow[]>({
    queryKey: ['associados', incluirExcluidos],
    queryFn: async () => {
      let q = supabase.from('clientes').select('*').order('nome_razao_social');
      if (!incluirExcluidos) q = q.neq('status', 'excluido');
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveAssociado() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: Partial<ClientesRow>) => {
      const payload = {
        tipo_pessoa: a.tipo_pessoa,
        nome_razao_social: a.nome_razao_social,
        cpf_cnpj: soDigitos(a.cpf_cnpj ?? ''),
        rg_ie: a.rg_ie || null,
        data_nascimento: a.data_nascimento || null,
        sexo: a.sexo || null,
        nome_mae: a.nome_mae || null,
        email: a.email || null,
        email_adicional: a.email_adicional || null,
        telefone: a.telefone || null,
        celular: a.celular || null,
        endereco: a.endereco ?? {},
        status: a.status ?? 'ativo',
        regional_id: a.regional_id || null,
      };
      if (a.id) {
        const { error } = await supabase.from('clientes').update(payload).eq('id', a.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clientes').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['associados'] }),
  });
}

// "Exclusao" e logica (status = excluido), preservando historico/veiculos.
export function useExcluirAssociado() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clientes').update({ status: 'excluido' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['associados'] }),
  });
}
