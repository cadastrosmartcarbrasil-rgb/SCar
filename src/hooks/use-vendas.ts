'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  LeadsRow, CotacoesRow, LeadHistoricoRow, CotacaoItem, StatusLead, StatusKanban,
  CotacaoPlano, LeadKanban, SimulacaoDesconto, ProdutoObrigatorio,
} from '@/lib/database.types';

// Papel do usuario logado (para gate da Auditoria).
export function useMeuPapel() {
  const supabase = createClient();
  return useQuery<string | null>({
    queryKey: ['vendas', 'meu-papel'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
      return data?.papel ?? null;
    },
  });
}

// --- Leads ---
export function useLeads(status?: StatusLead | 'TODOS') {
  const supabase = createClient();
  return useQuery<LeadsRow[]>({
    queryKey: ['vendas', 'leads', status ?? 'TODOS'],
    queryFn: async () => {
      let q = supabase.from('leads').select('*').order('updated_at', { ascending: false });
      if (status && status !== 'TODOS') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLead(id?: string) {
  const supabase = createClient();
  return useQuery<LeadsRow | null>({
    queryKey: ['vendas', 'lead', id ?? 'none'],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('leads').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCotacoes(leadId?: string) {
  const supabase = createClient();
  return useQuery<CotacoesRow[]>({
    queryKey: ['vendas', 'cotacoes', leadId ?? 'none'],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase.from('cotacoes').select('*').eq('lead_id', leadId!).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useHistoricoLead(leadId?: string) {
  const supabase = createClient();
  return useQuery<LeadHistoricoRow[]>({
    queryKey: ['vendas', 'historico', leadId ?? 'none'],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase.from('lead_historico').select('*').eq('lead_id', leadId!).order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveLead() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<LeadsRow, Error, Partial<LeadsRow>>({
    mutationFn: async (lead) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (lead.id) {
        const { id, created_at, updated_at, ...patch } = lead;
        const { data, error } = await supabase.from('leads').update(patch).eq('id', id).select('*').single();
        if (error) throw error;
        return data;
      }
      const payload = { ...lead, consultor_id: lead.consultor_id ?? user?.id ?? null, created_by: user?.id ?? null };
      const { data, error } = await supabase.from('leads').insert(payload).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: (l) => {
      qc.invalidateQueries({ queryKey: ['vendas', 'leads'] });
      qc.invalidateQueries({ queryKey: ['vendas', 'lead', l.id] });
    },
  });
}

// Muda o status (a esteira). APROVADO e auto-convertido para EM_AUDITORIA no banco.
export function useAvancarStatus() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<LeadsRow, Error, { id: string; status: StatusLead; perdido_motivo?: string }>({
    mutationFn: async ({ id, status, perdido_motivo }) => {
      const patch: Partial<LeadsRow> = { status };
      if (status === 'PERDIDO') patch.perdido_motivo = perdido_motivo ?? null;
      const { data, error } = await supabase.from('leads').update(patch).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: (l) => {
      qc.invalidateQueries({ queryKey: ['vendas'] });
      qc.invalidateQueries({ queryKey: ['vendas', 'lead', l.id] });
    },
  });
}

// Gera a cotacao (snapshot) a partir da FIPE + produtos, e cria o link publico.
export function useSalvarCotacao() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<
    CotacoesRow,
    Error,
    { leadId: string; fipe: number; tipoVeiculoId: string; cotaId?: string | null; planoId?: string | null; produtosIds: string[]; modoEnvio?: string }
  >({
    mutationFn: async ({ leadId, fipe, tipoVeiculoId, cotaId, planoId, produtosIds, modoEnvio }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const [cot, part] = await Promise.all([
        supabase.rpc('cotar_plano', { p_fipe: fipe, p_tipo_veiculo_id: tipoVeiculoId, p_plano_id: planoId ?? null, p_avulsos_ids: produtosIds }),
        supabase.rpc('calcular_participacao', { p_fipe: fipe, p_tipo_veiculo_id: tipoVeiculoId, p_cota_id: cotaId ?? null }),
      ]);
      if (cot.error) throw cot.error;
      if (part.error) throw part.error;
      const calc = cot.data as unknown as CotacaoPlano;
      const itens: CotacaoItem[] = calc.detalhamento_produtos.map((i) => ({
        produto_id: i.produto_id, nome: i.nome, valor: i.valor, obrigatorio: i.obrigatorio,
      }));
      const { data, error } = await supabase.from('cotacoes').insert({
        lead_id: leadId,
        fipe,
        tipo_veiculo_id: tipoVeiculoId,
        cota_participacao_id: cotaId ?? null,
        plano_id: planoId ?? null,
        opcionais_ids: produtosIds,
        itens,
        total_mensalidade: calc.valor_total_mensalidade,
        participacao: Number(part.data ?? calc.franquia_participacao ?? 0),
        taxa_adesao: Number(calc.taxa_adesao ?? 0),
        modo_envio: modoEnvio ?? 'DETALHADA',
        created_by: user?.id ?? null,
      }).select('*').single();
      if (error) throw error;
      // marca o lead como Orcamento Gerado (se ainda estiver em Novo)
      await supabase.from('leads').update({ status: 'ORCAMENTO_GERADO' }).eq('id', leadId).eq('status', 'NOVO');
      return data;
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['vendas', 'cotacoes', c.lead_id] });
      qc.invalidateQueries({ queryKey: ['vendas'] });
    },
  });
}

// Auditoria autoriza a entrada na base (cria cliente + veiculo). So papel auditoria/admin.
export function useAutorizarEntrada() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<string, Error, { leadId: string; cpfCnpj?: string | null }>({
    mutationFn: async ({ leadId, cpfCnpj }) => {
      const { data, error } = await supabase.rpc('autorizar_entrada_lead', { p_lead_id: leadId, p_cpf_cnpj: cpfCnpj ?? null });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: (_v, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['vendas'] });
      qc.invalidateQueries({ queryKey: ['vendas', 'lead', leadId] });
    },
  });
}


// ---------------------------------------------------------------------------
// Kanban do funil (0028)
// ---------------------------------------------------------------------------
export function useLeadsKanban(filtro?: { regionalId?: string | null; consultorId?: string | null }) {
  const supabase = createClient();
  return useQuery<LeadKanban[]>({
    queryKey: ['vendas', 'kanban', filtro?.regionalId ?? 'all', filtro?.consultorId ?? 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('leads_kanban', {
        p_regional_id: filtro?.regionalId ?? null,
        p_consultor_id: filtro?.consultorId ?? null,
        p_limite: 500,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Drag-and-drop: move o lead de fase (o banco valida a transicao).
export function useMoverLead() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<LeadsRow, Error, { id: string; status: StatusKanban; obs?: string | null }>({
    mutationFn: async ({ id, status, obs }) => {
      const { data, error } = await supabase.rpc('mover_lead_status', {
        p_lead_id: id,
        p_status: status,
        p_obs: obs ?? null,
      });
      if (error) throw error;
      return data as LeadsRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendas'] }),
  });
}

// ---------------------------------------------------------------------------
// Cotacao editavel + desconto (0028)
// ---------------------------------------------------------------------------
export interface AtualizarCotacaoInput {
  cotacaoId: string;
  fipe?: number | null;
  tipoVeiculoId?: string | null;
  cotaId?: string | null;
  planoId?: string | null;
  opcionaisIds?: string[] | null;
  modoEnvio?: string | null;
  descontoPercentual?: number | null;
  descontoJustificativa?: string | null;
}

export function useAtualizarCotacao() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<CotacoesRow, Error, AtualizarCotacaoInput>({
    mutationFn: async (i) => {
      const { data, error } = await supabase.rpc('atualizar_cotacao', {
        p_cotacao_id: i.cotacaoId,
        p_fipe: i.fipe ?? null,
        p_tipo_veiculo_id: i.tipoVeiculoId ?? null,
        p_cota_id: i.cotaId ?? null,
        p_plano_id: i.planoId ?? null,
        p_opcionais_ids: i.opcionaisIds ?? null,
        p_modo_envio: i.modoEnvio ?? null,
        p_desconto_percentual: i.descontoPercentual ?? null,
        p_desconto_justificativa: i.descontoJustificativa ?? null,
      });
      if (error) throw error;
      return data as CotacoesRow;
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['vendas', 'cotacoes', c.lead_id] });
      qc.invalidateQueries({ queryKey: ['vendas'] });
    },
  });
}

// Itens que nao podem ser desmarcados (base + plano).
export function useProdutosObrigatorios(tipoVeiculoId?: string | null, planoId?: string | null, fipe?: number) {
  const supabase = createClient();
  return useQuery<ProdutoObrigatorio[]>({
    queryKey: ['vendas', 'obrigatorios', tipoVeiculoId ?? '', planoId ?? '', fipe ?? 0],
    enabled: !!tipoVeiculoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('produtos_obrigatorios_cotacao', {
        p_tipo_veiculo_id: tipoVeiculoId as string,
        p_plano_id: planoId ?? null,
        p_fipe: fipe ?? 0,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Simulacao do desconto (limite da franquia + efeito nos valores).
export function useSimularDesconto(cotacaoId: string | null, percentual: number) {
  const supabase = createClient();
  return useQuery<SimulacaoDesconto | null>({
    queryKey: ['vendas', 'simular-desconto', cotacaoId ?? '', percentual],
    enabled: !!cotacaoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('simular_desconto_cotacao', {
        p_cotacao_id: cotacaoId as string,
        p_percentual: percentual,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

// Desconto acima do limite: roda na sessao do gestor (alcada de excecao).
export function useAprovarDesconto() {
  const qc = useQueryClient();
  return useMutation<{ cotacao: CotacoesRow; aprovado_por: string }, Error, {
    cotacao_id: string;
    percentual: number;
    justificativa: string;
    email: string;
    senha: string;
  }>({
    mutationFn: async (input) => {
      const res = await fetch('/api/v1/vendas/desconto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Falha ao aprovar o desconto');
      return json;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendas'] }),
  });
}
