// ============================================================================
// Edge Function :: webhook-banco
// Recebe notificacoes de pagamento do gateway (Asaas / PJBank / mock),
// concilia o titulo (status -> 'pago') e dispara e-mail de confirmacao.
// A trigger fn_calcular_comissao gera a comissao automaticamente no update.
//
// Deploy: supabase functions deploy webhook-banco --no-verify-jwt
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('GATEWAY_WEBHOOK_SECRET') ?? '';

interface WebhookPayload {
  event: string; // ex.: 'PAYMENT_RECEIVED' | 'PAYMENT_CONFIRMED'
  payment: {
    id: string;              // gateway_transacao_id
    externalReference?: string; // titulo_id (nosso id)
    value: number;
    paymentDate?: string;    // YYYY-MM-DD
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Autenticacao simples do webhook por token compartilhado.
  const token = req.headers.get('asaas-access-token') ?? req.headers.get('x-webhook-secret');
  if (WEBHOOK_SECRET && token !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  let body: WebhookPayload;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const paidEvents = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'];
  if (!paidEvents.includes(body.event)) {
    return new Response(JSON.stringify({ ignored: body.event }), { status: 200 });
  }

  const { payment } = body;

  // Localiza o titulo por referencia externa ou pelo id do gateway.
  const filter = payment.externalReference
    ? { column: 'id', value: payment.externalReference }
    : { column: 'gateway_transacao_id', value: payment.id };

  const { data: titulo, error: findErr } = await admin
    .from('titulos_financeiros')
    .select('id, cliente_id, status')
    .eq(filter.column, filter.value)
    .maybeSingle();

  if (findErr) return new Response(findErr.message, { status: 500 });
  if (!titulo) return new Response('Titulo nao encontrado', { status: 404 });
  if (titulo.status === 'pago') {
    return new Response(JSON.stringify({ ok: true, already: true }), { status: 200 });
  }

  const { error: updErr } = await admin
    .from('titulos_financeiros')
    .update({
      status: 'pago',
      data_pagamento: payment.paymentDate ?? new Date().toISOString().slice(0, 10),
      valor_pago: payment.value,
      gateway_transacao_id: payment.id,
    })
    .eq('id', titulo.id);

  if (updErr) return new Response(updErr.message, { status: 500 });

  // Dispara e-mail de confirmacao (best-effort, nao bloqueia a resposta).
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/enviar-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ template: 'LEMBRETE_BOLETO', cliente_id: titulo.cliente_id }),
    });
  } catch (_) {
    // logging apenas; a conciliacao ja foi concluida.
  }

  return new Response(JSON.stringify({ ok: true, titulo_id: titulo.id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
