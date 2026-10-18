'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { produtoAtendeTipo, type TiposPorProduto } from '@/lib/produtos';
import type { ItemCobertura } from '@/lib/coberturas';

export type VeiculoParaCobertura = {
  id: string;
  tipo_veiculo_id: string | null;
  plano_protecao_id: string | null;
  valor_fipe: number | null;
};

export type CoberturasDoVeiculo = {
  plano: { nome: string; descricao_comercial: string | null; sem_casco: boolean } | null;
  itens: ItemCobertura[];
  /** Produtos ATIVOS que atendem o tipo do veiculo — base do "nao inclui". */
  disponiveis: { nome: string; categoria: string | null }[];
  participacao: number | null;
};

// O pacote do veiculo explicado para o atendente (0120): o que ele tem (plano +
// avulsos, com o texto de cada cobertura), o que a casa vende e ele nao tem, e
// a participacao no evento. A chave fica sob ['veiculo', id], entao salvar o
// veiculo ou os opcionais (use-veiculo-ficha) ja recarrega esta leitura.
export function useCoberturasVeiculo(v: VeiculoParaCobertura | null | undefined) {
  const supabase = createClient();
  return useQuery<CoberturasDoVeiculo>({
    queryKey: ['veiculo', v?.id, 'coberturas', v?.plano_protecao_id, v?.tipo_veiculo_id, v?.valor_fipe],
    enabled: !!v?.id,
    queryFn: async () => {
      const veic = v!;
      const [opc, prods, tipos, plano, part] = await Promise.all([
        supabase.rpc('opcionais_veiculo', { p_veiculo_id: veic.id }),
        supabase.from('produtos').select('id, nome, categoria, descricao_cobertura, status'),
        supabase.from('produto_tipos_veiculo').select('produto_id, tipo_veiculo_id'),
        veic.plano_protecao_id
          ? supabase.from('planos_protecao').select('nome, descricao_comercial, sem_casco')
              .eq('id', veic.plano_protecao_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        veic.valor_fipe
          ? supabase.rpc('calcular_participacao_veiculo', { p_veiculo_id: veic.id, p_fipe: veic.valor_fipe })
          : Promise.resolve({ data: null, error: null }),
      ]);
      // Falha na leitura do pacote nao pode virar "sem cobertura" na tela.
      if (opc.error) throw opc.error;
      if (prods.error) throw prods.error;
      const mapa: TiposPorProduto = {};
      for (const t of tipos.data ?? []) (mapa[t.produto_id] ??= []).push(t.tipo_veiculo_id);
      const porId = new Map((prods.data ?? []).map((p) => [p.id, p]));
      const itens: ItemCobertura[] = (opc.data ?? []).map((o) => ({
        ...o,
        categoria: porId.get(o.produto_id)?.categoria ?? null,
        descricao: porId.get(o.produto_id)?.descricao_cobertura ?? null,
      }));
      const disponiveis = (prods.data ?? [])
        .filter((p) => p.status && produtoAtendeTipo(p.id, veic.tipo_veiculo_id, mapa))
        .map((p) => ({ nome: p.nome, categoria: p.categoria }));
      return {
        plano: plano.data ?? null,
        itens,
        disponiveis,
        participacao: part.data != null ? Number(part.data) : null,
      };
    },
  });
}
