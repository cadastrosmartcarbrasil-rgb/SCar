'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { soDigitos } from '@/lib/documento';
import type {
  EmpresaRow,
  MandatosRow,
  DiretoriaRow,
  EmpresaDocumentosRow,
} from '@/lib/database.types';

export function useEmpresa() {
  const supabase = createClient();
  return useQuery<EmpresaRow | null>({
    queryKey: ['empresa'],
    queryFn: async () => {
      const { data, error } = await supabase.from('empresa').select('*').limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveEmpresa() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<EmpresaRow, Error, Partial<EmpresaRow>>({
    mutationFn: async (e) => {
      const payload = {
        razao_social: e.razao_social,
        nome_fantasia: e.nome_fantasia || null,
        cnpj: e.cnpj ? soDigitos(e.cnpj) : null,
        inscricao_estadual: e.ie_isento ? null : e.inscricao_estadual || null,
        ie_isento: e.ie_isento ?? false,
        inscricao_municipal: e.im_isento ? null : e.inscricao_municipal || null,
        im_isento: e.im_isento ?? false,
        site: e.site || null,
        email_principal: e.email_principal || null,
        email_financeiro: e.email_financeiro || null,
        email_juridico: e.email_juridico || null,
        telefone_fixo: e.telefone_fixo || null,
        whatsapp_principal: e.whatsapp_principal || null,
        whatsapp_suporte: e.whatsapp_suporte || null,
        endereco: e.endereco ?? {},
        logo_url: e.logo_url ?? null,
      };
      const q = e.id
        ? supabase.from('empresa').update(payload).eq('id', e.id).select('*').single()
        : supabase.from('empresa').insert(payload).select('*').single();
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empresa'] }),
  });
}

export function useUploadLogo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<string, Error, { file: File; empresaId: string }>({
    mutationFn: async ({ file, empresaId }) => {
      if (file.size > 5 * 1024 * 1024) throw new Error('Arquivo maior que 5MB');
      const ext = file.name.split('.').pop();
      const path = `logo-${empresaId}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('empresa')
        .upload(path, file, { upsert: true, cacheControl: '3600' });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('empresa').getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      const { error } = await supabase.from('empresa').update({ logo_url: url }).eq('id', empresaId);
      if (error) throw error;
      return url;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empresa'] }),
  });
}

// ---- Mandatos ----
export function useMandatos(empresaId?: string) {
  const supabase = createClient();
  return useQuery<MandatosRow[]>({
    queryKey: ['empresa', 'mandatos', empresaId ?? 'none'],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mandatos')
        .select('*')
        .eq('empresa_id', empresaId!)
        .order('data_inicio', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveMandato() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<MandatosRow, Error, Partial<MandatosRow>>({
    mutationFn: async (m) => {
      const payload = {
        empresa_id: m.empresa_id,
        data_inicio: m.data_inicio,
        data_fim: m.data_fim,
        status: m.status ?? 'VIGENTE',
        observacoes: m.observacoes || null,
      };
      const q = m.id
        ? supabase.from('mandatos').update(payload).eq('id', m.id).select('*').single()
        : supabase.from('mandatos').insert(payload).select('*').single();
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empresa', 'mandatos'] }),
  });
}

// ---- Diretoria ----
export function useDiretoria(mandatoId?: string) {
  const supabase = createClient();
  return useQuery<DiretoriaRow[]>({
    queryKey: ['empresa', 'diretoria', mandatoId ?? 'none'],
    enabled: !!mandatoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('diretoria')
        .select('*')
        .eq('mandato_id', mandatoId!)
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveDiretor() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, Partial<DiretoriaRow>>({
    mutationFn: async (d) => {
      const payload = {
        mandato_id: d.mandato_id,
        cargo: d.cargo,
        nome_completo: d.nome_completo,
        cpf: d.cpf ? soDigitos(d.cpf) : null,
        telefone: d.telefone || null,
        whatsapp: d.whatsapp || null,
        email: d.email || null,
      };
      if (d.id) {
        const { error } = await supabase.from('diretoria').update(payload).eq('id', d.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('diretoria').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empresa', 'diretoria'] }),
  });
}

export function useDeleteDiretor() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from('diretoria').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empresa', 'diretoria'] }),
  });
}

// ---- Documentos ----
export function useEmpresaDocumentos(empresaId?: string) {
  const supabase = createClient();
  return useQuery<EmpresaDocumentosRow[]>({
    queryKey: ['empresa', 'documentos', empresaId ?? 'none'],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresa_documentos')
        .select('*')
        .eq('empresa_id', empresaId!)
        .order('data_upload', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUploadDocumento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, { file: File; empresaId: string; tipo: string }>({
    mutationFn: async ({ file, empresaId, tipo }) => {
      if (file.size > 10 * 1024 * 1024) throw new Error('Arquivo maior que 10MB');
      const ext = file.name.split('.').pop();
      const path = `${empresaId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('empresa-docs').upload(path, file);
      if (upErr) throw upErr;
      const { error } = await supabase.from('empresa_documentos').insert({
        empresa_id: empresaId,
        nome_arquivo: file.name,
        tipo_documento: tipo,
        url_arquivo: path,
        tamanho_bytes: file.size,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empresa', 'documentos'] }),
  });
}

export function useDeleteDocumento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from('empresa_documentos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empresa', 'documentos'] }),
  });
}

export function useSignedDocUrl() {
  const supabase = createClient();
  return useMutation<string, Error, string>({
    mutationFn: async (path) => {
      const { data, error } = await supabase.storage.from('empresa-docs').createSignedUrl(path, 600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}
