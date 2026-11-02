'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, MailCheck, Send } from 'lucide-react';
import { MolduraAcesso } from '@/components/portal/moldura-acesso';
import { formatarDocumento } from '@/lib/documento';

export function RecuperarSenha({ logoUrl }: { logoUrl: string | null }) {
  const [documento, setDocumento] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const digitos = documento.replace(/\D/g, '');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch('/api/portal/recuperar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf_cnpj: digitos }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'Não consegui enviar o pedido');
      setMensagem(json.mensagem);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <MolduraAcesso logoUrl={logoUrl} titulo="Esqueci minha senha" subtitulo="Portal do associado">
      {mensagem ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0" /> <span>{mensagem}</span>
          </p>
          <Link href="/portal/login" className="block text-center text-sm font-semibold text-cyan-700 hover:underline">
            Voltar para a entrada
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <p className="text-sm text-slate-600">
            Informe o seu CPF ou CNPJ. Vamos enviar um link para o e-mail do seu cadastro para você criar uma nova senha.
          </p>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">CPF ou CNPJ</span>
            <input
              value={documento}
              autoFocus
              inputMode="numeric"
              autoComplete="username"
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, '').slice(0, 14);
                setDocumento(formatarDocumento(d, d.length > 11 ? 'PJ' : 'PF'));
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center font-mono text-[1rem] tracking-wide outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            />
          </label>
          {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[0.7812rem] text-rose-700">{erro}</p>}
          <button
            type="submit"
            disabled={enviando || digitos.length < 11}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-acao px-4 py-3 text-[0.875rem] font-semibold text-white transition hover:bg-acao-escura disabled:opacity-50"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar o link
          </button>
          <Link href="/portal/login" className="block text-center text-sm text-slate-600 hover:underline">
            Voltar para a entrada
          </Link>
        </form>
      )}
    </MolduraAcesso>
  );
}
