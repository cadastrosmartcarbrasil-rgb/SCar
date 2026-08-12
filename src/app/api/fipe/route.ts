import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseValorBR, combustivelEnum, type FipeItem, type FipeValor } from '@/lib/fipe';

// Proxy server-side da API FIPE (apifipe.com.br). O token NUNCA vai ao browser.
// Configure no ambiente:
//   FIPE_API_TOKEN  -> token da assinatura contratada (obrigatorio)
//   FIPE_API_BASE   -> base da API (default https://apifipe.com.br/api)
// Contrato (token como ultimo segmento do path):
//   GET {base}/{tipo}/{token}                          -> marcas
//   GET {base}/{tipo}/{marca}/{token}                  -> modelos
//   GET {base}/{tipo}/{marca}/{modelo}/{token}         -> anos (codAno = ano-combustivel)
//   GET {base}/{tipo}/{marca}/{modelo}/{ano}/{token}   -> valor

const TIPOS_VALIDOS = new Set(['carros', 'motos', 'caminhoes']);

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  const token = process.env.FIPE_API_TOKEN;
  const base = (process.env.FIPE_API_BASE || 'https://apifipe.com.br/api').replace(/\/+$/, '');
  if (!token) {
    // Sem token: front cai no modo manual (preenchimento a mao).
    return NextResponse.json({ configured: false, itens: [], valor: null });
  }

  const { searchParams } = new URL(request.url);
  const tipo = String(searchParams.get('tipo') || '').toLowerCase();
  const marca = searchParams.get('marca')?.trim() || '';
  const modelo = searchParams.get('modelo')?.trim() || '';
  const ano = searchParams.get('ano')?.trim() || '';

  if (!TIPOS_VALIDOS.has(tipo)) {
    return NextResponse.json({ error: 'Tipo invalido (use carros, motos ou caminhoes)' }, { status: 400 });
  }

  // Monta o path conforme os parametros presentes.
  const segs = [tipo];
  if (marca) segs.push(encodeURIComponent(marca));
  if (marca && modelo) segs.push(encodeURIComponent(modelo));
  if (marca && modelo && ano) segs.push(encodeURIComponent(ano));
  const nivel = segs.length; // 1=marcas 2=modelos 3=anos 4=valor
  const url = `${base}/${segs.join('/')}/${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ error: `FIPE respondeu ${res.status}`, configured: true }, { status: 502 });
    }
    const data = await res.json();

    if (nivel === 4) {
      return NextResponse.json({ configured: true, valor: normalizarValor(data, ano) });
    }
    return NextResponse.json({ configured: true, itens: normalizarLista(data, nivel) });
  } catch {
    return NextResponse.json({ error: 'Falha de rede ao consultar a FIPE', configured: true }, { status: 502 });
  }
}

// Normaliza marcas/modelos/anos (nomes de campo variam por nivel).
function normalizarLista(data: unknown, nivel: number): FipeItem[] {
  const arr: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { dados?: unknown[] })?.dados)
      ? (data as { dados: unknown[] }).dados
      : [];
  return arr
    .map((raw) => {
      const o = raw as Record<string, unknown>;
      const cod =
        nivel === 1 ? o.codMarca ?? o.cod ?? o.codigo :
        nivel === 2 ? o.codModelo ?? o.cod ?? o.codigo :
                      o.codAno ?? o.cod ?? o.codigo ?? o.ano;
      const nome =
        nivel === 1 ? o.nomeMarca ?? o.nome ?? o.marca :
        nivel === 2 ? o.nomeModelo ?? o.nome ?? o.modelo :
                      o.nomeAno ?? o.nome ?? o.ano;
      return { cod: cod == null ? '' : String(cod), nome: nome == null ? '' : String(nome) };
    })
    .filter((i) => i.cod !== '');
}

function normalizarValor(data: unknown, codAno: string): FipeValor {
  const o = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  const anoNum = Number(String(o?.anoModelo ?? codAno.split('-')[0]).replace(/\D/g, ''));
  return {
    valor: parseValorBR(o?.valorVeiculo ?? o?.valor),
    codigoFipe: (o?.codFipe ?? o?.codigoFipe ?? null) as string | null,
    referencia: (o?.refMes ?? o?.refFipe ?? o?.mesReferencia ?? null) as string | null,
    marca: (o?.nomeMarca ?? o?.marca ?? null) as string | null,
    modelo: (o?.nomeModelo ?? o?.modelo ?? null) as string | null,
    anoModelo: Number.isFinite(anoNum) && anoNum > 0 ? anoNum : null,
    combustivel: combustivelEnum(codAno),
    bruto: (o ?? {}) as Record<string, unknown>,
  };
}
