import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Consulta de placa (pluggavel). Configure as variaveis de ambiente:
//   PLACA_API_URL   ex.: https://api.provedor.com/placas/{placa}
//   PLACA_API_KEY   chave/token do provedor
// Sem configuracao, retorna found:false para o formulario cair no modo manual.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  const { placa } = await request.json();
  const p = String(placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (p.length < 7) {
    return NextResponse.json({ error: 'Placa invalida' }, { status: 400 });
  }

  const apiUrl = process.env.PLACA_API_URL;
  const apiKey = process.env.PLACA_API_KEY;

  if (!apiUrl) {
    // Servico nao configurado: preenchimento manual.
    return NextResponse.json({ found: false, manual: true });
  }

  try {
    const url = apiUrl.includes('{placa}') ? apiUrl.replace('{placa}', p) : `${apiUrl}/${p}`;
    const res = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey } : {},
    });
    if (!res.ok) return NextResponse.json({ found: false, manual: true });

    const d = await res.json();
    // Normalizacao best-effort (nomes de campos variam por provedor).
    const info = d.dados ?? d.data ?? d;
    return NextResponse.json({
      found: true,
      marca: info.marca ?? info.brand ?? info.MARCA ?? null,
      modelo: info.modelo ?? info.model ?? info.MODELO ?? null,
      ano_fabricacao: Number(info.ano ?? info.anoFabricacao ?? info.year) || null,
      ano_modelo: Number(info.anoModelo ?? info.ano_modelo ?? info.modelYear) || null,
      cor: info.cor ?? info.color ?? null,
      chassi: info.chassi ?? info.chassis ?? null,
    });
  } catch {
    return NextResponse.json({ found: false, manual: true });
  }
}
