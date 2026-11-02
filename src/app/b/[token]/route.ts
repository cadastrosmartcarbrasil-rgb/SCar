import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPaymentGateway, SicrediGateway, type GatewayConfig } from '@/lib/pagamentos';
import { lerTokenDoBoleto } from '@/lib/comunicacao/servidor';
import { consumirTentativa, ipDaRequisicao } from '@/lib/rate-limit';

// GET /b/<token> — o PDF do boleto a partir do LINK DO E-MAIL de cobranca (0168).
// Publico, sem login: a prova e o token assinado (EMAIL_LINK_SECRET), que vale ate
// 30 dias depois do vencimento. A URL nao leva CPF, valor nem linha digitavel.
export const dynamic = 'force-dynamic';

function pagina(titulo: string, texto: string, status = 200) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head>
<body style="margin:0;font-family:Arial,sans-serif;background:#EEF2F8;color:#0F1B33"><div style="max-width:480px;margin:48px auto;background:#fff;border:1px solid #D5DDEA;border-radius:10px;padding:24px">
<p style="font-weight:700;color:#1E2B4D;margin:0 0 12px">SMART CAR BRASIL</p><h1 style="font-size:18px;margin:0 0 8px">${titulo}</h1><p style="margin:0;line-height:1.5">${texto}</p></div></body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const lim = consumirTentativa(`boleto-link:${ipDaRequisicao(request)}`, 30, 600);
  if (!lim.permitido) return pagina('Muitas tentativas', 'Aguarde alguns minutos e tente de novo.', 429);

  const segredo = (process.env.EMAIL_LINK_SECRET ?? '').trim();
  if (!segredo) return pagina('Link indisponível', 'Fale com o nosso atendimento para receber o boleto.', 503);
  const lido = lerTokenDoBoleto(decodeURIComponent(params.token), segredo);
  if ('erro' in lido) {
    return lido.erro === 'expirado'
      ? pagina('Link expirado', 'Este link não vale mais. Fale com o nosso atendimento para receber uma nova via.', 410)
      : pagina('Link inválido', 'Confira se o endereço foi copiado inteiro.', 404);
  }

  const admin = createAdminClient();
  const { data: t } = await admin.from('titulos_financeiros')
    .select('status, linha_digitavel, data_vencimento, integracao_id').eq('id', lido.tituloId).maybeSingle();
  if (!t) return pagina('Boleto não encontrado', 'Fale com o nosso atendimento.', 404);
  if (t.status === 'pago') return pagina('Boleto pago', 'Este boleto já consta como pago. Obrigado!');
  if (t.status === 'cancelado') return pagina('Boleto cancelado', 'Este boleto foi substituído ou cancelado. Fale com o nosso atendimento para a via atual.');
  if (!t.linha_digitavel) return pagina('Boleto em processamento', 'O banco ainda não registrou este boleto. Tente mais tarde.');

  try {
    const { data: integ } = t.integracao_id
      ? await admin.from('integracoes_bancarias').select('*').eq('id', t.integracao_id).maybeSingle()
      : { data: null };
    const gw = getPaymentGateway((integ ?? { provedor: 'SICREDI' }) as GatewayConfig);
    if (!(gw instanceof SicrediGateway)) throw new Error('sem Sicredi');
    const pdf = await gw.pdf(t.linha_digitavel);
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="boleto-${t.data_vencimento}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return pagina('Não foi possível abrir o PDF agora', `Use a linha digitável que está no e-mail, ou tente de novo em alguns minutos.`, 502);
  }
}
