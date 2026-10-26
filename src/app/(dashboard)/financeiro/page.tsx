'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, CalendarDays, CalendarRange, FileBarChart, Landmark, Scale, ScrollText, Wallet, Waves } from 'lucide-react';
import { DreReport } from '@/components/financeiro/dre-report';
import { ContasFinanceiro } from '@/components/financeiro/contas-financeiro';
import { FluxoCaixa } from '@/components/financeiro/fluxo-caixa';
import { SaldosContas } from '@/components/financeiro/saldos-contas';
import { ExtratoConciliacao } from '@/components/financeiro/extrato-conciliacao';
import { FluxoDiario } from '@/components/financeiro/fluxo-diario';
import { RelatoriosFinanceiros } from '@/components/financeiro/relatorios-financeiros';
import { Balancete } from '@/components/financeiro/balancete';
import { FluxoEvolutivo } from '@/components/financeiro/fluxo-evolutivo';
import { usePerfilAtual } from '@/hooks/use-config';
import { temAcessoGlobal } from '@/lib/unidade';
import { useMinhasContasBancarias } from '@/hooks/use-tesouraria';
import { usePode } from '@/hooks/use-permissoes';

type Aba = 'contas' | 'saldos' | 'extrato' | 'diario' | 'evolutivo' | 'fluxo' | 'dre' | 'balancete' | 'relatorios';

// matriz: so admin/financeiro. operador: tambem quem opera uma conta (0126).
// dre: so quem tem "Financeiro — DRE" na grade (0141); o banco tambem confere.
const ABAS: { id: Aba; label: string; descricao: string; icon: React.ElementType; matriz?: boolean; operador?: boolean; dre?: boolean }[] = [
  { id: 'contas', label: 'Contas a Pagar / Receber', descricao: 'Carteira, baixas e inadimplência', icon: Wallet },
  { id: 'saldos', label: 'Contas e Saldos', descricao: 'Saldo de cada conta, saldo total e conferência com o DRE', icon: Landmark, matriz: true, operador: true },
  { id: 'extrato', label: 'Extrato e Conciliação', descricao: 'Extrato por conta e conciliação do OFX do banco', icon: ScrollText, matriz: true, operador: true },
  { id: 'diario', label: 'Fluxo Diário', descricao: 'Realizado x a realizar dia a dia e a carga de pagamentos', icon: CalendarDays, matriz: true },
  { id: 'evolutivo', label: 'Fluxo Evolutivo', descricao: 'Fluxo de caixa realizado em colunas diárias: saldos por conta, entradas e saídas por rubrica', icon: CalendarRange, matriz: true },
  { id: 'fluxo', label: 'Fluxo Mensal', descricao: 'Previsto x realizado por mês e aging', icon: Waves },
  { id: 'dre', label: 'DRE', descricao: 'DRE gerencial: receita bruta, deduções, lucro bruto, despesas operacionais e lucro líquido', icon: BarChart3, dre: true },
  { id: 'balancete', label: 'Balancete', descricao: 'Balancete de verificação: saldo anterior, débitos, créditos e saldo final por conta', icon: Scale, matriz: true, dre: true },
  { id: 'relatorios', label: 'Relatórios', descricao: 'Extrato, fluxo e plano de contas x centro de custo, com exportação', icon: FileBarChart, matriz: true },
];

export default function FinanceiroPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Carregando...</p>}>
      <Financeiro />
    </Suspense>
  );
}

function Financeiro() {
  const [aba, setAba] = useState<Aba>('contas');
  // ?lancamento=<id>: link vindo do historico do fornecedor — abre a carteira com aquele titulo.
  const params = useSearchParams();
  const router = useRouter();
  const lancamentoLink = params.get('lancamento');
  const [contaExtrato, setContaExtrato] = useState<string | null>(null);
  const { data: perfil } = usePerfilAtual();
  // A tesouraria e da matriz; o operador de conta (0126) ve so a conta liberada. O banco confere.
  const matriz = !!perfil && temAcessoGlobal(perfil.papel);
  // quem opera conta bancaria (ex.: a conta da 24h no Inter) ve Saldos e Extrato so dela
  const { data: minhasContas } = useMinhasContasBancarias();
  const operador = (minhasContas?.length ?? 0) > 0;
  const veDre = usePode('financeiro_dre.ver');
  const abas = ABAS.filter((a) => (!a.dre || veDre) && (!a.matriz || matriz || (a.operador && operador)));
  const atual = abas.find((a) => a.id === aba) ?? abas[0];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Financeiro</h1>
        <p className="mt-0.5 text-sm text-slate-500">{atual.descricao}.</p>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200" aria-label="Seções do financeiro">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => { setAba(a.id); if (lancamentoLink) router.replace('/financeiro', { scroll: false }); }}
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

      {atual.id === 'contas' && (
        <ContasFinanceiro
          lancamentoId={lancamentoLink}
          onLimparLancamento={() => router.replace('/financeiro', { scroll: false })}
        />
      )}
      {atual.id === 'saldos' && <SaldosContas matriz={matriz} onAbrirExtrato={(id) => { setContaExtrato(id); setAba('extrato'); }} />}
      {atual.id === 'extrato' && <ExtratoConciliacao key={contaExtrato ?? 'todas'} contaInicial={contaExtrato} />}
      {atual.id === 'diario' && <FluxoDiario />}
      {atual.id === 'fluxo' && <FluxoCaixa />}
      {atual.id === 'evolutivo' && <FluxoEvolutivo />}
      {atual.id === 'dre' && <DreReport />}
      {atual.id === 'balancete' && <Balancete />}
      {atual.id === 'relatorios' && <RelatoriosFinanceiros />}
    </div>
  );
}
