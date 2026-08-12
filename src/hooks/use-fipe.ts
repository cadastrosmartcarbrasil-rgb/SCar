'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fipeMarcas, fipeModelos, fipeAnos, fipeValor,
  type FipeTipo, type FipeItem, type FipeValor,
} from '@/lib/fipe';

const STALE = 1000 * 60 * 60; // 1h: tabela FIPE muda mensalmente

export function useFipeMarcas(tipo: FipeTipo) {
  return useQuery<{ configured: boolean; itens: FipeItem[] }>({
    queryKey: ['fipe', 'marcas', tipo],
    enabled: !!tipo,
    staleTime: STALE,
    queryFn: () => fipeMarcas(tipo),
  });
}

export function useFipeModelos(tipo: FipeTipo, marca?: string) {
  return useQuery<{ configured: boolean; itens: FipeItem[] }>({
    queryKey: ['fipe', 'modelos', tipo, marca ?? ''],
    enabled: !!tipo && !!marca,
    staleTime: STALE,
    queryFn: () => fipeModelos(tipo, marca!),
  });
}

export function useFipeAnos(tipo: FipeTipo, marca?: string, modelo?: string) {
  return useQuery<{ configured: boolean; itens: FipeItem[] }>({
    queryKey: ['fipe', 'anos', tipo, marca ?? '', modelo ?? ''],
    enabled: !!tipo && !!marca && !!modelo,
    staleTime: STALE,
    queryFn: () => fipeAnos(tipo, marca!, modelo!),
  });
}

export function useFipeValor(tipo: FipeTipo, marca?: string, modelo?: string, ano?: string) {
  return useQuery<{ configured: boolean; valor: FipeValor }>({
    queryKey: ['fipe', 'valor', tipo, marca ?? '', modelo ?? '', ano ?? ''],
    enabled: !!tipo && !!marca && !!modelo && !!ano,
    staleTime: STALE,
    queryFn: () => fipeValor(tipo, marca!, modelo!, ano!),
  });
}
