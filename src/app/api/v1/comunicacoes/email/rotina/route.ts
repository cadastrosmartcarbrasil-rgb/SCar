import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { segredoConfere } from '@/lib/baixa-banco';
import { origemPublica, rodarRotinaEmail } from '@/lib/comunicacao/despacho-server';

// POST /api/v1/comunicacoes/email/rotina — e-mails de cobranca (0168).
// Quem chama: o crontab do VPS (scripts/email-cobranca.sh, header x-cron-secret =
// COBRANCA_CRON_SECRET) a cada 10 min, ou a matriz pelo painel ("Rodar agora").
// Enfileira os avisos do dia e despacha o que estiver dentro da janela.
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  const pelaCron = segredoConfere(request.headers.get('x-cron-secret'), process.env.COBRANCA_CRON_SECRET);
  if (!pelaCron) {
    const s = createClient();
    const { data: { user } } = await s.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    // 0169: a celula cobranca_emails.editar (perfil ou extra; admin sempre)
    const { data: pode } = await s.rpc('pode_emails_cobranca', { p_acao: 'editar' });
    if (!pode) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }
  }
  const body = (await request.json().catch(() => ({}))) as { somente_fila?: boolean };
  try {
    const r = await rodarRotinaEmail(origemPublica(request), { somenteFila: body.somente_fila === true });
    return NextResponse.json({ ok: true, resumo: { enviados: r.enviados, cancelados: r.cancelados, reagendados: r.reagendados, falhas: r.falhas }, fila: r.fila, aviso: r.aviso });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
