'use client';

import { Car, AlertTriangle, TrendingUp, PercentDiamond } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboardKpis, useReceitaSerie } from '@/hooks/use-dashboard';
import { formatCurrency, formatPercent } from '@/lib/utils';

function KpiCard({
  titulo,
  valor,
  icon: Icon,
  cor,
}: {
  titulo: string;
  valor: string;
  icon: React.ElementType;
  cor: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between pt-5">
        <div>
          <p className="text-sm text-slate-500">{titulo}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{valor}</p>
        </div>
        <div className={`rounded-lg p-3 ${cor}`}>
          <Icon className="h-6 w-6" />
        </div>
      </CardContent>
    </Card>
  );
}

// Visao Geral do Dashboard: KPIs + grafico financeiro (previsto x recebido).
export function DashboardKpis() {
  const { data: kpis, isLoading } = useDashboardKpis();
  const { data: serie } = useReceitaSerie();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          titulo="Veiculos Ativos"
          valor={isLoading ? '...' : String(kpis?.veiculosAtivos ?? 0)}
          icon={Car}
          cor="bg-brand-50 text-brand-600"
        />
        <KpiCard
          titulo="Sinistros em Aberto"
          valor={isLoading ? '...' : String(kpis?.sinistrosAbertos ?? 0)}
          icon={AlertTriangle}
          cor="bg-amber-50 text-amber-600"
        />
        <KpiCard
          titulo="Receita Recorrente (MRR)"
          valor={isLoading ? '...' : formatCurrency(kpis?.mrr)}
          icon={TrendingUp}
          cor="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          titulo="Taxa de Inadimplencia"
          valor={isLoading ? '...' : formatPercent(kpis?.taxaInadimplencia)}
          icon={PercentDiamond}
          cor="bg-rose-50 text-rose-600"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Receita: Previsto x Recebido (6 meses)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Bar dataKey="previsto" name="Previsto" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recebido" name="Recebido" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
