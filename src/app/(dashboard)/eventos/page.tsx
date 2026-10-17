import Link from 'next/link';
import { History, KanbanSquare, Plus, Timer } from 'lucide-react';
import { KanbanBoard } from '@/components/eventos/kanban-board';
import { HistoricoEventosLista } from '@/components/eventos/historico-eventos-lista';
import { PainelPrazos } from '@/components/eventos/painel-prazos';
import { SePode } from '@/components/layout/se-pode';

// Tres abas: o PIPELINE (eventos do SCar, operados aqui), o PRAZO REGULATORIO
// (0113, 90 dias do Art. 22) e o HISTORICO do sistema anterior (0101, so
// consulta). A aba vem na URL (?aba=historico|prazos) para os links abrirem nela.
export default function EventosPage({ searchParams }: { searchParams: { aba?: string } }) {
  const historico = searchParams?.aba === 'historico';
  const prazos = searchParams?.aba === 'prazos';
  const abas = [
    { href: '/eventos', label: 'Pipeline', icon: KanbanSquare, ativo: !historico && !prazos },
    { href: '/eventos?aba=prazos', label: 'Prazo regulatorio (90 dias)', icon: Timer, ativo: prazos },
    { href: '/eventos?aba=historico', label: 'Historico (Mutual)', icon: History, ativo: historico },
  ];
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Eventos</h1>
          <p className="text-sm text-slate-500">
            {historico
              ? 'Eventos do sistema anterior dos associados ja carregados — so consulta.'
              : prazos
              ? 'Prazo de regulacao e liquidacao de 90 dias (Art. 22, CNSP 491/2026) dos eventos em aberto.'
              : 'Arraste os protocolos entre as colunas para atualizar o status do pipeline.'}
          </p>
        </div>
        <SePode chave="eventos.criar">
        <Link
          href="/eventos/novo"
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
      {historico ? <HistoricoEventosLista /> : prazos ? <PainelPrazos /> : <KanbanBoard />}
    </div>
  );
}
