import { documentacaoMarkdown, origemDaRequisicao } from '@/lib/api-externa-doc';

// GET /api/externa/v1/docs.md — a mesma documentacao em Markdown (para enviar por e-mail/WhatsApp).
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return new Response(documentacaoMarkdown(origemDaRequisicao(request.headers)), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': 'inline; filename="scar-api-integracao.md"',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=300',
    },
  });
}
