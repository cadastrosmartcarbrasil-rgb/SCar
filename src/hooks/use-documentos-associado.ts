'use client';

/**
 * Documentos pessoais do associado (0177). O arquivo vai para o bucket
 * privado `vendas` (a policy de staff ja existe), caminho
 * `associados/<cliente>/...` ou `associados/lead-<lead>/...`. A imagem e
 * reduzida no navegador e o teto de 10 MB e do banco.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { comprimirImagem, validarArquivo } from '@/lib/imagem';
import { validarEnvioDocumento } from '@/lib/documentos-associado';
import type {
  AssociadoDocumentosRow, DocumentacaoCliente, FilaDocumentoAssociado, TipoDocumentoAssociado,
} from '@/lib/database.types';

const BUCKET = 'vendas';

export type DonoDocumentos = { clienteId?: string | null; leadId?: string | null };

function chave(d: DonoDocumentos) {
  return ['documentos-associado', d.clienteId ?? '-', d.leadId ?? '-'];
}

/** Os documentos do associado e/ou do lead (os do lead vem antes da entrada). */
export function useDocumentosAssociado(dono: DonoDocumentos) {
  const supabase = createClient();
  return useQuery<AssociadoDocumentosRow[]>({
    queryKey: chave(dono),
    enabled: !!(dono.clienteId || dono.leadId),
    queryFn: async () => {
      const filtros: string[] = [];
      if (dono.clienteId) filtros.push(`cliente_id.eq.${dono.clienteId}`);
      if (dono.leadId) filtros.push(`lead_id.eq.${dono.leadId}`);
      const { data, error } = await supabase
        .from('associado_documentos')
        .select('*')
        .or(filtros.join(','))
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDocumentacaoCliente(clienteId?: string | null) {
  const supabase = createClient();
  return useQuery<DocumentacaoCliente | null>({
    queryKey: ['documentos-associado', 'resumo', clienteId ?? '-'],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cliente_documentacao', { p_cliente: clienteId as string });
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
  });
}

export type EnvioDocumentoAssociado = {
  file: File;
  tipo: TipoDocumentoAssociado;
  validade?: string | null;
  numero?: string | null;
  descricao?: string | null;
};

export function useEnviarDocumentoAssociado(dono: DonoDocumentos) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, EnvioDocumentoAssociado>({
    mutationFn: async ({ file: bruto, tipo, validade, numero, descricao }) => {
      const regra = validarEnvioDocumento({ tipo, validade, descricao });
      if (regra) throw new Error(regra);
      const recusa = validarArquivo(bruto, { aceitaPdf: true });
      if (recusa) throw new Error(recusa);
      const file = await comprimirImagem(bruto);

      // Na venda (com lead) o documento acompanha o lead; na ficha, o associado.
      const pasta = dono.leadId ? `lead-${dono.leadId}` : dono.clienteId;
      const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}` : '';
      const path = `associados/${pasta}/${tipo.toLowerCase()}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from('associado_documentos').insert({
        cliente_id: dono.leadId ? null : dono.clienteId ?? null,
        lead_id: dono.leadId ?? null,
        tipo,
        validade: tipo === 'CNH' ? validade ?? null : validade || null,
        numero: numero || null,
        descricao: descricao || null,
        url: path,
        nome_arquivo: bruto.name,
        mime: file.type || null,
        tamanho_bytes: file.size,
      });
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw insErr;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documentos-associado'] }).then(() =>
      qc.invalidateQueries({ queryKey: ['vendas', 'checklist'] })),
  });
}

export function useRemoverDocumentoAssociado() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, AssociadoDocumentosRow>({
    mutationFn: async (doc) => {
      const { data, error } = await supabase.from('associado_documentos').delete().eq('id', doc.id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Documento conferido só pode ser removido pela auditoria.');
      await supabase.storage.from(BUCKET).remove([doc.url]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documentos-associado'] });
      qc.invalidateQueries({ queryKey: ['vendas', 'checklist'] });
    },
  });
}

export function useConferirDocumento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; aprovar: boolean; motivo?: string }>({
    mutationFn: async ({ id, aprovar, motivo }) => {
      const { error } = await supabase.rpc('conferir_documento_associado', {
        p_documento: id, p_aprovar: aprovar, p_motivo: motivo ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documentos-associado'] }),
  });
}

export type FiltroAuditoriaDocumentos = 'AGUARDANDO' | 'CNH_VENCIDA' | 'CNH_A_VENCER' | 'RECUSADO';

export function useFilaDocumentos(filtro: FiltroAuditoriaDocumentos, busca: string) {
  const supabase = createClient();
  return useQuery<FilaDocumentoAssociado[]>({
    queryKey: ['documentos-associado', 'fila', filtro, busca],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('auditoria_documentos_associados', {
        p_filtro: filtro, p_busca: busca.trim() || null, p_limite: 300,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useResumoAuditoriaDocumentos() {
  const supabase = createClient();
  return useQuery({
    queryKey: ['documentos-associado', 'resumo-fila'],
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('auditoria_documentos_resumo', {});
      if (error) throw error;
      return (data ?? [])[0] ?? { aguardando: 0, cnh_vencida: 0, cnh_a_vencer: 0, recusados: 0 };
    },
  });
}

/** URLs assinadas (10 min) de varios arquivos de uma vez. */
export function useUrlsDocumentos(paths: (string | null | undefined)[]) {
  const supabase = createClient();
  const lista = Array.from(new Set(paths.filter((p): p is string => !!p))).sort();
  return useQuery<Record<string, string>>({
    queryKey: ['documentos-associado', 'urls', lista.join('|')],
    enabled: lista.length > 0,
    staleTime: 8 * 60_000,
    gcTime: 8 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(lista, 60 * 10);
      if (error) throw error;
      const mapa: Record<string, string> = {};
      (data ?? []).forEach((d) => { if (d.path && d.signedUrl) mapa[d.path] = d.signedUrl; });
      return mapa;
    },
  });
}
