import { KanbanBoard } from '@/components/sinistros/kanban-board';

export default function SinistrosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Sinistros / Eventos</h1>
        <p className="text-sm text-slate-500">
          Arraste os protocolos entre as colunas para atualizar o status do pipeline.
        </p>
      </div>
      <KanbanBoard />
    </div>
  );
}
