'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDre, useDreResumo, useResumoCentroCusto } from '@/hooks/use-dre';
import { useCentrosCusto } from '@/hooks/use-financeiro';
import { formatCurrency, monthRange } from '@/lib/utils';
import type { TipoCategoriaDre } from '@/lib/database.types';

const GRUPO_LABEL: Record<TipoCategoriaDre, string> = {
  RECEITA: '(+) Receitas',
  CUSTO_VARIAVEL: '(-) Custos Variaveis',
  DESPESA_FIXA: '(-) Despesas Fixas',
};

// Relatorio DRE com filtro por periodo (e regional opcional via prop).
export function DreReport({ regionalId }: { regionalId?: string | null }) {
  const range = monthRange();
  const [inicio, setInicio] = useState(range.inicio);
  const [fim, setFim] = useState(range.fim);
  const [centroCustoId, setCentroCustoId] = useState('');

  const { data: centros } = useCentrosCusto();
  const filtro = { inicio, fim, regionalId, centroCustoId: centroCustoId || null };
  const { data: linhas, isLoading } = useDre(filtro);
  const { data: resumo } = useDreResumo(filtro);
  const { data: porCentro } = useResumoCentroCusto({ inicio, fim, regionalId });

  const grupos: TipoCategoriaDre[] = ['RECEITA', 'CUSTO_VARIAVEL', 'DESPESA_FIXA'];

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-5">
          <div>
            <label className="text-xs text-slate-500">Data inicio</label>
            <input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Data fim</label>
            <input
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Centro de custo</label>
            <select
              value={centroCustoId}
              onChange={(e) => setCentroCustoId(e.target.value)}
              className="mt-1 block rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Todos</option>
              {(centros ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
          {centroCustoId && (
            <p className="text-xs text-slate-500">
              Mostrando apenas o que foi liquidado neste centro de custo.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Receitas x Despesas por centro de custo (isola a Assistencia 24h) */}
      {(porCentro?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle>Receitas x Despesas por centro de custo</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                  <th className="px-2 py-2">Centro de custo</th>
                  <th className="px-2 py-2 text-right">Receitas</th>
                  <th className="px-2 py-2 text-right">Despesas</th>
                  <th className="px-2 py-2 text-right">Resultado</th>
                  <th className="px-2 py-2 text-right">Lancamentos</th>
                </tr>
              </thead>
              <tbody>
                {porCentro!.map((c) => (
                  <tr
                    key={c.centro_custo_id ?? 'sem'}
                    onClick={() => setCentroCustoId(c.centro_custo_id ?? '')}
                    className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 ${
                      centroCustoId && centroCustoId === c.centro_custo_id ? 'bg-cyan-50/60' : ''
                    }`}
                  >
                    <td className="px-2 py-2 font-medium text-slate-700">
                      {c.centro_custo}
                      {c.codigo && <span className="ml-1 text-xs text-slate-400">({c.codigo})</span>}
                    </td>
                    <td className="tnum px-2 py-2 text-right text-emerald-700">{formatCurrency(Number(c.receitas))}</td>
                    <td className="tnum px-2 py-2 text-right text-rose-700">{formatCurrency(Number(c.despesas))}</td>
                    <td className={`tnum px-2 py-2 text-right font-medium ${Number(c.resultado) < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {formatCurrency(Number(c.resultado))}
                    </td>
                    <td className="tnum px-2 py-2 text-right text-slate-500">{c.lancamentos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-400">
              Clique num centro de custo para filtrar o DRE abaixo.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Cards resumo */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <ResumoCard titulo="Receita Bruta" valor={resumo?.receita_bruta} cor="text-emerald-600" />
        <ResumoCard titulo="Custos Variaveis" valor={resumo?.custo_variavel} cor="text-amber-600" />
        <ResumoCard titulo="Despesas Fixas" valor={resumo?.despesa_fixa} cor="text-rose-600" />
        <ResumoCard
          titulo={`Resultado Liquido (${resumo?.margem_percentual ?? 0}%)`}
          valor={resumo?.resultado_liquido}
          cor={
            (resumo?.resultado_liquido ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
          }
        />
      </div>

      {/* Tabela DRE estruturada */}
      <Card>
        <CardHeader>
          <CardTitle>Demonstracao do Resultado (DRE)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Calculando...</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                  <th className="py-2">Codigo</th>
                  <th className="py-2">Categoria</th>
                  <th className="py-2 text-right">Valor</th>
                </tr>
              </thead>
              {grupos.map((grupo) => {
                const doGrupo = (linhas ?? []).filter((l) => l.grupo === grupo);
                if (doGrupo.length === 0) return null;
                const subtotal = doGrupo.reduce((acc, l) => acc + Number(l.total), 0);
                return (
                  <tbody key={grupo}>
                      <tr className="bg-slate-50">
                        <td colSpan={2} className="py-2 font-semibold text-slate-700">
                          {GRUPO_LABEL[grupo]}
                        </td>
                        <td className="py-2 text-right font-semibold text-slate-700">
                          {formatCurrency(subtotal)}
                        </td>
                      </tr>
                      {doGrupo.map((l) => (
                        <tr key={l.categoria_codigo} className="border-b border-slate-50">
                          <td className="py-1.5 font-mono text-xs text-slate-400">
                            {l.categoria_codigo}
                          </td>
                          <td className="py-1.5 text-slate-600">{l.categoria_nome}</td>
                          <td className="py-1.5 text-right text-slate-700">
                            {formatCurrency(l.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  );
                })}
              <tfoot>
                <tr className="border-t-2 border-slate-300">
                  <td colSpan={2} className="py-3 font-bold text-slate-900">
                    Resultado Liquido
                  </td>
                  <td
                    className={`py-3 text-right font-bold ${
                      (resumo?.resultado_liquido ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {formatCurrency(resumo?.resultado_liquido)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ResumoCard({ titulo, valor, cor }: { titulo: string; valor?: number; cor: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-slate-500">{titulo}</p>
        <p className={`mt-1 text-xl font-semibold ${cor}`}>{formatCurrency(valor)}</p>
      </CardContent>
    </Card>
  );
}
