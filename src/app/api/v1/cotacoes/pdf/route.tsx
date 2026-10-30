import { NextResponse } from 'next/server';
import { carregarProposta, fontesEmbutidas, htmlDaProposta, logoReserva, qrDaProposta } from '@/lib/proposta-server';
import { gerarPdf, logoComoDataUrl } from '@/lib/termos-server';
import { consumirTentativa, ipDaRequisicao } from '@/lib/rate-limit';
import { origemDaRequisicao } from '@/lib/api-externa-doc';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * O PDF da proposta comercial (30/10/2026): as mesmas 3 folhas da pagina
 * /cotacao/<token>, geradas no servidor (Chromium sem rede: fontes, logo e QR
 * vao embutidos). Publico pelo token, como a pagina. Gerado sob demanda — a
 * cotacao e editavel, entao nada e guardado.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')?.trim() ?? '';
  // Sobe um Chromium por chamada: freio por IP.
  const lim = consumirTentativa(`proposta-pdf:${ipDaRequisicao(req)}`, 20, 600);
  if (!lim.permitido) {
    return NextResponse.json({ error: `Muitas solicitações. Tente em ${lim.esperar} s.` }, { status: 429 });
  }
  const proposta = await carregarProposta(token, origemDaRequisicao(req.headers));
  if (!proposta) return NextResponse.json({ error: 'Proposta não encontrada' }, { status: 404 });

  const { dados } = proposta;
  const [logo, qr, fontes, { renderToStaticMarkup }, { PropostaCapa, PropostaPlano, PropostaCondicoes }] = await Promise.all([
    logoComoDataUrl(proposta.logoUrl).then((l) => l ?? logoReserva()),
    qrDaProposta(dados.link),
    fontesEmbutidas(),
    import('react-dom/server'),
    import('@/components/proposta/documento'),
  ]);
  const corpo = renderToStaticMarkup(
    <>
      <PropostaCapa d={dados} logo={logo} />
      <PropostaPlano d={dados} logo={logo} />
      <PropostaCondicoes d={dados} logo={logo} qr={qr} />
    </>,
  );
  try {
    const pdf = await gerarPdf(htmlDaProposta(corpo, fontes, `Proposta ${dados.veiculo.placa ?? ''}`), { rodape: false });
    const nome = `proposta-smartcar-${(dados.veiculo.placa ?? dados.token.slice(0, 8)).toLowerCase()}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${nome}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('[proposta-pdf]', (e as Error).message);
    return NextResponse.json({ error: 'Não foi possível gerar o PDF agora.' }, { status: 500 });
  }
}
