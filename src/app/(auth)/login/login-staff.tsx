'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { LogoSmartCar } from '@/components/hotlink/marca';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeLogin, ehSessaoCorrompida, destinoDoLogin } from '@/lib/auth-mensagens';
import { destinoAposLogin } from '@/lib/acesso';

// Formulario do login do painel administrativo (staff): e-mail + senha.
// A pagina (page.tsx, server) busca a logo oficial e passa por prop.
// useSearchParams exige um limite de Suspense para a geracao estatica.
export function LoginStaff({ logoUrl }: { logoUrl: string | null }) {
  return (
    <Suspense>
      <LoginForm logoUrl={logoUrl} />
    </Suspense>
  );
}

function LoginForm({ logoUrl }: { logoUrl: string | null }) {
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

  const campo =
    'mt-1 w-full rounded-lg border border-slate-300 bg-superficie px-3 py-2.5 text-sm text-slate-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30';

  return (
    <div className="grid min-h-screen bg-fundo md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Painel da marca: navy chapado, a única área de cor da tela. */}
      <aside className="cockpit hidden flex-col justify-between p-12 md:flex">
        <div className="w-fit rounded-lg bg-white px-4 py-3">
          <LogoSmartCar url={logoUrl} className="h-12 w-auto object-contain" />
        </div>
        <div>
          <p className="font-display text-3xl font-semibold leading-tight text-white">
            Associados, veículos e cobrança num só painel.
          </p>
          <p className="mt-3 max-w-md text-sm text-white/70">
            Atendimento, assistência 24h, eventos e financeiro da Smart Car Brasil, com o acesso de cada pessoa conforme o seu perfil.
          </p>
        </div>
        <p className="text-xs text-white/60">Smart Car Brasil</p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
          <div className="md:hidden">
            <LogoSmartCar url={logoUrl} className="mb-6 h-14 w-auto object-contain" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold text-slate-900">Entrar no painel</h1>
            <p className="mt-1 text-sm text-slate-500">Acesso restrito à equipe.</p>
          </div>

          <div>
            <label htmlFor="email" className="text-sm font-medium text-slate-700">E-mail</label>
            <input
              id="email"
              type="email"
              name="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={campo}
            />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-medium text-slate-700">Senha</label>
            <input
              id="password"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className={campo}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-acao py-2.5 text-sm font-semibold text-white transition-colors hover:bg-acao-escura disabled:opacity-60"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          <p className="text-sm text-slate-500">
            É associado?{' '}
            <a href="/portal/login" className="font-medium text-cyan-700 hover:underline">
              Acesse o Portal do Associado
            </a>
          </p>
        </form>
      </main>
    </div>
  );
}
