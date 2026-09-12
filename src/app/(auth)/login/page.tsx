'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeLogin, ehSessaoCorrompida, destinoDoLogin } from '@/lib/auth-mensagens';
import { destinoAposLogin } from '@/lib/acesso';

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
      // Sessao morta guardada no navegador trava o proximo login: o cliente
      // fica tentando renovar um token que o servidor ja recusou. Limpar SO o
      // lado local resolve, e o proximo clique entra normalmente.
      if (ehSessaoCorrompida(error.message)) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      }
      setLoading(false);
      toast.error(mensagemDeLogin(error.message));
      return;
    }

    // Cada perfil entra na sua casa: a matriz no painel de gestao, o gestor de
    // franquia no portal da unidade, o vendedor no portal dele. A ordem das
    // perguntas esta em `destinoAposLogin` (testada) — acesso global vence o
    // cadastro de vendedor.
    // Um `redirect` explicito na URL sempre vence: `destinoDoLogin` so deixa
    // passar caminho interno (ver o porque em auth-mensagens.ts).
    let destino: string = destinoDoLogin(params.get('redirect'), '');
    if (!destino && data.user) {
      const [{ data: perfil }, { data: vendedorId }] = await Promise.all([
        supabase.from('usuarios').select('papel, regional_id').eq('id', data.user.id).maybeSingle(),
        supabase.rpc('vendedor_atual', {}),
      ]);
      destino = destinoAposLogin(perfil, Boolean(vendedorId));
    }
    setLoading(false);
    router.push(destino || '/dashboard');
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
            name="email"
            autoComplete="username"
            autoFocus
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
            name="password"
            autoComplete="current-password"
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
