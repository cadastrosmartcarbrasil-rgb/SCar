import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/database.types';
import { avisoExpirou, diasParaReconferir, type ResultadoLiquidacao } from '@/lib/baixa-banco';
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
      resultados.push({ nosso_numero: null, situacao: 'ERRO', valor_pago: l.valorPago, erro: 'pagamento sem nosso número' });
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

/** Aviso do webhook que ainda nao apareceu em liquidados/dia (0122). */
export interface AvisoNaoConfirmado {
  nossoNumero: string;
  movimento?: string | null;
  data?: string | null;
  previsao?: string | null;
}

/**
 * Grava (ou renova) o aviso como AGUARDANDO — antes ele ficava so no log do
 * contêiner e, se a lista do banco demorasse a trazer o pagamento, a baixa
 * nunca acontecia. Um aviso por boleto: aviso repetido so atualiza.
 */
export async function guardarAvisosPendentes(
  admin: SupabaseClient<Database>,
  ambiente: AmbienteSicredi,
  avisos: AvisoNaoConfirmado[],
  payload: unknown,
): Promise<void> {
  if (!avisos.length) return;
  const { error } = await admin.from('cobranca_avisos_banco').upsert(
    avisos.map((a) => ({
      provedor: 'SICREDI' as const,
      ambiente,
      nosso_numero: a.nossoNumero,
      movimento: a.movimento ?? null,
      data_aviso: a.data ?? null,
      previsao_credito: a.previsao ?? null,
      payload: (payload ?? null) as Json,
      situacao: 'AGUARDANDO' as const,
      confirmado_em: null,
    })),
    { onConflict: 'provedor,ambiente,nosso_numero' },
  );
  if (error) console.error('[sicredi-avisos] falha ao guardar aviso pendente:', error.message);
}

/** Marca como CONFIRMADO o aviso pendente dos nossos numeros que acabaram de ser gravados. */
export async function confirmarAvisos(
  admin: SupabaseClient<Database>,
  ambiente: AmbienteSicredi,
  nossosNumeros: string[],
): Promise<void> {
  const nns = Array.from(new Set(nossosNumeros.filter(Boolean)));
  if (!nns.length) return;
  await admin
    .from('cobranca_avisos_banco')
    .update({ situacao: 'CONFIRMADO', confirmado_em: new Date().toISOString() })
    .eq('provedor', 'SICREDI')
    .eq('ambiente', ambiente)
    .eq('situacao', 'AGUARDANDO')
    .in('nosso_numero', nns);
}

export interface ResumoReconferencia {
  pendentes: number;
  confirmados: number;
  expirados: number;
  aguardando: number;
  resultados: ResultadoLiquidacao[];
}

/**
 * Reconfere os avisos AGUARDANDO (0122): para cada um, procura o pagamento em
 * liquidados/dia do dia do aviso ate hoje (`diasParaReconferir`). Achou, grava
 * pela MESMA regra de sempre e confirma; ja estava na trilha (o agendador pegou
 * por outro caminho), so confirma; passou do prazo, vira EXPIRADO. Usado pelo
 * agendador, depois da leitura normal de ontem e hoje.
 */
export async function reconferirAvisosPendentes(
  admin: SupabaseClient<Database>,
  gw: { liquidadosDoDia(dia: string): Promise<LiquidacaoSicredi[]> },
  ambiente: AmbienteSicredi,
  hoje: string,
  cache: Map<string, LiquidacaoSicredi[]> = new Map(),
): Promise<ResumoReconferencia> {
  const resumo: ResumoReconferencia = { pendentes: 0, confirmados: 0, expirados: 0, aguardando: 0, resultados: [] };
  const { data: pendentes, error } = await admin
    .from('cobranca_avisos_banco')
    .select('id, nosso_numero, data_aviso, previsao_credito, recebido_em, tentativas')
    .eq('provedor', 'SICREDI')
    .eq('ambiente', ambiente)
    .eq('situacao', 'AGUARDANDO')
    .order('recebido_em', { ascending: true })
    .limit(200);
  if (error) {
    console.error('[sicredi-avisos] falha ao ler avisos pendentes:', error.message);
    return resumo;
  }
  resumo.pendentes = pendentes?.length ?? 0;

  for (const a of pendentes ?? []) {
    const agora = new Date().toISOString();
    // ja entrou na trilha por outro caminho (a leitura normal de ontem/hoje)?
    const { data: ja } = await admin
      .from('cobranca_liquidacoes')
      .select('id')
      .eq('provedor', 'SICREDI')
      .eq('ambiente', ambiente)
      .eq('nosso_numero', a.nosso_numero)
      .limit(1);
    let confirmado = !!ja?.length;

    if (!confirmado) {
      for (const dia of diasParaReconferir(hoje, a.data_aviso, a.previsao_credito)) {
        let lista = cache.get(dia);
        if (!lista) {
          try {
            lista = await gw.liquidadosDoDia(dia);
          } catch (e) {
            console.error('[sicredi-avisos] falha ao consultar liquidados de', dia, (e as Error).message);
            continue; // nao guarda no cache: a proxima rodada tenta de novo
          }
          cache.set(dia, lista);
        }
        const achados = lista.filter((l) => l.nossoNumero === a.nosso_numero);
        if (achados.length) {
          resumo.resultados.push(...(await registrarLiquidacoesSicredi(admin, ambiente, achados, dia)));
          confirmado = true;
          break;
        }
      }
    }

    if (confirmado) {
      resumo.confirmados++;
      await admin
        .from('cobranca_avisos_banco')
        .update({ situacao: 'CONFIRMADO', confirmado_em: agora, ultima_tentativa_em: agora, tentativas: a.tentativas + 1 })
        .eq('id', a.id);
    } else if (avisoExpirou(a.recebido_em, hoje)) {
      resumo.expirados++;
      await admin
        .from('cobranca_avisos_banco')
        .update({ situacao: 'EXPIRADO', ultima_tentativa_em: agora, tentativas: a.tentativas + 1 })
        .eq('id', a.id);
    } else {
      resumo.aguardando++;
      await admin
        .from('cobranca_avisos_banco')
        .update({ ultima_tentativa_em: agora, tentativas: a.tentativas + 1 })
        .eq('id', a.id);
    }
  }
  return resumo;
}
