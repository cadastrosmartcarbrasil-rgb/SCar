import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Cria ou redefine o acesso do vendedor ao portal.
 * Usa a admin API (service_role) NO SERVIDOR — a senha nunca passa pelo cliente
 * com privilegio. Só admin/gestor da regional pode chamar.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  const { data: perfil } = await supabase
    .from('usuarios').select('papel, regional_id').eq('id', auth.user.id).single();
  if (!perfil || !['admin', 'gestor_regional', 'financeiro'].includes(perfil.papel)) {
    return NextResponse.json(
      { error: 'Apenas admin, financeiro ou gestor regional podem dar acesso ao portal.' },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? '').trim().toLowerCase();
  const senha = String(body?.senha ?? '');
  const vendedorId = String(body?.vendedorId ?? '');

  if (!vendedorId) return NextResponse.json({ error: 'Vendedor nao informado' }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
    return NextResponse.json({ error: 'E-mail invalido' }, { status: 400 });
  }
  if (senha.length < 8) {
    return NextResponse.json({ error: 'A senha precisa de ao menos 8 caracteres' }, { status: 400 });
  }

  const { data: vendedor } = await supabase
    .from('vendedores').select('id, nome, regional_id, usuario_id').eq('id', vendedorId).single();
  if (!vendedor) return NextResponse.json({ error: 'Vendedor nao encontrado' }, { status: 404 });

  // Gestor regional so mexe na propria regional.
  if (perfil.papel === 'gestor_regional' && vendedor.regional_id !== perfil.regional_id) {
    return NextResponse.json({ error: 'Vendedor de outra regional' }, { status: 403 });
  }

  const admin = createAdminClient();

  // Ja tem acesso: apenas troca a senha.
  if (vendedor.usuario_id) {
    const { error } = await admin.auth.admin.updateUserById(vendedor.usuario_id, { password: senha });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ usuario_id: vendedor.usuario_id, acao: 'senha_redefinida' });
  }

  const { data: criado, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: {
      nome: vendedor.nome,
      papel: 'consultor_vendas',
      regional_id: vendedor.regional_id,
    },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // O trigger fn_handle_new_user provisiona public.usuarios pelo metadata.
  const { error: vincErr } = await admin
    .from('vendedores').update({ usuario_id: criado.user.id, email }).eq('id', vendedorId);
  if (vincErr) return NextResponse.json({ error: vincErr.message }, { status: 400 });

  return NextResponse.json({ usuario_id: criado.user.id, acao: 'acesso_criado' });
}
