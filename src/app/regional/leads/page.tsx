'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Link2, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { FiltroPeriodo, Vazio, periodoPreset, type Periodo } from '@/components/financeiro/ui-financeiro';
import { useLeadsRegional } from '@/hooks/use-regional';
import { formatDate } from '@/lib/utils';

const COR_STATUS: Record<string, string> = {
  NOVO: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  COTACAO_CRIADA: 'bg-sky-50 text-sky-700 ring-sky-200',
  PROPOSTA_ENVIADA: 'bg-violet-50 text-violet-700 ring-violet-200',
  EM_NEGOCIACAO: 'bg-amber-50 text-amber-700 ring-amber-200',
  EM_AUDITORIA: 'bg-orange-50 text-orange-700 ring-orange-200',
  ATIVO: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  PERDIDO: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export default function LeadsRegionalPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoPreset('mes'));
  const [somenteHotlink, setSomenteHotlink] = useState(false);
  const { data: leads, isLoading } = useLeadsRegional({ regionalId: null, ...periodo, somenteHotlink });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Leads da unidade</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Tudo que a sua equipe captou — inclusive o que entrou sozinho pelos hotlinks.
        </p>
      </header>

      <FiltroPeriodo periodo={periodo} onChange={setPeriodo}>
        <label className="flex items-center gap-2 pb-1.5 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={somenteHotlink}
            onChange={(e) => setSomenteHotlink(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-cyan-500"
          />
          Somente os que vieram por hotlink
        </label>
      </FiltroPeriodo>

      <Card>
        <CardContent className="overflow-x-auto pt-5">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-slate-400">Carregando...</p>
          ) : (leads ?? []).length === 0 ? (
            <Vazio
              icon={Zap}
              titulo={somenteHotlink ? 'Nenhum lead por hotlink no periodo' : 'Nenhum lead no periodo'}
              descricao="Distribua os hotlinks da equipe: cada cotacao aberta pelo link entra aqui ja vinculada ao vendedor."
            />
          ) : (
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2.5 font-semibold">Lead</th>
                  <th className="py-2.5 font-semibold">Vendedor</th>
                  <th className="py-2.5 font-semibold">Origem</th>
                  <th className="py-2.5 font-semibold">Entrada</th>
                  <th className="py-2.5 font-semibold">Situacao</th>
                  <th className="py-2.5 text-right font-semibold">Abrir</th>
                </tr>
              </thead>
              <tbody>
                {(leads ?? []).map((l) => (
                  <tr key={l.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="py-2.5">
                      <span className="block font-medium text-slate-800">{l.nome}</span>
                      <span className="block text-[11px] text-slate-400">
                        {l.celular}{l.placa && ` · ${l.placa}`}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-600">{l.vendedor_nome ?? <span className="text-slate-300">—</span>}</td>
                    <td className="py-2.5">
                      {l.origem_hotlink ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-700 ring-1 ring-inset ring-cyan-200">
                          <Link2 className="h-3 w-3" /> {l.origem_hotlink}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">cadastro interno</span>
                      )}
                    </td>
                    <td className="tnum py-2.5 text-slate-600">{formatDate(l.created_at)}</td>
                    <td className="py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${COR_STATUS[l.status] ?? 'bg-slate-100 text-slate-500 ring-slate-200'}`}>
                        {l.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <Link
                        href={`/vendas/${l.id}`}
                        className="inline-grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100"
                        title="Abrir no CRM"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
