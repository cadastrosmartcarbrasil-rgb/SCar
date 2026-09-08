'use client';

import { useState } from 'react';
import { LayoutDashboard, LifeBuoy } from 'lucide-react';
import { DashboardKpis } from '@/components/dashboard/kpi-cards';
import { AssistenciaPainel } from '@/components/dashboard/assistencia-24h';

type Aba = 'geral' | 'assistencia';

const ABAS: { id: Aba; label: string; icon: React.ElementType; descricao: string }[] = [
  { id: 'geral', label: 'Visao Geral', icon: LayoutDashboard, descricao: 'Indicadores da operacao em tempo real.' },
  {
    id: 'assistencia',
    label: 'Assistencia 24h',
    icon: LifeBuoy,
    descricao: 'Consumo, custo e incidencia geografica da maior saida de caixa da protecao veicular.',
  },
];

export default function DashboardPage() {
  const [aba, setAba] = useState<Aba>('geral');
  const atual = ABAS.find((a) => a.id === aba)!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Painel</h1>
        <p className="mt-0.5 text-sm text-slate-500">{atual.descricao}</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {ABAS.map((a) => {
          const Icon = a.icon;
          const ativo = aba === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setAba(a.id)}
              aria-current={ativo ? 'page' : undefined}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
                ativo ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="h-4 w-4" /> {a.label}
            </button>
          );
        })}
      </div>

      {aba === 'geral' ? <DashboardKpis /> : <AssistenciaPainel />}
    </div>
  );
}
