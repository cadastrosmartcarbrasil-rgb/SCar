import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PapelUsuario } from '@/lib/database.types';

interface Body {
  nome: string;
  email: string;
  senha: string;
  papel: PapelUsuario;
  regional_id?: string | null;
}

// Cria um usuario da equipe (auth.users + perfil em usuarios via trigger).
// Somente admin pode criar. Usa a service_role (admin API) no servidor.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('papel')
    .eq('id', user.id)
    .maybeSingle();
  if (perfil?.papel !== 'admin') {
    return NextResponse.json({ error: 'Apenas administradores podem criar usuarios.' }, { status: 403 });
  }

  const body = (await request.json()) as Body;
  if (!body.nome || !body.email || !body.senha || !body.papel) {
    return NextResponse.json({ error: 'Preencha nome, email, senha e papel.' }, { status: 400 });
  }
  if (body.senha.length < 6) {
    return NextResponse.json({ error: 'A senha deve ter ao menos 6 caracteres.' }, { status: 400 });
  }

  const admin = createAdminClient();
  // O trigger fn_handle_new_user cria o perfil em public.usuarios a partir do metadata.
  const { data, error } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.senha,
    email_confirm: true,
    user_metadata: {
      nome: body.nome,
      papel: body.papel,
      regional_id: body.regional_id ?? '',
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data.user?.id });
}
