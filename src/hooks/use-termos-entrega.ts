'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { comprimirImagem, validarArquivo } from '@/lib/imagem';
import type { TermoEntregaRow } from '@/lib/database.types';
type Row = TermoEntregaRow;
import type { DadosEntrega } from '@/lib/termo-entrega';

// TERMO DE ENTREGA DE VEICULO (0182). Leitura pela RLS; escrita pelas RPCs e
// pela rota /api/v1/eventos/termos.

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_SINISTROS ?? 'sinistros-docs';

export type TermoEntregaLista = Row & {
  termos_emitidos: { protocolo: string | null; pdf_path: string | null } | null;
  evento_terceiros: { nome: string; veiculo_placa: string | null } | null;
  ordens_servico: { numero: string } | null;
  fornecedores: { razao_social: string; nome_fantasia: string | null } | null;
  anexos_evento: { arquivo_url: string; nome_original: string | null } | null;
};

export function useTermosEntregaEvento(eventoId: string | null | undefined) {
  const supabase = createClient();
  return useQuery<TermoEntregaLista[]>({
    queryKey: ['termos-entrega', eventoId],
    enabled: !!eventoId,
    queryFn: async () => {
      const { data, error } = await supabase.from('termos_entrega')
        .select('*, termos_emitidos(protocolo, pdf_path), evento_terceiros(nome, veiculo_placa), '
          + 'ordens_servico(numero), fornecedores(razao_social, nome_fantasia), '
          + 'anexos_evento!termos_entrega_assinado_anexo_id_fkey(arquivo_url, nome_original)')
        .eq('evento_id', eventoId!).order('emitido_em', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TermoEntregaLista[];
    },
  });
}

/** Ha modelo de termo de entrega publicado? (sem ele nao se emite) */
export function useModeloEntrega() {
  const supabase = createClient();
  return useQuery<{ id: string; nome: string; publicado: boolean } | null>({
    queryKey: ['termos', 'modelo-entrega'],
    queryFn: async () => {
      const { data, error } = await supabase.from('termos_modelos')
        .select('id, nome, versao_atual_id').eq('tipo', 'ENTREGA_VEICULO').eq('ativo', true)
        .order('updated_at', { ascending: false }).limit(5);
      if (error) throw error;
      const lista = data ?? [];
      const pub = lista.find((m) => m.versao_atual_id) ?? lista[0];
      return pub ? { id: pub.id, nome: pub.nome, publicado: !!pub.versao_atual_id } : null;
    },
  });
}

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch('/api/v1/eventos/termos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? 'Falha no termo de entrega.');
  return j as T;
}

function useInvalidar() {
  const qc = useQueryClient();
  return (eventoId: string) => {
    qc.invalidateQueries({ queryKey: ['termos-entrega', eventoId] });
    qc.invalidateQueries({ queryKey: ['eventos', eventoId] });
    qc.invalidateQueries({ queryKey: ['historico'] });
    qc.invalidateQueries({ queryKey: ['anexos'] });
  };
}

export function usePreviaEntrega() {
  return useMutation({
    mutationFn: (dados: DadosEntrega) =>
      chamar<{ html: string; vazios: string[]; modelo: string }>({ acao: 'previa', dados }),
  });
}

export function useEmitirEntrega() {
  const inv = useInvalidar();
  return useMutation({
    mutationFn: (dados: DadosEntrega) =>
      chamar<{ termo: TermoEntregaRow; vazios: string[]; aviso: string | null }>({ acao: 'emitir', dados }),
    onSuccess: (r) => inv(r.termo.evento_id),
  });
}

export function useGerarPdfEntrega() {
  const inv = useInvalidar();
  return useMutation({
    mutationFn: (t: TermoEntregaRow) => chamar<{ ok: boolean }>({ acao: 'gerar_pdf', termo_id: t.id }),
    onSuccess: (_r, t) => inv(t.evento_id),
  });
}

/** A via assinada: foto ou PDF devolvido pela oficina. Sobe ao bucket do evento e vira anexo do termo. */
export function useAnexarAssinado() {
  const supabase = createClient();
  const inv = useInvalidar();
  return useMutation({
    mutationFn: async ({ termo, arquivo }: { termo: TermoEntregaRow; arquivo: File }) => {
      const recusa = validarArquivo(arquivo, { aceitaPdf: true });
      if (recusa) throw new Error(recusa);
      const file = await comprimirImagem(arquivo);
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${termo.evento_id}/termo-entrega-${termo.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data, error } = await supabase.rpc('registrar_termo_entrega_assinado', {
        p_id: termo.id, p_path: path, p_nome: file.name, p_bytes: file.size,
      });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
      return data!;
    },
    onSuccess: (t) => inv(t.evento_id),
  });
}

export function useCancelarEntrega() {
  const supabase = createClient();
  const inv = useInvalidar();
  return useMutation({
    mutationFn: async ({ termo, motivo }: { termo: TermoEntregaRow; motivo: string }) => {
      const { data, error } = await supabase.rpc('cancelar_termo_entrega', { p_id: termo.id, p_motivo: motivo });
      if (error) throw error;
      return data!;
    },
    onSuccess: (t) => inv(t.evento_id),
  });
}

/** URL assinada (10 min) da via assinada no bucket do evento. */
export async function urlDaViaAssinada(path: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}
