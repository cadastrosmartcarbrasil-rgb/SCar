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

type Tom = 'cyan' | 'amber' | 'green' | 'rose';
const TOM: Record<Tom, string> = {
  cyan: 'bg-cyan-50 text-cyan-600',
  amber: 'bg-amber-50 text-amber-600',
  green: 'bg-emerald-50 text-emerald-600',
  rose: 'bg-rose-50 text-rose-600',
};

function KpiTile({
  titulo,
  valor,
  icon: Icon,
  tom,
}: {
  titulo: string;
  valor: string;
  icon: React.ElementType;
  tom: Tom;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(20,33,61,0.04),0_10px_26px_-16px_rgba(20,33,61,0.18)] transition hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-[10px] ${TOM[tom]}`}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
      </div>
      <p className="tnum mt-3 text-[28px] font-bold leading-none text-slate-900">{valor}</p>
    </div>
  );
}

// Tacometro (semicirculo) da inadimplencia — alimentado por dado real.
function GaugeInadimplencia({ fracao }: { fracao: number | null | undefined }) {
  const pct = Math.max(0, Math.min(20, (fracao ?? 0) * 100));
  const ang = (180 - (pct / 20) * 180) * (Math.PI / 180);
  const tipX = 110 + 64 * Math.cos(ang);
  const tipY = 110 - 64 * Math.sin(ang);
  const cor = pct < 8 ? 'text-emerald-600' : pct < 12 ? 'text-amber-600' : 'text-rose-600';
  return (
    <div className="flex flex-col items-center text-center">
      <svg viewBox="0 0 220 150" className="w-[220px] max-w-full" role="img" aria-label={`Inadimplencia em ${formatPercent(fracao)}`}>
        <path d="M20 110 A90 90 0 0 1 82.2 24.4" fill="none" stroke="#12A150" strokeWidth="16" strokeLinecap="round" />
        <path d="M84 22.6 A90 90 0 0 1 136 22.6" fill="none" stroke="#C08600" strokeWidth="16" />
        <path d="M137.8 24.4 A90 90 0 0 1 200 110" fill="none" stroke="#E5484D" strokeWidth="16" strokeLinecap="round" />
        <line x1="110" y1="110" x2={tipX} y2={tipY} stroke="#1E2B4D" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="110" cy="110" r="7" fill="#1E2B4D" />
        <circle cx="110" cy="110" r="3" fill="#fff" />
      </svg>
      <p className={`tnum -mt-3 text-3xl font-extrabold ${cor}`}>{formatPercent(fracao)}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span><span className="text-emerald-500">●</span> Saudavel <b className="text-slate-600">&lt;8%</b></span>
        <span><span className="text-amber-500">●</span> Alerta <b className="text-slate-600">8–12%</b></span>
        <span><span className="text-rose-500">●</span> Critico <b className="text-slate-600">&gt;12%</b></span>
      </div>
    </div>
  );
}

// Visao Geral: KPIs (instrumentos) + grafico previsto x recebido + tacometro.
export function DashboardKpis() {
  const { data: kpis, isLoading } = useDashboardKpis();
  const { data: serie } = useReceitaSerie();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile titulo="Veiculos Ativos" valor={isLoading ? '...' : String(kpis?.veiculosAtivos ?? 0)} icon={Car} tom="cyan" />
        <KpiTile titulo="Sinistros em Aberto" valor={isLoading ? '...' : String(kpis?.sinistrosAbertos ?? 0)} icon={AlertTriangle} tom="amber" />
        <KpiTile titulo="Receita Recorrente (MRR)" valor={isLoading ? '...' : formatCurrency(kpis?.mrr)} icon={TrendingUp} tom="green" />
        <KpiTile titulo="Taxa de Inadimplencia" valor={isLoading ? '...' : formatPercent(kpis?.taxaInadimplencia)} icon={PercentDiamond} tom="rose" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.85fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Receita: Previsto x Recebido (6 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie ?? []} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EDF1F7" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v: number) => formatCurrency(v)}
                    contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', boxShadow: '0 8px 24px -12px rgba(20,33,61,.25)', fontSize: 12 }}
                    cursor={{ fill: 'rgba(30,43,77,0.04)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                  <Bar dataKey="previsto" name="Previsto" fill="#54B2E0" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="recebido" name="Recebido" fill="#1E2B4D" radius={[4, 4, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saude da Carteira</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center pt-4">
            <GaugeInadimplencia fracao={kpis?.taxaInadimplencia} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
