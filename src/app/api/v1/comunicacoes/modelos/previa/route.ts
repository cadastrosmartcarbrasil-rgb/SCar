import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { modeloEmail, type CodigoModeloEmail, type TextosModelo } from '@/lib/comunicacao/modelos';
import { renderizarModeloExemplo } from '@/lib/comunicacao/render-email';
import { origemPublica, rodapeDaEmpresa } from '@/lib/comunicacao/despacho-server';
import { emailValido, normalizarEmail } from '@/lib/comunicacao/cobranca';
import { provedorDeEmail } from '@/lib/comunicacao/provedor';
import { remetenteCobranca, remetenteServico } from '@/lib/email';

// POST /api/v1/comunicacoes/modelos/previa — o modelo com os textos da TELA (ainda nao
// gravados) e dados de exemplo. { codigo, textos } devolve { assunto, html };
// com { email } tambem envia um teste (exige editar; respeita a supressao).
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { codigo?: string; textos?: TextosModelo; email?: string };
  const m = modeloEmail(body.codigo ?? '');
  if (!m) return NextResponse.json({ error: 'Modelo desconhecido' }, { status: 400 });
  const acao = body.email ? 'editar' : 'ver';
  const { data: pode } = await s.rpc('pode_modelos_comunicacao', { p_acao: acao });
  if (!pode) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const textos = Object.fromEntries(
    Object.entries(body.textos ?? {}).filter(([, v]) => typeof v === 'string' && v.trim()),
  ) as TextosModelo;
  const admin = createAdminClient();
  const rodape = await rodapeDaEmpresa(admin);
  const r = await renderizarModeloExemplo(m.codigo as CodigoModeloEmail, textos, rodape, origemPublica(request));
  if (!body.email) return NextResponse.json({ assunto: r.assunto, html: r.html });

  const email = normalizarEmail(body.email);
  if (!emailValido(email)) return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 });
  const provedor = provedorDeEmail();
  if (!provedor) return NextResponse.json({ error: 'RESEND_API_KEY não configurada no servidor.' }, { status: 400 });
  const { data: suprimido } = await admin.rpc('email_suprimido', { p_email: email });
  if (suprimido) return NextResponse.json({ error: 'Este e-mail está na lista de supressão.' }, { status: 400 });
  const res = await provedor.enviar({
    de: m.cobranca ? remetenteCobranca() : remetenteServico(),
    para: email, assunto: `[TESTE] ${r.assunto}`, html: r.html, texto: r.texto,
    responderPara: rodape.email, tags: { aviso: `teste_${m.codigo}`, fluxo: m.cobranca ? 'cobranca' : 'servico' },
  });
  if (!res.ok) return NextResponse.json({ error: res.erro }, { status: 502 });
  return NextResponse.json({ ok: true });
}
