import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { lerTokenDescadastro } from '@/lib/comunicacao/servidor';
import { consumirTentativa, ipDaRequisicao } from '@/lib/rate-limit';

// POST /api/descadastro/<token> — o associado para de receber os comunicados INFORMATIVOS.
// Publico, sem login: a prova e o token assinado do proprio e-mail (EMAIL_LINK_SECRET).
// Atende o botao da pagina /descadastro/<token> e o "cancelar inscricao" de um clique dos
// provedores (List-Unsubscribe-Post, RFC 8058). Cobranca e avisos de servico continuam.
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const limite = consumirTentativa(`descadastro:${ipDaRequisicao(request)}`, 30, 600);
  if (!limite.permitido) return NextResponse.json({ error: 'Muitos pedidos. Tente mais tarde.' }, { status: 429 });
  const email = lerTokenDescadastro(params.token, (process.env.EMAIL_LINK_SECRET ?? '').trim());
  if (!email) return NextResponse.json({ error: 'Link inválido.' }, { status: 404 });
  const { error } = await createAdminClient().rpc('registrar_descadastro_email', { p_email: email, p_origem: 'link do e-mail' });
  if (error) {
    console.error('[descadastro]', error.message);
    return NextResponse.json({ error: 'Não consegui registrar agora. Tente de novo.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
