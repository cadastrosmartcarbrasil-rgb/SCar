import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/v1/sac/boleto { cliente_id, competencia? } — emite/garante as faturas
// da competencia respeitando o modo de cada veiculo (agrupado x individual) e
// retorna as faturas (base para 2a via / boleto). Idempotente por competencia.
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  const { data: perfil } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });

  const body = (await request.json()) as { cliente_id?: string; competencia?: string };
  if (!body.cliente_id) return NextResponse.json({ error: 'cliente_id obrigatorio' }, { status: 400 });

  // Competencia = 1o dia do mes (default: mes corrente).
  const ref = body.competencia ? new Date(body.competencia) : new Date();
  const competencia = `${ref.getUTCFullYear()}-${String(ref.getUTCMonth() + 1).padStart(2, '0')}-01`;

  const { error } = await supabase.rpc('gerar_faturas_cliente', {
    p_cliente_id: body.cliente_id,
    p_competencia: competencia,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { data: abertas } = await supabase
    .from('faturas')
    .select('id, titulo_id, status')
    .eq('cliente_id', body.cliente_id)
    .eq('competencia', competencia);

  // Garante o titulo financeiro de cada fatura aberta (base do boleto/2a via).
  for (const f of abertas ?? []) {
    if (f.status === 'ABERTA' && !f.titulo_id) {
      await supabase.rpc('emitir_titulo_fatura', { p_fatura_id: f.id });
    }
  }

  const { data: faturas } = await supabase
    .from('faturas')
    .select('*, fatura_itens(descricao, valor), titulos_financeiros(id, status, data_vencimento, linha_digitavel, url_boleto)')
    .eq('cliente_id', body.cliente_id)
    .eq('competencia', competencia)
    .order('tipo_faturamento');

  return NextResponse.json({ competencia, faturas: faturas ?? [] });
}
