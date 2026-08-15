import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Database, Json } from '@/lib/database.types';

// POST /api/v1/assistencia/acionamento
// Abre o acionamento de Assistencia 24h aplicando a TRAVA do veiculo (ativo +
// em dia + limite do opcional). Quando ha bloqueio, o atendente envia tambem as
// credenciais do gestor no campo `liberacao`: validamos essas credenciais e
// executamos a abertura COM A SESSAO DO GESTOR, de modo que a alcada e checada
// no banco (pode_liberar_assistencia) e o liberado_por fica registrado.
export const dynamic = 'force-dynamic';

interface Body {
  veiculo_id?: string;
  servico_id?: string;
  solicitante?: string | null;
  telefone?: string | null;
  origem?: Json;
  destino?: Json;
  km_previsto?: number | null;
  observacoes?: string | null;
  atendimento_id?: string | null;
  liberacao?: { email?: string; senha?: string; justificativa?: string } | null;
}

const PAPEIS_LIBERACAO = ['admin', 'financeiro', 'gestor_regional'];

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  const { data: perfil } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.veiculo_id || !body.servico_id) {
    return NextResponse.json({ error: 'Informe o veiculo e o servico' }, { status: 400 });
  }

  const args = {
    p_veiculo_id: body.veiculo_id,
    p_servico_id: body.servico_id,
    p_solicitante: body.solicitante ?? null,
    p_telefone: body.telefone ?? null,
    p_origem: (body.origem ?? {}) as Json,
    p_destino: (body.destino ?? {}) as Json,
    p_km_previsto: body.km_previsto ?? null,
    p_observacoes: body.observacoes ?? null,
    p_liberacao_justificativa: null as string | null,
    p_atendimento_id: body.atendimento_id ?? null,
  };

  // --- Caminho normal: veiculo liberado -------------------------------------
  if (!body.liberacao?.email) {
    const { data, error } = await supabase.rpc('abrir_acionamento', args);
    if (error) {
      const bloqueado = error.message.startsWith('BLOQUEADO');
      return NextResponse.json(
        { error: error.message, bloqueado, exige_liberacao: bloqueado },
        { status: bloqueado ? 409 : 400 },
      );
    }
    return NextResponse.json({ acionamento: data });
  }

  // --- Liberacao de superior -------------------------------------------------
  const { email, senha, justificativa } = body.liberacao;
  if (!senha || !justificativa?.trim()) {
    return NextResponse.json({ error: 'Informe a senha do gestor e a justificativa' }, { status: 400 });
  }

  // Sessao efemera do gestor (nao toca na sessao do atendente).
  const gestorClient = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: login, error: loginErr } = await gestorClient.auth.signInWithPassword({
    email: email.trim(),
    password: senha,
  });
  if (loginErr || !login.user) {
    return NextResponse.json({ error: 'Credenciais do gestor invalidas' }, { status: 401 });
  }

  const { data: gestor } = await gestorClient
    .from('usuarios')
    .select('id, nome, papel')
    .eq('id', login.user.id)
    .maybeSingle();

  if (!gestor || !PAPEIS_LIBERACAO.includes(gestor.papel)) {
    await gestorClient.auth.signOut();
    return NextResponse.json({ error: 'Este usuario nao tem alcada para liberar o acionamento' }, { status: 403 });
  }

  const { data, error } = await gestorClient.rpc('abrir_acionamento', {
    ...args,
    p_liberacao_justificativa: justificativa.trim(),
  });
  await gestorClient.auth.signOut();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ acionamento: data, liberado_por: gestor.nome });
}
