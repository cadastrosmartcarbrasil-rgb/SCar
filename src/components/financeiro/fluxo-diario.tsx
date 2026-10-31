'use client';

import { useMemo, useState } from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CalendarClock, Landmark } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFluxoDiario, useSaldoEm, mensagemErro } from '@/hooks/use-tesouraria';
import { hojeEmSaoPaulo } from '@/lib/baixa-banco';
import { diaAnteriorIso, primeiroDiaNegativo, projetarFluxo, totaisFluxo, type OpcoesProjecao } from '@/lib/tesouraria';
import { formatCurrency } from '@/lib/utils';
import { Indicador } from './ui-financeiro';
import { BotoesExportar, Dinheiro, SELECT_CLS, SeletorConta, dataBR } from './tesouraria-ui';

const somarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const semana = (iso: string) => DIA_SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()];
const compacto = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)));

const ATALHOS = [
  { r: 'Próximos 15 dias', a: 0, b: 15 },
  { r: 'Próximos 30 dias', a: 0, b: 30 },
  { r: '7 dias atras + 30 a frente', a: -7, b: 30 },
  { r: 'Últimos 30 dias', a: -30, b: 0 },
];

/**
 * Fluxo de caixa DIARIO (0119): realizado ate hoje, a realizar depois, e o
 * saldo dia a dia. A grade mostra o peso de pagamentos x recebimentos de cada
 * dia — e onde o gestor decide o que reagendar na fila de pagamentos.
 */
export function FluxoDiario() {
  const hoje = hojeEmSaoPaulo();
  const [inicio, setInicio] = useState(somarDias(hoje, -7));
  const [fim, setFim] = useState(somarDias(hoje, 30));
  const [conta, setConta] = useState<string | null>(null);
  const [comBoletos, setComBoletos] = useState(true);
  const [vencidos, setVencidos] = useState<NonNullable<OpcoesProjecao['vencidos']>>('saidas');

  const { data: dias, isLoading, error } = useFluxoDiario(inicio, fim, conta);
  const { data: saldoIni } = useSaldoEm(diaAnteriorIso(inicio), conta);
  const proj = useMemo(
    () => projetarFluxo(dias ?? [], saldoIni ?? 0, hoje, { comBoletos, vencidos }),
    [dias, saldoIni, hoje, comBoletos, vencidos],
  );
  const tot = totaisFluxo(dias ?? []);
  const negativo = primeiroDiaNegativo(proj.filter((d) => d.situacao !== 'passado'));
  const saldoHoje = proj.find((d) => d.situacao === 'hoje')?.saldo ?? proj.filter((d) => d.situacao === 'passado').at(-1)?.saldo ?? saldoIni ?? 0;
  const saldoFinal = proj.at(-1)?.saldo ?? saldoIni ?? 0;

  const serie = proj.map((d) => ({
    dia: `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}`,
    Recebimentos: d.entradas,
    Pagamentos: -d.saidas,
    Saldo: d.saldo,
    futuro: d.situacao !== 'passado',
  }));

  const tabela = () => ({
    titulo: 'Fluxo de caixa diário',
    subtitulo: `${dataBR(inicio)} a ${dataBR(fim)} · saldo inicial ${Number(saldoIni ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · realizado até ${dataBR(hoje)}, previsto depois`,
    cabecalho: ['Dia', 'Semana', 'Situação', 'Recebido', 'Pago', 'A receber', 'Boletos previstos', 'A pagar', 'Vencido a pagar', 'Entradas', 'Saídas', 'Resultado', 'Saldo'],
    linhas: proj.map((d) => [
      dataBR(d.dia), semana(d.dia), d.situacao === 'passado' ? 'Realizado' : d.situacao === 'hoje' ? 'Hoje' : 'A realizar',
      d.realizado_entrada, d.realizado_saida, d.previsto_entrada, d.previsto_boletos, d.previsto_saida, d.vencido_saida,
      d.entradas, d.saidas, d.resultado, d.saldo,
    ]),
    rodape: ['Totais', '', '', tot.realizadoEntrada, tot.realizadoSaida, tot.previstoEntrada, tot.previstoBoletos, tot.previstoSaida, tot.vencidoSaida, '', '', '', saldoFinal],
    colunasMoeda: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-2xl border border-slate-200/80 bg-superficie p-4">
        <div className="flex flex-wrap gap-1">
          {ATALHOS.map((a) => {
            const i = somarDias(hoje, a.a), f = somarDias(hoje, a.b);
            const ativo = i === inicio && f === fim;
            return (
              <button key={a.r} onClick={() => { setInicio(i); setFim(f); }}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${ativo ? 'bg-acao text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{a.r}</button>
            );
          })}
        </div>
        <label className="block">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-400">De</span>
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="tnum mt-1 block rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        </label>
        <label className="block">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-400">Até</span>
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="tnum mt-1 block rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        </label>
        <SeletorConta value={conta} onChange={setConta} className="min-w-[200px]" />
        <label className="block">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-400">Vencido e não pago</span>
          <select className={SELECT_CLS} value={vencidos} onChange={(e) => setVencidos(e.target.value as typeof vencidos)}>
            <option value="saidas">Contar só os pagamentos atrasados (prudente)</option>
            <option value="tudo">Contar pagamentos e recebimentos atrasados</option>
            <option value="nenhum">Não contar atrasados</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-sm text-slate-600">
          <input type="checkbox" checked={comBoletos} onChange={(e) => setComBoletos(e.target.checked)} /> Somar boletos de mensalidade a vencer
        </label>
        <div className="ml-auto"><BotoesExportar nome={`fluxo-diario-${inicio}-${fim}`} tabela={tabela} desabilitado={!proj.length} /></div>
      </div>

      {conta && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Com uma conta escolhida o fluxo mostra só o realizado dela: os lançamentos a realizar ainda não tem conta definida
          e aparecem apenas na visão consolidada.
        </p>
      )}
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{mensagemErro(error)}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicador titulo="Saldo hoje" valor={saldoHoje} icon={Landmark} tom={saldoHoje < 0 ? 'despesa' : 'destaque'} carregando={isLoading} />
        <Indicador titulo="Recebido no período" valor={tot.realizadoEntrada} icon={ArrowUpCircle} tom="receita" carregando={isLoading}
          detalhe={`Pago: ${formatCurrency(tot.realizadoSaida)}`} />
        <Indicador titulo="A receber" valor={tot.previstoEntrada + (comBoletos ? tot.previstoBoletos : 0)} icon={CalendarClock} tom="receita"
          detalhe={comBoletos ? `inclui ${formatCurrency(tot.previstoBoletos)} de boletos a vencer` : 'sem os boletos de mensalidade'} carregando={isLoading} />
        <Indicador titulo="A pagar" valor={tot.previstoSaida + (vencidos !== 'nenhum' ? tot.vencidoSaida : 0)} icon={ArrowDownCircle} tom="despesa"
          detalhe={tot.vencidoSaida ? `${formatCurrency(tot.vencidoSaida)} já vencido` : 'nada vencido'} carregando={isLoading} />
        <Indicador titulo={`Saldo projetado em ${dataBR(fim)}`} valor={saldoFinal} icon={negativo ? AlertTriangle : Landmark}
          tom={saldoFinal < 0 ? 'despesa' : 'neutro'} carregando={isLoading}
          detalhe={negativo ? `fica negativo em ${dataBR(negativo.dia)}` : 'não fica negativo no período'} />
      </div>

      <Card>
        <CardHeader><CardTitle>Recebimentos x pagamentos por dia e saldo</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} stackOffset="sign" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tickFormatter={compacto} tick={{ fontSize: 11 }} width={48} />
                <Tooltip formatter={(v: number, n: string) => [formatCurrency(Math.abs(v)), n]} />
                <Legend />
                <ReferenceLine y={0} stroke="#64748b" />
                <Bar dataKey="Recebimentos" fill="#12A150" stackId="f" />
                <Bar dataKey="Pagamentos" fill="#E5484D" stackId="f" />
                <Line dataKey="Saldo" stroke="#0BACE2" strokeWidth={2} dot={false} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-500">Até hoje as barras são o realizado; depois, o previsto. A linha e o saldo no fim de cada dia.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Grade diária</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Dia</th>
                <th className="px-3 py-2 text-right">Entradas</th>
                <th className="px-3 py-2 text-right">Saídas</th>
                <th className="px-3 py-2 text-right">Resultado</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2">Carga do dia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {proj.map((d) => (
                <tr key={d.dia} className={d.situacao === 'hoje' ? 'bg-cyan-50/60' : d.situacao === 'passado' ? 'text-slate-600' : ''}>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className="tnum">{dataBR(d.dia)}</span> <span className="text-xs text-slate-400">{semana(d.dia)}</span>
                    <p className="text-[0.6875rem] text-slate-400">{d.situacao === 'passado' ? 'realizado' : d.situacao === 'hoje' ? 'hoje (realizado + previsto)' : 'a realizar'}</p>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {d.entradas ? <Dinheiro v={d.entradas} /> : <span className="text-slate-300">—</span>}
                    {d.situacao !== 'passado' && comBoletos && d.previsto_boletos > 0 && (
                      <p className="text-[0.6875rem] text-slate-400">{formatCurrency(d.previsto_boletos)} de boletos</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {d.saidas ? <Dinheiro v={-d.saidas} /> : <span className="text-slate-300">—</span>}
                    {d.situacao !== 'passado' && d.qtd_previsto_saida > 0 && (
                      <p className="text-[0.6875rem] text-slate-400">{d.qtd_previsto_saida} pagamento(s)</p>
                    )}
                    {d.situacao === 'hoje' && vencidos !== 'nenhum' && d.vencido_saida > 0 && (
                      <p className="text-[0.6875rem] text-rose-600">{formatCurrency(d.vencido_saida)} vencido</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right"><Dinheiro v={d.resultado} sinal /></td>
                  <td className="px-3 py-2 text-right"><Dinheiro v={d.saldo} forte /></td>
                  <td className="px-3 py-2">
                    <Carga d={d} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Carga({ d }: { d: ReturnType<typeof projetarFluxo>[number] }) {
  if (!d.entradas && !d.saidas) return <span className="text-xs text-slate-300">sem movimento</span>;
  const tot = d.entradas + d.saidas;
  const pe = tot ? Math.round((d.entradas / tot) * 100) : 0;
  const rotulo = d.carga === 'critico' ? 'saldo negativo' : d.carga === 'atencao' ? 'paga mais que recebe' : 'tranquilo';
  const cor = d.carga === 'critico' ? 'text-rose-700' : d.carga === 'atencao' ? 'text-amber-700' : 'text-emerald-700';
  return (
    <div className="min-w-[140px]">
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className="bg-emerald-500" style={{ width: `${pe}%` }} />
        <div className="bg-rose-500" style={{ width: `${100 - pe}%` }} />
      </div>
      <p className={`mt-1 text-[0.6875rem] font-medium ${cor}`}>{rotulo} · {pe}% recebe / {100 - pe}% paga</p>
    </div>
  );
}
