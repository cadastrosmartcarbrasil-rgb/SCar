'use client';

import { useState } from 'react';
import { BarChart3, CalendarDays, FileBarChart, Landmark, ScrollText, Wallet, Waves } from 'lucide-react';
import { DreReport } from '@/components/financeiro/dre-report';
import { ContasFinanceiro } from '@/components/financeiro/contas-financeiro';
import { FluxoCaixa } from '@/components/financeiro/fluxo-caixa';
import { SaldosContas } from '@/components/financeiro/saldos-contas';
import { ExtratoConciliacao } from '@/components/financeiro/extrato-conciliacao';
import { FluxoDiario } from '@/components/financeiro/fluxo-diario';
import { RelatoriosFinanceiros } from '@/components/financeiro/relatorios-financeiros';
import { usePerfilAtual } from '@/hooks/use-config';
import { temAcessoGlobal } from '@/lib/unidade';

type Aba = 'contas' | 'saldos' | 'extrato' | 'diario' | 'fluxo' | 'dre' | 'relatorios';

const ABAS: { id: Aba; label: string; descricao: string; icon: React.ElementType; matriz?: boolean }[] = [
  { id: 'contas', label: 'Contas a Pagar / Receber', descricao: 'Carteira, baixas e inadimplencia', icon: Wallet },
  { id: 'saldos', label: 'Contas e Saldos', descricao: 'Saldo de cada conta, saldo total e conferencia com o DRE', icon: Landmark, matriz: true },
  { id: 'extrato', label: 'Extrato e Conciliacao', descricao: 'Extrato por conta e conciliacao do OFX do banco', icon: ScrollText, matriz: true },
  { id: 'diario', label: 'Fluxo Diario', descricao: 'Realizado x a realizar dia a dia e a carga de pagamentos', icon: CalendarDays, matriz: true },
  { id: 'fluxo', label: 'Fluxo Mensal', descricao: 'Previsto x realizado por mes e aging', icon: Waves },
  { id: 'dre', label: 'DRE', descricao: 'Resultado por regime e centro de custo', icon: BarChart3 },
  { id: 'relatorios', label: 'Relatorios', descricao: 'Extrato, fluxo e plano de contas x centro de custo, com exportacao', icon: FileBarChart, matriz: true },
];

export default function FinanceiroPage() {
  const [aba, setAba] = useState<Aba>('contas');
  const [contaExtrato, setContaExtrato] = useState<string | null>(null);
  const { data: perfil } = usePerfilAtual();
  // A tesouraria (saldos, extrato, OFX) e da matriz; o banco tambem recusa os demais.
  const matriz = !!perfil && temAcessoGlobal(perfil.papel);
  const abas = ABAS.filter((a) => !a.matriz || matriz);
  const atual = abas.find((a) => a.id === aba) ?? abas[0];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Financeiro</h1>
        <p className="mt-0.5 text-sm text-slate-500">{atual.descricao}.</p>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200" aria-label="Secoes do financeiro">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            aria-current={atual.id === a.id ? 'page' : undefined}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
              atual.id === a.id
                ? 'border-cyan-500 font-semibold text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <a.icon className="h-4 w-4" />
            {a.label}
          </button>
        ))}
      </nav>

      {atual.id === 'contas' && <ContasFinanceiro />}
      {atual.id === 'saldos' && <SaldosContas onAbrirExtrato={(id) => { setContaExtrato(id); setAba('extrato'); }} />}
      {atual.id === 'extrato' && <ExtratoConciliacao key={contaExtrato ?? 'todas'} contaInicial={contaExtrato} />}
      {atual.id === 'diario' && <FluxoDiario />}
      {atual.id === 'fluxo' && <FluxoCaixa />}
      {atual.id === 'dre' && <DreReport />}
      {atual.id === 'relatorios' && <RelatoriosFinanceiros />}
    </div>
  );
}
