import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/database.types';
import type { ResultadoLiquidacao } from '@/lib/baixa-banco';
import type { AmbienteSicredi, LiquidacaoSicredi } from './sicredi';

/**
 * Grava cada pagamento informado pelo Sicredi pela RPC da 0105
 * (casa com o titulo, da a baixa e deixa a trilha). Usada pelo agendador
 * (/api/v1/cobrancas/baixa-banco) e pelo webhook (/api/v1/sicredi/webhook):
 * os dois caminhos passam pela MESMA regra, e reler nao duplica nada.
 */
export async function registrarLiquidacoesSicredi(
  supabase: SupabaseClient<Database>,
  ambiente: AmbienteSicredi,
  liquidacoes: LiquidacaoSicredi[],
  diaConsultado: string,
): Promise<ResultadoLiquidacao[]> {
  const resultados: ResultadoLiquidacao[] = [];
  for (const l of liquidacoes) {
    if (!l.nossoNumero) {
      resultados.push({ nosso_numero: null, situacao: 'ERRO', valor_pago: l.valorPago, erro: 'pagamento sem nosso numero' });
      continue;
    }
    const { data, error } = await supabase.rpc('registrar_liquidacao_banco', {
      p_provedor: 'SICREDI',
      p_ambiente: ambiente,
      p_nosso_numero: l.nossoNumero,
      p_seu_numero: l.seuNumero,
      p_data_pagamento: l.dataPagamento,
      p_valor_pago: l.valorPago,
      p_dia_consultado: diaConsultado,
      p_payload: (l.bruto ?? null) as Json,
    });
    const linha = Array.isArray(data) ? data[0] : null;
    resultados.push(
      error || !linha
        ? { nosso_numero: l.nossoNumero, situacao: 'ERRO', valor_pago: l.valorPago, erro: error?.message ?? 'sem retorno' }
        : {
            nosso_numero: l.nossoNumero,
            situacao: linha.situacao,
            valor_pago: l.valorPago,
            valor_divergente: linha.valor_divergente,
          },
    );
  }
  return resultados;
}
