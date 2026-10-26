import { NextResponse } from 'next/server';
import { especificacaoApiExterna } from '@/lib/api-externa-openapi';

// GET /api/externa/v1/openapi.json — a documentacao da API (publica, sem chave):
// o fornecedor importa no Swagger/Postman. Nao tem dado nenhum.
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const h = request.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'appsmartcar.com.br';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return NextResponse.json(especificacaoApiExterna(`${proto}://${host}`), {
    headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' },
  });
}
