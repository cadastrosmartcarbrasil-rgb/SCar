'use client';

import { Info } from 'lucide-react';
import { ContasFinanceiro } from '@/components/financeiro/contas-financeiro';
import { useMinhaRegional } from '@/hooks/use-regional';

/**
 * Contas a pagar/receber da propria unidade.
 * Reusa a tela do financeiro — o isolamento nao e visual, e do banco: a RLS
 * `pode_regional(regional_id)` so devolve os titulos desta franquia, e os
 * lancamentos da matriz (regional nula) nunca aparecem para um gestor.
 */
export default function FinanceiroRegionalPage() {
  const { data } = useMinhaRegional();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Financeiro da unidade</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Contas a pagar e a receber da sua franquia.
        </p>
      </header>

      <p className="flex items-start gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-cyan-900">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" />
        Aqui aparecem <b>somente os titulos desta unidade</b>. O financeiro da matriz nao se mistura —
        a separacao e feita no banco, nao apenas na tela. Ao lancar, o titulo ja nasce vinculado a
        sua franquia.
      </p>

      <ContasFinanceiro regionalFixa={data?.perfil?.regional_id ?? null} />
    </div>
  );
}
