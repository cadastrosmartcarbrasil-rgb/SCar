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
  ParecerProtocolo,
  ParecerPendente,
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
    mutationFn: async (args: { destino?: string | null; parecer?: string; novoStatus?: StatusEvento }) => {
      const { data, error } = await supabase.rpc('transferir_protocolo', {
        p_evento_id: eventoId,
        // Sem destino a RPC mantem quem ja estava — o que ela NAO faz mais e
        // aceitar string vazia e fingir que transferiu (0059).
        p_usuario_destino_id: args.destino || null,
        p_parecer: args.parecer ?? null,
        p_novo_status: args.novoStatus ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['eventos'] });
      qc.invalidateQueries({ queryKey: ['protocolos'] });
      qc.invalidateQueries({ queryKey: ['pareceres'] });
    },
  });
}

// ---------------------------------------------------------------------------
// O protocolo do evento e os PARECERES (0059)
//
// Sinistro nao anda com uma pessoa so: vai para o juridico, para a vistoria,
// para a diretoria — cada um opina e volta. O mecanismo e o da Central de
// Protocolos, que ja existia; aqui ele finalmente e usado pelo evento.
// ---------------------------------------------------------------------------

/** Id do protocolo do evento (a RPC cria na primeira vez que alguem abre). */
export function useProtocoloDoEvento(eventoId: string | null) {
  const supabase = createClient();
  return useQuery<string | null>({
    queryKey: ['protocolos', 'do-evento', eventoId],
    enabled: !!eventoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('protocolo_do_evento', { p_evento_id: eventoId! });
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function usePareceresProtocolo(atendimentoId: string | null) {
  const supabase = createClient();
  return useQuery<ParecerProtocolo[]>({
    queryKey: ['pareceres', atendimentoId],
    enabled: !!atendimentoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('pareceres_protocolo', {
        p_atendimento_id: atendimentoId!,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** O que esperam de MIM — alimenta a Central do Atendente. */
export function useMeusPareceresPendentes() {
  const supabase = createClient();
  return useQuery<ParecerPendente[]>({
    queryKey: ['pareceres', 'meus-pendentes'],
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('meus_pareceres_pendentes', { p_limite: 20 });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSolicitarParecer() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<number, Error, { atendimentoId: string; usuarios: string[]; pergunta: string }>({
    mutationFn: async ({ atendimentoId, usuarios, pergunta }) => {
      const { data, error } = await supabase.rpc('solicitar_parecer', {
        p_atendimento_id: atendimentoId,
        p_usuarios: usuarios,
        p_pergunta: pergunta,
      });
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pareceres'] });
      qc.invalidateQueries({ queryKey: ['protocolos'] });
    },
  });
}

export function useResponderParecer() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<unknown, Error, { pedidoId: string; mensagem: string }>({
    mutationFn: async ({ pedidoId, mensagem }) => {
      const { data, error } = await supabase.rpc('responder_parecer', {
        p_pedido_id: pedidoId,
        p_mensagem: mensagem,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pareceres'] });
      qc.invalidateQueries({ queryKey: ['protocolos'] });
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
