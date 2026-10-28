'use client';

import { EyeOff } from 'lucide-react';
import { MoneyInput } from '@/components/ui/field';
import { formatCurrency } from '@/lib/utils';
import {
  validarAssistenciaProfissional, type RegrasAssistenciaProfissional,
} from '@/lib/assistencia-profissional';

// ---------------------------------------------------------------------------
// Assistencia Profissional (0158): o valor do consultor embutido na
// mensalidade. Some quando a unidade nao paga — so mostra a linha de aviso
// se ja ha valor gravado (cotacao antiga de unidade que deixou de pagar).
// ---------------------------------------------------------------------------
export function CampoAssistenciaProfissional({ regras, valor, onChange }: {
  regras: RegrasAssistenciaProfissional | null | undefined;
  valor: number | null;
  onChange: (v: number | null) => void;
}) {
  if (!regras?.paga && !valor) return null;
  const erro = validarAssistenciaProfissional(valor, regras);
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <EyeOff className="h-3.5 w-3.5 text-slate-500" /> Assistência Profissional
        <span className="font-normal text-slate-500">(uso interno)</span>
      </label>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-[180px_1fr] sm:items-center">
        <MoneyInput value={valor} onChange={onChange} placeholder="0,00" />
        <p className="text-[11.5px] leading-snug text-slate-500">
          {regras?.paga
            ? <>Entre {formatCurrency(regras.minimo)} e {formatCurrency(regras.maximo)} ({regras.regional_nome}). Entra no total da mensalidade, fica fora do desconto e é sua por inteiro. <b>O cliente não vê esta linha.</b></>
            : <>A unidade deste atendimento não paga Assistência Profissional — zere o valor.</>}
        </p>
      </div>
      {erro && <p className="mt-1 text-[11.5px] text-rose-600">{erro}</p>}
    </div>
  );
}
