'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRightCircle, ChevronLeft, ChevronRight, History, KanbanSquare, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { usePode } from '@/hooks/use-permissoes';
import { ErroLeitura } from '@/components/integracao/erro-leitura';
import {
  POR_PAGINA_HISTORICO, useEventosHistoricoLista, useEventosHistoricoResumo, useTransportarEventosHistorico,
  type FiltroEventosHistorico,
} from '@/hooks/use-eventos-historico';
import {
  ROTULO_SITUACAO_HISTORICO, podeLevarAoKanban, resumoTransporte, rotuloEnvolvimento, rotuloTipos, situacaoHistorico,
} from '@/lib/eventos-historico';
import { formatCurrency, formatDate } from '@/lib/utils';

const inteiro = new Intl.NumberFormat('pt-BR');

const TIPOS_COMUNS = [
  'COLISÃO', 'PARABRISA', 'GUINCHO 24 HORAS', 'FURTO', 'ROUBO (USO DE VIOLÊNCIA)',
  'FAROL E LANTERNA', 'RETROVISORES', 'VIDROS LATERAIS', 'PERCA DE CONTROLE', 'CAPOTAMENTO',
];

/**
 * A aba Historico de /eventos (0101): os eventos do Mutual dos associados
 * carregados. Consulta — e, desde a 0112, a equipe ESCOLHE quais levar ao
 * Kanban (sempre em Aberto). Nada vai sozinho: o Mutual nao diz quem ainda
 * esta em tratamento.
 */
export function HistoricoEventosLista() {
  const [f, setF] = useState<FiltroEventosHistorico>({ busca: '', tipo: null, de: null, ate: null, noKanban: null, pagina: 0 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState<string[] | null>(null);
  const podeLevar = usePode('eventos.criar');
  const transportar = useTransportarEventosHistorico();
  const q = useEventosHistoricoLista(f);
  const resumo = useEventosHistoricoResumo();
  const linhas = q.data ?? [];
  const total = Number(linhas[0]?.total_registros ?? 0);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_HISTORICO));
  const muda = (p: Partial<FiltroEventosHistorico>) => setF((a) => ({ ...a, ...p, pagina: p.pagina ?? 0 }));
  const elegiveis = useMemo(() => linhas.filter((e) => podeLevarAoKanban(e).pode), [linhas]);
  const todosMarcados = elegiveis.length > 0 && elegiveis.every((e) => sel.has(e.id));

  function alternar(id: string) {
    setSel((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function alternarPagina() {
    setSel((a) => {
      const n = new Set(a);
      for (const e of elegiveis) { if (todosMarcados) n.delete(e.id); else n.add(e.id); }
      return n;
    });
  }
  function levar(ids: string[]) {
    transportar.mutate(ids, {
      onSuccess: (r) => {
        const { levados, texto } = resumoTransporte(r);
        if (levados > 0) toast.success(texto); else toast.warning(texto);
        setSel((a) => {
          const n = new Set(a);
          for (const l of r) n.delete(l.historico_id);
          return n;
        });
        setConfirmar(null);
      },
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm text-slate-700">
        <History className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
        <p>
          Eventos registrados no <b>sistema anterior (Mutual)</b> dos associados já carregados
          {resumo.data ? <> — <b className="tnum">{inteiro.format(resumo.data.eventos)}</b> no histórico</> : null}.
          Ficam <b>só na consulta</b> até alguém escolher: marque os que ainda estão em tratamento e use{' '}
          <b>Levar ao Kanban</b> — cada um vira um evento em <b>Aberto</b> para a equipe completar. O status que o
          Mutual envia não informa a situação; só a <b>data de conclusão</b> prova o encerramento. Para atualizar, use{' '}
          <Link href="/integracao/mutual" className="font-medium text-cyan-700 underline">Integração Mutual</Link>.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[220px] flex-1">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-400">Buscar</span>
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
          <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-400">Tipo</span>
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
          <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-400">Kanban</span>
          <select
            value={f.noKanban === null ? '' : f.noKanban ? 'sim' : 'nao'}
            onChange={(e) => muda({ noKanban: e.target.value === '' ? null : e.target.value === 'sim' })}
            className="mt-1 block rounded-lg border border-slate-300 bg-superficie px-2.5 py-1.5 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          >
            <option value="">Todos</option>
            <option value="nao">Ainda não levados</option>
            <option value="sim">Já no Kanban</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-400">De</span>
          <input type="date" value={f.de ?? ''} onChange={(e) => muda({ de: e.target.value || null })}
            className="mt-1 block rounded-lg border border-slate-300 bg-superficie px-2.5 py-1.5 text-sm" />
        </label>
        <label className="block">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-400">Até</span>
          <input type="date" value={f.ate ?? ''} onChange={(e) => muda({ ate: e.target.value || null })}
            className="mt-1 block rounded-lg border border-slate-300 bg-superficie px-2.5 py-1.5 text-sm" />
        </label>
      </div>

      <ErroLeitura q={q} />

      {podeLevar && sel.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2.5 text-sm">
          <span className="text-slate-700"><b className="tnum">{sel.size}</b> evento(s) escolhido(s)</span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setSel(new Set())}>Limpar</Button>
            <Button type="button" onClick={() => setConfirmar([...sel])}>
              <KanbanSquare className="h-4 w-4" /> Levar ao Kanban ({sel.size})
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-superficie shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              {podeLevar && (
                <th className="w-8 px-3 py-2.5">
                  <input type="checkbox" checked={todosMarcados} disabled={elegiveis.length === 0}
                    onChange={alternarPagina} aria-label="Marcar os que podem ir ao Kanban nesta página" />
                </th>
              )}
              <th className="px-4 py-2.5">Protocolo</th>
              <th className="px-4 py-2.5">Data</th>
              <th className="px-4 py-2.5">Associado</th>
              <th className="px-4 py-2.5">Veiculo</th>
              <th className="px-4 py-2.5">Tipo</th>
              <th className="px-4 py-2.5 text-right">Valor</th>
              <th className="px-4 py-2.5">Situação</th>
              <th className="px-4 py-2.5">Kanban</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr><td colSpan={podeLevar ? 9 : 8} className="px-4 py-10 text-center text-slate-400">Carregando…</td></tr>
            ) : linhas.length === 0 ? (
              <tr><td colSpan={podeLevar ? 9 : 8} className="px-4 py-10 text-center text-slate-400">
                {resumo.data?.eventos ? 'Nenhum evento com esses filtros.' : 'O histórico ainda não foi importado — Integração Mutual → Histórico de eventos.'}
              </td></tr>
            ) : linhas.map((e) => {
              const sit = situacaoHistorico(e);
              const env = rotuloEnvolvimento(e.envolvimento);
              const levar = podeLevarAoKanban(e);
              return (
                <tr key={e.id} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/60 ${sel.has(e.id) ? 'bg-cyan-50/60' : ''}`}>
                  {podeLevar && (
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={sel.has(e.id)} disabled={!levar.pode}
                        onChange={() => alternar(e.id)} title={levar.motivo ?? 'Escolher para levar ao Kanban'}
                        aria-label={`Escolher o evento ${e.protocolo ?? ''}`} />
                    </td>
                  )}
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{e.protocolo ?? '—'}</td>
                  <td className="tnum px-4 py-2.5 text-slate-600">{e.data_evento ? formatDate(e.data_evento) : '—'}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/associados/${e.cliente_id}`} className="font-medium text-slate-800 hover:text-cyan-700">{e.associado}</Link>
                    {e.unidade && <span className="block text-[0.6875rem] text-slate-400">{e.unidade}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {e.placa ? <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">{e.placa}</span> : '—'}
                    {!e.veiculo_id && e.placa && <span className="block text-[0.6875rem] text-slate-400">fora da base</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {rotuloTipos(e.tipos)}
                    {env && <span className="block text-[0.6875rem] text-slate-400">{env}</span>}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right text-slate-600">{Number(e.valor_total ?? 0) !== 0 ? formatCurrency(Number(e.valor_total)) : '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {sit === 'CONCLUIDO' && e.data_conclusao ? `Concluído em ${formatDate(e.data_conclusao)}` : ROTULO_SITUACAO_HISTORICO[sit]}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {e.evento_id ? (
                      <Link href={`/eventos/${e.evento_id}`} className="inline-flex items-center gap-1 font-medium text-cyan-700 hover:underline">
                        <KanbanSquare className="h-3.5 w-3.5" /> {e.evento_protocolo ?? 'No Kanban'}
                      </Link>
                    ) : !levar.pode ? (
                      <span className="text-slate-400">{levar.motivo}</span>
                    ) : podeLevar ? (
                      <button type="button" onClick={() => setConfirmar([e.id])} disabled={transportar.isPending}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-600 hover:border-cyan-300 hover:text-cyan-700 disabled:opacity-50">
                        <ArrowRightCircle className="h-3.5 w-3.5" /> Levar
                      </button>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="tnum">{inteiro.format(total)} eventos · página {f.pagina + 1} de {paginas}</span>
          <div className="flex gap-2">
            <button type="button" disabled={f.pagina === 0} onClick={() => setF((a) => ({ ...a, pagina: a.pagina - 1 }))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 disabled:opacity-40">
              <ChevronLeft className="h-3.5 w-3.5" /> Anterior
            </button>
            <button type="button" disabled={f.pagina + 1 >= paginas} onClick={() => setF((a) => ({ ...a, pagina: a.pagina + 1 }))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 disabled:opacity-40">
              Próxima <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <Modal
        open={!!confirmar}
        onClose={() => !transportar.isPending && setConfirmar(null)}
        title="Levar ao Kanban"
        subtitulo={confirmar && confirmar.length > 1 ? `${confirmar.length} eventos escolhidos` : 'Um evento escolhido'}
      >
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            Cada evento escolhido vira um <b>evento novo no Kanban, na coluna Aberto</b>, com associado, veículo, data e
            unidade. O protocolo, os tipos, o envolvimento e o valor do Mutual vão na descrição, para a equipe completar o resto.
          </p>
          <p className="text-xs text-slate-500">
            O evento levado passa a contar como evento do sistema (inclusive nos limites de uso dos opcionais) e sai da
            contagem do histórico. Se for levado por engano, apagar o evento no Kanban devolve-o para ca.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setConfirmar(null)} disabled={transportar.isPending}>Cancelar</Button>
            <Button type="button" onClick={() => confirmar && levar(confirmar)} disabled={transportar.isPending}>
              <KanbanSquare className="h-4 w-4" /> {transportar.isPending ? 'Levando…' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
