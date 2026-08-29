'use client';

import { useState } from 'react';
import { BarChart3, Wallet, Waves } from 'lucide-react';
import { DreReport } from '@/components/financeiro/dre-report';
import { ContasFinanceiro } from '@/components/financeiro/contas-financeiro';
import { FluxoCaixa } from '@/components/financeiro/fluxo-caixa';

type Aba = 'contas' | 'fluxo' | 'dre';

const ABAS: { id: Aba; label: string; descricao: string; icon: React.ElementType }[] = [
  { id: 'contas', label: 'Contas a Pagar / Receber', descricao: 'Carteira, baixas e inadimplencia', icon: Wallet },
  { id: 'fluxo', label: 'Fluxo de Caixa', descricao: 'Previsto x realizado e aging', icon: Waves },
  { id: 'dre', label: 'DRE', descricao: 'Resultado por regime e centro de custo', icon: BarChart3 },
];

export default function FinanceiroPage() {
  const [aba, setAba] = useState<Aba>('contas');
  const atual = ABAS.find((a) => a.id === aba)!;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Financeiro</h1>
        <p className="mt-0.5 text-sm text-slate-500">{atual.descricao}.</p>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200" aria-label="Secoes do financeiro">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            aria-current={aba === a.id ? 'page' : undefined}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
              aba === a.id
                ? 'border-cyan-500 font-semibold text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <a.icon className="h-4 w-4" />
            {a.label}
          </button>
        ))}
      </nav>

      {aba === 'contas' && <ContasFinanceiro />}
      {aba === 'fluxo' && <FluxoCaixa />}
      {aba === 'dre' && <DreReport />}
    </div>
  );
}
