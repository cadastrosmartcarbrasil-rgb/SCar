'use client';

import { useState } from 'react';
import { LayoutDashboard, Receipt, Repeat } from 'lucide-react';
import { DashboardCobranca } from '@/components/cobrancas/dashboard-cobranca';
import { FaturasCompetencia } from '@/components/cobrancas/faturas-competencia';
import { GeracaoLote } from '@/components/cobrancas/geracao-lote';

type Aba = 'visao' | 'faturas' | 'lote';

export default function CobrancaPage() {
  const [aba, setAba] = useState<Aba>('visao');
  const abas: { id: Aba; label: string; icon: React.ElementType }[] = [
    { id: 'visao', label: 'Visao Geral', icon: LayoutDashboard },
    { id: 'faturas', label: 'Faturas por Competencia', icon: Receipt },
    { id: 'lote', label: 'Boletagem em Lote', icon: Repeat },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Cobranca</h1>
        <p className="text-sm text-slate-500">
          Mensalidades, emissao de boletos e acompanhamento da inadimplencia.
        </p>
      </div>

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

      {aba === 'visao' && <DashboardCobranca />}
      {aba === 'faturas' && <FaturasCompetencia />}
      {aba === 'lote' && <GeracaoLote />}
    </div>
  );
}
