import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ConfigTabs } from '@/components/configuracoes/config-tabs';
import { SoTermos } from '@/components/configuracoes/so-termos';

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
    // Termos (0123): quem recebeu "gerenciar modelos" como extra entra so ali.
    const { data: permissoes } = await supabase.rpc('minhas_permissoes');
    const termos = (permissoes ?? []).some((p) => p.startsWith('termos_modelos.'));
    if (termos) {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-semibold text-slate-900">Configuracoes</h1>
          <ConfigTabs somente={['/configuracoes/termos']} />
          <SoTermos>{children}</SoTermos>
        </div>
      );
    }
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
