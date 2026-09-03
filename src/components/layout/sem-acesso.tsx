'use client';

import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// Tela exibida quando o usuario esta autenticado mas ainda nao tem perfil de
// equipe (usuarios) nem cadastro de associado (clientes). Evita loop de redirecionamento.
export function SemAcesso({ email }: { email: string }) {
  const router = useRouter();
  const supabase = createClient();

  async function sair() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-xl bg-superficie p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <ShieldAlert className="h-6 w-6 text-amber-600" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">Conta sem permissao</h1>
        <p className="mt-2 text-sm text-slate-600">
          A conta <strong>{email}</strong> esta autenticada, mas ainda nao tem um perfil de acesso
          configurado. Peca a um administrador para vincular seu usuario a um papel (equipe) ou a um
          cadastro de associado.
        </p>
        <button
          onClick={sair}
          className="mt-6 rounded-md bg-acao px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
