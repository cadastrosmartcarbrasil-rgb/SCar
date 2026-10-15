'use client';

import { lerTodas } from '@/lib/paginacao';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { soDigitos } from '@/lib/documento';
import type { ClientesRow } from '@/lib/database.types';
import { TAMANHO_PAGINA_CADASTRO, filtroBuscaAssociados } from '@/lib/busca-cadastro';

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
      // Paginado: o PostgREST corta em 1.000 linhas (ver src/lib/paginacao.ts).
      return lerTodas((de, ate) => {
        let q = supabase.from('clientes').select('*').order('nome_razao_social').order('id');
        if (!incluirExcluidos) q = q.neq('status', 'excluido');
        return q.range(de, ate);
      });
    },
  });
}

/** A lista de /associados, UMA pagina por vez, com a busca no banco. */
export function useAssociadosPagina(busca: string, pagina: number) {
  const supabase = createClient();
  const termo = busca.trim();
  return useQuery<{ linhas: ClientesRow[]; total: number }>({
    queryKey: ['associados', 'pagina', termo, pagina],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const filtro = termo ? filtroBuscaAssociados(termo) : null;
      if (termo && !filtro) return { linhas: [], total: 0 };
      const de = pagina * TAMANHO_PAGINA_CADASTRO;
      let q = supabase.from('clientes').select('*', { count: 'exact' }).neq('status', 'excluido');
      if (filtro) q = q.or(filtro);
      const { data, error, count } = await q
        .order('nome_razao_social').order('id')
        .range(de, de + TAMANHO_PAGINA_CADASTRO - 1);
      if (error) throw error;
      return { linhas: data ?? [], total: count ?? 0 };
    },
  });
}

export type AssociadoResumo = Pick<ClientesRow, 'id' | 'nome_razao_social' | 'cpf_cnpj' | 'matricula' | 'tipo_pessoa'>;
const COLUNAS_RESUMO = 'id, nome_razao_social, cpf_cnpj, matricula, tipo_pessoa';

/** Seletor de associado: ate 20 resultados para o que foi digitado. */
export function useBuscaAssociados(termo: string) {
  const supabase = createClient();
  const t = termo.trim();
  return useQuery<AssociadoResumo[]>({
    queryKey: ['associados', 'busca', t],
    enabled: t.length >= 2,
    queryFn: async () => {
      const filtro = filtroBuscaAssociados(t);
      if (!filtro) return [];
      const { data, error } = await supabase.from('clientes').select(COLUNAS_RESUMO)
        .neq('status', 'excluido').or(filtro).order('nome_razao_social').limit(20);
      if (error) throw error;
      return (data ?? []) as AssociadoResumo[];
    },
  });
}

/** O associado ja escolhido, para o seletor mostrar o nome. */
export function useAssociadoResumo(id: string | null | undefined) {
  const supabase = createClient();
  return useQuery<AssociadoResumo | null>({
    queryKey: ['associados', 'resumo', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select(COLUNAS_RESUMO).eq('id', id!).maybeSingle();
      if (error) throw error;
      return (data as AssociadoResumo) ?? null;
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
