import { NextResponse } from 'next/server';
import { erroApi, mensagemDoBanco, rotaApi } from '@/lib/api-externa-server';
import { tipoDaReferencia, veiculoParaApi } from '@/lib/api-externa';

// GET /api/externa/v1/veiculos/<placa | chassi | id> — um veiculo.
export const dynamic = 'force-dynamic';

export const GET = rotaApi('veiculos:ler', async (request, { integracao, supabase, registros }) => {
  const ref = decodeURIComponent(new URL(request.url).pathname.split('/').pop() ?? '').trim();
  if (!ref) return erroApi(400, 'PARAMETRO_INVALIDO', 'Informe a placa, o chassi ou o id.');
  const tipo = tipoDaReferencia(ref);

  const { data, error } = await supabase.rpc('api_veiculos', {
    p_integracao_id: integracao.id,
    p_limite: 2,
    p_placa: tipo === 'placa' ? ref : null,
    p_chassi: tipo === 'chassi' ? ref : null,
    p_veiculo_id: tipo === 'id' ? ref : null,
  });
  if (error) return erroApi(400, 'ERRO_CONSULTA', mensagemDoBanco(error));
  const linha = (data ?? [])[0];
  if (!linha) return erroApi(404, 'NAO_ENCONTRADO', 'Veículo não encontrado (ou fora das unidades desta chave).');
  registros(1);
  return NextResponse.json({ dados: veiculoParaApi(linha, integracao.escopos.includes('associados:ler')) });
});
