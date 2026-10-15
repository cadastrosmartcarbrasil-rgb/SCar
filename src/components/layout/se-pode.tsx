'use client';

import { usePode } from '@/hooks/use-permissoes';

/** Mostra o conteudo so se o perfil tiver a permissao ('modulo.acao', 0111). */
export function SePode({ chave, children }: { chave: string; children: React.ReactNode }) {
  return usePode(chave) ? <>{children}</> : null;
}
