import { NextResponse } from 'next/server';
import { especificacaoApiExterna } from '@/lib/api-externa-openapi';
import { origemDaRequisicao } from '@/lib/api-externa-doc';

// GET /api/externa/v1/openapi.json — a especificacao OpenAPI (publica, sem chave):
// o fornecedor importa no Swagger/Postman. Nao tem dado nenhum.
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return NextResponse.json(especificacaoApiExterna(origemDaRequisicao(request.headers)), {
    headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' },
  });
}
