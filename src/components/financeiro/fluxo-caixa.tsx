'use client';

import { useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Activity, AlertTriangle, ArrowDownCircle, ArrowUpCircle, Waves } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAging, useFinanceiroResumo, useFluxoMensal } from '@/hooks/use-financeiro';
import { formatCurrency } from '@/lib/utils';
import { somarMoeda } from '@/lib/money';
import { FiltroPeriodo, Indicador, Vazio, periodoPreset, type Periodo } from './ui-financeiro';

const MES_CURTO = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' });
const rotuloMes = (iso: string) => MES_CURTO.format(new Date(`${iso}T00:00:00`)).replace('.', '');
const compacto = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v));

const COR_FAIXA = ['#22A7E4', '#F5A524', '#F07C29', '#E5484D', '#9B1C1F'];

/**
 * Tesouraria: fluxo de caixa previsto x realizado e aging da carteira.
 * Responde "quanto entra e sai nos proximos meses" e "onde esta a
 * inadimplencia" sem precisar exportar nada.
 */
export function FluxoCaixa({ regionalId }: { regionalId?: string | null }) {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoPreset('semestre'));
  const { data: fluxo, isLoading } = useFluxoMensal({ ...periodo, regionalId });
  const { data: aging } = useAging(regionalId);
  const { data: resumo } = useFinanceiroResumo({ ...periodo, regionalId });

  const serie = useMemo(
    () =>
      (fluxo ?? []).map((m) => ({
        mes: rotuloMes(m.mes),
        'Entradas previstas': Number(m.previsto_entrada),
        'Saidas previstas': -Number(m.previsto_saida),
        'Entradas realizadas': Number(m.realizado_entrada),
        'Saidas realizadas': -Number(m.realizado_saida),
        Saldo: Number(m.saldo_realizado),
      })),
    [fluxo],
  );

  // Saldo acumulado projetado: parte do realizado e segue pelo previsto.
  const acumulado = useMemo(() => {
    let saldo = 0;
    return (fluxo ?? []).map((m) => {
      saldo = somarMoeda(saldo, Number(m.saldo_previsto));
      return { mes: rotuloMes(m.mes), Acumulado: saldo };
    });
  }, [fluxo]);

  const receber = (aging ?? []).filter((a) => a.tipo === 'RECEITA');
  const pagar = (aging ?? []).filter((a) => a.tipo === 'DESPESA');

  const previstoTotal = (fluxo ?? []).reduce(
    (acc, m) => ({
      entrada: somarMoeda(acc.entrada, Number(m.previsto_entrada)),
      saida: somarMoeda(acc.saida, Number(m.previsto_saida)),
    }),
    { entrada: 0, saida: 0 },
  );

  return (
    <div className="space-y-5">
      <FiltroPeriodo periodo={periodo} onChange={setPeriodo} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Entradas previstas" valor={previstoTotal.entrada} icon={ArrowUpCircle} tom="receita"
          detalhe="Titulos a receber com vencimento no intervalo" />
        <Indicador titulo="Saidas previstas" valor={previstoTotal.saida} icon={ArrowDownCircle} tom="despesa"
          detalhe="Titulos a pagar com vencimento no intervalo" />
        <Indicador
          titulo="Saldo projetado" valor={previstoTotal.entrada - previstoTotal.saida} icon={Waves}
          tom={previstoTotal.entrada - previstoTotal.saida >= 0 ? 'receita' : 'despesa'}
          detalhe="Diferenca entre o previsto de entradas e saidas no intervalo"
        />
        <Indicador
          titulo="Carteira vencida" valor={somarMoeda(resumo?.vencido_receber, resumo?.vencido_pagar)} icon={AlertTriangle} tom="alerta"
          detalhe={`A receber ${formatCurrency(resumo?.vencido_receber)} · a pagar ${formatCurrency(resumo?.vencido_pagar)}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fluxo de caixa mensal — previsto x realizado</CardTitle>
          <p className="text-xs text-slate-500">Barras acima do eixo sao entradas; abaixo, saidas.</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
          ) : serie.length === 0 ? (
            <Vazio icon={Activity} titulo="Sem titulos no intervalo" descricao="Escolha um periodo maior nos atalhos acima ou lance contas a pagar/receber." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} stackOffset="sign">
                <CartesianGrid strokeDasharray="3 3" stroke="#e8edf5" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={compacto} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={48} />
                <Tooltip
                  formatter={(v: number | string) => formatCurrency(Math.abs(Number(v)))}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Entradas previstas" fill="#9FD6F1" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="Entradas realizadas" fill="#12A150" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="Saidas previstas" fill="#FBD5D6" radius={[0, 0, 4, 4]} maxBarSize={22} />
                <Bar dataKey="Saidas realizadas" fill="#E5484D" radius={[0, 0, 4, 4]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Saldo acumulado projetado</CardTitle></CardHeader>
          <CardContent>
            {acumulado.length === 0 ? (
              <Vazio icon={Activity} titulo="Sem projecao" descricao="Sem titulos no intervalo escolhido." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={acumulado} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="grad-saldo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22A7E4" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#22A7E4" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8edf5" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={compacto} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip formatter={(v: number | string) => formatCurrency(Number(v))} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Area type="monotone" dataKey="Acumulado" stroke="#139AD6" strokeWidth={2.5} fill="url(#grad-saldo)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aging da carteira</CardTitle>
            <p className="text-xs text-slate-500">Saldo em aberto por tempo de atraso.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <TabelaAging titulo="A receber" linhas={receber} />
            <TabelaAging titulo="A pagar" linhas={pagar} />
            {receber.length === 0 && pagar.length === 0 && (
              <Vazio icon={AlertTriangle} titulo="Carteira limpa" descricao="Nenhum titulo em aberto no momento." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TabelaAging({ titulo, linhas }: { titulo: string; linhas: { faixa: string; ordem: number; titulos: number; total: number }[] }) {
  if (linhas.length === 0) return null;
  const total = somarMoeda(...linhas.map((l) => Number(l.total)));
  const dados = linhas.map((l) => ({ faixa: l.faixa.replace('Vencido ', ''), total: Number(l.total), ordem: l.ordem }));

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
        <p className="tnum text-sm font-bold text-slate-800">{formatCurrency(total)}</p>
      </div>
      <ResponsiveContainer width="100%" height={110}>
        <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="faixa" width={96} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(v: number | string) => formatCurrency(Number(v))} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
          <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={16}>
            {dados.map((d) => <Cell key={d.faixa} fill={COR_FAIXA[Math.min(d.ordem, COR_FAIXA.length) - 1]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
