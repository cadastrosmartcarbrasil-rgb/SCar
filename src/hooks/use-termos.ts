'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { TermoEmitidoRow, TermoModeloRow, TermoVersaoRow } from '@/lib/database.types';

// TERMOS (0123): modelos (Configuracoes -> Termos), versoes e termos emitidos.

export function useTermosModelos() {
  const supabase = createClient();
  return useQuery({
    queryKey: ['termos', 'modelos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('termos_modelos').select('*').order('nome');
      if (error) throw error;
      return (data ?? []) as TermoModeloRow[];
    },
  });
}

export function useTermoModelo(id: string | null | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['termos', 'modelo', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('termos_modelos').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as TermoModeloRow | null;
    },
  });
}

export function useVersoesTermo(modeloId: string | null | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['termos', 'versoes', modeloId],
    enabled: !!modeloId,
    queryFn: async () => {
      const { data, error } = await supabase.from('termos_versoes')
        .select('id, modelo_id, numero, nome, sha256, observacao, pdf_path, publicada_em, publicada_por')
        .eq('modelo_id', modeloId!).order('numero', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Omit<TermoVersaoRow, 'conteudo_html' | 'declaracoes' | 'pdf_sha256'>[];
    },
  });
}

export type ModeloEditavel = Partial<Omit<TermoModeloRow, 'id' | 'created_at' | 'updated_at'>> & { id?: string };

export function useSalvarTermoModelo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: ModeloEditavel) => {
      const { id, ...campos } = m;
      if (id) {
        const { data, error } = await supabase.from('termos_modelos').update(campos).eq('id', id).select('*').single();
        if (error) throw error;
        return data as TermoModeloRow;
      }
      const { data, error } = await supabase.from('termos_modelos')
        .insert({ nome: campos.nome ?? 'NOVO TERMO', ...campos }).select('*').single();
      if (error) throw error;
      return data as TermoModeloRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['termos'] }),
  });
}

export function useExcluirTermoModelo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('termos_modelos').delete().eq('id', id);
      if (error) {
        if (error.code === '23503') throw new Error('Este termo já foi emitido e não pode ser excluído. Desative-o.');
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['termos'] }),
  });
}

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch('/api/v1/termos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? 'Falha ao processar o termo.');
  return j as T;
}

export function usePublicarTermo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { modeloId: string; observacao?: string | null }) =>
      chamar<{ versao: TermoVersaoRow; aviso: string | null }>({
        acao: 'publicar', modelo_id: a.modeloId, observacao: a.observacao ?? null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['termos'] }),
  });
}

export type PreviaTermo = { titulo: string; html: string; vazios: string[]; desconhecidos: string[] };
export type PedidoPrevia = {
  modelo_id?: string; versao_id?: string; rascunho_html?: string;
  cliente_id?: string | null; veiculo_id?: string | null;
};

export function usePreviaTermo() {
  return useMutation({ mutationFn: (p: PedidoPrevia) => chamar<PreviaTermo>({ acao: 'previa', ...p }) });
}

/** PDF de previa (sem gravar) — abre numa aba nova. */
export async function abrirPdfPrevia(p: PedidoPrevia) {
  const r = await fetch('/api/v1/termos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'pdf_previa', ...p }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error ?? 'Falha ao gerar o PDF.');
  }
  const url = URL.createObjectURL(await r.blob());
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export type TermoEmitidoLista = Omit<TermoEmitidoRow, 'conteudo_html'> & {
  veiculos: { placa: string } | null;
  usuarios: { nome: string } | null;
};

export function useTermosEmitidos(f: { clienteId?: string | null; veiculoId?: string | null }) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['termos', 'emitidos', f.clienteId ?? null, f.veiculoId ?? null],
    enabled: !!(f.clienteId || f.veiculoId),
    queryFn: async () => {
      let q = supabase.from('termos_emitidos')
        .select('id, protocolo, modelo_id, versao_id, cliente_id, veiculo_id, regional_id, titulo, html_sha256, campos_vazios, pdf_path, pdf_sha256, pdf_bytes, visivel_portal, situacao, emitido_por, emitido_em, cancelado_por, cancelado_em, cancelamento_motivo, updated_at, veiculos(placa), usuarios!termos_emitidos_emitido_por_fkey(nome)')
        .order('emitido_em', { ascending: false }).limit(200);
      if (f.veiculoId) q = q.eq('veiculo_id', f.veiculoId);
      else if (f.clienteId) q = q.eq('cliente_id', f.clienteId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as TermoEmitidoLista[];
    },
  });
}

export function useEmitirTermo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { versaoId: string; clienteId: string; veiculoId?: string | null; visivelPortal?: boolean | null }) =>
      chamar<{ emitido: TermoEmitidoRow; vazios: string[]; aviso: string | null }>({
        acao: 'emitir', versao_id: a.versaoId, cliente_id: a.clienteId,
        veiculo_id: a.veiculoId ?? null, visivel_portal: a.visivelPortal ?? null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['termos', 'emitidos'] }),
  });
}

export function useGerarPdfTermo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (emitidoId: string) => chamar<{ ok: true }>({ acao: 'gerar_pdf', emitido_id: emitidoId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['termos', 'emitidos'] }),
  });
}

export function useCancelarTermo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; motivo: string }) => {
      const { error } = await supabase.rpc('cancelar_termo_emitido', { p_id: a.id, p_motivo: a.motivo });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['termos', 'emitidos'] }),
  });
}

export function usePortalTermo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; visivel: boolean }) => {
      const { error } = await supabase.rpc('portal_termo_emitido', { p_id: a.id, p_visivel: a.visivel });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['termos', 'emitidos'] }),
  });
}

export const urlPdfTermo = (a: { emitido?: string; versao?: string; baixar?: boolean }) =>
  `/api/v1/termos/pdf?${a.emitido ? `emitido=${a.emitido}` : `versao=${a.versao}`}${a.baixar ? '&baixar=1' : ''}`;

/** Veiculos do associado para escolher no termo (os excluidos ficam de fora). */
export function useVeiculosParaTermo(clienteId: string | null | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['termos', 'veiculos', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase.from('veiculos')
        .select('id, placa, marca, modelo, status, plano_protecao_id, tipo_veiculo_id, uso, regional_id')
        .eq('cliente_id', clienteId!).neq('status', 'excluido').order('placa');
      if (error) throw error;
      return data ?? [];
    },
  });
}
