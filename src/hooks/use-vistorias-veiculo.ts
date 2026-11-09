'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { AnexoVistoria, RevistoriaResumo } from '@/lib/vistorias-veiculo';

export interface VistoriaDoVeiculo {
  id: string;
  tipo: string | null;
  status: string;
  data_vistoria: string | null;
  observacoes: string | null;
  lead_id: string | null;
  created_at: string;
  anexos: AnexoVistoria[];
  revistoria: RevistoriaResumo | null;
}

export interface CatalogoPoses {
  nomes: Record<string, string>;
  ordem: Record<string, number>;
}

/**
 * As vistorias do veiculo (adesao e revistorias), com os anexos e a situacao do
 * pedido de revistoria. A RLS de `vistorias`/`revistorias_cobranca` decide o
 * alcance; quem nao ve o veiculo nao ve nada.
 */
export function useVistoriasDoVeiculo(veiculoId: string | null | undefined) {
  const supabase = createClient();
  return useQuery<VistoriaDoVeiculo[]>({
    queryKey: ['veiculo', veiculoId, 'vistorias'],
    enabled: !!veiculoId,
    queryFn: async () => {
      const [vist, revs] = await Promise.all([
        supabase.from('vistorias')
          .select('id, tipo, status, data_vistoria, observacoes, lead_id, created_at, vistoria_anexos(id, url, tipo, descricao, created_at, tamanho_bytes, enviado_pelo_cliente, duracao_segundos)')
          .eq('veiculo_id', veiculoId as string)
          .order('created_at', { ascending: false }),
        supabase.from('revistorias_cobranca')
          .select('vistoria_id, situacao, enviado_em, analisado_em, observacao_analise, motivo_reprovacao, dispensa_justificativa, vencimento_referencia, dias_atraso')
          .eq('veiculo_id', veiculoId as string),
      ]);
      if (vist.error) throw vist.error;
      // Sem permissao de cobranca a leitura do pedido volta vazia: a vistoria aparece com o status dela.
      const porVistoria = new Map<string, RevistoriaResumo>();
      for (const r of (revs.data ?? []) as (RevistoriaResumo & { vistoria_id: string | null })[]) {
        if (r.vistoria_id) porVistoria.set(r.vistoria_id, r);
      }
      type Linha = Omit<VistoriaDoVeiculo, 'anexos' | 'revistoria'> & { vistoria_anexos: AnexoVistoria[] | null };
      return ((vist.data ?? []) as unknown as Linha[]).map(({ vistoria_anexos, ...v }) => ({
        ...v,
        anexos: vistoria_anexos ?? [],
        revistoria: porVistoria.get(v.id) ?? null,
      }));
    },
  });
}

/** Nome e ordem das poses: as da vistoria de adesao e os itens da revistoria. */
export function useCatalogoPoses() {
  const supabase = createClient();
  return useQuery<CatalogoPoses>({
    queryKey: ['vistoria', 'catalogo-poses'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const [poses, itens] = await Promise.all([
        supabase.from('vistoria_fotos_modelo').select('codigo, nome, ordem'),
        supabase.from('revistoria_itens').select('codigo, nome, ordem'),
      ]);
      const nomes: Record<string, string> = {};
      const ordem: Record<string, number> = {};
      for (const p of poses.data ?? []) { nomes[p.codigo] = p.nome; ordem[p.codigo] = p.ordem; }
      for (const i of itens.data ?? []) { nomes[i.codigo] = i.nome; ordem[i.codigo] = 100 + i.ordem; }
      return { nomes, ordem };
    },
  });
}
