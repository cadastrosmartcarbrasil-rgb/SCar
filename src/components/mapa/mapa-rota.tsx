'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Coordenada } from '@/lib/geo';

// Mapa interativo da rota (Leaflet + tiles do OpenStreetMap — sem chave).
// O Leaflet mexe no DOM direto e nao roda no servidor: o import e dinamico
// dentro do efeito, entao nada disso entra no bundle do SSR.
export function MapaRota({
  origem,
  destino,
  pontos,
  altura = 260,
}: {
  origem?: Coordenada | null;
  destino?: Coordenada | null;
  /** Tracado completo da rota (quando o provedor devolve a geometria). */
  pontos?: Coordenada[];
  altura?: number;
}) {
  const div = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<LeafletMap | null>(null);
  const camada = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelado || !div.current) return;

      if (!mapa.current) {
        mapa.current = L.map(div.current, { scrollWheelZoom: false, attributionControl: true })
          .setView([-15.601, -56.097], 12); // Cuiaba como ponto neutro inicial
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap',
        }).addTo(mapa.current);
        camada.current = L.layerGroup().addTo(mapa.current);
      }

      const g = camada.current!;
      g.clearLayers();

      // Pino "A" (resgate) e "B" (destino) — mesma leitura do mapa do sistema antigo.
      const pino = (texto: string, cor: string) =>
        L.divIcon({
          className: '',
          html: `<span style="display:grid;place-items:center;width:26px;height:26px;border-radius:50% 50% 50% 0;
                 transform:rotate(-45deg);background:${cor};color:#fff;font:700 12px/1 system-ui;
                 box-shadow:0 2px 6px rgba(0,0,0,.35)"><b style="transform:rotate(45deg)">${texto}</b></span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 26],
        });

      const marcos: [number, number][] = [];
      if (origem) {
        L.marker([origem.lat, origem.lng], { icon: pino('A', '#e11d48') }).addTo(g).bindPopup('Local do resgate');
        marcos.push([origem.lat, origem.lng]);
      }
      if (destino) {
        L.marker([destino.lat, destino.lng], { icon: pino('B', '#1e2b4d') }).addTo(g).bindPopup('Destino');
        marcos.push([destino.lat, destino.lng]);
      }

      const tracado = (pontos?.length ?? 0) > 1
        ? pontos!.map((p) => [p.lat, p.lng] as [number, number])
        : marcos.length === 2 ? marcos : [];
      if (tracado.length > 1) {
        L.polyline(tracado, { color: '#22A7E4', weight: 5, opacity: 0.9 }).addTo(g);
      }

      const alvo = tracado.length > 1 ? tracado : marcos;
      if (alvo.length === 1) mapa.current!.setView(alvo[0], 15);
      else if (alvo.length > 1) mapa.current!.fitBounds(L.latLngBounds(alvo), { padding: [28, 28] });

      // O container pode ter nascido escondido (modal/aba): sem isso os tiles
      // ficam cinza ate o usuario arrastar o mapa.
      setTimeout(() => mapa.current?.invalidateSize(), 60);
    })();

    return () => { cancelado = true; };
  }, [origem, destino, pontos]);

  useEffect(() => () => { mapa.current?.remove(); mapa.current = null; }, []);

  return (
    <div
      ref={div}
      style={{ height: altura }}
      className="w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
      aria-label="Mapa da rota do atendimento"
    />
  );
}
