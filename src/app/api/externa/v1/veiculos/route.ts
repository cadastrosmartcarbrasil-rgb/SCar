import { NextResponse } from 'next/server';
import { erroApi, mensagemDoBanco, rotaApi } from '@/lib/api-externa-server';
import { decodificarCursor, lerDataHora, limitePagina, proximoCursor, veiculoParaApi } from '@/lib/api-externa';

// GET /api/externa/v1/veiculos — a base para o CRUZAMENTO.
//   ?atualizados_desde=<ISO>  so o que mudou desde (sincronia incremental)
//   ?cursor=<proximo_cursor>  pagina seguinte
//   ?limite=1..500            (padrao 100)
//   ?placa= ?chassi= ?imei=   busca pontual
//   ?situacao=ATIVO|SUSPENSO|ENCERRADO
// Ordem: alterado_em, id — guarde o `alterado_em` do ultimo registro para a
// proxima sincronia.
export const dynamic = 'force-dynamic';

const SITUACOES = ['ATIVO', 'SUSPENSO', 'ENCERRADO'];

export const GET = rotaApi('veiculos:ler', async (request, { integracao, supabase, registros }) => {
  const q = new URL(request.url).searchParams;
  const desde = lerDataHora(q.get('atualizados_desde'));
  if (!desde.ok) return erroApi(400, 'PARAMETRO_INVALIDO', 'atualizados_desde deve ser data/hora ISO 8601.');
  const cursorTexto = q.get('cursor');
  const cursor = decodificarCursor(cursorTexto);
  if (cursorTexto && !cursor) return erroApi(400, 'PARAMETRO_INVALIDO', 'cursor inválido.');
  const situacao = q.get('situacao')?.toUpperCase() || null;
  if (situacao && !SITUACOES.includes(situacao)) {
    return erroApi(400, 'PARAMETRO_INVALIDO', `situacao deve ser ${SITUACOES.join(', ')}.`);
  }
  const limite = limitePagina(q.get('limite'));

  const { data, error } = await supabase.rpc('api_veiculos', {
    p_integracao_id: integracao.id,
    p_desde: desde.valor,
    p_cursor_em: cursor?.em ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limite: limite,
    p_placa: q.get('placa'),
    p_chassi: q.get('chassi'),
    p_imei: q.get('imei'),
    p_situacao: situacao,
  });
  if (error) return erroApi(400, 'ERRO_CONSULTA', mensagemDoBanco(error));

  const linhas = data ?? [];
  registros(linhas.length);
  const pessoais = integracao.escopos.includes('associados:ler');
  return NextResponse.json({
    dados: linhas.map((l) => veiculoParaApi(l, pessoais)),
    quantidade: linhas.length,
    proximo_cursor: proximoCursor(linhas, limite, (l) => ({ em: l.alterado_em, id: l.veiculo_id })),
  });
});
