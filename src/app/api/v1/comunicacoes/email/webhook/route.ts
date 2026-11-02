import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assinaturaResendConfere, eventoDoResend } from '@/lib/comunicacao/servidor';

// POST /api/v1/comunicacoes/email/webhook — eventos do Resend (0168).
// Publica, sem sessao: a prova e a ASSINATURA (svix-id/svix-timestamp/
// svix-signature com RESEND_WEBHOOK_SECRET). Assinatura errada = 403.
// Entregue/devolvido/reclamacao/falha vao para registrar_evento_email, que
// suprime o endereco no bounce PERMANENTE e na reclamacao. Repetido nao duplica.
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const segredo = (process.env.RESEND_WEBHOOK_SECRET ?? '').trim();
  if (!segredo) return NextResponse.json({ error: 'Webhook não configurado' }, { status: 503 });
  const corpo = await request.text();
  const ok = assinaturaResendConfere(corpo, {
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    assinatura: request.headers.get('svix-signature'),
  }, segredo);
  if (!ok) return NextResponse.json({ error: 'Assinatura inválida' }, { status: 403 });

  let payload: unknown;
  try { payload = JSON.parse(corpo); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const ev = eventoDoResend(payload);
  if (!ev) return NextResponse.json({ ok: true, ignorado: true });

  const { data, error } = await createAdminClient().rpc('registrar_evento_email', {
    p_provedor: 'resend',
    p_evento_externo: request.headers.get('svix-id') as string,
    p_tipo: ev.tipo,
    p_message_id: ev.messageId,
    p_destinatario: ev.destinatario,
    p_detalhe: ev.detalhe,
    p_permanente: ev.permanente,
    p_ocorrido_em: ev.ocorridoEm,
  });
  if (error) {
    console.error('[email-webhook]', error.message);
    return NextResponse.json({ error: 'Falha ao registrar' }, { status: 500 }); // o Resend reenvia
  }
  return NextResponse.json({ ok: true, resultado: data });
}
