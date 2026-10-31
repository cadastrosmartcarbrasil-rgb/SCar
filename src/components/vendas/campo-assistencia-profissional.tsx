'use client';

import { EyeOff } from 'lucide-react';
import { MoneyInput } from '@/components/ui/field';
import { formatCurrency } from '@/lib/utils';
import {
  validarAssistenciaProfissional, type RegrasAssistenciaProfissional,
} from '@/lib/assistencia-profissional';

// ---------------------------------------------------------------------------
// Assistencia Profissional (0158/0159): o valor do consultor embutido na
// mensalidade. Toda unidade pode cobrar; o texto diz se ela repassa a
// Assistencia ao consultor ou se o valor so aumenta a base da comissao.
// ---------------------------------------------------------------------------
export function CampoAssistenciaProfissional({ regras, valor, onChange }: {
  regras: RegrasAssistenciaProfissional | null | undefined;
  valor: number | null;
  onChange: (v: number | null) => void;
}) {
  const erro = validarAssistenciaProfissional(valor, regras);
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <EyeOff className="h-3.5 w-3.5 text-slate-500" /> Assistência Profissional
        <span className="font-normal text-slate-500">(uso interno)</span>
      </label>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-[180px_1fr] sm:items-center">
        <MoneyInput value={valor} onChange={onChange} placeholder="0,00" />
        <p className="text-[0.7188rem] leading-snug text-slate-500">
          Entre {formatCurrency(regras?.minimo ?? 1)} e {formatCurrency(regras?.maximo ?? 40)}
          {regras?.regional_nome ? ` (${regras.regional_nome})` : ''}. Entra no total da mensalidade e fica fora do desconto.{' '}
          {regras?.paga
            ? <>Esta unidade repassa a Assistência: em cada mensalidade paga você recebe ela <b>no lugar da comissão</b>.</>
            : <>Esta unidade não repassa a Assistência: ela aumenta a mensalidade e, com isso, a sua comissão.</>}{' '}
          <b>O cliente não vê esta linha.</b>
        </p>
      </div>
      {erro && <p className="mt-1 text-[0.7188rem] text-rose-600">{erro}</p>}
    </div>
  );
}
