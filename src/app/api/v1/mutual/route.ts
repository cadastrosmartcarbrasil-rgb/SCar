import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  ENTIDADES_MUTUAL, ENTIDADES_PAGINADAS, urlMutual, urlMutualCaminho, cabecalhoMutual,
  extrairLista, extrairTotal, temProximaPagina, CANDIDATAS_PLANO,
  resumoDoCorpo, parametrosDoSwagger, veiculosPorPlano, listaDePlanos,
  type EntidadeMutual, type SondagemCaminho, type ParPlanoVeiculo, type DiagnosticoPlanos,
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
const VEICULOS_POR_BLOCO = 15;  // PLAN: consultas ao Mutual por requisicao
const LINHAS_POR_LEITURA = 1000; // teto de linhas do PostgREST por chamada

interface Body {
  action?: 'ping' | 'capturar' | 'sondar';
  caminhos?: string[];          // 'sondar': candidatas a testar (default: as do plano)
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

  // --- sondar: QUAL caminho existe? ----------------------------------------
  // 🔴 ESTA ROTA EXISTE PARA NAO PALPITAR DE NOVO. A 0085 abriu a entidade
  // `PLAN` com o caminho `/contract/plan/` deduzido do padrao das outras, e a
  // propria tela respondeu HTTP 404. O swagger nao e alcancavel de todo
  // ambiente, entao a resposta sai de um TESTE: ela bate em cada candidata com
  // `page_size=1` e devolve o status de cada uma.
  //
  // Ela NAO grava nada e NAO precisa que o caminho seja uma entidade nossa —
  // ver `urlMutualCaminho`. **200 com zero registro conta como existir**:
  // dominio vazio e um resultado legitimo, 404 e um caminho que nao existe, e
  // confundir os dois foi o erro original.
  if (action === 'sondar') {
    const candidatas = (body.caminhos && body.caminhos.length > 0 ? body.caminhos : CANDIDATAS_PLANO)
      .slice(0, 12)
      .filter((c) => typeof c === 'string' && /^[\w/_-]+\/?$/.test(c));
    if (candidatas.length === 0) {
      return NextResponse.json({ error: 'nenhum caminho valido para sondar' }, { status: 400 });
    }

    const sondagens: SondagemCaminho[] = [];
    for (const caminho of candidatas) {
      const url = urlMutualCaminho(base, caminho, { page: 1, page_size: 1 });
      try {
        const res = await fetch(url, {
          headers: cabecalhoMutual(token),
          cache: 'no-store',
          // `manual` para o 301 do APPEND_SLASH aparecer como 301 em vez de ser
          // seguido em silencio — um caminho que so responde depois do redirect
          // e um caminho escrito errado, e a tela precisa saber disso.
          redirect: 'manual',
        });
        const texto = await res.text();
        let registros: number | null = null;
        try { registros = extrairLista(JSON.parse(texto)).length; } catch { /* HTML/vazio */ }
        // A RECUSA diz o porque (ex.: 400 = existe, mas falta parametro). So o
        // corpo de 4xx/5xx sai daqui, resumido — nunca o de um 2xx, que e dado.
        const detalhe = res.status >= 400 && res.status !== 404 ? resumoDoCorpo(texto) : undefined;
        sondagens.push({ caminho, http: res.status, registros, ...(detalhe ? { detalhe } : {}) });
      } catch (e) {
        sondagens.push({ caminho, http: null, registros: null, erro: (e as Error).message });
      }
    }
    // 400 = o caminho EXISTE e a requisicao esta incompleta. Em vez de chutar o
    // parametro, le o que o CONTRATO declara para ele (swagger.json, com a barra
    // final). Uma leitura so, e so quando ha 400 — falhar aqui nao derruba nada.
    if (sondagens.some((x) => x.http === 400)) {
      try {
        const res = await fetch(urlMutualCaminho(base, 'swagger.json'), {
          headers: cabecalhoMutual(token), cache: 'no-store',
        });
        if (res.ok) {
          const swagger = (await res.json()) as unknown;
          for (const x of sondagens) {
            if (x.http !== 400) continue;
            const params = parametrosDoSwagger(swagger, x.caminho);
            if (params) x.parametros = params;
          }
        }
      } catch { /* sem o contrato, fica o `detalhe` da recusa */ }
    }
    return NextResponse.json({ configured: true, ok: true, sondagens });
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

  if (entidade === 'PLAN') {
    return capturarPlanos(supabase, base, token, user.id, pagina0);
  }

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
      if (!res.ok) {
        // O motivo da recusa vai junto: "HTTP 400" sozinho manda a proxima pessoa chutar.
        const detalhe = resumoDoCorpo(await res.text().catch(() => ''));
        throw new Error(`HTTP ${res.status} em ${url}${detalhe ? ` — ${detalhe}` : ''}`);
      }
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

// --- PLAN: o catalogo se monta POR VEICULO --------------------------------
// `/quotation/plan/` exige `vehicle_id` (400 "O id do veiculo e obrigatorio")
// e devolve os planos que AQUELE veiculo pode contratar. Entao: um veiculo
// representante por `plan_id` citado nos contratos (`veiculosPorPlano`), uma
// consulta por veiculo, e tudo o que voltar entra como PLAN (upsert por id).
//
// A "pagina" aqui e a POSICAO na lista de representantes, para o mesmo laco em
// blocos do navegador (`useCapturaMutual`) servir. Plano que ja esta capturado
// e pulado sem consulta: se a primeira resposta trouxer o catalogo inteiro, o
// resto termina em um bloco. Recusa de UM veiculo nao derruba o bloco — vira
// diagnostico; so quando TODAS recusam o bloco falha, com o motivo.
async function capturarPlanos(
  supabase: ReturnType<typeof createClient>,
  base: string, token: string, usuarioId: string, posicao0: number,
) {
  const { data: sinc } = await supabase
    .from('mutual_sincronias')
    .insert({ entidade: 'PLAN', executada_por: usuarioId })
    .select('id').maybeSingle();

  const diag: DiagnosticoPlanos = {
    planos_nos_contratos: 0, ja_capturados: 0, consultados: 0,
    recebidos: 0, sem_id: 0, chaves: [], recusas: [],
  };
  let registros = 0;
  let proxima: number | null = null;

  const fechar = async (erro?: string) => {
    if (!sinc?.id) return;
    await supabase.from('mutual_sincronias').update({
      concluida_em: new Date().toISOString(), paginas: diag.consultados, registros,
      total_remoto: diag.planos_nos_contratos, ...(erro ? { erro } : {}),
    }).eq('id', sinc.id);
  };

  try {
    // 1) pares plano x veiculo dos contratos capturados (so as tres chaves).
    const pares: ParPlanoVeiculo[] = [];
    for (let de = 0; ; de += LINHAS_POR_LEITURA) {
      const { data, error } = await supabase
        .from('mutual_captura')
        .select('plan_id:payload->>plan_id, vehicle_id:payload->>vehicle_id, status:payload->>status')
        .eq('entidade', 'CONTRACT_OBJECT')
        .order('id_externo')
        .range(de, de + LINHAS_POR_LEITURA - 1);
      if (error) throw new Error(`lendo os contratos capturados: ${error.message}`);
      const lote = (data ?? []) as unknown as ParPlanoVeiculo[];
      pares.push(...lote);
      if (lote.length < LINHAS_POR_LEITURA) break;
    }
    const representantes = veiculosPorPlano(pares);
    diag.planos_nos_contratos = representantes.length;
    if (representantes.length === 0) {
      throw new Error('Nenhum objeto de contrato com plan_id capturado — puxe Objetos de contrato antes dos Planos');
    }

    // 2) o que ja esta capturado nao precisa de consulta.
    const { data: ja } = await supabase
      .from('mutual_captura').select('id_externo').eq('entidade', 'PLAN').limit(5000);
    const capturados = new Set((ja ?? []).map((r) => r.id_externo));

    // 3) um bloco de consultas, a partir da posicao pedida.
    let i = Math.max(posicao0, 1) - 1;
    while (i < representantes.length && diag.consultados < VEICULOS_POR_BLOCO) {
      const rep = representantes[i++];
      if (capturados.has(rep.plan_id)) { diag.ja_capturados += 1; continue; }

      const url = urlMutualCaminho(base, ENTIDADES_MUTUAL.PLAN, { vehicle_id: rep.vehicle_id });
      diag.consultados += 1;
      let res: Response;
      try {
        res = await fetch(url, { headers: cabecalhoMutual(token), cache: 'no-store' });
      } catch (e) {
        if (diag.recusas.length < 5) diag.recusas.push({ vehicle_id: rep.vehicle_id, http: null, detalhe: (e as Error).message });
        continue;
      }
      const texto = await res.text();
      if (!res.ok) {
        if (diag.recusas.length < 5) {
          diag.recusas.push({ vehicle_id: rep.vehicle_id, http: res.status, detalhe: resumoDoCorpo(texto) });
        }
        continue;
      }
      let corpo: unknown = null;
      try { corpo = JSON.parse(texto); } catch { /* nao era JSON */ }
      const lista = listaDePlanos(corpo);
      if (diag.chaves.length === 0) {
        const alvo = lista[0] ?? corpo;
        if (alvo && typeof alvo === 'object' && !Array.isArray(alvo)) diag.chaves = Object.keys(alvo).slice(0, 30);
      }
      diag.recebidos += lista.length;
      diag.sem_id += lista.filter((p) => p.id === undefined || p.id === null || p.id === '').length;
      if (lista.length > 0) {
        const { data: n, error } = await supabase.rpc('mutual_registrar_captura', {
          p_entidade: 'PLAN',
          p_registros: lista as unknown as Json,
        });
        if (error) throw new Error(error.message);
        registros += n ?? 0;
        for (const p of lista) if (p.id !== undefined && p.id !== null) capturados.add(String(p.id));
      }
    }
    proxima = i < representantes.length ? i + 1 : null;

    if (diag.consultados > 0 && diag.recusas.length === diag.consultados && registros === 0) {
      const r = diag.recusas[0];
      throw new Error(`O Mutual recusou todos os ${diag.consultados} veiculos deste bloco` +
        ` (ex.: vehicle_id ${r.vehicle_id}, HTTP ${r.http ?? '-'}${r.detalhe ? ` — ${r.detalhe}` : ''})`);
    }

    await fechar();
    return NextResponse.json({
      configured: true, ok: true, entidade: 'PLAN',
      // `paginas` = consultas feitas; com zero o laco do navegador para, entao
      // um bloco so de "ja capturados" conta 1 para seguir adiante.
      paginas: Math.max(diag.consultados, proxima ? 1 : 0), registros,
      total_remoto: diag.planos_nos_contratos, proxima_pagina: proxima, diagnostico: diag,
    });
  } catch (e) {
    const erro = (e as Error).message;
    await fechar(erro);
    return NextResponse.json(
      { configured: true, ok: false, entidade: 'PLAN', paginas: diag.consultados, registros, erro, diagnostico: diag },
      { status: 502 });
  }
}
