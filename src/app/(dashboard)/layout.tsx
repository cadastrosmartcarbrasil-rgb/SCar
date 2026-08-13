import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import { SemAcesso } from '@/components/layout/sem-acesso';

// Layout do painel de gestao. Garante sessao de staff (perfil em usuarios).
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Confirma que o usuario e da equipe interna (e nao apenas um associado).
  const { data: perfil } = await supabase
    .from('usuarios')
    .select('nome, papel')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil) {
    // Nao e staff: se for associado (cliente), vai ao portal; senao, sem acesso.
    // Esse teste evita o loop de redirecionamento dashboard <-> portal.
    const { data: cliente } = await supabase
      .from('clientes')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (cliente) redirect('/portal');
    return <SemAcesso email={user.email ?? ''} />;
  }

  const { data: empresa } = await supabase.from('empresa').select('logo_url, nome_fantasia').limit(1).maybeSingle();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar papel={perfil.papel} logoUrl={empresa?.logo_url ?? null} />
      <div className="min-w-0 flex-1">
        <header className="hidden items-center justify-between border-b border-slate-200 bg-white px-8 py-3 md:flex">
          <span className="text-sm text-slate-500">Painel de Gestao</span>
          <span className="text-sm font-medium text-slate-700">
            {perfil.nome} · <span className="text-slate-400">{perfil.papel}</span>
          </span>
        </header>
        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
