import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Troca da senha do associado.
 *
 * Roda com a SESSAO dele (nao com service_role): o Supabase so troca a senha de
 * quem esta logado, entao nao ha como mexer na senha de outra pessoa por aqui.
 * Depois de trocar, `portal_senha_trocada()` limpa a marca de provisoria.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const senha = String(body?.senha ?? '');
  const confirmacao = String(body?.confirmacao ?? '');

  if (senha.length < 8) {
    return NextResponse.json({ error: 'A senha precisa de ao menos 8 caracteres.' }, { status: 400 });
  }
  if (senha !== confirmacao) {
    return NextResponse.json({ error: 'As senhas nao conferem.' }, { status: 400 });
  }
  if (/^\d+$/.test(senha)) {
    return NextResponse.json(
      { error: 'Use letras e numeros — a senha nao pode ser so numeros (nem o seu CPF).' },
      { status: 400 },
    );
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessao expirada.' }, { status: 401 });

  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: erroMarca } = await supabase.rpc('portal_senha_trocada', {});
  if (erroMarca) return NextResponse.json({ error: erroMarca.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
