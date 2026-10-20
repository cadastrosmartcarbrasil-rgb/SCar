import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPaymentGateway, SicrediGateway, type GatewayConfig } from '@/lib/pagamentos';
import { remetenteEmail } from '@/lib/email';
import { mensagemDoBoleto } from '@/lib/renegociacao';

// O boleto do SCar na mao do associado (0121):
//   GET  ?titulo_id=          -> o PDF do Sicredi (para baixar ou anexar)
//   POST { titulo_ids, email? } -> envia por e-mail (Resend) com os PDFs anexados
// Quem pode: quem tem o associado no escopo da cobranca.
export const dynamic = 'force-dynamic';

type Admin = ReturnType<typeof createAdminClient>;

async function autorizar(tituloIds: string[]) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: titulos } = await admin.from('titulos_financeiros')
    .select('id, cliente_id, valor, data_vencimento, linha_digitavel, pix_copia_cola, renegociacao_parcela, integracao_id, status')
    .in('id', tituloIds);
  if (!titulos || titulos.length !== tituloIds.length) {
    return { erro: NextResponse.json({ error: 'Boleto não encontrado' }, { status: 404 }) };
  }
  const clientes = Array.from(new Set(titulos.map((t) => t.cliente_id)));
  if (clientes.length !== 1) return { erro: NextResponse.json({ error: 'Boletos de associados diferentes' }, { status: 400 }) };
  const { data: pode } = await supabase.rpc('cobranca_pode_cliente', { p_cliente_id: clientes[0] });
  if (!pode) return { erro: NextResponse.json({ error: 'Fora do seu escopo de cobrança' }, { status: 403 }) };
  return { admin, titulos, clienteId: clientes[0] };
}

async function gatewaySicredi(admin: Admin, integracaoId: string | null) {
  const { data: integ } = integracaoId
    ? await admin.from('integracoes_bancarias').select('*').eq('id', integracaoId).maybeSingle()
    : { data: null };
  const gw = getPaymentGateway((integ ?? { provedor: 'SICREDI' }) as GatewayConfig);
  if (!(gw instanceof SicrediGateway)) throw new Error('O PDF só sai pelo Sicredi.');
  return gw;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const historicoId = params.get('boleto_historico_id');
  if (historicoId) return pdfDoMutual(historicoId);
  const id = params.get('titulo_id');
  if (!id) return NextResponse.json({ error: 'titulo_id obrigatório' }, { status: 400 });
  const a = await autorizar([id]);
  if ('erro' in a) return a.erro;
  const t = a.titulos[0];
  if (!t.linha_digitavel) return NextResponse.json({ error: 'O banco ainda não registrou este boleto' }, { status: 400 });
  try {
    const gw = await gatewaySicredi(a.admin, t.integracao_id);
    const pdf = await gw.pdf(t.linha_digitavel);
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="boleto-${t.data_vencimento}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

/**
 * 2a via do MESMO boleto do Mutual (ainda a vencer): o mesmo beneficiario
 * Sicredi emitiu, entao o PDF sai do banco pela linha digitavel. Vencido nao e
 * aqui: vira boleto novo (renegociacao, decisao do usuario).
 */
async function pdfDoMutual(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const admin = createAdminClient();
  const { data: h } = await admin.from('boletos_historico')
    .select('cliente_id, linha_digitavel, data_vencimento, situacao').eq('id', id).maybeSingle();
  if (!h) return NextResponse.json({ error: 'Boleto não encontrado' }, { status: 404 });
  const { data: pode } = await supabase.rpc('cobranca_pode_cliente', { p_cliente_id: h.cliente_id });
  if (!pode) return NextResponse.json({ error: 'Fora do seu escopo de cobrança' }, { status: 403 });
  if (!h.linha_digitavel || !h.linha_digitavel.replace(/\D/g, '').startsWith('748')) {
    return NextResponse.json({ error: 'Boleto sem linha do Sicredi' }, { status: 400 });
  }
  try {
    const gw = await gatewaySicredi(admin, null);
    const pdf = await gw.pdf(h.linha_digitavel);
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="boleto-${h.data_vencimento}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { titulo_ids?: string[]; email?: string | null };
  const ids = (body.titulo_ids ?? []).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ error: 'titulo_ids obrigatório' }, { status: 400 });
  const a = await autorizar(ids);
  if ('erro' in a) return a.erro;

  const { data: cli } = await a.admin.from('clientes')
    .select('nome_razao_social, email, email_adicional').eq('id', a.clienteId).maybeSingle();
  const destino = (body.email ?? cli?.email ?? cli?.email_adicional ?? '').trim();
  const boletos = a.titulos
    .sort((x, y) => (x.data_vencimento < y.data_vencimento ? -1 : 1))
    .map((t, i) => ({
      parcela: t.renegociacao_parcela ?? i + 1,
      vencimento: t.data_vencimento,
      valor: Number(t.valor),
      linha_digitavel: t.linha_digitavel,
      pix_copia_cola: t.pix_copia_cola,
    }));
  const texto = mensagemDoBoleto({ nome: cli?.nome_razao_social ?? '', boletos });

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ enviado: false, texto, aviso: 'RESEND_API_KEY não configurada: copie o texto e envie manualmente.' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destino)) {
    return NextResponse.json({ error: 'Associado sem e-mail válido no cadastro.' }, { status: 400 });
  }

  // PDF anexado quando o banco devolve; sem ele, segue so com a linha e o PIX.
  const anexos: { filename: string; content: string }[] = [];
  for (const t of a.titulos) {
    if (!t.linha_digitavel) continue;
    try {
      const gw = await gatewaySicredi(a.admin, t.integracao_id);
      const pdf = await gw.pdf(t.linha_digitavel);
      anexos.push({ filename: `boleto-${t.data_vencimento}.pdf`, content: Buffer.from(pdf).toString('base64') });
    } catch { /* sem anexo: o texto ja tem linha e PIX */ }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: remetenteEmail(),
      to: [destino],
      subject: boletos.length > 1 ? 'Seus boletos do acordo — Smart Car Brasil' : 'Seu boleto — Smart Car Brasil',
      text: texto,
      attachments: anexos.length ? anexos : undefined,
    }),
  });
  if (!res.ok) return NextResponse.json({ error: `Resend recusou o envio: ${await res.text()}` }, { status: 400 });
  return NextResponse.json({ enviado: true, para: destino, anexos: anexos.length, texto });
}
