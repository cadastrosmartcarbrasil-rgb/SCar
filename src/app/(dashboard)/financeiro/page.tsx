'use client';

import { useState } from 'react';
import { Wallet, BarChart3, Receipt } from 'lucide-react';
import { DreReport } from '@/components/financeiro/dre-report';
import { ContasFinanceiro } from '@/components/financeiro/contas-financeiro';
import { Cobrancas } from '@/components/financeiro/cobrancas';

type Aba = 'cobrancas' | 'contas' | 'dre';

export default function FinanceiroPage() {
  const [aba, setAba] = useState<Aba>('cobrancas');
  const abas: { id: Aba; label: string; icon: React.ElementType }[] = [
    { id: 'cobrancas', label: 'Cobrancas (Mensalidades)', icon: Receipt },
    { id: 'contas', label: 'Contas a Pagar / Receber', icon: Wallet },
    { id: 'dre', label: 'DRE', icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Financeiro</h1>
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
              aba === a.id ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <a.icon className="h-4 w-4" />
            {a.label}
          </button>
        ))}
      </div>
      {aba === 'cobrancas' && <Cobrancas />}
      {aba === 'contas' && <ContasFinanceiro />}
      {aba === 'dre' && <DreReport />}
    </div>
  );
}
