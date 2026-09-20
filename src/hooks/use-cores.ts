'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { corNormalizada } from '@/lib/cores';
import type {
  CorListada,
  CorNaoReconhecida,
  MutualCorNaoMapeada,
} from '@/lib/database.types';

const CHAVE = ['config', 'cores'] as const;

/** O catalogo para o seletor das fichas e para a tela de Configuracoes. */
export function useCores(incluirInativas = false) {
  const supabase = createClient();
  return useQuery<CorListada[]>({
    queryKey: [...CHAVE, incluirInativas],
    // O catalogo sao 16 linhas que quase nunca mudam: nao vale refazer a cada
    // foco de janela enquanto o atendente preenche a ficha.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cores_listar', {
        p_incluir_inativas: incluirInativas,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** A FILA: o texto de cor que o catalogo nao reconheceu, com o volume. */
export function useCoresNaoReconhecidas() {
  const supabase = createClient();
  return useQuery<CorNaoReconhecida[]>({
    queryKey: [...CHAVE, 'fila'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cores_nao_reconhecidas', {});
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** O vocabulario do Mutual que ainda nao tem par aqui (de-para da Fase 3). */
export function useCoresMutualNaoMapeadas() {
  const supabase = createClient();
  return useQuery<MutualCorNaoMapeada[]>({
    queryKey: [...CHAVE, 'mutual'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_cores_nao_mapeadas', {});
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSalvarCor() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      id?: string;
      nome: string;
      hex?: string | null;
      ordem?: number;
      ativo?: boolean;
    }) => {
      // O nome canonico segue a mesma normalizacao do banco — senao cadastrar
      // "Verde Água" criaria uma cor que `cor_do_texto` nunca casaria consigo.
      const payload = {
        nome: corNormalizada(v.nome) ?? '',
        hex: v.hex?.trim() || null,
        ordem: v.ordem ?? 100,
        ativo: v.ativo ?? true,
      };
      if (!payload.nome) throw new Error('Informe o nome da cor.');
      const q = v.id
        ? supabase.from('cores').update(payload).eq('id', v.id)
        : supabase.from('cores').insert(payload);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useExcluirCor() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cores').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useSalvarApelido() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { cor_id: string; apelido: string }) => {
      const apelido = corNormalizada(v.apelido);
      if (!apelido) throw new Error('Informe o apelido.');
      const { error } = await supabase
        .from('cor_apelidos')
        .insert({ cor_id: v.cor_id, apelido });
      // O unique e no APELIDO: ele ja pertence a outra cor.
      if (error?.code === '23505') {
        throw new Error(`"${apelido}" ja esta apontando para outra cor.`);
      }
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useExcluirApelido() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (apelido: string) => {
      const { error } = await supabase.from('cor_apelidos').delete().eq('apelido', apelido);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}
