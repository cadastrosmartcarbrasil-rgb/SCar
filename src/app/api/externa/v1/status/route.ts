import { NextResponse } from 'next/server';
import { rotaApi } from '@/lib/api-externa-server';

// GET /api/externa/v1/status — confere a chave: devolve a integracao e os escopos.
// Primeira chamada de quem esta integrando ("a chave funciona?").
export const dynamic = 'force-dynamic';

export const GET = rotaApi(null, async (_req, { integracao, ip }) =>
  NextResponse.json({
    ok: true,
    integracao: integracao.nome,
    escopos: integracao.escopos,
    unidades: integracao.regional_ids ?? 'todas',
    seu_ip: ip,
    servidor_em: new Date().toISOString(),
    versao: 'v1',
  }),
);
