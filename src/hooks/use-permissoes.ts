'use client';

// Permissoes por perfil (0110/0111): o admin ajusta a grade modulo x acao em
// Configuracoes -> Usuarios; a tela usa `usePode('modulo.acao')` para nao
// oferecer o que o banco vai recusar (quem decide continua sendo o banco).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import {
  mapaDeConcessoes, chaveDoExtra, extraParaBanco, type Concessoes, type ExtraUsuario, type PerfilAcesso,
} from '@/lib/permissoes';

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

// ---- 0116: permissao extra por usuario e copia de perfil ----

/** Extras de todos os usuarios (o admin le todos; os demais, os proprios). */
export function useExtrasUsuarios() {
  const supabase = createClient();
  return useQuery<Record<string, ExtraUsuario[]>>({
    queryKey: ['permissoes', 'extras'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuario_permissoes').select('usuario_id, modulo, acao, motivo, expira_em');
      if (error) throw error;
      const m: Record<string, ExtraUsuario[]> = {};
      for (const l of data ?? []) {
        (m[l.usuario_id] ??= []).push({ chave: chaveDoExtra(l.modulo, l.acao), expira_em: l.expira_em, motivo: l.motivo });
      }
      return m;
    },
  });
}

export function useSalvarPermissoesUsuario() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { usuarioId: string; extras: { chave: string; expira_em: string | null }[]; motivo: string }) => {
      const { data, error } = await supabase.rpc('salvar_permissoes_usuario', {
        p_usuario: v.usuarioId,
        p_extras: v.extras.map((e) => ({ ...extraParaBanco(e.chave), expira_em: e.expira_em })),
        p_motivo: v.motivo.trim() || null,
      });
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['permissoes'] }),
  });
}

export function useCopiarPerfilUsuario() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { origemId: string; destinoId: string; copiarUnidade: boolean; motivo: string }) => {
      const { data, error } = await supabase.rpc('copiar_perfil_usuario', {
        p_origem: v.origemId, p_destino: v.destinoId,
        p_copiar_unidade: v.copiarUnidade, p_motivo: v.motivo.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permissoes'] });
      qc.invalidateQueries({ queryKey: ['supervisor'] });
      qc.invalidateQueries({ queryKey: ['config', 'usuarios'] });
    },
  });
}

// ---- 0130: perfis personalizados (nome + papel de base + grade propria) ----

export function usePerfisAcesso() {
  const supabase = createClient();
  return useQuery<PerfilAcesso[]>({
    queryKey: ['permissoes', 'perfis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('perfis_acesso').select('id, nome, descricao, papel_base').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSalvarPerfilAcesso() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string | null; nome: string; descricao: string; papelBase: string | null; copiarDe?: string | null }) => {
      const { data, error } = await supabase.rpc('salvar_perfil_acesso', {
        p_id: v.id, p_nome: v.nome, p_descricao: v.descricao || null,
        p_papel_base: v.papelBase, p_copiar_de: v.copiarDe ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['permissoes'] }),
  });
}

export function useExcluirPerfilAcesso() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('excluir_perfil_acesso', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['permissoes'] }),
  });
}
