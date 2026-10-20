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
      falhas_consulta: falhasConsulta,
      resultados,
    },
    { status: falhasConsulta.length === dias.length ? 502 : 200 },
  );
}
