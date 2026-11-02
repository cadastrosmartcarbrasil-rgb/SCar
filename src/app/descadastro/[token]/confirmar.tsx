'use client';

import { useState } from 'react';
import { Loader2, MailX } from 'lucide-react';

export function ConfirmarDescadastro({ token }: { token: string }) {
  const [estado, setEstado] = useState<'pergunta' | 'enviando' | 'feito'>('pergunta');
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setErro(null);
    setEstado('enviando');
    const res = await fetch(`/api/descadastro/${token}`, { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setErro(json?.error ?? 'Não consegui registrar.'); setEstado('pergunta'); return; }
    setEstado('feito');
  }

  if (estado === 'feito') {
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
        Pronto. Você não vai mais receber nossos comunicados informativos. Avisos sobre os seus boletos e sobre a
        sua proteção continuam chegando normalmente.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Você deixa de receber novidades e comunicados informativos da Smart Car Brasil por e-mail. Avisos sobre os
        seus boletos e sobre a sua proteção continuam chegando.
      </p>
      {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}
      <button
        type="button"
        onClick={confirmar}
        disabled={estado === 'enviando'}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-acao px-4 py-3 text-[0.875rem] font-semibold text-white hover:bg-acao-escura disabled:opacity-50"
      >
        {estado === 'enviando' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailX className="h-4 w-4" />}
        Confirmar: não quero receber
      </button>
    </div>
  );
}
