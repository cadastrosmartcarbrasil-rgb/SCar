'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlarmClock, ChevronRight, MessageCircle } from 'lucide-react';
import { useAgendaVendas } from '@/hooks/use-vendas';
import { ordenarAgenda, resumoAgenda, rotuloRetorno, SELO_AGENDA, situacaoAgenda } from '@/lib/agenda';

/**
 * A lista de trabalho do dia: o que ficou para tras e o que vence hoje.
 *
 * E o que faltava para o CRM responder "o que eu faco agora?" — o Kanban
 * mostra o retrato do funil, mas nao a fila de contatos. Some da tela quando
 * nao ha nada marcado: aviso que aparece sempre vira paisagem.
 */
export function AgendaHoje() {
  const { data: itens, isLoading } = useAgendaVendas();
  const [tudo, setTudo] = useState(false);

  if (isLoading || (itens ?? []).length === 0) return null;

  const lista = ordenarAgenda(itens ?? []);
  const { atrasados, hoje, total } = resumoAgenda(lista);
  const visiveis = tudo ? lista : lista.slice(0, 5);

  return (
    <section className="rounded-2xl border border-slate-200 bg-superficie p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <AlarmClock className="h-4 w-4 text-cyan-600" /> Contatos de hoje
        </h2>
        <div className="flex items-center gap-1.5 text-[11px]">
          {atrasados > 0 && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">
              {atrasados} atrasado{atrasados > 1 ? 's' : ''}
            </span>
          )}
          {hoje > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
              {hoje} para hoje
            </span>
          )}
        </div>
      </header>

      <ul className="mt-3 divide-y divide-slate-100">
        {visiveis.map((l) => {
          const situacao = situacaoAgenda(l.proximo_contato_em);
          const fone = (l.celular ?? '').replace(/\D/g, '');
          return (
            <li key={l.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link href={`/vendas/${l.id}`} className="truncate text-[13px] font-medium text-slate-900 hover:text-brand-700">
                    {l.nome}
                  </Link>
                  {situacao !== 'SEM_AGENDA' && (
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${SELO_AGENDA[situacao].cor}`}>
                      {rotuloRetorno(l.proximo_contato_em)}
                    </span>
                  )}
                </div>
                <p className="truncate text-[11.5px] text-slate-500">
                  {l.proximo_contato_nota
                    ?? [l.marca, l.modelo].filter(Boolean).join(' ')
                    ?? l.celular}
                </p>
              </div>
              <a
                href={`https://wa.me/55${fone}`} target="_blank" rel="noreferrer"
                title={`Chamar ${l.nome} no WhatsApp`}
                className="shrink-0 rounded-lg bg-emerald-50 p-1.5 text-emerald-700 transition hover:bg-emerald-100"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
              <Link href={`/vendas/${l.id}`} className="shrink-0 text-slate-300 hover:text-slate-500">
                <ChevronRight className="h-4 w-4" />
              </Link>
            </li>
          );
        })}
      </ul>

      {total > 5 && (
        <button
          type="button" onClick={() => setTudo((t) => !t)}
          className="mt-1 text-xs font-medium text-brand-600"
        >
          {tudo ? 'Mostrar menos' : `Ver os ${total} contatos`}
        </button>
      )}
    </section>
  );
}
