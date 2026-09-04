'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Satellite, CircleAlert, BarChart3, Settings2 } from 'lucide-react';
import { PainelRastreadores } from '@/components/rastreadores/painel-rastreadores';
import { DivergenciasRastreadores } from '@/components/rastreadores/divergencias-rastreadores';
import { RelatoriosRastreadores } from '@/components/rastreadores/relatorios-rastreadores';

type Aba = 'parque' | 'divergencias' | 'relatorios';

export default function RastreadoresPage() {
  const [aba, setAba] = useState<Aba>('parque');
  const abas: { id: Aba; label: string; icon: React.ElementType }[] = [
    { id: 'parque', label: 'Parque de equipamentos', icon: Satellite },
    { id: 'divergencias', label: 'Divergencias', icon: CircleAlert },
    { id: 'relatorios', label: 'Relatorios', icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Rastreadores</h1>
          <p className="text-sm text-slate-500">
            O parque de equipamentos por IMEI: estoque, instalacao no veiculo, recuperacao e o
            cruzamento com o cadastro da frota.
          </p>
        </div>
        <Link href="/configuracoes/rastreamento"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-superficie px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Settings2 className="h-4 w-4" /> Rastreadoras
        </Link>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {abas.map((a) => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
              aba === a.id ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <a.icon className="h-4 w-4" /> {a.label}
          </button>
        ))}
      </div>

      {aba === 'parque' && <PainelRastreadores />}
      {aba === 'divergencias' && <DivergenciasRastreadores />}
      {aba === 'relatorios' && <RelatoriosRastreadores />}
    </div>
  );
}
