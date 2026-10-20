import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { logoOficial } from '@/lib/marca-server';
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

  const [{ data }, logoUrl, { data: acessoAtivo }, { data: staff }] = await Promise.all([
    supabase.rpc('vendedor_perfil', {}),
    logoOficial(),
    supabase.rpc('usuario_acesso_ativo', {}),
    // O papel na equipe: quem tambem administra precisa de porta de volta.
    supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle(),
  ]);
  const perfil = data?.[0] ?? null;

  if (!perfil) {
    // Duas causas, dois textos. Desde a 0068 o acesso desativado tambem derruba
    // o portal do vendedor — mandar essa pessoa "pedir para vincular o acesso"
    // seria empurra-la para o lugar errado.
    const desativado = acessoAtivo === false;
    return (
      <main className="grid min-h-screen place-items-center bg-fundo px-4">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-superficie p-6 text-center">
          <p className="text-sm font-semibold text-slate-800">
            {desativado ? 'Acesso desativado' : 'Cadastro de vendedor não encontrado'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {desativado ? (
              <>
                O seu acesso foi desativado pela administração. O seu histórico continua no
                sistema — peça a um administrador para reativa-lo em Configurações &rarr; Usuários.
              </>
            ) : (
              <>
                Este login ainda não está ligado a um cadastro de vendedor ativo. Peça a sua
                franquia para vincular o acesso em Configurações &rarr; Vendedores.
              </>
            )}
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
      logoUrl={logoUrl}
      papelStaff={staff?.papel ?? null}
    >
      {children}
    </ShellVendedor>
  );
}
