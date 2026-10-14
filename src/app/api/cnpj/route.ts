import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PROVEDORES_CNPJ } from '@/lib/cnpj-provedores';

// Consulta publica de CNPJ, server-side (evita CORS). Tenta os provedores em
// ordem (BrasilAPI -> CNPJ.ws -> ReceitaWS) e devolve o primeiro que achar.
// A BrasilAPI sozinha falhava em producao sem dizer nada; agora, se TODOS
// falharem, a resposta diz o que cada um respondeu (`tentativas`) e o
// servidor loga, para o problema aparecer em vez de virar "preencha a mao".
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  const { cnpj } = await request.json();
  const c = String(cnpj ?? '').replace(/\D/g, '');
  if (c.length !== 14) return NextResponse.json({ found: false, error: 'CNPJ invalido' });

  const tentativas: string[] = [];
  let naoExiste = 0;
  for (const p of PROVEDORES_CNPJ) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 7000);
    try {
      const res = await fetch(p.url(c), {
        signal: ctrl.signal,
        cache: 'no-store',
        // sem User-Agent alguns provedores recusam a chamada de servidor
        headers: { Accept: 'application/json', 'User-Agent': 'SCar/1.0 (+https://appsmartcar.com.br)' },
      });
      if (res.status === 404) { naoExiste++; tentativas.push(`${p.nome}: nao encontrado`); continue; }
      if (!res.ok) { tentativas.push(`${p.nome}: HTTP ${res.status}`); continue; }
      const d = p.ler((await res.json()) as Record<string, unknown>);
      if (!d) { tentativas.push(`${p.nome}: sem dados`); continue; }
      return NextResponse.json({ found: true, fonte: p.nome, ...d });
    } catch (e) {
      tentativas.push(`${p.nome}: ${(e as Error).name === 'AbortError' ? 'tempo esgotado' : 'falha de rede'}`);
    } finally {
      clearTimeout(timeout);
    }
  }
  console.warn('[cnpj] nenhum provedor respondeu', c.slice(0, 8), tentativas.join(' | '));
  return NextResponse.json({
    found: false,
    nao_encontrado: naoExiste === PROVEDORES_CNPJ.length,
    tentativas,
  });
}
