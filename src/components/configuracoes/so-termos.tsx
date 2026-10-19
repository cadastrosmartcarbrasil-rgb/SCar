'use client';

import { usePathname } from 'next/navigation';

/**
 * Quem nao e admin e recebeu "Termos — gerenciar modelos" (extra, 0116) entra
 * em Configuracoes so pela aba Termos; as demais seguem restritas.
 */
export function SoTermos({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith('/configuracoes/termos')) return <>{children}</>;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
      Acesso restrito. Seu perfil abre apenas a aba Termos das Configuracoes.
    </div>
  );
}
