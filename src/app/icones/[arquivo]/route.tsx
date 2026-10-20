import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { logoOficial } from '@/lib/marca-server';
import { caixaDoLogo, dimensoesPng, tamanhoDoArquivo } from '@/lib/icone-app';

/**
 * Icone do app (PWA instalado e favicon) gerado da logo OFICIAL
 * (`empresa.logo_url`): `/icones/192.png`, `/icones/512.png`, `/icones/180.png`,
 * `/icones/32.png`. Termina em `.png` de proposito: o matcher do middleware
 * deixa passar sem sessao — o navegador busca o icone antes de qualquer login.
 * Sem logo cadastrada (ou falha ao baixar), cai no desenho de reserva.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { arquivo: string } }) {
  const tamanho = tamanhoDoArquivo(params.arquivo);
  if (!tamanho) return new NextResponse('Não encontrado', { status: 404 });

  const reserva = () => NextResponse.redirect(new URL('/logo-smartcar.svg', request.url));
  const url = await logoOficial();
  if (!url) return reserva();

  let dataUri: string;
  let dim: { largura: number; altura: number } | null;
  try {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) return reserva();
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const tipo = resp.headers.get('content-type') || 'image/png';
    dim = dimensoesPng(bytes);
    dataUri = `data:${tipo};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return reserva();
  }

  const caixa = caixaDoLogo(tamanho, dim);
  const imagem = new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'center', background: '#ffffff',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUri} width={caixa.largura} height={caixa.altura} alt="" style={{ objectFit: 'contain' }} />
      </div>
    ),
    { width: tamanho, height: tamanho },
  );
  imagem.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  return imagem;
}
