import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ConfigTabs } from '@/components/configuracoes/config-tabs';

// Area de configuracoes: restrita a administradores.
export default async function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('papel')
    .eq('id', user.id)
    .maybeSingle();

  if (perfil?.papel !== 'admin') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Acesso restrito. Somente administradores podem acessar as Configuracoes.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Configuracoes</h1>
      <ConfigTabs />
      <div>{children}</div>
    </div>
  );
}
