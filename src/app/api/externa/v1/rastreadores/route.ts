import { NextResponse } from 'next/server';
import { erroApi, mensagemDoBanco, rotaApi } from '@/lib/api-externa-server';
import { decodificarCursor, lerDataHora, limitePagina, proximoCursor } from '@/lib/api-externa';

// GET /api/externa/v1/rastreadores — o parque de equipamentos. A chave ligada a
// uma rastreadora (fornecedor) ve so os equipamentos dela.
//   ?atualizados_desde= ?cursor= ?limite= ?imei=
export const dynamic = 'force-dynamic';

export const GET = rotaApi('rastreadores:ler', async (request, { integracao, supabase, registros }) => {
  const q = new URL(request.url).searchParams;
  const desde = lerDataHora(q.get('atualizados_desde'));
  if (!desde.ok) return erroApi(400, 'PARAMETRO_INVALIDO', 'atualizados_desde deve ser data/hora ISO 8601.');
  const cursorTexto = q.get('cursor');
  const cursor = decodificarCursor(cursorTexto);
  if (cursorTexto && !cursor) return erroApi(400, 'PARAMETRO_INVALIDO', 'cursor inválido.');
  const limite = limitePagina(q.get('limite'));

  const { data, error } = await supabase.rpc('api_rastreadores', {
    p_integracao_id: integracao.id,
    p_desde: desde.valor,
    p_cursor_em: cursor?.em ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limite: limite,
    p_imei: q.get('imei'),
  });
  if (error) return erroApi(400, 'ERRO_CONSULTA', mensagemDoBanco(error));

  const linhas = data ?? [];
  registros(linhas.length);
  return NextResponse.json({
    dados: linhas.map((r) => ({
      id: r.rastreador_id,
      imei: r.imei,
      numero_serie: r.numero_serie,
      iccid: r.iccid,
      linha: r.linha,
      operadora: r.operadora,
      modelo: r.modelo,
      fabricante: r.fabricante,
      status: r.status,
      status_numero: r.status_numero,
      status_desde: r.status_desde,
      rastreadora: r.rastreadora_id ? { id: r.rastreadora_id, nome: r.rastreadora_nome } : null,
      unidade: r.unidade_id ? { id: r.unidade_id, nome: r.unidade_nome } : null,
      veiculo: r.veiculo_id
        ? { id: r.veiculo_id, placa: r.placa, chassi: r.chassi, status: r.veiculo_status,
            situacao_rastreamento: r.situacao_rastreamento }
        : null,
      data_instalacao: r.data_instalacao,
      ultima_comunicacao: r.ultima_comunicacao,
      ultima_posicao: r.ultima_posicao,
      alterado_em: r.alterado_em,
    })),
    quantidade: linhas.length,
    proximo_cursor: proximoCursor(linhas, limite, (r) => ({ em: r.alterado_em, id: r.rastreador_id })),
  });
});
