'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Ticket, AlertTriangle, Clock, UserX } from 'lucide-react';
import { CentralProtocolos } from '@/components/protocolos/central-protocolos';
import { useResumoProtocolos } from '@/hooks/use-protocolos';

function Conteudo() {
  const params = useSearchParams();
  const { data: resumo } = useResumoProtocolos();

  // ?meus=1 vem do card do dashboard ("meus atendimentos").
  const meus = params.get('meus') === '1';

  const kpis = [
    { label: 'Em aberto', valor: resumo?.abertos ?? 0, icone: Ticket, cor: 'text-brand-700' },
    { label: 'Em atendimento', valor: resumo?.em_andamento ?? 0, icone: Clock, cor: 'text-amber-700' },
    { label: 'Alta / urgente', valor: resumo?.urgentes ?? 0, icone: AlertTriangle, cor: 'text-rose-700' },
    { label: 'Sem responsavel', valor: resumo?.sem_responsavel ?? 0, icone: UserX, cor: 'text-slate-700' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Central de Protocolos</h1>
        <p className="text-sm text-slate-500">
          Fila de atendimentos do sistema — historico, transferencia entre atendentes e encerramento.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-slate-200 bg-superficie p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-slate-400">{k.label}</p>
              <k.icone className={`h-4 w-4 ${k.cor}`} />
            </div>
            <p className={`tnum mt-1 text-2xl font-semibold ${k.cor}`}>{k.valor}</p>
          </div>
        ))}
      </div>

      <CentralProtocolos filtroInicial={meus ? { status: 'ABERTOS' } : undefined} />
    </div>
  );
}

export default function ProtocolosPage() {
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-slate-400">Carregando...</p>}>
      <Conteudo />
    </Suspense>
  );
}
