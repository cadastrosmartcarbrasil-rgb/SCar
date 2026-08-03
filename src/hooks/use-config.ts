'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  RegionaisRow,
  CategoriasDreRow,
  IntegracoesBancariasRow,
  UsuariosRow,
  MarcasRow,
  ModelosRow,
  VendedoresRow,
} from '@/lib/database.types';

// ---------------------------------------------------------------------------
// Regionais (franquias)
// ---------------------------------------------------------------------------
export function useRegionais() {
  const supabase = createClient();
  return useQuery<RegionaisRow[]>({
    queryKey: ['config', 'regionais'],
    queryFn: async () => {
      const { data, error } = await supabase.from('regionais').select('*').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveRegional() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: Partial<RegionaisRow>) => {
      const payload = {
        nome: r.nome,
        cnpj: r.cnpj || null,
        endereco: r.endereco ?? {},
        responsavel_id: r.responsavel_id || null,
      };
      if (r.id) {
        const { error } = await supabase.from('regionais').update(payload).eq('id', r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('regionais').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'regionais'] }),
  });
}

export function useDeleteRegional() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('regionais').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'regionais'] }),
  });
}

// ---------------------------------------------------------------------------
// Plano de Contas (categorias DRE)
// ---------------------------------------------------------------------------
export function usePlanoContas() {
  const supabase = createClient();
  return useQuery<CategoriasDreRow[]>({
    queryKey: ['config', 'plano-contas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categorias_dre')
        .select('*')
        .order('codigo_estruturado');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveCategoria() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Partial<CategoriasDreRow>) => {
      const payload = {
        codigo_estruturado: c.codigo_estruturado,
        nome: c.nome,
        tipo: c.tipo,
        ativo: c.ativo ?? true,
      };
      if (c.id) {
        const { error } = await supabase.from('categorias_dre').update(payload).eq('id', c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('categorias_dre').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'plano-contas'] }),
  });
}

export function useDeleteCategoria() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categorias_dre').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'plano-contas'] }),
  });
}

// ---------------------------------------------------------------------------
// Integracoes bancarias
// ---------------------------------------------------------------------------
export function useIntegracoes() {
  const supabase = createClient();
  return useQuery<(IntegracoesBancariasRow & { regionais?: { nome: string } | null })[]>({
    queryKey: ['config', 'integracoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integracoes_bancarias')
        .select('*, regionais(nome)')
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as never;
    },
  });
}

export function useSaveIntegracao() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: Partial<IntegracoesBancariasRow>) => {
      const payload = {
        nome: i.nome,
        provedor: i.provedor,
        ambiente: i.ambiente,
        api_url: i.api_url || null,
        api_key: i.api_key || null,
        api_token_extra: i.api_token_extra || null,
        webhook_secret: i.webhook_secret || null,
        regional_id: i.regional_id || null,
        is_padrao: i.is_padrao ?? false,
        ativo: i.ativo ?? true,
      };
      if (i.id) {
        const { error } = await supabase.from('integracoes_bancarias').update(payload).eq('id', i.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('integracoes_bancarias').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'integracoes'] }),
  });
}

export function useDeleteIntegracao() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('integracoes_bancarias').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'integracoes'] }),
  });
}

// ---------------------------------------------------------------------------
// Usuarios & perfis
// ---------------------------------------------------------------------------
export function useUsuarios() {
  const supabase = createClient();
  return useQuery<UsuariosRow[]>({
    queryKey: ['config', 'usuarios'],
    queryFn: async () => {
      const { data, error } = await supabase.from('usuarios').select('*').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface NovoUsuario {
  nome: string;
  email: string;
  senha: string;
  papel: UsuariosRow['papel'];
  regional_id?: string | null;
}

// Criacao de usuario passa por Route Handler (usa a service_role no servidor).
export function useCreateUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (u: NovoUsuario) => {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(u),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Falha ao criar usuario');
      return json;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'usuarios'] }),
  });
}

export function useUpdateUsuario() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<UsuariosRow> & { id: string }) => {
      const { error } = await supabase.from('usuarios').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'usuarios'] }),
  });
}

// ---------------------------------------------------------------------------
// Vendedores (consultores)
// ---------------------------------------------------------------------------
export function useVendedores() {
  const supabase = createClient();
  return useQuery<VendedoresRow[]>({
    queryKey: ['config', 'vendedores'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendedores').select('*');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveVendedor() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<VendedoresRow>) => {
      const payload = {
        usuario_id: v.usuario_id,
        regional_id: v.regional_id || null,
        taxa_comissao_adesao: v.taxa_comissao_adesao ?? 0,
        taxa_comissao_recorrente: v.taxa_comissao_recorrente ?? 0,
        ativo: v.ativo ?? true,
      };
      if (v.id) {
        const { error } = await supabase.from('vendedores').update(payload).eq('id', v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('vendedores').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'vendedores'] }),
  });
}

export function useDeleteVendedor() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vendedores').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'vendedores'] }),
  });
}

// ---------------------------------------------------------------------------
// Marcas e Modelos de veiculos
// ---------------------------------------------------------------------------
export function useMarcas() {
  const supabase = createClient();
  return useQuery<MarcasRow[]>({
    queryKey: ['config', 'marcas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('marcas').select('*').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useModelos(marcaId?: string) {
  const supabase = createClient();
  return useQuery<ModelosRow[]>({
    queryKey: ['config', 'modelos', marcaId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('modelos').select('*').order('nome');
      if (marcaId) q = q.eq('marca_id', marcaId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveMarca() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await supabase.from('marcas').insert({ nome });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'marcas'] }),
  });
}

export function useDeleteMarca() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('marcas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config', 'marcas'] });
      qc.invalidateQueries({ queryKey: ['config', 'modelos'] });
    },
  });
}

export function useSaveModelo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { marca_id: string; nome: string }) => {
      const { error } = await supabase.from('modelos').insert(v);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'modelos'] }),
  });
}

export function useDeleteModelo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('modelos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'modelos'] }),
  });
}
