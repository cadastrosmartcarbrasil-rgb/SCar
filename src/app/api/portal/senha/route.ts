import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { problemaDaNovaSenha } from '@/lib/portal-senha';

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

  const problema = problemaDaNovaSenha(senha, confirmacao);
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: erroMarca } = await supabase.rpc('portal_senha_trocada', {});
  if (erroMarca) return NextResponse.json({ error: erroMarca.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
