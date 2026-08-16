// Geolocalizacao e rotas em TypeScript puro (sem I/O): montagem dos links de
// navegacao, formatacao do endereco e conversao distancia -> KM excedente.
// A chamada aos provedores fica no servidor (/api/v1/geo), no mesmo padrao da
// integracao FIPE — a chave nunca vai para o cliente.

export interface Coordenada {
  lat: number;
  lng: number;
}

/** Endereco digitado no acionamento (espelha o jsonb origem/destino). */
export interface EnderecoGeo {
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  referencia?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  [key: string]: string | number | null | undefined;
}

/** Endereco em uma linha (mesma ordem do `endereco_texto_jsonb` do SQL). */
export function enderecoLinha(e: EnderecoGeo | null | undefined): string {
  if (!e) return '';
  return [e.logradouro, e.numero, e.bairro, e.cidade, e.uf, e.cep]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter((p) => p !== '')
    .join(', ');
}

/** Coordenada do endereco, quando ja geocodificado. */
export function coordenadaDe(e: EnderecoGeo | null | undefined): Coordenada | null {
  if (!e) return null;
  const lat = Number(e.lat);
  const lng = Number(e.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

/** Ponto para navegacao: coordenada tem precedencia sobre o texto (espelha
 *  `ponto_navegacao` do SQL — leva o guincho ao ponto exato). */
export function pontoNavegacao(e: EnderecoGeo | null | undefined): string | null {
  const c = coordenadaDe(e);
  if (c) return `${c.lat},${c.lng}`;
  const linha = enderecoLinha(e);
  return linha || null;
}

/** Rota completa origem -> destino no Google Maps. */
export function linkGoogleRota(
  origem: EnderecoGeo | null | undefined,
  destino: EnderecoGeo | null | undefined,
): string | null {
  const o = pontoNavegacao(origem);
  const d = pontoNavegacao(destino);
  if (!o || !d) return null;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o)}`
       + `&destination=${encodeURIComponent(d)}&travelmode=driving`;
}

/** Pin do local no Google Maps (abre no app do celular). */
export function linkGoogleLocal(e: EnderecoGeo | null | undefined): string | null {
  const p = pontoNavegacao(e);
  if (!p) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p)}`;
}

/** Navegacao no Waze: `ll` para coordenada, `q` para endereco em texto. */
export function linkWaze(e: EnderecoGeo | null | undefined): string | null {
  const c = coordenadaDe(e);
  if (c) return `https://waze.com/ul?ll=${c.lat},${c.lng}&navigate=yes`;
  const linha = enderecoLinha(e);
  if (!linha) return null;
  return `https://waze.com/ul?q=${encodeURIComponent(linha)}&navigate=yes`;
}

export interface LinksNavegacao {
  googleRota: string | null;
  googleOrigem: string | null;
  wazeOrigem: string | null;
  wazeDestino: string | null;
}
export function linksNavegacao(
  origem: EnderecoGeo | null | undefined,
  destino: EnderecoGeo | null | undefined,
): LinksNavegacao {
  return {
    googleRota: linkGoogleRota(origem, destino),
    googleOrigem: linkGoogleLocal(origem),
    wazeOrigem: linkWaze(origem),
    wazeDestino: linkWaze(destino),
  };
}

/** Distancia da rota devolvida pelo provedor (metros -> km, 1 casa). */
export function metrosParaKm(metros: number): number {
  return Math.round((Number(metros ?? 0) / 1000) * 10) / 10;
}
/** Duracao da rota (segundos -> minutos inteiros, minimo 1). */
export function segundosParaMinutos(segundos: number): number {
  return Math.max(1, Math.round(Number(segundos ?? 0) / 60));
}

/** Rotulo curto da rota para a tela ("12,4 km · 23 min"). */
export function rotuloRota(km: number | null | undefined, minutos?: number | null): string {
  if (km == null) return '—';
  const dist = `${km.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
  if (!minutos) return dist;
  if (minutos < 60) return `${dist} · ${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${dist} · ${h}h${m ? String(m).padStart(2, '0') : ''}`;
}
