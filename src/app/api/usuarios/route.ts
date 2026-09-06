import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PapelUsuario, UsuariosRow } from '@/lib/database.types';

interface Body {
  nome: string;
  email: string;
  senha: string;
  papel: PapelUsuario;
  regional_id?: string | null;
}

interface BodyEdicao {
  id: string;
  nome?: string;
  email?: string;
  papel?: PapelUsuario;
  regional_id?: string | null;
  ativo?: boolean;
  /** senha nova; so vai para a admin API quando vem preenchida */
  senha?: string;
}

/** Quem chama e admin? Devolve o id de quem chamou, ou a resposta de erro. */
async function exigirAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: NextResponse.json({ error: 'Nao autenticado' }, { status: 401 }) };

  const { data: perfil } = await supabase
    .from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (perfil?.papel !== 'admin') {
    return { erro: NextResponse.json(
      { error: 'Apenas administradores gerenciam usuarios da equipe.' }, { status: 403 }) };
  }
  return { userId: user.id };
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

/**
 * Edita o usuario da equipe: nome, e-mail, papel, regional, ativo e a
 * REDEFINICAO DE SENHA.
 *
 * Por que via rota e nao direto pelo supabase-js: e-mail e senha vivem em
 * `auth.users`, que so a service_role alcanca — e a service_role nunca vai ao
 * navegador. O perfil em `usuarios` ate poderia ir por RLS (a policy
 * `usuarios_admin_write` permite), mas ai o e-mail ficaria diferente nos dois
 * lugares. Um caminho so, no servidor.
 */
export async function PATCH(request: Request) {
  const acesso = await exigirAdmin();
  if (acesso.erro) return acesso.erro;

  const body = (await request.json().catch(() => null)) as BodyEdicao | null;
  if (!body?.id) return NextResponse.json({ error: 'Informe o usuario.' }, { status: 400 });
  if (body.senha !== undefined && body.senha !== '' && body.senha.length < 6) {
    return NextResponse.json({ error: 'A senha deve ter ao menos 6 caracteres.' }, { status: 400 });
  }
  if (body.nome !== undefined && !body.nome.trim()) {
    return NextResponse.json({ error: 'O nome nao pode ficar em branco.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: alvo } = await admin
    .from('usuarios').select('id, papel, ativo, email').eq('id', body.id).maybeSingle();
  if (!alvo) return NextResponse.json({ error: 'Usuario nao encontrado.' }, { status: 404 });

  // Trava de porta: o sistema nao pode ficar sem administrador ativo. Vale
  // inclusive para o proprio admin logado tentando se rebaixar/desativar.
  const perdeAdmin = alvo.papel === 'admin'
    && ((body.papel !== undefined && body.papel !== 'admin') || body.ativo === false);
  if (perdeAdmin) {
    const { count } = await admin
      .from('usuarios')
      .select('id', { count: 'exact', head: true })
      .eq('papel', 'admin').eq('ativo', true).neq('id', alvo.id);
    if (!count) {
      return NextResponse.json(
        { error: 'Este e o unico administrador ativo. Promova outro antes de mudar este.' },
        { status: 400 },
      );
    }
  }

  // (1) auth.users — e-mail e senha
  const mudancaAuth: { email?: string; password?: string } = {};
  if (body.email && body.email.trim() && body.email.trim() !== alvo.email) {
    mudancaAuth.email = body.email.trim();
  }
  if (body.senha) mudancaAuth.password = body.senha;
  if (Object.keys(mudancaAuth).length > 0) {
    const { error } = await admin.auth.admin.updateUserById(body.id, mudancaAuth);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // (2) perfil em `usuarios`
  const patch: Partial<UsuariosRow> = {};
  if (body.nome !== undefined) patch.nome = body.nome.trim();
  if (mudancaAuth.email) patch.email = mudancaAuth.email;
  if (body.papel !== undefined) patch.papel = body.papel;
  if (body.regional_id !== undefined) patch.regional_id = body.regional_id || null;
  if (body.ativo !== undefined) patch.ativo = body.ativo;

  if (Object.keys(patch).length > 0) {
    const { error } = await admin.from('usuarios').update(patch).eq('id', body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, senha_redefinida: !!body.senha });
}
