'use client';

import { FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { useContasBancarias } from '@/hooks/use-financeiro';
import { useMinhasContasBancarias } from '@/hooks/use-tesouraria';
import { formatarMoedaBR } from '@/lib/money';
import { baixarCsv } from './ui-financeiro';
import { baixarExcel, imprimirRelatorio, type TabelaExportavel } from './exportar';

/** Valor em R$ com sinal e cor (entrada verde, saida vermelha). */
export function Dinheiro({ v, sinal, forte }: { v: number | null | undefined; sinal?: boolean; forte?: boolean }) {
  const n = Number(v ?? 0);
  const cor = !sinal ? 'text-slate-800' : n > 0 ? 'text-emerald-700' : n < 0 ? 'text-rose-700' : 'text-slate-400';
  return (
    <span className={`tnum whitespace-nowrap ${cor} ${forte ? 'font-semibold' : ''}`}>
      {sinal && n > 0 ? '+' : ''}
      {formatarMoedaBR(n)}
    </span>
  );
}

export function SeletorConta({
  value,
  onChange,
  consolidado = true,
  rotuloConsolidado = 'Todas as contas (consolidado)',
  className = '',
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  consolidado?: boolean;
  rotuloConsolidado?: string;
  className?: string;
}) {
  const { data: todas } = useContasBancarias();
  // so as contas que quem esta logado opera (0126; a matriz opera todas)
  const { data: minhas } = useMinhasContasBancarias();
  const contas = (todas ?? []).filter((c) => !minhas || minhas.includes(c.id));
  return (
    <label className={`block ${className}`}>
      <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-400">Conta</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="mt-1 block w-full rounded-lg border border-slate-300 bg-superficie px-2.5 py-1.5 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
      >
        {consolidado && <option value="">{rotuloConsolidado}</option>}
        {!consolidado && !value && <option value="">Escolha a conta</option>}
        {contas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}{c.ativo ? '' : ' (inativa)'}
          </option>
        ))}
      </select>
    </label>
  );
}

/** CSV / Excel / PDF da mesma tabela — a tela monta UMA vez e os tres saem iguais. */
export function BotoesExportar({ nome, tabela, desabilitado }: { nome: string; tabela: () => TabelaExportavel; desabilitado?: boolean }) {
  const csv = () => {
    const t = tabela();
    baixarCsv(`${nome}.csv`, [t.cabecalho, ...t.linhas.map((l) => l.map((v) => v ?? '')), ...(t.rodape ? [t.rodape.map((v) => v ?? '')] : [])] as (string | number)[][]);
  };
  const cls = 'inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-superficie px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className={cls} disabled={desabilitado} onClick={csv}>
        <FileText className="h-3.5 w-3.5" /> CSV
      </button>
      <button type="button" className={cls} disabled={desabilitado} onClick={() => baixarExcel(nome, tabela())}>
        <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
      </button>
      <button type="button" className={cls} disabled={desabilitado} onClick={() => imprimirRelatorio(tabela())}>
        <Printer className="h-3.5 w-3.5" /> PDF
      </button>
    </div>
  );
}

export const dataBR = (iso: string | null | undefined) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';

export const SELECT_CLS =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-superficie px-2.5 py-1.5 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40';
