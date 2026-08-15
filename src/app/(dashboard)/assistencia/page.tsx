'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LifeBuoy, ListChecks, Settings2, Truck, Wallet } from 'lucide-react';
import { PainelAcionamento } from '@/components/assistencia/painel-acionamento';
import { AcionamentosLista } from '@/components/assistencia/acionamentos-lista';
import { Servicos24h } from '@/components/assistencia/servicos-24h';
import { Prestadores24h } from '@/components/assistencia/prestadores-24h';

type Aba = 'painel' | 'acionamentos' | 'servicos' | 'prestadores';

function Conteudo() {
  const params = useSearchParams();
  const placa = params.get('placa');
  const [aba, setAba] = useState<Aba>('painel');

  const abas: { id: Aba; label: string; icon: React.ElementType }[] = [
    { id: 'painel', label: 'Painel de Acionamento', icon: LifeBuoy },
    { id: 'acionamentos', label: 'Acionamentos', icon: ListChecks },
    { id: 'servicos', label: 'Servicos 24h', icon: Settings2 },
    { id: 'prestadores', label: 'Prestadores', icon: Truck },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Assistencia 24 Horas</h1>
          <p className="text-sm text-slate-500">
            Central de acionamento: valida o veiculo, cota o prestador, gera a OS e lanca o
            pagamento em Contas a Pagar.
          </p>
        </div>
        <Link
          href="/financeiro"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Wallet className="h-4 w-4" /> Contas a pagar
        </Link>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
              aba === a.id ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <a.icon className="h-4 w-4" />
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'painel' && <PainelAcionamento placaInicial={placa} />}
      {aba === 'acionamentos' && <AcionamentosLista />}
      {aba === 'servicos' && <Servicos24h />}
      {aba === 'prestadores' && <Prestadores24h />}
    </div>
  );
}

export default function AssistenciaPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Carregando...</p>}>
      <Conteudo />
    </Suspense>
  );
}
