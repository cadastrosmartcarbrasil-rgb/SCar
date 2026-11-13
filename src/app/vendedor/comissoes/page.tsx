'use client';

import { Info } from 'lucide-react';
import { RelatorioConsultores } from '@/components/comissoes/relatorio-consultores';

export default function ComissoesVendedorPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Minhas comissões</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          A comissão de cada boleto recebido dos seus associados, pelo dia em que o pagamento creditou no banco.
        </p>
      </header>

      <RelatorioConsultores matriz={false} regionais={[]} vendedor />

      <p className="flex items-start gap-1.5 rounded-xl border border-slate-200 bg-superficie px-3 py-2.5 text-xs leading-relaxed text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Aqui está só a comissão recorrente. A adesão é tratada à parte, em boleto avulso próprio, e não se mistura
        com a recorrência.
      </p>
    </div>
  );
}
