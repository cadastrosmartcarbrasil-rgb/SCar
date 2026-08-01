'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// Login do painel administrativo (staff): e-mail + senha.
// useSearchParams exige um limite de Suspense para a geracao estatica.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    router.push(params.get('redirect') ?? '/dashboard');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center gap-2 pb-2">
          <div className="rounded-xl bg-brand-600 p-2 text-white">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">SCar - Painel de Gestao</h1>
          <p className="text-xs text-slate-500">Acesso restrito a equipe</p>
        </div>

        <div>
          <label className="text-sm text-slate-600">E-mail</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm text-slate-600">Senha</label>
          <input
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>

        <p className="text-center text-xs text-slate-400">
          E associado?{' '}
          <a href="/portal/login" className="text-brand-600 hover:underline">
            Acesse o Portal do Associado
          </a>
        </p>
      </form>
    </div>
  );
}
