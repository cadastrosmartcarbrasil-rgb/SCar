import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { abasConfiguracoesPermitidas } from '@/lib/permissoes';

// A primeira aba que a pessoa abre (o admin cai em Regionais, como antes).
export default async function ConfiguracoesIndex() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: perfil } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (perfil?.papel === 'admin') redirect('/configuracoes/regionais');
  const { data: permissoes } = await supabase.rpc('minhas_permissoes');
  const permitidas = abasConfiguracoesPermitidas(false, permissoes) ?? [];
  redirect(permitidas[0] ?? '/configuracoes/regionais');
}
