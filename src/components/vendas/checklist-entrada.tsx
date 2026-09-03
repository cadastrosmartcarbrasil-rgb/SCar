'use client';

import { Check, CircleAlert, ShieldCheck } from 'lucide-react';
import { agruparChecklist, progressoChecklist } from '@/lib/vendas';
import type { ItemChecklistLead } from '@/lib/database.types';

const ICONE_GRUPO: Record<string, string> = {
  Associado: 'bg-cyan-50 text-cyan-700',
  Veiculo: 'bg-amber-50 text-amber-700',
  Documentos: 'bg-violet-50 text-violet-700',
  Venda: 'bg-emerald-50 text-emerald-700',
};

/**
 * O que falta para o veiculo entrar na base.
 * Le a MESMA funcao que a autorizacao usa no banco (`checklist_lead`), entao
 * nao existe "passou na tela e o banco recusou".
 */
export function ChecklistEntrada({ itens }: { itens: ItemChecklistLead[] }) {
  const grupos = agruparChecklist(itens);
  const { concluidos, total, percentual } = progressoChecklist(itens);
  const completo = total > 0 && concluidos === total;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200/80 bg-superficie p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <ShieldCheck className={`h-4 w-4 ${completo ? 'text-emerald-600' : 'text-slate-400'}`} />
            {completo ? 'Pronto para entrar na base' : 'Cadastro incompleto'}
          </p>
          <span className="tnum text-xs font-semibold text-slate-500">{concluidos}/{total}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${completo ? 'bg-emerald-500' : 'bg-cyan-500'}`}
            style={{ width: `${percentual}%` }}
            role="progressbar"
            aria-valuenow={percentual}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        {!completo && (
          <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
            O veiculo so entra na base com a ficha inteira. A Auditoria nao consegue autorizar antes
            disso — a trava e no banco, nao so na tela.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {grupos.map((g) => (
          <div key={g.grupo} className="rounded-2xl border border-slate-200/80 bg-superficie p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${ICONE_GRUPO[g.grupo] ?? 'bg-slate-100 text-slate-600'}`}>
                {g.grupo}
              </span>
              <span className={`tnum text-[11px] font-medium ${g.completo ? 'text-emerald-600' : 'text-slate-400'}`}>
                {g.concluidos}/{g.total}
              </span>
            </div>
            <ul className="space-y-1">
              {g.itens.map((i) => (
                <li key={i.item} className="flex items-start gap-1.5 text-[11.5px] leading-snug">
                  {i.ok
                    ? <Check className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    : <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" />}
                  <span className={i.ok ? 'text-slate-500' : 'font-medium text-slate-800'}>
                    {i.item}
                    {!i.ok && i.detalhe && <span className="font-normal text-slate-400"> — {i.detalhe}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
