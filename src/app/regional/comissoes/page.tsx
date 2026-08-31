'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import {
  FiltroPeriodo, Indicador, Vazio, baixarCsv, periodoPreset, type Periodo,
} from '@/components/financeiro/ui-financeiro';
import { useComissoesRegional } from '@/hooks/use-regional';
import { somarMoeda } from '@/lib/money';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function ComissoesRegionalPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoPreset('mes'));
  const [status, setStatus] = useState('');
  const { data: comissoes, isLoading } = useComissoesRegional({ regionalId: null, ...periodo, status });

  const totais = useMemo(() => {
    const lista = comissoes ?? [];
    return {
      total: somarMoeda(...lista.map((c) => Number(c.valor_comissao))),
      pendente: somarMoeda(...lista.filter((c) => c.status_pagamento === 'pendente').map((c) => Number(c.valor_comissao))),
      adesao: somarMoeda(...lista.filter((c) => c.is_adesao).map((c) => Number(c.valor_comissao))),
    };
  }, [comissoes]);

  function exportar() {
    baixarCsv(`comissoes-${periodo.inicio}-a-${periodo.fim}.csv`, [
      ['Data', 'Vendedor', 'Placa', 'Tipo', 'Valor', 'Situacao'],
      ...(comissoes ?? []).map((c) => [
        c.created_at.slice(0, 10), c.vendedor_nome, c.placa ?? '',
        c.is_adesao ? 'Adesao' : 'Recorrente', Number(c.valor_comissao), c.status_pagamento,
      ]),
    ]);
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Comissoes</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          O que a unidade deve aos vendedores e o que ja foi repassado.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador titulo="Comissao no periodo" valor={totais.total} icon={BarChart3} tom="neutro"
          detalhe={`${(comissoes ?? []).length} lancamento(s)`} />
        <Indicador titulo="A repassar" valor={totais.pendente} icon={BarChart3} tom="alerta"
          detalhe="Pendente de pagamento ao vendedor" />
        <Indicador titulo="De adesao" valor={totais.adesao} icon={BarChart3} tom="destaque"
          detalhe="Primeira mensalidade da venda" />
      </div>

      <FiltroPeriodo periodo={periodo} onChange={setPeriodo}>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Situacao</span>
          <Select className="mt-1 w-40 py-1.5" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
          </Select>
        </label>
        <Button variant="secondary" className="ml-auto" onClick={exportar} disabled={(comissoes ?? []).length === 0}>
          <Download className="h-4 w-4" /> Exportar
        </Button>
      </FiltroPeriodo>

      <Card>
        <CardContent className="overflow-x-auto pt-5">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-slate-400">Carregando...</p>
          ) : (comissoes ?? []).length === 0 ? (
            <Vazio icon={BarChart3} titulo="Nenhuma comissao no periodo"
              descricao="As comissoes aparecem aqui quando uma venda da equipe entra na base." />
          ) : (
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2.5 font-semibold">Data</th>
                  <th className="py-2.5 font-semibold">Vendedor</th>
                  <th className="py-2.5 font-semibold">Veiculo</th>
                  <th className="py-2.5 font-semibold">Tipo</th>
                  <th className="py-2.5 text-right font-semibold">Valor</th>
                  <th className="py-2.5 font-semibold">Situacao</th>
                </tr>
              </thead>
              <tbody>
                {(comissoes ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0">
                    <td className="tnum py-2.5 text-slate-600">{formatDate(c.created_at)}</td>
                    <td className="py-2.5 font-medium text-slate-800">{c.vendedor_nome}</td>
                    <td className="py-2.5 font-mono text-xs text-slate-500">{c.placa ?? '—'}</td>
                    <td className="py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        c.is_adesao ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {c.is_adesao ? 'Adesao' : 'Recorrente'}
                      </span>
                    </td>
                    <td className="tnum py-2.5 text-right font-semibold text-slate-800">{formatCurrency(c.valor_comissao)}</td>
                    <td className="py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                        c.status_pagamento === 'pago'
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : 'bg-amber-50 text-amber-700 ring-amber-200'
                      }`}>
                        {c.status_pagamento === 'pago' ? 'Pago' : 'A repassar'}
                      </span>
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
