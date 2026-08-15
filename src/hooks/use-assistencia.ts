'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  ServicosAssistenciaRow,
  AcionamentosAssistenciaRow,
  AcionamentoCotacoesRow,
  AcionamentoHistoricoRow,
  ElegibilidadeAssistencia,
  SituacaoAssistencia,
  PrestadorDoServico,
  HistoricoAssistencia,
  FornecedoresRow,
  StatusAcionamento,
  Json,
} from '@/lib/database.types';

// ---------------------------------------------------------------------------
// Catalogo de servicos 24h (parametrizacao)
// ---------------------------------------------------------------------------
export function useServicosAssistencia(apenasAtivos = false) {
  const supabase = createClient();
  return useQuery<ServicosAssistenciaRow[]>({
    queryKey: ['assistencia', 'servicos', apenasAtivos],
    queryFn: async () => {
      let q = supabase.from('servicos_assistencia').select('*').order('ordem').order('descricao');
      if (apenasAtivos) q = q.eq('ativo', true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveServicoAssistencia() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, Partial<ServicosAssistenciaRow>>({
    mutationFn: async (s) => {
      const payload = {
        descricao: s.descricao,
        valor_padrao: s.valor_padrao ?? 0,
        categoria_dre_id: s.categoria_dre_id || null,
        cobra_km_excedente: s.cobra_km_excedente ?? false,
        valor_km_excedente: s.valor_km_excedente ?? 0,
        km_franquia: s.km_franquia ?? 0,
        computa_limite: s.computa_limite ?? false,
        limite_quantidade: s.limite_quantidade ?? 1,
        limite_janela_meses: s.limite_janela_meses ?? 12,
        produto_id: s.produto_id || null,
        observacoes: s.observacoes || null,
        ativo: s.ativo ?? true,
        ordem: s.ordem ?? 0,
      };
      if (s.id) {
        const { error } = await supabase.from('servicos_assistencia').update(payload).eq('id', s.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('servicos_assistencia').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assistencia', 'servicos'] }),
  });
}

// ---------------------------------------------------------------------------
// Painel: busca do veiculo, trava e limites em tempo real
// ---------------------------------------------------------------------------
export interface VeiculoAssistencia {
  id: string;
  placa: string;
  marca: string | null;
  modelo: string | null;
  cor: string | null;
  ano_modelo: number | null;
  cliente_id: string;
  associado: string;
  telefone: string | null;
}

export function useBuscaVeiculoAssistencia(termo: string) {
  const supabase = createClient();
  const busca = termo.trim();
  return useQuery<VeiculoAssistencia[]>({
    queryKey: ['assistencia', 'busca', busca],
    enabled: busca.length >= 3,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('veiculos')
        .select('id, placa, marca, modelo, cor, ano_modelo, cliente_id, clientes(nome_razao_social, telefone, celular)')
        .ilike('placa', `%${busca.replace(/[^A-Za-z0-9]/g, '')}%`)
        .neq('status', 'excluido')
        .limit(10);
      if (error) throw error;
      type Linha = Omit<VeiculoAssistencia, 'associado' | 'telefone'> & {
        clientes?: { nome_razao_social: string; telefone: string | null; celular: string | null } | null;
      };
      return ((data ?? []) as unknown as Linha[]).map((v) => ({
        id: v.id, placa: v.placa, marca: v.marca, modelo: v.modelo, cor: v.cor,
        ano_modelo: v.ano_modelo, cliente_id: v.cliente_id,
        associado: v.clientes?.nome_razao_social ?? '',
        telefone: v.clientes?.celular ?? v.clientes?.telefone ?? null,
      }));
    },
  });
}

export function useSituacaoAssistencia(veiculoId: string | null) {
  const supabase = createClient();
  return useQuery<SituacaoAssistencia | null>({
    queryKey: ['assistencia', 'situacao', veiculoId],
    enabled: !!veiculoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('situacao_assistencia_veiculo', {
        p_veiculo_id: veiculoId as string,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function useElegibilidadeAssistencia(veiculoId: string | null) {
  const supabase = createClient();
  return useQuery<ElegibilidadeAssistencia[]>({
    queryKey: ['assistencia', 'elegibilidade', veiculoId],
    enabled: !!veiculoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('elegibilidade_assistencia', {
        p_veiculo_id: veiculoId as string,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useHistoricoAssistenciaVeiculo(veiculoId: string | null) {
  const supabase = createClient();
  return useQuery<HistoricoAssistencia[]>({
    queryKey: ['assistencia', 'historico-veiculo', veiculoId],
    enabled: !!veiculoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('historico_assistencia_veiculo', {
        p_veiculo_id: veiculoId as string,
        p_limite: 50,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Acionamento (abertura com trava/alcada, cotacao, OS, conclusao)
// ---------------------------------------------------------------------------
export interface AbrirAcionamentoInput {
  veiculo_id: string;
  servico_id: string;
  solicitante?: string | null;
  telefone?: string | null;
  origem?: Json;
  destino?: Json;
  km_previsto?: number | null;
  observacoes?: string | null;
  atendimento_id?: string | null;
  // Liberacao de superior (quando ha bloqueio): credenciais do gestor.
  liberacao?: { email: string; senha: string; justificativa: string } | null;
}

export interface AbrirAcionamentoResultado {
  acionamento: AcionamentosAssistenciaRow;
  liberado_por?: string | null;
}

export function useAbrirAcionamento() {
  const qc = useQueryClient();
  return useMutation<AbrirAcionamentoResultado, Error, AbrirAcionamentoInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/v1/assistencia/acionamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Falha ao abrir o acionamento');
      return json as AbrirAcionamentoResultado;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assistencia'] }),
  });
}

export function usePrestadoresDoServico(servicoId: string | null) {
  const supabase = createClient();
  return useQuery<PrestadorDoServico[]>({
    queryKey: ['assistencia', 'prestadores', servicoId],
    enabled: !!servicoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('prestadores_do_servico', {
        p_servico_id: servicoId as string,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCotacoes(acionamentoId: string | null) {
  const supabase = createClient();
  return useQuery<(AcionamentoCotacoesRow & { fornecedores?: { razao_social: string } | null })[]>({
    queryKey: ['assistencia', 'cotacoes', acionamentoId],
    enabled: !!acionamentoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acionamento_cotacoes')
        .select('*, fornecedores(razao_social)')
        .eq('acionamento_id', acionamentoId as string)
        .order('valor');
      if (error) throw error;
      return (data ?? []) as unknown as (AcionamentoCotacoesRow & { fornecedores?: { razao_social: string } | null })[];
    },
  });
}

export function useRegistrarCotacao() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, {
    acionamento_id: string; fornecedor_id: string; valor: number;
    valor_km?: number | null; prazo_min?: number | null; observacao?: string | null;
  }>({
    mutationFn: async (c) => {
      const { error } = await supabase.rpc('registrar_cotacao_assistencia', {
        p_acionamento_id: c.acionamento_id,
        p_fornecedor_id: c.fornecedor_id,
        p_valor: c.valor,
        p_valor_km: c.valor_km ?? null,
        p_prazo_min: c.prazo_min ?? null,
        p_observacao: c.observacao ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assistencia'] }),
  });
}

export function useConfirmarPrestador() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<AcionamentosAssistenciaRow, Error, {
    acionamento_id: string; fornecedor_id: string; valor_servico: number;
    km_excedente?: number; valor_km?: number | null; prazo_min?: number | null;
  }>({
    mutationFn: async (c) => {
      const { data, error } = await supabase.rpc('confirmar_prestador_assistencia', {
        p_acionamento_id: c.acionamento_id,
        p_fornecedor_id: c.fornecedor_id,
        p_valor_servico: c.valor_servico,
        p_km_excedente: c.km_excedente ?? 0,
        p_valor_km: c.valor_km ?? null,
        p_prazo_min: c.prazo_min ?? null,
      });
      if (error) throw error;
      return data as AcionamentosAssistenciaRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assistencia'] }),
  });
}

export function useConcluirAcionamento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, { acionamento_id: string; km_percorrido?: number | null; observacao?: string | null }>({
    mutationFn: async (c) => {
      const { error } = await supabase.rpc('concluir_acionamento', {
        p_acionamento_id: c.acionamento_id,
        p_km_percorrido: c.km_percorrido ?? null,
        p_observacao: c.observacao ?? null,
        p_vencimento: null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assistencia'] }),
  });
}

export function useCancelarAcionamento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, { acionamento_id: string; motivo: string }>({
    mutationFn: async (c) => {
      const { error } = await supabase.rpc('cancelar_acionamento', {
        p_acionamento_id: c.acionamento_id,
        p_motivo: c.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assistencia'] }),
  });
}

export interface VoucherResultado {
  texto: string;
  whatsapp: string | null;
  email_enviado: boolean;
  destinatario: string | null;
}

export function useEnviarVoucher() {
  const qc = useQueryClient();
  return useMutation<VoucherResultado, Error, { acionamento_id: string; enviar_email?: boolean }>({
    mutationFn: async (input) => {
      const res = await fetch('/api/v1/assistencia/voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Falha ao gerar o comunicado');
      return json as VoucherResultado;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assistencia'] }),
  });
}

// ---------------------------------------------------------------------------
// Lista de acionamentos (operacao)
// ---------------------------------------------------------------------------
export interface AcionamentoComRel extends AcionamentosAssistenciaRow {
  servicos_assistencia?: { descricao: string } | null;
  veiculos?: { placa: string; modelo: string | null } | null;
  clientes?: { nome_razao_social: string } | null;
  fornecedores?: { razao_social: string; whatsapp: string | null; email: string | null } | null;
}

export function useAcionamentos(filtro?: { status?: StatusAcionamento | null; busca?: string | null }) {
  const supabase = createClient();
  return useQuery<AcionamentoComRel[]>({
    queryKey: ['assistencia', 'acionamentos', filtro?.status ?? 'all', filtro?.busca ?? ''],
    queryFn: async () => {
      let q = supabase
        .from('acionamentos_assistencia')
        .select('*, servicos_assistencia(descricao), veiculos(placa, modelo), clientes(nome_razao_social), fornecedores(razao_social, whatsapp, email)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (filtro?.status) q = q.eq('status', filtro.status);
      const { data, error } = await q;
      if (error) throw error;
      const lista = (data ?? []) as unknown as AcionamentoComRel[];
      const busca = (filtro?.busca ?? '').trim().toLowerCase();
      if (!busca) return lista;
      return lista.filter(
        (a) =>
          (a.protocolo ?? '').toLowerCase().includes(busca) ||
          (a.codigo_os ?? '').toLowerCase().includes(busca) ||
          (a.veiculos?.placa ?? '').toLowerCase().includes(busca) ||
          (a.clientes?.nome_razao_social ?? '').toLowerCase().includes(busca),
      );
    },
  });
}

export function useAcionamento(id: string | null) {
  const supabase = createClient();
  return useQuery<AcionamentoComRel | null>({
    queryKey: ['assistencia', 'acionamento', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acionamentos_assistencia')
        .select('*, servicos_assistencia(descricao), veiculos(placa, modelo), clientes(nome_razao_social), fornecedores(razao_social, whatsapp, email)')
        .eq('id', id as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as AcionamentoComRel | null;
    },
  });
}

export function useTrilhaAcionamento(id: string | null) {
  const supabase = createClient();
  return useQuery<AcionamentoHistoricoRow[]>({
    queryKey: ['assistencia', 'trilha', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acionamento_historico')
        .select('*')
        .eq('acionamento_id', id as string)
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Prestadores (cadastro do modulo — reusa fornecedores)
// ---------------------------------------------------------------------------
export function usePrestadores() {
  const supabase = createClient();
  return useQuery<FornecedoresRow[]>({
    queryKey: ['assistencia', 'prestadores-lista'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fornecedores')
        .select('*')
        .eq('prestador_assistencia', true)
        .order('razao_social');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useServicosDoPrestador(fornecedorId: string | null) {
  const supabase = createClient();
  return useQuery<{ servico_id: string; valor_acordado: number | null; valor_km: number | null; prazo_medio_min: number | null; ativo: boolean }[]>({
    queryKey: ['assistencia', 'prestador-servicos', fornecedorId],
    enabled: !!fornecedorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prestador_servicos')
        .select('servico_id, valor_acordado, valor_km, prazo_medio_min, ativo')
        .eq('fornecedor_id', fornecedorId as string);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSalvarPrestador() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, Partial<FornecedoresRow> & { servicos?: { servico_id: string; valor_acordado: number | null; valor_km: number | null; prazo_medio_min: number | null }[] }>({
    mutationFn: async (p) => {
      const payload = {
        tipo_pessoa: p.tipo_pessoa ?? 'PJ',
        documento: (p.documento ?? '').replace(/\D/g, ''),
        razao_social: p.razao_social,
        nome_fantasia: p.nome_fantasia || null,
        email: p.email || null,
        telefone: p.telefone || null,
        whatsapp: p.whatsapp || null,
        cobertura: p.cobertura || null,
        chave_pix: p.chave_pix || null,
        observacoes: p.observacoes || null,
        prestador_assistencia: true,
        ativo: p.ativo ?? true,
      };
      let id = p.id;
      if (id) {
        const { error } = await supabase.from('fornecedores').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('fornecedores').insert(payload).select('id').single();
        if (error) throw error;
        id = data.id;
      }
      if (p.servicos && id) {
        const { error: delErr } = await supabase.from('prestador_servicos').delete().eq('fornecedor_id', id);
        if (delErr) throw delErr;
        if (p.servicos.length > 0) {
          const { error: insErr } = await supabase.from('prestador_servicos').insert(
            p.servicos.map((s) => ({ ...s, fornecedor_id: id as string, ativo: true })),
          );
          if (insErr) throw insErr;
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assistencia'] }),
  });
}
