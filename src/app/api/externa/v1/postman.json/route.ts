import { NextResponse } from 'next/server';
import { colecaoPostman, origemDaRequisicao } from '@/lib/api-externa-doc';

// GET /api/externa/v1/postman.json — colecao do Postman com as 5 chamadas prontas
// (variaveis base_url e chave).
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return NextResponse.json(colecaoPostman(origemDaRequisicao(request.headers)), {
    headers: {
      'content-disposition': 'attachment; filename="scar-api-integracao.postman_collection.json"',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=300',
    },
  });
}
