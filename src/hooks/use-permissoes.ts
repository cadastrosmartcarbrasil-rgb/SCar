'use client';

// Permissoes por perfil (0110/0111): o admin ajusta a grade modulo x acao em
// Configuracoes -> Usuarios; a tela usa `usePode('modulo.acao')` para nao
// oferecer o que o banco vai recusar (quem decide continua sendo o banco).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { mapaDeConcessoes, type Concessoes } from '@/lib/permissoes';

export function useConcessoesPapeis() {
  const supabase = createClient();
  return useQuery<Concessoes>({
    queryKey: ['permissoes', 'papeis'],
    queryFn: async () => {
      const [celulas, alcadas] = await Promise.all([
        supabase.from('perfil_permissoes').select('papel, modulo, acao, concedida'),
        supabase.from('papel_permissoes').select('papel, permissao, concedida'),
      ]);
      if (celulas.error) throw celulas.error;
      if (alcadas.error) throw alcadas.error;
      return mapaDeConcessoes(celulas.data, alcadas.data);
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

/** O usuario logado tem a permissao ('modulo.acao' ou alcada)? false enquanto carrega. */
export function usePode(chave: string): boolean {
  const { data } = useMinhasPermissoes();
  return (data ?? []).includes(chave);
}

export function useSalvarPermissoesPerfil() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { papel: string; celulas: { modulo: string; acao: string; concedida: boolean }[] }) => {
      const { data, error } = await supabase.rpc('salvar_permissoes_perfil', {
        p_papel: v.papel, p_celulas: v.celulas,
      });
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['permissoes'] }),
  });
}
