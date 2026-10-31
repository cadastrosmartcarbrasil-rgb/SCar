'use client';

import { useMemo, useState } from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { BarChart3, Download, Printer, Target, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { useDre, useDreComparativo, useDreMensal } from '@/hooks/use-dre';
import { useCentrosCusto } from '@/hooks/use-financeiro';
import { usePlanoContas } from '@/hooks/use-config';
import { usePode } from '@/hooks/use-permissoes';
import { periodoAnterior, variacaoPercentual } from '@/lib/financeiro';
import { indicadoresDre, montarDreGerencial } from '@/lib/plano-contas';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { RegimeDre } from '@/lib/database.types';
import { FiltroPeriodo, Indicador, Vazio, baixarCsv, periodoPreset, type Periodo } from './ui-financeiro';

const REGIMES: { valor: RegimeDre; rotulo: string; ajuda: string }[] = [
  { valor: 'CAIXA', rotulo: 'Regime de Caixa', ajuda: 'Reconhece receitas e despesas na data em que o dinheiro entrou ou saiu.' },
  { valor: 'COMPETENCIA', rotulo: 'Regime de Competência', ajuda: 'Reconhece no mês do fato gerador, mesmo que o pagamento ocorra depois.' },
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
  const [detalhar, setDetalhar] = useState(true);
  const podeExportar = usePode('financeiro_dre.exportar');

  const filtro = { ...periodo, regionalId, regime, centroCustoId: centroCustoId || null };
  const { data: linhas, isLoading } = useDre(filtro);
  const { data: anteriores } = useDreComparativo(filtro, comparar);
  const { data: serie } = useDreMensal({ ...filtro, ...periodoLargo(periodo) });
  const { data: centros } = useCentrosCusto();
  const { data: plano } = usePlanoContas();

  // A DRE gerencial do plano padrao (0152): receita bruta, deducoes, receita
  // liquida, custos, lucro bruto, despesas operacionais, resultado operacional,
  // resultado financeiro e lucro liquido — a aba "DRE Gerencial Modelo" da planilha.
  const dre = useMemo(
    () => montarDreGerencial(plano ?? [], linhas ?? [], comparar ? anteriores ?? [] : undefined),
    [plano, linhas, anteriores, comparar],
  );
  const ind = useMemo(() => indicadoresDre(dre), [dre]);
  const indAnt = useMemo(
    () => (comparar && anteriores ? indicadoresDre(montarDreGerencial(plano ?? [], anteriores)) : null),
    [plano, anteriores, comparar],
  );
  const anterior = periodoAnterior(periodo.inicio, periodo.fim);
  const visiveis = detalhar ? dre : dre.filter((l) => l.tipo !== 'conta');
  const vazio = (linhas ?? []).length === 0;

  const grafico = (serie ?? []).map((m) => ({
    mes: rotuloMes(m.mes),
    Receita: Number(m.receita),
    Custos: Math.abs(Number(m.custo_variavel)),
    Despesas: Math.abs(Number(m.despesa_fixa)),
    Resultado: Number(m.resultado_liquido),
  }));

  function exportar() {
    baixarCsv(`dre-${regime.toLowerCase()}-${periodo.inicio}-a-${periodo.fim}.csv`, [
      [`DRE Gerencial — ${regime === 'CAIXA' ? 'Regime de Caixa' : 'Regime de Competência'}`],
      [`Período: ${formatDate(periodo.inicio)} a ${formatDate(periodo.fim)}`],
      [],
      ['Estrutura da DRE', 'Conta', 'Valor (R$)', '% sobre Receita Bruta', ...(comparar ? ['Período anterior'] : [])],
      ...dre.map((l) => [
        `${'  '.repeat(l.nivel)}${l.rotulo}`, l.codigo ?? '', l.valor, l.percentual,
        ...(comparar ? [l.anterior ?? ''] : []),
      ]),
    ]);
  }

  const varLucro = indAnt ? variacaoPercentual(ind.lucroLiquido, indAnt.lucroLiquido) : null;

  return (
    <div className="space-y-5">
      <FiltroPeriodo periodo={periodo} onChange={setPeriodo}>
        <label className="block">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-400">Regime contábil</span>
          <Select className="mt-1 w-52 py-1.5" value={regime} onChange={(e) => setRegime(e.target.value as RegimeDre)}>
            {REGIMES.map((r) => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
          </Select>
        </label>
        <label className="block">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-400">Centro de custo</span>
          <Select className="mt-1 w-48 py-1.5" value={centroCustoId} onChange={(e) => setCentroCustoId(e.target.value)}>
            <option value="">Consolidado</option>
            {(centros ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-xs font-medium text-slate-600">
          <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-cyan-500" />
          Comparar com período anterior
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-xs font-medium text-slate-600">
          <input type="checkbox" checked={detalhar} onChange={(e) => setDetalhar(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-cyan-500" />
          Abrir as contas analíticas
        </label>
        <div className="ml-auto flex gap-2 print:hidden">
          {podeExportar && <>
            <Button variant="secondary" onClick={exportar}><Download className="h-4 w-4" /> CSV</Button>
            <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir</Button>
          </>}
        </div>
      </FiltroPeriodo>

      <p className="text-xs text-slate-500">
        {REGIMES.find((r) => r.valor === regime)?.ajuda}
        {comparar && ` Comparativo: ${formatDate(anterior.inicio)} a ${formatDate(anterior.fim)}.`}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Receita operacional bruta" valor={ind.receitaBruta} icon={TrendingUp} tom="receita"
          detalhe={`Receita líquida: ${formatCurrency(ind.receitaLiquida)}`} />
        <Indicador titulo="Lucro bruto operacional" valor={ind.lucroBruto} icon={Wallet} tom="destaque"
          detalhe={`${ind.margemBruta.toFixed(1)}% da receita bruta`} />
        <Indicador titulo="Resultado operacional (EBITDA)" valor={ind.resultadoOperacional} icon={TrendingDown}
          tom={ind.resultadoOperacional >= 0 ? 'receita' : 'despesa'}
          detalhe={`${ind.margemOperacional.toFixed(1)}% da receita bruta`} />
        <Indicador
          titulo="Lucro líquido do exercício" valor={ind.lucroLiquido} icon={Target}
          tom={ind.lucroLiquido >= 0 ? 'receita' : 'despesa'}
          detalhe={`Margem de ${ind.margemLiquida.toFixed(1)}%${
            varLucro != null ? ` · ${varLucro >= 0 ? '+' : ''}${varLucro.toFixed(1)}% vs período anterior` : ''
          }`}
        />
      </div>

      <Card className="print:hidden">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Evolução do resultado (12 meses)</CardTitle>
        </CardHeader>
        <CardContent>
          {grafico.length === 0 ? (
            <Vazio icon={BarChart3} titulo="Sem movimento no intervalo" descricao="Assim que houver receitas ou despesas classificadas, a evolução aparece aqui." />
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
                <Bar dataKey="Receita" fill="#0BACE2" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Bar dataKey="Custos" name="Custos e deduções" fill="#F5A524" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Bar dataKey="Despesas" fill="#E5484D" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Line type="monotone" dataKey="Resultado" stroke="#142445" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Demonstração do Resultado do Exercício (DRE Gerencial)</CardTitle>
          <p className="text-xs text-slate-500">
            {formatDate(periodo.inicio)} a {formatDate(periodo.fim)} ·{' '}
            {regime === 'CAIXA' ? 'regime de caixa' : 'regime de competência'}
            {centroCustoId && ` · ${(centros ?? []).find((c) => c.id === centroCustoId)?.nome ?? ''}`}
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-5 animate-pulse rounded bg-slate-100" />)}
            </div>
          ) : vazio ? (
            <Vazio
              icon={BarChart3}
              titulo="Nenhum movimento classificado no período"
              descricao="Lance contas a pagar/receber numa conta analítica do plano de contas — a DRE lê automaticamente as baixas (caixa) e a competência dos títulos."
            />
          ) : (
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[0.6875rem] uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-semibold">Estrutura da DRE</th>
                  <th className="py-2 font-semibold">Conta</th>
                  <th className="py-2 text-right font-semibold">Valor (R$)</th>
                  <th className="py-2 text-right font-semibold">% s/ receita bruta</th>
                  {comparar && <th className="py-2 text-right font-semibold">Período anterior</th>}
                  {comparar && <th className="py-2 text-right font-semibold">Var. %</th>}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => {
                  const destaque = l.tipo === 'secao' || l.tipo === 'subtotal' || l.tipo === 'resultado';
                  const cls =
                    l.tipo === 'resultado' ? 'border-t-2 border-slate-300 text-base font-bold text-slate-900'
                    : l.tipo === 'subtotal' ? 'border-t border-slate-200 bg-slate-50 font-semibold text-slate-800'
                    : l.tipo === 'secao' ? 'bg-slate-50/70 font-semibold text-slate-700'
                    : l.tipo === 'grupo' ? 'font-medium text-slate-700'
                    : 'text-slate-600';
                  const inverso = l.valor < 0 || ['deducoes', 'custos', 'despesas'].includes(l.chave.split(':')[0]);
                  return (
                    <tr key={l.chave} className={`border-b border-slate-50 ${cls}`}>
                      <td className="py-1.5 pr-3" style={{ paddingLeft: `${4 + l.nivel * 18}px` }}>
                        {l.tipo === 'grupo' || l.tipo === 'conta' ? `• ${l.rotulo}` : l.rotulo}
                      </td>
                      <td className="py-1.5 font-mono text-[0.6875rem] text-slate-400">{l.codigo ?? (destaque ? 'Subtotal' : '')}</td>
                      <td className={`tnum py-1.5 text-right ${l.tipo === 'resultado' ? (l.valor >= 0 ? 'text-emerald-700' : 'text-rose-700') : ''}`}>
                        {formatCurrency(l.valor)}
                      </td>
                      <td className="tnum py-1.5 text-right text-xs text-slate-500">{l.percentual.toFixed(1)}%</td>
                      {comparar && (
                        <td className="tnum py-1.5 text-right text-xs text-slate-400">
                          {l.anterior == null ? '—' : formatCurrency(l.anterior)}
                        </td>
                      )}
                      {comparar && (
                        <td className="py-1.5 text-right">
                          <Variacao valor={l.anterior == null ? null : variacaoPercentual(l.valor, l.anterior)} inverso={inverso && l.tipo !== 'resultado' && l.tipo !== 'subtotal'} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="text-[0.6875rem] leading-relaxed text-slate-400">
        % = participação sobre a receita operacional bruta do período. Custos, deduções e despesas aparecem
        negativos. Contas de balanço (imobilizado, empréstimos, capital) não entram na DRE — aparecem no
        Balancete. Lançamento sem conta aparece como &quot;não classificado&quot; (3.1.1.99 / 4.2.1.99).
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
