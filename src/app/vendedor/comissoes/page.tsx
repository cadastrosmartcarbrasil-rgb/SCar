'use client';

import { useMemo, useState } from 'react';
import { Download, HandCoins, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import {
  FiltroPeriodo, Indicador, Vazio, baixarCsv, periodoPreset, type Periodo,
} from '@/components/financeiro/ui-financeiro';
import { useComissoesDoVendedor } from '@/hooks/use-vendedor';
import { resumoComissoes } from '@/lib/vendedor';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function ComissoesVendedorPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoPreset('mes'));
  const [status, setStatus] = useState('');
  const { data: comissoes, isLoading } = useComissoesDoVendedor({ ...periodo, status });

  const totais = useMemo(() => resumoComissoes(comissoes ?? []), [comissoes]);

  function exportar() {
    baixarCsv(`minhas-comissoes-${periodo.inicio}-a-${periodo.fim}.csv`, [
      ['Data', 'Placa', 'Associado', 'Tipo', 'Valor', 'Situacao'],
      ...(comissoes ?? []).map((c) => [
        c.created_at.slice(0, 10), c.placa ?? '', c.associado ?? '',
        c.is_adesao ? 'Adesao' : 'Recorrente', Number(c.valor_comissao), c.status_pagamento,
      ]),
    ]);
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Minhas comissoes</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          O que voce tem a receber e o que ja foi pago.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador titulo="A receber" valor={totais.pendente} icon={HandCoins} tom="alerta"
          detalhe="Ainda nao repassado pela franquia" carregando={isLoading} />
        <Indicador titulo="Recebido no periodo" valor={totais.pago} icon={Wallet} tom="receita"
          detalhe="Ja pago a voce" carregando={isLoading} />
        <Indicador titulo="Total no periodo" valor={totais.total} icon={HandCoins} tom="neutro"
          detalhe={`${formatCurrency(totais.adesao)} de adesao · ${formatCurrency(totais.recorrente)} recorrente`}
          carregando={isLoading} />
      </div>

      <FiltroPeriodo periodo={periodo} onChange={setPeriodo}>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-40">
          <option value="">Todas</option>
          <option value="pendente">A receber</option>
          <option value="pago">Pagas</option>
        </Select>
        <Button variant="secondary" onClick={exportar} disabled={(comissoes ?? []).length === 0}>
          <Download className="mr-1.5 h-4 w-4" /> Exportar
        </Button>
      </FiltroPeriodo>

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-slate-400">Carregando…</p>
          ) : (comissoes ?? []).length === 0 ? (
            <Vazio
              icon={HandCoins}
              titulo="Nenhuma comissao no periodo"
              descricao="A comissao aparece aqui quando a sua venda entra na base e o titulo e liquidado."
            />
          ) : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="py-2.5 font-semibold">Data</th>
                    <th className="py-2.5 font-semibold">Associado</th>
                    <th className="py-2.5 font-semibold">Placa</th>
                    <th className="py-2.5 font-semibold">Tipo</th>
                    <th className="py-2.5 text-right font-semibold">Valor</th>
                    <th className="py-2.5 font-semibold">Situacao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(comissoes ?? []).map((c) => (
                    <tr key={c.id}>
                      <td className="tnum py-2.5 text-slate-600">{formatDate(c.created_at)}</td>
                      <td className="py-2.5 font-medium text-slate-800">{c.associado ?? '—'}</td>
                      <td className="py-2.5 font-mono text-xs uppercase text-slate-500">{c.placa ?? '—'}</td>
                      <td className="py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          c.is_adesao ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {c.is_adesao ? 'Adesao' : 'Recorrente'}
                        </span>
                      </td>
                      <td className="tnum py-2.5 text-right font-semibold text-slate-800">
                        {formatCurrency(c.valor_comissao)}
                      </td>
                      <td className="py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                          c.status_pagamento === 'pago'
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : 'bg-amber-50 text-amber-700 ring-amber-200'
                        }`}>
                          {c.status_pagamento === 'pago' ? 'Paga' : 'A receber'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11.5px] leading-relaxed text-slate-500">
        A adesao recebida por voce <b>na hora</b> fica integralmente com voce e nao passa pelo
        financeiro da empresa — por isso ela nao aparece neste extrato. O que esta aqui e o que a
        empresa recebeu (boleto, PIX ou cartao) e vai repassar a voce.
      </p>
    </div>
  );
}
