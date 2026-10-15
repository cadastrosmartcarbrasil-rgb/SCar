import Link from 'next/link';
import { History, KanbanSquare, Plus } from 'lucide-react';
import { KanbanBoard } from '@/components/sinistros/kanban-board';
import { HistoricoEventosLista } from '@/components/sinistros/historico-eventos-lista';
import { SePode } from '@/components/layout/se-pode';

// Duas abas: o PIPELINE (eventos do SCar, operados aqui) e o HISTORICO do
// sistema anterior (0101, so consulta). A aba vem na URL (?aba=historico) para
// os links da Integracao Mutual e da Visao Geral abrirem direto nela.
export default function SinistrosPage({ searchParams }: { searchParams: { aba?: string } }) {
  const historico = searchParams?.aba === 'historico';
  const abas = [
    { href: '/sinistros', label: 'Pipeline', icon: KanbanSquare, ativo: !historico },
    { href: '/sinistros?aba=historico', label: 'Historico (Mutual)', icon: History, ativo: historico },
  ];
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Eventos / Sinistros</h1>
          <p className="text-sm text-slate-500">
            {historico
              ? 'Eventos do sistema anterior dos associados ja carregados — so consulta.'
              : 'Arraste os protocolos entre as colunas para atualizar o status do pipeline.'}
          </p>
        </div>
        <SePode chave="eventos.criar">
        <Link
          href="/sinistros/novo"
          className="inline-flex items-center gap-1.5 rounded-md bg-acao px-3 py-2 text-sm font-medium text-white hover:bg-acao-escura"
        >
          <Plus className="h-4 w-4" /> Novo Evento
        </Link>
        </SePode>
      </div>
      <div className="flex gap-1 border-b border-slate-200">
        {abas.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.href}
              href={a.href}
              aria-current={a.ativo ? 'page' : undefined}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
                a.ativo ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="h-4 w-4" /> {a.label}
            </Link>
          );
        })}
      </div>
      {historico ? <HistoricoEventosLista /> : <KanbanBoard />}
    </div>
  );
}
