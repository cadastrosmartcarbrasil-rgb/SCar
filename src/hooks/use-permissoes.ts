'use client';

// Permissoes por papel (0110): o admin concede/retira na grade de
// Configuracoes -> Usuarios; a tela usa `usePode` para nao oferecer o que o
// banco vai recusar (quem decide continua sendo o banco).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { mapaDeConcessoes, type Concessoes } from '@/lib/permissoes';

export function useConcessoesPapeis() {
  const supabase = createClient();
  return useQuery<Concessoes>({
    queryKey: ['permissoes', 'papeis'],
    queryFn: async () => {
      const { data, error } = await supabase.from('papel_permissoes').select('papel, permissao, concedida');
      if (error) throw error;
      return mapaDeConcessoes(data);
    },
  });
}

export function useMinhasPermissoes() {
  const supabase = createClient();
  return useQuery<string[]>({
    queryKey: ['permissoes', 'minhas'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('minhas_permissoes');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

/** O usuario logado tem a permissao? (false enquanto carrega) */
export function usePode(chave: string): boolean {
  const { data } = useMinhasPermissoes();
  return (data ?? []).includes(chave);
}

export function useSalvarPermissaoPapel() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { papel: string; permissao: string; concedida: boolean }) => {
      const { error } = await supabase.rpc('salvar_permissao_papel', {
        p_papel: v.papel, p_permissao: v.permissao, p_concedida: v.concedida,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['permissoes'] }),
  });
}
