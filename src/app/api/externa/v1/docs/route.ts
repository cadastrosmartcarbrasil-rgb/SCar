import { origemDaRequisicao, paginaDocumentacao } from '@/lib/api-externa-doc';

// GET /api/externa/v1/docs — a documentacao para o parceiro ler (publica, sem chave):
// endpoints, parametros, exemplos de chamada e de resposta, erros. Nao tem dado nenhum.
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return new Response(paginaDocumentacao(origemDaRequisicao(request.headers)), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
}
