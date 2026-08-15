'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClientesRow, VeiculosRow, FaturasRow, OpcionalElegibilidade, TipoFaturamento,
  AtendimentosRow, TipoAtendimento, CanalAtendimento, Json,
} from '@/lib/database.types';
import type { StatusFinanceiro } from '@/lib/sac';

export interface Veiculo360 extends VeiculosRow {
  plano_nome: string | null;
  opcionais: OpcionalElegibilidade[];
}
export interface TituloLite {
  id: string;
  veiculo_id: string | null;
  valor: number;
  data_vencimento: string;
  status: 'pendente' | 'pago' | 'cancelado' | 'vencido';
  url_boleto: string | null;
  linha_digitavel: string | null;
}
export interface Visao360 {
  associado: ClientesRow;
  veiculos: Veiculo360[];
  financeiro: { resumo: StatusFinanceiro; titulos: TituloLite[] };
  faturas: FaturasRow[];
}
export interface BuscaHit {
  cliente_id: string;
  nome: string;
  cpf_cnpj: string;
  via: string | null;
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

export function useToggleFaturamento() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { veiculo_id: string; tipo: TipoFaturamento; cliente_id: string }>({
    mutationFn: (v) => jpost('/api/v1/sac/faturamento', { veiculo_id: v.veiculo_id, tipo: v.tipo }),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['sac', '360', v.cliente_id] }),
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
