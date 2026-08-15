import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CanalAtendimento, Json, TipoAtendimento } from '@/lib/database.types';

// Atendimentos vinculados ao VEICULO especifico.
// POST: abre uma solicitacao (com trava de propriedade no banco).
// GET ?veiculo_id=: lista o historico do veiculo (acompanhamento).
export const dynamic = 'force-dynamic';

async function guard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, erro: NextResponse.json({ error: 'Nao autenticado' }, { status: 401 }) };
  return { supabase, erro: null as null | NextResponse };
}

export async function POST(request: Request) {
  const { supabase, erro } = await guard();
  if (erro) return erro;

  const body = (await request.json()) as {
    veiculo_id?: string; tipo?: TipoAtendimento; canal?: CanalAtendimento;
    assunto?: string; descricao?: string; dados?: Json;
  };
  if (!body.veiculo_id || !body.tipo) {
    return NextResponse.json({ error: 'veiculo_id e tipo sao obrigatorios' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('abrir_atendimento', {
    p_veiculo_id: body.veiculo_id,
    p_tipo: body.tipo,
    p_canal: body.canal ?? 'SAC_INTERNO',
    p_assunto: body.assunto ?? null,
    p_descricao: body.descricao ?? null,
    p_dados: body.dados ?? {},
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ atendimento: data });
}

export async function GET(request: Request) {
  const { supabase, erro } = await guard();
  if (erro) return erro;

  const veiculoId = new URL(request.url).searchParams.get('veiculo_id');
  if (!veiculoId) return NextResponse.json({ error: 'veiculo_id obrigatorio' }, { status: 400 });

  // RLS garante que so retorna o que o usuario pode ver (staff regional ou dono).
  const { data, error } = await supabase
    .from('atendimentos')
    .select('*')
    .eq('veiculo_id', veiculoId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ atendimentos: data ?? [] });
}
