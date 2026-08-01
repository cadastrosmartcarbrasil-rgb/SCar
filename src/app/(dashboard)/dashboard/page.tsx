import { DashboardKpis } from '@/components/dashboard/kpi-cards';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Visao Geral</h1>
      <DashboardKpis />
    </div>
  );
}
