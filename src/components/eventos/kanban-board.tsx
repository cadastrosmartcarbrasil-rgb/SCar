'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertOctagon, ChevronDown, ChevronUp, Eye, Maximize2, Minimize2, Search, X } from 'lucide-react';
import { PIPELINE_SINISTRO, TIPO_EVENTO_LABEL } from '@/types/domain';
import { useEventos, useAtualizarStatusEvento, type EventoComRelacionamentos } from '@/hooks/use-eventos';
import { agruparPorRegional, eventoCasaComBusca, filtrarPorExpansao, veioDoMutual, type ExpansaoColuna } from '@/lib/kanban-eventos';
import { formatDate } from '@/lib/utils';
import { useEventosPrazos } from '@/hooks/use-prazo-eventos';
import { SeloPrazo } from './prazo-regulatorio';
import { useResumoComunicacoes } from '@/hooks/use-comunicacoes';
import type { StatusEvento } from '@/lib/database.types';

// Kanban de eventos (protocolos) com drag-and-drop nativo entre colunas de status.
// Cada coluna nasce COMPACTA — total + contagem por regional — e so desenha os
// vcards quando alguem pede ("Ver todos" ou a unidade). A coluna continua sendo
// alvo de arrasto nos dois modos.
export function KanbanBoard() {
  const { data: eventos, isLoading } = useEventos();
  const atualizarStatus = useAtualizarStatusEvento();
  // prazo regulatorio (0113) de cada evento em aberto, para o selo do card
  const { data: prazos } = useEventosPrazos();
  const prazoPorId = useMemo(() => new Map((prazos ?? []).map((p) => [p.evento_id, p])), [prazos]);
  // comunicacoes dos envolvidos (0129): "Comunicacoes 1/3" no card
  const idsAbertos = useMemo(
    () => (eventos ?? []).filter((e) => !['CONCLUIDO', 'NEGADO'].includes(e.status)).map((e) => e.id),
    [eventos],
  );
  const { data: comunicacoes } = useResumoComunicacoes(idsAbertos);
  const vencidos = (prazos ?? []).filter((p) => p.nivel === 'VENCIDO').length;
  const criticos = (prazos ?? []).filter((p) => p.nivel === 'CRITICO').length;
  const urgentes = (prazos ?? []).filter((p) => p.nivel === 'URGENCIA').length;
  const [dragId, setDragId] = useState<string | null>(null);
  const [expansao, setExpansao] = useState<Partial<Record<StatusEvento, ExpansaoColuna>>>({});
  // busca: com termo, o Kanban mostra so os eventos que casam e ja ABERTOS
  // (ninguem precisa expandir coluna por coluna para achar um evento)
  const [busca, setBusca] = useState('');
  const buscando = busca.trim().length >= 2;
  const encontrados = useMemo(
    () => (buscando ? (eventos ?? []).filter((e) => eventoCasaComBusca(e, busca)) : eventos ?? []),
    [eventos, busca, buscando],
  );

  const porStatus = useMemo(() => {
    const map = new Map<StatusEvento, EventoComRelacionamentos[]>();
    for (const col of PIPELINE_SINISTRO) map.set(col.status, []);
    for (const e of encontrados) map.get(e.status)?.push(e);
    return map;
  }, [encontrados]);

  const algumaAberta = Object.values(expansao).some((x) => x != null);

  function expandir(status: StatusEvento, valor: ExpansaoColuna) {
    setExpansao((atual) => ({ ...atual, [status]: valor }));
  }

  function alternarTudo() {
    if (algumaAberta) setExpansao({});
    else setExpansao(Object.fromEntries(PIPELINE_SINISTRO.map((c) => [c.status, 'todos'])));
  }

  function onDrop(status: StatusEvento) {
    if (!dragId) return;
    const evento = eventos?.find((e) => e.id === dragId);
    setDragId(null);
    if (!evento || evento.status === status) return;
    atualizarStatus.mutate(
      { id: dragId, status },
      {
        onSuccess: () => toast.success(`Protocolo movido para ${status}`),
        onError: (e) => toast.error(`Falha ao mover: ${(e as Error).message}`),
      },
    );
  }

  if (isLoading) return <p className="text-sm text-slate-500">Carregando pipeline...</p>;

  return (
    <div className="space-y-3">
      {vencidos + criticos + urgentes > 0 && (
        <Link
          href="/eventos?aba=prazos"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 hover:bg-rose-100"
        >
          <AlertOctagon className="h-4 w-4" />
          <span className="font-semibold">Prazo regulatório (90 dias):</span>
          {vencidos > 0 && <span className="font-semibold">{vencidos} vencido(s)</span>}
          {criticos > 0 && <span>{criticos} crítico(s) (85+ dias)</span>}
          {urgentes > 0 && <span>{urgentes} em urgência (75+ dias)</span>}
          <span className="ml-auto text-xs underline">ver painel</span>
        </Link>
      )}
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Procurar por associado, placa, nº do evento, CPF, chassi, tipo ou unidade"
          className="w-full rounded-lg border border-slate-300 bg-superficie py-2 pl-9 pr-9 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
        />
        {busca && (
          <button
            type="button"
            onClick={() => setBusca('')}
            title="Limpar a busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {buscando
            ? `${encontrados.length} de ${eventos?.length ?? 0} protocolo(s) encontrado(s) para "${busca.trim()}".`
            : `${eventos?.length ?? 0} protocolo(s) no pipeline. As colunas mostram o resumo por regional — abra para ver os cards.`}
        </p>
        <button
          type="button"
          onClick={alternarTudo}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-superficie px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {algumaAberta ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {algumaAberta ? 'Recolher todas' : 'Expandir todas'}
        </button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_SINISTRO.map((col) => {
          const items = porStatus.get(col.status) ?? [];
          const grupos = agruparPorRegional(items);
          const atual: ExpansaoColuna =
            buscando && expansao[col.status] === undefined ? 'todos' : expansao[col.status] ?? null;
          const cards = filtrarPorExpansao(items, atual);
          const tituloFiltro =
            atual && atual !== 'todos' ? grupos.find((g) => g.regionalId === atual.regionalId)?.nome : null;
          return (
            <div
              key={col.status}
              className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-50 p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(col.status)}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className={`rounded-md border px-2 py-1 text-xs font-medium ${col.cor}`}>{col.titulo}</span>
                <span className="tnum text-lg font-semibold text-slate-800">{items.length}</span>
              </div>

              {items.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                  {buscando ? 'Nada encontrado aqui' : 'Nenhum protocolo'}
                </p>
              )}

              {items.length > 0 && atual === null && (
                <div className="space-y-2">
                  <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-superficie">
                    {grupos.map((g) => (
                      <li key={g.regionalId ?? 'matriz'}>
                        <button
                          type="button"
                          onClick={() => expandir(col.status, { regionalId: g.regionalId })}
                          title={`Ver os cards de ${g.nome}`}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
                        >
                          <span className="truncate text-slate-700">{g.nome}</span>
                          <span className="flex items-center gap-1.5">
                            <span className="tnum font-semibold text-slate-800">{g.quantidade}</span>
                            <Eye className="h-3.5 w-3.5 text-slate-400" />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => expandir(col.status, 'todos')}
                    className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-200 bg-superficie px-2 py-1.5 text-xs font-medium text-cyan-700 hover:bg-slate-50"
                  >
                    <ChevronDown className="h-3.5 w-3.5" /> Ver todos ({items.length})
                  </button>
                </div>
              )}

              {items.length > 0 && atual !== null && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span className="truncate">
                      {tituloFiltro ? `${tituloFiltro} · ${cards.length}` : `Todos · ${cards.length}`}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {tituloFiltro && (
                        <button type="button" onClick={() => expandir(col.status, 'todos')} className="font-medium text-cyan-700 hover:underline">
                          Ver todos
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => expandir(col.status, null)}
                        className="inline-flex items-center gap-0.5 font-medium text-slate-600 hover:text-slate-800"
                      >
                        <ChevronUp className="h-3.5 w-3.5" /> Recolher
                      </button>
                    </span>
                  </div>
                  {cards.map((evento) => (
                    <Link
                      key={evento.id}
                      href={`/eventos/${evento.id}`}
                      draggable
                      onDragStart={() => setDragId(evento.id)}
                      className="cursor-grab rounded-lg border border-slate-200 bg-superficie p-3 shadow-sm transition hover:shadow active:cursor-grabbing"
                    >
                      <p className="flex items-center justify-between gap-2 text-xs font-mono text-brand-600">
                        {evento.numero_protocolo}
                        {veioDoMutual(evento.descricao) && (
                          <span className="rounded bg-violet-100 px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase text-violet-700">Mutual</span>
                        )}
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-800">
                        {evento.veiculos?.placa ?? 'Veiculo'} -{' '}
                        {evento.tipos_evento?.nome ??
                          (evento.tipo_evento ? TIPO_EVENTO_LABEL[evento.tipo_evento] : 'Evento')}
                      </p>
                      <p className="truncate text-xs text-slate-500">{evento.clientes?.nome_razao_social}</p>
                      {comunicacoes?.get(evento.id) && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          Comunicações {comunicacoes.get(evento.id)!.respondidas}/{comunicacoes.get(evento.id)!.total}
                        </p>
                      )}
                      {prazoPorId.get(evento.id) && (
                        <div className="mt-1.5">
                          <SeloPrazo prazo={prazoPorId.get(evento.id)!} compacto />
                        </div>
                      )}
                      <p className="mt-2 flex justify-between gap-2 text-[11px] text-slate-400">
                        <span>Ocorrência: {formatDate(evento.data_ocorrencia)}</span>
                        {!tituloFiltro && <span className="truncate">{evento.regionais?.nome ?? 'Matriz'}</span>}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
