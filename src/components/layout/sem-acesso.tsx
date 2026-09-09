'use client';

import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Tela para quem esta autenticado mas nao pode entrar. Dois casos, mensagens
 * diferentes de proposito:
 *
 *  - `motivo="sem-perfil"` (padrao): nao tem perfil de equipe nem cadastro de
 *    associado. Evita o loop de redirecionamento.
 *  - `motivo="desativado"`: TEM perfil, mas o acesso foi cortado (0068). Sem
 *    esta tela a pessoa entraria num painel vazio — a RLS devolve nada para
 *    quem nao e mais staff — e leria isso como "o sistema quebrou".
 */
export function SemAcesso({
  email,
  motivo = 'sem-perfil',
  nome,
}: {
  email: string;
  motivo?: 'sem-perfil' | 'desativado';
  nome?: string | null;
}) {
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
        <h1 className="text-lg font-semibold text-slate-900">
          {motivo === 'desativado' ? 'Acesso desativado' : 'Conta sem permissao'}
        </h1>
        {motivo === 'desativado' ? (
          <p className="mt-2 text-sm text-slate-600">
            O acesso de <strong>{nome || email}</strong> foi desativado pela administracao. O seu
            historico continua no sistema — para voltar a entrar, peca a um administrador para
            reativar o seu usuario em <strong>Configuracoes &rarr; Usuarios</strong>.
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            A conta <strong>{email}</strong> esta autenticada, mas ainda nao tem um perfil de acesso
            configurado. Peca a um administrador para vincular seu usuario a um papel (equipe) ou a um
            cadastro de associado.
          </p>
        )}
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
