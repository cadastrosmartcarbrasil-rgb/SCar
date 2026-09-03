import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ThemeToggle } from '@/components/ui/theme-toggle';
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
        <header className="relative hidden items-center justify-between border-b border-slate-200 bg-superficie px-8 py-3.5 md:flex">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Painel de Gestao</span>
          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <div className="text-right leading-tight">
              <p className="text-[13px] font-semibold text-slate-800">{perfil.nome}</p>
              <p className="text-[11px] capitalize text-slate-400">{perfil.papel}</p>
            </div>
            {/* gradiente com os tokens que NAO invertem: o texto e branco nos
                dois temas, e `brand-*` clarearia no escuro */}
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-acao to-faixa text-xs font-bold text-white">
              {(perfil.nome ?? '?').slice(0, 2).toUpperCase()}
            </span>
          </div>
          <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[linear-gradient(90deg,#1E2B4D_0%,#139AD6_38%,#22A7E4_56%,transparent_92%)] opacity-80" />
        </header>
        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
