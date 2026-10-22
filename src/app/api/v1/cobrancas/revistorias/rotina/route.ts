import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { segredoConfere } from '@/lib/baixa-banco';

// POST /api/v1/cobrancas/revistorias/rotina — ROTINA DIARIA da revistoria do
// boleto vencido (0137).
//
// Quem chama:
//   * o AGENDADOR do VPS (crontab -> scripts/revistorias-rotina.sh), sem sessao,
//     com `x-cron-secret: $COBRANCA_CRON_SECRET` (o mesmo da baixa);
//   * a matriz (sessao admin/financeiro), para rodar na hora.
// O que faz: `rotina_revistorias_cobranca()` cancela o pedido de quem nao tem
// mais nada vencido acima do limite e expira a aprovada nao usada em 10 dias
// (nunca reaproveita). Devolve tambem QUANTOS veiculos precisam de revistoria e
// ainda nao tem pedido — a entrada do robo de cobranca, que ainda nao manda
// o link sozinho (decisao do canal pendente).
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const pelaCron = segredoConfere(request.headers.get('x-cron-secret'), process.env.COBRANCA_CRON_SECRET);

  let supabase: ReturnType<typeof createClient> | ReturnType<typeof createAdminClient>;
  if (pelaCron) {
    supabase = createAdminClient();
  } else {
    const s = createClient();
    const { data: { user } } = await s.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const { data: perfil } = await s.from('usuarios').select('papel, ativo').eq('id', user.id).maybeSingle();
    if (!perfil?.ativo || !['admin', 'financeiro'].includes(perfil.papel)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }
    supabase = s;
  }

  const { data, error } = await supabase.rpc('rotina_revistorias_cobranca');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const r = (data ?? [])[0] ?? { canceladas: 0, expiradas: 0 };

  const { data: aPedir, error: e2 } = await supabase.rpc('revistorias_a_solicitar', { p_limite: 5000 });

  return NextResponse.json({
    resumo: {
      canceladas: r.canceladas,
      expiradas: r.expiradas,
      a_solicitar: e2 ? null : (aPedir ?? []).length,
    },
  });
}
