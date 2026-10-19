import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ENV_SICREDI,
  SicrediGateway,
  avisosDoWebhook,
  configSicrediDoAmbiente,
  mascararSegredo,
  type LiquidacaoSicredi,
} from '@/lib/pagamentos/sicredi';
import {
  confirmarAvisos,
  guardarAvisosPendentes,
  registrarLiquidacoesSicredi,
  type AvisoNaoConfirmado,
} from '@/lib/pagamentos/baixa-sicredi';
import { diasParaConfirmar, hojeEmSaoPaulo, resumoDaBaixa, segredoConfere, type ResultadoLiquidacao } from '@/lib/baixa-banco';

// POST /api/v1/sicredi/webhook/<SICREDI_WEBHOOK_SECRET> — aviso de LIQUIDACAO.
//
// O Sicredi chama esta URL (cadastrada no contrato de webhook) quando um boleto
// e pago. Ele nao assina o aviso, entao:
//   1. o segredo vai no CAMINHO da URL — sem ele a rota responde 404;
//   2. o corpo do aviso so diz QUAL boleto olhar: a baixa so acontece depois de
//      o proprio Sicredi confirmar o pagamento em `liquidados/dia`, com as
//      nossas credenciais, e o valor/data gravados sao os dessa confirmacao.
// Aviso que ainda nao aparece na lista volta como NAO_CONFIRMADO e fica
// GRAVADO em cobranca_avisos_banco (0122): o agendador (baixa-banco, 4x ao
// dia) reconfere do dia do aviso ate hoje, ate achar. A RPC e re-executavel.
// Responde 200 sempre que o segredo confere, para o banco nao reenviar em laco.
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { segredo: string } }) {
  const segredo = process.env[ENV_SICREDI.webhookSecret];
  if (!segredoConfere(params.segredo, segredo)) {
    return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 });
  }

  const texto = await request.text();
  let payload: unknown = null;
  try {
    payload = texto ? JSON.parse(texto) : null;
  } catch {
    payload = texto;
  }
  // O formato do aviso ainda nao foi visto em producao: fica no log do contêiner.
  console.log('[sicredi-webhook] aviso recebido:', mascararSegredo(texto.slice(0, 2000), segredo));

  const cfg = configSicrediDoAmbiente(process.env);
  if (!cfg) {
    console.error('[sicredi-webhook] SICREDI_* incompletas no servidor');
    return NextResponse.json({ ok: false, motivo: 'sicredi nao configurado' });
  }

  const avisos = avisosDoWebhook(payload);
  const gw = new SicrediGateway(cfg);
  const hoje = hojeEmSaoPaulo();
  const cachePorDia = new Map<string, LiquidacaoSicredi[]>();
  const resultados: Array<ResultadoLiquidacao | { nosso_numero: string; situacao: 'NAO_CONFIRMADO' | 'ESTORNO_IGNORADO' }> = [];
  const supabase = createAdminClient();
  const pendentes: AvisoNaoConfirmado[] = [];
  const confirmados: string[] = [];

  for (const aviso of avisos) {
    if (aviso.estorno) {
      // O contrato assina so LIQUIDACAO; estorno ainda nao tem tratamento.
      console.warn('[sicredi-webhook] estorno recebido e NAO tratado:', aviso.nossoNumero, aviso.movimento);
      resultados.push({ nosso_numero: aviso.nossoNumero, situacao: 'ESTORNO_IGNORADO' });
      continue;
    }
    let confirmado = false;
    for (const dia of diasParaConfirmar(hoje, aviso.data, aviso.previsao)) {
      let lista = cachePorDia.get(dia);
      if (!lista) {
        try {
          lista = await gw.liquidadosDoDia(dia);
        } catch (e) {
          console.error('[sicredi-webhook] falha ao consultar liquidados de', dia, (e as Error).message);
          lista = [];
        }
        cachePorDia.set(dia, lista);
      }
      const achados = lista.filter((l) => l.nossoNumero === aviso.nossoNumero);
      if (achados.length) {
        resultados.push(...(await registrarLiquidacoesSicredi(supabase, cfg.ambiente, achados, dia)));
        confirmado = true;
        confirmados.push(aviso.nossoNumero);
        break;
      }
    }
    if (!confirmado) {
      resultados.push({ nosso_numero: aviso.nossoNumero, situacao: 'NAO_CONFIRMADO' });
      pendentes.push(aviso);
    }
  }
  await guardarAvisosPendentes(supabase, cfg.ambiente, pendentes, payload);
  await confirmarAvisos(supabase, cfg.ambiente, confirmados);

  const gravados = resultados.filter((r): r is ResultadoLiquidacao => r.situacao !== 'NAO_CONFIRMADO' && r.situacao !== 'ESTORNO_IGNORADO');
  const resumo = { avisos: avisos.length, ...resumoDaBaixa(gravados), nao_confirmados: resultados.filter((r) => r.situacao === 'NAO_CONFIRMADO').length };
  console.log('[sicredi-webhook] resultado:', JSON.stringify(resumo));
  return NextResponse.json({ ok: true, resumo });
}
