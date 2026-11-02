import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { remetenteCobranca } from '@/lib/email';
import { emailValido, exemploAviso, normalizarEmail, somarDias, type TemplateEmail } from '@/lib/comunicacao/cobranca';
import { renderizarAviso } from '@/lib/comunicacao/render-email';
import { provedorDeEmail } from '@/lib/comunicacao/provedor';
import { origemPublica, rodapeDaEmpresa } from '@/lib/comunicacao/despacho-server';

// POST /api/v1/comunicacoes/email/teste — envia um aviso com DADOS DE EXEMPLO
// para o e-mail informado (admin/financeiro). Nao passa pela fila; respeita a
// lista de supressao.
export const dynamic = 'force-dynamic';

const TEMPLATES: TemplateEmail[] = ['aviso_vencimento', 'vence_hoje', 'atraso'];

export async function POST(request: Request) {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { data: perfil } = await s.from('usuarios').select('papel, ativo').eq('id', user.id).maybeSingle();
  if (!perfil?.ativo || !['admin', 'financeiro'].includes(perfil.papel)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { email?: string; template?: string; offset_dias?: number };
  const email = normalizarEmail(body.email);
  if (!emailValido(email)) return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 });
  const template = (TEMPLATES.includes(body.template as TemplateEmail) ? body.template : 'aviso_vencimento') as TemplateEmail;

  const provedor = provedorDeEmail();
  if (!provedor) return NextResponse.json({ error: 'RESEND_API_KEY não configurada no servidor.' }, { status: 400 });
  const admin = createAdminClient();
  const { data: suprimido } = await admin.rpc('email_suprimido', { p_email: email });
  if (suprimido) return NextResponse.json({ error: 'Este e-mail está na lista de supressão.' }, { status: 400 });
  const { data: cfg } = await admin.from('email_config').select('reply_to').eq('id', true).maybeSingle();

  const rodape = await rodapeDaEmpresa(admin);
  const offset = Number(body.offset_dias ?? -5);
  const exemplo = exemploAviso(template, offset);
  const r = await renderizarAviso(template, exemplo, rodape, {
    origem: origemPublica(request), hoje: somarDias(exemplo.vencimento!, offset),
  });
  const res = await provedor.enviar({
    de: remetenteCobranca(), para: email, assunto: `[TESTE] ${r.assunto}`, html: r.html, texto: r.texto,
    responderPara: cfg?.reply_to || rodape.email, tags: { aviso: 'teste', fluxo: 'cobranca' },
  });
  if (!res.ok) return NextResponse.json({ error: res.erro }, { status: 502 });
  return NextResponse.json({ ok: true, message_id: res.messageId });
}
