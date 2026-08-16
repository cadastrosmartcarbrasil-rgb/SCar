'use client';

import { useMutation } from '@tanstack/react-query';
import type { Coordenada } from '@/lib/geo';

// Geocoding e rota passam pelo proxy /api/v1/geo (a chave do provedor fica no
// servidor). Sao mutations porque o atendente dispara sob demanda — geocodificar
// a cada tecla digitada estouraria o limite de uso do provedor.

export interface GeocodeResultado {
  endereco: string;
  lat: number;
  lng: number;
  provedor: 'google' | 'osm';
}
export interface RotaResultado {
  distancia_km: number;
  duracao_min: number;
  polyline: string | null;
  pontos: Coordenada[];
  origem: Coordenada;
  destino: Coordenada;
  provedor: 'google' | 'osm';
}

async function geo<T>(body: unknown): Promise<T> {
  const r = await fetch('/api/v1/geo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Falha no servico de mapas');
  }
  return r.json() as Promise<T>;
}

export function useGeocodificar() {
  return useMutation<GeocodeResultado, Error, string>({
    mutationFn: (endereco) => geo<GeocodeResultado>({ action: 'geocode', endereco }),
  });
}

export function useCalcularRota() {
  return useMutation<RotaResultado, Error, { origem: Coordenada | string; destino: Coordenada | string }>({
    mutationFn: (v) => geo<RotaResultado>({ action: 'rota', origem: v.origem, destino: v.destino }),
  });
}
