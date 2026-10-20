'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { comprimirImagem, validarArquivo } from '@/lib/imagem';
import type { AnexosEventoRow, EventoComunicacaoRow, EventoDeclaracaoRow, Json, TipoDocumentoAnexo } from '@/lib/database.types';
import type { DadosComunicacao, PoseComunicacao } from '@/lib/comunicacao-evento';

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_SINISTROS ?? 'sinistros-docs';
const chave = (eventoId: string) => ['eventos', eventoId, 'comunicacoes'];

export interface ComunicacaoCompleta extends EventoComunicacaoRow {
  declaracoes: EventoDeclaracaoRow[];
  anexos: AnexosEventoRow[];
}

/** Os convites do evento (0129) com as versoes declaradas e os anexos de cada um. */
export function useComunicacoesEvento(eventoId: string) {
  const supabase = createClient();
  return useQuery<ComunicacaoCompleta[]>({
    queryKey: chave(eventoId),
    enabled: !!eventoId,
    queryFn: async () => {
      const [c, d, a] = await Promise.all([
        supabase.from('evento_comunicacoes').select('*').eq('evento_id', eventoId).order('created_at'),
        supabase.from('evento_declaracoes').select('*').eq('evento_id', eventoId).order('versao'),
        supabase.from('anexos_evento').select('*').eq('evento_id', eventoId).not('comunicacao_id', 'is', null).order('created_at'),
      ]);
      if (c.error) throw c.error;
      if (d.error) throw d.error;
      if (a.error) throw a.error;
      return (c.data ?? []).map((x) => ({
        ...x,
        declaracoes: (d.data ?? []).filter((v) => v.comunicacao_id === x.id),
        anexos: (a.data ?? []).filter((v) => v.comunicacao_id === x.id),
      }));
    },
  });
}

/** Quantos envolvidos ja responderam, por evento (selo do Kanban). */
export function useResumoComunicacoes(eventoIds: string[]) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['eventos', 'comunicacoes-resumo', [...eventoIds].sort().join(',')],
    enabled: eventoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('comunicacoes_resumo_eventos', { p_eventos: eventoIds });
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.evento_id, r]));
    },
  });
}

function useInvalida(eventoId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: chave(eventoId) });
    qc.invalidateQueries({ queryKey: ['eventos', eventoId, 'anexos'] });
    qc.invalidateQueries({ queryKey: ['eventos', 'comunicacoes-resumo'] });
    qc.invalidateQueries({ queryKey: ['eventos', eventoId, 'terceiros'] });
    qc.invalidateQueries({ queryKey: ['eventos', eventoId, 'historico'] });
  };
}

export function useCriarComunicacao(eventoId: string) {
  const supabase = createClient();
  const invalida = useInvalida(eventoId);
  return useMutation({
    mutationFn: async (p: { papel: string; nome?: string; telefone?: string; email?: string; terceiro_id?: string | null }) => {
      const { data, error } = await supabase.rpc('criar_comunicacao_evento', {
        p_evento_id: eventoId, p_papel: p.papel, p_nome: p.nome || null, p_telefone: p.telefone || null,
        p_email: p.email || null, p_terceiro_id: p.terceiro_id || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalida,
  });
}

/** Acoes de um convite: enviar (registro), renovar, revogar, pedir correcao, conferir. */
export function useAcaoComunicacao(eventoId: string) {
  const supabase = createClient();
  const invalida = useInvalida(eventoId);
  return useMutation({
    mutationFn: async (
      a:
        | { tipo: 'envio'; id: string; canal: string }
        | { tipo: 'renovar'; id: string }
        | { tipo: 'revogar'; id: string; motivo?: string }
        | { tipo: 'correcao'; id: string; comentario: string }
        | { tipo: 'conferir'; id: string },
    ) => {
      const r =
        a.tipo === 'envio' ? await supabase.rpc('registrar_envio_comunicacao', { p_id: a.id, p_canal: a.canal })
        : a.tipo === 'renovar' ? await supabase.rpc('renovar_comunicacao_evento', { p_id: a.id })
        : a.tipo === 'revogar' ? await supabase.rpc('revogar_comunicacao_evento', { p_id: a.id, p_motivo: a.motivo ?? null })
        : a.tipo === 'correcao' ? await supabase.rpc('pedir_correcao_comunicacao', { p_id: a.id, p_comentario: a.comentario })
        : await supabase.rpc('conferir_comunicacao', { p_id: a.id });
      if (r.error) throw r.error;
      return r.data;
    },
    onSuccess: invalida,
  });
}

/** A equipe preenche pelo envolvido (contingencia: quem nao consegue usar o link). */
export function useDeclaracaoEquipe(eventoId: string) {
  const supabase = createClient();
  const invalida = useInvalida(eventoId);
  return useMutation({
    mutationFn: async (p: { id: string; dados: DadosComunicacao; enviar: boolean }) => {
      const r = p.enviar
        ? await supabase.rpc('registrar_declaracao_equipe', { p_id: p.id, p_dados: p.dados as Json })
        : await supabase.rpc('salvar_rascunho_comunicacao_equipe', { p_id: p.id, p_dados: p.dados as Json });
      if (r.error) throw r.error;
    },
    onSuccess: (_d, p) => { if (p.enviar) invalida(); },
  });
}

/** Anexo trazido pela equipe (documento entregue no balcao, foto por WhatsApp). */
export function useAnexoComunicacaoEquipe(eventoId: string) {
  const supabase = createClient();
  const invalida = useInvalida(eventoId);
  return useMutation({
    mutationFn: async ({ comunicacaoId, pose, file: bruto }: { comunicacaoId: string; pose: PoseComunicacao; file: File }) => {
      const recusa = validarArquivo(bruto, { aceitaPdf: true });
      if (recusa) throw new Error(recusa);
      const file = await comprimirImagem(bruto);
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${eventoId}/comunicacao/${comunicacaoId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('anexos_evento').insert({
        evento_id: eventoId,
        tipo_documento: pose.tipo as TipoDocumentoAnexo,
        arquivo_url: path,
        nome_original: bruto.name,
        tamanho_bytes: file.size,
        uploaded_by: u.user?.id ?? null,
        comunicacao_id: comunicacaoId,
        pose: pose.codigo,
        enviado_pelo_envolvido: false,
      }).select('id').single();
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
      return data.id as string;
    },
    onSuccess: invalida,
  });
}

export function useRemoverAnexoComunicacao(eventoId: string) {
  const supabase = createClient();
  const invalida = useInvalida(eventoId);
  return useMutation({
    mutationFn: async (anexo: { id: string; arquivo_url: string }) => {
      const { error } = await supabase.from('anexos_evento').delete().eq('id', anexo.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([anexo.arquivo_url]);
    },
    onSuccess: invalida,
  });
}
