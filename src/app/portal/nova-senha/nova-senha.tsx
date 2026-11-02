'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2 } from 'lucide-react';
import { MolduraAcesso } from '@/components/portal/moldura-acesso';
import { createClient } from '@/lib/supabase/client';
import { problemaDaNovaSenha } from '@/lib/portal-senha';

export function NovaSenha({ logoUrl, tokenHash }: { logoUrl: string | null; tokenHash: string | null }) {
  const router = useRouter();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [linkInvalido, setLinkInvalido] = useState(!tokenHash);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problema = problemaDaNovaSenha(senha, confirmacao);
    if (problema) { setErro(problema); return; }
    setErro(null);
    setEnviando(true);
    try {
      const supabase = createClient();
      const { error: erroToken } = await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: 'recovery' });
      if (erroToken) { setLinkInvalido(true); return; }
      const res = await fetch('/api/portal/senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha, confirmacao }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'Não consegui gravar a senha');
      router.push('/portal');
      router.refresh();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  if (linkInvalido) {
    return (
      <MolduraAcesso logoUrl={logoUrl} titulo="Link vencido ou já usado" subtitulo="Portal do associado">
        <p className="text-sm text-slate-600">
          Este link não vale mais: ele dura pouco tempo e só pode ser usado uma vez. Peça um novo link.
        </p>
        <Link href="/portal/recuperar" className="flex w-full items-center justify-center rounded-lg bg-acao px-4 py-3 text-[0.875rem] font-semibold text-white hover:bg-acao-escura">
          Pedir um novo link
        </Link>
      </MolduraAcesso>
    );
  }

  return (
    <MolduraAcesso logoUrl={logoUrl} titulo="Crie a sua nova senha" subtitulo="Portal do associado">
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Nova senha</span>
          <input
            type="password" value={senha} autoFocus autoComplete="new-password"
            onChange={(e) => setSenha(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[0.875rem] outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Repita a nova senha</span>
          <input
            type="password" value={confirmacao} autoComplete="new-password"
            onChange={(e) => setConfirmacao(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[0.875rem] outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
          />
        </label>
        <p className="text-[0.7188rem] text-slate-500">Mínimo de 8 caracteres, com letras e números.</p>
        {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[0.7812rem] text-rose-700">{erro}</p>}
        <button
          type="submit"
          disabled={enviando || !senha || !confirmacao}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-acao px-4 py-3 text-[0.875rem] font-semibold text-white transition hover:bg-acao-escura disabled:opacity-50"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Gravar e entrar
        </button>
      </form>
    </MolduraAcesso>
  );
}
