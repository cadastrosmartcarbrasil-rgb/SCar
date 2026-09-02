import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validarDocumento } from '@/lib/documento';

/**
 * Login do Portal do Associado: CPF/CNPJ + senha.
 *
 * PRIMEIRO ACESSO: a senha e o proprio documento. Se o associado ainda nao tem
 * usuario de autenticacao, ele e criado aqui — mas so quando a senha digitada e
 * exatamente o documento, e ja nasce marcado como PROVISORIA, o que obriga a
 * troca antes de o portal mostrar qualquer dado.
 *
 * O e-mail do usuario de auth e interno (`<documento>@portal.smartcarbrasil.com.br`):
 * o Supabase exige um e-mail, mas nada e enviado para ele. O e-mail de contato do
 * associado vive em `clientes.email` e serve para outra coisa.
 */
function emailInterno(doc: string) {
  return `${doc}@portal.smartcarbrasil.com.br`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const doc = String(body?.cpf_cnpj ?? '').replace(/\D/g, '');
  const senha = String(body?.senha ?? '');

  if (!doc || !senha) {
    return NextResponse.json({ error: 'Informe CPF/CNPJ e senha.' }, { status: 400 });
  }
  if (!validarDocumento(doc, doc.length > 11 ? 'PJ' : 'PF')) {
    return NextResponse.json({ error: 'CPF/CNPJ invalido.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: cliente } = await admin
    .from('clientes')
    .select('id, auth_user_id, status, portal_senha_provisoria')
    .eq('cpf_cnpj', doc)
    .maybeSingle();

  // Mesma resposta para "nao existe" e "senha errada": nao confirmamos a quem
  // pergunta se um CPF e ou nao associado da casa.
  const invalido = NextResponse.json({ error: 'Credenciais invalidas.' }, { status: 401 });
  if (!cliente) return invalido;
  if (cliente.status === 'cancelado') {
    return NextResponse.json(
      { error: 'Cadastro cancelado. Fale com o atendimento.' }, { status: 403 },
    );
  }

  let authUserId = cliente.auth_user_id;
  let provisoria = cliente.portal_senha_provisoria;

  // Primeiro acesso: cria o usuario, e SO com a senha = documento.
  if (!authUserId) {
    if (senha.replace(/\D/g, '') !== doc) return invalido;

    const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
      email: emailInterno(doc),
      password: doc,
      email_confirm: true,
      user_metadata: { cliente_id: cliente.id, origem: 'portal_associado' },
    });
    if (erroCriar || !criado.user) return invalido;

    authUserId = criado.user.id;
    provisoria = true;
    await admin.from('clientes')
      .update({ auth_user_id: authUserId, portal_senha_provisoria: true })
      .eq('id', cliente.id);
  }

  const { data: authUser } = await admin.auth.admin.getUserById(authUserId);
  const email = authUser.user?.email;
  if (!email) return invalido;

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) return invalido;

  await admin.from('clientes')
    .update({
      portal_ultimo_acesso_em: new Date().toISOString(),
      portal_primeiro_acesso_em: cliente.auth_user_id
        ? undefined
        : new Date().toISOString(),
    })
    .eq('id', cliente.id);

  return NextResponse.json({ ok: true, senha_provisoria: provisoria });
}
