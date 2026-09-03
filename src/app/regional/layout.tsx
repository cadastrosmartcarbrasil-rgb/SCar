import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SidebarRegional } from '@/components/regional/sidebar-regional';

/**
 * Portal da Franquia.
 * Entra quem tem papel `gestor_regional` COM regional definida no cadastro.
 * Admin/financeiro tambem entram (para dar suporte), mas o que eles veem
 * continua limitado pelo escopo do banco.
 */
export default async function RegionalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('usuarios').select('nome, papel, regional_id').eq('id', user.id).maybeSingle();

  if (!perfil) redirect('/login');
  if (!['gestor_regional', 'admin', 'financeiro'].includes(perfil.papel)) redirect('/dashboard');

  const { data: empresa } = await supabase
    .from('empresa').select('logo_url').limit(1).maybeSingle();

  const { data: regional } = perfil.regional_id
    ? await supabase.from('regionais').select('nome, codigo').eq('id', perfil.regional_id).maybeSingle()
    : { data: null };

  if (perfil.papel === 'gestor_regional' && !regional) {
    return (
      <main className="grid min-h-screen place-items-center bg-fundo px-4">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-superficie p-6 text-center">
          <p className="text-sm font-semibold text-slate-800">Unidade nao vinculada</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Seu usuario e de gestor regional, mas nao esta vinculado a nenhuma franquia.
            Peca a matriz para definir a regional no seu cadastro.
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <SidebarRegional
        nome={perfil.nome}
        unidade={regional?.nome ?? 'Matriz'}
        codigo={regional?.codigo ?? null}
        papel={perfil.papel}
        logoUrl={empresa?.logo_url ?? null}
      />
      <div className="min-w-0 flex-1 bg-fundo">
        <div className="mx-auto max-w-6xl p-4 md:p-8">{children}</div>
      </div>
    </div>
  );
}
