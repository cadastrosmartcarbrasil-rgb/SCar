import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';

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

  if (!perfil) redirect('/portal');

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-3">
          <span className="text-sm text-slate-500">Painel de Gestao</span>
          <span className="text-sm font-medium text-slate-700">
            {perfil.nome} · <span className="text-slate-400">{perfil.papel}</span>
          </span>
        </header>
        <main className="p-8">{children}</main>
      </div>
    </div>
  );
}
