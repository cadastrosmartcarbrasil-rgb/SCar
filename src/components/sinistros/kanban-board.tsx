'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { PIPELINE_SINISTRO, TIPO_EVENTO_LABEL } from '@/types/domain';
import { useEventos, useAtualizarStatusEvento, type EventoComRelacionamentos } from '@/hooks/use-eventos';
import { formatDate } from '@/lib/utils';
import type { StatusEvento } from '@/lib/database.types';

// Kanban de eventos (protocolos) com drag-and-drop nativo entre colunas de status.
export function KanbanBoard() {
  const { data: eventos, isLoading } = useEventos();
  const atualizarStatus = useAtualizarStatusEvento();
  const [dragId, setDragId] = useState<string | null>(null);

  const porStatus = useMemo(() => {
    const map = new Map<StatusEvento, EventoComRelacionamentos[]>();
    for (const col of PIPELINE_SINISTRO) map.set(col.status, []);
    for (const e of eventos ?? []) map.get(e.status)?.push(e);
    return map;
  }, [eventos]);

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
    <div className="flex gap-4 overflow-x-auto pb-4">
      {PIPELINE_SINISTRO.map((col) => {
        const items = porStatus.get(col.status) ?? [];
        return (
          <div
            key={col.status}
            className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-50 p-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(col.status)}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className={`rounded-md border px-2 py-1 text-xs font-medium ${col.cor}`}>
                {col.titulo}
              </span>
              <span className="text-xs text-slate-400">{items.length}</span>
            </div>

            <div className="flex flex-col gap-2">
              {items.map((evento) => (
                <Link
                  key={evento.id}
                  href={`/sinistros/${evento.id}`}
                  draggable
                  onDragStart={() => setDragId(evento.id)}
                  className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow active:cursor-grabbing"
                >
                  <p className="text-xs font-mono text-brand-600">{evento.numero_protocolo}</p>
                  <p className="mt-1 text-sm font-medium text-slate-800">
                    {evento.veiculos?.placa ?? 'Veiculo'} -{' '}
                    {evento.tipos_evento?.nome ??
                      (evento.tipo_evento ? TIPO_EVENTO_LABEL[evento.tipo_evento] : 'Evento')}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {evento.clientes?.nome_razao_social}
                  </p>
                  <p className="mt-2 text-[11px] text-slate-400">
                    Ocorrencia: {formatDate(evento.data_ocorrencia)}
                  </p>
                </Link>
              ))}
              {items.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                  Nenhum protocolo
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
