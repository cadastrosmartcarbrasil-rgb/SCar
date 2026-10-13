import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SicrediGateway, configSicrediDoAmbiente, variaveisSicrediFaltando } from '@/lib/pagamentos/sicredi';
import {
  diaValido,
  diasDaBaixa,
  hojeEmSaoPaulo,
  resumoDaBaixa,
  segredoConfere,
  type ResultadoLiquidacao,
} from '@/lib/baixa-banco';
import type { Json } from '@/lib/database.types';

// POST /api/v1/cobrancas/baixa-banco — BAIXA AUTOMATICA (0105)
// Le os boletos pagos no Sicredi (`liquidados/dia`) e da baixa nos titulos.
//
// Quem chama:
//   * a TELA (sessao de admin/financeiro) — botao "Dar baixa agora";
//   * o AGENDADOR do VPS (cron), sem sessao, com o header
//     `x-cron-secret: $COBRANCA_CRON_SECRET`.
// Corpo opcional: { dia: 'YYYY-MM-DD' }. Sem dia: ontem e hoje (Sao Paulo).
//
// Re-executavel: a trilha (cobranca_liquidacoes) e unica por nosso numero +
// data, e titulo ja pago vira JA_PAGO sem ser tocado.
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const pelaCron = segredoConfere(request.headers.get('x-cron-secret'), process.env.COBRANCA_CRON_SECRET);

  let supabase: ReturnType<typeof createClient> | ReturnType<typeof createAdminClient>;
  if (pelaCron) {
    supabase = createAdminClient();
  } else {
    const s = createClient();
    const { data: { user } } = await s.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
    const { data: perfil } = await s.from('usuarios').select('papel, ativo').eq('id', user.id).maybeSingle();
    if (!perfil?.ativo || !['admin', 'financeiro'].includes(perfil.papel)) {
      return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });
    }
    supabase = s;
  }

  const body = (await request.json().catch(() => ({}))) as { dia?: string };
  if (body.dia != null && !diaValido(body.dia)) {
    return NextResponse.json({ error: 'dia invalido (use AAAA-MM-DD)' }, { status: 400 });
  }

  const cfg = configSicrediDoAmbiente(process.env);
  if (!cfg) {
    return NextResponse.json(
      { error: `Sicredi nao configurado no servidor. Faltam: ${variaveisSicrediFaltando(process.env).join(', ')}` },
      { status: 400 },
    );
  }
  const gw = new SicrediGateway(cfg);

  const dias = diasDaBaixa(hojeEmSaoPaulo(), body.dia);
  const resultados: ResultadoLiquidacao[] = [];
  const falhasConsulta: Array<{ dia: string; erro: string }> = [];

  for (const dia of dias) {
    let liquidados;
    try {
      liquidados = await gw.liquidadosDoDia(dia);
    } catch (e) {
      falhasConsulta.push({ dia, erro: (e as Error).message });
      continue;
    }
    for (const l of liquidados) {
      if (!l.nossoNumero) {
        resultados.push({ nosso_numero: null, situacao: 'ERRO', valor_pago: l.valorPago, erro: 'pagamento sem nosso numero' });
        continue;
      }
      const { data, error } = await supabase.rpc('registrar_liquidacao_banco', {
        p_provedor: 'SICREDI',
        p_ambiente: cfg.ambiente,
        p_nosso_numero: l.nossoNumero,
        p_seu_numero: l.seuNumero,
        p_data_pagamento: l.dataPagamento,
        p_valor_pago: l.valorPago,
        p_dia_consultado: dia,
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
  }

  const resumo = resumoDaBaixa(resultados);
  const ok = falhasConsulta.length === 0 && resumo.erros === 0;
  return NextResponse.json(
    { ok, ambiente: cfg.ambiente, dias, resumo, falhas_consulta: falhasConsulta, resultados },
    { status: falhasConsulta.length === dias.length ? 502 : 200 },
  );
}
