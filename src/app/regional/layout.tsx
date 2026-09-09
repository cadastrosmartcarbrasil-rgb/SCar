import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SidebarRegional } from '@/components/regional/sidebar-regional';
import { SelecionarUnidade, type UnidadeEscolhivel } from '@/components/regional/selecionar-unidade';
import { UnidadeProvider } from '@/components/regional/contexto-unidade';
import { COOKIE_UNIDADE, decidirUnidade, localDaUnidade, temAcessoGlobal } from '@/lib/unidade';

/**
 * Portal da Franquia.
 *
 * Quem entra:
 *  . `gestor_regional` — SEMPRE na propria unidade (o cadastro dele manda);
 *  . admin/financeiro (matriz) — em QUALQUER unidade, mas escolhendo uma por
 *    vez na tela de selecao. O sistema de gestao e a matriz; a franquia se
 *    administra por este portal, e e por aqui que a matriz entra nela.
 *
 * A escolha vive num cookie so para a TELA saber o que mostrar. O dado quem
 * decide e o `escopo_regional()` no banco: para quem nao tem acesso global ele
 * ignora o id pedido e devolve a unidade do proprio cadastro.
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
    .from('empresa').select('logo_url, razao_social').limit(1).maybeSingle();

  const { data: regionais } = await supabase
    .from('regionais').select('id, nome, codigo, endereco, ativo').order('nome');
  const lista = regionais ?? [];

  const escolha = decidirUnidade(
    { papel: perfil.papel, regional_id: perfil.regional_id },
    cookies().get(COOKIE_UNIDADE)?.value,
    lista.map((r) => r.id),
  );

  if (escolha.modo === 'SEM_UNIDADE') {
    return (
      <main className="grid min-h-screen place-items-center bg-fundo px-4">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-superficie p-6 text-center">
          <p className="text-sm font-semibold text-slate-800">Unidade nao vinculada</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Seu usuario e de gestor regional, mas nao esta vinculado a nenhuma franquia.
            Peca a matriz para definir a unidade no seu cadastro.
          </p>
        </div>
      </main>
    );
  }

  if (escolha.modo === 'ESCOLHER') {
    const nomeMatriz = (empresa?.razao_social ?? '').trim().toUpperCase();
    // A matriz so entra em unidade EM OPERACAO (0067). O gestor amarrado a uma
    // unidade inativada nao passa por aqui — quem decide para ele e o
    // `regional_id` do cadastro, nao este seletor.
    const unidades: UnidadeEscolhivel[] = lista.filter((r) => r.ativo !== false).map((r) => ({
      id: r.id,
      nome: r.nome,
      local: localDaUnidade(r.endereco),
      codigo: r.codigo,
      matriz: !!nomeMatriz && r.nome.trim().toUpperCase() === nomeMatriz,
    }));
    return (
      <SelecionarUnidade unidades={unidades} nome={perfil.nome} logoUrl={empresa?.logo_url ?? null} />
    );
  }

  const unidade = lista.find((r) => r.id === escolha.regionalId);

  return (
    <UnidadeProvider
      valor={{
        regionalId: escolha.regionalId,
        nome: unidade?.nome ?? 'Unidade',
        codigo: unidade?.codigo ?? null,
        podeTrocar: temAcessoGlobal(perfil.papel),
      }}
    >
      <div className="flex min-h-screen flex-col md:flex-row">
        <SidebarRegional
          nome={perfil.nome}
          unidade={unidade?.nome ?? 'Unidade'}
          papel={perfil.papel}
          logoUrl={empresa?.logo_url ?? null}
          podeTrocarUnidade={temAcessoGlobal(perfil.papel)}
        />
        <div className="min-w-0 flex-1 bg-fundo">
          <div className="mx-auto max-w-6xl p-4 md:p-8">{children}</div>
        </div>
      </div>
    </UnidadeProvider>
  );
}
