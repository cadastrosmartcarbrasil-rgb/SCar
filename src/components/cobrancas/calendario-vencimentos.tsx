'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { baixarCsv } from '@/components/financeiro/ui-financeiro';
import { ErroLeitura } from '@/components/integracao/erro-leitura';
import {
  COR_SEMAFORO, FiltroUnidadeCobranca, ModalBoletos, SemAcessoCobranca, SeloSemaforo,
} from '@/components/cobrancas/ui-cobranca';
import {
  useCobrancaCalendario, useCobrancaEscopo, useCobrancaParametros, type FiltroListaBoletos,
} from '@/hooks/use-cobranca-painel';
import {
  deslocarMes, isoData, rotuloMes, semaforo, taxasDoCiclo,
} from '@/lib/cobranca-painel';
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils';
import type { CobrancaCalendarioLinha } from '@/lib/database.types';

const inteiro = new Intl.NumberFormat('pt-BR');
const num = (v: unknown) => Number(v ?? 0) || 0;
const pct = (f: number | null) => (f === null ? '—' : formatPercent(f));

function fimDoMes(mes: string) {
  const [a, m] = mes.split('-').map(Number);
  return isoData(new Date(a, m, 0));
}

/** Uma linha clicavel do cartao do ciclo (fora do render: tipo estavel). */
function LinhaCiclo({ rotulo, valor, onAbrir, cls = 'text-slate-800' }: {
  rotulo: string; valor: number; onAbrir: () => void; cls?: string;
}) {
  return (
    <button type="button" onClick={onAbrir} disabled={!valor}
      className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[12.5px] hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent">
      <span className="text-slate-500">{rotulo}</span>
      <span className={`tnum font-medium ${cls}`}>{formatCurrency(valor)}</span>
    </button>
  );
}

/**
 * Os SEIS CICLOS do mes (5/10/15/20/25/30) em linha do tempo, com semaforo
 * pela inadimplencia financeira do ciclo. Todo numero abre os boletos.
 */
export function CalendarioVencimentos() {
  const hoje = new Date();
  const [mes, setMes] = useState(() => isoData(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
  const [regionalId, setRegionalId] = useState<string | null>(null);
  const [lista, setLista] = useState<FiltroListaBoletos | null>(null);

  const escopo = useCobrancaEscopo();
  const q = useCobrancaCalendario(mes, regionalId);
  const { data: par } = useCobrancaParametros();
  const meta = par?.meta ?? 5;
  const limite = par?.limite ?? 10;
  const linhas = q.data ?? [];
  const hojeIso = isoData(hoje);

  if (escopo.isSuccess && !(escopo.data?.global || (escopo.data?.regionais.length ?? 0) > 0)) {
    return <SemAcessoCobranca />;
  }

  const abrir = (l: CobrancaCalendarioLinha, titulo: string, situacoes: string[] | null) =>
    setLista({
      titulo: `Ciclo ${l.ciclo} · ${titulo}`, inicio: mes, fim: fimDoMes(mes), regionalId,
      ciclo: l.ciclo, situacoes,
    });

  const total = linhas.reduce(
    (a, l) => ({
      emitido: a.emitido + num(l.valor_emitido),
      prazo: a.prazo + num(l.valor_pago_no_prazo),
      atraso: a.atraso + num(l.valor_pago_em_atraso),
      aberto: a.aberto + num(l.valor_aberto_vencido),
      venceram: a.venceram + num(l.valor_venceram),
      vencer: a.vencer + num(l.valor_a_vencer) + num(l.valor_vence_hoje),
    }),
    { emitido: 0, prazo: 0, atraso: 0, aberto: 0, venceram: 0, vencer: 0 },
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-2xl border border-slate-200/80 bg-superficie p-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMes(deslocarMes(mes, -1))} className="rounded-lg border border-slate-300 p-1.5 hover:bg-slate-50" aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="min-w-[170px] text-center text-base font-semibold capitalize text-slate-900">{rotuloMes(mes)}</p>
          <button type="button" onClick={() => setMes(deslocarMes(mes, 1))} className="rounded-lg border border-slate-300 p-1.5 hover:bg-slate-50" aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <FiltroUnidadeCobranca valor={regionalId} onChange={setRegionalId} />
        <button type="button" onClick={() => baixarCsv(`calendario-${mes.slice(0, 7)}.csv`, [
          ['Ciclo', 'Data', 'Boletos', 'Associados', 'Emitido', 'Pago no prazo', 'Pago em atraso (recuperado)', 'A vencer', 'Vence hoje', 'Vencido em aberto', 'Inadimplência %', 'Recebido %'],
          ...linhas.map((l) => {
            const t = taxasDoCiclo(l);
            return [l.ciclo, formatDate(l.data_ciclo), num(l.boletos), num(l.clientes), num(l.valor_emitido),
              num(l.valor_pago_no_prazo), num(l.valor_pago_em_atraso), num(l.valor_a_vencer), num(l.valor_vence_hoje),
              num(l.valor_aberto_vencido), t.inadimplencia === null ? '' : Math.round(t.inadimplencia * 10000) / 100,
              t.recebimento === null ? '' : Math.round(t.recebimento * 10000) / 100];
          }),
        ])} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
        <p className="text-xs text-slate-500">
          No mês: emitido <b className="tnum">{formatCurrency(total.emitido)}</b> · recebido{' '}
          <b className="tnum">{formatCurrency(total.prazo + total.atraso)}</b> · em aberto vencido{' '}
          <b className="tnum text-rose-600">{formatCurrency(total.aberto)}</b> · a vencer{' '}
          <b className="tnum">{formatCurrency(total.vencer)}</b>
        </p>
      </div>
      <ErroLeitura q={q} />

      {/* Linha do tempo */}
      <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(q.isLoading ? Array.from({ length: 6 }) : linhas).map((l, i) => {
          if (!l) return <div key={i} className="h-60 animate-pulse rounded-2xl bg-slate-100" />;
          const c = l as CobrancaCalendarioLinha;
          const t = taxasDoCiclo(c);
          const s = semaforo(t.inadimplencia, meta, limite);
          const futuro = c.data_ciclo > hojeIso;
          const ehHoje = c.data_ciclo === hojeIso;
          const ab = (rotulo: string, sit: string[] | null) => abrir(c, rotulo, sit);
          return (
            <div key={c.ciclo} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-superficie shadow-[0_1px_2px_rgba(20,33,61,0.04)]">
              <div className="h-1.5" style={{ background: futuro ? 'rgb(var(--slate-200))' : COR_SEMAFORO[s] }} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Ciclo</p>
                    <p className="text-2xl font-bold leading-none text-slate-900">Dia {c.ciclo}</p>
                    <p className="tnum mt-1 text-xs text-slate-500">
                      {formatDate(c.data_ciclo)}{ehHoje && <b className="ml-1 text-cyan-600">· hoje</b>}
                    </p>
                  </div>
                  <div className="text-right">
                    {futuro ? <span className="text-[11px] text-slate-400">ainda não venceu</span> : <SeloSemaforo s={s} />}
                    <p className="tnum mt-1 text-xs text-slate-500">{inteiro.format(num(c.boletos))} boletos · {inteiro.format(num(c.clientes))} assoc.</p>
                  </div>
                </div>
                <div className="mt-3 space-y-0.5">
                  <LinhaCiclo rotulo="Emitido" valor={num(c.valor_emitido)} onAbrir={() => ab('Emitido', null)} />
                  <LinhaCiclo rotulo="Pago no prazo" valor={num(c.valor_pago_no_prazo)} onAbrir={() => ab('Pago no prazo', ['pago_no_prazo'])} cls="text-emerald-700" />
                  <LinhaCiclo rotulo="Recuperado (pago em atraso)" valor={num(c.valor_pago_em_atraso)} onAbrir={() => ab('Recuperado (pago em atraso)', ['pago_em_atraso'])} cls="text-amber-700" />
                  <LinhaCiclo rotulo="A vencer" valor={num(c.valor_a_vencer) + num(c.valor_vence_hoje)} onAbrir={() => ab('A vencer', ['a_vencer', 'vence_hoje'])} />
                  <LinhaCiclo rotulo="Vencido em aberto" valor={num(c.valor_aberto_vencido)} onAbrir={() => ab('Vencido em aberto', ['vencido'])} cls="text-rose-600" />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
                  <div>
                    <p className="tnum text-sm font-semibold text-slate-900">{pct(t.inadimplencia)}</p>
                    <p className="text-[10.5px] text-slate-400">inadimplencia</p>
                  </div>
                  <div>
                    <p className="tnum text-sm font-semibold text-slate-900">{pct(t.recebimento)}</p>
                    <p className="text-[10.5px] text-slate-400">recebido</p>
                  </div>
                  <div>
                    <p className="tnum text-sm font-semibold text-slate-900">{pct(t.recuperacao)}</p>
                    <p className="text-[10.5px] text-slate-400">recuperação</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400">
        O ciclo vem do dia de vencimento ORIGINAL do boleto. Vencimento em fim de semana ou feriado só conta como
        vencido depois do próximo dia útil; no mês sem dia 30, o ciclo 30 vence no último dia.
        Inadimplência = vencido sem pagamento ÷ o que já venceu no ciclo.
      </p>

      <ModalBoletos filtro={lista} onClose={() => setLista(null)} />
    </div>
  );
}
