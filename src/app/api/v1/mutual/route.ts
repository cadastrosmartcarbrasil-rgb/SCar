import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  ENTIDADES_MUTUAL, ENTIDADES_PAGINADAS, urlMutual, cabecalhoMutual,
  extrairLista, extrairTotal, temProximaPagina, type EntidadeMutual,
} from '@/lib/mutual';
import type { Json } from '@/lib/database.types';

// POST /api/v1/mutual
// Proxy server-side da API do MUTUAL (sistema atual), no mesmo molde do
// /api/fipe: o TOKEN nunca vai ao navegador. Ele da leitura da base inteira de
// associados — e o segredo mais sensivel do projeto.
//
// FASE 1: so LEITURA. O que vem cai na area de captura (0062) e vira relatorio;
// nada aqui escreve em clientes/veiculos/titulos.
//
// Configure no ambiente do VPS:
//   MUTUAL_API_TOKEN  -> token da integracao (obrigatorio)
//   MUTUAL_API_BASE   -> default https://smartcar-api.mutualignit.com.br
export const dynamic = 'force-dynamic';

const BASE_PADRAO = 'https://smartcar-api.mutualignit.com.br';
const PAGE_SIZE_PADRAO = 500;   // teto declarado no contrato (/quotation/)

interface Body {
  action?: 'ping' | 'capturar';
  entidade?: EntidadeMutual;
  paginas?: number;             // quantas paginas puxar nesta chamada
  pagina_inicial?: number;
  page_size?: number;
  updated_at__gte?: string;     // sincronia incremental (CONTRACT_OBJECT, INVOICE)
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  // Puxar dados do Mutual e da MATRIZ: a trava real esta no banco
  // (mutual_registrar_captura exige tem_acesso_global), esta aqui e a mensagem.
  const { data: perfil } = await supabase
    .from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (!perfil || !['admin', 'financeiro'].includes(perfil.papel)) {
    return NextResponse.json(
      { error: 'Somente a matriz (admin/financeiro) pode consultar o Mutual' }, { status: 403 });
  }

  const token = process.env.MUTUAL_API_TOKEN;
  const base = (process.env.MUTUAL_API_BASE || BASE_PADRAO).replace(/\/+$/, '');
  // Mesma postura do /api/fipe: sem token, a tela mostra "nao configurado" em
  // vez de estourar um erro que parece falha da Mutual.
  if (!token) return NextResponse.json({ configured: false });

  const body = (await request.json().catch(() => ({}))) as Body;
  const action = body.action ?? 'ping';

  // --- ping: a API responde e o token vale? --------------------------------
  if (action === 'ping') {
    const alvo = urlMutual(base, 'VEHICLE_TYPE');  // lista curta e barata
    try {
      const res = await fetch(alvo, { headers: cabecalhoMutual(token), cache: 'no-store' });
      const texto = await res.text();
      let corpo: unknown = null;
      try { corpo = JSON.parse(texto); } catch { /* HTML = login/erro */ }
      return NextResponse.json({
        configured: true,
        ok: res.ok,
        http: res.status,
        url: alvo,
        registros: corpo ? extrairLista(corpo).length : 0,
        // Erro do Mutual nao vai cru para a tela; so o comeco, para diagnostico.
        amostra: corpo ? extrairLista(corpo).slice(0, 3) : texto.slice(0, 200),
      });
    } catch (e) {
      return NextResponse.json(
        { configured: true, ok: false, erro: (e as Error).message }, { status: 502 });
    }
  }

  // --- capturar: puxa paginas e grava na area de captura -------------------
  const entidade = body.entidade;
  if (!entidade || !(entidade in ENTIDADES_MUTUAL)) {
    return NextResponse.json({ error: 'entidade invalida' }, { status: 400 });
  }
  const pagina0 = Math.max(body.pagina_inicial ?? 1, 1);
  const maxPaginas = Math.min(Math.max(body.paginas ?? 5, 1), 100);
  const tamanho = Math.min(Math.max(body.page_size ?? PAGE_SIZE_PADRAO, 1), 500);
  const pagina_a_pagina = ENTIDADES_PAGINADAS.includes(entidade);

  const { data: sinc } = await supabase
    .from('mutual_sincronias')
    .insert({ entidade, executada_por: user.id })
    .select('id').maybeSingle();

  let paginas = 0;
  let registros = 0;
  let total: number | null = null;
  let proxima: number | null = null;

  try {
    for (let i = 0; i < maxPaginas; i++) {
      const pagina = pagina0 + i;
      const url = urlMutual(base, entidade, {
        page: pagina_a_pagina ? pagina : undefined,
        page_size: pagina_a_pagina ? tamanho : undefined,
        updated_at__gte: body.updated_at__gte || undefined,
      });
      const res = await fetch(url, { headers: cabecalhoMutual(token), cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
      const corpo = (await res.json()) as unknown;

      const lista = extrairLista(corpo);
      total = total ?? extrairTotal(corpo);
      paginas += 1;
      if (lista.length > 0) {
        const { data: n, error } = await supabase.rpc('mutual_registrar_captura', {
          p_entidade: entidade,
          p_registros: lista as unknown as Json,
        });
        if (error) throw new Error(error.message);
        registros += n ?? 0;
      }
      if (!pagina_a_pagina || !temProximaPagina(corpo, tamanho)) break;
      proxima = pagina + 1;
    }

    if (sinc?.id) {
      await supabase.from('mutual_sincronias').update({
        concluida_em: new Date().toISOString(), paginas, registros, total_remoto: total,
      }).eq('id', sinc.id);
    }
    return NextResponse.json({
      configured: true, ok: true, entidade, paginas, registros,
      total_remoto: total, proxima_pagina: proxima,
    });
  } catch (e) {
    const erro = (e as Error).message;
    if (sinc?.id) {
      await supabase.from('mutual_sincronias').update({
        concluida_em: new Date().toISOString(), paginas, registros, total_remoto: total, erro,
      }).eq('id', sinc.id);
    }
    return NextResponse.json(
      { configured: true, ok: false, entidade, paginas, registros, erro }, { status: 502 });
  }
}
