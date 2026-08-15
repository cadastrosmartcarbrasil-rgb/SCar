import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

// POST /api/v1/vendas/desconto
// Alcada de excecao do desconto: quando o percentual passa do limite da
// franquia/regional, o vendedor envia as credenciais de um Gestor/Diretor.
// Validamos essas credenciais e aplicamos o desconto COM A SESSAO DELE, de modo
// que a alcada e conferida no banco (pode_aprovar_desconto) e o aprovador fica
// registrado na cotacao.
export const dynamic = 'force-dynamic';

const PAPEIS_APROVACAO = ['admin', 'gestor_regional'];

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  const { data: perfil } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    cotacao_id?: string;
    percentual?: number;
    justificativa?: string;
    email?: string;
    senha?: string;
  };

  if (!body.cotacao_id || body.percentual == null) {
    return NextResponse.json({ error: 'Informe a cotacao e o percentual' }, { status: 400 });
  }
  if (!body.email || !body.senha || !body.justificativa?.trim()) {
    return NextResponse.json(
      { error: 'Informe e-mail, senha do gestor e a justificativa da excecao' },
      { status: 400 },
    );
  }

  // Sessao efemera do gestor (nao interfere na sessao do vendedor).
  const gestorClient = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: login, error: loginErr } = await gestorClient.auth.signInWithPassword({
    email: body.email.trim(),
    password: body.senha,
  });
  if (loginErr || !login.user) {
    return NextResponse.json({ error: 'Credenciais do gestor invalidas' }, { status: 401 });
  }

  const { data: gestor } = await gestorClient
    .from('usuarios')
    .select('id, nome, papel')
    .eq('id', login.user.id)
    .maybeSingle();

  if (!gestor || !PAPEIS_APROVACAO.includes(gestor.papel)) {
    await gestorClient.auth.signOut();
    return NextResponse.json(
      { error: 'Este usuario nao tem alcada para aprovar desconto (Gestor/Diretor)' },
      { status: 403 },
    );
  }

  const { data, error } = await gestorClient.rpc('aplicar_desconto_cotacao', {
    p_cotacao_id: body.cotacao_id,
    p_percentual: body.percentual,
    p_justificativa: body.justificativa.trim(),
  });
  await gestorClient.auth.signOut();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ cotacao: data, aprovado_por: gestor.nome });
}
