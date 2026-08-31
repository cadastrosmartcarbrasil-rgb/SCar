import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ShellVendedor } from '@/components/vendedor/shell-vendedor';

/**
 * Portal do vendedor.
 * Entra quem tem um cadastro ATIVO em `vendedores` ligado ao proprio login.
 * A identidade vem de `vendedor_atual()` no banco — nao de parametro de rota.
 */
export default async function VendedorLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data }, { data: empresa }] = await Promise.all([
    supabase.rpc('vendedor_perfil', {}),
    supabase.from('empresa').select('logo_url').limit(1).maybeSingle(),
  ]);
  const perfil = data?.[0] ?? null;

  if (!perfil) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#eef2f8] px-4">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center">
          <p className="text-sm font-semibold text-slate-800">Cadastro de vendedor nao encontrado</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Este login ainda nao esta ligado a um cadastro de vendedor ativo. Peca a sua franquia
            para vincular o acesso em Configuracoes &rarr; Vendedores.
          </p>
        </div>
      </main>
    );
  }

  return (
    <ShellVendedor
      nome={perfil.nome ?? 'Vendedor'}
      unidade={perfil.regional_nome}
      codigo={perfil.codigo}
      logoUrl={empresa?.logo_url ?? null}
    >
      {children}
    </ShellVendedor>
  );
}
