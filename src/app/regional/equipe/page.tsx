'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Plus, TrendingUp, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FiltroPeriodo, Vazio, periodoPreset, type Periodo } from '@/components/financeiro/ui-financeiro';
import { useDesempenhoEquipe } from '@/hooks/use-regional';
import { formatCurrency } from '@/lib/utils';

const pct = (v: number) => `${(Number(v) * 100).toFixed(2).replace('.00', '').replace('.', ',')}%`;

export default function EquipeRegionalPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoPreset('mes'));
  const { data: equipe, isLoading } = useDesempenhoEquipe({ regionalId: null, ...periodo });

  function copiar(codigo: string, nome: string) {
    const url = `${window.location.origin}/v/${codigo}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success(`Hotlink de ${nome} copiado`),
      () => toast.error(`Copie manualmente: ${url}`),
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Minha Equipe</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Desempenho por vendedor no periodo, com o hotlink de cada um.
          </p>
        </div>
        <Button onClick={() => { window.location.href = '/configuracoes/vendedores'; }}>
          <Plus className="h-4 w-4" /> Cadastrar vendedor
        </Button>
      </header>

      <FiltroPeriodo periodo={periodo} onChange={setPeriodo} />

      <Card>
        <CardContent className="overflow-x-auto pt-5">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-slate-400">Carregando...</p>
          ) : (equipe ?? []).length === 0 ? (
            <Vazio
              icon={Users}
              titulo="Nenhum vendedor na unidade"
              descricao="Cadastre a sua equipe para acompanhar o desempenho e distribuir os hotlinks de venda."
              acao={<Button onClick={() => { window.location.href = '/configuracoes/vendedores'; }}>
                <Plus className="h-4 w-4" /> Cadastrar vendedor
              </Button>}
            />
          ) : (
            <table className="w-full min-w-[840px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2.5 font-semibold">Vendedor</th>
                  <th className="py-2.5 text-right font-semibold">Leads</th>
                  <th className="py-2.5 text-right font-semibold">Convertidos</th>
                  <th className="py-2.5 text-right font-semibold">Conversao</th>
                  <th className="py-2.5 text-right font-semibold">Comissao</th>
                  <th className="py-2.5 text-right font-semibold">A pagar</th>
                  <th className="py-2.5 text-right font-semibold">Hotlink</th>
                </tr>
              </thead>
              <tbody>
                {(equipe ?? []).map((v) => (
                  <tr key={v.vendedor_id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5">
                      <span className="block font-semibold text-slate-800">{v.nome}</span>
                      <span className="block text-[11px] text-slate-400">
                        <span className="font-mono">{v.codigo}</span> · entrada {pct(v.taxa_adesao)} · recorrencia {pct(v.taxa_recorrente)}
                        {!v.ativo && ' · inativo'}
                      </span>
                    </td>
                    <td className="tnum py-2.5 text-right text-slate-700">
                      {v.leads}
                      {v.leads_hotlink > 0 && (
                        <span className="ml-1 text-[11px] text-cyan-600">({v.leads_hotlink} link)</span>
                      )}
                    </td>
                    <td className="tnum py-2.5 text-right font-medium text-slate-800">{v.convertidos}</td>
                    <td className="py-2.5 text-right">
                      <span className={`tnum rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        v.taxa_conversao >= 30 ? 'bg-emerald-50 text-emerald-700'
                        : v.taxa_conversao >= 15 ? 'bg-amber-50 text-amber-700'
                        : 'bg-slate-100 text-slate-500'
                      }`}>
                        {v.taxa_conversao.toFixed(1).replace('.', ',')}%
                      </span>
                    </td>
                    <td className="tnum py-2.5 text-right text-slate-700">{formatCurrency(v.comissao_total)}</td>
                    <td className={`tnum py-2.5 text-right font-semibold ${v.comissao_pendente > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                      {formatCurrency(v.comissao_pendente)}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => copiar(v.codigo, v.nome)}
                        title={`Copiar hotlink de ${v.nome}`}
                        className="inline-grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 text-xs">
                  <td className="py-3 font-semibold text-slate-600">
                    <TrendingUp className="mr-1.5 inline h-3.5 w-3.5 text-slate-400" />
                    {(equipe ?? []).length} vendedor(es)
                  </td>
                  <td className="tnum py-3 text-right">{(equipe ?? []).reduce((s, v) => s + v.leads, 0)}</td>
                  <td className="tnum py-3 text-right">{(equipe ?? []).reduce((s, v) => s + v.convertidos, 0)}</td>
                  <td />
                  <td className="tnum py-3 text-right">{formatCurrency((equipe ?? []).reduce((s, v) => s + Number(v.comissao_total), 0))}</td>
                  <td className="tnum py-3 text-right font-bold text-amber-700">
                    {formatCurrency((equipe ?? []).reduce((s, v) => s + Number(v.comissao_pendente), 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
