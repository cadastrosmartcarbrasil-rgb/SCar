import { DreReport } from '@/components/financeiro/dre-report';

export default function FinanceiroPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Financeiro / DRE</h1>
      <DreReport />
    </div>
  );
}
