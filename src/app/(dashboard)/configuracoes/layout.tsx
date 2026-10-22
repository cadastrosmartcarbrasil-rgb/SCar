import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ConfigTabs } from '@/components/configuracoes/config-tabs';
import { AbasPermitidas } from '@/components/configuracoes/abas-permitidas';
import { abasConfiguracoesPermitidas } from '@/lib/permissoes';

// Configuracoes: o admin abre tudo. Os demais so as abas liberadas no perfil
// ou como extra (0141 — Ver/Editar por aba; Termos pela 0123). Usuarios e
// permissoes continua so do admin.
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
    const { data: permissoes } = await supabase.rpc('minhas_permissoes');
    const permitidas = abasConfiguracoesPermitidas(false, permissoes) ?? [];
    if (permitidas.length > 0) {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-semibold text-slate-900">Configurações</h1>
          <ConfigTabs somente={permitidas} />
          <AbasPermitidas permitidas={permitidas} permissoes={permissoes ?? []}>{children}</AbasPermitidas>
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Acesso restrito. Seu perfil não tem nenhuma aba das Configurações liberada.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Configurações</h1>
      <ConfigTabs />
      <div>{children}</div>
    </div>
  );
}
