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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }

    // Cada perfil entra na sua casa: o gestor de franquia no portal da
    // unidade, o vendedor no portal dele. Um `redirect` explicito na URL
    // sempre vence.
    let destino = params.get('redirect');
    if (!destino && data.user) {
      const { data: perfil } = await supabase
        .from('usuarios').select('papel, regional_id').eq('id', data.user.id).maybeSingle();
      if (perfil?.papel === 'gestor_regional' && perfil.regional_id) {
        destino = '/regional';
      } else {
        const { data: vendedorId } = await supabase.rpc('vendedor_atual', {});
        destino = vendedorId ? '/vendedor' : '/dashboard';
      }
    }
    setLoading(false);
    router.push(destino ?? '/dashboard');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl bg-superficie p-8 shadow-sm">
        <div className="flex flex-col items-center gap-2 pb-2">
          <div className="rounded-xl bg-acao p-2 text-white">
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
          className="w-full rounded-md bg-acao py-2 text-sm font-medium text-white hover:bg-acao-escura disabled:opacity-60"
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
