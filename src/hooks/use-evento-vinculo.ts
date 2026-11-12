'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { filtroBuscaAssociados } from '@/lib/busca-cadastro';
import { termosBuscaEvento } from '@/lib/terceiros';
import type { ContextoEvento } from '@/components/financeiro/lancamento-modal';

export interface EventoParaVincular {
  id: string;
  numero_protocolo: string | null;
  data_ocorrencia: string | null;
  status: string;
  regional_id: string | null;
  clientes: { id: string; nome_razao_social: string } | null;
  veiculos: { placa: string | null; modelo: string | null } | null;
}

const COLUNAS =
  'id, numero_protocolo, data_ocorrencia, status, regional_id, '
  + 'clientes!eventos_sinistro_cliente_id_fkey(id, nome_razao_social), '
  + 'veiculos!eventos_sinistro_veiculo_id_fkey(placa, modelo)';

/** Padrao do ilike para o numero do evento (EVT-AAAAMMDD-NNNN) a partir dos digitos. */
function padraoProtocolo(d: string): string {
  return d.length > 8 ? `%${d.slice(0, 8)}-${d.slice(8)}%` : `%${d}%`;
}

/** Busca de evento para ligar um titulo do Financeiro: numero, placa ou nome do associado (ate 20). */
export function useBuscaEventosVinculo(termo: string) {
  const supabase = createClient();
  const t = termo.trim();
  return useQuery<EventoParaVincular[]>({
    queryKey: ['eventos', 'vinculo-financeiro', t],
    enabled: t.length >= 2,
    queryFn: async () => {
      const { protocolo, placa, nome } = termosBuscaEvento(t);
      const consultas: PromiseLike<EventoParaVincular[]>[] = [];
      if (protocolo) {
        consultas.push(
          supabase.from('eventos_sinistro').select(COLUNAS).ilike('numero_protocolo', padraoProtocolo(protocolo))
            .order('data_ocorrencia', { ascending: false }).limit(20)
            .then(({ data, error }) => { if (error) throw error; return (data ?? []) as unknown as EventoParaVincular[]; }),
        );
      }
      if (placa) {
        consultas.push((async () => {
          const { data: v, error } = await supabase.from('veiculos').select('id').ilike('placa', `%${placa}%`).limit(20);
          if (error) throw error;
          const ids = (v ?? []).map((x) => x.id);
          if (!ids.length) return [];
          const { data, error: e2 } = await supabase.from('eventos_sinistro').select(COLUNAS).in('veiculo_id', ids)
            .order('data_ocorrencia', { ascending: false }).limit(20);
          if (e2) throw e2;
          return (data ?? []) as unknown as EventoParaVincular[];
        })());
      }
      if (nome) {
        consultas.push((async () => {
          const filtro = filtroBuscaAssociados(nome);
          if (!filtro) return [];
          const { data: c, error } = await supabase.from('clientes').select('id').or(filtro).limit(30);
          if (error) throw error;
          const ids = (c ?? []).map((x) => x.id);
          if (!ids.length) return [];
          const { data, error: e2 } = await supabase.from('eventos_sinistro').select(COLUNAS).in('cliente_id', ids)
            .order('data_ocorrencia', { ascending: false }).limit(20);
          if (e2) throw e2;
          return (data ?? []) as unknown as EventoParaVincular[];
        })());
      }
      const vistos = new Map<string, EventoParaVincular>();
      for (const lista of await Promise.all(consultas)) for (const e of lista) vistos.set(e.id, e);
      return [...vistos.values()]
        .sort((a, b) => (b.data_ocorrencia ?? '').localeCompare(a.data_ocorrencia ?? ''))
        .slice(0, 20);
    },
  });
}

/** O evento ja ligado ao titulo: numero, associado e terceiros (para o favorecido). */
export function useContextoEvento(eventoId: string | null | undefined) {
  const supabase = createClient();
  return useQuery<(ContextoEvento & { evento: EventoParaVincular }) | null>({
    queryKey: ['eventos', 'contexto-financeiro', eventoId ?? '-'],
    enabled: !!eventoId,
    queryFn: async () => {
      const [{ data: e, error }, { data: t, error: e2 }] = await Promise.all([
        supabase.from('eventos_sinistro').select(COLUNAS).eq('id', eventoId!).maybeSingle(),
        supabase.from('evento_terceiros').select('id, codigo, nome').eq('evento_id', eventoId!).order('codigo'),
      ]);
      if (error) throw error;
      if (e2) throw e2;
      if (!e) return null;
      const ev = e as unknown as EventoParaVincular;
      return {
        evento: ev,
        protocolo: ev.numero_protocolo,
        associado: ev.clientes ? { id: ev.clientes.id, nome: ev.clientes.nome_razao_social } : null,
        terceiros: (t ?? []) as { id: string; codigo: string; nome: string }[],
      };
    },
  });
}
