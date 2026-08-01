// ============================================================================
// Edge Function :: enviar-email
// Renderiza um email_template com variaveis dinamicas e envia via Resend.
//
// Deploy: supabase functions deploy enviar-email
// Secrets: supabase secrets set RESEND_API_KEY=... EMAIL_FROM=...
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'SCar <no-reply@scar.app>';

interface Payload {
  template: 'BOAS_VINDAS' | 'LEMBRETE_BOLETO' | 'NOVO_EVENTO';
  cliente_id?: string;
  to?: string;
  variaveis?: Record<string, string>;
}

/** Substitui {{chave}} pelo valor correspondente. */
function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const payload = (await req.json()) as Payload;

  const { data: tpl, error: tplErr } = await admin
    .from('email_templates')
    .select('assunto, corpo_html')
    .eq('codigo', payload.template)
    .eq('ativo', true)
    .single();

  if (tplErr || !tpl) return new Response('Template nao encontrado', { status: 404 });

  // Resolve destinatario e variaveis basicas a partir do cliente, se informado.
  let to = payload.to;
  const vars: Record<string, string> = { ...(payload.variaveis ?? {}) };

  if (payload.cliente_id) {
    const { data: cliente } = await admin
      .from('clientes')
      .select('nome_razao_social, email')
      .eq('id', payload.cliente_id)
      .single();
    if (cliente) {
      to = to ?? cliente.email ?? undefined;
      vars.nome = vars.nome ?? cliente.nome_razao_social;
    }
  }

  if (!to) return new Response('Destinatario ausente', { status: 400 });

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to,
      subject: render(tpl.assunto, vars),
      html: render(tpl.corpo_html, vars),
    }),
  });

  if (!resp.ok) {
    return new Response(await resp.text(), { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
