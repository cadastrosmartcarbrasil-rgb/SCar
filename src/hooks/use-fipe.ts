'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  fipePorPlaca, fipeMarcas, fipeModelos, fipeValor,
  type FipeItem, type FipeValor,
} from '@/lib/fipe';

const STALE = 1000 * 60 * 60; // 1h: tabela FIPE muda mensalmente

// Placa -> avaliacao FIPE + REGISTRO do documento (uma chamada).
// O tipo e DERIVADO de `fipePorPlaca` em vez de repetido: a copia manual daqui
// ficou para tras quando o `registro` entrou, e o erro so apareceu no tsc.
export function useFipePorPlaca() {
  return useMutation<Awaited<ReturnType<typeof fipePorPlaca>>, Error, string>({
    mutationFn: (placa: string) => fipePorPlaca(placa),
  });
}

export function useFipeMarcas(tipoCodigo?: number) {
  return useQuery<{ configured: boolean; itens: FipeItem[] }>({
    queryKey: ['fipe', 'marcas', tipoCodigo ?? 0],
    enabled: !!tipoCodigo,
    staleTime: STALE,
    queryFn: () => fipeMarcas(tipoCodigo!),
  });
}

// get-modelos devolve modelos + anos da marca numa so chamada.
export function useFipeModelos(codigoMarca?: string) {
  return useQuery<{ configured: boolean; modelos: FipeItem[]; anos: FipeItem[] }>({
    queryKey: ['fipe', 'modelos', codigoMarca ?? ''],
    enabled: !!codigoMarca,
    staleTime: STALE,
    queryFn: () => fipeModelos(codigoMarca!),
  });
}

export function useFipeValor(codigoFipe?: string, ano?: string) {
  return useQuery<{ configured: boolean; valor: FipeValor | null }>({
    queryKey: ['fipe', 'valor', codigoFipe ?? '', ano ?? ''],
    enabled: !!codigoFipe && !!ano,
    staleTime: STALE,
    queryFn: () => fipeValor(codigoFipe!, ano!),
  });
}
