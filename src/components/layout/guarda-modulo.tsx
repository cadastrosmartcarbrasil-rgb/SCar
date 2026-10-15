'use client';

import { usePathname } from 'next/navigation';
import { ShieldOff } from 'lucide-react';
import { moduloDaRota } from '@/lib/permissoes';

/**
 * Barra a TELA de um modulo sem o VER do perfil (0111). Quem decide o dado
 * continua sendo o banco; isto evita a tela aberta pela URL com botoes que o
 * perfil nao tem. Sem lista de permissoes (leitura falhou), nao barra nada.
 */
export function GuardaModulo({ permissoes, children }: {
  permissoes: string[] | null; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const modulo = moduloDaRota(pathname);
  if (!permissoes || !modulo || modulo.fixo || permissoes.includes(`${modulo.chave}.ver`)) {
    return <>{children}</>;
  }
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-superficie p-6 text-center">
      <ShieldOff className="mx-auto mb-3 h-8 w-8 text-slate-400" />
      <p className="font-semibold text-slate-800">Seu perfil nao tem acesso a {modulo.rotulo}</p>
      <p className="mt-1 text-sm text-slate-500">
        Se precisar, peca ao administrador para liberar em Configuracoes → Usuarios → Permissoes por perfil.
      </p>
    </div>
  );
}
