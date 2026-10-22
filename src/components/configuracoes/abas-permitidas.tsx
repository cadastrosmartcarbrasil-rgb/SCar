'use client';

import { usePathname } from 'next/navigation';
import { Eye } from 'lucide-react';
import { abaConfiguracaoDaRota } from '@/lib/permissoes';

/**
 * Quem nao e admin entra nas Configuracoes so pelas abas liberadas no perfil
 * ou como extra (0141; Termos desde a 0123). Aba com so o VER mostra o aviso
 * de consulta — quem grava e o banco, que recusa sem o EDITAR.
 */
export function AbasPermitidas({ permitidas, permissoes, children }: {
  permitidas: string[]; permissoes: string[]; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const liberada = permitidas.some((h) => pathname === h || pathname.startsWith(h + '/'));
  if (!liberada) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Acesso restrito. Seu perfil não abre esta aba das Configurações — escolha uma das abas acima
        ou peça ao administrador para liberar em Configurações → Usuários → Permissões.
      </div>
    );
  }
  const aba = abaConfiguracaoDaRota(pathname);
  const soConsulta = !!aba && !permissoes.includes(`${aba.chave}.editar`);
  return (
    <div className="space-y-4">
      {soConsulta && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-superficie-alta px-4 py-3 text-sm text-slate-600">
          <Eye className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span>
            <strong className="text-slate-800">Somente consulta.</strong> Seu perfil vê {aba.rotulo}, mas não altera:
            incluir, editar e excluir serão recusados.
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
