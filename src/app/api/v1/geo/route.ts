import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { metrosParaKm, segundosParaMinutos, type Coordenada } from '@/lib/geo';

// POST /api/v1/geo  { action: 'geocode' | 'rota', ... }
//
// Proxy de MAPAS no servidor (mesmo padrao do /api/fipe): a chave do Google
// nunca vai para o navegador. Provedores:
//   - GOOGLE_MAPS_API_KEY definido -> Google Geocoding + Directions.
//   - sem chave                    -> OpenStreetMap (Nominatim) + OSRM, que
//     sao publicos e sem cadastro. O modulo funciona de imediato e "sobe de
//     nivel" so trocando a env, sem mexer em tela.
export const dynamic = 'force-dynamic';

const CHAVE = process.env.GOOGLE_MAPS_API_KEY ?? '';
const NOMINATIM = process.env.NOMINATIM_BASE ?? 'https://nominatim.openstreetmap.org';
const OSRM = process.env.OSRM_BASE ?? 'https://router.project-osrm.org';
// Nominatim exige identificacao de quem chama (politica de uso).
const UA = process.env.GEO_USER_AGENT ?? 'SCar/1.0 (protecao veicular; contato@smartvidanet.com.br)';

type Provedor = 'google' | 'osm';

interface GeocodeOut { endereco: string; lat: number; lng: number; provedor: Provedor }
interface RotaOut {
  distancia_km: number;
  duracao_min: number;
  polyline: string | null;
  pontos: Coordenada[];
  provedor: Provedor;
}

async function geocodificar(endereco: string): Promise<GeocodeOut | null> {
  if (CHAVE) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(endereco)}`
              + `&region=br&language=pt-BR&key=${CHAVE}`;
    const r = await fetch(url, { cache: 'no-store' });
    const j = (await r.json()) as {
      status: string;
      results?: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[];
    };
    const hit = j.results?.[0];
    if (!hit) return null;
    return { endereco: hit.formatted_address, lat: hit.geometry.location.lat, lng: hit.geometry.location.lng, provedor: 'google' };
  }

  const url = `${NOMINATIM}/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(endereco)}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' }, cache: 'no-store' });
  if (!r.ok) return null;
  const j = (await r.json()) as { display_name: string; lat: string; lon: string }[];
  const hit = j?.[0];
  if (!hit) return null;
  return { endereco: hit.display_name, lat: Number(hit.lat), lng: Number(hit.lon), provedor: 'osm' };
}

async function calcularRota(origem: Coordenada, destino: Coordenada): Promise<RotaOut | null> {
  if (CHAVE) {
    const url = `https://maps.googleapis.com/maps/api/directions/json`
              + `?origin=${origem.lat},${origem.lng}&destination=${destino.lat},${destino.lng}`
              + `&mode=driving&language=pt-BR&key=${CHAVE}`;
    const r = await fetch(url, { cache: 'no-store' });
    const j = (await r.json()) as {
      routes?: {
        overview_polyline?: { points: string };
        legs?: { distance: { value: number }; duration: { value: number } }[];
      }[];
    };
    const rota = j.routes?.[0];
    const leg = rota?.legs?.[0];
    if (!rota || !leg) return null;
    return {
      distancia_km: metrosParaKm(leg.distance.value),
      duracao_min: segundosParaMinutos(leg.duration.value),
      polyline: rota.overview_polyline?.points ?? null,
      // O Google devolve polyline codificada; o mapa desenha a reta A->B e o
      // link de rota abre o trajeto completo no app.
      pontos: [origem, destino],
      provedor: 'google',
    };
  }

  const url = `${OSRM}/route/v1/driving/${origem.lng},${origem.lat};${destino.lng},${destino.lat}`
            + `?overview=full&geometries=geojson`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) return null;
  const j = (await r.json()) as {
    code: string;
    routes?: { distance: number; duration: number; geometry?: { coordinates: [number, number][] } }[];
  };
  const rota = j.routes?.[0];
  if (j.code !== 'Ok' || !rota) return null;
  return {
    distancia_km: metrosParaKm(rota.distance),
    duracao_min: segundosParaMinutos(rota.duration),
    polyline: null,
    // GeoJSON vem [lng, lat] — o mapa usa [lat, lng].
    pontos: (rota.geometry?.coordinates ?? []).map(([lng, lat]) => ({ lat, lng })),
    provedor: 'osm',
  };
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  const { data: perfil } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    endereco?: string;
    origem?: Coordenada | string;
    destino?: Coordenada | string;
  };

  try {
    if (body.action === 'geocode') {
      const termo = (body.endereco ?? '').trim();
      if (termo.length < 5) return NextResponse.json({ error: 'Informe o endereco completo' }, { status: 400 });
      const r = await geocodificar(termo);
      if (!r) return NextResponse.json({ error: 'Endereco nao localizado no mapa' }, { status: 404 });
      return NextResponse.json(r);
    }

    if (body.action === 'rota') {
      // Aceita coordenada pronta ou endereco em texto (geocodifica antes).
      const resolver = async (p: Coordenada | string | undefined): Promise<Coordenada | null> => {
        if (!p) return null;
        if (typeof p === 'object') return p;
        const g = await geocodificar(p);
        return g ? { lat: g.lat, lng: g.lng } : null;
      };
      const [o, d] = await Promise.all([resolver(body.origem), resolver(body.destino)]);
      if (!o || !d) return NextResponse.json({ error: 'Informe origem e destino validos' }, { status: 400 });
      const rota = await calcularRota(o, d);
      if (!rota) return NextResponse.json({ error: 'Nao foi possivel calcular a rota' }, { status: 502 });
      return NextResponse.json({ ...rota, origem: o, destino: d });
    }

    return NextResponse.json({ error: 'action invalida (geocode | rota)' }, { status: 400 });
  } catch (e) {
    // Provedor fora do ar nao pode derrubar o acionamento: a tela cai no modo
    // manual (atendente digita o KM) e o atendimento segue.
    return NextResponse.json({ error: (e as Error).message || 'Servico de mapas indisponivel' }, { status: 502 });
  }
}
