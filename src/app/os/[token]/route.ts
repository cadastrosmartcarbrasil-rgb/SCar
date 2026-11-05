import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { lerTokenDaOS } from '@/lib/comunicacao/servidor';
import { consumirTentativa, ipDaRequisicao } from '@/lib/rate-limit';

// GET /os/<token> — o PDF da Ordem de Servico (0181) para o PRESTADOR, pelo link
// do WhatsApp. Publico, sem login: a prova e o token assinado (EMAIL_LINK_SECRET),
// que vale 7 dias. A URL nao leva nome, CPF, placa nem valor.
export const dynamic = 'force-dynamic';

function pagina(titulo: string, texto: string, status = 200) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head>
<body style="margin:0;font-family:Arial,sans-serif;background:#EEF2F8;color:#0F1B33"><div style="max-width:480px;margin:48px auto;background:#fff;border:1px solid #D5DDEA;border-radius:10px;padding:24px">
<p style="font-weight:700;color:#1E2B4D;margin:0 0 12px">SMART CAR BRASIL</p><h1 style="font-size:18px;margin:0 0 8px">${titulo}</h1><p style="margin:0;line-height:1.5">${texto}</p></div></body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const lim = consumirTentativa(`os-link:${ipDaRequisicao(request)}`, 30, 600);
  if (!lim.permitido) return pagina('Muitas tentativas', 'Aguarde alguns minutos e tente de novo.', 429);
  const segredo = (process.env.EMAIL_LINK_SECRET ?? '').trim();
  if (!segredo) return pagina('Link indisponível', 'Peça o PDF da Ordem de Serviço ao Departamento de Eventos.', 503);
  const lido = lerTokenDaOS(decodeURIComponent(params.token), segredo);
  if ('erro' in lido) {
    return lido.erro === 'expirado'
      ? pagina('Link expirado', 'Este link não vale mais. Peça um novo ao Departamento de Eventos da Smart Car Brasil.', 410)
      : pagina('Link inválido', 'Confira se o endereço foi copiado inteiro.', 404);
  }
  const admin = createAdminClient();
  const { data: os } = await admin.from('ordens_servico').select('numero, status, termo_emitido_id').eq('id', lido.osId).maybeSingle();
  if (!os) return pagina('Ordem de Serviço não encontrada', 'Fale com o Departamento de Eventos.', 404);
  if (os.status === 'CANCELADA') return pagina('Ordem de Serviço cancelada', `A ${os.numero} foi cancelada. Não execute o serviço sem nova autorização.`);
  if (os.status === 'SUBSTITUIDA') return pagina('Ordem de Serviço substituída', `A ${os.numero} foi substituída por uma retificação. Peça a OS atual ao Departamento de Eventos.`);
  const { data: e } = await admin.from('termos_emitidos').select('pdf_path').eq('id', os.termo_emitido_id!).maybeSingle();
  if (!e?.pdf_path) return pagina('Documento em preparação', 'O PDF ainda não foi gerado. Tente de novo em alguns minutos.');
  const { data: arq, error } = await admin.storage.from('termos').download(e.pdf_path);
  if (error || !arq) return pagina('Não foi possível abrir o PDF agora', 'Tente de novo em alguns minutos.', 502);
  return new NextResponse(new Uint8Array(await arq.arrayBuffer()), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${os.numero}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
