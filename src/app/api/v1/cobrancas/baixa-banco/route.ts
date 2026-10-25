import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SicrediGateway, configSicrediDoAmbiente, variaveisSicrediFaltando } from '@/lib/pagamentos/sicredi';
import {
  diaAnterior,
  diaValido,
  diasDaBaixa,
  hojeEmSaoPaulo,
  resumoDaBaixa,
  segredoConfere,
  type ResultadoLiquidacao,
} from '@/lib/baixa-banco';
import { reconferirAvisosPendentes, registrarLiquidacoesSicredi } from '@/lib/pagamentos/baixa-sicredi';
import type { LiquidacaoSicredi } from '@/lib/pagamentos/sicredi';

// POST /api/v1/cobrancas/baixa-banco — BAIXA AUTOMATICA (0105)
// Le os boletos pagos no Sicredi (`liquidados/dia`) e da baixa nos titulos.
//
// Quem chama:
//   * a TELA (sessao de admin/financeiro) — botao "Dar baixa agora";
//   * o AGENDADOR do VPS (cron), sem sessao, com o header
//     `x-cron-secret: $COBRANCA_CRON_SECRET`.
// Corpo opcional: { dia: 'YYYY-MM-DD' }. Sem dia: ontem e hoje (Sao Paulo).
// Depois, reconfere os avisos do webhook que ficaram AGUARDANDO (0122): do dia
// do aviso ate hoje, ate o pagamento aparecer em liquidados/dia.
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
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const { data: perfil } = await s.from('usuarios').select('papel, ativo').eq('id', user.id).maybeSingle();
    if (!perfil?.ativo || !['admin', 'financeiro'].includes(perfil.papel)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }
    supabase = s;
  }

  const body = (await request.json().catch(() => ({}))) as { dia?: string };
  if (body.dia != null && !diaValido(body.dia)) {
    return NextResponse.json({ error: 'dia inválido (use AAAA-MM-DD)' }, { status: 400 });
  }

  const cfg = configSicrediDoAmbiente(process.env);
  if (!cfg) {
    return NextResponse.json(
      { error: `Sicredi não configurado no servidor. Faltam: ${variaveisSicrediFaltando(process.env).join(', ')}` },
      { status: 400 },
    );
  }
  const gw = new SicrediGateway(cfg);

  const hoje = hojeEmSaoPaulo();
  const dias = diasDaBaixa(hoje, body.dia);
  const resultados: ResultadoLiquidacao[] = [];
  const falhasConsulta: Array<{ dia: string; erro: string }> = [];
  const cache = new Map<string, LiquidacaoSicredi[]>();

  for (const dia of dias) {
    let liquidados;
    try {
      liquidados = await gw.liquidadosDoDia(dia);
    } catch (e) {
      falhasConsulta.push({ dia, erro: (e as Error).message });
      continue;
    }
    cache.set(dia, liquidados);
    resultados.push(...(await registrarLiquidacoesSicredi(supabase, cfg.ambiente, liquidados, dia)));
  }

  // Avisos pendentes: a tabela so aceita escrita do servidor, entao vai pelo
  // admin client (quem chamou ja foi conferido acima).
  const avisos = await reconferirAvisosPendentes(createAdminClient(), gw, cfg.ambiente, hoje, cache);
  resultados.push(...avisos.resultados);

  const resumo = resumoDaBaixa(resultados);
  // 0147: o credito somado da cobranca (COMPE/REDE) ja importado do extrato fecha
  // com as baixas que acabaram de entrar. Falhar aqui nao derruba a baixa.
  let lotes = { conciliados: 0, valor: 0 };
  {
    const desde = diasDaBaixa(hoje)[0];
    const { data: rl, error: el } = await supabase.rpc('conciliar_lotes_cobranca', {
      p_conta: null, p_desde: diaAnterior(diaAnterior(diaAnterior(desde))),
    });
    if (el) console.warn('[baixa-banco] lotes da cobranca:', el.message);
    else if (rl?.[0]) lotes = { conciliados: Number(rl[0].conciliados), valor: Number(rl[0].valor) };
  }
  // 0148: o PIX da cobranca do extrato casa por valor no mesmo dia.
  let pix = { conciliados: 0, valor: 0 };
  {
    const desde = diaAnterior(diaAnterior(diaAnterior(diasDaBaixa(hoje)[0])));
    const { data: rp, error: ep } = await supabase.rpc('conciliar_pix_cobranca', { p_conta: null, p_desde: desde });
    if (ep) console.warn('[baixa-banco] PIX da cobranca:', ep.message);
    else if (rp?.[0]) pix = { conciliados: Number(rp[0].conciliados), valor: Number(rp[0].valor) };
  }

  const ok = falhasConsulta.length === 0 && resumo.erros === 0;
  return NextResponse.json(
    {
      ok,
      ambiente: cfg.ambiente,
      dias,
      resumo,
      avisos_pendentes: {
        reconferidos: avisos.pendentes,
        confirmados: avisos.confirmados,
        aguardando: avisos.aguardando,
        expirados: avisos.expirados,
      },
      lotes_conciliados: lotes,
      pix_conciliados: pix,
      falhas_consulta: falhasConsulta,
      resultados,
    },
    { status: falhasConsulta.length === dias.length ? 502 : 200 },
  );
}
