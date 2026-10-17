import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { SemAcesso } from '@/components/layout/sem-acesso';
import { GuardaModulo } from '@/components/layout/guarda-modulo';

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
    .select('nome, papel, ativo')
    .eq('id', user.id)
    .maybeSingle();

  // Acesso cortado (0068): `is_staff()` ja recusa esta pessoa no banco, entao
  // sem esta parada ela entraria num painel VAZIO, sem explicacao nenhuma.
  // A policy `usuarios_select_self` continua deixando ela ler a propria linha
  // justamente para a tela conseguir dizer o que houve.
  if (perfil && perfil.ativo === false) {
    return <SemAcesso email={user.email ?? ''} nome={perfil.nome} motivo="desativado" />;
  }

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
  // Permissoes do perfil (0111): o VER esconde o modulo do menu e barra a tela.
  // Se a leitura falhar, nao esconde nada (o banco continua decidindo o dado).
  const { data: permissoes } = await supabase.rpc('minhas_permissoes');

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar papel={perfil.papel} logoUrl={empresa?.logo_url ?? null} permissoes={permissoes ?? null} />
      <div className="min-w-0 flex-1">
        <Topbar nome={perfil.nome} papel={perfil.papel} />
        <main className="mx-auto w-full max-w-[1600px] p-4 md:p-8">
          <GuardaModulo permissoes={permissoes ?? null}>{children}</GuardaModulo>
        </main>
      </div>
    </div>
  );
}
