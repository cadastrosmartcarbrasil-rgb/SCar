'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDre, useDreResumo } from '@/hooks/use-dre';
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

  const filtro = { inicio, fim, regionalId };
  const { data: linhas, isLoading } = useDre(filtro);
  const { data: resumo } = useDreResumo(filtro);

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
        </CardContent>
      </Card>

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
