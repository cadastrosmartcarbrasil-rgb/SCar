'use client';

import { lerTodas } from '@/lib/paginacao';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { ordenarVeiculos } from '@/lib/sac';
import { normalizarDigitos } from '@/lib/rastreador';
import type { VeiculosRow } from '@/lib/database.types';
import {
  TAMANHO_PAGINA_CADASTRO, filtroBuscaVeiculos, filtroBuscaAssociados, statusDaSituacao,
  type SituacaoLista,
} from '@/lib/busca-cadastro';

export interface VeiculoComAssociado extends VeiculosRow {
  clientes?: { nome_razao_social: string; matricula: string | null } | null;
}

export function useVeiculos(associadoId?: string, ativo = true) {
  const supabase = createClient();
  return useQuery<VeiculoComAssociado[]>({
    queryKey: ['veiculos', associadoId ?? 'all'],
    enabled: ativo,
    queryFn: async () => {
      // Paginado: o PostgREST corta em 1.000 linhas e a carteira ja passou
      // disso (ver src/lib/paginacao.ts). O `id` no fim desempata a ordem.
      const data = await lerTodas((de, ate) => {
        let q = supabase
          .from('veiculos')
          .select('*, clientes(nome_razao_social, matricula)')
          .neq('status', 'excluido')
          .order('data_ativacao', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .order('id');
        if (associadoId) q = q.eq('cliente_id', associadoId);
        return q.range(de, ate);
      });
      // Ordem padrao do sistema: ativos primeiro, inativos/cancelados no fim
      // (mesma regra do SQL ordem_status_veiculo, em src/lib/sac.ts).
      return ordenarVeiculos((data ?? []) as unknown as VeiculoComAssociado[]);
    },
  });
}

/**
 * A lista de /veiculos, UMA pagina por vez, com busca e situacao no banco.
 * Substitui o `useVeiculos()` sem filtro, que baixava a frota inteira.
 */
export function useVeiculosPagina(busca: string, situacao: SituacaoLista, pagina: number) {
  const supabase = createClient();
  const termo = busca.trim();
  return useQuery<{ linhas: VeiculoComAssociado[]; total: number }>({
    queryKey: ['veiculos', 'pagina', termo, situacao, pagina],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // O `or` nao alcanca a tabela embutida: o NOME do associado vira lista de ids.
      let clienteIds: string[] = [];
      const fAssoc = termo.length >= 3 ? filtroBuscaAssociados(termo) : null;
      if (fAssoc) {
        const { data, error } = await supabase.from('clientes').select('id').or(fAssoc).limit(200);
        if (error) throw error;
        clienteIds = (data ?? []).map((c) => c.id);
      }
      const filtro = termo ? filtroBuscaVeiculos(termo, clienteIds) : null;
      if (termo && !filtro) return { linhas: [], total: 0 };

      const de = pagina * TAMANHO_PAGINA_CADASTRO;
      let q = supabase
        .from('veiculos')
        .select('*, clientes(nome_razao_social, matricula)', { count: 'exact' })
        .neq('status', 'excluido');
      const status = statusDaSituacao(situacao);
      if (status) q = q.in('status', status as VeiculosRow['status'][]);
      if (filtro) q = q.or(filtro);
      const { data, error, count } = await q
        .order('data_ativacao', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(de, de + TAMANHO_PAGINA_CADASTRO - 1);
      if (error) throw error;
      return { linhas: (data ?? []) as unknown as VeiculoComAssociado[], total: count ?? 0 };
    },
  });
}

/** Um veiculo so (atalho ?editar=<id> do SAC e da ficha). */
export function useVeiculo(id: string | null | undefined) {
  const supabase = createClient();
  return useQuery<VeiculoComAssociado | null>({
    queryKey: ['veiculos', 'um', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('veiculos')
        .select('*, clientes(nome_razao_social, matricula)')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as VeiculoComAssociado) ?? null;
    },
  });
}

/** Seletor de veiculo por placa (instalar rastreador): ate 20 resultados. */
export function useBuscaVeiculos(termo: string) {
  const supabase = createClient();
  const t = termo.trim();
  return useQuery<VeiculoComAssociado[]>({
    queryKey: ['veiculos', 'busca', t],
    enabled: t.length >= 2,
    queryFn: async () => {
      const filtro = filtroBuscaVeiculos(t);
      if (!filtro) return [];
      const { data, error } = await supabase
        .from('veiculos')
        .select('*, clientes(nome_razao_social, matricula)')
        .neq('status', 'excluido')
        .or(filtro)
        .order('placa')
        .limit(20);
      if (error) throw error;
      return ordenarVeiculos((data ?? []) as unknown as VeiculoComAssociado[]);
    },
  });
}

export type SaveVeiculoInput = Partial<VeiculosRow> & {
  opcionaisIds?: string[]; // produtos opcionais do veiculo (veiculo_produtos)
  alertasIds?: string[];   // tipos de alerta ativos no veiculo (veiculo_alertas)
};

export function useSaveVeiculo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<string, Error, SaveVeiculoInput>({
    mutationFn: async (v) => {
      const payload = {
        cliente_id: v.cliente_id,
        placa: (v.placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
        renavam: v.renavam || null,
        chassi: v.chassi || null,
        // Vazio vira NULL, nunca '': `chassi` e unique e string vazia colide
        // (gotcha de fornecedores.documento, 0051). O motor segue a mesma
        // regra por consistencia, ainda que hoje nao tenha unique.
        numero_motor: v.numero_motor || null,
        marca: v.marca || null,
        modelo: v.modelo || null,
        cor: v.cor || null,
        ano_fabricacao: v.ano_fabricacao || null,
        ano_modelo: v.ano_modelo || null,
        uso: v.uso ?? 'passeio',
        regional_id: v.regional_id || null,
        vendedor_id: v.vendedor_id || null,
        status: v.status ?? 'ativo',
        data_contrato: v.data_contrato || null,
        tipo_negociacao: v.tipo_negociacao || null,
        codigo_fipe: v.codigo_fipe || null,
        valor_fipe: v.valor_fipe ?? null,
        quilometragem: v.quilometragem ?? null,
        tipo_cambio: v.tipo_cambio || null,
        combustivel: v.combustivel || null,
        tipo_veiculo_id: v.tipo_veiculo_id || null,
        // ficha ampliada
        plano_protecao_id: v.plano_protecao_id || null,
        alienado: v.alienado ?? false,
        alienado_financeira: v.alienado_financeira || null,
        numero_portas: v.numero_portas ?? null,
        valor_mensalidade: v.valor_mensalidade ?? null,
        dia_vencimento: v.dia_vencimento ?? null,
        // rastreamento
        rastreador_imei: normalizarDigitos(v.rastreador_imei) || null,
        rastreador_chip: normalizarDigitos(v.rastreador_chip) || null,
        empresa_rastreamento_id: v.empresa_rastreamento_id || null,
      };

      let veiculoId = v.id;
      if (veiculoId) {
        const { error } = await supabase.from('veiculos').update(payload).eq('id', veiculoId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('veiculos').insert(payload).select('id').single();
        if (error) throw error;
        veiculoId = data.id;
      }

      // Produtos opcionais do veiculo (substitui o conjunto).
      if (v.opcionaisIds) {
        await supabase.from('veiculo_produtos').delete().eq('veiculo_id', veiculoId);
        if (v.opcionaisIds.length) {
          const { error } = await supabase.from('veiculo_produtos')
            .insert(v.opcionaisIds.map((pid) => ({ veiculo_id: veiculoId!, produto_id: pid })));
          if (error) throw error;
        }
      }

      // Alertas ativos do veiculo (substitui o conjunto ativo).
      if (v.alertasIds) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('veiculo_alertas').delete().eq('veiculo_id', veiculoId).eq('ativo', true);
        if (v.alertasIds.length) {
          const { error } = await supabase.from('veiculo_alertas')
            .insert(v.alertasIds.map((tid) => ({ veiculo_id: veiculoId!, tipo_alerta_id: tid, ativo: true, created_by: user?.id ?? null })));
          if (error) throw error;
        }
      }

      return veiculoId!;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['veiculos'] });
      qc.invalidateQueries({ queryKey: ['ficha', 'veiculo-produtos', id] });
      qc.invalidateQueries({ queryKey: ['ficha', 'veiculo-alertas', id] });
    },
  });
}

export function useExcluirVeiculo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('veiculos').update({ status: 'excluido' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['veiculos'] }),
  });
}
