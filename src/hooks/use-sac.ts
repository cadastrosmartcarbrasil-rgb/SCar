'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClientesRow, VeiculosRow, FaturasRow, OpcionalVeiculo, TipoFaturamento,
  AtendimentosRow, TipoAtendimento, CanalAtendimento, Json, StatusVeiculo, StatusEvento,
} from '@/lib/database.types';
import type { StatusFinanceiro } from '@/lib/sac';

// Item da LISTA resumida (leve): so o essencial para identificar o veiculo.
export interface VeiculoResumo {
  id: string;
  placa: string;
  marca: string | null;
  modelo: string | null;
  ano_modelo: number | null;
  status: StatusVeiculo;
  tipo_faturamento: TipoFaturamento;
  data_ativacao: string | null;
  plano_nome: string | null;
  inadimplente: boolean;
  eventos_qtd: number;
  tem_assistencia: boolean;
  alertas_qtd: number;
}
// Alerta ativo de um veiculo do associado (abre no SAC ao localizar).
export interface AlertaResumo {
  id: string;
  veiculo_id: string;
  placa: string | null;
  nome: string;
  severidade: string;
  mensagem: string | null;
}
// Evento (sinistro) do associado — aba Eventos.
export interface EventoResumo {
  id: string;
  veiculo_id: string;
  placa: string | null;
  numero_protocolo: string | null;
  tipo: string | null;
  status: StatusEvento;
  data_ocorrencia: string;
}
// DETALHE completo (carregado sob demanda ao clicar no veiculo).
export interface VeiculoDetalhe extends VeiculosRow {
  plano_nome: string | null;
  /** SO os itens contratados do veiculo (plano + avulsos) — 0029. */
  opcionais: OpcionalVeiculo[];
}
export interface Visao360 {
  associado: ClientesRow;
  veiculos: VeiculoResumo[];
  financeiro: { resumo: StatusFinanceiro };
  eventos: EventoResumo[];
  alertas: AlertaResumo[];
}
export interface BuscaHit {
  cliente_id: string;
  nome: string;
  cpf_cnpj: string;
  via: string | null;
  /** Preenchido so quando o acerto foi por PLACA — abre o atendimento direto. */
  veiculo_id: string | null;
  placa: string | null;
}

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Erro na consulta');
  return r.json() as Promise<T>;
}
async function jpost<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Erro na operacao');
  return r.json() as Promise<T>;
}

export function useSacBusca(q: string) {
  return useQuery<BuscaHit[]>({
    queryKey: ['sac', 'busca', q],
    enabled: q.trim().length >= 2,
    queryFn: async () => (await jget<{ resultados: BuscaHit[] }>(`/api/v1/sac/busca?q=${encodeURIComponent(q)}`)).resultados,
  });
}

export function useVisao360(clienteId?: string) {
  return useQuery<Visao360>({
    queryKey: ['sac', '360', clienteId ?? 'none'],
    enabled: !!clienteId,
    queryFn: () => jget<Visao360>(`/api/v1/sac/visao-360?cliente_id=${clienteId}`),
  });
}

// Detalhe do veiculo — carregado SOB DEMANDA (lazy) ao selecionar na lista.
export function useVeiculoDetalhe(veiculoId?: string) {
  return useQuery<VeiculoDetalhe>({
    queryKey: ['sac', 'veiculo', veiculoId ?? 'none'],
    enabled: !!veiculoId,
    queryFn: async () => {
      const r = await jget<{ veiculo: VeiculosRow; plano_nome: string | null; opcionais: OpcionalVeiculo[] }>(
        `/api/v1/sac/veiculo?veiculo_id=${veiculoId}`,
      );
      return { ...r.veiculo, plano_nome: r.plano_nome, opcionais: r.opcionais };
    },
  });
}

export function useToggleFaturamento() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { veiculo_id: string; tipo: TipoFaturamento; cliente_id: string }>({
    mutationFn: (v) => jpost('/api/v1/sac/faturamento', { veiculo_id: v.veiculo_id, tipo: v.tipo }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['sac', '360', v.cliente_id] });
      qc.invalidateQueries({ queryKey: ['sac', 'veiculo', v.veiculo_id] });
    },
  });
}

export function useGerarBoleto() {
  const qc = useQueryClient();
  return useMutation<{ competencia: string; faturas: FaturasRow[] }, Error, { cliente_id: string }>({
    mutationFn: (v) => jpost('/api/v1/sac/boleto', { cliente_id: v.cliente_id }),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['sac', '360', v.cliente_id] }),
  });
}

// Historico de atendimentos do veiculo selecionado (acompanhamento).
export function useAtendimentosVeiculo(veiculoId?: string) {
  return useQuery<AtendimentosRow[]>({
    queryKey: ['sac', 'atendimentos', veiculoId ?? 'none'],
    enabled: !!veiculoId,
    queryFn: async () => (await jget<{ atendimentos: AtendimentosRow[] }>(`/api/v1/sac/atendimento?veiculo_id=${veiculoId}`)).atendimentos,
  });
}

// Abre um atendimento sempre vinculado ao veiculo especifico.
export interface AbrirAtendimentoInput {
  veiculo_id: string;
  tipo: TipoAtendimento;
  canal?: CanalAtendimento;
  assunto?: string;
  descricao?: string;
  dados?: Json;
}
export function useAbrirAtendimento() {
  const qc = useQueryClient();
  return useMutation<{ atendimento: AtendimentosRow }, Error, AbrirAtendimentoInput>({
    mutationFn: (v) => jpost('/api/v1/sac/atendimento', v),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['sac', 'atendimentos', v.veiculo_id] }),
  });
}
