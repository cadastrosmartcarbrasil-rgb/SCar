import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Login do Portal do Associado por CPF/CNPJ + senha.
// Resolve o e-mail de auth vinculado ao cliente (via admin, sem expor o e-mail)
// e efetua o signIn no server client, que grava os cookies de sessao.
export async function POST(request: Request) {
  const { cpf_cnpj, senha } = await request.json();
  if (!cpf_cnpj || !senha) {
    return NextResponse.json({ error: 'Informe CPF/CNPJ e senha.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: cliente } = await admin
    .from('clientes')
    .select('auth_user_id')
    .eq('cpf_cnpj', String(cpf_cnpj).replace(/\D/g, ''))
    .maybeSingle();

  if (!cliente?.auth_user_id) {
    return NextResponse.json({ error: 'Credenciais invalidas.' }, { status: 401 });
  }

  // Recupera o e-mail do usuario de auth para efetuar o login por senha.
  const { data: authUser } = await admin.auth.admin.getUserById(cliente.auth_user_id);
  const email = authUser.user?.email;
  if (!email) {
    return NextResponse.json({ error: 'Credenciais invalidas.' }, { status: 401 });
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) {
    return NextResponse.json({ error: 'Credenciais invalidas.' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
