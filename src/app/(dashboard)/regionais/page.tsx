import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Building2 } from 'lucide-react';
import { PainelRegionais } from '@/components/regionais/painel-regionais';

export const metadata: Metadata = { title: 'Regionais · Dashboard' };

/**
 * Dashboard executivo das REGIONAIS (0078).
 *
 * Mora no sistema da matriz de proposito: e uma leitura CONSOLIDADA de todas
 * as unidades, e o portal `/regional` e a operacao de UMA franquia por vez.
 * Quem opera uma unidade encontra aqui so a propria linha — a trava e do banco
 * (`escopo_regional`), nao da tela.
 */
export default function RegionaisPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Regionais</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Carteira, inadimplencia, sinistros e resultado das unidades — consolidado e por regional.
          </p>
        </div>
        <Link
          href="/regional"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-cyan-400 hover:text-cyan-700"
        >
          <Building2 className="h-4 w-4" /> Acessar uma regional <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <PainelRegionais />
    </div>
  );
}
