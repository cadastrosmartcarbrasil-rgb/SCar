'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { TextosWhatsApp } from '@/lib/comunicacao/modelos-whatsapp';

/**
 * Os textos editados dos modelos de WhatsApp (0172). Sem nada gravado (ou se a leitura
 * falhar), cada mensagem usa o texto original do codigo — o botao nunca fica sem texto.
 */
export function useTextosWhatsApp(): TextosWhatsApp {
  const q = useQuery({
    queryKey: ['modelos-comunicacao', 'whatsapp-uso'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await createClient().rpc('modelos_whatsapp');
      if (error) return {} as TextosWhatsApp;
      return Object.fromEntries((data ?? []).map((m) => [m.codigo, m.textos ?? {}])) as TextosWhatsApp;
    },
  });
  return q.data ?? {};
}
