'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Send, MessageSquare } from 'lucide-react';
import {
  useMemoConversas, useMemoMensagens, useResponderMemo, useMarcarConversaLida,
} from '@/hooks/use-memos';
import { ordenarConversas } from '@/lib/memos';
import { formatDate } from '@/lib/utils';

/**
 * A conversa de um comunicado (0058).
 *
 * Dois papeis na MESMA peca, porque e o mesmo papo visto dos dois lados:
 *   . `modo="minha"`   — quem RECEBEU o comunicado devolve o recado;
 *   . `modo="autor"`   — quem PUBLICOU escolhe com quem falar (uma conversa por
 *                        destinatario) e responde dentro dela.
 * Abrir a conversa ja da ciencia do que o outro lado escreveu — pedir mais um
 * clique para isso so faria o contador mentir.
 */
export function ConversaMemo({
  memoId, modo, compacta = false,
}: {
  memoId: string;
  modo: 'minha' | 'autor';
  /** dentro do mural o espaco e curto; na tela da gestao pode respirar */
  compacta?: boolean;
}) {
  const conversas = useMemoConversas(modo === 'autor' ? memoId : null);
  const [com, setCom] = useState<string | null>(null);
  const lista = ordenarConversas(conversas.data ?? []);

  // Quem publicou cai direto na conversa que esta esperando resposta.
  useEffect(() => {
    if (modo === 'autor' && !com && lista.length) setCom(lista[0].com_usuario_id);
  }, [modo, com, lista]);

  if (modo === 'autor') {
    if (conversas.isLoading) {
      return <p className="text-sm text-slate-400">Carregando conversas...</p>;
    }
    if (!lista.length) {
      return (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
          Ninguem respondeu este comunicado ainda.
        </p>
      );
    }
    return (
      <div className="grid gap-3 md:grid-cols-[220px_1fr]">
        <ul className="space-y-1">
          {lista.map((c) => (
            <li key={c.com_usuario_id}>
              <button
                onClick={() => setCom(c.com_usuario_id)}
                className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                  com === c.com_usuario_id
                    ? 'border-cyan-400 bg-cyan-50/40'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">{c.pessoa}</span>
                  {c.nao_lidas > 0 && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">
                      {c.nao_lidas}
                    </span>
                  )}
                </span>
                <span className="block truncate text-[11px] text-slate-400">
                  {c.unidade ?? 'Matriz'} · {c.mensagens} msg
                </span>
              </button>
            </li>
          ))}
        </ul>
        {com && <Thread memoId={memoId} comUsuario={com} compacta={compacta} />}
      </div>
    );
  }

  return <Thread memoId={memoId} comUsuario={null} compacta={compacta} />;
}

function Thread({
  memoId, comUsuario, compacta,
}: {
  memoId: string;
  comUsuario: string | null;
  compacta: boolean;
}) {
  const { data: mensagens, isLoading } = useMemoMensagens(memoId, comUsuario);
  const responder = useResponderMemo();
  const marcarLida = useMarcarConversaLida();
  const [texto, setTexto] = useState('');

  // Ler e dar ciencia: o contador do mural nao pode ficar aceso depois que a
  // pessoa ja leu. `mutate` sem retorno visivel — falhar aqui nao atrapalha.
  useEffect(() => {
    if (!isLoading && (mensagens ?? []).some((m) => !m.minha && !m.lida_em)) {
      marcarLida.mutate({ memoId, comUsuario });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, mensagens, memoId, comUsuario]);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    responder.mutate(
      { memoId, mensagem: texto, comUsuario },
      {
        onSuccess: () => { setTexto(''); },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <div className="space-y-2">
      <div className={`space-y-2 overflow-y-auto ${compacta ? 'max-h-48' : 'max-h-72'}`}>
        {isLoading && <p className="text-sm text-slate-400">Carregando...</p>}
        {!isLoading && (mensagens ?? []).length === 0 && (
          <p className="flex items-center gap-1.5 text-sm text-slate-400">
            <MessageSquare className="h-3.5 w-3.5" /> Nenhuma mensagem ainda — escreva a primeira.
          </p>
        )}
        {(mensagens ?? []).map((m) => (
          <div key={m.id} className={`flex ${m.minha ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                m.minha ? 'bg-acao text-white' : 'bg-fundo text-slate-800'
              }`}
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.mensagem}</p>
              <p className={`mt-0.5 text-[10px] ${m.minha ? 'text-white/70' : 'text-slate-400'}`}>
                {m.autor} · {formatDate(m.created_at)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={enviar} className="flex items-end gap-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={compacta ? 2 : 3}
          placeholder="Escreva a sua resposta..."
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-superficie px-2.5 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={responder.isPending || !texto.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-acao px-3 py-2 text-xs font-semibold text-white transition hover:bg-acao-escura disabled:opacity-60"
        >
          {responder.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Responder
        </button>
      </form>
    </div>
  );
}
