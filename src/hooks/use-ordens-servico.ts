'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { OrdemServicoItemRow, OrdemServicoRow, OrdemServicoEnvioRow } from '@/lib/database.types';
import type { ItemOS, StatusOS, TotaisOS } from '@/lib/ordem-servico';

// ORDEM DE SERVICO do evento (0181). Leitura pela RLS (quem ve o evento da
// unidade); escrita pelas RPCs e pela rota /api/v1/eventos/os.

export type OrdemServicoLista = OrdemServicoRow & {
  fornecedores: { razao_social: string; nome_fantasia: string | null; email: string | null; whatsapp: string | null; telefone: string | null } | null;
  ordens_servico_itens?: OrdemServicoItemRow[];
  ordens_servico_envios?: OrdemServicoEnvioRow[];
  eventos_sinistro?: { numero_protocolo: string | null } | null;
  clientes?: { nome_razao_social: string } | null;
  veiculos?: { placa: string | null } | null;
  regionais?: { nome: string } | null;
  termos_emitidos?: { pdf_path: string | null; protocolo: string | null } | null;
};

export type DadosEmissaoOS = {
  evento_id: string;
  cotacao_id?: string | null;
  evento_terceiro_id?: string | null;
  fornecedor_id: string;
  documento: 'AUTORIZACAO' | 'RETIFICACAO';
  os_anterior_id?: string | null;
  itens: ItemOS[];
  participacao_associado?: number | null;
  pecas_smartcar?: number | null;
  data_inicio_prevista?: string | null;
  prazo_dias_uteis?: number | null;
  data_limite_entrega?: string | null;
  local_entrega?: string | null;
  garantia_dias?: number | null;
  pagamento_previsto?: string | null;
  observacoes?: string | null;
};

const SELECT_OS = '*, fornecedores(razao_social, nome_fantasia, email, whatsapp, telefone), '
  + 'ordens_servico_itens(*), ordens_servico_envios(*), termos_emitidos(pdf_path, protocolo)';

export function useOrdensServicoEvento(eventoId: string | null | undefined) {
  const supabase = createClient();
  return useQuery<OrdemServicoLista[]>({
    queryKey: ['ordens-servico', 'evento', eventoId],
    enabled: !!eventoId,
    queryFn: async () => {
      const { data, error } = await supabase.from('ordens_servico').select(SELECT_OS)
        .eq('evento_id', eventoId!).order('emitida_em', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OrdemServicoLista[];
    },
  });
}

export type FiltrosOS = {
  status?: StatusOS | 'ABERTAS' | '';
  fornecedorId?: string | null;
  de?: string | null;
  ate?: string | null;
  atrasadas?: boolean;
  hoje: string;
};

export function useOrdensServico(f: FiltrosOS) {
  const supabase = createClient();
  return useQuery<OrdemServicoLista[]>({
    queryKey: ['ordens-servico', 'lista', f],
    queryFn: async () => {
      let q = supabase.from('ordens_servico')
        .select('*, fornecedores(razao_social, nome_fantasia, email, whatsapp, telefone), eventos_sinistro(numero_protocolo), '
          + 'clientes(nome_razao_social), veiculos(placa), regionais(nome)')
        .order('data_limite_entrega', { ascending: true }).limit(500);
      if (f.status === 'ABERTAS' || f.atrasadas) q = q.in('status', ['EMITIDA', 'ENVIADA', 'EM_EXECUCAO']);
      else if (f.status) q = q.eq('status', f.status);
      if (f.atrasadas) q = q.lt('data_limite_entrega', f.hoje);
      if (f.fornecedorId) q = q.eq('fornecedor_id', f.fornecedorId);
      if (f.de) q = q.gte('emitida_em', `${f.de}T00:00:00-03:00`);
      if (f.ate) q = q.lte('emitida_em', `${f.ate}T23:59:59-03:00`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as OrdemServicoLista[];
    },
  });
}

/** Data limite sugerida = inicio + dias uteis (fim de semana e feriados de cobranca_feriados, no banco). */
export function useDataLimiteSugerida(inicio: string | null | undefined, dias: number | null | undefined) {
  const supabase = createClient();
  return useQuery<string | null>({
    queryKey: ['os-dias-uteis', inicio, dias],
    enabled: !!inicio && dias != null && dias >= 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('somar_dias_uteis', { p_inicio: inicio!, p_dias: dias! });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}

/** Ha modelo de OS publicado? (sem ele nao se emite) */
export function useModeloOS() {
  const supabase = createClient();
  return useQuery<{ id: string; nome: string; publicado: boolean } | null>({
    queryKey: ['termos', 'modelo-os'],
    queryFn: async () => {
      const { data, error } = await supabase.from('termos_modelos')
        .select('id, nome, versao_atual_id').eq('tipo', 'ORDEM_SERVICO').eq('ativo', true)
        .order('updated_at', { ascending: false }).limit(5);
      if (error) throw error;
      const lista = data ?? [];
      const pub = lista.find((m) => m.versao_atual_id) ?? lista[0];
      return pub ? { id: pub.id, nome: pub.nome, publicado: !!pub.versao_atual_id } : null;
    },
  });
}

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch('/api/v1/eventos/os', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? 'Falha na Ordem de Serviço.');
  return j as T;
}

export function usePreviaOS() {
  return useMutation({
    mutationFn: (dados: DadosEmissaoOS) =>
      chamar<{ html: string; vazios: string[]; totais: TotaisOS; modelo: string }>({ acao: 'previa', dados }),
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return (eventoId?: string | null) => {
    qc.invalidateQueries({ queryKey: ['ordens-servico'] });
    if (eventoId) {
      qc.invalidateQueries({ queryKey: ['eventos', eventoId] });
      qc.invalidateQueries({ queryKey: ['anexos', eventoId] });
      qc.invalidateQueries({ queryKey: ['historico', eventoId] });
    }
    qc.invalidateQueries({ queryKey: ['anexos'] });
    qc.invalidateQueries({ queryKey: ['historico'] });
  };
}

export function useEmitirOS() {
  const inv = useInvalidar();
  return useMutation({
    mutationFn: (dados: DadosEmissaoOS) =>
      chamar<{ os: OrdemServicoRow; vazios: string[]; aviso: string | null }>({ acao: 'emitir', dados }),
    onSuccess: (r) => inv(r.os.evento_id),
  });
}

export function useAcaoRotaOS() {
  const inv = useInvalidar();
  return useMutation({
    mutationFn: (c: { acao: 'gerar_pdf' | 'link' | 'email'; os_id: string; para?: string; evento_id?: string }) =>
      chamar<{ ok?: boolean; link?: string; mensagem?: string; telefone?: string | null; enviado?: boolean }>(c),
    onSuccess: (_r, c) => { if (c.acao !== 'link') inv(c.evento_id); },
  });
}

export function useRegistrarEnvioOS() {
  const supabase = createClient();
  const inv = useInvalidar();
  return useMutation({
    mutationFn: async (v: { os: OrdemServicoRow; canal: 'WHATSAPP' | 'MANUAL' | 'DOWNLOAD'; destino?: string | null; observacao?: string | null }) => {
      const { error } = await supabase.rpc('registrar_envio_ordem_servico', {
        p_os_id: v.os.id, p_canal: v.canal, p_destino: v.destino ?? null, p_observacao: v.observacao ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_r, v) => inv(v.os.evento_id),
  });
}

export function useStatusOS() {
  const supabase = createClient();
  const inv = useInvalidar();
  return useMutation({
    mutationFn: async (v: { os: OrdemServicoRow; status: 'EM_EXECUCAO' | 'ENTREGUE'; data?: string | null }) => {
      const { error } = await supabase.rpc('mudar_status_ordem_servico', {
        p_os_id: v.os.id, p_status: v.status, p_data: v.data ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_r, v) => inv(v.os.evento_id),
  });
}

export function useCancelarOS() {
  const supabase = createClient();
  const inv = useInvalidar();
  return useMutation({
    mutationFn: async (v: { os: OrdemServicoRow; motivo: string }) => {
      const { error } = await supabase.rpc('cancelar_ordem_servico', { p_os_id: v.os.id, p_motivo: v.motivo });
      if (error) throw error;
    },
    onSuccess: (_r, v) => inv(v.os.evento_id),
  });
}
