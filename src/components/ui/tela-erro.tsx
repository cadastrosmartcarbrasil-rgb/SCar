'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Copy, RotateCcw } from 'lucide-react';

/**
 * Tela de erro do sistema. Sem ela, qualquer falha de tela vira o
 * "Application error: a client-side exception has occurred" do Next, sem
 * pista nenhuma. Aqui aparece a mensagem real, a tela e a hora, com um botão
 * para copiar e mandar ao suporte.
 */
export function TelaErro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const [local, setLocal] = useState('');
  useEffect(() => {
    setLocal(window.location.pathname + window.location.search);
    console.error(error);
  }, [error]);

  const detalhes = [
    `Tela: ${local}`,
    `Quando: ${new Date().toLocaleString('pt-BR')}`,
    `Erro: ${error.message}`,
    error.digest ? `Código: ${error.digest}` : '',
    (error.stack ?? '').split('\n').slice(0, 6).join('\n'),
  ].filter(Boolean).join('\n');

  async function copiar() {
    try { await navigator.clipboard.writeText(detalhes); setCopiado(true); } catch { /* sem permissão */ }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-rose-200 bg-superficie p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-rose-600" />
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Esta tela encontrou um erro</h1>
          <p className="mt-1 text-sm text-slate-600">
            Nada foi perdido do que já estava gravado. Tente de novo; se repetir, copie os detalhes e mande ao suporte.
          </p>
        </div>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{detalhes}</pre>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-lg bg-acao px-3 py-2 text-sm text-white hover:bg-acao-escura">
          <RotateCcw className="h-4 w-4" /> Tentar de novo
        </button>
        <button type="button" onClick={copiar}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-superficie px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          <Copy className="h-4 w-4" /> {copiado ? 'Copiado' : 'Copiar detalhes'}
        </button>
      </div>
    </div>
  );
}
