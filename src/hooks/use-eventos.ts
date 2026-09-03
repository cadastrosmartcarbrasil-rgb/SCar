'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { comprimirImagem, validarArquivo } from '@/lib/imagem';
import type {
  EventosSinistroRow,
  StatusEvento,
  TipoDocumentoAnexo,
  AnexosEventoRow,
  HistoricoProtocoloRow,
} from '@/lib/database.types';

export interface EventoComRelacionamentos extends EventosSinistroRow {
  veiculos?: { placa: string; marca: string | null; modelo: string | null } | null;
  clientes?: { nome_razao_social: string } | null;
  tipos_evento?: { nome: string } | null;
}

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_SINISTROS ?? 'sinistros-docs';

// Lista de eventos com dados do veiculo/cliente para o Kanban e a tabela.
export function useEventos() {
  const supabase = createClient();
  return useQuery<EventoComRelacionamentos[]>({
    queryKey: ['eventos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eventos_sinistro')
        .select(
          'id, numero_protocolo, veiculo_id, cliente_id, data_ocorrencia, tipo_evento, tipo_evento_id, descricao, status, operador_atual_id, regional_id, created_at, updated_at, veiculos(placa, marca, modelo), clientes(nome_razao_social), tipos_evento(nome)',
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EventoComRelacionamentos[];
    },
  });
}

export function useEvento(eventoId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['eventos', eventoId],
    enabled: !!eventoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eventos_sinistro')
        .select('*, veiculos(placa, marca, modelo, chassi, renavam), clientes(nome_razao_social, cpf_cnpj, matricula, telefone, celular), tipos_evento(nome)')
        .eq('id', eventoId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

// Historico de tramitacoes do protocolo (ordem cronologica reversa).
export function useHistoricoProtocolo(eventoId: string) {
  const supabase = createClient();
  return useQuery<HistoricoProtocoloRow[]>({
    queryKey: ['eventos', eventoId, 'historico'],
    enabled: !!eventoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('historico_protocolo')
        .select('*')
        .eq('evento_id', eventoId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Tramitacao via RPC transaccional (atualiza operador + grava historico).
export function useTransferirProtocolo(eventoId: string) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { destino: string; parecer?: string; novoStatus?: StatusEvento }) => {
      const { data, error } = await supabase.rpc('transferir_protocolo', {
        p_evento_id: eventoId,
        p_usuario_destino_id: args.destino,
        p_parecer: args.parecer ?? null,
        p_novo_status: args.novoStatus ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['eventos'] });
    },
  });
}

// Move o card no Kanban -> atualiza apenas o status.
export function useAtualizarStatusEvento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: StatusEvento }) => {
      const { error } = await supabase.from('eventos_sinistro').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['eventos'] });
      const prev = qc.getQueryData<EventoComRelacionamentos[]>(['eventos']);
      qc.setQueryData<EventoComRelacionamentos[]>(['eventos'], (old) =>
        (old ?? []).map((e) => (e.id === id ? { ...e, status } : e)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['eventos'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['eventos'] }),
  });
}

// Anexos do evento
export function useAnexos(eventoId: string) {
  const supabase = createClient();
  return useQuery<AnexosEventoRow[]>({
    queryKey: ['eventos', eventoId, 'anexos'],
    enabled: !!eventoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('anexos_evento')
        .select('*')
        .eq('evento_id', eventoId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Upload para o bucket privado + registro em anexos_evento.
export function useUploadAnexo(eventoId: string) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file: bruto, tipo }: { file: File; tipo: TipoDocumentoAnexo }) => {
      // Foto de avaria sai do celular com 8-12 MB. Reduz aqui, no navegador
      // (1600px, JPEG), como na vistoria de vendas: o perito ve o mesmo detalhe
      // e o upload nao morre no 4G do patio. PDF e XML sobem como vieram.
      const recusa = validarArquivo(bruto, { aceitaPdf: true, aceitaOutros: /\.xml$/i });
      if (recusa) throw new Error(recusa);
      const file = await comprimirImagem(bruto);

      const ext = file.name.split('.').pop();
      // path = {evento_id}/{timestamp}-{rand}.{ext}  (RLS valida o prefixo evento_id)
      const path = `${eventoId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;

      const { data: userData } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from('anexos_evento').insert({
        evento_id: eventoId,
        tipo_documento: tipo,
        arquivo_url: path,
        nome_original: file.name,
        tamanho_bytes: file.size,
        uploaded_by: userData.user?.id ?? null,
      });
      if (insErr) throw insErr;
      return path;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eventos', eventoId, 'anexos'] }),
  });
}

// Gera URL assinada temporaria para visualizar/baixar um anexo do bucket privado.
export function useSignedUrl() {
  const supabase = createClient();
  return useMutation({
    mutationFn: async (path: string) => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}
