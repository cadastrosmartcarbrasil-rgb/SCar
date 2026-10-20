import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { segredoConfere } from '@/lib/baixa-banco';
import { remetenteEmail } from '@/lib/email';
import { alertasParaEmail, assuntoEmailPrazos, linhaDoAlerta, type AlertaNovo } from '@/lib/prazo-regulatorio';

// POST /api/v1/eventos/prazos — ROTINA DIARIA do prazo regulatorio (0113,
// Art. 22 da Resolucao CNSP 491/2026).
//
// Quem chama:
//   * o AGENDADOR do VPS (crontab -> scripts/eventos-prazos.sh), sem sessao,
//     com o header `x-cron-secret: $COBRANCA_CRON_SECRET` (o mesmo da baixa);
//   * a matriz (sessao admin/financeiro), para rodar na hora.
// O que faz: `atualizar_prazos_eventos()` grava o contador de cada evento aberto
// e dispara os alertas de 30/60/75/85 dias e de vencido, UMA vez por marco
// (re-executavel). Os de 85 e vencido saem por e-mail para a diretoria e para o
// gestor da unidade, quando o Resend esta configurado; sem ele, ficam na tela.
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

  const { data, error } = await supabase.rpc('atualizar_prazos_eventos');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const resultado = (data ?? {}) as { eventos_abertos?: number; por_nivel?: Record<string, number>; alertas_novos?: AlertaNovo[] };
  const novos = resultado.alertas_novos ?? [];
  const paraEmail = alertasParaEmail(novos);

  let email: { enviados: number; destinatarios: number; aviso?: string } = { enviados: 0, destinatarios: 0 };
  if (paraEmail.length > 0) {
    if (!process.env.RESEND_API_KEY) {
      email.aviso = 'RESEND_API_KEY nao configurada: os alertas ficam so na tela.';
    } else {
      const admin = createAdminClient();
      const unidades = Array.from(new Set(paraEmail.map((a) => a.regional_id).filter((x): x is string => !!x)));
      const { data: pessoas } = await admin
        .from('usuarios')
        .select('email, papel, regional_id')
        .eq('ativo', true)
        .in('papel', ['admin', 'financeiro', 'gestor_regional']);
      const destinos = Array.from(
        new Set(
          (pessoas ?? [])
            .filter((p) => p.papel !== 'gestor_regional' || (p.regional_id && unidades.includes(p.regional_id)))
            .map((p) => p.email)
            .filter((e): e is string => !!e),
        ),
      );
      email.destinatarios = destinos.length;
      if (destinos.length > 0) {
        const origem = new URL(request.url).origin;
        const html = `<p>Eventos que chegaram ao prazo regulatório crítico (Art. 22, Resolução CNSP 491/2026 — 90 dias para regular e liquidar; vencido, a associação perde o direito de recusa):</p><ul>${paraEmail
          .map((a) => `<li><a href="${origem}/eventos/${a.evento_id}">${linhaDoAlerta(a)}</a></li>`)
          .join('')}</ul><p><a href="${origem}/eventos?aba=prazos">Abrir o painel de prazos</a></p>`;
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: remetenteEmail(), to: destinos, subject: assuntoEmailPrazos(paraEmail), html }),
          });
          if (res.ok) {
            email.enviados = paraEmail.length;
            await admin.rpc('marcar_alertas_prazo_notificados', { p_ids: paraEmail.map((a) => a.alerta_id) });
          } else {
            email.aviso = `Resend respondeu HTTP ${res.status}`;
          }
        } catch (e) {
          email.aviso = `Falha no envio: ${(e as Error).message}`;
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    resumo: { eventos_abertos: resultado.eventos_abertos ?? 0, alertas_novos: novos.length, email_enviados: email.enviados },
    por_nivel: resultado.por_nivel ?? {},
    email,
    alertas_novos: novos,
  });
}
