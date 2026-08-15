import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/v1/cobrancas/gerar
// Boletagem recorrente: gera as faturas de N competencias (ex.: 6 meses) com
// escopo opcional por associado, por grupo de veiculos ou por regional, e
// (opcionalmente) ja emite os titulos financeiros do periodo.
// Idempotente: competencia ja gerada nao e recriada nem alterada.
export const dynamic = 'force-dynamic';

interface Body {
  competencia?: string;        // 'YYYY-MM' ou 'YYYY-MM-DD' (default: mes corrente)
  meses?: number;              // default 6 (1..24)
  cliente_id?: string | null;
  veiculo_ids?: string[] | null;
  regional_id?: string | null;
  emitir_titulos?: boolean;    // default true
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  const { data: perfil } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Body;
  const ref = body.competencia ?? new Date().toISOString().slice(0, 7);
  const competencia = `${ref.slice(0, 7)}-01`;
  const meses = Math.min(Math.max(body.meses ?? 6, 1), 24);

  const { data: periodos, error } = await supabase.rpc('gerar_faturas_periodo', {
    p_competencia_inicial: competencia,
    p_meses: meses,
    p_cliente_id: body.cliente_id ?? null,
    p_veiculo_ids: body.veiculo_ids ?? null,
    p_regional_id: body.regional_id ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Emite os titulos (base do boleto) de cada competencia gerada.
  const titulos: { competencia: string; titulos_emitidos: number; valor_total: number }[] = [];
  if (body.emitir_titulos !== false) {
    for (const p of periodos ?? []) {
      const { data: r, error: e } = await supabase.rpc('emitir_titulos_competencia', {
        p_competencia: p.competencia,
        p_regional_id: body.regional_id ?? null,
      });
      if (e) return NextResponse.json({ error: e.message, periodos }, { status: 400 });
      const resumo = r?.[0];
      titulos.push({
        competencia: p.competencia,
        titulos_emitidos: resumo?.titulos_emitidos ?? 0,
        valor_total: Number(resumo?.valor_total ?? 0),
      });
    }
  }

  return NextResponse.json({
    competencia_inicial: competencia,
    meses,
    periodos: periodos ?? [],
    titulos,
    total_faturas: (periodos ?? []).reduce((s, p) => s + p.faturas_geradas, 0),
    total_valor: (periodos ?? []).reduce((s, p) => s + Number(p.valor_total), 0),
  });
}
