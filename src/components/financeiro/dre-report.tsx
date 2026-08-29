'use client';

import { useMemo, useState } from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { BarChart3, Download, Printer, Target, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { useDre, useDreComparativo, useDreMensal, useDreResumo } from '@/hooks/use-dre';
import { useCentrosCusto } from '@/hooks/use-financeiro';
import { calcularIndicadores, estruturarDre, periodoAnterior, variacaoPercentual } from '@/lib/financeiro';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { RegimeDre } from '@/lib/database.types';
import { FiltroPeriodo, Indicador, Vazio, baixarCsv, periodoPreset, type Periodo } from './ui-financeiro';

const REGIMES: { valor: RegimeDre; rotulo: string; ajuda: string }[] = [
  { valor: 'CAIXA', rotulo: 'Regime de Caixa', ajuda: 'Reconhece receitas e despesas na data em que o dinheiro entrou ou saiu.' },
  { valor: 'COMPETENCIA', rotulo: 'Regime de Competencia', ajuda: 'Reconhece no mes do fato gerador, mesmo que o pagamento ocorra depois.' },
];

const MES_CURTO = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' });
const rotuloMes = (iso: string) => MES_CURTO.format(new Date(`${iso}T00:00:00`)).replace('.', '');
const compacto = (v: number) =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);

/**
 * Demonstracao do Resultado do Exercicio.
 * Traz regime (caixa x competencia), centro de custo, analise vertical,
 * comparativo com o periodo anterior e evolucao mensal.
 */
export function DreReport({ regionalId }: { regionalId?: string | null }) {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoPreset('mes'));
  const [regime, setRegime] = useState<RegimeDre>('CAIXA');
  const [centroCustoId, setCentroCustoId] = useState('');
  const [comparar, setComparar] = useState(true);

  const filtro = { ...periodo, regionalId, regime, centroCustoId: centroCustoId || null };
  const { data: linhas, isLoading } = useDre(filtro);
  const { data: anteriores } = useDreComparativo(filtro, comparar);
  const { data: resumo } = useDreResumo(filtro);
  const { data: serie } = useDreMensal({ ...filtro, ...periodoLargo(periodo) });
  const { data: centros } = useCentrosCusto();

  const grupos = useMemo(
    () => estruturarDre(linhas ?? [], comparar ? anteriores ?? [] : undefined),
    [linhas, anteriores, comparar],
  );
  const ind = useMemo(() => calcularIndicadores(resumo ?? {}), [resumo]);
  const anterior = periodoAnterior(periodo.inicio, periodo.fim);

  const grafico = (serie ?? []).map((m) => ({
    mes: rotuloMes(m.mes),
    Receita: Number(m.receita),
    Custos: Math.abs(Number(m.custo_variavel)),
    Despesas: Math.abs(Number(m.despesa_fixa)),
    Resultado: Number(m.resultado_liquido),
  }));

  function exportar() {
    baixarCsv(`dre-${regime.toLowerCase()}-${periodo.inicio}-a-${periodo.fim}.csv`, [
      [`DRE ${regime === 'CAIXA' ? 'Regime de Caixa' : 'Regime de Competencia'}`],
      [`Periodo: ${formatDate(periodo.inicio)} a ${formatDate(periodo.fim)}`],
      [],
      ['Codigo', 'Categoria', 'Grupo', 'Valor', 'AV %'],
      ...grupos.flatMap((g) => [
        ['', g.rotulo, g.grupo, g.subtotal, g.analiseVertical],
        ...g.linhas.map((l) => [l.categoria_codigo, l.categoria_nome, g.grupo, l.total, l.analiseVertical]),
      ]),
      [],
      ['Receita bruta', ind.receitaBruta],
      ['Custos variaveis', -ind.custoVariavel],
      ['Margem de contribuicao', ind.margemContribuicao],
      ['Despesas fixas', -ind.despesaFixa],
      ['Resultado liquido', ind.resultadoLiquido],
      ['Margem liquida %', ind.margemLiquidaPercentual],
      ['Ponto de equilibrio', ind.pontoEquilibrio],
    ]);
  }

  const varResultado = comparar && anteriores
    ? variacaoPercentual(ind.resultadoLiquido, calcularIndicadores(agregar(anteriores)).resultadoLiquido)
    : null;

  return (
    <div className="space-y-5">
      <FiltroPeriodo periodo={periodo} onChange={setPeriodo}>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Regime contabil</span>
          <Select className="mt-1 w-52 py-1.5" value={regime} onChange={(e) => setRegime(e.target.value as RegimeDre)}>
            {REGIMES.map((r) => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
          </Select>
        </label>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Centro de custo</span>
          <Select className="mt-1 w-48 py-1.5" value={centroCustoId} onChange={(e) => setCentroCustoId(e.target.value)}>
            <option value="">Consolidado</option>
            {(centros ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={comparar}
            onChange={(e) => setComparar(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-cyan-500"
          />
          Comparar com periodo anterior
        </label>
        <div className="ml-auto flex gap-2 print:hidden">
          <Button variant="secondary" onClick={exportar}><Download className="h-4 w-4" /> CSV</Button>
          <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir</Button>
        </div>
      </FiltroPeriodo>

      <p className="text-xs text-slate-500">
        {REGIMES.find((r) => r.valor === regime)?.ajuda}
        {comparar && ` Comparativo: ${formatDate(anterior.inicio)} a ${formatDate(anterior.fim)}.`}
      </p>

      {/* Indicadores gerenciais */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Receita bruta" valor={ind.receitaBruta} icon={TrendingUp} tom="receita"
          detalhe="Total reconhecido no periodo" />
        <Indicador titulo="Margem de contribuicao" valor={ind.margemContribuicao} icon={Wallet} tom="destaque"
          detalhe={`${ind.margemContribuicaoPercentual.toFixed(1)}% da receita — sobra apos os custos variaveis`} />
        <Indicador titulo="Despesas fixas" valor={ind.despesaFixa} icon={TrendingDown} tom="despesa"
          detalhe={`Custos variaveis no periodo: ${formatCurrency(ind.custoVariavel)}`} />
        <Indicador
          titulo="Resultado liquido" valor={ind.resultadoLiquido} icon={Target}
          tom={ind.resultadoLiquido >= 0 ? 'receita' : 'despesa'}
          detalhe={`Margem de ${ind.margemLiquidaPercentual.toFixed(1)}%${
            varResultado != null ? ` · ${varResultado >= 0 ? '+' : ''}${varResultado.toFixed(1)}% vs periodo anterior` : ''
          }`}
        />
      </div>

      {/* Evolucao mensal */}
      <Card className="print:hidden">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Evolucao do resultado (12 meses)</CardTitle>
          <span className="text-[11px] text-slate-400">
            Ponto de equilibrio: {formatCurrency(ind.pontoEquilibrio)} de receita/periodo
          </span>
        </CardHeader>
        <CardContent>
          {grafico.length === 0 ? (
            <Vazio icon={BarChart3} titulo="Sem movimento no intervalo" descricao="Assim que houver receitas ou despesas classificadas, a evolucao aparece aqui." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={grafico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8edf5" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={compacto} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={48} />
                <Tooltip
                  formatter={(v: number | string) => formatCurrency(Number(v))}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Receita" fill="#22A7E4" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Bar dataKey="Custos" fill="#F5A524" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Bar dataKey="Despesas" fill="#E5484D" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Line type="monotone" dataKey="Resultado" stroke="#1E2B4D" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Demonstrativo estruturado */}
      <Card>
        <CardHeader>
          <CardTitle>Demonstracao do Resultado do Exercicio</CardTitle>
          <p className="text-xs text-slate-500">
            {formatDate(periodo.inicio)} a {formatDate(periodo.fim)} ·{' '}
            {regime === 'CAIXA' ? 'regime de caixa' : 'regime de competencia'}
            {centroCustoId && ` · ${(centros ?? []).find((c) => c.id === centroCustoId)?.nome ?? ''}`}
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-5 animate-pulse rounded bg-slate-100" />)}
            </div>
          ) : grupos.length === 0 ? (
            <Vazio
              icon={BarChart3}
              titulo="Nenhum movimento classificado no periodo"
              descricao="Lance contas a pagar/receber com categoria do plano de contas — o DRE le automaticamente as baixas (caixa) e a competencia dos titulos."
            />
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-semibold">Codigo</th>
                  <th className="py-2 font-semibold">Conta</th>
                  <th className="py-2 text-right font-semibold">Valor</th>
                  <th className="py-2 text-right font-semibold">AV %</th>
                  {comparar && <th className="py-2 text-right font-semibold">Periodo anterior</th>}
                  {comparar && <th className="py-2 text-right font-semibold">Var. %</th>}
                </tr>
              </thead>

              {grupos.map((g) => (
                <tbody key={g.grupo}>
                  <tr className="bg-slate-50">
                    <td colSpan={2} className="py-2 pl-1 font-semibold text-slate-700">{g.rotulo}</td>
                    <td className="tnum py-2 text-right font-semibold text-slate-700">{formatCurrency(Math.abs(g.subtotal))}</td>
                    <td className="tnum py-2 text-right text-xs font-semibold text-slate-500">{g.analiseVertical.toFixed(1)}%</td>
                    {comparar && (
                      <td className="tnum py-2 text-right text-xs text-slate-500">
                        {formatCurrency(Math.abs(g.subtotalAnterior ?? 0))}
                      </td>
                    )}
                    {comparar && <td className="py-2 text-right"><Variacao valor={variacaoPercentual(g.subtotal, g.subtotalAnterior ?? 0)} inverso={g.grupo !== 'RECEITA'} /></td>}
                  </tr>
                  {g.linhas.map((l) => (
                    <tr key={l.categoria_codigo} className="border-b border-slate-50 last:border-0">
                      <td className="py-1.5 pl-1 font-mono text-[11px] text-slate-400">{l.categoria_codigo}</td>
                      <td className="py-1.5 pl-3 text-slate-600">{l.categoria_nome}</td>
                      <td className="tnum py-1.5 text-right text-slate-700">{formatCurrency(l.valorAbsoluto)}</td>
                      <td className="tnum py-1.5 text-right text-xs text-slate-400">{l.analiseVertical.toFixed(1)}%</td>
                      {comparar && (
                        <td className="tnum py-1.5 text-right text-xs text-slate-400">
                          {l.totalAnterior == null ? '—' : formatCurrency(Math.abs(l.totalAnterior))}
                        </td>
                      )}
                      {comparar && <td className="py-1.5 text-right"><Variacao valor={l.variacao ?? null} inverso={g.grupo !== 'RECEITA'} /></td>}
                    </tr>
                  ))}
                </tbody>
              ))}

              <tfoot className="text-sm">
                <tr className="border-t border-slate-200">
                  <td colSpan={2} className="py-2 pl-1 font-semibold text-slate-600">(=) Margem de contribuicao</td>
                  <td className="tnum py-2 text-right font-semibold text-slate-800">{formatCurrency(ind.margemContribuicao)}</td>
                  <td className="tnum py-2 text-right text-xs text-slate-500">{ind.margemContribuicaoPercentual.toFixed(1)}%</td>
                  {comparar && <td colSpan={2} />}
                </tr>
                <tr className="border-t-2 border-slate-300">
                  <td colSpan={2} className="py-3 pl-1 font-bold text-slate-900">(=) Resultado liquido do periodo</td>
                  <td className={`tnum py-3 text-right text-base font-bold ${ind.resultadoLiquido >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatCurrency(ind.resultadoLiquido)}
                  </td>
                  <td className="tnum py-3 text-right text-xs font-semibold text-slate-600">{ind.margemLiquidaPercentual.toFixed(1)}%</td>
                  {comparar && <td colSpan={2} className="py-3 text-right"><Variacao valor={varResultado} /></td>}
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] leading-relaxed text-slate-400">
        AV % = analise vertical (participacao da conta sobre a receita bruta do periodo). Contas sem
        categoria do plano de contas aparecem como &quot;nao classificadas&quot; — classifique-as em
        Financeiro › Contas para um DRE fiel. Valores em reais (R$).
      </p>
    </div>
  );
}

/** Janela de 12 meses terminando no mes do filtro (grafico de evolucao). */
function periodoLargo(p: Periodo): Periodo {
  const fim = new Date(`${p.fim}T00:00:00`);
  const inicio = new Date(fim.getFullYear(), fim.getMonth() - 11, 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { inicio: iso(inicio), fim: iso(new Date(fim.getFullYear(), fim.getMonth() + 1, 0)) };
}

function agregar(linhas: { grupo: string; total: number }[]) {
  const soma = (g: string) => linhas.filter((l) => l.grupo === g).reduce((s, l) => s + Number(l.total), 0);
  return { receita_bruta: soma('RECEITA'), custo_variavel: soma('CUSTO_VARIAVEL'), despesa_fixa: soma('DESPESA_FIXA') };
}

/** Seta de variacao. `inverso` = para custos/despesas, subir e ruim. */
function Variacao({ valor, inverso }: { valor: number | null; inverso?: boolean }) {
  if (valor == null) return <span className="text-xs text-slate-300">—</span>;
  const bom = inverso ? valor <= 0 : valor >= 0;
  return (
    <span className={`tnum text-xs font-medium ${bom ? 'text-emerald-600' : 'text-rose-600'}`}>
      {valor >= 0 ? '+' : ''}{valor.toFixed(1)}%
    </span>
  );
}
