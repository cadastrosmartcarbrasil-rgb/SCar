'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { LancamentoComRel } from '@/hooks/use-financeiro';
import type { EventoTerceirosRow, MovimentacoesCaixaRow } from '@/lib/database.types';
import type { TerceiroForm } from '@/lib/terceiros';

/** Terceiro com o contexto exigido pela regra: Evento (X) do Associado (Y). */
export interface TerceiroComVinculo extends EventoTerceirosRow {
  eventos_sinistro?: { numero_protocolo: string | null; status: string } | null;
  clientes?: { nome_razao_social: string } | null;
}

const chaveTerceiros = (eventoId: string) => ['eventos', eventoId, 'terceiros'];

/** Terceiros de um evento, na ordem de cadastro (T01, T02...). */
export function useTerceirosEvento(eventoId: string) {
  const supabase = createClient();
  return useQuery<EventoTerceirosRow[]>({
    queryKey: chaveTerceiros(eventoId),
    enabled: !!eventoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('evento_terceiros')
        .select('*')
        .eq('evento_id', eventoId)
        .order('sequencia', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Um terceiro, sempre carregado junto do evento e do associado vinculante. */
export function useTerceiro(terceiroId: string) {
  const supabase = createClient();
  return useQuery<TerceiroComVinculo>({
    queryKey: ['terceiros', terceiroId],
    enabled: !!terceiroId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('evento_terceiros')
        .select('*, eventos_sinistro(numero_protocolo, status), clientes(nome_razao_social)')
        .eq('id', terceiroId)
        .single();
      if (error) throw error;
      return data as unknown as TerceiroComVinculo;
    },
  });
}

// Campos que o operador edita. evento_id so vai no INSERT; cliente_id,
// regional_id, sequencia e codigo sao definidos pelo banco (trigger 0103).
function payloadTerceiro(t: TerceiroForm) {
  return {
    papel: t.papel || null,
    status: t.status ?? 'EM_ANALISE',
    tipo_pessoa: t.tipo_pessoa ?? 'PF',
    nome: (t.nome ?? '').trim(),
    cpf_cnpj: t.cpf_cnpj || null,
    rg: t.rg || null,
    data_nascimento: t.data_nascimento || null,
    telefone: t.telefone || null,
    celular: t.celular || null,
    email: t.email || null,
    endereco: t.endereco ?? {},
    condutor_e_proprietario: t.condutor_e_proprietario ?? true,
    condutor_nome: t.condutor_e_proprietario === false ? t.condutor_nome || null : null,
    condutor_cpf: t.condutor_e_proprietario === false ? t.condutor_cpf || null : null,
    condutor_cnh: t.condutor_cnh || null,
    possui_veiculo: t.possui_veiculo ?? true,
    veiculo_placa: t.possui_veiculo === false ? null : t.veiculo_placa || null,
    veiculo_marca: t.possui_veiculo === false ? null : t.veiculo_marca || null,
    veiculo_modelo: t.possui_veiculo === false ? null : t.veiculo_modelo || null,
    veiculo_ano: t.possui_veiculo === false ? null : t.veiculo_ano ?? null,
    veiculo_cor: t.possui_veiculo === false ? null : t.veiculo_cor || null,
    veiculo_valor_fipe: t.possui_veiculo === false ? null : t.veiculo_valor_fipe ?? null,
    possui_seguro: t.possui_seguro ?? false,
    seguradora: t.possui_seguro ? t.seguradora || null : null,
    numero_apolice: t.possui_seguro ? t.numero_apolice || null : null,
    descricao_danos: t.descricao_danos || null,
    valor_estimado_danos: t.valor_estimado_danos ?? null,
    observacoes: t.observacoes || null,
  };
}

/**
 * Cria (com evento_id) ou atualiza (com id) um terceiro. Devolve id e codigo.
 * clienteId = associado dono do evento; o trigger do banco confere/impoe o
 * mesmo valor, entao o front nunca consegue vincular a outro associado.
 */
export function useSalvarTerceiro(eventoId: string, clienteId: string) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<{ id: string; codigo: string }, Error, TerceiroForm>({
    mutationFn: async (t) => {
      if (t.id) {
        const { data, error } = await supabase
          .from('evento_terceiros')
          .update(payloadTerceiro(t))
          .eq('id', t.id)
          .select('id, codigo')
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('evento_terceiros')
        .insert({ ...payloadTerceiro(t), evento_id: eventoId, cliente_id: clienteId })
        .select('id, codigo')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: chaveTerceiros(eventoId) });
      qc.invalidateQueries({ queryKey: ['terceiros', r.id] });
      qc.invalidateQueries({ queryKey: ['eventos', eventoId] });
    },
  });
}

/**
 * Contas a pagar/receber do evento (lancamentos_financeiros). Com terceiroId,
 * so as que tratam daquele terceiro.
 */
export function useLancamentosEvento(eventoId: string, terceiroId?: string) {
  const supabase = createClient();
  return useQuery<LancamentoComRel[]>({
    queryKey: ['lancamentos', 'evento', eventoId, terceiroId ?? 'todos'],
    enabled: !!eventoId,
    queryFn: async () => {
      let q = supabase
        .from('lancamentos_financeiros')
        .select(
          '*, fornecedores(razao_social, nome_fantasia), clientes(nome_razao_social), ' +
            'categorias_dre(codigo_estruturado, nome), centros_custo(nome), evento_terceiros(codigo, nome)',
        )
        .eq('evento_id', eventoId)
        .order('data_vencimento', { ascending: true });
      if (terceiroId) q = q.eq('evento_terceiro_id', terceiroId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as LancamentoComRel[];
    },
  });
}

/** Movimentacoes de caixa antigas do evento (antes da 0103), so leitura. */
export function useMovimentacoesLegadasEvento(eventoId: string) {
  const supabase = createClient();
  return useQuery<MovimentacoesCaixaRow[]>({
    queryKey: ['eventos', eventoId, 'financeiro-legado'],
    enabled: !!eventoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movimentacoes_caixa')
        .select('*')
        .eq('evento_id', eventoId)
        .order('data_competencia', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
