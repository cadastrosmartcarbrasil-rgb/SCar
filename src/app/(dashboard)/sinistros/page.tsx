import Link from 'next/link';
import { Plus } from 'lucide-react';
import { KanbanBoard } from '@/components/sinistros/kanban-board';

export default function SinistrosPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Eventos / Sinistros</h1>
          <p className="text-sm text-slate-500">
            Arraste os protocolos entre as colunas para atualizar o status do pipeline.
          </p>
        </div>
        <Link
          href="/sinistros/novo"
          className="inline-flex items-center gap-1.5 rounded-md bg-acao px-3 py-2 text-sm font-medium text-white hover:bg-acao-escura"
        >
          <Plus className="h-4 w-4" /> Novo Evento
        </Link>
      </div>
      <KanbanBoard />
    </div>
  );
}
