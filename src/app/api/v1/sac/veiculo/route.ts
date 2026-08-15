import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/v1/sac/veiculo?veiculo_id=  — DETALHE do veiculo sob demanda (lazy).
// So e chamado quando o atendente clica no veiculo na lista. RLS garante que
// so retorna veiculo que o usuario pode ver (staff regional ou dono).
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  const { data: perfil } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });

  const veiculoId = new URL(request.url).searchParams.get('veiculo_id');
  if (!veiculoId) return NextResponse.json({ error: 'veiculo_id obrigatorio' }, { status: 400 });

  const { data: veiculo } = await supabase.from('veiculos').select('*').eq('id', veiculoId).maybeSingle();
  if (!veiculo) return NextResponse.json({ error: 'Veiculo nao encontrado' }, { status: 404 });

  const { data: plano } = veiculo.plano_protecao_id
    ? await supabase.from('planos_protecao').select('nome').eq('id', veiculo.plano_protecao_id).maybeSingle()
    : { data: null };

  const { data: opcionais } = await supabase.rpc('opcionais_elegibilidade', { p_veiculo_id: veiculoId });

  return NextResponse.json({ veiculo, plano_nome: plano?.nome ?? null, opcionais: opcionais ?? [] });
}
