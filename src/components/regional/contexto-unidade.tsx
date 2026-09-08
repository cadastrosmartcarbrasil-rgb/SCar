'use client';

import { createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { COOKIE_UNIDADE } from '@/lib/unidade';

interface Unidade {
  /** id da unidade que a tela esta mostrando */
  regionalId: string;
  nome: string;
  codigo: string | null;
  /** true quando quem esta olhando e da matriz (pode trocar de unidade) */
  podeTrocar: boolean;
}

const Ctx = createContext<Unidade | null>(null);

export function UnidadeProvider({ valor, children }: { valor: Unidade; children: React.ReactNode }) {
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/**
 * A unidade que o portal esta mostrando. TODA tela do /regional pega o
 * `regionalId` daqui — antes elas mandavam `null`, que para a matriz virava
 * "nenhuma unidade" e devolvia tela vazia.
 */
export function useUnidadeAtual(): Unidade {
  const u = useContext(Ctx);
  if (!u) throw new Error('useUnidadeAtual precisa estar dentro do UnidadeProvider');
  return u;
}

/** Volta para a tela de selecao (so faz sentido para quem e da matriz). */
export function useTrocarUnidade() {
  const router = useRouter();
  return () => {
    document.cookie = `${COOKIE_UNIDADE}=; path=/; max-age=0; samesite=lax`;
    router.refresh();
  };
}
