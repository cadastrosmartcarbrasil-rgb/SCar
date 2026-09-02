'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogIn, ShieldCheck } from 'lucide-react';
import { LogoSmartCar } from '@/components/hotlink/marca';
import { formatarDocumento } from '@/lib/documento';

/**
 * Entrada do Portal do Associado: CPF/CNPJ + senha.
 * No PRIMEIRO acesso a senha e o proprio documento — e o portal exige a troca
 * antes de mostrar qualquer dado (ver `TrocaSenhaObrigatoria`).
 */
export default function PortalLoginPage() {
  const router = useRouter();
  const [documento, setDocumento] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const digitos = documento.replace(/\D/g, '');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf_cnpj: digitos, senha }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'Nao consegui entrar');
      router.push('/portal');
      router.refresh();
    } catch (err) {
      setErro((err as Error).message);
      setEnviando(false);
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto flex max-w-5xl justify-center px-4 py-6">
        <LogoSmartCar url={null} className="h-16 w-auto object-contain sm:h-20" />
      </div>

      <section className="relative overflow-hidden bg-brand-700">
        <div
          className="absolute inset-0 bg-[radial-gradient(120%_120%_at_15%_0%,#2C3E66_0%,#16213D_55%,#0E1730_100%)]"
          aria-hidden
        />
        <div
          className="absolute inset-x-0 bottom-0 h-14 bg-white"
          style={{ clipPath: 'polygon(0 62%, 100% 0, 100% 100%, 0 100%)' }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-md px-4 pb-24 pt-10">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.25em] text-cyan-400">
            Area do associado
          </p>
          <h1 className="mt-2 text-center text-[26px] font-light uppercase leading-tight tracking-tight text-white">
            Seus veiculos e<br /><span className="font-bold">suas mensalidades</span>
          </h1>

          <form
            onSubmit={onSubmit}
            className="mt-7 space-y-3 rounded-2xl bg-white p-6 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.5)]"
          >
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                CPF ou CNPJ
              </span>
              <input
                value={documento}
                autoFocus
                inputMode="numeric"
                autoComplete="username"
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, '').slice(0, 14);
                  setDocumento(formatarDocumento(d, d.length > 11 ? 'PJ' : 'PF'));
                }}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-center font-mono text-[16px] tracking-wide outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Senha
              </span>
              <input
                type="password" value={senha} autoComplete="current-password"
                onChange={(e) => setSenha(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-[14px] outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              />
            </label>

            {erro && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{erro}</p>
            )}

            <button
              type="submit"
              disabled={enviando || digitos.length < 11 || !senha}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-[14px] font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Entrar
            </button>

            <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-slate-500">
              <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-cyan-600" />
              <span>
                <b>Primeiro acesso?</b> Use o seu CPF tambem como senha. Vamos pedir que voce crie
                uma senha sua logo em seguida.
              </span>
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
