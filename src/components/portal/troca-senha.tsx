'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { LogoSmartCar } from '@/components/hotlink/marca';

/**
 * Troca obrigatoria da senha no primeiro acesso.
 *
 * Ocupa a tela inteira de proposito: enquanto a senha for o CPF, qualquer
 * pessoa que saiba o documento entra na conta. Nenhum dado do associado aparece
 * antes da troca.
 */
export function TrocaSenhaObrigatoria({ nome, logoUrl }: {
  nome: string; logoUrl?: string | null;
}) {
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const curta = senha.length > 0 && senha.length < 8;
  const soNumeros = senha.length > 0 && /^\d+$/.test(senha);
  const naoConfere = confirmacao.length > 0 && senha !== confirmacao;
  const podeEnviar = senha.length >= 8 && !soNumeros && senha === confirmacao;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch('/api/portal/senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha, confirmacao }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'Não consegui trocar a senha');
      toast.success('Senha alterada. Bem-vindo!');
      window.location.href = '/portal';
    } catch (err) {
      setErro((err as Error).message);
      setEnviando(false);
    }
  }

  return (
    <main className="min-h-screen bg-fundo">
      <div className="bg-superficie">
        <div className="mx-auto flex max-w-4xl justify-center px-4 py-5">
          <LogoSmartCar url={logoUrl} className="h-14 w-auto object-contain" />
        </div>
        <div className="h-1 bg-faixa" />
      </div>

      <div className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-2xl bg-superficie p-6 shadow-[0_10px_40px_-12px_rgba(20,33,61,0.25)] ring-1 ring-slate-200/70">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-cyan-50 text-cyan-600">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <h1 className="mt-3 text-xl font-bold text-brand-800">Crie a sua senha</h1>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-slate-500">
            Olá, {nome.split(' ')[0]}. Você entrou com o seu CPF como senha — e ele não protege a
            sua conta. Escolha uma senha sua antes de continuar.
          </p>

          <form onSubmit={enviar} className="mt-5 space-y-3">
            <label className="block">
              <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-500">
                Nova senha
              </span>
              <input
                type="password" value={senha} autoFocus autoComplete="new-password"
                onChange={(e) => setSenha(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-[0.875rem] outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              />
              <span className={`mt-1 block text-[0.6875rem] ${curta || soNumeros ? 'text-amber-700' : 'text-slate-400'}`}>
                {soNumeros
                  ? 'Use letras também — só números e fácil de adivinhar.'
                  : 'Pelo menos 8 caracteres, com letras e números.'}
              </span>
            </label>

            <label className="block">
              <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-500">
                Repita a senha
              </span>
              <input
                type="password" value={confirmacao} autoComplete="new-password"
                onChange={(e) => setConfirmacao(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-[0.875rem] outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              />
              {naoConfere && (
                <span className="mt-1 block text-[0.6875rem] text-rose-600">As senhas não conferem.</span>
              )}
            </label>

            {erro && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-[0.7812rem] text-rose-700">{erro}</p>
            )}

            <button
              type="submit" disabled={!podeEnviar || enviando}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-acao px-4 py-3 text-[0.875rem] font-semibold text-white transition hover:bg-acao-escura disabled:opacity-50"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Salvar e entrar
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
