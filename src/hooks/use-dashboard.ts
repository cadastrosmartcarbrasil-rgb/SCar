'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { monthRange } from '@/lib/utils';

export interface DashboardKpis {
  veiculosAtivos: number;
  sinistrosAbertos: number;
  mrr: number;               // receita recorrente mensal (titulos do mes)
  taxaInadimplencia: number; // fracao 0..1
}

// KPIs do dashboard. Todas as contagens respeitam o RLS (escopo por regional).
export function useDashboardKpis() {
  const supabase = createClient();

  return useQuery<DashboardKpis>({
    queryKey: ['dashboard', 'kpis'],
    queryFn: async () => {
      const { inicio, fim } = monthRange();

      const [veiculos, sinistros, titulosMes, titulosVencidos] = await Promise.all([
        supabase.from('veiculos').select('id', { count: 'exact', head: true }).eq('status', 'ativo'),
        supabase
          .from('eventos_sinistro')
          .select('id', { count: 'exact', head: true })
          .not('status', 'in', '(CONCLUIDO,NEGADO)'),
        supabase
          .from('titulos_financeiros')
          .select('valor')
          .gte('data_vencimento', inicio)
          .lte('data_vencimento', fim),
        supabase
          .from('titulos_financeiros')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'vencido'),
      ]);

      const mrr = (titulosMes.data ?? []).reduce((acc, t) => acc + Number(t.valor), 0);
      const totalMes = titulosMes.data?.length ?? 0;
      const vencidos = titulosVencidos.count ?? 0;
      const taxaInadimplencia = totalMes > 0 ? vencidos / totalMes : 0;

      return {
        veiculosAtivos: veiculos.count ?? 0,
        sinistrosAbertos: sinistros.count ?? 0,
        mrr,
        taxaInadimplencia,
      };
    },
  });
}

// Serie mensal de receita (ultimos 6 meses) para o grafico financeiro.
export function useReceitaSerie() {
  const supabase = createClient();
  return useQuery({
    queryKey: ['dashboard', 'receita-serie'],
    queryFn: async () => {
      const inicio = new Date();
      inicio.setMonth(inicio.getMonth() - 5, 1);
      const { data, error } = await supabase
        .from('titulos_financeiros')
        .select('valor, valor_pago, status, data_vencimento')
        .gte('data_vencimento', inicio.toISOString().slice(0, 10));
      if (error) throw error;

      const buckets = new Map<string, { mes: string; previsto: number; recebido: number }>();
      for (const t of data ?? []) {
        const mes = String(t.data_vencimento).slice(0, 7);
        const b = buckets.get(mes) ?? { mes, previsto: 0, recebido: 0 };
        b.previsto += Number(t.valor);
        if (t.status === 'pago') b.recebido += Number(t.valor_pago ?? t.valor);
        buckets.set(mes, b);
      }
      return [...buckets.values()].sort((a, b) => a.mes.localeCompare(b.mes));
    },
  });
}
