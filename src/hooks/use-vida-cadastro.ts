'use client';

// A "vida" de um associado ou de um veiculo, para as fichas do administrativo
// (/associados/[id] e /veiculos/[id]): eventos (SCar + historico do Mutual),
// protocolos e acionamentos da 24h. O financeiro e o mesmo hook do SAC
// (`useTitulosCliente`, duas fontes). Leitura pela sessao: vale a RLS.
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { unirEventosCliente, type EventoScarLeitura, type EventoUnificado } from '@/lib/eventos-historico';
import type {
  PrioridadeAtendimento, StatusAcionamento, StatusAtendimento, TipoAtendimento, VeiculosRow,
} from '@/lib/database.types';

type Alvo = { clienteId: string | null; veiculoId?: string | null };

export function useEventosCadastro({ clienteId, veiculoId }: Alvo) {
  const supabase = createClient();
  return useQuery<EventoUnificado[]>({
    queryKey: ['cadastro', 'eventos', clienteId ?? '', veiculoId ?? 'todos'],
    enabled: !!clienteId,
    queryFn: async () => {
      let q = supabase
        .from('eventos_sinistro')
        .select('id, veiculo_id, numero_protocolo, status, data_ocorrencia, tipos_evento(nome), veiculos(placa)')
        .eq('cliente_id', clienteId as string)
        .order('data_ocorrencia', { ascending: false })
        .limit(500);
      if (veiculoId) q = q.eq('veiculo_id', veiculoId);
      const [scar, mutual] = await Promise.all([
        q,
        supabase.rpc('eventos_mutual_do_cliente', { p_cliente_id: clienteId as string, p_limite: 500 }),
      ]);
      if (scar.error) throw scar.error;
      if (mutual.error) throw mutual.error;
      return unirEventosCliente((scar.data ?? []) as unknown as EventoScarLeitura[], mutual.data ?? [], veiculoId);
    },
  });
}

export type ProtocoloCadastro = {
  id: string;
  numero_protocolo: string | null;
  veiculo_id: string | null;
  tipo: TipoAtendimento;
  assunto: string | null;
  status: StatusAtendimento;
  prioridade: PrioridadeAtendimento;
  created_at: string;
  encerrado_em: string | null;
  veiculos?: { placa: string } | null;
};

export function useProtocolosCadastro({ clienteId, veiculoId }: Alvo) {
  const supabase = createClient();
  return useQuery<ProtocoloCadastro[]>({
    queryKey: ['cadastro', 'protocolos', clienteId ?? '', veiculoId ?? 'todos'],
    enabled: !!clienteId || !!veiculoId,
    queryFn: async () => {
      let q = supabase
        .from('atendimentos')
        .select('id, numero_protocolo, veiculo_id, tipo, assunto, status, prioridade, created_at, encerrado_em, veiculos(placa)')
        .order('created_at', { ascending: false })
        .limit(500);
      q = veiculoId ? q.eq('veiculo_id', veiculoId) : q.eq('cliente_id', clienteId as string);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ProtocoloCadastro[];
    },
  });
}

export type AcionamentoCadastro = {
  id: string;
  protocolo: string | null;
  codigo_os: string | null;
  veiculo_id: string;
  status: StatusAcionamento;
  valor_total: number;
  created_at: string;
  concluido_em: string | null;
  servicos_assistencia?: { descricao: string } | null;
  fornecedores?: { razao_social: string; nome_fantasia: string | null } | null;
  veiculos?: { placa: string } | null;
};

export function useAcionamentosCadastro({ clienteId, veiculoId }: Alvo) {
  const supabase = createClient();
  return useQuery<AcionamentoCadastro[]>({
    queryKey: ['cadastro', 'acionamentos', clienteId ?? '', veiculoId ?? 'todos'],
    enabled: !!clienteId || !!veiculoId,
    queryFn: async () => {
      let q = supabase
        .from('acionamentos_assistencia')
        .select('id, protocolo, codigo_os, veiculo_id, status, valor_total, created_at, concluido_em, servicos_assistencia(descricao), fornecedores(razao_social, nome_fantasia), veiculos(placa)')
        .order('created_at', { ascending: false })
        .limit(500);
      q = veiculoId ? q.eq('veiculo_id', veiculoId) : q.eq('cliente_id', clienteId as string);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AcionamentoCadastro[];
    },
  });
}

export type VeiculoFicha = VeiculosRow & {
  clientes?: { id: string; nome_razao_social: string; matricula: string | null; cpf_cnpj: string; tipo_pessoa: string } | null;
  planos_protecao?: { nome: string } | null;
  tipos_veiculo?: { nome: string } | null;
  regionais?: { nome: string } | null;
};

export function useVeiculoFicha(id: string) {
  const supabase = createClient();
  return useQuery<VeiculoFicha | null>({
    queryKey: ['veiculo', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('veiculos')
        .select('*, clientes(id, nome_razao_social, matricula, cpf_cnpj, tipo_pessoa), planos_protecao(nome), tipos_veiculo(nome), regionais!veiculos_regional_id_fkey(nome)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as VeiculoFicha | null;
    },
  });
}
