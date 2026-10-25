import { NextResponse } from 'next/server';
import { erroApi, mensagemDoBanco, rotaApi } from '@/lib/api-externa-server';
import type { Json } from '@/lib/database.types';

// POST /api/externa/v1/rastreadores/comunicacao — a plataforma informa a
// ULTIMA COMUNICACAO (e a posicao) de cada equipamento, ate 500 por chamada:
//   { "comunicacoes": [ { "imei": "860...", "comunicado_em": "2026-10-25T10:00:00-03:00",
//                         "latitude": -15.6, "longitude": -56.1, "velocidade": 0,
//                         "ignicao": false, "endereco": "..." } ] }
// Cada item volta com o resultado (ATUALIZADO, IGNORADO_ANTIGO, NAO_ENCONTRADO,
// OUTRA_PLATAFORMA, INVALIDO) e a situacao do veiculo — a resposta ja diz se
// aquele rastreamento deve seguir, ser suspenso ou encerrado.
export const dynamic = 'force-dynamic';

export const POST = rotaApi('rastreadores:escrever', async (request, { integracao, supabase, registros }) => {
  const corpo = (await request.json().catch(() => null)) as { comunicacoes?: unknown } | unknown[] | null;
  const itens = Array.isArray(corpo) ? corpo : (corpo as { comunicacoes?: unknown } | null)?.comunicacoes;
  if (!Array.isArray(itens) || itens.length === 0) {
    return erroApi(400, 'CORPO_INVALIDO', 'Envie { "comunicacoes": [ { "imei", "comunicado_em", ... } ] }.');
  }
  if (itens.length > 500) return erroApi(400, 'CORPO_INVALIDO', 'No máximo 500 comunicações por chamada.');

  const { data, error } = await supabase.rpc('api_registrar_comunicacoes', {
    p_integracao_id: integracao.id,
    p_itens: itens as Json,
  });
  if (error) return erroApi(400, 'ERRO_GRAVACAO', mensagemDoBanco(error));

  const resultados = data ?? [];
  const resumo: Record<string, number> = {};
  for (const r of resultados) resumo[r.resultado] = (resumo[r.resultado] ?? 0) + 1;
  registros(resumo.ATUALIZADO ?? 0);
  return NextResponse.json({ resumo, resultados });
});
