'use client';

import { Check, Minus, Building2, User } from 'lucide-react';
import { PAPEIS_USUARIO } from '@/lib/usuario';
import { PERMISSOES, ROTULO_NIVEL, permissoesDoPapel, type NivelPermissao } from '@/lib/permissoes';

const SELO: Record<NivelPermissao, { cls: string; icone: React.ReactNode }> = {
  total: { cls: 'bg-emerald-50 text-emerald-700', icone: <Check className="h-3.5 w-3.5" /> },
  unidade: { cls: 'bg-cyan-50 text-cyan-700', icone: <Building2 className="h-3.5 w-3.5" /> },
  proprio: { cls: 'bg-amber-50 text-amber-700', icone: <User className="h-3.5 w-3.5" /> },
  nao: { cls: 'text-slate-300', icone: <Minus className="h-3.5 w-3.5" /> },
};

function Legenda() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
      {(['total', 'unidade', 'proprio', 'nao'] as NivelPermissao[]).map((n) => (
        <span key={n} className="flex items-center gap-1">
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded ${SELO[n].cls}`}>
            {SELO[n].icone}
          </span>
          {ROTULO_NIVEL[n]}
        </span>
      ))}
    </div>
  );
}

/** A grade inteira: o que cada papel pode fazer, lado a lado. */
export function MatrizPermissoes({ contagem }: { contagem?: Record<string, number> }) {
  let areaAnterior = '';
  return (
    <div className="space-y-3">
      <Legenda />
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="sticky left-0 z-10 bg-superficie px-3 py-2 font-medium">Permissao</th>
              {PAPEIS_USUARIO.map((p) => (
                <th key={p.valor} className="px-2 py-2 text-center font-medium">
                  <span className="block whitespace-nowrap">{p.rotulo}</span>
                  {contagem && (
                    <span className="block text-[10px] font-normal text-slate-400">
                      {contagem[p.valor] ?? 0} usuario(s)
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSOES.map((perm) => {
              const novaArea = perm.area !== areaAnterior;
              areaAnterior = perm.area;
              return (
                <tr key={perm.chave} className={`border-b border-slate-50 ${novaArea ? 'border-t border-t-slate-200' : ''}`}>
                  <td className="sticky left-0 z-10 bg-superficie px-3 py-2">
                    {novaArea && (
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {perm.area}
                      </span>
                    )}
                    <span className="text-slate-700">{perm.descricao}</span>
                  </td>
                  {PAPEIS_USUARIO.map((p) => {
                    const n = perm.niveis[p.valor];
                    const nota = perm.notas?.[p.valor];
                    return (
                      <td key={p.valor} className="px-2 py-2 text-center">
                        <span title={nota ? `${ROTULO_NIVEL[n]} — ${nota}` : ROTULO_NIVEL[n]}
                          className={`inline-flex h-6 w-6 items-center justify-center rounded ${SELO[n].cls}`}>
                          {SELO[n].icone}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-slate-400">
        A permissao de cada pessoa e definida pelo <b className="text-slate-500">papel</b> escolhido na
        aba Usuarios (coluna Papel ou botao Editar) e vale na hora, pela seguranca do banco. &quot;Na
        unidade dele&quot; usa a unidade do cadastro do usuario — sem unidade, esses papeis nao enxergam
        nada da operacao.
      </p>
    </div>
  );
}

/** O que UM papel libera — aparece embaixo do seletor de papel no cadastro. */
export function ResumoDoPapel({ papel }: { papel: string }) {
  const itens = permissoesDoPapel(papel);
  if (itens.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-superficie p-2.5">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Este papel libera
      </p>
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {itens.map(({ permissao, nivel, nota }) => (
          <li key={permissao.chave} className="flex items-start gap-1.5 text-[12px] text-slate-600">
            <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded ${SELO[nivel].cls}`}>
              {SELO[nivel].icone}
            </span>
            <span>
              {permissao.descricao}
              <span className="text-slate-400"> · {nota ?? ROTULO_NIVEL[nivel].toLowerCase()}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
