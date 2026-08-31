'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { VendedorLista, VendedoresRow } from '@/lib/database.types';

const CHAVE = ['config', 'vendedores'];

/** Lista da tela: ja traz franquia, teto herdado, portal e comissao pendente. */
export function useVendedoresLista(filtro?: { regionalId?: string | null; busca?: string }) {
  const supabase = createClient();
  return useQuery<VendedorLista[]>({
    queryKey: [...CHAVE, filtro?.regionalId ?? 'todas', filtro?.busca ?? ''],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('listar_vendedores', {
        p_regional_id: filtro?.regionalId ?? null,
        p_busca: filtro?.busca?.trim() || null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSalvarVendedor() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<string, Error, Partial<VendedoresRow>>({
    mutationFn: async (v) => {
      const payload = {
        nome: v.nome?.trim() || null,
        email: v.email?.trim() || null,
        telefone: v.telefone || null,
        documento: v.documento || null,
        codigo: v.codigo?.trim() || null,
        usuario_id: v.usuario_id || null,
        regional_id: v.regional_id || null,
        taxa_comissao_adesao: v.taxa_comissao_adesao ?? 0,
        taxa_comissao_recorrente: v.taxa_comissao_recorrente ?? 0,
        dia_pagto_entrada: v.dia_pagto_entrada ?? null,
        dia_pagto_recorrencia: v.dia_pagto_recorrencia ?? null,
        banco: v.banco || null,
        agencia: v.agencia || null,
        conta: v.conta || null,
        chave_pix: v.chave_pix || null,
        observacoes: v.observacoes || null,
        ativo: v.ativo ?? true,
      };
      if (v.id) {
        const { error } = await supabase.from('vendedores').update(payload).eq('id', v.id);
        if (error) throw error;
        return v.id;
      }
      const { data, error } = await supabase.from('vendedores').insert(payload).select('id').single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useExcluirVendedor() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from('vendedores').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

/** Sugere o codigo do hotlink a partir do nome (o banco garante a unicidade). */
export function useSugerirCodigo() {
  const supabase = createClient();
  return useMutation<string, Error, { nome: string; ignorar?: string | null }>({
    mutationFn: async ({ nome, ignorar }) => {
      const { data, error } = await supabase.rpc('gerar_codigo_vendedor', {
        p_nome: nome, p_ignorar: ignorar ?? null,
      });
      if (error) throw error;
      return data as unknown as string;
    },
  });
}

/** Cria ou redefine o acesso do vendedor ao portal (admin API, no servidor). */
export function useAcessoPortal() {
  const qc = useQueryClient();
  return useMutation<{ usuario_id: string }, Error, { vendedorId: string; email: string; senha: string }>({
    mutationFn: async (body) => {
      const res = await fetch('/api/v1/vendedores/acesso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Falha ao configurar o acesso');
      return json;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

/** Envia as boas-vindas com (opcionalmente) o contrato anexado. */
export function useEnviarBoasVindas() {
  const qc = useQueryClient();
  return useMutation<void, Error, { vendedorId: string; email: string; contrato?: File | null }>({
    mutationFn: async ({ vendedorId, email, contrato }) => {
      const fd = new FormData();
      fd.append('vendedor_id', vendedorId);
      fd.append('email', email);
      if (contrato) fd.append('contrato', contrato);

      const res = await fetch('/api/v1/vendedores/boas-vindas', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Falha ao enviar');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}
