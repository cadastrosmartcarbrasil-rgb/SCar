import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { exemploAviso, somarDias, type TemplateEmail } from '@/lib/comunicacao/cobranca';
import { renderizarAviso } from '@/lib/comunicacao/render-email';
import { origemPublica, rodapeDaEmpresa } from '@/lib/comunicacao/despacho-server';
import { textosGravadosEmail } from '@/lib/comunicacao/modelos-server';

// GET /api/v1/comunicacoes/email/previa?template=&offset_dias= — o aviso com DADOS DE
// EXEMPLO e o rodape real da empresa, pelo mesmo template do envio (admin/financeiro).
export const dynamic = 'force-dynamic';

const TEMPLATES: TemplateEmail[] = ['aviso_vencimento', 'vence_hoje', 'atraso'];

export async function GET(request: Request) {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  // 0169: a celula cobranca_emails.ver (perfil ou extra; admin sempre)
  const { data: pode } = await s.rpc('pode_emails_cobranca', { p_acao: 'ver' });
  if (!pode) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }
  const url = new URL(request.url);
  const t = url.searchParams.get('template') as TemplateEmail;
  const template = TEMPLATES.includes(t) ? t : 'aviso_vencimento';
  const offset = Number(url.searchParams.get('offset_dias') ?? -5) || 0;

  const rodape = await rodapeDaEmpresa(createAdminClient());
  const exemplo = exemploAviso(template, offset, '#');
  const r = await renderizarAviso(template, exemplo, rodape, {
    origem: origemPublica(request), hoje: somarDias(exemplo.vencimento!, offset),
    textos: await textosGravadosEmail(createAdminClient()),
  });
  return NextResponse.json({ assunto: r.assunto, html: r.html });
}
