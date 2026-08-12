import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseValor, combustivelEnum, type FipeItem, type FipeValor } from '@/lib/fipe';

// Proxy server-side da API Placa Fipe (placafipe.com.br). O token NUNCA vai ao
// browser: injetado aqui, no corpo do POST.
// Configure no ambiente:
//   PLACAFIPE_TOKEN  -> token da assinatura contratada (obrigatorio)
//   PLACAFIPE_BASE   -> base da API (default https://api.placafipe.com.br)
// Cliente chama /api/fipe (POST) com { action, ...params }.

type Action = 'placa' | 'tipos' | 'marcas' | 'modelos' | 'valor';

const ENDPOINT: Record<Action, string> = {
  placa: 'getplacafipe',
  tipos: 'get-veiculos-tipos',
  marcas: 'get-marcas',
  modelos: 'get-modelos',
  valor: 'fipebycodigo',
};

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  const token = process.env.PLACAFIPE_TOKEN;
  const base = (process.env.PLACAFIPE_BASE || 'https://api.placafipe.com.br').replace(/\/+$/, '');
  if (!token) return NextResponse.json({ configured: false });

  const body = await request.json().catch(() => ({}));
  const action = body?.action as Action;
  if (!action || !(action in ENDPOINT)) {
    return NextResponse.json({ error: 'action invalida' }, { status: 400 });
  }
  const { action: _omit, ...params } = body as Record<string, unknown>;

  try {
    const res = await fetch(`${base}/${ENDPOINT[action]}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...params, token }),
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Placa Fipe respondeu ${res.status}`, configured: true }, { status: 502 });
    }
    const data = await res.json();

    switch (action) {
      case 'placa': {
        const lista = Array.isArray(data?.fipe) ? data.fipe : Array.isArray(data?.dados) ? data.dados : [];
        const opcoes = lista.map(normalizarValor).filter((v: FipeValor) => v.valor != null);
        return NextResponse.json({ configured: true, valor: opcoes[0] ?? null, opcoes, msg: data?.msg ?? null });
      }
      case 'valor': {
        const o = Array.isArray(data?.fipe) ? data.fipe[0] : (data?.dados ?? data);
        return NextResponse.json({ configured: true, valor: o ? normalizarValor(o) : null });
      }
      case 'modelos': {
        const d = data?.dados ?? data;
        return NextResponse.json({
          configured: true,
          modelos: normalizarLabelValue(d?.modelos),
          anos: normalizarLabelValue(d?.anos),
        });
      }
      case 'marcas': {
        const arr = data?.dados ?? data?.marcas ?? data;
        return NextResponse.json({ configured: true, itens: normalizarMarcas(arr) });
      }
      case 'tipos': {
        const arr = data?.dados ?? data;
        return NextResponse.json({ configured: true, itens: normalizarLabelValue(arr) });
      }
    }
  } catch {
    return NextResponse.json({ error: 'Falha de rede ao consultar a FIPE', configured: true }, { status: 502 });
  }
}

// { Label, Value } (ou variacoes) -> { cod, nome }
function normalizarLabelValue(data: unknown): FipeItem[] {
  const arr: unknown[] = Array.isArray(data) ? data : [];
  return arr
    .map((raw) => {
      const o = raw as Record<string, unknown>;
      const cod = o.Value ?? o.value ?? o.codigo ?? o.cod ?? o.id;
      const nome = o.Label ?? o.label ?? o.descricao ?? o.nome ?? o.text;
      return { cod: cod == null ? '' : String(cod), nome: nome == null ? '' : String(nome) };
    })
    .filter((i) => i.cod !== '');
}

function normalizarMarcas(data: unknown): FipeItem[] {
  const arr: unknown[] = Array.isArray(data) ? data : [];
  return arr
    .map((raw) => {
      const o = raw as Record<string, unknown>;
      const cod = o.codigo_marca ?? o.Value ?? o.codigo ?? o.cod ?? o.id;
      const nome = o.descricao ?? o.Label ?? o.nome ?? o.marca;
      return { cod: cod == null ? '' : String(cod), nome: nome == null ? '' : String(nome) };
    })
    .filter((i) => i.cod !== '');
}

function normalizarValor(raw: unknown): FipeValor {
  const o = (raw ?? {}) as Record<string, unknown>;
  const ano = Number(String(o.ano_modelo ?? o.anoModelo ?? '').replace(/\D/g, ''));
  return {
    valor: parseValor(o.valor ?? o.valorVeiculo),
    codigoFipe: (o.codigo_fipe ?? o.codFipe ?? null) as string | null,
    referencia: (o.mes_referencia ?? o.refMes ?? o.referencia ?? null) as string | null,
    marca: (o.marca ?? o.nomeMarca ?? null) as string | null,
    modelo: (o.modelo ?? o.nomeModelo ?? null) as string | null,
    anoModelo: Number.isFinite(ano) && ano > 0 ? ano : null,
    combustivel: combustivelEnum((o.combustivel ?? o.tipoCombustivel) as string),
    bruto: o,
  };
}
