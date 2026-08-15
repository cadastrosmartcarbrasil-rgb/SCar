import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { TipoFaturamento } from '@/lib/database.types';

// POST /api/v1/sac/faturamento { veiculo_id, tipo } — alterna o modo de
// faturamento do veiculo (Agrupado <-> Individual) a qualquer momento.
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  const { data: perfil } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });

  const body = (await request.json()) as { veiculo_id?: string; tipo?: TipoFaturamento };
  if (!body.veiculo_id || (body.tipo !== 'AGRUPADO_ASSOCIADO' && body.tipo !== 'INDIVIDUAL_VEICULO')) {
    return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('definir_faturamento_veiculo', {
    p_veiculo_id: body.veiculo_id,
    p_tipo: body.tipo,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ veiculo: data });
}
