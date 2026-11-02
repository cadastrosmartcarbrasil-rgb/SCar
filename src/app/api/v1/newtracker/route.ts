import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  BASE_NEWTRACKER, RECURSOS_NEWTRACKER, cabecalhoNewTracker, camposDaAmostra, ehRecursoNewTracker,
  lerPaginaNewTracker, mensagemErroNewTracker, urlNewTracker, type RecursoNewTracker,
} from '@/lib/newtracker';

// POST /api/v1/newtracker
// Proxy server-side da API da plataforma da NEW TRACKER (Fleet Hub 360), no molde
// do /api/v1/mutual: a CHAVE fh_live_ nunca vai ao navegador.
//
// FASE 1: SO LEITURA E NADA E GRAVADO. Serve para testar a chave e ver uma
// amostra real de cada recurso antes de escrever a sincronia do parque.
//
// Ambiente do VPS (.env + docker-compose.yml):
//   NEWTRACKER_API_KEY  -> chave fh_live_... (obrigatoria)
//   NEWTRACKER_API_BASE -> opcional, padrao https://bgixdmhmaheznzqjljhk.supabase.co/functions/v1
export const dynamic = 'force-dynamic';

const LIMITE_AMOSTRA = 20;

interface Body {
  recurso?: string;
  limite?: number;
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { data: perfil } = await supabase
    .from('usuarios').select('papel, ativo').eq('id', user.id).maybeSingle();
  if (!perfil?.ativo || perfil.papel !== 'admin') {
    return NextResponse.json({ error: 'Somente o administrador pode testar a integração da New Tracker' }, { status: 403 });
  }

  const chave = process.env.NEWTRACKER_API_KEY?.trim();
  const base = (process.env.NEWTRACKER_API_BASE?.trim() || BASE_NEWTRACKER).replace(/\/+$/, '');
  if (!chave) return NextResponse.json({ configured: false });

  const body = (await request.json().catch(() => ({}))) as Body;
  const recurso: RecursoNewTracker = ehRecursoNewTracker(body.recurso) ? body.recurso : 'status';
  const limite = Math.min(LIMITE_AMOSTRA, Math.max(1, Math.floor(body.limite ?? 5)));
  const alvo = urlNewTracker(base, recurso, { limite });

  const inicio = Date.now();
  try {
    const res = await fetch(alvo, {
      headers: cabecalhoNewTracker(chave),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    const texto = await res.text();
    let corpo: unknown = null;
    try { corpo = JSON.parse(texto); } catch { /* HTML ou texto: mostra o comeco */ }
    const ms = Date.now() - inicio;
    console.log(`[newtracker] ${recurso} HTTP ${res.status} ${ms}ms`);

    if (!res.ok) {
      return NextResponse.json({
        configured: true, ok: false, http: res.status, recurso, ms,
        erro: mensagemErroNewTracker(res.status, corpo),
        bruto: corpo ?? texto.slice(0, 300),
      });
    }

    const pagina = lerPaginaNewTracker(corpo);
    return NextResponse.json({
      configured: true,
      ok: true,
      http: res.status,
      recurso,
      rotulo: RECURSOS_NEWTRACKER[recurso],
      ms,
      total: pagina.total,
      // status: o corpo inteiro (empresa e permissoes da chave)
      corpo: recurso === 'status' ? (pagina.corpo ?? corpo ?? texto.slice(0, 300)) : null,
      campos: camposDaAmostra(pagina.dados),
      amostra: pagina.dados,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      configured: true, ok: false, http: 0, recurso, ms: Date.now() - inicio,
      erro: `Não foi possível falar com a New Tracker (${msg}).`,
    });
  }
}
