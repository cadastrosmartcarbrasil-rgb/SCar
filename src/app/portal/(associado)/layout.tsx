import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ShellPortal } from '@/components/portal/shell-portal';
import { TrocaSenhaObrigatoria } from '@/components/portal/troca-senha';

/**
 * Portal do Associado.
 * Entra quem tem cadastro em `clientes` ligado ao proprio login. Enquanto a
 * senha for a PROVISORIA (o CPF do primeiro acesso), a troca ocupa a tela
 * inteira — nenhum dado aparece antes disso.
 *
 * Este guard vive no grupo (associado) — que NAO entra na URL — e por isso
 * `/portal/login` fica de fora dele. Quando a tela de login estava sob este
 * layout, ela era inalcancavel nos dois sentidos: sem sessao o layout mandava
 * para /portal/login, que era a propria pagina (loop), e com sessao de staff
 * o redirect abaixo jogava para /dashboard. Ao criar tela nova do portal,
 * coloque-a AQUI DENTRO; o que for publico fica em src/app/portal/.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/portal/login');

  const { data } = await supabase.rpc('portal_perfil', {});
  const perfil = data?.[0] ?? null;

  if (!perfil) {
    // Logado, mas nao e associado (provavelmente staff).
    redirect('/dashboard');
  }

  const admin = createAdminClient();
  const { data: empresa } = await admin
    .from('empresa').select('logo_url').limit(1).maybeSingle();

  if (perfil.senha_provisoria) {
    return <TrocaSenhaObrigatoria nome={perfil.nome} logoUrl={empresa?.logo_url ?? null} />;
  }

  return (
    <ShellPortal nome={perfil.nome} logoUrl={empresa?.logo_url ?? null}>
      {children}
    </ShellPortal>
  );
}
