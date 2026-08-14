import { DashboardKpis } from '@/components/dashboard/kpi-cards';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Visao Geral</h1>
        <p className="mt-0.5 text-sm text-slate-500">Indicadores da operacao em tempo real.</p>
      </div>
      <DashboardKpis />
    </div>
  );
}
