'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Phone, Car, ChevronRight } from 'lucide-react';
import { useLeads } from '@/hooks/use-vendas';
import { ESTEIRA, STATUS_LEAD } from '@/lib/crm';
import { formatCurrency } from '@/lib/utils';
import type { StatusLead } from '@/lib/database.types';

type Filtro = StatusLead | 'TODOS';

export default function VendasPage() {
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const { data: leads, isLoading } = useLeads(filtro);

  const chips: Filtro[] = useMemo(() => ['TODOS', ...ESTEIRA, 'PERDIDO'], []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">Vendas / CRM</h1>
          <p className="text-sm text-slate-500">Leads, cotacoes e esteira de aprovacao.</p>
        </div>
        <Link
          href="/vendas/novo"
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm"
        >
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Novo lead</span>
        </Link>
      </div>

      {/* Filtro por status (rolagem horizontal no mobile) */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {chips.map((c) => {
          const label = c === 'TODOS' ? 'Todos' : STATUS_LEAD[c].curto;
          const active = filtro === c;
          return (
            <button
              key={c}
              onClick={() => setFiltro(c)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Lista de leads */}
      {isLoading ? (
        <p className="py-10 text-center text-sm text-slate-400">Carregando...</p>
      ) : (leads ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center">
          <p className="text-sm text-slate-400">Nenhum lead aqui.</p>
          <Link href="/vendas/novo" className="mt-2 inline-block text-sm font-medium text-brand-600">
            + Criar o primeiro
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {(leads ?? []).map((l) => {
            const st = STATUS_LEAD[l.status];
            return (
              <li key={l.id}>
                <Link
                  href={`/vendas/${l.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 active:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-slate-900">{l.nome}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cor}`}>{st.curto}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {l.celular}</span>
                      {(l.marca || l.modelo) && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <Car className="h-3 w-3" /> {[l.marca, l.modelo].filter(Boolean).join(' ')}
                        </span>
                      )}
                      {l.valor_fipe != null && <span>FIPE {formatCurrency(l.valor_fipe)}</span>}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
