'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, History, Search } from 'lucide-react';
import { ErroLeitura } from '@/components/integracao/erro-leitura';
import {
  POR_PAGINA_HISTORICO, useEventosHistoricoLista, useEventosHistoricoResumo,
  type FiltroEventosHistorico,
} from '@/hooks/use-eventos-historico';
import { ROTULO_SITUACAO_HISTORICO, rotuloEnvolvimento, rotuloTipos, situacaoHistorico } from '@/lib/eventos-historico';
import { formatCurrency, formatDate } from '@/lib/utils';

const inteiro = new Intl.NumberFormat('pt-BR');

const TIPOS_COMUNS = [
  'COLISÃO', 'PARABRISA', 'GUINCHO 24 HORAS', 'FURTO', 'ROUBO (USO DE VIOLÊNCIA)',
  'FAROL E LANTERNA', 'RETROVISORES', 'VIDROS LATERAIS', 'PERCA DE CONTROLE', 'CAPOTAMENTO',
];

/**
 * A aba Historico de /sinistros (0101): os eventos do Mutual dos associados
 * carregados. So consulta — quem opera evento novo e o pipeline ao lado.
 */
export function HistoricoEventosLista() {
  const [f, setF] = useState<FiltroEventosHistorico>({ busca: '', tipo: null, de: null, ate: null, pagina: 0 });
  const q = useEventosHistoricoLista(f);
  const resumo = useEventosHistoricoResumo();
  const linhas = q.data ?? [];
  const total = Number(linhas[0]?.total_registros ?? 0);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_HISTORICO));
  const muda = (p: Partial<FiltroEventosHistorico>) => setF((a) => ({ ...a, ...p, pagina: p.pagina ?? 0 }));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm text-slate-700">
        <History className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
        <p>
          Eventos registrados no <b>sistema anterior (Mutual)</b> dos associados ja carregados
          {resumo.data ? <> — <b className="tnum">{inteiro.format(resumo.data.eventos)}</b> no historico</> : null}.
          Sao <b>so consulta</b>: nao entram no pipeline nem contam como evento em aberto. O status que o Mutual
          envia nao informa a situacao; so a <b>data de conclusao</b> prova o encerramento. Para atualizar, use{' '}
          <Link href="/integracao/mutual" className="font-medium text-cyan-700 underline">Integracao Mutual</Link>.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[220px] flex-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Buscar</span>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
            <input
              value={f.busca}
              onChange={(e) => muda({ busca: e.target.value })}
              placeholder="Associado, placa, CPF ou protocolo"
              className="w-full rounded-lg border border-slate-300 bg-superficie py-1.5 pl-8 pr-2.5 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
          </div>
        </label>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Tipo</span>
          <select
            value={f.tipo ?? ''}
            onChange={(e) => muda({ tipo: e.target.value || null })}
            className="mt-1 block rounded-lg border border-slate-300 bg-superficie px-2.5 py-1.5 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          >
            <option value="">Todos</option>
            {TIPOS_COMUNS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">De</span>
          <input type="date" value={f.de ?? ''} onChange={(e) => muda({ de: e.target.value || null })}
            className="mt-1 block rounded-lg border border-slate-300 bg-superficie px-2.5 py-1.5 text-sm" />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Ate</span>
          <input type="date" value={f.ate ?? ''} onChange={(e) => muda({ ate: e.target.value || null })}
            className="mt-1 block rounded-lg border border-slate-300 bg-superficie px-2.5 py-1.5 text-sm" />
        </label>
      </div>

      <ErroLeitura q={q} />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-superficie shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2.5">Protocolo</th>
              <th className="px-4 py-2.5">Data</th>
              <th className="px-4 py-2.5">Associado</th>
              <th className="px-4 py-2.5">Veiculo</th>
              <th className="px-4 py-2.5">Tipo</th>
              <th className="px-4 py-2.5 text-right">Valor</th>
              <th className="px-4 py-2.5">Situacao</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Carregando…</td></tr>
            ) : linhas.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                {resumo.data?.eventos ? 'Nenhum evento com esses filtros.' : 'O historico ainda nao foi importado — Integracao Mutual → Historico de eventos.'}
              </td></tr>
            ) : linhas.map((e) => {
              const sit = situacaoHistorico(e);
              const env = rotuloEnvolvimento(e.envolvimento);
              return (
                <tr key={e.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{e.protocolo ?? '—'}</td>
                  <td className="tnum px-4 py-2.5 text-slate-600">{e.data_evento ? formatDate(e.data_evento) : '—'}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/associados/${e.cliente_id}`} className="font-medium text-slate-800 hover:text-cyan-700">{e.associado}</Link>
                    {e.unidade && <span className="block text-[11px] text-slate-400">{e.unidade}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {e.placa ? <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">{e.placa}</span> : '—'}
                    {!e.veiculo_id && e.placa && <span className="block text-[11px] text-slate-400">fora da base</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {rotuloTipos(e.tipos)}
                    {env && <span className="block text-[11px] text-slate-400">{env}</span>}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right text-slate-600">{Number(e.valor_total ?? 0) !== 0 ? formatCurrency(Number(e.valor_total)) : '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {sit === 'CONCLUIDO' && e.data_conclusao ? `Concluido em ${formatDate(e.data_conclusao)}` : ROTULO_SITUACAO_HISTORICO[sit]}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="tnum">{inteiro.format(total)} eventos · pagina {f.pagina + 1} de {paginas}</span>
          <div className="flex gap-2">
            <button type="button" disabled={f.pagina === 0} onClick={() => setF((a) => ({ ...a, pagina: a.pagina - 1 }))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 disabled:opacity-40">
              <ChevronLeft className="h-3.5 w-3.5" /> Anterior
            </button>
            <button type="button" disabled={f.pagina + 1 >= paginas} onClick={() => setF((a) => ({ ...a, pagina: a.pagina + 1 }))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 disabled:opacity-40">
              Proxima <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
